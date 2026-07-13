# Notice d'utilisation - Workstacks et preuves OutilsIA

Version de la notice : 2026-07-13
Périmètre : OutilsIA Local Cockpit, mode **Détails**

## Rôle de chaque module

| Module | Rôle | Ce qu'il ne fait pas |
|---|---|---|
| Board Observer | Lire un board Planka et repérer les cartes prêtes, bloquées ou incomplètes. | Aucun commentaire, déplacement de carte ou lancement d'agent. |
| Workstack Composer | Transformer une carte prête en plan borné avec rôles, budget, permissions et gate humaine. | Aucune exécution, création de worktree, fusion ou publication. |
| Capability Router | Détecter les CLI et modèles locaux disponibles, puis proposer un planificateur, un exécutant et un vérificateur distinct. | Ne lit pas les jetons, ne vérifie pas les quotas et ne transmet pas la mission aux agents. |
| Evidence Ledger | Conserver une trace locale chaînée des étapes validées et de leurs empreintes. | Ne stocke ni description brute, prompt, réponse de modèle, credential ou fichier projet. Il ne prouve pas à lui seul la qualité du résultat. |
| ForgeBench | Préparer un protocole équitable `Signal Maze v1`, publier un contrat de gameplay observable, vérifier une référence clavier/souris/tactile, sceller localement des seeds privés, tester bubblewrap, exécuter un pilote technique, puis appeler facultativement un modèle Ollama local sur le seul contrat public. | La référence visible est jouée, mais le code produit par le modèle n'est pas exécuté. Aucun gameplay candidat, test caché, score scientifique ou vainqueur n'est validé. Aucun CLI Codex, Claude ou Hermes n'est encore lancé. |
| Workstack Arena | **Prévu après ForgeBench.** Exécuter une Workstack approuvée dans des espaces isolés et remettre le résultat en revue humaine. | Aucune exécution implicite, aucun partage de worktree entre workers et aucune fusion automatique. |
| MemoryForge / Obsidian | Conserver les décisions, bilans et connaissances durables du projet. | Ne reçoit pas tous les logs, prompts ou sorties brutes du Ledger. |
| Strategy Arena | Exploiter les capacités IA locales préparées par OutilsIA pour les workflows quant, puis compiler et backtester. | OutilsIA ne génère pas de stratégie financière et ne lance pas de backtest. |

## Parcours disponible aujourd'hui

