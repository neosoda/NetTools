# Sécurité de NetTools

## Explication simple

NetTools est un outil d'administration réseau. Il scanne le réseau, se connecte
à des équipements en SSH et SNMP, exécute des commandes et manipule des
identifiants chiffrés. Certains antivirus automatiques peuvent confondre ces
fonctions légitimes avec celles d'un programme malveillant.

VirusTotal ne donne pas un verdict unique : il soumet le même fichier à de
nombreux moteurs indépendants. Pour NetTools v1.4.1, 3 moteurs sur 70 affichent
une alerte, tandis que les autres ne détectent rien. Ces alertes sont générées
par des modèles heuristiques ou d'apprentissage automatique. Elles sont
compatibles avec des faux positifs, mais aucun scan ne peut garantir à lui seul
qu'un fichier est sûr.

La version officielle reste `NetTools_v1.4.1.exe`, téléchargée depuis la
[release GitHub v1.4.1](https://github.com/neosoda/NetTools/releases/tag/v1.4.1).
Avant de l'exécuter :

1. Téléchargez-la uniquement depuis cette release officielle.
2. Vérifiez que son empreinte SHA-256 est exactement :
   `BB365ABC7A9790C2E91D2F8C0517C368436CF43143C1AD7304FEDFA8B3270C49`.
3. Consultez le
   [rapport VirusTotal public](https://www.virustotal.com/gui/file/bb365abc7a9790c2e91d2f8c0517c368436cf43143c1ad7304fedfa8b3270c49).
4. N'exécutez pas le fichier si son empreinte est différente.

Comme le programme n'est pas signé par une autorité publique, Windows
SmartScreen peut afficher « Windows a protégé votre ordinateur ». Si la
provenance et l'empreinte sont correctes, ouvrez **Informations
complémentaires**, vérifiez le nom du fichier, puis choisissez **Exécuter quand
même** uniquement si vous acceptez le risque résiduel.

## Explication technique

### Résultat de la release

La release v1.4.1 obtient 3 détections sur 70 :

- Microsoft : `Trojan:Win32/Wacatac.B!ml`
- MaxSecure : `Trojan.Malware.300983.susgen`
- Trapmine : `Malicious.high.ml.score`

Les suffixes `!ml`, `susgen` et `ml.score` indiquent des classements
heuristiques ou issus de modèles statistiques. Ils ne désignent pas une
signature commune ni un composant malveillant précis trouvé dans le code.

### Tests comparatifs

Trois variantes issues du même code fonctionnel ont produit des résultats
différents :

| Variante | Résultat | Moteurs ayant signalé le fichier |
| --- | ---: | --- |
| Release Wails v1.4.1 | 3/70 | Microsoft, MaxSecure, Trapmine |
| Build debug avec symboles | 2/69 | Microsoft, Trapmine |
| Build production avec symboles | 3/70 | Microsoft, MaxSecure, Bkav Pro |

La conservation des symboles supprime certaines alertes et en fait apparaître
d'autres. Cette instabilité selon la forme du binaire, sans changement
fonctionnel correspondant, indique que modifier les options de compilation au
hasard ne fournirait pas un résultat 0/70 fiable ou durable.

### Signaux susceptibles d'influencer les heuristiques

NetTools cumule plusieurs caractéristiques inhabituelles pour une application
grand public mais normales pour un outil d'administration réseau :

- découverte et scan de plages réseau ;
- connexions SNMP et SSH ;
- exécution de commandes sur des équipements distants ;
- prise en charge optionnelle d'un processus Python pour Netmiko ;
- chiffrement et déchiffrement local d'identifiants ;
- exécutable Go/Wails autonome et non signé ;
- faible réputation de téléchargement d'un nouveau binaire.

Ces caractéristiques peuvent expliquer un classement heuristique, mais elles
ne prouvent pas à elles seules l'origine exacte de chaque décision antivirus.

### Contrôles effectués

- empreinte locale identique au digest SHA-256 de l'asset GitHub ;
- scan Microsoft Defender local à jour sans détection ;
- revue ciblée des mécanismes de lancement de processus, de persistance et de
  téléchargement de contenu ;
- `go test ./...` ;
- `go vet ./...` ;
- audit npm sans vulnérabilité connue au niveau demandé ;
- tests de builds comparatifs sans UPX ni obfuscation.

Ces contrôles augmentent la confiance dans la release, sans constituer une
preuve absolue d'innocuité.

### Démarche de résolution

Le binaire officiel est conservé afin de ne pas changer artificiellement son
empreinte à chaque essai. Les détections doivent être contestées auprès des
éditeurs concernés comme faux positifs. Une future signature Authenticode
publique ou une distribution MSIX via le Microsoft Store améliorerait aussi
l'identification de l'éditeur et la réputation SmartScreen.

## Signaler un problème de sécurité

N'ouvrez pas publiquement une issue contenant des identifiants, des clés, des
configurations réseau ou des données sensibles. Utilisez les canaux privés du
propriétaire du dépôt pour transmettre un rapport reproductible et expurgé de
tout secret.
