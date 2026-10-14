# NetTools v1.5.2 — Release Notes

Cette version corrige la récupération SSH des backups et rend ses erreurs exploitables, notamment sur Allied Telesis.

## Correctifs

- **Mode privilégié Allied** : le repli interactif passe de `>` à `#` avec `enable` avant de lire la configuration. Si ce passage est refusé ou demande un mot de passe supplémentaire, le backup remonte une erreur explicite. Cette préparation est limitée aux backups Allied.
- **Lecture complète** : NetTools attend les nouveaux octets de la commande et son prompt final. Une pause, un ancien prompt ou un `exit` présent dans la configuration ne suffisent plus pour terminer la récupération.
- **Pagination** : acquittement unique des marqueurs Allied, reconnaissance contrôlée de `<cr>` et `Press any key`, sans déclenchement sur les tokens contenus dans une ligne de configuration.
- **Gestion des erreurs** : erreurs CLI préservées avant nettoyage, propagation des annulations/timeouts/écritures et diagnostic de la fermeture de canal. Les statuts distants non nuls restent des erreurs ; une fermeture propre exec sans statut est distinguée.
- **Terminal** : prompts analysés après nettoyage ANSI et conservation des séparateurs CR-only.

## Diagnostics et validation

Les traces `ssh_backup` contiennent uniquement étapes, volumes, durées, état du prompt/pager et catégories d'erreur. Aucun secret ni contenu de configuration n'est journalisé.

Le chemin exec et le repli interactif corrigé ont été vérifiés sur deux switches Allied avec l'autorisation de l'utilisateur. Le rejet en mode `>` disparaît après passage au prompt `#`. Ces résultats établissent le défaut du chemin interactif testé ; ils ne prouvent pas que tous les échecs historiques ont la même cause.

Contrôles : `go test ./...`, `go vet ./...`, TypeScript et compilation Wails Windows. Le contrôle Go `-race` reste indisponible sur l'environnement de construction sans CGO. Le moteur SSH a été testé directement ; l'exécutable n'a pas été lancé automatiquement.

## Téléchargement et intégrité

- Exécutable : **`NetTools-v1.5.2.exe`**.
- Empreinte : fichier `NetTools-v1.5.2.exe.sha256` joint à la release.
- Windows 10 / Windows 11, architecture x64.
- Métadonnées Windows et version affichée : **1.5.2**.

Cette version n'ajoute aucune commande de modification ou de sauvegarde de configuration des switches. Les changements de fonctionnalité sont limités au moteur SSH et aux backups.

[Rapport de validation](specs/ssh-fix-validation.md) · [Historique des versions SSH](specs/ssh-version-history.md).