1. Passer l'application en mode **Détails**.
2. Dans **Board Observer**, renseigner l'URL HTTPS de Planka, l'identifiant du board et une clé API éphémère.
3. Cliquer sur **Observer**. La clé est effacée du formulaire après la lecture.
4. Sur une carte `Ready for Agent`, cliquer sur **Préparer**.
5. Dans **Workstack Composer**, choisir la priorité et compiler le plan.
6. Vérifier les blocages, les permissions et la gate humaine.
7. Dans **Capability Router**, choisir le type de mission puis cliquer sur **Détecter et proposer**.
8. Contrôler les exécutants détectés, les versions et l'indépendance du vérificateur.
9. Dans **ForgeBench Lab**, utiliser facultativement **Sceller 5 seeds privés**. Le reçu ne contient ni seed, ni identifiant de check privé, ni chemin du vault.
10. Choisir le niveau de preuve, le nombre de seeds publics et au moins deux stacks candidates.
11. Cliquer sur **Préparer l'expérience**, puis vérifier que chaque stack reçoit la même empreinte de protocole.
12. Lire séparément les readiness exploratoire et scientifique. Une suite locale scellée reste non scientifique tant que les workers ne sont pas isolés du dossier applicatif et que l'évaluateur n'est pas indépendant.
13. Dans **Espaces worker frais**, cliquer sur **Préparer les espaces**. OutilsIA crée un workspace distinct pour chaque combinaison stack × seed public, hors du dépôt source, et revérifie le starter embarqué.
14. Contrôler le reçu : nombre de workspaces, empreinte du starter et mention explicite qu'aucun worker n'a été lancé.
15. Dans **Préflight isolation**, cliquer sur **Tester l'isolation**. Le canari utilise bubblewrap sous Linux ou WSL, sans agent, credential, dépôt source ou contenu de la suite cachée.
16. Si le canari passe, vérifier les quatre namespaces, l'écriture dans le seul workspace et la racine hôte masquée.
17. Dans **Pilote d'exécution**, cliquer sur **Lancer le pilote** puis confirmer le périmètre : worker déterministe sans IA, réseau, API payante ou suite cachée.
18. Contrôler que le worker de référence et l'évaluateur visible séparé sont vérifiés, que la soumission a été montée en lecture seule et que le workspace temporaire a été supprimé.
19. Pour tester un modèle local, cocher **Modèle Ollama local**, choisir un modèle déjà installé remonté par Capability Router, puis recréer l'expérience et les workspaces afin de signer cette identité exacte.
20. Rejouer le préflight isolation et le pilote de référence sur ce batch. Le candidat local ne peut pas réutiliser une ancienne preuve ou un autre backend.
21. Dans **Candidat Ollama local**, choisir un budget de 3, 5 ou 10 minutes, puis confirmer le second consentement. Il autorise uniquement le modèle local, l'API Ollama de boucle locale et une tentative ; Internet, API payante, suite cachée et exécution du code généré restent interdits.
22. Contrôler le résultat : génération locale terminée, trois fichiers matérialisés, topologie exacte, API du contrat visible présente et sept groupes de checks statiques dans un processus séparé. Ce résultat ne signifie pas que le jeu fonctionne.
23. Dans **Evidence Ledger**, sélectionner chaque étape disponible, notamment **Pilote ForgeBench vérifié** puis **Candidat Ollama vérifié**, et cliquer sur **Ajouter la preuve**.
24. Exporter le JSON du Ledger avant une réinitialisation ou un transfert de machine.

Le parcours s'arrête ici. Un modèle Ollama local peut produire une soumission structurelle, mais aucun fichier généré n'est exécuté. Codex, Claude, Hermes et les autres agents CLI ne sont pas lancés ; aucun test caché, score comparatif ou vainqueur n'existe à ce stade.

## Ce que prouve l'Evidence Ledger

Une entrée du Ledger prouve localement que :

- le document source respectait son contrat au moment de l'ajout ;
- son empreinte SHA-256 a été enregistrée ;
- l'entrée est reliée à la précédente par son empreinte ;
- aucune exécution n'avait commencé pour les étapes de préparation ;
- pour `isolated_reference_run` uniquement, un worker technique déterministe a réellement été exécuté après consentement, puis vérifié par un second processus isolé ;
- pour `isolated_local_model_candidate`, le modèle Ollama identifié a réellement répondu après un second consentement, puis sa soumission a passé sept contrôles statiques dans un processus isolé ;
- seuls les claims minimaux et métriques prévus ont été conservés.

Le Ledger refuse :

- un Workstack modifié après signature ;
- un résultat Capability Router qui aurait lancé une tâche ;
- un worker identique au vérificateur indépendant ;
- un type d'événement qui ne correspond pas au schéma source ;
- une chaîne locale altérée ;
- le même document source ajouté deux fois sous le même type d'événement.

Le Ledger **ne prouve pas** :

- que Codex, Claude ou Hermes est connecté à un compte ;
- qu'un quota ou abonnement est disponible ;
- que le code produit par le candidat local a été exécuté ou que la tâche fonctionne ;
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
9. `isolated_local_model_candidate` : modèle Ollama installé appelé sur la seule tâche publique, sortie brute non conservée et soumission vérifiée structurellement par sept groupes de checks statiques, dont la présence du contrat visible. Ce niveau ne prouve ni gameplay, qualité, science ou victoire.
10. `human_decision` : **prévu**, acceptation, rejet ou demande de correction par le propriétaire humain.

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

Cette preuve est une **preuve de la référence visible uniquement**. Le contrat porte explicitement `candidate_execution_enabled_by_this_contract=false`. Une soumission Ollama peut déclarer les mêmes API et passer les contrôles statiques sans que son JavaScript ait été exécuté ; `gameplay_verified=false` reste donc obligatoire.

