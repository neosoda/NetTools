# Comparaison de toutes les versions SSH disponibles

Comparaison du 14 octobre 2026, effectuée sur les objets Git locaux. Le dépôt n'est pas shallow. Périmètre : tous les neuf tags disponibles, HEAD avant instrumentation, tous les commits qui modifient les trois fichiers SSH/backup, le point d'entrée `App.RunBackup` et les versions déclarées de `golang.org/x/crypto`. Aucun binaire ancien ni équipement réel n'a été exécuté. Les modifications d'instrumentation non commitées restent distinctes de cette comparaison.

## Résultats principaux

1. Le moteur actuel ne date pas de la 1.4 : `session.go` et `engine.go` sont strictement identiques depuis `v1.3.1`, et `manager.go` depuis `v1.3.0`.
2. Le passage du backup de shell direct à exec sans PTY, avec repli shell, apparaît dans `1497db8`, le 21 mars 2026, avant `v1.3.0`.
3. La fin heuristique après trois secondes, sans prompt obligatoire, apparaît dans `d2aaee2`, le 20 mars 2026, après le tag `v1.0.0` et avant `v1.3.0`.
4. Le retour des seuls octets reçus après l'envoi de commande apparaît dans `7724fd7`, le 14 avril 2026, pour `v1.3.1`. Avant cela, le lecteur renvoyait aussi les bannières, prompts et réponses de préparation.
5. La reconnaissance de pagination Allied a été réduite dans `1497db8` : suppression de `<cr>` et `Press any key`, maintien de `-- More --`. Le message de commit invoque les faux positifs de `<cr>` ; ce commentaire n'est pas une preuve concernant les switches de l'utilisateur.

Ces changements sont des candidats historiques précis. Ils ne démontrent pas lequel provoque l'échec réel. En particulier, aucune réussite réelle des versions anciennes sur les équipements concernés n'a été fournie ou vérifiée.

## Matrice de toutes les releases disponibles

| Tag / état | Commit | Backup Allied | Lecture interactive | `x/crypto` |
|---|---|---|---|---|
| `v1.0.0` | `91ae1df` | Shell direct avec PTY | Buffer global ; 15 polls stables avec prompt, ou 50 sans prompt ; pas d'heuristique `exit/end` à trois secondes | `v0.48.0` |
| `v1.3.0` | `856dfcd` | Exec sans PTY, puis shell si erreur/rejet/sortie courte | Buffer global ; 10 polls avec prompt, 30 avec marqueur, 50 sans prompt | `v0.48.0` |
| `v1.3.1` | `b54e835` | Même stratégie | Shell persistant ; retour limité aux nouveaux octets ; mêmes seuils 10/30/50 | `v0.48.0` |
| `v1.3.2` | `b756f18` | Identique à `v1.3.1` | Identique | `v0.48.0` |
| `v1.3.2-docs` | `f087135` | Identique | Identique | `v0.48.0` |
| `v1.4.0` | `80155bf` | Identique | Identique | `v0.48.0` |
| `v1.4.1` | `5f19a89` | Identique | Identique | `v0.53.0` |
| `v1.5.0` | `5f19a89` | Identique ; voir particularité du tag ci-dessous | Identique | `v0.53.0` |
| `v1.5.1` | `1ad048f` | Identique | Identique | `v0.53.0` |
| HEAD avant instrumentation | `beeba55` | Identique | Identique | `v0.53.0` |

Les polls durent 100 ms. Les seuils représentent le nombre d'observations stables après une première observation du dernier changement, pas des délais précis depuis l'envoi de commande.

Particularité de version : les tags locaux `v1.5.0` et `v1.4.1` pointent sur le même commit. Cela limite ce que le tag prouve sur le binaire distribué sous le nom 1.5.0. Les commits de port tracker `35b27e2` et son merge `b50ecf0`, associés à l'évolution 1.5, ont aussi exactement les mêmes fichiers `session.go` et `manager.go`. Cette particularité ne révèle donc pas de variante SSH supplémentaire dans le code disponible.

Il n'existe pas de tags `v1.1.x` ou `v1.2.x` dans ce dépôt. L'ancienne application Python est mentionnée dans des messages de commit, mais son moteur SSH n'est pas présent dans l'historique inspecté ; les fichiers Python disponibles concernent notamment les notices et le runner Netmiko des playbooks. On ne peut pas comparer un moteur Python absent ni attester le contenu des binaires de release à partir des seuls tags.

