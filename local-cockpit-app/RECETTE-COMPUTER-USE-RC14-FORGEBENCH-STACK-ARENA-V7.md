# Recette Computer Use V7 - RC14 ForgeBench Stack Arena

## Mission

Auditer en boîte noire puis en boîte grise la candidate privée exacte
`OutilsIA Local Cockpit 0.1.2-rc.14`.

Le palier ne cherche pas à savoir si un modèle sait produire seul un mini-jeu.
Il vérifie qu'OutilsIA peut encadrer et comparer honnêtement un
**arrangement collaboratif complet** :

`conception -> construction -> relecture -> réparation -> vérification`.

L'application ne doit jamais piloter les abonnements utilisés dans cet
arrangement. Elle doit seulement :

1. figer la tâche, les rôles, les identités et les versions ;
2. exporter un starter identique et des handoffs bornés ;
3. mesurer le temps réel et l'aide humaine déclarée ;
4. importer le seul artefact final choisi par l'utilisateur ;
5. l'exécuter hors ligne après confirmation native ;
6. conserver les coûts inconnus comme inconnus ;
7. agréger plusieurs reçus sans désigner de vainqueur universel ;
8. dire explicitement que l'auteur de l'artefact n'est pas attesté.

Un test source, une fixture Playwright ou l'artefact de référence ne vaut
jamais un run réel d'une équipe Kimi/Grok/Claude. Cette distinction est une
gate de la recette.

## Verdicts possibles

- `GO_PRIVATE_STACK_ARENA_CANDIDATE` : zéro P0/P1, parcours natif technique
  vert, contrats source verts et aucune revendication abusive.
- `NO_GO` : au moins un P0/P1 reproduit.
- `BLOCKED_BINARY_NOT_BUILT` : le kit, le manifeste ou le commit ne contient
  pas le palier V7 exact.
- `BLOCKED_PREREQUISITE` : l'isolation ou Chromium n'est pas disponible et ne
  peut pas être réparé sans installation ou changement système interdit.

Ne jamais convertir `NOT_RUN`, `BLOCKED`, une inspection source ou une fixture
en `PASS_NATIVE`.

## Périmètre autorisé

- Kit unique :
  `C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.14-Test`
- Portable Windows exact déclaré dans `release-candidate.json`.
- Dépôt source, seulement après la boîte noire :
  `C:\Users\chris\outilsia-repo`
- Source WSL correspondante :
  `/home/chris/projects/outilsia-proof-next`
- Résultats :
  `C:\Users\chris\Downloads\OutilsIA-Computer-Use-RC14-Stack-Arena\<UTC_YYYYMMDD_HHMMSS>`

Ne rien écrire sur le Bureau. Ne chercher, ouvrir ou exécuter aucune autre RC.

## Préconditions

- Le kit RC14 exact existe.
- La suite cachée Signal Maze peut être scellée localement.
- Bubblewrap et Chromium sont déjà disponibles dans le runtime Linux/WSL, ou
  leur préflight est déjà vert.
- Aucun compte Kimi, Grok, Claude, Codex, Gemini, GLM ou autre n'est nécessaire
  pour la validation technique de cette recette.
- Aucun agent externe ne sera lancé par Computer Use.

Si un vrai artefact produit par un arrangement humainement exécuté est fourni
séparément par le propriétaire, l'auditer dans une sous-phase distincte
`OPTIONAL_REAL_ARRANGEMENT`. Ne jamais se connecter à un compte fournisseur
pour le produire.

## Interdictions

- Aucun déploiement, push, promotion ou publication publique.
- Aucun téléchargement, installation ou suppression de modèle.
- Aucun changement de pilote, BIOS, WSL, Ollama ou réglage système.
- Aucun login, saisie de mot de passe, cookie ou jeton dans un outil externe.
- Aucune automatisation de Claude, Codex, Grok, Kimi, GLM ou d'un abonnement.
- Aucun appel API payant.
- Aucun test Strategy Arena, trading ou GardenArena.
- Aucun ajout du run technique de référence dans l'Evidence Ledger personnel.
- Aucun prompt brut, sortie brute, artefact, hostname, email, compte, token,
  chemin personnel ou seed caché dans les captures et rapports.
