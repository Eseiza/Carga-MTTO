import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD6uhwhiF-_j5oyu4NBZug3zU7SHwaY4_M",
    authDomain:        "gastos-mtto.firebaseapp.com",
    projectId:         "gastos-mtto",
    storageBucket:     "gastos-mtto.firebasestorage.app",
    messagingSenderId: "699211889893",
    appId:             "1:699211889893:web:d2a7b9aa684285339ea80c",
    measurementId:     "G-XR2NQHQSM5"
};

const app     = initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);
const COL     = "inventario";

let inventario  = [];
let userActual  = null;
let miGrafica   = null;
let unsubscribe = null;

/* ═══════════════════════════════════════════════════════
   MODAL DE DETALLE / EDICIÓN (CRUD)
   ═══════════════════════════════════════════════════════ */

// Abre el modal en modo "ver"
window.abrirDetalle = function(firestoreId) {
    const r = inventario.find(x => x.firestoreId === firestoreId);
    if (!r) return;
    renderModalVer(r);
    document.getElementById('modalOverlay').classList.add('modal-open');
    document.body.style.overflow = 'hidden';
};

// Cierra el modal
window.cerrarModal = function() {
    document.getElementById('modalOverlay').classList.remove('modal-open');
    document.body.style.overflow = '';
};

// Cierra si se hace clic en el backdrop
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modalOverlay')?.addEventListener('click', e => {
        if (e.target.id === 'modalOverlay') window.cerrarModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') window.cerrarModal();
    });
});

