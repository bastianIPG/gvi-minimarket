const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { app, BrowserWindow } = require('electron');
let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (_) {
    autoUpdater = null;
}

const server = express();
const PORT = 3000;
const APP_NAME = 'GVI';
const APP_VERSION = (() => {
    try {
        return require('./package.json').version || '0.0.0';
    } catch (_) {
        return '0.0.0';
    }
})();
if (app && app.setName) app.setName(APP_NAME);
const updateState = {
    configured: false,
    checking: false,
    downloading: false,
    ready: false,
    available: false,
    installing: false,
    version: null,
    releaseName: null,
    releaseNotes: null,
    percent: 0,
    message: 'Actualizador listo para configurar.'
};
function normalizeReleaseNotes(notes) {
    if (!notes) return 'Mejoras internas, estabilidad y ajustes del sistema.';
    if (typeof notes === 'string') return notes.replace(/<[^>]*>/g, '').trim() || 'Mejoras internas, estabilidad y ajustes del sistema.';
    if (Array.isArray(notes)) {
        return notes
            .map(item => {
                if (typeof item === 'string') return item;
                return item?.note || item?.notes || item?.version || '';
            })
            .filter(Boolean)
            .join('\n')
            .replace(/<[^>]*>/g, '')
            .trim() || 'Mejoras internas, estabilidad y ajustes del sistema.';
    }
    return String(notes).replace(/<[^>]*>/g, '').trim() || 'Mejoras internas, estabilidad y ajustes del sistema.';
}

function savePendingUpdateNotice() {
    try {
        fs.mkdirSync(path.dirname(UPDATE_NOTICE_FILE), { recursive: true });
        fs.writeFileSync(UPDATE_NOTICE_FILE, JSON.stringify({
            version: updateState.version,
            releaseName: updateState.releaseName,
            releaseNotes: updateState.releaseNotes,
            createdAt: new Date().toISOString(),
            pending: true
        }, null, 2));
    } catch (error) {
        console.error('No se pudo guardar aviso de actualizacion:', error);
    }
}

function readInstalledUpdateNotice() {
    try {
        if (!fs.existsSync(UPDATE_NOTICE_FILE)) return null;
        const notice = JSON.parse(fs.readFileSync(UPDATE_NOTICE_FILE, 'utf-8'));
        if (!notice?.pending || notice.version !== APP_VERSION) return null;
        return notice;
    } catch (_) {
        return null;
    }
}

function dismissInstalledUpdateNotice() {
    try {
        if (!fs.existsSync(UPDATE_NOTICE_FILE)) return;
        const notice = JSON.parse(fs.readFileSync(UPDATE_NOTICE_FILE, 'utf-8'));
        notice.pending = false;
        notice.dismissedAt = new Date().toISOString();
        fs.writeFileSync(UPDATE_NOTICE_FILE, JSON.stringify(notice, null, 2));
    } catch (_) {}
}

