/* Mi Cartera · Ejecutivo BMSC — lógica de la aplicación */
'use strict';

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysUntil = s => { const d = parseDate(s); if (!d) return null; const t = parseDate(today()); return Math.round((d - t) / 86400000); };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtDate = s => { const d = parseDate(s); return d ? `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` : '—'; };
const fmtShort = s => { const d = parseDate(s); return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : '—'; };
const relDay = s => {
  const n = daysUntil(s);
  if (n === null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
};

/* Acepta "1.234,56", "1234.56", "1234,56" */
function num(v) {
  let s = String(v ?? '').trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const nf2 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const monLabel = m => (m === 'USD' ? '$us' : 'Bs');
const money = (n, m = 'BOB', dec = true) => `${monLabel(m)} ${(dec ? nf2 : nf0).format(n || 0)}`;
const compact = n => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${nf2.format(n / 1e6)} M`;
  if (a >= 1e4) return `${nf0.format(n / 1e3)} mil`;
  return nf0.format(n);
};
const pct = (n, d = 1) => `${(n * 100).toFixed(d).replace('.', ',')}%`;
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const S = () => Store.get();
/* =========================================================
   Tipo de cambio oficial (TCO) del Banco Central de Bolivia
   El BCB lo publica cada día hábil a las 20:00 y rige desde el día hábil siguiente.
   data/tipo-cambio.json se actualiza solo con GitHub Actions; como respaldo se
   consulta una copia pública del mismo dato.
   ========================================================= */
const TC_RESPALDO = 12.22; // último valor conocido, solo si nunca se pudo descargar
const TC_FUENTE_RESPALDO = 'https://raw.githubusercontent.com/frf88/tco-bolivia/main/data/tco_diario.csv';
const TC_TIPOS = { tco: 'Oficial BCB (TCO)', venta: 'Venta referencial (TCO + 0,10)', bmsc: 'TCO del Banco Mercantil' };

function tcDias() { return S().settings.tcData?.dias || []; }
/* Cotización vigente hoy y, si ya se publicó, la de mañana */
function tcEstado() {
  const dias = tcDias();
  const hoy = isoDate(new Date());
  const vigente = [...dias].reverse().find(d => d.desde <= hoy) || dias[0] || null;
  const proximo = dias.find(d => d.desde > hoy) || null;
  const i = vigente ? dias.indexOf(vigente) : -1;
  const anterior = i > 0 ? dias[i - 1] : null;
  return { vigente, proximo, anterior };
}
const tcValor = (d, tipo = S().settings.tcTipo) => !d ? null : tipo === 'venta' ? d.venta : tipo === 'bmsc' ? (d.bmsc || d.tco) : d.tco;
const tc = () => {
  const st = S().settings;
  if (st.tcModo === 'manual' && num(st.tc)) return num(st.tc);
  return tcValor(tcEstado().vigente) || num(st.tc) || TC_RESPALDO;
};
const tcDescripcion = () => S().settings.tcModo === 'manual' && num(S().settings.tc)
  ? 'tipo de cambio manual' : TC_TIPOS[S().settings.tcTipo] || TC_TIPOS.tco;

async function descargarTC() {
  const propia = fetch(`data/tipo-cambio.json?v=${Date.now()}`, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { if (j.ufv?.valor) S().settings.ufv = j.ufv; return j.dias || []; });
  const respaldo = fetch(TC_FUENTE_RESPALDO, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => t.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(c => +c[3] > 0)
      .map(([corte, desde, hasta, v]) => ({ corte, desde, hasta, tco: +v, venta: Math.round((+v + 0.1) * 100) / 100, bmsc: null })));
  const [a, b] = await Promise.allSettled([propia, respaldo]);
  const porCorte = new Map();
  // Primero el respaldo y luego la fuente propia, que tiene prioridad (incluye TCO BMSC)
  for (const r of [b, a]) if (r.status === 'fulfilled') r.value.forEach(d => d.corte && d.tco && porCorte.set(d.corte, { ...porCorte.get(d.corte), ...d, bmsc: d.bmsc ?? porCorte.get(d.corte)?.bmsc ?? null }));
  const dias = [...porCorte.values()].sort((x, y) => x.corte.localeCompare(y.corte)).slice(-90);
  if (!dias.length) throw new Error('sin datos');
  return dias;
}

async function actualizarTC({ avisar = false } = {}) {
  const st = S().settings;
  try {
    const antes = tc();
    const ultimoAntes = tcDias().at(-1)?.corte;
    const dias = await descargarTC();
    st.tcData = { dias, obtenido: new Date().toISOString() };
    Store.save();
    const nuevoCorte = dias.at(-1).corte !== ultimoAntes;
    if (Math.abs(tc() - antes) > 1e-9 || nuevoCorte || avisar) {
      if (ultimoAntes && nuevoCorte) toast(`Dólar oficial actualizado: Bs ${nf2.format(tcValor(dias.at(-1)))}`);
      else if (avisar) toast('Tipo de cambio al día');
      if (!$('#sheet').classList.contains('hidden')) return; // no interrumpir un formulario abierto
      render();
    }
  } catch (e) {
    if (avisar) toast('Sin conexión: se usa el último tipo de cambio guardado');
  }
}
const toBs = (amount, moneda) => (moneda === 'USD' ? amount * tc() : amount);

const tipoInfo = id => CATALOG.tiposCredito.find(t => t.id === id) || { id, label: id || 'Otro', icon: '📄', color: '#6B7A73' };
const estadoInfo = id => CATALOG.estadosCredito.find(e => e.id === id) || CATALOG.estadosCredito[0];
const etapaInfo = id => CATALOG.etapas.find(e => e.id === id) || (id === 'rechazado' ? CATALOG.etapaRechazo : CATALOG.etapas[0]);
const etapaIndex = id => CATALOG.etapas.findIndex(e => e.id === id);
const agendaInfo = id => CATALOG.tiposAgenda.find(t => t.id === id) || CATALOG.tiposAgenda.at(-1);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function phoneDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 8) d = '591' + d; // celular boliviano
  return d;
}
const waLink = (phone, text = '') => `https://wa.me/${phoneDigits(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;

/* =========================================================
   Cálculos de cartera
   ========================================================= */
const activeCredits = c => (c.credits || []).filter(cr => cr.estado !== 'cancelado');
const creditBalance = cr => toBs(num(cr.saldo) || num(cr.monto), cr.moneda);
const clientTotal = c => activeCredits(c).reduce((s, cr) => s + creditBalance(cr), 0);
const clientInMora = c => activeCredits(c).some(cr => cr.estado === 'mora');

function nextPayment(cr) {
  const dia = parseInt(cr.diaPago, 10);
  if (!dia || cr.estado === 'cancelado') return null;
  const t = parseDate(today());
  const mk = (y, m) => new Date(y, m, Math.min(dia, new Date(y, m + 1, 0).getDate()));
  let d = mk(t.getFullYear(), t.getMonth());
  if (d < t) d = mk(t.getFullYear(), t.getMonth() + 1);
  return isoDate(d);
}

/* Cuota estimada (sistema francés) */
function cuotaFrancesa(monto, tasaAnual, meses) {
  const i = tasaAnual / 100 / 12;
  if (!meses) return 0;
  if (!i) return monto / meses;
  return monto * i / (1 - Math.pow(1 + i, -meses));
}

function portfolio() {
  const clients = S().clients.map(c => ({ c, total: clientTotal(c) }));
  clients.sort((a, b) => b.total - a.total);
  const total = clients.reduce((s, x) => s + x.total, 0);
  let acc = 0;
  const info = {};
  clients.forEach((x, i) => {
    const share = total ? x.total / total : 0;
    // Clasificación ABC (Pareto): A hasta 80% acumulado, B hasta 95%, C el resto
    const cls = x.total <= 0 ? 'C' : (acc < 0.8 ? 'A' : acc < 0.95 ? 'B' : 'C');
    acc += share;
    info[x.c.id] = { rank: i + 1, total: x.total, share, cls };
  });
  let mora = 0, nCred = 0;
  const porTipo = {};
  S().clients.forEach(c => activeCredits(c).forEach(cr => {
    const b = creditBalance(cr);
    nCred++;
    if (cr.estado === 'mora') mora += b;
    porTipo[cr.tipo] = (porTipo[cr.tipo] || 0) + b;
  }));
  const top10 = clients.slice(0, 10).reduce((s, x) => s + x.total, 0);
  return { list: clients, total, info, mora, nCred, porTipo, top10Share: total ? top10 / total : 0 };
}

function colocacionMes() {
  const ym = today().slice(0, 7);
  let total = 0, n = 0;
  S().clients.forEach(c => (c.credits || []).forEach(cr => {
    if ((cr.fechaDesembolso || '').startsWith(ym)) { total += toBs(num(cr.monto), cr.moneda); n++; }
  }));
  const nuevos = S().clients.filter(c => (c.creado || '').startsWith(ym)).length;
  return { total, n, nuevos };
}

/* Tareas de agenda + tareas de trámites en una sola lista */
function allTasks() {
  const out = [];
  S().agenda.forEach(e => out.push({
    kind: 'event', id: e.id, fecha: e.fecha, hora: e.hora, titulo: e.titulo, tipo: e.tipo,
    done: e.done, clientId: e.clientId, notas: e.notas
  }));
  S().cases.forEach(k => (k.tareas || []).forEach(t => {
    if (t.fecha) out.push({
      kind: 'task', id: t.id, caseId: k.id, fecha: t.fecha, titulo: t.t, tipo: 'documento',
      done: t.done, clientId: k.clientId, caseName: caseName(k)
    });
  }));
  return out;
}

function caseName(k) {
  const c = k.clientId && Store.client(k.clientId);
  return c ? c.nombre : (k.prospecto || 'Prospecto');
}
const caseOpen = k => k.etapa !== 'desembolsado' && k.etapa !== 'rechazado';

/* Cumpleaños próximos */
function birthdayIn(c) {
  if (!c.fechaNac) return null;
  const b = parseDate(c.fechaNac);
  const t = parseDate(today());
  let d = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (d < t) d = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((d - t) / 86400000);
}

function alerts() {
  const out = [];
  const t = today();
  // Agenda y tareas vencidas / de hoy
  allTasks().filter(x => !x.done && x.fecha <= t).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(x => {
    const overdue = x.fecha < t;
    out.push({
      color: overdue ? 'red' : 'blue', icon: overdue ? 'alert' : 'cal',
      t: x.titulo, s: `${overdue ? 'Vencido ' + relDay(x.fecha) : 'Hoy' + (x.hora ? ' · ' + x.hora : '')}${x.caseName ? ' · ' + x.caseName : ''}`,
      href: x.kind === 'task' ? `#/caso/${x.caseId}` : '#/agenda'
    });
  });
  S().clients.forEach(c => {
    activeCredits(c).forEach(cr => {
      if (cr.estado === 'mora') {
        out.push({ color: 'red', icon: 'alert', t: `${c.nombre} en mora`, s: `${tipoInfo(cr.tipo).label} · ${cr.diasMora ? cr.diasMora + ' días · ' : ''}saldo ${money(num(cr.saldo) || num(cr.monto), cr.moneda)}`, href: `#/cliente/${c.id}` });
      } else {
        const np = nextPayment(cr);
        const d = np && daysUntil(np);
        if (np && d <= 5) {
          out.push({ color: 'gold', icon: 'money', t: `Cuota de ${c.nombre} ${relDay(np)}`, s: `${tipoInfo(cr.tipo).label} · ${fmtShort(np)}${cr.cuota ? ' · ' + money(num(cr.cuota), cr.moneda) : ''}`, href: `#/cliente/${c.id}` });
        }
      }
    });
    const b = birthdayIn(c);
    if (b !== null && b <= 7) {
      out.push({ color: 'green', icon: 'gift', t: `Cumpleaños de ${c.nombre}`, s: b === 0 ? '¡Hoy! Envíale un saludo' : `En ${b} días`, href: `#/cliente/${c.id}` });
    }
  });
  // Trámites estancados
  S().cases.filter(caseOpen).forEach(k => {
    const last = (k.actualizado || k.creado || '').slice(0, 10);
    const d = last ? -daysUntil(last) : 0;
    if (d >= 10) out.push({ color: 'gold', icon: 'clock', t: `Trámite sin movimiento: ${caseName(k)}`, s: `${etapaInfo(k.etapa).label} · ${d} días sin actualizar`, href: `#/caso/${k.id}` });
    if (k.fechaObjetivo && k.fechaObjetivo < t) out.push({ color: 'red', icon: 'clock', t: `Fecha objetivo vencida: ${caseName(k)}`, s: `Objetivo ${fmtShort(k.fechaObjetivo)} · ${etapaInfo(k.etapa).label}`, href: `#/caso/${k.id}` });
  });
  return out;
}

/* =========================================================
   Íconos SVG
   ========================================================= */
const ICONS = {
  alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  money: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 10c0 3 2 5 5 5l1.2-1.2-2-1-1 .8c-1-.4-1.6-1-2-2l.8-1-1-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  calc: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
};

/* =========================================================
   Formularios
   ========================================================= */
function field(o) {
  const { label, name, type = 'text', value = '', options, required, placeholder = '', hint, attrs = '' } = o;
  const req = required ? 'required' : '';
  let input;
  if (type === 'select') {
    input = `<select name="${name}" ${req} ${attrs}>${options.map(op => {
      const v = typeof op === 'object' ? op.v : op;
      const l = typeof op === 'object' ? op.l : op;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea name="${name}" placeholder="${esc(placeholder)}" ${req} ${attrs}>${esc(value)}</textarea>`;
  } else if (type === 'money') {
    input = `<input name="${name}" type="text" inputmode="decimal" value="${esc(value)}" placeholder="${esc(placeholder || '0,00')}" ${req} ${attrs}>`;
  } else {
    input = `<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${req} ${attrs}>`;
  }
  return `<div class="field"><label>${esc(label)}${required ? ' *' : ''}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}
const formData = form => Object.fromEntries(new FormData(form).entries());

/* =========================================================
   Hoja modal
   ========================================================= */
function openSheet(title, html, onMount) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  onMount && onMount($('#sheetBody'));
  const first = $('#sheetBody input:not([type=hidden]), #sheetBody select');
  if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#sheetBody').innerHTML = '';
  document.body.style.overflow = '';
}
$$('#sheet [data-close]').forEach(el => el.addEventListener('click', closeSheet));

/* =========================================================
   Router
   ========================================================= */
const UI = { clientQuery: '', clientSort: 'peso', clientFilter: 'todos', hbTab: 'tramites', hbStage: 'activos', calcTab: 'cuota' };

const ROUTES = {
  '': { title: 'Inicio', nav: 'inicio', render: viewHome },
  'clientes': { title: 'Clientes', nav: 'clientes', render: viewClients },
  'cliente': { title: 'Cliente', nav: 'clientes', render: viewClient, back: '#/clientes' },
  'homebase': { title: 'Home Base', nav: 'homebase', render: viewHomeBase },
  'caso': { title: 'Trámite', nav: 'homebase', render: viewCase, back: '#/homebase' },
  'agenda': { title: 'Agenda', nav: 'mas', render: viewAgenda, back: '#/mas' },
  'mas': { title: 'Más', nav: 'mas', render: viewMore },
  'calculadora': { title: 'Simulador vehicular', nav: 'calculadora', render: () => '' },
  'parametros': { title: 'Parámetros de productos', nav: 'mas', render: () => '', back: '#/mas' },
  'ajustes': { title: 'Ajustes', nav: 'mas', render: viewSettings, back: '#/mas' },
  'respaldo': { title: 'Respaldo de datos', nav: 'mas', render: viewBackup, back: '#/mas' },
  'tipo-cambio': { title: 'Dólar oficial', nav: 'inicio', render: viewTC, back: '#/' },
  'historial': { title: 'Historial de cambios', nav: 'mas', render: viewHistorial, back: '#/mas' }
};

let current = { name: '', param: null };

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, param] = hash.split('/');
  const r = ROUTES[name] ? name : '';
  current = { name: r, param: param ? decodeURIComponent(param) : null };
  const def = ROUTES[r];
  $('#pageTitle').textContent = def.title;
  const st = S().settings;
  $('#pageSub').textContent = [st.ejecutivo, st.agencia].filter(Boolean).join(' · ') || 'Ejecutivo de cuenta · BMSC';
  $('#backBtn').classList.toggle('hidden', !def.back);
  $$('.bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === def.nav));
  closeSheet();
  render();
  window.scrollTo(0, 0);
}
function render() {
  const def = ROUTES[current.name];
  $('#view').innerHTML = def.render(current.param);
  def.after && def.after();
}
window.addEventListener('hashchange', route);
$('#backBtn').addEventListener('click', () => {
  location.hash = ROUTES[current.name].back || '#/';
});

/* =========================================================
   Vista: Inicio
   ========================================================= */
function tcCard() {
  const { vigente, proximo, anterior } = tcEstado();
  const manual = S().settings.tcModo === 'manual' && num(S().settings.tc);
  if (!vigente && !manual) return `<a class="card row between" href="#/tipo-cambio" style="margin-top:10px">
    <span>💵 Dólar oficial: obteniendo cotización del BCB…</span><span class="muted">${ICONS.chev}</span></a>`;
  const v = tc();
  const va = tcValor(anterior);
  const diff = !manual && va ? v - va : 0;
  const flecha = diff > 0 ? `<span style="color:var(--red)">▲ ${nf2.format(diff)}</span>` : diff < 0 ? `<span style="color:var(--green-600)">▼ ${nf2.format(-diff)}</span>` : '';
  return `
  <a class="card" href="#/tipo-cambio" style="display:block;margin-top:10px">
    <div class="row between">
      <div class="row"><div class="icon-dot">💵</div>
        <div><div class="small muted">${manual ? 'Tipo de cambio manual' : 'Dólar oficial BCB · vigente hoy'}</div>
        <div style="font-weight:800;font-size:19px" class="num">Bs ${nf2.format(v)} ${flecha ? `<span class="small">${flecha}</span>` : ''}</div></div>
      </div>
      <div class="right small muted">
        ${!manual && vigente ? `Venta ${nf2.format(vigente.venta)}${vigente.bmsc ? `<br>BMSC ${nf2.format(vigente.bmsc)}` : ''}` : ''}
      </div>
    </div>
    ${!manual && proximo ? `<div class="small" style="margin-top:8px;background:var(--gold-soft);padding:6px 10px;border-radius:8px">
      Nuevo TCO publicado: <b class="num">Bs ${nf2.format(tcValor(proximo))}</b> rige desde ${fmtShort(proximo.desde)}</div>` : ''}
  </a>`;
}

function viewTC() {
  const st = S().settings;
  const { vigente, proximo } = tcEstado();
  const dias = tcDias().slice().reverse();
  const manual = st.tcModo === 'manual' && num(st.tc);
  return `
  <div class="hero">
    <div class="label">${manual ? 'Tipo de cambio manual en uso' : esc(TC_TIPOS[st.tcTipo]) + ' · vigente hoy'}</div>
    <div class="big num">Bs ${nf2.format(tc())}</div>
    ${vigente ? `<div class="meta">
      <div><b class="num">${nf2.format(vigente.tco)}</b>TCO (compra)</div>
      <div><b class="num">${nf2.format(vigente.venta)}</b>venta ref.</div>
      ${vigente.bmsc ? `<div><b class="num">${nf2.format(vigente.bmsc)}</b>TCO BMSC</div>` : ''}
    </div>` : '<div class="small">Aún no se pudo descargar la cotización del BCB.</div>'}
  </div>
  ${proximo ? `<div class="card" style="margin-top:10px;border-color:var(--gold)">
    <b>Nuevo TCO publicado (corte ${fmtShort(proximo.corte)})</b>
    <div class="small muted">Rige desde ${fmtDate(proximo.desde)}${proximo.hasta !== proximo.desde ? ' al ' + fmtDate(proximo.hasta) : ''}:
    TCO <b class="num">${nf2.format(proximo.tco)}</b> · venta <b class="num">${nf2.format(proximo.venta)}</b>${proximo.bmsc ? ` · BMSC <b class="num">${nf2.format(proximo.bmsc)}</b>` : ''}</div>
  </div>` : ''}
  <div class="btn-row" style="margin-top:10px">
    <button class="btn" data-act="refreshTC">↻ Actualizar ahora</button>
    <a class="btn" href="#/ajustes">${ICONS.gear} Configurar</a>
  </div>
  <p class="small muted">El BCB publica el Tipo de Cambio Oficial cada día hábil a las 20:00 y rige desde el día hábil siguiente.
  La app lo revisa sola al abrirse y cada 30 minutos.${st.tcData?.obtenido ? ` Última revisión: ${fmtShort(st.tcData.obtenido.slice(0, 10))} ${st.tcData.obtenido.slice(11, 16)} UTC.` : ''}</p>
  ${dias.length ? `
  <div class="section-title">Historial</div>
  <div class="card tight"><div class="table-wrap" style="max-height:420px">
    <table class="tbl num"><thead><tr><th>Rige desde</th><th>TCO</th><th>Var.</th><th>Venta</th><th>BMSC</th></tr></thead>
    <tbody>${dias.slice(0, 60).map((d, i) => {
      const prev = dias[i + 1];
      const dv = prev ? d.tco - prev.tco : 0;
      return `<tr><td>${fmtShort(d.desde)}${d === vigente ? ' •' : ''}</td><td><b>${nf2.format(d.tco)}</b></td>
        <td style="color:${dv > 0 ? 'var(--red)' : dv < 0 ? 'var(--green-600)' : 'var(--muted)'}">${prev ? (dv > 0 ? '+' : '') + nf2.format(dv) : ''}</td>
        <td>${nf2.format(d.venta)}</td><td>${d.bmsc ? nf2.format(d.bmsc) : '—'}</td></tr>`;
    }).join('')}</tbody></table>
  </div></div>` : ''}
  <p class="small muted center">Fuente: <a class="link" href="https://www.bcb.gob.bo/tco_reporte_ultima_cotizacion.php" target="_blank" rel="noopener">Banco Central de Bolivia</a></p>`;
}

function viewHome() {
  const p = portfolio();
  const st = S().settings;
  const col = colocacionMes();
  const al = alerts();
  const hour = new Date().getHours();
  const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const moraPct = p.total ? p.mora / p.total : 0;
  const open = S().cases.filter(caseOpen);
  const pipeline = open.reduce((s, k) => s + toBs(num(k.monto), k.moneda), 0);

  const tipos = Object.entries(p.porTipo).sort((a, b) => b[1] - a[1]);
  const maxTipo = tipos.length ? tipos[0][1] : 1;

  const metaPct = st.metaMensual ? Math.min(1, col.total / num(st.metaMensual)) : 0;

  return `
  <div class="hero">
    <div class="label">${saludo}${st.ejecutivo ? ', ' + esc(st.ejecutivo.split(' ')[0]) : ''} · Cartera total</div>
    <div class="big num">Bs ${nf0.format(p.total)}</div>
    <div class="meta">
      <div><b class="num">${S().clients.length}</b>clientes</div>
      <div><b class="num">${p.nCred}</b>créditos</div>
      <div><b class="num">${pct(moraPct)}</b>mora</div>
      <div><b class="num">${pct(p.top10Share, 0)}</b>top 10</div>
    </div>
    ${st.metaMensual ? `
      <div style="margin-top:14px">
        <div class="row between small" style="margin-bottom:6px"><span>Meta de colocación del mes</span><span class="num">${pct(metaPct, 0)}</span></div>
        <div class="progress"><span style="width:${metaPct * 100}%"></span></div>
        <div class="small" style="margin-top:6px;opacity:.85">Bs ${nf0.format(col.total)} de Bs ${nf0.format(num(st.metaMensual))} · ${col.n} desembolsos</div>
      </div>` : ''}
  </div>

  ${tcCard()}

  <div class="section-title">Accesos rápidos</div>
  <div class="action-grid">
    <button class="action" data-act="newClient">${ICONS.user}Nuevo cliente</button>
    <button class="action" data-act="newCase">${ICONS.folder}Nuevo trámite</button>
    <button class="action" data-act="newEvent">${ICONS.cal}Agendar</button>
    <a class="action" href="#/calculadora">${ICONS.calc}Calculadora</a>
  </div>

  <div class="grid-2" style="margin-top:10px">
    <a class="card kpi" href="#/homebase"><div class="v num">${open.length}</div><div class="l">Trámites en curso</div></a>
    <a class="card kpi" href="#/homebase"><div class="v num">Bs ${compact(pipeline)}</div><div class="l">Monto en trámite</div></a>
    <div class="card kpi ${p.mora ? 'warn' : ''}"><div class="v num">Bs ${compact(p.mora)}</div><div class="l">Saldo en mora</div></div>
    <div class="card kpi"><div class="v num">${col.nuevos}${st.metaClientes ? ' / ' + st.metaClientes : ''}</div><div class="l">Clientes nuevos este mes</div></div>
  </div>

  <div class="section-title">Pendientes y alertas <span class="badge ${al.length ? 'red' : 'gray'}">${al.length}</span></div>
  <div class="card tight">
    ${al.length ? al.slice(0, 8).map(a => `
      <a class="alert ${a.color}" href="${a.href}">
        <div class="ic">${ICONS[a.icon]}</div>
        <div class="grow"><div class="t">${esc(a.t)}</div><div class="s">${esc(a.s)}</div></div>
      </a>`).join('') + (al.length > 8 ? `<div class="alert"><div class="s">y ${al.length - 8} más…</div></div>` : '')
      : `<div class="empty"><div class="ico">✅</div>Todo al día. Sin pendientes para hoy.</div>`}
  </div>

  <div class="section-title">Clientes con más peso <a href="#/clientes">Ver todos</a></div>
  <div class="card tight">
    ${p.list.length ? p.list.slice(0, 5).map(x => clientRow(x.c, p.info[x.c.id])).join('')
      : `<div class="empty"><div class="ico">👥</div>Aún no registraste clientes.<br><br><button class="btn primary" data-act="newClient">Registrar primer cliente</button>
         <br><br><button class="btn ghost sm" data-act="loadDemo">o cargar datos de ejemplo</button></div>`}
  </div>

  ${tipos.length ? `
  <div class="section-title">Cartera por tipo de crédito</div>
  <div class="card"><div class="bars">
    ${tipos.map(([t, v]) => `
      <div class="bar-row">
        <div class="top"><span>${tipoInfo(t).icon} ${esc(tipoInfo(t).label)}</span><span class="num">Bs ${compact(v)} · ${pct(v / p.total, 0)}</span></div>
        <div class="bar"><span style="width:${(v / maxTipo) * 100}%;background:${tipoInfo(t).color}"></span></div>
      </div>`).join('')}
  </div></div>` : ''}

  ${open.length ? `
  <div class="section-title">Embudo de trámites</div>
  <div class="card"><div class="bars">
    ${CATALOG.etapas.slice(0, 5).map(e => {
      const ks = open.filter(k => k.etapa === e.id);
      const m = ks.reduce((s, k) => s + toBs(num(k.monto), k.moneda), 0);
      return `<div class="bar-row">
        <div class="top"><span>${esc(e.label)} <span class="muted">(${ks.length})</span></span><span class="num">Bs ${compact(m)}</span></div>
        <div class="bar"><span style="width:${pipeline ? (m / pipeline) * 100 : 0}%;background:var(--gold)"></span></div>
      </div>`;
    }).join('')}
  </div></div>` : ''}
  `;
}

function clientRow(c, inf, showShare = true) {
  const mora = clientInMora(c);
  const n = activeCredits(c).length;
  const clsBadge = inf.cls === 'A' ? 'gold' : inf.cls === 'B' ? 'blue' : 'gray';
  return `
  <a class="list-item" href="#/cliente/${c.id}">
    <div class="rank ${inf.rank <= 3 && inf.total > 0 ? 'r' + inf.rank : ''}">${inf.rank}</div>
    <div class="grow">
      <div class="title">${esc(c.nombre)} ${mora ? '<span class="badge red">Mora</span>' : ''}</div>
      <div class="sub">CI ${esc(c.ci)} ${esc(c.ext || '')} · ${n} crédito${n === 1 ? '' : 's'} · <span class="badge ${clsBadge}">${inf.cls}</span></div>
    </div>
    <div class="amount num">Bs ${compact(inf.total)}${showShare ? `<small>${pct(inf.share)}</small>` : ''}</div>
  </a>`;
}

/* =========================================================
   Vista: Clientes
   ========================================================= */
function filteredClients() {
  const p = portfolio();
  const q = UI.clientQuery.trim().toLowerCase();
  let list = S().clients.slice();
  if (q) list = list.filter(c => [c.nombre, c.ci, c.telefono, c.telefono2, c.actividad, c.email, c.empresa].join(' ').toLowerCase().includes(q));
  const f = UI.clientFilter;
  if (f === 'mora') list = list.filter(clientInMora);
  else if (['A', 'B', 'C'].includes(f)) list = list.filter(c => p.info[c.id].cls === f);
  else if (f.startsWith('t:')) list = list.filter(c => activeCredits(c).some(cr => cr.tipo === f.slice(2)));
  const sorters = {
    peso: (a, b) => p.info[b.id].total - p.info[a.id].total,
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
    reciente: (a, b) => (b.creado || '').localeCompare(a.creado || '')
  };
  list.sort(sorters[UI.clientSort]);
  return { p, list };
}

function clientListHTML() {
  const { p, list } = filteredClients();
  return `
  <div class="small muted" style="margin:0 2px 8px">${list.length} cliente${list.length === 1 ? '' : 's'} · Bs ${nf0.format(list.reduce((s, c) => s + p.info[c.id].total, 0))}</div>
  <div class="card tight">
    ${list.length ? list.map(c => clientRow(c, p.info[c.id])).join('')
      : `<div class="empty"><div class="ico">🔍</div>${S().clients.length ? 'Sin resultados' : 'Aún no tienes clientes registrados'}</div>`}
  </div>`;
}

function viewClients() {
  const p = portfolio();
  const usedTipos = [...new Set(S().clients.flatMap(c => activeCredits(c).map(cr => cr.tipo)))];
  const counts = { A: 0, B: 0, C: 0 };
  S().clients.forEach(c => counts[p.info[c.id].cls]++);
  const nMora = S().clients.filter(clientInMora).length;
  const chip = (id, label, n) => `<button class="chip ${UI.clientFilter === id ? 'active' : ''}" data-act="clientFilter" data-id="${id}">${label}${n !== undefined ? `<span class="count">${n}</span>` : ''}</button>`;

  return `
  <div class="row" style="gap:8px;margin-bottom:10px">
    <div class="search grow" style="margin:0">${ICONS.search}<input id="clientSearch" type="search" placeholder="Nombre, CI o teléfono" value="${esc(UI.clientQuery)}"></div>
    <select id="clientSort" class="chip" aria-label="Ordenar">
      <option value="peso" ${UI.clientSort === 'peso' ? 'selected' : ''}>Mayor peso</option>
      <option value="nombre" ${UI.clientSort === 'nombre' ? 'selected' : ''}>Nombre A-Z</option>
      <option value="reciente" ${UI.clientSort === 'reciente' ? 'selected' : ''}>Recientes</option>
    </select>
  </div>
  <div class="chips">
    ${chip('todos', 'Todos', S().clients.length)}
    ${chip('A', 'Clase A', counts.A)}
    ${chip('B', 'Clase B', counts.B)}
    ${chip('C', 'Clase C', counts.C)}
    ${nMora ? chip('mora', '⚠️ En mora', nMora) : ''}
    ${usedTipos.map(t => chip('t:' + t, tipoInfo(t).icon + ' ' + tipoInfo(t).label)).join('')}
  </div>
  <div id="clientList">${clientListHTML()}</div>
  <button class="btn primary block" data-act="newClient" style="margin-top:6px">${ICONS.plus} Registrar cliente</button>
  <p class="small muted center" style="margin-top:14px">Clase A: clientes que suman el 80% de tu cartera · B: siguiente 15% · C: resto.<br>
  Créditos en $us convertidos a <a class="link" href="#/tipo-cambio">Bs ${nf2.format(tc())} (${esc(tcDescripcion())})</a>.</p>
  `;
}
ROUTES.clientes.after = () => {
  $('#clientSearch').addEventListener('input', e => { UI.clientQuery = e.target.value; $('#clientList').innerHTML = clientListHTML(); });
  $('#clientSort').addEventListener('change', e => { UI.clientSort = e.target.value; $('#clientList').innerHTML = clientListHTML(); });
};

/* =========================================================
   Vista: Detalle de cliente
   ========================================================= */
function viewClient(id) {
  const c = Store.client(id);
  if (!c) return `<div class="empty"><div class="ico">🤷</div>Cliente no encontrado<br><br><a class="btn" href="#/clientes">Volver</a></div>`;
  const p = portfolio();
  const inf = p.info[c.id];
  const credits = (c.credits || []).slice().sort((a, b) => (a.estado === 'cancelado') - (b.estado === 'cancelado') || creditBalance(b) - creditBalance(a));
  const cases = S().cases.filter(k => k.clientId === c.id);
  const events = allTasks().filter(t => t.clientId === c.id && !t.done).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const b = birthdayIn(c);
  const clsBadge = inf.cls === 'A' ? 'gold' : inf.cls === 'B' ? 'blue' : 'gray';
  $('#pageTitle').textContent = c.nombre;

  return `
  <div class="card">
    <div class="row">
      <div class="avatar" style="width:52px;height:52px;font-size:18px">${esc(initials(c.nombre))}</div>
      <div class="grow">
        <div style="font-weight:700;font-size:17px">${esc(c.nombre)}</div>
        <div class="small muted">CI ${esc(c.ci)} ${esc(c.ext || '')}${c.segmento ? ' · ' + esc(c.segmento) : ''}</div>
        <div style="margin-top:4px" class="row wrap" >
          <span class="badge ${clsBadge}">Clase ${inf.cls}</span>
          <span class="badge gray">#${inf.rank} de ${S().clients.length}</span>
          ${clientInMora(c) ? '<span class="badge red">En mora</span>' : ''}
        </div>
      </div>
    </div>
    <div class="grid-2" style="margin-top:12px">
      <div><div class="small muted">Saldo total</div><div style="font-weight:800;font-size:19px" class="num">Bs ${nf2.format(inf.total)}</div></div>
      <div><div class="small muted">Peso en tu cartera</div><div style="font-weight:800;font-size:19px" class="num">${pct(inf.share)}</div></div>
    </div>
  </div>

  <div class="action-grid">
    ${c.telefono ? `<a class="action" href="tel:${esc(c.telefono)}">${ICONS.phone}Llamar</a>` : ''}
    ${c.telefono ? `<a class="action" target="_blank" rel="noopener" href="${waLink(c.telefono, `Hola ${c.nombre.split(' ')[0]}, le saluda ${S().settings.ejecutivo || 'su ejecutivo de cuenta'} del Banco Mercantil Santa Cruz.`)}">${ICONS.wa}WhatsApp</a>` : ''}
    <button class="action" data-act="newEvent" data-client="${c.id}">${ICONS.cal}Agendar</button>
    <button class="action" data-act="newCase" data-client="${c.id}">${ICONS.folder}Trámite</button>
  </div>

  <div class="section-title">Créditos (${credits.length}) <a data-act="newCredit" data-id="${c.id}">+ Agregar</a></div>
  ${credits.length ? credits.map(cr => creditCard(c, cr)).join('') :
    `<div class="card empty"><div class="ico">💳</div>Sin créditos registrados<br><br><button class="btn primary sm" data-act="newCredit" data-id="${c.id}">Agregar crédito</button></div>`}

  ${cases.length ? `
  <div class="section-title">Trámites en Home Base</div>
  <div class="card tight">${cases.map(caseRow).join('')}</div>` : ''}

  ${events.length ? `
  <div class="section-title">Próximas actividades</div>
  <div class="card tight">${events.slice(0, 5).map(taskRow).join('')}</div>` : ''}

  <div class="section-title">Datos del cliente</div>
  <div class="card">
    <dl class="kv">
      <dt>Celular</dt><dd>${esc(c.telefono) || '—'}</dd>
      ${c.telefono2 ? `<dt>Otro teléfono</dt><dd>${esc(c.telefono2)}</dd>` : ''}
      ${c.email ? `<dt>Correo</dt><dd>${esc(c.email)}</dd>` : ''}
      ${c.actividad ? `<dt>Actividad</dt><dd>${esc(c.actividad)}</dd>` : ''}
      ${c.empresa ? `<dt>Empresa / negocio</dt><dd>${esc(c.empresa)}</dd>` : ''}
      ${c.ingreso ? `<dt>Ingreso mensual</dt><dd class="num">Bs ${nf2.format(num(c.ingreso))}</dd>` : ''}
      ${c.direccion ? `<dt>Dirección</dt><dd>${esc(c.direccion)}</dd>` : ''}
      ${c.fechaNac ? `<dt>Cumpleaños</dt><dd>${fmtShort(c.fechaNac)}${b !== null && b <= 7 ? ' 🎂' : ''}</dd>` : ''}
      <dt>Registrado</dt><dd>${fmtShort((c.creado || '').slice(0, 10))}</dd>
    </dl>
    ${c.notas ? `<p style="margin:12px 0 0;white-space:pre-wrap" class="small">${esc(c.notas)}</p>` : ''}
    ${c.direccion ? `<a class="btn sm" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}">📍 Ver en mapa</a>` : ''}
  </div>

  ${crossSell(c)}

  ${window.Nube && Nube.estado !== 'sin-configurar' ? `<a class="btn block" style="margin-top:14px" href="#/historial/${c.id}">${ICONS.clock} Historial de cambios del cliente</a>` : ''}
  <div class="btn-row" style="margin-top:14px">
    <button class="btn" data-act="editClient" data-id="${c.id}">${ICONS.edit} Editar</button>
    <button class="btn danger" data-act="deleteClient" data-id="${c.id}">Eliminar</button>
  </div>`;
}

function creditCard(c, cr) {
  const t = tipoInfo(cr.tipo);
  const e = estadoInfo(cr.estado);
  const monto = num(cr.monto), saldo = num(cr.saldo) || monto;
  const pagado = monto ? Math.max(0, Math.min(1, 1 - saldo / monto)) : 0;
  const np = nextPayment(cr);
  const cuota = num(cr.cuota) || (cr.tasa && cr.plazo ? cuotaFrancesa(monto, num(cr.tasa), parseInt(cr.plazo, 10)) : 0);
  return `
  <div class="card" data-act="editCredit" data-id="${cr.id}" data-client="${c.id}" style="cursor:pointer;${cr.estado === 'cancelado' ? 'opacity:.6' : ''}">
    <div class="row between">
      <div class="row"><div class="icon-dot" style="background:${t.color}22">${t.icon}</div>
        <div><div style="font-weight:700">${esc(t.label)}</div><div class="small muted">${cr.operacion ? 'Op. ' + esc(cr.operacion) + ' · ' : ''}${cr.fechaDesembolso ? 'Desemb. ' + fmtShort(cr.fechaDesembolso) : ''}</div></div>
      </div>
      <span class="badge ${e.badge}">${e.label}${cr.estado === 'mora' && cr.diasMora ? ' ' + cr.diasMora + 'd' : ''}</span>
    </div>
    <div class="grid-2" style="margin-top:10px">
      <div><div class="small muted">Saldo</div><div style="font-weight:800" class="num">${money(saldo, cr.moneda)}</div></div>
      <div><div class="small muted">Monto original</div><div style="font-weight:600" class="num">${money(monto, cr.moneda)}</div></div>
    </div>
    <div style="margin:10px 0 4px" class="progress gold"><span style="width:${pagado * 100}%"></span></div>
    <div class="row between small muted">
      <span>${pct(pagado, 0)} pagado${cr.tasa ? ' · ' + esc(cr.tasa) + '%' : ''}${cr.plazo ? ' · ' + esc(cr.plazo) + ' m' : ''}</span>
      <span>${np && cr.estado !== 'mora' ? 'Cuota ' + fmtShort(np) + (cuota ? ' · ' + money(cuota, cr.moneda) : '') : ''}</span>
    </div>
    ${cr.garantia ? `<div class="small muted" style="margin-top:6px">Garantía: ${esc(cr.garantia)}</div>` : ''}
  </div>`;
}

/* Sugerencias de venta cruzada / renovación */
function crossSell(c) {
  const tips = [];
  const act = activeCredits(c);
  const tipos = act.map(cr => cr.tipo);
  act.forEach(cr => {
    const m = num(cr.monto), s = num(cr.saldo) || m;
    if (m && cr.estado === 'vigente' && s / m <= 0.5) tips.push(`Su ${tipoInfo(cr.tipo).label.toLowerCase()} ya está pagado en ${pct(1 - s / m, 0)}: candidato a renovación o nuevo crédito.`);
  });
  if (act.length && !tipos.includes('tarjeta') && !clientInMora(c)) tips.push('No tiene tarjeta de crédito: ofrécela como producto de vinculación.');
  if (act.length && !tipos.includes('linea') && ['Independiente', 'Profesional independiente'].includes(c.segmento)) tips.push('Ingresos variables: una línea de crédito rotativa le da liquidez cuando la necesita.');
  if (c.segmento === 'Asalariado' && !tipos.includes('vivienda') && !tipos.includes('vivienda_social')) tips.push('Evalúa si califica a crédito de vivienda de interés social.');
  if (!tips.length) return '';
  return `<div class="section-title">Oportunidades</div>
  <div class="card tight">${tips.map(t => `<div class="alert green"><div class="ic">${ICONS.bulb}</div><div class="grow"><div class="s" style="color:var(--text)">${esc(t)}</div></div></div>`).join('')}</div>`;
}

/* =========================================================
   Formularios de cliente y crédito
   ========================================================= */
function clientForm(c = {}, onSaved) {
  const isNew = !c.id;
  openSheet(isNew ? 'Nuevo cliente' : 'Editar cliente', `
    <form id="fClient">
      ${field({ label: 'Nombre completo', name: 'nombre', value: c.nombre, required: true, placeholder: 'Ej. María Fernández Rojas', attrs: 'autocomplete="off"' })}
      <div class="fields-3">
        ${field({ label: 'Carnet de identidad', name: 'ci', value: c.ci, required: true, attrs: 'inputmode="numeric" autocomplete="off"', placeholder: '1234567' })}
        ${field({ label: 'Extensión', name: 'ext', type: 'select', value: c.ext || 'SC', options: CATALOG.extensiones })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Celular', name: 'telefono', type: 'tel', value: c.telefono, required: true, placeholder: '7XXXXXXX' })}
        ${field({ label: 'Otro teléfono', name: 'telefono2', type: 'tel', value: c.telefono2 })}
      </div>
      ${field({ label: 'Correo electrónico', name: 'email', type: 'email', value: c.email })}
      <div class="fields-2">
        ${field({ label: 'Segmento', name: 'segmento', type: 'select', value: c.segmento, options: ['', ...CATALOG.segmentos] })}
        ${field({ label: 'Fecha de nacimiento', name: 'fechaNac', type: 'date', value: c.fechaNac })}
      </div>
      ${field({ label: 'Actividad económica / ocupación', name: 'actividad', value: c.actividad })}
      <div class="fields-2">
        ${field({ label: 'Empresa o negocio', name: 'empresa', value: c.empresa })}
        ${field({ label: 'Ingreso mensual (Bs)', name: 'ingreso', type: 'money', value: c.ingreso })}
      </div>
      ${field({ label: 'Dirección', name: 'direccion', value: c.direccion })}
      ${field({ label: 'Notas', name: 'notas', type: 'textarea', value: c.notas })}
      <p id="ciWarn" class="error-text"></p>
      <button class="btn primary block" type="submit">${isNew ? 'Registrar cliente' : 'Guardar cambios'}</button>
    </form>`, body => {
    const form = $('#fClient', body);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = formData(form);
      d.nombre = d.nombre.trim();
      d.ci = d.ci.trim();
      const dup = S().clients.find(x => x.ci === d.ci && x.id !== c.id);
      if (dup && !form.dataset.dupOk) {
        $('#ciWarn').textContent = `Ya existe un cliente con CI ${d.ci}: ${dup.nombre}. Presiona guardar otra vez para continuar.`;
        form.dataset.dupOk = '1';
        return;
      }
      const saved = Store.upsertClient({ ...c, ...d });
      closeSheet();
      toast(isNew ? 'Cliente registrado' : 'Cambios guardados');
      if (onSaved) onSaved(saved);
      else if (isNew) location.hash = `#/cliente/${saved.id}`;
      else render();
    });
  });
}

