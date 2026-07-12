# Notice d'utilisation - Workstacks et preuves OutilsIA

Version de la notice : 2026-07-12  
Périmètre : OutilsIA Local Cockpit, mode **Détails**

## Rôle de chaque module

| Module | Rôle | Ce qu'il ne fait pas |
|---|---|---|
| Board Observer | Lire un board Planka et repérer les cartes prêtes, bloquées ou incomplètes. | Aucun commentaire, déplacement de carte ou lancement d'agent. |
| Workstack Composer | Transformer une carte prête en plan borné avec rôles, budget, permissions et gate humaine. | Aucune exécution, création de worktree, fusion ou publication. |
| Capability Router | Détecter les CLI et modèles locaux disponibles, puis proposer un planificateur, un exécutant et un vérificateur distinct. | Ne lit pas les jetons, ne vérifie pas les quotas et ne transmet pas la mission aux agents. |
| Evidence Ledger | Conserver une trace locale chaînée des étapes validées et de leurs empreintes. | Ne stocke ni description brute, prompt, réponse de modèle, credential ou fichier projet. Il ne prouve pas à lui seul la qualité du résultat. |
| ForgeBench | Préparer un protocole équitable `Signal Maze v1`, sceller localement des seeds privés, matérialiser un espace worker frais par stack et seed, puis tester la disponibilité d'une isolation bubblewrap par canari borné. | Le v0 ne lance aucun agent ou test caché, ne calcule aucun score et ne déclare aucun vainqueur. Un canari réussi ne signifie pas qu'un worker a déjà été exécuté dans la sandbox. |
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
16. Si le canari passe, vérifier les quatre namespaces, l'écriture dans le seul workspace et la racine hôte masquée. Le runner worker et l'évaluateur restent néanmoins bloqués.
17. Dans **Evidence Ledger**, sélectionner chaque étape disponible, y compris le préflight ForgeBench, puis cliquer sur **Ajouter la preuve**.
18. Exporter le JSON du Ledger avant une réinitialisation ou un transfert de machine.

Le parcours s'arrête ici. Aucun agent n'est lancé dans cette version.

## Ce que prouve l'Evidence Ledger

Une entrée du Ledger prouve localement que :

- le document source respectait son contrat au moment de l'ajout ;
- son empreinte SHA-256 a été enregistrée ;
- l'entrée est reliée à la précédente par son empreinte ;
- aucune exécution n'avait commencé pour les étapes v0 ;
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
- qu'un agent a réellement exécuté ou réussi la tâche ;
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
7. `isolated_run_evidence` : **prévu**, résultat d'une exécution worker réellement isolée avec versions, durée et coût.
8. `independent_verification` : **prévu**, critères relancés par un vérificateur différent du worker.
9. `human_decision` : **prévu**, acceptation, rejet ou demande de correction par le propriétaire humain.

## Ce que prépare ForgeBench

ForgeBench v0 compile `outilsia.forgebench_experiment.v1`. Chaque stack sélectionnée reçoit :

- la même mission et les mêmes contraintes ;
- un environnement propre ;
- les mêmes tests visibles ;
- au moins trois seeds pour une affirmation scientifique ;
- une politique future de mesures séparées de résultat, vitesse, efficacité et coût ;
- un évaluateur indépendant ;
- une empreinte de protocole identique et exportable.

Le starter public de `Signal Maze v1` est scellé par un manifeste de fichiers et une empreinte SHA-256. Le vault peut maintenant générer cinq seeds privés et cinq familles de checks dans `forgebench-hidden-suite-v1.json`, sous le dossier applicatif Tauri. L'interface reçoit seulement un reçu signé avec identifiant, compteurs et empreinte.

Le vault utilise les permissions du compte système mais **n'est pas chiffré au repos**. Aucun agent n'étant encore lancé, les données restent hors des Workstacks v0 ; toutefois un futur worker ne sera considéré comme aveugle à la suite qu'après mise en place d'une vraie sandbox d'exécution et d'un évaluateur isolé. Jusque-là, `scientific_ready` reste faux.

