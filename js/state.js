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
    
    // Estado del Algoritmo (Pseudocode)
    algorithm: {
        network: null,
        dataSetNodes: null,
        dataSetEdges: null,
        domPseudocode: null, // Referencia al HTML del código
        frames: [],
        currentFrame: 0,
        isPlaying: false,
        timer: null
    }
};