let inventario = JSON.parse(localStorage.getItem('datosInventario')) || [];
let userActual  = null;
let miGrafica   = null;

const CLAVES = {
    guillermo: 'Guillermo123456',
    admin:     'Admin.2026',
    oficina:   'Oficina.2026'
};

/* ─── PRECIO ──────────────────────────────────────────── */
function cambiarEtiquetaPrecio() {
    const modo = document.getElementById('modoPrecio').value;
    document.getElementById('labelMonto').innerText =
        modo === 'unitario' ? 'Precio por Unidad ($)' : 'Precio Total de Factura ($)';
}

/* ─── LOGIN / LOGOUT ──────────────────────────────────── */
function login() {
    const user = document.getElementById('userSelect').value;
    const pass = document.getElementById('passInput').value;

    if (pass !== CLAVES[user]) {
        alert('Contraseña incorrecta.');
        return;
    }

    userActual = user;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');

    const nombres = { guillermo: 'Guillermo', admin: 'Administrador', oficina: 'Oficina' };
    document.getElementById('welcomeText').innerText = 'Hola, ' + nombres[user];

    const badge = document.getElementById('badge');
    const colores = { guillermo: '#c8860a', admin: '#7a4a20', oficina: '#1a6080' };
    const etiquetas = { guillermo: 'Carga', admin: 'Acceso Total', oficina: 'Pagos' };
    badge.innerText = etiquetas[user];
    badge.style.backgroundColor = colores[user];

    // Mostrar tabs según perfil
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active');
        t.classList.add('hidden');
    });

    if (user === 'guillermo') {
        mostrarTabs(['tab-carga', 'tab-historial']);
        activarTab('tab-carga');
    } else if (user === 'admin') {
        mostrarTabs(['tab-carga', 'tab-historial', 'tab-admin']);
        activarTab('tab-carga');
        setTimeout(initChart, 100);
        actualizarComparador();
    } else if (user === 'oficina') {
        mostrarTabs(['tab-pagos']);
        activarTab('tab-pagos');
        renderPagos('todos');
    }
}

function logout() { location.reload(); }

function mostrarTabs(ids) {
    ids.forEach(id => {
        const btn = document.querySelector(`[data-tab="${id}"]`);
        if (btn) btn.classList.remove('hidden');
    });
}

function activarTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.classList.add('hidden');
    });

    const btn = document.querySelector(`[data-tab="${id}"]`);
    const content = document.getElementById(id);
    if (btn) btn.classList.add('active');
    if (content) {
        content.classList.remove('hidden');
        content.classList.add('active');
    }

    if (id === 'tab-historial') renderHistorial();
    if (id === 'tab-pagos')    renderPagos('todos');
    if (id === 'tab-admin')    { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ─── REGISTRAR PIEZA ─────────────────────────────────── */
function agregarDato() {
    const nombre = document.getElementById('nombrePieza').value.trim();
    const cant   = parseInt(document.getElementById('cantidad').value) || 0;
    const monto  = parseFloat(document.getElementById('valor').value) || 0;
    const modo   = document.getElementById('modoPrecio').value;

    if (!nombre || cant <= 0 || monto <= 0) {
        alert('Completá los datos de Pieza, Cantidad y Monto.');
        return;
    }

    let precioUnitario, precioTotal;
    if (modo === 'unitario') {
        precioUnitario = monto;
        precioTotal    = monto * cant;
    } else {
        precioTotal    = monto;
        precioUnitario = monto / cant;
    }

    const ahora = new Date();
    const registro = {
        id:           Date.now(),
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
        Pagado:       false
    };

    inventario.push(registro);
    guardar();
    alert('¡Registro exitoso!');

    ['nombrePieza', 'codigoPieza', 'numFactura', 'valor', 'descripcion'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('cantidad').value = '1';
}

/* ─── HISTORIAL (Guillermo / Admin) ──────────────────────*/
function renderHistorial() {
    const lista = document.getElementById('historialList');
    if (!lista) return;

    // Guillermo ve solo los suyos; admin ve todos
    const items = userActual === 'admin'
        ? [...inventario].reverse()
        : [...inventario].filter(r => r.Usuario === 'guillermo').reverse();

    if (items.length === 0) {
        lista.innerHTML = '<p class="historial-empty">No hay registros todavía.</p>';
        return;
    }

    lista.innerHTML = items.slice(0, 50).map(r => `
        <div class="historial-item">
            <div class="historial-info">
                <div class="historial-nombre">${r.Pieza}</div>
                <div class="historial-meta">
                    ${r.Estado} · Cant: ${r.Cantidad}
                    ${r.Factura ? '· Fac: ' + r.Factura : ''}
                    ${r.Codigo  ? '· Cód: ' + r.Codigo  : ''}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div class="historial-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                <div class="historial-fecha">${r.Fecha} ${r.Hora}</div>
            </div>
        </div>
    `).join('');
}

/* ─── PAGOS (Oficina) ─────────────────────────────────── */
let filtroActual = 'todos';

function renderPagos(filtro) {
    filtroActual = filtro;

    // Actualizar botones de filtro
    document.querySelectorAll('.filtro-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filtro === filtro);
    });

    const lista   = document.getElementById('pagosList');
    const resumen = document.getElementById('pagosResumen');
    if (!lista) return;

    const total    = inventario.length;
    const pagados  = inventario.filter(r => r.Pagado).length;
    const pendientes = total - pagados;
    const sumaPagada   = inventario.filter(r => r.Pagado).reduce((a, r) => a + parseFloat(r.Total), 0);
    const sumaPendiente= inventario.filter(r => !r.Pagado).reduce((a, r) => a + parseFloat(r.Total), 0);

    if (resumen) {
        resumen.innerHTML = `
            <div class="resumen-card">
                <div class="resumen-label">Total registros</div>
                <div class="resumen-valor">${total}</div>
            </div>
            <div class="resumen-card pagado-card">
                <div class="resumen-label">Pagado</div>
                <div class="resumen-valor">$${sumaPagada.toLocaleString('es-AR', {maximumFractionDigits:0})}</div>
            </div>
            <div class="resumen-card pendiente-card">
                <div class="resumen-label">Pendiente</div>
                <div class="resumen-valor">$${sumaPendiente.toLocaleString('es-AR', {maximumFractionDigits:0})}</div>
            </div>
        `;
    }

    let items = [...inventario].reverse();
    if (filtro === 'pagados')   items = items.filter(r => r.Pagado);
    if (filtro === 'pendientes') items = items.filter(r => !r.Pagado);

    if (items.length === 0) {
        lista.innerHTML = '<p class="pagos-empty">No hay registros en esta categoría.</p>';
        return;
    }

    lista.innerHTML = items.map(r => `
        <div class="pago-item ${r.Pagado ? 'pagado' : ''}" id="pago-${r.id}">
            <div class="pago-info">
                <div class="pago-nombre">${r.Pieza}</div>
                <div class="pago-meta">
                    ${r.Fecha} · ${r.Estado} · Cant: ${r.Cantidad}
                    ${r.Factura ? '· Fac: ' + r.Factura : ''}
                </div>
            </div>
            <div class="pago-right">
                <div class="pago-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                <button class="pago-toggle ${r.Pagado ? 'pagado-btn' : ''}" onclick="togglePago(${r.id})">
                    <span class="pago-dot"></span>
                    ${r.Pagado ? 'Pagado' : 'Pendiente'}
                </button>
            </div>
        </div>
    `).join('');
}

function togglePago(id) {
    const idx = inventario.findIndex(r => r.id === id);
    if (idx === -1) return;
    inventario[idx].Pagado = !inventario[idx].Pagado;
    guardar();
    renderPagos(filtroActual);
}

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
    const wb   = XLSX.utils.book_new();
    const meses = [...new Set(inventario.map(r => r.Mes))];
    meses.forEach(mes => {
        const ws = XLSX.utils.json_to_sheet(inventario.filter(r => r.Mes === mes));
        XLSX.utils.book_append_sheet(wb, ws, mes.toUpperCase());
    });
    XLSX.writeFile(wb, 'Inventario_RomeroPanificados.xlsx');
}

/* ─── LIMPIAR ─────────────────────────────────────────── */
function limpiarTodo() {
    if (confirm('¿Borrar todo el historial? Esta acción no se puede deshacer.')) {
        localStorage.removeItem('datosInventario');
        location.reload();
    }
}

/* ─── GUARDAR ─────────────────────────────────────────── */
function guardar() {
    localStorage.setItem('datosInventario', JSON.stringify(inventario));
}