# NetTools — Notice d'utilisation

Application desktop Windows de découverte, d'inventaire, de sauvegarde et
d'audit réseau. Ce manuel décrit le périmètre du produit public v1.6.0 et de
la branche préparant son passage sous Apache 2.0.

Le code original est sous Apache 2.0 ; les composants tiers conservent leurs
licences. Consultez `LICENSE`, `NOTICE` et `THIRD_PARTY_NOTICES.md` pour les
attributions. Les anciennes releases gardent leurs conditions propres.

## Présentation

NetTools réunit un frontend React 19, une façade Wails v2, un backend Go et
une base SQLite locale. Le poste Windows utilise WebView2 pour afficher
l'interface. Aucun compte cloud NetTools n'est nécessaire ; les opérations
SSH/SNMP exigent cependant un accès autorisé aux équipements concernés.

Les pages disponibles sont **Découverte**, **Inventaire**, **Backups**,
**Comparateur**, **Audit**, **Playbooks**, **Planificateur**, **Journaux** et
**Paramètres**. Les modules Topologie et suivi d'utilisation des ports ont été
retirés du produit public en v1.6.0.

## Installation

Prévoyez Windows 10/11 x64 et Microsoft Edge WebView2 Runtime. Téléchargez
l'exécutable et son fichier SHA-256 sur la page officielle des releases :
https://github.com/neosoda/NetTools/releases/latest.

Comparez l'empreinte avec `Get-FileHash .\NetTools.exe -Algorithm SHA256`, puis
lancez l'application. La concordance d'une empreinte ne remplace pas une
signature indépendante ni la vérification de la provenance du téléchargement.

Au premier lancement, ouvrez **Paramètres** pour créer vos profils d'accès,
choisir le dossier de sauvegarde et ajuster la rétention des logs. Sélectionnez
le credential actif dans la barre latérale avant les opérations qui l'utilisent.

## Données et confidentialité

