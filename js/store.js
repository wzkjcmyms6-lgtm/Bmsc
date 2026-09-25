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

  return {
    get: () => state,
    save,
    uid,
    replace(data) {
      const base = empty();
      state = {
        ...base, ...data,
        settings: { ...base.settings, ...(data.settings || {}), pinHash: state.settings.pinHash },
        clients: data.clients || [], cases: data.cases || [], agenda: data.agenda || []
      };
      save();
    },
    reset() { state = empty(); save(); },

    /* ---- Clientes ---- */
    client: id => state.clients.find(c => c.id === id),
    upsertClient(c) {
      if (c.id) {
        const i = state.clients.findIndex(x => x.id === c.id);
        state.clients[i] = { ...state.clients[i], ...c };
      } else {
        c.id = uid(); c.creado = new Date().toISOString(); c.credits = c.credits || [];
        state.clients.push(c);
      }
      save(); return c;
    },
    deleteClient(id) {
      state.clients = state.clients.filter(c => c.id !== id);
      state.cases.forEach(k => { if (k.clientId === id) k.clientId = null; });
      state.agenda.forEach(a => { if (a.clientId === id) a.clientId = null; });
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
      save(); return cr;
    },
    deleteCredit(clientId, creditId) {
      const c = this.client(clientId);
      c.credits = c.credits.filter(x => x.id !== creditId);
      save();
    },

    /* ---- Casos (Home Base) ---- */
    caseById: id => state.cases.find(c => c.id === id),
    upsertCase(k) {
      if (k.id) {
        const i = state.cases.findIndex(x => x.id === k.id);
        state.cases[i] = { ...state.cases[i], ...k };
      } else {
        k.id = uid(); k.creado = new Date().toISOString();
        k.requisitos = k.requisitos || []; k.tareas = k.tareas || []; k.bitacora = k.bitacora || [];
        state.cases.push(k);
      }
      save(); return k;
    },
    deleteCase(id) { state.cases = state.cases.filter(c => c.id !== id); save(); },

    /* ---- Agenda ---- */
    upsertEvent(e) {
      if (e.id) {
        const i = state.agenda.findIndex(x => x.id === e.id);
        state.agenda[i] = { ...state.agenda[i], ...e };
      } else { e.id = uid(); e.done = false; state.agenda.push(e); }
      save(); return e;
    },
    deleteEvent(id) { state.agenda = state.agenda.filter(e => e.id !== id); save(); }
  };
})();
