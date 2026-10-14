# Correction SSH et validation du 14 octobre 2026

Adresses anonymisées avec le réseau de documentation `192.0.2.0/24` ; les essais concernaient uniquement les équipements internes autorisés.

## Résultat des essais autorisés

Après autorisation explicite de l'utilisateur, les essais ont été limités à deux équipements déjà présents dans le cache NetTools, dans le réseau autorisé `192.0.2.0/24` : `192.0.2.254` et `192.0.2.50`. Aucun balayage du réseau. Identifiants récupérés localement depuis le cache chiffré, sans affichage du mot de passe, ouverture de la base SQLite en lecture seule, sans migration.

Le défaut du chemin interactif est démontré : la connexion ouvre une CLI Allied au prompt `>`. `show running-config` reçoit une erreur de catégorie `invalid_input`, même si l'authentification et l'écriture de commande ont réussi. Le passage par `enable`, sans mot de passe supplémentaire sur ces deux équipements, donne le prompt `#`. La même commande retourne alors une configuration, sans erreur CLI.

| Équipement | Exec sans PTY | Shell au prompt `>` | Shell au prompt `#` après `enable` | Repli de backup corrigé, `enable` automatique |
|---|---|---|---|---|
| `192.0.2.254` | Succès, 31 781 octets normalisés | Rejet `invalid_input`, 93 octets ; un essai a duré 3 529 ms hors authentification | Succès, 31 815 octets normalisés, avec écho et prompt | Succès, 31 815 octets, 5 394 ms hors authentification |
| `192.0.2.50` | Succès, 7 262 octets normalisés | Rejet `invalid_input`, 85 octets | Succès, 7 292 octets normalisés, avec écho et prompt | Succès, 7 292 octets, 4 757 ms hors authentification |

Les tailles des chemins shell incluent l'écho de commande et le prompt ; elles ne sont donc pas directement comparables aux tailles exec. Aucune configuration n'a été affichée ou enregistrée par l'utilitaire de test. Les résultats ci-dessus portent sur la récupération SSH, pas sur un backup complet écrit sur disque par l'interface.

Cela **prouve la cause du rejet dans le chemin interactif testé** et valide sa correction. Les essais exec ont tous réussi ; ils ne démontrent pas pourquoi un ancien binaire aurait choisi le shell, ni que tous les échecs historiques ont cette même origine. Le code commité actuel tente déjà exec en premier. Il faut conserver cette limite de preuve : la durée historique de 3,5 s ne suffit pas, à elle seule, à établir le chemin réellement suivi par le binaire utilisé à l'époque.

## Correction appliquée

- Le manager conserve exec sans PTY en premier et le repli interactif existant.
- Le repli des **backups Allied uniquement** apprend le prompt réel puis, si la CLI est au niveau `>`, envoie `enable` et vérifie le prompt `#` avant `show running-config`. Aucun passage en mode configuration. Un rejet d'`enable` ou une demande de mot de passe supplémentaire sans réponse devient une erreur exploitable ; aucun mot de passe n'est deviné ou renvoyé automatiquement.
- Les commandes générales et les playbooks ne reçoivent pas cette préparation de privilège. Leur détection générique de prompt permet toujours les changements de hostname ou de mode.
- Chaque commande attend uniquement ses nouveaux octets ; le prompt ou le pager précédent ne peut plus la terminer ou déclencher une touche.
- Les fins après trois secondes sur `exit/end` et après cinq secondes de silence sont supprimées. Le reader attend le prompt ou signale une limite/fermeture incomplète ; une sortie partielle n'est plus acceptée comme complète.
- Le prompt est analysé après retrait des contrôles ANSI. La normalisation préserve les séparateurs CR-only.
- La pagination Allied reconnaît également `<cr>` et `Press any key`, **uniquement lorsqu'ils occupent la dernière ligne de terminal**, sans acquitter les occurrences dans une ligne de configuration. Chaque occurrence est acquittée une seule fois et retirée de la sortie.
- L'ouverture de shell exige son prompt initial et la réponse de la préparation de pagination. Une préparation sans réponse ne permet plus l'envoi de la commande principale.
- La fermeture du canal est observée avec `Wait`. Une fermeture sans prompt de commande est une erreur ; les classes et statuts sont tracés sans message distant.
- Pour exec, une fermeture propre sans `exit-status` n'est plus systématiquement un échec : `Wait` a terminé les copies stdout/stderr, et l'absence de statut est autorisée par le comportement documenté dans `x/crypto/ssh`. Les statuts non nuls restent des erreurs ; les sorties de rejet CLI restent rejetées par le manager.
- Une erreur CLI n'est plus effacée par le nettoyage avant validation du backup. Les annulations, limites et erreurs d'écriture sont propagées.

Les réglages de chiffrement/authentification, les dimensions du PTY, les commandes de lecture et les autres fonctionnalités du produit restent inchangés. Les délais n'ont pas été augmentés pour faire disparaître l'échec.

## Preuves synthétiques et contrôles

Avant correction, des tests ont échoué en reproduisant trois défauts : retour sans erreur à 3,1 s sur `exit`, retour sans réponse à 1,1 s sur un ancien prompt, et quatre acquittements du même pager en 450 ms.

Les tests corrigés vérifient les sorties retardées de plus de trois secondes, les sorties incomplètes, les prompts ANSI et changements de mode, les pages successives et faux positifs de pager, les limites et annulations, les fermetures anticipées, les réponses de préparation absentes, les rejets exec, les statuts non nuls et absents, et la confidentialité des événements. Un serveur SSH sur loopback vérifie les trois cas Allied : `>` nécessitant enable, `#` déjà privilégié, et enable rejeté avec absence d'envoi de la commande de backup.

Contrôles : `go test ./...`, `go vet ./...`, `git diff --check`, construction frontend depuis le lockfile existant et construction Wails de production. Aucun changement de dépendance demandé ou appliqué. Le contrôle `-race` reste indisponible dans cet environnement sans CGO.

Binaire de validation : `build/bin/NetTools-v1.5.2.exe`. Il est construit mais n'a pas été lancé automatiquement : l'application initialise aussi d'autres services au démarrage. Les essais SSH ont utilisé directement le moteur corrigé via l'utilitaire isolé.

## Utilitaire de diagnostic

`tools/sshdiagnostic` exige un réseau et un utilisateur explicites. Sans `-probe`, il ne lit que les métadonnées du cache. Avec `-probe`, il exige une liste de deux IP maximum, vérifie leur appartenance au réseau autorisé, et utilise un identifiant de credential explicitement sélectionné. Modes : exec, repli shell de backup corrigé, shell non privilégié de comparaison, ou shell avec enable explicite pour diagnostic.

Seules les commandes de lecture `show running-config`, la préparation de session `terminal length 0` et, lorsqu'il est demandé ou nécessaire au backup Allied, `enable` ont été envoyées. Aucun `configure terminal`, `write`, `copy`, `reload`, modification réseau, changement de mot de passe ou changement de configuration sauvegardée.

Les traces contiennent étapes, compteurs, durées, code de sortie et catégories locales. Le caractère terminal du prompt (`>`/`#`) et la catégorie d'erreur CLI sont tracés, jamais le prompt complet, le hostname, la bannière, le secret ou le contenu de configuration. L'utilitaire associe ces métadonnées à l'IP explicitement testée pour permettre la comparaison.
