# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

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
