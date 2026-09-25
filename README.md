# Mi Cartera · Ejecutivo BMSC

Aplicación web (PWA) para **ejecutivos de cuenta de crédito**, pensada para usarse desde el celular.
Los colores están inspirados en el Banco Mercantil Santa Cruz (verdes con acento dorado).

## Funciones

**Cartera de clientes**
- Registro de clientes: nombre, carnet (CI + extensión), celulares, correo, segmento, actividad, ingreso, dirección, cumpleaños y notas.
- Varios créditos por cliente: tipo, moneda (Bs / $us), monto, saldo, tasa, plazo, fecha de desembolso, día de pago, cuota, estado (vigente, mora, reprogramado, cancelado) y garantía.
- **Ranking por peso**: cada cliente muestra su posición, su saldo total en Bs y su % dentro de la cartera.
- **Clasificación ABC (Pareto)**: A = clientes que suman el 80% de la cartera, B = siguiente 15%, C = el resto.
- Búsqueda por nombre, CI o teléfono y filtros por clase, tipo de crédito o mora.
- Botones directos para llamar, escribir por WhatsApp o ver la dirección en el mapa.
- Sugerencias de venta cruzada y renovación (por ejemplo, créditos pagados en más del 50% o clientes sin tarjeta).

**Home Base (seguimiento de trámites)**
- Cada trámite avanza por etapas: Prospecto → Documentación → Evaluación → Comité → Aprobado → Desembolsado (o Rechazado, con su motivo).
- **Checklist de requisitos** que se carga solo según el tipo de crédito y se puede editar.
- Botón para pedir por WhatsApp los documentos que faltan, con la lista ya armada.
- Tareas con fecha límite (aparecen en la Agenda), bitácora automática de cada cambio y la sección "Qué hacer en esta etapa".
- Al desembolsar, el crédito se registra automáticamente en la cartera del cliente. Si era prospecto, se le ofrece registrarlo como cliente.
- **Guías** por tipo de crédito (consumo, tarjeta, vivienda, vivienda de interés social, vehicular y línea de crédito) con requisitos y consejos, que se pueden compartir.

**Agenda y alertas** (en Más; la barra inferior tiene Inicio, Clientes, Home Base, Calculadora y Más)
- Llamadas, visitas, cobranza, reuniones y comités, agrupados en vencidas, hoy, próximos 7 días y más adelante.
- Alertas en Inicio: cuotas por vencer, clientes en mora, tareas vencidas, trámites sin movimiento, fechas objetivo vencidas y cumpleaños.
- Recordatorio de cuota por WhatsApp (cobranza preventiva).

**Herramientas**
- **Calculadora de créditos (Banca Personas)** — `js/calculadora.js`:
  - *Simulador*: consumo, vivienda, vehicular y línea de crédito. Sistema francés o alemán, tasa fija o mixta
    (fija + variable TRe), meses de gracia, desgravamen y seguro del bien, gastos iniciales, TEA y TEAC,
    tabla de cuota por plazo, plan de pagos con fechas, riesgo cambiario en créditos en dólares, PDF y WhatsApp.
  - *Vivienda de interés social*: convierte el valor a UFV y aplica la tasa máxima regulada (DS 1842: 5,5% / 6% / 6,5%).
  - *Capacidad de pago*: líquido pagable (aportes Gestora 12,71% + Aporte Nacional Solidario), relación cuota/ingreso,
    cuota de tarjetas por % del límite y monto máximo por producto.
  - *Tarjeta*: pago mínimo vs. pago fijo, tiempo y costo de la deuda, compras en cuotas.
  - *Prepago*: reducir cuota o plazo, con datos de un crédito de la cartera.
  - *Conversor*: Bs ↔ $us (TCO) ↔ UFV y límites de vivienda social.
  - Parámetros por producto editables en **Más → Parámetros de productos** (tasa, plazo, financiamiento, RCI, seguros).
- Productos: consumo, tarjeta de crédito, vivienda, vivienda de interés social, vehicular y línea de crédito.
- Metas mensuales de colocación y de clientes nuevos, con barra de avance.
- Respaldo: exportar e importar en JSON y exportar la cartera a Excel (CSV).
- PIN de seguridad, tema claro u oscuro, uso sin conexión e instalación en la pantalla de inicio.

