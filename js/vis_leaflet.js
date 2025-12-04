// js/vis_leaflet.js

// --- CONFIGURACIÓN ---
const ZOOM_UMBRAL = 16; // Nivel de zoom donde aparecen los nodos de fondo
const RADIO_IMPORTANTE = 5; // Tamaño fijo para WTP, Infectado, Seleccionados
const RADIO_FONDO = 5;      // Tamaño fijo para el resto

// --- ESTILOS BASE ---
const LEAFLET_STYLES = {
    node: {
        // ... (tus estilos de nodos se mantienen igual) ...
        default:   { color: '#64748b', fillColor: '#64748b', fillOpacity: 0.7, weight: 1 },
        wtp:       { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1.0, weight: 2 },
        infected:  { color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1.0, weight: 2 },
        known:     { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9, weight: 2 },
        path:      { color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 0.9, weight: 1 },
        selected:  { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1.0, weight: 2 },
        discarded: { color: '#e2e8f0', fillColor: '#f1f5f9', fillOpacity: 0.3, weight: 0 }
    },
    edge: {
        default:   { color: '#334155', weight: 2, opacity: 1.0 }, 
        highlight: { color: '#dc2626', weight: 4, opacity: 1.0 },
        discarded: { color: '#cbd5e1', weight: 1, opacity: 0.15 } 
    }
};

