# Notice d'utilisation - Workstacks et preuves OutilsIA

Version de la notice : 2026-07-24
Périmètre : OutilsIA Local Cockpit, espace **Atelier IA**

## Navigation du cockpit

L'application conserve le matériel détecté en tête de fenêtre, puis répartit le travail dans sept espaces. Changer d'espace ne relance aucune opération et ne vide aucun formulaire.

| Espace | Usage principal |
|---|---|
| Accueil | Lire le verdict, le modèle conseillé, la preuve locale et la prochaine action. |
| Machine | Examiner Hardware Doctor, le runtime, les upgrades, le Digital Twin et la fiche terrain. |
| Modèles | Voir les modèles compatibles ou installés, agir immédiatement, puis déplier Force/Usage/Limite si nécessaire. |
| Tests | Lancer benchmark, Arena, tests privés, Autopilot, Flight Recorder et consulter la console technique. |
| Assistant | Dialoguer localement, optimiser les prompts et conserver MemoryForge. |
| Atelier IA | Composer d'abord une Workstack, router les capacités, exécuter ForgeBench et chaîner les preuves. |
| Compte | Connecter et sauvegarder d'abord la machine, puis partager, signaler un problème et retrouver l'historique. |

Les actions transversales ouvrent automatiquement l'espace correspondant. Par exemple, **Bench** ouvre Tests, **Dialogue** ouvre Assistant et **Préparer** depuis Board Observer ouvre Atelier IA. Le menu **Section** mène directement au module choisi dans l'espace actif.

## Rôle de chaque module

| Module | Rôle | Ce qu'il ne fait pas |
|---|---|---|
| Board Observer | Lire un board Planka et repérer les cartes prêtes, bloquées ou incomplètes. | Aucun commentaire, déplacement de carte ou lancement d'agent. |
| Workstack Composer | Transformer une carte prête en plan borné avec rôles, budget, permissions et gate humaine. | Aucune exécution, création de worktree, fusion ou publication. |
| Capability Router | Détecter les CLI et modèles locaux disponibles, puis proposer un planificateur, un exécutant et un vérificateur distinct. | Ne lit pas les jetons, ne vérifie pas les quotas et ne transmet pas la mission aux agents. |
| Agent Adapter Policy | Afficher le contrat signé propre à Codex CLI, Claude Code et Hermes Agent : état d'exécution, consentements, budget et interdits. | Le registre n'autorise et ne lance aucun run. Codex reste borné à Signal Maze public ; Claude Code et Hermes restent en détection seule. |
| Evidence Ledger | Conserver une trace locale chaînée des étapes validées et de leurs empreintes. | Ne stocke ni description brute, prompt, réponse de modèle, credential ou fichier projet. Il ne prouve pas à lui seul la qualité du résultat. |
| ForgeBench | Préparer un protocole équitable `Signal Maze v1`, publier un contrat de gameplay observable, vérifier une référence clavier/souris/tactile, sceller localement des seeds privés, tester bubblewrap puis Chromium sans réseau, exécuter un pilote technique, puis appeler facultativement un modèle Ollama local sur le seul contrat public. | Le préflight Chromium n'installe rien : il teste une page minimale et propose au besoin une commande Playwright à copier. Après consentement, le code candidat est gelé, contrôlé publiquement puis soumis à un second Chromium holdout sans réseau. Cette preuve locale ne vaut encore ni score scientifique ni vainqueur : familles de checks publiques, vault non chiffré, pairs et énergie restent des blocages. ForgeBench ne lance pas seul un agent CLI. |
| Workstack Arena | Dans le candidat source, lancer **Codex CLI uniquement sur Signal Maze public** dans un workspace jetable, avec un seul essai borné, puis enregistrer une décision humaine structurée sur le reçu signé. | Aucun projet utilisateur, board, test caché, fusion ou publication. La revue n'inspecte ni capture ni code et n'autorise ni livraison ni gagnant. Claude Code, Hermes et l'exécution d'une carte arbitraire restent indisponibles. Le build public actuel ne contient pas encore ce pilote. |
| MemoryForge / Obsidian | Conserver les décisions, bilans et connaissances durables du projet. | Ne reçoit pas tous les logs, prompts ou sorties brutes du Ledger. |
| Strategy Arena | Exploiter les capacités IA locales préparées par OutilsIA pour les workflows quant, puis compiler et backtester. | OutilsIA ne génère pas de stratégie financière et ne lance pas de backtest. |

