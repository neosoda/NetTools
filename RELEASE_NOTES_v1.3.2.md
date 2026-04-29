# NetTools v1.3.2 — Release Notes

**Date :** 2026-04-29  
**Commit :** `cccfcfa`  
**Branche :** `master`

---

## Nouveautés

### 1. Inventaire stateless
- L'inventaire est **vide à chaque lancement** — aucun état implicite persisté.
- Sauvegarde **manuelle explicite** via bouton Export JSON (icône ↓).
- Import JSON via bouton Import (icône ↑) — remplace l'inventaire courant.

### 2. Activation automatique des credentials
- Un credential nouvellement créé et **complet** (password, clé SSH ou SNMP) est activé **automatiquement** dans la sidebar.
- Badge **ACTIF** visible dans la liste des credentials (Paramètres).
- Suppression du credential actif : la sélection est réinitialisée proprement.

### 3. Comparateur de configurations — refonte UX
- **Vue Split** (défaut) : affichage côte à côte avec **scroll synchronisé**.
- Algorithme de diff **sémantique** : appariement delete+insert → ligne `changed` (ambre).
- Code couleur : 🟢 insertion · 🔴 suppression · 🟡 modification · gris neutre.
- **Diff only** : filtre les lignes inchangées dans les deux modes.
- Toggle **Split / Unifié** dans la barre d'options.
- Stats enrichies : `+ajouts` / `−suppressions` / `~modifiés` / `=inchangés`.

---

## Artefact de build

| Fichier | Taille | SHA-256 |
|---|---|---|
| `NetTools.exe` | 20 MB | `fca9c9d87f6090f230dba5e92547f69a39d076e19def1ded702b71abc31b9ad2` |

> **Plateforme cible :** Windows x64 (WebView2 requis — inclus avec Windows 11 / Edge)

---

## Backup

Snapshot du master avant release disponible sur la branche : `backup/master-pre-release-1.3.2`
