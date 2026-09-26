/* Sincronización con Firebase Firestore.
   - Colecciones: clientes (con sus créditos), tramites, agenda e historial.
   - El celular guarda una copia local (funciona sin internet) y Firestore es la fuente principal:
     lo que se cambia en un dispositivo aparece en los demás en segundos.
   - Cada cambio queda registrado en "historial" con una copia del dato en ese momento.
   La configuración del proyecto va en js/firebase-config.js. */
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const COLS = { clients: 'clientes', cases: 'tramites', agenda: 'agenda', sims: 'simulaciones' };
const ETIQUETA = { clients: 'Cliente', cases: 'Trámite', agenda: 'Actividad', sims: 'Simulación' };
// "simulaciones" es nueva: si las reglas de Firestore aún no la permiten, se guarda solo en el
// dispositivo sin afectar la sincronización de clientes, trámites y agenda.
const OPCIONAL = 'simulaciones';
let sinPermisoSims = false;
const esPermiso = e => e && e.code === 'permission-denied';
const colsActivas = () => Object.entries(COLS).filter(([, n]) => !(n === OPCIONAL && sinPermisoSims));

let fs = null, db = null, authMod = null, auth = null, listo = false;
let uidActual = null; // cada ejecutivo tiene su propia cartera: usuarios/{uid}/...
const col = nombre => fs.collection(db, 'usuarios', uidActual, nombre);
const ref = (nombre, id) => fs.doc(db, 'usuarios', uidActual, nombre, id);
// Cartera compartida anterior (colecciones en la raíz): se mueve a la cartera de este usuario
const USUARIO_LEGADO = '17751@mi-cartera-bmsc.app';
let desuscribir = [];
const pendientes = [];
const Nube = {
  estado: 'sin-configurar', // sin-configurar | conectando | sin-sesion | conectado | sin-conexion | error
  error: '',
  proyecto: '',
  usuario: '',
  historial: async () => [],
  normasEstado: '',         // '' | 'ok' | 'sin-permiso' | 'vacio'
  perfilEstado: '',         // '' | 'ok' | 'sin-permiso'
  guardarPerfil: async () => {},
  guardarNormas: async () => { throw new Error('Inicia sesión con internet para guardar'); },
  sincronizarTodo: async () => {},
  cerrarSesion: async () => {}
};
window.Nube = Nube;

function setEstado(estado, error = '') {
  Nube.estado = estado;
  Nube.error = error;
  window.dispatchEvent(new CustomEvent('nube-estado'));
}

// Firestore no acepta undefined: se limpia el objeto
const limpio = o => JSON.parse(JSON.stringify(o ?? {}));

const idDispositivo = (() => {
  try {
    let id = localStorage.getItem('mc_dispositivo');
    if (!id) { id = Store.uid(); localStorage.setItem('mc_dispositivo', id); }
    return id;
  } catch { return 'desconocido'; }
})();

function resumen(clave, d) {
  if (!d) return '';
  if (clave === 'clients') {
    const n = (d.credits || []).length;
    return `${d.nombre || ''} · CI ${d.ci || ''} · ${n} crédito${n === 1 ? '' : 's'}`;
  }
  if (clave === 'cases') {
    const c = d.clientId && Store.client(d.clientId);
    return `${c ? c.nombre : d.prospecto || 'Prospecto'} · ${d.tipo || ''} · ${d.monto || 0} ${d.moneda || ''} · etapa ${d.etapa || ''}`;
  }
  if (clave === 'sims') return `${d.nombre || 'Sin nombre'} · Bs ${d.monto || 0} · ${d.telefono || ''}`;
  return `${d.titulo || ''} · ${d.fecha || ''}`;
}

async function registrarHistorial(clave, accion, d) {
  await fs.addDoc(col('historial'), {
    fecha: fs.serverTimestamp(),
    fechaLocal: new Date().toISOString(),
    coleccion: COLS[clave] || clave,
    tipo: ETIQUETA[clave] || clave,
    accion,
    docId: d?.id || '',
    resumen: resumen(clave, d),
    ejecutivo: Store.get().settings.ejecutivo || '',
    usuario: Nube.usuario,
    dispositivo: idDispositivo,
    datos: accion === 'eliminar' || !d ? null : limpio(d)
  });
}

async function escribir(ev) {
  if (ev.op === 'bulk') return subirTodo({ reemplazar: true, accion: ev.accion });
  if (ev.col === 'sims' && sinPermisoSims) return;
  const r = ref(COLS[ev.col], ev.doc.id);
  if (ev.op === 'delete') await fs.deleteDoc(r);
  else await fs.setDoc(r, limpio(ev.doc));
  await registrarHistorial(ev.col, ev.accion || ev.op, ev.doc);
}

