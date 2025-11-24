// js/app.js

// --- VARIABLES GLOBALES ---
let mapInstance = null;
let simulationSteps = [];
let mapNodes = {}; // Diccionario: ID (String) -> L.circleMarker
let mapEdges = {}; // Diccionario: Key "ID_A-ID_B" -> L.polyline
let currentStepIndex = 0;
let isPlaying = false;
let playInterval = null;

// --- CONFIGURACIÓN DE ESTILOS ---
const STYLES = {
    node: {
        // Base
        default:   { color: '#64748b', fillColor: '#64748b', fillOpacity: 0.7, radius: 5, weight: 1 }, // Gris
        
        // Roles Estructurales (Máxima Prioridad)
        wtp:       { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1.0, radius: 10, weight: 3 }, // Azul Fuerte
        infected:  { color: '#09090b', fillColor: '#09090b', fillOpacity: 1.0, radius: 10, weight: 3 }, // Negro Fuerte
        
        // Estados Dinámicos
        known:     { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9, radius: 8, weight: 2 },  // Verde (Conocimiento=1)
        path:      { color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 0.9, radius: 6, weight: 1 },  // Rojo Oscuro (Parte de un camino)
        
        // Transitorios
        selected:  { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, radius: 9, weight: 2 }   // Naranja (Heurística actual)
    },
    edge: {
        default:   { color: '#94a3b8', weight: 2, opacity: 0.3 }, // Gris tenue
        highlight: { color: '#dc2626', weight: 4, opacity: 1.0 }, // Rojo (Camino)
        transient: { color: '#ef4444', weight: 5, opacity: 1.0 }  // Rojo Claro (Flash DAG)
    }
};

let mapAndDataInitialized = false; // Flag para controlar la inicialización

document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando App: Carga diferida de mapa...");
    setupNavigation();
    setupControls();
});

// --- 1. INICIALIZACIÓN DEL MAPA ---
function initMap() {
    const mapDiv = document.getElementById('map-container');
    if (!mapDiv) return;

    mapInstance = L.map('map-container').setView([-36.82, -73.05], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(mapInstance);
}

// --- 2. CARGA DE DATOS ---
async function loadSimulationData() {
    const paths = ['data/simulation_data.json', 'simulation_data.json'];
    
    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) {
                simulationSteps = await res.json();
                console.log(`Datos cargados: ${simulationSteps.length} pasos.`);
                initVisualization();
                return;
            }
        } catch (e) { console.warn(`Intento fallido en ${path}`, e); }
    }
    
    const desc = document.getElementById('step-description');
    if(desc) desc.innerHTML = `<span style="color:red">Error crítico: No se encontró 'simulation_data.json'.</span>`;
}

function initVisualization() {
    const slider = document.getElementById('sim-slider');
    if (slider) {
        slider.max = simulationSteps.length - 1;
        slider.value = 0;
        slider.disabled = false;
    }
    
    // Buscar primer paso con nodos para dibujar el grafo base
    const setupStep = simulationSteps.find(s => s.nodes && s.nodes.length > 0) || simulationSteps[0];
    if (setupStep) drawInitialGraph(setupStep);
    
    updateVisualization(0);
}

// --- 3. DIBUJADO BASE ---
function drawInitialGraph(stepData) {
    // Limpiar capas previas
    Object.values(mapNodes).forEach(l => mapInstance.removeLayer(l));
    Object.values(mapEdges).forEach(l => mapInstance.removeLayer(l));
    mapNodes = {};
    mapEdges = {};

    const nodes = stepData.nodes || [];
    const edges = stepData.edges || [];

    // A. Aristas (Base)
    edges.forEach(e => {
        const sId = String(e.source);
        const tId = String(e.target);
        const nodeS = nodes.find(n => String(n.id) === sId);
        const nodeT = nodes.find(n => String(n.id) === tId);

        if (nodeS && nodeT) {
            const poly = L.polyline([[nodeS.lat, nodeS.lon], [nodeT.lat, nodeT.lon]], STYLES.edge.default)
                          .addTo(mapInstance);
            
            // Usamos clave ordenada para encontrar la arista sin importar la dirección del dato
            const key = [sId, tId].sort().join('-');
            mapEdges[key] = poly;
        }
    });

    // B. Nodos (Encima)
    nodes.forEach(n => {
        const nId = String(n.id);
        const circle = L.circleMarker([n.lat, n.lon], STYLES.node.default).addTo(mapInstance);
        circle.bindPopup(`<b>ID:</b> ${nId}`);
        mapNodes[nId] = circle;
    });

    // Zoom automático, limitación de zoom-out y de paneo
    if (nodes.length > 0) {
        const group = new L.featureGroup(Object.values(mapNodes));
        const bounds = group.getBounds();
        mapInstance.fitBounds(bounds, { padding: [50, 50] });

        // Después de ajustar, define el zoom mínimo para que el usuario no se aleje demasiado.
        // Se permite un nivel de zoom-out respecto a la vista que encuadra todos los nodos.
        const fitZoom = mapInstance.getZoom();
        mapInstance.setMinZoom(fitZoom > 1 ? fitZoom - 1 : 0);

        // Limita el área de paneo a los nodos con un poco de margen.
        mapInstance.setMaxBounds(bounds.pad(0.1));
    }
}

