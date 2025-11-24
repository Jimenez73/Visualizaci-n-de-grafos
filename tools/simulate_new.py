import numpy as np
import pandas as pd
import networkx as nx
from networkx.algorithms import approximation as app
from collections import deque, defaultdict
import math
import random
import json


def get_random_tree(G, nodes, WTP=None):
    """
    Generate a random tree by performing a breadth-first search (BFS) traversal starting from a given node.

    Parameters:
        G (networkx.DiGraph): The directed acyclic graph (DAG) to generate a random tree from.
        nodes (int): The number of nodes to include in the generated random tree.
        WTP (str, optional): The starting node for the BFS traversal. If None, a random node from G is chosen as the root.

    Returns:
        networkx.DiGraph: A randomly generated tree as a directed graph.
        str: The selected root node for the generated tree.

    Note:
        This function generates a random tree by performing a BFS traversal on the input DAG starting from a given node or a random node if 'WTP' is not specified.
    """
    new_G = nx.DiGraph()
    N = len(G.nodes())

    if WTP is None:
        WTP = random.choice(list(G.nodes()))

    V = [0] * N;  V[WTP] = 1
    Q = deque([]); Q.append(WTP)
    while Q:
        if len(new_G.nodes()) < nodes:
            random.shuffle(Q)
            u = Q.popleft()
            for v in G.predecessors(u):
                if not V[v]:
                    Q.append(v)
                    new_G.add_edge(v,u)
                    V[v] = 1
        else:
            break
    return new_G, WTP


def get_degree(G, node):
    """
    Get the degree of a node in a directed graph.

    Parameters:
        G (networkx.DiGraph): The directed graph to calculate the degree from.
        node (str): The node for which to calculate the degree.

    Returns:
        int: The degree of the specified node in the directed graph.

    Note:
        This function calculates the total degree of a node in a directed graph, which is the sum of its in-degree (predecessors) and out-degree (successors).
    """
    return len(list(T.predecessors(node))) + len(list(G.successors(node)))


def add_extra_edges2(T, G, locations, extra, edge_limit=1000000, replace=False):
    """
    Add extra edges to a given tree 'T' based on specified criteria.

    Parameters:
        T (networkx.DiGraph): The input tree to which extra edges will be added.
        G (networkx.DiGraph): The original directed acyclic graph (DAG) serving as a reference.
        locations (pandas.DataFrame): A DataFrame containing node locations with 'ID', 'Longitude', and 'Latitude' columns.
        extra (int): The number of extra edges to add to the tree.
        edge_limit (int, optional): The maximum number of edges allowed for each node in 'T'. Default is 1000000.
        replace (bool, optional): Whether to allow replacement of edges if 'extra' exceeds available edges. Default is False.

    Returns:
        networkx.DiGraph: The modified tree 'T' with added extra edges.

    Note:
        This function adds extra edges to the input tree 'T' based on specified criteria, including edge limits and whether to allow replacement of edges.
    """   
    order = list(nx.topological_sort(T))
    I = defaultdict(int)
    for i in range(len(I)):
        I[order[i]] = i
        
    edges = []
    for e in G.edges():
        if e not in T.edges() and (e[1], e[0]) not in T.edges() and e[0] in T.nodes() and e[1] in T.nodes():
            if I[e[0]] < I[e[1]]:
                edges.append(e)
            else:
                edges.append((e[1], e[0]))
    
    sample = np.random.choice(range(len(edges)), min(extra, len(edges)), replace=replace)
    
    for i in sample:
        e = edges[i]
        if get_degree(T, e[0]) < edge_limit and get_degree(T, e[1]) < edge_limit:
            T.add_edge(*e)
        
    return T


def get_ideal(G, V_, u):
    """
    Find an ideal set of nodes in a directed graph based on a starting node and a set of visited nodes.

    Parameters:
        G (networkx.DiGraph): The directed graph to find the ideal set in.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        u (str): The starting node for the search.

    Returns:
        list of str: An ideal set of nodes reachable from the starting node 'u' without revisiting visited nodes.

    Note:
        This function performs a breadth-first search (BFS) starting from the node 'u' while avoiding nodes that are already visited according to the 'V_' list.
    """
    if V_[u]:
        return list()
    
    V = V_.copy()
    s = [u];  V[u] = 1
    Q = deque([]); Q.append(u)
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v]:
                s.append(v)
                V[v] = 1; Q.append(v)
    
    return s