function creditForm(clientId, cr = {}, onSaved) {
  const isNew = !cr.id;
  const tipos = CATALOG.tiposCredito.map(t => ({ v: t.id, l: `${t.icon} ${t.label}` }));
  openSheet(isNew ? 'Nuevo crédito' : 'Editar crédito', `
    <form id="fCredit">
      ${field({ label: 'Tipo de crédito', name: 'tipo', type: 'select', value: cr.tipo || 'consumo', options: tipos })}
      <div class="fields-2">
        ${field({ label: 'Moneda', name: 'moneda', type: 'select', value: cr.moneda || 'BOB', options: CATALOG.monedas.map(m => ({ v: m.id, l: m.nombre })) })}
        ${field({ label: 'N° de operación', name: 'operacion', value: cr.operacion, attrs: 'autocomplete="off"' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Monto desembolsado', name: 'monto', type: 'money', value: cr.monto, required: true })}
        ${field({ label: 'Saldo actual', name: 'saldo', type: 'money', value: cr.saldo, hint: 'Vacío = monto total' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Tasa anual %', name: 'tasa', type: 'money', value: cr.tasa, placeholder: '0,00' })}
        ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'number', value: cr.plazo, attrs: 'inputmode="numeric" min="1"' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Fecha de desembolso', name: 'fechaDesembolso', type: 'date', value: cr.fechaDesembolso })}
        ${field({ label: 'Día de pago', name: 'diaPago', type: 'number', value: cr.diaPago, attrs: 'inputmode="numeric" min="1" max="31"', placeholder: '1-31' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Cuota mensual', name: 'cuota', type: 'money', value: cr.cuota, hint: 'Vacío = se estima' })}
        ${field({ label: 'Estado', name: 'estado', type: 'select', value: cr.estado || 'vigente', options: CATALOG.estadosCredito.map(e => ({ v: e.id, l: e.label })) })}
      </div>
      <div id="moraWrap" class="${cr.estado === 'mora' ? '' : 'hidden'}">
        ${field({ label: 'Días de mora', name: 'diasMora', type: 'number', value: cr.diasMora, attrs: 'inputmode="numeric" min="0"' })}
      </div>
      ${field({ label: 'Garantía', name: 'garantia', value: cr.garantia, placeholder: 'Hipotecaria, prendaria, personal…' })}
      <button class="btn primary block" type="submit">${isNew ? 'Agregar crédito' : 'Guardar cambios'}</button>
      ${isNew ? '' : `<button class="btn danger block" type="button" id="delCredit" style="margin-top:8px">Eliminar crédito</button>`}
    </form>`, body => {
    const form = $('#fCredit', body);
    form.estado.addEventListener('change', () => $('#moraWrap').classList.toggle('hidden', form.estado.value !== 'mora'));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = formData(form);
      if (!num(d.monto)) { toast('Ingresa el monto del crédito'); return; }
      ['monto', 'saldo', 'tasa', 'cuota'].forEach(k => { d[k] = d[k] === '' ? '' : num(d[k]); });
      Store.upsertCredit(clientId, { ...cr, ...d });
      closeSheet();
      toast(isNew ? 'Crédito agregado' : 'Crédito actualizado');
      onSaved ? onSaved() : render();
    });
    const del = $('#delCredit', body);
    del && del.addEventListener('click', () => {
      if (!confirm('¿Eliminar este crédito? Si fue pagado, puedes marcarlo como "Cancelado" en lugar de eliminarlo.')) return;
      Store.deleteCredit(clientId, cr.id);
      closeSheet(); toast('Crédito eliminado'); render();
    });
  });
}

