/* Sincronización con Firebase Firestore.
   - Colecciones: clientes (con sus créditos), tramites, agenda e historial.
   - El celular guarda una copia local (funciona sin internet) y Firestore es la fuente principal:
     lo que se cambia en un dispositivo aparece en los demás en segundos.
   - Cada cambio queda registrado en "historial" con una copia del dato en ese momento.
   La configuración del proyecto va en js/firebase-config.js. */
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const COLS = { clients: 'clientes', cases: 'tramites', agenda: 'agenda' };
const ETIQUETA = { clients: 'Cliente', cases: 'Trámite', agenda: 'Actividad' };

let fs = null, db = null, authMod = null, auth = null, listo = false;
let desuscribir = [];
const pendientes = [];
const Nube = {
  estado: 'sin-configurar', // sin-configurar | conectando | sin-sesion | conectado | sin-conexion | error
  error: '',
  proyecto: '',
  usuario: '',
  historial: async () => [],
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

function resumen(col, d) {
  if (!d) return '';
  if (col === 'clients') {
    const n = (d.credits || []).length;
    return `${d.nombre || ''} · CI ${d.ci || ''} · ${n} crédito${n === 1 ? '' : 's'}`;
  }
  if (col === 'cases') {
    const c = d.clientId && Store.client(d.clientId);
    return `${c ? c.nombre : d.prospecto || 'Prospecto'} · ${d.tipo || ''} · ${d.monto || 0} ${d.moneda || ''} · etapa ${d.etapa || ''}`;
  }
  return `${d.titulo || ''} · ${d.fecha || ''}`;
}

async function registrarHistorial(col, accion, d) {
  await fs.addDoc(fs.collection(db, 'historial'), {
    fecha: fs.serverTimestamp(),
    fechaLocal: new Date().toISOString(),
    coleccion: COLS[col] || col,
    tipo: ETIQUETA[col] || col,
    accion,
    docId: d?.id || '',
    resumen: resumen(col, d),
    ejecutivo: Store.get().settings.ejecutivo || '',
    usuario: Nube.usuario,
    dispositivo: idDispositivo,
    datos: accion === 'eliminar' || !d ? null : limpio(d)
  });
}

async function escribir(ev) {
  if (ev.op === 'bulk') return subirTodo({ reemplazar: true, accion: ev.accion });
  const ref = fs.doc(db, COLS[ev.col], ev.doc.id);
  if (ev.op === 'delete') await fs.deleteDoc(ref);
  else await fs.setDoc(ref, limpio(ev.doc));
  await registrarHistorial(ev.col, ev.accion || ev.op, ev.doc);
}

/* Sube los datos locales. reemplazar=true además borra de la nube lo que ya no existe localmente */
async function subirTodo({ reemplazar = false, accion = 'sincronizar' } = {}) {
  const st = Store.get();
  let ops = [];
  for (const [key, nombre] of Object.entries(COLS)) {
    const locales = new Set(st[key].map(d => d.id));
    st[key].forEach(d => ops.push(b => b.set(fs.doc(db, nombre, d.id), limpio(d))));
    if (reemplazar) {
      const snap = await fs.getDocs(fs.collection(db, nombre));
      snap.forEach(d => { if (!locales.has(d.id)) ops.push(b => b.delete(d.ref)); });
    }
  }
  // Firestore permite hasta 500 operaciones por lote
  while (ops.length) {
    const b = fs.writeBatch(db);
    ops.splice(0, 450).forEach(op => op(b));
    await b.commit();
  }
  await fs.addDoc(fs.collection(db, 'historial'), {
    fecha: fs.serverTimestamp(), fechaLocal: new Date().toISOString(), coleccion: '*', tipo: 'Datos',
    accion, docId: '', resumen: `${st.clients.length} clientes · ${st.cases.length} trámites · ${st.agenda.length} actividades`,
    ejecutivo: st.settings.ejecutivo || '', dispositivo: idDispositivo, datos: null
  });
}

/* Primera conexión de este dispositivo: sube lo que solo existe localmente */
async function fusionInicial() {
  const st = Store.get();
  if (st.settings.nubeFusionada === Nube.proyecto) return;
  const ops = [];
  for (const [key, nombre] of Object.entries(COLS)) {
    const snap = await fs.getDocs(fs.collection(db, nombre));
    const enNube = new Set(snap.docs.map(d => d.id));
    st[key].filter(d => !enNube.has(d.id)).forEach(d => ops.push(b => b.set(fs.doc(db, nombre, d.id), limpio(d))));
  }
  while (ops.length) {
    const b = fs.writeBatch(db);
    ops.splice(0, 450).forEach(op => op(b));
    await b.commit();
  }
  st.settings.nubeFusionada = Nube.proyecto;
  Store.save();
}

/* Redibujar sin interrumpir al usuario si está escribiendo o con un formulario abierto */
let renderPendiente = null;
function redibujar() {
  clearTimeout(renderPendiente);
  renderPendiente = setTimeout(() => {
    const ocupado = !document.getElementById('sheet').classList.contains('hidden') ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (ocupado) return redibujar();
    if (typeof window.render === 'function') window.render();
  }, 300);
}

function escuchar() {
  desuscribir.forEach(f => f());
  desuscribir = [];
  for (const [key, nombre] of Object.entries(COLS)) {
    desuscribir.push(fs.onSnapshot(fs.collection(db, nombre), { includeMetadataChanges: true }, snap => {
      // Solo datos confirmados por el servidor (evita borrar la copia local con una caché vacía)
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
        if (snap.metadata.fromCache && Nube.estado === 'conectado') setEstado('sin-conexion');
        return;
      }
      if (Nube.estado !== 'conectado') setEstado('conectado');
      const docs = snap.docs.map(d => d.data()).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
      if (Store.applyRemote(key, docs)) redibujar();
    }, err => setEstado('error', err.code === 'permission-denied' ? 'Sin permiso: revisa las reglas de Firestore' : err.message)));
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
  } catch (e) {
    err.textContent = ERRORES[e.code] || e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
});

async function alIniciarSesion(user) {
  Nube.usuario = (user.email || '').split('@')[0];
  mostrarLogin(false);
  setEstado('conectando');
  try {
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
    const col = fs.collection(db, 'historial');
    const q = docId
      ? fs.query(col, fs.where('docId', '==', docId), fs.limit(max))
      : fs.query(col, fs.orderBy('fecha', 'desc'), fs.limit(max));
    const snap = await fs.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fechaLocal || '').localeCompare(a.fechaLocal || ''));
  };
  Nube.sincronizarTodo = () => subirTodo({ reemplazar: false, accion: 'sincronizar' });
  Nube.cerrarSesion = async () => {
    await authMod.signOut(auth);
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
  escribir(ev).catch(e => { console.error('Firestore', e); setEstado('error', e.message); });
});

window.addEventListener('online', () => { if (Nube.estado === 'sin-conexion' && listo) setEstado('conectando'); });
window.addEventListener('offline', () => { if (listo) setEstado('sin-conexion'); });

iniciar();