def visit(G, V, u):
    """
    Visit nodes in a directed graph starting from a node 'u' while marking visited nodes and counting the number visited.

    Parameters:
        G (networkx.DiGraph): The directed graph to visit nodes in.
        V (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        u (str): The starting node for the visit.

    Returns:
        tuple: A tuple containing:
            - list of int: The updated list of visited nodes.
            - int: The number of nodes visited during the traversal.

    Note:
        This function performs a breadth-first search (BFS) starting from the node 'u' while marking visited nodes and counting the number of visited nodes.
    """
    if V[u]:
        return V, 0
    
    V[u] = 1; ans = 0
    Q = deque([]); Q.append(u)
    while Q:
        u = Q.popleft(); ans += 1
        for v in G.predecessors(u):
            if not V[v]:
                V[v] = 1
                Q.append(v)
    
    return V, ans


def get_size(G, V_, u):
    """
    Calculate the size of a connected component in a directed graph starting from a node 'u'.

    Parameters:
        G (networkx.DiGraph): The directed graph to calculate the component size in.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        u (str): The starting node for the calculation.

    Returns:
        int: The size of the connected component starting from node 'u'.

    Note:
        This function calculates the size of the connected component in the directed graph starting from node 'u', considering visited nodes based on the 'V_' list.
    """    
    if V_[u]:
        return 0
    
    V = V_.copy()
    
    ans = 1;  V[u] = 1
    Q = deque([]); Q.append(u)
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v]:
                ans += 1; V[v] = 1
                Q.append(v)
    
    return ans


def get_ideal_robust(G, V_, root, node):
    """
    Find an ideal set of nodes in a directed graph while considering robustness to a specified 'node'.

    Parameters:
        G (networkx.DiGraph): The directed graph to find the ideal set in.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        root (str): The root node of G.
        node (str): The root of the robust ideal.

    Returns:
        list of str: A set of nodes that necessarily have all their paths to the 'root' passing through the specified 'node'.

    Note:
        This function finds an ideal set of nodes in a directed graph starting from the 'root' node, ensuring that all paths from these nodes to the root pass through the specified 'node' and considering visited nodes based on the 'V_' list.
    """
    if root == node:
        return get_ideal(G, V_, root)
    
    V = [0 for u in range(len(V_))]
    V[root] = 1
    Q = deque([root])
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v] and v != node:
                V[v] = 1
                Q.append(v)

    return [i for i in G.nodes() if (V_[i] == 0 and V[i] == 0)]


def visit_robust(G, V, root, u):
    """
    Visit nodes in a directed graph starting of the robust ideal of node 'u'.
    This function ensures robustness by considering the specified 'u' as a node through which all paths from a marked node to 'root' must pass.

    Parameters:
        G (networkx.DiGraph): The directed graph to visit nodes in.
        V (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        root (str): The root node of G.
        u (str): The root of the robust ideal to visit.

    Returns:
        tuple: A tuple containing:
            - list of int: The updated list of visited nodes, including nodes in the robust ideal of u.
            - int: The number of nodes visited during the traversal.

    Note:
        This function performs a breadth-first search (BFS) starting from the node 'u' while marking visited nodes and counting the number of visited nodes. It ensures robustness by considering the specified 'u' as a node through which all paths from a marked node to the 'root' must pass.
    """ 
    I = get_ideal_robust(G, V, root, u)
    
    V_ = V.copy()
    for u in I:
        V_[u] = 1
    
    return V_, len(I)


def get_size_robust(G, V_, root, node):
    """
    Calculate the size of a robust ideal in a directed graph while considering robustness to a specified 'node'.

    Parameters:
        G (networkx.DiGraph): The directed graph to calculate the component size in.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        root (str): The root node for the calculation.
        node (str): The root of the robust ideal.

    Returns:
        int: The size of the robust ideal, considering robustness to the specified 'node'.

    Note:
        This function calculates the size of the robust ideal in the directed graph, considering robustness to the specified 'node' through which all paths to the 'root' must pass.
    """
    N = len(V_)
    
    if V_[node]:
        return 0
    
    if node == root:
        return N - sum(V_)
    
    V = [0] * N
    
    V[root] = 1; Q = deque([root])
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v] and v != node:
                V[v] = 1
                Q.append(v)

    return sum([1 for u in range(N) if V_[u] + V[u] == 0])


