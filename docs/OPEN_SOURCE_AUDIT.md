# Audit et migration open source NetTools

Date : 21 octobre 2026. Base : `81f073a41da9d4b340f7115ff696c6d046b893c6`
(`master`, v1.6.0). Branche de travail : `chore/apache-2-open-source`.
Ce rapport concerne une proposition de migration, sans fusion ni nouvelle release.

## Périmètre et méthode

- Inspection de la structure, des instructions, manifests, verrouillages,
  documents, notices, sources, ressources et artefacts suivis de la base.
- Historique non superficiel : 45 commits accessibles depuis la base ; après
  récupération des branches et tags publics, 90 commits accessibles au total.
  Gitleaks 8.30.0, archive vérifiée avec les sommes publiées, analyse 71 commits
  contenant des changements non exclus par son parcours Git (merges distingués).
- Scan complémentaire de 552 blobs historiques accessibles avec recherches de
  clés privées, tokens courants, URLs avec credentials et marqueurs internes.
  Les valeurs candidates ne sont pas publiées dans ce rapport.
- Inspection des métadonnées npm, textes de licences locaux et upstream,
  fichiers de polices et métadonnées PDF. Aucun audit ne prouve l'absence de
  droits tiers, de secret ou de défaut ; les règles automatiques ont des limites.
- Les publications binaires distantes, forks et contenus inaccessibles ne sont
  pas certifiés. L'historique et les anciennes releases ne sont pas relicenciés
  rétroactivement par la seule addition de LICENSE dans cette branche.

## Constat initial et modifications

| Sujet | Constat | Traitement |
| --- | --- | --- |
| Licence du projet | Badge `Proprietary`, absence de LICENSE racine | Texte officiel Apache 2.0, badge et métadonnées corrigés |
| Copyright | `Copyright 2026 neosoda` dans Wails ; ancienne notice « Tous droits réservés » | Copyright conservé, restriction générale remplacée dans la notice courante |
| Notice légale | `NOTICE.md` est un manuel, pas l'inventaire annoncé par README | Manuel conservé ; ajout de `NOTICE` et `THIRD_PARTY_NOTICES.md` distincts |
| Crédit Emmanuel | Remerciement au script `decouverte2.4.py` | Le propriétaire confirme une inspiration sans code repris et autorise le retrait du remerciement courant ; historique inchangé |
| Logos/icônes | Pas de provenance externe archivée | Le propriétaire déclare sa création des visuels et leur caractère libre ; déclaration consignée sans inventer d'auteur tiers |
| Nunito | Licence OFL déjà présente | Texte et attribution conservés sans modification |
| Inter | WOFF2 identifié Inter, licence absente à proximité | Propriétaire confirme Inter Regular 400, Rasmus Andersson, OFL 1.1 ; texte officiel upstream ajouté, version exacte de la fonte non archivée |
| Runtime Wails généré | Copyright Lea Anthony, métadonnées MIT | Fichiers générés intacts ; texte MIT Wails 2.11.0 ajouté |
| Contributions | Instructions partiellement anciennes, workflow centré sur master | Prérequis et commandes actualisés, branches de contribution, revue des droits et politique de sécurité |
| Automatisation | Pas de workflows actifs ; anciens workflows retirés dans l'historique | CI Windows, tests/vet, TypeScript/build, vulnérabilités, secrets et notices ; Dependabot |

Apache 2.0 s'applique au code original, pas par substitution aux licences tierces.
Les demandes de migration et déclarations du propriétaire constituent la base
de l'autorisation reçue. Git ne permet pas de démontrer à lui seul les droits
éventuels d'employeurs ou d'autres ayants droit ; toute revendication tierce
nouvelle doit bloquer la release jusqu'à résolution. Les copyrights tiers
existants restent conservés. Seul le nouveau script original reçoit un en-tête
SPDX Apache ; aucun réétiquetage massif de code tiers/généré n'est effectué.

## Dépendances et redistribution

L'inventaire `dependency-license-inventory.json` contient 279 entrées npm
verrouillées (incluant variantes optionnelles) et 51 modules Go explicitement
requis. Les textes légaux sont disponibles pour ces modules Go. Les familles
rencontrées sont MIT, ISC, BSD, Apache-2.0, MPL-2.0, CC-BY-4.0 et OFL-1.1 pour
les polices. Ces licences autorisent des usages open source sous leurs propres
conditions ; cela ne signifie pas que tous les composants deviennent Apache.