/* =========================================================
   Vista: Home Base (trámites, guías, consejos)
   ========================================================= */
function reqProgress(k) {
  const r = k.requisitos || [];
  const done = r.filter(x => x.done).length;
  return { done, total: r.length, pct: r.length ? done / r.length : 0 };
}
function stepper(k) {
  const idx = etapaIndex(k.etapa);
  return `<div class="stepper">${CATALOG.etapas.map((e, i) =>
    `<span class="${k.etapa === 'rechazado' ? 'rej' : i <= idx ? 'on' : ''}"></span>`).join('')}</div>`;
}
function caseRow(k) {
  const rp = reqProgress(k);
  const t = tipoInfo(k.tipo);
  const e = etapaInfo(k.etapa);
  const next = (k.tareas || []).filter(x => !x.done).sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'))[0];
  const prio = k.prioridad === 'alta' ? '<span class="badge red">Alta</span>' : k.prioridad === 'baja' ? '<span class="badge gray">Baja</span>' : '';
  const badge = k.etapa === 'rechazado' ? 'red' : k.etapa === 'desembolsado' ? '' : k.etapa === 'aprobado' ? 'blue' : 'gold';
  return `
  <a class="list-item" href="#/caso/${k.id}" style="display:block">
    <div class="row between">
      <div class="grow"><div class="title">${t.icon} ${esc(caseName(k))} ${prio}</div>
      <div class="sub">${esc(t.label)} · ${money(num(k.monto), k.moneda, false)}${k.clientId ? '' : ' · prospecto'}</div></div>
      <span class="badge ${badge}">${esc(e.label)}</span>
    </div>
    ${stepper(k)}
    <div class="row between small muted">
      <span>📋 ${rp.done}/${rp.total} requisitos</span>
      <span>${next ? '⏭ ' + esc(next.t).slice(0, 34) + (next.fecha ? ' · ' + fmtShort(next.fecha) : '') : ''}</span>
    </div>
  </a>`;
}

