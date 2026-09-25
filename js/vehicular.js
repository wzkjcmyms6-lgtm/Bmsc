/* Simulador de crédito vehicular (requisitos del banco).
   Secciones: propuesta, datos del cliente (titular y codeudor), seguros y condiciones.
   Reglas y tasas en VEH: se ajustan aquí cuando cambie la norma. */
'use strict';

const VEH = {
  edadMax: { anios: 70, dias: 360 },          // hasta 70 años y 360 días (sin cumplir 71)
  desgravamen: { titular: 1.250, mancomunado: 2.251 }, // % sobre saldo capital
  dima: { titular: 0.36, mancomunado: 0.72 },          // % sobre saldo capital
  periodoSeguros: 12,                          // los % de seguros son anuales → se cobran /12 cada mes
  msc: { normal: 3.8, hibrido: 4.4 },          // % del valor del vehículo, se suma al monto a financiar
  plazos: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  treMN: 3.65, treVigencia: 'septiembre 2026'  // TRe MN publicada por el BCB (respaldo)
};
const pct3 = v => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
const treMN = () => num(S().settings.treManual) || S().settings.tre?.mn || VEH.treMN;
const treVigencia = () => (num(S().settings.treManual) ? 'manual' : S().settings.tre?.vigencia || VEH.treVigencia);

/* Edad exacta en años y días a la fecha */
function edadDe(fnac, hoy = new Date()) {
  const n = parseDate(fnac);
  if (!n || n > hoy) return null;
  let anios = hoy.getFullYear() - n.getFullYear();
  let cumple = new Date(hoy.getFullYear(), n.getMonth(), n.getDate());
  if (cumple > hoy) { anios--; cumple = new Date(hoy.getFullYear() - 1, n.getMonth(), n.getDate()); }
  const dias = Math.floor((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - cumple) / 86400000);
  return { anios, dias };
}
const elegible = e => !!e && (e.anios < VEH.edadMax.anios || (e.anios === VEH.edadMax.anios && e.dias <= VEH.edadMax.dias));
const edadTxt = e => e ? `${e.anios} años y ${e.dias} días` : '—';

function vehState() {
  const C = calcState();
  C.veh = C.veh || {
    nombre: '', ci: '', fnac: '', codeudor: 'no', cNombre: '', cCi: '', cFnac: '',
    dima: 'no', producto: 'nuevo', moneda: 'BOB', valor: 150000, aportePct: 20,
    tasaFija: 9, margenVar: 3, plazo: 60, periodoFijo: 24, msc: 'no', motor: 'normal'
  };
  return C.veh;
}

const siNo = (name, value, labels = ['Sí', 'No']) => `
  <div class="seg-toggle" role="radiogroup">
    <label><input type="radio" name="${name}" value="si" ${value === 'si' ? 'checked' : ''}><span>${labels[0]}</span></label>
    <label><input type="radio" name="${name}" value="no" ${value !== 'si' ? 'checked' : ''}><span>${labels[1]}</span></label>
  </div>`;
const opciones = (name, value, ops) => `
  <div class="seg-toggle" role="radiogroup">
    ${ops.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${value === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
  </div>`;
const seccion = (n, titulo, cuerpo, extra = '') => `
  <section class="card veh-sec">
    <div class="veh-sec-head"><span class="veh-num">${n}</span><h3>${titulo}</h3>${extra}</div>
    ${cuerpo}
  </section>`;