- Aucun run technique de référence présenté comme résultat d'une équipe IA.
- Aucun coût manquant remplacé par zéro.
- Aucun « meilleur stack », « gagnant », « scientifiquement prouvé » ou
  généralisation hors de la famille `greenfield_browser_game`.

## Sévérités

### P0

- Un abonnement, CLI externe ou modèle est lancé sans action humaine dans son
  environnement officiel.
- Un credential, token, cookie, compte ou chemin personnel apparaît dans un
  reçu, le tableau, le Ledger ou une capture.
- Le code généré est exécuté sans sélection explicite du dossier et sans
  confirmation native.
- La suite cachée est accessible au worker ou lue avant le gel de l'artefact.
- L'évaluateur autorise le réseau externe.
- Le workspace temporaire n'est pas supprimé avant émission du reçu.
- Un artefact ou un arrangement est présenté comme ayant un auteur attesté.
- Un digest SHA-256 est appelé signature d'identité ou preuve de provenance.
- Un run technique de référence est compté comme preuve terrain multi-IA.

### P1

- L'arrangement accepte une identité ou version vide.
- Il n'existe pas exactement un rôle Construction ou les rôles sont désordonnés.
- Le plan déclenche un outil, un modèle, un réseau ou une dépense.
- Le starter ou les handoffs diffèrent entre deux runs du même plan.
- Le chrono peut être omis ou remplacé par une durée inventée.
- Une correction sémantique ou une édition humaine n'est pas enregistrable.
- Un clic de permission réduit l'indice d'autonomie.
- Le prix mensuel est présenté comme coût marginal du run.
- Une inconnue devient `0 €`, `0 quota` ou `0 Wh`.
- Le coût entre dans Pareto alors qu'un composant marginal manque.
- Un seul run ouvre l'Arcade ou trois runs deviennent une vérité mensuelle.
- Un artefact rejeté est silencieusement relancé ou compté comme réussite.
- Le tableau déclare un vainqueur global ou une supériorité scientifique.
- La Stack Arena avancée domine le parcours Essentiel.
- Le reçu ou le tableau n'est pas exportable sans données brutes.

### P2

- Un libellé est ambigu mais les contrats restent vrais.
- Une action avancée demande trop de navigation.
- Un contrôle reste lisible mais peu ergonomique à 390 px.
- L'Evidence Ledger n'est validé que par tests isolés pour éviter de contaminer
  le journal personnel.

## Livrables obligatoires

Créer :

1. `RAPPORT-COMPUTER-USE-RC14-STACK-ARENA.md`
2. `IDENTITE-CANDIDAT.json`
3. `PLAN-TECHNIQUE-REFERENCE.json`
4. `STACK-RUN-REFERENCE.json`
5. `STACK-SCOREBOARD-REFERENCE.json`
6. `KIT-EXPORT-AUDIT.json`
7. `PRIVACY-CHECK.json`
8. `ANOMALIES.csv`
9. `SCENARIOS.csv`
10. `COMMANDES-ET-RESULTATS.txt`
11. `CAPTURES-INDEX.md`
12. `captures/`
13. `logs/`

Le mot `REFERENCE` est obligatoire dans les trois fichiers du run technique.
Ils doivent porter :

`classification=REFERENCE_ONLY_NOT_ARRANGEMENT_EVIDENCE`.

## Phase 0 - Geler l'identité

Avant d'ouvrir le dépôt source :

1. Vérifier l'existence du kit unique.
2. Lire seulement :
   - `release-candidate.json` ;
   - `SHA256SUMS.txt` ;
   - `AUTHENTICODE.json` ;
   - `RC-KIT-MANIFEST.json` si présent.
