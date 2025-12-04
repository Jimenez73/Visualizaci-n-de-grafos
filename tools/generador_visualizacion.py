import json
import pandas as pd
import networkx as nx
import ast
import re
import math
from pyproj import Transformer

# === CONFIGURACIÓN ===
INPUT_CSV = 'graph_geom_corrected_cycles.csv'
OUTPUT_JSON = '../data/simulation_data.json'
PRESUPUESTO_K = 3   
WTP_ID = 1001544       
INFECTADO_ID = 15522  

# --- FUNCIÓN DE CARGA AVANZADA ---
def procesar_datos_geograficos(ruta_csv):
    """
    Lee el CSV y retorna:
    1. DataFrame de Nodos (para construir el grafo lógico)
    2. Diccionario de Geometrías {(u, v): [[lat, lon], [lat, lon], ...]}
    """
    print("Extrayendo geometrías detalladas y proyectando coordenadas...")
    
    # Configurar Transformador: UTM 19S -> Lat/Lon
    transformer = Transformer.from_crs("epsg:32719", "epsg:4326", always_xy=True)
    
    separador = ','
    try:
        with open(ruta_csv, 'r', encoding='utf-8') as f:
            if ';' in f.readline(): separador = ';'
    except: pass

    try:
        df_edges = pd.read_csv(ruta_csv, sep=separador, engine='python', on_bad_lines='skip')
        df_edges.columns = df_edges.columns.str.strip()
    except Exception as e:
        print(f"Error leyendo CSV: {e}")
        return pd.DataFrame(), {}

    node_map = {} 
    edge_geometry_map = {} # Diccionario {(origen, destino): [[lat,lon], [lat,lon]...]}

    print(f"Procesando {len(df_edges)} tuberías...")

    for i, row in df_edges.iterrows():
        try:
            u = int(row['self'])
            v = int(row['other'])
            geom = str(row['geometry']) 

            # Limpiar WKT: "LINESTRING (x1 y1, x2 y2, x3 y3...)"
            coords_text = re.sub(r'[a-zA-Z\(\)]', '', geom).strip()
            
            # Separar los pares de coordenadas.
            # A veces vienen separados por coma "x y, x y" y a veces solo espacios si es un formato raro
            if ',' in coords_text:
                raw_points = coords_text.split(',')
            else:
                # Fallback complejo si no hay comas, asumimos pares
                parts = coords_text.split()
                raw_points = [f"{parts[i]} {parts[i+1]}" for i in range(0, len(parts), 2)]

            detailed_path = [] # Lista de puntos [lat, lon] para esta arista

            for pt in raw_points:
                coords = pt.strip().split()
                if len(coords) < 2: continue
                
                x_utm = float(coords[0])
                y_utm = float(coords[1])
                
                # Transformar a Lat/Lon
                lon, lat = transformer.transform(x_utm, y_utm)
                detailed_path.append([lat, lon]) # Leaflet usa [Lat, Lon]

            # Guardar geometría detallada
            # Usamos tuple (u, v) como clave
            if detailed_path:
                edge_geometry_map[(u, v)] = detailed_path

                # Guardar Nodos (Solo necesitamos el primero y el último para el nodo lógico)
                # Inicio (U)
                u_lat, u_lon = detailed_path[0]
                if u not in node_map:
                    node_map[u] = {'lat': u_lat, 'lon': u_lon, 'adj': []}
                if v not in node_map[u]['adj']:
                    node_map[u]['adj'].append(v)

                # Fin (V)
                v_lat, v_lon = detailed_path[-1]
                if v not in node_map:
                    node_map[v] = {'lat': v_lat, 'lon': v_lon, 'adj': []}

        except Exception as e:
            continue

    # Convertir mapa de nodos a DataFrame
    data_list = []
    for nid, info in node_map.items():
        data_list.append({
            'id_node': nid,
            'lat': info['lat'],
            'lon': info['lon'],
            'adj_list': str(info['adj'])
        })

    return pd.DataFrame(data_list), edge_geometry_map


