/* ════════════════════════════════════════════════════════
   FIREBASE INIT (compat SDK — sin import/export)
   ════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "AIzaSyD6uhwhiF-_j5oyu4NBZug3zU7SHwaY4_M",
  authDomain:        "gastos-mtto.firebaseapp.com",
  projectId:         "gastos-mtto",
  storageBucket:     "gastos-mtto.firebasestorage.app",
  messagingSenderId: "699211889893",
  appId:             "1:699211889893:web:d2a7b9aa684285339ea80c"
};
firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();
const COL     = "inventario";

/* ════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ════════════════════════════════════════════════════════ */
let inventario   = [];
let userActual   = null;
let miGrafica    = null;
let unsubscribe  = null;
let filtroActual = 'todos';

/* ════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════ */
function estadoPagoInfo(ep) {
  if (ep === 'habilitado') return { label: 'Habilitado', color: '#854f0b', bg: '#faeeda' };
  if (ep === 'pagado')     return { label: 'Pagado',     color: '#27500a', bg: '#eaf3de' };
  return                          { label: 'Pendiente',  color: '#791f1f', bg: '#fcebeb' };
}

function puedeEliminar()     { return ['guillermo', 'romero', 'admin'].includes(userActual); }
function puedeHabilitar()    { return ['romero', 'admin'].includes(userActual); }
function puedeMarcarPagado() { return ['romero', 'admin', 'oficina'].includes(userActual); }
function puedeEditar()       { return ['romero', 'admin','guillermo'].includes(userActual); }

function proyBadge(r) {
  if (!r.Proyecto) return '';
  return `<span class="proyecto-badge proyecto-${r.Proyecto.toLowerCase()}">${r.Proyecto}</span>`;
}

function adjuntoLinkHTML(r) {
  if (!r.AdjuntoURL) return '';
  const pdf = r.AdjuntoTipo === 'application/pdf' || (r.AdjuntoNombre || '').toLowerCase().endsWith('.pdf');
  if (pdf) {
    return `<a href="${r.AdjuntoURL}" target="_blank" class="adjunto-link adjunto-pdf" onclick="event.stopPropagation()">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>PDF</a>`;
  }
  return `<a href="${r.AdjuntoURL}" target="_blank" class="adjunto-link adjunto-img" onclick="event.stopPropagation()">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>Foto</a>`;
}

/* ════════════════════════════════════════════════════════
   LOGIN / LOGOUT
   ════════════════════════════════════════════════════════ */
const CLAVES = {
  guillermo: 'Guillermo123456',
  romero:    'Romero.2026',
  admin:     'Admin.2026',
  oficina:   'Oficina.2026'
};

function login() {
  const user = document.getElementById('userSelect').value;
  const pass = document.getElementById('passInput').value;
  if (pass !== CLAVES[user]) { alert('Contraseña incorrecta.'); return; }
  userActual = user;

  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('mainSection').classList.remove('hidden');

  const nombres   = { guillermo: 'Guillermo', romero: 'Romero', admin: 'Administrador', oficina: 'Oficina' };
  const colores   = { guillermo: '#c8860a',   romero: '#533ab7', admin: '#7a4a20',       oficina: '#1a6080' };
  const etiquetas = { guillermo: 'Carga',     romero: 'Supervisor', admin: 'Acceso Total', oficina: 'Pagos' };

  document.getElementById('welcomeText').innerText = 'Hola, ' + nombres[user];
  const badge = document.getElementById('badge');
  badge.innerText = etiquetas[user];
  badge.style.backgroundColor = colores[user];

  document.querySelectorAll('.tab-btn').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.remove('active');
    t.classList.add('hidden');
  });

  const tabsPorRol = {
    guillermo: ['tab-carga', 'tab-historial'],
    romero:    ['tab-carga', 'tab-historial', 'tab-pagos'],
    admin:     ['tab-carga', 'tab-historial', 'tab-pagos', 'tab-admin'],
    oficina:   ['tab-pagos']
  };
  tabsPorRol[user].forEach(id => document.querySelector(`[data-tab="${id}"]`).classList.remove('hidden'));
  activarTab(user === 'oficina' ? 'tab-pagos' : 'tab-carga');
  suscribirFirestore();
}

function logout() {
  if (unsubscribe) unsubscribe();
  location.reload();
}

function activarTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('active');
    c.classList.add('hidden');
  });
  document.querySelector(`[data-tab="${id}"]`)?.classList.add('active');
  const c = document.getElementById(id);
  if (c) { c.classList.remove('hidden'); c.classList.add('active'); }
  if (id === 'tab-historial') renderHistorial();
  if (id === 'tab-pagos')     renderPagos(filtroActual);
  if (id === 'tab-admin')     { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ════════════════════════════════════════════════════════
   FIRESTORE TIEMPO REAL
   ════════════════════════════════════════════════════════ */
function suscribirFirestore() {
  const q = db.collection(COL).orderBy('timestamp', 'asc');
  unsubscribe = q.onSnapshot(
    snap => {
      inventario = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
      refrescarVistas();
    },
    err => {
      console.error('Firestore error:', err);
      alert('Error de conexión: ' + err.message);
    }
  );
}

function refrescarVistas() {
  const a = document.querySelector('.tab-content.active');
  if (!a) return;
  if (a.id === 'tab-historial') renderHistorial();
  if (a.id === 'tab-pagos')     renderPagos(filtroActual);
  if (a.id === 'tab-admin')     { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ════════════════════════════════════════════════════════
   REGISTRAR PIEZA
   ════════════════════════════════════════════════════════ */
async function agregarDato() {
  const nombre = document.getElementById('nombrePieza').value.trim();
  const cant   = parseInt(document.getElementById('cantidad').value)  || 0;
  const monto  = parseFloat(document.getElementById('valor').value)   || 0;
  const modo   = document.getElementById('modoPrecio').value;

  if (!nombre)   { alert('Ingresá el nombre de la pieza.');  return; }
  if (cant <= 0) { alert('La cantidad debe ser mayor a 0.'); return; }
  if (monto <= 0){ alert('El monto debe ser mayor a 0.');    return; }

  let precioUnitario, precioTotal;
  if (modo === 'unitario') {
    precioUnitario = monto;
    precioTotal    = monto * cant;
  } else {
    precioTotal    = monto;
    precioUnitario = monto / cant;
  }

  const ahora = new Date();

  // Adjunto opcional
  let adjuntoURL = '', adjuntoNombre = '', adjuntoTipo = '';
  const fileInput = document.getElementById('archivoAdjunto');
  const file = fileInput && fileInput.files[0];
  if (file) {
    try {
      const ext  = file.name.split('.').pop();
      const path = `adjuntos/${ahora.getTime()}_${nombre.replace(/\s+/g, '_')}.${ext}`;
      const snap = await storage.ref(path).put(file);
      adjuntoURL    = await snap.ref.getDownloadURL();
      adjuntoNombre = file.name;
      adjuntoTipo   = file.type;
    } catch (e) {
      console.warn('Adjunto no subido:', e.message);
    }
  }

  const reg = {
    timestamp:     ahora.getTime(),
    Mes:           ahora.toLocaleString('es-ES', { month: 'long' }),
    Fecha:         ahora.toLocaleDateString('es-AR'),
    Hora:          ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Usuario:       userActual,
    Pieza:         nombre,
    Codigo:        document.getElementById('codigoPieza').value.trim(),
    Factura:       document.getElementById('numFactura').value.trim(),
    Proyecto:      document.getElementById('proyectoPieza').value,
    Estado:        document.getElementById('tipoPieza').value,
    Cantidad:      cant,
    Precio_Unit:   precioUnitario.toFixed(2),
    Total:         precioTotal.toFixed(2),
    Modo_Ingreso:  modo,
    Descripcion:   document.getElementById('descripcion').value.trim(),
    EstadoPago:    'pendiente',
    AdjuntoURL:    adjuntoURL,
    AdjuntoNombre: adjuntoNombre,
    AdjuntoTipo:   adjuntoTipo
  };

  try {
    await db.collection(COL).add(reg);
    alert('¡Registro exitoso!');
    ['nombrePieza', 'codigoPieza', 'numFactura', 'valor', 'descripcion'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('cantidad').value = '1';
    quitarAdjunto();
  } catch (e) {
    console.error('Error al guardar:', e);
    alert('Error al guardar: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════
   ADJUNTO UI
   ════════════════════════════════════════════════════════ */
function mostrarNombreArchivo() {
  const input = document.getElementById('archivoAdjunto');
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  document.getElementById('adjuntoLabel').textContent = file.name;
  document.getElementById('btnQuitarAdjunto').classList.remove('hidden');
  const preview = document.getElementById('previewAdjunto');
  preview.classList.remove('hidden');
  preview.innerHTML = '';
  if (file.type.startsWith('image/')) {
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="preview" class="preview-img">`;
  } else if (file.type === 'application/pdf') {
    preview.innerHTML = `<div class="preview-pdf">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
           fill="none" stroke="#c8420a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${file.name}</span>
    </div>`;
  }
}

function quitarAdjunto() {
  const i = document.getElementById('archivoAdjunto'); if (i) i.value = '';
  const l = document.getElementById('adjuntoLabel');   if (l) l.textContent = 'Adjuntar archivo';
  document.getElementById('btnQuitarAdjunto')?.classList.add('hidden');
  const p = document.getElementById('previewAdjunto');
  if (p) { p.classList.add('hidden'); p.innerHTML = ''; }
}

function cambiarEtiquetaPrecio() {
  document.getElementById('labelMonto').innerText =
    document.getElementById('modoPrecio').value === 'unitario'
      ? 'Precio por Unidad ($)'
      : 'Precio Total de Factura ($)';
}

/* ════════════════════════════════════════════════════════
   MODAL
   ════════════════════════════════════════════════════════ */
function abrirDetalle(firestoreId) {
  const r = inventario.find(x => x.firestoreId === firestoreId);
  if (!r) return;
  renderModalVer(r);
  document.getElementById('modalOverlay').classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('modal-open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

function renderModalVer(r) {
  const ep   = r.EstadoPago || 'pendiente';
  const info = estadoPagoInfo(ep);
  const pb   = r.Proyecto
    ? `<span class="proyecto-badge proyecto-${r.Proyecto.toLowerCase()}" style="font-size:12px;padding:3px 10px;">${r.Proyecto}</span>`
    : '';

  let adjBlock = '';
  if (r.AdjuntoURL) {
    const pdf = r.AdjuntoTipo === 'application/pdf' || (r.AdjuntoNombre || '').toLowerCase().endsWith('.pdf');
    adjBlock = pdf
      ? `<div class="modal-adjunto-wrap">
           <a href="${r.AdjuntoURL}" target="_blank" class="modal-adjunto-btn adjunto-pdf">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
               <polyline points="14 2 14 8 20 8"/>
             </svg>
             Ver PDF · ${r.AdjuntoNombre || 'Adjunto'}
           </a>
         </div>`
      : `<div class="modal-adjunto-wrap">
           <a href="${r.AdjuntoURL}" target="_blank">
             <img src="${r.AdjuntoURL}" alt="Adjunto" class="modal-adjunto-img">
           </a>
           <p class="modal-adjunto-label">${r.AdjuntoNombre || 'Ver imagen'}</p>
         </div>`;
  }

  let btns = '';
  if (puedeEliminar()) btns += `<button class="btn btn-danger modal-btn-sm" onclick="eliminarDesdeModal('${r.firestoreId}')">✕ Eliminar</button>`;
  if (puedeEditar())   btns += `<button class="btn btn-edit modal-btn-sm"   onclick="renderModalEditar('${r.firestoreId}')">✎ Editar</button>`;

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <div class="modal-header-left">
        <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>${pb}
      </div>
      <button class="modal-close" onclick="cerrarModal()">✕</button>
    </div>
    <h2 class="modal-titulo">${r.Pieza}</h2>
    <div class="modal-total">$${parseFloat(r.Total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
    <div class="modal-grid">
      <div class="modal-field"><span class="modal-label">Código</span><span class="modal-value">${r.Codigo || '—'}</span></div>
      <div class="modal-field"><span class="modal-label">N° Factura</span><span class="modal-value">${r.Factura || '—'}</span></div>
      <div class="modal-field"><span class="modal-label">Estado pieza</span><span class="modal-value">${r.Estado || '—'}</span></div>
      <div class="modal-field"><span class="modal-label">Proyecto</span><span class="modal-value">${r.Proyecto || '—'}</span></div>
      <div class="modal-field"><span class="modal-label">Cantidad</span><span class="modal-value">${r.Cantidad}</span></div>
      <div class="modal-field"><span class="modal-label">Precio unitario</span><span class="modal-value">$${parseFloat(r.Precio_Unit || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>
      <div class="modal-field"><span class="modal-label">Fecha</span><span class="modal-value">${r.Fecha} ${r.Hora}</span></div>
      <div class="modal-field"><span class="modal-label">Registrado por</span><span class="modal-value">${r.Usuario}</span></div>
    </div>
    ${r.Descripcion ? `<div class="modal-desc-wrap"><span class="modal-label">Descripción</span><p class="modal-desc">${r.Descripcion}</p></div>` : ''}
    ${adjBlock}
    ${btns ? `<div class="modal-acciones">${btns}</div>` : ''}
  `;
}

function renderModalEditar(firestoreId) {
  const r = inventario.find(x => x.firestoreId === firestoreId);
  if (!r) return;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <span style="font-family:'Lora',serif;font-size:15px;color:var(--brown-mid);font-weight:600;">Editar registro</span>
      <button class="modal-close" onclick="cerrarModal()">✕</button>
    </div>
    <div class="modal-edit-grid">
      <div class="field"><label>Nombre Pieza</label><input type="text" id="e-pieza" value="${r.Pieza || ''}"></div>
      <div class="field"><label>Código</label><input type="text" id="e-codigo" value="${r.Codigo || ''}"></div>
      <div class="field"><label>N° Factura</label><input type="text" id="e-factura" value="${r.Factura || ''}"></div>
      <div class="field"><label>Proyecto</label>
        <select id="e-proyecto">
          <option value="Nuevo"    ${(r.Proyecto || '') === 'Nuevo'    ? 'selected' : ''}>Nuevo</option>
          <option value="Repuesto" ${(r.Proyecto || '') === 'Repuesto' ? 'selected' : ''}>Repuesto</option>
        </select>
      </div>
      <div class="field"><label>Estado pieza</label>
        <select id="e-estado">
          <option value="Nueva" ${(r.Estado || '') === 'Nueva' ? 'selected' : ''}>Nueva</option>
          <option value="Usada" ${(r.Estado || '') === 'Usada' ? 'selected' : ''}>Usada</option>
        </select>
      </div>
      <div class="field"><label>Cantidad</label><input type="number" id="e-cantidad" value="${r.Cantidad || 1}" min="1"></div>
      <div class="field"><label>Precio Unitario ($)</label>
        <input type="number" id="e-punit" value="${parseFloat(r.Precio_Unit) || 0}" min="0" class="highlight-input">
      </div>
      <div class="field" style="grid-column:1/-1;">
        <label>Descripción</label>
        <textarea id="e-desc">${r.Descripcion || ''}</textarea>
      </div>
    </div>
    <div class="modal-acciones">
      <button class="btn btn-logout modal-btn-sm" onclick="abrirDetalle('${firestoreId}')">← Cancelar</button>
      <button class="btn btn-register modal-btn-sm" onclick="guardarEdicion('${firestoreId}')">✔ Guardar cambios</button>
    </div>
  `;
}

async function guardarEdicion(firestoreId) {
  const cant  = parseInt(document.getElementById('e-cantidad').value) || 1;
  const punit = parseFloat(document.getElementById('e-punit').value)  || 0;
  const pieza = document.getElementById('e-pieza').value.trim();
  if (!pieza) { alert('El nombre de la pieza es obligatorio.'); return; }
  const cambios = {
    Pieza:       pieza,
    Codigo:      document.getElementById('e-codigo').value.trim(),
    Factura:     document.getElementById('e-factura').value.trim(),
    Proyecto:    document.getElementById('e-proyecto').value,
    Estado:      document.getElementById('e-estado').value,
    Cantidad:    cant,
    Precio_Unit: punit.toFixed(2),
    Total:       (punit * cant).toFixed(2),
    Descripcion: document.getElementById('e-desc').value.trim(),
  };
  try {
    await db.collection(COL).doc(firestoreId).update(cambios);
    const idx = inventario.findIndex(x => x.firestoreId === firestoreId);
    if (idx !== -1) inventario[idx] = { ...inventario[idx], ...cambios };
    renderModalVer(inventario.find(x => x.firestoreId === firestoreId));
  } catch (e) {
    alert('Error al guardar: ' + e.message);
  }
}

async function eliminarDesdeModal(firestoreId) {
  if (!puedeEliminar()) return;
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  try {
    await db.collection(COL).doc(firestoreId).delete();
    cerrarModal();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════
   ELIMINAR DESDE LISTA
   ════════════════════════════════════════════════════════ */
async function eliminarRegistro(firestoreId) {
  if (!puedeEliminar()) return;
  if (!confirm('¿Eliminar este registro?')) return;
  try { await db.collection(COL).doc(firestoreId).delete(); }
  catch (e) { alert('Error: ' + e.message); }
}

async function eliminarPago(firestoreId) {
  if (!puedeEliminar()) return;
  if (!confirm('¿Eliminar este pedido?')) return;
  try { await db.collection(COL).doc(firestoreId).delete(); }
  catch (e) { alert('Error: ' + e.message); }
}

/* ════════════════════════════════════════════════════════
   HISTORIAL
   ════════════════════════════════════════════════════════ */
function renderHistorial() {
  const lista = document.getElementById('historialList');
  if (!lista) return;
  const items = (['admin', 'romero'].includes(userActual))
    ? [...inventario].reverse()
    : [...inventario].filter(r => r.Usuario === 'guillermo').reverse();
  if (!items.length) {
    lista.innerHTML = '<p class="historial-empty">No hay registros todavía.</p>';
    return;
  }
  lista.innerHTML = items.slice(0, 50).map(r => {
    const ep   = r.EstadoPago || 'pendiente';
    const info = estadoPagoInfo(ep);
    const btnE = puedeEliminar()
      ? `<button class="btn-eliminar" onclick="event.stopPropagation();eliminarRegistro('${r.firestoreId}')" title="Eliminar">✕</button>`
      : '';
    return `
    <div class="historial-item clickable-row" onclick="abrirDetalle('${r.firestoreId}')">
      <div class="estado-barra" style="background:${info.color}"></div>
      <div class="historial-info">
        <div class="historial-nombre">${r.Pieza} ${proyBadge(r)}</div>
        <div class="historial-meta">${r.Estado} · Cant: ${r.Cantidad}${r.Factura ? ' · Fac: ' + r.Factura : ''}${r.Codigo ? ' · Cód: ' + r.Codigo : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <div style="text-align:right;">
          <div class="historial-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
          <div class="historial-fecha">${r.Fecha} ${r.Hora}</div>
          <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>
          ${adjuntoLinkHTML(r)}
        </div>
        ${btnE}
      </div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════
   PAGOS
   ════════════════════════════════════════════════════════ */
function renderPagos(filtro) {
  filtroActual = filtro;
  document.querySelectorAll('.filtro-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filtro === filtro)
  );
  const lista   = document.getElementById('pagosList');
  const resumen = document.getElementById('pagosResumen');
  if (!lista) return;

  const suma = e => inventario
    .filter(r => (r.EstadoPago || 'pendiente') === e)
    .reduce((a, r) => a + parseFloat(r.Total), 0);

  if (resumen) {
    resumen.innerHTML = `
      <div class="resumen-card">
        <div class="resumen-label">Total</div>
        <div class="resumen-valor">${inventario.length}</div>
      </div>
      <div class="resumen-card" style="background:#fcebeb;border-color:#f09595;">
        <div class="resumen-label" style="color:#791f1f;">Pendiente</div>
        <div class="resumen-valor" style="color:#791f1f;">$${suma('pendiente').toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="resumen-card" style="background:#faeeda;border-color:#ef9f27;">
        <div class="resumen-label" style="color:#854f0b;">Habilitado</div>
        <div class="resumen-valor" style="color:#854f0b;">$${suma('habilitado').toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="resumen-card" style="background:#eaf3de;border-color:#97c459;">
        <div class="resumen-label" style="color:#27500a;">Pagado</div>
        <div class="resumen-valor" style="color:#27500a;">$${suma('pagado').toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
      </div>`;
  }

  let items = [...inventario].reverse();
  if (filtro === 'pendientes')  items = items.filter(r => (r.EstadoPago || 'pendiente') === 'pendiente');
  if (filtro === 'habilitados') items = items.filter(r => (r.EstadoPago || 'pendiente') === 'habilitado');
  if (filtro === 'pagados')     items = items.filter(r => (r.EstadoPago || 'pendiente') === 'pagado');

  if (!items.length) {
    lista.innerHTML = '<p class="pagos-empty">No hay registros en esta categoría.</p>';
    return;
  }

  lista.innerHTML = items.map(r => {
    const ep   = r.EstadoPago || 'pendiente';
    const info = estadoPagoInfo(ep);
    let acc = '';
    if (ep === 'pendiente'  && puedeHabilitar())    acc += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstado('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;">Habilitar</button>`;
    if (ep === 'habilitado' && puedeMarcarPagado())  acc += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstado('${r.firestoreId}','pagado')" style="border-color:#639922;color:#27500a;">Marcar pagado</button>`;
    if (ep === 'pagado'     && puedeHabilitar())    acc += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstado('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;font-size:11px;">Revertir</button>`;
    const btnE = puedeEliminar()
      ? `<button class="btn-eliminar" onclick="event.stopPropagation();eliminarPago('${r.firestoreId}')">✕</button>`
      : '';
    return `
    <div class="pago-item clickable-row" style="border-left:4px solid ${info.color};padding-left:14px;" onclick="abrirDetalle('${r.firestoreId}')">
      <div class="pago-info">
        <div class="pago-nombre">${r.Pieza} ${proyBadge(r)}</div>
        <div class="pago-meta">${r.Fecha} · ${r.Estado} · Cant: ${r.Cantidad}${r.Factura ? ' · Fac: ' + r.Factura : ''}</div>
      </div>
      <div class="pago-right">
        <div>
          <div class="pago-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
          <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>
          ${adjuntoLinkHTML(r)}
        </div>
        ${acc}${btnE}
      </div>
    </div>`;
  }).join('');
}

async function cambiarEstado(firestoreId, nuevoEstado) {
  if (nuevoEstado === 'habilitado' && !puedeHabilitar())    return;
  if (nuevoEstado === 'pagado'     && !puedeMarcarPagado()) return;
  const r = inventario.find(x => x.firestoreId === firestoreId);
  if (!r) return;
  if (nuevoEstado === 'pagado' && (r.EstadoPago || 'pendiente') !== 'habilitado') {
    alert('Solo se pueden pagar pedidos habilitados.');
    return;
  }
  try { await db.collection(COL).doc(firestoreId).update({ EstadoPago: nuevoEstado }); }
  catch (e) { alert('Error: ' + e.message); }
}

/* ════════════════════════════════════════════════════════
   GRÁFICA
   ════════════════════════════════════════════════════════ */
function initChart() {
  const ctx = document.getElementById('miGrafica');
  if (!ctx) return;
  if (miGrafica) miGrafica.destroy();
  miGrafica = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: inventario.map(d => d.Fecha + ' ' + d.Hora),
      datasets: [{
        label: 'Inversión ($)',
        data: inventario.map(d => parseFloat(d.Total)),
        borderColor: '#c8860a',
        backgroundColor: 'rgba(200,134,10,0.10)',
        pointBackgroundColor: '#c8420a',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#7a4a20', font: { family: 'Nunito', weight: '700', size: 13 } }
        }
      },
      scales: {
        x: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } },
        y: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } }
      }
    }
  });
}

function actualizarComparador() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const tot = inventario.reduce((acc, r) => {
    acc[r.Mes] = (acc[r.Mes] || 0) + parseFloat(r.Total);
    return acc;
  }, {});
  for (const [mes, d] of Object.entries(tot)) {
    grid.innerHTML += `
      <div class="stat-card">
        <div class="stat-month">${mes}</div>
        <div class="stat-value">$${d.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
      </div>`;
  }
}

/* ════════════════════════════════════════════════════════
   EXCEL + LIMPIAR
   ════════════════════════════════════════════════════════ */
function exportarExcel() {
  if (!inventario.length) { alert('No hay registros para exportar.'); return; }
  const wb = XLSX.utils.book_new();
  [...new Set(inventario.map(r => r.Mes))].forEach(mes => {
    const datos = inventario
      .filter(r => r.Mes === mes)
      .map(({ firestoreId, timestamp, ...resto }) => resto);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), mes.toUpperCase());
  });
  XLSX.writeFile(wb, 'Inventario_RomeroPanificados.xlsx');
}

async function limpiarTodo() {
  if (!confirm('¿Borrar TODO el historial? Esta acción no se puede deshacer.')) return;
  try {
    const snap = await db.collection(COL).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
    alert('Historial borrado.');
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
