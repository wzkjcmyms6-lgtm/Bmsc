/* Panel del gerente de agencia.
   El gerente no gestiona créditos: ve (sin modificar) la cartera y los trámites de los ejecutivos
   de su equipo, que el administrador le asigna. Todo sale de lo que cada ejecutivo ya registra. */
'use strict';

const DIAS_ESTANCADO = 10;     // trámite sin movimiento desde hace estos días → "estancado"
const MORA_ALERTA = 0.03;      // mora del ejecutivo desde la que se avisa al gerente
const G_VIGENCIA = 3 * 60 * 1000;  // los datos del equipo se vuelven a leer cada 3 minutos como máximo

const G = { datos: null, t: 0, quien: '', cargando: null };

const diasSinMovimiento = k => { const u = (k.actualizado || k.creado || '').slice(0, 10); return u ? Math.max(0, -daysUntil(u)) : 0; };
const nombreCorto = n => String(n || '').trim().split(/\s+/)[0] || 'Ejecutivo';
const nombreEj = x => x.nombre || (x.usuario ? 'Usuario ' + x.usuario : 'Ejecutivo');
const bsCorto = n => `Bs ${compact(n)}`;
const fotoEj = x => `<div class="dir-foto">${x.foto ? `<img src="${esc(x.foto)}" alt="">` : `<span>${esc(iniciales(x.nombre) || String(x.usuario || '?').slice(-2))}</span>`}</div>`;

function metricasEjecutivo(c) {
  const ym = today().slice(0, 7), hoy = today();
  let total = 0, mora = 0, nCred = 0, clientesMora = 0, col = 0, nDes = 0;
  c.clients.forEach(cl => {
    let enMora = false;
    activeCredits(cl).forEach(cr => { const b = creditBalance(cr); total += b; nCred++; if (cr.estado === 'mora') { mora += b; enMora = true; } });
    if (enMora) clientesMora++;
    (cl.credits || []).forEach(cr => { if ((cr.fechaDesembolso || '').startsWith(ym)) { col += toBs(num(cr.monto), cr.moneda); nDes++; } });
  });
  const abiertos = c.cases.filter(caseOpen);
  return {
    total, mora, nCred, clientesMora, col, nDes, nClientes: c.clients.length,
    meta: num(c.perfil?.metaMensual), moraPct: total ? mora / total : 0,
    abiertos, enTramite: abiertos.reduce((s, k) => s + toBs(num(k.monto), k.moneda), 0),
    estancados: abiertos.filter(k => diasSinMovimiento(k) >= DIAS_ESTANCADO),
    comite: abiertos.filter(k => k.etapa === 'comite'),
    aprobados: abiertos.filter(k => k.etapa === 'aprobado'),
    vencidos: abiertos.filter(k => k.fechaObjetivo && k.fechaObjetivo < hoy)
  };
}

/* Lee el directorio y la cartera de cada ejecutivo del equipo (con caché corta) */
async function datosEquipo(forzar = false) {
  if (!window.Nube?.rol) throw new Error('Sin conexión con la nube todavía');
  if (G.quien !== Nube.usuario) { G.datos = null; G.quien = Nube.usuario; }
  if (!forzar && G.datos && Date.now() - G.t < G_VIGENCIA) return G.datos;
  if (G.cargando) return G.cargando;
  G.cargando = (async () => {
    const dir = await Nube.directorio();
    const equipo = (Nube.equipo || []).map(uid => dir.find(x => x.uid === uid) || { uid, nombre: '' });
    const filas = await Promise.all(equipo.map(async x => {
      try { const c = await Nube.leerCartera(x.uid); return { x, c, m: metricasEjecutivo(c) }; }
      catch (e) { return { x, error: e.code || e.message || 'error' }; }
    }));
    G.datos = filas; G.t = Date.now();
    return filas;
  })();
  try { return await G.cargando; } finally { G.cargando = null; }
}
const datosVigentes = () => G.quien === window.Nube?.usuario && G.datos && Date.now() - G.t < G_VIGENCIA;

