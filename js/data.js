/* Catálogos y contenido de guías.
   Los requisitos son referenciales: cada ejecutivo debe validarlos
   contra la normativa interna vigente y el reglamento de ASFI. */
'use strict';

const CATALOG = {
  extensiones: ['LP', 'SC', 'CB', 'OR', 'PT', 'CH', 'TJ', 'BE', 'PD', 'EXT'],

  monedas: [
    { id: 'BOB', label: 'Bs', nombre: 'Bolivianos' },
    { id: 'USD', label: '$us', nombre: 'Dólares' }
  ],

  segmentos: ['Asalariado', 'Independiente', 'Profesional independiente', 'Jubilado / rentista'],

  estadosCredito: [
    { id: 'vigente', label: 'Vigente', badge: '' },
    { id: 'mora', label: 'En mora', badge: 'red' },
    { id: 'reprogramado', label: 'Reprogramado', badge: 'orange' },
    { id: 'cancelado', label: 'Cancelado', badge: 'gray' }
  ],

  /* Banca Personas: solo estos productos */
  tiposCredito: [
    { id: 'consumo', label: 'Consumo', icon: '🛒', color: '#00875A' },
    { id: 'tarjeta', label: 'Tarjeta de crédito', icon: '💳', color: '#E0A800' },
    { id: 'vivienda', label: 'Vivienda', icon: '🏠', color: '#2F6FDE' },
    { id: 'vivienda_social', label: 'Vivienda de interés social', icon: '🏡', color: '#5B8DEF' },
    { id: 'vehicular', label: 'Vehicular', icon: '🚗', color: '#8E5CD9' },
    { id: 'linea', label: 'Línea de crédito', icon: '📈', color: '#16857F' }
  ],

  etapas: [
    { id: 'prospecto', label: 'Prospecto', tips: ['Primer contacto y detección de necesidad', 'Pre-evaluar capacidad de pago', 'Explicar requisitos y condiciones'] },
    { id: 'documentos', label: 'Documentación', tips: ['Recolectar requisitos del checklist', 'Solicitar autorización de consulta a buró (CIC / Infocred)', 'Verificación domiciliaria y laboral'] },
    { id: 'evaluacion', label: 'Evaluación', tips: ['Análisis de capacidad de pago', 'Revisión de garantías / avalúo', 'Armado de la propuesta de crédito'] },
    { id: 'comite', label: 'Comité / Aprobación', tips: ['Presentar propuesta', 'Responder observaciones del comité o riesgos'] },
    { id: 'aprobado', label: 'Aprobado', tips: ['Comunicar al cliente', 'Firma de contrato y constitución de garantías', 'Seguros (desgravamen, inmueble, vehículo)'] },
    { id: 'desembolsado', label: 'Desembolsado', tips: ['Confirmar desembolso', 'Registrar el crédito en la cartera del cliente', 'Agendar seguimiento a la primera cuota'] }
  ],
  etapaRechazo: { id: 'rechazado', label: 'Rechazado / Desistido' },

  tiposAgenda: [
    { id: 'llamada', label: 'Llamada', icon: '📞' },
    { id: 'visita', label: 'Visita', icon: '📍' },
    { id: 'cobranza', label: 'Cobranza', icon: '💰' },
    { id: 'reunion', label: 'Reunión', icon: '🤝' },
    { id: 'comite', label: 'Comité', icon: '🏛️' },
    { id: 'documento', label: 'Documentos', icon: '📂' },
    { id: 'otro', label: 'Otro', icon: '📝' }
  ]
};

/* Requisitos base comunes a toda persona natural */
const REQ_BASE = [
  'Fotocopia de CI vigente (titular y cónyuge)',
  'Factura de luz o agua (domicilio)',
  'Croquis del domicilio',
  'Autorización de consulta a buró (CIC ASFI / Infocred)'
];