## Parcours disponible aujourd'hui

1. Ouvrir l'espace **Atelier IA**. La première section, **Composer le plan**, indique qu'une carte est nécessaire.
2. Cliquer sur **Choisir une carte** pour ouvrir **Board Observer**, puis renseigner l'URL HTTPS de Planka, l'identifiant du board et une clé API éphémère.
3. Cliquer sur **Observer**. La clé est effacée du formulaire après la lecture.
4. Sur une carte `Ready for Agent`, cliquer sur **Préparer**.
5. Dans **Workstack Composer**, choisir la priorité et compiler le plan.
6. Vérifier les blocages, les permissions et la gate humaine.
7. Dans **Capability Router**, choisir le type de mission puis cliquer sur **Détecter et proposer**.
8. Contrôler les exécutants détectés, les versions et l'indépendance du vérificateur.

**Contrôle recommandé :** déplier **Ce qui peut réellement s'exécuter** sous le Router. Le registre `outilsia.agent_adapter_policy_catalog.v1` doit annoncer un seul pilote borné, Codex CLI sur `Signal Maze v1`, et deux adaptateurs en détection seule, Claude Code et Hermes Agent. Le registre ne sonde aucun compte, quota, credential, dépôt ou board et ne vaut jamais consentement de run.

9. Dans **ForgeBench Lab**, utiliser facultativement **Sceller 5 seeds privés**. Le reçu ne contient ni seed, ni identifiant de check privé, ni chemin du vault.
10. Choisir le niveau de preuve, le nombre de seeds publics et au moins deux stacks candidates.
11. Cliquer sur **Préparer l'expérience**, puis vérifier que chaque stack reçoit la même empreinte de protocole.
12. Lire séparément les readiness exploratoire et scientifique. Une suite locale scellée permet le holdout Ollama borné, mais reste non scientifique tant que les familles de checks sont publiques, que le vault du même compte n'est pas durci et que pairs et énergie manquent.
13. Dans **Espaces worker frais**, cliquer sur **Préparer les espaces**. OutilsIA crée un workspace distinct pour chaque combinaison stack × seed public, hors du dépôt source, et revérifie le starter embarqué.
14. Contrôler le reçu : nombre de workspaces, empreinte du starter et mention explicite qu'aucun worker n'a été lancé.
15. Dans **Préflight isolation**, cliquer sur **Tester l'isolation**. Le canari utilise bubblewrap sous Linux ou WSL, sans agent, credential, dépôt source ou contenu de la suite cachée.
16. Si le canari passe, vérifier les quatre namespaces, l'écriture dans le seul workspace et la racine hôte masquée.
17. Dans **Chromium isolé**, cliquer sur **Vérifier Chromium**. OutilsIA lance seulement une page minimale sans réseau. Aucun worker, dépôt ou secret n'est transmis.
18. Si Chromium manque et qu'un outil Playwright est détecté, **Copier la commande** puis l'exécuter volontairement dans le terminal Linux/WSL. OutilsIA ne la lance jamais, n'élève aucun droit et ne télécharge rien pendant le préflight.
19. Dans **Pilote d'exécution**, cliquer sur **Lancer le pilote** puis confirmer le périmètre : worker déterministe sans IA, réseau, API payante ou suite cachée.
20. Contrôler que le worker de référence et l'évaluateur visible séparé sont vérifiés, que la soumission a été montée en lecture seule et que le workspace temporaire a été supprimé.
21. Pour tester un modèle local, cocher **Modèle Ollama local**, choisir un modèle déjà installé remonté par Capability Router, puis recréer l'expérience et les workspaces afin de signer cette identité exacte.
22. Rejouer le préflight isolation, le test Chromium et le pilote de référence sur ce batch. Le candidat local ne peut pas réutiliser une ancienne preuve ou un autre backend.
23. Dans **Candidat Ollama local**, choisir un budget de 3, 5 ou 10 minutes, puis confirmer le second consentement. Il autorise uniquement le modèle local, l'API Ollama de boucle locale, une tentative et le holdout après gel du code. Le modèle ne reçoit jamais le vault ; les deux évaluateurs Chromium restent sans réseau.
24. Contrôler le résultat : génération locale terminée, trois fichiers matérialisés, topologie exacte, API visible présente, sept groupes de checks statiques, 39 contrôles de gameplay visibles, puis cinq familles de holdout dans un second Chromium. Le reçu doit indiquer que les seeds étaient absents du prompt, que le vault n'a pas été monté et qu'aucune observation privée n'est sortie. Il doit aussi refuser score scientifique et vainqueur.
25. Pour le pilote Codex du candidat source, recréer le routage et l'expérience avec le candidat Codex exact et la stack `codex-solo`, puis revérifier workspaces, isolation, Chromium et pilote de référence. Une preuve produite avec une autre identité est refusée.
26. Ouvrir **Lancer le pilote**, sélectionner le Codex CLI détecté et choisir un budget de 3, 5 ou 10 minutes. Un seul essai est autorisé et la sortie combinée est limitée à 512 Kio.
27. Cocher séparément l'autorisation d'utiliser la connexion et le quota ou coût du CLI, puis l'autorisation d'écrire et d'exécuter le mini-jeu dans le workspace jetable. Ces consentements ne valent que pour ce run.
28. Lancer le pilote. Codex reçoit la spécification, le starter et le contrat visible publics sur l'entrée standard. OutilsIA ne lui transmet et ne monte ni dépôt utilisateur, board, suite cachée ou credential. Le mode `workspace-write` appartient toutefois à la sandbox du fournisseur : OutilsIA ne prétend pas auditer indépendamment toute la portée de lecture du processus hôte.
29. Contrôler le reçu : CLI réellement invoqué, un essai, trois fichiers bornés, `7/7` contrôles statiques, `39/39` contrôles Chromium, workspace supprimé, coût ou quota **inconnu**, aucun gagnant et revue humaine obligatoire.
30. Ouvrir **Revue humaine du reçu**. Choisir **Accepter pour comparaison**, **Demander une correction** ou **Rejeter ce run**, puis lire les deux accusés obligatoires : la décision porte seulement sur le reçu public signé et n'autorise aucun nouveau run, livraison, gagnant, board, merge ou publication.
31. Enregistrer la décision. Le résultat signé ne conserve ni texte libre, capture, code, sortie CLI brute ou credential ; une correction recommande un nouveau run explicite mais ne le démarre pas. Une décision effacée avant ajout peut être remplacée, mais l'Evidence Ledger n'accepte qu'une revue par run.
32. Dans **Evidence Ledger**, sélectionner chaque étape disponible, notamment **Pilote ForgeBench vérifié**, **Candidat Ollama vérifié**, **Pilote Codex vérifié** ou **Revue humaine enregistrée**, puis cliquer sur **Ajouter la preuve**.
33. Exporter le JSON du Ledger avant une réinitialisation ou un transfert de machine.