| Donnée | Emplacement Windows par défaut |
| --- | --- |
| Base SQLite | `%APPDATA%\NetTools\nettools.db` |
| Préférences | `%APPDATA%\NetTools\settings.json` |
| Journaux | `%APPDATA%\NetTools\logs\` |
| Sauvegardes | `%USERPROFILE%\Downloads\NetTools_Backups\` |

Le dossier de sauvegarde est configurable. Si le dossier utilisateur n'est pas
disponible, l'application peut utiliser un sous-dossier `backups` dans ses données.
L'inventaire est conservé dans SQLite entre les sessions par défaut. Le mode
éphémère est une option explicite : s'il est activé, les équipements sont
supprimés de l'inventaire au démarrage suivant.

Les credentials sont chiffrés via DPAPI sous Windows. Cela ne chiffre pas
l'ensemble des backups, exports et logs. Ces fichiers peuvent contenir des
secrets ou des informations d'infrastructure ; limitez leurs droits d'accès
et relisez-les avant tout partage. Voir `SECURITY.md` pour les limites connues.

## Profils SSH et SNMP

Dans **Paramètres**, créez un credential nommé et renseignez les champs
nécessaires à votre opération : utilisateur et mot de passe ou clé SSH,
communauté SNMP v1/v2c, ou utilisateur et paramètres USM SNMPv3.

SNMPv3 propose `noAuthNoPriv`, `authNoPriv` et `authPriv`. Les choix de protocole
d'authentification et de chiffrement doivent correspondre à ceux de l'équipement.
Préférez les mécanismes récents disponibles sur votre parc ; la présence d'un
protocole ancien dans l'interface n'est pas une recommandation d'utilisation.

Le profil actif sert de choix global lorsque l'opération ne précise pas un
autre profil. Les tests SSH/SNMP contactent réellement la cible : ne les
utilisez que sur des équipements autorisés.

## Découverte réseau

La page **Découverte** accepte plusieurs formes de ciblage :

| Mode | Usage |
| --- | --- |
| Switches | Ensemble d'adresses proposé dans le préfixe choisi ; vérifiez les cibles affichées avant de lancer. |
| Complet | Sous-réseau /24 du préfixe choisi. |
| CIDR | Réseau IPv4 personnalisé, dans la limite de cibles. |
| Adresses et plages | Liste manuelle ou import TXT/CSV ; une adresse ou plage par ligne. |

Les cibles sont normalisées, dédupliquées et plafonnées à **1 024 adresses**
par scan. IPv6 n'est pas pris en charge par ce ciblage. Adaptez timeout et
parallélisme à l'environnement ; une absence de réponse SNMP ne prouve pas
qu'un équipement est éteint.

1. Définissez les cibles et le profil SNMP.
2. Contrôlez la liste ou le nombre d'adresses présenté par l'interface.
3. Lancez le scan et suivez sa progression.
4. Examinez les réponses, erreurs et absences de réponse séparément.
5. Vérifiez les équipements ajoutés dans **Inventaire**, puis exportez au
   besoin les résultats en Excel.

Le bouton d'arrêt demande l'annulation des tâches. Les requêtes en cours
restent soumises à leurs timeouts ; ne concluez pas à un arrêt immédiat de
toute activité réseau à la seule activation du bouton.

## Inventaire

La page **Inventaire** rassemble les découvertes, ajouts manuels et imports.
La fusion et la déduplication par adresse IP évitent de multiplier les entrées
pour un même équipement et préservent les métadonnées existantes selon les
règles de fusion de l'application.

Vous pouvez consulter, modifier et supprimer un équipement, tester sa connexion
SSH, importer un inventaire JSON et exporter votre sélection ou votre inventaire
selon les commandes proposées. Avant un import, conservez une copie de travail
si vous souhaitez pouvoir revenir sur des modifications.

La conservation entre sessions est le comportement par défaut. Ne confondez
pas l'effacement explicite de l'inventaire, sa suppression en mode éphémère
et la gestion des fichiers de backup : ce sont des opérations distinctes.

## Sauvegardes SSH

La page **Backups** récupère une configuration sur les équipements sélectionnés.
Choisissez le type de configuration disponible, le credential et les cibles,
puis contrôlez chaque résultat avant de réutiliser le fichier.

| Famille | Commande de configuration courante |
| --- | --- |
| Cisco IOS/XE, Aruba AOS-S, HP ProCurve | `show running-config` |
| HPE Comware, Huawei VRP | `display current-configuration` |
| Fortinet FortiOS | `show full-configuration` |
| AlliedWare Plus | Collecte adaptée à la session et au niveau de privilège |

Le choix exact, la disponibilité d'une startup-config et le mode interactif
dépendent du constructeur et du firmware. Les chemins SSH privilégient
l'exécution directe lorsque possible et gèrent un repli interactif pour les
sessions qui l'exigent. Validez les droits et le prompt attendus sur une cible
de test avant d'élargir à un parc.

L'historique associe fichiers et métadonnées. Le hash SHA-256 et les contrôles
de capture aident à vérifier l'intégrité et la qualité du résultat ; ils ne
garantissent pas à eux seuls qu'une configuration est complète ou correcte.
L'export ZIP permet de regrouper les sauvegardes sélectionnées avec vérification
d'intégrité. Examinez les captures signalées comme suspectes ou en échec.

Le terminal et les commandes SSH peuvent modifier l'équipement. Relisez toute
commande et assurez-vous d'avoir une autorisation adaptée.

## Comparateur

La page **Comparateur** accepte des textes ou des sauvegardes. Choisissez vos
deux états, puis utilisez la vue côte à côte ou unifiée et les filtres de
comparaison disponibles. Les options de casse, d'espaces et de motifs ignorés
peuvent réduire le bruit, mais aussi masquer un changement pertinent.

Vérifiez les ajouts, suppressions et modifications avant de conclure.
L'export HTML permet de partager le résultat : relisez et expurgez son contenu
comme celui d'une sauvegarde, car il peut exposer la configuration complète.

## Audit de conformité

L'audit compare une sauvegarde à des règles génériques ou propres à un
constructeur. Le catalogue livré évolue ; les anciennes règles liées à des
hypothèses de déploiement ont été désactivées sans suppression des règles
personnalisées ni des données existantes.

1. Vérifiez les backups récents des équipements à évaluer.
2. Sélectionnez les équipements et les contrôles pertinents.
3. Lancez l'analyse et lisez les preuves de chaque résultat.
4. Examinez séparément les contrôles non évaluables et les recommandations.

| Statut | Interprétation |
| --- | --- |
| Conforme | Les preuves disponibles satisfont le contrôle. |
| Non conforme | Les preuves disponibles établissent un écart. |
| Non applicable | Le contrôle ne s'applique pas à cette cible. |
| Indéterminé | Les éléments disponibles ne permettent pas de conclure. |
| Erreur | Un problème technique empêche l'évaluation. |

Une sauvegarde absente, suspecte ou en échec ne constitue pas une preuve
suffisante. Le score porte sur les contrôles évaluables ; il ne doit pas être
interprété comme une certification du système ou une mesure exhaustive de sa
sécurité. Une règle constructeur ne doit pas être appliquée à une autre famille.

Les recommandations sont **consultatives**. Le module ne génère, ne transmet
et n'exécute aucun script de remédiation. Toute correction de configuration
nécessite une revue humaine et une procédure de changement appropriée.

## Playbooks SSH

Les playbooks décrivent des séquences YAML exécutées sur des équipements
sélectionnés. Le moteur natif utilise SSH ; l'exécuteur facultatif Netmiko
nécessite un environnement Python distinct. Ne confondez pas ces commandes
avec les recommandations consultatives du module Audit.

```yaml
name: Inventaire de test
description: Lecture seule sur une cible de laboratoire autorisée
steps:
  - name: Version
    commands:
      - show version
    on_error: abort
