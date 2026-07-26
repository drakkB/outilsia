# OutilsIA Local Cockpit - RC, smoke et promotion

Ce document est la procedure de reference pour tester une Release Candidate
privee, importer les preuves et preparer une beta publique Windows/Linux.

La RC n'est jamais publiee automatiquement. Le seuil smoke et la decision
humaine autorisent seulement la creation d'un pack de promotion. Le deploiement
reste une commande separee et exige `--deploy`.

Etat de reference au 26 juillet 2026 :

- sources : `0.1.2`, candidat prive uniquement ;
- public : `0.1.1`, build `291439601671` ;
- terrain `0.1.2` : `0/5`, aucune fixture ne compte comme machine ;
- Authenticode public Windows : `NotSigned` ;
- app ChatGPT : contrat gele pendant son examen.

## Frontiere de preuve

Deux niveaux ne doivent pas etre confondus :

| Niveau | Seuil | Ce qu'il prouve |
| --- | ---: | --- |
| Smoke RC | 2 machines physiques uniques | Le coeur scan, Ollama, benchmark et rapport fonctionne sur plus d'un PC |
| Terrain complet | 5 profils physiques | La couverture multi-profils annoncee par la roadmap |

Un smoke RC pret conserve toujours :

```json
{
  "promotion_authorized": false,
  "full_terrain_gate_complete": false
}
```

La communication autorisee apres promotion reste donc : **beta publique testee
sur plusieurs machines**. Ne pas annoncer une validation terrain complete avant
les cinq profils reels.

## Invariants

Chaque resultat importe doit conserver et verifier :

- version, build, canal RC et commit source ;
- SHA256 du manifeste candidat et de l'ensemble des artefacts ;
- statut Authenticode lie au nom et au SHA256 de chaque artefact Windows ;
- ancre physique Windows hachee avec le manifeste de cette RC, non reutilisable
  pour suivre une machine entre deux releases ;
- empreinte materielle uniquement hachee ;
- recette native exportee avec son SHA256 ;
- benchmark positif et duree d'au moins 200 ms ;
- URL publique exacte `https://outilsia.fr/r/...` ;
- rapport HTTP 200 coherent avec GPU, modele et vitesse ;
- SHA256 du corps du rapport identique a celui mesure sur la machine.

Le registre refuse :

- un resultat exact deja importe, qui devient un no-op ;
- une URL de rapport reutilisee ;
- un meme corps de rapport pour deux machines ;
- une recette modifiee ;
- un rapport modifie apres validation ;
- une RC, un commit ou un ensemble d'artefacts differents.

Deux passages du meme PC restent dans l'historique, mais seule la mesure la plus
recente de son ancre physique compte dans le seuil.

## Mesure d'activation locale

La RC conserve localement trois jalons, chacun avec sa premiere date :

1. `scan_success` ;
2. `recommended_model_ready` ;
3. `first_benchmark_success`.

Le document `outilsia.activation_funnel.v1` ne contient ni identifiant machine,
ni modele, ni prompt, ni reponse, ni chemin de fichier. Il n'est jamais envoye
automatiquement. Il est lie a la version, au build et au canal, puis remis a
zero lorsqu'une nouvelle identite de build fiable est detectee.

La fiche terrain peut embarquer ce resume pour mesurer le parcours, mais il ne
remplace aucune preuve materielle ou reseau.

## 1. Preparer la RC privee

Le workflow GitHub `Local Cockpit Release Candidate` produit les artefacts
Windows et Linux, un candidat fusionne et un kit terrain Windows. Telecharger
et extraire l'artefact fusionne dans :

```text
local-cockpit-app/.artifacts/release-candidate-merged/
```

Verifier le candidat :

```bash
npm run verify:rc -- \
  --input .artifacts/release-candidate-merged \
  --require-platform windows-x64 \
  --require-platform linux \
  --require-freshness \
  --require-clean-source
```

Le kit `outilsia-local-cockpit-private-rc-field-kit` du meme run est directement
utilisable. Pour le regenerer, extraire aussi le candidat Windows dans
`.artifacts/release-candidate-windows`, puis lancer :