Le parcours s'arrête ici. Un modèle Ollama local peut produire une soumission, passer la recette publique puis un holdout local borné après gel du code. Codex CLI reste limité à la recette publique, car sa portée de lecture hôte n'est pas vérifiée indépendamment. Le propriétaire peut qualifier le reçu pour une future comparaison, demander un nouveau run ou le rejeter, sans transformer cette décision en validation visuelle ou livraison. Claude Code, Hermes, les cartes arbitraires et les dépôts utilisateur ne sont pas exécutés. Aucun score comparatif ou vainqueur n'existe à ce stade.

## Ce que prouve l'Evidence Ledger

Une entrée du Ledger prouve localement que :

- le document source respectait son contrat au moment de l'ajout ;
- son empreinte SHA-256 a été enregistrée ;
- l'entrée est reliée à la précédente par son empreinte ;
- aucune exécution n'avait commencé pour les étapes de préparation ;
- pour `isolated_reference_run` uniquement, un worker technique déterministe a réellement été exécuté après consentement, puis vérifié par un second processus isolé ;
- pour `isolated_visible_and_hidden_holdout_candidate`, le modèle Ollama identifié a réellement répondu après un second consentement, puis sa soumission gelée a passé sept contrôles statiques, 39 contrôles publics et cinq familles de holdout dans des processus isolés ; le Ledger ne conserve aucun seed ou résultat privé détaillé ;
- pour `isolated_codex_visible_browser_pilot`, le Codex CLI identifié a réellement été invoqué une fois sur Signal Maze public, sa sortie bornée a été matérialisée dans un workspace jetable, puis la soumission a passé les mêmes sept contrôles statiques et 39 contrôles Chromium publics ;
- pour `explicit_local_human_review`, le propriétaire local a choisi une décision structurée sur l'empreinte exacte du reçu public, après avoir reconnu ses limites ; cette preuve ne signifie jamais que le code ou les captures ont été inspectés ;
- seuls les claims minimaux et métriques prévus ont été conservés.