## Chronologie des changements, y compris hors releases

| Commit | Date | Changement utile au diagnostic |
|---|---|---|
| `59a8d59` | 17 mars 2026 | Backup directement interactif. PTY `vt100`, hauteur 0, largeur 512, ECHO=0, vitesse 9600. Attente fixe de 500 ms, envoi avec LF. Buffer `strings.Builder` partagé sans mutex. Fin sur stabilité avec prompt, `sess.Wait()` ensuite sans limite propre. Pas de seuil minimal de sortie dans le manager. |
| `777e752` | 18 mars 2026 | Hauteur PTY portée à 200 ; attente du prompt initial jusqu'à 10 s ; polling 150 ms, fin à 20 polls stables avec prompt, repli à 40 polls sans prompt. |
| `569a859` | 19 mars 2026 | PTY interactif 512 × 512, vitesse 115200 ; envoi CR ; readiness 15 s ; `terminal length 0` et attente de préparation 5 s ; polling 100 ms, lecture des 200 derniers octets, fin à 15 polls avec prompt ou 50 sans prompt ; attente de fermeture plafonnée à 3 s ; nettoyage renforcé et rejet des sorties de moins de 10 caractères. Reconnaissance Allied `<cr>`, `--More--`, `Press any key`. C'est l'état du moteur dans `v1.0.0`. |
| `ec59a72` | 20 mars 2026 | Extraction après écho de commande et suppression des prompts finaux ajoutées au manager. Le backup reste directement interactif. |
| `d2aaee2` | 20 mars 2026 | Prompt reconnu sur dernière ligne ; stabilité avec prompt abaissée à 10 polls ; ajout de `configOutputLooksComplete` à 30 polls avec `end`, `return`, `exit`, `#`, `>`. |
| `1497db8` | 21 mars 2026 | Backup exec d'abord sauf Aruba ; PTY supprimé du chemin `RunCommand` ; erreurs exec toujours propagées même avec sortie ; buffer protégé ; détection fournisseur ; pagination Allied réduite ; suppression de détection de bannière pendant la sortie ; extraction séparée exec/shell ; nettoyage qui supprime les erreurs CLI `% ...` et carets. |
| `5b14fc6` / `856dfcd` | 31 mars 2026 | Import et renommage du projet ; moteur de session identique à `1497db8`. Cet import apparaît comme un autre commit initial dans l'historique. |
| `7724fd7` | 14 avril 2026 | Shell persistant ; `startLen` avant commande et retour des nouveaux octets uniquement ; suppression de l'attente de fermeture allant jusqu'à 3 s ; moteur de commandes réutilisant le shell ; ajout de récupération VLAN Allied. La récupération ne s'applique pas à `show running-config`, car limitée aux commandes commençant par `vlan` ou `name`. |
| Releases suivantes | Depuis `v1.3.1` | Aucun changement supplémentaire de ces chemins SSH/backup dans le code commité. |

Le chemin `RunCommand` avant `1497db8` faisait bien un exec **avec demande de PTY `xterm` 200 × 200**, mais le manager de backup ne l'appelait pas : il utilisait le shell. Confondre cette méthode disponible avec le chemin réellement exécuté donnerait une comparaison incorrecte.

## Ce qui était déjà fragile et ce qui a changé

### Faiblesses anciennes communes

- Pas d'apprentissage du prompt ; regex terminale dépendant du texte brut.
- Fin possible sur stabilité, même sans preuve de configuration complète.
- Pagination reconnue par recherche dans le buffer, sans consommation explicite du marqueur.
- Erreurs d'écriture ignorées et annulation/timeout de lecture finale transformés en retour sans erreur.
- Aucune garantie générale que le timeout de connexion limite aussi toutes les étapes de négociation.

### Trois changements qui peuvent créer des comportements différents

**Exec d'abord, avant 1.3.0.** Deux réponses différentes du serveur à exec peuvent conduire à deux chemins différents dans NetTools, même si les sessions manuelles ont le même comportement. La version 1.0.0 n'exposait pas le backup à ce premier essai.

**Pagination Allied réduite, avant 1.3.0.** Le lecteur actuel ne répond plus à `<cr>` et `Press any key` comme marqueurs de pagination Allied. Une sortie qui affiche ces indications peut rester bloquée, alors que celle avec `--More--` est reconnue. Il faut observer ce que les équipements concernés émettent ; on ne peut pas supposer ces différences.