function viewHomeBase() {
  const tab = UI.hbTab;
  const seg = `<div class="segmented">
    <button class="${tab === 'tramites' ? 'active' : ''}" data-act="hbTab" data-id="tramites">Trámites</button>
    <button class="${tab === 'guias' ? 'active' : ''}" data-act="hbTab" data-id="guias">Guías</button>
    <button class="${tab === 'consejos' ? 'active' : ''}" data-act="hbTab" data-id="consejos">Consejos</button>
  </div>`;
  if (tab === 'guias') return seg + viewGuidesList();
  if (tab === 'consejos') return seg + viewTips();

  const all = S().cases;
  const open = all.filter(caseOpen);
  const st = UI.hbStage;
  let list = st === 'activos' ? open : st === 'todos' ? all : all.filter(k => k.etapa === st);
  list = list.slice().sort((a, b) => {
    const pr = { alta: 0, media: 1, baja: 2 };
    return (pr[a.prioridad] ?? 1) - (pr[b.prioridad] ?? 1) || etapaIndex(b.etapa) - etapaIndex(a.etapa) || (b.actualizado || '').localeCompare(a.actualizado || '');
  });
  const pipeline = open.reduce((s, k) => s + toBs(num(k.monto), k.moneda), 0);
  const chip = (id, label, n) => `<button class="chip ${st === id ? 'active' : ''}" data-act="hbStage" data-id="${id}">${esc(label)}<span class="count">${n}</span></button>`;
  const docsPend = open.reduce((s, k) => s + (reqProgress(k).total - reqProgress(k).done), 0);

  return seg + `
  <div class="grid-2">
    <div class="card kpi"><div class="v num">${open.length}</div><div class="l">En curso · Bs ${compact(pipeline)}</div></div>
    <div class="card kpi"><div class="v num">${docsPend}</div><div class="l">Requisitos pendientes</div></div>
  </div>
  <div class="chips">
    ${chip('activos', 'En curso', open.length)}
    ${CATALOG.etapas.map(e => chip(e.id, e.label, all.filter(k => k.etapa === e.id).length)).join('')}
    ${chip('rechazado', 'Rechazados', all.filter(k => k.etapa === 'rechazado').length)}
    ${chip('todos', 'Todos', all.length)}
  </div>
  <div class="card tight">
    ${list.length ? list.map(caseRow).join('') : `<div class="empty"><div class="ico">🗂️</div>No hay trámites aquí.<br><br>
      Crea un trámite para seguir sus requisitos, tareas y etapas hasta el desembolso.</div>`}
  </div>
  <button class="btn primary block" data-act="newCase" style="margin-top:6px">${ICONS.plus} Nuevo trámite</button>`;
}

