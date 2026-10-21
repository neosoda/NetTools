# PRD

- Spec ID: nettools-v1-5-improvements
- Status: draft
- Owner: unassigned
- Last reviewed: pending

## Problem

L'administrateur réseau a besoin de :
1. Corréler rapidement les ports physiques suivis par le Port Tracker avec chaque équipement (nom/IP), filtrer par switch et exporter la liste en CSV.
2. Suivre la volumétrie et la santé des sauvegardes et exporter une archive ZIP vérifiée avec intégrité SHA256.
3. Tester interactivement les profils de sécurité SNMPv3 USM contre un équipement cible directement depuis les paramètres.
4. Compiler et valider un binaire autonome de production NetTools.exe.

## Users and scope

- Primary users: Administrateurs réseau et ingénieurs infrastructure.
- In scope: Modules Port Tracker, Backups, Paramètres/SNMPv3, et build Wails.
- Out of scope: Modifications destructives de schéma de base de données ou services cloud.

## Requirements

- FR-PT-01: Affichage de l'équipement dans le Port Tracker, filtre par switch et export CSV.
- FR-BK-01: Métriques de synthèse des sauvegardes et bouton d'export ZIP avec contrôle d'intégrité SHA256.
- FR-SNMP-01: Dialogue de test interactif SNMPv3 pour valider les paramètres USM (auth/priv).
- FR-BLD-01: Compilation finale et validation de l'exécutable Windows Wails NetTools.exe.

## Acceptance criteria

- AC-PT-01: Le tableau Port Tracker inclut la colonne Équipement, le filtre par switch et l'export CSV opérationnel.
- AC-BK-01: La page Sauvegardes présente les cartes de synthèse et permet l'exportation ZIP vérifiée.
- AC-SNMP-01: Un bouton de test dans les paramètres interroge un hôte cible et retourne les données SNMP ou l'erreur détaillée.
- AC-BLD-01: La commande wails build génère un binaire NetTools.exe fonctionnel sans erreur.

## Risks and assumptions

- Risk: Latence réseau lors des tests SNMPv3 interactifs -> gérée par un timeout court (5s) et retour asynchrone.