/* ── MODO VER ─────────────────────────────────────────── */
function renderModalVer(r) {
    const ep   = r.EstadoPago || 'pendiente';
    const info = estadoPagoInfo(ep);

    const proyectoBadge = r.Proyecto
        ? `<span class="proyecto-badge proyecto-${r.Proyecto.toLowerCase()}" style="font-size:12px;padding:3px 10px;">${r.Proyecto}</span>`
        : '';

    // Adjunto
    let adjuntoBlock = '';
    if (r.AdjuntoURL) {
        const esPDF = r.AdjuntoTipo === 'application/pdf' || (r.AdjuntoNombre||'').toLowerCase().endsWith('.pdf');
        if (esPDF) {
            adjuntoBlock = `
            <div class="modal-adjunto-wrap">
                <a href="${r.AdjuntoURL}" target="_blank" class="modal-adjunto-btn adjunto-pdf">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Ver PDF · ${r.AdjuntoNombre || 'Adjunto'}
                </a>
            </div>`;
        } else {
            adjuntoBlock = `
            <div class="modal-adjunto-wrap">
                <a href="${r.AdjuntoURL}" target="_blank">
                    <img src="${r.AdjuntoURL}" alt="Adjunto" class="modal-adjunto-img">
                </a>
                <p class="modal-adjunto-label">${r.AdjuntoNombre || 'Ver imagen'}</p>
            </div>`;
        }
    }

    // Botones de acción según rol
    let acciones = '';
    if (puedeEliminar()) {
        acciones += `<button class="btn btn-danger modal-btn-sm" onclick="eliminarDesdeModal('${r.firestoreId}')">✕ Eliminar</button>`;
    }
    // Solo admin y romero pueden editar
    if (['admin','romero'].includes(userActual)) {
        acciones += `<button class="btn btn-edit modal-btn-sm" onclick="renderModalEditar('${r.firestoreId}')">✎ Editar</button>`;
    }

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-header">
            <div class="modal-header-left">
                <span class="estado-pill" style="background:${info.bg};color:${info.color};font-size:11px;">${info.label}</span>
                ${proyectoBadge}
            </div>
            <button class="modal-close" onclick="cerrarModal()">✕</button>
        </div>

        <h2 class="modal-titulo">${r.Pieza}</h2>
        <div class="modal-total">$${parseFloat(r.Total).toLocaleString('es-AR', {minimumFractionDigits:2})}</div>

        <div class="modal-grid">
            <div class="modal-field">
                <span class="modal-label">Código</span>
                <span class="modal-value">${r.Codigo || '—'}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">N° Factura</span>
                <span class="modal-value">${r.Factura || '—'}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Estado pieza</span>
                <span class="modal-value">${r.Estado || '—'}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Proyecto</span>
                <span class="modal-value">${r.Proyecto || '—'}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Cantidad</span>
                <span class="modal-value">${r.Cantidad}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Precio unitario</span>
                <span class="modal-value">$${parseFloat(r.Precio_Unit).toLocaleString('es-AR', {minimumFractionDigits:2})}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Fecha</span>
                <span class="modal-value">${r.Fecha} ${r.Hora}</span>
            </div>
            <div class="modal-field">
                <span class="modal-label">Registrado por</span>
                <span class="modal-value">${r.Usuario}</span>
            </div>
        </div>

        ${r.Descripcion ? `
        <div class="modal-desc-wrap">
            <span class="modal-label">Descripción</span>
            <p class="modal-desc">${r.Descripcion}</p>
        </div>` : ''}

        ${adjuntoBlock}

        ${acciones ? `<div class="modal-acciones">${acciones}</div>` : ''}
    `;
}

/* ── MODO EDITAR ──────────────────────────────────────── */
window.renderModalEditar = function(firestoreId) {
    const r = inventario.find(x => x.firestoreId === firestoreId);
    if (!r) return;

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-header">
            <span style="font-family:'Lora',serif;font-size:15px;color:var(--brown-mid);font-weight:600;">Editar registro</span>
            <button class="modal-close" onclick="cerrarModal()">✕</button>
        </div>

        <div class="modal-edit-grid">
            <div class="field">
                <label>Nombre Pieza</label>
                <input type="text" id="edit-pieza" value="${r.Pieza || ''}">
            </div>
            <div class="field">
                <label>Código</label>
                <input type="text" id="edit-codigo" value="${r.Codigo || ''}">
            </div>
            <div class="field">
                <label>N° Factura</label>
                <input type="text" id="edit-factura" value="${r.Factura || ''}">
            </div>
            <div class="field">
                <label>Proyecto</label>
                <select id="edit-proyecto">
                    <option value="Nuevo"    ${(r.Proyecto||'') === 'Nuevo'    ? 'selected' : ''}>Nuevo</option>
                    <option value="Repuesto" ${(r.Proyecto||'') === 'Repuesto' ? 'selected' : ''}>Repuesto</option>
                </select>
            </div>
            <div class="field">
                <label>Estado pieza</label>
                <select id="edit-estado">
                    <option value="Nueva"  ${(r.Estado||'') === 'Nueva'  ? 'selected' : ''}>Nueva</option>
                    <option value="Usada"  ${(r.Estado||'') === 'Usada'  ? 'selected' : ''}>Usada</option>
                </select>
            </div>
            <div class="field">
                <label>Cantidad</label>
                <input type="number" id="edit-cantidad" value="${r.Cantidad || 1}" min="1">
            </div>
            <div class="field">
                <label>Precio Unitario ($)</label>
                <input type="number" id="edit-preciounit" value="${parseFloat(r.Precio_Unit) || 0}" min="0" class="highlight-input">
            </div>
            <div class="field" style="grid-column:1/-1;">
                <label>Descripción</label>
                <textarea id="edit-descripcion">${r.Descripcion || ''}</textarea>
            </div>
        </div>

        <div class="modal-acciones">
            <button class="btn btn-logout modal-btn-sm" onclick="abrirDetalle('${firestoreId}')">← Cancelar</button>
            <button class="btn btn-register modal-btn-sm" onclick="guardarEdicion('${firestoreId}')">✔ Guardar cambios</button>
        </div>
    `;
};

