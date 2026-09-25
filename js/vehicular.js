/* Simulador de crédito vehicular (requisitos del banco).
   Secciones: propuesta, datos del cliente (titular y codeudor), seguros y condiciones.
   Reglas y tasas en VEH: se ajustan aquí cuando cambie la norma. */
'use strict';

const VEH = {
  edadMax: { anios: 70, dias: 360 },          // desgravamen: hasta 70 años y 360 días (sin cumplir 71)
  edadCredito: 76,                            // el crédito no puede pasar de los 76 años del mayor
  desgravamen: { titular: 1.250, mancomunado: 2.251 }, // % sobre saldo capital
  dima: { titular: 0.36, mancomunado: 0.72 },          // % sobre saldo capital
  periodoSeguros: 12,                          // los % de seguros son anuales → se cobran /12 cada mes
  msc: { normal: 3.8, hibrido: 4.4 },          // % del valor del vehículo, se suma al monto a financiar
  plazos: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  treMN: 3.65, treVigencia: 'septiembre 2026'  // TRe MN publicada por el BCB (respaldo)
};
const pct3 = v => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
const mensual = anual => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 3, maximumFractionDigits: 4 }).format(anual / 12);
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
    desgT: '', desgC: '', dimaT: '', dimaC: '', producto: 'nuevo', moneda: 'BOB', valor: 150000, aportePct: 20,
    tasaFija: 9, margenVar: 3, plazo: 60, periodoFijo: 24, msc: 'no', motor: 'normal'
  };
  return C.veh;
}

const siNo = (name, value, labels = ['Sí', 'No']) => `
  <div class="seg-toggle" role="radiogroup">
    <label><input type="radio" name="${name}" value="si" ${value === 'si' ? 'checked' : ''}><span>${labels[0]}</span></label>
    <label><input type="radio" name="${name}" value="no" ${value !== 'si' ? 'checked' : ''}><span>${labels[1]}</span></label>
  </div>`;