/* Contenedor que se muestra al instante (con los últimos datos) y se completa al terminar la lectura */
function vistaEquipo(id, pintar) {
  // Al abrir la app el rol llega un momento después desde la nube
  if (!window.Nube?.rol) return `<div id="${id}"><div class="card empty">Cargando los datos de tu equipo…</div></div>`;
  if (!(Nube.equipo || []).length) {
    return `<div class="card empty"><div class="ico">👥</div>Todavía no tienes ejecutivos asignados.<br>El administrador los asigna en <b>Solicitudes de acceso → Rol y equipo</b>.</div>`;
  }
  return `<div id="${id}">${G.quien === Nube.usuario && G.datos ? pintar(G.datos) : '<div class="card empty">Cargando los datos de tu equipo…</div>'}</div>`;
}
async function completarVista(id, pintar, forzar = false) {
  if (!$('#' + id) || !window.Nube?.rol || (!forzar && datosVigentes())) return;
  try {
    const d = await datosEquipo(forzar);
    const box = $('#' + id); if (box) box.innerHTML = pintar(d);
  } catch (e) {
    const box = $('#' + id);
    if (box && !G.datos) box.innerHTML = '<div class="card empty">No se pudieron cargar los datos del equipo. Revisa tu conexión.</div>';
  }
}
const pieActualizado = () => `<p class="small muted center no-print" style="margin-top:14px">Solo lectura: ves la información de tu equipo, pero no la modificas.<br>
  Actualizado ${G.t ? new Date(G.t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''} · <a class="link" data-act="gActualizar">Actualizar</a></p>`;
const errorLectura = filas => filas.filter(f => f.error).map(f => `
  <div class="alert red"><div class="ic">${ICONS.alert}</div><div class="grow"><div class="t">No se pudo leer la cartera de ${esc(nombreEj(f.x))}</div>
  <div class="s">${f.error === 'permission-denied' ? 'Falta publicar las reglas nuevas en Firebase' : 'Revisa tu conexión'}</div></div></div>`).join('');

/* ---------- Panel de agencia (inicio del gerente) ---------- */
function viewPanelGerente() { return vistaEquipo('gPanel', htmlPanel); }