```bash
npm run kit:rc -- \
  --candidate-dir .artifacts/release-candidate-windows \
  --output-dir .artifacts/release-candidate-kit \
  --replace
```

Le kit reste prive. Il n'utilise pas le repertoire public du site.

Le candidat Windows contient aussi `AUTHENTICODE.json`. Sur un runner Windows,
le packager execute `Get-AuthenticodeSignature` sur chaque EXE/MSI et lie le
resultat au SHA256 exact. Les statuts acceptes sont :

- `valid` : tous les artefacts Windows sont signes et l'identite est lisible ;
- `not_signed` : aucun artefact n'a de signature valide ;
- `mixed_or_invalid` : signatures heterogenes ou invalides ;
- `unverified` : inspection Windows impossible sur ce runner ;
- `not_applicable` : aucun artefact Windows.

Seul `valid` autorise une revendication d'identite signee. `NotSigned` n'empeche
pas une beta privee ou publique explicitement non signee, mais interdit toute
mention contraire. Aucun certificat, PFX ou mot de passe n'entre dans le depot.

## 2. Tester une machine Windows

Ordre de campagne recommande :

1. tour Core i7 + GTX 1080 Ti : `core_i7_gtx_1080_ti` ;
2. second Core i7 ou vieux portable : `old_laptop` ;
3. machine sans GPU exploitable : `cpu_only` ;
4. RTX 3060 12 Go : `rtx_3060_12gb` ;
5. RTX 4080 ou 4090 : `rtx_4080_4090`.

Les deux premiers profils ouvrent seulement le seuil smoke RC. Les cinq profils
sont necessaires pour annoncer une validation terrain complete.

Sur chaque PC physique :

1. Extraire le kit dans un dossier local.
2. Double-cliquer `01-LANCER-LE-RC.cmd`.
3. Dans l'app, cliquer `Analyser ce PC`.
4. Suivre l'action principale jusqu'a Ollama et `qwen3:0.6b`.
5. Lancer le benchmark.
6. Generer puis partager le rapport.
7. Cliquer `Telecharger recette` dans l'app.
8. Double-cliquer `02-VALIDER-LE-TEST.cmd`.
9. Double-cliquer `03-EXPORTER-LE-RESULTAT.cmd`.

Le ZIP de preuve est ecrit dans `Downloads`, jamais sur le Bureau. Il contient :

- le resultat `RC-SMOKE-*.json` ;
- `RECETTE-SOURCE.json` ;
- le manifeste candidat ;
- les SHA du kit ;
- le manifeste du kit.

Ne pas editer ces fichiers. En cas d'erreur, corriger le parcours dans l'app et
regenerer une nouvelle preuve.

## 3. Importer les resultats

Pour chaque ZIP recupere :

```bash
npm run import:rc-smoke -- \
  --input "/mnt/c/Users/chris/Downloads/OutilsIA-RC-Smoke-....zip" \
  --candidate-dir .artifacts/release-candidate-merged \
  --registry-dir .artifacts/rc-smoke-registry
```

L'import relit le rapport sur `outilsia.fr`. Une panne reseau ne devient pas un
faux echec materiel : la preuve reste non verifiee et le seuil reste ferme.

Consulter ensuite :

```text
.artifacts/rc-smoke-registry/RC-SMOKE-DECISION.html
```

Les fichiers d'autorite sont :

```text
RC-SMOKE-REGISTRY.json
RC-SMOKE-STATUS.json
RC-SMOKE-DECISION.html
```

## 4. Creer la decision humaine

Cette etape n'est permise que si `RC-SMOKE-STATUS.json` contient
`RC_SMOKE_GATE_READY` et apres lecture du tableau HTML.

Creer un modele encore non approuve :

```bash
npm run decision:rc-promotion -- \
  --candidate-dir .artifacts/release-candidate-merged \
  --registry-dir .artifacts/rc-smoke-registry
```

