# Sécurité

## Signaler une vulnérabilité

N'ouvrez pas d'issue publique avec une vulnérabilité exploitable, un secret ou
une configuration réelle. Utilisez le signalement privé GitHub si le dépôt
l'active, sinon contactez **neosoda@gmail.com** (contact public des métadonnées).
N'envoyez pas de mot de passe ni de donnée réseau réelle ; proposez un exemple
synthétique, la version/commit, l'impact et les étapes de reproduction.
Aucun délai de réponse, SLA, programme de récompense ou correctif garanti
n'est annoncé. Convenez avec le mainteneur de la divulgation avant de publier.

## Périmètre de maintenance

Les signalements sont examinés sur la branche `master`. Les anciennes versions
publiées ne bénéficient d'aucune promesse de correctif rétroporté. L'application
cible Windows 10/11 x64 ; Linux/macOS n'ont pas de garantie de support produit.

## Limites connues

- SSH ne vérifie actuellement pas les clés d'hôte : le callback utilise
  `InsecureIgnoreHostKey`. Le commentaire existant « TOFU » ne correspond pas
  à une véritable mémorisation/vérification de clés. Utilisez un réseau de
  confiance ; une correction requiert une décision de compatibilité séparée.
- Hors Windows, sans `NETTOOLS_SECRET_KEY`, la clé AES est dérivée du nom
  d'hôte et n'est pas un secret fort. Le chiffrement ne protège pas d'un compte
  local compromis. Windows utilise DPAPI.
- Les playbooks peuvent modifier les équipements. L'autorisation de leur
  propriétaire et une relecture des commandes sont nécessaires.
- Les sauvegardes, SQLite, logs et exports peuvent contenir des informations
  sensibles : chiffrement des credentials ne signifie pas chiffrement de tous
  les fichiers. Relisez et expurgez tout diagnostic avant partage.
- `.sentinel-sdd/integrity.key` a été retiré du suivi Git et ignoré dans cette
  migration, avec conservation locale autorisée par le propriétaire. Il reste
  présent dans l’historique public. Il sert au contexte HMAC des
  preuves Sentinel ; sa publication retire toute garantie de secret. Aucun
  usage applicatif de cette clé n'a été trouvé. Une décision du propriétaire
  sur rotation reste nécessaire avant toute nouvelle signature. La clé est
  déclarée compromise, les anciennes preuves ne doivent pas être considérées
  comme authentifiées. Aucun remplacement n'est publié et l'historique n'est
  pas réécrit par cette migration.

Les contrôles automatisés de dépendances et de secrets complètent la revue ;
ils ne constituent ni une certification de sécurité ni une preuve d'absence
de secret. N'utilisez que des réseaux et équipements autorisés.
