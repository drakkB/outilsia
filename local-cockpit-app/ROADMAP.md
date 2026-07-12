# OutilsIA Local Cockpit - Roadmap produit

Mise à jour : 2026-07-12

## Cap produit

OutilsIA doit devenir la couche de décision de l'IA locale : savoir ce qu'une machine peut réellement exécuter, dans quelles conditions, pour quel usage et avec quel niveau de confiance.

L'application reste centrée sur le diagnostic, l'installation consentie, la mesure, la comparaison, la recommandation et la preuve. Elle ne devient pas un chat généraliste et ne réalise pas les backtests de Strategy Arena.

## Maintenant - Hardware Doctor 2.0 et AI Capability Passport v1

- Enrichir les preuves GPU : allocation VRAM Ollama, offload GPU/CPU, PCIe, ReBAR quand le système l'expose, température, charge et puissance comme instantané clairement daté.
- Séparer les faits mesurés, les estimations et les données inconnues.
- Relier le diagnostic aux benchmarks automatiques et CPU pour prouver ou non l'accélération.
- Exporter un passeport JSON portable : machine, runtimes, modèles, benchmarks, Recommendation Engine, limites, confidentialité et frontière Strategy Arena.
- Ajouter une empreinte SHA-256 couvrant le document hors bloc d'intégrité. Cette empreinte détecte une modification ; elle ne constitue pas une signature d'identité.
- Garder le passeport dans le mode Détails pour ne pas encombrer le parcours Essentiel.

État au 11 juillet 2026 : Hardware Truth v1 est publié avec Hardware Doctor, Passport, Autopilot, Flight Recorder et Digital Twin dans le build Windows/Linux `291439601671`, issu du commit `6f5453d` et du run CI `29143960167`. Les cinq artefacts et leurs SHA-256 ont été revérifiés depuis la production ; le monitor SEO/GEO passe `33/33`. L'override conserve la parité Windows/Linux avant les essais : terrain toujours `0/5`, prochaine cible `old_laptop`, aucune revendication de validation physique.

- [x] Sondes NVIDIA : VRAM utilisée, P-state, PCIe et ReBAR seulement quand explicitement exposé.
- [x] Preuve d'offload Ollama `/api/ps` : CPU, hybride ou GPU, avec état « non prouvé » en absence de mesure.
- [x] Hardware Doctor v2 propagé aux rapports, PDF, MemoryForge et fiches terrain.
- [x] AI Capability Passport v1 : génération, copie, téléchargement et invalidation après nouvelle mesure.
- [x] SHA-256 canonique vérifié, test de falsification et avertissement « pas une signature d'identité ».
- [x] Résumé Passport dans le rapport, MemoryForge, le pont Strategy Arena et le terrain, sans rendre le terrain artificiellement dépendant du passeport.
- [x] Pages SEO/GEO, FAQ structurées, `llms.txt`, README et monitoring mis à jour.
- [x] Construire et publier le nouveau build Windows/Linux, puis vérifier les cinq artefacts publics et leurs SHA-256.
- [x] Enrichir le kit terrain avec Doctor 2.0, preuve d'allocation Ollama et Passport facultatif, sans modifier les huit preuves bloquantes.
- [x] Hardware Truth : conserver GPU et VRAM comme inconnus quand les sondes échouent, sans fabriquer un état CPU-only/0 Go.
- [x] Hardware Truth : publier le nombre de modules et la fréquence RAM sans déduire single/dual/quad-channel du seul nombre de barrettes.
- [x] Linux sans privilèges : lire carte mère et BIOS via `/sys/class/dmi/id`, puis enrichir avec `dmidecode` seulement s'il est disponible.
- [x] Publier le build Windows/Linux contenant Hardware Truth v1 avant les essais physiques.
- [ ] Confirmer l'offload réel sur les machines physiques de la campagne terrain.

## Candidat validé - Runtime & Driver Intelligence v1

État au 12 juillet 2026 : Runtime & Driver Intelligence est inclus avec Tests privés, Local Capability Bridge et Install Safety Preflight dans le candidat cross-platform le plus récent `291904395671`, commit `655281d`, run GitHub Actions `29190439567` terminé avec succès. Le build public reste `291439601671` et ne revendique pas encore ces capacités. Les cinq artefacts candidats et leurs SHA-256 ont été vérifiés hors production ; le terrain reste `0/5`.