/* ── GUARDAR EDICIÓN ──────────────────────────────────── */
window.guardarEdicion = async function(firestoreId) {
    const cant  = parseInt(document.getElementById('edit-cantidad').value) || 1;
    const punit = parseFloat(document.getElementById('edit-preciounit').value) || 0;

    const cambios = {
        Pieza:       document.getElementById('edit-pieza').value.trim(),
        Codigo:      document.getElementById('edit-codigo').value.trim(),
        Factura:     document.getElementById('edit-factura').value.trim(),
        Proyecto:    document.getElementById('edit-proyecto').value,
        Estado:      document.getElementById('edit-estado').value,
        Cantidad:    cant,
        Precio_Unit: punit.toFixed(2),
        Total:       (punit * cant).toFixed(2),
        Descripcion: document.getElementById('edit-descripcion').value.trim(),
    };

    if (!cambios.Pieza) { alert('El nombre de la pieza es obligatorio.'); return; }

    try {
        await updateDoc(doc(db, COL, firestoreId), cambios);
        // Refrescar y volver a modo ver
        const actualizado = { ...inventario.find(x => x.firestoreId === firestoreId), ...cambios };
        renderModalVer(actualizado);
    } catch (e) {
        alert('Error al guardar: ' + e.message);
    }
};

/* ── ELIMINAR DESDE MODAL ─────────────────────────────── */
window.eliminarDesdeModal = async function(firestoreId) {
    if (!puedeEliminar()) return;
    if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    try {
        await deleteDoc(doc(db, COL, firestoreId));
        window.cerrarModal();
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
};

/* ═══════════════════════════════════════════════════════
   ADJUNTO: UI (formulario nuevo registro)
   ═══════════════════════════════════════════════════════ */
window.mostrarNombreArchivo = function() {
    const input   = document.getElementById('archivoAdjunto');
    const label   = document.getElementById('adjuntoLabel');
    const btnQ    = document.getElementById('btnQuitarAdjunto');
    const preview = document.getElementById('previewAdjunto');

    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    label.textContent = file.name;
    btnQ.classList.remove('hidden');
    preview.classList.remove('hidden');
    preview.innerHTML = '';

    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${url}" alt="preview" class="preview-img">`;
    } else if (file.type === 'application/pdf') {
        preview.innerHTML = `
            <div class="preview-pdf">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                     fill="none" stroke="#c8420a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>${file.name}</span>
            </div>`;
    }
};

window.quitarAdjunto = function() {
    const input   = document.getElementById('archivoAdjunto');
    const label   = document.getElementById('adjuntoLabel');
    const btnQ    = document.getElementById('btnQuitarAdjunto');
    const preview = document.getElementById('previewAdjunto');
    input.value   = '';
    label.textContent = 'Adjuntar archivo';
    btnQ.classList.add('hidden');
    preview.classList.add('hidden');
    preview.innerHTML = '';
};

/* ═══════════════════════════════════════════════════════
   PRECIO
   ═══════════════════════════════════════════════════════ */
function cambiarEtiquetaPrecio() {
    const modo = document.getElementById('modoPrecio').value;
    document.getElementById('labelMonto').innerText =
        modo === 'unitario' ? 'Precio por Unidad ($)' : 'Precio Total de Factura ($)';
}
window.cambiarEtiquetaPrecio = cambiarEtiquetaPrecio;

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function estadoPagoInfo(ep) {
    if (ep === 'habilitado') return { label: 'Habilitado', color: '#854f0b', bg: '#faeeda' };
    if (ep === 'pagado')     return { label: 'Pagado',     color: '#27500a', bg: '#eaf3de' };
    return                          { label: 'Pendiente',  color: '#791f1f', bg: '#fcebeb' };
}

function puedeEliminar()     { return ['guillermo','romero','admin'].includes(userActual); }
function puedeHabilitar()    { return ['romero','admin'].includes(userActual); }
function puedeMarcarPagado() { return ['romero','admin','oficina'].includes(userActual); }

