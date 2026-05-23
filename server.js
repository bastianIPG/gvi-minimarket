const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { app, BrowserWindow } = require('electron');

const server = express();
const PORT = 3000;
const APP_NAME = 'GVI Minimarket';
if (app && app.setName) app.setName(APP_NAME);
const DATA_DIR = app && app.getPath ? app.getPath('userData') : path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'database.sqlite');
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');
const ERROR_LOG_FILE = path.join(DATA_DIR, 'errores_sistema.log');
const DEFAULT_USERS = [
    { nombre: 'Administrador', pin: '1234', rol: 'ADMIN' },
    { nombre: 'Caja 1', pin: '0000', rol: 'CAJA' }
];

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seedFileIfMissing(fileName, targetPath, defaultContent) {
    if (fs.existsSync(targetPath)) return;

    const sourcePath = findBundledFile(fileName);
    if (sourcePath) {
        fs.copyFileSync(sourcePath, targetPath);
        return;
    }

    fs.writeFileSync(targetPath, JSON.stringify(defaultContent, null, 2));
}

function prepareRuntimeData() {
    ensureDataDir();
    seedFileIfMissing('usuarios.json', USERS_FILE, DEFAULT_USERS);

    if (!fs.existsSync(DB_FILE)) {
        const sourceDb = findBundledFile('database.sqlite');
        if (sourceDb) fs.copyFileSync(sourceDb, DB_FILE);
    }
}

function findBundledFile(fileName) {
    const candidates = [
        path.join(__dirname, fileName),
        app && process.resourcesPath ? path.join(process.resourcesPath, fileName) : null
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate));
}

