# OutilsIA Local Cockpit - Roadmap produit

Mise à jour : 2026-07-14

## Cap produit

OutilsIA doit devenir la couche de décision de l'IA locale : savoir ce qu'une machine peut réellement exécuter, dans quelles conditions, pour quel usage et avec quel niveau de confiance.

L'application reste centrée sur le diagnostic, l'installation consentie, la mesure, la comparaison, la recommandation et la preuve. Elle ne devient pas un chat généraliste et ne réalise pas les backtests de Strategy Arena.

## Livré dans les sources - Navigation par espaces

État au 14 juillet 2026 : l'ancienne page unique Essentiel/Détails est remplacée par sept espaces persistants : Accueil, Machine, Modèles, Tests, Assistant, Atelier IA et Compte. Le socle initial du commit `ff3ed59` a été enrichi par un lot UX nocturne qui traite les prérequis, les erreurs, la hiérarchie des modules et le mobile. Chaque espace ouvre maintenant un seul module à la fois, avec navigation précédent/suivant et une option **Toutes les sections**. Le candidat n'est pas encore déployé comme release publique.

- [x] Conserver le matériel détecté et l'action d'analyse au sommet de la fenêtre.
- [x] Attribuer chaque panneau à un ou plusieurs espaces sans changer ses identifiants ou son état.
- [x] Router automatiquement Dialogue vers Assistant, Bench vers Tests, Upgrade vers Machine et Workstack vers Atelier IA.
- [x] Ajouter un menu Section contextuel qui concentre l'écran sur un module, avec précédent, suivant et vue complète.
- [x] Donner toute la largeur disponible au module isolé par le menu Section, notamment au Benchmark.
- [x] Conserver les sept onglets sur une ligne défilable sur Android, recentrer l'onglet actif et prendre en charge les flèches, Début et Fin au clavier.
- [x] Conserver les formulaires et mémoriser l'espace actif entre deux ouvertures.
- [x] Réduire le pire cas focalisé mesuré de 18,1 à 1,9 hauteur d'écran sur desktop et de 36,5 à 3,2 sur mobile.
- [x] Ajouter une recette Playwright dédiée qui contrôle propriété des panneaux, routage, persistance, menu Section, clavier et débordements.
- [x] Remplacer le journal technique de l'Accueil par un Bilan machine : quatre preuves, trois actions utiles et détails avancés repliés.
- [x] Donner à chaque statut avancé un bouton de navigation exact ; `Choisir le meilleur modèle` ouvre `Tests > Choisir le meilleur modèle` et focalise le bouton de comparaison sans lancer de téléchargement.
- [x] Empêcher les panneaux Tests actifs de masquer une section Accueil choisie et compacter les onglets mobiles sur une seule ligne défilable.
- [x] Donner une identité visuelle sobre à chaque espace, transformer les états de panneau en badges et distinguer les commandes principales des exports secondaires.
- [x] Relier les prérequis Model Autopilot, Flight Recorder, Passerelle locale, Workstack Composer, Capability Router et ForgeBench à leur écran source sans exécution automatique.
- [x] Commencer les titres de modules par l'action compréhensible et conserver le nom technique en sous-titre pour les preuves et les exports.
- [x] Remplacer les états avant scan par un prérequis explicite et une commande **Analyser ce PC**, sans donnée avancée prématurée.
- [x] Transformer l'échec d'analyse en parcours de reprise visible, sans exposer de chemin personnel dans l'interface.
- [x] Replier les cinq étapes techniques de ForgeBench tout en gardant leur synthèse et leur état accessibles.
- [x] Garantir des cibles tactiles d'au moins 44 px, un focus clavier visible, des statuts mobiles non tronqués et un contraste lisible au survol.
- [x] Faire du Bilan machine la première vue Accueil et replier les preuves secondaires du choix de modèle et du Hardware Doctor.
- [x] Ouvrir Atelier IA sur Composer le plan, Compte sur la sauvegarde et placer les actions modèles avant Force/Usage/Limite.
- [x] Harmoniser l'état Compte connecté afin qu'aucun message résiduel ne demande encore de se connecter.
- [x] Migrer une seule fois les préférences héritées de l'ancienne page longue vers la première section de chaque espace, puis respecter les nouveaux choix persistants.
- [x] Remplacer le titre générique d'un Bilan incomplet par l'étape réellement manquante : Ollama, modèle test, benchmark, GPU ou confirmation du runtime.
- [x] Aligner la recette multi-machines sur la navigation par espaces, afficher les sept contrôles bloquants et refuser l'export d'une fiche terrain incomplète ou incohérente avec le matériel.
- [ ] Publier cette interface et la présenter sur le site seulement après validation manuelle du build candidat.