Les textes absents de certaines archives npm ont été récupérés aux références
upstream immuables et conservés avec empreintes dans `LICENSES/`. Le script
`tools/dependency_licenses.py` produit un bundle des textes pour les modules Go
et packages npm installés. Il échoue sur une preuve locale manquante et ne
remplace pas une analyse juridique du contenu réellement redistribué.
Les composants natifs optionnels d'autres plateformes non installés ne sont
pas tous inclus dans le bundle local ; les releases de ces plateformes exigent
leur collecte. Les notices internes aux sous-répertoires des dépendances doivent
également être revues pour tout reconditionnement.

Points particuliers :

- MPL Lightning CSS : obligations sur les fichiers MPL redistribués/modifiés,
  surtout un outil de build ici, sans conclusion de copyleft sur tout NetTools.
- Données caniuse-lite CC-BY-4.0 : attributions et conditions propres si livrées.
- `react-remove-scroll-bar@2.3.8` déclare MIT mais son gitHead npm n'est pas
  disponible dans le dépôt déclaré. Résolution : override exact 2.3.7, accepté
  par le parent (`^2.3.7`), source 2.3.7 et texte MIT identifiés.
- Netmiko/Python et génération PDF : flux facultatifs sans verrouillage,
  non validés comme distributions embarquées. Ne pas publier leurs dépendances
  comme si elles avaient toutes été auditées ici.
- WebView2 et bibliothèques système restent sous leurs conditions propres.

## Secrets, confidentialité et risques applicatifs

Gitleaks ne remonte aucun secret selon ses règles sur les refs publiques
récupérées. La revue complémentaire repère cependant
`.sentinel-sdd/integrity.key` : une clé HMAC publique ne peut pas authentifier
les anciennes preuves Sentinel contre un tiers. Le propriétaire a autorisé son
retrait du suivi Git et son ajout à `.gitignore`, avec conservation locale.
La clé est déclarée compromise ; elle reste dans l'historique sans réécriture.
Aucun usage applicatif de cette clé n'a été trouvé. Une rotation dans l'outil
Sentinel et une nouvelle validation sont nécessaires avant toute nouvelle preuve.
Ne jamais republier la clé ni son remplacement.

Les recherches complémentaires n'ont pas trouvé de token courant, clé privée
ou URL avec credentials ; elles ont identifié des chemins de poste local dans
`AGENTS.md` et un commentaire inactif de `go.mod`, corrigés dans l'état courant.
Les identités Git historiques et les fichiers anciens sont conservés.
Les références réseau des tests inspectés sont synthétiques ou locales.

Risques préexistants documentés sans modifier les fonctionnalités : vérification
de clé d'hôte SSH désactivée (le commentaire « TOFU » est trompeur), dérivation
faible de clé AES hors Windows sans variable dédiée, sensibilité des exports
et puissance des playbooks. Voir `SECURITY.md`. Cette migration n'est pas un
audit d'intrusion ni une garantie de sécurité.

## Corrections des vulnérabilités de dépendances

- Vite 7.3.6 → 7.3.7 : trois avis `launch-editor`, regroupés en une dépendance
  vulnérable de sévérité élevée par npm audit.
- Go 1.26.5 → 1.26.10 : corrige notamment GO-2026-5972 (ASN.1).
- `golang.org/x/crypto` 0.53.0 → 0.57.0 : GO-2026-6354 et GO-2026-6355 (SSH).
  Dépendances `x/net`, `x/sys`, `x/text` actualisées selon les contraintes amont.
- Excelize 2.11.0 : le scan complet de la cible Windows détecte GO-2026-6688.
  Aucun tag stable corrigé n'est disponible dans la liste amont consultée :
  épinglage au correctif officiel exact
  `v2.11.1-0.20261003002531-6258dcebc4e2`, avec sommes Go vérifiées.
  Ce choix de préversion doit être revu lors de la prochaine release stable.
  Le correctif retenu inclut aussi GO-2026-6695 et les correctifs intermédiaires
  des avis Excelize de septembre. `mscfb` est actualisé selon les contraintes amont.
- `golang.org/x/net` est porté à 0.60.0 pour couvrir également GO-2026-6603,
  bien que le chemin HTTP/2 vulnérable ne soit pas détecté comme appelé.

La directive Go minimale passe de 1.25 à 1.26 pour satisfaire `x/crypto`.
Le dépôt exigeait déjà une toolchain 1.26.5 ; les instructions utilisent
maintenant 1.26.10. Aucun code métier ou test existant n'est modifié.