Le starter public de `Signal Maze v1` est scellé par un manifeste de fichiers et une empreinte SHA-256. Le vault peut maintenant générer cinq seeds privés et cinq familles de checks dans `forgebench-hidden-suite-v1.json`, sous le dossier applicatif Tauri. L'interface reçoit seulement un reçu signé avec identifiant, compteurs et empreinte.

Le vault utilise les permissions du compte système mais **n'est pas chiffré au repos**. Aucun agent n'étant encore lancé, les données restent hors des Workstacks v0 ; toutefois un futur worker ne sera considéré comme aveugle à la suite qu'après mise en place d'une vraie sandbox d'exécution et d'un évaluateur isolé. Jusque-là, `scientific_ready` reste faux.

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

### Candidat Ollama local

Le contrat `outilsia.forgebench_ollama_candidate_result.v1` ajoute un adaptateur local borné, distinct du pilote. L'expérience signe l'identifiant exact `local-model:ollama_native:<modèle>` ou `local-model:ollama_wsl:<modèle>`. Le modèle doit déjà être installé dans ce runtime ; ForgeBench ne lance aucun téléchargement implicite.

Après consentement, OutilsIA interroge uniquement l'API Ollama sur `127.0.0.1`, ou cette même boucle locale depuis WSL. Le modèle reçoit la spécification publique, le starter public et un seed public. Il ne reçoit ni chemin, dépôt, fichier utilisateur, outil, credential, suite privée ou accès Internet. Une seule tentative est permise, avec durée et taille de réponse bornées et coût API maximal de 0 €.

La réponse JSON doit contenir exactement `index.html`, `styles.css` et `game.js`. L'hôte les écrit dans une copie fraîche, refuse toute autre topologie ou ressource externe, puis un second processus bubblewrap monte la soumission en lecture seule et effectue sept groupes de contrôles statiques. Les marqueurs de l'API visible, du snapshot et du DOM sont exigés, sans les exécuter. La réponse brute et les fichiers temporaires sont supprimés avant le retour ; seul un reçu signé avec métriques et empreintes peut rejoindre l'Evidence Ledger.

Le code généré n'est volontairement **pas exécuté** dans ce palier. Le résultat conserve obligatoirement `gameplay_verified=false`, `hidden_evaluator_verified=false`, `scientific_eligible=false` et `winner_declared=false`. Le coût API est réellement nul ; la consommation électrique locale reste inconnue, jamais transformée en zéro.

Le score équilibré futur reste explicite : `50 % résultat + 20 % efficacité + 15 % vitesse + 15 % coût`. Un coût inconnu n'est jamais transformé en zéro. Le score composite, les podiums par dimension, la frontière de Pareto et un éventuel vainqueur restent absents tant que des runs complets et comparables n'existent pas.

## Confidentialité et coûts

- Les clés Planka restent éphémères et ne sont jamais placées dans le Ledger.
- Le Capability Router exécute uniquement des commandes locales de version bornées.
- Le statut d'authentification et les quotas des CLI restent `not_inspected`.
- Les modèles Ollama proviennent du scan local déjà effectué.
- Aucun appel API payant n'est déclenché par Composer, Router, ForgeBench ou Ledger.
- Le pilote technique exige un consentement distinct et impose réseau coupé, API payante interdite et CLI candidat interdit.
- Le candidat Ollama exige un second consentement et un budget explicite. Seule la boucle locale Ollama est ouverte ; aucun fichier généré n'est exécuté.
- Une future exécution de CLI candidat exigera encore un contrat, un consentement et un budget séparés.

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
- `outilsia.forgebench_reference_pilot_request.v1`
- `outilsia.forgebench_reference_pilot_result.v1`
- `outilsia.forgebench_ollama_candidate_request.v1`
- `outilsia.forgebench_ollama_candidate_result.v1`
- `outilsia.forgebench_experiment.v1`
- `outilsia.forgebench_compile_result.v1`
- `outilsia.evidence_entry.v1`
- `outilsia.evidence_ledger.v1`

Cette notice doit évoluer dans le même commit que tout changement de responsabilité, de sécurité, de stockage ou d'exécution de ces modules.
