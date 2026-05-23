# GVI Minimarket

Aplicacion de escritorio para gestion de ventas, caja, bodega, fiados y auditoria.

## Ejecutar en desarrollo

```powershell
npm start
```

La aplicacion abre una ventana de Electron y tambien queda disponible en:

```text
http://localhost:3000
```

## Crear instalador de Windows

```powershell
npm run dist
```

El instalador queda en:

```text
dist/GVI Minimarket Setup 2.0.0.exe
```

## Datos locales

La base de datos, usuarios y logs se guardan en la carpeta de datos del usuario de Windows. Esto permite actualizar o reinstalar la aplicacion sin borrar ventas ni productos.

Usuarios iniciales si no existe configuracion previa:

```text
Administrador: 1234
Caja 1:        0000
```

## GitHub

Subir a GitHub solo el codigo fuente. No subir `node_modules`, `dist`, bases de datos, ventas, certificados ni logs.

Flujo recomendado:

1. Crear repositorio privado en GitHub.
2. Subir el proyecto.
3. Crear versiones con tags como `v2.0.0`.
4. Publicar el instalador desde `dist` en GitHub Releases.
5. Mas adelante agregar actualizaciones automaticas desde GitHub Releases.
