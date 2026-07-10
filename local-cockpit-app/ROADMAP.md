# OutilsIA Local Cockpit - Roadmap produit

Mise à jour : 2026-07-10

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

État au 10 juillet 2026 : source, gates, build et publication Windows/Linux terminés sur le build public `291204755461` issu du commit `ca27835` et du run CI `29120475546`. La recette terrain physique reste à finaliser sans fixture ni preuve fabriquée.

- [x] Sondes NVIDIA : VRAM utilisée, P-state, PCIe et ReBAR seulement quand explicitement exposé.
- [x] Preuve d'offload Ollama `/api/ps` : CPU, hybride ou GPU, avec état « non prouvé » en absence de mesure.
- [x] Hardware Doctor v2 propagé aux rapports, PDF, MemoryForge et fiches terrain.
- [x] AI Capability Passport v1 : génération, copie, téléchargement et invalidation après nouvelle mesure.
- [x] SHA-256 canonique vérifié, test de falsification et avertissement « pas une signature d'identité ».
- [x] Résumé Passport dans le rapport, MemoryForge, le pont Strategy Arena et le terrain, sans rendre le terrain artificiellement dépendant du passeport.
- [x] Pages SEO/GEO, FAQ structurées, `llms.txt`, README et monitoring mis à jour.
- [x] Construire et publier le nouveau build Windows/Linux, puis vérifier les cinq artefacts publics et leurs SHA-256.
- [x] Enrichir le kit terrain avec Doctor 2.0, preuve d'allocation Ollama et Passport facultatif, sans modifier les huit preuves bloquantes.
- [ ] Confirmer l'offload réel sur les machines physiques de la campagne terrain.

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

## Phase 6 - Interopérabilité locale

- Stabiliser le AI Capability Passport comme contrat en lecture seule.
- Exposer plus tard un MCP/API local borné : profil machine, modèles, preuves et recommandation.
- Laisser Strategy Arena consommer les capacités préparées par OutilsIA sans lui transférer la gestion Ollama.

## Phase 7 - Réseau et communauté opt-in

- Découvrir plusieurs machines OutilsIA sur un réseau privé et router vers la capacité disponible.
- Collecter uniquement sur consentement des benchmarks anonymisés et vérifiables.
- Recaler les estimations d'upgrade et produire des pages SEO/GEO depuis des mesures réelles.

## Garde-fous permanents

- Aucun téléchargement, installation, suppression, synchronisation ou publication sans action explicite.
- Aucun score matériel ne doit masquer un runtime GPU non prouvé.
- Toute estimation doit être étiquetée et accompagnée de sa source ou de sa limite.
- Aucune preuve terrain physique ne peut être créée depuis une fixture ou une machine différente.
- OutilsIA prépare les modèles locaux ; Strategy Arena compile, backteste et valide les stratégies.
