# Analyse initiale du moteur SSH et diagnostic des backups Allied Telesis

**Mise ? jour apr?s autorisation de tests r?els :** le chemin interactif non privil?gi? a ?t? reproduit sur deux switches et corrig?. Les r?sultats et le comportement final figurent dans [ssh-fix-validation.md](ssh-fix-validation.md). Les tableaux ci-dessous d?crivent le moteur historique avant ce correctif.

Analyse du 14 octobre 2026, sur le dépôt courant. Aucun essai sur un équipement réel, aucune modification de configuration réseau.

## Conclusion et niveau de preuve

La cause racine de l'échec sur les switches concernés n'est pas démontrée sans leurs traces de récupération. Une authentification réussie et l'envoi de la commande ne prouvent ni son acceptation par le canal `exec`, ni la réception complète du résultat.

`git diff v1.4.0 -- internal/ssh/session.go internal/backup/manager.go` était vide avant intervention. Les deux versions ont donc les mêmes chemins, heuristiques et défauts dans ces fichiers. Cela ne prouve pas que leurs dépendances ou binaires sont identiques.

Le délai observé de 3,5 secondes est compatible avec l'heuristique interactive de fin sur marqueur après environ 3,1 secondes sans nouveaux octets, plus les autres étapes. Un test synthétique reproduit cette fin sans prompt, avec `exit` dans une sortie partielle. **Il ne reproduit pas le switch en échec et ne démontre pas que cette branche y est exécutée.** Il n'existe pas de timeout de 3,5 secondes dans ce chemin backend. Un délai court peut aussi résulter d'une fermeture/rejet de canal, d'une sortie courte ou d'une erreur locale.

## Chemins d'exécution

| Chemin | Canal et terminal | Préparation | Critère de fin |
|---|---|---|---|
| Backup, premier essai Allied/unknown | Canal SSH `session`, requête `exec`, aucun PTY | Aucune commande de pagination | `Session.Wait()` : fermeture de canal, statut distant et fin des copies stdout/stderr ; désormais limite locale de 60 s |
| Backup, repli | Nouveau canal sur **la même connexion SSH**, PTY `vt100`, 512 lignes × 512 colonnes, ECHO=0, requête `shell` | Bannière, prompt, puis `terminal length 0` pour le profil allied | Polling de flux, pagination, prompt ou heuristique |
| Backup, profil aruba | Shell + PTY directement | Préparation du profil aruba | Même lecteur interactif |
| Moteur de commandes et playbooks Go | Shell + PTY persistant | Préparation du profil | Même lecteur ; les playbooks ont aussi un chemin Netmiko distinct |
| Session manuelle signalée par l'utilisateur | Paramètres exacts inconnus | Terminal, touches, pagination et attente de l'opérateur | Ne permet pas de conclure au support `exec` sans PTY |

Le repli est déclenché par une erreur `exec`, moins de 10 caractères après trim, ou quelques messages de rejet dans les dix premières lignes. Le premier résultat et sa cause n'étaient pas conservés dans les logs. Un résultat avec un statut distant non nul est écarté même si des octets ont été reçus. Cette politique est conservée, mais les volumes et le statut sont maintenant observables.

Le fournisseur saisi est converti en minuscules dans le manager. Le profil inconnu peut être détecté dans la version du serveur SSH, puis dans la bannière du shell. La commande de backup est choisie **avant** cette détection. Pour Allied, `running` reste `show running-config`. Les traces `profile` montrent le profil réellement sélectionné sans publier la bannière.

## Lecture, pagination, prompts et délais

Le shell accumule stdout et stderr dans un buffer protégé par mutex. Le lecteur interroge les 200 derniers octets toutes les 100 ms. Il délimite la sortie renvoyée par la position du buffer au moment de l'envoi de la commande, mais les anciennes détections de prompt/pagination et les critères de fin consultent la fin du buffer global.

