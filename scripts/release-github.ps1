param(
    [string]$Version = "",
    [string]$Notes = "Actualizacion de GVI con mejoras de interfaz, rendimiento y sistema de actualizaciones."
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repoOwner = "bastianIPG"
$repoName = "gvi-minimarket"
$branch = "main"
$npm = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path $npm)) {
    throw "No se encontro npm en $npm"
}

function Get-GitHubToken {
    if ($env:GITHUB_TOKEN) {
        return $env:GITHUB_TOKEN
    }

    $credentialInput = "protocol=https`nhost=github.com`n`n"
    $credentialOutput = $credentialInput | git credential fill
    $credentialToken = (($credentialOutput -split "`n") | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''

    if ($credentialToken) {
        return $credentialToken
    }

    throw "No hay credencial para publicar en GitHub. Inicia sesion con Git Credential Manager o define GITHUB_TOKEN."
}

Push-Location $root
try {
    if ($Version) {
        & $npm version $Version --no-git-tag-version
    } else {
        & $npm version patch --no-git-tag-version
    }

    $package = Get-Content "package.json" | ConvertFrom-Json
    $versionFinal = $package.version
    $tag = "v$versionFinal"

    & $npm run release

    $assets = @(
        "dist\GVI-Setup-$versionFinal.exe",
        "dist\GVI-Setup-$versionFinal.exe.blockmap",
        "dist\latest.yml"
    )

    foreach ($asset in $assets) {
        if (-not (Test-Path $asset)) {
            throw "No se encontro el archivo requerido: $asset"
        }
    }

    git add -A
    $pending = git status --porcelain
    if ($pending) {
        git commit -m "Publicar GVI v$versionFinal"
    } else {
        Write-Host "No hay cambios para commitear."
    }

    $existingTag = git tag --list $tag
    if ($existingTag) {
        throw "El tag $tag ya existe. Usa una version nueva."
    }

    git tag $tag
    git push origin $branch
    git push origin $tag

    $githubToken = Get-GitHubToken
    $headers = @{
        Authorization = "Bearer $githubToken"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "GVI-release-script"
    }

    $releaseBody = @{
        tag_name = $tag
        target_commitish = $branch
        name = "GVI $versionFinal"
        body = $Notes
        draft = $false
        prerelease = $false
        make_latest = "true"
    } | ConvertTo-Json

    $release = $null
    try {
        $release = Invoke-RestMethod `
            -Method Post `
            -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases" `
            -Headers $headers `
            -ContentType "application/json" `
            -Body $releaseBody
    } catch {
        $release = Invoke-RestMethod `
            -Method Get `
            -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/tags/$tag" `
            -Headers $headers
    }

    $existingAssets = Invoke-RestMethod `
        -Method Get `
        -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/$($release.id)/assets" `
        -Headers $headers

    foreach ($assetPath in $assets) {
        $assetFile = Get-Item $assetPath
        $oldAsset = $existingAssets | Where-Object { $_.name -eq $assetFile.Name } | Select-Object -First 1
        if ($oldAsset) {
            Invoke-RestMethod `
                -Method Delete `
                -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/assets/$($oldAsset.id)" `
                -Headers $headers | Out-Null
        }

        $uploadUri = "https://uploads.github.com/repos/$repoOwner/$repoName/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($assetFile.Name))"
        Invoke-RestMethod `
            -Method Post `
            -Uri $uploadUri `
            -Headers $headers `
            -ContentType "application/octet-stream" `
            -InFile $assetFile.FullName | Out-Null
    }

    Write-Host "Release publicado: https://github.com/$repoOwner/$repoName/releases/tag/$tag"
    Write-Host "Comando futuro: npm run publish-release -- -Version 2.1.2"
}
finally {
    Pop-Location
}