/* ═══════════════════════════════════════════════════════
   LOGIN / LOGOUT
   ═══════════════════════════════════════════════════════ */
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
    const colores   = { guillermo: '#c8860a', romero: '#533ab7', admin: '#7a4a20', oficina: '#1a6080' };
    const etiquetas = { guillermo: 'Carga', romero: 'Supervisor', admin: 'Acceso Total', oficina: 'Pagos' };

    document.getElementById('welcomeText').innerText = 'Hola, ' + nombres[user];
    const badge = document.getElementById('badge');
    badge.innerText = etiquetas[user];
    badge.style.backgroundColor = colores[user];

    document.querySelectorAll('.tab-btn').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(t => { t.classList.remove('active'); t.classList.add('hidden'); });

    if (user === 'guillermo') {
        mostrarTabs(['tab-carga','tab-historial']);
        activarTab('tab-carga');
    } else if (user === 'romero') {
        mostrarTabs(['tab-carga','tab-historial','tab-pagos']);
        activarTab('tab-carga');
    } else if (user === 'admin') {
        mostrarTabs(['tab-carga','tab-historial','tab-pagos','tab-admin']);
        activarTab('tab-carga');
    } else if (user === 'oficina') {
        mostrarTabs(['tab-pagos']);
        activarTab('tab-pagos');
    }

    suscribirFirestore();
}
window.login = login;

function logout() {
    if (unsubscribe) unsubscribe();
    location.reload();
}
window.logout = logout;

function mostrarTabs(ids) {
    ids.forEach(id => {
        const btn = document.querySelector(`[data-tab="${id}"]`);
        if (btn) btn.classList.remove('hidden');
    });
}

function activarTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    const btn     = document.querySelector(`[data-tab="${id}"]`);
    const content = document.getElementById(id);
    if (btn) btn.classList.add('active');
    if (content) { content.classList.remove('hidden'); content.classList.add('active'); }

    if (id === 'tab-historial') renderHistorial();
    if (id === 'tab-pagos')    renderPagos('todos');
    if (id === 'tab-admin')    { setTimeout(initChart, 100); actualizarComparador(); }
}
window.activarTab = activarTab;

/* ═══════════════════════════════════════════════════════
   FIRESTORE: SUSCRIPCIÓN EN TIEMPO REAL
   ═══════════════════════════════════════════════════════ */
function suscribirFirestore() {
    const q = query(collection(db, COL), orderBy('timestamp', 'asc'));
    unsubscribe = onSnapshot(q, (snapshot) => {
        inventario = snapshot.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        refrescarVistasActivas();
    });
}

