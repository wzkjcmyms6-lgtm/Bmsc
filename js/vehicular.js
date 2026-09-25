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
  msc: { gasolina: 3.8, hibrido: 4.4 },        // % del valor del vehículo, se suma al monto a financiar
  plazos: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  // Servicio de deudas: % máximo del sueldo bruto (sumado titular + codeudor)
  codigos: [
    { v: 'TC', l: 'TC · Tarjeta de crédito', g: 'consumo' },
    { v: 'N', l: 'N · Otros créditos', g: 'consumo' },
    { v: 'H0', l: 'H0 · Vivienda', g: 'vivienda' }, { v: 'H1', l: 'H1 · Vivienda', g: 'vivienda' }, { v: 'H2', l: 'H2 · Vivienda', g: 'vivienda' },
    { v: 'H3', l: 'H3 · Vivienda social', g: 'social' }, { v: 'H4', l: 'H4 · Vivienda social', g: 'social' }
  ],
  limite: { consumo: 25, vivienda: 40, social: 37 },
  // Tarjetas de crédito: cuota a considerar = % del límite según tramo
  tarjetas: [['visa', 'Visa Internacional'], ['master', 'Mastercard Clásica']],
  tramosTC: [
    { desde: 2100, hasta: 2330, pct: 10 }, { desde: 2340, hasta: 2870, pct: 9 }, { desde: 2880, hasta: 3720, pct: 8 },
    { desde: 3730, hasta: 5290, pct: 7 }, { desde: 5300, hasta: 9150, pct: 6 }, { desde: 9160, hasta: 33900, pct: 5 },
    { desde: 40000, hasta: Infinity, pct: 4 }
  ],
  impuestoExterior: 13,                        // % que se descuenta a ingresos del exterior (referencial)  // vivienda y social incluyen el 25% de consumo
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
    desgT: '', desgC: '', dimaT: '', dimaC: '',
    tasaFija: 9, margenVar: 3, plazo: 60, periodoFijo: 24,
    estado: 'nuevo', motor: 'gasolina', valorUsd: 15000, tcVeh: '', msc: 'no',
    tipoT: 'sueldo', montoT: '', otrosT: '', tipoC: 'sueldo', montoC: '', otrosC: '', vivienda: 'no', aguinaldo: 'no', primas: 'no', primasT: '', primasC: '', ingC: 'no', deudas: [], compra: ''
  };
  const V = C.veh;
  if (V.motor !== 'hibrido') V.motor = 'gasolina';
  if (V.estado !== 'usado') V.estado = 'nuevo';
  if (V.valorUsd === undefined) V.valorUsd = 15000;
  if (!Array.isArray(V.deudas)) V.deudas = [];
  if (V.brutoT !== undefined) { V.montoT = V.montoT || V.brutoT; V.montoC = V.montoC || V.brutoC; delete V.brutoT; delete V.brutoC; }
  if (V.primasMonto !== undefined) { V.primasT = V.primasT || V.primasMonto; delete V.primasMonto; }
  V.tipoT = V.tipoT || 'sueldo'; V.tipoC = V.tipoC || 'sueldo';
  return V;
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

// Extensión del carnet de identidad (departamento de emisión)
const CI_EXT = [{ v: '', l: '—' }, ...CATALOG.extensiones];
const TIPOS_INGRESO = [['sueldo', 'Sueldo'], ['jubilacion', 'Jubilación'], ['exterior', 'Del exterior']];
const ETIQ_MONTO = { sueldo: 'Sueldo bruto (Bs)', jubilacion: 'Renta líquida (Bs)', exterior: 'Ingreso mensual (Bs)' };
function ingresoPersona(V, p, titulo, extra = '') {
  const tipo = V['tipo' + p];
  return `
    <div class="veh-persona">
      <div class="veh-persona-head"><b>${titulo}</b>${extra}</div>
      <div style="margin-bottom:10px">${opciones('tipo' + p, tipo, TIPOS_INGRESO)}</div>
      <div class="fields-2">
        ${field({ label: ETIQ_MONTO[tipo], name: 'monto' + p, type: 'money', value: V['monto' + p] })}
        ${field({ label: 'Descuentos / impuestos (opcional)', name: 'otros' + p, type: 'money', value: V['otros' + p], placeholder: '0,00' })}
      </div>
      <div class="small muted ing-detalle" id="ingDet${p}"></div>
    </div>`;
}
/* Ingreso de una persona según su tipo (el ingreso computable es siempre el líquido):
   sueldo → sueldo bruto menos los descuentos de ley;
   jubilación → el monto ingresado ya es líquido; exterior → se descuentan impuestos. */
