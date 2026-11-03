# Build et publie une nouvelle release Windows depuis un checkout master propre.
# Prérequis : Go, Node.js, Wails CLI, Git et GitHub CLI (gh auth login).
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
    throw "La publication doit être lancée sur Windows x64."
}

$repo = 'neosoda/NetTools'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

foreach ($tool in @('git', 'gh', 'go', 'npm.cmd', 'wails')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Outil requis absent : $tool"
    }
}

Push-Location $root
try {
    $origin = (& git remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/neosoda/NetTools(\.git)?|git@github\.com:neosoda/NetTools(\.git)?)$') {
        throw "Ce script est réservé au dépôt public neosoda/NetTools."
    }
    $branch = (& git branch --show-current).Trim()
    if ($branch -ne 'master') {
        throw "Utilisez la branche master (branche actuelle : $branch)."
    }
    if (@(& git status --porcelain).Count -gt 0) {
        throw "Le dépôt contient des modifications locales : sauvegardez-les avant de publier."
    }

    & git fetch origin master
    if ($LASTEXITCODE -ne 0) { throw 'Impossible de vérifier le master distant.' }
    $head = (& git rev-parse HEAD).Trim()
    $remoteHead = (& git rev-parse origin/master).Trim()
    if ($head -ne $remoteHead) {
        throw "master n'est pas synchronisé avec origin/master : lancez git pull --ff-only."
    }

    $config = Get-Content -LiteralPath (Join-Path $root 'wails.json') -Raw | ConvertFrom-Json
    $version = [string]$config.info.productVersion
    if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
        throw "Version invalide dans wails.json : $version"
    }
    $tag = "v$version"
    $notes = Join-Path $root "RELEASE_NOTES_v$version.md"
    if (-not (Test-Path -LiteralPath $notes -PathType Leaf)) {
        throw "Notes de release introuvables : $notes"
    }
    $existingTag = @(& git ls-remote --tags origin "refs/tags/$tag")
    if ($LASTEXITCODE -ne 0) { throw "Impossible de vérifier le tag $tag." }
    if ($existingTag.Count -gt 0) {
        throw "Le tag $tag existe déjà : refus d'écraser une release publiée."
    }

    & gh auth status
    if ($LASTEXITCODE -ne 0) {
        throw 'Authentification GitHub CLI requise : gh auth login'
    }

    & go mod download
    if ($LASTEXITCODE -ne 0) { throw 'Téléchargement des modules Go échoué.' }
    & npm.cmd ci --prefix frontend --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw 'Installation des dépendances frontend échouée.' }
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'Échec des tests : publication annulée.' }

    & (Join-Path $PSScriptRoot 'package_release.ps1')

    $exe = Join-Path $root "release/NetTools-$version.exe"
    $checksum = "$exe.sha256"
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or -not (Test-Path -LiteralPath $checksum -PathType Leaf)) {
        throw 'Les artefacts Windows ou leur empreinte sont introuvables.'
    }
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedChecksum = "$hash  NetTools-$version.exe"
    if ((Get-Content -LiteralPath $checksum -Raw).Trim() -ne $expectedChecksum) {
        throw 'Le fichier SHA-256 ne correspond pas au binaire généré.'
    }
    if (@(& git status --porcelain).Count -gt 0) {
        throw 'La compilation a modifié des fichiers suivis : publication annulée.'
    }

    & gh release create $tag $exe $checksum --repo $repo --target $head --title "NetTools v$version" --notes-file $notes
    if ($LASTEXITCODE -ne 0) { throw 'Publication GitHub échouée.' }
    Write-Host "Release publiée : https://github.com/$repo/releases/tag/$tag"
}
finally {
    Pop-Location
}
