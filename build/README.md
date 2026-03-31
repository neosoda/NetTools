# Répertoire Build

Ce répertoire contient les fichiers de build et assets pour **NetTools**.

---

## Structure

```
build/
├── appicon.png           # Icône source (PNG) de l'application
├── appicon.ico           # Icône Windows (ICO, 6 résolutions)
├── bin/                  # Binaires compilés
│   └── NetTools.exe      # Application Windows
├── darwin/               # Fichiers spécifiques macOS
│   ├── Info.plist
│   └── Info.dev.plist
└── windows/              # Fichiers spécifiques Windows
    ├── icon.ico          # Icône Windows
    ├── info.json         # Métadonnées de l'application
    ├── wails.exe.manifest
    └── installer/        # Fichiers installateur NSIS
```

---

## Icône

L'icône de l'application (`appicon.ico`) a été générée depuis `frontend/src/assets/images/icon.png` avec 6 résolutions :
- 16×16, 32×32, 48×48, 64×64, 128×128, 256×256

Pour mettre à jour l'icône :
1. Remplacer `frontend/src/assets/images/icon.png`
2. Regénérer le fichier ICO :
   ```python
   from PIL import Image
   img = Image.open('frontend/src/assets/images/icon.png')
   img.save('build/appicon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
   ```
3. Copier dans `build/windows/icon.ico`
4. Rebuilder avec `wails build`

---

## Windows

Le répertoire `windows/` contient les fichiers utilisés lors du build avec `wails build` :

- **`icon.ico`** — Icône embarquée dans l'exécutable
- **`info.json`** — Métadonnées (nom, version, auteur) visibles dans les propriétés du fichier
- **`wails.exe.manifest`** — Manifeste UAC de l'application
- **`installer/`** — Scripts NSIS pour la création d'un installateur

## macOS *(non supporté officiellement)*

Le répertoire `darwin/` contient les fichiers plist pour les builds macOS éventuels.

---

## Build production

```bash
# Depuis la racine du projet
wails build

# Binaire produit :
# build/bin/NetTools.exe
```