// --- 4. CORE VISUAL (MÁQUINA DE ESTADOS) ---
function updateVisualization(index) {
    if (index < 0 || index >= simulationSteps.length) return;
    currentStepIndex = index;
    const currentStep = simulationSteps[index];
    
    updateUI(index, currentStep);

    // --- CÁLCULO DE ESTADO ACUMULADO ---
    // Iteramos desde el principio para garantizar consistencia temporal
    let state = {
        wtp: null,            // ID WTP
        infected: null,       // ID Infectado
        knownNodes: new Set(),  // IDs con knowledge = 1
        pathNodes: new Set(),   // IDs que forman parte de caminos descubiertos
        pathEdges: new Set(),   // Keys de aristas de caminos
        transientEdges: new Set() // Aristas del paso actual (DAG)
    };

    for (let i = 0; i <= index; i++) {
        const s = simulationSteps[i];

        // 1. Roles Fijos (Initial Setup)
        if (s.wtp_node) state.wtp = String(s.wtp_node);
        if (s.root_node) state.wtp = String(s.root_node);
        if (s.infected_node) state.infected = String(s.infected_node);

        // 2. Conocimiento (KNOWLEDGE_UPDATE) - PRIORIDAD CRÍTICA
        if (s.type === 'KNOWLEDGE_UPDATE' && s.updated_nodes) {
            // Soportar Array [{id:1, value:1}] y Mapa {"1": 1}
            if (Array.isArray(s.updated_nodes)) {
                s.updated_nodes.forEach(k => {
                    const kId = String(k.id);
                    if (k.value === 1) state.knownNodes.add(kId);
                    else if (k.value === 0) state.knownNodes.delete(kId);
                });
            } else if (typeof s.updated_nodes === 'object') {
                Object.entries(s.updated_nodes).forEach(([kId, kVal]) => {
                    if (kVal === 1) state.knownNodes.add(String(kId));
                    else state.knownNodes.delete(String(kId));
                });
            }
        }

        // 3. Caminos (PATH_CREATION)
        // "Camino dado desde el último nodo hasta la raíz" -> Lista de Nodos
        if (s.type === 'PATH_CREATION' && s.path && Array.isArray(s.path)) {
            const pNodes = s.path.map(String);
            
            // Marcar nodos del camino
            pNodes.forEach(id => state.pathNodes.add(id));

            // Marcar aristas entre nodos consecutivos
            for (let k = 0; k < pNodes.length - 1; k++) {
                const u = pNodes[k];
                const v = pNodes[k+1];
                const key = [u, v].sort().join('-'); // Normalizar para buscar en mapEdges
                state.pathEdges.add(key);
            }
        }
    }

    // 4. Transitorios (Solo paso actual) - DAG
    if (currentStep.type === 'DAG_CREATION' && currentStep.edges) {
        currentStep.edges.forEach(e => {
            state.transientEdges.add([String(e.source), String(e.target)].sort().join('-'));
        });
    }

    // --- APLICACIÓN DE ESTILOS ---

    // A. ARISTAS
    Object.keys(mapEdges).forEach(key => {
        const poly = mapEdges[key];
        let style = STYLES.edge.default;
        let toFront = false;

        if (state.pathEdges.has(key)) {
            style = STYLES.edge.highlight; // Rojo Fijo (Camino)
            toFront = true;
        } else if (state.transientEdges.has(key)) {
            style = STYLES.edge.transient; // Rojo Flash (DAG actual)
            toFront = true;
        }

        poly.setStyle(style);
        if (toFront) poly.bringToFront();
    });

    // B. NODOS (Con jerarquía de prioridades corregida)
    Object.keys(mapNodes).forEach(id => {
        const circle = mapNodes[id];
        let style = STYLES.node.default;
        let toFront = false;

        // JERARQUÍA DE COLORES (El último `if` que se cumpla gana, o usamos `else if` ordenado)
        // Usaremos orden de "Importancia Visual Descendente" para salir rápido.

        // 1. Infectado (Negro) - GANA SIEMPRE
        if (id === state.infected) {
            circle.setStyle(STYLES.node.infected);
            circle.bringToFront();
            return;
        }

        // 2. WTP (Azul) - GANA SIEMPRE
        if (id === state.wtp) {
            circle.setStyle(STYLES.node.wtp);
            circle.bringToFront();
            return;
        }

        // 3. Selección Heurística (Naranja Flash) - Solo paso actual
        if (currentStep.type === 'HEURISTIC_SELECTION' && 
            currentStep.selected_nodes && 
            currentStep.selected_nodes.map(String).includes(id)) {
            circle.setStyle(STYLES.node.selected);
            circle.bringToFront();
            return;
        }

        // 4. Nodo de Camino (Rojo) - Gana a Conocimiento y Default
        if (state.pathNodes.has(id)) {
            circle.setStyle(STYLES.node.path);
            circle.bringToFront();
            return;
        }

        // 5. Conocimiento (Verde) - Gana a Default
        // IMPORTANTE: "Los nodos marcados con 1 deben quedar verdes"
        if (state.knownNodes.has(id)) {
            circle.setStyle(STYLES.node.known);
            return;
        }

        // 6. Default
        circle.setStyle(STYLES.node.default);
    });
}