### Espaces worker frais

Après un préflight prêt, ForgeBench peut matérialiser un batch sous le dossier applicatif Tauri. Il contient un workspace distinct pour chaque stack disponible et chaque seed public sélectionné. Chaque workspace reçoit uniquement les trois fichiers du starter public et un contrat de run public signé. Le manifeste interne relie chaque espace à l'empreinte exacte de l'expérience et du protocole.

Le reçu `outilsia.forgebench_worker_sandbox_receipt.v1` expose seulement les compteurs et empreintes. Il ne renvoie aucun chemin local, seed caché, credential ou chemin du dépôt source. Une vérification relit chaque workspace, refuse un fichier supplémentaire ou un lien symbolique, recalcule le starter et le contrat public, puis compare l'empreinte du batch.

Ce palier prouve la **préparation de workspaces frais**, pas l'exécution isolée. Le processus worker n'est pas lancé, le réseau n'est pas isolé et un processus du même compte système pourrait encore atteindre le vault. `worker_execution_ready` et `scientific_eligible` restent donc faux.

### Préflight isolation

Le contrat `outilsia.forgebench_isolation_probe_result.v1` exécute uniquement un canari local borné. Sous Linux, il cherche bubblewrap nativement. Sous Windows, le backend admissible est bubblewrap dans la distribution WSL par défaut ; Windows natif n'est pas déclaré isolé sans backend dédié vérifié.

Le canari crée des namespaces utilisateur, montage, réseau et processus distincts, monte seulement le workspace de test en écriture, masque la racine hôte et vérifie une sortie déterministe. Il ne tente aucune requête Internet. Le résultat expose uniquement des booléens, une version de backend, des codes de blocage et une empreinte SHA-256 : aucun chemin local ou identifiant de namespace n'est renvoyé.

Ce préflight prouve une **capacité d'isolation disponible au moment du test**. Il ne prouve pas qu'un futur CLI worker a été lancé avec le même plan de montage. `worker_execution_ready=false` et `scientific_eligible=false` restent obligatoires tant que le runner, le consentement, le budget et l'évaluateur isolé ne sont pas implémentés.

Le score équilibré futur reste explicite : `50 % résultat + 20 % efficacité + 15 % vitesse + 15 % coût`. Un coût inconnu n'est jamais transformé en zéro. Le score composite, les podiums par dimension, la frontière de Pareto et un éventuel vainqueur restent absents tant que des runs complets et comparables n'existent pas.

## Confidentialité et coûts

- Les clés Planka restent éphémères et ne sont jamais placées dans le Ledger.
- Le Capability Router exécute uniquement des commandes locales de version bornées.
- Le statut d'authentification et les quotas des CLI restent `not_inspected`.
- Les modèles Ollama proviennent du scan local déjà effectué.
- Aucun appel API payant n'est déclenché par Composer, Router, ForgeBench ou Ledger.
- Un futur passage à l'exécution exigera un consentement distinct et un budget explicite.

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
- `outilsia.forgebench_score_policy.v1`
- `outilsia.forgebench_hidden_suite.v1`
- `outilsia.forgebench_hidden_suite_receipt.v1`
- `outilsia.forgebench_worker_run_contract.v1`
- `outilsia.forgebench_worker_sandbox_receipt.v1`
- `outilsia.forgebench_worker_sandbox_status.v1`
- `outilsia.forgebench_isolation_probe_request.v1`
- `outilsia.forgebench_isolation_probe_result.v1`
- `outilsia.forgebench_experiment.v1`
- `outilsia.forgebench_compile_result.v1`
- `outilsia.evidence_entry.v1`
- `outilsia.evidence_ledger.v1`

Cette notice doit évoluer dans le même commit que tout changement de responsabilité, de sécurité, de stockage ou d'exécution de ces modules.