- [x] Créer une matrice canonique versionnée, datée et sourcée pour NVIDIA, AMD, Intel, Apple et CPU.
- [x] Séparer pilote détecté, API signalée, support Ollama documenté et preuve réelle `/api/ps`.
- [x] Cadrer Pascal/GTX 10 : compute 6.x, CUDA toolkit 12.x maximum, dernière branche pilote R580 ; ne jamais conseiller CUDA 13.
- [x] Séparer Strix Halo Windows (Vulkan Ollama expérimental, support framework ROCm distinct) et Linux (ROCm sur matériel listé).
- [x] Ajouter Intel Arc/iGPU avec Vulkan expérimental, page Intel officielle et avertissement pilote OEM.
- [x] Distinguer CUDA, ROCm/HIP, Vulkan, Metal, CPU et DirectML ; DirectML n'est pas présenté comme backend Ollama.
- [x] Sonder métadonnées pilote Windows, pilote noyau Linux, chargeur Vulkan et pont GPU WSL `/dev/dxg` quand ils sont exposés.
- [x] Refuser le faux `4 Go VRAM` produit par le plafond 32 bits de `Win32_VideoController` ; conserver la VRAM inconnue.
- [x] Propager le verdict dans Hardware Doctor, Passport, rapport, MemoryForge, terrain, Flight Recorder et pont Strategy Arena en lecture seule.
- [x] Corriger le parcours CPU-only : aucun bouton « corriger le pilote » sans accélérateur attendu et preuve suffisante.
- [x] Garder l'action pilote manuelle et consentie : page officielle uniquement, aucune élévation ou installation silencieuse.
- [x] Ajouter fixtures Pascal, RTX, Radeon, Strix Halo Windows/Linux, Intel Arc et CPU-only, plus tests Rust Windows natifs.
- [x] Valider le build Linux dans CI et le build Windows complet avec les nouvelles sondes.
- [ ] Vérifier physiquement GTX 1080 Ti, AMD/Strix Halo et Intel Arc ; les fixtures ne constituent pas une preuve terrain.
- [ ] Publier Windows/Linux et annoncer la fonction sur le site uniquement après toutes les gates et SHA-256 verts.
- [ ] Envisager plus tard un installateur de pilote borné seulement si URL artefact, signature/hash, préflight, consentement, restauration et rollback sont tous prouvés ; sinon conserver le mode manuel officiel.

## Candidat validé - Install Safety Preflight v1

Objectif au 12 juillet 2026 : vérifier le runtime et le volume réellement ciblés avant tout `ollama pull`, sans exposer le chemin personnel du dossier de modèles et sans confondre stockage Windows, WSL et Linux.

État au 12 juillet 2026 : le candidat Windows/Linux `291904395671`, commit `655281d`, run cross-platform `29190439567`, contient les cinq artefacts attendus. Les workflows autonomes Windows `29190387884` et Linux `29190387879` sont verts ; contrat, tailles et SHA-256 sont vérifiés. Les installateurs Windows restent `NotSigned`. La fonction n'est pas déployée en production et ne constitue pas encore une preuve physique native/WSL.

- [x] Sonder le volume du dossier Ollama natif par défaut ou personnalisé sans exporter son chemin.
- [x] Sonder séparément le stockage de la distribution WSL par défaut.
- [x] Estimer une taille haute et ajouter une réserve distincte.
- [x] Bloquer avant le premier octet uniquement lorsque l'insuffisance est mesurée.
- [x] Demander confirmation quand la taille ou le volume restent inconnus.
- [x] Propager un résumé borné au rapport et au AI Capability Passport 1.3.0.
- [x] Ajouter tests Rust, recette Playwright et contrôle anti-fuite de chemin.
- [x] Construire et vérifier un candidat Windows/Linux avant toute revendication publique.
- [ ] Confirmer les sondes native et WSL sur les machines physiques.

## Phase 1 - Preuve terrain fiable

- Collecter les cinq profils physiques sans fabriquer de preuve.
- Couvrir ancien Core i7/GTX 1080 Ti, vieux portable, CPU-only, RTX 3060 12 Go et RTX 4080/4090.
- Publier des rapports terrain réels et transformer chaque bug en test de non-régression.

## Phase 2 - Model Autopilot

- Tester quantification, contexte, couches GPU, threads, batch et runtime.
- Conserver des profils Rapide, Équilibré et Qualité avec retour arrière.
- Recommander une configuration reproductible, pas seulement un nom de modèle.
- Borner chaque campagne par un budget de temps, de disque et de téléchargements accepté par l'utilisateur.
- Ne jamais remplacer une configuration qui fonctionne sans comparaison mesurée et possibilité de restaurer le profil précédent.

