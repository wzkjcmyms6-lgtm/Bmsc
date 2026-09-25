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
- **Guías** por tipo de crédito (consumo, vivienda, vivienda social, vehicular, PyME, micro, productivo, agropecuario, empresarial, tarjeta, línea, boleta) con requisitos y consejos, que se pueden compartir.

**Agenda y alertas**
- Llamadas, visitas, cobranza, reuniones y comités, agrupados en vencidas, hoy, próximos 7 días y más adelante.
- Alertas en Inicio: cuotas por vencer, clientes en mora, tareas vencidas, trámites sin movimiento, fechas objetivo vencidas y cumpleaños.
- Recordatorio de cuota por WhatsApp (cobranza preventiva).

**Herramientas**
- Calculadora de cuota con plan de pagos (sistema francés o alemán) y opción de compartir.
- Calculadora de capacidad de pago: cuota máxima y monto máximo prestable.
- Metas mensuales de colocación y de clientes nuevos, con barra de avance.
- Respaldo: exportar e importar en JSON y exportar la cartera a Excel (CSV).
- PIN de seguridad, tema claro u oscuro, uso sin conexión e instalación en la pantalla de inicio.

## Privacidad
Los datos se guardan **solo en el dispositivo** (almacenamiento del navegador); no se envían a ningún servidor.
Por eso conviene descargar un respaldo con frecuencia. Los requisitos de las guías son referenciales:
valídalos siempre con la normativa interna vigente y con ASFI.

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
js/app.js             Vistas y lógica
sw.js                 Uso sin conexión
manifest.webmanifest  Instalación como app
```
