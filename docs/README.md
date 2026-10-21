# Documentation NetTools

NetTools est une application desktop Windows de découverte, de sauvegarde et
d'audit réseau. Cette documentation décrit le produit public courant et les
commandes de sa branche de développement.

## Utiliser l'application

- [Présentation et installation](../README.md).
- [Guide utilisateur de référence](../NOTICE.md).
- [Notice HTML autonome](../Notice_NetTools_page.html) : à ouvrir localement dans un navigateur.
- [Support et diagnostic](../SUPPORT.md).
- [Sécurité et signalement confidentiel](../SECURITY.md).

## Développer et contribuer

- [Installation, compilation et contrôles](DEVELOPMENT.md).
- [Architecture et données](ARCHITECTURE.md).
- [Contribuer](../CONTRIBUTING.md) et [code de conduite](../CODE_OF_CONDUCT.md).
- [Ressources Windows](../build/README.md).
- [Présentation GitHub à appliquer](GITHUB_PRESENTATION.md).
- [Changelog](../CHANGELOG.md) et [notes v1.6.0](../RELEASE_NOTES_v1.6.0.md).

## Comprendre les licences

- [Apache License 2.0](../LICENSE) et [NOTICE légal](../NOTICE).
- [Licences et attributions tierces](../THIRD_PARTY_NOTICES.md).
- [Inventaire verrouillé](dependency-license-inventory.json).
- [Audit de migration et réserves de publication](OPEN_SOURCE_AUDIT.md).

## Sources et archives

`NOTICE.md` est la source du manuel. `tools/generate_notice_pdf.py` produit les
rendus HTML et, sur demande, le PDF ; n'éditez pas leurs copies manuellement.
`NOTICE-Copie.md` redirige vers la source pour éviter deux versions divergentes.
Les notes de release, le PDF explicitement nommé v1.3.2, les spécifications
sous `specs/` et les anciennes preuves Sentinel sont des archives : ils ne
constituent pas la documentation des fonctionnalités actuelles.

Les anciennes preuves Sentinel ne doivent pas être utilisées comme garanties
d'authenticité : leur ancienne clé HMAC a été publiée. Voir [SECURITY.md](../SECURITY.md).
