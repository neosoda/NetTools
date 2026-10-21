<div align="center">

<img src="frontend/src/assets/images/icon.png" alt="Logo NetTools" width="120" />

# NetTools

**Découvrir son réseau. Sauvegarder ses configurations. Auditer avec des preuves.**

Application desktop Windows pour les administrateurs réseau, développée avec Go, Wails et React.

[![Licence Apache 2.0](https://img.shields.io/badge/Licence-Apache%202.0-blue)](LICENSE)
[![Version publiée](https://img.shields.io/github/v/release/neosoda/NetTools?label=Version)](https://github.com/neosoda/NetTools/releases)
[![Go](https://img.shields.io/badge/Go-1.26.10-00ADD8?logo=go&logoColor=white)](go.mod)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend/package.json)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4)](#installer-nettools)

[Télécharger](https://github.com/neosoda/NetTools/releases/latest) · [Guide utilisateur](NOTICE.md) · [Documentation](docs/README.md) · [Contribuer](CONTRIBUTING.md) · [Sécurité](SECURITY.md)

</div>

## Un poste de travail pour l'administration réseau

NetTools rassemble la découverte SNMP, l'inventaire, les sauvegardes SSH et
l'analyse de configurations dans une interface locale. Il s'adresse aux
administrateurs qui souhaitent conserver leurs données et leurs fichiers sur
leur poste ou dans un dossier de sauvegarde de leur choix, sans service cloud
obligatoire.

Le code original de cette branche est sous **Apache 2.0**. Les dépendances et
ressources conservent leurs licences respectives. Les binaires déjà publiés
restent associés aux conditions et au code de leur version : cette migration
ne constitue pas une nouvelle release. Voir les [licences](#licences-et-attributions).

## Ce que permet NetTools

| Module | Fonctions |
| --- | --- |
| **Découverte** | SNMP v1/v2c/v3 USM, modes Switches et Complet, CIDR, plages et listes IPv4, import TXT/CSV, export Excel. Les cibles sont validées, dédupliquées et limitées à 1 024 par scan. |
| **Inventaire** | Ajout manuel, découverte et import JSON ; fusion par adresse IP et conservation entre les sessions par défaut. Mode éphémère facultatif dans les paramètres. |
| **Backups** | Collecte SSH multi-constructeur, historique, contrôle SHA-256, qualité de capture, consultation des configurations et export ZIP. |
| **Comparateur** | Comparaison de textes ou de sauvegardes, vues côte à côte et unifiée, filtres et export HTML. |
| **Audit** | Contrôles génériques et constructeur, preuves contextualisées, conclusions explicites et recommandations consultatives. Une sauvegarde absente ou non exploitable ne permet pas de conclure. |
| **Playbooks** | Séquences YAML sur les équipements sélectionnés, sorties d'exécution et gestion des erreurs. Exécuteur natif et option Netmiko. |
| **Planificateur** | Programmation de scans, backups, audits, playbooks et commandes SSH selon le type et les paramètres choisis. |
| **Journaux et paramètres** | Événements, fichiers de logs, profils SSH/SNMP, dossier de sauvegarde et rétention des journaux. |

La topologie et le suivi d'utilisation des ports ont été retirés du produit
public en v1.6.0. Les recommandations d'audit ne génèrent ni n'exécutent de
script de remédiation. Le catalogue de règles évolue : il ne constitue pas une
certification de conformité à une norme.

### Équipements et protocoles

Les chemins de sauvegarde couvrent notamment Cisco IOS/XE, Aruba AOS-S,
HP ProCurve, HPE Comware, Huawei VRP, Fortinet FortiOS et AlliedWare Plus.
La commande et le mode SSH dépendent du constructeur ; la compatibilité doit
être vérifiée sur le modèle, le firmware et les privilèges réellement utilisés.
Les essais automatisés ne remplacent pas cette validation matérielle.

## Installer NetTools

**Prérequis :** Windows 10/11 x64 et Microsoft Edge WebView2 Runtime.
Si WebView2 manque, utilisez le [téléchargement officiel Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

1. Ouvrez la [dernière release](https://github.com/neosoda/NetTools/releases/latest).
2. Téléchargez `NetTools.exe` et le fichier `.sha256` de la même version.
3. Comparez l'empreinte avant de lancer l'application :

   ```powershell
   Get-FileHash .\NetTools.exe -Algorithm SHA256
   Get-Content .\NetTools.exe.sha256
   ```

4. Lancez l'exécutable, puis créez vos profils SSH/SNMP dans **Paramètres**.

Une somme de contrôle vérifie la concordance avec le fichier publié ; elle ne
constitue pas une signature indépendante de l'éditeur.

Les données SQLite, les préférences et les logs sont conservés dans
`%APPDATA%\NetTools\`. Les backups sont enregistrés par défaut dans
`%USERPROFILE%\Downloads\NetTools_Backups\`, avec un dossier personnalisable.
L'inventaire reste présent au redémarrage, sauf activation du mode éphémère.

## Premier parcours

1. **Paramètres** : créez un profil et choisissez le credential actif.
2. **Découverte** : indiquez uniquement des cibles pour lesquelles vous avez
   une autorisation, puis lancez le scan.
3. **Inventaire** : contrôlez les équipements, leurs métadonnées et leurs accès.
4. **Backups** : récupérez les configurations et vérifiez le résultat de capture.
5. **Audit** : examinez les preuves, les statuts et les recommandations.
6. **Comparateur** : comparez deux états avant ou après une maintenance.

Le [guide utilisateur](NOTICE.md) détaille chaque écran, les données locales,
les automatisations et le dépannage.

## Développer et compiler

Le workflow produit cible **Windows**. Les contrôles backend et frontend
peuvent aussi être exécutés sous Linux ; une application Wails Linux demande
des bibliothèques GTK/WebKit et une session graphique.

| Outil | Version utilisée |
| --- | --- |
| Go | 1.26.10, toolchain déclarée dans `go.mod` |
| Node.js | 22.22+ ; Node 24 utilisé dans la CI |
| npm | Installation via `npm ci --legacy-peer-deps` |
| Wails CLI et module | 2.17.0 |

```bash
git clone https://github.com/neosoda/NetTools.git
cd NetTools
go mod download
go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0
npm ci --prefix frontend --legacy-peer-deps
npm run typecheck
npm run build:frontend
npm test
wails dev
```

Ajoutez le dossier `bin` de `go env GOPATH` au `PATH` pour utiliser Wails.
Pour compiler l'exécutable Windows depuis Windows : `npm run build`.
La sortie est `build/bin/NetTools.exe`.

Les commandes par plateforme, le mode frontend seul, les contrôles de sécurité
et la génération des notices sont dans le [guide de développement](docs/DEVELOPMENT.md).

## Comprendre le dépôt

```text
app.go / main.go          Façade applicative et démarrage Wails
internal/                SNMP, SSH, backups, audit, SQLite, secrets et planificateur
frontend/src/            Écrans React, composants et appels au backend
frontend/wailsjs/        Bindings et runtime générés par Wails
build/                   Ressources Windows et modèles de packaging
.github/                 Workflows, modèles de contribution et Dependabot
docs/                    Documentation développeur et rapport d'audit
tools/                   Génération des notices, licences et diagnostics
LICENSE / NOTICE         Licence du projet et attributions légales
NOTICE.md                Guide utilisateur de référence
```

Voir l'[architecture](docs/ARCHITECTURE.md) pour les flux, les responsabilités
et les limites de la séparation frontend/backend.

## Contribuer et obtenir de l'aide

Les corrections, tests, traductions et améliorations de documentation sont
bienvenus. Commencez par [CONTRIBUTING.md](CONTRIBUTING.md), puis ouvrez une
issue ou une PR ciblée vers `master`. Le projet suit un
[code de conduite](CODE_OF_CONDUCT.md) ; aucune PR n'est fusionnée automatiquement.

- **Bug ou proposition :** [modèles d'issues](https://github.com/neosoda/NetTools/issues/new/choose).
- **Question d'installation ou diagnostic :** [guide de support](SUPPORT.md).
- **Vulnérabilité :** procédure confidentielle dans [SECURITY.md](SECURITY.md).
- **Évolutions publiées :** [CHANGELOG.md](CHANGELOG.md) et [releases](https://github.com/neosoda/NetTools/releases).

N'incluez jamais de credentials, sauvegarde réelle, adresse interne sensible
ou contenu de l'édition privée dans une contribution publique.

## Sécurité et limites

NetTools traite des configurations et des accès sensibles. Le stockage des
credentials utilise DPAPI sous Windows ; hors Windows, le fallback AES dépend
de sa configuration et n'offre pas une protection forte avec le seul nom d'hôte.
Les clés d'hôte SSH ne sont actuellement pas vérifiées. Les exports, backups
et logs doivent être traités comme des données sensibles.

Consultez [SECURITY.md](SECURITY.md) avant un déploiement. Les tests et scanners
ne constituent pas une garantie de sécurité, de disponibilité ou de conformité.

## Licences et attributions

Copyright 2026 neosoda. Le code original NetTools est sous
[Apache License 2.0](LICENSE). Les polices Inter et Nunito restent sous OFL 1.1,
le runtime Wails sous MIT et les autres composants sous leurs licences propres.

- [NOTICE](NOTICE) : attributions du projet.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) : obligations des composants tiers.
- [Inventaire des dépendances](docs/dependency-license-inventory.json).
- [Rapport d'audit et conditions de publication](docs/OPEN_SOURCE_AUDIT.md).

`NOTICE.md` est un manuel utilisateur ; il ne remplace pas le fichier légal `NOTICE`.
