import json
import pandas as pd
import networkx as nx
import ast
import re
import math  # <--- IMPORTANTE: Necesario para math.ceil
from pyproj import Transformer

# === CONFIGURACIÓN ===
INPUT_CSV = 'graph_geom_corrected_cycles.csv'
OUTPUT_JSON = '../data/simulation_data.json'
PRESUPUESTO_K = 3   
WTP_ID = 1001544       
INFECTADO_ID = 15522 

# --- FUNCIÓN DE CARGA DE DATOS (Sin cambios) ---
def transformar_edges_a_nodes(ruta_csv):
    # ... (Mismo código de la respuesta anterior) ...
    # Copia aquí la función transformar_edges_a_nodes completa que ya tenías
    # Para ahorrar espacio en la respuesta, asumo que mantienes la versión robusta anterior.
    print("Transformando estructura de datos y proyectando coordenadas...")
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
        return pd.DataFrame()

    node_map = {} 
    for i, row in df_edges.iterrows():
        try:
            u = int(row['self'])
            v = int(row['other'])
            geom = str(row['geometry']) 
            coords_text = re.sub(r'[a-zA-Z\(\)]', '', geom).strip()
            points = coords_text.split(',')
            if len(points) < 2: points = coords_text.split()
            
            raw_start = points[0].strip().split()
            raw_end = points[-1].strip().split()
            
            u_x, u_y = float(raw_start[0]), float(raw_start[1])
            v_x, v_y = float(raw_end[0]),   float(raw_end[1])

            u_lon, u_lat = transformer.transform(u_x, u_y)
            v_lon, v_lat = transformer.transform(v_x, v_y)

            if u not in node_map: node_map[u] = {'lat': u_lat, 'lon': u_lon, 'adj': []}
            if v not in node_map[u]['adj']: node_map[u]['adj'].append(v)
            if v not in node_map: node_map[v] = {'lat': v_lat, 'lon': v_lon, 'adj': []}

        except: continue

    data_list = []
    for nid, info in node_map.items():
        data_list.append({'id_node': nid, 'lat': info['lat'], 'lon': info['lon'], 'adj_list': str(info['adj'])})
    return pd.DataFrame(data_list)