Premier jalon publié au 10 juillet 2026 dans le build public `291204755461` : campagne bornée sur un modèle déjà installé. La quantification, les couches GPU et la comparaison multi-runtime restent des phases ultérieures après validation terrain.

- [x] Comparer trois profils Rapide, Équilibré et Qualité / contexte sur le même modèle.
- [x] Borner côté Rust `num_ctx`, `num_batch` et `num_thread`.
- [x] Refuser le repli CLI estimatif pour une campagne réglée.
- [x] Exiger un clic avant la campagne et un second clic avant application.
- [x] Interdire tout téléchargement dans ce premier jalon.
- [x] Persister le profil par machine, runtime et modèle, avec restauration du profil précédent ou des valeurs Ollama par défaut.
- [x] Propager le profil au benchmark, au dialogue, au rapport, à MemoryForge, au Passport, au terrain et au pont Strategy Arena en lecture seule.
- [ ] Confirmer les trois profils sur les machines physiques avant d'élargir aux couches GPU, quantifications et runtimes concurrents.

## Phase 3 - Tests personnels privés

- Permettre un pack local Code, Français, Obsidian, résumé ou métier.
- Exécuter exactement les mêmes tâches sur les candidats sans envoyer les fichiers au cloud.
- Distinguer critères déterministes et éventuel jugement local optionnel.

Premier jalon candidat v1 terminé le 12 juillet 2026. La fonction reste dans le mode Détails et n'est pas encore incluse dans le build public `291439601671`. Le candidat Windows/Linux `291887472771`, commit `6b5187e`, run `29188747277`, contient les cinq artefacts attendus et passe le contrat de release renforcé. Les workflows autonomes Windows `29188569395` et Linux `29188569378` passent aussi avec des contrôles source fail-fast.

- [x] Créer cinq packs versionnés : Code, Français, résumé, Mémoire / Obsidian et métier personnalisé.
- [x] Limiter une campagne à une tâche, 2 à 3 modèles déjà installés, 60 secondes par modèle et zéro téléchargement.
- [x] Appliquer exactement la même consigne et les mêmes critères déterministes à chaque candidat.
- [x] Éviter les doubles candidatures par alias Ollama d'un même modèle.
- [x] Persister uniquement scores, checks, métriques et empreintes SHA-256 ; ne jamais persister la consigne personnalisée ou les réponses brutes.
- [x] Propager une preuve bornée au rapport, PDF, MemoryForge et AI Capability Passport 1.3.0 sans contenu privé brut.
- [x] Ajouter une recette Playwright desktop/mobile qui injecte un marqueur secret et échoue s'il apparaît dans un export.
- [x] Documenter la fonction dans les sources du hub, de la page téléchargement, de `llms.txt` et du monitoring SEO/GEO.
- [x] Construire le candidat Windows/Linux avec Private Workload Packs v1 et vérifier les cinq artefacts/SHA-256.
- [ ] Publier la fonction et les pages uniquement dans une release cohérente ; ne pas la présenter comme preuve terrain physique.
- [ ] Confirmer les packs sur les machines physiques et ajuster seulement les critères qui échouent réellement.
- [ ] Étudier un jugement local optionnel plus tard ; la v1 reste déterministe et n'appelle aucun juge cloud.

## Phase 4 - Flight Recorder

- Détecter les régressions après changement de pilote, Ollama, modèle ou configuration.
- Comparer les performances, l'offload et les thermiques avec l'état précédent.
- Expliquer la cause probable sans présenter une corrélation comme une certitude.

Premier jalon v1 publié le 10 juillet 2026 dans le build Windows/Linux `291204755461` : référence locale explicite par machine et modèle, comparaison stricte des conditions, historique restaurable et export JSON/Markdown. Le build provient du commit `ca27835` et du run CI `29120475546` ; ses cinq artefacts et leurs SHA-256 ont été vérifiés en production.