def get_size_weight(G, W, V_, u):
    """
    Calculate the size and weight of an ideal in a directed graph starting from a node 'u'.

    Parameters:
        G (networkx.DiGraph): The directed graph to calculate the component size and weight in.
        W (list of int): A list mapping nodes to their respective weights.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        u (str): The starting node for the calculation.

    Returns:
        tuple: A tuple containing:
            - int: The size of the ideal rooted at node 'u'.
            - int: The total weight of the ideal rooted at node 'u'.

    Note:
        This function performs a breadth-first search (BFS) starting from the node 'u' while marking visited nodes, calculating the size and weight of the ideal.
    """
    if V_[u]:
        return 0, 0
    
    V = V_.copy()
    
    s = 1; w = W[u]; V[u] = 1
    Q = deque([]); Q.append(u)
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v]:
                s += 1; w += W[v]; V[v] = 1
                Q.append(v)
    
    return s, w


def get_size_weight_robust(G, W, V_, root, node):
    """
    Calculate the size and weight of a robust ideal in a directed graph while considering robustness to a specified 'node'.

    Parameters:
        G (networkx.DiGraph): The directed graph to calculate the component size and weight in.
        W (dict): A dictionary mapping nodes to their respective weights.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        root (str): The root node for the calculation.
        node (str): The node through which all paths to the 'root' must pass.

    Returns:
        tuple: A tuple containing:
            - int: The size of the robust ideal in the directed graph.
            - int: The total weight of the robust ideal in the directed graph.

    Note:
        This function calculates the size and weight of the robust ideal of the specified node in the directed graph.
    """
    N = len(G.nodes())
    
    if V_[node]:
        return 0 , 0
    
    if node == root:
        return N - sum(V_), sum(W) - sum([W[i] for i in G.nodes() if V_[i]])
    
    V = [0] * len(V_)
    
    V[root] = 1; Q = deque([root])
    while Q:
        u = Q.popleft()
        for v in G.predecessors(u):
            if not V[v] and v != node:
                V[v] = 1
                Q.append(v)
                
    I = [i for i in G.nodes() if (V_[i] == 0 and V[i] == 0)]
    return sum([1 for i in I]), sum([W[i] for i in I])


def greedyAppReduceAll(G, W, V_, root, K, slim, wlim, plim, calcRobust, visitRobust, simulation_steps, _id, iteration):
    """
    Perform a greedy algorithm to select K nodes to query in a directed graph while considering various constraints.

    Parameters:
        G (networkx.DiGraph): The directed graph to reduce nodes in.
        W (list of int): A list mapping nodes to their respective weights.
        V_ (list of int): A list representing visited nodes (1 for visited, 0 for not visited).
        root (str): The root node of the DAG.
        K (int): The nuber of samples per iteration.
        slim (float): The maximum allowed size of the subgraph induced by a sample.
        wlim (float): The maximum allowed weight of the subgraph induced by a sample.
        plim (float): The robustness threshold (proportion of paths passing through a node) for node selection.
        calcRobust (bool): Whether to calculate robustness during node reduction.
        visitRobust (bool): Whether to perform robustness-aware node visitation during reduction.
        simulation_steps (list): The list to store visualization steps.
        _id (dict): Mapping from index to original node ID.
        iteration (int): The current iteration number of the simulation.

    Returns:
        list of str: A list of selected samples.
        int: The total number of nodes that are in the ideal of any sampled node.

    Note:
        This function performs a greedy algorithm to reduce nodes in a directed graph while considering size, weight, and robustness constraints.

    """
    V = V_.copy(); N = len(G.nodes()); N_ = len(W)

    ans = []; tot = 0
    while len(ans) < K:
        
        E = []
        
        S = [0 for u in range(N_)]
        SS = [0 for u in range(N_)]
        for v in G.nodes():
            if not V[v]:
                ss = get_size(G, V, v)
                sr = get_size_robust(G, V, root, v)
                if calcRobust:
                    SS[v], S[v] = get_size_weight_robust(G, W, V, root, v)
                else:
                    SS[v], S[v] = get_size_weight(G, W, V, v)
                if ss > 0 and (sr / ss) >= plim:
                    E.append(v)
        
        maxv = 0; u = -1
        for v in E:
            s = SS[v]
            if s > maxv and s <= slim and S[v] <= wlim:
                u = v
                maxv = s
            
        if u == -1:
            break
        
        x = None
        if visitRobust:
            V, x = visit_robust(G, V, root, u)
        else:
            V, x = visit(G, V, u)
        ans.append(u); tot += x

    # Requirement 6: Show the nodes selected by the heuristic
    if ans:
        simulation_steps.append({
            "step": len(simulation_steps) + 1,
            "iteration": iteration,
            "type": "HEURISTIC_SELECTION",
            "selected_nodes": [int(_id[node_idx]) for node_idx in ans],
            "description": f"Iteración {iteration}: La heurística selecciona {len(ans)} nodos."
        })
        
    return ans, tot


