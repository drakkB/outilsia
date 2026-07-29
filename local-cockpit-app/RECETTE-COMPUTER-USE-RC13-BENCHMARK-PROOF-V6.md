# Recette Computer Use V6 - RC13 Mesure, diagnostic et carte de preuve

## Mission

Auditer en boîte noire puis en boîte grise la candidate privée exacte
`OutilsIA Local Cockpit 0.1.2-rc.13`.

Cette recette ne cherche pas à démontrer que l'application contient beaucoup de
fonctions. Elle doit répondre à cinq questions vérifiables :

1. Une mesure présentée comme réelle provient-elle bien d'Ollama sur cette
   machine ?
2. Deux résultats ne sont-ils déclarés comparables que si leur protocole
   indispensable est identique ?
3. Le diagnostic distingue-t-il fait observé, hypothèse, inconnue et prochain
   test ?
4. La décision d'achat peut-elle conclure honnêtement qu'il ne faut rien
   acheter ?
5. La carte partageable exclut-elle les données privées et toute fausse
   attestation d'identité ?

Le verdict doit venir d'observations natives et de contrats liés au commit exact
du binaire. Une fixture ne vaut jamais mesure terrain.

## Verdicts possibles

- `GO_LOCAL_PROOF_CANDIDATE` : zéro P0/P1 et toutes les gates locales sont
  vertes.
- `NO_GO` : au moins un P0/P1 est reproduit.
- `BLOCKED_BINARY_NOT_BUILT` : le kit, le manifeste ou le commit ne contient pas
  le palier V6.
- `BLOCKED_PREREQUISITE` : aucun modèle déjà installé ou autre prérequis
  strictement externe ne permet le test natif.

Ne jamais convertir `NOT_RUN`, `BLOCKED` ou un test source en `PASS`.

## Périmètre autorisé

- Kit unique :
  `C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.13-Test`
- Portable Windows exact déclaré dans `release-candidate.json`.
- Dépôt source, seulement après la boîte noire :
  `C:\Users\chris\outilsia-repo`
- Backend candidat non déployé, seulement pour les tests isolés :
  `/home/chris/projects/outilsia/server-work/routers/ops_routes.py`
- Résultats :
  `C:\Users\chris\Downloads\OutilsIA-Computer-Use-RC13-Proof\<UTC_YYYYMMDD_HHMMSS>`

Ne rien écrire sur le Bureau. Ne chercher, ouvrir ou exécuter aucune autre RC.

## Préconditions

- Un modèle Ollama est déjà installé sur la machine.
- Le modèle peut être différent d'une machine à l'autre.
- Aucun modèle ne doit être téléchargé pour cette recette.
- Le backend public de la carte enrichie n'est pas promu par ce chantier :
  toute vérification `/r/` enrichie est donc locale ou isolée.

## Interdictions

- Aucun déploiement ou promotion publique.
- Aucun téléchargement, installation ou suppression de modèle.
- Aucun changement de pilote, BIOS, WSL, Ollama ou réglage système.
- Aucune soumission Benchmark Commons réseau.
- Aucun partage public de rapport sur le serveur de production.
- Aucun achat ou ouverture d'un lien marchand.
- Aucun prompt brut, réponse brute, token, hostname, email, compte, identifiant
  machine ou chemin personnel dans les captures et rapports.
- Aucun test Strategy Arena, financier ou de backtest.
- Aucun nettoyage d'historique utilisateur hors export créé par cette recette.

## Livrables obligatoires

Créer :

1. `RAPPORT-COMPUTER-USE-RC13-PROOF.md`
2. `IDENTITE-CANDIDAT.json`
3. `MESURE-STANDARD.json`
4. `PROTOCOLE-AUDIT.json`
5. `PROOF-CARD-PRIVACY.json`
6. `ANOMALIES.csv`
7. `SCENARIOS.csv`
8. `COMMANDES-ET-RESULTATS.txt`
9. `CAPTURES-INDEX.md`
10. `captures/`
11. `logs/`

Ne jamais recopier la réponse du modèle ou le prompt brut dans ces fichiers.
Conserver uniquement les métriques, empreintes et classifications autorisées.

## Phase 0 - Geler l'identité avant de lire le code

1. Vérifier l'existence du kit unique.
2. Lire seulement :
   - `release-candidate.json` ;
   - `SHA256SUMS.txt` ;
   - `AUTHENTICODE.json` ;
   - les fichiers d'identité inclus dans le kit.