## Correctif validé dans les sources - Hermes, runtime et mémoire réelle

État au 13 juillet 2026 : les traces locales confirment `hermes3:8b` à 121,7 tok/s sur la RTX 4080 SUPER. L'échec observé concernait `nous-hermes2-mixtral:8x7b`, dont l'artefact Ollama Q4 pèse 26 Go et dépassait l'ancienne fenêtre de 45 secondes sur 16 Go VRAM. Le catalogue public a été corrigé, mais l'application candidate reste à valider manuellement avant publication.

- [x] Afficher les 16 Go réellement détectés dans le verdict terrain RTX 4080, sans texte générique « 12 Go ».
- [x] Distinguer explicitement Hermes 3 8B et Nous Hermes 2 Mixtral 8x7B dans les limites et prochaines actions.
- [x] Corriger les tailles catalogue Mixtral : 26 Go Q4, 50 Go Q8 et 93 Go FP16, avec source Ollama officielle.
- [x] Étendre à 120 secondes le benchmark du modèle 26 Go quand il doit utiliser l'offload RAM.
- [x] Afficher le runtime qui contient réellement les modèles : Windows, WSL ou mixte.
- [x] Empêcher Mixtral 8x7B de devenir le choix assistant par défaut d'une machine 16 Go.
- [x] Distinguer dans le résultat, l'historique et l'export un test incomplet par délai d'une erreur réelle ou d'une incompatibilité prouvée.
- [x] Appliquer le délai adaptatif à Arena, Recommendation Engine et Model Autopilot ; garder les packs privés scientifiquement bornés et refuser en amont un modèle trop lent pour leur protocole.
- [x] Afficher ensemble le nom lisible et la référence Ollama exacte, puis regrouper les anciens alias Hermes dans une seule identité de benchmark.
- [x] Afficher avant chaque benchmark un préflight compact : référence exacte, état d'installation, runtime Windows/WSL, taille, mémoire disponible, fenêtre de test et offload probable.
- [x] Adapter le libellé du bouton au budget réel (`Tester · 45 s` ou `Test long · 120 s`) et proposer les références exactes déjà détectées.
- [x] Préparer l'Arena avec trois rôles distincts : baseline légère, un assistant Hermes prioritaire, puis un autre candidat installé hors Hermes avant un second Hermes lourd.
- [x] Afficher avant l'Arena les runtimes, tailles, délais individuels, offload probable, budget global et garantie de zéro téléchargement.
- [x] Exiger une confirmation chiffrée avant la campagne et empêcher deux exécutions Arena concurrentes.
- [x] Conserver la preuve Arena Preflight v1 dans le run, l'historique, le rapport, MemoryForge et la fiche terrain.
- [x] Confirmer manuellement le nouveau libellé et le benchmark long dans le build Windows candidat : Mixtral 26 Go sous WSL, 48,3 s, 4,1 tok/s, exécution hybride et 33,3 % d'offload GPU sur RTX 4080 SUPER 16 Go.
- [x] Afficher le placement GPU/RAM mesuré dans le résultat, l'historique, le rapport et MemoryForge, puis distinguer réussite technique et confort quotidien.

## Maintenant - Hardware Doctor 2.0 et AI Capability Passport v1