def simulate_robust_randtree(G, root, W, k2, S, plim, calcRobust, visitRobust, verbose, map_prev, simulation_steps, _id):
    """
    Simulate the process of finding an infected node in a DAG using the greedyAppReduceAll algorithm.

    Parameters:
        G (networkx.DiGraph): The DAG.
        root (str): The root node of the DAG
        W (list): A list mapping nodes to their respective weights.
        k2 (int): Number of samples per iteration
        S (list of str): A list of nodes that will be simulated as infected in the search.
        plim (float): The robustness threshold (proportion of paths passing through a node) for node selection.
        calcRobust (bool): Whether to calculate robustness during search.
        visitRobust (bool): Whether to perform robustness-aware node visitation during search.
        verbose (bool): Whether to print detailed information during the simulation.
        map_prev (dict): A dictionary to store previous mappings of queried nodes for previously searched subgraphs.

    Returns:
        list of int: A list of iteration counts for each search simulation.
        dict: A dictionary storing previous mappings for reuse in subsequent simulations.

    Note:
        This function simulates a robust search for infected nodes in a directed graph, considering various constraints and parameters.
    """ 
    iters = []
    
    N = len(G.nodes())
    N_ = len(W)

    # This is a global step counter across all simulations if S has multiple nodes.
    # We'll use a local counter `t` for steps within this specific simulation.
    base_step = len(simulation_steps)

    paths = []
    node_it = 0
    for r in S:
        node_it += 1

        if verbose:
            print(r)

        CV = [0 for u in range(N_)]
        
        # Requirement 4: Show the path created
        pth = [r]
        CV[r] = 1
        Q = deque([]); Q.append(r)
        while Q:
            u = Q.popleft()
            successors = list(G.successors(u))
            if successors:
                v = random.sample(successors, 1)[0]
                CV[v] = 1
                Q.append(v)
                pth.append(v)
        paths.append(pth)

        simulation_steps.append({
            "step": base_step + 1,
            "type": "PATH_CREATION",
            "path": [int(_id[node_idx]) for node_idx in pth],
            "description": f"Se crea un camino aleatorio para el nodo infectado {int(_id[r])}."
        })

        # Requirement 5: Show the initialization of the graph states
        V = [1 for u in range(N_)]
        for u in G.nodes():
            V[u] = 0
        
        initial_node_states = { int(_id[i]): V[i] for i in range(N_) if i in _id }
        simulation_steps.append({
            "step": base_step + 2,
            "type": "STATE_INITIALIZATION",
            "node_states": initial_node_states,
            "description": "Se inicializan todos los nodos a estado '0' (desconocido)."
        })

        R = N
        for t in range(100):
            
            R = N_ - sum(V)
            P = []
            sP = 0
            
            if not verbose:
                print("                                                           ", end="\r")
                print(f"Search {r}: {t + 1}    now: {R}", end="\r")
            
            if verbose:
                print("it,", t, R)
            
            # --- Store state before update ---
            V_before = V.copy()
                
            nn = 0
            for i in G.nodes():
                if V[i]:
                    nn += 2**i
            
            if nn in map_prev.keys():
                P = map_prev[nn]
            else:
                if R > N / 10:
                    P, sP = greedyAppReduceAll(G, W, V, root, k2, R / 3, 1e8, plim, calcRobust, visitRobust, simulation_steps, _id, t)
                elif R >= 10:
                    low = 0; high = R
                    while low != high:
                        mid = (low + high) // 2
                        P, sP = greedyAppReduceAll(G, W, V, root, k2, mid, 1e8, plim, calcRobust, visitRobust, simulation_steps, _id, t)
                        if R - sP < mid:
                            high = mid
                        else:
                            low = mid + 1
                    P, sP = greedyAppReduceAll(G, W, V, root, k2, low, 1e8, plim, calcRobust, visitRobust, simulation_steps, _id, t)
                    
                    if verbose:
                        print("pre low:", low, R - sP)

                    if low > 1:
                        P_, sP_ = greedyAppReduceAll(G, W, V, root, k2, low - 1, 1e8, plim, calcRobust, visitRobust, simulation_steps, _id, t)

                        if verbose:
                            print("low:", low, R - sP, R - sP_)

                        if abs((R - sP_) - (low - 1)) < abs((R - sP) - low) or len(P) == 1:
                            P = P_; sP = sP_
                else:
                    P, sP = greedyAppReduceAll(G, W, V, root, k2, 1, 1e8, plim, calcRobust, visitRobust, simulation_steps, _id, t)
    
            if verbose:
                print("nx", len(P), sum([CV[u] for u in P]), N_ - sum(V))
                print("P: ", ' '.join([str(p) for p in P]))

            
            tt = 100
            while tt > 0:
                tt -= 1
                
                V__ = V
                if sum([CV[u] for u in P]):
                    V_ = [-1 * V[u] for u in range(N_)]
                    for u in P:
                        if CV[u]:
                            I = get_ideal(G, V, u)
                            for v in I:
                                V_[v] += 1

                    V__ = [(V_[u] != sum([CV[u] for u in P])) for u in range(N_)]

                    if verbose:
                        print("if: ", N_ - sum(V_))

                for u in P:
                    if not CV[u]:
                        I = get_ideal_robust(G, V__, root, u)
                        for v in I:
                            V__[v] = 1
                
                if N_ - sum(V__) == R:
                    
                    print("\nREPEATING\n\n")

                    POS = []
                    for i in range(N_):
                        if V[i] == 0:
                            POS.append(i)
                    P = random.sample(POS, len(P))
                else:
                    V = V__
                    break
            
            # Requirement 7: Show the update of the knowledge
            updated_nodes = {}
            for i in range(N_):
                if i in _id and V_before[i] == 0 and V[i] == 1:
                    updated_nodes[int(_id[i])] = 1 # New state is 1 (known)

            if updated_nodes:
                simulation_steps.append({
                    "step": len(simulation_steps) + 1,
                    "iteration": t,
                    "type": "KNOWLEDGE_UPDATE",
                    "updated_nodes": updated_nodes,
                    "description": f"Iteración {t}: {len(updated_nodes)} nodos actualizados a estado '1' (conocido)."
                })

            size = N_ - sum(V)
            weight = sum([W[u] for u in range(N_) if not V[u]])
            
            map_prev[nn] = P
            
            if verbose:
                print(size, weight)

            if tt == 0 and size == R:
                iters.append(min(100, t + size))
                print(f"[{node_it}] Result {r}: {iters[-1]}    acc: {sum(iters) / len(iters)}")
                break
            if size == 1 or weight <= 200:
                iters.append(t + 1)
                print(f"[{node_it}] Result {r}: {iters[-1]}    acc: {sum(iters) / len(iters)}")
                break
            if size <= k2:
                iters.append(t + 2)
                print(f"[{node_it}] Result {r}: {iters[-1]}    acc: {sum(iters) / len(iters)}")
                break
            if t == 99:
                iters.append(100)
                print(f"[{node_it}] Result {r}: {iters[-1]}    acc: {sum(iters) / len(iters)}")

    print(sum(iters) / len(iters), max(iters), "\n\n\n")
    
    return iters, map_prev, paths


