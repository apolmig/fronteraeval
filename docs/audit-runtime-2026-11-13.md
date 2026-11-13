# Auditoría de runtime, 13 de noviembre de 2026

## Alcance y versiones

Se probó el árbol de trabajo de recuperación basado en `8317605c63f4cf7e0870a00a5bbaf36741f0aa1c`, con los cambios locales que acompañan esta nota. No se presenta ese commit base como si ya contuviera las correcciones. La aceptación sobre un commit integrado y su Deploy Preview debe registrarse por separado.

Entorno de esta ejecución: Node.js `v24.22.1`, Playwright `1.62.1`, Chromium `156.0.8078.79` de Debian 13, sin emulación de CPU ni red lenta. Las verificaciones del build con Node 22 pertenecen a la auditoría de integración. El servidor local fue `python3 -m http.server 8765 --directory /workspace/fronteraeval/site`.

La ejecución final usó el catálogo generado localmente: 333 registros, 27 revisiones vigentes y 3 pendientes de reevaluación. Antes del build se utilizó explícitamente un fixture descargado de producción con 330 registros, sin escribirlo en el repositorio; ese resultado preliminar no sustituye la comprobación final.

## Fallos reproducidos y correcciones

- Una respuesta tardía de `/api/weekly-status` con entradas nuevas reconstruía la pantalla y convertía la consulta `harmful manipulation` en una cadena vacía; el foco pasaba a `#main`. El refresco ahora conserva los controles, la selección y el foco.
- Escape en el input de búsqueda de Chromium podía ser consumido por el control nativo sin cerrar el diálogo. El manejador explícito cierra la paleta y devuelve el foco.
- About conservaba un `MutationObserver`. Ahora responde al mismo evento de render que los demás módulos.
- Dos renders esperando la promesa del catálogo podían insertar la misma revisión. Se vuelve a comprobar la existencia del bloque después del `await`.
- Un hash con un identificador mal codificado, `#/eval/%`, podía lanzar excepciones en distintos módulos. Ahora presenta Not found y permite continuar navegando.
- Las revisiones `needs-reevaluation` muestran fecha histórica y motivos del cambio, sin presentar sus conclusiones antiguas como vigentes.
- La búsqueda repetía comparaciones entre los mismos tokens y calculaba dos veces los campos de cada registro. Una caché limitada a cada búsqueda y el cálculo único conservan los resultados sin mantener un índice persistente susceptible de quedar obsoleto.

También se normalizan páginas no enteras o inválidas y se permite cambiar el tema aunque el almacenamiento local no esté disponible. Estas dos defensas se inspeccionaron en código; no se atribuye a ambas una prueba específica de navegador.

## Comandos ejecutados y resultados

```bash
node --test scripts/test-runtime-recovery.mjs
node scripts/test-ui-controls.mjs
node scripts/test-search.mjs
npm run check:brief
PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node scripts/test-browser-runtime.mjs
```

Resultados: runtime 3/3, controles UI y regresiones de búsqueda correctos, Brief 30/30 tras la corrección de captura de revisiones pendientes. El test de navegador usa por defecto `http://127.0.0.1:8765`; se puede indicar otro servidor mediante `QA_BASE_URL`. `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` describen el entorno utilizado, no dependencias nuevas del producto.

La prueba de navegador completó escritorio 1440×1000 y móvil 390×844:

- Una sola petición compartida al catálogo en la carga inicial.
- Hidratación tardía con una entrada de prueba sin borrar consulta ni robar foco.
- Búsquedas, fuentes visibles, filtros, paginación y enriquecimiento de filas.
- Ctrl K y Cmd K, flechas, Enter, Escape y retorno del foco.
- Una sola revisión y un solo bloque de procedencia tras 100 notificaciones de render.
- Copia del enlace igual a la URL canónica declarada.
- About, ausencia de Collections en navegación y persistencia del tema tras recargar.
- Hash malformado, aviso de revisión pendiente y ausencia de conclusiones históricas en ese aviso.
- Brief: ejemplo, guardado, exportación JSON y restauración tras recargar.
- Ningún error de página ni de consola; ningún desbordamiento horizontal en About y Brief.

Resultados de búsqueda final: `harmful manipulation` 52; `autonomous R&D` 77; `jailbreak robustness` 91; `scheming` 55; errata `persuassion` 5. Son coincidencias del catálogo, no una evaluación de pertinencia exhaustiva.

## Rendimiento medido y límites

Antes de optimizar la búsqueda, la misma secuencia de navegador registró tareas largas de hasta 546 ms en escritorio y 531 ms en móvil. Después, el máximo de la ejecución final fue 206 ms y 183 ms, respectivamente. El observador de tareas largas registra tareas de al menos 50 ms; no es una medida de INP ni un informe Lighthouse, y sigue habiendo trabajo síncrono perceptible.

Una comparación aislada de 17 consultas sobre los mismos 333 registros ejecutó ambos motores en contextos VM separados y comparó el JSON completo: IDs, orden, puntuaciones, explicaciones e interpretación fueron idénticos. Tiempo agregado: 7888.6 ms antes y 2898.0 ms después. Las consultas incluyeron las cinco requeridas, APE, model beliefs, biosecurity, WMDP, AI agents, una consulta sin coincidencias, MASK, Make Me Pay, SAD Influence, math, reasoning y paperbench. El motor anterior se conservó temporalmente en `/tmp/frontera-search-before.js`; el original también puede recuperarse del commit base.

En la ficha, tras estabilizarse el render, se observaron cero mutaciones DOM durante 500 ms en escritorio y 501 ms en móvil. Esto aporta evidencia contra el bucle anterior, sin demostrar ausencia de todos los problemas de rendimiento.

## Evidencia y límites de despliegue

Resultados JSON y diez capturas locales: `/tmp/frontera-runtime-qa/`. Dos capturas representativas se conservaron fuera del repositorio:

- `/workspace/audit-evidence/runtime-desktop-detail.png`
- `/workspace/audit-evidence/runtime-mobile-pending-review.png`

Se inspeccionaron visualmente las capturas móviles de Home y Brief. Las capturas no se versionan.

El navegador usa los archivos reales del build local. Intercepta deliberadamente `/api/weekly-status` con una respuesta retrasada y una entrada de prueba para comprobar la interacción; las capturas de Home pueden mostrar 334 entradas por ese fixture. Esto no verifica el endpoint real, la salud de producción, la automatización ni un despliegue. Tampoco verifica el render de previews dentro de una red social. La prueba posterior del Deploy Preview y la correspondencia con el commit integrado siguen siendo comprobaciones separadas.

## Corrección de integración en Evaluation Brief

La integración detectó que `captureRecord` aún copiaba constructo, unidad, outcome, scoring, comparabilidad y relevancia decisional del objeto histórico de una revisión pendiente. La captura ahora usa solo los campos actuales del registro; conserva fecha y fuentes, identificando las fuentes exclusivas de la revisión anterior como históricas. También se evita usar el constructo antiguo en la búsqueda y el resumen de candidatos de Brief. No se reescriben briefs guardados previamente.

Una nueva prueba comprueba selección, JSON, Markdown y reapertura sin las conclusiones históricas, con procedencia conservada y estado no revisado. `npm run check:brief`: 30/30. Se ejecutaron además `node --check site/brief/app.js` y `git diff --check`. Esta corrección posterior al navegador local requiere la comprobación integrada del preview.