3. Recalculer le SHA-256 du portable.
4. Vérifier :
   - version `0.1.2` ;
   - label `0.1.2-rc.14` ;
   - canal `release-candidate` ;
   - build non vide ;
   - commit Git complet ;
   - arbre suivi propre au début du build ;
   - déploiement public interdit ;
   - SHA fichier égal au manifeste ;
   - Authenticode rapporté sans embellissement.
5. Avec `git cat-file`, vérifier que le commit manifeste contient :
   - cette recette V7 ;
   - `src-tauri/src/forgebench_stack_arena.rs` ;
   - `scripts/verify-forgebench-stack-arena.py` ;
   - `NOTICE-UTILISATION-WORKSTACK.md` ;
   - `ROADMAP.md`.

Arrêter avec `BLOCKED_BINARY_NOT_BUILT` au premier écart.

## Phase 1 - Parcours Essentiel

Lancer uniquement le portable du manifeste.

Vérifier avant tout clic :

- Accueil et mode Essentiel sont actifs ;
- l'analyse du PC reste l'action principale ;
- le Ring des arrangements n'est pas visible ;
- aucun agent, abonnement, benchmark ou téléchargement ne démarre ;
- aucun panneau avancé n'allonge le premier écran.

Capturer le premier écran sans donnée privée.

Passer ensuite dans **Atelier IA** et le mode avancé prévu par l'application.
Ouvrir la section ForgeBench. Vérifier que :

- les étapes historiques de ForgeBench sont repliées ;
- **Ring des arrangements** est également replié par défaut ;
- le résumé indique qu'une équipe construit et qu'OutilsIA mesure l'artefact ;
- le module ne se présente pas comme un orchestrateur d'abonnements.

## Phase 2 - Préparer le holdout sans exposer son contenu

Si la suite cachée n'est pas déjà scellée :

1. utiliser l'action native **Sceller 5 seeds privés** ;
2. vérifier qu'aucun seed, identifiant de check ou chemin n'est affiché ;
3. noter uniquement l'identifiant tronqué, les compteurs et les empreintes
   autorisées.

Vérifier ensuite l'isolation et Chromium avec les préflights existants. Ne
lancer aucune commande d'installation. Si un prérequis manque, classer
`BLOCKED_PREREQUISITE`.

## Phase 3 - Contrat d'un arrangement multi-IA sans exécution

Déplier **Ring des arrangements**.

Choisir le preset :

`Kimi -> Grok -> Claude -> Grok`

Renseigner explicitement des identités et versions de démonstration non
ambiguës, sans se connecter :

- Conception : `Kimi K2`, version `2026-07-test` ;
- Construction : `Grok Code`, version `4.2-test` ;
- Relecture : `Claude Code`, version `2.1.206-test` ;
- Réparation : `Grok Code`, version `4.2-test`.

Nom :

`AUDIT MULTI-IA - PLAN SEUL`

Cible : `3 runs - Arcade`.

Engagement mensuel déclaré : `60`.

Amortissement local : vide.

Avant de sceller :

- relever les processus Kimi, Grok, Claude, Codex et Ollama ;
- vérifier qu'aucun nouveau processus fournisseur n'est lancé ;
- vérifier que les versions vides bloquent l'action ;
- rétablir les versions de test.

Cliquer **Sceller l'arrangement**.

Vérifier :

- lane `subscription` ;
- quatre relais dans l'ordre ;
- exactement un builder ;
- trois runs visés ;
- holdout scellé ;
- aucun outil, modèle, réseau ou credential utilisé ;
- mention `cohérence locale, pas signature de provenance` ;
- mention d'attribution utilisateur, pas d'auteur attesté.

Copier le brief et vérifier qu'il contient :

- Signal Maze v1 ;
- les quatre rôles et versions ;
- exactement trois fichiers finaux ;
- les environnements officiels ;
- l'interdiction de modifier tests/seeds/permissions ;
- l'obligation de compter l'aide humaine ;
- l'absence d'automatisation d'abonnement.

