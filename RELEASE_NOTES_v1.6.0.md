# NetTools v1.6.0 — Notes de release

Date de publication : 16 octobre 2026

## Nouveautés

- Découverte SNMP professionnalisée : cibles CIDR, plages et listes d'adresses validées, dédupliquées et limitées à 1 024 adresses ; import TXT/CSV et distinction claire entre réponses SNMP et absences de réponse.
- Inventaire persistant : fusion des découvertes et imports, déduplication et conservation des métadonnées collectées.
- Audit de conformité fiable : statuts `conforme`, `non conforme`, `non applicable`, `indéterminé` et `erreur`, avec preuves contextualisées et score calculé uniquement sur les contrôles réellement évaluables.

## Améliorations importantes

- Les contrôles d'audit sont adaptés à leur constructeur et n'évaluent plus une règle constructeur sur un autre équipement.
- Les données sensibles des preuves et recommandations sont masquées.
- Les recommandations restent consultatives : aucun script de remédiation n'est généré, transmis ou exécuté.
- La dernière sauvegarde est affichée dans le résultat d'audit. Une sauvegarde absente, `suspect` ou `failed` ne peut pas servir de preuve d'audit.
- Le catalogue livré couvre des contrôles prudents pour Cisco, Aruba, AlliedWare Plus, Huawei et Fortinet. Les règles historiques contenant des hypothèses de déploiement sont désactivées sans supprimer les règles personnalisées ni les données SQLite existantes.
- Retrait des modules Port Tracker / utilisation des ports et Topologie du produit public.

## Sécurité

L'audit npm de la release ne signale aucune vulnérabilité. Les dépendances Wails et Excelize ne sont pas mises à niveau dans cette release.

## Prérequis Windows

- Windows 10 ou Windows 11 64 bits.
- Microsoft Edge WebView2 Runtime installé (généralement déjà présent sur Windows 10/11 à jour).

Téléchargez `NetTools.exe`, puis exécutez-le localement. Les données de l'application sont conservées dans `%APPDATA%\NetTools`.

## Limitations connues

- La couverture des syntaxes des constructeurs reste volontairement prudente : validez les contrôles sur des sauvegardes représentatives avant de les généraliser à un parc.
- La CLI Wails installée (`2.16.0`) est plus récente que le module Go déclaré (`2.11.0`). La compilation de production réussit, mais cette release ne modifie pas ces dépendances.
- La compilation ne remplace pas une validation fonctionnelle sur vos équipements. Aucun scan réseau ni aucune connexion SSH réelle n'a été déclenché pour préparer cette release.