if __name__ == "__main__":
    
    simulation_steps = []
    ratio = 0
    K = 5

    path_geojson = '../data/grafo_base.geojson'
    with open(path_geojson, 'r') as f:
        geojson_data = json.load(f)
        
    features = geojson_data['features']
    
    # The rest of the script expects a DataFrame.
    csv_grafo = pd.DataFrame([f['properties'] for f in features])

    # --- Start Visualization Data Capture ---
    
    # 1. Capture all unique nodes and their coordinates from GeoJSON
    node_coords = {}
    initial_edges = []
    
    for feature in features:
        props = feature['properties']
        coords = feature['geometry']['coordinates']
        
        self_id = props['self']
        other_id = props['other']
        
        # lon, lat
        self_coords = coords[0]
        other_coords = coords[-1] # Use the last point for the destination
        
        if self_id not in node_coords:
            node_coords[self_id] = {'lon': self_coords[0], 'lat': self_coords[1]}
        if other_id not in node_coords:
            node_coords[other_id] = {'lon': other_coords[0], 'lat': other_coords[1]}
        
        initial_edges.append({'source': self_id, 'target': other_id})

    nodes_for_json = [{"id": n, "lat": node_coords[n]['lat'], "lon": node_coords[n]['lon']} for n in node_coords]

    simulation_steps.append({
        "step": 0,
        "type": "INITIAL_GRAPH",
        "nodes": nodes_for_json,
        "edges": initial_edges,
        "description": "Grafo inicial completo cargado desde el GeoJSON."
    })
    
    # 2. Capture DAG creation (removed edges)
    out = {15190, 1003206, 16503, 15004, 14062, 13735, 1003167, 1003744, 1003746, 1003950, 13730, 13731, 13732, 13733, 15131, 16094, 16095, 131099}
    
    removed_edges = []
    for edge in initial_edges:
        if edge['source'] in out or edge['target'] in out:
            removed_edges.append(edge)
            
    simulation_steps.append({
        "step": 1,
        "type": "DAG_CREATION",
        "removed_edges": removed_edges,
        "description": f"Creación del DAG eliminando arcos conectados a {len(out)} nodos problemáticos."
    })

    # --- End Visualization Data Capture ---

    # Create a set of nodes 'S' based on edge information (excluding 'out' nodes)
    S = set()
    for index, row in csv_grafo.iterrows():
        origin = row['self']
        dest = row['other']
        if origin not in out and dest not in out:
            S.add(origin)
            S.add(dest)
    S = list(S)

    # Create dictionaries for node ID mapping
    id_ = {}; _id = {}; l = 0
    for u in S:
        id_[u] = l; _id[l] = u
        l += 1

    # Create a graph 'G'
    G = nx.DiGraph()
    for index, row in csv_grafo.iterrows():
        origin = row['self']
        dest = row['other']
        if origin not in out and dest not in out:
            G.add_edge(id_[origin], id_[dest])
        
    N_ = l
    WTP = 744

    NN = 4576

    paths = [set() for _ in G.nodes()]

    # Generate a random tree 'T' and get the root 'WTP'
    T, WTP = get_random_tree(G, N_, WTP)

    # Add extra edges to the tree 'T' to create 'g'
    g = add_extra_edges2(T, G, None, math.ceil(len(list(T.edges())) * ratio))
    
    nE = len(list(g.edges()))

    W = [1000000 for i in range(len(G.nodes()))]

    # SIMULACIÓN PARA UN NODO PARTICULAR
    nodos_infectados = [945]
    # print(random.choice(list(G.nodes())))

    # --- Start Visualization Data Capture ---
    simulation_steps.append({
        "step": 2,
        "type": "INITIAL_SETUP",
        "wtp_node": int(_id[WTP]),
        # "infected_node": nodos_infectados[0],
        "infected_node": int(_id[nodos_infectados[0]]),
        "description": "Nodo WTP y nodo infectado inicial seleccionados."
    })
    # --- End Visualization Data Capture ---

    print("Iniciando simulación...")
    iters, _, pp = simulate_robust_randtree(g, WTP, W, K, nodos_infectados, 0, True, True, False, {}, simulation_steps, _id)
    # ----------------------------------

    # Write simulation steps to JSON file
    output_path = '../data/simulation_data.json'
    with open(output_path, 'w') as f:
        json.dump(simulation_steps, f, indent=4)
    
    print(f"Simulación guardada en {output_path}")