// --- HELPERS ---
function updateUI(index, step) {
    const slider = document.getElementById('sim-slider');
    const ind = document.getElementById('step-indicator');
    const box = document.getElementById('step-description');
    
    if(slider) slider.value = index;
    if(ind) ind.innerText = `Paso: ${index} / ${simulationSteps.length - 1}`;
    
    let desc = `<strong>${step.type || 'Evento'}</strong><br>`;
    if (step.description) desc += `<small>${step.description}</small>`;
    if(box) box.innerHTML = desc;
}

// --- CONTROLES ---
function setupControls() {
    document.getElementById('btn-prev')?.addEventListener('click', () => { pause(); updateVisualization(Math.max(0, currentStepIndex - 1)); });
    document.getElementById('btn-next')?.addEventListener('click', () => { pause(); updateVisualization(Math.min(simulationSteps.length - 1, currentStepIndex + 1)); });
    document.getElementById('btn-play')?.addEventListener('click', togglePlay);
    
    const s = document.getElementById('sim-slider');
    if(s) s.addEventListener('input', (e) => { pause(); updateVisualization(parseInt(e.target.value)); });
}

function setupNavigation() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    nav.addEventListener('click', async (e) => { // Async para esperar la carga de datos
        const link = e.target.closest('a.nav-link');
        if (!link) return;
        
        e.preventDefault();

        // Gestionar clases 'active' para links y vistas
        const pageId = link.dataset.page;
        if (!pageId) return;

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        const targetSection = document.getElementById(`${pageId}-view`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Lógica de inicialización y refresco para el mapa
        if (pageId === 'mapa') {
            // Si es la primera vez que se visita, inicializar mapa y datos
            if (!mapAndDataInitialized) {
                mapAndDataInitialized = true; // Marcar como inicializado para no repetir
                initMap();
                await loadSimulationData();
            }

            // Refrescar el tamaño del mapa para asegurar que se vea bien
            setTimeout(() => {
                if (mapInstance) {
                    mapInstance.invalidateSize();
                }
            }, 10);
        }
    });
}

function togglePlay() {
    const btn = document.getElementById('btn-play');
    if (isPlaying) {
        pause();
    } else {
        isPlaying = true;
        if(btn) btn.innerText = "⏸";
        playInterval = setInterval(() => {
            if (currentStepIndex < simulationSteps.length - 1) updateVisualization(currentStepIndex + 1);
            else pause();
        }, 700);
    }
}

function pause() {
    isPlaying = false;
    clearInterval(playInterval);
    const btn = document.getElementById('btn-play');
    if(btn) btn.innerText = "▶";
}