## Dólar oficial (TCO del BCB)
Desde el 29/06/2026 el Banco Central de Bolivia publica un **Tipo de Cambio Oficial flexible** cada día hábil a las 20:00,
que rige desde el día hábil siguiente. La app lo usa para convertir a Bs los créditos en dólares, así que el ranking,
las clases A/B/C, la cartera total y las metas siempre se calculan con el dólar del día.

- `scripts/tipo-cambio.mjs` descarga el CSV oficial del BCB y genera `data/tipo-cambio.json`
  (TCO, venta referencial = TCO + Bs 0,10, y TCO del Banco Mercantil Santa Cruz).
- `.github/workflows/tipo-cambio.yml` lo ejecuta cada 15 minutos entre 19:30 y 23:45 (hora de Bolivia), más dos revisiones de respaldo.
- La app revisa la cotización al abrirse y cada 30 minutos. En **Ajustes** se elige el valor que se usa (TCO, venta o TCO BMSC)
  o un tipo de cambio manual.

> GitHub solo ejecuta las tareas programadas desde la **rama principal** del repositorio: en Settings → General → Default branch
> hay que elegir `Bmsc`. En Settings → Actions → General → Workflow permissions debe estar "Read and write permissions".

## Base de datos en la nube (Firebase Firestore)
La app guarda los datos en **Firestore** y mantiene una copia en el celular para funcionar sin internet.
Lo que se registra en un dispositivo aparece en los demás en segundos.

| Colección   | Contenido |
|-------------|-----------|
| `clientes`  | Un documento por cliente, con sus créditos |
| `tramites`  | Trámites del Home Base (requisitos, tareas, bitácora) |
| `agenda`    | Actividades |
| `historial` | Registro de cada cambio: fecha, acción, ejecutivo y copia del dato en ese momento |

**Configuración (una sola vez):**
1. En https://console.firebase.google.com crea un proyecto, por ejemplo `mi-cartera-bmsc`.
2. Menú **Firestore Database → Crear base de datos** (ubicación `southamerica-east1`, São Paulo).
3. En la pestaña **Reglas**, pega el contenido de `firestore.rules` y publica.
4. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra la app y copia el objeto `firebaseConfig`.
5. Pega esos valores en `js/firebase-config.js`.

En **Más → Base de datos en la nube** se ve el estado de la conexión, el historial de cambios y un botón para enviar todo a la nube.
En la ficha de cada cliente está su historial de cambios.

Sin configuración, la app funciona igual, pero solo con los datos guardados en el dispositivo.

**Inicio de sesión:** la app pide usuario y clave (Firebase Authentication, correo/contraseña).
El usuario `17751` entra internamente como `17751@mi-cartera-bmsc.app` (dominio definido en `js/firebase-config.js`).
Para agregar un usuario: Firebase → Authentication → Usuarios → Agregar usuario (`<usuario>@mi-cartera-bmsc.app`)
y sumar ese correo a la lista de `firestore.rules`. Al cerrar sesión se borra la copia local del dispositivo.

## Privacidad
Solo los usuarios incluidos en `firestore.rules` pueden leer o escribir en Firestore.
El código del sitio es público (GitHub Pages), pero los datos no se pueden ver sin iniciar sesión.
Los requisitos de las guías son referenciales: valídalos siempre con la normativa interna vigente y con ASFI.

## Cómo usarla
Es un sitio estático: no necesita compilación ni servidor propio.

- **Probar localmente:** `python3 -m http.server 8080` y abrir `http://localhost:8080`.
- **Publicar:** activar GitHub Pages en el repositorio (Settings → Pages → rama `Bmsc`, carpeta `/`).
  Desde el celular, abrir el enlace y elegir "Agregar a pantalla de inicio".

En **Más → Respaldo de datos → Cargar datos de ejemplo** se puede ver la app con información de prueba.

## Estructura
```
index.html            Estructura y navegación
css/styles.css        Estilos (paleta verde / dorado, modo oscuro)
js/data.js            Catálogos: tipos de crédito, etapas, guías y requisitos
js/store.js           Almacenamiento local
js/nube.js            Sincronización con Firestore e historial
js/firebase-config.js Configuración del proyecto de Firebase
firestore.rules       Reglas de seguridad de Firestore
js/app.js             Vistas y lógica
data/tipo-cambio.json Tipo de cambio oficial (se actualiza solo)
scripts/              Descarga del TCO del BCB
sw.js                 Uso sin conexión
manifest.webmanifest  Instalación como app
```