- [x] Enregistrer une référence seulement après benchmark Ollama API réussi et action explicite.
- [x] Lier chaque capture à la machine, au build, au modèle, au runtime, au protocole, au prompt et au profil Autopilot.
- [x] Comparer génération, préremplissage, chargement, offload GPU et température avec seuils documentés.
- [x] Suspendre le verdict si machine, modèle, runtime, mode CPU/GPU, prompt, protocole ou réglage diffèrent.
- [x] Séparer faits modifiés, causes possibles et causalité non démontrée.
- [x] Conserver plusieurs références locales, réactiver une référence précédente et exporter JSON/Markdown.
- [x] Propager un résumé borné vers rapport, MemoryForge, Passport, terrain et Strategy Arena en lecture seule.
- [x] Garantir que Flight Recorder ne fabrique jamais de preuve terrain physique.
- [x] Valider puis publier le build Windows/Linux contenant Flight Recorder v1.
- [x] Documenter l'override de publication utilisé uniquement pour conserver la parité Windows/Linux : terrain toujours `0/5`, prochaine cible `old_laptop`, aucune revendication de validation physique.
- [ ] Confirmer les seuils sur les cinq machines physiques et les recaler seulement à partir de mesures réelles.

## Phase 5 - Upgrade Digital Twin

- Simuler RAM, GPU, VRAM, SSD, alimentation, boîtier et compatibilité carte mère.
- Afficher modèles débloqués, gain attendu, coût, consommation et niveau de confiance.
- Préserver la décision « n'achetez rien » lorsque la preuve locale est déjà suffisante.

Premier jalon v1 publié le 11 juillet 2026 dans le build Windows/Linux `291337881421`, issu du commit `59b43c7` et du run CI `29133788142`. Les cinq artefacts, leurs tailles et SHA-256 ont été revérifiés depuis la production ; le monitor SEO/GEO passe `33/33`. L'override de publication conserve uniquement la parité Windows/Linux : terrain toujours `0/5`, prochaine cible `old_laptop`, aucune revendication de validation physique.

- [x] Construire un instantané local depuis Hardware Doctor et le Capability Passport : RAM/type/modules/emplacements, carte mère/BIOS, GPU/PCIe/driver/puissance, stockage et runtimes.
- [x] Comparer des scénarios RAM, GPU/VRAM, SSD, alimentation, longueur de carte et refroidissement sans modifier la machine.
- [x] Vérifier les contraintes connues et conserver `unknown` quand les connecteurs, dimensions, emplacements M.2 ou limites physiques ne sont pas mesurables.
- [x] Séparer provenance mesurée, catalogue, déclaration utilisateur et estimation ; afficher fourchettes de coût non temps réel et niveau de confiance.
- [x] Calculer les modèles/usages potentiellement débloqués et conserver les verdicts bloqué, à mesurer, candidat et « n'achetez rien pour l'instant ».
- [x] Sauvegarder/restaurer plusieurs scénarios localement et exporter JSON, Markdown et PDF.
- [x] Propager un résumé borné au rapport, à MemoryForge, au Passport, au terrain et à Strategy Arena en lecture seule.
- [x] Garantir qu'un scénario Digital Twin reste `simulation_only`, `local_only` et ne constitue jamais une preuve terrain physique.
- [x] Ajouter les tests Rust, contrat catalogue et recette Playwright desktop/mobile.
- [x] Documenter la fonction sur le hub, la page de téléchargement, `llms.txt`, le README et le monitoring SEO/GEO.
- [x] Publier le build Windows/Linux uniquement après toutes les gates vertes et vérifier les artefacts/SHA-256 en production.
- [ ] Recaler coûts, consommation et contraintes seulement à partir de sources officielles ou de mesures terrain réelles.

## Phase 6 - Interopérabilité locale

- Stabiliser le AI Capability Passport comme contrat en lecture seule.
- Exposer plus tard un MCP/API local borné : profil machine, modèles, preuves et recommandation.
- Laisser Strategy Arena consommer les capacités préparées par OutilsIA sans lui transférer la gestion Ollama.

Premier jalon candidat v1 terminé le 12 juillet 2026 dans le build Windows/Linux `291887472771`, commit `6b5187e`, run `29188747277`. La passerelle n'est pas encore revendiquée dans le build public `291439601671` et ne constitue pas une preuve terrain.

