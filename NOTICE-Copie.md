```markdown
# NetTools — Manuel Utilisateur
## Plateforme de gestion réseau et d'audit de conformité

<div align="center">

**Version 1.3.2**  
*Dernière mise à jour : Avril 2026*  
*Architecture : Wails v2 · Go · React · SQLite*

---

[📥 Télécharger l'application](#) • [📖 Documentation Technique](#) • [🐛 Signaler un bug](#)

</div>

---

## 📑 Table des matières

1. [Présentation & Architecture](#1-présentation--architecture)
2. [Installation & Premier Lancement](#2-installation--premier-lancement)
3. [Interface & Navigation](#3-interface--navigation)
4. [Gestion des Credentials (Sécurité)](#4-gestion-des-credentials-sécurité)
5. [Inventaire des Équipements](#5-inventaire-des-équipements)
6. [Découverte Réseau (Scan SNMP)](#6-découverte-réseau-scan-snmp)
7. [Sauvegarde & Backups SSH](#7-sauvegarde--backups-ssh)
8. [Audit de Conformité](#8-audit-de-conformité)
9. [Comparateur de Configurations (v1.3.2)](#9-comparateur-de-configurations-v132)
10. [Playbooks SSH](#10-playbooks-ssh)
11. [Planificateur de Tâches](#11-planificateur-de-tâches)
12. [Topologie & Journaux](#12-topologie--journaux)
13. [Paramètres](#13-paramètres)
14. [Workflows Types](#14-workflows-types)
15. [Dépannage](#15-dépannage)
16. [Référence Technique](#16-référence-technique)

---

## 1. Présentation & Architecture

**NetTools** est une application desktop autonome pour Windows conçue pour les administrateurs réseau. Elle centralise la découverte, la sauvegarde, l'audit et l'automatisation des équipements (Cisco, Aruba, HP, Huawei, etc.).

### Architecture Technique

| Couche              | Technologie           | Rôle                          |
| ------------------- | --------------------- | ----------------------------- |
| **Frontend**        | React 18 + TypeScript | Interface utilisateur moderne |
| **Desktop**         | Wails v2              | Interface système (WebView2)  |
| **Backend**         | Go 1.24               | Logique métier, SNMP, SSH     |
| **Base de données** | SQLite (GORM)         | Stockage local (WAL mode)     |
| **Sécurité**        | DPAPI / AES-256-GCM   | Chiffrement des credentials   |
| **Réseau**          | gosnmp, x/crypto/ssh  | Protocoles SNMP et SSH        |

---

## 2. Installation & Premier Lancement

### Prérequis
*   **OS :** Windows 10 / 11 (64 bits)
*   **Runtime :** WebView2 (pré-installé sur Win11, [téléchargeable ici](https://developer.microsoft.com/fr-fr/microsoft-edge/webview2/) pour Win10)

### Installation
1.  Téléchargez `NetTools.exe`.
2.  Exécutez le fichier (si Windows Defender bloque, cliquez sur **Plus d'informations** > **Exécuter quand même**).
3.  L'application crée automatiquement ses données dans `%APPDATA%\NetTools\`.

---

## 3. Interface & Navigation

L'interface est divisée en deux zones principales :

*   **Barre latérale gauche :** Navigation entre les modules (Scan, Inventaire, Backups, etc.) et sélecteur de **Credential Global**.
*   **Zone principale :** Contenu du module actif.

> **💡 Astuce :** Le **Credential Global** en bas de la barre latérale est utilisé par défaut pour toutes les opérations (Scan, Backup, Audit) si aucun credential spécifique n'est choisi pour un équipement.

---

## 4. Gestion des Credentials (Sécurité)

> **Accès :** `Paramètres` > `Onglet Credentials`

Les mots de passe et clés SSH/SNMP sont chiffrés (DPAPI/AES-256-GCM) et **jamais stockés en clair**.

### Créer un credential
1.  Cliquez sur **Ajouter** (`+`).
2.  Remplissez les champs SSH (Login, Mot de passe, Clé privée) et/ou SNMP (Version, Communauté, Utilisateur v3).
3.  **Nouveauté v1.3.2 :** Si le credential est complet (un mot de passe ou une clé est renseigné), il est **activé automatiquement** (badge `ACTIF`).

### Gérer les credentials
*   **Modifier :** Les champs sensibles affichent `(inchangé)` par défaut.
*   **Supprimer :** La suppression du credential actif réinitialise simplement le sélecteur.

---

## 5. Inventaire des Équipements

> **Accès :** `Inventaire`

### 🆕 Nouveauté v1.3.2 : Inventaire Stateless
L'inventaire est désormais **vide au démarrage**. Il ne contient que les équipements ajoutés manuellement ou importés.

*   **Ajouter manuellement :** Remplissez IP, Hostname, Vendor, etc.
*   **Import/Export :** Utilisez les boutons `↓` (Export JSON) et `↑` (Import JSON) pour sauvegarder ou restaurer votre inventaire.

### Tester une connexion
Cliquez sur l'icône **prise électrique** à côté d'un équipement pour tester la connexion SSH.

---

## 6. Découverte Réseau (Scan SNMP)

> **Accès :** `Scan réseau`

Le scanner interroge les équipements SNMP (v2c/v3) pour collecter des métadonnées.

### Modes de scan
| Mode         | Description                                    | Exemple              |
| ------------ | ---------------------------------------------- | -------------------- |
| **Switches** | Scanne les IPs `.1` à `.95` et `.254` (rapide) | `10.0.1`             |
| **Complet**  | Scanne tout le `/24` (254 IPs)                 | `10.0.1`             |
| **CIDR**     | Plage personnalisée                            | `10.0.0.0/22`        |
| **Manuel**   | Liste d'IPs                                    | `10.0.1.1, 10.0.1.2` |

### Paramètres recommandés
*   **Workers :** 10 (par défaut), max 50.
*   **Timeout :** 3s (augmenter pour les liens lents).
*   **Export Excel :** Génère un fichier `.xlsx` formaté avec résumé par fabricant.

---

## 7. Sauvegarde & Backups SSH

> **Accès :** `Backups`

### Fonctionnement
Le moteur utilise une stratégie **Exec-first / Interactive-fallback** pour s'adapter à tous les vendors (Cisco, Aruba, HP, Huawei, Fortinet, etc.).

1.  **Type de config :** Running (actuel) ou Startup (persisté).
2.  **Cibles :** Sélectionnez les équipements (manuel ou via le dernier scan).
3.  **Lancer :** La barre de progression s'affiche en temps réel.

### Historique
*   **Visualiser :** Icône 👁️ pour voir le contenu brut.
*   **Terminal :** Icône 💻 pour ouvrir une console SSH directe sur l'équipement.

---

## 8. Audit de Conformité

> **Accès :** `Audit`

Vérifie si les configurations respectent des règles de sécurité prédéfinies (22 règles incluses).

### Lancer un audit
1.  Sélectionnez les équipements (via le dernier scan ou manuellement).
2.  Cochez les règles à appliquer.
3.  Cliquez sur **Auditer**.

### Résultats
*   **Score :** Pourcentage de conformité (Vert/Orange/Rouge).
*   **Remédiation :** Pour chaque règle échouée, un script de correction CLI est généré (bouton **Copier**).

---

## 9. Comparateur de Configurations (v1.3.2)

> **Accès :** `Diff`

Nouvelle interface refondue pour comparer deux fichiers de configuration.

### Fonctionnalités
*   **Vue Split (par défaut) :** Affichage côte à côte avec **scroll synchronisé**.
*   **Diff Sémantique :** Algorithme intelligent détectant les modifications (ligne `changed` en ambre).
*   **Code couleur :**
    *   🟢 Vert : Lignes ajoutées
    *   🔴 Rouge : Lignes supprimées
    *   🟡 Ambre : Lignes modifiées
    *   ⚪ Gris : Lignes inchangées
*   **Filtres :** Ignorer la casse, les espaces, ou utiliser des Regex.
*   **Export HTML :** Génère un rapport standalone sombre.

---

## 10. Playbooks SSH

> **Accès :** `Playbooks`

Automatisez des séquences de commandes sur plusieurs équipements.

### Structure (YAML)
```yaml
name: Vérification Sécurité
timeout: 120s
steps:
  - name: Version
    command: show version
  - name: SSH Status
    command: show ip ssh
    expect: SSH Enabled