function calcIngreso(tipo, monto, otros) {
  if (tipo === 'jubilacion') return { liquido: Math.max(0, monto - otros), computable: Math.max(0, monto - otros), detalle: monto ? `Líquido: Bs ${nf2.format(Math.max(0, monto - otros))}` : '' };
  if (tipo === 'exterior') {
    const imp = monto * VEH.impuestoExterior / 100;
    const neto = Math.max(0, monto - imp - otros);
    return { liquido: neto, computable: neto, detalle: monto ? `Impuestos ${nf2.format(VEH.impuestoExterior)}%: − Bs ${nf2.format(imp)}${otros ? ` · otros − Bs ${nf2.format(otros)}` : ''} · Neto: Bs ${nf2.format(neto)}` : '' };
  }
  const l = liquidoAsalariado(monto);
  const liquido = Math.max(0, l.liquido - otros);
  return { liquido, computable: liquido, detalle: monto ? `Descuentos de ley: − Bs ${nf2.format(l.laboral + l.ans)} (Gestora ${nf2.format(APORTES.laboral)}%${l.ans ? ' + Aporte Solidario' : ''})${otros ? ` · otros − Bs ${nf2.format(otros)}` : ''} · Líquido: Bs ${nf2.format(liquido)}` : '' };
}
function ingresosTotales(V) {
  const t = calcIngreso(V.tipoT, num(V.montoT), num(V.otrosT));
  const c = V.codeudor === 'si' && V.ingC === 'si' ? calcIngreso(V.tipoC, num(V.montoC), num(V.otrosC)) : null;
  // Aguinaldo: solo si tiene crédito de vivienda; un sueldo al año ÷ 12 (solo ingresos por sueldo) se suma al líquido
  const agui = V.vivienda === 'si' && V.aguinaldo === 'si'
    ? (V.tipoT === 'sueldo' ? num(V.montoT) / 12 : 0) + (c && V.tipoC === 'sueldo' ? num(V.montoC) / 12 : 0) : 0;
  // Primas y bonos: también solo con crédito de vivienda (BMSC u otros bancos); monto anual ÷ 12
  // Se suman tal cual (sin descuentos), cada persona con su propio monto
  const primas = V.vivienda === 'si' && V.primas === 'si' ? (num(V.primasT) + (c ? num(V.primasC) : 0)) / 12 : 0;
  const extra = agui + primas;
  return { t, c, agui, primas, computable: t.computable + (c ? c.computable : 0) + extra, liquido: t.liquido + (c ? c.liquido : 0) + extra };
}