- [x] Servir un instantané figé du Passport sur `127.0.0.1` uniquement.
- [x] Désactiver la passerelle par défaut et exiger un consentement explicite pour 15 minutes.
- [x] Générer un jeton Bearer aléatoire de 256 bits, conservé uniquement en mémoire et absent des exports.
- [x] Limiter le contrat à GET/OPTIONS et refuser installation, suppression, benchmark, chat, fichiers, configuration, backtests et trading.
- [x] Fermer CORS à Strategy Arena et aux origines loopback de développement.
- [x] Exposer santé, capacités, Passport, modèles et handoff Strategy Arena sans contenu brut.
- [x] Arrêter automatiquement la passerelle si le Passport devient périmé.
- [x] Ajouter tests Rust réseau et recette Playwright desktop/mobile avec contrôle anti-fuite du jeton.
- [x] Construire un candidat Windows/Linux et vérifier les cinq artefacts, le manifeste et les SHA-256 avant toute communication publique.
- [ ] Ajouter le consommateur côté Strategy Arena dans une session séparée, sans déplacer la gestion Ollama.
- [ ] Étudier MCP local seulement après stabilisation de ce contrat HTTP minimal.

## Phase 7 - Workstack Composer

- Composer une chaîne de travail par capacités : planification, recherche, code, design, critique et validation.
- Distinguer six voies : modèles locaux, agents CLI officiels connectés au compte utilisateur, API gratuites, API facturées à l'usage, interfaces web gratuites et abonnements web.
- Détecter Codex CLI, Claude Code ou d'autres agents officiels dans Windows, WSL et Linux sans lire leurs jetons ni convertir un abonnement en pseudo-API.
- Isoler chaque agent dans un worktree ou dossier distinct ; aucun agent parallèle ne modifie le même espace de travail et toute fusion passe par une validation humaine.
- Distinguer quota d'abonnement, crédits supplémentaires et facturation API ; ne jamais activer un basculement payant sans consentement explicite.
- Automatiser uniquement les connecteurs officiels ; produire des paquets de transfert manuels pour les interfaces sans API.
- Utiliser un graphe borné avec schémas d'entrée/sortie, budget, confidentialité, limite de boucles et validations humaines.
- Choisir les exécutants par capacité et preuve plutôt que figer un nom ou une version de modèle.
- Garder les clés API dans le coffre système et les exclure des rapports, Passport, MemoryForge et pont local.
- Livrer d'abord Composer v0 sans exécution, puis Local v1 sur modèles Ollama installés, puis Hybrid v2 optionnel.
- Conserver un Evidence Ledger : auteur, critique, validation, coût, latence, empreinte et décision humaine.
- Ne pas déplacer les backtests ou la logique financière de Strategy Arena dans ce module.

### Coordination par board

Noyau et panneau Détails Board Observer v0 implémentés le 12 juillet 2026, sans publication : commande Tauri Planka en lecture seule, contrat versionné, HTTPS obligatoire hors loopback, redirections refusées, clé API gardée en mémoire puis effacée, snapshot filtré, cinq tests Rust dont un serveur HTTP local et recette Playwright desktop/mobile. Les écritures, commentaires, webhooks et exécutions restent absents.

- Créditer le travail Planka + Hermes Kanban de Supersocks comme inspiration conceptuelle, sans copier son texte, son dépôt ou son interface.
- Définir un contrat générique `board_adapter.v1` ; Planka reste un service externe facultatif et ne devient pas une dépendance embarquée.
- Traiter chaque carte comme un contrat de travail : objectif, contexte, périmètre, permissions, interdits, critères d'acceptation, vérifications et dernière décision humaine.
- Utiliser une machine d'état stricte : inbox, ready, in progress, blocked, review required, done et archived.
- Synchroniser par webhook avec une réconciliation périodique, des clés d'idempotence et une identité stable de tâche ; ne jamais faire confiance aux webhooks seuls.
- Commencer par un Board Observer en lecture seule avant tout commentaire, déplacement ou création de carte depuis OutilsIA.
- Conserver les preuves opérationnelles dans l'Evidence Ledger et projeter uniquement décisions, bilans et trajectoire durable vers MemoryForge/Obsidian.
- Vérifier la licence et les droits d'intégration de chaque board avant distribution, hébergement ou revente.

### Workstack Arena et ForgeBench

Workstack Composer v0 implémenté dans les sources le 12 juillet 2026 : une carte normalisée produit un plan `outilsia.workstack.v1` déterministe et signé, avec priorité, rôles, budget, blocages et gate humaine. Le contexte optionnel est remplacé par son empreinte ; aucune exécution, création de worktree, écriture board, fusion ou publication n'est disponible.