3. Recalculer le SHA-256 du portable.
4. Vérifier :
   - version `0.1.2` ;
   - label `0.1.2-rc.13` ;
   - canal `rc` / `release-candidate` ;
   - commit Git complet ;
   - arbre suivi propre au début du build ;
   - déploiement public interdit ;
   - SHA fichier égal au manifeste ;
   - statut Authenticode rapporté sans embellissement.
5. Avec `git cat-file`, vérifier que le commit manifeste contient :
   - cette recette V6 ;
   - `src/benchmark-proof-engine.js` ;
   - `scripts/test-benchmark-proof-engine.mjs` ;
   - `scripts/verify-benchmark-proof-ui.py` ;
   - `scripts/verify-benchmark-proof-seo.py`.

Arrêter avec `BLOCKED_BINARY_NOT_BUILT` au premier écart d'identité.

## Phase 1 - Parcours novice avant la preuve

Lancer uniquement le portable du manifeste.

Avant scan :

- l'app s'ouvre sur Accueil en mode essentiel ;
- `Analyser ce PC` est l'action principale ;
- aucun téléchargement ou benchmark ne démarre ;
- l'Atelier avancé ne domine pas le premier écran ;
- le score est présenté comme potentiel matériel, jamais comme débit mesuré.

Après scan :

- CPU, RAM, GPU, VRAM, OS et runtime sont lisibles ;
- une RTX 4080 SUPER affiche 16 Go de VRAM, jamais 12 Go ;
- une sonde GPU muette reste inconnue, pas `CPU-only` ;
- aucune carte de preuve n'existe avant une vraie mesure compatible ;
- le Bilan distingue ce qui est estimé, mesuré et inconnu.

Captures minimales : 1440x900, 1024x768, 963x700. Le rendu source 390x844
sera vérifié après la boîte noire.

## Phase 2 - Benchmark standard natif

Utiliser un modèle déjà installé.

1. Ouvrir Tests puis `Benchmark Ollama`.
2. Choisir `Préparer le test standard` ou l'action standard équivalente.
3. Vérifier que la question standard affichée est exactement :
   `Pourquoi la VRAM est importante pour un LLM local ?`
4. Vérifier qu'elle n'est pas qualifiée de personnalisée.
5. Cliquer l'action de benchmark.
6. Exiger une confirmation native distincte avant exécution.
7. Annuler une première fois :
   - aucun benchmark ne démarre ;
   - aucun historique de réussite n'est ajouté.
8. Recommencer et confirmer.
9. Attendre le résultat sans changer de modèle ni de réglage.

Enregistrer uniquement :

- modèle exact ;
- runtime exact ;
- version Ollama si connue ;
- tokens/s génération ;
- tokens/s préremplissage ;
- durée totale ;
- durée de chargement ;
- placement CPU/GPU et pourcentage d'offload si mesuré ;
- paramètres `num_ctx`, `num_predict`, `seed`, température et fenêtre ;
- identifiants de protocole et empreintes.

Ne jamais enregistrer le prompt ou la sortie brute.

P0 si l'app affirme une mesure sans appel Ollama réussi. P1 si le benchmark
démarre sans confirmation native ou si le standard est étiqueté personnalisé.

## Phase 3 - Benchmark Protocol v2

Après la mesure, ouvrir le Bilan puis télécharger la preuve JSON locale.

Vérifier :

- `schema=outilsia.proof_card.v1` ;
- `protocol.schema=outilsia.benchmark_protocol.v2` ;
- `protocol.version=2.0.0` ;
- `protocol.prompt_kind=outilsia_vram_standard_v1` ;
- `prompt_sha256` est un SHA-256 hexadécimal de 64 caractères ;
- modèle, runtime, version Ollama et paramètres correspondent à la mesure ;
- app version, build et commit correspondent au manifeste ;
- `measurement.source=ollama_api` ;
- `measurement.measured=true` ;
- les métriques affichées et exportées concordent à la tolérance d'arrondi ;
- `public_aggregate_eligible=true` seulement pour le standard complet.

En boîte grise, exécuter les tests de falsification :

1. même protocole comparé à lui-même : comparable ;
2. modèle différent : non comparable ;
3. prompt digest différent : non comparable ;
4. runtime différent : non comparable ;
5. réglage différent : non comparable ;
6. mesure incomplète ou allocation inconnue : aucune précision inventée ;
7. prompt personnalisé : mesure locale possible, agrégation standard interdite.

P0 si un prompt personnalisé ou un modèle différent est déclaré comparable.