## Validation

Les résultats finaux sont consignés ci-dessous après les corrections de
sécurité. Les suites GitHub s'exécuteront sur la PR ; une validation locale
n'est pas une preuve que la CI distante ou une session desktop Windows a réussi.

| Vérification | Résultat final |
| --- | --- |
| Installation npm verrouillée | Réussie, cache local accessible |
| TypeScript et Vite production | Réussis ; avertissement existant sur import Wails statique/dynamique |
| npm audit, dépendances de build incluses | 0 vulnérabilité signalée |
| Tests Go backend | 44 tests de premier niveau réussis (78 avec sous-tests), aucun échec |
| Tests façade applicative | 3 tests réussis via `go test app.go app_inventory_test.go` |
| `go vet` | Réussi pour `internal/...` sous Linux et `./...` avec cible Windows |
| Clone contributeur propre | Clone HTTPS de la branche `67b7038` : installation verrouillée, TypeScript, build frontend, tests backend/façade, compilation Windows et bundle de licences réussis ; aucun fichier suivi modifié |
| Compilation Windows production | Exécutable PE x64 produit par compilation croisée ; non exécuté sous Windows |
| Sommes Go | `go mod verify` réussi |
| Govulncheck Windows, 14 packages racines | Aucun symbole vulnérable atteint, aucun paquet importé vulnérable ; 1 alerte de module sur `x/crypto/openpgp`, non importé, sans correctif amont |
| Gitleaks refs publiques | 0 détection selon les règles ; clé HMAC connue traitée séparément |
| Notices tierces | Bundle généré, inventaire et références upstream vérifiés |
| Workflow GitHub | YAML et `actionlint` réussis ; aucune exécution/check distant observé sur la PR lors de la vérification |
| Vite démarré | HTML et point d'entrée transformé servis par requêtes locales |
| Desktop Linux | Non validé : GTK/WebKit absents, installation système refusée par permissions |
| Équipements réels / exécuteur Netmiko / PDF régénérés | Non testés ; artefacts historiques conservés |

La base Go par défaut `vuln.go.dev` est inaccessible dans cette machine. Le
contrôle utilise `https://storage.googleapis.com/go-vulndb`, stockage officiel
confirmé par `golang/vulndb/deploy/gcp-deploy.sh`, avec TLS conservé. Les
checksums des toolchains et modules restent vérifiés ; aucune validation
d'intégrité n'a été désactivée.

## Conditions de publication et limites restantes

- PR en brouillon, aucune fusion ni release automatique. Le propriétaire exige
  la résolution des réserves avant publication. Le problème de traçabilité npm
  est résolu par l'épinglage 2.3.7 ; la clé compromise a été retirée de la version
  suivie, mais la rotation Sentinel doit précéder toute nouvelle signature.
- Exécuter la CI distante et un essai desktop Windows avant une release. La
  compilation croisée ne vérifie ni WebView2 ni les communications réelles.
- Faire relire les attributions et le bundle pour les composants effectivement
  embarqués ; archiver la provenance des nouvelles ressources et dépendances.
- Préserver les droits tiers et revalider toute contestation de provenance.
  Ce rapport n'est pas une certification juridique ou de sécurité.
- Le script et les instructions de démarrage cloud sont enregistrés dans le
  brouillon de configuration. Aucun snapshot d'environnement n'est publié.

Les deux manifests npm conservent `private: true` : ce champ évite une
publication accidentelle sur npm et ne constitue pas une licence propriétaire.
La séparation public/édition privée dans AGENTS.md est conservée ; elle interdit
la fuite de contenus privés, pas les contributions génériques sous Apache.

Le push GitHub signale encore des avis Dependabot sur `master`, qui n'a pas
été modifiée par cette PR. Les résultats de la branche ne prouvent pas que la
branche par défaut est corrigée. Aucun run ni check CI n'est visible pour la
PR au moment du contrôle. La lecture des permissions Actions renvoie HTTP 403
« Resource not accessible by integration » : les réglages ne sont pas modifiés
et la CI distante reste à faire exécuter/vérifier par le mainteneur.

La clé locale conservée a été vérifiée identique octet pour octet à l'ancienne
version, sans affichage de sa valeur, et reste ignorée. Le clone propre ne la
contient pas. L'état suivi du checkout est propre après les commits.


## Harmonisation documentaire après la revue initiale

