# Présentation GitHub à appliquer

Les fichiers de présentation de la PR #23 ont été intégrés à `master`.
L'intégration a reçu HTTP 403 lors des tentatives de modification des métadonnées
du dépôt : le champ « À propos » et les sujets n'ont donc pas été modifiés.
Le mainteneur peut appliquer les valeurs suivantes dans les réglages « About »
de la page du dépôt.

## Description

> Application desktop Windows de découverte SNMP, d’inventaire, de sauvegarde SSH et d’audit de configurations réseau. Go · Wails · React.

## Sujets

```text
go
wails
react
typescript
network-management
snmp
ssh
configuration-backup
configuration-audit
windows-desktop
```

Ces sujets décrivent les technologies et fonctions actuelles. N'annoncez pas
une nouvelle release ou une licence appliquée à tous les anciens binaires par
ce simple changement de présentation. La licence Apache du code courant est désormais visible sur la branche par
défaut après fusion de la migration ; cela ne relicencie pas les anciens binaires.

## Vérifications avant de mettre la présentation en avant

- Relire le README et ses liens sur la PR.
- Faire exécuter et examiner la CI ; sa présence dans Git ne prouve pas son exécution.
- Conserver les réserves de sécurité et les obligations tierces documentées.
- Ne pas utiliser d'image de partage présentant des statistiques ou captures inventées.
- Publier une nouvelle version uniquement après validation du packaging et des conditions de release.

Voir le [rapport d'audit](OPEN_SOURCE_AUDIT.md) et la [politique de sécurité](../SECURITY.md).