```

### Exécution
1.  Créez ou importez un YAML.
2.  Cliquez sur **▶ Exécuter**.
3.  Sélectionnez les équipements cibles.
4.  Consultez le terminal temps réel et le résumé final.

---

## 11. Planificateur de Tâches

> **Accès :** `Planificateur`

Automatisez les backups, scans et playbooks.

### Types de tâches
*   **Backup**
*   **Scan Réseau**
*   **Playbook**
*   **Commande SSH**

### Planification
*   **Mode Simple :** Quotidien, Hebdomadaire, Mensuel (avec aperçu en français).
*   **Mode Avancé :** Syntaxe Cron (ex: `0 30 8 * * 1` pour le lundi à 08:30).

---

## 12. Topologie & Journaux

### Topologie
*   Visualisation graphique des équipements (ReactFlow).
*   Code couleur par vendor (Cisco=Bleu, Aruba=Violet, etc.).
*   Icône ⚡ pour les équipements PoE.

### Journaux
*   **Événements :** Liste chronologique des actions (Scan, Backup, Audit, etc.).
*   **Fichiers Logs :** Lecteur de logs bruts (`nettools-YYYY-MM.log`) au format JSON.

---

## 13. Paramètres

*   **Thème :** Sombre / Clair.
*   **Langue :** Français / English.
*   **Workers :** Parallélisme des opérations.
*   **Répertoire de backup :** Changez le dossier de destination (recommandé : dossier réseau/NAS).

---

## 14. Workflows Types

### Workflow 1 : Audit Hebdomadaire
1.  **Scan** du réseau la veille.
2.  **Inventaire** : Assigner les credentials.
3.  **Planificateur** : Créer une tâche "Audit" pour le Lundi 07:00.
4.  **Résultat** : Recevoir le rapport le mardi matin.

### Workflow 2 : Migration de Configuration
1.  **Backup** avant maintenance (Snapshot T0).
2.  **Maintenance**.
3.  **Backup** après maintenance (Snapshot T1).
4.  **Diff** : Comparer T0 et T1 pour valider les changements.

---

## 15. Dépannage

| Symptôme             | Solution                                                            |
| -------------------- | ------------------------------------------------------------------- |
| **Scan vide**        | Vérifier la communauté SNMP, le port UDP/161 ouvert, et le timeout. |
| **Backup incomplet** | Vérifier le vendor (détecte auto si inconnu), tester via Terminal.  |
| **Erreur DB Locked** | Fermer toutes les instances de NetTools.                            |
| **SSH Refused**      | Vérifier le port (22 par défaut) et les droits du user.             |

**Logs complets :** `%APPDATA%\NetTools\logs\nettools-YYYY-MM.log`

---

## 16. Référence Technique

### Variables de remédiation
Dans les scripts d'audit : `{{hostname}}`, `{{ip}}`, `{{vendor}}`.

### Événements Wails (IPC)
*   `scan:progress` : `{ip, done, total, percent}`
*   `backup:progress` : `{device_id, status, error}`
*   `terminal:output` : `{line, error}`

---

<div align="center">
<p><strong>NetTools v1.3.2</strong> — © 2026 Tous droits réservés.</p>
<p>Basé sur l'original de <em>Emmanuel</em> (decouverte2.4.py).</p>
</div>
```

