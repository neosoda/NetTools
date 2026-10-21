# Support NetTools

## Avant de signaler un problème

1. Identifiez la version de NetTools, Windows et WebView2.
2. Consultez le [guide utilisateur](NOTICE.md#dépannage) et les
   [notes de release](CHANGELOG.md).
3. Distinguez un problème d'installation, d'interface, de connexion SSH/SNMP
   et de syntaxe propre au constructeur.
4. Reproduisez si possible sur une cible de test autorisée avec des données
   synthétiques ; ne déclenchez pas de scan supplémentaire en production.

## Ouvrir une issue

Utilisez les [modèles GitHub](https://github.com/neosoda/NetTools/issues/new/choose).
Indiquez la version ou le commit, les étapes de reproduction, le résultat
attendu, le résultat observé et les contrôles déjà effectués. Pour SSH/SNMP,
ajoutez constructeur, modèle et firmware lorsque leur partage est autorisé.

Avant toute pièce jointe, retirez les identifiants, secrets SNMP, clés privées,
adresses et noms internes sensibles, configurations réelles et données
personnelles. Les logs et exports ne sont pas automatiquement anonymes.
Ne publiez pas une base SQLite ou un backup complet.

## Canaux adaptés

- Bug reproductible : modèle **Bug**.
- Besoin fonctionnel : modèle **Proposition**.
- Vulnérabilité ou secret exposé : [signalement privé](SECURITY.md).
- Incident de comportement : [code de conduite](CODE_OF_CONDUCT.md).

Le projet ne promet ni délai de réponse, ni SLA, ni support de tous les modèles
réseau. Une compilation réussie ne valide pas un parc matériel complet.
