// Descarga el Tipo de Cambio Oficial (TCO) que publica el Banco Central de Bolivia
// cada día hábil a las 20:00 y genera data/tipo-cambio.json para la app.
//
// Uso:  node scripts/tipo-cambio.mjs                 (descarga del BCB)
//       node scripts/tipo-cambio.mjs --file a.csv    (procesa un CSV local)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const URL_CSV = 'https://www.bcb.gob.bo/bcb_tco_publico_descargar_csv.php';
const SALIDA = 'data/tipo-cambio.json';
const DIAS_HISTORIAL = 60;
const SPREAD_VENTA = 0.10; // la venta referencial es TCO + Bs 0,10 (Resolución BCB 88/2026)

const hoyBolivia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const restarDias = (iso, n) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);
const limpio = s => (s ?? '').replace(/"/g, '').trim();
const num = s => {
  s = limpio(s);
  if (!s || s === '-') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parsear(txt) {
  const filas = txt.replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(';'));
  const dias = new Map();
  let colTotal = -1, colBmsc = -1;
  for (const c of filas) {
    if (limpio(c[0]) === 'Fecha de corte') { // encabezado (puede repetirse)
      const h = c.map(limpio);
      colTotal = h.indexOf('TOTAL BANCOS');
      colBmsc = h.findIndex(x => /MERCANTIL/i.test(x));
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio(c[0])) || limpio(c[2]) !== 'TCO' || colTotal < 0) continue;
    const corte = limpio(c[0]);
    const [desde, hasta = desde] = limpio(c[1]).split(/\s+al\s+/);
    const tco = num(c[colTotal]);
    if (tco == null) continue;
    dias.set(corte, {
      corte, desde, hasta, tco,
      venta: Math.round((tco + SPREAD_VENTA) * 100) / 100,
      bmsc: colBmsc >= 0 ? num(c[colBmsc]) : null
    });
  }
  return [...dias.values()].sort((a, b) => a.corte.localeCompare(b.corte));
}

async function descargar() {
  const url = `${URL_CSV}?desde=${restarDias(hoyBolivia(), DIAS_HISTORIAL)}&hasta=${hoyBolivia()}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (mi-cartera-bmsc; GitHub Actions)', 'Accept-Language': 'es-BO,es;q=0.9' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      if (!txt.includes('Fecha de corte')) throw new Error('Respuesta sin el formato esperado');
      return txt;
    } catch (e) {
      console.error(`Intento ${i} falló: ${e.message}`);
      if (i === 3) throw e;
      await new Promise(ok => setTimeout(ok, 10000 * i));
    }
  }
}

// Unidad de Fomento de Vivienda (UFV) del día, publicada por el BCB
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
async function descargarUFV() {
  const r = await fetch('https://www.bcb.gob.bo/librerias/indicadores/ufv/ultimo.php', { headers: { 'User-Agent': 'Mozilla/5.0 (mi-cartera-bmsc; GitHub Actions)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = (await r.text()).replace(/<[^>]+>/g, ' | ').replace(/(\s*\|\s*)+/g, ' | ').replace(/\s+/g, ' ');
  const f = t.match(/FECHA: \| (\d{1,2}) de (\w+) (\d{4})/i);
  const v = t.match(/Bs \| ([\d.,]+) por unidad/i);
  if (!v) throw new Error('No se encontró el valor de la UFV');
  const valor = Number(v[1].includes(',') ? v[1].replace(/\./g, '').replace(',', '.') : v[1]);
  const mes = f ? MESES.indexOf(f[2].toLowerCase()) + 1 : 0;
  return { valor, fecha: f && mes ? `${f[3]}-${String(mes).padStart(2, '0')}-${f[1].padStart(2, '0')}` : hoyBolivia() };
}

const iFile = process.argv.indexOf('--file');
const txt = iFile > 0 ? await readFile(process.argv[iFile + 1], 'utf8') : await descargar();
const dias = parsear(txt).slice(-DIAS_HISTORIAL);
if (!dias.length) throw new Error('No se encontró ningún TCO en el CSV del BCB');

// Solo reescribir si cambió algún dato (evita commits vacíos)
let previo = null;
try { previo = JSON.parse(await readFile(SALIDA, 'utf8')); } catch { /* primera vez */ }
let ufv = previo?.ufv || null;
if (iFile < 0) {
  try { ufv = await descargarUFV(); console.log(`UFV ${ufv.valor} (${ufv.fecha})`); }
  catch (e) { console.error('UFV no disponible:', e.message); }
}
if (previo && JSON.stringify(previo.dias) === JSON.stringify(dias) && JSON.stringify(previo.ufv) === JSON.stringify(ufv)) {
  console.log('Sin datos nuevos. Último corte:', dias.at(-1).corte);
  process.exit(0);
}
await mkdir('data', { recursive: true });
await writeFile(SALIDA, JSON.stringify({
  fuente: 'Banco Central de Bolivia - Tipo de Cambio Oficial (TCO)',
  url: URL_CSV,
  actualizado: new Date().toISOString(),
  ufv,
  dias
}, null, 1) + '\n');
const u = dias.at(-1);
console.log(`TCO ${u.tco} (venta ${u.venta}) · corte ${u.corte} · vigente ${u.desde} al ${u.hasta}`);