class VisualizacionGenerator:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.graph = nx.DiGraph()
        self.steps = []
        self.node_data = {}
        self.J_map = {} 
        
    def cargar_grafo(self):
        df = transformar_edges_a_nodes(self.csv_path)
        if df.empty: return

        print(f"Construyendo grafo con {len(df)} nodos...")
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
        print("Calculando J_v (Dominators)...")
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
            print(f"Error dominadores: {e}")
            for v in self.graph.nodes(): self.J_map[v] = {v}

    def obtener_ancestros_fisicos(self, nodo):
        if nodo not in self.graph: return set()
        return nx.ancestors(self.graph, nodo) | {nodo}

    # Modificado para aceptar 'variables' en el JSON
    def exportar_paso(self, tipo, descripcion, extra_data=None, variables=None):
        step = {
            "type": tipo, 
            "description": descripcion, 
            "wtp_node": WTP_ID, 
            "infected_node": self.infected_id
        }
        if len(self.steps) == 0:
            step["nodes"] = [{"id": n, "lat": d['lat'], "lon": d['lon']} for n, d in self.node_data.items()]
            step["edges"] = [{"source": u, "target": v} for u, v in self.graph.edges()]
        
        if extra_data: step.update(extra_data)
        
        # Guardamos las variables para el panel de la web
        if variables: step["variables"] = variables
        
        self.steps.append(step)

    def ejecutar_simulacion(self):
        universo_valido = self.obtener_ancestros_fisicos(WTP_ID)
        candidatos_iniciales = [n for n in list(self.graph.nodes()) if n in universo_valido and n != WTP_ID]
        
        if not candidatos_iniciales: return

        if INFECTADO_ID and INFECTADO_ID in candidatos_iniciales:
            self.infected_id = INFECTADO_ID
        else:
            import random
            self.infected_id = random.choice(candidatos_iniciales)
        
        print(f"Infectado: {self.infected_id}")
        
        # Variables iniciales para visualización
        vars_estado = {"S": "{}", "aux": "-", "auxv": "-∞", "B": "-"}
        self.exportar_paso("INITIAL_STATE", "Estado Inicial", variables=vars_estado)

        candidatos = set(universo_valido) 
        S_acumulado = set() 
        iteracion = 1

        while True:
            # === CÁLCULO DE B (Algoritmo 2 del Paper) ===
            # B es la mitad del tamaño del espacio de búsqueda actual.
            # Esto fuerza al algoritmo a buscar particiones balanceadas (Binary Search).
            B = math.ceil(len(candidatos) / 2)
            
            print(f"--- Ronda {iteracion} | Candidatos: {len(candidatos)} | B: {B} ---")

            S_round = [] 
            cubierto_ronda = set() 
            
            for k_idx in range(PRESUPUESTO_K):
                best_node = None
                max_gain = -1
                best_gain_val = 0
                
                posibles = [n for n in candidatos if n not in S_acumulado and n not in S_round]
                
                for v in posibles:
                    J_v = self.J_map.get(v, set())
                    J_v_validos = J_v.intersection(candidatos)
                    
                    # Ganancia Marginal: Cuántos nuevos cubro
                    gain = len(J_v_validos - cubierto_ronda)
                    
                    # === CRITERIO DE SELECCIÓN ===
                    # 1. gain > max_gain: Maximizar cobertura
                    # 2. gain <= B: ¡NUEVO! No cubrir más de la mitad del espacio (para poder descartar eficientemente)
                    if gain <= B and gain > max_gain:
                        max_gain = gain
                        best_node = v
                        best_gain_val = gain
                
                if best_node is not None:
                    S_round.append(best_node)
                    J_best = self.J_map[best_node].intersection(candidatos)
                    cubierto_ronda.update(J_best)
                    
                    # Actualizamos variables para la visualización paso a paso
                    # (Mostramos la selección del último nodo de la ronda como ejemplo)
                    vars_estado = {
                        "S": f"{{{', '.join(map(str, S_acumulado | set(S_round)))}}}", 
                        "aux": str(best_node), 
                        "auxv": str(best_gain_val),
                        "B": str(B) # Guardamos B
                    }
            
            if not S_round: break

            self.exportar_paso(
                "HEURISTIC_SELECTION",
                f"Ronda {iteracion}: B={B}. Se eligen {len(S_round)} sensores.",
                {"selected_nodes": S_round},
                variables=vars_estado
            )

            # --- MEDICIÓN ---
            resultados = {}
            for sensor in S_round:
                fluido = self.obtener_ancestros_fisicos(sensor)
                val = 1 if self.infected_id in fluido else 0
                resultados[sensor] = val
            
            detection = any(r == 1 for r in resultados.values())
            
            self.exportar_paso(
                "KNOWLEDGE_UPDATE",
                f"Resultados: {'Positivo' if detection else 'Negativo'}",
                {"updated_nodes": [{"id": k, "value": v} for k, v in resultados.items()]},
                variables=vars_estado
            )
            
            S_acumulado.update(S_round)

            # --- PODA ---
            nodos_antes = len(candidatos)
            nuevos_candidatos = set(candidatos)
            
            for sensor, res in resultados.items():
                if res == 0:
                    nuevos_candidatos -= self.obtener_ancestros_fisicos(sensor)
            
            positivos = [s for s, r in resultados.items() if r == 1]
            if positivos:
                zona_comun = set(self.graph.nodes())
                for p in positivos:
                    zona_comun = zona_comun.intersection(self.obtener_ancestros_fisicos(p))
                nuevos_candidatos = nuevos_candidatos.intersection(zona_comun)

            descartados = candidatos - nuevos_candidatos
            
            # Actualizamos la variable principal
            candidatos = nuevos_candidatos
            
            self.exportar_paso(
                "PRUNING", 
                f"Reducción: Se descartaron {len(descartados)} nodos. Quedan {len(candidatos)}.",
                # AGREGAMOS ESTA LÍNEA: Convertimos el set a list para el JSON
                {"discarded_nodes": list(descartados)}, 
                variables=vars_estado
            )

            if len(candidatos) == 1:
                found = list(candidatos)[0]
                path = []
                try: path = nx.shortest_path(self.graph, source=found, target=WTP_ID)
                except: pass
                
                self.exportar_paso("PATH_CREATION", f"¡Origen en {found}!", 
                                  {"infected_node": found, "path": path}, variables=vars_estado)
                break
            
            if not candidatos: break
            iteracion += 1

    def guardar_json(self):
        with open(OUTPUT_JSON, 'w') as f:
            json.dump(self.steps, f, indent=2)
        print(f"JSON Listo: {OUTPUT_JSON}")

if __name__ == "__main__":
    sim = VisualizacionGenerator(INPUT_CSV)
    sim.cargar_grafo()
    sim.ejecutar_simulacion()
    sim.guardar_json()