function configureAutoUpdater() {
    if (!autoUpdater || !app || !app.isPackaged) {
        updateState.configured = false;
        updateState.message = app && !app.isPackaged
            ? 'Las actualizaciones se prueban desde la version instalada, no desde npm start.'
            : 'electron-updater no esta disponible.';
        return;
    }

    updateState.configured = true;
    updateState.message = 'Listo para buscar actualizaciones.';
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
        updateState.checking = true;
        updateState.installing = false;
        updateState.message = 'Buscando actualizaciones...';
    });

    autoUpdater.on('update-available', (info) => {
        updateState.checking = false;
        updateState.available = true;
        updateState.ready = false;
        updateState.version = info.version;
        updateState.releaseName = info.releaseName || info.version;
        updateState.releaseNotes = normalizeReleaseNotes(info.releaseNotes);
        updateState.percent = 0;
        updateState.message = `Nueva version v${info.version} detectada.`;
    });

    autoUpdater.on('update-not-available', () => {
        updateState.checking = false;
        updateState.available = false;
        updateState.ready = false;
        updateState.downloading = false;
        updateState.installing = false;
        updateState.percent = 0;
        updateState.message = 'GVI ya esta actualizado.';
    });

    autoUpdater.on('download-progress', (progress) => {
        updateState.downloading = true;
        updateState.ready = false;
        updateState.percent = Math.round(progress.percent || 0);
        updateState.message = `Descargando actualizacion: ${updateState.percent}%.`;
    });

    autoUpdater.on('update-downloaded', (info) => {
        updateState.downloading = false;
        updateState.ready = true;
        updateState.available = true;
        updateState.version = info.version;
        updateState.releaseName = info.releaseName || info.version;
        updateState.releaseNotes = normalizeReleaseNotes(info.releaseNotes);
        updateState.percent = 100;
        updateState.message = `Nueva version v${info.version} lista. Puedes actualizar ahora.`;
    });

    autoUpdater.on('error', (error) => {
        updateState.checking = false;
        updateState.downloading = false;
        updateState.installing = false;
        updateState.message = `No se pudo actualizar: ${error.message || error}`;
    });

    // 1. Busqueda automatica al arrancar (con retraso de 8s para no sobrecargar el inicio)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
            console.error("Error en chequeo de actualizaciones al inicio:", err);
        });
    }, 8000);

    // 2. Busqueda periodica cada 4 horas
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
            console.error("Error en chequeo periodico de actualizaciones:", err);
        });
    }, 4 * 60 * 60 * 1000);
}

function getUpdatePayload() {
    return {
        ...updateState,
        currentVersion: APP_VERSION,
        provider: 'GitHub Releases',
        owner: 'bastianIPG',
        repo: 'gvi-minimarket'
    };
}
const DATA_DIR = app && app.getPath ? app.getPath('userData') : path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'database.sqlite');
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');
const ERROR_LOG_FILE = path.join(DATA_DIR, 'errores_sistema.log');
const UPDATE_NOTICE_FILE = path.join(DATA_DIR, 'ultima-actualizacion.json');
let mainWindow = null;
const DEFAULT_USERS = [
    { nombre: 'Pruebas', pin: '1234', rol: 'ADMIN', temporal: true }
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

function leerUsuarios() {
    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        const usuarios = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        return Array.isArray(usuarios) ? usuarios : [];
    } catch (_) {
        return [];
    }
}

function guardarUsuarios(usuarios) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usuarios, null, 2));
}

function findBundledFile(fileName) {
    const candidates = [
        path.join(__dirname, fileName),
        app && process.resourcesPath ? path.join(process.resourcesPath, fileName) : null
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate));
}

async function ensureSchema() {
    // 1. Crear tabla de control de migraciones si no existe
    await db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            run_at TEXT
        );
    `);

    // 2. Definición secuencial de migraciones
    const migrations = [
        {
            version: 1,
            description: "Crear tablas base del sistema (productos, ventas, fiados, cierres, historial)",
            run: async () => {
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
        },
        {
            version: 2,
            description: "Añadir columnas de oferta y mayorista a tabla productos",
            run: async () => {
                await ensureColumn('productos', 'ofertaActiva', 'INTEGER DEFAULT 0');
                await ensureColumn('productos', 'precioOferta', 'INTEGER DEFAULT 0');
                await ensureColumn('productos', 'mayorActivo', 'INTEGER DEFAULT 0');
                await ensureColumn('productos', 'cantidadMayor', 'REAL DEFAULT 0');
                await ensureColumn('productos', 'precioMayor', 'INTEGER DEFAULT 0');
            }
        }
    ];

    // 3. Obtener migraciones ya aplicadas
    const appliedRows = await db.all('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    // 4. Ejecutar migraciones pendientes transaccionalmente
    for (const migration of migrations) {
        if (appliedVersions.has(migration.version)) {
            continue;
        }

        console.log(`[Migraciones] Aplicando migración #${migration.version}: ${migration.description}...`);
        await db.exec('BEGIN TRANSACTION');
        try {
            await migration.run();
            await db.run(
                'INSERT INTO schema_migrations (version, run_at) VALUES (?, ?)',
                [migration.version, new Date().toISOString()]
            );
            await db.exec('COMMIT');
            console.log(`[Migraciones] Migración #${migration.version} aplicada con éxito.`);
        } catch (e) {
            await db.exec('ROLLBACK');
            console.error(`[Migraciones] ERROR al aplicar migración #${migration.version}:`, e);
            throw e;
        }
    }
}