async function ensureSchema() {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS productos (
            codigo TEXT PRIMARY KEY,
            nombre TEXT,
            precio INTEGER,
            stock REAL,
            vendidoPorPeso INTEGER
        );

        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY,
            fecha TEXT,
            hora TEXT,
            metodoPago TEXT,
            total INTEGER,
            pagoCon INTEGER,
            vuelto INTEGER,
            items TEXT
        );

        CREATE TABLE IF NOT EXISTS fiados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente TEXT,
            fecha TEXT,
            total INTEGER,
            estado TEXT,
            items TEXT
        );

        CREATE TABLE IF NOT EXISTS cierres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT,
            hora TEXT,
            baseEfec INTEGER,
            sisEfec INTEGER,
            fisEfec INTEGER,
            sisTarj INTEGER,
            fisTarj INTEGER,
            difEfec INTEGER,
            difTarj INTEGER,
            obs TEXT
        );

        CREATE TABLE IF NOT EXISTS historial (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER,
            fecha TEXT,
            hora TEXT,
            accion TEXT,
            detalle TEXT
        );
    `);
}

prepareRuntimeData();

server.use(express.json());

// Configuración de EJS
server.set('view engine', 'ejs');
server.set('views', path.join(__dirname, 'views'));

// Carpeta de archivos estáticos
server.use(express.static(path.join(__dirname, 'public')));

// --- RUTAS DE VISTAS ---
server.get('/login', (req, res) => res.render('login'));
server.get('/', (req, res) => res.render('index'));
server.get('/caja', (req, res) => res.render('caja'));
server.get('/bodega', (req, res) => res.render('bodega'));
server.get('/auditoria', (req, res) => res.render('centroAuditoria'));
server.get('/finanzas', (req, res) => res.render('finanzas'));
server.get('/fiados', (req, res) => res.render('fiados'));
server.get('/cobrar', (req, res) => res.render('cobrar'));
server.get('/configuracion', (req, res) => res.render('configuracion'));

// --- API DE AUTENTICACIÓN ---
server.post('/api/login', (req, res) => {
    try {
        const pin = req.body.pin;
        const archivoUsuarios = USERS_FILE;
        
        if (!fs.existsSync(archivoUsuarios)) {
            return res.status(500).json({ success: false, message: 'Archivo de usuarios no encontrado.' });
        }
        
        const usuarios = JSON.parse(fs.readFileSync(archivoUsuarios, 'utf-8'));
        const user = usuarios.find(u => u.pin === pin);
        
        if (user) {
            res.json({ success: true, user: { nombre: user.nombre, rol: user.rol } });
        } else {
            res.status(401).json({ success: false, message: 'PIN incorrecto' });
        }
    } catch (e) {
        logError('Login', e);
        res.status(500).json({ success: false });
    }
});

server.post('/api/verify-admin', (req, res) => {
    try {
        const pin = req.body.pin;
        const archivoUsuarios = USERS_FILE;
        
        if (!fs.existsSync(archivoUsuarios)) return res.json({ success: false });
        
        const usuarios = JSON.parse(fs.readFileSync(archivoUsuarios, 'utf-8'));
        const admin = usuarios.find(u => u.pin === pin && u.rol === 'ADMIN');
        
        if (admin) res.json({ success: true });
        else res.json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

server.get('/api/info-red', (req, res) => {
    res.json({ ip: obtenerIPLocal() });
});

// Ruta para descargar respaldo total (SQLite)
server.get('/api/backup', (req, res) => {
    try {
        const dbFile = DB_FILE;
        if (!fs.existsSync(dbFile)) {
            return res.status(404).send("Base de datos no encontrada.");
        }

        const fecha = new Date().toISOString().split('T')[0];
        const nombreArchivo = `RESPALDO_GVI_${fecha}.sqlite`;

        res.download(dbFile, nombreArchivo);
    } catch (e) {
        res.status(500).send("Error descargando respaldo: " + e.message);
    }
});

// --- SISTEMA DE LOGS DE ERRORES ---
const logError = (origen, error) => {
    const timestamp = new Date().toISOString();
    const mensaje = `[${timestamp}] ERROR en ${origen}: ${error.message || error}\n`;
    fs.appendFileSync(ERROR_LOG_FILE, mensaje);
    console.error(`❌ ERROR en ${origen}:`, error);
};

// --- BASE DE DATOS (SQLITE) ---
let db;
(async () => {
    try {
        db = await open({
            filename: DB_FILE,
            driver: sqlite3.Database
        });
        await ensureSchema();
    } catch (e) {
        logError('Inicio BD', e);
        process.exit(1); // Detener si no hay base de datos
    }
})();

// Función de Auditoría
async function registrarHistorial(accion, detalle) {
    try {
        const ahora = new Date();
        await db.run(
            'INSERT INTO historial (timestamp, fecha, hora, accion, detalle) VALUES (?, ?, ?, ?, ?)',
            [ahora.getTime(), ahora.toLocaleDateString('es-CL'), ahora.toLocaleTimeString('es-CL'), accion, detalle]
        );
        // Autolimpieza 6 meses
        const seisMesesMs = 180 * 24 * 60 * 60 * 1000;
        const limite = ahora.getTime() - seisMesesMs;
        await db.run('DELETE FROM historial WHERE timestamp < ?', [limite]);
    } catch (e) { logError("Auditoría Historial", e); }
}

// ==========================================
// API DE PRODUCTOS Y BODEGA
// ==========================================
server.get('/api/productos', async (req, res) => {
    try {
        const productos = await db.all('SELECT * FROM productos');
        res.json(productos.map(p => ({ ...p, vendidoPorPeso: p.vendidoPorPeso === 1 })));
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

server.post('/api/productos', async (req, res) => {
    const nuevo = req.body;
    // VALIDACIÓN ESTRICTA
    if (!nuevo.codigo || typeof nuevo.codigo !== 'string' || nuevo.codigo.trim() === '') {
        return res.status(400).json({ success: false, message: 'Código inválido.' });
    }
    if (!nuevo.nombre || typeof nuevo.nombre !== 'string' || nuevo.nombre.trim() === '') {
        return res.status(400).json({ success: false, message: 'Nombre inválido.' });
    }
    const precio = Number(nuevo.precio);
    const stock = Number(nuevo.stock);
    if (isNaN(precio) || precio < 0) return res.status(400).json({ success: false, message: 'Precio inválido.' });
    if (isNaN(stock) || stock < 0) return res.status(400).json({ success: false, message: 'Stock inválido.' });

    try {
        await db.run(
            'INSERT INTO productos (codigo, nombre, precio, stock, vendidoPorPeso) VALUES (?, ?, ?, ?, ?)',
            [nuevo.codigo.trim(), nuevo.nombre.trim(), precio, stock, nuevo.vendidoPorPeso ? 1 : 0]
        );
        await registrarHistorial("NUEVO", `Se agregó "${nuevo.nombre}" con stock de ${stock} un.`);
        res.json({ success: true });
    } catch (error) { 
        if(error.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ success: false, message: 'El código de barras ya existe.' });
        }
        logError('Crear Producto', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' }); 
    }
});

server.put('/api/productos/:codigoAnterior', async (req, res) => {
    const { codigoAnterior } = req.params;
    const datos = req.body;

    // VALIDACIÓN ESTRICTA
    if (!datos.codigo || !datos.nombre) return res.status(400).json({ success: false, message: 'Faltan datos requeridos.' });
    const precio = Number(datos.precio);
    const stock = Number(datos.stock);
    if (isNaN(precio) || precio < 0 || isNaN(stock) || stock < 0) {
        return res.status(400).json({ success: false, message: 'Valores numéricos inválidos.' });
    }

    try {
        const prodViejo = await db.get('SELECT * FROM productos WHERE codigo = ?', [codigoAnterior]);
        if (!prodViejo) return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
        
        let cambios = [];
        if(prodViejo.precio !== precio) cambios.push(`Precio: $${prodViejo.precio} ➔ $${precio}`);
        if(prodViejo.stock !== stock) cambios.push(`Stock: ${prodViejo.stock} ➔ ${stock}`);
        
        await db.run(
            'UPDATE productos SET codigo = ?, nombre = ?, precio = ?, stock = ?, vendidoPorPeso = ? WHERE codigo = ?',
            [datos.codigo.trim(), datos.nombre.trim(), precio, stock, datos.vendidoPorPeso ? 1 : 0, codigoAnterior]
        );
        await registrarHistorial("EDITAR", `Se editó "${datos.nombre}". ${cambios.join(" | ")}`);
        res.json({ success: true });
    } catch (error) { 
        logError('Editar Producto', error);
        res.status(500).json({ success: false }); 
    }
});

server.delete('/api/productos/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const eliminado = await db.get('SELECT nombre FROM productos WHERE codigo = ?', [codigo]);
        if (eliminado) {
            await db.run('DELETE FROM productos WHERE codigo = ?', [codigo]);
            await registrarHistorial("ELIMINAR", `Se eliminó: "${eliminado.nombre}"`);
            res.json({ success: true });
        } else { res.status(404).json({ success: false }); }
    } catch (error) { 
        logError('Eliminar Producto', error);
        res.status(500).json({ success: false }); 
    }
});

// ==========================================
// API DE VENTAS Y FINANZAS
// ==========================================
server.get('/api/ventas', async (req, res) => {
    try {
        const ventas = await db.all('SELECT * FROM ventas ORDER BY id DESC');
        res.json(ventas.map(v => ({ ...v, items: JSON.parse(v.items || '[]') })));
    } catch (e) { res.json([]); }
});

server.post('/api/vender', async (req, res) => {
    const { items, total, metodoPago, pagoCon, vuelto } = req.body;
    
    // VALIDACIÓN ESTRICTA
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'La venta no tiene productos.' });
    }
    const totalNum = Number(total);
    if (isNaN(totalNum) || totalNum < 0) {
        return res.status(400).json({ success: false, message: 'Total de venta inválido.' });
    }

    try {
        await db.exec('BEGIN TRANSACTION');
        
        const r = await db.run(
            'INSERT INTO ventas (fecha, hora, metodoPago, total, pagoCon, vuelto, items) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [new Date().toLocaleDateString('es-CL'), new Date().toLocaleTimeString('es-CL'), metodoPago, totalNum, Number(pagoCon) || 0, Number(vuelto) || 0, JSON.stringify(items)]
        );
        const nuevaVentaId = r.lastID;

        for (const item of items) {
            const cant = Number(item.cantidad);
            if(isNaN(cant) || cant <= 0) throw new Error(`Cantidad inválida para producto ${item.codigo}`);
            await db.run('UPDATE productos SET stock = stock - ? WHERE codigo = ?', [cant, item.codigo]);
        }

        await db.exec('COMMIT');
        
        await registrarHistorial("VENTA", `Venta #${nuevaVentaId} por $${totalNum.toLocaleString('es-CL')}`);
        res.json({ success: true, ventaId: nuevaVentaId });
    } catch (error) { 
        await db.exec('ROLLBACK');
        logError('Realizar Venta', error);
        res.status(500).json({ success: false, message: 'Error procesando la venta.' }); 
    }
});