function refrescarVistasActivas() {
    const tabActiva = document.querySelector('.tab-content.active');
    if (!tabActiva) return;
    const id = tabActiva.id;
    if (id === 'tab-historial') renderHistorial();
    if (id === 'tab-pagos')    renderPagos(filtroActual);
    if (id === 'tab-admin')    { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ═══════════════════════════════════════════════════════
   REGISTRAR PIEZA
   ═══════════════════════════════════════════════════════ */
async function agregarDato() {
    const nombre = document.getElementById('nombrePieza').value.trim();
    const cant   = parseInt(document.getElementById('cantidad').value) || 0;
    const monto  = parseFloat(document.getElementById('valor').value) || 0;
    const modo   = document.getElementById('modoPrecio').value;

    if (!nombre || cant <= 0 || monto <= 0) {
        alert('Completá los datos de Pieza, Cantidad y Monto.');
        return;
    }

    let precioUnitario, precioTotal;
    if (modo === 'unitario') { precioUnitario = monto; precioTotal = monto * cant; }
    else                     { precioTotal = monto; precioUnitario = monto / cant; }

    const ahora = new Date();

    let adjuntoURL = '', adjuntoNombre = '', adjuntoTipo = '';
    const fileInput = document.getElementById('archivoAdjunto');
    const file      = fileInput.files && fileInput.files[0];

    if (file) {
        try {
            const ext           = file.name.split('.').pop();
            const nombreArchivo = `adjuntos/${ahora.getTime()}_${nombre.replace(/\s+/g,'_')}.${ext}`;
            const storageRef    = ref(storage, nombreArchivo);
            await uploadBytes(storageRef, file);
            adjuntoURL    = await getDownloadURL(storageRef);
            adjuntoNombre = file.name;
            adjuntoTipo   = file.type;
        } catch (e) {
            console.warn('No se pudo subir el adjunto:', e.message);
        }
    }

    const registro = {
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
        await addDoc(collection(db, COL), registro);
        alert('¡Registro exitoso!');
        ['nombrePieza','codigoPieza','numFactura','valor','descripcion'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('cantidad').value = '1';
        window.quitarAdjunto();
    } catch (e) {
        alert('Error al guardar: ' + e.message);
    }
}
window.agregarDato = agregarDato;

/* ═══════════════════════════════════════════════════════
   ELIMINAR (desde lista — mantiene compatibilidad)
   ═══════════════════════════════════════════════════════ */
async function eliminarRegistro(firestoreId) {
    if (!puedeEliminar()) return;
    if (!confirm('¿Eliminar este registro?')) return;
    try { await deleteDoc(doc(db, COL, firestoreId)); }
    catch (e) { alert('Error al eliminar: ' + e.message); }
}
window.eliminarRegistro = eliminarRegistro;

async function eliminarPago(firestoreId) {
    if (!puedeEliminar()) return;
    if (!confirm('¿Eliminar este pedido?')) return;
    try { await deleteDoc(doc(db, COL, firestoreId)); }
    catch (e) { alert('Error al eliminar: ' + e.message); }
}
window.eliminarPago = eliminarPago;

/* ═══════════════════════════════════════════════════════
   RENDER: ícono adjunto pequeño (listas)
   ═══════════════════════════════════════════════════════ */
function adjuntoHTML(r) {
    if (!r.AdjuntoURL) return '';
    const esPDF = r.AdjuntoTipo === 'application/pdf' || (r.AdjuntoNombre||'').toLowerCase().endsWith('.pdf');
    if (esPDF) {
        return `<a href="${r.AdjuntoURL}" target="_blank" class="adjunto-link adjunto-pdf"
                   onclick="event.stopPropagation()" title="${r.AdjuntoNombre || 'Ver PDF'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg> PDF</a>`;
    }
    return `<a href="${r.AdjuntoURL}" target="_blank" class="adjunto-link adjunto-img"
               onclick="event.stopPropagation()" title="${r.AdjuntoNombre || 'Ver imagen'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
        </svg> Foto</a>`;
}

/* ═══════════════════════════════════════════════════════
   HISTORIAL
   ═══════════════════════════════════════════════════════ */
function renderHistorial() {
    const lista = document.getElementById('historialList');
    if (!lista) return;

    const items = (userActual === 'admin' || userActual === 'romero')
        ? [...inventario].reverse()
        : [...inventario].filter(r => r.Usuario === 'guillermo').reverse();

    if (items.length === 0) {
        lista.innerHTML = '<p class="historial-empty">No hay registros todavía.</p>';
        return;
    }

    lista.innerHTML = items.slice(0, 50).map(r => {
        const ep   = r.EstadoPago || 'pendiente';
        const info = estadoPagoInfo(ep);
        const btnEliminar = puedeEliminar()
            ? `<button class="btn-eliminar" onclick="event.stopPropagation();eliminarRegistro('${r.firestoreId}')" title="Eliminar">✕</button>`
            : '';
        const proyectoBadge = r.Proyecto
            ? `<span class="proyecto-badge proyecto-${r.Proyecto.toLowerCase()}">${r.Proyecto}</span>`
            : '';
        return `
        <div class="historial-item clickable-row" onclick="abrirDetalle('${r.firestoreId}')">
            <div class="estado-barra" style="background:${info.color}"></div>
            <div class="historial-info">
                <div class="historial-nombre">${r.Pieza} ${proyectoBadge}</div>
                <div class="historial-meta">
                    ${r.Estado} · Cant: ${r.Cantidad}
                    ${r.Factura ? '· Fac: ' + r.Factura : ''}
                    ${r.Codigo  ? '· Cód: ' + r.Codigo  : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                <div style="text-align:right;">
                    <div class="historial-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    <div class="historial-fecha">${r.Fecha} ${r.Hora}</div>
                    <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>
                    ${adjuntoHTML(r)}
                </div>
                ${btnEliminar}
            </div>
        </div>`;
    }).join('');
}

/* ═══════════════════════════════════════════════════════
   PAGOS
   ═══════════════════════════════════════════════════════ */
let filtroActual = 'todos';

function renderPagos(filtro) {
    filtroActual = filtro;
    document.querySelectorAll('.filtro-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filtro === filtro);
    });

    const lista   = document.getElementById('pagosList');
    const resumen = document.getElementById('pagosResumen');
    if (!lista) return;

    const sumaPor = (estado) =>
        inventario.filter(r => (r.EstadoPago||'pendiente') === estado)
                  .reduce((a, r) => a + parseFloat(r.Total), 0);

    if (resumen) {
        resumen.innerHTML = `
            <div class="resumen-card">
                <div class="resumen-label">Total registros</div>
                <div class="resumen-valor">${inventario.length}</div>
            </div>
            <div class="resumen-card" style="background:#fcebeb;border-color:#f09595;">
                <div class="resumen-label" style="color:#791f1f;">Pendiente</div>
                <div class="resumen-valor" style="color:#791f1f;">$${sumaPor('pendiente').toLocaleString('es-AR',{maximumFractionDigits:0})}</div>
            </div>
            <div class="resumen-card" style="background:#faeeda;border-color:#ef9f27;">
                <div class="resumen-label" style="color:#854f0b;">Habilitado</div>
                <div class="resumen-valor" style="color:#854f0b;">$${sumaPor('habilitado').toLocaleString('es-AR',{maximumFractionDigits:0})}</div>
            </div>
            <div class="resumen-card" style="background:#eaf3de;border-color:#97c459;">
                <div class="resumen-label" style="color:#27500a;">Pagado</div>
                <div class="resumen-valor" style="color:#27500a;">$${sumaPor('pagado').toLocaleString('es-AR',{maximumFractionDigits:0})}</div>
            </div>`;
    }

    let items = [...inventario].reverse();
    if (filtro === 'pendientes')  items = items.filter(r => (r.EstadoPago||'pendiente') === 'pendiente');
    if (filtro === 'habilitados') items = items.filter(r => (r.EstadoPago||'pendiente') === 'habilitado');
    if (filtro === 'pagados')     items = items.filter(r => (r.EstadoPago||'pendiente') === 'pagado');

    if (items.length === 0) {
        lista.innerHTML = '<p class="pagos-empty">No hay registros en esta categoría.</p>';
        return;
    }

    lista.innerHTML = items.map(r => {
        const ep   = r.EstadoPago || 'pendiente';
        const info = estadoPagoInfo(ep);

        let acciones = '';
        if (ep === 'pendiente'  && puedeHabilitar())
            acciones += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstadoPago('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;">Habilitar</button>`;
        if (ep === 'habilitado' && puedeMarcarPagado())
            acciones += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstadoPago('${r.firestoreId}','pagado')" style="border-color:#639922;color:#27500a;">Marcar pagado</button>`;
        if (ep === 'pagado'     && puedeHabilitar())
            acciones += `<button class="pago-toggle" onclick="event.stopPropagation();cambiarEstadoPago('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;font-size:11px;">Revertir</button>`;

        const btnEliminar = puedeEliminar()
            ? `<button class="btn-eliminar" onclick="event.stopPropagation();eliminarPago('${r.firestoreId}')" title="Eliminar">✕</button>`
            : '';

        const proyectoBadge = r.Proyecto
            ? `<span class="proyecto-badge proyecto-${r.Proyecto.toLowerCase()}">${r.Proyecto}</span>`
            : '';

        return `
        <div class="pago-item clickable-row" style="border-left:4px solid ${info.color};padding-left:14px;"
             onclick="abrirDetalle('${r.firestoreId}')">
            <div class="pago-info">
                <div class="pago-nombre">${r.Pieza} ${proyectoBadge}</div>
                <div class="pago-meta">
                    ${r.Fecha} · ${r.Estado} · Cant: ${r.Cantidad}
                    ${r.Factura ? '· Fac: ' + r.Factura : ''}
                </div>
            </div>
            <div class="pago-right">
                <div>
                    <div class="pago-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>
                    ${adjuntoHTML(r)}
                </div>
                ${acciones}
                ${btnEliminar}
            </div>
        </div>`;
    }).join('');
}
window.renderPagos = renderPagos;

async function cambiarEstadoPago(firestoreId, nuevoEstado) {
    if (nuevoEstado === 'habilitado' && !puedeHabilitar()) return;
    if (nuevoEstado === 'pagado'     && !puedeMarcarPagado()) return;

    const registro = inventario.find(r => r.firestoreId === firestoreId);
    if (!registro) return;

    const ep = registro.EstadoPago || 'pendiente';
    if (nuevoEstado === 'pagado' && ep !== 'habilitado') {
        alert('Solo se pueden pagar pedidos habilitados.');
        return;
    }

    try { await updateDoc(doc(db, COL, firestoreId), { EstadoPago: nuevoEstado }); }
    catch (e) { alert('Error al actualizar: ' + e.message); }
}
window.cambiarEstadoPago = cambiarEstadoPago;

/* ═══════════════════════════════════════════════════════
   GRÁFICA
   ═══════════════════════════════════════════════════════ */
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
            plugins: { legend: { labels: { color: '#7a4a20', font: { family: 'Nunito', weight: '700', size: 13 } } } },
            scales: {
                x: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } },
                y: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } }
            }
        }
    });
}