Le fichier genere reste a `decision: "pending"`. Apres accord explicite de
Christophe, renseigner :

```json
{
  "decision": "approve_public_beta",
  "decided_at": "date ISO UTC",
  "decided_by": "Christophe",
  "reason": "raison explicite de vingt caracteres minimum"
}
```

Ne modifier ni l'identite candidate, ni les SHA, ni les cinq
acknowledgements. L'acknowledgement
`windows_signing_status_acknowledged` confirme uniquement que le statut
Authenticode a ete lu ; il ne transforme jamais un fichier non signe en fichier
signe.

## 5. Preparer le pack de promotion

Cette commande ne contacte aucun serveur et ne deploie rien :

```bash
npm run promote:rc -- \
  --candidate-dir .artifacts/release-candidate-merged \
  --registry-dir .artifacts/rc-smoke-registry \
  --decision .artifacts/rc-smoke-registry/PROMOTION-DECISION.json \
  --output-dir .artifacts/release-promotion \
  --replace
```

Elle recharge tous les rapports, copie exactement les octets de la RC, cree le
manifeste beta, synchronise une copie de la page de telechargement et produit :

```text
.artifacts/release-promotion/
  release.json
  PROMOTION-PROOF.json
  telecharger-scanner-ia-local.html
  OutilsIA-Local-Cockpit-...
```

Les binaires ne sont jamais recompiles ni reconstruits pendant la promotion.

## 6. Recette de deploiement

Toujours commencer par le dry-run :

```bash
npm run deploy:beta -- \
  --release-dir .artifacts/release-promotion \
  --page .artifacts/release-promotion/telecharger-scanner-ia-local.html \
  --promotion-proof .artifacts/release-promotion/PROMOTION-PROOF.json \
  --require-freshness
```

Apres un nouvel accord explicite, ajouter `--deploy`.

Le deploiement :

1. pose un verrou ;
2. sauvegarde release et page actuelles ;
3. charge les nouveaux fichiers dans un staging ;
4. verifie tailles et SHA sur le VPS ;
5. active les binaires ;
6. active la page ;
7. active `release.json` en dernier ;
8. revalide la version active ;
9. produit `DEPLOYMENT-RECEIPT.json`.

Une erreur avant la fin restaure automatiquement la release precedente.

## 7. Rollback explicite

Le deploiement affiche un chemin tel que :

```text
/var/backups/outilsia-local-cockpit/release_YYYYMMDDHHMMSS
```

Verifier d'abord le plan :

```bash
npm run rollback:beta -- \
  --backup-dir /var/backups/outilsia-local-cockpit/release_YYYYMMDDHHMMSS \
  --expected-current-build NOUVEAU_BUILD
```

Ajouter `--deploy` seulement apres controle du chemin et du build actif. Le
rollback sauvegarde encore l'etat courant avant de restaurer les binaires, la
page puis le manifeste en dernier.

## 8. Tests automatiques

Avant commit :

```bash
npm run verify:activation-funnel
npm run verify:product-truth
npm run test:release-candidate
npm run test:release-candidate:promotion
npm run verify:release-candidate:workflow
npm run verify:release-promotion:workflow
npm run verify:ci-source
```

Le test de promotion couvre notamment :

- deduplication d'un meme PC ;
- recette modifiee ;
- rapport modifie ;
- URL reutilisee ;
- decision humaine encore pending ;
- preservation exacte des octets ;
- artefact modifie avant deploiement ;
- page statique synchronisee ;
- preuve Authenticode preservee et liee aux artefacts exacts ;
- refus d'une revendication signee incoherente ;
- coherence source, candidat, public et pages du site ;
- dry-run de rollback.

References officielles :

- Tauri, distribution et signature :
  `https://v2.tauri.app/distribute/`
- Microsoft, `Get-AuthenticodeSignature` :
  `https://learn.microsoft.com/powershell/module/microsoft.powershell.security/get-authenticodesignature`
- Microsoft, SignTool :
  `https://learn.microsoft.com/windows/win32/seccrypto/signtool`