class VisualizacionGenerator:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.graph = nx.DiGraph()
        self.steps = []
        self.node_data = {}
        self.J_map = {} 
        self.edge_geometries = {} # Guardaremos las formas reales aquí
        
    def cargar_grafo(self):
        # LLAMADA ACTUALIZADA: Recibimos nodos Y geometrías
        df, geom_dict = procesar_datos_geograficos(self.csv_path)
        self.edge_geometries = geom_dict # Guardamos para usar al exportar
        
        if df.empty: return

        print(f"Construyendo grafo lógico...")
        for _, row in df.iterrows():
            u = int(row['id_node'])
            lat = float(row['lat'])
            lon = float(row['lon'])
            self.node_data[u] = {'lat': lat, 'lon': lon}
            self.graph.add_node(u, lat=lat, lon=lon)
            try:
                neighbors = ast.literal_eval(str(row['adj_list']))
                for v in neighbors:
                    self.graph.add_edge(u, int(v))
            except: pass
        
        if WTP_ID not in self.graph:
            print(f"⚠️ ERROR: WTP_ID {WTP_ID} no existe.")
        else:
            self.precalcular_dominadores()

    def precalcular_dominadores(self):
        print("Calculando J_v...")
        G_rev = self.graph.reverse()
        try:
            dom_dict = nx.immediate_dominators(G_rev, WTP_ID)
            dom_tree = nx.DiGraph()
            for node, dom in dom_dict.items():
                if node != dom: dom_tree.add_edge(dom, node)
            for v in self.graph.nodes():
                if v in dom_tree: self.J_map[v] = nx.descendants(dom_tree, v) | {v}
                else: self.J_map[v] = {v}
        except:
             for v in self.graph.nodes(): self.J_map[v] = {v}

    def obtener_ancestros_fisicos(self, nodo):
        if nodo not in self.graph: return set()
        return nx.ancestors(self.graph, nodo) | {nodo}

    def exportar_paso(self, tipo, descripcion, extra_data=None, variables=None):
        step = {
            "type": tipo, "description": descripcion, 
            "wtp_node": WTP_ID, "infected_node": self.infected_id
        }
        
        # SOLO EN EL PASO 0 (Initial State) enviamos la geometría pesada
        if len(self.steps) == 0:
            step["nodes"] = [{"id": n, "lat": d['lat'], "lon": d['lon']} for n, d in self.node_data.items()]
            
            # Construimos la lista de aristas INCLUYENDO la geometría real
            edges_list = []
            for u, v in self.graph.edges():
                edge_obj = {"source": u, "target": v}
                
                # Buscamos si tenemos la forma real guardada
                if (u, v) in self.edge_geometries:
                    edge_obj["geometry"] = self.edge_geometries[(u, v)]
                
                edges_list.append(edge_obj)
            
            step["edges"] = edges_list

        if extra_data: step.update(extra_data)
        if variables: step["variables"] = variables
        self.steps.append(step)

    def ejecutar_simulacion(self):
        # ... (Copia EXACTAMENTE el mismo método ejecutar_simulacion de la respuesta anterior) ...
        # ... (No ha cambiado nada en la lógica de simulación, solo en la carga y exportación) ...
        
        # PARA AHORRARTE COPIAR Y PEGAR, AQUÍ ESTÁ RESUMIDO EL INICIO:
        universo_valido = self.obtener_ancestros_fisicos(WTP_ID)
        candidatos_iniciales = [n for n in list(self.graph.nodes()) if n in universo_valido and n != WTP_ID]
        if not candidatos_iniciales: return
        if INFECTADO_ID and INFECTADO_ID in candidatos_iniciales: self.infected_id = INFECTADO_ID
        else:
            import random
            self.infected_id = random.choice(candidatos_iniciales)
        
        # Variables iniciales
        vars_estado = {"S": "{}", "aux": "-", "auxv": "-∞", "B": "-"}
        self.exportar_paso("INITIAL_STATE", "Estado Inicial", variables=vars_estado)

        candidatos = set(universo_valido) 
        S_acumulado = set() 
        iteracion = 1

        while True:
            B = math.ceil(len(candidatos) / 2)
            print(f"Ronda {iteracion} | B: {B}")
            S_round = []; cubierto_ronda = set() 
            
            for _ in range(PRESUPUESTO_K):
                best_node = None; max_gain = -1; best_gain_val = 0
                posibles = [n for n in candidatos if n not in S_acumulado and n not in S_round]
                for v in posibles:
                    J_v = self.J_map.get(v, set())
                    J_v_validos = J_v.intersection(candidatos)
                    gain = len(J_v_validos - cubierto_ronda)
                    if gain <= B and gain > max_gain:
                        max_gain = gain; best_node = v; best_gain_val = gain
                
                if best_node is not None:
                    S_round.append(best_node)
                    J_best = self.J_map[best_node].intersection(candidatos)
                    cubierto_ronda.update(J_best)
                    vars_estado = {"S": f"{{{', '.join(map(str, S_acumulado | set(S_round)))}}}", "aux": str(best_node), "auxv": str(best_gain_val), "B": str(B)}
            
            if not S_round: break
            self.exportar_paso("HEURISTIC_SELECTION", f"Ronda {iteracion}: Muestreo", {"selected_nodes": S_round}, variables=vars_estado)

            resultados = {}
            for sensor in S_round:
                fluido = self.obtener_ancestros_fisicos(sensor)
                val = 1 if self.infected_id in fluido else 0
                resultados[sensor] = val
            
            self.exportar_paso("KNOWLEDGE_UPDATE", "Resultados Lab", {"updated_nodes": [{"id": k, "value": v} for k, v in resultados.items()]}, variables=vars_estado)
            S_acumulado.update(S_round)

            nodos_antes = len(candidatos); nuevos_candidatos = set(candidatos)
            for sensor, res in resultados.items():
                if res == 0: nuevos_candidatos -= self.obtener_ancestros_fisicos(sensor)
            positivos = [s for s, r in resultados.items() if r == 1]
            if positivos:
                zona_comun = set(self.graph.nodes())
                for p in positivos: zona_comun = zona_comun.intersection(self.obtener_ancestros_fisicos(p))
                nuevos_candidatos = nuevos_candidatos.intersection(zona_comun)

            descartados = candidatos - nuevos_candidatos
            candidatos = nuevos_candidatos
            
            self.exportar_paso("PRUNING", f"Reducción: {nodos_antes}->{len(candidatos)}", {"discarded_nodes": list(descartados)}, variables=vars_estado)

            if len(candidatos) == 1:
                found = list(candidatos)[0]
                path = []
                try: path = nx.shortest_path(self.graph, source=found, target=WTP_ID)
                except: pass
                self.exportar_paso("PATH_CREATION", "¡Encontrado!", {"infected_node": found, "path": path}, variables=vars_estado)
                break
            if not candidatos: break
            iteracion += 1

    def guardar_json(self):
        with open(OUTPUT_JSON, 'w') as f:
            json.dump(self.steps, f, indent=2)
        print("JSON Generado.")

if __name__ == "__main__":
    sim = VisualizacionGenerator(INPUT_CSV)
    sim.cargar_grafo()
    sim.ejecutar_simulacion()
    sim.guardar_json()