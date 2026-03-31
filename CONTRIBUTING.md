# Contribuer à NetTools

Merci de l'intérêt que vous portez à NetTools ! Ce guide explique comment contribuer efficacement au projet.

---

## Prérequis

- **Go 1.21+** — [golang.org](https://golang.org)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Wails CLI v2** — `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- **Git**

## Installation

```bash
# Cloner le projet
git clone https://github.com/neosoda/NetTools.git
cd NetTools

# Dépendances Go
go mod download

# Dépendances frontend
cd frontend && npm install --legacy-peer-deps
```

## Développement

```bash
# Mode dev avec hot-reload
wails dev

# Build production
wails build

# Tests Go
make test

# Tests avec couverture
make test-cover

# Linting
make lint
```

---

## Workflow de contribution

1. **Fork** le dépôt
2. **Créez une branche** depuis `master` :
   ```bash
   git checkout -b feature/ma-fonctionnalite
   # ou
   git checkout -b fix/mon-bug
   ```
3. **Développez** votre fonctionnalité ou correction
4. **Testez** avant de soumettre :
   ```bash
   make test
   cd frontend && npx tsc --noEmit
   ```
5. **Committez** avec un message clair :
   ```bash
   git commit -m "feat: description de la fonctionnalité"
   # ou
   git commit -m "fix: description du bug corrigé"
   ```
6. **Ouvrez une Pull Request** vers `master`

---

## Conventions de commit

Suivre le format [Conventional Commits](https://www.conventionalcommits.org/fr/) :

| Préfixe | Usage |
|---------|-------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `docs:` | Documentation uniquement |
| `refactor:` | Refactoring sans changement fonctionnel |
| `test:` | Ajout ou modification de tests |
| `chore:` | Maintenance, dépendances |

---

## Bonnes pratiques

- **Couvrir** les changements de logique backend par des tests Go ciblés
- **Préférer** les petites PRs avec un impact opérationnel clair
- **Documenter** tout compromis lié à la sécurité dans la description de la PR
- **Ne pas committer** de credentials, clés ou données personnelles
- **Tester** sur au moins un équipement réseau réel si possible

---

## Signaler un bug

Ouvrez une [Issue](../../issues/new) en incluant :
- Description claire du problème
- Étapes pour reproduire
- Comportement attendu vs observé
- Logs (`%APPDATA%\NetTools\logs\`)
- Version de NetTools et de Windows