/* Guías por tipo de crédito: requisitos (checklist), pasos y consejos */
const GUIDES = {
  consumo: {
    resumen: 'Crédito de libre disponibilidad para personas asalariadas, independientes o jubiladas con ingresos demostrables.',
    requisitos: [...REQ_BASE,
      'Últimas 3 boletas de pago (asalariado)',
      'Certificado de trabajo con antigüedad y cargo',
      'Extracto de aportes a la Gestora',
      'Respaldo de ingresos (independiente): facturas, extractos, declaraciones',
      'Datos de garante personal (si aplica)'],
    consejos: [
      'Calcula el líquido pagable: sueldo bruto menos 12,71% de aportes (más el Aporte Nacional Solidario si gana más de Bs 13.000).',
      'Revisa deudas en el sistema financiero: la calificación debe ser A o B.',
      'Clientes con planilla en el banco suelen tener un proceso más rápido.',
      'Ofrece débito automático y seguro de desgravamen desde el inicio.'
    ]
  },
  tarjeta: {
    resumen: 'Línea rotativa para compras y consumos. Excelente producto de vinculación.',
    requisitos: [...REQ_BASE, 'Respaldo de ingresos', 'Formulario de solicitud firmado'],
    consejos: [
      'Ofrécela a clientes con créditos al día: aumenta la vinculación.',
      'Explica fecha de corte, fecha de pago, pago mínimo e intereses.',
      'Muestra con la calculadora cuánto tarda en pagar la deuda si solo paga el mínimo.'
    ]
  },
  vivienda: {
    resumen: 'Compra, construcción, ampliación o refacción de vivienda con garantía hipotecaria.',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos (boletas o declaraciones)',
      'Testimonio de propiedad del inmueble',
      'Folio real actualizado (Derechos Reales)',
      'Certificado alodial / de gravámenes',
      'Impuestos a la propiedad pagados (últimas 5 gestiones)',
      'Plano aprobado y catastro',
      'Avalúo por perito registrado',
      'Minuta de compra-venta (si es compra)',
      'Seguro de desgravamen y seguro del inmueble'],
    consejos: [
      'Pide el folio real al inicio: es el documento que más demora.',
      'Coordina el avalúo apenas tengas la documentación legal completa.',
      'Si es la única vivienda y está dentro de los límites en UFV, evalúa Vivienda de Interés Social (tasa regulada).',
      'Aclara si la tasa es fija todo el plazo o fija por unos años y luego variable (TRe + margen).'
    ]
  },
  vivienda_social: {
    resumen: 'Vivienda de interés social con tasas máximas reguladas (DS 1842): única vivienda sin fines comerciales, de hasta UFV 460.000 (casa) o UFV 400.000 (departamento).',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos',
      'Declaración jurada de única vivienda',
      'Certificado de no propiedad (Derechos Reales)',
      'Testimonio de propiedad del inmueble a adquirir',
      'Folio real actualizado',
      'Avalúo por perito registrado',
      'Impuestos al día',
      'Seguro de desgravamen y seguro del inmueble'],
    consejos: [
      'Tasa máxima según valor: hasta UFV 255.000 → 5,5%; UFV 255.001–380.000 → 6%; UFV 380.001–460.000 → 6,5%.',
      'La calculadora convierte el valor del inmueble a UFV y aplica la tasa que corresponde.',
      'Si el cliente no tiene todo el aporte propio, revisa la garantía del fondo FOGAVISP.'
    ]
  },
  vehicular: {
    resumen: 'Compra de vehículo nuevo o usado con garantía prendaria del propio vehículo.',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos',
      'Proforma / cotización de la concesionaria',
      'RUAT / CRPVA (vehículo usado)',
      'Inspección técnica y avalúo (vehículo usado)',
      'SOAT vigente',
      'Seguro automotor todo riesgo endosado al banco'],
    consejos: [
      'Consulta convenios vigentes con concesionarias: suelen mejorar tasa y plazo.',
      'Verifica el aporte propio mínimo (nuevo vs. usado).',
      'Suma el seguro automotor a la cuota al conversar con el cliente: evita sorpresas.'
    ]
  },
  linea: {
    resumen: 'Línea de crédito personal rotativa: el cliente usa el monto aprobado cuando lo necesita, paga intereses solo por lo utilizado y el cupo se repone al pagar.',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos',
      'Solicitud de línea con monto y plazo',
      'Documentos de la garantía (si corresponde)'],
    consejos: [
      'Ideal para clientes con ingresos variables o gastos recurrentes.',
      'Explica que paga intereses solo sobre el monto utilizado.',
      'Revisa la vigencia de la línea y la fecha de renovación.'
    ]
  }
};