function viewGuidesList() {
  return `
  <p class="small muted" style="margin:0 2px 10px">Requisitos y buenas prácticas por tipo de crédito. Al crear un trámite, el checklist se carga automáticamente y puedes adaptarlo.</p>
  ${CATALOG.tiposCredito.map(t => {
    const g = GUIDES[t.id];
    if (!g) return '';
    return `<details class="guide">
      <summary><span class="icon-dot">${t.icon}</span>${esc(t.label)}<span class="chev">${ICONS.chev}</span></summary>
      <div class="body">
        <p class="muted" style="margin:0">${esc(g.resumen)}</p>
        <h4>Requisitos</h4><ul>${g.requisitos.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h4>Consejos</h4><ul>${g.consejos.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn sm primary" data-act="newCase" data-tipo="${t.id}">Iniciar trámite</button>
          <button class="btn sm" data-act="shareReqs" data-tipo="${t.id}">${ICONS.wa} Enviar requisitos</button>
        </div>
      </div>
    </details>`;
  }).join('')}
  <div class="section-title">Etapas del trámite</div>
  <div class="card">${CATALOG.etapas.map((e, i) => `
    <div style="margin-bottom:10px"><b>${i + 1}. ${esc(e.label)}</b>
    <ul class="small muted" style="margin:4px 0 0;padding-left:18px">${e.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
  </div>
  <p class="small muted center">Contenido referencial. Valida siempre con la normativa interna vigente del banco y de ASFI.</p>`;
}

function viewTips() {
  return TIPS_GENERALES.map(t => `
    <div class="card"><div class="row" style="align-items:flex-start"><div class="icon-dot">💡</div>
    <div><div style="font-weight:700">${esc(t.t)}</div><div class="small muted" style="margin-top:2px">${esc(t.d)}</div></div></div></div>`).join('');
}

/* =========================================================
   Vista: Detalle de trámite
   ========================================================= */
function viewCase(id) {
  const k = Store.caseById(id);
  if (!k) return `<div class="empty"><div class="ico">🤷</div>Trámite no encontrado<br><br><a class="btn" href="#/homebase">Volver</a></div>`;
  const t = tipoInfo(k.tipo);
  const c = k.clientId && Store.client(k.clientId);
  const rp = reqProgress(k);
  const idx = etapaIndex(k.etapa);
  const e = etapaInfo(k.etapa);
  const tareas = (k.tareas || []).slice().sort((a, b) => a.done - b.done || (a.fecha || '9').localeCompare(b.fecha || '9'));
  const phone = c ? c.telefono : k.telefono;
  const cuota = k.tasa && k.plazo ? cuotaFrancesa(num(k.monto), num(k.tasa), parseInt(k.plazo, 10)) : 0;
  $('#pageTitle').textContent = caseName(k);

  return `
  <div class="card">
    <div class="row between">
      <div class="row"><div class="icon-dot" style="background:${t.color}22">${t.icon}</div>
      <div><div style="font-weight:700">${esc(t.label)}</div>
      <div class="small muted">${c ? `<a class="link" href="#/cliente/${c.id}">${esc(c.nombre)}</a>` : 'Prospecto: ' + esc(k.prospecto || '')}</div></div></div>
      ${k.prioridad === 'alta' ? '<span class="badge red">Prioridad alta</span>' : ''}
    </div>
    <div class="grid-2" style="margin-top:12px">
      <div><div class="small muted">Monto solicitado</div><div class="num" style="font-weight:800;font-size:18px">${money(num(k.monto), k.moneda)}</div></div>
      <div><div class="small muted">${cuota ? 'Cuota estimada' : 'Fecha objetivo'}</div><div class="num" style="font-weight:700">${cuota ? money(cuota, k.moneda) : (k.fechaObjetivo ? fmtShort(k.fechaObjetivo) : '—')}</div></div>
    </div>
    ${k.destino ? `<div class="small muted" style="margin-top:8px">Destino: ${esc(k.destino)}</div>` : ''}
    ${k.tasa || k.plazo ? `<div class="small muted">${k.tasa ? 'Tasa ' + esc(k.tasa) + '%' : ''}${k.plazo ? ' · ' + esc(k.plazo) + ' meses' : ''}${cuota && k.fechaObjetivo ? ' · Objetivo ' + fmtShort(k.fechaObjetivo) : ''}</div>` : ''}
  </div>

  <div class="section-title">Etapa: ${esc(e.label)}</div>
  <div class="card">
    <div class="stage-list">
      ${CATALOG.etapas.map((s, i) => `
        <div class="stage ${k.etapa === 'rechazado' ? '' : i < idx ? 'done' : i === idx ? 'current' : ''}">
          <div class="dot">${i < idx && k.etapa !== 'rechazado' ? '✓' : i + 1}</div><div>${esc(s.label)}</div>
        </div>`).join('')}
      ${k.etapa === 'rechazado' ? `<div class="stage"><div class="dot" style="background:var(--red);border-color:var(--red);color:#fff">✕</div><div style="color:var(--red);font-weight:700">Rechazado / Desistido${k.motivoRechazo ? ': ' + esc(k.motivoRechazo) : ''}</div></div>` : ''}
    </div>
    ${caseOpen(k) ? `
      <div class="small" style="background:var(--gold-soft);padding:10px 12px;border-radius:10px;margin:10px 0">
        <b>Qué hacer en esta etapa:</b>
        <ul style="margin:4px 0 0;padding-left:18px">${e.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
      <div class="btn-row">
        ${idx > 0 ? `<button class="btn sm" data-act="stagePrev" data-id="${k.id}">← Anterior</button>` : ''}
        <button class="btn sm primary" data-act="stageNext" data-id="${k.id}">Avanzar a ${esc(CATALOG.etapas[idx + 1]?.label || '')} →</button>
      </div>
      <button class="btn sm ghost block" data-act="stageReject" data-id="${k.id}" style="margin-top:6px;color:var(--red)">Marcar como rechazado / desistido</button>`
    : `<button class="btn sm block" data-act="stageReopen" data-id="${k.id}" style="margin-top:10px">Reabrir trámite</button>`}
  </div>

  <div class="section-title">Requisitos ${rp.done}/${rp.total} <a data-act="addReq" data-id="${k.id}">+ Agregar</a></div>
  <div class="progress" style="margin-bottom:8px"><span style="width:${rp.pct * 100}%"></span></div>
  <div class="card tight">
    ${(k.requisitos || []).map((r, i) => `
      <label class="check ${r.done ? 'done' : ''}">
        <input type="checkbox" data-act="toggleReq" data-id="${k.id}" data-i="${i}" ${r.done ? 'checked' : ''}>
        <span class="t">${esc(r.t)}</span>
        <button class="del" data-act="delReq" data-id="${k.id}" data-i="${i}" aria-label="Quitar">${ICONS.x}</button>
      </label>`).join('') || '<div class="empty">Sin requisitos</div>'}
  </div>
  ${phone && rp.done < rp.total ? `<a class="btn block" target="_blank" rel="noopener" href="${waLink(phone, pendingReqMessage(k))}">${ICONS.wa} Pedir documentos pendientes por WhatsApp</a>` : ''}

  <div class="section-title">Tareas <a data-act="addTask" data-id="${k.id}">+ Agregar</a></div>
  <div class="card tight">
    ${tareas.map(x => `
      <label class="check ${x.done ? 'done' : ''}">
        <input type="checkbox" data-act="toggleTask" data-id="${k.id}" data-task="${x.id}" ${x.done ? 'checked' : ''}>
        <span class="t">${esc(x.t)}${x.fecha ? `<br><span class="small ${!x.done && x.fecha < today() ? '' : 'muted'}" style="${!x.done && x.fecha < today() ? 'color:var(--red)' : ''}">${fmtDate(x.fecha)} · ${relDay(x.fecha)}</span>` : ''}</span>
        <button class="del" data-act="delTask" data-id="${k.id}" data-task="${x.id}" aria-label="Quitar">${ICONS.x}</button>
      </label>`).join('') || '<div class="empty small">Sin tareas. Agrega pendientes con fecha y aparecerán en tu agenda.</div>'}
  </div>

  <div class="section-title">Bitácora <a data-act="addLog" data-id="${k.id}">+ Nota</a></div>
  <div class="card">
    ${(k.bitacora || []).length ? `<div class="timeline">${k.bitacora.slice().reverse().map(b => `
      <div class="ev"><div class="d">${fmtDate(b.fecha.slice(0, 10))}</div>${esc(b.t)}</div>`).join('')}</div>` : '<div class="muted small">Sin registros aún.</div>'}
  </div>

  <div class="btn-row" style="margin-top:14px">
    <button class="btn" data-act="editCase" data-id="${k.id}">${ICONS.edit} Editar</button>
    <button class="btn danger" data-act="deleteCase" data-id="${k.id}">Eliminar</button>
  </div>`;
}

function pendingReqMessage(k) {
  const c = k.clientId && Store.client(k.clientId);
  const name = (c ? c.nombre : k.prospecto || '').split(' ')[0];
  const pend = (k.requisitos || []).filter(r => !r.done).map(r => `• ${r.t}`).join('\n');
  return `Hola ${name}, para continuar con su solicitud de crédito ${tipoInfo(k.tipo).label.toLowerCase()} necesitamos los siguientes documentos:\n\n${pend}\n\nQuedo atento(a). ${S().settings.ejecutivo || ''} - Banco Mercantil Santa Cruz`;
}

function caseForm(k = {}, preset = {}) {
  const isNew = !k.id;
  const data = { ...preset, ...k };
  const clients = S().clients.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  openSheet(isNew ? 'Nuevo trámite' : 'Editar trámite', `
    <form id="fCase">
      ${field({ label: 'Cliente', name: 'clientId', type: 'select', value: data.clientId || '', options: [{ v: '', l: '➕ Prospecto (aún no es cliente)' }, ...clients.map(c => ({ v: c.id, l: `${c.nombre} · CI ${c.ci}` }))] })}
      <div id="prospectFields" class="${data.clientId ? 'hidden' : ''}">
        <div class="fields-2">
          ${field({ label: 'Nombre del prospecto', name: 'prospecto', value: data.prospecto })}
          ${field({ label: 'Celular', name: 'telefono', type: 'tel', value: data.telefono })}
        </div>
      </div>
      ${field({ label: 'Tipo de crédito', name: 'tipo', type: 'select', value: data.tipo || 'consumo', options: CATALOG.tiposCredito.map(t => ({ v: t.id, l: `${t.icon} ${t.label}` })) })}
      <div class="fields-2">
        ${field({ label: 'Monto solicitado', name: 'monto', type: 'money', value: data.monto, required: true })}
        ${field({ label: 'Moneda', name: 'moneda', type: 'select', value: data.moneda || 'BOB', options: CATALOG.monedas.map(m => ({ v: m.id, l: m.nombre })) })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Tasa anual % (ref.)', name: 'tasa', type: 'money', value: data.tasa })}
        ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'number', value: data.plazo, attrs: 'inputmode="numeric" min="1"' })}
      </div>
      ${field({ label: 'Destino del crédito', name: 'destino', value: data.destino, placeholder: 'Compra de vehículo, capital de operaciones…' })}
      <div class="fields-2">
        ${field({ label: 'Etapa', name: 'etapa', type: 'select', value: data.etapa || 'prospecto', options: CATALOG.etapas.map(e => ({ v: e.id, l: e.label })) })}
        ${field({ label: 'Prioridad', name: 'prioridad', type: 'select', value: data.prioridad || 'media', options: [{ v: 'alta', l: 'Alta' }, { v: 'media', l: 'Media' }, { v: 'baja', l: 'Baja' }] })}
      </div>
      ${field({ label: 'Fecha objetivo de desembolso', name: 'fechaObjetivo', type: 'date', value: data.fechaObjetivo })}
      ${isNew ? '<p class="small muted">Se cargará automáticamente el checklist de requisitos del tipo de crédito elegido.</p>' : ''}
      <button class="btn primary block" type="submit">${isNew ? 'Crear trámite' : 'Guardar cambios'}</button>
    </form>`, body => {
    const form = $('#fCase', body);
    form.clientId.addEventListener('change', () => $('#prospectFields').classList.toggle('hidden', !!form.clientId.value));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = formData(form);
      if (!d.clientId && !d.prospecto.trim()) { toast('Elige un cliente o escribe el nombre del prospecto'); return; }
      if (!num(d.monto)) { toast('Ingresa el monto solicitado'); return; }
      d.monto = num(d.monto); d.tasa = d.tasa === '' ? '' : num(d.tasa);
      d.clientId = d.clientId || null;
      d.actualizado = new Date().toISOString();
      let saved;
      if (isNew) {
        saved = Store.upsertCase({
          ...d,
          requisitos: (GUIDES[d.tipo]?.requisitos || []).map(t => ({ t, done: false })),
          bitacora: [{ fecha: new Date().toISOString(), t: `Trámite creado en etapa "${etapaInfo(d.etapa).label}".` }]
        });
      } else {
        if (d.tipo !== k.tipo && confirm('Cambiaste el tipo de crédito. ¿Agregar los requisitos del nuevo tipo al checklist?')) {
          const existing = new Set((k.requisitos || []).map(r => r.t));
          d.requisitos = [...(k.requisitos || []), ...(GUIDES[d.tipo]?.requisitos || []).filter(t => !existing.has(t)).map(t => ({ t, done: false }))];
        }
        saved = Store.upsertCase({ ...k, ...d });
      }
      closeSheet();
      toast(isNew ? 'Trámite creado' : 'Trámite actualizado');
      if (isNew) location.hash = `#/caso/${saved.id}`; else render();
    });
  });
}

