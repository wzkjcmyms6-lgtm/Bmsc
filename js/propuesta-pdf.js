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
  // Todas las letras un 15% más grandes (mismas proporciones entre títulos y textos)
  const ESC = 1.15;
  const fuente = (estilo, tam, color) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam * ESC); doc.setTextColor(...color); };

  // ---------- Encabezado ----------
  doc.setFillColor(...verdeOsc); doc.rect(0, 0, W, 44, 'F');
  doc.setFillColor(...verde); doc.triangle(W * 0.52, 0, W, 0, W, 44, 'F');   // diagonal sutil
  doc.setFillColor(...dorado); doc.rect(0, 44, W, 1.4, 'F');
  let xTit = M;
  if (logoPDF) { try { doc.addImage(logoPDF, 'PNG', M, 10, 24, 24); xTit = M + 30; } catch { /* sin logo */ } }
  fuente('normal', 9, doradoSuave); doc.text('BANCO MERCANTIL SANTA CRUZ', xTit, 16, { charSpace: 0.6 });
  fuente('bold', 19, [255, 255, 255]); doc.text('Propuesta de crédito', xTit, 27);
  fuente('normal', 11, [226, 240, 233]); doc.text('Crédito de consumo', xTit, 34.5);
  fuente('bold', 11, [255, 255, 255]); doc.text(fmtDate(today()), W - M, 16.5, { align: 'right' });

  // ---------- Cliente ----------
  let y = 58;
  fuente('normal', 8.5, gris); doc.text('PREPARADA PARA', M, y, { charSpace: 0.5 });
  fuente('bold', 15, texto); doc.text(V.nombre || 'Cliente', M, y + 8);
  fuente('normal', 9.5, gris); doc.text(persona(V.ci, V.ext, u.eT), M, y + 14.5);
  if (V.codeudor === 'si') {
    fuente('normal', 9.5, gris);
    doc.text(`Codeudor: ${[V.cNombre || 'Sin nombre', persona(V.cCi, V.cExt, u.eC)].filter(Boolean).join(' · ')}`, M, y + 20);
    y += 6;
  }
  y += 22;

  // ---------- Tarjetas principales: monto, plazo y cuota ----------
  const gap = 4, wBox = (ancho - 2 * gap) / 3, hBox = 29;
  const caja = (x, etiqueta, valor, sub, destacada) => {
    if (destacada) { doc.setFillColor(...verde); doc.roundedRect(x, y, wBox, hBox, 3, 3, 'F'); }
    else { doc.setFillColor(...fondo); doc.roundedRect(x, y, wBox, hBox, 3, 3, 'F'); }
    fuente('normal', 7.6, destacada ? doradoSuave : gris); doc.text(etiqueta, x + 5, y + 8.2, { charSpace: 0.3 });
    fuente('bold', 14.5, destacada ? [255, 255, 255] : verde); doc.text(valor, x + 5, y + 18);
    if (sub) { fuente('normal', 8, destacada ? [226, 240, 233] : gris); doc.text(sub, x + 5, y + 24); }
  };
  caja(M, 'MONTO DEL CRÉDITO', bs(u.monto));
  caja(M + wBox + gap, 'PLAZO', `${u.plazo} meses`, `${nf0.format(u.plazo / 12)} ${u.plazo === 12 ? 'año' : 'años'}`);
  caja(M + 2 * (wBox + gap), 'CUOTA MENSUAL APROX.', bs(u.c1.total), 'referencial', true);
  y += hBox + (V.pdfDetalle === 'si' ? 10 : 13);

  // ---------- Títulos y filas ----------
  const titulo = t => {
    doc.setFillColor(...dorado); doc.rect(M, y - 4.6, 1.5, 6, 'F');
    fuente('bold', 11.5, verde); doc.text(t, M + 4.5, y, { charSpace: 0.4 });
    y += 6.5;
  };
  const fila = (etiqueta, valor, fuerte = false, frac = 0.62) => {
    fuente('normal', 10, texto);
    const lineas = doc.splitTextToSize(String(valor), ancho * frac);
    const alto = Math.max(10.5, lineas.length * 5.3 + 5.2);
    fuente('normal', 10, gris); doc.text(etiqueta, M, y + 6.6);
    fuente(fuerte ? 'bold' : 'normal', 10, texto); doc.text(lineas, M + ancho, y + 6.6, { align: 'right' });
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
  const detalle = V.pdfDetalle === 'si';
  // Con el detalle, los seguros ya aparecen con sus tasas más abajo
  if (!detalle) fila('Seguros incluidos', [u.desg && 'Desgravamen', u.dima && 'DIMA', u.ces && 'Cesantía'].filter(Boolean).join(' · ') || 'Sin seguros');

  // Detalle de costos: solo si el ejecutivo lo habilita
  if (detalle) {
    y += 7;
    titulo('DETALLE DE COSTOS (REFERENCIAL)');
    const d = u.desglose(u.c1);
    fila('Primera cuota', [`Capital + interés ${bs(d.capInt)}`, d.desg && `Desgravamen ${bs(d.desg)}`, d.dima && `DIMA ${bs(d.dima)}`, d.ces && `Cesantía ${bs(d.ces)}`].filter(Boolean).join(' · '), false, 0.76);
    const pctS = v => `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(v)}%`;
    fila('Seguros (tasa anual)', [u.desg && `Desgravamen ${pctS(u.desg)}`, u.dima && `DIMA ${pctS(u.dima)}`, u.ces && `Cesantía ${pctS(u.ces)}`].filter(Boolean).join(' · ') || 'Sin seguros', false, 0.76);
    // Totales en 4 casillas
    y += 3;
    const g = 3, w4 = (ancho - 3 * g) / 4, h4 = 19;
    [['TOTAL INTERESES', bs(u.totales.interes)], ['TOTAL SEGUROS', bs(u.totales.desg)], ['TOTAL A PAGAR', bs(u.totales.total)], ['TEAC', `${nf2.format(u.teac * 100)}%`]]
      .forEach(([et, val], i) => {
        const x = M + i * (w4 + g);
        doc.setFillColor(...fondo); doc.roundedRect(x, y, w4, h4, 2.5, 2.5, 'F');
        fuente('normal', 6.6, gris); doc.text(et, x + 3.5, y + 6.8, { charSpace: 0.2 });
        fuente('bold', 10.2, i === 2 ? verde : texto); doc.text(val, x + 3.5, y + 14);
      });
    y += h4;
  }

  // ---------- Requisitos ----------
  y += detalle ? 7 : 10;
  titulo('REQUISITOS');
  y += 1;
  const limite = H - 62;   // espacio reservado para el contacto y el pie
  const reqs = requisitosPropuesta(u);
  // Con el detalle de costos, los requisitos van en dos columnas para que todo entre en una hoja
  const cols = V.pdfDetalle === 'si' && reqs.length > 3 ? 2 : 1;
  const wCol = cols === 2 ? (ancho - 6) / 2 : ancho;
  const porCol = Math.ceil(reqs.length / cols);
  const y0 = y; let yMax = y;
  reqs.forEach((r, i) => {
    const c = Math.floor(i / porCol), x = M + c * (wCol + 6);
    if (i % porCol === 0) y = y0;
    fuente('normal', cols === 2 ? 9.6 : 10.5, texto);
    const lineas = doc.splitTextToSize(r, wCol - 12);
    if (cols === 1 && y + 8 > limite) { doc.addPage(); y = 22; }
    doc.setDrawColor(...verde); doc.setLineWidth(0.5); doc.roundedRect(x + 0.5, y, 5.2, 5.2, 1.1, 1.1, 'S');
    fuente('normal', cols === 2 ? 9.6 : 10.5, texto); doc.text(lineas, x + 9.5, y + 4.3);
    y += cols === 2 ? Math.max(7.8, lineas.length * 5 + 2.8) : Math.max(8.6, lineas.length * 5.4 + 3.2);
    yMax = Math.max(yMax, y);
  });
  y = yMax;

  // ---------- Contacto del ejecutivo (abajo) ----------
  const hC = detalle ? 25 : 28, k = detalle ? 0.88 : 1;
  let yC = Math.max(y + (detalle ? 4 : 7), H - 24 - hC);
  // Si no alcanza el espacio, el contacto pasa a una hoja nueva (nunca se corta)
  if (yC + hC > H - 15.5) { doc.addPage(); yC = 22; }
  if (st.ejecutivo || st.telefonoEjecutivo) {
    doc.setFillColor(...fondo); doc.roundedRect(M, yC, ancho, hC, 3, 3, 'F');
    doc.setFillColor(...verde); doc.roundedRect(M, yC, 2.2, hC, 1.1, 1.1, 'F');
    fuente('normal', 7.6, gris); doc.text('TU EJECUTIVO DE CUENTA', M + 7, yC + 7.5 * k, { charSpace: 0.4 });
    fuente('bold', 12, texto); doc.text(st.ejecutivo || '', M + 7, yC + 15 * k);
    fuente('normal', 8.8, gris); doc.text([cargoTxt(), sucursalTxt(st.agencia)].filter(Boolean).join(' · '), M + 7, yC + 20.5 * k);
    fuente('normal', 8.8, gris); doc.text('Banco Mercantil Santa Cruz', M + 7, yC + 25 * k - (detalle ? 0.4 : 0));
    if (st.telefonoEjecutivo) {
      fuente('normal', 7.6, gris); doc.text('CELULAR', M + ancho - 6, yC + 7.5 * k, { align: 'right', charSpace: 0.4 });
      fuente('bold', 13, verde); doc.text(st.telefonoEjecutivo, M + ancho - 6, yC + 16 * k, { align: 'right' });
    }
  }

  // ---------- Pie ----------
  fuente('normal', 7.8, gris);
  fuente('normal', 7.2, gris);
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
async function compartirPropuestaPDF(u, generar = generarPropuestaPDF) {
  try { await Promise.all([cargarJsPDF(), cargarLogoPDF()]); } catch (e) { toast(e.message + '. Revisa tu conexión.'); return; }
  const { doc, nombre } = generar(u);
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

/* ---------- FRM-CR106: Autorización para investigación de antecedentes ----------
   Réplica del formulario del banco, llenada con la ciudad, la fecha de la propuesta y el nombre
   completo y CI del titular y del codeudor. El cliente lo imprime, firma y escanea. */
const FRM106_TITULO = 'AUTORIZACIÓN PARA INVESTIGACIÓN DE ANTECEDENTES Y ENVÍO DE INFORMACIÓN A LA COMPAÑÍA DE SEGUROS';
const FRM106_TEXTO = [
  'Yo / Nosotros autorizo / autorizamos al Banco Mercantil Santa Cruz S.A. a investigar todos mis / nuestros antecedentes personales y/o comerciales que se encuentren en bases de datos administrados por la Autoridad de Supervisión del Sistema Financiero, por cualquier Buró de Información o por otras entidades públicas o privadas a efectos de que el Banco pueda considerar y evaluar las solicitudes de créditos relacionadas con la documentación adjunta.',
  'Asimismo, autorizo / autorizamos expresamente al Banco efectuar esta labor por intermedio de terceras empresas contratadas para dicho fin bajo los respectivos términos y condiciones de confidencialidad conforme a Ley.',
  'El Banco será propietario exclusivo de toda información que obtenga y no estará obligado a emitir información alguna, ni a restituir los antecedentes que se hubieran recopilado en el curso de las investigaciones emergentes de manera previa a las solicitudes de los créditos relacionados.',
  'En caso que el Banco como tomador, contrate a mi nombre una póliza de seguro de desgravamen, autorizo expresamente a éste a proporcionar información relacionada a mi operación crediticia y a las operaciones relacionadas a la Compañía de Seguros si corresponde a los efectos de la cobertura de la póliza contratada.',
  'Autorizo (amos) que la información que he (hemos) proporcionado al Banco Mercantil Santa Cruz S.A. entidad con la que mantengo relaciones comerciales, sea compartida con las Empresas Financieras Integrantes del Grupo Financiero Mercantil Santa Cruz a la que la mencionada empresa pertenece, con fines relacionados a la prevención de la Legitimación de Ganancias Ilícitas, el Financiamiento al Terrorismo y el Financiamiento de la Proliferación de Armas de Destrucción Masiva.'
];
function generarFRM106PDF(u) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const V = u.V, W = 215.9, M = 25, ancho = W - 2 * M;
  const negro = [0, 0, 0];
  const f = (estilo, tam) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...negro); };
  const firmantes = [{ n: V.nombre, ci: V.ci, ext: V.ext }];
  if (V.codeudor === 'si') firmantes.push({ n: V.cNombre, ci: V.cCi, ext: V.cExt });

  let y = 22;
  f('bold', 9); doc.text('FRM-CR106', M, y);
  y += 10;
  f('bold', 12);
  const tit = doc.splitTextToSize(FRM106_TITULO, ancho - 10);
  doc.text(tit, W / 2, y, { align: 'center' });
  y += tit.length * 5.6 + 8;
  // Ciudad y fecha de la propuesta (día/mes/año)
  const [a, m, d] = today().split('-');
  f('normal', 11); doc.text(`${(V.ciudadFrm || 'La Paz').trim()}, ${d}/${m}/${a}`, W - M, y, { align: 'right' });
  y += 11;
  f('normal', 10.5);
  FRM106_TEXTO.forEach(p => {
    const lineas = doc.splitTextToSize(p, ancho);
    doc.text(lineas, M, y, { align: 'justify', maxWidth: ancho, lineHeightFactor: 1.35 });
    y += lineas.length * 10.5 * 0.3528 * 1.35 + 4.5;
  });
  // Firmas: una por persona (titular y codeudor), en dos columnas
  y = Math.max(y + 26, 205);
  const col = (ancho - 16) / 2;
  firmantes.forEach((p, i) => {
    const x = M + (i % 2) * (col + 16), yy = y + Math.floor(i / 2) * 42;
    doc.setDrawColor(...negro); doc.setLineWidth(0.3); doc.line(x, yy, x + col, yy);
    f('normal', 10); doc.text('Firma', x + col / 2, yy + 5, { align: 'center' });
    f('normal', 10); doc.text('Nombre:', x, yy + 13);
    f('bold', 10); doc.text(doc.splitTextToSize(String(p.n || '').trim().toUpperCase(), col - 17), x + 16, yy + 13);
    f('normal', 10); doc.text('CI:', x, yy + 23);
    f('bold', 10); doc.text(p.ci ? `${p.ci}${p.ext ? ' ' + p.ext : ''}` : '', x + 16, yy + 23);
  });
  const quien = String(V.nombre || '').trim();
  return { doc, nombre: `FRM-CR106 Autorización${quien ? ' - ' + quien : ''}.pdf` };
}