Le Ledger refuse :

- un Workstack modifié après signature ;
- un résultat Capability Router qui aurait lancé une tâche ;
- un worker identique au vérificateur indépendant ;
- un type d'événement qui ne correspond pas au schéma source ;
- une chaîne locale altérée ;
- le même document source ajouté deux fois sous le même type d'événement ;
- une seconde décision humaine pour le même run Workstack Arena.

Le Ledger **ne prouve pas** :

- l'identité du compte Codex, Claude ou Hermes ;
- qu'un quota ou abonnement reste disponible, ou le coût monétaire exact d'un run CLI ;
- qu'un gameplay visible réussi garantit la qualité générale, les cas cachés ou une supériorité sur un autre candidat ;
- que la machine appartient à une personne précise ;
- qu'un benchmark terrain a été réalisé sur une machine physique distincte ;
- qu'une sortie est correcte sans vérification indépendante.

## Niveaux de preuve

1. `remote_response_digest` : réponse externe observée et condensée, sans contenu brut conservé.
2. `signed_local_plan` : Workstack locale signée et non exécutable.
3. `signed_dry_run_proposal` : proposition de routage signée, sans lancement d'agent.
4. `signed_benchmark_preflight` : expérience ForgeBench signée, mêmes règles pour chaque stack et aucune exécution commencée.
5. `signed_workspace_batch` : batch local signé, starter vérifié et espace frais par stack × seed, sans exécution ni isolation OS revendiquée.
6. `signed_isolation_preflight` : canari bubblewrap signé prouvant la disponibilité de namespaces séparés et d'un montage minimal, sans worker lancé.
7. `isolated_reference_run` : pilote technique réellement isolé, sans IA candidate, avec durée, coût API nul et sortie brute non conservée.
8. `independent_visible_verification` : vérification dans un second processus isolé, soumission en lecture seule et six contrôles visibles. Les tests cachés restent absents.
9. `isolated_visible_and_hidden_holdout_candidate` : modèle Ollama installé appelé sur la seule tâche publique, sortie brute non conservée, sept checks statiques, 39 checks publics Chromium puis cinq familles de holdout sur des seeds injectés seulement après gel du code. Seuls compteurs et empreintes sortent du second évaluateur. Ce niveau prouve ce run borné, pas une qualité scientifique ou une victoire comparative.
10. `isolated_codex_visible_browser_pilot` : Codex CLI invoqué une fois sur la seule tâche Signal Maze publique, workspace jetable, sortie bornée, sept checks statiques et 39 checks Chromium publics. Le coût fournisseur reste inconnu et ce niveau ne vaut ni accès à un projet, ni test caché, ni victoire comparative.
11. `explicit_local_human_review` : acceptation pour comparaison, demande de correction ou rejet du reçu public signé par le propriétaire humain. Cette décision ne conserve pas de texte libre, ne prouve aucune inspection du code ou des captures et n'autorise jamais livraison, gagnant, board, fusion ou publication.

## Ce que prépare ForgeBench

ForgeBench v0 compile `outilsia.forgebench_experiment.v1`. Chaque stack sélectionnée reçoit :