function vehForm() {
  const V = vehState();
  const persona = (p, titulo) => `
    <div class="veh-persona">
      <div class="veh-persona-head"><b>${titulo}</b><span class="badge gray" id="edad_${p || 't'}">Edad —</span></div>
      <div class="fields-2">
        ${field({ label: 'Nombre (opcional)', name: p ? p + 'Nombre' : 'nombre', value: V[p ? p + 'Nombre' : 'nombre'], attrs: 'autocomplete="off"' })}
        ${field({ label: 'Carnet (opcional)', name: p ? p + 'Ci' : 'ci', value: V[p ? p + 'Ci' : 'ci'], attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
      ${field({ label: 'Fecha de nacimiento', name: p ? p + 'Fnac' : 'fnac', type: 'date', value: V[p ? p + 'Fnac' : 'fnac'], required: true })}
    </div>`;

  return `
  <form id="vehForm" class="calc-form no-print" onsubmit="return false">
    <div class="veh-top card">
      <div><div class="small muted">Fecha de elaboración de la propuesta</div><b>${fmtDate(today())}</b></div>
      <span class="badge">🚗 Crédito vehicular</span>
    </div>

    ${seccion(1, 'Datos del cliente', `
      ${persona('', 'Titular')}
      <div class="veh-row"><span>¿Tiene codeudor?</span>${siNo('codeudor', V.codeudor)}</div>
      ${V.codeudor === 'si' ? persona('c', 'Codeudor') : ''}
    `)}

    ${seccion(2, 'Seguros', `
      <div class="veh-row"><div><span>Seguro de desgravamen</span><div class="small muted" id="desgInfo">Según la edad de los clientes</div></div>
        <span class="badge" id="desgBadge">—</span></div>
      <div class="veh-row"><div><span>Seguro DIMA</span><div class="small muted">${V.codeudor === 'si' ? `Titular y codeudor ${nf2.format(VEH.dima.mancomunado)}%` : `Solo titular ${nf2.format(VEH.dima.titular)}%`} sobre saldo capital</div></div>
        ${siNo('dima', V.dima)}</div>
      <div class="veh-row"><div><span>¿Seguro automotor MSC?</span><div class="small muted">Se suma al monto a financiar</div></div>${siNo('msc', V.msc)}</div>
      ${V.msc === 'si' ? `<div class="veh-row"><span>Tipo de vehículo</span>${opciones('motor', V.motor, [['normal', `Normal ${nf2.format(VEH.msc.normal)}%`], ['hibrido', `Híbrido / eléctrico ${nf2.format(VEH.msc.hibrido)}%`]])}</div>` : ''}
    `)}

    ${seccion(3, 'Condiciones', `
      <div class="veh-row"><span>Producto</span>${opciones('producto', V.producto, [['nuevo', 'Vehículo nuevo'], ['usado', 'Vehículo usado']])}</div>
      <div class="fields-2">
        ${field({ label: 'Moneda', name: 'moneda', type: 'select', value: V.moneda, options: CATALOG.monedas.map(m => ({ v: m.id, l: m.nombre })) })}
        ${field({ label: 'Valor del vehículo', name: 'valor', type: 'money', value: V.valor })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Aporte propio %', name: 'aportePct', type: 'money', value: V.aportePct })}
        ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'select', value: V.plazo, options: VEH.plazos.map(n => ({ v: n, l: `${n} meses` })), hint: `${num(V.plazo) / 12} ${num(V.plazo) === 12 ? 'año' : 'años'}` })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Interés fijo % anual', name: 'tasaFija', type: 'money', value: V.tasaFija })}
        ${field({ label: 'Periodo tasa fija (meses)', name: 'periodoFijo', type: 'number', value: V.periodoFijo, attrs: `inputmode="numeric" min="0" max="${V.plazo}"` })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Interés variable % (margen)', name: 'margenVar', type: 'money', value: V.margenVar })}
        <div class="field"><label>TRe MN</label><div class="veh-tre"><b>${nf2.format(treMN())}%</b><span class="small muted">BCB · ${esc(treVigencia())}</span></div></div>
      </div>
      <div class="small muted" id="tasaVarInfo"></div>
    `)}
  </form>
  <div id="vehOut"></div>`;
}

