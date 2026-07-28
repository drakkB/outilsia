# Recette Computer Use RC10 - Frontières de confiance V5

## Mission

Auditer en boîte noire puis en boîte grise la candidate privée exacte
`OutilsIA Local Cockpit 0.1.2-rc.10`. La recette doit répondre à une question
simple :

> Un agent local peut-il consulter une preuve utile et préparer une action sans
> pouvoir s'autoriser lui-même, déclencher une sonde cachée, falsifier la
> provenance ou transformer une estimation en mesure ?

La réponse attendue n'est pas un commentaire général. Elle doit être démontrée
par des observations natives, des scénarios négatifs, des empreintes et des
tests liés au commit exact du binaire.

## Verdicts possibles

- `GO_LOCAL_CANDIDATE` : toutes les gates P0/P1 sont vertes.
- `NO_GO` : au moins un P0/P1 est reproduit.
- `BLOCKED_BINARY_NOT_BUILT` : la candidate ou son identité ne contient pas ce
  contrat V5.
- `BLOCKED_PREREQUISITE` : un prérequis externe manque ; ne jamais convertir ce
  statut en succès.

Un test source vert ne peut pas réparer rétroactivement un binaire antérieur.
Une fixture ne remplace jamais une observation native.

## Périmètre autorisé

- Kit unique :
  `C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.10-Test`
- Portable Windows exact déclaré dans `release-candidate.json`.
- Dépôt source uniquement après la phase de boîte noire :
  `C:\Users\chris\outilsia-repo`
- Résultats :
  `C:\Users\chris\Downloads\OutilsIA-Computer-Use-RC10\<horodatage>`

Ne rien écrire sur le Bureau. Ne pas chercher, ouvrir ou exécuter une autre RC.

## Interdictions

- Aucun déploiement ou promotion publique.
- Aucun clic sur une action de publication.
- Aucun téléchargement, installation ou suppression de modèle.
- Aucune soumission Benchmark Commons réseau.
- Aucun partage public de rapport.
- Aucun token, URL Bearer, hostname, email, compte, chemin personnel, prompt ou
  réponse brute dans les captures et livrables.
- Aucun changement de pilote, BIOS, WSL, Ollama ou réglage système.
- Aucun effacement du Ledger utilisateur.
- Aucun test financier, backtest ou action Strategy Arena.

## Livrables obligatoires

Créer :

1. `RAPPORT-COMPUTER-USE-RC10.md`
2. `IDENTITE-CANDIDAT.json`
3. `ANOMALIES.csv`
4. `SCENARIOS.csv`
5. `COMMANDES-ET-RESULTATS.txt`
6. `PRIVACY-CHECK.json`
7. `CAPTURES-INDEX.md`
8. `captures/`
9. `logs/`

Le rapport final doit distinguer `PASS`, `FAIL`, `NOT_RUN_EXPECTED`,
`NOT_RUN_UNSAFE` et `BLOCKED_PREREQUISITE`.

## Phase 0 - Gel de la preuve

Avant de lire le code :

1. Vérifier que le dossier autorisé existe.
2. Lire seulement `release-candidate.json`, `SHA256SUMS.txt`,
   `AUTHENTICODE.json` et les fichiers d'identité du kit.
3. Recalculer le SHA-256 du portable.
4. Vérifier :
   - label `0.1.2-rc.10` ;
   - version `0.1.2` ;
   - canal `release-candidate` / `rc` ;
   - commit Git complet ;
   - arbre suivi propre au moment du build ;
   - déploiement public interdit ;
   - SHA fichier égal au manifeste ;
   - statut Authenticode exact, sans le réinterpréter.
5. Vérifier avec `git cat-file` que le commit manifeste contient cette recette
   V5 et les modules `local_mcp_http.rs`, `local_action_lane.rs` et
   `evidence_ledger.rs`.

Arrêter avec `BLOCKED_BINARY_NOT_BUILT` si un de ces points échoue.

## Phase 1 - Premier écran novice

Lancer uniquement le portable autorisé.