- la même mission et les mêmes contraintes ;
- un environnement propre ;
- les mêmes tests visibles ;
- au moins trois seeds pour une affirmation scientifique ;
- une politique future de mesures séparées de résultat, vitesse, efficacité et coût ;
- un évaluateur indépendant ;
- une empreinte de protocole identique et exportable.

### Visible Gameplay Contract v1

Le fichier public `forgebench/signal-maze-v1/visible-contract.json` supprime les ambiguïtés du mini-jeu avant toute exécution candidate. Il fixe les dimensions, les huit transformations de coordonnées, la permutation des trois couleurs, la signature FNV-1a du plateau initial, les chemins valides, les collisions, le snapshot `signal-maze-visible-snapshot.v1`, l'API `__SIGNAL_MAZE_VISIBLE_API__` et les IDs DOM observables.

L'implémentation `reference/` est scellée par `reference-manifest.json`. La recette `verify-forgebench-visible-gameplay.py` la joue sur les trois seeds publics, vérifie victoire et reset, exerce clavier, souris et événements tactiles, puis contrôle desktop, Android portrait/paysage et l'absence de requête externe.

Cette recette autonome est une **preuve de la référence visible uniquement**. Le contrat porte explicitement `candidate_execution_enabled_by_this_contract=false` : lire ou importer le contrat ne suffit jamais à autoriser du code candidat. Lors d'un run Ollama distinct et explicitement consenti, ForgeBench vérifie d'abord la structure, puis exécute une copie éphémère instrumentée dans Chromium sous bubblewrap. `gameplay_verified=true` n'est admis que si les 39 contrôles publics réussissent. Le holdout distinct peut ensuite vérifier cinq familles privées ; score scientifique et vainqueur restent obligatoirement faux.

Le starter public de `Signal Maze v1` est scellé par un manifeste de fichiers et une empreinte SHA-256. Le vault peut maintenant générer cinq seeds privés et cinq familles de checks dans `forgebench-hidden-suite-v1.json`, sous le dossier applicatif Tauri. L'interface reçoit seulement un reçu signé avec identifiant, compteurs et empreinte.

Le vault utilise les permissions du compte système mais **n'est pas chiffré au repos**. Pour Ollama v3, le modèle termine sa réponse et les fichiers sont gelés avant lecture du vault. Un évaluateur Chromium séparé reçoit ensuite uniquement les seeds comme entrées runtime ; le fichier du vault n'est jamais monté et seules les preuves agrégées sortent. Les familles de checks restent toutefois lisibles dans le code et un processus compromis du même compte pourrait lire le vault : `scientific_ready` reste donc faux.

### Espaces worker frais

Après un préflight prêt, ForgeBench peut matérialiser un batch sous le dossier applicatif Tauri. Il contient un workspace distinct pour chaque stack disponible et chaque seed public sélectionné. Chaque workspace reçoit uniquement les trois fichiers du starter public et un contrat de run public signé. Le manifeste interne relie chaque espace à l'empreinte exacte de l'expérience et du protocole.

Le reçu `outilsia.forgebench_worker_sandbox_receipt.v1` expose seulement les compteurs et empreintes. Il ne renvoie aucun chemin local, seed caché, credential ou chemin du dépôt source. Une vérification relit chaque workspace, refuse un fichier supplémentaire ou un lien symbolique, recalcule le starter et le contrat public, puis compare l'empreinte du batch.

Ce palier prouve la **préparation de workspaces frais**, pas l'exécution isolée. Le processus worker n'est pas lancé, le réseau n'est pas isolé et un processus du même compte système pourrait encore atteindre le vault. `worker_execution_ready` et `scientific_eligible` restent donc faux.

### Préflight isolation

Le contrat `outilsia.forgebench_isolation_probe_result.v1` exécute uniquement un canari local borné. Sous Linux, il cherche bubblewrap nativement. Sous Windows, le backend admissible est bubblewrap dans la distribution WSL par défaut ; Windows natif n'est pas déclaré isolé sans backend dédié vérifié.