/* Parámetros por producto (referenciales). Se editan en Más → Parámetros de productos
   y se reemplazarán con la normativa interna del banco. */
const PRODUCTOS_DEFAULT = {
  consumo:  { tasa: 14,  plazoMax: 60,  financiamiento: 100, rci: 40, desgravamen: 0.05, seguroBien: 0 },
  vivienda: { tasa: 8.5, plazoMax: 300, financiamiento: 80,  rci: 40, desgravamen: 0.05, seguroBien: 0.12 },
  vivienda_social: { tasa: 5.5, plazoMax: 240, financiamiento: 100, rci: 40, desgravamen: 0.05, seguroBien: 0.12 },
  vehicular: { tasa: 10, plazoMax: 60, financiamiento: 80, rci: 40, desgravamen: 0.05, seguroBien: 3 },
  linea:    { tasa: 13,  plazoMax: 36,  financiamiento: 100, rci: 40, desgravamen: 0.05, seguroBien: 0 },
  tarjeta:  { tasa: 24,  plazoMax: 0,   financiamiento: 100, rci: 40, desgravamen: 0, seguroBien: 0, pagoMinimo: 5, cuotaSistema: 5 }
};
/* seguroBien: vivienda = % anual sobre el valor del inmueble; vehicular = % anual sobre el valor del vehículo.
   desgravamen: % mensual sobre el saldo. tarjeta.cuotaSistema: % del límite que se toma como cuota en la evaluación. */

/* Vivienda de interés social (DS 1842): tasas máximas por valor en UFV */
const VIS = {
  limiteCasa: 460000,
  limiteDepto: 400000,
  tramos: [ { hasta: 255000, tasa: 5.5 }, { hasta: 380000, tasa: 6 }, { hasta: 460000, tasa: 6.5 } ]
};
const UFV_RESPALDO = { valor: 3.34865, fecha: '2026-09-24' };

/* Descuentos de ley al asalariado (Gestora Pública, 2026) */
const APORTES = {
  laboral: 12.71, // 10% vejez + 1,71% riesgo común + 0,5% solidario + 0,5% comisión
  ans: [ { sobre: 13000, pct: 1.15 }, { sobre: 25000, pct: 5.74 }, { sobre: 35000, pct: 11.48 } ] // Aporte Nacional Solidario
};

/* Consejos generales para el día a día del ejecutivo */
const TIPS_GENERALES = [
  { t: 'Prioriza por peso', d: 'El 20% de tus clientes suele concentrar ~80% de tu cartera (clientes "A"). Visítalos con mayor frecuencia.' },
  { t: 'Mora temprana', d: 'Llama al cliente desde el día 1 de atraso. La mora se recupera mucho mejor en los primeros 30 días.' },
  { t: 'Venta cruzada', d: 'Cada cliente con crédito de consumo, vivienda o vehicular es candidato a tarjeta de crédito, línea de crédito, seguros y débito automático.' },
  { t: 'Renovaciones', d: 'Clientes que ya pagaron más del 50% de su crédito y tienen buen historial son candidatos a refinanciamiento o nuevo crédito.' },
  { t: 'Documentos al día', d: 'Pide los documentos más lentos (folio real, avalúo) al inicio del trámite para no frenar el comité.' },
  { t: 'Registra todo', d: 'Anota cada contacto en la bitácora: te ayuda en comité y en la gestión de cobranza.' }
];
