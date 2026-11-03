# NetTools v1.7.1 — Notes de release

Version de maintenance de NetTools pour Windows 10 et 11 x64.

## Améliorations

- **Gestion des groupes depuis l'assignation des équipements** : création d'un groupe sans quitter la fenêtre, sélection automatique du nouveau groupe, renommage et édition de la description.
- **Suppression sécurisée des groupes** : confirmation explicite ; les équipements du groupe supprimé restent dans l'inventaire et passent dans « Non classés ».
- **Distribution Windows versionnée** : exécutable `NetTools-1.7.1.exe` avec fichier `NetTools-1.7.1.exe.sha256`.
- **Packaging local reproductible** : commande de publication Windows avec tests, compilation Wails, vérification SHA-256 et création de release GitHub sans Actions.

## Installation

Téléchargez `NetTools-1.7.1.exe` et le fichier `.sha256` joint à la release. Aucun installateur n'est nécessaire.

**Prérequis** : Windows 10/11 x64 et Microsoft Edge WebView2 Runtime.

Vérifiez l'empreinte :

```powershell
Get-FileHash .\NetTools-1.7.1.exe -Algorithm SHA256
Get-Content .\NetTools-1.7.1.exe.sha256
```

Les données utilisateur restent stockées sous `%APPDATA%\NetTools`. Les groupes, profils et inventaires existants sont conservés.

## Sécurité et limites

Les playbooks peuvent exécuter des commandes sur les équipements. Les audits et sauvegardes ne remplacent pas la validation sur les matériels réels et autorisés. Le comportement de l'outil reste local, avec les limites documentées dans `SECURITY.md`.