| Étape | Comportement existant et limites |
|---|---|
| Connexion | Paramètre 60 s pour le backup ; `ssh.ClientConfig.Timeout` limite le dial TCP, pas toutes les phases de négociation. Annulation via contexte autour de la goroutine de dial. Pas de détail séparé TCP/KEX/auth dans les nouvelles traces. |
| Contexte global du batch | 10 minutes depuis `App.RunBackup`, partagé par les cinq workers ; inclut l'attente de place. |
| Ouverture du canal, PTY, shell | Requêtes synchrones. Les limites de lecture ne les bornent pas individuellement. Une trace commencée/ouverte puis interrompue permet de localiser l'étape. |
| Prompt initial | Maximum 15 s ; à expiration, le code poursuit même sans prompt. Une bannière reconnue est acquittée une fois. |
| Désactivation de pagination | Maximum 5 s ; stabilité de 500 ms avec prompt. Le prompt précédent peut satisfaire ce critère sans réponse nouvelle. La réponse et une éventuelle erreur CLI sont maintenant caractérisées. |
| Pagination Allied | Regex `--\s*[Mm]ore\s*--`, retour chariot envoyé. Si le marqueur reste dans les 200 derniers octets, l'ancien lecteur renvoie la touche à chaque poll. Une indication différente/fragmentée ou un contrôle terminal peut échapper à la détection. |
| Prompt Allied | Regex `[#>]\s*$` sur la dernière ligne brute. Elle n'apprend pas le prompt réel ; peut manquer un prompt suivi de codes ANSI ou reconnaître une ligne de contenu. Un ancien prompt peut finir une commande encore sans réponse. |
| Fin interactive par prompt | 10 polls stables : environ 1,1 s après le dernier changement observé. |
| Fin interactive par marqueur | 30 polls stables : environ 3,1 s ; cherche `\nend`, `\nreturn`, `\nexit`, `\n#`, `\n>` n'importe où dans la fin du flux. Ce n'est pas une preuve de configuration complète. |
| Fin interactive sans prompt | 50 polls stables : environ 5,1 s ; renvoie également la sortie. |
| Limite de commande interactive | 60 s pour le backup ; auparavant renvoyait `nil` comme une fin normale. Désormais renvoie `context.DeadlineExceeded`. |
| Limite `exec` | Auparavant seule l'échéance du batch bornait `CombinedOutput`. Désormais 60 s pour l'acceptation de la requête et `Wait`, après ouverture du canal. |

Une session SSH interactive peut rester ouverte après l'affichage de la configuration. Un serveur qui fait de même pour `exec`, ou ne termine pas les flux, empêche `Wait` de finir. Un serveur qui ferme sans `exit-status` produit `ssh.ExitMissingError`. Ces situations sont distinctes d'une authentification échouée et deviennent visibles.

Les heuristiques, le profil Allied, les dimensions du PTY, la touche de pagination et la stratégie de repli sont conservés. Aucune nouvelle commande, reconnexion automatique ou adaptation supposée au firmware n'est ajoutée.

## Passage à `failed` et nettoyage

Dans `Manager.Run`, les sorties SSH passent par `CleanOutput`, `deepCleanConfig`, puis `extractConfigContent`. Le nettoyage retire notamment les lignes `% ...` et les lignes de caret, qui peuvent représenter une erreur CLI. L'extraction interactive cherche une ligne contenant la commande, sinon un marqueur de début connu, puis supprime les prompts finaux.

Un résultat contenant seulement une erreur CLI, un écho ou un prompt peut donc devenir vide. Moins de 10 caractères après trim entraîne `failed`. Une longue sortie partielle peut au contraire être acceptée : la validation actuelle ne garantit pas l'intégralité. Ni le nettoyage ni cette validation ne sont modifiés ici. Les tailles avant/après chaque étape et les indicateurs d'erreur CLI permettent de situer la perte sans divulguer le texte.

Les autres sorties `failed` sont l'erreur de connexion, l'erreur d'ouverture/lecture interactive et l'erreur d'écriture du fichier local. Les erreurs `exec` déclenchent d'abord le repli. Les erreurs de persistance en base ne sont pas traitées par ce code historique ; la trace finale reflète le statut du manager, pas une garantie de persistance en base.

## Instrumentation livrée

Les diagnostics sont activés par le manager de backup via `ConnectParams.Diagnostic`. Les autres consommateurs ne produisent pas ces nouveaux logs. Événements dans le journal applicatif, préfixe `ssh_backup`, corrélés par `backup_id` :

- `connect`, `profile`, `exec_channel`, `exec_request`, `exec_read`, `exec` ;
- `fallback` avec `exec_error`, `exec_short_output` ou `exec_rejected_text` ;
- ouverture de canal shell, acceptation PTY/shell, bannière, readiness, réponse à la désactivation de pagination ;
- `interactive_command`, `interactive_read` toutes les secondes et à la fin ;
- `shell_wait` : fermeture observée avant/après demande locale de fermeture, classe d'erreur et éventuel statut distant ;
- `retrieval`, `clean`, `extract`, `validation`, `write_file`, `backup`.

Champs utiles : `elapsed_ms`, `timeout_ms`, `context_remaining_ms`, `bytes`, `stderr_bytes`, `chunks`, `first_byte_ms`, `idle_ms`, `new_bytes`, `prompt`, `pager`, `clean_prompt`, `clean_pager`, `pager_sends`, `echo_seen`, `cli_error_seen`, `error_class`, `exit_status` et `profile`.

`bytes` compte stdout en `exec`, le flux combiné en shell ; `stderr_bytes` est séparé dans les deux chemins. Les compteurs shell sont cumulatifs sur le canal ; `new_bytes` distingue les octets de la commande, ou la taille de la réponse normalisée à la désactivation de pagination. `first_byte_ms=-1` indique l'absence d'un premier octet propre à cette phase, notamment lorsque le buffer a déjà reçu la bannière. `elapsed_ms` est relatif à l'opération instrumentée ; les étapes du manager ont les timestamps du logger. Les événements sans limite propre ont des champs à zéro. Les callbacks asynchrones peuvent apparaître après un événement du manager.