async function ensureColumn(tableName, columnName, definition) {
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    if (!columns.some(col => col.name === columnName)) {
        await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
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
server.get('/productos', (req, res) => res.render('productos'));
server.get('/auditoria', (req, res) => res.render('centroAuditoria'));
server.get('/finanzas', (req, res) => res.render('finanzas'));
server.get('/fiados', (req, res) => res.render('fiados'));
server.get('/cobrar', (req, res) => res.render('cobrar'));
server.get('/configuracion', (req, res) => res.render('configuracion'));

server.get('/api/app/info', (req, res) => {
    res.json({
        name: APP_NAME,
        fullName: 'Gestor de Ventas Intuitivo',
        version: APP_VERSION,
        updateChannel: 'stable',
        updateProvider: 'GitHub Releases',
        updater: getUpdatePayload()
    });
});

server.get('/api/app/update/status', (req, res) => {
    res.json({ success: true, ...getUpdatePayload() });
});

server.get('/api/app/update/notice', (req, res) => {
    res.json({ success: true, notice: readInstalledUpdateNotice() });
});

server.post('/api/app/update/notice/dismiss', (req, res) => {
    dismissInstalledUpdateNotice();
    res.json({ success: true });
});

server.post('/api/app/update/check', async (req, res) => {
    if (!autoUpdater || !app || !app.isPackaged) {
        return res.json({
            success: true,
            ...getUpdatePayload(),
            configured: false,
            title: 'Modo desarrollo',
            message: 'Para probar actualizaciones debes instalar GVI desde el instalador. En npm start no se consulta GitHub Releases.'
        });
    }

    try {
        await autoUpdater.checkForUpdates();
        res.json({ success: true, ...getUpdatePayload(), title: 'Busqueda iniciada' });
    } catch (e) {
        updateState.checking = false;
        updateState.message = `No se pudo buscar actualizaciones: ${e.message || e}`;
        res.status(500).json({ success: false, ...getUpdatePayload() });
    }
});

server.post('/api/app/update/download', async (req, res) => {
    if (!autoUpdater || !app || !app.isPackaged || !updateState.available) {
        return res.status(400).json({
            success: false,
            ...getUpdatePayload(),
            message: 'No hay una actualizacion disponible para descargar.'
        });
    }

    try {
        autoUpdater.downloadUpdate();
        res.json({ success: true, ...getUpdatePayload(), message: 'Descarga iniciada.' });
    } catch (e) {
        updateState.downloading = false;
        updateState.message = `No se pudo descargar: ${e.message || e}`;
        res.status(500).json({ success: false, ...getUpdatePayload() });
    }
});

server.post('/api/app/update/install', (req, res) => {
    if (!autoUpdater || !updateState.ready) {
        return res.status(400).json({
            success: false,
            ...getUpdatePayload(),
            message: 'La actualizacion aun no esta lista para instalar.'
        });
    }

    updateState.installing = true;
    updateState.message = 'Instalando actualizacion. GVI se reiniciara automaticamente...';
    savePendingUpdateNotice();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.__allowClose = true;
    }
    res.json({ success: true });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 300);
});

server.post('/api/app/quit', (req, res) => {
    res.json({ success: true });
    setTimeout(() => {
        if (app && app.quit) app.quit();
        else process.exit(0);
    }, 80);
});