/* Sube los datos locales. reemplazar=true además borra de la nube lo que ya no existe localmente */
async function subirTodo({ reemplazar = false, accion = 'sincronizar' } = {}) {
  const st = Store.get();
  let ops = [];
  for (const [key, nombre] of colsActivas()) {
    const locales = new Set(st[key].map(d => d.id));
    if (reemplazar) {
      let snap;
      try { snap = await fs.getDocs(col(nombre)); }
      catch (e) { if (nombre === OPCIONAL && esPermiso(e)) { sinPermisoSims = true; continue; } throw e; }
      snap.forEach(d => { if (!locales.has(d.id)) ops.push(b => b.delete(d.ref)); });
    }
    st[key].forEach(d => ops.push(b => b.set(ref(nombre, d.id), limpio(d))));
  }
  // Firestore permite hasta 500 operaciones por lote
  while (ops.length) {
    const b = fs.writeBatch(db);
    ops.splice(0, 450).forEach(op => op(b));
    await b.commit();
  }
  await fs.addDoc(col('historial'), {
    fecha: fs.serverTimestamp(), fechaLocal: new Date().toISOString(), coleccion: '*', tipo: 'Datos',
    accion, docId: '', resumen: `${st.clients.length} clientes · ${st.cases.length} trámites · ${st.agenda.length} actividades`,
    ejecutivo: st.settings.ejecutivo || '', dispositivo: idDispositivo, datos: null
  });
}

/* Primera conexión de este dispositivo: sube lo que solo existe localmente */
async function fusionInicial() {
  const st = Store.get();
  if (st.settings.nubeFusionada === uidActual) return;
  const ops = [];
  for (const [key, nombre] of Object.entries(COLS)) {
    let snap;
    try { snap = await fs.getDocs(col(nombre)); }
    catch (e) { if (nombre === OPCIONAL && esPermiso(e)) { sinPermisoSims = true; continue; } throw e; }
    const enNube = new Set(snap.docs.map(d => d.id));
    st[key].filter(d => !enNube.has(d.id)).forEach(d => ops.push(b => b.set(ref(nombre, d.id), limpio(d))));
  }
  while (ops.length) {
    const b = fs.writeBatch(db);
    ops.splice(0, 450).forEach(op => op(b));
    await b.commit();
  }
  st.settings.nubeFusionada = uidActual;
  Store.save();
}

/* Redibujar sin interrumpir al usuario si está escribiendo o con un formulario abierto */
let renderPendiente = null;
function redibujar() {
  clearTimeout(renderPendiente);
  renderPendiente = setTimeout(() => {
    const act = document.activeElement;
    // Un campo con el foco dentro de algo oculto (p. ej. el inicio de sesión ya cerrado) no cuenta
    const ocupado = !document.getElementById('sheet').classList.contains('hidden') ||
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(act?.tagName) && !act.closest('.hidden'));
    if (ocupado) return redibujar();
    if (typeof window.render === 'function') window.render();
  }, 300);
}

/* Normas internas del banco (config/normas): no están en el código público; se leen al iniciar sesión
   y quedan en el dispositivo mientras la sesión esté abierta (se borran al cerrar sesión). */
function escucharNormas() {
  desuscribir.push(fs.onSnapshot(fs.doc(db, 'config', 'normas'), snap => {
    if (snap.metadata.fromCache && !snap.exists()) return;
    const st = Store.get();
    Nube.normasEstado = snap.exists() ? 'ok' : 'vacio';
    const datos = snap.exists() ? snap.data() : null;
    if (JSON.stringify(st.settings.normas || null) === JSON.stringify(datos)) return;
    st.settings.normas = datos;
    Store.save();
    redibujar();
  }, err => { Nube.normasEstado = esPermiso(err) ? 'sin-permiso' : 'error'; console.warn('Normas', err.code || err.message); }));
}

/* Perfil del ejecutivo (nombre, agencia, teléfono y metas): se guarda en su cuenta
   (usuarios/{uid}/perfil/datos) y aparece en cualquier dispositivo donde inicie sesión. */
const CAMPOS_PERFIL = ['ejecutivo', 'agencia', 'telefonoEjecutivo', 'metaMensual', 'metaClientes', 'foto'];
const perfilLocal = () => Object.fromEntries(CAMPOS_PERFIL.map(k => [k, Store.get().settings[k] ?? '']));
function escucharPerfil() {
  desuscribir.push(fs.onSnapshot(ref('perfil', 'datos'), snap => {
    if (snap.metadata.fromCache && !snap.exists()) return;
    Nube.perfilEstado = 'ok';
    if (!snap.exists()) {
      // Primera vez: se sube lo que ya estaba en este dispositivo
      const p = perfilLocal();
      if (CAMPOS_PERFIL.some(k => p[k])) Nube.guardarPerfil().catch(() => {});
      return;
    }
    const d = snap.data(), st = Store.get().settings;
    if (CAMPOS_PERFIL.every(k => (st[k] ?? '') === (d[k] ?? ''))) return;
    CAMPOS_PERFIL.forEach(k => { if (d[k] !== undefined) st[k] = d[k]; });
    Store.save();
    redibujar();
  }, err => { Nube.perfilEstado = esPermiso(err) ? 'sin-permiso' : 'error'; console.warn('Perfil', err.code || err.message); }));
}

