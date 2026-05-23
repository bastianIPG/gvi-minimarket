const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log("🚀 Iniciando migración a SQLite...");
    
    const dbPath = path.join(__dirname, 'database.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log("📦 Creando tablas...");
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

    // Limpiar tablas para la migración si ya existían
    await db.exec('DELETE FROM productos; DELETE FROM ventas; DELETE FROM fiados; DELETE FROM cierres; DELETE FROM historial;');

    // Helper para leer JSON
    function leerJson(archivo) {
        const p = path.join(__dirname, archivo);
        if (fs.existsSync(p)) {
            const data = fs.readFileSync(p, 'utf-8');
            if (data.trim() !== '') return JSON.parse(data);
        }
        return [];
    }

    console.log("📥 Migrando Productos...");
    const productos = leerJson('productos.json');
    for (const p of productos) {
        await db.run(
            'INSERT OR IGNORE INTO productos (codigo, nombre, precio, stock, vendidoPorPeso) VALUES (?, ?, ?, ?, ?)',
            [p.codigo, p.nombre, p.precio, p.stock, p.vendidoPorPeso ? 1 : 0]
        );
    }

    console.log("📥 Migrando Ventas...");
    const ventas = leerJson('ventas.json');
    for (const v of ventas) {
        await db.run(
            'INSERT OR IGNORE INTO ventas (id, fecha, hora, metodoPago, total, pagoCon, vuelto, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [v.id, v.fecha, v.hora, v.metodoPago, v.total, v.pagoCon || 0, v.vuelto || 0, JSON.stringify(v.items || [])]
        );
    }

    console.log("📥 Migrando Fiados...");
    const fiados = leerJson('fiados.json');
    for (const f of fiados) {
        // En los fiados viejos no había id, usamos auto-increment
        await db.run(
            'INSERT INTO fiados (cliente, fecha, total, estado, items) VALUES (?, ?, ?, ?, ?)',
            [f.cliente, f.fecha || new Date().toLocaleDateString('es-CL'), f.total, f.estado, JSON.stringify(f.items || [])]
        );
    }

    console.log("📥 Migrando Cierres...");
    const cierres = leerJson('cierres.json');
    for (const c of cierres) {
        await db.run(
            'INSERT INTO cierres (fecha, hora, baseEfec, sisEfec, fisEfec, sisTarj, fisTarj, difEfec, difTarj, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [c.fecha, c.hora, c.baseEfec, c.sisEfec, c.fisEfec, c.sisTarj, c.fisTarj, c.difEfec, c.difTarj, c.obs]
        );
    }

    console.log("📥 Migrando Historial...");
    const historial = leerJson('historial.json');
    for (const h of historial) {
        await db.run(
            'INSERT INTO historial (timestamp, fecha, hora, accion, detalle) VALUES (?, ?, ?, ?, ?)',
            [h.timestamp, h.fecha, h.hora, h.accion, h.detalle]
        );
    }

    console.log("✅ ¡Migración completada exitosamente!");
}

migrate().catch(console.error);