- Enrichir les preuves GPU : allocation VRAM Ollama, offload GPU/CPU, PCIe, ReBAR quand le système l'expose, température, charge et puissance comme instantané clairement daté.
- Séparer les faits mesurés, les estimations et les données inconnues.
- Relier le diagnostic aux benchmarks automatiques et CPU pour prouver ou non l'accélération.
- Exporter un passeport JSON portable : machine, runtimes, modèles, benchmarks, Recommendation Engine, limites, confidentialité et frontière Strategy Arena.
- Ajouter une empreinte SHA-256 couvrant le document hors bloc d'intégrité. Cette empreinte détecte une modification ; elle ne constitue pas une signature d'identité.
- Garder le passeport dans Atelier IA pour ne pas encombrer l'Accueil.

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

## Candidat en validation - Machine Replay Lab v1

État au 14 juillet 2026 : une matrice synthétique versionnée rejoue dix profils dans le vrai front du Cockpit. Elle traverse Hardware Doctor, Runtime & Driver Intelligence, Recommendation Engine, décisions d'upgrade et preuve terrain. Elle bloque les régressions de cohérence mais reste explicitement distincte d'un test physique.

- [x] Rejouer vieux portable, Core i7 + GTX 1080 Ti, RTX 3060, RTX 4080, RTX 3090, CPU-only, Strix Halo, GPU inconnu, Intel Arc et RX 7900 XTX.
- [x] Vérifier GPU/VRAM affichés, mémoire effective, backend, famille de pilote, modèle recommandé, score et profil terrain.
- [x] Imposer le modèle test léger tant que le GPU est inconnu, CPU-only ou sur une machine legacy contrainte.
- [x] Afficher explicitement `VRAM non déterminée` et traiter la mémoire unifiée sans la convertir en VRAM dédiée.
- [x] Produire un rapport JSON/HTML local sans prompts bruts, fichiers personnels, credentials ni télémétrie.
- [x] Ajouter un workflow GitHub dédié avec matrice et version Playwright épinglées.
- [ ] Ajouter les vrais Capability Passports anonymisés seulement après les tests physiques ; une fixture ne devient jamais une preuve terrain.

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

Premier jalon candidat v1 terminé le 12 juillet 2026. La fonction reste dans l'espace Tests et n'est pas encore incluse dans le build public `291439601671`. Le candidat Windows/Linux `291887472771`, commit `6b5187e`, run `29188747277`, contient les cinq artefacts attendus et passe le contrat de release renforcé. Les workflows autonomes Windows `29188569395` et Linux `29188569378` passent aussi avec des contrôles source fail-fast.

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

Noyau et panneau Atelier IA Board Observer v0 implémentés le 12 juillet 2026, sans publication : commande Tauri Planka en lecture seule, contrat versionné, HTTPS obligatoire hors loopback, redirections refusées, clé API gardée en mémoire puis effacée, snapshot filtré, cinq tests Rust dont un serveur HTTP local et recette Playwright desktop/mobile. Les écritures, commentaires, webhooks et exécutions restent absents.

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

Workstack Arena Local v0 implémenté dans les sources le 14 juillet 2026, sans publication : le premier adaptateur réel lance uniquement le candidat Codex CLI exact sur le benchmark public `Signal Maze v1`, dans une copie jetable du workspace ForgeBench vérifié. Deux consentements par run couvrent séparément le quota ou coût fournisseur inconnu et l'écriture/exécution du mini-jeu. Une tentative, un budget exact de 3, 5 ou 10 minutes et 512 Kio de sortie maximum sont imposés. Les règles externes sont ignorées et une allowlist d'environnement exclut clés API tierces, tokens cloud et socket SSH. Le dépôt utilisateur, le board, la suite cachée, les credentials, la fusion et la publication ne sont ni transmis ni montés. La soumission passe les mêmes `7/7` contrôles statiques et `39/39` contrôles Chromium publics, puis requiert une revue humaine. Le mode `workspace-write` reste une propriété de la sandbox Codex et n'est pas présenté comme une preuve OutilsIA d'isolation de lecture de tout l'hôte.