Ne pas utiliser ce plan pour produire un artefact. Il prouve seulement la
préparation.

## Phase 4 - Export du kit et inspection

Cliquer **Exporter le kit** et choisir un dossier sous le répertoire privé de
résultats.

Vérifier la présence de :

- `workspace/index.html` ;
- `workspace/styles.css` ;
- `workspace/game.js` ;
- `BRIEF.md` ;
- `ARRANGEMENT.json` ;
- une carte handoff par relais.

Vérifier :

- exactement trois fichiers dans `workspace/` ;
- aucun lien symbolique ;
- aucune ressource distante ;
- aucune clé, token, cookie, email, hostname ou chemin personnel ;
- identités et versions identiques au plan ;
- `automatic_execution=false` sur chaque handoff ;
- `hidden_suite_access=false` sur chaque handoff ;
- starter SHA-256 identique au manifeste du commit.

Produire `KIT-EXPORT-AUDIT.json` avec uniquement noms relatifs, tailles,
empreintes et booléens de confidentialité.

## Phase 5 - Validation technique native distincte

Cette phase vérifie l'import et l'évaluateur ; elle ne teste pas une équipe IA.

Après la fin de la boîte noire, copier les trois fichiers du dossier de
référence **du commit candidat exact** :

`local-cockpit-app/forgebench/signal-maze-v1/reference/`

vers :

`<results>/reference-artifact/`

Créer un nouveau plan dans l'app :

- preset `Modèle local seul` ;
- nom `REFERENCE TECHNIQUE - AUCUNE PREUVE D'AUTEUR` ;
- rôle Construction ;
- fournisseur `Autre outil officiel` ;
- identité `Fixture de référence OutilsIA` ;
- version = commit candidat court ;
- cible `3 runs - Arcade` ;
- abonnement vide ;
- amortissement vide.

Sceller puis exporter ce plan.

Démarrer le chrono. Attendre au moins deux secondes. Terminer.

Déclarer :

- corrections sémantiques : `0` ;
- éditions humaines : `0` ;
- clics de permission : `2` ;
- quota : inconnu ;
- dépassement API : inconnu ;
- énergie locale : inconnue ;
- amortissement : inconnu.

Cocher l'autorisation d'import puis sélectionner `reference-artifact`.

Première tentative :

- annuler la confirmation native ;
- vérifier qu'aucun reçu n'est ajouté ;
- vérifier qu'aucun workspace temporaire ne subsiste.

Deuxième tentative :

- recommencer ;
- confirmer l'exécution hors ligne ;
- attendre la fin des contrôles.

Vérifier le reçu affiché :

- `51/51 checks` ;
- durée issue du chrono ;
- zéro correction ;
- les clics de permission ne sont pas pénalisés ;
- coût par run incomplet, jamais `0 €` ;
- aucune mention de gagnant ou de science.

Cliquer **Copier le dernier reçu** et enregistrer le JSON sous
`STACK-RUN-REFERENCE.json`, puis ajouter à côté dans le livrable d'audit :

```json
{
  "classification": "REFERENCE_ONLY_NOT_ARRANGEMENT_EVIDENCE"
}
```

Vérifier dans le reçu :

- `provenance.arrangement_attribution=user_declared` ;
- `provenance.artifact_authorship_verified=false` ;
- `provenance.handoff_trace_retained=false` ;
- `provenance.independently_authenticated=false` ;
- `security.subscription_automation=false` ;
- `security.external_network_during_evaluation=false` ;
- `security.artifact_frozen_before_hidden_suite_evaluation=true` ;
- `security.temporary_workspace_removed=true` ;
- `quality.subjective_polish_scored=false` ;
- `readiness.scientific_eligible=false` ;
- `readiness.winner_declared=false` ;
- `integrity.kind=integrity_digest_not_signature` ;
- `integrity.provenance_authenticated=false`.