// ==========================================
// API DE CIERRES
// ==========================================
server.get('/api/cierres', async (req, res) => {
    try {
        const cierres = await db.all('SELECT * FROM cierres ORDER BY id DESC');
        res.json(cierres);
    } catch (e) { res.json([]); }
});

server.post('/api/cierres', async (req, res) => {
    try {
        const c = req.body;
        const r = await db.run(
            'INSERT INTO cierres (fecha, hora, baseEfec, sisEfec, fisEfec, sisTarj, fisTarj, difEfec, difTarj, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [new Date().toLocaleDateString('es-CL'), new Date().toLocaleTimeString('es-CL'), c.baseEfec, c.sisEfec, c.fisEfec, c.sisTarj, c.fisTarj, c.difEfec, c.difTarj, c.obs]
        );
        const difTexto = c.difEfec ? c.difEfec.toLocaleString('es-CL') : "0";
        await registrarHistorial("CIERRE", `Cierre #${r.lastID}. Dif: $${difTexto}`);
        res.json({ success: true });
    } catch (e) { 
        console.error("Error en cierre:", e);
        res.status(500).json({ success: false }); 
    }
});

// ==========================================
// API DE FIADOS
// ==========================================
server.get('/api/fiados', async (req, res) => {
    try {
        const fiados = await db.all('SELECT * FROM fiados ORDER BY id DESC');
        res.json(fiados.map(f => ({ ...f, items: JSON.parse(f.items || '[]') })));
    } catch (e) { res.json([]); }
});