function logCase(k, text) {
  k.bitacora = k.bitacora || [];
  k.bitacora.push({ fecha: new Date().toISOString(), t: text });
  k.actualizado = new Date().toISOString();
}

function setStage(k, etapa, extra = '') {
  const prev = etapaInfo(k.etapa).label;
  k.etapa = etapa;
  logCase(k, `Etapa: ${prev} → ${etapaInfo(etapa).label}${extra ? '. ' + extra : ''}`);
  Store.upsertCase(k);
  if (etapa === 'desembolsado') onDisbursed(k);
  else render();
}

/* Al desembolsar, registrar automáticamente el crédito en la cartera */
function onDisbursed(k) {
  const register = client => {
    Store.upsertCredit(client.id, {
      tipo: k.tipo, moneda: k.moneda || 'BOB', monto: num(k.monto), saldo: num(k.monto),
      tasa: k.tasa || '', plazo: k.plazo || '', fechaDesembolso: today(),
      diaPago: String(new Date().getDate()), estado: 'vigente', cuota: '', operacion: '', garantia: ''
    });
    k.clientId = client.id;
    k.creditoRegistrado = true;
    logCase(k, 'Crédito registrado en la cartera del cliente.');
    Store.upsertCase(k);
    toast('🎉 ¡Desembolsado! Crédito agregado a la cartera');
    render();
  };
  if (k.creditoRegistrado) { render(); return; }
  if (k.clientId && Store.client(k.clientId)) {
    if (confirm('¡Felicidades! ¿Registrar este crédito en la cartera del cliente?')) register(Store.client(k.clientId));
    else render();
  } else if (confirm('El trámite es de un prospecto. ¿Registrarlo ahora como cliente para agregar el crédito a tu cartera?')) {
    clientForm({ nombre: k.prospecto, telefono: k.telefono }, client => register(client));
  } else render();
}

/* =========================================================
   Vista: Agenda
   ========================================================= */
function taskRow(x) {
  const info = agendaInfo(x.tipo);
  const c = x.clientId && Store.client(x.clientId);
  const overdue = !x.done && x.fecha < today();
  return `
  <div class="check ${x.done ? 'done' : ''}">
    <input type="checkbox" data-act="toggleAgenda" data-kind="${x.kind}" data-id="${x.id}" data-case="${x.caseId || ''}" ${x.done ? 'checked' : ''}>
    <div class="t" ${x.kind === 'event' ? `data-act="editEvent" data-id="${x.id}"` : `data-act="goto" data-href="#/caso/${x.caseId}"`} style="cursor:pointer">
      <div>${info.icon} ${esc(x.titulo)}</div>
      <div class="small muted" style="${overdue ? 'color:var(--red)' : ''}">${fmtShort(x.fecha)}${x.hora ? ' · ' + esc(x.hora) : ''} · ${relDay(x.fecha)}${c ? ' · ' + esc(c.nombre) : x.caseName ? ' · ' + esc(x.caseName) : ''}</div>
    </div>
  </div>`;
}

function viewAgenda() {
  const t = today();
  const tasks = allTasks();
  const pend = tasks.filter(x => !x.done).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  const vencidas = pend.filter(x => x.fecha < t);
  const hoy = pend.filter(x => x.fecha === t);
  const semana = pend.filter(x => x.fecha > t && daysUntil(x.fecha) <= 7);
  const luego = pend.filter(x => daysUntil(x.fecha) > 7);
  const hechas = tasks.filter(x => x.done).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);

  // Cuotas del mes próximas (cobranza preventiva)
  const cuotas = [];
  S().clients.forEach(c => activeCredits(c).forEach(cr => {
    const np = nextPayment(cr);
    if (np && daysUntil(np) <= 10 && cr.estado !== 'mora') cuotas.push({ c, cr, np });
  }));
  cuotas.sort((a, b) => a.np.localeCompare(b.np));

  const block = (title, arr, cls = '') => arr.length ? `<div class="section-title">${title} <span class="badge ${cls}">${arr.length}</span></div><div class="card tight">${arr.map(taskRow).join('')}</div>` : '';

  return `
  <button class="btn primary block" data-act="newEvent">${ICONS.plus} Nueva actividad</button>
  ${block('Vencidas', vencidas, 'red')}
  ${block('Hoy', hoy, 'blue')}
  ${block('Próximos 7 días', semana)}
  ${block('Más adelante', luego, 'gray')}
  ${!pend.length ? '<div class="card empty" style="margin-top:12px"><div class="ico">📅</div>No tienes actividades pendientes.</div>' : ''}

  ${cuotas.length ? `
  <div class="section-title">Cuotas próximas (10 días) <span class="badge gold">${cuotas.length}</span></div>
  <div class="card tight">${cuotas.map(({ c, cr, np }) => `
    <div class="list-item">
      <a class="grow" href="#/cliente/${c.id}"><div class="title">${esc(c.nombre)}</div>
      <div class="sub">${tipoInfo(cr.tipo).icon} ${esc(tipoInfo(cr.tipo).label)} · ${fmtShort(np)} (${relDay(np)})</div></a>
      ${c.telefono ? `<a class="btn sm" target="_blank" rel="noopener" href="${waLink(c.telefono, `Hola ${c.nombre.split(' ')[0]}, le recordamos que su cuota de crédito ${tipoInfo(cr.tipo).label.toLowerCase()} vence el ${fmtDate(np)}. Gracias por su puntualidad. ${S().settings.ejecutivo || ''} - BMSC`)}">${ICONS.wa}</a>` : ''}
    </div>`).join('')}
  </div>` : ''}

  ${hechas.length ? block('Completadas recientemente', hechas, 'gray') : ''}`;
}

function eventForm(e = {}, preset = {}) {
  const isNew = !e.id;
  const d = { fecha: today(), tipo: 'llamada', ...preset, ...e };
  const clients = S().clients.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  openSheet(isNew ? 'Nueva actividad' : 'Editar actividad', `
    <form id="fEvent">
      ${field({ label: 'Tipo', name: 'tipo', type: 'select', value: d.tipo, options: CATALOG.tiposAgenda.map(t => ({ v: t.id, l: `${t.icon} ${t.label}` })) })}
      ${field({ label: 'Título', name: 'titulo', value: d.titulo, required: true, placeholder: 'Ej. Visitar negocio para verificación' })}
      <div class="fields-2">
        ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: d.fecha, required: true })}
        ${field({ label: 'Hora', name: 'hora', type: 'time', value: d.hora })}
      </div>
      ${field({ label: 'Cliente (opcional)', name: 'clientId', type: 'select', value: d.clientId || '', options: [{ v: '', l: '— Ninguno —' }, ...clients.map(c => ({ v: c.id, l: c.nombre }))] })}
      ${field({ label: 'Notas', name: 'notas', type: 'textarea', value: d.notas })}
      <button class="btn primary block" type="submit">${isNew ? 'Agendar' : 'Guardar'}</button>
      ${isNew ? '' : '<button class="btn danger block" type="button" id="delEvent" style="margin-top:8px">Eliminar</button>'}
    </form>`, body => {
    const form = $('#fEvent', body);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const data = formData(form);
      data.clientId = data.clientId || null;
      Store.upsertEvent({ ...e, ...data });
      closeSheet(); toast(isNew ? 'Actividad agendada' : 'Actividad actualizada'); render();
    });
    const del = $('#delEvent', body);
    del && del.addEventListener('click', () => { if (confirm('¿Eliminar actividad?')) { Store.deleteEvent(e.id); closeSheet(); render(); } });
  });
}

/* =========================================================
   Vista: Más
   ========================================================= */
const NUBE_TEXTO = {
  'sin-configurar': ['⚪', 'Sin configurar', 'Los datos se guardan solo en este dispositivo. Agrega la configuración de Firebase en js/firebase-config.js.'],
  'conectando': ['🟡', 'Conectando…', 'Estableciendo conexión con Firestore.'],
  'sin-sesion': ['🟡', 'Sesión cerrada', 'Ingresa con tu usuario y clave para ver y guardar datos.'],
  'conectado': ['🟢', 'Sincronizado', 'Los cambios se guardan en Firestore y aparecen en todos tus dispositivos.'],
  'sin-conexion': ['⚪', 'Sin conexión', 'Puedes seguir trabajando: los cambios se enviarán al volver internet.'],
  'error': ['🔴', 'Error de conexión', '']
};
function nubeCard() {
  const N = window.Nube || { estado: 'sin-configurar' };
  const [ic, t, d] = NUBE_TEXTO[N.estado] || NUBE_TEXTO.error;
  return `<div class="card">
    <div class="row"><div class="icon-dot">☁️</div>
      <div class="grow"><div style="font-weight:700">${ic} Firestore · ${esc(t)}</div>
      <div class="small muted">${N.usuario ? 'Usuario ' + esc(N.usuario) + ' · ' : ''}${N.proyecto ? 'Proyecto ' + esc(N.proyecto) + ' · ' : ''}${esc(N.estado === 'error' ? N.error : d)}</div></div>
    </div>
    ${N.estado !== 'sin-configurar' ? `<div class="btn-row" style="margin-top:12px">
      <a class="btn sm" href="#/historial">${ICONS.clock} Historial de cambios</a>
      <button class="btn sm" data-act="syncNube">↻ Enviar todo a la nube</button>
    </div>` : ''}
    ${N.usuario ? `<button class="btn sm danger block" style="margin-top:8px" data-act="logout">Cerrar sesión</button>` : ''}
  </div>`;
}

const fmtFechaHora = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ACCIONES = {
  crear: ['🆕', 'Creado'], editar: ['✏️', 'Editado'], eliminar: ['🗑️', 'Eliminado'], credito: ['💳', 'Crédito agregado o editado'],
  'eliminar-credito': ['💳', 'Crédito eliminado'], desvincular: ['🔗', 'Desvinculado'], restaurar: ['📥', 'Datos restaurados'],
  borrar: ['🧹', 'Datos borrados'], sincronizar: ['☁️', 'Sincronización completa']
};
const accionLabel = a => (ACCIONES[a] || ['', a])[1];

function viewHistorial(docId) {
  const N = window.Nube;
  if (!N || N.estado === 'sin-configurar') return `<div class="card empty"><div class="ico">☁️</div>El historial se guarda en Firestore. Configura la conexión para activarlo.</div>`;
  const cargar = async () => {
    const box = $('#histList');
    try {
      const items = await N.historial({ docId, max: docId ? 200 : 150 });
      viewHistorial.items = items;
      if (!$('#histList')) return;
      box.innerHTML = items.length ? items.map(h => {
        const [ic] = ACCIONES[h.accion] || ['•'];
        return `<div class="list-item" ${h.datos ? `data-act="verVersion" data-id="${h.id}"` : ''}>
          <div class="icon-dot">${ic}</div>
          <div class="grow"><div class="title">${esc(h.tipo)} · ${esc(accionLabel(h.accion))}</div>
          <div class="sub">${esc(h.resumen)}</div>
          <div class="sub">${fmtFechaHora(h.fechaLocal)}${h.ejecutivo ? ' · ' + esc(h.ejecutivo) : ''}</div></div>
          ${h.datos ? `<span class="muted">${ICONS.chev}</span>` : ''}
        </div>`;
      }).join('') : '<div class="empty">Aún no hay cambios registrados.</div>';
    } catch (e) {
      if (box) box.innerHTML = `<div class="empty">No se pudo cargar el historial (${esc(e.message)}).</div>`;
    }
  };
  setTimeout(() => (N.estado === 'conectando' ? setTimeout(cargar, 1500) : cargar()), 0);
  const c = docId && Store.client(docId);
  return `
  <p class="small muted" style="margin:0 2px 10px">${c ? `Cambios registrados de <b>${esc(c.nombre)}</b>.` : 'Últimos cambios registrados en la base de datos.'} Toca un registro para ver cómo estaba en ese momento.</p>
  <div class="card tight" id="histList"><div class="empty">Cargando…</div></div>`;
}

function viewMore() {
  const item = (href, icon, t, s, act = '') => `
    <a class="list-item" ${act ? `data-act="${act}"` : `href="${href}"`}>
      <div class="icon-dot">${ICONS[icon]}</div>
      <div class="grow"><div class="title">${t}</div><div class="sub">${s}</div></div>
      <span class="muted">${ICONS.chev}</span>
    </a>`;
  return `
  <div class="section-title">Herramientas</div>
  <div class="card tight">
    ${item('#/agenda', 'cal', 'Agenda', 'Llamadas, visitas, cobranza y cuotas próximas')}
    ${item('', 'book', 'Guías de crédito', 'Requisitos y consejos por tipo de crédito', 'openGuides')}
    ${item('', 'bulb', 'Consejos para el ejecutivo', 'Buenas prácticas de gestión de cartera', 'openTips')}
  </div>
  <div class="section-title">Base de datos en la nube</div>
  ${nubeCard()}
  <div class="section-title">Configuración</div>
  <div class="card tight">
    ${item('#/ajustes', 'gear', 'Ajustes y metas', 'Tu nombre, agencia, tipo de cambio y metas')}
    ${item('#/parametros', 'target', 'Parámetros de productos', 'Tasas, plazos, financiamiento, endeudamiento y seguros')}
    ${item('#/respaldo', 'download', 'Respaldo de datos', 'Exportar / importar y descargar Excel (CSV)')}
    ${item('', 'lock', S().settings.pinHash ? 'Cambiar o quitar PIN' : 'Proteger con PIN', 'Bloquea la app al abrirla', 'pinSetup')}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="small muted">
      🔒 <b>Privacidad:</b> la información de tus clientes se guarda solo en este dispositivo (almacenamiento del navegador). No se envía a ningún servidor.
      Haz respaldos periódicos desde "Respaldo de datos".
    </div>
  </div>
  <p class="center small muted">Mi Cartera · v1.0</p>`;
}

