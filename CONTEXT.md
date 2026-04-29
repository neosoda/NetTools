# PROJECT CONTEXT

Informations manquantes ou ambiguës à revalider avant décision structurante :
- HYPOTHÈSE: le produit cible d'abord Windows 10/11 x64 avec WebView2. Aucun support Linux/macOS n'est garanti malgré quelques fallbacks Go.
- HYPOTHÈSE: l'environnement réel est on-premise, réseau interne, souvent sans dépendance cloud et potentiellement avec accès Internet limité.
- HYPOTHÈSE: les utilisateurs sont des administrateurs IT autorisés à scanner, auditer et sauvegarder des équipements réseau.
- HYPOTHÈSE: les équipements prioritaires sont Cisco, Aruba/HPE, HP ProCurve, HPE Comware, Huawei, Fortinet et Allied Telesis.
- HYPOTHÈSE: l'inventaire est volontairement éphémère au démarrage. Cette règle est fragile et doit être confirmée avant toute persistance durable des devices.
- Ambigu: exigences réglementaires exactes, politique de rétention officielle, classification des données, règles RGPD et exigences d'audit interne.
- Ambigu: seuils de performance acceptables pour les scans, backups concurrents, gros exports Excel/ZIP et topologies volumineuses.
- Ambigu: stratégie de release, signature binaire, distribution MSI/EXE, canal de mise à jour et politique de compatibilité ascendante.
- Ambigu: matrice de tests avec équipements réels. Les tests unitaires présents ne couvrent pas toute l'intégration SNMP/SSH.
- Ambigu: niveau de support attendu pour SNMPv3, clés SSH, commandes destructrices via terminal/playbooks et remediation automatique.

## Purpose
- NetTools est une application desktop Windows pour découvrir, inventorier, sauvegarder, auditer et comparer des configurations d'équipements réseau.
- Le projet existe pour donner aux administrateurs IT un outil local, robuste et traçable, sans dépendance obligatoire à un service cloud.
- Il privilégie la fiabilité opérationnelle, la sécurité des credentials et la lisibilité des résultats sur l'élégance architecturale.

## Non-Goals
- Ne pas devenir une plateforme cloud, SaaS ou multi-tenant.
- Ne pas exposer d'API réseau publique ou de service serveur permanent sans décision explicite.
- Ne pas remplacer une CMDB, un SIEM, un orchestrateur réseau industriel ou un outil NAC.
- Ne pas garantir un support complet de tous les vendors réseau.
- Ne pas exécuter de remédiations destructrices automatiquement sans validation humaine explicite.
- Ne pas stocker les mots de passe, communautés SNMP ou clés privées en clair.
- Ne pas faire de refactor global pour satisfaire une préférence esthétique.
- Ne pas rendre l'application dépendante d'Internet au runtime.
- Ne pas modifier silencieusement la politique de stockage local des données.

