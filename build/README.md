# Ressources de compilation NetTools

Ce répertoire contient les assets et modèles de packaging utilisés par Wails.
Windows 10/11 x64 avec WebView2 est la cible produit. Les autres plateformes
ne bénéficient pas d'une garantie de support.

```text
build/
├── appicon.png                     Icône source de l'application
├── bin/                            Sorties locales, ignorées par Git
└── windows/
    ├── icon.ico                    Icône Windows
    ├── info.json                   Modèle de propriétés de l'exécutable
    ├── wails.exe.manifest          Manifeste Windows
    └── installer/                 Modèles NSIS
```

`wails.json` définit le nom, la version, l'auteur et le copyright utilisés
par les modèles Windows. Préservez les copyrights légitimes et les licences
tierces ; la licence du code original n'annule pas leurs obligations.

## Compiler

Depuis la racine, installez les outils et dépendances selon
[docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md), puis exécutez :

```bash
npm run build
```

La sortie Windows attendue est `build/bin/NetTools.exe`. Une compilation par
`go build` seule sert à vérifier le code, mais ne valide pas tout le packaging
Wails : propriétés du fichier, icône et comportement WebView2 doivent être
contrôlés séparément sur Windows.

Les modèles NSIS sont présents, sans constituer une promesse de publication
d'un installateur. N'installez NSIS que si vous préparez effectivement ce format.

## Icônes

Les sources visuelles du projet se trouvent dans `frontend/src/assets/images/`.
Le fichier ICO suivi est `build/windows/icon.ico`. Si vous modifiez les visuels,
préservez les droits de leurs créateurs, vérifiez les différentes tailles
Windows et contrôlez les fichiers générés par Wails avant de committer.
Les chemins ou sorties non suivis éventuellement créés par une CLI ne doivent
pas être présentés comme des sources déjà fournies dans le dépôt.

## Préparer une distribution

Joignez les fichiers légaux et les attributions des composants réellement
embarqués. Suivez [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) et les
[conditions de publication](../docs/OPEN_SOURCE_AUDIT.md). Une compilation ne
publie ni n'approuve une release.