function htmlPanel(filas) {
  const ok = filas.filter(f => f.m), st = S().settings;
  const suma = fn => ok.reduce((s, f) => s + fn(f.m), 0);
  const total = suma(m => m.total), mora = suma(m => m.mora), col = suma(m => m.col);
  const meta = suma(m => m.meta), nDes = suma(m => m.nDes);
  // La meta del equipo es la suma de las metas; lo colocado por quien no tiene meta no cuenta para el %
  const colMeta = ok.reduce((s, f) => s + (f.m.meta ? f.m.col : 0), 0);
  const sinMeta = ok.filter(f => !f.m.meta).map(f => nombreEj(f.x));
  const todos = k => ok.flatMap(f => f.m[k].map(t => ({ t, f })));
  const estancados = todos('estancados'), comite = todos('comite'), aprobados = todos('aprobados'), vencidos = todos('vencidos'), abiertos = todos('abiertos');
  const enTramite = suma(m => m.enTramite);
  const quienes = lista => {
    const n = {}; lista.forEach(({ f }) => { const k = nombreEj(f.x); n[k] = (n[k] || 0) + 1; });
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(' · ');
  };
  const montoDe = lista => lista.reduce((s, { t }) => s + toBs(num(t.monto), t.moneda), 0);
  const hoy = parseDate(today());
  const faltan = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const mes = new Date().toLocaleDateString('es-BO', { month: 'long' });

  const alertas = [];
  if (estancados.length) alertas.push({ c: 'red', i: 'clock', h: '#/tramites-equipo/estancados',
    t: `${estancados.length} ${estancados.length === 1 ? 'trámite' : 'trámites'} sin movimiento hace ${DIAS_ESTANCADO} días o más`, s: quienes(estancados) });
  if (comite.length) alertas.push({ c: 'gold', i: 'target', h: '#/tramites-equipo/comite',
    t: `${comite.length} ${comite.length === 1 ? 'trámite' : 'trámites'} en comité / aprobación`, s: `Bs ${nf0.format(montoDe(comite))} · ${quienes(comite)}` });
  ok.filter(f => f.m.moraPct >= MORA_ALERTA).sort((a, b) => b.m.moraPct - a.m.moraPct).forEach(f => alertas.push({ c: 'red', i: 'alert', h: `#/equipo/${encodeURIComponent(f.x.uid)}`,
    t: `Mora de ${nombreEj(f.x)}: ${pct(f.m.moraPct)}`, s: `${f.m.clientesMora} ${f.m.clientesMora === 1 ? 'cliente' : 'clientes'} en mora · Bs ${nf0.format(f.m.mora)}` }));
  if (vencidos.length) alertas.push({ c: 'blue', i: 'cal', h: '#/tramites-equipo/vencidos',
    t: `${vencidos.length} ${vencidos.length === 1 ? 'trámite' : 'trámites'} con la fecha objetivo vencida`, s: quienes(vencidos) });

  // Avance de colocación: con meta, por porcentaje; sin meta, por monto
  const maxCol = Math.max(1, ...ok.map(f => f.m.col));
  const avance = ok.map(f => ({ f, p: f.m.meta ? f.m.col / f.m.meta : null }))
    .sort((a, b) => (b.p ?? -1) - (a.p ?? -1) || b.f.m.col - a.f.m.col);
  const colorAvance = p => p === null ? 'var(--muted)' : p >= 0.8 ? 'var(--green-600)' : p >= 0.5 ? 'var(--gold)' : 'var(--red)';

  return `
  <div class="hero">
    <div class="label">${saludo}${st.ejecutivo ? ', ' + esc(nombreCorto(st.ejecutivo)) : ''} · Cartera del equipo</div>
    <div class="big num">Bs ${nf0.format(total)}</div>
    <div class="meta">
      <div><b class="num">${ok.length}</b>${ok.length === 1 ? 'ejecutivo' : 'ejecutivos'}</div>
      <div><b class="num">${nf0.format(suma(m => m.nClientes))}</b>clientes</div>
      <div><b class="num">${nf0.format(suma(m => m.nCred))}</b>créditos</div>
      <div><b class="num">${pct(total ? mora / total : 0)}</b>mora</div>
    </div>
    <div style="margin-top:14px">
      ${meta ? `
        <div class="row between small" style="margin-bottom:6px"><span>Meta de colocación del equipo (${mes})</span><span class="num">${pct(Math.min(1, colMeta / meta), 0)}</span></div>
        <div class="progress"><span style="width:${Math.min(100, colMeta / meta * 100)}%"></span></div>
        <div class="small" style="margin-top:6px;opacity:.85">Bs ${nf0.format(colMeta)} de Bs ${nf0.format(meta)} · ${faltan ? `faltan ${faltan} ${faltan === 1 ? 'día' : 'días'}` : 'último día del mes'}
          <br>Colocado por todo el equipo: Bs ${nf0.format(col)} · ${nDes} ${nDes === 1 ? 'desembolso' : 'desembolsos'}${sinMeta.length ? `<br>Sin meta registrada: ${esc(sinMeta.join(', '))}` : ''}</div>`
      : `<div class="small" style="opacity:.85">Colocado en ${mes}: <b class="num">Bs ${nf0.format(col)}</b> · ${nDes} ${nDes === 1 ? 'desembolso' : 'desembolsos'}<br>Sin metas registradas: cada ejecutivo carga la suya en Más → Ajustes.</div>`}
    </div>
  </div>

  <div class="grid-2" style="margin-top:10px">
    <a class="card kpi" href="#/tramites-equipo"><div class="v num">${abiertos.length}</div><div class="l">Trámites en curso del equipo</div></a>
    <a class="card kpi" href="#/tramites-equipo"><div class="v num">${bsCorto(enTramite)}</div><div class="l">Monto en trámite</div></a>
    <a class="card kpi" href="#/tramites-equipo/aprobados"><div class="v num">${aprobados.length}</div><div class="l">Aprobados sin desembolsar</div></a>
    <a class="card kpi ${mora ? 'warn' : ''}" data-act="gOrden" data-v="mora" data-ir="#/equipo"><div class="v num">${bsCorto(mora)}</div><div class="l">Saldo en mora del equipo</div></a>
  </div>

  <div class="section-title">Requieren tu atención <span class="badge ${alertas.length ? 'red' : 'gray'}">${alertas.length}</span></div>
  <div class="card tight">
    ${errorLectura(filas)}
    ${alertas.length ? alertas.map(a => `
      <a class="alert ${a.c}" href="${a.h}"><div class="ic">${ICONS[a.i]}</div>
        <div class="grow"><div class="t">${esc(a.t)}</div><div class="s">${esc(a.s)}</div></div></a>`).join('')
      : `<div class="empty"><div class="ico">✅</div>Todo en orden en tu equipo.</div>`}
  </div>

  ${ok.length ? `
  <div class="section-title">Colocación del mes por ejecutivo <a href="#/equipo">Ver equipo</a></div>
  <div class="card"><div class="bars">
    ${avance.map(({ f, p }) => `
      <a class="bar-row" href="#/equipo/${encodeURIComponent(f.x.uid)}" style="display:block;color:inherit;text-decoration:none">
        <div class="top"><span>${esc(nombreEj(f.x))}</span><span class="num">${bsCorto(f.m.col)} · ${p === null ? 'sin meta' : pct(p, 0)}</span></div>
        <div class="bar"><span style="width:${p === null ? f.m.col / maxCol * 100 : Math.min(100, p * 100)}%;background:${colorAvance(p)}"></span></div>
      </a>`).join('')}
  </div></div>` : ''}

  ${abiertos.length ? `
  <div class="section-title">Embudo del equipo</div>
  <div class="card"><div class="bars">
    ${CATALOG.etapas.slice(0, 5).map(e => {
      const ks = abiertos.filter(({ t }) => t.etapa === e.id), m = montoDe(ks);
      return `<a class="bar-row" href="#/tramites-equipo/${e.id}" style="display:block;color:inherit;text-decoration:none">
        <div class="top"><span>${esc(e.label)} <span class="muted">(${ks.length})</span></span><span class="num">${bsCorto(m)}</span></div>
        <div class="bar"><span style="width:${enTramite ? m / enTramite * 100 : 0}%;background:var(--gold)"></span></div></a>`;
    }).join('')}
  </div></div>` : ''}
  ${pieActualizado()}`;
}