Avant scan :

- l'application ouvre sur Accueil en mode essentiel ;
- une seule action principale est visible ;
- son libellé, son détail et sa commande sont cohérents ;
- le Bilan est l'unique surface de décision avant scan ;
- la bande de décision scannée n'est pas dupliquée ;
- le score précise qu'il estime le potentiel matériel et ne mesure pas la
  vitesse ;
- `Atelier avancé` ne domine pas le premier écran.

Après scan :

- CPU, RAM, GPU, VRAM, OS et runtime sont lisibles ;
- une RTX 4080 SUPER doit afficher 16 Go, jamais 12 Go ;
- une sonde GPU muette reste inconnue et ne devient pas CPU-only ;
- le bouton d'en-tête porte la vraie prochaine action calculée ;
- le sous-libellé ne change pas la commande ;
- au plus trois actions utiles sont proposées dans le Bilan ;
- estimation, mesure et inconnue sont visuellement distinctes.

Captures minimales : desktop 1440x900, 1024x768, 963x700 et rendu source
390x844.

## Phase 2 - Instantané de capacités honnête

Dans `Atelier avancé > Créer l'instantané IA` :

1. Générer l'instantané après scan.
2. Vérifier les textes visibles :
   - `AI Capability Snapshot` ou `Instantané de capacités IA` ;
   - `cohérence du JSON` ;
   - `provenance non vérifiée` ;
   - aucune promesse de signature Rust/OS, d'attestation matérielle ou
     d'identité.
3. Copier l'export uniquement vers un fichier temporaire privé si nécessaire.
4. Vérifier :
   - `document_kind=capability_snapshot` ;
   - version `1.4.0` ou supérieure ;
   - `assurance.level=self_consistency_only` ;
   - `os_key_attested=false` ;
   - `machine_identity_proven=false` ;
   - `owner_identity_proven=false` ;
   - `provenance_verified=false`.
5. Modifier une copie du JSON et confirmer que le contrôle de cohérence la
   refuse.

P0 si l'UI ou l'export utilise `signé`, `attesté`, `identité vérifiée` ou
`provenance vérifiée` pour ce document.

## Phase 3 - MCP read-only

1. Confirmer que le serveur est arrêté par défaut.
2. Le démarrer après l'action explicite prévue.
3. Vérifier :
   - liaison `127.0.0.1` uniquement ;
   - expiration de quinze minutes ;
   - jeton en mémoire ;
   - huit outils et quatre ressources en lecture seule ;
   - aucune installation, suppression, sonde, benchmark, chat, fichier,
     configuration, backtest ou ordre.
4. Avec le client TypeScript MCP officiel :
   - handshake ;
   - `notifications/initialized` ;
   - liste des outils ;
   - lecture des ressources ;
   - annotations read-only ;
   - refus d'une méthode inconnue.
5. Tester un Origin loopback autorisé.
6. Tester et capturer le refus CORS pour :
   - `https://outilsia.fr` ;
   - `https://strategyarena.io` ;
   - une origine arbitraire.
7. Arrêter le MCP et vérifier que le même jeton ne fonctionne plus.

Ne jamais reproduire le jeton dans le rapport.

## Phase 4 - Local Action Lane : préparation sans pouvoir

Le client MCP peut préparer ; il ne peut ni approuver ni exécuter.

1. Démarrer la lane après confirmation.
2. Préparer l'export d'un rapport figé ou le benchmark d'un modèle déjà
   installé. Ne préparer aucune installation.
3. Pendant la préparation, vérifier :
   - aucune nouvelle fenêtre `ollama`, WSL ou PowerShell ;
   - aucune ligne d'opération indiquant une sonde runtime/disque ;
   - aucune action native démarrée ;
   - état `awaiting_human` ;
   - SHA-256 exact du plan visible ;
   - runtime et cible issus du snapshot figé ;
   - aucun outil MCP `approve`, `execute` ou équivalent.
