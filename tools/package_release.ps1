# Prépare les fichiers à joindre à une release GitHub.
# La version provient des métadonnées Wails, jamais d'un nom saisi en dur.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $root 'wails.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$version = [string]$config.info.productVersion

if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Version invalide dans wails.json : '$version'"
}

Push-Location $root
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "La compilation Wails a échoué (code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

$sourceExe = Join-Path $root 'build/bin/NetTools.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
    throw "Exécutable Wails introuvable : $sourceExe"
}

$releaseDir = Join-Path $root 'release'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$filename = "NetTools-$version.exe"
$releaseExe = Join-Path $releaseDir $filename
Copy-Item -LiteralPath $sourceExe -Destination $releaseExe -Force

$hash = (Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumFile = "$releaseExe.sha256"
Set-Content -LiteralPath $checksumFile -Encoding ASCII -Value "$hash  $filename"

Write-Host "Release prête : $releaseExe"
Write-Host "Empreinte SHA-256 : $checksumFile"
