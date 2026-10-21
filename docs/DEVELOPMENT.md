# Développer NetTools

## Prérequis

| Composant | Référence |
| --- | --- |
| Go | Toolchain 1.26.10, directive minimale 1.26 dans `go.mod` |
| Node.js | 22.22+ ; Node 24 utilisé dans la CI |
| Wails | CLI et module 2.17.0 |
| Produit Windows | Windows 10/11 x64, WebView2 Runtime |
| Compilation Linux facultative | Compilateur C, pkg-config, GTK3, WebKitGTK 4.1 et session graphique |

Vérifiez `go version`, `node --version`, `npm --version` et `wails version`.
Certains systèmes possèdent une commande `go` sans rapport avec le compilateur
Go. Le guide décrit les outils publics ; les chemins propres au cloud sont
dans les instructions de démarrage de cet environnement.

## Installation reproductible

```bash
git clone https://github.com/neosoda/NetTools.git
cd NetTools
go mod download
go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0
npm ci --prefix frontend --legacy-peer-deps
```

Le binaire Wails est installé dans le dossier `bin` de `go env GOPATH`, à
ajouter au `PATH` si nécessaire. Utilisez une branche dédiée pour contribuer
et le checkout isolé existant en cloud ; ne créez pas un worktree supplémentaire
sans demande explicite.

`npm ci` utilise `frontend/package-lock.json`. Le flag `--legacy-peer-deps`
correspond au workflow du dépôt. Ne remplacez pas les sommes, la validation TLS
ou les contrôles d'intégrité pour contourner une erreur de téléchargement.

## Démarrage et compilation

Depuis la racine :

```bash
npm run dev            # Application desktop Wails et rechargement
npm run build          # Compilation Wails, sans go mod tidy automatique
npm run dev:frontend   # Vite seul : interface, sans backend desktop complet
npm run build:frontend # Assets de production, marqueur dist/.keep préservé
```

Le serveur Vite ne remplace pas les méthodes Wails. Pour tester les opérations
réseau et les dialogues natifs, utilisez une véritable session desktop.
La sortie Windows de Wails est `build/bin/NetTools.exe`.

Sous Debian/Ubuntu, installez via le gestionnaire système
`build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev`, puis utilisez
`wails dev -tags webkit2_41` ou `wails build -m -tags webkit2_41`.
Ces dépendances ne sont pas installables dans toutes les machines cloud sans
privilèges. Une compilation Windows peut être vérifiée depuis un shell Linux :

```bash
npm run build:frontend
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -mod=readonly -tags desktop,production -o /tmp/NetTools.exe .
```

Cette vérification ne lance pas l'application et ne valide pas toutes les
métadonnées du packaging Wails. Ne présentez pas un binaire compilé ainsi comme
une release signée et testée sur Windows.

## Contrôles avant PR

```bash
npm run check
```

Cette commande exécute TypeScript, le build frontend, les tests backend et
façade, puis `go vet` sur les packages internes. Elle n'a besoin ni d'interface
graphique ni de credentials de vrais équipements. Les tests SSH locaux ouvrent
des connexions de laboratoire en loopback.

| Commande | Périmètre |
| --- | --- |
| `npm test` ou `make test` | Backend et façade `App`, sans le démarrage graphique Wails |
| `npm run test:app` | Tests d'inventaire de la façade applicative |
| `npm run typecheck` | TypeScript installé dans le frontend, sans téléchargement opportuniste |
| `npm run vet` | Analyse Go des packages internes |
| `make vet-desktop` | `go vet ./...`, avec les prérequis desktop de la plateforme |
| `make lint` | Analyse Go et TypeScript |
| `make ci` | Contrôles portables locaux ; la CI GitHub ajoute Windows et les scanners |
| `go mod verify` | Intégrité des modules présents dans le cache |

Exécutez les tests ciblés après une modification métier. Les bindings sous
`frontend/wailsjs/` sont générés : ne les corrigez pas à la main. Wails peut les
régénérer ; examinez le diff et préservez tout changement utilisateur.

## Vulnérabilités, secrets et licences

```bash
npm audit --prefix frontend --audit-level=high
go install golang.org/x/vuln/cmd/govulncheck@v1.1.4
govulncheck -tags=desktop,production ./...
go install github.com/zricethezav/gitleaks/v8@v8.30.0
gitleaks git --redact=100 --log-opts=--all .
python3 tools/dependency_licenses.py --bundle /chemin/hors/checkout/THIRD_PARTY_LICENSES.txt
```

Exécutez `govulncheck` sur Windows, ou définissez `GOOS=windows`, `GOARCH=amd64`
et `CGO_ENABLED=0` dans un shell Linux pour analyser la cible produit. Le dossier
`bin` de GOPATH doit également être accessible pour ces outils.

Le chemin de sortie du bundle ci-dessus est un exemple à adapter à votre
plateforme. Après un changement de dépendances, rafraîchissez l'inventaire
avec `python3 tools/dependency_licenses.py --output docs/dependency-license-inventory.json`
et examinez les licences, les notices et les versions. Le script ne certifie
pas à lui seul les droits de redistribution. Les fichiers de `LICENSES/` sont
des textes upstream conservés octet pour octet.

Ne publiez pas la clé HMAC Sentinel locale : l'ancienne clé est compromise,
retirée du suivi et ignorée. Une rotation dans l'outil concerné est obligatoire
avant de signer de nouvelles preuves. Voir [SECURITY.md](../SECURITY.md).

## Générer la documentation

`NOTICE.md` est la source du manuel. Installez les outils facultatifs dans un
environnement Python dédié ; exemple PowerShell :

```powershell
python -m venv .venv-docs
.\.venv-docs\Scripts\Activate.ps1
python -m pip install -r tools/requirements-docs.txt
python tools/generate_notice_pdf.py
```

Sous Linux, activez le virtualenv avec `source .venv-docs/bin/activate` et
utilisez `python3` si nécessaire. Le rendu HTML n'exige aucun navigateur et
produit `Notice_NetTools_page.html` ainsi que `tools/notice_rendered.html`.
Le logo et la police Inter sont embarqués dans ces rendus ; leur affichage ne
requiert pas de téléchargement de polices externes.

Pour le PDF facultatif :

```bash
python -m playwright install chromium
python tools/generate_notice_pdf.py --pdf
```

Si un Chromium compatible est déjà installé, utilisez
`--pdf --chromium-executable /chemin/vers/chromium`. Le PDF courant est généré
localement sous `Notice_Utilisation_NetTools.pdf` et ignoré par Git. Le fichier
explicitement nommé v1.3.2 reste une archive inchangée. N'éditez pas les rendus
HTML à la main ; relancez la génération et vérifiez le sommaire et les liens.
`python3 tools/check_docs.py` contrôle les liens locaux des documents courants ;
la CI régénère les notices et vérifie l’absence de dérive des rendus suivis.

## Outils facultatifs

L'exécuteur Netmiko requiert Python 3.10+ et un environnement contenant
`netmiko`, accessible à `python3` depuis la racine du projet. Il n'est pas
nécessaire aux tests unitaires et son graphe de dépendances n'est pas verrouillé
ni validé comme distribution embarquée. Les diagnostics SSH réels restent
réservés aux équipements pour lesquels vous avez une autorisation.

Les dépendances de documentation sont séparées des dépendances applicatives.
Leur installation ne constitue pas une validation juridique de leur inclusion
dans une distribution. Suivez [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