server.post('/api/fiados', async (req, res) => {
    const { cliente, items, total } = req.body;
    const nombreNormalizado = cliente.trim().toUpperCase();
    const fechaHoy = new Date().toLocaleDateString('es-CL');

    try {
        await db.exec('BEGIN TRANSACTION');
        
        const cuentaExistente = await db.get('SELECT * FROM fiados WHERE cliente = ? AND estado = ?', [nombreNormalizado, 'PENDIENTE']);
        const itemsConFecha = items.map(i => ({ ...i, fechaMov: fechaHoy }));

        if (cuentaExistente) {
            const currentItems = JSON.parse(cuentaExistente.items || '[]');
            currentItems.push(...itemsConFecha);
            const nuevoTotal = cuentaExistente.total + total;
            await db.run('UPDATE fiados SET total = ?, items = ? WHERE id = ?', [nuevoTotal, JSON.stringify(currentItems), cuentaExistente.id]);
        } else {
            await db.run(
                'INSERT INTO fiados (cliente, fecha, total, estado, items) VALUES (?, ?, ?, ?, ?)',
                [nombreNormalizado, fechaHoy, total, "PENDIENTE", JSON.stringify(itemsConFecha)]
            );
        }

        for (const item of items) {
            await db.run('UPDATE productos SET stock = stock - ? WHERE codigo = ?', [item.cantidad, item.codigo]);
        }

        await db.exec('COMMIT');
        await registrarHistorial("FIADO", `Fiado de $${total.toLocaleString('es-CL')} para ${nombreNormalizado}`);
        res.json({ success: true });
    } catch (e) { 
        await db.exec('ROLLBACK');
        console.error("Error al registrar fiado:", e);
        res.status(500).json({ success: false }); 
    }
});

server.post('/api/fiados/pagar', async (req, res) => {
    const { id, metodoPago, pagoCon, vuelto } = req.body;
    try {
        await db.exec('BEGIN TRANSACTION');
        
        const deuda = await db.get('SELECT * FROM fiados WHERE id = ?', [id]);
        if (!deuda) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ success: false });
        }

        await db.run('UPDATE fiados SET estado = ? WHERE id = ?', ['PAGADO', id]);
        
        const r = await db.run(
            'INSERT INTO ventas (fecha, hora, metodoPago, total, pagoCon, vuelto, items) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [new Date().toLocaleDateString('es-CL'), new Date().toLocaleTimeString('es-CL'), metodoPago, deuda.total, pagoCon || 0, vuelto || 0, deuda.items]
        );

        await db.exec('COMMIT');
        await registrarHistorial("PAGO-FIADO", `${deuda.cliente} pagó su cuenta total de $${deuda.total.toLocaleString('es-CL')}`);
        res.json({ success: true, ventaId: r.lastID });
    } catch (e) { 
        await db.exec('ROLLBACK');
        res.status(500).json({ success: false }); 
    }
});

// ==========================================
// API DE PEDIDOS (COLA RECOLECTOR → CAJERO)
// ==========================================
let pedidosEnMemoria = [];

server.get('/api/pedidos', (req, res) => {
    res.json(pedidosEnMemoria);
});

server.get('/api/pedidos/:id', (req, res) => {
    const p = pedidosEnMemoria.find(x => x.id === Number(req.params.id));
    if (!p) return res.status(404).json({ success: false });
    res.json(p);
});

