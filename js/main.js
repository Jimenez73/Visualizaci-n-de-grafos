document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupGlobalControls();
});

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 1. UI Activa
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            const pageId = link.dataset.page;
            document.getElementById(`${pageId}-view`).classList.add('active');

            // 2. Lógica Específica por Pestaña
            if (pageId === 'mapa') {
                initLeafletMap();
                // Forzar repintado del mapa porque estaba oculto
                setTimeout(() => AppState.leaflet.instance?.invalidateSize(), 100);
            } 
            else if (pageId === 'algoritmo') {
                initAlgorithmView();
            }
        });
    });
}

function setupGlobalControls() {
    // 1. Controles del MAPA (Leaflet)
    // ----------------------------------------
    
    // Botón Play/Pause
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
        // Clonamos para eliminar listeners viejos y evitar duplicados
        const newBtn = btnPlay.cloneNode(true); 
        btnPlay.parentNode.replaceChild(newBtn, btnPlay);
        newBtn.addEventListener('click', toggleLeafletPlay);
    }

    // Botón Siguiente
    const btnNext = document.getElementById('btn-next');
    if (btnNext) {
        const newBtn = btnNext.cloneNode(true);
        btnNext.parentNode.replaceChild(newBtn, btnNext);
        newBtn.addEventListener('click', nextStepLeaflet); // <--- Conectado aquí
    }

    // Botón Anterior
    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) {
        const newBtn = btnPrev.cloneNode(true);
        btnPrev.parentNode.replaceChild(newBtn, btnPrev);
        newBtn.addEventListener('click', prevStepLeaflet); // <--- Conectado aquí
    }

    // Slider
    const slider = document.getElementById('sim-slider');
    if (slider) {
        const newSlider = slider.cloneNode(true);
        slider.parentNode.replaceChild(newSlider, slider);
        
        newSlider.addEventListener('input', (e) => {
            pauseLeaflet(); // Pausar al arrastrar
            updateLeafletVis(parseInt(e.target.value));
        });
    }


    // 2. Controles del ALGORITMO (Vis.js)
    // ----------------------------------------
    // (Asegúrate de tener estos botones creados en tu HTML en la sección Algoritmo)
    document.getElementById('algo-btn-next')?.addEventListener('click', () => {
        const next = AppState.algorithm.currentFrame + 1;
        updateAlgorithmVis(next);
    });
    
    document.getElementById('algo-btn-prev')?.addEventListener('click', () => {
        const prev = AppState.algorithm.currentFrame - 1;
        updateAlgorithmVis(prev);
    });
}