function vehForm() {
  const V = vehState();
  const persona = (p, titulo) => `
    <div class="veh-persona">
      <div class="veh-persona-head"><b>${titulo}</b><span class="badge gray" id="edad_${p || 't'}">Edad —</span></div>
      ${field({ label: 'Nombre (opcional)', name: p ? p + 'Nombre' : 'nombre', value: V[p ? p + 'Nombre' : 'nombre'], attrs: 'autocomplete="off"' })}
      <div class="ci-row">
        ${field({ label: 'Carnet (opcional)', name: p ? p + 'Ci' : 'ci', value: V[p ? p + 'Ci' : 'ci'], attrs: 'inputmode="numeric" autocomplete="off"' })}
        ${field({ label: 'Extensión', name: p ? p + 'Ext' : 'ext', type: 'select', value: V[p ? p + 'Ext' : 'ext'] || '', options: CI_EXT })}
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

    ${seccion(4, 'Vehículo a financiar', `
      <div class="veh-row"><span>Vehículo</span>${opciones('estado', V.estado, [['nuevo', 'Nuevo'], ['usado', 'Usado']])}</div>
      <div class="veh-row"><span>Tipo de motor</span>${opciones('motor', V.motor, [['gasolina', 'A gasolina'], ['hibrido', 'Eléctrico / híbrido']])}</div>
      <div class="fields-2">
        ${field({ label: 'Valor del vehículo ($us)', name: 'valorUsd', type: 'money', value: V.valorUsd })}
        ${field({ label: 'Tipo de cambio (Bs por $us)', name: 'tcVeh', type: 'money', value: V.tcVeh || String(tc()).replace('.', ','), hint: `Oficial BCB hoy: ${nf2.format(tc())}` })}
      </div>
      <div class="veh-valor-bs"><span class="small muted">Valor en bolivianos</span><b class="num" id="valorBs">—</b></div>
      <div class="veh-row"><div><span>¿Seguro automotor MSC?</span><div class="small muted" id="mscInfo"></div></div>${siNo('msc', V.msc)}</div>
    `)}

    ${seccion(5, 'Ingresos', `
      ${ingresoPersona(V, 'T', 'Titular')}
      ${V.codeudor === 'si' && V.ingC === 'si'
        ? ingresoPersona(V, 'C', 'Codeudor', `<button type="button" class="link-btn" data-act="vehIngC" data-v="no">Quitar</button>`)
        : `<button type="button" class="btn block veh-add" data-act="vehIngC" data-v="si">+ Añadir ingresos del codeudor (opcional)</button>`}
      <div class="veh-row"><div><span>¿Tiene crédito de vivienda?</span><div class="small muted">En el BMSC o en otros bancos</div></div>${siNo('vivienda', V.vivienda)}</div>
      ${V.vivienda === 'si' ? `<div class="veh-row"><div><span>¿Tomar el aguinaldo?</span><div class="small muted" id="aguiInfo">Un sueldo al año, mensualizado (÷ 12)</div></div>${siNo('aguinaldo', V.aguinaldo)}</div>
      <div class="veh-row"><div><span>¿Tomar primas y bonos?</span><div class="small muted" id="primasInfo">Monto anual de cada persona, sin descuentos, ÷ 12</div></div>${siNo('primas', V.primas)}</div>
      ${V.primas === 'si' ? `<div class="${V.codeudor === 'si' && V.ingC === 'si' ? 'fields-2' : ''}">
        ${field({ label: 'Titular: primas y bonos del año (Bs)', name: 'primasT', type: 'money', value: V.primasT })}
        ${V.codeudor === 'si' && V.ingC === 'si' ? field({ label: 'Codeudor: primas y bonos del año (Bs)', name: 'primasC', type: 'money', value: V.primasC }) : ''}
      </div>` : ''}` : ''}
      <div class="veh-valor-bs"><span class="small muted" id="ingEtiq">Ingreso computable (líquido)</span><b class="num" id="ingTotal">—</b></div>
    `)}

    ${seccion(6, 'Servicio de deudas mensual', `
      <div class="deudas-head small muted"><span>Código</span><span>Cuota mensual (Bs)</span><span></span></div>
      <div id="deudas">${V.deudas.map((d, i) => `
        <div class="deuda-item ${d.cod === 'TC' ? 'es-tc' : ''}">
          <div class="deuda-row">
            <select name="d_${i}_cod">${VEH.codigos.map(c => `<option value="${c.v}" ${d.cod === c.v ? 'selected' : ''}>${esc(c.l)}</option>`).join('')}</select>
            ${d.cod === 'TC'
              ? `<div class="deuda-calc num" id="tcCuota_${i}">—</div>`
              : `<input name="d_${i}_cuota" type="text" inputmode="decimal" placeholder="0,00" value="${esc(d.cuota || '')}">`}
            <button type="button" class="icon-btn deuda-del" data-act="vehDeudaDel" data-i="${i}" aria-label="Quitar">${ICONS.x}</button>
          </div>
          ${d.cod === 'TC' ? `<div class="deuda-tc">
            <select name="d_${i}_tarjeta">${VEH.tarjetas.map(([v, l]) => `<option value="${v}" ${(d.tarjeta || 'visa') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input name="d_${i}_limite" type="text" inputmode="decimal" placeholder="Límite de la tarjeta (Bs)" value="${esc(d.limite || '')}">
            <div class="small muted deuda-tc-info" id="tcInfo_${i}"></div>
          </div>` : ''}
        </div>`).join('') || '<div class="small muted" style="padding:6px 0">Sin deudas registradas.</div>'}</div>
      <button type="button" class="btn sm" data-act="vehDeudaAdd" style="margin-top:8px">${ICONS.plus} Agregar deuda</button>
      <details class="small muted" style="margin-top:10px"><summary class="link" style="cursor:pointer">Cuota a considerar en tarjetas (% del límite)</summary>
        <table class="tbl num" style="margin-top:6px"><tbody>${VEH.tramosTC.map(t => `<tr><td>Bs ${nf0.format(t.desde)} ${t.hasta === Infinity ? 'en adelante' : 'a ' + nf0.format(t.hasta)}</td><td>${t.pct}%</td></tr>`).join('')}</tbody></table>
      </details>
      <div class="small muted" style="margin-top:10px">TC y N: hasta ${VEH.limite.consumo}% del ingreso computable (líquido) · con H0–H2 el total hasta ${VEH.limite.vivienda}% · con H3–H4 hasta ${VEH.limite.social}% (incluyen el ${VEH.limite.consumo}%).</div>
      <div id="capBox"></div>
    `)}

    ${seccion(7, 'Financiamiento', `
      <div id="finMax"></div>
      <div class="fin-linea">
        <div><span>Compra de vehículo</span><div class="small muted" id="finPct">Monto que financia el banco según la campaña</div></div>
        <div class="fin-input"><span>Bs</span><input name="compra" type="text" inputmode="decimal" placeholder="0,00" value="${esc(V.compra || '')}"></div>
      </div>
      <div class="fin-linea">
        <div><span>Seguro vehicular BMSC</span><div class="small muted" id="finSegInfo">Se toma de la sección 4</div></div>
        <b class="num" id="finSeg">—</b>
      </div>
      <div class="fin-total"><span>Monto a financiar</span><b class="num" id="finTotal">—</b></div>
    `)}
  </form>
  <div id="vehOut"></div>`;
}

/* Tarjeta de crédito: % según el tramo del límite. Entre tramos se aplica el tramo siguiente. */
function tramoTC(limite) {
  if (!(limite > 0)) return null;
  const t = VEH.tramosTC.find(x => limite <= x.hasta) || VEH.tramosTC.at(-1);
  const exacto = limite >= t.desde;
  const bajoMinimo = limite < VEH.tramosTC[0].desde;
  return { ...t, exacto, bajoMinimo };
}
const cuotaDeuda = d => {
  if (d.cod !== 'TC') return num(d.cuota);
  const t = tramoTC(num(d.limite));
  return t ? num(d.limite) * t.pct / 100 : 0;
};

/* Capacidad de pago según el servicio de deudas */
function capacidadDeudas(V, cuotaNueva) {
  const bruto = ingresosTotales(V).computable;
  const grupo = cod => (VEH.codigos.find(c => c.v === cod) || VEH.codigos[1]).g;
  const suma = g => V.deudas.filter(d => grupo(d.cod) === g).reduce((a, d) => a + cuotaDeuda(d), 0);
  const cons = suma('consumo'), viv = suma('vivienda'), soc = suma('social');
  const limTotal = soc ? VEH.limite.social : viv ? VEH.limite.vivienda : VEH.limite.consumo;
  const consNuevo = cons + cuotaNueva;
  const total = consNuevo + viv + soc;
  const pc = bruto ? consNuevo / bruto * 100 : 0, pt = bruto ? total / bruto * 100 : 0;
  const okCons = pc <= VEH.limite.consumo + 1e-9, okTotal = pt <= limTotal + 1e-9;
  const maxNueva = Math.max(0, Math.min(bruto * VEH.limite.consumo / 100 - cons, bruto * limTotal / 100 - (cons + viv + soc)));
  return { bruto, cons, viv, soc, limTotal, consNuevo, total, pc, pt, okCons, okTotal, cumple: okCons && okTotal, maxNueva };
}
function pintaIngresos(V) {
  const ing = ingresosTotales(V);
  const d = $('#ingDetT'); if (d) d.textContent = ing.t.detalle;
  const dc = $('#ingDetC'); if (dc && ing.c) dc.textContent = ing.c.detalle;
  const tot = $('#ingTotal'); if (tot) tot.textContent = ing.computable ? `Bs ${nf2.format(ing.computable)}` : '—';
  const et = $('#ingEtiq'); if (et) et.innerHTML = `Ingreso computable<span class="ing-comp">líquido${ing.agui ? ' + aguinaldo ÷ 12' : ''}${ing.primas ? ' + primas y bonos ÷ 12' : ''}</span>`;
  const pi = $('#primasInfo'); if (pi) pi.textContent = ing.primas ? `Mensualizado: + Bs ${nf2.format(ing.primas)} (anual ÷ 12, sin descuentos)` : 'Monto anual de cada persona, sin descuentos, ÷ 12';
  const ai = $('#aguiInfo');
  if (ai) ai.textContent = ing.agui ? `Aguinaldo mensualizado: + Bs ${nf2.format(ing.agui)} (sueldo ÷ 12)` : 'Un sueldo al año, mensualizado (÷ 12) · solo ingresos por sueldo';
  return ing;
}
function pintaTarjetas(V) {
  V.deudas.forEach((d, i) => {
    if (d.cod !== 'TC') return;
    const t = tramoTC(num(d.limite));
    const c = $('#tcCuota_' + i), info = $('#tcInfo_' + i);
    if (c) c.textContent = t ? `Bs ${nf2.format(cuotaDeuda(d))}` : '—';
    if (info) info.innerHTML = !t ? 'Ingresa el límite para calcular la cuota'
      : `Límite Bs ${nf2.format(num(d.limite))} × ${t.pct}% = Bs ${nf2.format(cuotaDeuda(d))}${t.bajoMinimo ? ` · <span style="color:var(--red)">límite menor al mínimo de Bs ${nf0.format(VEH.tramosTC[0].desde)}</span>` : !t.exacto ? ' · entre tramos: se aplica el siguiente' : ''}`;
  });
}
function pintaCapacidad(V, cuotaNueva) {
  pintaIngresos(V);
  pintaTarjetas(V);
  const box = $('#capBox');
  if (!box) return null;
  const k = capacidadDeudas(V, cuotaNueva);
  if (!k.bruto) { box.innerHTML = '<div class="card empty small" style="margin:12px 0 0">Ingresa los ingresos (sección 5) para evaluar la capacidad de pago.</div>'; return k; }
  const barra = (pctUsado, limite, ok) => `<div class="bar" style="height:10px;margin-top:4px"><span style="width:${Math.min(100, pctUsado / limite * 100)}%;background:${ok ? 'var(--green-600)' : 'var(--red)'}"></span></div>`;
  box.innerHTML = `
  <div class="cap-box ${cuotaNueva ? (k.cumple ? 'ok' : 'no') : ''}">
    <div class="row between"><b>Capacidad de pago</b>${cuotaNueva ? `<span class="badge ${k.cumple ? '' : 'red'}">${k.cumple ? '✅ Cumple' : '❌ No cumple'}</span>` : ''}</div>
    <div class="small muted">Ingreso computable${V.codeudor === 'si' && V.ingC === 'si' ? ' sumado' : ''}: <b class="num">Bs ${nf2.format(k.bruto)}</b></div>
    <div class="cap-linea">
      <div class="row between small"><span>TC + N${cuotaNueva ? ' + nuevo crédito' : ''}</span><span class="num"><b>${nf2.format(k.pc)}%</b> de ${VEH.limite.consumo}%</span></div>
      ${barra(k.pc, VEH.limite.consumo, k.okCons)}
      <div class="small muted num">Bs ${nf2.format(k.consNuevo)} de Bs ${nf2.format(k.bruto * VEH.limite.consumo / 100)}</div>
    </div>
    ${k.limTotal !== VEH.limite.consumo ? `<div class="cap-linea">
      <div class="row between small"><span>Total con vivienda${k.soc ? ' social' : ''}</span><span class="num"><b>${nf2.format(k.pt)}%</b> de ${k.limTotal}%</span></div>
      ${barra(k.pt, k.limTotal, k.okTotal)}
      <div class="small muted num">Bs ${nf2.format(k.total)} de Bs ${nf2.format(k.bruto * k.limTotal / 100)}</div>
    </div>` : ''}
    <div class="row between" style="margin-top:10px"><span class="small">Cuota máxima para el nuevo crédito</span><b class="num">Bs ${nf2.format(k.maxNueva)}</b></div>
    ${cuotaNueva ? `<div class="row between"><span class="small">Cuota del vehículo (la más alta)</span><b class="num" style="color:${k.cumple ? 'var(--green-600)' : 'var(--red)'}">Bs ${nf2.format(cuotaNueva)}</b></div>` : ''}
  </div>`;
  return k;
}

function vehCalc() {
  const out = $('#vehOut');
  if (!out) return;
  const V = vehState();
  const m = 'BOB';
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
  // Vehículo a financiar: valor en $us × tipo de cambio (editable) = valor en Bs
  const tcVeh = num(V.tcVeh) || tc();
  const valorUsd = num(V.valorUsd);
  const valor = valorUsd * tcVeh;
  const pctMSC = VEH.msc[V.motor] || VEH.msc.gasolina;
  const primaMSC = V.msc === 'si' ? valor * pctMSC / 100 : 0;
  // Monto a financiar (sección 7): compra de vehículo (lo define el ejecutivo según campaña) + seguro BMSC
  const compra = num(V.compra);
  const monto = compra > 0 ? compra + primaMSC : 0;
  const fs = $('#finSeg'); if (fs) fs.textContent = primaMSC ? `Bs ${nf2.format(primaMSC)}` : 'No';
  const fsi = $('#finSegInfo'); if (fsi) fsi.textContent = primaMSC ? `${V.motor === 'hibrido' ? 'Eléctrico / híbrido' : 'A gasolina'} ${nf2.format(pctMSC)}% del valor del vehículo (sección 4)` : 'No se eligió seguro automotor en la sección 4';
  const ft = $('#finTotal'); if (ft) ft.textContent = monto ? `Bs ${nf2.format(monto)}` : '—';
  const fp = $('#finPct'); if (fp) fp.textContent = compra && valor ? `${nf2.format(compra / valor * 100)}% del valor del vehículo (Bs ${nf2.format(valor)})` : 'Monto que financia el banco según la campaña';
  const vb = $('#valorBs'); if (vb) vb.textContent = valor ? `Bs ${nf2.format(valor)}` : '—';
  const mi = $('#mscInfo');
  if (mi) mi.textContent = `${V.motor === 'hibrido' ? 'Eléctrico / híbrido' : 'A gasolina'}: ${nf2.format(pctMSC)}% del valor${primaMSC ? ` = Bs ${nf2.format(primaMSC)}` : ''} · se suma al financiamiento (sección 7)`;
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

  // Monto máximo (sección 7): la cuota más alta del crédito no puede pasar la cuota máxima que deja la
  // capacidad de pago (sección 6). La cuota (capital + interés + seguros) es proporcional al monto,
  // así que se calcula la cuota de Bs 100.000 y se escala.
  const segMensual = (desg + dima) / VEH.periodoSeguros; // % mensual sobre saldo
  const planDe = mto => generarPlan({ monto: mto, n: plazo, tasa: num(V.tasaFija), sistema: 'frances', gracia: 0, mesesFijos: fijo < plazo ? fijo : 0, tasaVar, desg: segMensual, seguroMes: 0, fecha: today() });
  const cuotaMaxDe = pl => Math.max(pl.rows[0].total, fijo < plazo ? pl.rows[fijo].total : 0);
  const base = 100000, cuotaBase = cuotaMaxDe(planDe(base));
  const kMax = capacidadDeudas(V, 0);
  const montoMax = kMax.bruto && cuotaBase > 0 ? Math.floor(kMax.maxNueva / cuotaBase * base * 100) / 100 : 0;
  const compraMax = Math.max(0, montoMax - primaMSC);
  const fm = $('#finMax');
  if (fm) fm.innerHTML = !kMax.bruto
    ? '<div class="fin-max vacio small">Ingresa los ingresos (sección 5) para calcular el monto máximo a financiar.</div>'
    : `<div class="fin-max ${compra > compraMax + 0.005 ? 'excede' : ''}">
        <div class="row between"><span>Monto máximo a financiar</span><b class="num">Bs ${nf2.format(montoMax)}</b></div>
        <div class="small muted">Cuota máxima Bs ${nf2.format(kMax.maxNueva)} (capacidad de pago) · ${plazo} meses · ${nf2.format(num(V.tasaFija))}%${fijo < plazo ? ` / ${nf2.format(tasaVar)}%` : ''}${desg ? ' · con seguros' : ''}</div>
        ${primaMSC ? `<div class="small muted">− Seguro vehicular BMSC Bs ${nf2.format(primaMSC)}</div>` : ''}
        <div class="row between fin-max-compra"><span>Compra máxima de vehículo</span><b class="num">Bs ${nf2.format(compraMax)}</b></div>
        ${valor ? `<div class="small muted">${nf2.format(compraMax / valor * 100)}% del valor del vehículo${compraMax > valor ? ' · la capacidad alcanza para más que el valor del vehículo' : ''}</div>` : ''}
        ${compra > compraMax + 0.005 ? `<div class="small fin-max-aviso">⚠️ La compra ingresada supera el máximo en Bs ${nf2.format(compra - compraMax)}</div>` : ''}
        ${compraMax > 0 ? `<button type="button" class="btn sm" data-act="vehUsarMax" data-v="${compraMax.toFixed(2)}">Usar el máximo</button>` : ''}
      </div>`;

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
    <div class="card empty small">💡 Ingresa el monto de compra de vehículo (sección 7) para calcular la cuota.</div>`;
    pintaCapacidad(V, 0);
    vehCalc.ultimo = null;
    return;
  }

  const plan = planDe(monto);
  const r = plan.rows;
  const c1 = r[0];
  const cVar = fijo < plazo ? r[fijo] : null;
  const cuotaNueva = Math.max(r[0].total, cVar ? cVar.total : 0);
  const cap = pintaCapacidad(V, cuotaNueva);
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
      <dt>Vehículo</dt><dd>${V.estado === 'usado' ? 'Usado' : 'Nuevo'} · ${V.motor === 'hibrido' ? 'eléctrico / híbrido' : 'a gasolina'}</dd>
      <dt>Valor del vehículo</dt><dd class="num">$us ${nf2.format(valorUsd)} × ${nf2.format(tcVeh)} = ${fmt(valor, m)}</dd>
      <dt>Compra de vehículo</dt><dd class="num">${fmt(compra, m)}${valor ? ` (${nf2.format(compra / valor * 100)}%)` : ''}</dd>
      ${primaMSC ? `<dt>Seguro vehicular BMSC (${nf2.format(pctMSC)}%)</dt><dd class="num">+ ${fmt(primaMSC, m)}</dd>` : ''}
      <dt><b>Monto a financiar</b></dt><dd class="num"><b>${fmt(monto, m)}</b></dd>
      <dt>Plazo</dt><dd>${plazo} meses (${plazo / 12} ${plazo === 12 ? 'año' : 'años'})</dd>
      ${cap && cap.bruto ? `<dt>Capacidad de pago</dt><dd>${cap.cumple ? '✅ Cumple' : '❌ No cumple'} · máx. Bs ${nf2.format(cap.maxNueva)}</dd>` : ''}
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
  vehCalc.ultimo = { V: { ...V }, monto, c1, cVar, plazo, fijo, tasaVar, desgTxt, dima, primaMSC, aplica, valor, valorUsd, tcVeh, compra };
}