function escuchar() {
  desuscribir.forEach(f => f());
  desuscribir = [];
  escucharNormas();
  escucharPerfil();
  for (const [key, nombre] of colsActivas()) {
    desuscribir.push(fs.onSnapshot(col(nombre), { includeMetadataChanges: true }, snap => {
      // Solo datos confirmados por el servidor (evita borrar la copia local con una caché vacía)
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
        if (snap.metadata.fromCache && Nube.estado === 'conectado') setEstado('sin-conexion');
        return;
      }
      if (Nube.estado !== 'conectado') setEstado('conectado');
      const docs = snap.docs.map(d => d.data()).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
      // Simulaciones guardadas solo en el dispositivo (p. ej. antes de actualizar las reglas): se suben, no se pierden
      if (key === 'sims') {
        const enNube = new Set(docs.map(d => d.id));
        const soloLocal = Store.get().sims.filter(d => !enNube.has(d.id));
        if (soloLocal.length) { soloLocal.forEach(d => fs.setDoc(ref(nombre, d.id), limpio(d)).catch(() => {})); return; }
      }
      if (Store.applyRemote(key, docs)) redibujar();
    }, err => (nombre === OPCIONAL && esPermiso(err)) ? (sinPermisoSims = true) : setEstado('error', err.code === 'permission-denied' ? 'Sin permiso: revisa las reglas de Firestore' : err.message)));
  }
}

/* ---------- Inicio de sesión ---------- */
const $id = id => document.getElementById(id);
const correoDe = usuario => usuario.includes('@') ? usuario.trim() : `${usuario.trim()}@${window.LOGIN_DOMINIO || 'mi-cartera.app'}`;
const ERRORES = {
  'auth/invalid-credential': 'Usuario o clave incorrectos',
  'auth/invalid-login-credentials': 'Usuario o clave incorrectos',
  'auth/wrong-password': 'Usuario o clave incorrectos',
  'auth/user-not-found': 'Usuario o clave incorrectos',
  'auth/invalid-email': 'Usuario no válido',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet',
  'auth/unauthorized-domain': 'Este sitio no está autorizado en Firebase (Dominios autorizados)'
};

function mostrarLogin(visible) {
  $id('login').classList.toggle('hidden', !visible);
  if (visible) setTimeout(() => $id('loginUser').focus(), 100);
}

$id('loginForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $id('loginErr'), btn = $id('loginBtn');
  err.textContent = '';
  if (!auth) { err.textContent = 'Conectando… intenta en unos segundos'; return; }
  btn.disabled = true; btn.textContent = 'Ingresando…';
  try {
    await authMod.signInWithEmailAndPassword(auth, correoDe($id('loginUser').value), $id('loginPass').value);
    $id('loginPass').value = '';
    document.activeElement?.blur();
  } catch (e) {
    err.textContent = ERRORES[e.code] || e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
});

/* Mueve la cartera compartida anterior (raíz) a usuarios/{uid} del usuario original */
async function migrarLegado(user) {
  if ((user.email || '').toLowerCase() !== USUARIO_LEGADO) return;
  const ops = [], borrar = [];
  for (const nombre of [...Object.values(COLS), 'historial']) {
    let snap;
    try { snap = await fs.getDocs(fs.collection(db, nombre)); } catch { return; } // sin permiso: ya migrado
    snap.forEach(d => { ops.push(b => b.set(ref(nombre, d.id), d.data())); borrar.push(d.ref); });
  }
  if (!ops.length) return;
  while (ops.length) { const b = fs.writeBatch(db); ops.splice(0, 450).forEach(op => op(b)); await b.commit(); }
  while (borrar.length) { const b = fs.writeBatch(db); borrar.splice(0, 450).forEach(r => b.delete(r)); await b.commit(); }
  console.log('Cartera anterior movida a la cartera del usuario');
}