Recalculer l'empreinte canonique hors `integrity`. P0 si elle ne correspond pas.

## Phase 6 - Tableau exploratoire et limites

Avec un seul run technique, copier le tableau et l'enregistrer sous
`STACK-SCOREBOARD-REFERENCE.json` avec la même classification
`REFERENCE_ONLY_NOT_ARRANGEMENT_EVIDENCE`.

Vérifier :

- statut `needs_two_arrangements` ou `arcade_incomplete` ;
- `runs_total=1` ;
- `arcade_ready=false` ;
- `monthly_compass_ready=false` ;
- aucune frontière prétendant comparer deux équipes ;
- coût inconnu exclu des dimensions ;
- `single_global_winner_declared=false` ;
- `scientific_superiority_claimed=false` ;
- `arrangement_attribution=user_declared` ;
- `artifact_authorship_verified=false` ;
- cinq runs décrits comme boussole mensuelle, pas vérité universelle.

Ne pas fabriquer cinq runs en dupliquant le reçu.

Le contrôle multi-arrangements à six runs est un test UI déterministe séparé :
il doit être rapporté comme `PASS_SOURCE_FIXTURE`, jamais comme terrain.

## Phase 7 - Evidence Ledger sans contamination

Vérifier visuellement que les sources suivantes sont proposées :

- `Run arrangement ForgeBench` ;
- `Tableau arrangements ForgeBench`.

Ne pas ajouter le run de référence au Ledger personnel.

En boîte grise, exécuter les tests Rust dédiés. Vérifier qu'ils prouvent :

- validation du reçu avant ajout ;
- validation du tableau avant ajout ;
- conservation des seules métriques et empreintes ;
- absence de brief, artefact, chemin et sortie brute ;
- attribution utilisateur non attestée ;
- absence de gagnant et de science ;
- doublons refusés par le Ledger.

Classer cette phase :

- UI native : `PASS` pour la découvrabilité ;
- écriture réelle : `NOT_RUN_USER_DATA_SAFETY` ;
- tests Ledger isolés : `PASS_SOURCE_TEST`.

## Phase 8 - Responsive et ergonomie

En natif, vérifier au minimum :

- 1440 x 900 ;
- 1024 x 768 ;
- 963 x 700.

En Playwright source, vérifier :

- 1440 x 1000 ;
- 390 x 920.

À chaque taille :

- aucun débordement horizontal ;
- résumé et état non superposés ;
- chevron visible ;
- chaque relais sur une ligne desktop et en colonne mobile ;
- textes et boutons non coupés ;
- chrono stable ;
- cases et libellés lisibles ;
- cartes de runs et Pareto compréhensibles ;
- mode Essentiel toujours débarrassé du ring.

## Phase 9 - Boîte grise et falsifications

Après toutes les observations natives, lire le commit exact et exécuter :

```text
npm run verify:forgebench-stack-arena
npm run verify:forgebench
npm run verify:evidence-ledger
npm run verify:workstack-arena
npm run verify:ci-source
cargo test --lib
```

Utiliser Windows pour Rust si WSL manque de bibliothèques système. Ne pas
installer `dbus`, `webkit`, `pkg-config` ou une dépendance système dans le cadre
de la recette.

Falsifications Rust obligatoires :

1. rôle dupliqué ;
2. builder absent ;
3. rôles désordonnés ;
4. version vide ;
5. plan altéré après empreinte ;
6. mauvais starter ;
7. fichier supplémentaire ;
8. lien symbolique ;
9. durée hors bornes ;
10. quota après supérieur au quota avant ;
11. coût négatif ou non fini ;
12. consentement incomplet ;
13. doublon de run ;
14. run altéré ;
15. auteur prétendument attesté ;
16. coût inconnu converti en zéro ;
17. gagnant ou science forcé à vrai.

Vérifier aussi que le module Stack Arena ne contient aucun client HTTP, socket
ou endpoint réseau.

