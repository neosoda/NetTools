# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.6.0] - 2026-10-16

### Ajouts
- **Découverte SNMP** : ciblage CIDR, plages et listes d'adresses avec validation, déduplication et plafond de 1 024 cibles ; import TXT/CSV et restitution distincte des réponses et absences de réponse.
- **Inventaire** : persistance SQLite, fusion des imports, déduplication et conservation des métadonnées de découverte.
- **Audit de conformité** : conclusions explicites `conforme`, `non conforme`, `non applicable`, `indéterminé` et `erreur`, accompagnées de preuves contextualisées et d'un score limité aux contrôles évaluables.

### Changements
- Retrait des modules Port Tracker / utilisation des ports et Topologie du produit public.
- Le catalogue d'audit est recentré sur des contrôles génériques et constructeur vérifiables (Cisco, Aruba, AlliedWare Plus, Huawei et Fortinet). Les règles historiques livrées qui portaient des hypothèses de déploiement sont désactivées, sans suppression des données ni des règles créées par l'utilisateur.
- Les recommandations d'audit sont consultatives : NetTools ne génère ni n'exécute de script de remédiation.
- L'audit utilise la dernière sauvegarde et refuse de conclure si elle est absente, `suspect` ou `failed`.

### Sécurité
- Les preuves et recommandations d'audit masquent les éléments de configuration sensibles.
- Les dépendances npm auditées ne signalent aucune vulnérabilité au moment de cette release.

### Validation
- Tests ciblés Go, vérification TypeScript, build frontend et compilation Wails Windows de production.
- Aucun scan réseau ni connexion SSH n'a été exécuté pendant la préparation de cette release.

## [1.5.2] - 2026-10-14

### Corrigé
- **Backups Allied Telesis** : passage au mode privilégié `#` par `enable` dans le repli interactif lorsqu'une session démarre au prompt `>` ; erreur explicite si ce passage est refusé ou nécessite une authentification supplémentaire.
- **Lecture SSH** : réponse délimitée par commande, prompt appris pour les backups, suppression des fins prématurées sur marqueur ou silence et traitement des fermetures de canal.
- **Pagination Allied** : prise en charge de `--More--`, `<cr>` et `Press any key` en dernière ligne de terminal ; un acquittement par occurrence, sans réagir aux tokens contenus dans les lignes de configuration.
- **Erreurs SSH** : propagation des erreurs d'écriture, annulations et limites ; attente exec bornée ; traitement d'une fermeture propre sans statut distant ; erreurs CLI détectées avant nettoyage.
- **Sortie terminal** : conservation des séparateurs CR-only et reconnaissance des prompts après nettoyage ANSI.

### Ajouts
- Diagnostics de récupération corrélés par backup, sans secrets ni contenu de configuration.
- Analyse de l'historique SSH, tests de non-régression et utilitaire isolé de diagnostic en lecture seule.

### Validation
- Tests Go, contrôles statiques et compilation Windows de production.
- Récupération SSH vérifiée sur deux switches Allied, avec exec et le repli interactif corrigé. Ces essais ne valident pas tous les modèles/firmwares ni tous les échecs historiques.

---

## [1.5.1] - 2026-10-11

### Ajouts
- **Port Tracker** :
  - Mapping équipement (Hostname / IP) enrichi sur chaque port avec colonne dédiée dans le tableau.
  - Filtre interactif par commutateur / switch pour isoler rapidement les interfaces.
  - Export CSV complet au format UTF-8 avec BOM (RFC 4180) pour ouverture directe dans Excel.
- **Gestion des Backups** :
  - Cartes métriques récapitulatives d'état (Total, Succès, Échecs, Dernier backup).
  - Indicateur visuel d'intégrité SHA256 avec infobulle du hash sur chaque sauvegarde.
  - Bouton d'export d'archive ZIP vérifiée (`ExportBackupsZip`).
- **SNMPv3 USM** :
  - Bouton « Tester » sur chaque profil d'identification SNMP configuré dans les Paramètres.
  - Modal interactif de diagnostic en direct avec test de connectivité et rapport détaillé (`TestSNMPHostWithCredential`).

---

## [1.5.0] - 2026-08-29

### Ajouts
- **Module Port Tracker** : suivi historique de l'utilisation des ports (Last UP, Last DOWN).
- **Classification et Score de confiance** pour l'identification des ports libres.
- **Enrichissement FDB et LLDP** pour fiabiliser la détection d'infrastructure.
- **Job scheduler `port_scan`** dédié à la mise à jour de l'historique des ports.
- **Page Interface UI** pour visualiser, filtrer et rechercher dans le statut des ports.

---

## [1.4.1] - 2026-07-26

### Sécurité
- Mise à jour des dépendances Go signalées par Dependabot
- Migration vers React 19 et React Router 8 pour supprimer les alertes npm
- Compilation imposée avec Go 1.26.5 afin d'intégrer les correctifs de sécurité de la bibliothèque standard
- Mise à jour de `golang.org/x/text` vers la version corrigée

### Changements
- Prérequis de développement alignés sur Go 1.26.5 et Node.js 22.22
- Résolution TypeScript modernisée pour les exports de modules utilisés par Vite

---

## [1.4.0] - 2026-07-26

### Ajouts
- **SNMPv3 USM complet** avec les niveaux `noAuthNoPriv`, `authNoPriv` et `authPriv`
- Authentification MD5, SHA-1, SHA-224, SHA-256, SHA-384 et SHA-512
- Chiffrement DES, AES-128, AES-192 et AES-256, variantes Blumenthal et Reeder
- Diagnostic SNMP ciblé utilisant le credential global actif
- Tests unitaires de validation des niveaux et protocoles SNMPv3