Revue humaine du reçu v0 implémentée dans les sources le 14 juillet 2026, sans publication : après un run Codex signé, le propriétaire peut accepter le reçu pour une future comparaison, demander un nouveau run corrigé ou rejeter le run. La décision est structurée, signée, liée à l'empreinte exacte du run et ajoutable une seule fois à l'Evidence Ledger. Elle porte uniquement sur les métriques et limites du reçu public : aucune capture ni code n'étant conservé, elle ne revendique jamais une inspection visuelle, une approbation de qualité, une livraison, un gagnant, une écriture board, une fusion ou une publication.

- [x] Détecter les CLI officielles par commande de version bornée, sans retourner leur chemin.
- [x] Distinguer Windows natif, Linux natif, WSL par défaut, Ollama natif et Ollama WSL.
- [x] Router par capacités et type de mission sans verrouiller la proposition sur une marque.
- [x] Imposer un vérificateur différent de l'exécutant lorsqu'une proposition complète est possible.
- [x] Garder le panneau dans Atelier IA et fournir JSON, résumé et preuve visuelle desktop/mobile.
- [x] Ajouter un consentement séparé et strict pour le pilote technique de référence : aucun CLI candidat, réseau ou crédit payant.
- [x] Ajouter un second consentement et un budget explicite avant l'appel d'un modèle Ollama local déjà installé, sans accès fichier, Internet, API payante ou suite cachée ; l'exécution du code requiert une autorisation explicite distincte dans ce consentement.
- [x] Ajouter un premier adaptateur CLI borné à Codex + Signal Maze public, avec contrat strict, budget, consentements, sortie limitée, workspace jetable et coût fournisseur inconnu.
- [ ] Étendre ce mécanisme à Claude Code, Hermes et aux cartes arbitraires seulement après un contrat de permissions et de budget propre à chaque adaptateur.

Evidence Ledger v0 implémenté dans les sources le 12 juillet 2026, sans publication : le fichier local `evidence-ledger-v1.json` accepte volontairement les preuves Board Observer, Workstack Composer, Capability Router et préflight ForgeBench après validation de leur contrat. Chaque entrée contient uniquement auteur composant, claims bornés, métriques, empreinte source et empreinte précédente. La chaîne complète est revalidée à chaque lecture et écriture, les doublons sont refusés, une rotation de secours protège le remplacement du fichier et aucun contenu brut n'est persisté. Le Ledger ne transforme pas une empreinte en preuve d'identité ou de qualité et ne lance aucune exécution.

- [x] Chaîner les entrées `outilsia.evidence_entry.v1` et signer le document `outilsia.evidence_ledger.v1`.
- [x] Refuser Workstack modifiée, Router exécutable, worker identique au vérificateur et identifiants non bornés.
- [x] Tester écriture/lecture réelle, restauration vérifiée, corruption, doublon et absence de contenu brut.
- [x] Ajouter les actions explicites Ajouter, Vérifier, Copier, Télécharger et Réinitialiser dans Atelier IA.
- [x] Maintenir la notice canonique `NOTICE-UTILISATION-WORKSTACK.md` et vérifier ses responsabilités en CI.
- [x] Ajouter `isolated_reference_run` avec exécution réelle, vérification visible indépendante et consentement enregistré, sans contenu brut.
- [x] Ajouter `isolated_visible_browser_candidate` pour une génération Ollama locale, une vérification structurelle puis une exécution Chromium visible et isolée, sans sortie brute ni claim scientifique.
- [x] Ajouter la preuve de gameplay visible seulement après 39 contrôles publics, trois seeds, trois viewports et trois captures signées.
- [x] Ajouter `isolated_codex_visible_browser_pilot` après invocation réelle et bornée de Codex CLI, sans sortie brute, coût inventé, dépôt utilisateur ou claim de gagnant.
- [x] Ajouter `explicit_local_human_review` pour une décision humaine structurée sur le reçu public signé, sans approbation visuelle, livraison ou gagnant.
- [ ] Ajouter la preuve de vérification cachée seulement après un évaluateur réellement isolé du worker et les gates correspondantes de Workstack Arena.