Capability Router v0 implémenté dans les sources le 12 juillet 2026, sans publication : il valide l'empreinte du Workstack, sonde en parallèle et avec timeout Codex CLI, Claude Code et Hermes Agent dans l'environnement natif et le WSL par défaut, ajoute les modèles Ollama déjà remontés par le scan, puis propose Planificateur, Exécutant et Vérificateur indépendant selon leurs capacités déclarées. Il ne lit aucun jeton, ne vérifie ni compte ni quota, ne scanne aucun dépôt, ne lance aucun agent et ne dépense aucun crédit API. Le résultat `outilsia.capability_router_result.v1` est signé, étiqueté dry-run et invalidé après un nouveau scan, une installation ou une suppression de modèle.

- [x] Détecter les CLI officielles par commande de version bornée, sans retourner leur chemin.
- [x] Distinguer Windows natif, Linux natif, WSL par défaut, Ollama natif et Ollama WSL.
- [x] Router par capacités et type de mission sans verrouiller la proposition sur une marque.
- [x] Imposer un vérificateur différent de l'exécutant lorsqu'une proposition complète est possible.
- [x] Garder le panneau dans le mode Détails et fournir JSON, résumé et preuve visuelle desktop/mobile.
- [ ] Ajouter un consentement d'exécution séparé seulement après ForgeBench, Evidence Ledger et isolation par worktree.

Evidence Ledger v0 implémenté dans les sources le 12 juillet 2026, sans publication : le fichier local `evidence-ledger-v1.json` accepte volontairement les preuves Board Observer, Workstack Composer et Capability Router après validation de leur contrat. Chaque entrée contient uniquement auteur composant, claims bornés, métriques, empreinte source et empreinte précédente. La chaîne complète est revalidée à chaque lecture et écriture, les doublons sont refusés, une rotation de secours protège le remplacement du fichier et aucun contenu brut n'est persisté. Le Ledger ne transforme pas une empreinte en preuve d'identité ou de qualité et ne lance aucune exécution.

- [x] Chaîner les entrées `outilsia.evidence_entry.v1` et signer le document `outilsia.evidence_ledger.v1`.
- [x] Refuser Workstack modifiée, Router exécutable, worker identique au vérificateur et identifiants non bornés.
- [x] Tester écriture/lecture réelle, restauration vérifiée, corruption, doublon et absence de contenu brut.
- [x] Ajouter les actions explicites Ajouter, Vérifier, Copier, Télécharger et Réinitialiser dans le mode Détails.
- [x] Maintenir la notice canonique `NOTICE-UTILISATION-WORKSTACK.md` et vérifier ses responsabilités en CI.
- [ ] Ajouter `isolated_run_evidence`, `independent_verification` et `human_decision` seulement avec ForgeBench et Workstack Arena.

- Séparer quatre responsabilités : Composer définit la chaîne, Workstack Arena exécute, ForgeBench évalue et Evidence Ledger conserve la preuve.
- Créer le benchmark maison `Signal Maze v1` avec règles déterministes, starter scellé, tests visibles/cachés et captures desktop/Android.
- Mesurer séparément résultat, vitesse, efficacité et coût ; toujours publier les valeurs brutes, les sous-scores et le caractère estimé ou inconnu d'une donnée.
- Utiliser comme score équilibré initial `50 % résultat + 20 % efficacité + 15 % vitesse + 15 % coût`, sans masquer les podiums par dimension ni la frontière de Pareto.
- Comparer d'abord trois stacks : Codex CLI seul, Claude Code seul et Hermes planification -> Codex construction -> Claude audit.
- Exiger un worktree et une session neufs par worker, un évaluateur indépendant, des versions datées et au moins trois seeds pour tout résultat présenté comme scientifique.
- Invalider ou pénaliser les runs qui changent les règles, retirent des tests, élargissent les permissions ou reçoivent une aide non enregistrée.
- Étendre ensuite ForgeBench aux pistes maintenance et évolution afin d'éviter un classement dépendant d'un seul mini-jeu.

## Phase 8 - Réseau et communauté opt-in

- Découvrir plusieurs machines OutilsIA sur un réseau privé et router vers la capacité disponible.
- Collecter uniquement sur consentement des benchmarks anonymisés et vérifiables.
- Recaler les estimations d'upgrade et produire des pages SEO/GEO depuis des mesures réelles.

## Garde-fous permanents

- Aucun téléchargement, installation, suppression, synchronisation ou publication sans action explicite.
- Aucun score matériel ne doit masquer un runtime GPU non prouvé.
- Toute estimation doit être étiquetée et accompagnée de sa source ou de sa limite.
- Aucune preuve terrain physique ne peut être créée depuis une fixture ou une machine différente.
- OutilsIA prépare les modèles locaux ; Strategy Arena compile, backteste et valide les stratégies.
