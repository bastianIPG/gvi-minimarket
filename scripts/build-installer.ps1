$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = "C:\Program Files\nodejs\npm.cmd"
$builder = Join-Path $root "node_modules\.bin\electron-builder.cmd"
$icon = Join-Path $root "build\icon.ico"

if (-not (Test-Path $node)) {
    throw "No se encontro npm en $node"
}

if (-not (Test-Path $builder)) {
    throw "No se encontro electron-builder. Ejecuta npm install primero."
}

if (-not (Test-Path $icon)) {
    throw "No se encontro el icono del programa: $icon"
}

$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:ELECTRON_CACHE = Join-Path $root ".cache\electron"
$env:ELECTRON_BUILDER_CACHE = Join-Path $root ".cache\electron-builder"

Push-Location $root
try {
    & $node run generate-icon
    & $builder --win nsis --publish never

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
