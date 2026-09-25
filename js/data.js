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

  segmentos: ['Asalariado', 'Independiente', 'Microempresa', 'PyME', 'Empresa', 'Agropecuario'],

  estadosCredito: [
    { id: 'vigente', label: 'Vigente', badge: '' },
    { id: 'mora', label: 'En mora', badge: 'red' },
    { id: 'reprogramado', label: 'Reprogramado', badge: 'orange' },
    { id: 'cancelado', label: 'Cancelado', badge: 'gray' }
  ],

  tiposCredito: [
    { id: 'consumo', label: 'Consumo', icon: '🛒', color: '#00875A' },
    { id: 'vivienda', label: 'Vivienda', icon: '🏠', color: '#2F6FDE' },
    { id: 'vivienda_social', label: 'Vivienda social', icon: '🏡', color: '#5B8DEF' },
    { id: 'vehicular', label: 'Vehicular', icon: '🚗', color: '#8E5CD9' },
    { id: 'pyme', label: 'PyME', icon: '🏪', color: '#E27B17' },
    { id: 'micro', label: 'Microcrédito', icon: '🧺', color: '#D6453D' },
    { id: 'productivo', label: 'Productivo', icon: '🏭', color: '#00A160' },
    { id: 'agropecuario', label: 'Agropecuario', icon: '🌾', color: '#9A7B00' },
    { id: 'empresarial', label: 'Empresarial', icon: '🏢', color: '#003B2B' },
    { id: 'tarjeta', label: 'Tarjeta de crédito', icon: '💳', color: '#F2B705' },
    { id: 'linea', label: 'Línea de crédito', icon: '📈', color: '#16857F' },
    { id: 'boleta', label: 'Boleta de garantía', icon: '📄', color: '#6B7A73' }
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
    resumen: 'Crédito de libre disponibilidad para personas asalariadas o independientes con ingresos demostrables.',
    requisitos: [...REQ_BASE,
      'Últimas 3 boletas de pago',
      'Certificado de trabajo (antigüedad y cargo)',
      'Extracto de aportes AFP / Gestora',
      'Datos de garante personal (si aplica)'],
    consejos: [
      'Verifica que la cuota no supere el % de endeudamiento permitido sobre el ingreso líquido.',
      'Revisa deudas en el sistema financiero: la calificación debe ser A o B.',
      'Ofrece débito automático y seguro de desgravamen desde el inicio.',
      'Clientes con planilla en el banco suelen tener proceso más rápido.'
    ]
  },
  vivienda: {
    resumen: 'Compra, construcción, ampliación o refacción de vivienda con garantía hipotecaria.',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos (boletas / estados financieros)',
      'Testimonio de propiedad del inmueble',
      'Folio real actualizado (Derechos Reales)',
      'Certificado alodial / de gravámenes',
      'Impuestos a la propiedad pagados (últimas 5 gestiones)',
      'Plano aprobado y catastro',
      'Avalúo por perito registrado',
      'Minuta de compra-venta (si es compra)',
      'Seguro de desgravamen y seguro del inmueble'],
    consejos: [
      'Solicita el folio real al inicio: es el documento que más demora.',
      'Coordina el avalúo apenas tengas la documentación legal completa.',
      'Revisa el % de financiamiento máximo según el valor del avalúo.',
      'Si el inmueble es única vivienda sin fines comerciales, evalúa Vivienda de Interés Social.'
    ]
  },
  vivienda_social: {
    resumen: 'Vivienda de interés social con tasas reguladas (Ley 393 de Servicios Financieros). Aplica a única vivienda sin fines comerciales dentro de los valores límite.',
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
      'Confirma que el valor comercial esté dentro del límite vigente en UFV.',
      'Explica al cliente la tasa regulada según el rango del valor de la vivienda.',
      'Verifica la opción de garantía de fondo (FOGAVISP) si no cubre el aporte propio.'
    ]
  },
  vehicular: {
    resumen: 'Compra de vehículo nuevo o usado con garantía prendaria del vehículo.',
    requisitos: [...REQ_BASE,
      'Respaldo de ingresos',
      'Proforma / cotización de la concesionaria',
      'RUAT / CRPVA (vehículo usado)',
      'Inspección técnica y avalúo (vehículo usado)',
      'SOAT vigente',
      'Seguro automotor todo riesgo endosado al banco'],
    consejos: [
      'Consulta convenios vigentes con concesionarias: suelen mejorar tasa y plazo.',
      'Revisa el aporte propio mínimo requerido.',
      'Recuerda registrar la prenda en el registro correspondiente.'
    ]
  },
  pyme: {
    resumen: 'Financiamiento de capital de operaciones o inversión para pequeñas y medianas empresas.',
    requisitos: [...REQ_BASE,
      'NIT y certificado de inscripción',
      'Matrícula de comercio (SEPREC)',
      'Licencia de funcionamiento municipal',
      'Estados financieros (últimas 2 gestiones)',
      'Declaraciones de impuestos (últimos 6 meses)',
      'Flujo de caja proyectado',
      'Documentos de la garantía ofrecida',
      'Testimonio de constitución y poder del representante (si es sociedad)'],
    consejos: [
      'Visita el negocio: la evaluación in situ fortalece la propuesta.',
      'Diferencia capital de operaciones (corto plazo) de inversión (largo plazo).',
      'Si es productivo, verifica si aplica a tasa regulada de crédito productivo.',
      'Ofrece cuenta corriente, POS/QR y banca por internet para vincular al cliente.'
    ]
  },
  micro: {
    resumen: 'Crédito para microempresarios con evaluación en el lugar del negocio.',
    requisitos: [...REQ_BASE,
      'Croquis del negocio',
      'Verificación in situ del negocio',
      'Respaldo de ventas (cuaderno, facturas, notas)',
      'NIT o patente (si tiene)',
      'Garantía personal o prendaria'],
    consejos: [
      'Construye el flujo del negocio con el cliente: ventas, costos y gastos familiares.',
      'Toma fotografías del negocio e inventario para el expediente.',
      'Considera la estacionalidad de las ventas al definir el plan de pagos.'
    ]
  },
  productivo: {
    resumen: 'Crédito para actividades productivas (manufactura, agroindustria, turismo, etc.) con tasas reguladas según tamaño.',
    requisitos: [...REQ_BASE,
      'NIT / matrícula de comercio',
      'Estados financieros o flujo de la actividad',
      'Plan de inversión o de producción',
      'Proformas de maquinaria o insumos',
      'Documentos de la garantía'],
    consejos: [
      'Confirma que la actividad esté clasificada como productiva (CAEDEC).',
      'Revisa las opciones de garantía FOGACP si la garantía es insuficiente.'
    ]
  },
  agropecuario: {
    resumen: 'Financiamiento a productores agrícolas y pecuarios según su ciclo productivo.',
    requisitos: [...REQ_BASE,
      'Documento de propiedad o derecho de uso de la tierra (INRA / DD.RR.)',
      'Plan de producción / siembra',
      'Registro de marca de ganado (pecuario)',
      'Contratos de venta o acopio (si tiene)',
      'Documentos de la garantía'],
    consejos: [
      'Ajusta el plan de pagos al ciclo de cosecha o venta.',
      'Evalúa seguro agrícola si está disponible.',
      'Verifica la ubicación del predio con coordenadas.'
    ]
  },
  empresarial: {
    resumen: 'Financiamiento a empresas grandes: capital de operaciones, inversión y operaciones contingentes.',
    requisitos: [
      'Testimonio de constitución y modificaciones',
      'Poder del representante legal',
      'NIT, matrícula de comercio y licencia de funcionamiento',
      'Estados financieros auditados (últimas 3 gestiones)',
      'Flujo de caja proyectado',
      'Detalle de deudas financieras',
      'Autorización de consulta a buró',
      'Documentos de garantías'],
    consejos: [
      'Prepara el análisis de ratios: liquidez, endeudamiento, cobertura.',
      'Coordina con el área de riesgos antes de presentar al comité.',
      'Identifica oportunidades de cash management y comercio exterior.'
    ]
  },
  tarjeta: {
    resumen: 'Tarjeta de crédito como línea rotativa de consumo.',
    requisitos: [...REQ_BASE, 'Respaldo de ingresos', 'Formulario de solicitud firmado'],
    consejos: [
      'Excelente producto de vinculación para clientes con otros créditos al día.',
      'Explica fechas de corte, pago mínimo e intereses.'
    ]
  },
  linea: {
    resumen: 'Línea de crédito rotativa para capital de operaciones de empresas.',
    requisitos: [
      'Documentación legal de la empresa',
      'Estados financieros (últimas 2 gestiones)',
      'Flujo de caja proyectado',
      'Autorización de consulta a buró',
      'Documentos de garantías'],
    consejos: ['Define claramente los productos que se podrán operar bajo la línea (préstamos, boletas, cartas de crédito).']
  },
  boleta: {
    resumen: 'Boleta de garantía para licitaciones, cumplimiento de contrato o correcta inversión de anticipo.',
    requisitos: [
      'Solicitud con datos del beneficiario y objeto',
      'Copia del pliego o contrato',
      'Documentación legal de la empresa',
      'Contragarantía (depósito, hipoteca o línea aprobada)'],
    consejos: ['Verifica el texto exacto que exige el beneficiario antes de emitir.']
  }
};

/* Consejos generales para el día a día del ejecutivo */
const TIPS_GENERALES = [
  { t: 'Prioriza por peso', d: 'El 20% de tus clientes suele concentrar ~80% de tu cartera (clientes "A"). Visítalos con mayor frecuencia.' },
  { t: 'Mora temprana', d: 'Llama al cliente desde el día 1 de atraso. La mora se recupera mucho mejor en los primeros 30 días.' },
  { t: 'Venta cruzada', d: 'Cada cliente con crédito es candidato a cuenta, tarjeta, seguros, débito automático y banca digital.' },
  { t: 'Renovaciones', d: 'Clientes que ya pagaron más del 50% de su crédito y tienen buen historial son candidatos a refinanciamiento o nuevo crédito.' },
  { t: 'Documentos al día', d: 'Pide los documentos más lentos (folio real, avalúo) al inicio del trámite para no frenar el comité.' },
  { t: 'Registra todo', d: 'Anota cada contacto en la bitácora: te ayuda en comité y en la gestión de cobranza.' }
];
