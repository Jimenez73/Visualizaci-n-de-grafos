import json
import math
import random
import ast
import pandas as pd
import geopandas as gpd
import networkx as nx
from shapely import wkt

# === CONFIGURACIÓN ===
INPUT_CSV = 'graph_geom_corrected_cycles.csv'
OUTPUT_JSON = '../data/simulation_data.json'
MUESTRAS_K = 3   
WTP_ID = 1001544
INFECTADO_ID = 15522  # None para aleatorio / Set a un nodo específico (ver el mapa en la web para IDs)

def procesar_datos(csv_path):
    # 1. Leer CSV
    try:
        df = pd.read_csv(csv_path, sep=';', engine='python')
    except Exception as e:
        print(f"Error leyendo CSV: {e}")
        return

    # Filtrado inicial de geometrías inválidas
    print(f"Filas originales: {len(df)}")
    df = df.dropna(subset=['geometry'])
    
    # Solo conservar LINESTRING
    df = df[df['geometry'].astype(str).str.contains('LINESTRING')]
    print(f"Filas válidas con geometría: {len(df)}")

    # 2. Convertir texto WKT a objetos geométricos
    try:
        df['geometry'] = df['geometry'].apply(wkt.loads)
    except Exception as e:
        print(f"Error crítico parseando WKT: {e}")
        return

    # 3. Crear GeoDataFrame (UTM 19S -> EPSG:32719)
    gdf = gpd.GeoDataFrame(df, geometry='geometry')
    gdf.set_crs(epsg=32719, inplace=True)

    # 4. Reproyectar a Lat/Lon (WGS84 -> EPSG:4326)
    print("Reproyectando coordenadas a EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)
    return gdf

class VisualizacionGenerator:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.graph = nx.DiGraph()
        self.steps = []
        self.node_data = {}
        self.edge_geometries = {}
        self.J_map = {}

    def cargar_y_procesar_datos(self):
        print("Cargando datos con GeoPandas...")
        
        gdf = procesar_datos(self.csv_path)

        print("Construyendo grafo...")
        for _, row in gdf.iterrows():
            try:
                u = int(row['self'])
                v = int(row['other'])
                
                coords = list(row['geometry'].coords)
                leaflet_path = [[y, x] for x, y in coords]
                
                self.edge_geometries[(u, v)] = leaflet_path
                
                u_lat, u_lon = leaflet_path[0]
                v_lat, v_lon = leaflet_path[-1]

                # Guardar Nodos
                if u not in self.node_data:
                    self.node_data[u] = {'lat': u_lat, 'lon': u_lon}
                    self.graph.add_node(u, lat=u_lat, lon=u_lon)
                
                if v not in self.node_data:
                    self.node_data[v] = {'lat': v_lat, 'lon': v_lon}
                    if not self.graph.has_node(v):
                        self.graph.add_node(v, lat=v_lat, lon=v_lon)

                # Agregar Arista Lógica
                if 'adj_list' in row and str(row['adj_list']).lower() != 'nan':
                    neighbors = ast.literal_eval(str(row['adj_list']))
                    for neighbor in neighbors:
                        self.graph.add_edge(u, int(neighbor))
                else:
                    self.graph.add_edge(u, v)

            except Exception as e:
                continue

        # Validación WTP
        if WTP_ID not in self.graph:
            print(f"⚠️ ERROR: WTP_ID {WTP_ID} no encontrado en el grafo.")
        else:
            self.precalcular_dominadores()

    def precalcular_dominadores(self):
        """Calcula J_v (dominadores) usando el grafo reverso desde la WTP"""

        print("Calculando Dominadores (J_v)...")
        G_rev = self.graph.reverse()

        try:
            dom_dict = nx.immediate_dominators(G_rev, WTP_ID)
            dom_tree = nx.DiGraph()
            for node, dom in dom_dict.items():
                if node != dom:
                    dom_tree.add_edge(dom, node)
            
            for v in self.graph.nodes():
                if v in dom_tree:
                    self.J_map[v] = nx.descendants(dom_tree, v) | {v}
                else:
                    self.J_map[v] = {v}

        except Exception as e:
            print(f"Advertencia en dominadores: {e}. Usando fallback.")
            for v in self.graph.nodes(): self.J_map[v] = {v}

    def obtener_ancestros_fisicos(self, nodo):
        if nodo not in self.graph:
            return set()
        return nx.ancestors(self.graph, nodo) | {nodo}

    def exportar_paso(self, tipo, descripcion, extra_data=None, variables=None):
        step = {
            "type": tipo, 
            "description": descripcion, 
            "wtp_node": WTP_ID, 
            "infected_node": self.infected_id
        }
        
        # En el paso 0 exportamos todos los nodos y aristas
        if len(self.steps) == 0:
            step["nodes"] = [
                {
                    "id": n,
                    "lat": d['lat'],
                    "lon": d['lon']
                }
                for n, d in self.node_data.items()
            ]
            
            edges_list = []
            for u, v in self.graph.edges():
                edge_data = {"source": u, "target": v}
                # Adjuntar geometría real si existe
                if (u, v) in self.edge_geometries:
                    edge_data["geometry"] = self.edge_geometries[(u, v)]
                edges_list.append(edge_data)
            step["edges"] = edges_list

        if extra_data: step.update(extra_data)
        if variables: step["variables"] = variables
        
        self.steps.append(step)

    def ejecutar_simulacion(self):
        # 1. Preparar Escenario
        universo_valido = self.obtener_ancestros_fisicos(WTP_ID)
        candidatos_iniciales = [n for n in list(self.graph.nodes()) if n in universo_valido and n != WTP_ID]
        
        if not candidatos_iniciales:
            print("Error: No hay candidatos válidos aguas arriba.")
            return

        # Seleccionar infectado
        if INFECTADO_ID and INFECTADO_ID in candidatos_iniciales:
            self.infected_id = INFECTADO_ID
        else:
            self.infected_id = random.choice(candidatos_iniciales)
        
        print(f"Simulando infección en nodo: {self.infected_id}")
        
        vars_estado = {"S": "{}", "aux": "-", "auxv": "-∞", "B": "-"}
        self.exportar_paso("INITIAL_STATE", "Estado Inicial", variables=vars_estado)

        # 2. Bucle Principal
        candidatos = set(universo_valido) 
        S_acumulado = set() 
        iteracion = 1

        while True:
            # Cálculo de B simplificado (Bisección)
            B = math.ceil(len(candidatos) / 2)
            print(f"Ronda {iteracion} | Candidatos: {len(candidatos)} | B: {B}")

            # ======= ALGORITMO GREEDY =======
            S_round = [WTP_ID] 
            cubierto_ronda = set()
            
            for _ in range(MUESTRAS_K):
                best_node = None
                max_gain = -1
                best_gain_val = 0
                
                posibles = [n for n in candidatos if n not in S_acumulado and n not in S_round]
                
                for v in posibles:
                    J_v = self.J_map.get(v, set())
                    J_v_validos = J_v.intersection(candidatos)
                    
                    gain = len(J_v_validos - cubierto_ronda)
                    
                    if gain <= B and gain > max_gain:
                        max_gain = gain
                        best_node = v
                        best_gain_val = gain
                
                if best_node is not None:
                    S_round.append(best_node)
                    J_best = self.J_map[best_node].intersection(candidatos)
                    cubierto_ronda.update(J_best)
                    
                    # Variables para visualización
                    vars_estado = {
                        "S": f"{{{', '.join(map(str, S_acumulado | set(S_round)))}}}", 
                        "aux": str(best_node), 
                        "auxv": str(best_gain_val),
                        "B": str(B)
                    }
            
            if not S_round: break
            # ================================

            self.exportar_paso("HEURISTIC_SELECTION", f"Ronda {iteracion}: Selección de muestras", 
                             {"selected_nodes": S_round}, variables=vars_estado)

            # --- FASE MEDICIÓN ---
            resultados = {}
            for muestra in S_round:
                fluido = self.obtener_ancestros_fisicos(muestra)
                val = 1 if self.infected_id in fluido else 0
                resultados[muestra] = val
            
            self.exportar_paso("KNOWLEDGE_UPDATE", "Resultados de Laboratorio", 
                             {"updated_nodes": [{"id": k, "value": v} for k, v in resultados.items()]}, variables=vars_estado)
            
            S_acumulado.update(S_round)

            # --- FASE PODA ---
            candidatos_previos = set(candidatos)
            
            # 1. Descartar por negativos
            for muestra, res in resultados.items():
                if res == 0:
                    candidatos -= self.obtener_ancestros_fisicos(muestra)
            
            # 2. Intersección de positivos
            positivos = [s for s, r in resultados.items() if r == 1]
            if positivos:
                zona_comun = set(self.graph.nodes())
                for p in positivos:
                    zona_comun = zona_comun.intersection(self.obtener_ancestros_fisicos(p))
                candidatos = candidatos.intersection(zona_comun)

            descartados = candidatos_previos - candidatos
            
            self.exportar_paso("PRUNING", f"Se reduce el espacio de búsqueda.", 
                             {"discarded_nodes": list(descartados)}, variables=vars_estado)

            # --- CHECK FINAL ---
            if len(candidatos) == 1:
                found = list(candidatos)[0]
                path = []
                try: path = nx.shortest_path(self.graph, source=found, target=WTP_ID)
                except: pass
                
                self.exportar_paso("PATH_CREATION", f"¡Origen encontrado en nodo {found}!", 
                                  {"infected_node": found, "path": path}, variables=vars_estado)
                break
            
            if not candidatos: break
            iteracion += 1

    def guardar_json(self):
        with open(OUTPUT_JSON, 'w') as f:
            json.dump(self.steps, f, indent=2)
        print(f"Archivo generado correctamente: {OUTPUT_JSON}")

if __name__ == "__main__":
    sim = VisualizacionGenerator(INPUT_CSV)
    sim.cargar_y_procesar_datos()
    sim.ejecutar_simulacion()
    sim.guardar_json()