server.post('/api/app/minimize', (req, res) => {
    res.json({ success: true });
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

server.post('/api/session/clear', (req, res) => {
    res.json({ success: true });
});

// --- API DE AUTENTICACIÓN ---
server.get('/api/auth-state', (req, res) => {
    try {
        const usuarios = leerUsuarios();
        res.json({
            hasUsers: usuarios.length > 0,
            users: usuarios.map((u, index) => ({
                id: index,
                nombre: u.nombre,
                rol: u.rol,
                temporal: !!u.temporal
            }))
        });
    } catch (e) {
        logError('Auth State', e);
        res.status(500).json({ hasUsers: false, users: [] });
    }
});

server.post('/api/setup-users', (req, res) => {
    try {
        const { admin, usuarios = [] } = req.body;
        if (!admin || !admin.nombre || !admin.pin) {
            return res.status(400).json({ success: false, message: 'Falta el administrador.' });
        }
        if (!/^\d{4,6}$/.test(String(admin.pin))) {
            return res.status(400).json({ success: false, message: 'El PIN del administrador debe tener 4 a 6 numeros.' });
        }

        const normalizados = [{
            nombre: String(admin.nombre).trim(),
            pin: String(admin.pin),
            rol: 'ADMIN'
        }];

        for (const u of usuarios) {
            if (!u || !u.nombre || !u.pin) continue;
            if (!/^\d{4,6}$/.test(String(u.pin))) {
                return res.status(400).json({ success: false, message: `PIN invalido para ${u.nombre}.` });
            }
            normalizados.push({
                nombre: String(u.nombre).trim(),
                pin: String(u.pin),
                rol: u.rol === 'ADMIN' ? 'ADMIN' : 'CAJA'
            });
        }

        guardarUsuarios(normalizados);
        res.json({ success: true });
    } catch (e) {
        logError('Setup Usuarios', e);
        res.status(500).json({ success: false });
    }
});

server.get('/api/usuarios', (req, res) => {
    try {
        const usuarios = leerUsuarios().map((u, index) => ({
            id: index,
            nombre: u.nombre,
            rol: u.rol,
            temporal: !!u.temporal
        }));
        res.json(usuarios);
    } catch (e) {
        logError('Listar Usuarios', e);
        res.status(500).json([]);
    }
});

server.post('/api/usuarios', (req, res) => {
    try {
        const { nombre, rol, pin } = req.body;
        const nombreLimpio = String(nombre || '').trim();
        const rolFinal = rol === 'ADMIN' ? 'ADMIN' : 'CAJA';
        const pinFinal = String(pin || '').trim();

        if (!nombreLimpio) {
            return res.status(400).json({ success: false, message: 'Ingresa un nombre.' });
        }
        if (!/^\d{4,6}$/.test(pinFinal)) {
            return res.status(400).json({ success: false, message: 'El PIN debe tener 4 a 6 numeros.' });
        }

        const usuarios = leerUsuarios();
        if (usuarios.some(u => String(u.nombre).trim().toLowerCase() === nombreLimpio.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Ya existe un usuario con ese nombre.' });
        }
        if (usuarios.some(u => String(u.pin) === pinFinal)) {
            return res.status(400).json({ success: false, message: 'Ese PIN ya esta en uso.' });
        }

        usuarios.push({ nombre: nombreLimpio, rol: rolFinal, pin: pinFinal });
        guardarUsuarios(usuarios);
        res.json({ success: true });
    } catch (e) {
        logError('Crear Usuario', e);
        res.status(500).json({ success: false, message: 'No se pudo crear el usuario.' });
    }
});

server.post('/api/login', (req, res) => {
    try {
        const pin = req.body.pin;
        const nombre = req.body.nombre;
        const usuarios = leerUsuarios();
        const user = usuarios.find(u => u.pin === pin && (!nombre || u.nombre === nombre));
        
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
        const usuarios = leerUsuarios();
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
        res.json(productos.map(p => ({
            ...p,
            vendidoPorPeso: p.vendidoPorPeso === 1,
            ofertaActiva: p.ofertaActiva === 1,
            mayorActivo: p.mayorActivo === 1,
            precioOferta: Number(p.precioOferta || 0),
            cantidadMayor: Number(p.cantidadMayor || 0),
            precioMayor: Number(p.precioMayor || 0)
        })));
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
    const precioOferta = Number(nuevo.precioOferta || 0);
    const cantidadMayor = Number(nuevo.cantidadMayor || 0);
    const precioMayor = Number(nuevo.precioMayor || 0);
    if (nuevo.ofertaActiva && (!precioOferta || precioOferta < 0)) return res.status(400).json({ success: false, message: 'Precio oferta invalido.' });
    if (nuevo.mayorActivo && (!cantidadMayor || cantidadMayor <= 0 || !precioMayor || precioMayor < 0)) return res.status(400).json({ success: false, message: 'Datos mayoristas invalidos.' });
    if (isNaN(precio) || precio < 0) return res.status(400).json({ success: false, message: 'Precio inválido.' });
    if (isNaN(stock) || stock < 0) return res.status(400).json({ success: false, message: 'Stock inválido.' });

    try {
        await db.run(
            'INSERT INTO productos (codigo, nombre, precio, stock, vendidoPorPeso, ofertaActiva, precioOferta, mayorActivo, cantidadMayor, precioMayor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                nuevo.codigo.trim(),
                nuevo.nombre.trim(),
                precio,
                stock,
                nuevo.vendidoPorPeso ? 1 : 0,
                nuevo.ofertaActiva ? 1 : 0,
                nuevo.ofertaActiva ? precioOferta : 0,
                nuevo.mayorActivo ? 1 : 0,
                nuevo.mayorActivo ? cantidadMayor : 0,
                nuevo.mayorActivo ? precioMayor : 0
            ]
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
    const precioOferta = Number(datos.precioOferta || 0);
    const cantidadMayor = Number(datos.cantidadMayor || 0);
    const precioMayor = Number(datos.precioMayor || 0);
    if (datos.ofertaActiva && (!precioOferta || precioOferta < 0)) return res.status(400).json({ success: false, message: 'Precio oferta invalido.' });
    if (datos.mayorActivo && (!cantidadMayor || cantidadMayor <= 0 || !precioMayor || precioMayor < 0)) return res.status(400).json({ success: false, message: 'Datos mayoristas invalidos.' });
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
            'UPDATE productos SET codigo = ?, nombre = ?, precio = ?, stock = ?, vendidoPorPeso = ?, ofertaActiva = ?, precioOferta = ?, mayorActivo = ?, cantidadMayor = ?, precioMayor = ? WHERE codigo = ?',
            [
                datos.codigo.trim(),
                datos.nombre.trim(),
                precio,
                stock,
                datos.vendidoPorPeso ? 1 : 0,
                datos.ofertaActiva ? 1 : 0,
                datos.ofertaActiva ? precioOferta : 0,
                datos.mayorActivo ? 1 : 0,
                datos.mayorActivo ? cantidadMayor : 0,
                datos.mayorActivo ? precioMayor : 0,
                codigoAnterior
            ]
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
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'build', 'icon.ico')
        : path.join(__dirname, 'build', 'icon.ico');
    const win = new BrowserWindow({
        width: 1180,
        height: 720,
        minWidth: 960,
        minHeight: 640,
        title: "GVI - Gestor de Ventas Intuitivo",
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        fullscreen: true,
        show: false,
        webPreferences: { 
            nodeIntegration: false,    // SEGURIDAD: Previene ejecución de código OS desde la vista
            contextIsolation: true     // SEGURIDAD: Aísla el contexto JS
        }
    });
    mainWindow = win;
    
    // Opcional: Ocultar menú nativo por defecto en Windows/Linux para un look más moderno
    win.setMenuBarVisibility(false);
    win.once('ready-to-show', () => {
        win.setFullScreen(true);
        win.show();
    });

    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            win.setFullScreen(!win.isFullScreen());
            event.preventDefault();
        }
    });

    win.on('close', (event) => {
        if (win.__allowClose) return;
        event.preventDefault();
        win.webContents.executeJavaScript("localStorage.removeItem('gvi_user'); true;")
            .catch(() => null)
            .finally(() => {
                win.__allowClose = true;
                win.close();
            });
    });
    
    win.loadURL(`http://localhost:${PORT}/login`);
}

if (app && app.whenReady) {
    app.whenReady().then(() => {
        configureAutoUpdater();
        createWindow();
    });

    app.on('window-all-closed', () => {
        if (updateState.installing) return;
        process.exit(0); 
    });
}