4. Répéter la même requête et vérifier l'idempotence ou l'anti-doublon.
5. Tenter une requête modifiée avec un ancien SHA et vérifier le refus.

P0 si la préparation déclenche une commande, un téléchargement, un benchmark
ou une sonde live.

## Phase 5 - Consentement système non scriptable

Utiliser une action sans effet destructif et sans réseau.

### 5.1 Annulation d'autorisation

1. Cliquer `Vérifier et autoriser`.
2. Vérifier qu'une vraie boîte du système apparaît hors du DOM de la WebView.
3. Elle doit afficher la cible, l'effet et le SHA-256 du plan.
4. Annuler.
5. Vérifier que la demande reste non approuvée et qu'aucune capacité n'existe.

### 5.2 Autorisation

1. Redemander l'autorisation.
2. Confirmer dans la boîte système.
3. Vérifier :
   - état `approved` ;
   - capacité liée au plan, au client et à la session ;
   - expiration deux minutes ;
   - usage unique ;
   - aucune exécution à ce stade.

### 5.3 Annulation d'exécution

1. Cliquer `Confirmer l'exécution`.
2. Vérifier qu'une seconde boîte système distincte apparaît.
3. Annuler.
4. Vérifier qu'aucune action n'a commencé et que la capacité n'a pas été
   consommée comme réussite.

### 5.4 Exécution bornée

Seulement pour l'export local du rapport figé ou un benchmark d'un modèle déjà
installé :

1. Confirmer la seconde boîte système.
2. Vérifier que les contrôles live runtime/disque/modèle arrivent maintenant,
   après consentement et avant l'action.
3. Vérifier la consommation unique de la capacité.
4. Tenter un replay du même plan et exiger le refus.
5. Tenter un SHA altéré et exiger le refus.

P0 si un appel JavaScript, un booléen `confirm:true`, le client MCP ou une
requête HTTP suffit à autoriser/exécuter.

## Phase 6 - Provenance des décisions

Inspecter les reçus minimaux :

- `decision_channel=os_native_dialog` uniquement après la boîte système ;
- annulation MCP : `mcp_requesting_client` ;
- expiration automatique : `system_timeout` ;
- aucune annulation ou expiration ne doit être libellée décision humaine ;
- prompt, sortie, rapport brut, token et chemin absents.

Un reçu prouve une transition bornée, pas l'identité civile de la personne.

## Phase 7 - Evidence Ledger v2

Ne pas manipuler le Ledger réel de l'utilisateur. Utiliser un répertoire
temporaire isolé ou les tests Rust dédiés.

1. Construire un Ledger v1 valide avec au moins une entrée.
2. Conserver ses octets, son digest, son nombre d'entrées et sa tête de chaîne.
3. Lire ce fichier avec le code candidat.
4. Vérifier :
   - migration vers `outilsia.evidence_ledger.v2` ;
   - `storage_version=2` ;
   - entrées inchangées ;
   - tête de chaîne inchangée ;
   - ancien digest inscrit dans `migration_history` ;
   - remplacement atomique ;
   - Ledger final vérifiable.
5. Refaire la lecture et vérifier qu'aucune seconde migration n'est ajoutée.
6. Créer un schéma futur `v99`, conserver ses octets, tenter la lecture et
   vérifier :
   - refus clair ;
   - fichier strictement inchangé ;
   - aucun backup destructif ;
   - aucune réinitialisation silencieuse.

P0 si une version inconnue est écrasée ou si une entrée v1 disparaît.

## Phase 8 - Benchmark Commons : langage de preuve

Utiliser uniquement une mesure locale réelle déjà obtenue ou lancer un
benchmark standard sur un modèle déjà installé après consentement natif.

Vérifier :

- prompt standard identifié ;
- modèle et runtime exacts ;
- vitesse mesurée, durée, préfill, chargement et offload ;
- aperçu avant consentement ;
- deux gestes pour l'export local ;
- aucun réseau dans cette build ;
- exclusions de confidentialité complètes ;
- `field_test_proof=false` ;
- `community_verified=false` ;
- `leaderboard_eligible=false`.

