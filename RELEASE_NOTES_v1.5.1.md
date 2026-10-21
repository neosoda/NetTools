# NetTools v1.5.1 — Release Notes

Cette version 1.5.1 enrichit l'expérience d'administration réseau sur les modules **Port Tracker**, **Gestion des Backups** et **SNMPv3 USM**.

---

## ✨ Nouveautés et Améliorations

### 🔍 Port Tracker (Suivi des Ports)
* **Cartographie Équipement Enrichie** : Ajout d'une colonne dédiée affichant le nom d'hôte (`Hostname`) et l'adresse IP associée à chaque interface réseau analysée.
* **Filtre par Commutateur** : Sélection rapide d'un switch spécifique dans l'en-tête de la page pour cibler instantanément un équipement.
* **Export CSV Professionnel** : Bouton d'export CSV conforme RFC 4180 avec encodage UTF-8 et BOM pour une compatibilité native parfaite sous Microsoft Excel.

### 💾 Gestion des Backups
* **Cartes Métriques de Synthèse** : Affichage d'un tableau de bord synthétique en tête de page (Total des sauvegardes, Succès, Échecs, Horodatage du dernier backup).
* **Indicateur d'Intégrité SHA256** : Badge visuel de conformité pour chaque sauvegarde avec infobulle affichant l'empreinte cryptographique complète.
* **Export Archive ZIP Vérifiée** : Bouton d'exportation d'une archive ZIP consolidée (`ExportBackupsZip`) avec vérification préalable de l'intégrité de chaque fichier.

### 🔐 SNMPv3 USM
* **Diagnostic Interactif des Identifiants** : Bouton **« Tester »** direct sur chaque profil d'identification SNMP dans la page Paramètres.
* **Assistant de Test en Direct** : Modal permettant de renseigner une adresse IP cible et d'exécuter un test SNMPv3 USM en temps réel (`TestSNMPHostWithCredential`) avec compte-rendu détaillé des résultats (sysName, sysDescr, temps de réponse, ou diagnostic d'erreur).

---

## 📦 Téléchargement et Intégrité

| Fichier | Taille | Empreinte SHA256 |
|---|---|---|
| `NetTools.exe` | ~21 Mo | `BA3E221FE012B8C8A19E11D122ABA92A3B0D2FF44F65FCAF0821BAC852F73225` |

---

## 🛠️ Compatibilité
* **Système d'exploitation** : Windows 10 / Windows 11 (64-bit)
* **Architecture** : Wails v2 / Go 1.27 / React 19 / SQLite
* **Sécurité** : Chiffrement local des secrets au repos (DPAPI Windows)
