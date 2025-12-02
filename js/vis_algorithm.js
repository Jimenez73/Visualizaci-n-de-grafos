// js/vis_algorithm.js

const VIS_OPTIONS = {
    nodes: {
        shape: 'circle',
        font: { 
            size: 14,
            color: '#000000'
        },
        borderWidth: 2,
        color: { background: '#ffffff', border: '#333333' }
    },
    edges: {
        arrows: 'to',
        color: '#cccccc',
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

// Variable auxiliar para guardar la estructura base original
let algorithmBaseNodes = [];

async function initAlgorithmView() {
    const codeElement = document.getElementById("greedy_algorithm");
    if (!codeElement && !AppState.algorithm.domPseudocode) return;

    setTimeout(async () => {
        // 1. Renderizar Pseudocódigo
        if (!AppState.algorithm.domPseudocode) {
            if (codeElement && codeElement.offsetParent !== null) {
                try {
                    pseudocode.renderElement(
                        codeElement, 
                        { 
                            lineNumber: true, 
                            lineNumberPunc: ':',
                            noEnd: true 
                        }
                    );
                    const renderedElement = document.querySelector('.ps-root');
                    if (renderedElement) AppState.algorithm.domPseudocode = renderedElement;
                } catch (err) { console.error(err); }
            } else { return; }
        }

        // 2. Cargar Datos
        if (!AppState.algorithm.frames.length) {
            await cargarDatosGrafo();
        }

    }, 100);
}

async function cargarDatosGrafo() {
    try {
        const res = await fetch('data/graph_movie.json');
        if (!res.ok) throw new Error("JSON no encontrado");
        
        const data = await res.json();
        AppState.algorithm.frames = data.frames;
        
        // GUARDAMOS EL ESTADO BASE (Original limpio)
        algorithmBaseNodes = data.structure.nodes.map(n => ({...n, color:'#e0e0e0'})); // Color base por defecto

        // Inicializar Vis.js
        AppState.algorithm.dataSetNodes = new vis.DataSet(algorithmBaseNodes);
        AppState.algorithm.dataSetEdges = new vis.DataSet(data.structure.edges);

        const container = document.getElementById('grafo-container');
        if (container) {
            AppState.algorithm.network = new vis.Network(container, { 
                nodes: AppState.algorithm.dataSetNodes, 
                edges: AppState.algorithm.dataSetEdges 
            }, VIS_OPTIONS);

            setTimeout(() => AppState.algorithm.network.fit(), 100);
        }
        
        updateAlgorithmVis(0);

    } catch (e) { console.error("Error grafo:", e); }
}

function updateAlgorithmVis(index) {
    const frames = AppState.algorithm.frames;
    if (!frames || index < 0 || index >= frames.length) return;

    AppState.algorithm.currentFrame = index;
    const frame = frames[index];

    // --- LÓGICA DE REPLAY (Solución al problema de colores) ---
    
    // 1. Empezamos con una copia limpia de los nodos originales
    let currentNodes = JSON.parse(JSON.stringify(algorithmBaseNodes));

    // 2. Aplicamos la historia paso a paso
    for (let i = 0; i <= index; i++) {
        const f = frames[i];
        if (f.updates) {
            f.updates.forEach(update => {
                const node = currentNodes.find(n => n.id === update.id);
                if (node) Object.assign(node, update);
            });
        }
    }

    // 3. Actualizamos Vis.js con el estado calculado
    AppState.algorithm.dataSetNodes.update(currentNodes);


// --- ACTUALIZACIÓN DE UI (NUEVO DISEÑO) ---
    
    // 1. Actualizar Variables (Panel inferior)
    if (frame.variables) {
        const varS = document.getElementById('var-S');
        const varAux = document.getElementById('var-aux');
        const varAuxv = document.getElementById('var-auxv');

        if (varS) varS.innerText = frame.variables.S || "{}";
        if (varAux) varAux.innerText = frame.variables.aux || "-";
        if (varAuxv) {
            let val = frame.variables.auxv || "-";
            if (val === "-inf") val = "-∞"; 
            varAuxv.innerText = val;
        }
    }

    // 2. Actualizar Controles (Botones y Texto)
    const numSpan = document.getElementById('algo-step-number'); // Nuevo ID
    const descSpan = document.getElementById('algo-step-desc');  // ID existente

    // Actualizamos el número en el centro
    if (numSpan) numSpan.innerText = index; 

    // Actualizamos solo la descripción abajo
    if (descSpan) descSpan.innerText = frame.description || '';
    
    // 3. Highlight del código
    if (frame.lineCode) destacarLineaCodigo(frame.lineCode);
}

function destacarLineaCodigo(lineNum) {
    if (!AppState.algorithm.domPseudocode) return;
    
    const lines = AppState.algorithm.domPseudocode.querySelectorAll('.ps-line');
    lines.forEach(l => {
        l.classList.remove('linea-activa');
        l.style.backgroundColor = ""; 
        l.style.borderLeft = "";
    });

    const index = lineNum + 2;
    if (lines[index]) {
        lines[index].classList.add('linea-activa');
        // lines[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}