/* =========================================================
   Vista: Ajustes
   ========================================================= */
function viewSettings() {
  const st = S().settings;
  return `
  <form id="fSettings">
    <div class="card">
      ${field({ label: 'Tu nombre', name: 'ejecutivo', value: st.ejecutivo, placeholder: 'Nombre del ejecutivo' })}
      ${field({ label: 'Agencia / sucursal', name: 'agencia', value: st.agencia, placeholder: 'Ej. Agencia Equipetrol' })}
      ${field({ label: 'Tu número de teléfono', name: 'telefonoEjecutivo', type: 'tel', value: st.telefonoEjecutivo || '', placeholder: '7XXXXXXX', hint: 'Aparece en el PDF de la propuesta y en los mensajes al cliente' })}
    </div>
    <div class="section-title">Metas mensuales</div>
    <div class="card">
      ${field({ label: 'Meta de colocación (Bs)', name: 'metaMensual', type: 'money', value: st.metaMensual || '', hint: 'Suma de créditos desembolsados en el mes' })}
      ${field({ label: 'Meta de clientes nuevos', name: 'metaClientes', type: 'number', value: st.metaClientes || '', attrs: 'inputmode="numeric" min="0"' })}
    </div>
    <div class="section-title">Tipo de cambio del dólar</div>
    <div class="card">
      ${field({ label: 'Origen', name: 'tcModo', type: 'select', value: st.tcModo, options: [{ v: 'auto', l: 'Automático: oficial del BCB (se actualiza a diario)' }, { v: 'manual', l: 'Manual: valor fijo' }] })}
      <div id="tcAutoWrap" class="${st.tcModo === 'manual' ? 'hidden' : ''}">
        ${field({ label: 'Valor a usar', name: 'tcTipo', type: 'select', value: st.tcTipo, options: Object.entries(TC_TIPOS).map(([v, l]) => ({ v, l })), hint: 'Se usa para convertir los créditos en $us a Bs: ranking, clases A/B/C, cartera total y metas.' })}
      </div>
      <div id="tcManualWrap" class="${st.tcModo === 'manual' ? '' : 'hidden'}">
        ${field({ label: 'Tipo de cambio manual (Bs por $us)', name: 'tc', type: 'money', value: st.tc })}
      </div>
      <a class="link" href="#/tipo-cambio">Ver cotización e historial →</a>
    </div>
    <div class="section-title">Parámetros</div>
    <div class="card">
      <div class="veh-row" style="border:0;padding:0"><span>Tema</span>
        <div class="seg-toggle" role="radiogroup" id="temaToggle">
          ${[['light', '☀️ Claro'], ['dark', '🌙 Oscuro']].map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" ${temaActual() === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <div class="small muted" style="margin-top:6px">Se aplica al instante y queda guardado en este dispositivo.</div>
    </div>
    <button class="btn primary block" type="submit">Guardar ajustes</button>
  </form>`;
}
ROUTES.ajustes.after = () => {
  const f = $('#fSettings');
  f.tcModo.addEventListener('change', () => {
    $('#tcAutoWrap').classList.toggle('hidden', f.tcModo.value === 'manual');
    $('#tcManualWrap').classList.toggle('hidden', f.tcModo.value !== 'manual');
  });
  // Tema: se aplica y guarda al tocarlo, sin esperar "Guardar ajustes"
  $$('#temaToggle input').forEach(r => r.addEventListener('change', () => { S().settings.theme = r.value; Store.save(); applyTheme(); }));
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    Object.assign(S().settings, {
      ejecutivo: d.ejecutivo.trim(), agencia: d.agencia.trim(), telefonoEjecutivo: (d.telefonoEjecutivo || '').trim(),
      metaMensual: num(d.metaMensual), metaClientes: parseInt(d.metaClientes, 10) || 0,
      tcModo: d.tcModo === 'manual' && num(d.tc) ? 'manual' : 'auto', tcTipo: d.tcTipo || 'tco', tc: num(d.tc) || '',
      theme: d.theme || S().settings.theme
    });
    Store.save(); applyTheme(); toast('Ajustes guardados'); location.hash = '#/';
  });
};

// Tema actual: claro u oscuro ('auto' sigue al celular hasta que el usuario elija uno)
function temaActual() {
  const t = S().settings.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const t = S().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  // Barra del navegador del mismo color que el tema
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', temaActual() === 'dark' ? '#0C1612' : '#00563F');
}

/* =========================================================
   Vista: Respaldo
   ========================================================= */