## Phase 4 - Bottleneck Explainer v1

Dans le Bilan, vérifier quatre catégories séparées :

- fait mesuré ou observé ;
- hypothèse ;
- inconnue ;
- prochain test.

Le bloc principal doit afficher une confiance explicite. Vérifier que :

- plusieurs barrettes ne prouvent jamais le dual channel ;
- une température instantanée ne prouve jamais un throttling ;
- une API CUDA/Vulkan déclarée ne prouve pas son utilisation ;
- une valeur Win32 VRAM plafonnée ne condamne pas le GPU ;
- un offload partiel mesuré peut être décrit sans transformer la corrélation en
  causalité certaine ;
- l'absence de goulot prouvé produit `Aucun achat prioritaire` ou un équivalent
  non commercial ;
- une inconnue produit `Mesurer avant achat`, pas une recommandation matérielle.

En boîte grise, lancer les sept profils déterministes du moteur et joindre
uniquement les clés de verdict, confiance et décision d'achat.

P0 si l'app invente une cause. P1 si elle recommande un achat quand le moteur
conclut `no_buy` ou `measure_first`.

## Phase 5 - Proof Card v1 locale

Vérifier avant benchmark :

- boutons Copier/Télécharger désactivés ;
- aucune carte visible.

Vérifier après benchmark standard :

- badge `Protocole standard mesuré` ;
- modèle et débit identiques au résultat natif ;
- GPU, RAM et VRAM normalisés ;
- préremplissage et placement affichés sans valeur fabriquée ;
- décision achat identique au Bottleneck Explainer ;
- mention `Identité non attestée` visible ;
- mention de mesure ponctuelle et de checksum de cohérence visible.

Télécharger le JSON dans le dossier de résultats privé, puis vérifier :

- `badge.verified=false` ;
- `assurance.identity_verified=false` ;
- `assurance.physical_field_proof=false` ;
- `integrity.identity_signature=false` ;
- `verification_semantics=coherence_not_provenance` ;
- le SHA-256 de cohérence se recalcule sur le document canonique hors
  `integrity` ;
- aucun vocabulaire ne transforme ce digest en signature ou attestation.

Copier la version Markdown et vérifier qu'elle reste compréhensible sans
l'application.

## Phase 6 - Confidentialité et falsification de la carte

Chercher récursivement dans le JSON et le Markdown :

- prompt brut ;
- sortie brute ;
- `machine_key` ;
- hostname ;
- nom d'utilisateur Windows ;
- email ou identifiant de compte ;
- token Bearer ou clé API ;
- chemin personnel ;
- IP ;
- User-Agent ;
- fichier personnel.

Chaque catégorie doit produire un booléen dans `PROOF-CARD-PRIVACY.json`.

Créer trois copies temporaires :

1. débit modifié sans modifier le protocole ;
2. modèle carte différent du modèle protocole ;
3. décision achat différente du Bottleneck Explainer.

Vérifier que le contrat serveur isolé refuse les trois. Supprimer les copies
temporaires après le test.

Le checksum est une preuve de cohérence, pas une preuve d'origine. Ne jamais
classer une modification suivie d'un nouveau checksum comme fraude
cryptographiquement impossible : l'identité n'est volontairement pas attestée.

## Phase 7 - Propagation sans divergence

À partir de la même mesure, vérifier la cohérence dans :

- Bilan ;
- rapport Markdown ;
- PDF ;
- MemoryForge / Obsidian ;
- AI Capability Snapshot / Passport 1.5 ;
- outil MCP `outilsia_get_benchmark_proofs`.

Les six surfaces doivent conserver :

- modèle exact ;
- débit mesuré ;
- protocole v2 ;
- clé et confiance du goulot ;
- décision achat ;
- `identity_verified=false`.

Le rapport public enrichi `/r/` et sa carte Open Graph sont
`NOT_RUN_EXPECTED_SERVER_NOT_DEPLOYED` dans cette recette. Ils seront validés
uniquement après une décision de promotion backend séparée.

## Phase 8 - MCP read-only

1. Confirmer que le MCP est arrêté par défaut.
2. Le démarrer après confirmation native.
3. Vérifier loopback, expiration quinze minutes et token en mémoire.
4. Avec le client TypeScript MCP officiel :
   - handshake ;
   - liste des outils ;
   - appel `outilsia_get_benchmark_proofs` ;
   - aucune installation, suppression, benchmark ou publication disponible.
5. Vérifier que la preuve MCP correspond au Passport et au Bilan.
6. Arrêter le MCP et prouver que le jeton précédent est révoqué.