const chk = (name, value, label) => `<label class="chk"><input type="checkbox" name="${name}" ${value === 'si' ? 'checked' : ''}><span>${label}</span></label>`;
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
      <div class="veh-row veh-seg"><div><span>Seguro de desgravamen</span><div class="small muted" id="desgInfo"></div></div>
        <div class="chk-group">${chk('desgT', V.desgT, 'Titular')}${V.codeudor === 'si' ? chk('desgC', V.desgC, 'Codeudor') : ''}</div></div>
      <div class="veh-row veh-seg"><div><span>Seguro DIMA</span><div class="small muted" id="dimaInfo"></div></div>
        <div class="chk-group">${chk('dimaT', V.dimaT, 'Titular')}${V.codeudor === 'si' ? chk('dimaC', V.dimaC, 'Codeudor') : ''}</div></div>
    `)}

    ${seccion(3, 'Condiciones', `
      <div class="fields-2">
        ${field({ label: 'Interés fijo % anual', name: 'tasaFija', type: 'money', value: V.tasaFija })}
        ${field({ label: 'Interés variable % anual', name: 'margenVar', type: 'money', value: V.margenVar })}
      </div>
      <div class="fields-2">
        <div class="field"><label>TRe MN</label><div class="veh-tre"><b>${nf2.format(treMN())}%</b><span class="small muted">BCB · ${esc(treVigencia())}</span></div></div>
        ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'select', value: V.plazo, options: VEH.plazos.map(n => ({ v: n, l: `${n} meses` })), hint: `<span id="plazoInfo"></span>` })}
      </div>
      ${field({ label: 'Plazo tasa fija (meses)', name: 'periodoFijo', type: 'number', value: V.periodoFijo, attrs: `inputmode="numeric" min="0" max="${V.plazo}" step="1"`, hint: 'Solo números enteros, sin superar el plazo' })}
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

  // Desgravamen: el ejecutivo marca a quién cubre (nada viene marcado). Solo se puede marcar a quien
  // tiene hasta 70 años y 360 días. Uno marcado → tasa individual; los dos → tasa titular y codeudor.
  // DIMA: a elección, solo para quien tiene desgravamen marcado.
  const okT = elegible(eT), okC = conCodeudor && elegible(eC);
  const ajusta = (name, permitido) => {
    const el = $(`#vehForm input[name=${name}]`);
    if (!permitido && V[name] === 'si') V[name] = '';
    if (el) { el.disabled = !permitido; el.checked = V[name] === 'si'; el.closest('.chk').classList.toggle('off', !permitido); }
  };
  if (!conCodeudor) { V.desgC = ''; V.dimaC = ''; }
  ajusta('desgT', okT); ajusta('desgC', okC);
  ajusta('dimaT', okT && V.desgT === 'si'); ajusta('dimaC', okC && V.desgC === 'si');
  const nDesg = (V.desgT === 'si') + (V.desgC === 'si');
  const nDima = (V.dimaT === 'si') + (V.dimaC === 'si');
  const desg = nDesg === 2 ? VEH.desgravamen.mancomunado : nDesg === 1 ? VEH.desgravamen.titular : 0;
  const dima = nDima === 2 ? VEH.dima.mancomunado : nDima === 1 ? VEH.dima.titular : 0;
  const quien = (t, c) => t && c ? 'Titular y codeudor' : t ? 'Titular' : c ? 'Codeudor' : '';
  const aplica = nDesg > 0;
  const desgTxt = aplica ? `${quien(V.desgT === 'si', V.desgC === 'si')} · ${pct3(desg)}% anual (${mensual(desg)}% mensual)` : 'Sin desgravamen';
  const dimaTxt = dima ? `${quien(V.dimaT === 'si', V.dimaC === 'si')} · ${pct3(dima)}% anual (${mensual(dima)}% mensual)` : '';
  const info = $('#desgInfo');
  if (info) info.textContent = aplica ? desgTxt : `1 persona ${pct3(VEH.desgravamen.titular)}% · 2 personas ${pct3(VEH.desgravamen.mancomunado)}% anual · hasta ${VEH.edadMax.anios} años y ${VEH.edadMax.dias} días`;
  const dInfo = $('#dimaInfo');
  if (dInfo) dInfo.textContent = dima ? dimaTxt : aplica ? `1 persona ${pct3(VEH.dima.titular)}% · 2 personas ${pct3(VEH.dima.mancomunado)}% anual` : 'Solo para quien tiene desgravamen';

  // Montos
  // El monto del crédito se definirá en la próxima sección; por ahora se muestra un resumen de la propuesta
  const valor = 0, aporte = 0, primaMSC = 0;
  const monto = num(V.monto);
  // Plazo máximo: el crédito debe terminar antes de que el mayor de los dos pase los 76 años
  const fechas = [V.fnac, conCodeudor ? V.cFnac : null].map(parseDate).filter(Boolean);
  const mayor = fechas.length ? new Date(Math.min(...fechas)) : null;
  let plazoMax = VEH.plazos.at(-1);
  if (mayor) {
    const hoy = parseDate(today());
    const limite = new Date(mayor.getFullYear() + VEH.edadCredito, mayor.getMonth(), mayor.getDate());
    let meses = (limite.getFullYear() - hoy.getFullYear()) * 12 + (limite.getMonth() - hoy.getMonth());
    if (limite.getDate() < hoy.getDate()) meses--;
    plazoMax = Math.min(plazoMax, Math.max(0, Math.floor(meses / 12) * 12));
  }
  const sel = $('#vehForm [name=plazo]');
  if (sel) [...sel.options].forEach(o => { o.disabled = +o.value > plazoMax; });
  const plazoPedido = parseInt(V.plazo, 10) || 12;
  if (plazoMax >= 12 && plazoPedido > plazoMax) {
    V.plazo = plazoMax; V.plazoAjustado = true; if (sel) sel.value = plazoMax;
    if (num(V.periodoFijo) > plazoMax) { V.periodoFijo = plazoMax; const pf = $('#vehForm [name=periodoFijo]'); if (pf) pf.value = plazoMax; }
    guardarCalc();
  }
  const plazo = parseInt(V.plazo, 10) || 12;
  const plazoInfo = $('#plazoInfo');
  if (plazoInfo) plazoInfo.textContent = mayor ? `Máximo ${plazoMax} meses (hasta ${VEH.edadCredito} años del mayor)` : '';
  const fijo = Math.min(plazo, Math.max(0, parseInt(V.periodoFijo, 10) || 0));
  const tasaVar = treMN() + num(V.margenVar);
  const tv = $('#tasaVarInfo');
  if (tv) tv.innerHTML = fijo < plazo
    ? `Tasa desde el mes ${fijo + 1}: TRe ${nf2.format(treMN())}% + ${nf2.format(num(V.margenVar))}% = <b>${nf2.format(tasaVar)}%</b>`
    : 'Tasa fija durante todo el plazo';

  const avisos = [];
  if (!V.fnac) avisos.push('Ingresa la fecha de nacimiento del titular (obligatoria).');
  if (conCodeudor && !V.cFnac) avisos.push('Ingresa la fecha de nacimiento del codeudor (obligatoria).');
  if (eT && !okT) avisos.push(`El titular supera la edad para desgravamen (${edadTxt(eT)}): no puede llevar desgravamen ni DIMA.`);
  if (conCodeudor && eC && !okC) avisos.push(`El codeudor supera la edad para desgravamen (${edadTxt(eC)}): no puede llevar desgravamen ni DIMA.`);
  if (mayor && plazoMax < 12) avisos.push(`El mayor de los clientes ya no puede tomar un crédito de al menos 12 meses sin pasar los ${VEH.edadCredito} años.`);
  else if (mayor && V.plazoAjustado && plazo === plazoMax) avisos.push(`Plazo ajustado a ${plazoMax} meses: el crédito no puede pasar de los ${VEH.edadCredito} años del mayor.`);
  if (num(V.periodoFijo) > plazo) avisos.push(`El periodo de tasa fija no puede superar el plazo (${plazo} meses).`);
  if (!(monto > 0)) {
    out.innerHTML = `
    ${avisos.length ? `<div class="card veh-avisos">${avisos.map(a => `<div>⚠️ ${esc(a)}</div>`).join('')}</div>` : ''}
    <div class="card">
      <div class="veh-res-title">Resumen de la propuesta</div>
      <dl class="kv">
        <dt>Fecha</dt><dd>${fmtDate(today())}</dd>
        <dt>Titular</dt><dd>${esc(V.nombre || '—')}${eT ? ' · ' + edadTxt(eT) : ''}</dd>
        ${conCodeudor ? `<dt>Codeudor</dt><dd>${esc(V.cNombre || '—')}${eC ? ' · ' + edadTxt(eC) : ''}</dd>` : ''}
        <dt>Desgravamen</dt><dd>${esc(desgTxt)}</dd>
        <dt>DIMA</dt><dd>${dima ? esc(dimaTxt) : 'No'}</dd>
        <dt>Interés fijo</dt><dd>${nf2.format(num(V.tasaFija))}% anual · meses 1 a ${fijo}</dd>
        ${fijo < plazo ? `<dt>Interés variable</dt><dd>${nf2.format(num(V.margenVar))}% + TRe ${nf2.format(treMN())}% = ${nf2.format(tasaVar)}% · meses ${fijo + 1} a ${plazo}</dd>` : ''}
        <dt>Plazo</dt><dd>${plazo} meses (${plazo / 12} ${plazo === 12 ? 'año' : 'años'})</dd>
      </dl>
    </div>
    <div class="card empty small">💡 Falta el monto del crédito para calcular la cuota. Se agregará en la siguiente sección.</div>`;
    vehCalc.ultimo = null;
    return;
  }

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
      <dt>DIMA</dt><dd>${dima ? esc(dimaTxt) : 'No'}</dd>
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
  <p class="small muted">Desgravamen y DIMA: tasa anual ÷ 12, aplicada cada mes sobre el saldo capital. Cuota variable estimada con la TRe vigente; puede cambiar cuando el BCB publique una nueva.</p>`;
  $('#vehPlan')?.addEventListener('toggle', e => { V.verPlan = e.target.open; guardarCalc(); });
  vehCalc.ultimo = { V: { ...V }, monto, c1, cVar, plazo, fijo, tasaVar, desgTxt, dima, primaMSC, aplica };
}

/* ---------------- Enlace con la app ---------------- */
ROUTES.calculadora.render = () => vehForm() + `<p class="small muted center no-print">Cálculos referenciales. Aplica siempre la normativa interna vigente del banco.</p>`;
ROUTES.calculadora.after = () => {
  const V = vehState();
  const form = $('#vehForm');
  if (!form) return;
  const rerender = ['codeudor', 'plazo'];
  const onChange = e => {
    Object.entries(formData(form)).forEach(([k, v]) => { V[k] = v; });
    $$('input[type=checkbox]', form).forEach(ch => { V[ch.name] = ch.checked ? 'si' : ''; });
    if (e.target.name === 'periodoFijo') {
      const entero = String(Math.max(0, parseInt(String(V.periodoFijo), 10) || 0));
      if (entero !== String(V.periodoFijo)) { V.periodoFijo = entero; e.target.value = entero; }
    }
    if (e.target.name === 'plazo') { V.plazoAjustado = false; if (num(V.periodoFijo) > num(V.plazo)) V.periodoFijo = V.plazo; }
    guardarCalc();
    if (rerender.includes(e.target.name)) { render(); return; }
    vehCalc();
  };
  const esCambio = t => t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'checkbox' || t.type === 'date';
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
${u.aplica ? `Incluye desgravamen${u.dima ? ' y DIMA' : ''}` : 'Sin desgravamen'}${u.primaMSC ? '; seguro automotor financiado' : ''}.
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
