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

/* Requisitos de la propuesta (según el tipo de crédito y quién participa):
   - Consumo: CI, 3 o 6 boletas, firma de formularios.
   - Todos: Reporte de movimientos de la Gestora y, si tiene otros créditos, su plan de pagos (por banco).
   - Más los requisitos extra que añade el ejecutivo. */
function requisitosPropuesta(u) {
  const V = u.V;
  const consumo = u.consumo;
  const conCod = V.codeudor === 'si' && !u.tarjeta;
  const conIngC = conCod && V.ingC === 'si' && num(V.montoC) > 0;
  const n = V.boletas === '6' ? 6 : 3;
  const r = [];
  if (consumo) {
    r.push(`Fotocopia de CI ${conCod ? 'del titular y del codeudor' : 'del titular'}`);
    r.push(`Últimas ${n} boletas de pago ${conIngC ? 'del titular y del codeudor' : 'del titular'}`);
  }
  r.push('Reporte de movimientos de la Gestora');
  // Plan de pagos de cada crédito vigente (las tarjetas no tienen plan de pagos)
  const creditos = (V.deudas || []).filter(d => d.cod !== 'TC');
  if (creditos.length) {
    const bancos = [...new Set(creditos.map(d => String(d.banco || '').trim()).filter(Boolean))];
    const sinBanco = creditos.some(d => !String(d.banco || '').trim());
    r.push(bancos.length
      ? `Plan de pagos de ${bancos.length > 1 ? 'sus créditos en ' + bancos.slice(0, -1).join(', ') + ' y ' + bancos.at(-1) : 'su crédito en ' + bancos[0]}${sinBanco ? ' (y de sus otros créditos)' : ''}`
      : `Plan de pagos de sus otros créditos`);
  }
  if (consumo) r.push('Firma de formularios');
  return [...r, ...(V.reqExtra || []).filter(Boolean)];
}
const requisitosConsumo = requisitosPropuesta;

/* Logo para el encabezado del PDF (se carga una vez y queda en memoria) */
let logoPDF = null;
function cargarLogoPDF() {
  if (logoPDF) return Promise.resolve(logoPDF);
  return fetch('icons/icon-192.png').then(r => r.blob()).then(b => new Promise(ok => {
    const fr = new FileReader(); fr.onload = () => ok(logoPDF = fr.result); fr.readAsDataURL(b);
  })).catch(() => null);
}