Le canari crée des namespaces utilisateur, montage, réseau et processus distincts, monte seulement le workspace de test en écriture, masque la racine hôte et vérifie une sortie déterministe. Il ne tente aucune requête Internet. Le résultat expose uniquement des booléens, une version de backend, des codes de blocage et une empreinte SHA-256 : aucun chemin local ou identifiant de namespace n'est renvoyé.

Ce préflight prouve une **capacité d'isolation disponible au moment du test**. Il ne prouve pas à lui seul qu'un worker a utilisé ce backend.

### Pilote d'exécution isolé

Le contrat `outilsia.forgebench_reference_pilot_result.v1` exige un consentement séparé. Le runner copie un workspace déjà vérifié dans un dossier temporaire neuf, lance un worker déterministe de référence sous bubblewrap puis démarre un second processus bubblewrap. Ce dernier monte la soumission en lecture seule, refuse toute ressource externe, vérifie la topologie des fichiers et recalcule une empreinte indépendante.

Le worker ne reçoit ni dépôt source, credential, suite cachée ou accès réseau. L'évaluateur visible ne reçoit pas le vault et ne peut pas écrire dans la soumission. Les sorties brutes et chemins restent hors du résultat ; le dossier temporaire doit être supprimé avant qu'une preuve soit retournée.

Ce pilote ferme la boucle technique **copie fraîche → worker isolé → évaluateur séparé → preuve bornée**. Le pilote lui-même ne lance aucune stack candidate, n'évalue pas la qualité du mini-jeu et ne mesure pas encore le coût réel d'un abonnement ou d'une API. `candidate_worker_execution_ready=false` et `scientific_eligible=false` restent donc obligatoires dans son contrat.

### Candidat Ollama local, navigateur visible et holdout

Le contrat `outilsia.forgebench_ollama_candidate_result.v3` ajoute un adaptateur local borné, distinct du pilote. L'expérience signe l'identifiant exact `local-model:ollama_native:<modèle>` ou `local-model:ollama_wsl:<modèle>`. Le modèle doit déjà être installé dans ce runtime ; ForgeBench ne lance aucun téléchargement implicite.

Après consentement, OutilsIA interroge uniquement l'API Ollama sur `127.0.0.1`, ou cette même boucle locale depuis WSL. Le modèle reçoit la spécification publique, le starter public et un seed public. Il ne reçoit ni chemin, dépôt, fichier utilisateur, outil, credential, suite privée ou accès Internet. Une seule tentative est permise, avec durée et taille de réponse bornées et coût API maximal de 0 €.

La réponse JSON doit contenir exactement `index.html`, `styles.css` et `game.js`. L'hôte les écrit dans une copie fraîche, refuse toute autre topologie ou ressource externe, puis un second processus bubblewrap monte la soumission en lecture seule et effectue sept groupes de contrôles statiques. Les marqueurs de l'API visible, du snapshot et du DOM sont exigés avant toute exécution.

Après un préflight Chromium réussi et un consentement qui autorise explicitement le code généré, un troisième processus bubblewrap monte encore la soumission originale en lecture seule. Il crée uniquement dans le dossier d'évaluation une copie instrumentée éphémère, lance Chromium headless sans réseau et applique le contrat visible public sur trois seeds et trois viewports : desktop 1440 x 900, Android portrait 390 x 844 et Android paysage 844 x 390. Clavier, souris et tactile font partie des 39 groupes de contrôles. Trois captures PNG bornées sont vérifiées ; seules leurs dimensions, tailles et empreintes SHA-256 rejoignent le résultat. Les images, le DOM, la réponse brute, les chemins et le workspace sont supprimés avant le retour.

Une fois le code gelé et les contrôles visibles réussis, ForgeBench lit le reçu courant du vault, vérifie qu'il correspond exactement au protocole compilé, puis lance un **second** processus bubblewrap/Chromium. Les cinq seeds deviennent des entrées runtime de cinq familles : bornes et déterminisme, collisions de chemins, pureté du reset, résilience mobile et refus d'entrées invalides. Le vault n'est pas monté. Le DOM, les captures, les observations, les seeds et les identifiants privés ne sortent pas ; seuls compteurs, durée, empreinte de soumission et attestation sont signés.

