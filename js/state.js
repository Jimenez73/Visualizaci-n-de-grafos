// js/state.js
const AppState = {
    // Estado del Mapa (Leaflet)
    leaflet: {
        instance: null,
        steps: [],
        currentStep: 0,
        nodes: {},
        edges: {},
        isPlaying: false,
        timer: null
    },
    
    // Estado del Algoritmo (Vis.js + Pseudocode)
    algorithm: {
        network: null,
        dataSetNodes: null, // vis.DataSet
        dataSetEdges: null, // vis.DataSet
        domPseudocode: null, // Referencia al HTML del código
        frames: [],
        currentFrame: 0,
        isPlaying: false,
        timer: null
    }
};