function generarPropuestaPDF(u) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const V = u.V, st = S().settings;
  const W = 210, H = 297, M = 16, ancho = W - 2 * M;
  const verde = [0, 86, 63], verdeOsc = [0, 59, 43], dorado = [201, 151, 0], doradoSuave = [236, 214, 150];
  const gris = [95, 107, 101], texto = [23, 33, 29], linea = [224, 230, 226], fondo = [242, 247, 244];
  const bs = n => `Bs ${nf2.format(n)}`;
  const persona = (ci, ext, e) => [ci ? `CI ${ci}${ext ? ' ' + ext : ''}` : '', e ? edadTxt(e) : ''].filter(Boolean).join(' · ');
  const fuente = (estilo, tam, color) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...color); };

  // ---------- Encabezado ----------
  doc.setFillColor(...verdeOsc); doc.rect(0, 0, W, 40, 'F');
  doc.setFillColor(...verde); doc.triangle(W * 0.52, 0, W, 0, W, 40, 'F');   // diagonal sutil
  doc.setFillColor(...dorado); doc.rect(0, 40, W, 1.4, 'F');
  let xTit = M;
  if (logoPDF) { try { doc.addImage(logoPDF, 'PNG', M, 9, 22, 22); xTit = M + 28; } catch { /* sin logo */ } }
  fuente('normal', 9, doradoSuave); doc.text('BANCO MERCANTIL SANTA CRUZ', xTit, 15, { charSpace: 0.6 });
  fuente('bold', 19, [255, 255, 255]); doc.text('Propuesta de crédito', xTit, 24.5);
  fuente('normal', 11, [226, 240, 233]); doc.text('Crédito de consumo', xTit, 31);
  fuente('normal', 9, [226, 240, 233]); doc.text(fmtDate(today()), W - M, 15, { align: 'right' });

  // ---------- Cliente ----------
  let y = 54;
  fuente('normal', 8.5, gris); doc.text('PREPARADA PARA', M, y, { charSpace: 0.5 });
  fuente('bold', 15, texto); doc.text(V.nombre || 'Cliente', M, y + 7);
  fuente('normal', 9.5, gris); doc.text(persona(V.ci, V.ext, u.eT), M, y + 12.5);
  if (V.codeudor === 'si') {
    fuente('normal', 9.5, gris);
    doc.text(`Codeudor: ${[V.cNombre || 'Sin nombre', persona(V.cCi, V.cExt, u.eC)].filter(Boolean).join(' · ')}`, M, y + 17.5);
    y += 5;
  }
  y += 20;

  // ---------- Tarjetas principales: monto, plazo y cuota ----------
  const gap = 4, wBox = (ancho - 2 * gap) / 3, hBox = 25;
  const caja = (x, etiqueta, valor, sub, destacada) => {
    if (destacada) { doc.setFillColor(...verde); doc.roundedRect(x, y, wBox, hBox, 3, 3, 'F'); }
    else { doc.setFillColor(...fondo); doc.roundedRect(x, y, wBox, hBox, 3, 3, 'F'); }
    fuente('normal', 8, destacada ? doradoSuave : gris); doc.text(etiqueta, x + 5, y + 7.5, { charSpace: 0.3 });
    fuente('bold', 14.5, destacada ? [255, 255, 255] : verde); doc.text(valor, x + 5, y + 16);
    if (sub) { fuente('normal', 8, destacada ? [226, 240, 233] : gris); doc.text(sub, x + 5, y + 21.2); }
  };
  caja(M, 'MONTO DEL CRÉDITO', bs(u.monto));
  caja(M + wBox + gap, 'PLAZO', `${u.plazo} meses`, `${nf0.format(u.plazo / 12)} ${u.plazo === 12 ? 'año' : 'años'}`);
  caja(M + 2 * (wBox + gap), 'CUOTA MENSUAL APROX.', bs(u.c1.total), 'referencial', true);
  y += hBox + 12;

  // ---------- Títulos y filas ----------
  const titulo = t => {
    doc.setFillColor(...dorado); doc.rect(M, y - 4, 1.4, 5.2, 'F');
    fuente('bold', 11.5, verde); doc.text(t, M + 4, y, { charSpace: 0.4 });
    y += 6;
  };
  const fila = (etiqueta, valor, fuerte = false) => {
    fuente('normal', 10, texto);
    const lineas = doc.splitTextToSize(String(valor), ancho * 0.62);
    const alto = Math.max(9, lineas.length * 4.6 + 4.6);
    fuente('normal', 10, gris); doc.text(etiqueta, M, y + 5.6);
    fuente(fuerte ? 'bold' : 'normal', 10, texto); doc.text(lineas, M + ancho, y + 5.6, { align: 'right' });
    doc.setDrawColor(...linea); doc.setLineWidth(0.25); doc.line(M, y + alto, M + ancho, y + alto);
    y += alto;
  };

  // ---------- Condiciones ----------
  titulo('CONDICIONES');
  fila('Tasa de interés', u.cVar
    ? `Meses 1 a ${u.fijo}: ${nf2.format(num(V.tasaFija))}% fija\nDesde el mes ${u.fijo + 1}: ${nf2.format(num(V.margenVar))}% + TRe`
    : `${nf2.format(num(V.tasaFija))}% fija todo el plazo`);
  const alta = Math.max(u.c1.total, u.cVar ? u.cVar.total : 0);
  if (alta > u.c1.total + 0.005) fila('Cuota más alta aprox.', bs(alta), true);
  fila('Seguros incluidos', [u.desg && 'Desgravamen', u.dima && 'DIMA', u.ces && 'Cesantía'].filter(Boolean).join(' · ') || 'Sin seguros');

  // Detalle de costos: solo si el ejecutivo lo habilita
  if (V.pdfDetalle === 'si') {
    y += 8;
    titulo('DETALLE DE COSTOS (REFERENCIAL)');
    const d = u.desglose(u.c1);
    fila('Primera cuota (aprox.)', [`Capital + interés ${bs(d.capInt)}`, d.desg && `Desgravamen ${bs(d.desg)}`, d.dima && `DIMA ${bs(d.dima)}`, d.ces && `Cesantía ${bs(d.ces)}`].filter(Boolean).join(' · '));
    const pctS = v => `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(v)}%`;
    fila('Tasas de seguros (anual, sobre saldo)', [u.desg && `Desgravamen ${pctS(u.desg)}`, u.dima && `DIMA ${pctS(u.dima)}`, u.ces && `Cesantía ${pctS(u.ces)}`].filter(Boolean).join(' · ') || 'Sin seguros');
    // Totales en 4 casillas
    y += 4;
    const g = 3, w4 = (ancho - 3 * g) / 4, h4 = 17;
    [['TOTAL INTERESES', bs(u.totales.interes)], ['TOTAL SEGUROS', bs(u.totales.desg)], ['TOTAL A PAGAR', bs(u.totales.total)], ['TEAC', `${nf2.format(u.teac * 100)}%`]]
      .forEach(([et, val], i) => {
        const x = M + i * (w4 + g);
        doc.setFillColor(...fondo); doc.roundedRect(x, y, w4, h4, 2.5, 2.5, 'F');
        fuente('normal', 7, gris); doc.text(et, x + 3.5, y + 6, { charSpace: 0.3 });
        fuente('bold', 10.5, i === 2 ? verde : texto); doc.text(val, x + 3.5, y + 12.5);
      });
    y += h4 + 2;
  }

  // ---------- Requisitos ----------
  y += 10;
  titulo('REQUISITOS');
  y += 1;
  const limite = H - 58;   // espacio reservado para el contacto y el pie
  const reqs = requisitosPropuesta(u);
  // Con el detalle de costos, los requisitos van en dos columnas para que todo entre en una hoja
  const cols = V.pdfDetalle === 'si' && reqs.length > 3 ? 2 : 1;
  const wCol = cols === 2 ? (ancho - 6) / 2 : ancho;
  const porCol = Math.ceil(reqs.length / cols);
  const y0 = y; let yMax = y;
  reqs.forEach((r, i) => {
    const c = Math.floor(i / porCol), x = M + c * (wCol + 6);
    if (i % porCol === 0) y = y0;
    const lineas = doc.splitTextToSize(r, wCol - 12);
    if (cols === 1 && y + 8 > limite) { doc.addPage(); y = 22; }
    doc.setDrawColor(...verde); doc.setLineWidth(0.45); doc.roundedRect(x + 0.5, y, 4.6, 4.6, 1, 1, 'S');
    fuente('normal', cols === 2 ? 9.8 : 10.5, texto); doc.text(lineas, x + 9, y + 3.7);
    y += Math.max(7.5, lineas.length * 4.6 + 2.9);
    yMax = Math.max(yMax, y);
  });
  y = yMax;

  // ---------- Contacto del ejecutivo (abajo) ----------
  const hC = 24, yC = Math.max(y + 10, H - 26 - hC);
  if (st.ejecutivo || st.telefonoEjecutivo) {
    doc.setFillColor(...fondo); doc.roundedRect(M, yC, ancho, hC, 3, 3, 'F');
    doc.setFillColor(...verde); doc.roundedRect(M, yC, 2.2, hC, 1.1, 1.1, 'F');
    fuente('normal', 8, gris); doc.text('TU EJECUTIVO DE CUENTA', M + 7, yC + 7, { charSpace: 0.4 });
    fuente('bold', 12, texto); doc.text(st.ejecutivo || '', M + 7, yC + 13.5);
    fuente('normal', 9.5, gris); doc.text([cargoTxt(), sucursalTxt(st.agencia), 'Banco Mercantil Santa Cruz'].filter(Boolean).join(' · '), M + 7, yC + 19);
    if (st.telefonoEjecutivo) {
      fuente('normal', 8, gris); doc.text('CELULAR', M + ancho - 6, yC + 7, { align: 'right', charSpace: 0.4 });
      fuente('bold', 13, verde); doc.text(st.telefonoEjecutivo, M + ancho - 6, yC + 14.5, { align: 'right' });
    }
  }

  // ---------- Pie ----------
  fuente('normal', 7.8, gris);
  const pie = doc.splitTextToSize('Propuesta referencial, sujeta a evaluación y aprobación del banco. Las cuotas son aproximadas: la cuota con tasa variable se estima con la TRe vigente y puede cambiar.', ancho);
  const tieneContacto = !!(st.ejecutivo || st.telefonoEjecutivo);
  doc.text(pie, M, Math.max(H - 12 - (pie.length - 1) * 3.4, tieneContacto ? yC + hC + 5 : 0));
  doc.setFillColor(...dorado); doc.rect(0, H - 4, W, 1, 'F');
  doc.setFillColor(...verdeOsc); doc.rect(0, H - 3, W, 3, 'F');

  // Nombre del archivo: "Propuesta Crédito Consumo - Nombre del Cliente.pdf" (sin caracteres no válidos en archivos)
  const limpio = t => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nombre = `Propuesta Crédito Consumo${limpio(V.nombre) ? ' - ' + limpio(V.nombre) : ''}.pdf`;
  return { doc, nombre };
}

/* Genera el PDF y lo comparte (WhatsApp, Archivos…) o lo descarga si el celular no permite compartir */
async function compartirPropuestaPDF(u) {
  try { await Promise.all([cargarJsPDF(), cargarLogoPDF()]); } catch (e) { toast(e.message + '. Revisa tu conexión.'); return; }
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