/* ---------------- Enlace con la app ---------------- */
ROUTES.calculadora.render = () => vehForm() + `<p class="small muted center no-print">Cálculos referenciales. Aplica siempre la normativa interna vigente del banco.</p>`;
ROUTES.calculadora.after = () => {
  const V = vehState();
  const form = $('#vehForm');
  if (!form) return;
  const rerender = ['codeudor', 'plazo', 'tipoT', 'tipoC', 'vivienda', 'ingC', 'primas'];
  // (motor, estado y seguro automotor se recalculan sin redibujar)
  const onChange = e => {
    Object.entries(formData(form)).forEach(([k, v]) => {
      const m = k.match(/^d_(\d+)_(cod|cuota|tarjeta|limite)$/);
      if (m) { const d = V.deudas[+m[1]]; if (d) d[m[2]] = v; }
      else V[k] = v;
    });
    $$('input[type=checkbox]', form).forEach(ch => { V[ch.name] = ch.checked ? 'si' : ''; });
    if (e.target.name === 'periodoFijo') {
      const entero = String(Math.max(0, parseInt(String(V.periodoFijo), 10) || 0));
      if (entero !== String(V.periodoFijo)) { V.periodoFijo = entero; e.target.value = entero; }
    }
    if (e.target.name === 'plazo') { V.plazoAjustado = false; if (num(V.periodoFijo) > num(V.plazo)) V.periodoFijo = V.plazo; }
    guardarCalc();
    if (rerender.includes(e.target.name) || /^d_\d+_cod$/.test(e.target.name)) { render(); return; }
    vehCalc();
  };
  const esCambio = t => t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'checkbox' || t.type === 'date';
  form.addEventListener('input', e => { if (!esCambio(e.target)) onChange(e); });
  form.addEventListener('change', e => { if (esCambio(e.target)) onChange(e); });
  vehCalc();
};

