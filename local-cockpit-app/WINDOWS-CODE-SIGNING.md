# OutilsIA Local Cockpit - signature Windows

Ce document decrit le pipeline Authenticode optionnel du candidat Windows.
Il ne signifie pas que les binaires publics actuels sont signes.

Etat au 26 juillet 2026 :

- release publique `0.1.1` / build `291439601671` : `NotSigned` ;
- derniere RC privee auditee `0.1.2-rc.1` / build `302038485811` :
  `not_signed` ;
- pipeline par certificat du magasin Windows : implemente et teste sans cle ;
- certificat de signature et identite editeur : non provisionnes ;
- aucune cle privee, aucun PFX et aucun mot de passe dans Git.

## Ce que le pipeline garantit

Quand un certificat est fourni par son empreinte :

1. `test-windows-signing-readiness.ps1` controle le magasin
   `Cert:\CurrentUser\My`, la cle privee, la validite du certificat, l'EKU code
   signing et la presence de SignTool.
2. `build-windows-beta.ps1` genere un fragment Tauri temporaire avec
   `certificateThumbprint`, SHA-256 et l'URL RFC 3161 du fournisseur.
3. Tauri signe l'executable applicatif avant la creation des bundles, puis les
   installateurs produits.
4. Le fragment temporaire est supprime dans un bloc `finally`.
5. `verify-windows-signed-artifacts.ps1` exige sur chaque EXE/MSI :
   `Get-AuthenticodeSignature=Valid`, le bon signataire, un horodatage et une
   verification SignTool `/pa /all /tw`.
6. `WINDOWS-SIGNING-RECEIPT.json` lie cette verification aux SHA-256 signes.
7. Le packager RC relit encore Authenticode apres renommage et copie.
8. `--require-windows-signature` refuse tout candidat qui n'est pas a la fois
   valide et horodate.

Une signature valide sans horodatage peut identifier l'editeur, mais
`stable_release_ready` reste `false`.

## Provisionnement hors depot

Le certificat doit etre un certificat **code signing**, pas un certificat TLS.
Il doit etre installe hors du depot dans le magasin personnel de l'utilisateur
Windows qui construit la RC.

Lister les certificats de signature disponibles :

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
```

Verifier le poste sans construire :

```powershell
$thumbprint = "EMPREINTE_40_CARACTERES"
$timestampUrl = "URL_RFC3161_DU_FOURNISSEUR"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\test-windows-signing-readiness.ps1 `
  -CertificateThumbprint $thumbprint `
  -TimestampUrl $timestampUrl
```

Le mot de passe d'un support ou d'un certificat n'est jamais passe au script.
Le fournisseur, Windows ou le materiel cryptographique gere l'acces a la cle.

## Construire une RC signee

Depuis `local-cockpit-app` sous Windows :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\build-windows-release-candidate.ps1 `
  -RcNumber 2 `
  -SigningCertificateThumbprint $thumbprint `
  -SigningTimestampUrl $timestampUrl `
  -RequireSignedArtifacts
```

La commande echoue avant empaquetage si le certificat manque. Elle echoue
apres build si un seul artefact n'a pas la bonne signature ou le timestamp.
Le candidat doit ensuite satisfaire :

```powershell
node scripts\verify-release-candidate.mjs `
  --input .artifacts\release-candidate-windows `
  --require-platform windows-x64 `
  --require-windows-signature `
  --require-freshness `
  --require-clean-source
```

## Criteres avant communication

Ne publier la mention « editeur signe » que si :

- tous les EXE/MSI distribues ont `status=valid` ;
- tous ont le meme signataire attendu ;
- tous ont `timestamp_present=true` ;
- `all_valid=true`, `all_timestamped=true` et
  `stable_release_ready=true` dans `AUTHENTICODE.json` ;
- les SHA-256 du manifeste, des fichiers servis et du telechargement sont
  identiques ;
- le nom d'editeur affiche par Windows est celui accepte par Christophe.

Une signature n'assure pas la disparition immediate de SmartScreen. Un
certificat OV peut devoir construire sa reputation. Aucun texte public ne doit
promettre que tous les avertissements Windows disparaitront.

## Choix de conservation de cle

Le pipeline actuel accepte un certificat expose par le magasin Windows, y
compris lorsqu'une cle materielle le rend accessible. Pour l'automatisation
future, deux voies restent a arbitrer :

| Voie | Etat | Regle |
| --- | --- | --- |
| Poste Windows protege ou token materiel | Pipeline pret | La cle ne quitte pas le poste ou le support |
| Signature distante Azure via `signCommand` | A etudier | Cle distante, identite et cout a valider avant integration |
| PFX injecte dans un runner public | Non implemente | Ne pas choisir par commodite sans revue de menace |

La CI publique reste non signee tant qu'une voie de conservation n'est pas
choisie. Une RC signee doit etre produite sur un environnement protege, puis les
memes octets doivent suivre le processus de smoke, decision et promotion.

## References officielles

- Tauri, Windows Code Signing :
  `https://v2.tauri.app/distribute/sign/windows/`
- Tauri, extension temporaire de configuration :
  `https://v2.tauri.app/develop/configuration-files/`
- Microsoft, SignTool :
  `https://learn.microsoft.com/windows/win32/seccrypto/signtool`
- Microsoft, Get-AuthenticodeSignature :
  `https://learn.microsoft.com/powershell/module/microsoft.powershell.security/get-authenticodesignature`