// --- INICIALIZACIÓN ---
function initLeafletMap() {
    if (AppState.leaflet.instance) return;

    // Vista inicial centrada en Concepción
    AppState.leaflet.instance = L.map('map-container').setView([-36.82, -73.05], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(AppState.leaflet.instance);
    
    // LISTENER DE ZOOM: Recalcula visibilidad al acercar/alejar
    AppState.leaflet.instance.on('zoomend', () => {
        refrescarEstilosNodos();
    });

    loadLeafletData();
}

async function loadLeafletData() {
    try {
        // Truco del timestamp para evitar caché
        const res = await fetch(`data/simulation_data.json?t=${new Date().getTime()}`);
        if (!res.ok) throw new Error("No se pudo cargar el JSON");
        
        AppState.leaflet.steps = await res.json();
        
        const slider = document.getElementById('sim-slider');
        if (slider) {
            slider.max = AppState.leaflet.steps.length - 1;
            slider.disabled = false;
        }

        // Cargar Grafo Base
        const setupStep = AppState.leaflet.steps.find(s => s.nodes && s.nodes.length > 0) || AppState.leaflet.steps[0];
        if (setupStep) drawLeafletBase(setupStep);

        // Renderizar paso 0
        updateLeafletVis(0);
        
    } catch (e) { 
        console.error("Error cargando datos mapa:", e); 
        const descBox = document.getElementById('step-description');
        if (descBox) descBox.innerHTML = `<span style="color:red">Error cargando datos.</span>`;
    }
}

function drawLeafletBase(stepData) {
    const map = AppState.leaflet.instance;

    // Limpiar capas previas
    Object.values(AppState.leaflet.nodes).forEach(l => map.removeLayer(l));
    Object.values(AppState.leaflet.edges).forEach(l => map.removeLayer(l));
    AppState.leaflet.nodes = {};
    AppState.leaflet.edges = {};

    const nodes = stepData.nodes || [];
    const edges = stepData.edges || [];

    // 1. Aristas
    edges.forEach(e => {
        const sId = String(e.source);
        const tId = String(e.target);
        
        // --- AQUÍ ESTÁ EL CAMBIO ---
        // Verificamos si el JSON trajo la geometría detallada
        let pathCoordinates = [];

        if (e.geometry && e.geometry.length > 0) {
            // ¡Usamos la forma real de la tubería!
            pathCoordinates = e.geometry; 
        } else {
            // Fallback: Línea recta si no hay datos (por si acaso)
            const nodeS = nodes.find(n => String(n.id) === sId);
            const nodeT = nodes.find(n => String(n.id) === tId);
            if (nodeS && nodeT) {
                pathCoordinates = [[nodeS.lat, nodeS.lon], [nodeT.lat, nodeT.lon]];
            }
        }

        // Si tenemos coordenadas válidas, dibujamos
        if (pathCoordinates.length > 0) {
            const poly = L.polyline(pathCoordinates, LEAFLET_STYLES.edge.default).addTo(map);
            const key = [sId, tId].sort().join('-');
            AppState.leaflet.edges[key] = poly;
        }
    });

    // 2. Nodos
    // Los creamos todos, pero su visibilidad se controlará dinámicamente
    nodes.forEach(n => {
        const nId = String(n.id);
        // Creamos con estilo default, luego 'refrescarEstilosNodos' lo arreglará
        const circle = L.circleMarker([n.lat, n.lon], LEAFLET_STYLES.node.default).addTo(map);
        circle.bindPopup(`<b>ID:</b> ${nId}`);
        AppState.leaflet.nodes[nId] = circle;
    });

    if (nodes.length > 0) {
        const group = new L.featureGroup(Object.values(AppState.leaflet.nodes));
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

// --- CORE VISUAL ---

function updateLeafletVis(index) {
    if (!AppState.leaflet.steps.length) return;
    
    if (index < 0) index = 0;
    if (index >= AppState.leaflet.steps.length) index = AppState.leaflet.steps.length - 1;

    AppState.leaflet.currentStep = index;
    const currentStep = AppState.leaflet.steps[index];
    
    // UI Updates
    const slider = document.getElementById('sim-slider');
    const indicator = document.getElementById('step-indicator');
    const descBox = document.getElementById('step-description');

    if (slider) slider.value = index;
    if (indicator) indicator.innerText = `Paso: ${index} / ${AppState.leaflet.steps.length - 1}`;
    if (descBox) {
        let descHtml = `<strong>${currentStep.type || 'Evento'}</strong><br>`;
        if (currentStep.description) descHtml += `<small>${currentStep.description}</small>`;
        descBox.innerHTML = descHtml;
    }

    // --- CÁLCULO DE ESTADO ---
    // Recorremos la historia para saber el rol de cada nodo
    let state = {
        wtp: null, 
        infected: null, 
        knownNodes: new Set(),
        pathNodes: new Set(), 
        pathEdges: new Set(), 
        transientEdges: new Set(),
        discardedNodes: new Set()
    };

    for (let i = 0; i <= index; i++) {
        const s = AppState.leaflet.steps[i];
        if (s.wtp_node) state.wtp = String(s.wtp_node);
        if (s.root_node) state.wtp = String(s.root_node); // Compatibilidad
        if (s.infected_node) state.infected = String(s.infected_node);

        if (s.type === 'KNOWLEDGE_UPDATE' && s.updated_nodes) {
            s.updated_nodes.forEach(k => k.value === 1 ? state.knownNodes.add(String(k.id)) : state.knownNodes.delete(String(k.id)));
        }

        if (s.discarded_nodes) {
            s.discarded_nodes.forEach(id => state.discardedNodes.add(String(id)));
        }

        if (s.type === 'PATH_CREATION' && s.path) {
            const pNodes = s.path.map(String);
            pNodes.forEach(id => state.pathNodes.add(id));
            for (let k = 0; k < pNodes.length - 1; k++) {
                state.pathEdges.add([pNodes[k], pNodes[k+1]].sort().join('-'));
            }
        }
    }

    // Guardamos el estado calculado en AppState para que el evento zoom lo pueda usar
    AppState.leaflet.computedState = state; 
    AppState.leaflet.currentStepData = currentStep; // Para saber qué se selecciona en este paso

    // Aplicar estilos a Aristas (No cambian con zoom)
    Object.keys(AppState.leaflet.edges).forEach(key => {
        const poly = AppState.leaflet.edges[key];
        
        // Recuperamos los IDs de los nodos que conecta esta línea
        // La clave se formó así: [idA, idB].sort().join('-')
        const parts = key.split('-');
        const idA = parts[0];
        const idB = parts[1];

        let style = LEAFLET_STYLES.edge.default;
        let toFront = false;
        let toBack = false;

        // 1. Prioridad Máxima: Es parte del camino final
        if (state.pathEdges.has(key)) {
            style = LEAFLET_STYLES.edge.highlight;
            toFront = true;
        }
        // 2. Prioridad Baja: ¿Está descartada?
        // Si CUALQUIERA de los dos extremos ha sido descartado, la tubería ya no sirve.
        else if (state.discardedNodes.has(idA) || state.discardedNodes.has(idB)) {
            style = LEAFLET_STYLES.edge.discarded;
            toBack = true;
        }
        
        // Aplicamos el estilo
        poly.setStyle(style);

        // Ordenamos capas para que lo rojo quede arriba de lo gris
        if (toFront) poly.bringToFront();
        if (toBack) poly.bringToBack();
    });

    // Aplicar estilos a Nodos (Esto llama a la función inteligente)
    refrescarEstilosNodos();
}

// --- FUNCIÓN INTELIGENTE DE VISIBILIDAD Y ESTILO ---
function refrescarEstilosNodos() {
    const map = AppState.leaflet.instance;
    if (!map || !AppState.leaflet.computedState) return;

    const zoom = map.getZoom();
    const state = AppState.leaflet.computedState;
    const currentStep = AppState.leaflet.currentStepData;
    
    // ¿Debe mostrarse el fondo?
    const mostrarFondo = zoom >= ZOOM_UMBRAL;

    Object.keys(AppState.leaflet.nodes).forEach(id => {
        const circle = AppState.leaflet.nodes[id];
        
        // 1. Determinar ROL y ESTILO BASE
        let style = LEAFLET_STYLES.node.default;
        let esImportante = false; // Si es true, se muestra SIEMPRE

        // Infectado y WTP (Máxima prioridad)
        if (id === state.infected) { style = LEAFLET_STYLES.node.infected; esImportante = true; }
        else if (id === state.wtp) { style = LEAFLET_STYLES.node.wtp; esImportante = true; }
        // Selección actual
        else if (currentStep && currentStep.type === 'HEURISTIC_SELECTION' && currentStep.selected_nodes?.map(String).includes(id)) {
            style = LEAFLET_STYLES.node.selected; esImportante = true;
        }
        // Camino Final
        else if (state.pathNodes.has(id)) { style = LEAFLET_STYLES.node.path; esImportante = true; }
        // Nodos con Conocimiento (Verdes)
        else if (state.knownNodes.has(id)) { style = LEAFLET_STYLES.node.known; esImportante = true; }
        // Descartados
        else if (state.discardedNodes.has(id)) { style = LEAFLET_STYLES.node.discarded; }

        // 2. Determinar VISIBILIDAD y TAMAÑO FINAL
        let opacity = 0;
        let radius = RADIO_FONDO;

        if (esImportante) {
            // Nodos clave: Siempre visibles, grandes
            opacity = 1; 
            radius = RADIO_IMPORTANTE;
        } else {
            // Nodos de fondo (incluidos descartados): Solo visibles si hay zoom
            if (mostrarFondo) {
                opacity = style.fillOpacity || 0.5; // Usar opacidad del estilo (baja para descartados)
                radius = RADIO_FONDO;
            } else {
                opacity = 0; // Totalmente invisibles de lejos
            }
        }

        // 3. Aplicar al Leaflet
        // Usamos setStyle para color y setRadius para tamaño
        circle.setStyle({
            color: style.color,
            fillColor: style.fillColor,
            fillOpacity: opacity === 0 ? 0 : style.fillOpacity, // Si opacity es 0, ocultamos relleno
            opacity: opacity === 0 ? 0 : 1, // Borde
            weight: style.weight
        });
        
        circle.setRadius(radius);

        // Z-Index: Importantes al frente
        if (esImportante) circle.bringToFront();
        else circle.bringToBack();
    });
}

// --- CONTROLES (Iguales que antes) ---
function toggleLeafletPlay() {
    const btn = document.getElementById('btn-play');
    if (AppState.leaflet.isPlaying) {
        pauseLeaflet();
    } else {
        AppState.leaflet.isPlaying = true;
        if(btn) btn.innerText = "⏸";
        AppState.leaflet.timer = setInterval(() => {
            const nextIndex = AppState.leaflet.currentStep + 1;
            if (nextIndex < AppState.leaflet.steps.length) updateLeafletVis(nextIndex);
            else pauseLeaflet();
        }, 700);
    }
}

function pauseLeaflet() {
    AppState.leaflet.isPlaying = false;
    if (AppState.leaflet.timer) clearInterval(AppState.leaflet.timer);
    const btn = document.getElementById('btn-play');
    if(btn) btn.innerText = "▶ Reproducir";
}

function nextStepLeaflet() {
    pauseLeaflet();
    const current = AppState.leaflet.currentStep;
    if (current < AppState.leaflet.steps.length - 1) updateLeafletVis(current + 1);
}

function prevStepLeaflet() {
    pauseLeaflet();
    const current = AppState.leaflet.currentStep;
    if (current > 0) updateLeafletVis(current - 1);
}