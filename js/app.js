// js/app.js

// 1. PUNTOS DE ENTRADA
// Esperamos a que todo el contenido del HTML esté cargado
document.addEventListener('DOMContentLoaded', () => {
    
    // Referencias a los elementos principales
    const sidebar = document.getElementById('sidebar-nav');
    const contentArea = document.getElementById('content-area');
    
    // 2. NAVEGACIÓN (ROUTER)
    // Escuchamos clics en la barra lateral
    sidebar.addEventListener('click', (e) => {
        // Prevenimos que el `href="#` recargue la página
        e.preventDefault(); 

        // Verificamos que se hizo clic en un enlace (`<a>`) que tenga `data-page`
        const navLink = e.target.closest('a.nav-link[data-page]');
        
        if (navLink) {
            const page = navLink.dataset.page;
            
            // 1. Actualizar el contenido
            navigateTo(page, contentArea);
            
            // 2. Actualizar el estilo "activo" del menú
            // Quitar 'active' de todos los enlaces
            sidebar.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            // Añadir 'active' solo al que se hizo clic
            navLink.classList.add('active');
        }
    });

    // 3. CARGA INICIAL
    // Cargamos la página de 'inicio' por defecto al entrar
    navigateTo('inicio', contentArea);
});

// Función "Router": Decide qué HTML mostrar en el área de contenido
function navigateTo(page, contentArea) {
    let htmlContent = ''; // Aquí guardaremos el HTML a inyectar

    switch (page) {
        case 'inicio':
            htmlContent = `
                <h2>🏠 Bienvenido al Explorador de Grafos</h2>
                <p>Este proyecto interactivo está diseñado para visualizar cómo funcionan los algoritmos de exploración sobre estructuras de grafos.</p>
                <p>La visualización de datos es una herramienta fundamental para entender algoritmos complejos. Un grafo que en papel parece estático y confuso, aquí cobra vida.</p>
                <p>Usa el menú de la izquierda para navegar por las diferentes secciones:</p>
                <ul>
                    <li><b>Conceptos Básicos:</b> Un repaso rápido de qué es un nodo, una arista y un grafo.</li>
                    <li><b>Algoritmo y Grafo:</b> La visualización interactiva principal.</li>
                    <li><b>Referencias:</b> El material utilizado para construir esto.</li>
                </ul>
            `;
            break;

        case 'conceptos':
            htmlContent = `
                <h2>📚 Conceptos Básicos</h2>
                <p>Antes de sumergirnos en la visualización, repasemos tres ideas clave:</p>
                <h3>Nodo (o Vértice)</h3>
                <p>Es el punto fundamental de un grafo. Piensa en él como una ciudad en un mapa, una persona en una red social, o una página web.</p>
                <h3>Arista (o Arco)</h3>
                <p>Es la conexión entre dos nodos. Representa una relación: una carretera entre ciudades, una amistad entre personas, o un enlace de una web a otra.</p>
                <h3>Grafo</h3>
                <p>Es el conjunto completo de todos los nodos y todas las aristas que los conectan. Es la "red" entera.</p>
            `;
            break;

        case 'algoritmo':
            htmlContent = `
                <h2>🔬 Algoritmo y Grafo</h2>
                <p>Aquí puedes ver el grafo en acción. Los datos se cargan desde un archivo <code>../data/grafo.json</code>. ¡Intenta arrastrar los nodos!</p>
                
                <!-- Este es el contenedor vital para vis.js -->
                <div id="miGrafo"></div>
            `;
            break;

        case 'referencias':
            htmlContent = `
                <h2>🔗 Referencias y Bibliografía</h2>
                <p>Este proyecto fue posible gracias a las siguientes herramientas y recursos:</p>
                <ul>
                    <li><b>vis.js Network:</b> La librería de JavaScript usada para la visualización interactiva del grafo.</li>
                    <li><b>NetworkX:</b> (La que planeamos usar en Python) Para la generación y análisis de grafos en el backend.</li>
                    <li><b>Libros:</b> "Introduction to Algorithms" (CLRS) para la base teórica de los algoritmos de grafos.</li>
                </ul>
            `;
            break;

        default:
            htmlContent = `<h2>Error 404: Página no encontrada</h2>`;
    }

    // 4. INYECCIÓN DE CONTENIDO
    // Inyectamos el HTML en el área de contenido
    contentArea.innerHTML = htmlContent;

    // 5. POST-CARGA (MUY IMPORTANTE)
    // Si la página que cargamos es la del algoritmo,
    // ¡necesitamos INICIAR el grafo después de que el HTML exista!
    if (page === 'algoritmo') {
        iniciarGrafo(); // Llamamos a la función que dibuja el grafo
    }
}


// Función para cargar y dibujar el grafo (la misma de antes)
async function iniciarGrafo() {
    try {
        // 1. Cargar los datos del grafo
        const response = await fetch('../data/grafo.json');
        if (!response.ok) {
            throw new Error(`Error al cargar el JSON: ${response.statusText}`);
        }
        const datosGrafo = await response.json();

        // 2. Crear los DataSets de vis.js
        const nodes = new vis.DataSet(datosGrafo.nodes);
        const edges = new vis.DataSet(datosGrafo.edges);

        // 3. Encontrar el contenedor (¡que 'navigateTo' acaba de crear!)
        const container = document.getElementById('miGrafo');
        
        // Si el contenedor no existe por algún motivo, no continuamos.
        if (!container) {
            console.error('Error: No se encontró el contenedor #miGrafo.');
            return;
        }

        // 4. Combinar datos y opciones
        const data = { nodes: nodes, edges: edges };
        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: { size: 14, color: '#18181b' },
                borderWidth: 2,
                color: {
                    border: '#a1a1aa',
                    background: '#f4f4f5',
                    highlight: { border: '#27272a', background: '#d4d4d8' }
                }
            },
            edges: {
                width: 2,
                color: { color: '#a1a1aa', highlight: '#27272a' }
            },
            physics: {
                enabled: true,
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -10000,
                    springConstant: 0.04,
                    springLength: 95
                }
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true
            }
        };

        // 5. ¡Crear y dibujar la red!
        const network = new vis.Network(container, data, options);

    } catch (error) {
        console.error('No se pudo iniciar el grafo:', error);
        const container = document.getElementById('miGrafo');
        if (container) {
            container.innerHTML = `<p style="color: red; text-align: center;">Error: No se pudieron cargar los datos del grafo.</p>`;
        }
    }
}