À la demande du propriétaire, la présentation et les documents courants sont
réécrits pour correspondre au code v1.6.0 : inventaire persistant par défaut,
retrait de Topologie/Port Tracker, statuts d’audit fondés sur les preuves et
absence de script de remédiation. Les archives de releases et le PDF v1.3.2
restent inchangés et sont identifiés comme historiques.

Les guides d’architecture, développement et support complètent le README.
`NOTICE.md` devient la source unique des deux rendus HTML ; le PDF courant
est généré localement sans remplacer l’archive. Les dépendances directes de
génération sont épinglées, et une vérification CI des liens et des rendus est
ajoutée. Les commandes npm/Makefile et l’installation Wails utilisent les
versions verrouillées et préservent `frontend/dist/.keep`.

La vérification visuelle révèle que `logo-universal.png` est le logo Wails,
et non une création NetTools. Sa provenance est établie par identité SHA-256
avec le template React TypeScript du module Wails 2.11.0 déjà vérifié par Go.
Les attributions sont corrigées ; le visuel est conservé sans être réutilisé
pour représenter NetTools. Cette constatation précise la déclaration générale
du propriétaire concernant ses propres visuels.

Validation complémentaire : commande `npm run check` réussie, compilation
croisée Windows réussie, liens locaux contrôlés, rendu navigateur sans requête
d’asset externe, sommaire HTML complet, génération PDF et extraction de son
texte réussies. Les HTML se régénèrent de manière déterministe. Les fichiers
Go et les tests métier n’ont pas été modifiés.

La tentative de mise à jour de la description et des sujets GitHub renvoie
HTTP 403 « Resource not accessible by integration ». Les métadonnées externes
restent inchangées ; les valeurs proposées sont dans `GITHUB_PRESENTATION.md`.
La PR reste en brouillon, sans fusion ni release ; les réserves de publication
et de rotation Sentinel restent applicables.


## Intégration et mises à jour Dependabot autorisées

Le propriétaire a ensuite demandé explicitement de pousser et fusionner les
PR validées. La PR #23 est fusionnée à `master`, suivie de la PR #21 réconciliée
sans rétrogradation : ses mises à jour étaient déjà couvertes par des versions
supérieures. Les mentions de brouillon ci-dessus décrivent l'étape de revue,
pas une interdiction permanente de fusion.

Cette intégration reprend également les commits des PR Dependabot #24 à #38.
Les conflits de manifests/verrouillages sont résolus sans supprimer les mises
à jour précédentes. Wails CLI et module sont alignés sur 2.17.0 ; Vite 8 exige
le plugin React 6, ajouté comme correction de compatibilité. Les cibles
Chrome/Edge 107, Firefox 104 et Safari 16 de Vite 7 sont conservées explicitement.
Les icônes Lucide restent validées par TypeScript ; aucun changement de logique
métier n'est introduit.

L'inventaire actualisé contient 230 entrées npm verrouillées et 53 modules Go
explicitement requis. Les textes MIT des bindings Rolldown sont conservés et
le collecteur inclut aussi `THIRD-PARTY-LICENSE`. Les nouveaux modules Go
`go-toast/v2` et `mimetype` apportent des licences compatibles avec une
distribution respectant leurs conditions (MIT retenue pour le dual-license
`Unlicense OR MIT`).

Les tests backend/façade, TypeScript, build frontend, go vet Linux/Windows,
compilation Windows et contrôles de notices sont exécutés sur l'arbre intégré.
`npm audit` ne remonte aucune vulnérabilité. `govulncheck` ne détecte aucun
symbole ou paquet importé vulnérable ; seul l'avis OpenPGP non importé reste au
niveau module. Les sommes Go et les actions épinglées restent vérifiées.
La CI GitHub est désormais enregistrée et une exécution manuelle est lancée ;
son attente côté GitHub ne doit pas être présentée comme une réussite.

Aucune release binaire n'est créée par ces fusions. Les obligations de
redistribution, la rotation Sentinel avant nouvelle signature et la validation
fonctionnelle sur Windows et matériels réels restent distinctes de cette
intégration de code.

Le packaging Wails Windows est également exécuté avec la CLI 2.17.0, frontend
précompilé et sans synchronisation automatique de go.mod. Il régénère les
fichiers officiels du runtime (ajouts des API de notifications, non utilisées
par le métier) ; ces fichiers sont conservés et le frontend est reconstruit
avant une seconde compilation du package Windows. Les instructions cloud
réutilisables sont alignées sur la CLI 2.17.0. Cela ne remplace pas un essai
fonctionnel sur un poste Windows.