Les différences entre détection brute et après nettoyage sont **observées**, sans modifier la détection qui pilote le lecteur. Les indicateurs regex restent des indices, pas une interprétation complète du terminal.

Les diagnostics n'enregistrent ni identifiant de connexion, ni mot de passe, clé, commande, IP, hostname, prompt, bannière, contenu de flux, extrait de configuration ou message d'erreur fourni par le serveur. Les erreurs sont classées par types, avec uniquement le code de sortie numérique. `backup_id` permet de retrouver l'équipement dans les résultats existants. Les exports de journaux complets peuvent contenir des données provenant des autres fonctions historiques : privilégier les événements `ssh_backup`.

## Exploitation lors du prochain essai autorisé

Utiliser le binaire construit avec ces modifications, puis effectuer uniquement le backup déjà prévu après autorisation explicite. Le lancement d'un backup conserve la commande de préparation de session `terminal length 0` existante. Aucun essai réel n'a été lancé pendant cette analyse.

Le fichier est `%APPDATA%\NetTools\logs\nettools-YYYY-MM.log` sous Windows. Le champ JSON `message` contient `ssh_backup ` suivi d'un objet JSON. Filtrer sur ce préfixe et les `backup_id` d'un succès et d'un échec comparables ; ne pas joindre leurs configurations. Conserver la version du binaire, la durée, le statut, le type de config demandé, et, séparément, modèle/firmware/profil sélectionné et paramètres de la session manuelle.

| Signature | Ce qu'elle permet d'établir |
|---|---|
| `exec_request accepted`, octets > 0, `exit_status_missing` ou `remote_exit`, puis repli | L'authentification fonctionne ; le résultat `exec` est rejeté à cause de sa terminaison/statut. Comparer la suite shell. |
| `exec_read waiting`, pager présent, aucune fermeture, échéance 60 s | `exec` n'est pas terminé ; pagination sans terminal ou canal qui reste ouvert à examiner. |
| `shell_ready` expire ; `clean_prompt=true` mais prompt brut absent | Le nettoyage rend le prompt reconnaissable ; les contrôles terminaux sont une piste concrète. |
| `disable_paging_response`, erreur CLI ou zéro octet nouveau | Désactivation de pagination rejetée ou ancienne réponse/prompt utilisée pour progresser. |
| `pager_sends` augmente sans nouveaux octets | Marqueur ancien persistant ou pagination qui ne répond pas à la touche envoyée. |
| `interactive_read heuristic_config_marker` vers 3 s, aucun prompt | Le critère heuristique est effectivement la cause de fin de lecture ; vérifier les tailles suivantes avant de conclure à la cause du `failed`. |
| `stable_prompt`, zéro octet nouveau | Le lecteur a terminé sur un prompt d'avant la commande. |
| Fermeture shell observée avant demande locale | Le canal s'est terminé pendant l'opération ; son statut et les tailles localisent la perte. Une fermeture après `Close` peut être normale. |
| `retrieval` non vide, `clean` ou `extract` presque vide | Le `failed` provient de la validation après nettoyage/extraction ; `cli_error_seen` et `echo_seen` précisent le mécanisme. |
| `validation accepted`, `write_file failed` | La récupération est acceptée ; l'échec est local au fichier, pas au SSH. |

Ces observations doivent déterminer le correctif suivant. Un changement global de timeout, de PTY, de touche de pagination ou un forçage de shell pour Allied, sans cette preuve, n'est pas justifié.

## Corrections limitées et vérification

Défauts d'erreur démontrables corrigés : propagation des annulations/timeouts interactifs, contrôle des écritures commande/bannière/pagination, attente `exec` bornée par le timeout configuré, et snapshot atomique du buffer pour calculer sa fin. Le message de validation vide indique désormais la taille finale et l'identifiant de trace.

Tests exclusivement synthétiques : serveur SSH sur `127.0.0.1`, requête `exec` acceptée/rejetée, statut non nul, fermeture sans statut, attente sans fermeture, flux stdout/stderr ; erreurs d'écriture, annulation et limite interactive ; fin heuristique sans prompt ; shell avec PTY et préparation de pagination. Les tests contrôlent aussi l'absence de textes sensibles synthétiques dans les diagnostics, y compris un message distant `exit-signal`.

Contrôles : `go test ./internal/...`, tests ciblés SSH/backup/playbook, `go vet ./...` et `git diff --check`. La vérification `-race` est indisponible dans l'environnement courant (`CGO_ENABLED=0`, aucun compilateur C trouvé). Aucun test réseau externe ni changement d'une autre fonctionnalité.