### Changements
- Configuration USM centralisée pour le scan, la collecte de métadonnées et LLDP
- Chargement systématique des secrets SNMPv3 chiffrés depuis le credential actif
- Interface des credentials enrichie avec le choix explicite du niveau de sécurité
- Validation du nom utilisateur et des phrases secrètes SNMPv3

### Corrigé
- Le scan et LLDP ne forcent plus systématiquement le niveau `authPriv`
- Le collecteur SNMP configure désormais correctement les paramètres USM
- Le diagnostic ciblé respecte maintenant la version SNMP demandée

---

## [1.3.2] - 2026-04-29

### Ajouts
- **Inventaire stateless** : aucune persistance implicite, import/export JSON explicites
- **Auto-activation des credentials** : nouveau credential complet activé automatiquement
- **Badge "ACTIF"** visible dans la liste des credentials (Paramètres)
- **Vue Split refonte** dans le comparateur : scroll synchronisé côte à côte

### Changements
- **Diff sémantique** : appariement delete+insert → ligne `changed` (ambre)
- **Code couleur enrichi** : 🟢 insertion · 🔴 suppression · 🟡 modification · gris neutre
- **Filtre "Diff only"** : masque les lignes inchangées dans les deux modes
- **Toggle Split/Unifié** dans la barre d'options du comparateur
- **Stats diff enrichies** : +ajouts / −suppressions / ~modifiés / =inchangés
- Suppression du credential actif : réinitialisation propre de la sélection

### Corrigé
- Nettoyage approprié du credential actif lors de la suppression

---

## [1.3.1] - 2026-04-15

### Ajouts
- **Terminal SSH persistant** dans les backups et playbooks
- **Smart Syntax Agent** : auto-correction intelligente des commandes (ex: `vlan database`)
- Support **AlliedWare Plus** avec syntaxe adaptée

### Changements
- Amélioration de la fiabilité du socle avant audit

---

## [1.3.0] - 2026-03-31

### Ajouts
- **Logo NetTools** intégré dans la barre latérale de l'application
- **Icône ICO** haute résolution (6 tailles : 16, 32, 48, 64, 128, 256px)
- **Types TypeScript** centralisés dans `frontend/src/types/models.ts`

### Changements
- Rebranding complet : **NetworkTools → NetTools**
- Module Go renommé : `networktools` → `nettools`
- Répertoire de données : `%APPDATA%\NetTools\`
- Variable d'environnement : `NETWORKTOOLS_SECRET_KEY` → `NETTOOLS_SECRET_KEY`
- Binaire de sortie : `NetTools.exe`
- Communauté SNMP par défaut : `TICE` → `public`
- Placeholders IP génériques : `10.113.76.x` → `192.168.1.x`
- Règles d'audit généralisées (syslog, NTP, SNMP, RADIUS)
- README redesigné avec logo, badges et structure moderne

### Corrigé
- Suppression de toutes les références internes spécifiques
- Nommage cohérent dans l'ensemble du projet

---

## [1.2.0] - 2025-12-01

### Ajouts
- **Topologie réseau LLDP** : collecte réelle des voisins LLDP via SNMP
- **Tooltips** sur les contrôles de filtre du comparateur
- **Tooltips** sur les options du comparateur de configurations
- Tests unitaires pour diff comparator, SNMP vendor parser, topology builder et logger
- **Toast notifications** remplaçant les alertes navigateur
- **Confirmations de suppression** sur les équipements et credentials de l'inventaire
- **Makefile** pour les tâches courantes de développement
- **Configuration golangci-lint**
- **Arêtes de topologie basées sur les sous-réseaux** avec sélection heuristique du nœud racine
- **Nettoyage de la rétention des logs** pour les anciens fichiers
- **Validation des entrées** pour les plages CIDR, adresses IP et patterns regex des règles d'audit
- **Mode comparaison de backups** dans la page diff
- **Page Inventaire** ajoutée à la navigation
- **WindowTitleSync** pour les mises à jour dynamiques du titre de fenêtre
- **Champs SNMPv3** (protocoles auth/priv et clés) dans les paramètres
- **Scan SNMP renforcé** avec validation et utilisation des credentials SNMPv3

### Corrigé
- Erreurs `json.Unmarshal` silencieuses dans le scheduler et l'app
- Lookup N+1 dans les callbacks de backup (maintenant O(1) avec map IP)
- Gestion des erreurs DB manquante dans la persistance des résultats d'audit
- Race condition du mode "once" du scheduler (fallback +2min)
- Erreur de format `fmt.Sprintf` dans le CSS HTML du diff (`width:100%`)
- Index GORM sur `Backup.CreatedAt` et `AuditLog.CreatedAt`

### Changements
- Sortie d'erreur dans main.go via `os.Stderr` au lieu de `println`
- Le fallback secret avertit sur stderr lors de l'utilisation de la clé dérivée du hostname

---

## [1.1.0] - 2025-10-15

### Ajouts
- **Planificateur** avec interface calendrier + horloge
- **Page Journaux** avec lecteur de fichiers `.log` mensuels
- **Terminal SSH temps réel** dans les playbooks et les backups
- **Export ZIP** des sauvegardes
- **4 templates de playbooks** prêts à l'emploi

### Corrigé
- Stabilité du pool de workers SSH
- Gestion des connexions SSH interactive vs exec

---

## [1.0.0] - 2025-08-01

### Ajouts
- Scan SNMP v2c/v3 par plage CIDR
- Backup SSH multi-vendor (Cisco, Aruba, HP, Huawei, Fortinet)
- Audit de conformité avec règles configurables
- Comparateur de configurations avec export HTML
- Playbooks SSH YAML
- Topologie réseau (ReactFlow)
- Inventaire CRUD
- Chiffrement DPAPI / AES-256-GCM des credentials
- Export Excel des résultats de scan
