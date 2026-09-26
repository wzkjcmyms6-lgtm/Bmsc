/* Propuesta en PDF (crédito de consumo): arriba las CONDICIONES del simulador y abajo los REQUISITOS.
   Usa jsPDF (js/vendor/jspdf.umd.min.js), que se carga recién cuando hace falta y queda en caché. */
'use strict';

let cargaJsPDF = null;
function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!cargaJsPDF) {
    cargaJsPDF = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jspdf.umd.min.js';
      s.onload = () => ok(window.jspdf);
      s.onerror = () => { cargaJsPDF = null; mal(new Error('No se pudo cargar el generador de PDF')); };
      document.head.appendChild(s);
    });
  }
  return cargaJsPDF;
}

/* Requisitos del crédito de consumo (según quién participa en la simulación) */
function requisitosConsumo(u) {
  const V = u.V;
  const conCod = V.codeudor === 'si';
  const conIngC = conCod && V.ingC === 'si' && num(V.montoC) > 0;
  const n = V.boletas === '6' ? 6 : 3;
  return [
    `Fotocopia de CI ${conCod ? 'del titular y del codeudor' : 'del titular'}`,
    `Últimas ${n} boletas de pago ${conIngC ? 'del titular y del codeudor' : 'del titular'}`,
    'Firma de formularios'
  ];
}

function generarPropuestaPDF(u) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const V = u.V, st = S().settings;
  const W = 210, M = 16, ancho = W - 2 * M;
  const verde = [0, 86, 63], dorado = [201, 151, 0], gris = [95, 107, 101], texto = [23, 33, 29];
  const bs = n => `Bs ${nf2.format(n)}`;
  const persona = (nombre, ci, ext, e) => [nombre || 'Sin nombre', ci ? `CI ${ci}${ext ? ' ' + ext : ''}` : '', e ? edadTxt(e) : ''].filter(Boolean).join(' · ');

  // Encabezado
  doc.setFillColor(...verde); doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(...dorado); doc.rect(0, 30, W, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Banco Mercantil Santa Cruz', M, 11);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('Propuesta de crédito de consumo', M, 21);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(fmtDate(today()), W - M, 11, { align: 'right' });
  let y = 40;
  const ejecutivo = [st.ejecutivo, st.agencia, st.telefonoEjecutivo && `Cel. ${st.telefonoEjecutivo}`].filter(Boolean).join(' · ');
  if (ejecutivo) { doc.setTextColor(...gris); doc.setFontSize(9.5); doc.text(`Ejecutivo de cuenta: ${ejecutivo}`, M, y); y += 8; }

  const titulo = t => {
    doc.setTextColor(...verde); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text(t, M, y);
    doc.setDrawColor(...dorado); doc.setLineWidth(0.6); doc.line(M, y + 2, M + ancho, y + 2);
    y += 8;
  };
  // Fila etiqueta / valor (el valor puede ocupar varias líneas)
  let par = false;
  const fila = (etiqueta, valor, fuerte = false) => {
    doc.setFontSize(10);
    const lineas = doc.splitTextToSize(String(valor), ancho * 0.6 - 4);
    const alto = Math.max(7, lineas.length * 4.6 + 2.6);
    if (par) { doc.setFillColor(243, 246, 244); doc.rect(M, y - 4.8, ancho, alto, 'F'); }
    par = !par;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...gris);
    doc.text(etiqueta, M + 2, y);
    doc.setFont('helvetica', fuerte ? 'bold' : 'normal'); doc.setTextColor(...texto);
    doc.text(lineas, M + ancho - 2, y, { align: 'right' });
    y += alto;
  };

  // CONDICIONES
  titulo('CONDICIONES');
  fila('Titular', persona(V.nombre, V.ci, V.ext, u.eT));
  if (V.codeudor === 'si') fila('Codeudor', persona(V.cNombre, V.cCi, V.cExt, u.eC));
  fila('Monto del crédito', bs(u.monto), true);
  fila('Plazo', `${u.plazo} meses (${u.plazo / 12} ${u.plazo === 12 ? 'año' : 'años'})`);
  fila('Tasa de interés', u.cVar
    ? `${nf2.format(num(V.tasaFija))}% anual fija, meses 1 a ${u.fijo}; desde el mes ${u.fijo + 1}: ${nf2.format(num(V.margenVar))}% + TRe ${nf2.format(treMN())}% = ${nf2.format(u.tasaVar)}% anual`
    : `${nf2.format(num(V.tasaFija))}% anual fija`);
  fila(u.cVar ? `Cuota mensual (meses 1 a ${u.fijo})` : 'Cuota mensual', bs(u.c1.total), true);
  if (u.cVar) fila(`Cuota desde el mes ${u.fijo + 1} (estimada)`, bs(u.cVar.total), true);
  const d = u.desglose(u.c1);
  fila('Composición de la primera cuota', [`Capital + interés ${bs(d.capInt)}`, d.desg && `Desgravamen ${bs(d.desg)}`, d.dima && `DIMA ${bs(d.dima)}`, d.ces && `Cesantía ${bs(d.ces)}`].filter(Boolean).join(' · '));
  fila('Seguro de Desgravamen', u.desgTxt);
  fila('Seguro DIMA', u.dima ? u.dimaTxt : 'No');
  fila('Seguro de Cesantía', u.ces ? u.cesTxt : 'No');
  fila('Total intereses', bs(u.totales.interes));
  fila('Total seguros', bs(u.totales.desg));
  fila('Total a pagar', bs(u.totales.total), true);
  fila('Costo efectivo anual (TEAC)', `${nf2.format(u.teac * 100)}%`);

  // REQUISITOS
  y += 6; par = false;
  titulo('REQUISITOS');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...texto);
  doc.setDrawColor(...verde); doc.setLineWidth(0.4);
  for (const r of requisitosConsumo(u)) {
    doc.rect(M + 2, y - 3.6, 4, 4);
    doc.text(r, M + 9, y);
    y += 8;
  }

  // Pie
  doc.setFontSize(8.5); doc.setTextColor(...gris);
  const pie = doc.splitTextToSize('Cálculos referenciales, sujetos a evaluación y aprobación del banco. La cuota con tasa variable es estimada con la TRe vigente y puede cambiar. Los seguros se calculan cada mes sobre el saldo del capital.', ancho);
  doc.text(pie, M, 297 - 14 - (pie.length - 1) * 3.8);

  // Nombre del archivo: "Propuesta Crédito Consumo - Nombre del Cliente.pdf" (sin caracteres no válidos en archivos)
  const limpio = t => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nombre = `Propuesta Crédito Consumo${limpio(V.nombre) ? ' - ' + limpio(V.nombre) : ''}.pdf`;
  return { doc, nombre };
}

/* Genera el PDF y lo comparte (WhatsApp, Archivos…) o lo descarga si el celular no permite compartir */
async function compartirPropuestaPDF(u) {
  try { await cargarJsPDF(); } catch (e) { toast(e.message + '. Revisa tu conexión.'); return; }
  const { doc, nombre } = generarPropuestaPDF(u);
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; }
    catch (e) { if (e.name === 'AbortError') return; } // si no se pudo compartir, se descarga
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // Algunos navegadores no aceptan tildes en descargas: se usa la versión sin tildes
  a.href = url; a.download = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('PDF generado');
}