```

Cet exemple doit être adapté à la syntaxe de l'équipement : il ne démontre
pas une compatibilité universelle. Contrôlez les commandes, les attentes,
les erreurs et les privilèges requis avant d'exécuter un playbook. Suivez le
terminal et les résultats de chaque étape ; un statut d'exécution ne remplace
pas une vérification de l'état final de l'équipement.

## Planificateur

Le planificateur déclenche les types de tâches pris en charge : backup, scan,
audit, playbook et commande SSH. Chaque type exige ses paramètres propres,
notamment les cibles, credentials, identifiants de playbook ou commandes.

Choisissez une planification simple ou une expression cron validée par
l'interface, puis vérifiez l'activation et les journaux d'exécution. Évitez de
programmer des opérations concurrentes incompatibles sur les mêmes équipements.

Les tâches sont conservées dans SQLite, mais le moteur de planification tourne
dans l'application. **NetTools doit rester ouvert** pour les déclenchements ;
ce n'est pas un service Windows permanent. Ne supposez pas un rattrapage des
exécutions manquées lorsque le poste était arrêté.

## Journaux et paramètres

Les **Journaux** permettent d'examiner les événements de l'application et ses
fichiers de logs. Commencez par l'opération concernée, son heure, son statut et
les messages associés. La rétention dépend des paramètres choisis.

Dans **Paramètres**, vous pouvez notamment gérer les credentials, le dossier
de backups, le nombre de workers, la rétention des logs et le mode éphémère
de l'inventaire. La présence d'une préférence ne signifie pas que tous les
écrans prennent en charge un changement de langue ou de thème ; vérifiez le
comportement de la version utilisée.

## Parcours recommandés

### Établir un inventaire

Configurez un profil SNMP, limitez le scan à des cibles autorisées, vérifiez les
résultats dans Inventaire, puis exportez une copie JSON ou Excel selon le besoin.
Conservez la liste des erreurs et absences de réponse pour une investigation
séparée, sans assimiler les appareils silencieux à des adresses libres.

### Préparer une maintenance

Effectuez et contrôlez un backup avant intervention. Après le changement
validé par votre procédure, récupérez un nouveau backup et comparez les deux
états. Conservez les fichiers et leur contexte dans un emplacement protégé.

### Examiner la conformité

Choisissez des règles adaptées au constructeur et à votre politique, utilisez
une sauvegarde exploitable, puis relisez chaque preuve et chaque contrôle
indéterminé. Les recommandations n'autorisent pas une correction automatique.

## Dépannage

| Symptôme | Vérifications utiles |
| --- | --- |
| L'application ne démarre pas | Version Windows x64, présence de WebView2, provenance et empreinte du binaire. |
| Pas de réponse SNMP | Cible, routage, filtrage, version SNMP, paramètres USM/communauté, autorisation et timeout. |
| Échec SSH | Accès réseau, credential, méthode d'authentification, algorithmes et privilèges disponibles. |
| Backup incomplet ou suspect | Sortie d'erreur, pagination, prompt attendu, constructeur/firmware et qualité de capture. |
| Audit indéterminé | Disponibilité et qualité du dernier backup, applicabilité de la règle et preuves attendues. |
| Inventaire vidé au redémarrage | Option de mode éphémère dans Paramètres et fichier `settings.json`. |
| Tâche programmée absente | Application ouverte, tâche activée, expression cron et paramètres, journaux. |
| SQLite verrouillée | Autre instance ou outil utilisant la base ; sauvegardez vos données avant toute intervention. |

N'effacez pas la base ou vos backups pour contourner une erreur sans disposer
d'une sauvegarde et d'un diagnostic. Pour demander de l'aide, suivez
[SUPPORT.md](SUPPORT.md). Pour une vulnérabilité, utilisez le canal privé de
[SECURITY.md](SECURITY.md), avec des exemples synthétiques et sans secret.

## Documentation et licences

- [Documentation développeur](docs/DEVELOPMENT.md).
- [Architecture](docs/ARCHITECTURE.md).
- [Contribuer](CONTRIBUTING.md).
- [Apache License 2.0](LICENSE), [NOTICE légal](NOTICE) et [licences tierces](THIRD_PARTY_NOTICES.md).
- [Historique des versions](CHANGELOG.md) et [rapport d'audit](docs/OPEN_SOURCE_AUDIT.md).

Copyright 2026 neosoda. Le manuel courant et le code original relèvent de la
licence du projet ; les œuvres tierces conservent leurs droits et attributions.
