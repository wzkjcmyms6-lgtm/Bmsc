/* Simulador de crédito vehicular (requisitos del banco).
   Secciones: propuesta, datos del cliente (titular y codeudor), seguros y condiciones.
   Reglas y tasas en VEH: se ajustan aquí cuando cambie la norma. */
'use strict';

const VEH = {
  edadMax: { anios: 70, dias: 360 },          // desgravamen: hasta 70 años y 360 días (sin cumplir 71)
  edadCredito: 76,                            // el crédito no puede pasar de los 76 años del mayor
  desgravamen: { titular: 1.250, mancomunado: 2.251 }, // % sobre saldo capital
  dima: { titular: 0.36, mancomunado: 0.72 },          // % sobre saldo capital
  cesantia: 0.84,                              // consumo: seguro de cesantía, % anual sobre saldo insoluto
  periodoSeguros: 12,                          // los % de seguros son anuales → se cobran /12 cada mes
  msc: { gasolina: 3.8, hibrido: 3.8 },        // % del valor del vehículo, se suma al monto a financiar
  plazos: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  // Servicio de deudas: códigos de las deudas actuales del cliente
  codigos: [
    { v: 'TC', l: 'TC · Tarjeta de crédito', g: 'consumo' },
    { v: 'N', l: 'N · Otros créditos', g: 'consumo' },
    { v: 'H0', l: 'H0 · Vivienda', g: 'vivienda' }, { v: 'H1', l: 'H1 · Vivienda', g: 'vivienda' }, { v: 'H2', l: 'H2 · Vivienda', g: 'vivienda' },
    { v: 'H3', l: 'H3 · Vivienda social', g: 'social' }, { v: 'H4', l: 'H4 · Vivienda social', g: 'social' }
  ],
  // Norma de endeudamiento para asalariados:
  //  1) TC, N y el crédito nuevo (sin contar vivienda): hasta 25% del ingreso mensual líquido.
  //  2) Con créditos de vivienda: el total de deudas (actuales + nueva) no debe pasar el % de la tabla
  //     según el ingreso anual mensualizado (líquido + aguinaldo, primas y bonos ÷ 12).
  //  Los % de las tablas son de uso interno: no están en este código. Se leen de Firebase (config/normas)
  //  después de iniciar sesión y se cargan desde Más → Parámetros de productos.
  limite: { consumo: 25 },
  tablasVivienda: {
    vivienda: { nombre: 'Vivienda (H0–H2)', corto: 'Vivienda' },
    socialMayor: { nombre: 'Vivienda social con aporte propio ≥ 20%', corto: 'Social ≥ 20%' },
    socialMenor: { nombre: 'Vivienda social con aporte propio < 20%', corto: 'Social < 20%' }
  },
  // Tarjetas de crédito: cuota a considerar = monto fijo + % del límite, según la categoría.
  // Los valores (mínimo, fijo, %) son de uso interno: se leen de Firebase (config/normas → tarjetas).
  categoriasTC: [
    ['clasica', 'Visa Internacional / Mastercard Clásica', 'Clásica'],
    ['oro', 'Visa Oro / Mastercard Gold', 'Oro / Gold'],
    ['platinum', 'Visa Infinite / Mastercard Platinum', 'Infinite / Platinum'],
    ['black', 'Visa Signature / Mastercard Black', 'Signature / Black']
  ],
  impuestoExterior: 13,                        // % que se descuenta a ingresos del exterior (referencial)
  treMN: 3.65, treVigencia: 'septiembre 2026'  // TRe MN publicada por el BCB (respaldo)
};
// Tipo de crédito del simulador: consumo o vehicular (mismos ratios de endeudamiento)
const esConsumo = V => V.producto === 'consumo';
// Números de sección (consumo no tiene "Vehículo a financiar")
const SEC = V => esConsumo(V) ? { ingresos: 4, deudas: 5, fin: 6 } : { vehiculo: 4, ingresos: 5, deudas: 6, fin: 7 };
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
    tipoT: 'sueldo', montoT: '', otrosT: '', tipoC: 'sueldo', montoC: '', otrosC: '', vivienda: 'no', aguinaldo: 'no', primas: 'no', primasT: '', primasC: '', aporteSocial: 'menor', ingC: 'no', deudas: [], compra: ''
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
  // mensual: base del 25% (sin aguinaldo, primas ni bonos anuales)
  // anual: ingreso anual menos descuentos de ley, mensualizado → base del límite total con vivienda
  const mensual = t.computable + (c ? c.computable : 0);
  return { t, c, agui, primas, mensual, anual: mensual + agui + primas };
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

  return `${historialSims(V)}
  <form id="vehForm" class="calc-form no-print" onsubmit="return false">
    <div class="card prod-sel">
      <div class="small muted">Tipo de crédito</div>
      ${opciones('producto', esConsumo(V) ? 'consumo' : 'vehicular', [['consumo', '💳 Consumo'], ['vehicular', '🚗 Vehicular']])}
    </div>
    <div class="veh-top card">
      <div><div class="small muted">Fecha de elaboración de la propuesta</div><b>${fmtDate(today())}</b></div>
      <div class="veh-top-der">
        <span class="badge">${esConsumo(V) ? '💳 Crédito de consumo' : '🚗 Crédito vehicular'}</span>
        <button type="button" class="btn sm veh-reset" data-act="vehSimNueva">↺ Resetear simulación</button>
      </div>
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
      ${esConsumo(V) ? `<div class="veh-row veh-seg"><div><span>Seguro de cesantía</span><div class="small muted">${pct3(VEH.cesantia)}% anual sobre saldo insoluto (${mensual(VEH.cesantia)}% mensual)</div></div>
        <div class="chk-group">${chk('cesantia', V.cesantia === '' ? '' : 'si', 'Incluir')}</div></div>` : ''}
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

    ${esConsumo(V) ? '' : seccion(4, 'Vehículo a financiar', `
      <div class="veh-row"><span>Vehículo</span>${opciones('estado', V.estado, [['nuevo', 'Nuevo'], ['usado', 'Usado']])}</div>
      <div class="veh-row"><span>Tipo de motor</span>${opciones('motor', V.motor, [['gasolina', 'A gasolina'], ['hibrido', 'Eléctrico / híbrido']])}</div>
      <div class="fields-2">
        ${field({ label: 'Valor del vehículo ($us)', name: 'valorUsd', type: 'money', value: V.valorUsd })}
        ${field({ label: 'Tipo de cambio (Bs por $us)', name: 'tcVeh', type: 'money', value: V.tcVeh || String(tc()).replace('.', ','), hint: `Oficial BCB hoy: ${nf2.format(tc())}` })}
      </div>
      <div class="veh-valor-bs"><span class="small muted">Valor en bolivianos</span><b class="num" id="valorBs">—</b></div>
      <div class="veh-row"><div><span>¿Seguro automotor MSC?</span><div class="small muted" id="mscInfo"></div></div>${siNo('msc', V.msc)}</div>
    `)}

    ${seccion(SEC(V).ingresos, 'Ingresos', `
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
      <div class="veh-valor-bs"><span class="small muted" id="ingEtiq">Ingreso mensual (líquido)</span><b class="num" id="ingTotal">—</b></div>
      ${V.vivienda === 'si' ? `<div class="veh-valor-bs veh-valor-sec"><span class="small muted" id="ingAnualEtiq">Ingreso anual mensualizado</span><b class="num" id="ingAnual">—</b></div>
      <div class="small muted">El 25% (TC, N y crédito nuevo) se calcula sobre el ingreso mensual. El aguinaldo, las primas y los bonos solo cuentan para el límite total con vivienda.</div>` : ''}
    `)}

    ${seccion(SEC(V).deudas, 'Servicio de deudas mensual', `
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
            <select name="d_${i}_tarjeta">${VEH.categoriasTC.map(([v, l]) => `<option value="${v}" ${catTC(d) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input name="d_${i}_limite" type="text" inputmode="decimal" placeholder="Límite de la tarjeta (Bs)" value="${esc(d.limite || '')}">
            <div class="small muted deuda-tc-info" id="tcInfo_${i}"></div>
          </div>` : ''}
        </div>`).join('') || '<div class="small muted" style="padding:6px 0">Sin deudas registradas.</div>'}</div>
      <button type="button" class="btn sm" data-act="vehDeudaAdd" style="margin-top:8px">${ICONS.plus} Agregar deuda</button>
      ${V.deudas.some(d => grupoDe(d.cod) === 'social') ? `<div class="veh-row" style="margin-top:6px"><div><span>Vivienda social: aporte propio</span><div class="small muted">Del crédito H3–H4 · define la tabla del límite total</div></div>${opciones('aporteSocial', V.aporteSocial === 'mayor' ? 'mayor' : 'menor', [['mayor', '≥ 20%'], ['menor', '< 20%']])}</div>` : ''}
      <details class="small muted" style="margin-top:10px"><summary class="link" style="cursor:pointer">Cuota a considerar en tarjetas</summary>${tablaTarjetas()}</details>
      <div class="small muted" style="margin-top:10px">TC, N y el crédito nuevo (sin contar vivienda): hasta ${VEH.limite.consumo}% del ingreso mensual líquido. Con créditos de vivienda, además el total de deudas no debe pasar el % de la tabla según el ingreso anual mensualizado.</div>
      <details class="small muted" style="margin-top:6px"><summary class="link" style="cursor:pointer">% máximo del total de deudas con vivienda</summary>${tablaNormaVivienda()}</details>
      <div id="capBox"></div>
    `)}

    ${seccion(SEC(V).fin, 'Financiamiento', esConsumo(V) ? `
      <div id="finMax"></div>
      <div class="fin-linea">
        <div><span>Monto del crédito</span><div class="small muted">Monto que solicita el cliente</div></div>
        <div class="fin-input"><span>Bs</span><input name="montoCons" type="text" inputmode="decimal" placeholder="0,00" value="${esc(V.montoCons || '')}"></div>
      </div>
      <div class="fin-total"><span>Monto a financiar</span><b class="num" id="finTotal">—</b></div>
    ` : `
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

/* Historial de simulaciones guardadas (arriba del simulador): nombre del titular y monto a financiar */
function historialSims(V) {
  const sims = [...(S().sims || [])].sort((a, b) => (b.actualizado || b.creado || '').localeCompare(a.actualizado || a.creado || ''));
  const abierta = UI.simsAbierto ? 'open' : '';
  return `
  <details class="card sims-hist no-print" id="simsHist" ${abierta}>
    <summary><span>🗂️ Historial de simulaciones</span><span class="badge gray">${sims.length}</span></summary>
    ${sims.length ? `<div class="sims-lista">${sims.map(x => `
      <div class="sim-item ${x.id === V.simId ? 'activa' : ''}">
        <button type="button" class="sim-abrir" data-act="vehSimAbrir" data-id="${esc(x.id)}">
          <b>${x.datos?.producto === 'consumo' ? '💳' : '🚗'} ${esc(x.nombre || 'Sin nombre')}</b>
          <span class="num">Bs ${nf2.format(num(x.monto))}${x.cuota ? ` · cuota Bs ${nf2.format(num(x.cuota))}` : ''}</span>
          <span class="small muted">${fmtDate((x.actualizado || x.creado || '').slice(0, 10))}${x.telefono ? ' · 📞 ' + esc(x.telefono) : ''}${x.plazo ? ' · ' + x.plazo + ' meses' : ''}</span>
        </button>
        <button type="button" class="sim-del" data-act="vehSimBorrar" data-id="${esc(x.id)}" aria-label="Eliminar">✕</button>
      </div>`).join('')}</div>` : '<div class="small muted" style="padding:8px 0 2px">Aún no hay simulaciones guardadas. Registra el teléfono debajo de las cuotas y toca Guardar.</div>'}
    <button type="button" class="btn sm" data-act="vehSimNueva" style="margin-top:10px">+ Nueva simulación</button>
  </details>`;
}

/* Tarjeta de crédito: % según el tramo del límite. Entre tramos se aplica el tramo siguiente. */
/* Tarjetas de crédito (config de la nube): { maximoTabla, categorias: { clasica: { minimo, fijo, pct }, … } } */
function tarjetasCfg() {
  const t = S().settings.normas?.tarjetas;
  if (!t || !t.categorias) return null;
  const cats = {};
  for (const [id, nombre, corto] of VEH.categoriasTC) {
    const c = t.categorias[id];
    if (!c) return null;
    cats[id] = { id, nombre, corto, minimo: num(c.minimo), fijo: num(c.fijo), pct: num(c.pct) };
  }
  return { maximo: num(t.maximoTabla) || 0, cats };
}
// Deudas guardadas antes con 'visa' / 'master' eran de la categoría clásica
const catTC = d => VEH.categoriasTC.some(([v]) => v === d.tarjeta) ? d.tarjeta : 'clasica';
function tcCalc(d) {
  const L = num(d.limite);
  if (!(L > 0)) return null;
  const T = tarjetasCfg();
  if (!T) return { sinParam: true, cuota: 0 };
  const c = T.cats[catTC(d)];
  return { ...c, limite: L, cuota: c.fijo + L * c.pct / 100, bajoMinimo: L < c.minimo, sobreTabla: T.maximo && L > T.maximo, maximo: T.maximo };
}
const cuotaDeuda = d => d.cod === 'TC' ? (tcCalc(d)?.cuota || 0) : num(d.cuota);
const pctTC = v => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
function tablaTarjetas() {
  const T = tarjetasCfg();
  if (!T) return '<div style="margin-top:6px">⚠️ Los parámetros de tarjetas no están cargados en este dispositivo. Inicia sesión con internet o cárgalos en Más → Parámetros de productos.</div>';
  return `<div class="table-wrap" style="margin-top:6px"><table class="tbl num tabla-norma"><thead><tr><th>Categoría</th><th>Límite mínimo</th><th>Cuota a considerar</th></tr></thead><tbody>
    ${Object.values(T.cats).map(c => `<tr><td>${esc(c.corto)}</td><td>Bs ${nf0.format(c.minimo)}</td><td>Bs ${nf2.format(c.fijo)} + ${pctTC(c.pct)}%</td></tr>`).join('')}
    </tbody></table></div><div style="margin-top:4px">Cuota = monto fijo + % del límite.${T.maximo ? ` Tabla hasta límites de Bs ${nf0.format(T.maximo)}.` : ''}</div>`;
}
/* Límite máximo de tarjeta que alcanza con la cuota libre (se redondea hacia abajo a Bs 100) */
function limitesTC(cuotaLibre) {
  const T = tarjetasCfg();
  if (!T) return null;
  return Object.values(T.cats).map(c => {
    const lim = c.pct > 0 ? Math.floor((cuotaLibre - c.fijo) / (c.pct / 100) / 100) * 100 : 0;
    return { ...c, lim, alcanza: lim >= c.minimo, tope: T.maximo && lim > T.maximo ? T.maximo : 0 };
  });
}

/* Capacidad de pago según el servicio de deudas */
const grupoDe = cod => (VEH.codigos.find(c => c.v === cod) || VEH.codigos[1]).g;
/* Norma de endeudamiento cargada desde la nube (null si aún no está en este dispositivo).
   Formato guardado: { consumo, tablas: { vivienda: [{ hasta, pct }, …], socialMayor: […], socialMenor: […] } }
   (hasta = null → sin tope). */
function normaEnd() {
  const n = S().settings.normas?.endeudamiento;
  if (!n || !n.tablas) return null;
  const tablas = {};
  for (const [k, info] of Object.entries(VEH.tablasVivienda)) {
    const tramos = (n.tablas[k] || []).map(t => Array.isArray(t) ? { hasta: t[0], pct: t[1] } : t)
      .map(t => ({ hasta: t.hasta == null ? Infinity : num(t.hasta), pct: num(t.pct) }));
    if (!tramos.length) return null;
    tablas[k] = { ...info, tramos };
  }
  return { consumo: num(n.consumo) || VEH.limite.consumo, tablas };
}
/* Tabla del límite total con vivienda: con deuda de vivienda social se usa la tabla social (la más estricta)
   según el aporte propio de ese crédito; si no, la de vivienda. */
function tablaVivienda(V, conSocial, N) {
  const T = N.tablas;
  return conSocial ? (V.aporteSocial === 'mayor' ? T.socialMayor : T.socialMenor) : T.vivienda;
}
function tramoVivienda(tabla, ingreso) {
  let i = tabla.tramos.findIndex(t => ingreso <= t.hasta);
  if (i < 0) i = tabla.tramos.length - 1;
  const tr = tabla.tramos[i], desde = i > 0 ? tabla.tramos[i - 1].hasta : 0;
  const txt = tr.hasta === Infinity ? `más de Bs ${nf0.format(desde)}` : desde ? `más de Bs ${nf0.format(desde)} hasta Bs ${nf0.format(tr.hasta)}` : `hasta Bs ${nf0.format(tr.hasta)}`;
  return { ...tr, txt };
}
function tablaNormaVivienda() {
  const N = normaEnd();
  if (!N) return '<div style="margin-top:6px">⚠️ Los parámetros de la norma no están cargados en este dispositivo. Inicia sesión con internet o cárgalos en Más → Parámetros de productos.</div>';
  const T = N.tablas, cols = [T.vivienda, T.socialMayor, T.socialMenor];
  const filas = T.vivienda.tramos.map((t, i) => {
    const desde = i ? T.vivienda.tramos[i - 1].hasta : 0;
    const ref = t.hasta === Infinity ? desde + 1 : t.hasta;
    const rango = !desde ? `≤ ${nf0.format(t.hasta)}` : t.hasta === Infinity ? `> ${nf0.format(desde)}` : `${nf0.format(desde)} – ${nf0.format(t.hasta)}`;
    return `<tr><td>${rango}</td>${cols.map(tb => `<td>${tramoVivienda(tb, ref).pct}%</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="table-wrap" style="margin-top:6px"><table class="tbl num tabla-norma"><thead><tr><th>Ingreso (Bs)</th>${cols.map(tb => `<th>${esc(tb.corto)}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>
    <div style="margin-top:4px">Ingreso mensualizado = líquido + (aguinaldo + primas + bonos) ÷ 12. El % incluye todas las deudas: TC, N, vivienda y el crédito nuevo.</div>`;
}
/* Capacidad de pago según la norma de endeudamiento para asalariados:
   1) TC + N + crédito nuevo ≤ 25% del ingreso mensual líquido (sin contar cuotas de vivienda).
   2) Si tiene créditos de vivienda: total de deudas + crédito nuevo ≤ % de la tabla (A1, A2 o A3)
      según el ingreso anual mensualizado. */
function capacidadDeudas(V, cuotaNueva) {
  const { mensual, anual } = ingresosTotales(V);
  const N = normaEnd();
  const suma = g => V.deudas.filter(d => grupoDe(d.cod) === g).reduce((a, d) => a + cuotaDeuda(d), 0);
  const cons = suma('consumo'), viv = suma('vivienda'), soc = suma('social');
  const conVivienda = viv + soc > 0;
  // Sin los parámetros de la norma no se puede evaluar el límite total con vivienda
  const sinNorma = conVivienda && !N;
  const sinTarjetas = V.deudas.some(d => d.cod === 'TC' && tcCalc(d)?.sinParam);
  const tabla = N ? tablaVivienda(V, soc > 0, N) : null;
  const tramo = tabla ? tramoVivienda(tabla, anual) : null;
  const limCons = N ? N.consumo : VEH.limite.consumo, limTotal = tramo ? tramo.pct : 0;
  const consNuevo = cons + cuotaNueva;
  const total = consNuevo + viv + soc;
  const pc = mensual ? consNuevo / mensual * 100 : 0, pt = anual ? total / anual * 100 : 0;
  const okCons = pc <= limCons + 1e-9, okTotal = !conVivienda || sinNorma || pt <= limTotal + 1e-9;
  const maxCons = mensual * limCons / 100 - cons;
  const maxTotal = conVivienda && !sinNorma ? anual * limTotal / 100 - (cons + viv + soc) : Infinity;
  const maxNueva = Math.max(0, Math.min(maxCons, maxTotal));
  return { mensual, anual, cons, viv, soc, conVivienda: conVivienda && !sinNorma, sinNorma, tabla, tramo, limCons, limTotal, consNuevo, total, pc, pt, okCons, okTotal, cumple: okCons && okTotal && !sinNorma && !sinTarjetas, sinTarjetas, maxNueva, limitaVivienda: maxTotal < maxCons };
}
function pintaIngresos(V) {
  const ing = ingresosTotales(V);
  const d = $('#ingDetT'); if (d) d.textContent = ing.t.detalle;
  const dc = $('#ingDetC'); if (dc && ing.c) dc.textContent = ing.c.detalle;
  const sumado = ing.c ? ' (titular + codeudor)' : '';
  const tot = $('#ingTotal'); if (tot) tot.textContent = ing.mensual ? `Bs ${nf2.format(ing.mensual)}` : '—';
  const et = $('#ingEtiq'); if (et) et.innerHTML = `Ingreso mensual líquido${sumado}<span class="ing-comp">base del ${VEH.limite.consumo}% (TC, N y crédito nuevo)</span>`;
  const ta = $('#ingAnual'); if (ta) ta.textContent = ing.anual ? `Bs ${nf2.format(ing.anual)}` : '—';
  const ea = $('#ingAnualEtiq'); if (ea) ea.innerHTML = `Ingreso anual mensualizado${sumado}<span class="ing-comp">líquido${ing.agui ? ' + aguinaldo ÷ 12' : ''}${ing.primas ? ' + primas y bonos ÷ 12' : ''} · base del límite con vivienda</span>`;
  const pi = $('#primasInfo'); if (pi) pi.textContent = ing.primas ? `Mensualizado: + Bs ${nf2.format(ing.primas)} (anual ÷ 12, sin descuentos)` : 'Monto anual de cada persona, sin descuentos, ÷ 12';
  const ai = $('#aguiInfo');
  if (ai) ai.textContent = ing.agui ? `Aguinaldo mensualizado: + Bs ${nf2.format(ing.agui)} (sueldo ÷ 12)` : 'Un sueldo al año, mensualizado (÷ 12) · solo ingresos por sueldo';
  return ing;
}
function pintaTarjetas(V) {
  V.deudas.forEach((d, i) => {
    if (d.cod !== 'TC') return;
    const t = tcCalc(d);
    const c = $('#tcCuota_' + i), info = $('#tcInfo_' + i);
    if (c) c.textContent = t && !t.sinParam ? `Bs ${nf2.format(t.cuota)}` : '—';
    if (info) info.innerHTML = !t ? 'Ingresa el límite para calcular la cuota'
      : t.sinParam ? '<span style="color:var(--red)">Faltan los parámetros de tarjetas (Más → Parámetros de productos)</span>'
      : `Bs ${nf2.format(t.fijo)} + ${pctTC(t.pct)}% × Bs ${nf2.format(t.limite)} = Bs ${nf2.format(t.cuota)}${t.bajoMinimo ? ` · <span style="color:var(--red)">límite menor al mínimo de la categoría (Bs ${nf0.format(t.minimo)})</span>` : t.sobreTabla ? ` · por encima de la tabla (Bs ${nf0.format(t.maximo)}): se extiende la fórmula` : ''}`;
  });
}
function tcLimiteHtml(k) {
  const L = limitesTC(k.maxNueva);
  return `<details class="tc-lim" id="tcLim" ${UI.tcLimAbierto ? 'open' : ''}>
    <summary>💳 ¿Cuánto límite de tarjeta le puedo dar?</summary>
    ${!L ? '<div class="small muted" style="margin-top:6px">Faltan los parámetros de tarjetas en este dispositivo.</div>' : `
    <div class="small muted" style="margin:6px 0">Con la cuota libre de <b class="num">Bs ${nf2.format(k.maxNueva)}</b> (deudas actuales, sin el crédito de esta simulación):</div>
    ${L.map(c => `<div class="row between tc-lim-fila"><span>${esc(c.corto)}</span>${c.alcanza
      ? `<b class="num">${c.tope ? `Bs ${nf0.format(c.tope)} o más` : `hasta Bs ${nf0.format(c.lim)}`}</b>`
      : `<span class="small" style="color:var(--red)">No alcanza (mínimo Bs ${nf0.format(c.minimo)})</span>`}</div>`).join('')}
    <div class="small muted" style="margin-top:6px">Si también toma el crédito simulado, ambos comparten la misma capacidad de pago.</div>`}
  </details>`;
}
function pintaCapacidad(V, cuotaNueva) {
  pintaIngresos(V);
  pintaTarjetas(V);
  const box = $('#capBox');
  if (!box) return null;
  const k = capacidadDeudas(V, cuotaNueva);
  if (!k.mensual) { box.innerHTML = `<div class="card empty small" style="margin:12px 0 0">Ingresa los ingresos (sección ${SEC(V).ingresos}) para evaluar la capacidad de pago.</div>`; return k; }
  const barra = (pctUsado, limite, ok) => `<div class="bar" style="height:10px;margin-top:4px"><span style="width:${Math.min(100, pctUsado / limite * 100)}%;background:${ok ? 'var(--green-600)' : 'var(--red)'}"></span></div>`;
  box.innerHTML = `
  <div class="cap-box ${cuotaNueva ? (k.cumple ? 'ok' : 'no') : ''}">
    <div class="row between"><b>Capacidad de pago</b>${cuotaNueva ? ((k.sinNorma || k.sinTarjetas) && k.okCons ? '<span class="badge gold">⚠️ Incompleto</span>' : `<span class="badge ${k.cumple ? '' : 'red'}">${k.cumple ? '✅ Cumple' : '❌ No cumple'}</span>`) : ''}</div>
    <div class="cap-linea">
      <div class="row between small"><span>TC + N${cuotaNueva ? ' + nuevo crédito' : ''}</span><span class="num"><b>${nf2.format(k.pc)}%</b> de ${k.limCons}%</span></div>
      ${barra(k.pc, k.limCons, k.okCons)}
      <div class="small muted num">Bs ${nf2.format(k.consNuevo)} de Bs ${nf2.format(k.mensual * k.limCons / 100)} · sobre el ingreso mensual Bs ${nf2.format(k.mensual)}</div>
    </div>
    ${k.conVivienda ? `<div class="cap-linea">
      <div class="row between small"><span>Total con vivienda</span><span class="num"><b>${nf2.format(k.pt)}%</b> de ${k.limTotal}%</span></div>
      ${barra(k.pt, k.limTotal, k.okTotal)}
      <div class="small muted num">Bs ${nf2.format(k.total)} de Bs ${nf2.format(k.anual * k.limTotal / 100)} · sobre el ingreso anual mensualizado Bs ${nf2.format(k.anual)}</div>
      <div class="small muted">${esc(k.tabla.nombre)} · ingreso ${k.tramo.txt} → ${k.limTotal}%</div>
    </div>` : ''}
    ${k.sinTarjetas ? '<div class="small" style="margin-top:8px;color:var(--red)">⚠️ Las tarjetas no suman su cuota: faltan los parámetros de tarjetas en este dispositivo.</div>' : ''}
    ${k.sinNorma ? '<div class="small" style="margin-top:8px;color:var(--red)">⚠️ No se evaluó el límite total con vivienda: faltan los parámetros de la norma en este dispositivo (inicia sesión con internet o cárgalos en Más → Parámetros de productos).</div>' : ''}
    <div class="row between" style="margin-top:10px"><span class="small">Cuota máxima para el nuevo crédito${k.conVivienda && k.limitaVivienda ? '<br><span class="muted">(la limita el total con vivienda)</span>' : ''}</span><b class="num">Bs ${nf2.format(k.maxNueva)}</b></div>
    ${tcLimiteHtml(k)}
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
  const consumo = esConsumo(V);
  const primaMSC = !consumo && V.msc === 'si' ? valor * pctMSC / 100 : 0;
  // Monto a financiar (sección 7): compra de vehículo (lo define el ejecutivo según campaña) + seguro BMSC
  // Consumo: el monto lo pone el ejecutivo directamente (sin vehículo ni seguro automotor)
  const compra = consumo ? num(V.montoCons) : num(V.compra);
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
  const ces = consumo && V.cesantia !== '' ? VEH.cesantia : 0; // cesantía: solo consumo
  const segMensual = (desg + dima + ces) / VEH.periodoSeguros; // % mensual sobre saldo
  const planDe = mto => generarPlan({ monto: mto, n: plazo, tasa: num(V.tasaFija), sistema: 'frances', gracia: 0, mesesFijos: fijo < plazo ? fijo : 0, tasaVar, desg: segMensual, seguroMes: 0, fecha: today() });
  const cuotaMaxDe = pl => Math.max(pl.rows[0].total, fijo < plazo ? pl.rows[fijo].total : 0);
  const base = 100000, cuotaBase = cuotaMaxDe(planDe(base));
  const kMax = capacidadDeudas(V, 0);
  const montoMax = kMax.mensual && cuotaBase > 0 ? Math.floor(kMax.maxNueva / cuotaBase * base * 100) / 100 : 0;
  const compraMax = Math.max(0, montoMax - primaMSC);
  const fm = $('#finMax');
  if (fm) fm.innerHTML = !kMax.mensual
    ? `<div class="fin-max vacio small">Ingresa los ingresos (sección ${SEC(V).ingresos}) para calcular el monto máximo a financiar.</div>`
    : `<div class="fin-max ${compra > compraMax + 0.005 ? 'excede' : ''}">
        <div class="row between"><span>Monto máximo ${consumo ? 'del crédito' : 'a financiar'}</span><b class="num">Bs ${nf2.format(montoMax)}</b></div>
        <div class="small muted">Cuota máxima Bs ${nf2.format(kMax.maxNueva)} (capacidad de pago${kMax.conVivienda && kMax.limitaVivienda ? ', limitada por el total con vivienda' : ''}${kMax.sinNorma ? ', sin evaluar el límite con vivienda' : ''}) · ${plazo} meses · ${nf2.format(num(V.tasaFija))}%${fijo < plazo ? ` / ${nf2.format(tasaVar)}%` : ''}${desg || ces ? ' · con seguros' : ''}</div>
        ${consumo ? '' : `${primaMSC ? `<div class="small muted">− Seguro vehicular BMSC Bs ${nf2.format(primaMSC)}</div>` : ''}
        <div class="row between fin-max-compra"><span>Compra máxima de vehículo</span><b class="num">Bs ${nf2.format(compraMax)}</b></div>
        ${valor ? `<div class="small muted">${nf2.format(compraMax / valor * 100)}% del valor del vehículo${compraMax > valor ? ' · la capacidad alcanza para más que el valor del vehículo' : ''}</div>` : ''}
        ${compra > compraMax + 0.005 ? `<div class="small fin-max-aviso">⚠️ La compra ingresada supera el máximo en Bs ${nf2.format(compra - compraMax)}</div>` : ''}
`}
        ${consumo && compra > compraMax + 0.005 ? `<div class="small fin-max-aviso">⚠️ El monto ingresado supera el máximo en Bs ${nf2.format(compra - compraMax)}</div>` : ''}
        ${compraMax > 0 ? `<button type="button" class="btn sm" data-act="vehUsarMax" data-v="${compraMax.toFixed(2)}">Usar el máximo</button>` : ''}
      </div>`;

  const avisos = [];
  if (!V.fnac) avisos.push('Ingresa la fecha de nacimiento del titular (obligatoria).');
  if (conCodeudor && !V.cFnac) avisos.push('Ingresa la fecha de nacimiento del codeudor (obligatoria).');
  if (eT && !okT) avisos.push(`El titular supera la edad para desgravamen (${edadTxt(eT)}): no puede llevar desgravamen ni DIMA.`);
  if (conCodeudor && eC && !okC) avisos.push(`El codeudor supera la edad para desgravamen (${edadTxt(eC)}): no puede llevar desgravamen ni DIMA.`);
  if (mayor && plazoMax < 12) avisos.push(`El mayor de los clientes ya no puede tomar un crédito de al menos 12 meses sin pasar los ${VEH.edadCredito} años.`);
  else if (mayor && V.plazoAjustado && plazo === plazoMax) avisos.push(`Plazo ajustado a ${plazoMax} meses: el crédito no puede pasar de los ${VEH.edadCredito} años del mayor.`);
  const deudasViv = V.deudas.some(d => grupoDe(d.cod) !== 'consumo');
  if (V.vivienda === 'si' && !deudasViv) avisos.push(`Indicaste que tiene crédito de vivienda: registra su cuota en la sección ${SEC(V).deudas} (códigos H0–H4) para aplicar el límite total con vivienda.`);
  if (V.vivienda !== 'si' && deudasViv) avisos.push(`Registraste deudas de vivienda en la sección ${SEC(V).deudas}: en Ingresos marca "¿Tiene crédito de vivienda? Sí" si quieres tomar aguinaldo, primas o bonos.`);
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
    <div class="card empty small">💡 ${esConsumo(V) ? 'Ingresa el monto del crédito' : 'Ingresa el monto de compra de vehículo'} (sección ${SEC(V).fin}) para calcular la cuota.</div>`;
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
        ${ces ? `<span>Cesantía <b class="num">${fmt(parte(x, ces), m)}</b></span>` : ''}
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

  <div class="card sim-guardar no-print">
    <label for="simTel"><b>Registrar número de teléfono</b></label>
    <div class="sim-guardar-row">
      <input id="simTel" type="tel" inputmode="tel" autocomplete="off" placeholder="7XXXXXXX" value="${esc(V.telefono || '')}">
      <button type="button" class="btn primary" data-act="vehSimGuardar">${V.simId && S().sims.some(x => x.id === V.simId) ? 'Actualizar' : 'Guardar'}</button>
    </div>
    <div class="small muted">Se guarda en el historial de simulaciones con el nombre del titular y el monto.</div>
  </div>

  <div class="card">
    <div class="veh-res-title">Resumen del financiamiento</div>
    <dl class="kv">
      ${consumo ? `<dt>Crédito</dt><dd>Consumo</dd>` : `<dt>Vehículo</dt><dd>${V.estado === 'usado' ? 'Usado' : 'Nuevo'} · ${V.motor === 'hibrido' ? 'eléctrico / híbrido' : 'a gasolina'}</dd>
      <dt>Valor del vehículo</dt><dd class="num">$us ${nf2.format(valorUsd)} × ${nf2.format(tcVeh)} = ${fmt(valor, m)}</dd>
      <dt>Compra de vehículo</dt><dd class="num">${fmt(compra, m)}${valor ? ` (${nf2.format(compra / valor * 100)}%)` : ''}</dd>`}
      ${primaMSC ? `<dt>Seguro vehicular BMSC (${nf2.format(pctMSC)}%)</dt><dd class="num">+ ${fmt(primaMSC, m)}</dd>` : ''}
      <dt><b>Monto a financiar</b></dt><dd class="num"><b>${fmt(monto, m)}</b></dd>
      <dt>Plazo</dt><dd>${plazo} meses (${plazo / 12} ${plazo === 12 ? 'año' : 'años'})</dd>
      ${cap && cap.mensual ? `<dt>Capacidad de pago</dt><dd>${(cap.sinNorma || cap.sinTarjetas) && cap.okCons ? '⚠️ Incompleto (faltan parámetros)' : cap.cumple ? '✅ Cumple' : '❌ No cumple'} · máx. Bs ${nf2.format(cap.maxNueva)}</dd>` : ''}
      <dt>Desgravamen</dt><dd>${esc(desgTxt)}</dd>
      <dt>DIMA</dt><dd>${dima ? esc(dimaTxt) : 'No'}</dd>
      ${consumo ? `<dt>Cesantía</dt><dd>${ces ? `${pct3(ces)}% anual sobre saldo` : 'No'}</dd>` : ''}
    </dl>
  </div>

  <div class="grid-2">
    <div class="card kpi"><div class="v num">${fmt(plan.totales.interes, m)}</div><div class="l">Total intereses</div></div>
    <div class="card kpi"><div class="v num">${fmt(plan.totales.desg, m)}</div><div class="l">Total seguros (${consumo ? 'desgravamen, DIMA y cesantía' : 'desgravamen + DIMA'})</div></div>
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
  <p class="small muted">${consumo ? 'Desgravamen, DIMA y cesantía' : 'Desgravamen y DIMA'}: tasa anual ÷ 12, aplicada cada mes sobre el saldo capital. Cuota variable estimada con la TRe vigente; puede cambiar cuando el BCB publique una nueva.</p>`;
  $('#vehPlan')?.addEventListener('toggle', e => { V.verPlan = e.target.open; guardarCalc(); });
  $('#simTel')?.addEventListener('input', e => { V.telefono = e.target.value; guardarCalc(); });
  vehCalc.ultimo = { V: { ...V }, monto, c1, cVar, plazo, fijo, tasaVar, desgTxt, dima, ces, consumo, primaMSC, aplica, valor, valorUsd, tcVeh, compra };
}

/* ---------------- Enlace con la app ---------------- */
ROUTES.calculadora.render = () => vehForm() + `<p class="small muted center no-print">Cálculos referenciales. Aplica siempre la normativa interna vigente del banco.</p>`;
ROUTES.calculadora.after = () => {
  const V = vehState();
  $('#pageTitle').textContent = esConsumo(V) ? 'Simulador de consumo' : 'Simulador vehicular';
  const form = $('#vehForm');
  if (!form) return;
  $('#simsHist')?.addEventListener('toggle', e => { UI.simsAbierto = e.target.open; });
  $('#vehForm')?.addEventListener('toggle', e => { if (e.target.id === 'tcLim') UI.tcLimAbierto = e.target.open; }, true);
  const rerender = ['producto', 'codeudor', 'plazo', 'tipoT', 'tipoC', 'vivienda', 'ingC', 'primas'];
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
  vehSimGuardar: () => {
    const u = vehCalc.ultimo; if (!u) return;
    const V = vehState();
    V.telefono = ($('#simTel')?.value || '').trim();
    if (!V.telefono) { toast('Ingresa el número de teléfono'); $('#simTel')?.focus(); return; }
    const existe = V.simId && S().sims.some(x => x.id === V.simId);
    const { simId, verPlan, plazoAjustado, ...datos } = V;
    const doc = Store.upsertSim({
      id: existe ? V.simId : undefined, nombre: V.nombre || '', ci: V.ci || '', ext: V.ext || '', telefono: V.telefono,
      monto: Math.round(u.monto * 100) / 100, cuota: Math.round(Math.max(u.c1.total, u.cVar ? u.cVar.total : 0) * 100) / 100,
      plazo: u.plazo, datos: JSON.parse(JSON.stringify(datos))
    });
    V.simId = doc.id; guardarCalc();
    toast(existe ? 'Simulación actualizada' : 'Simulación guardada en el historial');
    render();
  },
  vehSimAbrir: el => {
    const x = Store.sim(el.dataset.id); if (!x) return;
    calcState().veh = { ...JSON.parse(JSON.stringify(x.datos || {})), simId: x.id, telefono: x.telefono || '' };
    UI.simsAbierto = false; guardarCalc(); render();
    toast(`Simulación de ${x.nombre || 'sin nombre'} cargada`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  vehSimBorrar: el => {
    const x = Store.sim(el.dataset.id); if (!x) return;
    if (!confirm(`¿Eliminar la simulación de ${x.nombre || 'sin nombre'} (Bs ${nf2.format(num(x.monto))})?`)) return;
    Store.deleteSim(x.id);
    if (vehState().simId === x.id) { vehState().simId = ''; guardarCalc(); }
    UI.simsAbierto = true; render();
  },
  vehSimNueva: () => {
    if (!confirm('¿Resetear la simulación? Se borran los datos del formulario (lo guardado en el historial se mantiene).')) return;
    const producto = vehState().producto; // se mantiene el tipo de crédito elegido
    calcState().veh = null; vehState().producto = producto; UI.simsAbierto = false; guardarCalc(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  vehUsarMax: el => { const V = vehState(); V[esConsumo(V) ? 'montoCons' : 'compra'] = el.dataset.v.replace('.', ','); guardarCalc(); render(); },
  vehDeudaDel: el => { vehState().deudas.splice(+el.dataset.i, 1); guardarCalc(); render(); },
  vehCompartir: () => {
    const u = vehCalc.ultimo; if (!u) return;
    const m = 'BOB';
    const text = `*Propuesta de crédito ${u.consumo ? 'de consumo' : 'vehicular'}* (${fmtDate(today())})
${u.V.nombre ? 'Cliente: ' + u.V.nombre + '\n' : ''}${u.consumo ? '' : `Vehículo ${u.V.estado === 'usado' ? 'usado' : 'nuevo'} (${u.V.motor === 'hibrido' ? 'eléctrico/híbrido' : 'a gasolina'}) · valor $us ${nf2.format(u.valorUsd)} = ${fmt(u.valor, m)} (TC ${nf2.format(u.tcVeh)})\n`}Monto a financiar: ${fmt(u.monto, m)}
Plazo: ${u.plazo} meses
Cuota mensual: *${fmt(u.c1.total, m)}*${u.cVar ? ` (meses 1-${u.fijo}); desde el mes ${u.fijo + 1}: ${fmt(u.cVar.total, m)} aprox.` : ''}
${u.aplica ? `Incluye desgravamen${u.dima ? ' y DIMA' : ''}` : 'Sin desgravamen'}${u.ces ? '; seguro de cesantía' : ''}${u.primaMSC ? '; seguro automotor financiado' : ''}.
Sujeto a evaluación y aprobación.
${S().settings.ejecutivo || ''} - Banco Mercantil Santa Cruz`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  },
  vehTramite: () => {
    const u = vehCalc.ultimo; if (!u) return;
    caseForm({}, { tipo: u.consumo ? 'consumo' : 'vehicular', monto: Math.round(u.monto * 100) / 100, moneda: 'BOB', tasa: num(u.V.tasaFija), plazo: u.plazo, prospecto: u.V.nombre, destino: u.consumo ? 'Consumo' : `Vehículo ${u.V.estado === 'usado' ? 'usado' : 'nuevo'}` });
  }
});

if (current.name === 'calculadora') render();
