$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = "C:\Program Files\nodejs\npm.cmd"
$builder = Join-Path $root "node_modules\.bin\electron-builder.cmd"
$rcedit = Get-ChildItem -Path (Join-Path $root ".cache\electron-builder\winCodeSign") -Recurse -Filter rcedit-x64.exe |
    Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path $node)) {
    throw "No se encontro npm en $node"
}

if (-not (Test-Path $builder)) {
    throw "No se encontro electron-builder. Ejecuta npm install primero."
}

if (-not $rcedit) {
    throw "No se encontro rcedit. Ejecuta npm run pack una vez para preparar la cache."
}

$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:ELECTRON_CACHE = Join-Path $root ".cache\electron"
$env:ELECTRON_BUILDER_CACHE = Join-Path $root ".cache\electron-builder"

Push-Location $root
try {
    & $node run pack

    $exe = Join-Path $root "dist\win-unpacked\GVI.exe"
    & $rcedit $exe `
        --set-icon "build\icon.ico" `
        --set-version-string FileDescription "GVI - Gestor de Ventas Intuitivo" `
        --set-version-string ProductName "GVI" `
        --set-version-string OriginalFilename "GVI.exe"

    & $builder --win nsis --prepackaged "dist\win-unpacked" --publish never

    $version = (Get-Content "package.json" | ConvertFrom-Json).version
    $keep = @(
        "GVI-Setup-$version.exe",
        "GVI-Setup-$version.exe.blockmap",
        "latest.yml",
        "builder-debug.yml",
        "win-unpacked"
    )

    Get-ChildItem "dist" | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
        $resolved = (Resolve-Path -LiteralPath $_.FullName).Path
        if ($resolved -like "$root\dist\*") {
            Remove-Item -LiteralPath $resolved -Force -Recurse
        }
    }

    Write-Host "Instalador listo: dist\GVI-Setup-$version.exe"
    Write-Host "Para GitHub Releases sube tambien: dist\latest.yml y dist\GVI-Setup-$version.exe.blockmap"
}
finally {
    Pop-Location
}
