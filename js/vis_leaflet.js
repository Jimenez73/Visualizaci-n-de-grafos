// js/vis_leaflet.js

// --- ESTILOS ---
const LEAFLET_STYLES = {
    node: {
        default:   { color: '#64748b', fillColor: '#64748b', fillOpacity: 0.7, radius: 5, weight: 1 },
        wtp:       { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1.0, radius: 10, weight: 3 },
        infected:  { color: '#09090b', fillColor: '#09090b', fillOpacity: 1.0, radius: 10, weight: 3 },
        known:     { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9, radius: 8, weight: 2 },
        path:      { color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 0.9, radius: 6, weight: 1 },
        selected:  { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, radius: 9, weight: 2 }
    },
    edge: {
        default:   { color: '#94a3b8', weight: 2, opacity: 0.3 },
        highlight: { color: '#dc2626', weight: 4, opacity: 1.0 },
        transient: { color: '#ef4444', weight: 5, opacity: 1.0 }
    }
};

// --- INICIALIZACIÓN ---
function initLeafletMap() {
    if (AppState.leaflet.instance) return; // Ya existe

    AppState.leaflet.instance = L.map('map-container').setView([-36.82, -73.05], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(AppState.leaflet.instance);
    
    loadLeafletData();
}

async function loadLeafletData() {
    try {
        // CORRECCIÓN 1: La ruta es relativa al index.html, no a la carpeta js
        const res = await fetch('data/simulation_data.json'); 
        
        if (!res.ok) throw new Error("No se pudo cargar el JSON");
        
        AppState.leaflet.steps = await res.json();
        
        // Configurar Slider
        const slider = document.getElementById('sim-slider');
        if (slider) {
            slider.max = AppState.leaflet.steps.length - 1;
            slider.disabled = false;
        }

        // Dibujar grafo inicial
        const setupStep = AppState.leaflet.steps.find(s => s.nodes && s.nodes.length > 0) || AppState.leaflet.steps[0];
        if (setupStep) drawLeafletBase(setupStep);

        // Renderizar paso 0
        updateLeafletVis(0);
        
    } catch (e) { 
        console.error("Error cargando datos mapa:", e); 
        document.getElementById('step-description').innerHTML = `<span style="color:red">Error cargando datos.</span>`;
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

    // A. Aristas (Base)
    edges.forEach(e => {
        const sId = String(e.source);
        const tId = String(e.target);
        const nodeS = nodes.find(n => String(n.id) === sId);
        const nodeT = nodes.find(n => String(n.id) === tId);

        if (nodeS && nodeT) {
            const poly = L.polyline([[nodeS.lat, nodeS.lon], [nodeT.lat, nodeT.lon]], LEAFLET_STYLES.edge.default)
                          .addTo(map);
            const key = [sId, tId].sort().join('-');
            AppState.leaflet.edges[key] = poly;
        }
    });

    // B. Nodos (Encima)
    nodes.forEach(n => {
        const nId = String(n.id);
        const circle = L.circleMarker([n.lat, n.lon], LEAFLET_STYLES.node.default).addTo(map);
        circle.bindPopup(`<b>ID:</b> ${nId}`);
        AppState.leaflet.nodes[nId] = circle;
    });

    // Zoom automático
    if (nodes.length > 0) {
        const group = new L.featureGroup(Object.values(AppState.leaflet.nodes));
        const bounds = group.getBounds();
        AppState.leaflet.instance.fitBounds(bounds, { padding: [50, 50] });

        // Después de ajustar, define el zoom mínimo para que el usuario no se aleje demasiado.
        // Se permite un nivel de zoom-out respecto a la vista que encuadra todos los nodos.
        const fitZoom = AppState.leaflet.instance.getZoom();
        AppState.leaflet.instance.setMinZoom(fitZoom > 1 ? fitZoom - 1 : 0);

        // Limita el área de paneo a los nodos con un poco de margen.
        AppState.leaflet.instance.setMaxBounds(bounds.pad(0.1));
    }
}

// --- ACTUALIZACIÓN VISUAL ---
function updateLeafletVis(index) {
    if (!AppState.leaflet.steps.length) return;
    
    // Validar límites
    if (index < 0) index = 0;
    if (index >= AppState.leaflet.steps.length) index = AppState.leaflet.steps.length - 1;

    AppState.leaflet.currentStep = index;
    const currentStep = AppState.leaflet.steps[index];
    
    // 1. UI Updates (Slider, Texto, Botones)
    const slider = document.getElementById('sim-slider');
    const indicator = document.getElementById('step-indicator');
    const descBox = document.getElementById('step-description');

    if (slider) slider.value = index;
    if (indicator) indicator.innerText = `Paso: ${index} / ${AppState.leaflet.steps.length - 1}`;
    
    // CORRECCIÓN 2: Restaurar la descripción del paso
    if (descBox) {
        let descHtml = `<strong>${currentStep.type || 'Evento'}</strong><br>`;
        if (currentStep.description) descHtml += `<small>${currentStep.description}</small>`;
        descBox.innerHTML = descHtml;
    }

    // 2. Cálculo de Estado (Tu lógica está perfecta aquí, la mantengo igual)
    let state = {
        wtp: null, infected: null, knownNodes: new Set(),
        pathNodes: new Set(), pathEdges: new Set(), transientEdges: new Set()
    };

    for (let i = 0; i <= index; i++) {
        const s = AppState.leaflet.steps[i];
        if (s.wtp_node) state.wtp = String(s.wtp_node);
        if (s.root_node) state.wtp = String(s.root_node);
        if (s.infected_node) state.infected = String(s.infected_node);

        if (s.type === 'KNOWLEDGE_UPDATE' && s.updated_nodes) {
            if (Array.isArray(s.updated_nodes)) {
                s.updated_nodes.forEach(k => k.value === 1 ? state.knownNodes.add(String(k.id)) : state.knownNodes.delete(String(k.id)));
            } else if (typeof s.updated_nodes === 'object') {
                Object.entries(s.updated_nodes).forEach(([k, v]) => v === 1 ? state.knownNodes.add(String(k)) : state.knownNodes.delete(String(k)));
            }
        }

        if (s.type === 'PATH_CREATION' && s.path && Array.isArray(s.path)) {
            const pNodes = s.path.map(String);
            pNodes.forEach(id => state.pathNodes.add(id));
            for (let k = 0; k < pNodes.length - 1; k++) {
                state.pathEdges.add([pNodes[k], pNodes[k+1]].sort().join('-'));
            }
        }
    }

    if (currentStep.type === 'DAG_CREATION' && currentStep.edges) {
        currentStep.edges.forEach(e => state.transientEdges.add([String(e.source), String(e.target)].sort().join('-')));
    }

    // 3. Aplicar Estilos
    Object.keys(AppState.leaflet.edges).forEach(key => {
        const poly = AppState.leaflet.edges[key];
        let style = LEAFLET_STYLES.edge.default;
        let toFront = false;
        if (state.pathEdges.has(key)) { style = LEAFLET_STYLES.edge.highlight; toFront = true; }
        else if (state.transientEdges.has(key)) { style = LEAFLET_STYLES.edge.transient; toFront = true; }
        poly.setStyle(style);
        if (toFront) poly.bringToFront();
    });

    Object.keys(AppState.leaflet.nodes).forEach(id => {
        const circle = AppState.leaflet.nodes[id];
        let style = LEAFLET_STYLES.node.default;
        
        if (id === state.infected) { circle.setStyle(LEAFLET_STYLES.node.infected); circle.bringToFront(); return; }
        if (id === state.wtp) { circle.setStyle(LEAFLET_STYLES.node.wtp); circle.bringToFront(); return; }
        
        if (currentStep.type === 'HEURISTIC_SELECTION' && currentStep.selected_nodes?.map(String).includes(id)) {
            circle.setStyle(LEAFLET_STYLES.node.selected); circle.bringToFront(); return;
        }
        
        if (state.pathNodes.has(id)) { circle.setStyle(LEAFLET_STYLES.node.path); circle.bringToFront(); return; }
        if (state.knownNodes.has(id)) { circle.setStyle(LEAFLET_STYLES.node.known); return; }
        
        circle.setStyle(LEAFLET_STYLES.node.default);
    });
}

// CONTROLES

// Play
function toggleLeafletPlay() {
    const btn = document.getElementById('btn-play');
    
    if (AppState.leaflet.isPlaying) {
        pauseLeaflet();
    } else {
        AppState.leaflet.isPlaying = true;
        if(btn) btn.innerText = "⏸"; // Icono de pausa
        
        AppState.leaflet.timer = setInterval(() => {
            const nextIndex = AppState.leaflet.currentStep + 1;
            if (nextIndex < AppState.leaflet.steps.length) {
                updateLeafletVis(nextIndex);
            } else {
                pauseLeaflet(); // Fin de la simulación
            }
        }, 700); // Velocidad: 700ms
    }
}

// Pausar
function pauseLeaflet() {
    AppState.leaflet.isPlaying = false;
    if (AppState.leaflet.timer) clearInterval(AppState.leaflet.timer);
    const btn = document.getElementById('btn-play');
    if(btn) btn.innerText = "▶ Reproducir";
}

// Siguiente
function nextStepLeaflet() {
    pauseLeaflet(); // Siempre pausar al intervenir manualmente
    
    const steps = AppState.leaflet.steps;
    const current = AppState.leaflet.currentStep;
    
    // Solo avanzamos si no estamos en el final
    if (current < steps.length - 1) {
        updateLeafletVis(current + 1);
    }
}
// Anterior
function prevStepLeaflet() {
    pauseLeaflet(); // Siempre pausar al intervenir manualmente
    
    const current = AppState.leaflet.currentStep;
    
    // Solo retrocedemos si no estamos en el principio
    if (current > 0) {
        updateLeafletVis(current - 1);
    }
}