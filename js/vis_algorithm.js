// js/vis_algorithm.js

// Configuración de Vis.js (Árbol Jerárquico)
const VIS_OPTIONS = {
    nodes: {
        shape: 'circle',
        font: { size: 14, color: '#000000' },
        borderWidth: 2,
        color: { background: '#ffffff', border: '#333333' }
    },
    edges: {
        arrows: 'to',
        color: '#cccccc',
        // smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 }
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
    physics: false 
};

async function initAlgorithmView() {
    const codeElement = document.getElementById("greedy_algorithm");
    
    // Si no existe el elemento original y tampoco hemos guardado el renderizado, algo va mal.
    // Nota: Una vez renderizado, el ID "greedy_algorithm" desaparece del DOM porque es reemplazado.
    if (!codeElement && !AppState.algorithm.domPseudocode) return;

    // Usamos setTimeout para asegurar que el elemento sea visible (problema del display:none)
    setTimeout(async () => {
        
        // 1. RENDERIZADO DEL PSEUDOCÓDIGO
        // Solo entramos si aun no tenemos la referencia guardada en AppState
        if (!AppState.algorithm.domPseudocode) {
            
            // Verificamos si el elemento <pre> sigue ahí para ser transformado
            if (codeElement && codeElement.offsetParent !== null) {
                try {
                    // A) Ejecutamos la transformación (No devuelve nada)
                    pseudocode.renderElement(codeElement, {
                        lineNumber: true,
                        lineNumberPunc: ':',
                        noEnd: false
                    });

                    // B) ¡AQUÍ ESTÁ LA CORRECCIÓN!
                    // Buscamos el nuevo elemento creado por la librería (clase .ps-root)
                    // Como el <pre> fue reemplazado, buscamos el nuevo div en el documento.
                    const renderedElement = document.querySelector('.ps-root');
                    
                    if (renderedElement) {
                        AppState.algorithm.domPseudocode = renderedElement;
                        console.log("✅ Pseudocódigo capturado correctamente:", renderedElement);
                    } else {
                        console.error("❌ Se renderizó visualmente pero no pude encontrar el elemento .ps-root");
                    }

                } catch (err) {
                    console.error("❌ Error renderizando pseudocode:", err);
                }
            } else {
                // Si el elemento existe pero está oculto, esperamos al siguiente clic
                console.warn("⚠️ El contenedor del algoritmo parece oculto. Reintentando...");
                return; 
            }
        }

        // 2. CARGA DE DATOS DEL GRAFO (Vis.js)
        // Esto solo ocurre una vez
        if (!AppState.algorithm.frames.length) {
            await cargarDatosGrafo();
        }

    }, 100);
}

// Función auxiliar para cargar los datos limpiamente
async function cargarDatosGrafo() {
    try {
        const res = await fetch('data/graph_movie.json');
        if (!res.ok) throw new Error("JSON no encontrado");
        
        const data = await res.json();
        AppState.algorithm.frames = data.frames;

        // Inicializar Vis.js
        AppState.algorithm.dataSetNodes = new vis.DataSet(data.structure.nodes.map(n => ({...n, color:'#e0e0e0'})));
        AppState.algorithm.dataSetEdges = new vis.DataSet(data.structure.edges);

        const container = document.getElementById('grafo-container');
        if (container) {
            AppState.algorithm.network = new vis.Network(container, { 
                nodes: AppState.algorithm.dataSetNodes, 
                edges: AppState.algorithm.dataSetEdges 
            }, VIS_OPTIONS);

            // Ajuste de zoom tras renderizar
            setTimeout(() => AppState.algorithm.network.fit(), 100);
        }
        
    } catch (e) { console.error("Error grafo:", e); }
}

function updateAlgorithmVis(index) {
    const frames = AppState.algorithm.frames;
    if (!frames || index < 0 || index >= frames.length) return;

    AppState.algorithm.currentFrame = index;
    const frame = frames[index];

    // 1. Vis.js Update
    if (frame.updates) AppState.algorithm.dataSetNodes.update(frame.updates);

    // 2. Highlight Update
    if (frame.lineCode) {
        console.log(`Destacando línea ${frame.lineCode}`);
        destacarLineaCodigo(frame.lineCode);
    }

    // 3. Texto Update
    const desc = document.getElementById('algo-step-desc');
    if (desc) desc.innerText = `Paso ${index}: ${frame.description || ''}`;
}

function destacarLineaCodigo(lineNum) {
    if (!AppState.algorithm.domPseudocode) {
        console.log("No hay DOM")
        return;
    }

    const lines = AppState.algorithm.domPseudocode.querySelectorAll('.ps-line');
    
    // Limpiamos la clase de todas las líneas
    lines.forEach(l => {
        l.classList.remove('linea-activa');
    });

    // Activamos solo la línea que corresponde
    const index = lineNum + 2;
    if (lines[index]) {
        lines[index].classList.add('linea-activa');
        lines[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}