server.post('/api/pedidos', (req, res) => {
    try {
        const { items, total, etiqueta } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ success: false, message: "Pedido vacío" });
        
        const ahora = new Date();
        let etiquetaFinal = (etiqueta || '').trim();
        if (!etiquetaFinal) {
            const numeros = pedidosEnMemoria.map(p => {
                const m = (p.etiqueta || '').match(/^Cliente\s+(\d+)$/i);
                return m ? Number(m[1]) : 0;
            });
            const siguiente = (numeros.length === 0 ? 0 : Math.max(...numeros)) + 1;
            etiquetaFinal = `Cliente ${siguiente}`;
        }

        const nuevo = {
            id: Date.now(),
            etiqueta: etiquetaFinal,
            items, total,
            timestamp: ahora.getTime(),
            fecha: ahora.toLocaleDateString('es-CL'),
            hora: ahora.toLocaleTimeString('es-CL')
        };

        pedidosEnMemoria.unshift(nuevo);
        registrarHistorial("PEDIDO", `Nuevo pedido "${etiquetaFinal}" con ${items.length} items`);
        res.json({ success: true, pedido: nuevo });
    } catch (e) { res.status(500).json({ success: false }); }
});

server.put('/api/pedidos/:id', (req, res) => {
    const id = Number(req.params.id);
    const { items, total, etiqueta } = req.body;
    const idx = pedidosEnMemoria.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false });

    if (items !== undefined) pedidosEnMemoria[idx].items = items;
    if (total !== undefined) pedidosEnMemoria[idx].total = total;
    if (etiqueta !== undefined) pedidosEnMemoria[idx].etiqueta = etiqueta;
    res.json({ success: true });
});

server.delete('/api/pedidos/:id', (req, res) => {
    const id = Number(req.params.id);
    const cancelado = pedidosEnMemoria.find(p => p.id === id);
    if (!cancelado) return res.status(404).json({ success: false });

    pedidosEnMemoria = pedidosEnMemoria.filter(p => p.id !== id);
    registrarHistorial("PEDIDO-CANCEL", `Pedido "${cancelado.etiqueta}" cancelado`);
    res.json({ success: true });
});

server.post('/api/pedidos/:id/cobrar', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { metodoPago, pagoCon, vuelto } = req.body;
        
        const pedido = pedidosEnMemoria.find(p => p.id === id);
        if (!pedido) return res.status(404).json({ success: false });

        await db.exec('BEGIN TRANSACTION');

        const r = await db.run(
            'INSERT INTO ventas (fecha, hora, metodoPago, total, pagoCon, vuelto, items) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [new Date().toLocaleDateString('es-CL'), new Date().toLocaleTimeString('es-CL'), metodoPago, pedido.total, pagoCon || 0, vuelto || 0, JSON.stringify(pedido.items)]
        );

        for (const item of pedido.items) {
            await db.run('UPDATE productos SET stock = stock - ? WHERE codigo = ?', [item.cantidad, item.codigo]);
        }

        await db.exec('COMMIT');

        pedidosEnMemoria = pedidosEnMemoria.filter(p => p.id !== id);
        await registrarHistorial("VENTA", `Venta #${r.lastID} (${pedido.etiqueta}) por $${pedido.total.toLocaleString('es-CL')}`);
        res.json({ success: true, ventaId: r.lastID });
    } catch (e) {
        await db.exec('ROLLBACK');
        console.error("Error cobrando pedido:", e);
        res.status(500).json({ success: false });
    }
});

// ==========================================
// AUDITORÍA
// ==========================================
server.get('/api/historial', async (req, res) => {
    try {
        const historial = await db.all('SELECT * FROM historial ORDER BY id DESC');
        res.json(historial);
    } catch (error) { res.status(500).json({ error: "Error" }); }
});


// --- LEVANTAR SERVIDOR ---
function obtenerIPLocal() {
    const interfaces = require('os').networkInterfaces();
    for (const nombre of Object.keys(interfaces)) {
        for (const iface of interfaces[nombre]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return null;
}

server.listen(PORT, '0.0.0.0', () => {
    const ip = obtenerIPLocal();
    console.log(`🚀 Servidor GVI corriendo:`);
    console.log(`   • Local (Electron):     http://localhost:${PORT}`);
    if (ip) {
        console.log(`   • Red Local (PC 2):     http://${ip}:${PORT}`);
    }
});

// --- CONFIGURACIÓN ELECTRON ---
function createWindow() {
    const win = new BrowserWindow({
        width: 1280, height: 800,
        title: "GVI - Gestor de Ventas Intuitivo",
        webPreferences: { 
            nodeIntegration: false,    // SEGURIDAD: Previene ejecución de código OS desde la vista
            contextIsolation: true     // SEGURIDAD: Aísla el contexto JS
        }
    });
    
    // Opcional: Ocultar menú nativo por defecto en Windows/Linux para un look más moderno
    win.setMenuBarVisibility(false);
    
    win.loadURL(`http://localhost:${PORT}`);
}

if (app && app.whenReady) {
    app.whenReady().then(createWindow);

    app.on('window-all-closed', () => {
        process.exit(0); 
    });
}
