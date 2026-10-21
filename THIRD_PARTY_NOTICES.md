# Composants tiers

Le code original NetTools est sous Apache 2.0. Cette licence ne remplace pas
celles des bibliothèques, polices, logos tiers ou outils embarqués. Les notices
et copyrights existants doivent être conservés. `NOTICE.md` est le manuel
utilisateur ; les attributions légales du projet sont dans `NOTICE`.

## Ressources livrées dans Git

| Ressource | Attribution et licence | Preuve / limite |
| --- | --- | --- |
| `frontend/wailsjs/runtime/` | Lea Anthony 2019-present, MIT | Copyright des fichiers et métadonnées du package ; texte MIT ajouté dans `LICENSES/Wails-MIT.txt` depuis Wails 2.11.0 |
| Nunito WOFF2 | Nunito Project Authors, OFL-1.1 | `frontend/src/assets/fonts/OFL.txt`, conservé intact |
| Inter WOFF2 | Rasmus Andersson / Inter Project Authors, OFL-1.1 | `tools/fonts/OFL.txt`, texte officiel upstream ; identité Inter vérifiée dans le fichier, licence confirmée par le propriétaire. Source exacte/version de l'artefact non archivée |
| Logos et icônes NetTools | Création du propriétaire selon sa déclaration | Apache 2.0 pour ces créations originales ; pas de cession de droits sur des marques tierces |

## Dépendances verrouillées

[`docs/dependency-license-inventory.json`](docs/dependency-license-inventory.json)
recense chaque entrée npm verrouillée et chaque module explicitement requis
par `go.mod`, versions, licences npm déclarées et textes Go disponibles dans
le cache lors de l'audit. Cet inventaire inclut des outils de build et des
variantes de plateformes non installées ; il ne prouve pas que tout est livré
dans le binaire. Il ne remplace pas la lecture des textes de licences.

- npm : MIT, ISC, Apache-2.0, BSD-3-Clause et 0BSD ; conserver licences et
  copyrights lors de la redistribution des composants correspondants.
- Lightning CSS : MPL-2.0, essentiellement outil de build. Sa distribution ou
  des modifications de ses fichiers peuvent imposer l'accès aux sources MPL.
  Cela ne place pas automatiquement tout NetTools sous MPL.
- caniuse-lite : CC-BY-4.0. Conserver l'attribution, le lien de licence et la
  mention des modifications pour les données redistribuées.
- Les modules Go ont leurs propres textes, incluant MIT, BSD, Apache et les
  notices combinées de SQLite/modernc et YAML. Les auteurs SQLite déclarent
  le moteur original domaine public ; cela ne dispense pas des obligations
  des wrappers et du code intégré.
- Python/Netmiko et la génération de PDF ne sont pas verrouillés : leur
  graphe et leurs licences ne sont pas validés pour une distribution embarquée.
- WebView2, GTK/WebKit et les runtimes système sont des prérequis distincts,
  sous leurs conditions propres. Ne les reconditionnez pas comme du code Apache.

## Avant toute release

Après installation complète, exécutez `python3 tools/dependency_licenses.py
--bundle /chemin/hors/checkout/THIRD_PARTY_LICENSES.txt` et joignez le résultat
avec `LICENSE`, `NOTICE` et les licences de polices à la distribution. Ce script
échoue si les textes d'un module Go ou package npm installé sont manquants.
Il n'infère pas qu'un fichier nommé LICENSE suffit juridiquement : examinez
les notices, composants intégrés et obligations de source selon le contenu
réellement distribué. Documentez les dépendances optionnelles manquantes.

Le rapport d'audit détaille les vérifications indisponibles. Aucune affirmation
de compatibilité juridique exhaustive n'est faite pour des artefacts non revus.

## Traçabilité corrigée

Le paquet transitoire `react-remove-scroll-bar` est épinglé à 2.3.7 via
`overrides`, dans la plage `^2.3.7` du parent. La version 2.3.8 déclarait MIT
mais son `gitHead` npm était introuvable dans le dépôt déclaré. La source
upstream retenue pour 2.3.7 annonce cette version et fournit son texte MIT.
Les textes absents de certaines archives npm sont conservés dans `LICENSES/npm/`,
avec URL immuable et SHA-256 dans `LICENSES/npm-sources.json`. Ces fichiers sont
liés aux versions et chemins exacts ; une mise à jour exige une nouvelle revue.