Object.assign(ACTIONS, {
  vehDeudaAdd: () => { vehState().deudas.push({ cod: 'N', cuota: '' }); guardarCalc(); render(); setTimeout(() => { const i = vehState().deudas.length - 1; $(`#vehForm [name=d_${i}_cuota]`)?.focus(); }, 50); },
  // Ingresos del codeudor: al añadirlos se activa el codeudor en la sección 1 (su fecha de nacimiento es obligatoria)
  vehIngC: el => {
    const V = vehState();
    V.ingC = el.dataset.v;
    if (V.ingC === 'si' && V.codeudor !== 'si') { V.codeudor = 'si'; toast('Codeudor activado: completa sus datos en la sección 1'); }
    guardarCalc(); render();
  },
  vehUsarMax: el => { vehState().compra = el.dataset.v.replace('.', ','); guardarCalc(); render(); },
  vehDeudaDel: el => { vehState().deudas.splice(+el.dataset.i, 1); guardarCalc(); render(); },
  vehCompartir: () => {
    const u = vehCalc.ultimo; if (!u) return;
    const m = 'BOB';
    const text = `*Propuesta de crédito vehicular* (${fmtDate(today())})
${u.V.nombre ? 'Cliente: ' + u.V.nombre + '\n' : ''}Vehículo ${u.V.estado === 'usado' ? 'usado' : 'nuevo'} (${u.V.motor === 'hibrido' ? 'eléctrico/híbrido' : 'a gasolina'}) · valor $us ${nf2.format(u.valorUsd)} = ${fmt(u.valor, m)} (TC ${nf2.format(u.tcVeh)})
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
    caseForm({}, { tipo: 'vehicular', monto: Math.round(u.monto * 100) / 100, moneda: 'BOB', tasa: num(u.V.tasaFija), plazo: u.plazo, prospecto: u.V.nombre, destino: `Vehículo ${u.V.estado === 'usado' ? 'usado' : 'nuevo'}` });
  }
});

if (current.name === 'calculadora') render();
