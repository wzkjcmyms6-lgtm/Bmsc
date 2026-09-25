/* Almacenamiento local (en el propio celular) con localStorage. */
'use strict';

const STORE_KEY = 'mc_bmsc_v1';

const Store = (() => {
  const empty = () => ({
    version: 1,
    settings: {
      ejecutivo: '',
      agencia: '',
      tc: '',            // tipo de cambio manual (Bs por 1 USD)
      tcModo: 'auto',    // 'auto' = TCO del BCB, 'manual' = valor fijo
      tcTipo: 'tco',     // 'tco' (oficial), 'venta' (TCO + 0,10) o 'bmsc' (TCO del banco)
      tcData: null,      // última descarga del TCO { dias: [...], obtenido }
      metaMensual: 0,    // meta de colocación mensual en Bs
      metaClientes: 0,   // meta de clientes nuevos al mes
      endeudamiento: 40, // % máximo de cuota / ingreso para la calculadora
      pinHash: null,
      theme: 'auto'
    },
    clients: [],
    cases: [],
    agenda: []
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return empty();
      const data = JSON.parse(raw);
      const base = empty();
      return {
        ...base, ...data,
        settings: { ...base.settings, ...(data.settings || {}) },
        clients: data.clients || [],
        cases: data.cases || [],
        agenda: data.agenda || []
      };
    } catch (e) {
      console.error('No se pudo leer el almacenamiento', e);
      return empty();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar. Revisa el espacio de almacenamiento del navegador.');
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* Aviso de cambios para la sincronización con la nube (js/nube.js).
     col: 'clients' | 'cases' | 'agenda'; op: 'set' | 'delete' | 'bulk' */
  const listeners = [];
  const emit = (col, op, doc, accion) => listeners.forEach(fn => { try { fn({ col, op, doc, accion }); } catch (e) { console.error(e); } });

  return {
    get: () => state,
    save,
    uid,
    subscribe: fn => listeners.push(fn),
    /* Datos que llegan desde la nube: se guardan sin volver a enviarlos */
    applyRemote(col, docs) {
      const antes = JSON.stringify(state[col]);
      const ahora = JSON.stringify(docs);
      if (antes === ahora) return false;
      state[col] = docs;
      save();
      return true;
    },
    replace(data) {
      const base = empty();
      state = {
        ...base, ...data,
        settings: { ...base.settings, ...(data.settings || {}), pinHash: state.settings.pinHash },
        clients: data.clients || [], cases: data.cases || [], agenda: data.agenda || []
      };
      save();
      emit(null, 'bulk', null, 'restaurar');
    },
    reset() { const pin = state.settings.pinHash; state = empty(); state.settings.pinHash = pin; save(); emit(null, 'bulk', null, 'borrar'); },

    /* ---- Clientes ---- */
    client: id => state.clients.find(c => c.id === id),
    upsertClient(c) {
      let doc, accion = 'editar';
      if (c.id) {
        const i = state.clients.findIndex(x => x.id === c.id);
        doc = state.clients[i] = { ...state.clients[i], ...c };
      } else {
        c.id = uid(); c.creado = new Date().toISOString(); c.credits = c.credits || [];
        state.clients.push(c); doc = c; accion = 'crear';
      }
      doc.actualizado = new Date().toISOString();
      save(); emit('clients', 'set', doc, accion);
      return doc;
    },
    deleteClient(id) {
      const doc = this.client(id);
      state.clients = state.clients.filter(c => c.id !== id);
      save();
      emit('clients', 'delete', doc, 'eliminar');
      state.cases.forEach(k => { if (k.clientId === id) { k.clientId = null; k.prospecto = k.prospecto || doc?.nombre || ''; emit('cases', 'set', k, 'desvincular'); } });
      state.agenda.forEach(a => { if (a.clientId === id) { a.clientId = null; emit('agenda', 'set', a, 'desvincular'); } });
      save();
    },
    upsertCredit(clientId, cr) {
      const c = this.client(clientId);
      if (!c) return;
      if (cr.id) {
        const i = c.credits.findIndex(x => x.id === cr.id);
        c.credits[i] = { ...c.credits[i], ...cr };
      } else {
        cr.id = uid(); c.credits.push(cr);
      }
      c.actualizado = new Date().toISOString();
      save(); emit('clients', 'set', c, 'credito');
      return cr;
    },
    deleteCredit(clientId, creditId) {
      const c = this.client(clientId);
      c.credits = c.credits.filter(x => x.id !== creditId);
      c.actualizado = new Date().toISOString();
      save(); emit('clients', 'set', c, 'eliminar-credito');
    },

    /* ---- Casos (Home Base) ---- */
    caseById: id => state.cases.find(c => c.id === id),
    upsertCase(k) {
      let doc, accion = 'editar';
      if (k.id) {
        const i = state.cases.findIndex(x => x.id === k.id);
        doc = state.cases[i] = { ...state.cases[i], ...k };
      } else {
        k.id = uid(); k.creado = new Date().toISOString();
        k.requisitos = k.requisitos || []; k.tareas = k.tareas || []; k.bitacora = k.bitacora || [];
        state.cases.push(k); doc = k; accion = 'crear';
      }
      save(); emit('cases', 'set', doc, accion);
      return doc;
    },
    deleteCase(id) {
      const doc = this.caseById(id);
      state.cases = state.cases.filter(c => c.id !== id);
      save(); emit('cases', 'delete', doc, 'eliminar');
    },

    /* ---- Agenda ---- */
    upsertEvent(e) {
      let doc, accion = 'editar';
      if (e.id) {
        const i = state.agenda.findIndex(x => x.id === e.id);
        doc = state.agenda[i] = { ...state.agenda[i], ...e };
      } else { e.id = uid(); e.done = false; state.agenda.push(e); doc = e; accion = 'crear'; }
      save(); emit('agenda', 'set', doc, accion);
      return doc;
    },
    deleteEvent(id) {
      const doc = state.agenda.find(e => e.id === id);
      state.agenda = state.agenda.filter(e => e.id !== id);
      save(); emit('agenda', 'delete', doc, 'eliminar');
    }
  };
})();
