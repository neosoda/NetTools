# Contribuer à NetTools

NetTools est une application desktop Windows de gestion réseau, sous Apache 2.0.
Les corrections, tests, documents et améliorations génériques sont bienvenus.
Respectez le [code de conduite](CODE_OF_CONDUCT.md). Les vulnérabilités suivent
[SECURITY.md](SECURITY.md), pas une issue publique.

## Installer et vérifier

Prérequis : Git, Go **1.26.10** (toolchain de `go.mod`), Node.js **22.22+**
(Node 24 convient), npm, Wails **2.11.0**, Windows 10/11 x64 et WebView2.
Installez Go depuis sa distribution officielle ; certains systèmes proposent
une commande `go` sans rapport avec le langage Go. Vérifiez `go version`.

```bash
git clone https://github.com/neosoda/NetTools.git
cd NetTools
go mod download
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
cd frontend
npm ci --legacy-peer-deps
npm exec -- tsc --noEmit
npm run build -- --emptyOutDir false
cd ..
go test -mod=readonly ./internal/... -count=1
go vet -mod=readonly ./internal/...
wails dev
```

Le paramètre `--emptyOutDir false` conserve le marqueur suivi `frontend/dist/.keep`.
`npm ci` respecte le lockfile ; n'utilisez pas `npm audit fix --force`.
Wails est installé dans `$(go env GOPATH)/bin`, à ajouter au PATH si nécessaire.
Pour une compilation de release : `wails build` (sortie `build/bin/NetTools.exe`).
Wails peut régénérer les bindings et supprimer `.keep` : examinez le diff et ne
committez pas de changements générés involontaires.

Linux est une plateforme de développement secondaire, sans garantie produit.
Sur Debian/Ubuntu, installez `build-essential pkg-config libgtk-3-dev
libwebkit2gtk-4.1-dev` via le gestionnaire système. Utilisez
`wails dev -tags webkit2_41` ou `wails build -tags webkit2_41` dans une session
graphique. Le serveur Vite seul ne fait pas fonctionner le backend Wails.

L'exécuteur facultatif Netmiko requiert Python 3.10+ et `netmiko` dans un
virtualenv accessible à `python3`, depuis la racine du projet. Il n'a pas de
lockfile Python : versions, dépendances et licences doivent être revues avant
sa distribution. La génération facultative des PDF utilise Markdown,
Playwright et Chromium ; elle n'est pas requise pour compiler l'application.
Aucun équipement réel ni secret n'est nécessaire aux tests unitaires.

## Proposer une modification

1. Forkez le dépôt si vous n'avez pas les droits d'écriture.
2. Créez une branche dédiée depuis `master` ; en environnement cloud, utilisez
   le checkout isolé fourni, sans créer un worktree supplémentaire.
3. Gardez un périmètre restreint ; préservez les fonctionnalités, données
   utilisateur et compatibilité Windows.
4. Exécutez les vérifications ci-dessus et les tests ciblés pertinents.
5. Ouvrez une PR vers `master` avec contexte, validation et limites connues.

Les PR ne sont pas fusionnées automatiquement. Ne poussez pas directement sur
`master`. N'incluez aucun identifiant, secret, configuration réelle de réseau,
export de base ou détail de l'édition privée. Utilisez des données synthétiques.
Les changements de dépendances incluent une justification, la licence et les
attributions nécessaires. Conservez les notices originales ; le code tiers,
les polices et les fichiers générés ne reçoivent pas aveuglément un en-tête Apache.

## Qualité et sécurité

La CI exécute les tests Go, `go vet`, TypeScript, le build frontend et une
compilation desktop Windows. Elle vérifie aussi `npm audit`, `govulncheck` et
Gitleaks sur l'historique accessible. Une alerte ne prouve pas l'exploitabilité,
mais doit être examinée ; aucun résultat ne garantit l'absence de vulnérabilité.
Les essais matériels SNMP/SSH restent distincts : ne testez que des systèmes
pour lesquels vous avez une autorisation explicite.

## Droits des contributions

En soumettant intentionnellement une contribution pour inclusion, vous la
proposez sous Apache 2.0 selon la section 5 de LICENSE, sauf accord explicite
contraire. Vous devez disposer des droits nécessaires, y compris de votre
employeur lorsque pertinent, et identifier le contenu tiers et sa licence.
Aucune cession générale de droits ni CLA n'est instaurée par ce document.
