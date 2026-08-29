# NetTools v1.5.0 — Release Notes

## 🚀 Nouveauté Majeure : Utilisation des Ports (Port Tracker)

NetTools intègre désormais un nouveau module de suivi historique de l'utilisation des ports réseau. Ce module permet d'identifier de manière fiable les interfaces physiques inutilisées ou potentiellement récupérables sur les switches.

### 🌟 Fonctionnalités

*   **Historique Persistant** : L'état des ports est mémorisé, permettant de résister aux reboots de switches et aux coupures temporaires.
*   **Suivi Last UP / Last DOWN** : Connaissance exacte de la dernière fois qu'un port a été vu actif.
*   **Classification Intelligente** : Les ports sont classés en catégories claires : `USED`, `INACTIVE`, `NEVER_SEEN_UP`, `PROBABLY_FREE`, `RESERVED`, `INFRASTRUCTURE`, `UNKNOWN`.
*   **Score de Confiance** : Un algorithme calcule un score de confiance (0-100) pour éviter les faux positifs (ex: un port trunk DOWN est protégé).
*   **Enrichissement FDB / LLDP** : Les données des tables d'adresses MAC (FDB) et les voisins LLDP sont croisés pour garantir qu'aucun lien d'infrastructure n'est déclaré libre par erreur.
*   **Interface Dédiée** : Une nouvelle vue offre des filtres avancés et un résumé synthétique de l'utilisation.
*   **Mode Lecture Seule** : Ce module opère à 100% en lecture seule (IF-MIB, BRIDGE-MIB, LLDP-MIB), n'introduisant aucun risque de modification sur vos équipements.
*   **Rétrocompatibilité** : Aucune donnée n'a été altérée, l'inventaire existant reste intact.