Si une fixture de reçu serveur est utilisée en test source :

- l'UI peut afficher `digest déclaré par le serveur` ;
- elle ne doit jamais afficher `HMAC vérifié`, `signature serveur vérifiée` ou
  une garantie cryptographique que le client ne peut pas contrôler ;
- le client vérifie seulement forme, limites et rattachement.

Révoquer et supprimer l'unique export de test après accord explicite de
l'utilisateur. Conserver uniquement le reçu minimal autorisé.

## Phase 9 - Evidence de non-régression

Après la boîte noire, vérifier le commit exact :

```powershell
cargo test --manifest-path local-cockpit-app\src-tauri\Cargo.toml --lib
cargo clippy --manifest-path local-cockpit-app\src-tauri\Cargo.toml --all-targets -- -D warnings
npm --prefix local-cockpit-app run verify:mcp-sdk-conformance:native
npm --prefix local-cockpit-app run verify:app-core
npm --prefix local-cockpit-app run verify:ci-source
```

Les tests obligatoires doivent couvrir :

- dialogue système requis pour approbation, refus et exécution ;
- absence de commandes Tauri scriptables d'approbation/exécution ;
- anti-replay et anti-altération ;
- préparation sans sonde live ;
- CORS loopback seulement ;
- parsing HTTP partagé et limites de taille ;
- Snapshot sans faux claim de provenance ;
- migration Ledger v1 vers v2 ;
- refus non destructif d'une version future ;
- Commons sans faux HMAC client ;
- UI desktop/mobile et action principale calculée.

## Phase 10 - Confidentialité

Chercher dans tous les livrables :

- adresse email ;
- nom de compte ;
- hostname ;
- nom utilisateur Windows ;
- chemin `C:\Users\...` autre que les chemins de livraison autorisés ;
- token Bearer ;
- clé API ;
- prompt ou réponse de modèle ;
- IP autre que loopback ;
- contenu d'un fichier personnel.

`PRIVACY-CHECK.json` doit contenir un booléen explicite par catégorie.

## Classification des anomalies

### P0

- agent ou WebView capable de s'auto-approuver ou s'auto-exécuter ;
- action, sonde ou réseau avant consentement ;
- token ou donnée privée exporté ;
- fausse provenance/signature/attestation ;
- perte ou écrasement non sollicité du Ledger ;
- publication ou installation non autorisée.

### P1

- action principale incohérente avec la commande ;
- CORS distant accepté ;
- replay ou SHA altéré accepté ;
- estimation présentée comme mesure ;
- reçu serveur présenté comme cryptographiquement vérifié par le client ;
- RC/manifeste/source non alignés.

### P2

- texte trop dense ;
- détail secondaire ambigu sans effet sur la commande ;
- preuve native impossible faute de client externe, si et seulement si le
  blocage est documenté et les contrats automatisés restent verts.

## Definition of Done

Le verdict `GO_LOCAL_CANDIDATE` exige :

- identité RC10 exacte et liée à cette recette ;
- zéro P0/P1 ;
- deux boîtes système distinctes observées ;
- annulation puis confirmation prouvées ;
- aucun pouvoir d'approbation/exécution dans MCP ;
- préparation sans sonde ni action ;
- anti-replay et anti-altération verts ;
- Snapshot honnête ;
- Ledger v1 migré sans perte et v99 préservé ;
- Commons local sans réseau et sans faux label cryptographique ;
- clients MCP officiels verts ;
- Rust, app-core et CI source verts ;
- responsive vert ;
- aucune donnée privée dans les preuves ;
- aucun déploiement, promotion, modèle installé ou publication.

Le rapport final doit terminer par les lignes :

```text
Release publique modifiée : NON
Déploiement effectué : NON
Source modifiée par l'audit : NON
Modèle installé : NON
Modèle supprimé : NON
Rapport public partagé : NON
Soumission Commons réseau : NON
Token enregistré dans une preuve : NON
Export de test encore actif : NON
```