- Séparer quatre responsabilités : Composer définit la chaîne, Workstack Arena exécute, ForgeBench évalue et Evidence Ledger conserve la preuve.
- [x] Créer le contrat exploratoire `Signal Maze v1` avec règles déterministes, starter public scellé, trois seeds, checks visibles et viewports desktop/Android.
- [x] Compiler un préflight signé qui valide Workstack, Router, disponibilité des stacks, équité du protocole et absence d'exécution.
- [x] Afficher séparément readiness exploratoire et scientifique, sans inventer les tests cachés encore absents.
- [x] Conserver volontairement le préflight ForgeBench dans l'Evidence Ledger sans contenu brut.
- [x] Générer et sceller localement une suite privée avec seeds aléatoires, manifeste interne, reçu sans contenu, stockage atomique et permissions utilisateur.
- [x] Garder `scientific_ready=false` tant que le vault n'est ni chiffré ni inaccessible aux futurs workers.
- [x] Matérialiser un workspace frais par stack et seed public, hors dépôt source, avec starter embarqué revérifié, reçu signé sans chemin et aucune exécution.
- [x] Ajouter un préflight bubblewrap Linux/WSL qui prouve par canari les namespaces processus/montage/réseau, le workspace seul en écriture et la racine hôte masquée, sans lancer de worker.
- [x] Lancer un worker technique déterministe dans une copie fraîche avec le backend vérifié, réseau coupé, montage minimal, racine hôte/vault/dépôt source absents et nettoyage obligatoire.
- [x] Relire la soumission dans un second processus isolé, monté en lecture seule, puis conserver uniquement six checks visibles, durées et empreintes bornées.
- [x] Ajouter un adaptateur Ollama prompt-only : identité runtime/modèle signée, modèle déjà installé, API loopback, une tentative bornée, réponse JSON à trois fichiers et aucun accès outil ou filesystem.
- [x] Évaluer la soumission Ollama dans un processus bubblewrap séparé avec sept checks statiques, lecture seule, réseau isolé et suppression obligatoire du workspace avant toute exécution.
- [x] Versionner un `Visible Gameplay Contract v1` public : seed, transformations, couleurs, signature, API, snapshot, raisons de rejet, DOM et recette desktop/Android.
- [x] Livrer une implémentation de référence scellée et réellement jouée sur trois seeds, desktop, Android portrait/paysage, clavier, souris et tactile, sans ressource réseau.
- [x] Exiger statiquement l'API visible et les marqueurs DOM dans les soumissions Ollama avant d'autoriser `generated_code_executed=true`.
- [x] Câbler les tests Bubblewrap de référence et du candidat dans `verify:ci-source` : exécution réelle sur Linux, contrat vérifié sans faux claim sur Windows.
- [x] Conserver dans l'Evidence Ledger uniquement génération, structure, métriques et empreintes ; y ajouter l'attestation de gameplay visible sans image ni DOM brut, garder suite cachée, science et vainqueur à faux, et l'énergie locale inconnue.
- [x] Exécuter le code candidat dans Chromium réellement isolé par bubblewrap, avec tests visibles et captures éphémères, avant toute affirmation de gameplay visible.
- [x] Lancer Codex CLI en session éphémère sur la seule tâche Signal Maze publique, avec un essai borné, contrôle de la taille de sortie, vérification des références amont et suppression obligatoire du workspace.
- [x] Afficher le reçu Codex desktop/mobile : worker invoqué, structure `7/7`, gameplay `39/39`, coût inconnu, absence de livraison et gate humaine.
- [ ] Fournir un préflight/installateur guidé de Chromium dans Linux/WSL sans installation silencieuse ni élargissement du réseau du worker.
- [ ] Généraliser les adaptateurs CLI au-delà du pilote Codex public sans élargir implicitement réseau, credentials, accès dépôt ou budget.
- [ ] Construire un évaluateur caché isolé capable de consommer la suite privée sans la révéler au worker avant toute affirmation scientifique.
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
