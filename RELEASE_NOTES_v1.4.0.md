# NetTools v1.4.0 - Release Notes

**Date :** 2026-07-26

**Branche :** `master`

**Tag :** `v1.4.0`

---

## Nouveauté principale : SNMPv3 USM complet

- Niveaux de sécurité `noAuthNoPriv`, `authNoPriv` et `authPriv`.
- Authentification MD5, SHA-1, SHA-224, SHA-256, SHA-384 et SHA-512.
- Chiffrement DES, AES-128, AES-192 et AES-256, variantes Blumenthal et Reeder.
- Configuration USM commune au scan réseau, à la collecte de métadonnées et à LLDP.
- Diagnostic ciblé utilisant le credential global actif.
- Validation du nom utilisateur et des phrases secrètes SNMPv3.

## Interface et sécurité

- Choix explicite du niveau de sécurité USM dans les credentials.
- Protocoles SHA-256 et AES-128 proposés comme valeurs recommandées.
- Secrets d'authentification et de chiffrement conservés dans le stockage chiffré existant.
- La communauté SNMP est automatiquement ignorée lorsqu'un credential SNMPv3 est actif.

## Compatibilité

- Le comportement SNMPv1 et SNMPv2c existant est conservé.
- Windows 10/11 x64.
- WebView2 requis, inclus avec Windows 11 et Microsoft Edge.

---

## Artefact

| Fichier | Taille | SHA-256 |
|---|---:|---|
| `NetTools_v1.4.0.exe` | 20,03 Mio | `d93fd5019feaedbc77cabe52e14d7cbae39d0609dde7895af8f326871350c115` |

> Le binaire n'est pas signé numériquement. Windows SmartScreen peut afficher un avertissement au premier lancement.

## Vérification

```powershell
Get-FileHash -Algorithm SHA256 .\NetTools_v1.4.0.exe
```