Ce palier peut donc attester `generated_code_executed=true`, `visible_browser_execution_verified=true`, `gameplay_verified=true` et `hidden_evaluator_verified=true` pour **ce run signé**. Il ne constitue pas encore un benchmark scientifique : les familles de checks sont publiques dans les sources, le vault n'est ni chiffré ni isolé d'un autre processus du même utilisateur, aucun pair comparable n'a tourné et l'énergie locale n'est pas mesurée. `scientific_eligible=false` et `winner_declared=false` restent obligatoires. Le coût API est réellement nul ; la consommation électrique locale reste inconnue, jamais transformée en zéro.

Le score équilibré futur reste explicite : `50 % résultat + 20 % efficacité + 15 % vitesse + 15 % coût`. Un coût inconnu n'est jamais transformé en zéro. Le score composite, les podiums par dimension, la frontière de Pareto et un éventuel vainqueur restent absents tant que des runs complets et comparables n'existent pas.

### Pilote Workstack Arena Codex CLI

Le candidat source ajoute les contrats `outilsia.workstack_arena_run_request.v1` et `outilsia.workstack_arena_run_result.v1`. Ce premier adaptateur n'exécute pas encore une Workstack générale : il accepte uniquement le benchmark public `signal-maze-v1`, la stack exacte `codex-solo` et le candidat routé `codex-cli` natif ou WSL. Toute extension de consentement, propriété inconnue, identité divergente ou référence amont modifiée bloque le run.

Codex est lancé en session éphémère, avec le mode fournisseur `workspace-write`, dans une copie temporaire du workspace ForgeBench vérifié. La consigne passe par l'entrée standard et ne contient aucun chemin, board ou contexte projet. Les règles utilisateur sont ignorées pour stabiliser le protocole et l'environnement enfant est reconstruit depuis une allowlist système minimale : clés API, tokens GitHub/AWS et socket SSH ne sont pas transmis. Le dossier d'authentification Codex reste accessible au CLI selon sa configuration. OutilsIA ne monte et ne transmet pas le dépôt source, mais ne transforme pas le nom de la sandbox du fournisseur en preuve indépendante d'isolation de lecture de l'hôte. La durée est limitée aux budgets proposés de 3, 5 ou 10 minutes, une seule tentative est permise et un dépassement de 512 Kio de sortie termine le processus.

La réponse brute du CLI n'entre jamais dans le résultat ou le Ledger. OutilsIA vérifie seulement les trois fichiers attendus, leurs tailles et empreintes, puis réutilise exactement l'évaluateur statique `7/7` et le contrôleur Chromium visible `39/39`. Le workspace temporaire doit être supprimé avant le retour. Le reçu conserve durée, octets bornés, hashes, vérifications et statut de coût `vendor_cli_quota_or_cost_unknown`.

Ce palier démontre qu'un worker CLI réel peut participer à une expérience publique traçable. Il ne démontre ni l'accès sûr à un dépôt utilisateur, ni la capacité à traiter une carte Planka, ni l'indépendance d'un audit multi-agent, ni la qualité cachée, ni un coût exact. Toute livraison ou déclaration de gagnant reste bloquée par `review_required_before_any_winner_or_delivery`.

### Revue humaine du reçu signé

Les contrats `outilsia.workstack_human_review_request.v1` et `outilsia.workstack_human_review_result.v1` lient une décision locale à l'empreinte exacte d'un résultat Workstack Arena valide. Les trois choix sont bornés : accepter le reçu pour une future comparaison, recommander un nouveau run corrigé ou rejeter ce run. Aucun champ libre n'est accepté et le Ledger refuse une seconde décision sur le même run.

Cette gate ne voit que le reçu public signé. Les captures, le DOM, les trois fichiers et la sortie brute ont déjà été supprimés ; `artifact_visual_inspected=false` et `artifact_quality_approved=false` restent donc obligatoires. Quelle que soit la décision, `delivery_authorized`, `winner_authorized`, `board_write_authorized`, `merge_authorized` et `publish_authorized` restent faux. Une demande de correction ne relance aucun worker : elle indique seulement qu'un nouveau run explicite est recommandé.

## Confidentialité et coûts

