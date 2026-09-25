/* Calculadora de créditos · Banca Personas (mercado boliviano)
   - Simulador: consumo, vivienda (incluye interés social con tasa regulada por UFV), vehicular y línea de crédito.
     Sistema francés o alemán, tasa fija o mixta (fija + variable), período de gracia, seguros, TEA y TEAC,
     plan de pagos con fechas, tabla por plazos, riesgo cambiario para créditos en dólares.
   - Capacidad de pago: líquido pagable (aportes a la Gestora + Aporte Nacional Solidario), relación cuota/ingreso
     y monto máximo por producto.
   - Tarjeta de crédito: pago mínimo vs. pago fijo, tiempo y costo de la deuda, compras en cuotas.
   - Prepago: amortización extraordinaria reduciendo cuota o plazo.
   - Conversor: Bs ↔ $us (TCO) y Bs ↔ UFV, límites de vivienda social.
   Los parámetros por producto (tasa, plazo, financiamiento, endeudamiento, seguros) se editan en
   Más → Parámetros de productos. */
'use strict';

/* ---------------- Parámetros ---------------- */
const prod = id => ({ ...PRODUCTOS_DEFAULT[id], ...((S().settings.productos || {})[id] || {}) });
const valorUFV = () => num(S().settings.ufvManual) || S().settings.ufv?.valor || UFV_RESPALDO.valor;
const fechaUFV = () => (num(S().settings.ufvManual) ? 'manual' : S().settings.ufv?.fecha || UFV_RESPALDO.fecha);
const SIM_PRODUCTOS = ['consumo', 'vivienda', 'vehicular', 'linea'];