function vehCalc() {
  const out = $('#vehOut');
  if (!out) return;
  const V = vehState();
  const m = V.moneda;
  const conCodeudor = V.codeudor === 'si';
  const eT = edadDe(V.fnac), eC = conCodeudor ? edadDe(V.cFnac) : null;

  // Edades en el formulario
  const pintaEdad = (id, e) => { const b = $('#' + id); if (!b) return; b.textContent = e ? edadTxt(e) : 'Edad —'; b.className = 'badge ' + (!e ? 'gray' : elegible(e) ? '' : 'red'); };
  pintaEdad('edad_t', eT); pintaEdad('edad_c', eC);

  // Desgravamen según edad (hasta 70 años y 360 días)
  const okT = elegible(eT), okC = conCodeudor && elegible(eC);
  let desg = 0, desgTxt = '';
  if (conCodeudor && okT && okC) { desg = VEH.desgravamen.mancomunado; desgTxt = `Titular y codeudor · ${pct3(desg)}%`; }
  else if (okT || okC) { desg = VEH.desgravamen.titular; desgTxt = `${okT ? 'Titular' : 'Codeudor'} · ${pct3(desg)}%`; }
  else desgTxt = 'No aplica';
  const dima = V.dima === 'si' ? (conCodeudor ? VEH.dima.mancomunado : VEH.dima.titular) : 0;
  const badge = $('#desgBadge');
  if (badge) { badge.textContent = (eT || eC) ? desgTxt : 'Falta fecha de nacimiento'; badge.className = 'badge ' + (desg ? '' : 'red'); }
  const info = $('#desgInfo');
  if (info) info.textContent = `Edad máxima ${VEH.edadMax.anios} años y ${VEH.edadMax.dias} días`;

  // Montos
  const valor = num(V.valor);
  const aporte = valor * num(V.aportePct) / 100;
  const primaMSC = V.msc === 'si' ? valor * VEH.msc[V.motor] / 100 : 0;
  const monto = valor - aporte + primaMSC;
  const plazo = parseInt(V.plazo, 10) || 12;
  const fijo = Math.min(plazo, Math.max(0, parseInt(V.periodoFijo, 10) || 0));
  const tasaVar = treMN() + num(V.margenVar);
  const tv = $('#tasaVarInfo');
  if (tv) tv.innerHTML = fijo < plazo
    ? `Tasa desde el mes ${fijo + 1}: TRe ${nf2.format(treMN())}% + ${nf2.format(num(V.margenVar))}% = <b>${nf2.format(tasaVar)}%</b>`
    : 'Tasa fija durante todo el plazo';

  const avisos = [];
  if (!V.fnac) avisos.push('Ingresa la fecha de nacimiento del titular (obligatoria).');
  if (conCodeudor && !V.cFnac) avisos.push('Ingresa la fecha de nacimiento del codeudor (obligatoria).');
  if (eT && !okT) avisos.push(`El titular supera la edad máxima para desgravamen (${edadTxt(eT)}).`);
  if (eC && !okC) avisos.push(`El codeudor supera la edad máxima para desgravamen (${edadTxt(eC)}).`);
  if (num(V.periodoFijo) > plazo) avisos.push(`El periodo de tasa fija no puede superar el plazo (${plazo} meses).`);
  if (!(monto > 0)) { out.innerHTML = '<div class="card empty">Ingresa el valor del vehículo</div>'; return; }

  const segMensual = (desg + dima) / VEH.periodoSeguros; // % mensual sobre saldo
  const plan = generarPlan({ monto, n: plazo, tasa: num(V.tasaFija), sistema: 'frances', gracia: 0, mesesFijos: fijo < plazo ? fijo : 0, tasaVar, desg: segMensual, seguroMes: 0, fecha: today() });
  const r = plan.rows;
  const c1 = r[0];
  const cVar = fijo < plazo ? r[fijo] : null;
  const desgMes = x => x.saldo + x.capital; // saldo al inicio del mes
  const parte = (x, pctAnual) => desgMes(x) * pctAnual / 100 / VEH.periodoSeguros;
  const teac = Math.pow(1 + tirMensual(monto - primaMSC, r.map(x => x.total)), 12) - 1;

  const filaCuota = (x, titulo) => `
    <div class="veh-cuota">
      <div class="small muted">${titulo}</div>
      <div class="veh-cuota-big num">${fmt(x.total, m)}</div>
      <div class="veh-desglose small">
        <span>Capital + interés <b class="num">${fmt(x.cuota, m)}</b></span>
        ${desg ? `<span>Desgravamen <b class="num">${fmt(parte(x, desg), m)}</b></span>` : ''}
        ${dima ? `<span>DIMA <b class="num">${fmt(parte(x, dima), m)}</b></span>` : ''}
        <span>Tasa <b class="num">${nf2.format(x.tasa)}%</b></span>
      </div>
    </div>`;

  out.innerHTML = `
  ${avisos.length ? `<div class="card veh-avisos">${avisos.map(a => `<div>⚠️ ${esc(a)}</div>`).join('')}</div>` : ''}
  <div class="hero veh-hero">
    <div class="label">Cuota mensual${cVar ? ' · periodo fijo' : ''}</div>
    ${filaCuota(c1, `Meses 1 a ${cVar ? fijo : plazo}`).replace('veh-cuota"', 'veh-cuota veh-cuota-hero"')}
    ${cVar ? `<div class="veh-sep"></div>${filaCuota(cVar, `Meses ${fijo + 1} a ${plazo} · tasa variable (estimada con TRe actual)`)}` : ''}
  </div>

  <div class="card">
    <div class="veh-res-title">Resumen del financiamiento</div>
    <dl class="kv">
      <dt>Valor del vehículo</dt><dd class="num">${fmt(valor, m)}</dd>
      <dt>Aporte propio (${nf2.format(num(V.aportePct))}%)</dt><dd class="num">− ${fmt(aporte, m)}</dd>
      ${primaMSC ? `<dt>Seguro automotor MSC (${nf2.format(VEH.msc[V.motor])}%)</dt><dd class="num">+ ${fmt(primaMSC, m)}</dd>` : ''}
      <dt><b>Monto a financiar</b></dt><dd class="num"><b>${fmt(monto, m)}</b></dd>
      <dt>Plazo</dt><dd>${plazo} meses (${plazo / 12} ${plazo === 12 ? 'año' : 'años'})</dd>
      <dt>Producto</dt><dd>${V.producto === 'nuevo' ? 'Vehículo nuevo' : 'Vehículo usado'}</dd>
      <dt>Desgravamen</dt><dd>${esc(desgTxt)}</dd>
      <dt>DIMA</dt><dd>${dima ? nf2.format(dima) + '%' : 'No'}</dd>
    </dl>
  </div>

  <div class="grid-2">
    <div class="card kpi"><div class="v num">${fmt(plan.totales.interes, m)}</div><div class="l">Total intereses</div></div>
    <div class="card kpi"><div class="v num">${fmt(plan.totales.desg, m)}</div><div class="l">Total seguros (desgravamen + DIMA)</div></div>
    <div class="card kpi"><div class="v num">${fmt(plan.totales.total, m)}</div><div class="l">Total a pagar</div></div>
    <div class="card kpi"><div class="v num">${pct(teac, 2)}</div><div class="l">Costo efectivo anual (TEAC)</div></div>
  </div>
  ${m === 'USD' ? `<div class="card small">Equivalente de la primera cuota: <b>Bs ${nf2.format(c1.total * tc())}</b> al tipo de cambio oficial Bs ${nf2.format(tc())}.</div>` : ''}

  <div class="btn-row no-print" style="margin:10px 0">
    <button class="btn sm" data-act="vehCompartir">${ICONS.wa} Compartir</button>
    <button class="btn sm" data-act="vehTramite">${ICONS.folder} Crear trámite</button>
    <button class="btn sm" onclick="window.print()">🖨️ PDF</button>
  </div>

  <details class="card tight plan" ${V.verPlan ? 'open' : ''} id="vehPlan">
    <summary style="padding:14px;cursor:pointer;font-weight:700">📅 Plan de pagos (${plazo} cuotas)</summary>
    <div class="table-wrap" style="max-height:420px">
      <table class="tbl num"><thead><tr><th>N°</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Seguros</th><th>Saldo</th></tr></thead><tbody>
      ${r.map(x => `<tr${cVar && x.k === fijo + 1 ? ' style="border-top:2px solid var(--gold)"' : ''}><td>${x.k}</td><td>${fmtShort(x.fecha)} ${x.fecha.slice(2, 4)}</td><td><b>${nf2.format(x.total)}</b></td><td>${nf2.format(x.capital)}</td><td>${nf2.format(x.interes)}</td><td>${nf2.format(x.desg)}</td><td>${nf2.format(x.saldo)}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </details>
  <p class="small muted">Seguros calculados sobre el saldo capital de cada mes. Cuota variable estimada con la TRe vigente; puede cambiar cuando el BCB publique una nueva.</p>`;
  $('#vehPlan')?.addEventListener('toggle', e => { V.verPlan = e.target.open; guardarCalc(); });
  vehCalc.ultimo = { V: { ...V }, monto, c1, cVar, plazo, fijo, tasaVar, desgTxt, dima, primaMSC };
}

/* ---------------- Enlace con la app ---------------- */
ROUTES.calculadora.render = () => vehForm() + `<p class="small muted center no-print">Cálculos referenciales. Aplica siempre la normativa interna vigente del banco.</p>`;
ROUTES.calculadora.after = () => {
  const V = vehState();
  const form = $('#vehForm');
  if (!form) return;
  const rerender = ['codeudor', 'msc', 'plazo'];
  const onChange = e => {
    Object.entries(formData(form)).forEach(([k, v]) => { V[k] = v; });
    if (e.target.name === 'plazo' && num(V.periodoFijo) > num(V.plazo)) V.periodoFijo = V.plazo;
    guardarCalc();
    if (rerender.includes(e.target.name)) { render(); return; }
    vehCalc();
  };
  const esCambio = t => t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'date';
  form.addEventListener('input', e => { if (!esCambio(e.target)) onChange(e); });
  form.addEventListener('change', e => { if (esCambio(e.target)) onChange(e); });
  vehCalc();
};

Object.assign(ACTIONS, {
  vehCompartir: () => {
    const u = vehCalc.ultimo; if (!u) return;
    const m = u.V.moneda;
    const text = `*Propuesta de crédito vehicular* (${fmtDate(today())})
${u.V.nombre ? 'Cliente: ' + u.V.nombre + '\n' : ''}Vehículo ${u.V.producto === 'nuevo' ? 'nuevo' : 'usado'} · valor ${fmt(num(u.V.valor), m)}
Monto a financiar: ${fmt(u.monto, m)}
Plazo: ${u.plazo} meses
Cuota mensual: *${fmt(u.c1.total, m)}*${u.cVar ? ` (meses 1-${u.fijo}); desde el mes ${u.fijo + 1}: ${fmt(u.cVar.total, m)} aprox.` : ''}
Incluye desgravamen${u.dima ? ' y DIMA' : ''}${u.primaMSC ? '; seguro automotor financiado' : ''}.
Sujeto a evaluación y aprobación.
${S().settings.ejecutivo || ''} - Banco Mercantil Santa Cruz`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  },
  vehTramite: () => {
    const u = vehCalc.ultimo; if (!u) return;
    caseForm({}, { tipo: 'vehicular', monto: Math.round(u.monto * 100) / 100, moneda: u.V.moneda, tasa: num(u.V.tasaFija), plazo: u.plazo, prospecto: u.V.nombre, destino: `Vehículo ${u.V.producto}` });
  }
});

if (current.name === 'calculadora') render();
