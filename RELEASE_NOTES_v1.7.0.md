# NetTools v1.7.0 — Notes de release

Date de publication : 22 octobre 2026

## Nouveautés

- **Suivi en temps réel des playbooks** :
  - Barre de progression globale avec pourcentage d'avancement réel calculé et mis à jour en direct.
  - Compteurs d'équipements traités / total, réussites, échecs, annulations et restants.
  - Affichage en temps réel de l'équipement en cours de traitement (hostname et IP), de l'étape et de la commande SSH active.
  - Statuts visuels explicites : *En attente*, *En cours*, *Réussi*, *Échec*, *Annulé*.
  - Chronomètre du temps écoulé depuis le lancement (`MM:SS`).
  - Terminal de sortie en direct avec défilement automatique intelligent et détection de consultation de l'historique (mise en pause automatique et reprise sur demande).
  - Récapitulatif final détaillé par équipement avec durées, accordéon par équipement et détail intégral des commandes, sorties et erreurs.

- **Organisation de l'inventaire par groupes** :
  - Création, renommage et suppression de groupes personnalisés (établissements, sites, bâtiments, etc.).
  - Maintien automatique du groupe « Non classés » pour les équipements sans affectation (la suppression d'un groupe préserve tous les équipements en les reversant dans « Non classés »).
  - Affichage hiérarchique repliable/dépliable par groupe avec badges de comptage d'équipements.
  - Sélections avancées : sélection/désélection globale, sélection d'un groupe entier en un clic, sélection individuelle et simultanée avec cases à cocher à état indéterminé (sélection partielle).
  - Action en lot « Assigner au groupe… » pour déplacer ou affecter rapidement des équipements sélectionnés.
  - Intégration du sélecteur par groupes dans les modules de **Sauvegardes**, d'**Audits** et de **Playbooks**.
  - Persistance SQLite et compatibilité ascendante complète avec les imports/exports JSON existants.

- **Interruption des playbooks et opérations longues** :
  - Bouton rouge « Arrêter » visible et accessible en continu pendant les traitements (Playbooks, Sauvegardes, Scans).
  - Feedback utilisateur réactif : passage immédiat à « Arrêt demandé… » puis affichage clair « Annulé par l'utilisateur ».
  - Gestion native côté backend Go via `context.Context`, arrêt propre des commandes suivantes et fermeture sécurisée des sessions SSH.
  - Préservation intégrale des résultats partiels collectés avant l'arrêt.
  - Refonte de `StopAllTasks()` et ajout de méthodes d'annulation ciblées (`CancelPlaybook`, `CancelBackup`, `CancelScan`) sans impacter arbitrairement les autres traitements.
  - Aucune commande d'annulation ni rollback destructif envoyé sur les équipements réseau.

## Sécurité et fiabilité

- DPAPI et sécurité des identifiants : aucun mot de passe ou secret SSH/SNMP n'est exposé dans les événements, les logs ou les exports.
- Tous les tests unitaires et d'intégration Go (`go test -v -count=1 ./...`) et le contrôle TypeScript (`npx tsc --noEmit`) sont validés à 100%.

## Prérequis Windows

- Windows 10 ou Windows 11 64 bits.
- Microsoft Edge WebView2 Runtime installé (généralement déjà présent sur Windows 10/11 à jour).

Téléchargez `NetTools.exe`, puis exécutez-le localement. Les données de l'application sont conservées dans `%APPDATA%\NetTools`.