Ne jamais copier le token dans un livrable.

## Phase 9 - Serveur candidat isolé

Ne pas déployer.

Exécuter le scénario d'appairage isolé avec base temporaire :

- migration `proof_json` ;
- preuve valide acceptée ;
- machine, modèle, débit, runtime, version Ollama et réglages cohérents ;
- preuve incohérente refusée ;
- rapport public de test ne contient ni prompt ni sortie brute ;
- décision `no_buy` retire les upgrades et liens marchands du rapport ;
- révocation du lien renvoie ensuite 404 ;
- une preuve valide située au-delà des cinq derniers benchmarks reste trouvée.

Exécuter également `py_compile` du routeur candidat et supprimer la base
temporaire.

## Phase 10 - Non-régression source

Après la boîte noire, sur le commit exact :

```powershell
cargo test --manifest-path local-cockpit-app\src-tauri\Cargo.toml --lib
cargo clippy --manifest-path local-cockpit-app\src-tauri\Cargo.toml --all-targets -- -D warnings
npm --prefix local-cockpit-app run verify:mcp-sdk-conformance:native
npm --prefix local-cockpit-app run test:benchmark-proof-engine
npm --prefix local-cockpit-app run verify:benchmark-proof-ui
npm --prefix local-cockpit-app run verify:benchmark-proof-seo
npm --prefix local-cockpit-app run verify:app-core
npm --prefix local-cockpit-app run verify:ci-source
```

Puis, sous WSL :

```bash
OUTILSIA_SERVER_DIR=/home/chris/projects/outilsia/server-work \
  python3 local-cockpit-app/scripts/verify-desktop-pairing.py
python3 -m py_compile \
  /home/chris/projects/outilsia/server-work/routers/ops_routes.py
```

La CI privée doit être verte sur Windows, Linux et fusion multi-plateforme pour
le même SHA.

## Phase 11 - Responsive et lisibilité

Vérifier le Bilan et la carte aux viewports exacts :

- 1440x900 ;
- 1024x768 ;
- 963x700 ;
- 390x844 en rendu source Playwright.

Exiger :

- aucun overflow horizontal ;
- aucun texte ou bouton coupé ;
- métriques lisibles ;
- carte non imbriquée dans une autre carte décorative ;
- `Identité non attestée` visible ;
- action principale stable ;
- les outils avancés restent repliés.

## Classification

### P0

- mesure fabriquée ou fixture présentée comme terrain ;
- prompt/sortie/token/identifiant privé exporté ;
- identité, provenance ou matériel présentés comme attestés ;
- comparaison acceptée malgré modèle, prompt ou réglage différent ;
- diagnostic causal inventé ;
- publication, installation ou achat non autorisé.

### P1

- benchmark sans confirmation native ;
- standard qualifié de personnalisé ;
- métriques divergentes entre UI, export et rapport ;
- achat conseillé malgré `no_buy` / `measure_first` ;
- carte créée depuis un échec ou une estimation ;
- MCP capable d'exécuter ou de publier ;
- RC, manifeste, source ou CI non alignés ;
- révocation de lien inefficace dans le test isolé.

### P2

- texte trop dense ;
- terme technique non expliqué ;
- arrondi différent mais traçable ;
- backend public non testé parce que volontairement non déployé.

## Definition of Done

`GO_LOCAL_PROOF_CANDIDATE` exige :

- identité RC13 exacte et recette présente dans son commit ;
- zéro P0/P1 ;
- benchmark standard réel sur modèle déjà installé ;
- confirmation native annulée puis acceptée ;
- protocole v2 et comparabilité stricte ;
- diagnostic séparant faits, hypothèses, inconnues et tests ;
- décision `no_buy` respectée ;
- carte privée, cohérente et sans fausse attestation ;
- propagation identique sur six surfaces ;
- MCP read-only révoqué ;
- serveur isolé anti-falsification et révocation verts ;
- Rust, clippy, app-core, CI source, Windows, Linux et merge verts ;
- responsive vert ;
- aucune donnée privée ;
- aucun déploiement, modèle téléchargé, achat ou publication.

Le rapport doit se terminer par :

```text
Release publique modifiée : NON
Déploiement effectué : NON
Source modifiée par l'audit : NON
Modèle installé : NON
Modèle supprimé : NON
Rapport public partagé : NON
Soumission Commons réseau : NON
Token enregistré dans une preuve : NON
Export de preuve temporaire encore actif : NON
```