function viewBackup() {
  const s = S();
  return `
  <div class="card">
    <dl class="kv">
      <dt>Clientes</dt><dd>${s.clients.length}</dd>
      <dt>Créditos</dt><dd>${s.clients.reduce((n, c) => n + (c.credits || []).length, 0)}</dd>
      <dt>Trámites</dt><dd>${s.cases.length}</dd>
      <dt>Actividades</dt><dd>${s.agenda.length}</dd>
    </dl>
  </div>
  <div class="stack">
    <button class="btn primary block" data-act="exportJSON">${ICONS.download} Descargar respaldo completo (.json)</button>
    <button class="btn block" data-act="exportCSV">${ICONS.download} Descargar cartera para Excel (.csv)</button>
    <label class="btn block">${ICONS.upload} Restaurar desde respaldo
      <input type="file" id="importFile" accept=".json,application/json" hidden></label>
  </div>
  <p class="small muted">Consejo: descarga un respaldo cada semana y guárdalo en un lugar seguro. Al restaurar, se reemplazan los datos actuales.</p>
  <div class="section-title">Zona de pruebas</div>
  <div class="stack">
    <button class="btn block" data-act="loadDemo">Cargar datos de ejemplo</button>
    <button class="btn danger block" data-act="wipe">Borrar todos los datos</button>
  </div>`;
}
ROUTES.respaldo.after = () => {
  $('#importFile').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.clients)) throw new Error('formato');
        if (!confirm(`El respaldo tiene ${data.clients.length} clientes. ¿Reemplazar los datos actuales?`)) return;
        Store.replace(data); applyTheme(); toast('Datos restaurados'); render();
      } catch (e) { alert('El archivo no es un respaldo válido de Mi Cartera.'); }
    };
    reader.readAsText(file);
  });
};

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCSV() {
  const p = portfolio();
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Ranking', 'Clase', 'Cliente', 'CI', 'Ext', 'Celular', 'Segmento', 'Tipo de crédito', 'N° operación', 'Moneda', 'Monto', 'Saldo', 'Saldo en Bs', 'Tasa %', 'Plazo', 'Fecha desembolso', 'Día de pago', 'Estado', 'Días mora', 'Garantía', 'Peso del cliente %'];
  const rows = [head.map(q).join(';')];
  p.list.forEach(({ c }) => {
    const inf = p.info[c.id];
    const base = [inf.rank, inf.cls, c.nombre, c.ci, c.ext, c.telefono, c.segmento];
    const credits = c.credits && c.credits.length ? c.credits : [null];
    credits.forEach(cr => {
      const vals = cr ? [tipoInfo(cr.tipo).label, cr.operacion, monLabel(cr.moneda), cr.monto, num(cr.saldo) || cr.monto, creditBalance(cr).toFixed(2), cr.tasa, cr.plazo, cr.fechaDesembolso, cr.diaPago, estadoInfo(cr.estado).label, cr.diasMora, cr.garantia]
        : Array(13).fill('');
      rows.push([...base, ...vals, (inf.share * 100).toFixed(2)].map(v => q(String(v ?? '').replace(/^(\d+)\.(\d+)$/, '$1,$2'))).join(';'));
    });
  });
  download(`cartera_${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

/* =========================================================
   Datos de ejemplo
   ========================================================= */
function loadDemo() {
  if (S().clients.length && !confirm('Se agregarán clientes de ejemplo a tus datos actuales. ¿Continuar?')) return;
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const ago = n => d(-n);
  const people = [
    ['Carlos Gutiérrez Suárez', '4839201', 'SC', '71234567', 'Profesional independiente', 'Arquitecto', [['vivienda', 'USD', 120000, 86000, 8.5, 240, ago(400), 15, 'vigente', 'Hipotecaria'], ['tarjeta', 'BOB', 15000, 6200, 24, 0, ago(200), 5, 'vigente', '']]],
    ['María Fernanda Rojas Vaca', '6120458', 'SC', '76543210', 'Asalariado', 'Médica - CNS', [['vivienda_social', 'BOB', 650000, 598000, 5.5, 240, ago(300), 10, 'vigente', 'Hipotecaria']]],
    ['Jorge Luis Mamani Quispe', '3928475', 'LP', '70011223', 'Independiente', 'Comerciante', [['consumo', 'BOB', 35000, 21000, 16, 24, ago(250), 20, 'mora', 'Personal']]],
    ['Ana Lucía Paz Méndez', '7751203', 'CB', '72233445', 'Asalariado', 'Contadora', [['consumo', 'BOB', 60000, 22000, 13, 36, ago(700), 28, 'vigente', 'Personal'], ['vehicular', 'USD', 25000, 19500, 8.5, 60, ago(360), 3, 'vigente', 'Prendaria']]],
    ['Luis Alberto Suárez Vaca', '3021456', 'SC', '77445566', 'Asalariado', 'Gerente financiero', [['vivienda', 'USD', 180000, 151000, 7.5, 300, ago(500), 30, 'vigente', 'Hipotecaria'], ['linea', 'BOB', 70000, 30000, 13, 36, ago(60), 12, 'vigente', 'Personal']]],
    ['Roberto Añez Justiniano', '5567234', 'BE', '69998877', 'Independiente', 'Transporte', [['vehicular', 'BOB', 180000, 150000, 11, 60, ago(180), d(2).slice(8), 'vigente', 'Prendaria']]],
    ['Patricia Vargas Soliz', '8834521', 'SC', '75566778', 'Asalariado', 'Docente', [['consumo', 'BOB', 25000, 24000, 14, 24, ago(30), d(4).slice(8), 'vigente', 'Personal']]]
  ];
  const ids = [];
  people.forEach(([nombre, ci, ext, tel, seg, act, credits], i) => {
    const c = Store.upsertClient({
      nombre, ci, ext, telefono: tel, segmento: seg, actividad: act,
      fechaNac: i === 1 ? '1988-' + d(3).slice(5) : '', notas: ''
    });
    ids.push(c.id);
    credits.forEach(([tipo, moneda, monto, saldo, tasa, plazo, fecha, dia, estado, garantia]) =>
      Store.upsertCredit(c.id, { tipo, moneda, monto, saldo, tasa, plazo, fechaDesembolso: fecha, diaPago: String(parseInt(dia, 10) || ''), estado, diasMora: estado === 'mora' ? '12' : '', garantia, cuota: '', operacion: '' }));
  });
  const mk = (clientId, prospecto, tipo, monto, moneda, etapa, doneN, prioridad, extra = {}) => {
    const req = (GUIDES[tipo].requisitos).map((t, i) => ({ t, done: i < doneN }));
    Store.upsertCase({ clientId, prospecto, tipo, monto, moneda, etapa, prioridad, requisitos: req, tareas: [], bitacora: [{ fecha: new Date().toISOString(), t: 'Trámite de ejemplo creado.' }], actualizado: new Date().toISOString(), ...extra });
  };
  mk(ids[3], '', 'vivienda', 90000, 'USD', 'documentos', 5, 'alta', { fechaObjetivo: d(20), tasa: 7.5, plazo: 240, destino: 'Compra de departamento', tareas: [{ id: Store.uid(), t: 'Solicitar folio real actualizado', fecha: d(1), done: false }, { id: Store.uid(), t: 'Coordinar avalúo con perito', fecha: d(5), done: false }] });
  mk(null, 'Luis Fernando Ortiz', 'consumo', 40000, 'BOB', 'prospecto', 1, 'media', { telefono: '78899001', tasa: 13, plazo: 36 });
  mk(ids[0], '', 'linea', 50000, 'BOB', 'comite', 3, 'alta', { fechaObjetivo: d(7), destino: 'Línea de crédito personal', tasa: 13, plazo: 24 });
  mk(null, 'Sofía Ribera', 'vehicular', 30000, 'USD', 'evaluacion', 6, 'media', { telefono: '70123123', tasa: 8.5, plazo: 60 });
  Store.upsertEvent({ tipo: 'visita', titulo: 'Visita de seguimiento', fecha: today(), hora: '10:00', clientId: ids[2] });
  Store.upsertEvent({ tipo: 'cobranza', titulo: 'Llamar por cuota atrasada', fecha: ago(1), hora: '', clientId: ids[2] });
  Store.upsertEvent({ tipo: 'reunion', titulo: 'Presentar línea de crédito en comité', fecha: d(3), hora: '15:00', clientId: ids[0] });
  if (!S().settings.metaMensual) { S().settings.metaMensual = 500000; S().settings.metaClientes = 8; Store.save(); }
  toast('Datos de ejemplo cargados');
  location.hash = '#/';
  render();
}

/* =========================================================
   PIN de seguridad
   ========================================================= */
async function hashPin(pin) {
  if (!window.crypto?.subtle) throw new Error('crypto');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mc-bmsc:' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function pinSetup() {
  const has = !!S().settings.pinHash;
  openSheet(has ? 'PIN de seguridad' : 'Crear PIN', `
    <form id="fPin">
      ${has ? field({ label: 'PIN actual', name: 'old', type: 'password', attrs: 'inputmode="numeric" maxlength="8" autocomplete="off"', required: true }) : ''}
      ${field({ label: has ? 'Nuevo PIN (vacío para quitarlo)' : 'Nuevo PIN (4 a 8 dígitos)', name: 'pin', type: 'password', attrs: 'inputmode="numeric" maxlength="8" autocomplete="off"' })}
      ${field({ label: 'Repetir PIN', name: 'pin2', type: 'password', attrs: 'inputmode="numeric" maxlength="8" autocomplete="off"' })}
      <p class="error-text" id="pinErr"></p>
      <button class="btn primary block" type="submit">Guardar</button>
      <p class="small muted">Si olvidas el PIN deberás borrar los datos del navegador. Mantén tus respaldos al día.</p>
    </form>`, body => {
    $('#fPin', body).addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = formData(ev.target);
      const err = $('#pinErr');
      try {
        if (has && await hashPin(d.old) !== S().settings.pinHash) { err.textContent = 'PIN actual incorrecto'; return; }
        if (!d.pin && has) { S().settings.pinHash = null; Store.save(); closeSheet(); toast('PIN eliminado'); render(); return; }
        if (!/^\d{4,8}$/.test(d.pin)) { err.textContent = 'El PIN debe tener de 4 a 8 dígitos'; return; }
        if (d.pin !== d.pin2) { err.textContent = 'Los PIN no coinciden'; return; }
        S().settings.pinHash = await hashPin(d.pin); Store.save();
        closeSheet(); toast('PIN activado'); render();
      } catch (e) { err.textContent = 'Tu navegador no permite esta función (requiere HTTPS).'; }
    });
  });
}
function lockIfNeeded() {
  if (!S().settings.pinHash) return;
  const lock = $('#lock');
  lock.classList.remove('hidden');
  const input = $('#lockPin');
  input.value = ''; setTimeout(() => input.focus(), 100);
  const tryUnlock = async () => {
    try {
      if (await hashPin(input.value) === S().settings.pinHash) { lock.classList.add('hidden'); $('#lockErr').textContent = ''; }
      else { $('#lockErr').textContent = 'PIN incorrecto'; input.value = ''; }
    } catch (e) { $('#lockErr').textContent = 'Error al verificar el PIN'; }
  };
  $('#lockBtn').onclick = tryUnlock;
  input.onkeydown = e => { if (e.key === 'Enter') tryUnlock(); };
}
// Bloquear al volver después de 5 minutos en segundo plano
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) lockIfNeeded();
});

/* =========================================================
   Acciones (delegación de eventos)
   ========================================================= */
const ACTIONS = {
  newClient: () => clientForm(),
  editClient: el => clientForm(Store.client(el.dataset.id)),
  deleteClient: el => {
    const c = Store.client(el.dataset.id);
    if (!confirm(`¿Eliminar a ${c.nombre} y todos sus créditos? Esta acción no se puede deshacer.`)) return;
    Store.deleteClient(c.id); toast('Cliente eliminado'); location.hash = '#/clientes';
  },
  newCredit: el => creditForm(el.dataset.id),
  editCredit: el => { const c = Store.client(el.dataset.client); creditForm(c.id, c.credits.find(x => x.id === el.dataset.id)); },
  clientFilter: el => { UI.clientFilter = el.dataset.id; render(); },

  newCase: el => caseForm({}, { clientId: el.dataset.client || '', tipo: el.dataset.tipo || 'consumo' }),
  editCase: el => caseForm(Store.caseById(el.dataset.id)),
  deleteCase: el => { if (confirm('¿Eliminar este trámite?')) { Store.deleteCase(el.dataset.id); toast('Trámite eliminado'); location.hash = '#/homebase'; } },
  hbTab: el => { UI.hbTab = el.dataset.id; render(); },
  hbStage: el => { UI.hbStage = el.dataset.id; render(); },
  stageNext: el => { const k = Store.caseById(el.dataset.id); const i = etapaIndex(k.etapa); if (CATALOG.etapas[i + 1]) setStage(k, CATALOG.etapas[i + 1].id); },
  stagePrev: el => { const k = Store.caseById(el.dataset.id); const i = etapaIndex(k.etapa); if (i > 0) setStage(k, CATALOG.etapas[i - 1].id); },
  stageReject: el => {
    const k = Store.caseById(el.dataset.id);
    const m = prompt('Motivo del rechazo o desistimiento (opcional):', '');
    if (m === null) return;
    k.motivoRechazo = m.trim();
    setStage(k, 'rechazado', m.trim() ? 'Motivo: ' + m.trim() : '');
  },
  stageReopen: el => { const k = Store.caseById(el.dataset.id); setStage(k, k.etapa === 'rechazado' ? 'evaluacion' : 'aprobado', 'Trámite reabierto'); },
  toggleReq: el => {
    const k = Store.caseById(el.dataset.id); const r = k.requisitos[+el.dataset.i];
    r.done = el.checked; k.actualizado = new Date().toISOString();
    if (r.done) logCase(k, `Requisito recibido: ${r.t}`);
    Store.upsertCase(k); render();
  },
  delReq: (el, ev) => { ev.preventDefault(); const k = Store.caseById(el.dataset.id); k.requisitos.splice(+el.dataset.i, 1); Store.upsertCase(k); render(); },
  addReq: el => {
    const t = prompt('Nuevo requisito:');
    if (!t || !t.trim()) return;
    const k = Store.caseById(el.dataset.id); k.requisitos.push({ t: t.trim(), done: false }); Store.upsertCase(k); render();
  },
  addTask: el => {
    const k = Store.caseById(el.dataset.id);
    openSheet('Nueva tarea', `<form id="fTask">
      ${field({ label: 'Tarea', name: 't', required: true, placeholder: 'Ej. Recoger boletas de pago' })}
      ${field({ label: 'Fecha límite', name: 'fecha', type: 'date', value: today() })}
      <button class="btn primary block">Agregar tarea</button></form>`, body => {
      $('#fTask', body).addEventListener('submit', ev => {
        ev.preventDefault();
        const d = formData(ev.target);
        k.tareas.push({ id: Store.uid(), t: d.t.trim(), fecha: d.fecha, done: false });
        k.actualizado = new Date().toISOString();
        Store.upsertCase(k); closeSheet(); render();
      });
    });
  },
  toggleTask: el => {
    const k = Store.caseById(el.dataset.id); const t = k.tareas.find(x => x.id === el.dataset.task);
    t.done = el.checked; if (t.done) logCase(k, `Tarea completada: ${t.t}`);
    Store.upsertCase(k); render();
  },
  delTask: (el, ev) => { ev.preventDefault(); const k = Store.caseById(el.dataset.id); k.tareas = k.tareas.filter(x => x.id !== el.dataset.task); Store.upsertCase(k); render(); },
  addLog: el => {
    const k = Store.caseById(el.dataset.id);
    openSheet('Nota en bitácora', `<form id="fLog">
      ${field({ label: 'Nota', name: 't', type: 'textarea', required: true, placeholder: 'Ej. Cliente entregará documentos el lunes' })}
      <button class="btn primary block">Guardar nota</button></form>`, body => {
      $('#fLog', body).addEventListener('submit', ev => {
        ev.preventDefault();
        logCase(k, formData(ev.target).t.trim()); Store.upsertCase(k); closeSheet(); render();
      });
    });
  },
  shareReqs: el => {
    const t = tipoInfo(el.dataset.tipo);
    const text = `Requisitos para crédito ${t.label} - Banco Mercantil Santa Cruz:\n\n${GUIDES[t.id].requisitos.map(r => '• ' + r).join('\n')}\n\n${S().settings.ejecutivo || ''}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  },

  newEvent: el => eventForm({}, { clientId: el.dataset.client || '' }),
  editEvent: el => eventForm(S().agenda.find(e => e.id === el.dataset.id)),
  toggleAgenda: el => {
    if (el.dataset.kind === 'event') {
      const e = S().agenda.find(x => x.id === el.dataset.id); Store.upsertEvent({ ...e, done: el.checked });
    } else {
      const k = Store.caseById(el.dataset.case); const t = k.tareas.find(x => x.id === el.dataset.id);
      t.done = el.checked; if (t.done) logCase(k, `Tarea completada: ${t.t}`); Store.upsertCase(k);
    }
    render();
  },
  goto: el => { location.hash = el.dataset.href; },

  openGuides: () => { UI.hbTab = 'guias'; location.hash = '#/homebase'; },
  openTips: () => { UI.hbTab = 'consejos'; location.hash = '#/homebase'; },
  pinSetup: () => pinSetup(),
  refreshTC: () => actualizarTC({ avisar: true }),
  logout: async () => {
    if (!confirm('¿Cerrar sesión? Los datos quedan guardados en la nube y se borran de este dispositivo.')) return;
    await Nube.cerrarSesion(); toast('Sesión cerrada');
  },
  syncNube: async () => {
    try { await Nube.sincronizarTodo(); toast('Datos enviados a la nube'); } catch (e) { toast('No se pudo sincronizar: ' + e.message); }
  },
  verVersion: el => {
    const h = (viewHistorial.items || []).find(x => x.id === el.dataset.id);
    if (!h?.datos) return;
    const d = h.datos;
    const omit = ['id', 'credits', 'requisitos', 'tareas', 'bitacora'];
    const rows = Object.entries(d).filter(([k, v]) => !omit.includes(k) && v !== '' && v !== null && typeof v !== 'object');
    openSheet(`${h.tipo} · ${fmtFechaHora(h.fechaLocal)}`, `
      <p class="small muted" style="margin-top:0">Así estaba el registro después de este cambio (${esc(accionLabel(h.accion))}).</p>
      <div class="card"><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      ${d.credits ? `<div class="section-title">Créditos (${d.credits.length})</div><div class="card tight">${d.credits.map(cr => `
        <div class="list-item"><div class="grow"><div class="title">${esc(tipoInfo(cr.tipo).label)} · ${esc(estadoInfo(cr.estado).label)}</div>
        <div class="sub">Monto ${money(num(cr.monto), cr.moneda)} · saldo ${money(num(cr.saldo) || num(cr.monto), cr.moneda)}</div></div></div>`).join('')}</div>` : ''}
      ${d.requisitos ? `<p class="small muted">Requisitos cumplidos: ${d.requisitos.filter(r => r.done).length}/${d.requisitos.length}</p>` : ''}`);
  },
  exportJSON: () => { download(`mi_cartera_respaldo_${today()}.json`, JSON.stringify({ ...S(), settings: { ...S().settings, pinHash: null } }, null, 2), 'application/json'); toast('Respaldo descargado'); },
  exportCSV: () => { exportCSV(); toast('Archivo CSV descargado'); },
  loadDemo: () => loadDemo(),
  wipe: () => {
    if (!confirm(`¿Borrar TODOS los datos de la app${window.Nube && Nube.estado !== 'sin-configurar' ? ' (también en la nube, en todos los dispositivos)' : ''}? Descarga un respaldo antes.`)) return;
    if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
    Store.reset(); applyTheme(); toast('Datos borrados'); location.hash = '#/';
  }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  // Los checkboxes se manejan en 'change'
  if (el.tagName === 'INPUT' && el.type === 'checkbox') return;
  // Evitar que el click en la etiqueta active el checkbox al borrar
  fn(el, ev);
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.matches('input[type=checkbox][data-act]')) ACTIONS[el.dataset.act](el, ev);
});

/* Botón "+" de la barra superior según la sección */
$('#quickAdd').addEventListener('click', () => {
  const n = current.name;
  if (n === 'clientes') return clientForm();
  if (n === 'cliente') return creditForm(current.param);
  if (n === 'homebase' || n === 'caso') return caseForm({}, {});
  if (n === 'agenda') return eventForm();
  openSheet('¿Qué deseas agregar?', `
    <div class="stack">
      <button class="btn block" data-act="newClient">${ICONS.user} Nuevo cliente</button>
      <button class="btn block" data-act="newCase">${ICONS.folder} Nuevo trámite</button>
      <button class="btn block" data-act="newEvent">${ICONS.cal} Nueva actividad</button>
    </div>`);
});

/* =========================================================
   Inicio
   ========================================================= */
function actualizarNubeUI() {
  const dot = $('#cloudDot');
  const est = window.Nube?.estado || 'sin-configurar';
  dot.className = 'cloud-dot ' + est;
  dot.classList.toggle('hidden', est === 'sin-configurar');
  dot.title = (NUBE_TEXTO[est] || [])[1] || '';
  if (current.name === 'mas') render();
}
window.addEventListener('nube-estado', actualizarNubeUI);

applyTheme();
route();
lockIfNeeded();
actualizarTC();
// Revisar cada 30 minutos mientras la app está abierta y al volver a ella
setInterval(actualizarTC, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  const ult = Date.parse(S().settings.tcData?.obtenido || 0);
  if (!document.hidden && Date.now() - ult > 15 * 60 * 1000) actualizarTC();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