/* ---------- Mi equipo: ranking de ejecutivos ---------- */
const ORDENES = { meta: 'Meta', cartera: 'Cartera', mora: 'Mora', tramites: 'Trámites' };
function htmlEquipoGerente(filas) {
  const orden = UI.gOrden || 'meta', suc = UI.gSuc || '';
  const sucursales = [...new Set(filas.map(f => f.x.agencia).filter(Boolean))].sort();
  const lista = filas.filter(f => !suc || f.x.agencia === suc);
  const avance = f => f.m && f.m.meta ? f.m.col / f.m.meta : -1;
  const clave = { meta: f => avance(f), cartera: f => f.m?.total ?? -1, mora: f => f.m?.moraPct ?? -1, tramites: f => f.m?.abiertos.length ?? -1 }[orden];
  lista.sort((a, b) => clave(b) - clave(a) || String(nombreEj(a.x)).localeCompare(nombreEj(b.x)));
  return `
  ${sucursales.length > 1 ? `<div class="chips">
    <button class="chip ${suc ? '' : 'active'}" data-act="gSuc" data-v="">Todos <span class="count">${filas.length}</span></button>
    ${sucursales.map(s => `<button class="chip ${suc === s ? 'active' : ''}" data-act="gSuc" data-v="${esc(s)}">${esc(s)} <span class="count">${filas.filter(f => f.x.agencia === s).length}</span></button>`).join('')}
  </div>` : ''}
  <div class="segmented">${Object.entries(ORDENES).map(([k, l]) => `<button class="${orden === k ? 'active' : ''}" data-act="gOrden" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="card tight">
    ${lista.map((f, i) => {
      if (!f.m) return `<a class="list-item dir-item" href="#/equipo/${encodeURIComponent(f.x.uid)}">${fotoEj(f.x)}
        <div class="grow"><div class="title">${esc(nombreEj(f.x))}</div><div class="sub" style="color:var(--red)">No se pudo leer su cartera</div></div><span class="muted">${ICONS.chev}</span></a>`;
      const p = f.m.meta ? f.m.col / f.m.meta : null;
      return `<a class="list-item dir-item" href="#/equipo/${encodeURIComponent(f.x.uid)}">
        ${fotoEj(f.x)}
        <div class="grow" style="min-width:0"><div class="title">${i + 1}. ${esc(nombreEj(f.x))}</div>
          <div class="sub">${esc([f.x.agencia, `cartera ${bsCorto(f.m.total)}`, `${f.m.abiertos.length} ${f.m.abiertos.length === 1 ? 'trámite' : 'trámites'}`].filter(Boolean).join(' · '))}</div>
          ${p === null ? `<div class="small muted" style="margin-top:4px">Colocado ${bsCorto(f.m.col)} · sin meta</div>`
            : `<div class="progress" style="height:6px;margin-top:7px"><span style="width:${Math.min(100, p * 100)}%"></span></div>
               <div class="small muted" style="margin-top:4px">Colocado ${bsCorto(f.m.col)} de ${bsCorto(f.m.meta)}</div>`}</div>
        <div class="right" style="flex:none"><b class="num">${p === null ? '—' : pct(p, 0)}</b>
          <div class="small" style="color:${f.m.moraPct >= MORA_ALERTA ? 'var(--red)' : 'var(--muted)'}">mora ${pct(f.m.moraPct)}</div></div>
      </a>`;
    }).join('')}
  </div>
  ${pieActualizado()}`;
}

/* ---------- Trámites del equipo ---------- */
const FILTROS_TRAMITES = [
  ['', 'Activos', k => caseOpen(k)],
  ['estancados', 'Sin movimiento', k => caseOpen(k) && diasSinMovimiento(k) >= DIAS_ESTANCADO],
  ['vencidos', 'Fecha vencida', k => caseOpen(k) && k.fechaObjetivo && k.fechaObjetivo < today()],
  ...CATALOG.etapas.map(e => [e.id, e.id === 'desembolsado' ? 'Desembolsados del mes' : e.label,
    e.id === 'desembolsado' ? k => k.etapa === 'desembolsado' && (k.actualizado || '').startsWith(today().slice(0, 7)) : k => k.etapa === e.id])
];
function viewTramitesEquipo(filtro) {
  if (!esGerente()) return '<div class="card empty">Esta sección es para gerentes de agencia.</div>';
  return vistaEquipo('gTramites', filas => htmlTramitesEquipo(filas, filtro || ''));
}
function htmlTramitesEquipo(filas, filtro) {
  const ok = filas.filter(f => f.m);
  const f0 = FILTROS_TRAMITES.find(x => x[0] === filtro) || FILTROS_TRAMITES[0];
  const ej = UI.gTeEj || '';
  const todos = ok.flatMap(f => f.c.cases.map(k => ({ k, f })));
  const cuenta = fn => todos.filter(({ k, f }) => (!ej || f.x.uid === ej) && fn(k)).length;
  const lista = todos.filter(({ k, f }) => (!ej || f.x.uid === ej) && f0[2](k))
    .sort((a, b) => (filtro === 'estancados' ? diasSinMovimiento(b.k) - diasSinMovimiento(a.k) : 0)
      || etapaIndex(b.k.etapa) - etapaIndex(a.k.etapa) || toBs(num(b.k.monto), b.k.moneda) - toBs(num(a.k.monto), a.k.moneda));
  const cliente = (k, f) => k.prospecto || (f.c.clients.find(cl => cl.id === k.clientId) || {}).nombre || 'Trámite';
  const total = lista.reduce((s, { k }) => s + toBs(num(k.monto), k.moneda), 0);
  return `
  <div class="chips">${FILTROS_TRAMITES.filter(([id, , fn]) => !id || id === filtro || cuenta(fn)).map(([id, l, fn]) => `
    <a class="chip ${id === f0[0] ? 'active' : ''}" href="#/tramites-equipo${id ? '/' + id : ''}">${esc(l)} <span class="count">${cuenta(fn)}</span></a>`).join('')}</div>
  ${ok.length > 1 ? `<div class="chips">
    <button class="chip ${ej ? '' : 'active'}" data-act="gTeEj" data-v="">Todo el equipo</button>
    ${ok.map(f => `<button class="chip ${ej === f.x.uid ? 'active' : ''}" data-act="gTeEj" data-v="${esc(f.x.uid)}">${esc(nombreCorto(nombreEj(f.x)))}</button>`).join('')}
  </div>` : ''}
  ${lista.length ? `
  <div class="small muted" style="margin:0 2px 8px">${lista.length} ${lista.length === 1 ? 'trámite' : 'trámites'} · Bs ${nf0.format(total)}</div>
  <div class="card tight">
    ${lista.map(({ k, f }) => {
      const d = diasSinMovimiento(k), abierto = caseOpen(k);
      return `<a class="list-item" data-act="gTramite" data-u="${esc(f.x.uid)}" data-id="${esc(k.id)}">
        <div class="grow" style="min-width:0"><div class="title">${esc(cliente(k, f))}</div>
          <div class="sub">${esc(nombreEj(f.x))} · ${esc(tipoInfo(k.tipo).label)} · ${esc(etapaInfo(k.etapa).label)}</div></div>
        <div class="right" style="flex:none"><b class="num">${esc(money(num(k.monto), k.moneda, false))}</b>
          <div class="small" style="color:${abierto && d >= DIAS_ESTANCADO ? 'var(--red)' : 'var(--muted)'}">${abierto ? (d ? `hace ${d} ${d === 1 ? 'día' : 'días'}${d >= DIAS_ESTANCADO ? ' ⏳' : ''}` : 'hoy') : esc(fmtShort((k.actualizado || '').slice(0, 10)))}</div></div>
      </a>`;
    }).join('')}
  </div>` : `<div class="card empty">No hay trámites en esta lista.</div>`}
  ${pieActualizado()}`;
}

/* Detalle de un trámite del equipo (solo lectura) */
function hojaTramiteEquipo(uid, id) {
  const f = (G.datos || []).find(r => r.x.uid === uid && r.c);
  const k = f && f.c.cases.find(t => t.id === id);
  if (!k) return;
  const cl = f.c.clients.find(c => c.id === k.clientId);
  const fila = (l, v) => v ? `<div class="list-item"><div class="grow small muted">${l}</div><b class="right">${v}</b></div>` : '';
  const bit = (k.bitacora || []).slice(-8).reverse();
  const x = f.x;
  openSheet(k.prospecto || cl?.nombre || 'Trámite', `
    <div class="card tight" style="margin:0">
      ${fila('Ejecutivo', esc(nombreEj(x)))}
      ${fila('Tipo de crédito', esc(tipoInfo(k.tipo).label))}
      ${fila('Etapa', esc(etapaInfo(k.etapa).label))}
      ${fila('Monto', esc(money(num(k.monto), k.moneda)))}
      ${fila('Fecha objetivo', k.fechaObjetivo ? esc(fmtDate(k.fechaObjetivo)) + (caseOpen(k) && k.fechaObjetivo < today() ? ' <span style="color:var(--red)">(vencida)</span>' : '') : '')}
      ${fila('Último movimiento', caseOpen(k) ? `hace ${diasSinMovimiento(k)} días` : '')}
    </div>
    ${bit.length ? `<div class="section-title">Últimos movimientos</div>
    <div class="card tight" style="margin:0">${bit.map(b => `<div class="list-item"><div class="grow"><div class="small">${esc(b.t)}</div><div class="sub">${esc(fmtDate(String(b.fecha || '').slice(0, 10)))}</div></div></div>`).join('')}</div>` : ''}
    ${x.telefono ? `<div class="grid-2" style="margin-top:14px">
      <a class="btn block" href="tel:${esc(x.telefono)}">${ICONS.phone} Llamar</a>
      <a class="btn primary block" target="_blank" rel="noopener" href="${waLink(x.telefono, `Hola ${nombreCorto(x.nombre)}, ¿cómo va el trámite de ${k.prospecto || cl?.nombre || 'tu cliente'}?`)}">${ICONS.wa} WhatsApp</a>
    </div>` : ''}
    <p class="small muted center" style="margin-top:12px">Solo lectura: los cambios los hace el ejecutivo.</p>`);
}

/* ---------- Barra inferior según el rol ---------- */
const NAV_ICONOS = {
  panel: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  equipo: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7"/>',
  tramites: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'
};
let navEjecutivo = null;
function pintarNav() {
  const nav = $('.bottomnav'); if (!nav) return;
  const modo = esGerente() ? 'gerente' : 'ejecutivo';
  if (nav.dataset.modo === modo) return;
  if (navEjecutivo === null) navEjecutivo = nav.innerHTML;
  const calc = nav.querySelector('[data-nav=calculadora]')?.outerHTML || '', mas = nav.querySelector('[data-nav=mas]')?.outerHTML || '';
  const item = (href, n, icono, l) => `<a href="${href}" data-nav="${n}"><svg viewBox="0 0 24 24">${icono}</svg><span>${l}</span></a>`;
  nav.innerHTML = modo === 'gerente'
    ? item('#/', 'inicio', NAV_ICONOS.panel, 'Panel') + item('#/equipo', 'equipo', NAV_ICONOS.equipo, 'Equipo') + item('#/tramites-equipo', 'tramites', NAV_ICONOS.tramites, 'Trámites') + calc + mas
    : navEjecutivo;
  nav.dataset.modo = modo;
}

Object.assign(ACTIONS, {
  gActualizar: async () => {
    toast('Actualizando…');
    try { await datosEquipo(true); render(); toast('Datos del equipo actualizados'); }
    catch { toast('No se pudo actualizar. Revisa tu conexión.'); }
  },
  gOrden: el => { UI.gOrden = el.dataset.v; if (el.dataset.ir) location.hash = el.dataset.ir; else render(); },
  gSuc: el => { UI.gSuc = el.dataset.v; render(); },
  gTeEj: el => { UI.gTeEj = el.dataset.v; render(); },
  gTramite: el => hojaTramiteEquipo(el.dataset.u, el.dataset.id)
});

// La primera pantalla se dibuja antes de cargar este archivo: si es gerente, se vuelve a dibujar
if (esGerente()) render();
