# Visualización de búsqueda en redes con incertidumbre

Visualización para algoritmos de detección de brotes de infecciones en redes de alcantarillado usando grafos dirigidos.

Basado en el paper: [Identifying outbreaks in sewer networks: An adaptive sampling scheme under network’s uncertainty](https://www.pnas.org/doi/full/10.1073/pnas.2316616121)

Ver la visualización en: [Búsqueda en redes](https://jimenez73.github.io/Visualizaci-n-de-grafos/)

---

## Estructura del proyecto 🗂️

`Visualización`\
├── `assets`/\
│   └── Imágenes varias\
│\
├── `data`/\
│   ├── `example_graph.json` &rarr; Simulación conceptual\
│   ├── `pseudocode_graph.json` &rarr; Simulación en el pseudocódigo\
│   └── `simulation_data.json` &rarr; Simulación en el mapa\
│\
├── `js`/\
│   ├── `main.js`\
│   ├── `state.js` &rarr; Estados globales\
│   ├── `vis_algorithm.js` &rarr; Lógica para visualizar el pseudocódigo\
│   ├── `vis_example.js` &rarr; Lógica para el ejemplo conceptual\
│   └── `vis_leaflet.js` &rarr; Lógica para el mapa\
│\
├── `tools`/\
│   ├── `corrected_dijkstra.csv` &rarr; Datos corregidos de la red SPPD\
│   ├── `generador_visualizacion.py` &rarr; Script para generar `simulation_data.json`\
│   └── `graph_geom_corrected_cycles.csv` &rarr; Datos crudos de la red SPPD\
│\
├── `index.html` &rarr; Página web\
├── `README.md`\
└── `style.css` &rarr; Estilo para la página

---

## Errores/problemas conocidos ⚠️

- Visualización en el mapa
    - No se descartan bien secciones del mapa
    - La visual de las muestras hechas se pierden al avanzar en la visualización
    - Se guardan más variables en el JSON pero luego no se usan (Me olvidé)