async function alIniciarSesion(user) {
  Nube.usuario = (user.email || '').split('@')[0];
  uidActual = user.uid;
  // La copia local pertenece a quien inició sesión antes en este dispositivo: no mezclar carteras
  const st = Store.get();
  const dueño = st.settings.nubeUid;
  const tieneDatos = st.clients.length || st.cases.length || st.agenda.length;
  if (tieneDatos && ((dueño && dueño !== user.uid) || (!dueño && (user.email || '').toLowerCase() !== USUARIO_LEGADO))) {
    Store.clearLocal();
  }
  Store.get().settings.nubeUid = user.uid;
  Store.save();
  mostrarLogin(false);
  setEstado('conectando');
  try {
    await migrarLegado(user);
    await fusionInicial();
    escuchar();
    listo = true;
    while (pendientes.length) await escribir(pendientes.shift());
  } catch (e) {
    console.error('Firestore', e);
    setEstado(navigator.onLine ? 'error' : 'sin-conexion', e.code === 'permission-denied' ? 'Sin permiso: revisa las reglas de Firestore' : e.message);
  }
  if (typeof window.render === 'function') window.render();
}

function alCerrarSesion() {
  listo = false;
  uidActual = null;
  desuscribir.forEach(f => f());
  desuscribir = [];
  Nube.usuario = '';
  setEstado('sin-sesion');
  mostrarLogin(true);
}

async function iniciar() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.projectId || !cfg.apiKey) return setEstado('sin-configurar');
  Nube.proyecto = cfg.projectId;
  setEstado('conectando');
  try {
    const [appMod, fsMod, aMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-firestore.js`), import(`${SDK}/firebase-auth.js`)
    ]);
    fs = fsMod; authMod = aMod;
    const app = appMod.initializeApp(cfg);
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch {
      db = fs.getFirestore(app);
    }
    auth = authMod.getAuth(app); // la sesión queda guardada en el dispositivo
  } catch (e) {
    // Sin internet la primera vez: se trabaja con la copia local
    console.error('Firebase', e);
    return setEstado(navigator.onLine ? 'error' : 'sin-conexion', e.message);
  }

  authMod.onAuthStateChanged(auth, user => (user ? alIniciarSesion(user) : alCerrarSesion()));

  Nube.historial = async ({ docId = null, max = 100 } = {}) => {
    const h = col('historial');
    const q = docId
      ? fs.query(h, fs.where('docId', '==', docId), fs.limit(max))
      : fs.query(h, fs.orderBy('fecha', 'desc'), fs.limit(max));
    const snap = await fs.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fechaLocal || '').localeCompare(a.fechaLocal || ''));
  };
  Nube.guardarNormas = async datos => {
    if (!uidActual) throw new Error('Inicia sesión para guardar');
    await fs.setDoc(fs.doc(db, 'config', 'normas'), limpio(datos));
  };
  Nube.guardarPerfil = async () => {
    if (!uidActual) return;
    const p = perfilLocal(), ahora = new Date().toISOString();
    await fs.setDoc(ref('perfil', 'datos'), limpio({ ...p, actualizado: ahora }));
    // Directorio de ejecutivos: solo datos de contacto (lo ven los usuarios con sesión)
    await fs.setDoc(fs.doc(db, 'directorio', uidActual), limpio({
      nombre: p.ejecutivo, agencia: p.agencia, telefono: p.telefonoEjecutivo, foto: p.foto, usuario: Nube.usuario, actualizado: ahora
    })).catch(e => console.warn('Directorio', e.code || e.message));
  };
  Nube.directorio = async () => {
    if (!uidActual) throw new Error('Inicia sesión');
    const snap = await fs.getDocs(fs.collection(db, 'directorio'));
    return snap.docs.map(d => ({ ...d.data(), esYo: d.id === uidActual }))
      .filter(x => x.nombre || x.telefono || x.foto)
      .sort((a, b) => (b.esYo - a.esYo) || String(a.nombre || '').localeCompare(String(b.nombre || '')));
  };
  Nube.sincronizarTodo = () => subirTodo({ reemplazar: false, accion: 'sincronizar' });
  Nube.cerrarSesion = async () => {
    // Si Firebase no responde (sin internet), igual se cierra en el dispositivo
    await Promise.race([authMod.signOut(auth), new Promise(ok => setTimeout(ok, 4000))]).catch(e => console.warn('signOut', e));
    alCerrarSesion();
    // No dejar datos de clientes en el dispositivo después de salir
    Store.clearLocal();
    const st = Store.get(); st.settings.nubeFusionada = null; Store.save();
    location.hash = '#/';
    if (typeof window.render === 'function') window.render();
  };
}

Store.subscribe(ev => {
  if (Nube.estado === 'sin-configurar') return;
  if (!listo) { pendientes.push(ev); return; }
  escribir(ev).catch(e => {
    if (ev.col === 'sims' && esPermiso(e)) { sinPermisoSims = true; return; }
    console.error('Firestore', e); setEstado('error', e.message);
  });
});

window.addEventListener('online', () => { if (Nube.estado === 'sin-conexion' && listo) setEstado('conectando'); });
window.addEventListener('offline', () => { if (listo) setEstado('sin-conexion'); });

iniciar();