## Phase 10 - Confidentialité

Scanner récursivement les livrables JSON/CSV/MD et captures.

Interdire :

- `C:\Users\` ;
- `/home/` ;
- email ;
- hostname ;
- identifiant machine stable ;
- Bearer/token/cookie/password ;
- prompt ou réponse brute ;
- code des trois fichiers ;
- seed caché ;
- chemin du vault ;
- compte fournisseur.

`PRIVACY-CHECK.json` doit contenir un booléen distinct pour chaque interdiction
et finir entièrement vert.

## Phase 11 - Nettoyage

1. Cliquer **Effacer les runs locaux**.
2. Confirmer que le run et le tableau de référence disparaissent de l'app.
3. Vérifier que le stockage local du ring ne contient plus ce reçu.
4. Ne pas supprimer les entrées Evidence Ledger préexistantes.
5. Retirer uniquement les kits temporaires exportés par cette recette si leur
   conservation n'est pas nécessaire aux preuves.
6. Fermer la RC proprement.
7. Vérifier qu'aucun worker, Chromium ou processus fournisseur n'est resté
   actif à cause du test.

Le JSON de référence conservé dans le dossier de résultats reste une preuve de
recette privée, pas une donnée produit.

## Scénarios CSV minimaux

`SCENARIOS.csv` doit contenir au moins :

- identité RC14 ;
- ring caché en Essentiel ;
- disclosure repliée par défaut ;
- quatre relais versionnés ;
- refus d'une version vide ;
- scellage sans exécution ;
- export du kit ;
- absence d'automatisation fournisseur ;
- chrono obligatoire ;
- consentement import annulé ;
- consentement import confirmé ;
- exécution hors ligne ;
- gel avant holdout ;
- workspace temporaire retiré ;
- attribution utilisateur non attestée ;
- coût inconnu non nul ;
- run copiable ;
- tableau copiable ;
- Arcade incomplète à un run ;
- absence de gagnant ;
- absence de science ;
- Ledger proposé mais non contaminé ;
- responsive desktop ;
- responsive mobile ;
- nettoyage final.

## Rapport final

Le rapport doit commencer par :

1. verdict ;
2. identité exacte du candidat ;
3. nombre de P0/P1/P2 ;
4. différence entre :
   - preuve native technique ;
   - test source/fixture ;
   - vrai arrangement multi-IA ;
5. état final des runs locaux ;
6. état final du Ledger ;
7. état de publication.

Il doit répondre explicitement :

- OutilsIA a-t-il ouvert ou piloté un abonnement ? OUI/NON.
- Le plan a-t-il lancé un agent ? OUI/NON.
- Le dossier final a-t-il été choisi par l'utilisateur ? OUI/NON.
- Une confirmation native a-t-elle précédé l'exécution ? OUI/NON.
- L'évaluation a-t-elle utilisé un réseau externe ? OUI/NON.
- L'artefact a-t-il été gelé avant le holdout ? OUI/NON.
- Le workspace temporaire a-t-il été supprimé ? OUI/NON.
- Le coût inconnu a-t-il été converti en zéro ? OUI/NON.
- L'auteur de l'artefact est-il attesté ? OUI/NON.
- Un vainqueur universel est-il déclaré ? OUI/NON.
- Une supériorité scientifique est-elle revendiquée ? OUI/NON.
- Le run de référence est-il présenté comme terrain ? OUI/NON.
- Une release publique a-t-elle été modifiée ? OUI/NON.

Le verdict attendu d'une candidate saine est :

`GO_PRIVATE_STACK_ARENA_CANDIDATE`

avec :

- vraie équipe multi-IA : `NOT_RUN_EXPECTED` tant que le propriétaire n'a pas
  effectué lui-même les relais ;
- validation native technique : `PASS` ;
- tableau six-runs de démonstration : `PASS_SOURCE_FIXTURE` ;
- publication stable : `NO_GO` sans décision séparée, signature et tests
  terrain.