- Les clés Planka restent éphémères et ne sont jamais placées dans le Ledger.
- Le Capability Router exécute uniquement des commandes locales de version bornées.
- Le statut d'authentification et les quotas des CLI restent `not_inspected`.
- Les modèles Ollama proviennent du scan local déjà effectué.
- Aucun appel API payant n'est déclenché par Composer, Router, ForgeBench ou Ledger.
- Le pilote technique exige un consentement distinct et impose réseau coupé, API payante interdite et CLI candidat interdit.
- Le préflight Chromium lance uniquement une page minimale sous Bubblewrap. Une éventuelle commande d'installation est copiée, jamais exécutée par OutilsIA ; son réseau et son élévation restent sous le contrôle explicite de l'utilisateur.
- Le candidat Ollama exige un second consentement et un budget explicite. Seule la boucle locale Ollama est ouverte pendant la génération ; le code gelé est exécuté après contrôle statique dans un Chromium visible, puis dans un second Chromium holdout, tous deux sous bubblewrap sans réseau. Le vault n'est pas monté et aucune observation privée n'est conservée.
- Le pilote Codex exige deux consentements par run, un budget borné et une stack Signal Maze exacte. Il ignore les règles utilisateur et filtre l'environnement enfant par allowlist, sans transmettre les clés API tierces. La connexion, le quota et la facturation appartiennent au CLI utilisateur et restent non inspectés ; aucun coût inconnu n'est converti en zéro.
- La revue humaine exige deux accusés explicites, ne stocke aucun commentaire libre et ne peut ni relancer un worker ni élargir les permissions du run.
- Tout autre CLI candidat, toute carte arbitraire et tout accès à un dépôt exigeront un nouveau contrat de permissions, un consentement et un budget séparés.

## Export et réinitialisation

Le fichier persistant se trouve dans le dossier applicatif Tauri sous le nom `evidence-ledger-v1.json`. L'interface n'affiche pas son chemin pour éviter d'exposer des informations système inutiles.

- **Copier JSON** : place le Ledger vérifié dans le presse-papiers.
- **Télécharger** : crée une copie portable nommée avec l'identifiant du Ledger.
- **Vérifier la chaîne** : relit le fichier local et refuse toute incohérence.
- **Réinitialiser** : supprime volontairement le journal local après confirmation. Cette action ne peut pas être annulée sans export préalable.

## Contrats actuels

- `outilsia.board_observer_result.v1`
- `outilsia.board_snapshot.v1`
- `outilsia.workstack.v1`
- `outilsia.capability_router_result.v1`
- `outilsia.capability_routing.v1`
- `outilsia.forgebench_benchmark.v1`
- `outilsia.forgebench_visible_gameplay_contract.v1`
- `outilsia.forgebench_visible_reference_manifest.v1`
- `outilsia.forgebench_score_policy.v1`
- `outilsia.forgebench_hidden_suite.v1`
- `outilsia.forgebench_hidden_suite_receipt.v1`
- `outilsia.forgebench_worker_run_contract.v1`
- `outilsia.forgebench_worker_sandbox_receipt.v1`
- `outilsia.forgebench_worker_sandbox_status.v1`
- `outilsia.forgebench_isolation_probe_request.v1`
- `outilsia.forgebench_isolation_probe_result.v1`
- `outilsia.forgebench_runtime_probe_request.v1`
- `outilsia.forgebench_runtime_probe_result.v1`
- `outilsia.forgebench_reference_pilot_request.v1`
- `outilsia.forgebench_reference_pilot_result.v1`
- `outilsia.forgebench_ollama_candidate_request.v3`
- `outilsia.forgebench_ollama_candidate_result.v3`
- `outilsia.workstack_arena_run_request.v1`
- `outilsia.workstack_arena_run_result.v1`
- `outilsia.workstack_human_review_request.v1`
- `outilsia.workstack_human_review_result.v1`
- `outilsia.forgebench_experiment.v1`
- `outilsia.forgebench_compile_result.v1`
- `outilsia.evidence_entry.v1`
- `outilsia.evidence_ledger.v1`

Cette notice doit évoluer dans le même commit que tout changement de responsabilité, de sécurité, de stockage ou d'exécution de ces modules.