**Retour des nouveaux octets uniquement, en 1.3.1.** Si le lecteur conclut trop tôt sur un ancien prompt, les anciennes versions pouvaient encore renvoyer une bannière ou une réponse de préparation. Depuis 1.3.1, elles sont exclues du résultat de la commande : une sortie vide devient donc possible et entraîne `failed`. Une ancienne réussite pouvait masquer un fichier incorrect ; l'absence de statut `failed` ne prouve pas qu'une configuration complète avait été sauvegardée.

La fin après trois secondes est plus ancienne que le shell persistant. Le changement 1.3.1 retire également l'attente finale pouvant ajouter trois secondes, ce qui modifie la durée globale observée sans modifier le seuil de détection de fin. Une durée totale de 3,5 s ne suffit donc pas à identifier la branche.

## Dépendances et appelant

`App.RunBackup` est textuellement identique de `v1.3.0` à HEAD : contexte du batch de 10 minutes, cinq workers, remontée de `ErrorMessage`/erreur au frontend. La différence avec `v1.0.0` concerne la recherche d'IP dans les événements et la protection du calcul du pourcentage, pas un délai SSH de 3,5 secondes.

Le manager configure 60 s pour le SSH dans toutes les releases inspectées. Le changement de `golang.org/x/crypto v0.48.0` à `v0.53.0` intervient en `v1.4.1`, avec Go 1.25 et un toolchain déclaré 1.26.5. Le code NetTools ne change pas à cette occasion.

La comparaison des sources locales de la bibliothèque `ssh/session.go` entre ces deux versions montre une seule différence : un `exit-status` de moins de quatre octets est désormais rejeté par une erreur `ssh: malformed exit-status request`, au lieu d'être lu sans vérification. Les méthodes exec/shell/PTY et `Wait` n'ont pas d'autre différence dans ce fichier. D'autres fichiers de la bibliothèque évoluent ; cette vérification ne les exonère pas globalement. Si le problème existe effectivement en `v1.4.0` avec `v0.48.0`, cette nouvelle vérification de `v0.53.0` ne peut pas, à elle seule, expliquer tous les échecs.

## Preuves d'identité et reproductibilité

Identifiants Git des fichiers (préfixes de blob) :

| État | `session.go` | `engine.go` | `manager.go` |
|---|---|---|---|
| `v1.0.0` | `9b4baa9cbf92` | `c42a061db695` | `ecf576f868d6` |
| `v1.3.0` | `7bdbc87a2206` | `c42a061db695` | `7b4d7a395e67` |
| Tous les tags depuis `v1.3.1` et HEAD | `abe50e9d6a1f` | `0ac7db25ebc6` | `7b4d7a395e67` |

Commandes de vérification employées :

```powershell
git tag --sort=version:refname
git log --all --follow -- internal/ssh/session.go
git log --all -- internal/ssh/engine.go internal/backup/manager.go
git diff v1.0.0 v1.3.0 -- internal/ssh/session.go internal/backup/manager.go
git diff v1.3.0 v1.3.1 -- internal/ssh/session.go internal/ssh/engine.go
git diff v1.3.1 HEAD -- internal/ssh/session.go internal/ssh/engine.go internal/backup/manager.go
git show d2aaee2 -- internal/ssh/session.go
git show 1497db8 -- internal/ssh/session.go internal/backup/manager.go
git show 7724fd7 -- internal/ssh/session.go internal/ssh/engine.go
git rev-parse v1.3.1:internal/ssh/session.go
git rev-parse HEAD:internal/ssh/session.go
```

Le diff `v1.3.1` → HEAD sur les trois fichiers était vide avant instrumentation et reste vide pour les objets committés, puisqu'aucun nouveau commit n'a été créé. Cette comparaison n'a nécessité aucun nouveau test réseau, aucune modification du moteur, aucun checkout d'une ancienne version et aucune modification de configuration.

Les traces nécessaires pour départager les mécanismes lors du prochain essai autorisé sont décrites dans `ssh-backup-diagnostics.md`. Le constat historique renforce l'intérêt de conserver le motif exact de fin, le chemin exec/shell et les octets nouveaux ; il ne justifie pas un retour global au moteur 1.0.0.
