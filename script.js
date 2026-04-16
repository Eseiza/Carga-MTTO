import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyD6uhwhiF-_j5oyu4NBZug3zU7SHwaY4_M",
    authDomain:        "gastos-mtto.firebaseapp.com",
    projectId:         "gastos-mtto",
    storageBucket:     "gastos-mtto.firebasestorage.app",
    messagingSenderId: "699211889893",
    appId:             "1:699211889893:web:d2a7b9aa684285339ea80c",
    measurementId:     "G-XR2NQHQSM5"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const COL = "inventario";

let inventario  = [];
let userActual  = null;
let miGrafica   = null;
let unsubscribe = null;

/* ─── PRECIO ──────────────────────────────────────────── */
function cambiarEtiquetaPrecio() {
    const modo = document.getElementById('modoPrecio').value;
    document.getElementById('labelMonto').innerText =
        modo === 'unitario' ? 'Precio por Unidad ($)' : 'Precio Total de Factura ($)';
}
window.cambiarEtiquetaPrecio = cambiarEtiquetaPrecio;

/* ─── HELPERS ─────────────────────────────────────────── */
function estadoPagoInfo(ep) {
    if (ep === 'habilitado') return { label: 'Habilitado', color: '#854f0b', bg: '#faeeda' };
    if (ep === 'pagado')     return { label: 'Pagado',     color: '#27500a', bg: '#eaf3de' };
    return                          { label: 'Pendiente',  color: '#791f1f', bg: '#fcebeb' };
}

function puedeEliminar()     { return ['guillermo','romero','admin'].includes(userActual); }
function puedeHabilitar()    { return ['romero','admin'].includes(userActual); }
function puedeMarcarPagado() { return ['romero','admin','oficina'].includes(userActual); }

/* ─── LOGIN / LOGOUT ──────────────────────────────────── */
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
    const btn = document.querySelector(`[data-tab="${id}"]`);
    const content = document.getElementById(id);
    if (btn) btn.classList.add('active');
    if (content) { content.classList.remove('hidden'); content.classList.add('active'); }

    if (id === 'tab-historial') renderHistorial();
    if (id === 'tab-pagos')    renderPagos('todos');
    if (id === 'tab-admin')    { setTimeout(initChart, 100); actualizarComparador(); }
}
window.activarTab = activarTab;

/* ─── FIRESTORE: SUSCRIPCIÓN EN TIEMPO REAL ──────────── */
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

/* ─── REGISTRAR PIEZA ─────────────────────────────────── */
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
    const registro = {
        timestamp:    ahora.getTime(),
        Mes:          ahora.toLocaleString('es-ES', { month: 'long' }),
        Fecha:        ahora.toLocaleDateString('es-AR'),
        Hora:         ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        Usuario:      userActual,
        Pieza:        nombre,
        Codigo:       document.getElementById('codigoPieza').value.trim(),
        Factura:      document.getElementById('numFactura').value.trim(),
        Estado:       document.getElementById('tipoPieza').value,
        Cantidad:     cant,
        Precio_Unit:  precioUnitario.toFixed(2),
        Total:        precioTotal.toFixed(2),
        Modo_Ingreso: modo,
        Descripcion:  document.getElementById('descripcion').value.trim(),
        EstadoPago:   'pendiente'
    };

    try {
        await addDoc(collection(db, COL), registro);
        alert('¡Registro exitoso!');
        ['nombrePieza','codigoPieza','numFactura','valor','descripcion'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('cantidad').value = '1';
    } catch (e) {
        alert('Error al guardar: ' + e.message);
    }
}
window.agregarDato = agregarDato;

/* ─── ELIMINAR ────────────────────────────────────────── */
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

/* ─── HISTORIAL ───────────────────────────────────────── */
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
            ? `<button class="btn-eliminar" onclick="eliminarRegistro('${r.firestoreId}')" title="Eliminar">✕</button>`
            : '';
        return `
        <div class="historial-item">
            <div class="estado-barra" style="background:${info.color}"></div>
            <div class="historial-info">
                <div class="historial-nombre">${r.Pieza}</div>
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
                </div>
                ${btnEliminar}
            </div>
        </div>`;
    }).join('');
}

/* ─── PAGOS ───────────────────────────────────────────── */
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
            acciones += `<button class="pago-toggle" onclick="cambiarEstadoPago('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;">Habilitar</button>`;
        if (ep === 'habilitado' && puedeMarcarPagado())
            acciones += `<button class="pago-toggle" onclick="cambiarEstadoPago('${r.firestoreId}','pagado')" style="border-color:#639922;color:#27500a;">Marcar pagado</button>`;
        if (ep === 'pagado'     && puedeHabilitar())
            acciones += `<button class="pago-toggle" onclick="cambiarEstadoPago('${r.firestoreId}','habilitado')" style="border-color:#ef9f27;color:#854f0b;font-size:11px;">Revertir</button>`;

        const btnEliminar = puedeEliminar()
            ? `<button class="btn-eliminar" onclick="eliminarPago('${r.firestoreId}')" title="Eliminar">✕</button>`
            : '';

        return `
        <div class="pago-item" style="border-left:4px solid ${info.color};padding-left:14px;">
            <div class="pago-info">
                <div class="pago-nombre">${r.Pieza}</div>
                <div class="pago-meta">
                    ${r.Fecha} · ${r.Estado} · Cant: ${r.Cantidad}
                    ${r.Factura ? '· Fac: ' + r.Factura : ''}
                </div>
            </div>
            <div class="pago-right">
                <div>
                    <div class="pago-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    <span class="estado-pill" style="background:${info.bg};color:${info.color};">${info.label}</span>
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

/* ─── GRÁFICA ─────────────────────────────────────────── */
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

/* ─── COMPARATIVA MENSUAL ─────────────────────────────── */
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

/* ─── EXCEL ───────────────────────────────────────────── */
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

/* ─── LIMPIAR TODO ────────────────────────────────────── */
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
