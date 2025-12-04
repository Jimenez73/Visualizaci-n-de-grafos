// Visuales de Ejemplo de Búsqueda en Grafo y Árbol de Decisión
const EXAMPLE_OPTIONS_GRAPH = {
    nodes: { 
        shape: 'dot', 
        size: 20, 
        font: { size: 14 } 
    },
    edges: { 
        arrows: 'to',
        color: { inherit: false },
        width: 2
    },
    layout: {
        hierarchical: {
            enabled: true,
            direction: 'DU',
            sortMethod: 'directed',
            levelSeparation: 150,
            nodeSpacing: 100
        }
    },
    physics: false,
    interaction: {
        dragNodes: false,
        zoomView: false,
        dragView: false
    }
};

const EXAMPLE_OPTIONS_TREE = {
    nodes: { 
        shape: 'dot',
        size: 18, 
        font: { size: 14 } 
    },
    edges: { 
        arrows: 'to',
        font: { align: 'horizontal', background: 'white', size: 18 },
        color: { color: '#cccccc', inherit: false }, 
        width: 2
    },
    layout: { 
        hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            levelSeparation: 100,
            nodeSpacing: 150
        }
    },
    physics: false,
    interaction: {
        dragNodes: false,
        zoomView: false,
        dragView: false
    }
};

// Estado del Ejemplo
let exampleState = {
    frames: [],
    currentFrame: 0,
    baseStructure: null,
    dataGraph: { nodes: null, edges: null },
    dataTree: { nodes: null, edges: null }
};

// Inicialización del Ejemplo
async function initExampleView() {
    if (exampleState.frames.length > 0) return;

    try {
        const res = await fetch('data/example_graph.json');
        const data = await res.json();
        
        exampleState.frames = data.frames;
        exampleState.baseStructure = data.structures;

        // 1. Inicializar Grafo (Izquierda)
        exampleState.dataGraph.nodes = new vis.DataSet(data.structures.searchGraph.nodes);
        exampleState.dataGraph.edges = new vis.DataSet(data.structures.searchGraph.edges);
        
        new vis.Network(
            document.getElementById('ex-graph-container'), 
            exampleState.dataGraph, 
            EXAMPLE_OPTIONS_GRAPH
        );

        // 2. Inicializar Árbol (Derecha)
        exampleState.dataTree.nodes = new vis.DataSet(data.structures.decisionTree.nodes);
        exampleState.dataTree.edges = new vis.DataSet(data.structures.decisionTree.edges);

        new vis.Network(
            document.getElementById('ex-tree-container'), 
            exampleState.dataTree, 
            EXAMPLE_OPTIONS_TREE
        );

        updateExampleVis(0);

    } catch (e) { console.error("Error cargando ejemplo:", e); }
}

// Actualizar Visualización del Ejemplo
function updateExampleVis(index) {
    if (!exampleState.frames.length) return;
    
    if (index < 0) index = 0;
    if (index >= exampleState.frames.length) index = exampleState.frames.length - 1;

    exampleState.currentFrame = index;
    const frame = exampleState.frames[index];

    // A. UI
    const numSpan = document.getElementById('ex-step-number');
    const descSpan = document.getElementById('ex-step-desc');
    if (numSpan) numSpan.innerText = index + 1;
    if (descSpan) descSpan.innerText = frame.description;

    // B. LÓGICA DE REPLAY (NODOS Y ARISTAS)
    
    // 1. Clonar Estructuras Base (Nodos y Aristas)
    let currentGraphNodes = JSON.parse(JSON.stringify(exampleState.baseStructure.searchGraph.nodes));
    let currentGraphEdges = JSON.parse(JSON.stringify(exampleState.baseStructure.searchGraph.edges));
    
    let currentTreeNodes  = JSON.parse(JSON.stringify(exampleState.baseStructure.decisionTree.nodes));
    let currentTreeEdges  = JSON.parse(JSON.stringify(exampleState.baseStructure.decisionTree.edges));

    // 2. Función de Limpieza (Reset)
    const resetNodeStyles = (n) => { n.color = null; n.scale = 1; };
    const resetEdgeStyles = (e) => { e.color = null; e.width = 2; };

    // Limpiar todo antes de empezar
    currentGraphNodes.forEach(resetNodeStyles);
    currentGraphEdges.forEach(resetEdgeStyles);
    currentTreeNodes.forEach(resetNodeStyles);
    currentTreeEdges.forEach(resetEdgeStyles);

    // 3. Aplicar Frames
    for (let i = 0; i <= index; i++) {
        const f = exampleState.frames[i];
        
        // --- GRAFO IZQUIERDO ---
        // Nodos
        if (f.updatesSearch) {
            f.updatesSearch.forEach(u => {
                const node = currentGraphNodes.find(n => n.id === u.id);
                if (node) Object.assign(node, u);
            });
        }
        // Aristas
        if (f.updatesGraphEdges) {
            f.updatesGraphEdges.forEach(u => {
                const edge = currentGraphEdges.find(e => e.id === u.id);
                if (edge) Object.assign(edge, u);
            });
        }

        // --- ÁRBOL DERECHO ---
        // Nodos
        if (f.updatesTree) {
            f.updatesTree.forEach(u => {
                const node = currentTreeNodes.find(n => n.id === u.id);
                if (node) Object.assign(node, u);
            });
        }
        // Aristas
        if (f.updatesTreeEdges) {
            f.updatesTreeEdges.forEach(u => {
                const edge = currentTreeEdges.find(e => e.id === u.id);
                if (edge) Object.assign(edge, u);
            });
        }
    }

    // 4. Actualizar estados del ejemplo
    exampleState.dataGraph.nodes.update(currentGraphNodes);
    exampleState.dataGraph.edges.update(currentGraphEdges);
    
    exampleState.dataTree.nodes.update(currentTreeNodes);
    exampleState.dataTree.edges.update(currentTreeEdges);
}

function nextExampleStep() { updateExampleVis(exampleState.currentFrame + 1); }
function prevExampleStep() { updateExampleVis(exampleState.currentFrame - 1); }