## Target Environment
- OS cible: Windows 10/11 x64.
- Runtime desktop: Wails v2 avec WebView2.
- Runtime backend: Go 1.24.7 selon `go.mod`.
- Runtime frontend de développement: Node.js 18+ minimum, Vite, React et TypeScript.
- Données applicatives: `%APPDATA%\NetTools\` pour `nettools.db`, `settings.json` et `logs/`.
- Backups: par défaut dans `%USERPROFILE%\Downloads\NetTools_Backups`, configurable via `settings.json`.
- Base locale: SQLite via GORM, journal WAL, `busy_timeout=5000`, clés étrangères activées.
- Exécution cible: poste administrateur, on-premise, réseau interne.
- HYPOTHÈSE: l'application doit fonctionner hors ligne après installation.
- Latence: les opérations réseau doivent être bornées par timeout, cancellables quand possible et ne jamais bloquer durablement l'UI.
- Mémoire: éviter de charger inutilement de très gros exports ou ZIP en mémoire. Toute exception doit être justifiée.
- Sécurité: l'environnement local de l'utilisateur n'est pas considéré comme totalement sûr. Les secrets restent chiffrés au repos.

## Architecture Overview
- Backend: Go, package `main` pour la façade Wails, modules métier sous `internal/`.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, Zustand, Radix UI, ReactFlow.
- Desktop bridge: Wails expose les méthodes de `App` au frontend et émet des événements runtime pour progression scan, backup, terminal et playbooks.
- Persistance: SQLite + GORM, modèles dans `internal/db/models`.
- Secrets: `internal/secret`, DPAPI Windows, fallback AES-256-GCM hors Windows.
- Réseau: `internal/snmp` pour découverte SNMP et LLDP, `internal/ssh` pour connexions, shells interactifs et commandes vendor-specific.
- Backups: `internal/backup`, fichiers texte horodatés, noms Windows-safe, hash SHA256 et export ZIP validé.
- Audit: `internal/audit`, règles regex stockées en base, seed initial et migrations applicatives simples.
- Diff: `internal/diff`, comparaison de configurations et export HTML.
- Scheduler: `internal/scheduler`, cron local en mémoire, jobs persistés en base.
- Topologie: `internal/topology`, graphe construit depuis devices et liens LLDP.
- Logging: `internal/logger`, zerolog vers stdout, fichiers mensuels et table `audit_logs`.
- Pattern assumé: façade applicative Wails dans `app.go`, logique isolée autant que possible dans `internal/*`.
- Volontairement simple: pas de backend HTTP, pas de service distant, pas d'authentification multi-utilisateur, pas de migration SQL sophistiquée.
- Volontairement complexe: compatibilité SSH multi-vendor, nettoyage des sorties CLI, gestion interactive Aruba/HPE, chiffrement local, tâches longues avec progression.
- Dette consciente: `app.go` est volumineux et mélange orchestration, validation, dialogues Wails et logique de flux. Ne pas l'agrandir sans raison forte.

## Constraints (NON NEGOTIABLE)
- Windows est la cible produit principale. Tout changement cross-platform ne doit pas dégrader Windows.
- Les secrets ne doivent jamais être exposés dans les réponses JSON, logs, événements Wails, exports ou erreurs utilisateur.
- Les structs `CredentialView` et champs `json:"-"` des secrets sont des garde-fous. Ne pas les contourner.
- Les fichiers générés `frontend/wailsjs/**` ne doivent pas être modifiés à la main.
- Les données utilisateur restent locales. Toute synchronisation cloud requiert une décision explicite.
- L'inventaire est actuellement réinitialisé au démarrage. Ne pas changer ce comportement sans décision produit explicite.
- Les backups doivent conserver un hash SHA256 et une trace en base.
- Les exports ZIP doivent valider l'intégrité des fichiers ajoutés.
- Les opérations réseau doivent avoir timeout, gestion d'erreur et journalisation minimale.
- Les commandes SSH/playbook peuvent modifier des équipements. Toute extension doit minimiser le risque d'exécution accidentelle.
- Les chemins de fichiers doivent rester compatibles Windows, y compris caractères interdits et chemins longs.
- La base SQLite doit rester accessible en local sans serveur externe.
- Les changements de schéma doivent être compatibles avec les installations existantes.
- Les dépendances doivent rester verrouillées via `go.sum` et `frontend/package-lock.json`.
- Ne jamais supprimer ou déplacer `OLD/`, `build/`, `frontend/dist/` ou des artefacts existants sans demande explicite.

## Coding Rules
- Go: utiliser `gofmt`, erreurs explicites, wrapping avec `%w` quand l'appelant peut agir.
- Go: garder la logique métier dans `internal/*`. `app.go` doit orchestrer, adapter Wails et valider les entrées.
- Go: préférer des fonctions petites et testables pour parsing, normalisation vendor, nettoyage CLI, génération de fichiers et règles d'audit.
- Go: toute goroutine doit avoir un `context.Context`, une stratégie d'arrêt et éviter les fuites de channels.
- Go: protéger les états partagés avec mutex ou canaux. Ne pas lire/écrire `scanCancel` ou états similaires sans discipline claire.
- Go: ne pas ignorer les erreurs sauf justification locale évidente et sans impact utilisateur.
- Frontend: TypeScript strict pragmatique. Éviter `any` sauf frontière Wails ou dette explicitement contenue.
- Frontend: centraliser les appels backend dans `frontend/src/lib/backend.ts`, `api.ts` ou wrappers existants.
- Frontend: les pages restent dans `frontend/src/pages`, les composants réutilisables dans `frontend/src/components`, le contexte global dans `frontend/src/context`.
- Frontend: ne pas appeler directement des méthodes Wails depuis plusieurs patterns concurrents si un wrapper existe.
- UI: conserver le langage visuel existant. Ne pas introduire un design system parallèle.
- Erreurs: retourner des messages exploitables, sans fuite de secret.
- Erreurs réseau: distinguer timeout, authentification, commande rejetée, sortie vide et annulation utilisateur.
- Logging: utiliser `internal/logger`. Journaliser action, cible, statut, durée et cause technique quand utile.
- Observabilité: toute tâche longue doit émettre une progression ou un statut final via événement Wails quand elle est lancée depuis l'UI.
- Tests: ajouter ou ajuster des tests Go ciblés pour toute logique backend pure modifiée.
- Validation minimale avant livraison: `go test ./internal/... -v -count=1` et `cd frontend && npx tsc --noEmit` quand le frontend change.
- Build: `wails build` est la validation d'intégration forte quand les bindings, assets ou options desktop changent.

## Dependency Policy
- Dépendances Go autorisées car déjà structurantes: Wails, GORM, glebarez/sqlite, gosnmp, x/crypto/ssh, robfig/cron, zerolog, excelize, go-diff, yaml.v3, uuid, dpapi.
- Dépendances frontend autorisées car déjà structurantes: React, React Router, TanStack Query, Zustand, Radix UI, Tailwind, Vite, ReactFlow, lucide-react, diff2html.
- Dépendances interdites sans décision explicite: SDK cloud, télémétrie externe, analytics, auto-updater réseau, serveur web public, stockage distant, chiffrement maison supplémentaire.
- Dépendances interdites par défaut: bibliothèques non maintenues, packages sans licence claire, packages qui exécutent du code natif opaque sans nécessité forte.
- Ajout Go: justifier le besoin, vérifier licence, surface d'attaque, maintenance, taille binaire et alternative standard library.
- Ajout frontend: justifier le gain utilisateur, vérifier taille bundle, maintenance, accessibilité et compatibilité WebView2.
- Toute dépendance de sécurité, crypto, parsing de fichiers ou réseau exige revue humaine.
- Toute mise à jour majeure de dépendance exige test ciblé et note de risque.
- Ne pas remplacer une dépendance existante par goût personnel.
- Ne pas supprimer `--legacy-peer-deps` des flux Wails/npm sans vérifier l'installation propre.

## Security Model
- Modèle de menace: utilisateur local autorisé mais poste potentiellement partagé, fichiers locaux accessibles par d'autres processus, équipements réseau sensibles, erreurs humaines possibles.
- Actifs sensibles: credentials SSH, clés privées, communautés SNMP, secrets SNMPv3, configurations sauvegardées, topologie réseau, logs d'audit, inventaire des équipements.
- Hypothèse de sécurité: DPAPI protège les secrets au repos sur Windows pour le profil utilisateur courant.
- Hypothèse de sécurité: les administrateurs qui utilisent l'application sont autorisés à interroger et modifier les équipements ciblés.
- HYPOTHÈSE: les backups de configuration peuvent contenir des secrets réseau. Ils doivent être traités comme sensibles même si générés en `.txt` ou `.zip`.
- Mesure minimale: ne jamais logger plaintext password, private key, SNMP community, SNMP auth/priv secret.
- Mesure minimale: ne jamais exposer les champs chiffrés de `Credential` au frontend.
- Mesure minimale: permissions fichiers restrictives quand le code crée base, logs, settings et backups.
- Mesure minimale: valider et normaliser les chemins choisis par l'utilisateur avant écriture quand possible.
- Mesure minimale: préserver le chiffrement DPAPI Windows.
- Mesure minimale: avertir clairement si le fallback non-Windows est utilisé sans `NETTOOLS_SECRET_KEY`.
- Mesure minimale: empêcher les sorties CLI contenant des secrets d'être copiées vers des logs applicatifs détaillés.
- Mesure minimale: toute feature d'import doit traiter le contenu comme non fiable.
- Volontairement non traité: authentification applicative locale, RBAC, chiffrement complet de la base SQLite, sandbox OS, signature des playbooks, attestation de binaire, gestion centralisée des politiques.
- Risque accepté: SNMPv2c circule en clair sur le réseau. Préférer SNMPv3 quand disponible.
- Risque accepté: terminal et playbooks peuvent exécuter des commandes dangereuses si l'utilisateur les fournit.

## AI USAGE RULES
- Les IA peuvent lire le code, proposer des correctifs ciblés, ajouter des tests, corriger des bugs isolés et améliorer la documentation technique.
- Les IA peuvent modifier une zone précise si l'objectif, le périmètre et la validation sont clairs.
- Les IA doivent annoncer toute hypothèse fonctionnelle ou sécurité avant de l'encoder dans le code.
- Les IA doivent préserver les modifications existantes du worktree qui ne leur appartiennent pas.
- Les IA doivent signaler tout changement inattendu détecté pendant le travail et demander arbitrage.
- Les IA doivent fournir une validation exécutée ou expliquer précisément pourquoi elle n'a pas été exécutée.
- Validation humaine obligatoire: changement de modèle de sécurité, stockage des secrets, chiffrement, chemins de données, politique de logs, exécution automatique de commandes, scheduler, migrations destructrices.
- Validation humaine obligatoire: ajout ou suppression de dépendance, changement de version majeure, modification du modèle de données, changement de comportement au démarrage.
- Validation humaine obligatoire: refactor global, déplacement de modules, modification massive de `app.go`, réorganisation frontend majeure.
- Strictement interdit: exposer des credentials, écrire des secrets en clair, inventer des contraintes métier non marquées, supprimer des fichiers utilisateur, réinitialiser Git, modifier `frontend/wailsjs/**` à la main.
- Strictement interdit: changements silencieux hors périmètre, refactors globaux déguisés, nettoyage opportuniste de style sans lien avec la tâche.
- Strictement interdit: rendre le runtime dépendant d'un service externe sans décision explicite.
- Toute IA doit préférer un patch petit, observable, testable et réversible.
- Toute IA doit documenter les risques résiduels si la validation est partielle.

## Decision Log (Initial)
- Application desktop Windows locale → réduit dépendance infra et surface réseau → alternatives rejetées: SaaS, serveur web centralisé → trade-off: déploiement poste par poste et dépendance WebView2.
- Wails + Go + React → bonne intégration desktop, réseau et UI moderne → alternatives rejetées: Electron pur, CLI Python, webapp hébergée → trade-off: complexité bridge et bindings générés.
- SQLite local + GORM → installation simple et persistance suffisante → alternatives rejetées: PostgreSQL, fichiers JSON seuls → trade-off: migrations moins strictes, concurrence limitée.
- DPAPI Windows pour secrets → s'aligne avec l'OS cible → alternatives rejetées: stockage clair, coffre externe obligatoire → trade-off: portabilité limitée et dépendance au profil utilisateur.
- Fallback AES-256-GCM hors Windows → permet tests/dev non-Windows → alternatives rejetées: absence totale de fallback → trade-off: sécurité faible si `NETTOOLS_SECRET_KEY` absent.
- Inventaire effacé au démarrage → évite état obsolète et force redécouverte → alternatives rejetées: inventaire durable par défaut → trade-off: perte d'historique devices et UX discutable.
- Backups fichiers + métadonnées DB → fichiers facilement récupérables et auditables → alternatives rejetées: blob uniquement en DB → trade-off: cohérence à maintenir entre disque et base.
- Façade `app.go` volumineuse conservée → limite le risque d'un refactor prématuré → alternatives rejetées: découpage global immédiat → trade-off: dette de lisibilité et risque de couplage.
- Règles d'audit seedées en code → simplicité et reproductibilité → alternatives rejetées: catalogue distant → trade-off: mise à jour liée aux releases.
- Events Wails pour progression → feedback utilisateur direct → alternatives rejetées: polling pur → trade-off: contrat implicite entre backend et frontend.
- Dette consciente: couverture de tests faible sur SNMP/SSH réel, playbooks, scheduler et intégration Wails.
- Dette consciente: README et docs existants semblent encodés avec caractères corrompus. Ne pas propager cette corruption dans de nouveaux fichiers.
- À revalider: persistance de l'inventaire, politique de rétention, chiffrement des backups, signature des releases, matrice vendors, exigences RGPD.

## How to Extend Safely
- Ajouter une capacité backend pure dans le module `internal/<domain>` correspondant.
- Ajouter une méthode Wails dans `app.go` seulement comme adaptateur: validation entrée, orchestration service, conversion DTO, événements UI.
- Ajouter une page UI dans `frontend/src/pages` et des composants partagés dans `frontend/src/components`.
- Ajouter ou modifier les wrappers d'appel Wails dans `frontend/src/lib` au lieu de disperser les appels.
- Ajouter des modèles persistés dans `internal/db/models` avec migration compatible via `AutoMigrate` ou mécanisme `SchemaMigration` explicite.
- Ajouter une règle d'audit par seed idempotent avec ID stable et vendor explicite.
- Ajouter un vendor réseau dans les modules SNMP/SSH en conservant les vendors existants et en testant les commandes de backup.
- Ajouter un playbook template seulement s'il est non destructif par défaut ou clairement signalé comme modifiant la configuration.
- Ajouter une tâche scheduler seulement si elle est idempotente, journalisée et sûre en cas d'arrêt applicatif.
- Ne pas toucher manuellement `frontend/wailsjs/**`; régénérer via Wails si nécessaire.
- Ne pas toucher aux chemins `%APPDATA%\NetTools`, settings, logs ou backups sans migration et décision explicite.
- Ne pas modifier `internal/secret` sans revue sécurité.
- Ne pas modifier `internal/ssh/session.go`, nettoyage CLI ou commandes vendor sans tests ciblés et vérification sur équipement réel si possible.
- Ne pas changer la logique de ZIP/export backup sans préserver validation d'intégrité.
- Ne pas remplacer la stratégie SQLite/WAL sans mesure d'impact.
- Règle feature: préserver le comportement existant, ajouter tests sur la logique pure, vérifier TypeScript si UI, documenter risques.
- Règle compatibilité: toute donnée existante dans `nettools.db`, `settings.json` et dossiers backups/logs doit rester lisible.
- Zones sensibles: credentials, DPAPI/fallback, SSH interactif, playbooks, scheduler, migrations DB, exports fichiers, événements Wails, nettoyage de logs.
- Avant gros changement: isoler une étape verticale petite, vérifier, puis élargir. La robustesse prime sur la beauté.