/* ═══════════════════════════════════════════════════════
   COMPARATIVA MENSUAL
   ═══════════════════════════════════════════════════════ */
function actualizarComparador() {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const totales = inventario.reduce((acc, curr) => {
        acc[curr.Mes] = (acc[curr.Mes] || 0) + parseFloat(curr.Total);
        return acc;
    }, {});
    for (const [mes, dinero] of Object.entries(totales)) {
        grid.innerHTML += `
            <div class="stat-card">
                <div class="stat-month">${mes}</div>
                <div class="stat-value">$${dinero.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>`;
    }
}

/* ═══════════════════════════════════════════════════════
   EXCEL
   ═══════════════════════════════════════════════════════ */
function exportarExcel() {
    if (inventario.length === 0) { alert('No hay registros para exportar.'); return; }
    const wb    = XLSX.utils.book_new();
    const meses = [...new Set(inventario.map(r => r.Mes))];
    meses.forEach(mes => {
        const datos = inventario.filter(r => r.Mes === mes).map(({ firestoreId, timestamp, ...resto }) => resto);
        const ws    = XLSX.utils.json_to_sheet(datos);
        XLSX.utils.book_append_sheet(wb, ws, mes.toUpperCase());
    });
    XLSX.writeFile(wb, 'Inventario_RomeroPanificados.xlsx');
}
window.exportarExcel = exportarExcel;

/* ═══════════════════════════════════════════════════════
   LIMPIAR TODO
   ═══════════════════════════════════════════════════════ */
async function limpiarTodo() {
    if (!confirm('¿Borrar TODO el historial? Esta acción no se puede deshacer.')) return;
    try {
        const snapshot = await getDocs(collection(db, COL));
        await Promise.all(snapshot.docs.map(d => deleteDoc(doc(db, COL, d.id))));
        alert('Historial borrado.');
    } catch (e) {
        alert('Error al borrar: ' + e.message);
    }
}
window.limpiarTodo = limpiarTodo;
