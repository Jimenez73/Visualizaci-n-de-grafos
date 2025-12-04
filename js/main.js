document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupGlobalControls();
    setupInternalLinks();
    setupUncertaintyWidget();
});

function setupNavigation() {
    // 1. Manejo de Links Normales y Sub-links
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Si es el botón padre del acordeón, NO navegamos, solo abrimos/cerramos
            if (link.classList.contains('parent-toggle')) {
                e.preventDefault();
                const group = link.closest('.nav-group');
                group.classList.toggle('open');
                return; // Terminamos aquí, no cambiamos de vista
            }

            e.preventDefault();
            
            // Lógica normal de navegación
            // 1. UI Activa
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Si es un sub-link, mantén el padre abierto
            if (link.classList.contains('sub-link')) {
                 link.closest('.nav-group').classList.add('open');
            }

            // Cambiar Vista
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            const pageId = link.dataset.page;
            
            const target = document.getElementById(`${pageId}-view`);
            if (target) target.classList.add('active');

            // Lógica Específica
            if (pageId === 'mapa') {
                initLeafletMap();
                setTimeout(() => AppState.leaflet.instance?.invalidateSize(), 100);
            } 
            else if (pageId === 'algoritmo') {
                initAlgorithmView();
                initExampleView();
            }
            // Renderizar LaTeX en las nuevas vistas si es necesario
            if (pageId === 'calculo-b') {
                // Pequeño truco para asegurar que pseudocode.js renderice el bloque nuevo
                setTimeout(() => {
                    const mathBlock = document.querySelector('#calculo-b-view .pseudocode');
                    if (mathBlock && !mathBlock.dataset.rendered) {
                         pseudocode.renderElement(mathBlock, { lineNumber: false });
                         mathBlock.dataset.rendered = "true";
                    }
                }, 100);
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

    document.getElementById('ex-btn-next')?.addEventListener('click', nextExampleStep);
    document.getElementById('ex-btn-prev')?.addEventListener('click', prevExampleStep);
}

function setupInternalLinks() {
    // Buscamos todos los links internos
    const links = document.querySelectorAll('.internal-link');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.target;

            // Buscamos el enlace correspondiente en el Sidebar
            // (El selector busca un .nav-link que tenga data-page="calculo-b")
            const sidebarLink = document.querySelector(`.nav-link[data-page="${targetPage}"]`);

            if (sidebarLink) {
                // ¡SIMULAMOS EL CLIC!
                // Esto disparará toda tu lógica existente: 
                // abrirá el acordeón, cambiará la vista y cargará los scripts necesarios.
                sidebarLink.click();
            } else {
                console.warn(`No se encontró un enlace en el menú para: ${targetPage}`);
            }
        });
    });
}

// En js/main.js

function setupUncertaintyWidget() {
    const buttons = document.querySelectorAll('.u-btn');
    const images = document.querySelectorAll('.u-state-img');

    if (buttons.length === 0 || images.length === 0) return;

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const targetImg = document.getElementById(targetId);

            if (!targetImg) return;

            // 1. Resetear estado: Quitar 'active' de todos
            buttons.forEach(b => b.classList.remove('active'));
            images.forEach(img => img.classList.remove('active'));

            // 2. Activar el seleccionado
            btn.classList.add('active');
            targetImg.classList.add('active');
        });
    });
}