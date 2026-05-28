# Guía Profesional de Firma de Código (Code Signing) en Windows

Al distribuir aplicaciones de escritorio para Windows, los usuarios suelen encontrarse con la advertencia azul de **Windows SmartScreen** ("Editor Desconocido" o "Windows protegió su PC"). Para eliminar esta advertencia y ofrecer una experiencia de instalación premium y de confianza corporativa, es necesario **firmar digitalmente el archivo ejecutable (`.exe`)**.

Esta guía técnica explica paso a paso cómo adquirir, configurar e integrar una firma digital en el flujo de compilación de GVI utilizando `electron-builder`.

---

## 1. ¿Por qué es necesaria la firma de código?
* **Elimina SmartScreen:** Windows confía de inmediato en los ejecutables firmados por editores verificados.
* **Integridad del software:** Garantiza que el código no ha sido modificado ni corrompido por terceros desde que fue empaquetado.
* **Reputación de marca:** Muestra el nombre de tu empresa u organización como "Editor Verificado" al ejecutar el instalador.

---

## 2. Tipos de Certificados de Firma de Código
Puedes comprar certificados a través de entidades certificadoras oficiales (CA) como **Sectigo, DigiCert o Certera**. Existen dos niveles principales:

1. **Firma Estándar (Standard Code Signing):**
   * *Cómo funciona:* Valida la identidad del editor, pero requiere acumular "reputación" de descargas en la red de Microsoft antes de eliminar por completo el SmartScreen (suele tardar unos días/semanas dependiendo del volumen).
   * *Formato:* Generalmente se entrega en un archivo `.pfx`.
2. **Firma EV (Extended Validation Code Signing) - Recomendado:**
   * *Cómo funciona:* Requiere una validación de identidad empresarial más estricta. **Elimina de forma instantánea e inmediata la advertencia de SmartScreen desde la primera descarga.**
   * *Formato:* Se almacena en tokens de hardware USB físicos (HSM) o a través de servicios en la nube seguros (eSigner).

---

## 3. Configuración en `electron-builder`

`electron-builder` tiene soporte nativo para firmar ejecutables en Windows utilizando el archivo del certificado y una contraseña mediante variables de entorno en el sistema de compilación.

### Opción A: Compilación Local (usando archivo PFX)
Si tienes el certificado guardado localmente como un archivo digital `.pfx`, puedes firmar agregando las siguientes variables de entorno en tu sistema de desarrollo o en tu script de compilación:

* **`CSC_LINK`**: Ruta absoluta hacia tu archivo de certificado (ej. `C:\claves\mi_certificado.pfx`).
* **`CSC_KEY_PASSWORD`**: La contraseña asociada al certificado PFX.

#### Ejemplo de integración en `package.json`:
No tienes que modificar el código; simplemente al compilar localmente en PowerShell puedes definir las variables temporales:
```powershell
$env:CSC_LINK="C:\ruta\a\tu\certificado.pfx"
$env:CSC_KEY_PASSWORD="tu_contraseña_secreta"
npm run release
```
`electron-builder` detectará automáticamente estas variables y firmará el `.exe` durante la fase de empaquetado.

---

### Opción B: Automatizado en la Nube (GitHub Actions)
Para firmar tus versiones de forma automática y 100% segura usando tu pipeline de CI/CD sin comprometer tus contraseñas:

1. Convierte tu archivo `.pfx` en una cadena de texto Base64. Puedes hacerlo en tu consola de PowerShell con:
   ```powershell
   [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("tu_certificado.pfx"))
   ```
2. Ve a tu repositorio de GitHub en la web, en `Settings > Secrets and variables > Actions > New repository secret`.
3. Crea un secreto llamado **`WIN_CSC_LINK`** y pega la cadena de texto Base64 que obtuviste.
4. Crea otro secreto llamado **`WIN_CSC_KEY_PASSWORD`** y escribe la contraseña del certificado.
5. Actualiza el archivo de flujo de trabajo `.github/workflows/release.yml` en la sección de variables de entorno (`env`) para inyectar los secretos:
   ```yaml
   env:
     GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
     WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
     WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
   ```
   *Nota: `electron-builder` decodificará automáticamente el Base64 y firmará el instalador durante la ejecución del pipeline en la nube.*

---

## 4. Servidores de Firma en la Nube (Cloud Signing)
Si adquieres un certificado EV moderno, la clave se almacenará en un HSM en la nube del proveedor. Para firmar con esto en tu proceso:
* Instala las herramientas oficiales de firma del proveedor (como *Sectigo KeyManager* o *DigiCert Software Trust Manager*).
* Configura la firma remota utilizando la sección `"win": { "sign": "ruta_a_tu_script_de_firma.js" }` en `package.json`.