/* ---------------- Matemática financiera ---------------- */
const tasaMensual = anual => num(anual) / 100 / 12;
const teaDe = anual => Math.pow(1 + tasaMensual(anual), 12) - 1;
function cuotaFija(monto, anual, n) {
  const i = tasaMensual(anual);
  if (!n) return 0;
  return i ? monto * i / (1 - Math.pow(1 + i, -n)) : monto / n;
}
function montoPorCuota(cuota, anual, n) {
  const i = anual;
  if (!n || cuota <= 0) return 0;
  return i ? cuota * (1 - Math.pow(1 + i, -n)) / i : cuota * n;
}
function sumarMeses(iso, k, dia) {
  const d = parseDate(iso) || new Date();
  const y = d.getFullYear(), m = d.getMonth() + k;
  const ultimo = new Date(y, m + 1, 0).getDate();
  return isoDate(new Date(y, m, Math.min(dia || d.getDate(), ultimo)));
}
/* Plan de pagos completo */
function generarPlan(o) {
  const n = Math.max(1, Math.min(600, parseInt(o.n, 10) || 0));
  const gracia = Math.max(0, Math.min(n - 1, parseInt(o.gracia, 10) || 0));
  const dia = parseInt(o.diaPago, 10) || (parseDate(o.fecha) || new Date()).getDate();
  let saldo = o.monto;
  const rows = [];
  let amortAleman = null;
  for (let k = 1; k <= n; k++) {
    const anual = o.mesesFijos && k > o.mesesFijos ? o.tasaVar : o.tasa;
    const i = tasaMensual(anual);
    const interes = saldo * i;
    let capital = 0;
    if (k > gracia) {
      if (o.sistema === 'aleman') {
        if (amortAleman === null) amortAleman = saldo / (n - gracia);
        capital = amortAleman;
      } else {
        capital = cuotaFija(saldo, anual, n - k + 1) - interes;
      }
      if (k === n || capital > saldo) capital = saldo;
    }
    const desg = saldo * (num(o.desg) / 100);
    const seguro = o.seguroMes || 0;
    const cuota = capital + interes;
    rows.push({ k, fecha: sumarMeses(o.fecha, k, dia), capital, interes, desg, seguro, cuota, total: cuota + desg + seguro, saldo: Math.max(0, saldo - capital), tasa: num(anual) });
    saldo -= capital;
  }
  const t = rows.reduce((a, r) => ({ capital: a.capital + r.capital, interes: a.interes + r.interes, desg: a.desg + r.desg, seguro: a.seguro + r.seguro, total: a.total + r.total }), { capital: 0, interes: 0, desg: 0, seguro: 0, total: 0 });
  return { rows, totales: t, n, gracia };
}
/* Tasa interna de retorno mensual (bisección) → TEAC */
function tirMensual(inicial, pagos) {
  const vpn = r => pagos.reduce((a, p, k) => a + p / Math.pow(1 + r, k + 1), -inicial);
  let lo = 0, hi = 1;
  if (vpn(lo) < 0) return 0;
  for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (vpn(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function liquidoAsalariado(bruto) {
  const laboral = bruto * APORTES.laboral / 100;
  const ans = APORTES.ans.reduce((a, t) => a + Math.max(0, bruto - t.sobre) * t.pct / 100, 0);
  return { liquido: Math.max(0, bruto - laboral - ans), laboral, ans };
}
function evaluarVIS(valor, moneda, tipoInmueble) {
  const bs = moneda === 'USD' ? valor * tc() : valor;
  const ufv = bs / valorUFV();
  const limite = tipoInmueble === 'depto' ? VIS.limiteDepto : VIS.limiteCasa;
  const tramo = VIS.tramos.find(t => ufv <= t.hasta);
  return { bs, ufv, limite, califica: ufv > 0 && ufv <= limite && !!tramo, tasaMax: tramo ? tramo.tasa : null };
}

/* ---------------- Estado de la calculadora ---------------- */
function simDefaults(id) {
  const P = prod(id);
  return {
    producto: id, moneda: 'BOB',
    monto: id === 'consumo' ? 50000 : 30000,
    montoLinea: 50000,
    valorBien: id === 'vivienda' ? 700000 : 150000,
    aportePct: Math.max(0, 100 - P.financiamiento),
    plazo: Math.min(P.plazoMax || 36, { consumo: 36, vivienda: 240, vehicular: 60, linea: 24 }[id] || 36),
    tasa: P.tasa, tasaTipo: 'fija', mesesFijos: 36, tasaVar: +(num(P.tasa) + 2).toFixed(2),
    sistema: 'frances', gracia: 0, desg: P.desgravamen, seguroBien: P.seguroBien, gastos: 0,
    fecha: today(), diaPago: '', esVIS: false, tipoInmueble: 'casa', condicion: 'nuevo', verPlan: false
  };
}
function calcState() {
  if (!UI.calc) {
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem('mc_calc') || 'null'); } catch { /* sin almacenamiento */ }
    UI.calc = guardado || {};
    UI.calc.tab = UI.calc.tab || 'simulador';
    UI.calc.sim = UI.calc.sim && SIM_PRODUCTOS.includes(UI.calc.sim.producto) ? UI.calc.sim : simDefaults('consumo');
    UI.calc.cap = UI.calc.cap || { tipoIngreso: 'asalariado_bruto', ingreso: 8000, otros: 0, conyuge: 0, gastos: 0, cuotas: 0, limiteTC: 0, producto: 'consumo' };
    UI.calc.tj = UI.calc.tj || { limite: 20000, saldo: 10000, tasa: prod('tarjeta').tasa, minPct: prod('tarjeta').pagoMinimo, minBs: 50, pagoFijo: 1000, meses: 12, compra: 3000, cuotas: 6 };
    UI.calc.pre = UI.calc.pre || { saldo: 100000, tasa: 12, plazo: 48, prepago: 20000, modo: 'plazo', moneda: 'BOB' };
    UI.calc.conv = UI.calc.conv || { bs: 1000, usd: 100, ufv: 100000 };
  }
  return UI.calc;
}
function guardarCalc() { try { localStorage.setItem('mc_calc', JSON.stringify(UI.calc)); } catch { /* sin almacenamiento */ } }
const fmt = (n, m = 'BOB') => money(n, m);
const leerForm = (form, obj) => {
  Object.entries(formData(form)).forEach(([k, v]) => { obj[k] = v; });
  $$('input[type=checkbox]', form).forEach(ch => { obj[ch.name] = ch.checked; });
};

/* ---------------- Vista principal ---------------- */
const TABS_CALC = [
  ['simulador', '🧮 Simulador'], ['capacidad', '📊 Capacidad de pago'], ['tarjeta', '💳 Tarjeta'],
  ['prepago', '⏩ Prepago'], ['conversor', '💱 Conversor']
];
function viewCalculadora() {
  const C = calcState();
  C.tab = 'simulador'; // por ahora la calculadora muestra solo el simulador
  const tabs = '';
  const body = { simulador: simForm, capacidad: capForm, tarjeta: tjForm, prepago: preForm, conversor: convForm }[C.tab]();
  return tabs + body + `<p class="small muted center no-print">Cálculos referenciales. Aplica siempre la normativa interna vigente del banco.</p>`;
}
function actualizarCalc() {
  const C = calcState();
  ({ simulador: simCalc, capacidad: capCalc, tarjeta: tjCalc, prepago: preCalc, conversor: convCalc })[C.tab]();
  guardarCalc();
}

/* ================= SIMULADOR ================= */
const SIM_ACTIVOS = ['vehicular']; // productos visibles en el simulador (por ahora solo vehicular)
function simForm() {
  if (!SIM_ACTIVOS.includes(calcState().sim.producto)) calcState().sim = simDefaults(SIM_ACTIVOS[0]);
  const C = calcState().sim;
  const id = C.producto;
  const P = prod(C.esVIS && id === 'vivienda' ? 'vivienda_social' : id);
  const monedas = CATALOG.monedas.map(m => ({ v: m.id, l: m.nombre }));
  const bien = id === 'vivienda' || id === 'vehicular';
  return `
  <div class="chips no-print">${SIM_ACTIVOS.length < 2 ? '' : SIM_ACTIVOS.map(p => `<button class="chip ${id === p ? 'active' : ''}" data-act="simProducto" data-id="${p}">${tipoInfo(p).icon} ${esc(tipoInfo(p).label)}</button>`).join('')}</div>
  <form id="simForm" class="card calc-form no-print" onsubmit="return false">
    <div class="fields-2">
      ${field({ label: 'Moneda', name: 'moneda', type: 'select', value: C.moneda, options: monedas })}
      ${id === 'linea' ? field({ label: 'Monto de la línea', name: 'montoLinea', type: 'money', value: C.montoLinea })
        : bien ? field({ label: id === 'vivienda' ? 'Valor del inmueble' : 'Precio del vehículo', name: 'valorBien', type: 'money', value: C.valorBien })
        : field({ label: 'Monto del crédito', name: 'monto', type: 'money', value: C.monto })}
    </div>
    ${bien ? `<div class="fields-2">
      ${field({ label: 'Aporte propio %', name: 'aportePct', type: 'money', value: C.aportePct, hint: `Financiamiento máx. ${P.financiamiento}%` })}
      ${id === 'vehicular'
        ? field({ label: 'Vehículo', name: 'condicion', type: 'select', value: C.condicion, options: [{ v: 'nuevo', l: 'Nuevo (0 km)' }, { v: 'usado', l: 'Usado' }] })
        : field({ label: 'Tipo de inmueble', name: 'tipoInmueble', type: 'select', value: C.tipoInmueble, options: [{ v: 'casa', l: 'Casa' }, { v: 'depto', l: 'Departamento' }] })}
    </div>` : ''}
    ${id === 'vivienda' ? `<label class="check" style="padding:4px 0 12px;border:0"><input type="checkbox" name="esVIS" ${C.esVIS ? 'checked' : ''}>
      <span class="t">Única vivienda, sin fines comerciales (evaluar <b>Vivienda de Interés Social</b>)</span></label>` : ''}
    ${id === 'linea' ? field({ label: 'Monto a utilizar', name: 'monto', type: 'money', value: C.monto, hint: 'Paga intereses solo sobre lo utilizado' }) : ''}
    <div class="fields-2">
      ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'number', value: C.plazo, attrs: 'inputmode="numeric" min="1" max="600"', hint: `${(num(C.plazo) / 12).toFixed(1).replace('.', ',')} años · máx. ${P.plazoMax} m` })}
      ${field({ label: 'Tasa anual %', name: 'tasa', type: 'money', value: C.tasa, hint: `TEA ${pct(teaDe(C.tasa), 2)}` })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Tipo de tasa', name: 'tasaTipo', type: 'select', value: C.tasaTipo, options: [{ v: 'fija', l: 'Fija todo el plazo' }, { v: 'mixta', l: 'Fija y luego variable' }] })}
      ${field({ label: 'Sistema', name: 'sistema', type: 'select', value: C.sistema, options: [{ v: 'frances', l: 'Cuota fija (francés)' }, { v: 'aleman', l: 'Cuota decreciente (alemán)' }] })}
    </div>
    ${C.tasaTipo === 'mixta' ? `<div class="fields-2">
      ${field({ label: 'Meses con tasa fija', name: 'mesesFijos', type: 'number', value: C.mesesFijos, attrs: 'inputmode="numeric" min="1"' })}
      ${field({ label: 'Tasa variable estimada %', name: 'tasaVar', type: 'money', value: C.tasaVar, hint: 'TRe + margen' })}
    </div>` : ''}
    <details class="mas-opciones" ${C.abierto ? 'open' : ''}>
      <summary class="link" style="cursor:pointer;margin-bottom:10px">Seguros, gracia y fechas</summary>
      <div class="fields-2">
        ${field({ label: 'Desgravamen % mensual', name: 'desg', type: 'money', value: C.desg, hint: 'Sobre el saldo' })}
        ${bien ? field({ label: id === 'vivienda' ? 'Seguro inmueble % anual' : 'Seguro automotor % anual', name: 'seguroBien', type: 'money', value: C.seguroBien, hint: 'Sobre el valor del bien' }) : field({ label: 'Gastos iniciales', name: 'gastos', type: 'money', value: C.gastos, hint: 'Se incluyen en la TEAC' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Meses de gracia', name: 'gracia', type: 'number', value: C.gracia, attrs: 'inputmode="numeric" min="0"', hint: 'Solo paga intereses' })}
        ${bien ? field({ label: 'Gastos iniciales', name: 'gastos', type: 'money', value: C.gastos, hint: 'Avalúo, legales, etc.' }) : field({ label: 'Día de pago', name: 'diaPago', type: 'number', value: C.diaPago, attrs: 'inputmode="numeric" min="1" max="31"', placeholder: 'Igual al desembolso' })}
      </div>
      <div class="fields-2">
        ${field({ label: 'Fecha de desembolso', name: 'fecha', type: 'date', value: C.fecha })}
        ${bien ? field({ label: 'Día de pago', name: 'diaPago', type: 'number', value: C.diaPago, attrs: 'inputmode="numeric" min="1" max="31"', placeholder: 'Igual al desembolso' }) : '<div></div>'}
      </div>
    </details>
  </form>
  <div id="simOut"></div>`;
}

function simDatos() {
  const C = calcState().sim;
  const id = C.producto;
  const bien = id === 'vivienda' || id === 'vehicular';
  let vis = null;
  if (id === 'vivienda') {
    vis = evaluarVIS(num(C.valorBien), C.moneda, C.tipoInmueble);
    if (C.esVIS && vis.califica && num(C.tasa) !== vis.tasaMax) {
      C.tasa = vis.tasaMax;
      const inp = $('#simForm [name=tasa]'); if (inp) inp.value = String(vis.tasaMax).replace('.', ',');
    }
  }
  const P = prod(C.esVIS && vis?.califica ? 'vivienda_social' : id);
  const valor = num(C.valorBien);
  const monto = bien ? valor * (1 - num(C.aportePct) / 100) : num(C.monto);
  const seguroMes = bien ? valor * num(C.seguroBien) / 100 / 12 : 0;
  const plan = generarPlan({
    monto, n: C.plazo, tasa: num(C.tasa), sistema: C.sistema, gracia: C.gracia,
    mesesFijos: C.tasaTipo === 'mixta' ? parseInt(C.mesesFijos, 10) || 0 : 0, tasaVar: num(C.tasaVar),
    desg: C.desg, seguroMes, fecha: C.fecha, diaPago: C.diaPago
  });
  return { C, id, P, bien, valor, monto, seguroMes, plan, vis };
}

function simCalc() {
  const out = $('#simOut');
  if (!out) return;
  const { C, id, P, bien, valor, monto, plan, vis } = simDatos();
  const m = C.moneda;
  if (!(monto > 0) || !(num(C.plazo) > 0)) { out.innerHTML = '<div class="card empty">Ingresa el monto y el plazo</div>'; return; }
  const r = plan.rows;
  const primera = r[plan.gracia] || r[0];
  const ultima = r[r.length - 1];
  const mixta = C.tasaTipo === 'mixta' && num(C.mesesFijos) < plan.n;
  const trasCambio = mixta ? r[Math.min(r.length - 1, parseInt(C.mesesFijos, 10))] : null;
  const teac = Math.pow(1 + tirMensual(monto - num(C.gastos), r.map(x => x.total)), 12) - 1;
  const aBs = v => (m === 'USD' ? v * tc() : v);
  const ingresoMin = aBs(primera.total) / (P.rci / 100);

  // Alertas de política (parámetros referenciales)
  const avisos = [];
  if (P.plazoMax && num(C.plazo) > P.plazoMax) avisos.push(`El plazo supera el máximo referencial de ${P.plazoMax} meses.`);
  if (bien && 100 - num(C.aportePct) > P.financiamiento) avisos.push(`El financiamiento (${nf0.format(100 - num(C.aportePct))}%) supera el máximo de ${P.financiamiento}%. Aporte mínimo: ${fmt(valor * (1 - P.financiamiento / 100), m)}.`);
  if (id === 'linea' && num(C.monto) > num(C.montoLinea)) avisos.push('El monto a utilizar supera el monto de la línea.');
  if (C.esVIS && vis && !vis.califica) avisos.push(`No califica como vivienda de interés social: el valor equivale a UFV ${nf0.format(vis.ufv)} (límite UFV ${nf0.format(vis.limite)}).`);
  if (C.esVIS && vis?.califica && m === 'USD') avisos.push('Los créditos de vivienda de interés social se otorgan en moneda nacional (bolivianos).');
  if (id === 'vehicular' && C.condicion === 'usado') avisos.push('Vehículo usado: requiere inspección técnica y avalúo; revisa plazo y financiamiento según antigüedad.');

  const plazos = [12, 24, 36, 48, 60, 72, 84, 120, 180, 240, 300, 360].filter(n => n <= Math.max(P.plazoMax || 60, num(C.plazo)));
  const tablaPlazos = plazos.map(n => {
    const p = generarPlan({ monto, n, tasa: num(C.tasa), sistema: C.sistema, gracia: 0, mesesFijos: 0, desg: C.desg, seguroMes: bien ? valor * num(C.seguroBien) / 1200 : 0, fecha: C.fecha });
    return { n, cuota: p.rows[0].total, interes: p.totales.interes };
  });

  out.innerHTML = `
  <div class="hero">
    <div class="label">${tipoInfo(C.esVIS && vis?.califica ? 'vivienda_social' : id).icon} ${esc(tipoInfo(C.esVIS && vis?.califica ? 'vivienda_social' : id).label)} · ${C.sistema === 'aleman' ? 'primera cuota' : 'cuota mensual'} total</div>
    <div class="big num">${fmt(primera.total, m)}</div>
    <div class="small" style="opacity:.9">Capital + interés ${fmt(primera.cuota, m)} · desgravamen ${fmt(primera.desg, m)}${primera.seguro ? ' · seguro ' + fmt(primera.seguro, m) : ''}</div>
    <div class="meta" style="margin-top:10px">
      <div><b class="num">${fmt(monto, m)}</b>financiado</div>
      <div><b class="num">${plan.n} m</b>${(plan.n / 12).toFixed(1).replace('.', ',')} años</div>
      <div><b class="num">${pct(teaDe(C.tasa), 2)}</b>TEA</div>
      <div><b class="num">${pct(teac, 2)}</b>TEAC*</div>
    </div>
  </div>
  ${avisos.length ? `<div class="card" style="margin-top:10px;border-color:var(--orange)">${avisos.map(a => `<div class="small">⚠️ ${esc(a)}</div>`).join('')}</div>` : ''}
  ${vis && (C.esVIS || vis.califica) ? `<div class="card" style="margin-top:10px">
    <div class="row between"><b>🏡 Vivienda de interés social</b><span class="badge ${vis.califica ? '' : 'red'}">${vis.califica ? 'Califica' : 'No califica'}</span></div>
    <div class="small muted" style="margin-top:4px">Valor: Bs ${nf0.format(vis.bs)} = <b>UFV ${nf0.format(vis.ufv)}</b> (UFV ${nf2.format(valorUFV())} al ${esc(fechaUFV())}). Límite ${C.tipoInmueble === 'depto' ? 'departamento' : 'casa'}: UFV ${nf0.format(vis.limite)}.</div>
    ${vis.califica ? `<div class="small" style="margin-top:4px">Tasa máxima regulada: <b>${nf2.format(vis.tasaMax)}%</b>${C.esVIS ? ' (aplicada)' : ' · marca "Única vivienda" para aplicarla'}</div>` : ''}
  </div>` : ''}

  <div class="grid-2" style="margin-top:10px">
    <div class="card kpi"><div class="v num">${fmt(plan.totales.interes, m)}</div><div class="l">Total intereses</div></div>
    <div class="card kpi"><div class="v num">${fmt(plan.totales.desg + plan.totales.seguro, m)}</div><div class="l">Total seguros</div></div>
    <div class="card kpi"><div class="v num">${fmt(plan.totales.total + num(C.gastos), m)}</div><div class="l">Total a pagar</div></div>
    <div class="card kpi"><div class="v num">Bs ${nf0.format(ingresoMin)}</div><div class="l">Ingreso neto mínimo (RCI ${P.rci}%)</div></div>
  </div>
  ${C.sistema === 'aleman' || mixta || plan.gracia ? `<div class="card small">
    ${plan.gracia ? `<div>Gracia: ${plan.gracia} meses pagando solo intereses (${fmt(r[0].total, m)}).</div>` : ''}
    ${mixta ? `<div>Desde la cuota ${num(C.mesesFijos) + 1}, con tasa de ${esc(C.tasaVar)}%: cuota estimada <b>${fmt(trasCambio.total, m)}</b> (${trasCambio.total >= primera.total ? '+' : ''}${fmt(trasCambio.total - primera.total, m)}).</div>` : ''}
    ${C.sistema === 'aleman' ? `<div>Última cuota: <b>${fmt(ultima.total, m)}</b>. La cuota baja cada mes.</div>` : ''}
  </div>` : ''}
  ${m === 'USD' ? `<div class="card">
    <b>💵 Crédito en dólares · riesgo cambiario</b>
    <div class="small muted" style="margin:4px 0 8px">Cuota en bolivianos con el dólar oficial de hoy (Bs ${nf2.format(tc())}) y si el dólar sube:</div>
    <table class="tbl num"><thead><tr><th>Dólar</th><th>TC</th><th>Cuota en Bs</th></tr></thead><tbody>
    ${[0, 10, 20, 30].map(s => `<tr><td>${s ? '+' + s + '%' : 'Hoy'}</td><td>${nf2.format(tc() * (1 + s / 100))}</td><td><b>${nf2.format(primera.total * tc() * (1 + s / 100))}</b></td></tr>`).join('')}
    </tbody></table>
    <div class="small muted" style="margin-top:6px">Si el cliente gana en bolivianos, evalúa el crédito en moneda nacional.</div>
  </div>` : ''}

  <div class="btn-row no-print" style="margin:10px 0">
    <button class="btn sm" data-act="simCompartir">${ICONS.wa} Compartir</button>
    <button class="btn sm" data-act="simTramite">${ICONS.folder} Crear trámite</button>
    <button class="btn sm" onclick="window.print()">🖨️ PDF</button>
  </div>

  <div class="section-title">Cuota según el plazo</div>
  <div class="card tight"><div class="table-wrap">
    <table class="tbl num"><thead><tr><th>Plazo</th><th>Cuota total</th><th>Intereses</th></tr></thead><tbody>
    ${tablaPlazos.map(t => `<tr data-act="simPlazo" data-id="${t.n}" style="cursor:pointer;${t.n === num(C.plazo) ? 'background:var(--green-50);font-weight:700' : ''}"><td>${t.n} m (${t.n / 12} a)</td><td>${nf2.format(t.cuota)}</td><td>${nf0.format(t.interes)}</td></tr>`).join('')}
    </tbody></table></div></div>

  <details class="card tight plan" ${C.verPlan ? 'open' : ''} id="planDet">
    <summary style="padding:14px;cursor:pointer;font-weight:700">📅 Plan de pagos (${plan.n} cuotas)</summary>
    <div class="table-wrap" style="max-height:420px">
      <table class="tbl num"><thead><tr><th>N°</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Seguros</th><th>Saldo</th></tr></thead><tbody>
      ${r.map(x => `<tr><td>${x.k}</td><td>${fmtShort(x.fecha)} ${x.fecha.slice(2, 4)}</td><td><b>${nf2.format(x.total)}</b></td><td>${nf2.format(x.capital)}</td><td>${nf2.format(x.interes)}</td><td>${nf2.format(x.desg + x.seguro)}</td><td>${nf2.format(x.saldo)}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </details>
  <p class="small muted">*TEAC: tasa efectiva anual al cliente; incluye seguros y gastos iniciales. Montos en ${m === 'USD' ? 'dólares' : 'bolivianos'}.</p>`;
  $('#planDet')?.addEventListener('toggle', e => { C.verPlan = e.target.open; guardarCalc(); });
  simCalc.ultimo = { C: { ...C }, monto, primera, plan, teac, P, id: C.esVIS && vis?.califica ? 'vivienda_social' : id };
}

/* ================= CAPACIDAD DE PAGO ================= */
function capForm() {
  const C = calcState().cap;
  const esAsal = C.tipoIngreso.startsWith('asalariado');
  return `
  <form id="capForm" class="card calc-form no-print" onsubmit="return false">
    ${field({ label: 'Tipo de ingreso', name: 'tipoIngreso', type: 'select', value: C.tipoIngreso, options: [
      { v: 'asalariado_bruto', l: 'Asalariado · sueldo bruto (total ganado)' },
      { v: 'asalariado_liquido', l: 'Asalariado · líquido pagable de la boleta' },
      { v: 'independiente', l: 'Independiente / profesional · ingreso neto' },
      { v: 'jubilado', l: 'Jubilado / rentista · renta mensual' }] })}
    <div class="fields-2">
      ${field({ label: C.tipoIngreso === 'asalariado_bruto' ? 'Sueldo bruto (Bs)' : 'Ingreso mensual (Bs)', name: 'ingreso', type: 'money', value: C.ingreso })}
      ${field({ label: 'Otros ingresos (Bs)', name: 'otros', type: 'money', value: C.otros, hint: 'Alquileres, bonos fijos…' })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Ingreso del cónyuge (Bs)', name: 'conyuge', type: 'money', value: C.conyuge, hint: 'Solo si es codeudor' })}
      ${field({ label: esAsal ? 'Otros descuentos (Bs)' : 'Gastos familiares (Bs)', name: 'gastos', type: 'money', value: C.gastos })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Cuotas actuales (Bs)', name: 'cuotas', type: 'money', value: C.cuotas, hint: 'Todas sus deudas en el sistema' })}
      ${field({ label: 'Límite de tarjetas (Bs)', name: 'limiteTC', type: 'money', value: C.limiteTC, hint: `Se computa ${prod('tarjeta').cuotaSistema}% como cuota` })}
    </div>
    ${field({ label: 'Producto a evaluar', name: 'producto', type: 'select', value: C.producto, options: SIM_PRODUCTOS.concat('vivienda_social').map(p => ({ v: p, l: `${tipoInfo(p).icon} ${tipoInfo(p).label}` })) })}
  </form>
  <div id="capOut"></div>`;
}
function capCalc() {
  const out = $('#capOut');
  if (!out) return;
  const C = calcState().cap;
  const ingreso = num(C.ingreso);
  const desc = C.tipoIngreso === 'asalariado_bruto' ? liquidoAsalariado(ingreso) : { liquido: ingreso, laboral: 0, ans: 0 };
  const neto = desc.liquido + num(C.otros) + num(C.conyuge) - num(C.gastos);
  const cuotaTC = num(C.limiteTC) * prod('tarjeta').cuotaSistema / 100;
  const deudas = num(C.cuotas) + cuotaTC;
  const P = prod(C.producto);
  const cuotaMax = Math.max(0, neto * P.rci / 100 - deudas);
  const rciActual = neto > 0 ? deudas / neto : 0;
  const semaforo = rciActual * 100 >= P.rci ? ['red', '🔴 Sin capacidad adicional'] : rciActual * 100 >= P.rci * 0.75 ? ['gold', '🟡 Capacidad ajustada'] : ['', '🟢 Con capacidad'];
  const maxPor = p => {
    const Q = prod(p);
    const cm = Math.max(0, neto * Q.rci / 100 - deudas);
    const n = Q.plazoMax || 36;
    const i = tasaMensual(Q.tasa) + num(Q.desgravamen) / 100; // incluye desgravamen aprox.
    return { p, cm, n, monto: montoPorCuota(cm, i, n), tasa: Q.tasa };
  };
  const sim = simCalc.ultimo;
  const cuotaSimBs = sim ? (sim.C.moneda === 'USD' ? sim.primera.total * tc() : sim.primera.total) : 0;
  const rciConSim = neto > 0 && sim ? (deudas + cuotaSimBs) / neto : 0;
  out.innerHTML = `
  <div class="hero">
    <div class="label">Cuota máxima disponible · ${esc(tipoInfo(C.producto).label)} (RCI ${P.rci}%)</div>
    <div class="big num">Bs ${nf2.format(cuotaMax)}</div>
    <div class="meta">
      <div><b class="num">Bs ${nf0.format(neto)}</b>ingreso neto</div>
      <div><b class="num">Bs ${nf0.format(deudas)}</b>cuotas actuales</div>
      <div><b class="num">${pct(rciActual)}</b>RCI actual</div>
    </div>
  </div>
  <div class="card" style="margin-top:10px">
    <div class="row between"><b>${semaforo[1]}</b><span class="badge ${semaforo[0]}">RCI ${pct(rciActual)} / ${P.rci}%</span></div>
    ${C.tipoIngreso === 'asalariado_bruto' ? `<div class="small muted" style="margin-top:6px">
      Líquido estimado: Bs ${nf2.format(desc.liquido)} = bruto ${nf2.format(ingreso)} − aportes Gestora ${APORTES.laboral}% (${nf2.format(desc.laboral)})${desc.ans ? ` − Aporte Nacional Solidario (${nf2.format(desc.ans)})` : ''}. No incluye RC-IVA.</div>` : ''}
    ${cuotaTC ? `<div class="small muted">Tarjetas: se computa Bs ${nf2.format(cuotaTC)} como cuota (${prod('tarjeta').cuotaSistema}% del límite).</div>` : ''}
  </div>
  ${sim ? `<div class="card">
    <b>Con la simulación actual</b> <span class="small muted">(${esc(tipoInfo(sim.id).label)} · cuota ${fmt(sim.primera.total, sim.C.moneda)})</span>
    <div class="row between" style="margin-top:6px"><span class="small">RCI resultante</span>
    <span class="badge ${rciConSim * 100 > P.rci ? 'red' : ''}">${pct(rciConSim)} ${rciConSim * 100 > P.rci ? '· supera el límite' : '· dentro del límite'}</span></div>
  </div>` : ''}
  <div class="section-title">Monto máximo por producto</div>
  <div class="card tight">
    ${SIM_PRODUCTOS.concat('vivienda_social').map(maxPor).map(x => `
    <div class="list-item" data-act="capSimular" data-id="${x.p}" data-monto="${Math.floor(x.monto)}" data-n="${x.n}">
      <div class="icon-dot">${tipoInfo(x.p).icon}</div>
      <div class="grow"><div class="title">${esc(tipoInfo(x.p).label)}</div>
      <div class="sub">${x.n} meses · tasa ref. ${nf2.format(x.tasa)}% · cuota Bs ${nf0.format(x.cm)}</div></div>
      <div class="amount num">Bs ${compact(x.monto)}<small>$us ${compact(x.monto / tc())}</small></div>
    </div>`).join('')}
  </div>
  <p class="small muted">Toca un producto para simularlo con ese monto. Plazos y tasas según Parámetros de productos.</p>`;
}

/* ================= TARJETA DE CRÉDITO ================= */
function tjForm() {
  const C = calcState().tj;
  return `
  <form id="tjForm" class="card calc-form no-print" onsubmit="return false">
    <div class="fields-2">
      ${field({ label: 'Límite de la tarjeta (Bs)', name: 'limite', type: 'money', value: C.limite })}
      ${field({ label: 'Deuda actual (Bs)', name: 'saldo', type: 'money', value: C.saldo })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Tasa anual %', name: 'tasa', type: 'money', value: C.tasa })}
      ${field({ label: 'Pago mínimo % del capital', name: 'minPct', type: 'money', value: C.minPct, hint: '+ intereses del mes' })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Pago mínimo desde (Bs)', name: 'minBs', type: 'money', value: C.minBs })}
      ${field({ label: 'Pago fijo mensual (Bs)', name: 'pagoFijo', type: 'money', value: C.pagoFijo })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Liquidar en (meses)', name: 'meses', type: 'number', value: C.meses, attrs: 'inputmode="numeric" min="1"' })}
      <div></div>
    </div>
    <div class="section-title" style="margin-top:4px">Compra en cuotas</div>
    <div class="fields-2">
      ${field({ label: 'Monto de la compra (Bs)', name: 'compra', type: 'money', value: C.compra })}
      ${field({ label: 'Número de cuotas', name: 'cuotas', type: 'number', value: C.cuotas, attrs: 'inputmode="numeric" min="1"' })}
    </div>
  </form>
  <div id="tjOut"></div>`;
}
function simularPagos(saldo, anual, pagoFn) {
  const i = tasaMensual(anual);
  let meses = 0, intereses = 0, s = saldo;
  while (s > 0.01 && meses < 600) {
    const int = s * i;
    const pago = Math.min(s + int, pagoFn(s, int));
    if (pago <= int) return { meses: Infinity, intereses: Infinity };
    s = s + int - pago; intereses += int; meses++;
  }
  return { meses, intereses };
}
function tjCalc() {
  const out = $('#tjOut');
  if (!out) return;
  const C = calcState().tj;
  const saldo = num(C.saldo), tasa = num(C.tasa);
  const minimo = simularPagos(saldo, tasa, (s, int) => Math.max(num(C.minBs), s * num(C.minPct) / 100 + int));
  const fijo = num(C.pagoFijo) ? simularPagos(saldo, tasa, () => num(C.pagoFijo)) : null;
  const cuotaLiq = cuotaFija(saldo, tasa, parseInt(C.meses, 10) || 1);
  const pMin = Math.max(num(C.minBs), saldo * num(C.minPct) / 100 + saldo * tasaMensual(tasa));
  const cuotaCompra = cuotaFija(num(C.compra), tasa, parseInt(C.cuotas, 10) || 1);
  const usoPct = num(C.limite) ? saldo / num(C.limite) : 0;
  const tiempo = r => r.meses === Infinity ? 'nunca (el pago no cubre los intereses)' : `${r.meses} meses (${(r.meses / 12).toFixed(1).replace('.', ',')} años)`;
  out.innerHTML = `
  <div class="hero">
    <div class="label">Pago mínimo de este mes</div>
    <div class="big num">Bs ${nf2.format(pMin)}</div>
    <div class="meta">
      <div><b class="num">Bs ${nf0.format(Math.max(0, num(C.limite) - saldo))}</b>cupo disponible</div>
      <div><b class="num">${pct(usoPct, 0)}</b>uso del límite</div>
      <div><b class="num">${pct(teaDe(tasa), 2)}</b>TEA</div>
    </div>
  </div>
  <div class="section-title">¿Cuánto tarda en pagar Bs ${nf0.format(saldo)}?</div>
  <div class="card tight">
    <div class="list-item"><div class="icon-dot">🐢</div><div class="grow"><div class="title">Pagando solo el mínimo</div>
      <div class="sub">${tiempo(minimo)}</div></div><div class="amount num" style="color:var(--red)">${minimo.intereses === Infinity ? '∞' : 'Bs ' + nf0.format(minimo.intereses)}<small>intereses</small></div></div>
    ${fijo ? `<div class="list-item"><div class="icon-dot">🚶</div><div class="grow"><div class="title">Pagando Bs ${nf0.format(num(C.pagoFijo))} fijos</div>
      <div class="sub">${tiempo(fijo)}</div></div><div class="amount num">${fijo.intereses === Infinity ? '∞' : 'Bs ' + nf0.format(fijo.intereses)}<small>intereses</small></div></div>` : ''}
    <div class="list-item"><div class="icon-dot">🚀</div><div class="grow"><div class="title">Liquidar en ${esc(C.meses)} meses</div>
      <div class="sub">Pago mensual necesario</div></div><div class="amount num" style="color:var(--green-600)">Bs ${nf2.format(cuotaLiq)}<small>intereses Bs ${nf0.format(cuotaLiq * (parseInt(C.meses, 10) || 1) - saldo)}</small></div></div>
  </div>
  ${minimo.intereses !== Infinity && minimo.intereses > saldo * 0.3 ? `<div class="card small">💡 Pagando solo el mínimo, el cliente paga <b>Bs ${nf0.format(minimo.intereses)}</b> en intereses. Con una línea o un crédito de consumo a menor tasa podría ahorrar.</div>` : ''}
  <div class="section-title">Compra en ${esc(C.cuotas)} cuotas</div>
  <div class="card"><div class="row between"><span>Cuota mensual</span><b class="num">Bs ${nf2.format(cuotaCompra)}</b></div>
    <div class="row between small muted"><span>Total pagado</span><span class="num">Bs ${nf2.format(cuotaCompra * (parseInt(C.cuotas, 10) || 1))} (intereses Bs ${nf2.format(cuotaCompra * (parseInt(C.cuotas, 10) || 1) - num(C.compra))})</span></div></div>`;
}

/* ================= PREPAGO ================= */
function preForm() {
  const C = calcState().pre;
  const creditos = [];
  S().clients.forEach(c => (c.credits || []).filter(cr => cr.estado !== 'cancelado' && cr.tasa && cr.plazo && cr.tipo !== 'tarjeta')
    .forEach(cr => creditos.push({ v: `${c.id}|${cr.id}`, l: `${c.nombre} · ${tipoInfo(cr.tipo).label} · ${monLabel(cr.moneda)} ${nf0.format(num(cr.saldo) || num(cr.monto))}` })));
  return `
  <form id="preForm" class="card calc-form no-print" onsubmit="return false">
    ${creditos.length ? field({ label: 'Tomar datos de un crédito de tu cartera (opcional)', name: 'origen', type: 'select', value: C.origen || '', options: [{ v: '', l: '— Ingresar manualmente —' }, ...creditos] }) : ''}
    <div class="fields-2">
      ${field({ label: 'Saldo actual', name: 'saldo', type: 'money', value: C.saldo })}
      ${field({ label: 'Moneda', name: 'moneda', type: 'select', value: C.moneda, options: CATALOG.monedas.map(m => ({ v: m.id, l: m.nombre })) })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Tasa anual %', name: 'tasa', type: 'money', value: C.tasa })}
      ${field({ label: 'Meses restantes', name: 'plazo', type: 'number', value: C.plazo, attrs: 'inputmode="numeric" min="1"' })}
    </div>
    <div class="fields-2">
      ${field({ label: 'Monto del prepago', name: 'prepago', type: 'money', value: C.prepago })}
      ${field({ label: 'Aplicar para', name: 'modo', type: 'select', value: C.modo, options: [{ v: 'plazo', l: 'Reducir el plazo' }, { v: 'cuota', l: 'Reducir la cuota' }] })}
    </div>
  </form>
  <div id="preOut"></div>`;
}
function preCalc() {
  const out = $('#preOut');
  if (!out) return;
  const C = calcState().pre;
  const m = C.moneda;
  const S0 = num(C.saldo), n = parseInt(C.plazo, 10) || 0, i = tasaMensual(C.tasa), pre = Math.min(num(C.prepago), S0);
  if (!S0 || !n) { out.innerHTML = ''; return; }
  const cuota = cuotaFija(S0, C.tasa, n);
  const intAntes = cuota * n - S0;
  const S1 = S0 - pre;
  let nuevaCuota = cuota, nuevoN = n;
  if (C.modo === 'cuota') nuevaCuota = cuotaFija(S1, C.tasa, n);
  else nuevoN = S1 <= 0 ? 0 : i ? Math.ceil(-Math.log(1 - S1 * i / cuota) / Math.log(1 + i)) : Math.ceil(S1 / cuota);
  const intDespues = S1 <= 0 ? 0 : C.modo === 'cuota' ? nuevaCuota * n - S1 : (() => { let s = S1, t = 0; for (let k = 0; k < nuevoN; k++) { const int = s * i; t += int; s = s + int - Math.min(cuota, s + int); } return t; })();
  out.innerHTML = `
  <div class="hero">
    <div class="label">Ahorro en intereses</div>
    <div class="big num">${fmt(Math.max(0, intAntes - intDespues), m)}</div>
    <div class="meta">
      <div><b class="num">${fmt(cuota, m)}</b>cuota actual</div>
      <div><b class="num">${fmt(nuevaCuota, m)}</b>nueva cuota</div>
      <div><b class="num">${n} → ${nuevoN}</b>meses</div>
    </div>
  </div>
  <div class="card small" style="margin-top:10px">
    ${C.modo === 'plazo' ? `Mantiene la cuota de ${fmt(cuota, m)} y termina de pagar <b>${n - nuevoN} meses antes</b>.` : `Mantiene el plazo y la cuota baja <b>${fmt(cuota - nuevaCuota, m)}</b> por mes.`}
    Intereses restantes: ${fmt(intAntes, m)} → ${fmt(intDespues, m)}. Revisa si el contrato tiene comisión por prepago.
  </div>`;
}

/* ================= CONVERSOR ================= */
function convForm() {
  const C = calcState().conv;
  const { vigente } = tcEstado();
  return `
  <form id="convForm" class="card calc-form no-print" onsubmit="return false">
    <div class="fields-2">
      ${field({ label: 'Bolivianos', name: 'bs', type: 'money', value: C.bs })}
      ${field({ label: 'Dólares', name: 'usd', type: 'money', value: C.usd })}
    </div>
    ${field({ label: 'UFV', name: 'ufv', type: 'money', value: C.ufv })}
  </form>
  <div id="convOut"></div>
  <div class="section-title">Límites de vivienda de interés social</div>
  <div class="card tight"><div class="table-wrap"><table class="tbl num">
    <thead><tr><th>Concepto</th><th>UFV</th><th>Bs</th><th>$us</th></tr></thead><tbody>
    ${[['Tasa 5,5% hasta', 255000], ['Tasa 6% hasta', 380000], ['Departamento (máx.)', VIS.limiteDepto], ['Tasa 6,5% / casa (máx.)', VIS.limiteCasa]].map(([l, u]) =>
      `<tr><td>${l}</td><td>${nf0.format(u)}</td><td>${nf0.format(u * valorUFV())}</td><td>${nf0.format(u * valorUFV() / tc())}</td></tr>`).join('')}
    </tbody></table></div></div>
  <p class="small muted">Dólar: ${esc(tcDescripcion())} Bs ${nf2.format(tc())}${vigente ? ` (compra ${nf2.format(vigente.tco)} · venta ${nf2.format(vigente.venta)})` : ''}. UFV: Bs ${nf2.format(valorUFV())} (${esc(fechaUFV())}).</p>`;
}
function convCalc(origen) {
  const C = calcState().conv;
  const f = $('#convForm');
  if (!f) return;
  const t = tc(), u = valorUFV();
  if (origen === 'bs') { C.usd = +(num(C.bs) / t).toFixed(2); C.ufv = +(num(C.bs) / u).toFixed(2); }
  if (origen === 'usd') { C.bs = +(num(C.usd) * t).toFixed(2); C.ufv = +(C.bs / u).toFixed(2); }
  if (origen === 'ufv') { C.bs = +(num(C.ufv) * u).toFixed(2); C.usd = +(C.bs / t).toFixed(2); }
  ['bs', 'usd', 'ufv'].filter(k => k !== origen && origen).forEach(k => { f[k].value = String(C[k]).replace('.', ','); });
  $('#convOut').innerHTML = `<div class="card small">
    Bs ${nf2.format(num(C.bs))} = $us ${nf2.format(num(C.bs) / t)} = UFV ${nf2.format(num(C.bs) / u)}</div>`;
}

/* ---------------- Enlace con la app ---------------- */
ROUTES.calculadora.render = viewCalculadora;
ROUTES.calculadora.after = () => {
  const C = calcState();
  const form = $('.calc-form');
  if (!form) return;
  const tabObj = { simulador: C.sim, capacidad: C.cap, tarjeta: C.tj, prepago: C.pre, conversor: C.conv }[C.tab];
  const rerender = ['tasaTipo', 'esVIS', 'origen', 'tipoIngreso'];
  const onChange = e => {
    if (C.tab === 'prepago' && e.target.name === 'origen' && e.target.value) {
      const [cid, crid] = e.target.value.split('|');
      const cr = Store.client(cid)?.credits.find(x => x.id === crid);
      if (cr) {
        const trans = cr.fechaDesembolso ? Math.max(0, Math.round((Date.now() - parseDate(cr.fechaDesembolso)) / (30.44 * 86400000))) : 0;
        Object.assign(C.pre, { origen: e.target.value, saldo: num(cr.saldo) || num(cr.monto), tasa: num(cr.tasa), plazo: Math.max(1, parseInt(cr.plazo, 10) - trans), moneda: cr.moneda || 'BOB' });
      }
      guardarCalc(); render(); return;
    }
    leerForm(form, tabObj);
    if (e.target.closest('details.mas-opciones')) C.sim.abierto = true;
    if (rerender.includes(e.target.name)) {
      if (e.target.name === 'esVIS' && C.sim.esVIS) Object.assign(C.sim, { aportePct: 0, seguroBien: prod('vivienda_social').seguroBien });
      guardarCalc(); render(); return;
    }
    if (C.tab === 'conversor') { convCalc(e.target.name); guardarCalc(); return; }
    actualizarCalc();
  };
  // Texto y números al escribir; listas, casillas y fechas al confirmar el cambio
  const esCambio = t => t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'date';
  form.addEventListener('input', e => { if (!esCambio(e.target)) onChange(e); });
  form.addEventListener('change', e => { if (esCambio(e.target)) onChange(e); });
  $('details.mas-opciones', form)?.addEventListener('toggle', e => { C.sim.abierto = e.target.open; guardarCalc(); });
  if (C.tab === 'conversor') convCalc(); else actualizarCalc();
};

Object.assign(ACTIONS, {
  calcTab: el => { calcState().tab = el.dataset.id; guardarCalc(); render(); },
  simProducto: el => { const C = calcState(); C.sim = { ...simDefaults(el.dataset.id), moneda: C.sim.moneda, fecha: C.sim.fecha }; guardarCalc(); render(); },
  simPlazo: el => { const C = calcState(); C.sim.plazo = +el.dataset.id; const f = $('#simForm [name=plazo]'); if (f) f.value = C.sim.plazo; actualizarCalc(); },
  simCompartir: () => {
    const u = simCalc.ultimo; if (!u) return;
    const m = u.C.moneda;
    const text = `*Simulación de crédito ${tipoInfo(u.id).label}* (referencial)
Monto: ${fmt(u.monto, m)}
Plazo: ${u.plan.n} meses
Tasa: ${nf2.format(num(u.C.tasa))}% anual (TEA ${pct(teaDe(u.C.tasa), 2)})
Cuota mensual: *${fmt(u.primera.total, m)}* (incluye seguros)
Total intereses: ${fmt(u.plan.totales.interes, m)}
${m === 'USD' ? `Equivalente: Bs ${nf2.format(u.primera.total * tc())} al TC ${nf2.format(tc())}\n` : ''}Sujeto a evaluación y aprobación.
${S().settings.ejecutivo || ''} - Banco Mercantil Santa Cruz`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  },
  simTramite: () => {
    const u = simCalc.ultimo; if (!u) return;
    caseForm({}, { tipo: u.id, monto: Math.round(u.monto * 100) / 100, moneda: u.C.moneda, tasa: num(u.C.tasa), plazo: u.plan.n });
  },
  simCapacidad: () => { const C = calcState(); C.tab = 'capacidad'; C.cap.producto = simCalc.ultimo?.id || C.sim.producto; guardarCalc(); render(); },
  capSimular: el => {
    const C = calcState(); const id = el.dataset.id === 'vivienda_social' ? 'vivienda' : el.dataset.id;
    const monto = +el.dataset.monto;
    C.sim = { ...simDefaults(id), plazo: +el.dataset.n };
    if (id === 'vivienda' || id === 'vehicular') C.sim.valorBien = Math.round(monto / (1 - C.sim.aportePct / 100));
    else C.sim.monto = monto;
    if (id === 'linea') C.sim.montoLinea = monto;
    if (el.dataset.id === 'vivienda_social') Object.assign(C.sim, { esVIS: true, aportePct: 0, valorBien: monto, plazo: +el.dataset.n });
    C.tab = 'simulador'; guardarCalc(); render();
  }
});

/* ================= PARÁMETROS DE PRODUCTOS ================= */
const PARAM_CAMPOS = [
  ['tasa', 'Tasa referencial % anual'], ['plazoMax', 'Plazo máximo (meses)'], ['financiamiento', 'Financiamiento máx. %'],
  ['rci', 'Relación cuota/ingreso máx. %'], ['desgravamen', 'Desgravamen % mensual'], ['seguroBien', 'Seguro del bien % anual']
];
ROUTES.parametros.render = () => {
  const st = S().settings;
  return `
  <p class="small muted" style="margin:0 2px 10px">Valores que usa la calculadora. Son referenciales: reemplázalos con la normativa interna del banco.</p>
  <form id="paramForm">
    ${['consumo', 'tarjeta', 'vivienda', 'vivienda_social', 'vehicular', 'linea'].map(id => {
      const P = prod(id);
      const campos = id === 'tarjeta' ? [['tasa', 'Tasa % anual'], ['pagoMinimo', 'Pago mínimo % del capital'], ['cuotaSistema', '% del límite como cuota'], ['rci', 'Relación cuota/ingreso máx. %']]
        : PARAM_CAMPOS.filter(([k]) => !(k === 'seguroBien' && ['consumo', 'linea'].includes(id)));
      return `<details class="guide"><summary><span class="icon-dot">${tipoInfo(id).icon}</span>${esc(tipoInfo(id).label)}
        <span class="small muted" style="font-weight:500;margin-left:auto">${nf2.format(P.tasa)}% · RCI ${P.rci}%</span><span class="chev">${ICONS.chev}</span></summary>
        <div class="body"><div class="fields-2">${campos.map(([k, l]) => field({ label: l, name: `${id}.${k}`, type: 'money', value: P[k] })).join('')}</div></div></details>`;
    }).join('')}
    <div class="section-title">TRe y UFV</div>
    <div class="card">
      ${field({ label: 'TRe MN manual % (vacío = automática)', name: 'treManual', type: 'money', value: st.treManual || '', hint: `Automática: ${nf2.format(st.tre?.mn || 3.65)}% (BCB)` })}
      ${field({ label: 'Valor UFV manual (vacío = automático del BCB)', name: 'ufvManual', type: 'money', value: st.ufvManual || '', hint: `Automático: Bs ${nf2.format(st.ufv?.valor || UFV_RESPALDO.valor)} al ${esc(st.ufv?.fecha || UFV_RESPALDO.fecha)}` })}
    </div>
    <button class="btn primary block" type="submit">Guardar parámetros</button>
    <button class="btn ghost block" type="button" id="paramReset" style="margin-top:6px">Restablecer valores referenciales</button>
  </form>
  ${normasCard()}`;
};

/* Normas internas (uso interno del banco): se guardan en Firebase, no en el código público.
   Solo el administrador puede cargarlas; los demás usuarios las leen al iniciar sesión. */
function normasCard() {
  const n = S().settings.normas?.endeudamiento;
  const estado = window.Nube?.normasEstado;
  return `
  <div class="section-title">Normas internas (protegidas)</div>
  <div class="card">
    <div class="small">${n
      ? `✅ Norma de endeudamiento cargada${n.version ? ' · versión ' + esc(n.version) : ''}${n.vigencia ? ' · vigente desde ' + esc(fmtDate(n.vigencia)) : ''}`
      : '⚠️ La norma de endeudamiento no está cargada en este dispositivo.'}</div>
    ${estado === 'sin-permiso' ? '<div class="small" style="color:var(--red);margin-top:4px">Firebase no permite leer las normas: falta publicar la regla de «config».</div>' : ''}
    <div class="small muted" style="margin-top:6px">Se guardan en la nube (no en el código de la app) y solo se ven después de iniciar sesión. Al cerrar sesión se borran del dispositivo.</div>
    <details style="margin-top:8px"><summary class="link" style="cursor:pointer">Cargar o actualizar (solo administrador)</summary>
      <div class="field" style="margin-top:8px"><label for="normasTxt">Código de parámetros</label>
        <textarea id="normasTxt" rows="5" placeholder='{"endeudamiento": { … }}' autocomplete="off" spellcheck="false"></textarea></div>
      <button type="button" class="btn primary block" id="normasGuardar">Guardar en la nube</button>
    </details>
  </div>`;
}
function validarNormas(txt) {
  let d;
  try { d = JSON.parse(txt); } catch { throw new Error('El código no es válido: revisa que esté completo'); }
  const e = d && d.endeudamiento;
  const tramoOk = t => t && (t.hasta === null || isFinite(t.hasta)) && isFinite(t.pct);
  const ok = e && isFinite(e.consumo) && e.tablas && ['vivienda', 'socialMayor', 'socialMenor']
    .every(k => Array.isArray(e.tablas[k]) && e.tablas[k].length && e.tablas[k].every(tramoOk));
  if (!ok) throw new Error('Al código le faltan datos de la norma de endeudamiento');
  return d;
}
ROUTES.parametros.after = () => {
  $('#paramForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    const productos = {};
    Object.entries(d).forEach(([k, v]) => {
      if (!k.includes('.')) return;
      const [id, campo] = k.split('.');
      (productos[id] = productos[id] || {})[campo] = num(v);
    });
    S().settings.productos = productos;
    S().settings.ufvManual = num(d.ufvManual) || '';
    S().settings.treManual = num(d.treManual) || '';
    Store.save(); toast('Parámetros guardados');
  });
  $('#normasGuardar')?.addEventListener('click', async () => {
    const btn = $('#normasGuardar');
    let d;
    try { d = validarNormas($('#normasTxt').value.trim()); } catch (e) { toast(e.message); return; }
    d.actualizado = new Date().toISOString();
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await window.Nube.guardarNormas(d);
      S().settings.normas = d; Store.save();
      toast('Normas guardadas en la nube'); render();
    } catch (e) {
      toast(e.code === 'permission-denied' ? 'Sin permiso: publica la regla nueva en Firebase y usa el usuario administrador' : e.message);
      btn.disabled = false; btn.textContent = 'Guardar en la nube';
    }
  });
  $('#paramReset').addEventListener('click', () => {
    if (!confirm('¿Volver a los valores referenciales?')) return;
    S().settings.productos = {}; S().settings.ufvManual = ''; S().settings.treManual = ''; Store.save(); render(); toast('Parámetros restablecidos');
  });
};

// Si la app se abrió directamente en la calculadora, dibujarla ahora que está cargada
if (['calculadora', 'parametros'].includes(current.name)) render();
