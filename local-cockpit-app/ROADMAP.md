# OutilsIA Local Cockpit - Roadmap produit

Mise à jour : 2026-07-28

## Cap produit

OutilsIA doit devenir la couche de décision de l'IA locale : savoir ce qu'une machine peut réellement exécuter, dans quelles conditions, pour quel usage et avec quel niveau de confiance.

L'application reste centrée sur le diagnostic, l'installation consentie, la mesure, la comparaison, la recommandation et la preuve. Elle ne devient pas un chat généraliste et ne réalise pas les backtests de Strategy Arena.

## Décisions de pilotage - audit externe du 26 juillet 2026

L'audit externe est utilisé comme regard produit, pas comme source de vérité. Le code, le manifeste public, les artefacts téléchargés et les preuves terrain restent les seules autorités.

### Risques confirmés

- Les sources sont en `0.1.2` tandis que le manifeste public distribue `0.1.1`. Ce décalage est volontaire, mais toute page publique doit attribuer chaque fonction au build exact qui la contient.
- La campagne physique reste à `0/5` avec `network_verified=false`. Les replays et fixtures empêchent des régressions ; ils ne remplacent pas les essais sur de vraies machines.
- Les installateurs Windows EXE et MSI publics sont `NotSigned` selon Authenticode. Les SHA-256 prouvent l'intégrité du fichier téléchargé, pas l'identité de l'éditeur et ne suppriment pas la friction SmartScreen.

### Critiques déjà traitées ou à corriger

- Le premier écran ouvre déjà sur **Analyser ce PC**, le matériel détecté, un Bilan machine et une action contextuelle unique.
- Le mode Essentiel masque déjà les panneaux avancés. Workstacks et ForgeBench restent dans **Atelier IA** et ne sont pas le parcours par défaut.
- L'action contextuelle sait déjà enchaîner les étapes utiles, notamment **Installer + tester**, sans obliger l'utilisateur à comprendre le runtime ou le catalogue.
- Estimation, mesure locale et preuve exportable sont déjà des états distincts dans l'interface et les contrats. Leur lisibilité doit encore être validée sur les machines terrain.
- AI Capability Passport v1 est déjà livré dans le build public `291439601671`. Ce qui reste futur est son adoption comme contrat interopérable externe, pas son existence.
- Le parcours ChatGPT « rapport partagé → explication → simulation d'upgrade → retour vers le desktop » existe déjà avec les outils read-only soumis. Aucun nouvel outil MCP n'est ajouté pendant l'examen initial.

### Idées retenues

1. **Vérité de release obligatoire** : aucune fonction candidate n'est attribuée au téléchargement public avant vérification du manifeste, des octets servis et de la recette native.
2. **Preuve physique prioritaire** : tester d'abord les deux Core i7 disponibles, dont la tour GTX 1080 Ti, puis compléter CPU-only, RTX 3060 12 Go et RTX 4080/4090 avec rapports réseau cohérents.
3. **Signature Windows** : documenter coût, fournisseur, conservation de clé et pipeline de signature ; ne jamais afficher « signé » avant un `Get-AuthenticodeSignature` valide sur EXE et MSI téléchargés.
4. **Funnel mesurable sans contenu privé** : suivre seulement `scan_success`, `recommended_model_ready` et `first_benchmark_success`, localement par défaut. Aucun prompt, réponse, nom de fichier, modèle personnel ou identifiant machine n'entre dans ces métriques ; aucun envoi automatique n'existe.
5. **Divulgation progressive** : conserver Workstacks, ForgeBench, Ledger et Router en mode avancé. Évaluer après les tests physiques s'ils doivent rester masqués jusqu'au premier benchmark réussi ; ne pas introduire ce verrou avant d'avoir observé de vrais utilisateurs.
6. **Résultat décisionnel compact** : viser une synthèse immédiatement visible en quatre faits maximum : potentiel machine, modèle conseillé ou testé, preuve mesurée, prochaine action ou absence d'achat utile.
7. **Positionnement stable** : « OutilsIA est la couche de décision de l'IA locale. On dit ce que le PC peut réellement faire, on le prouve et on indique s'il faut upgrader ou non. »
8. **Gel de la soumission ChatGPT** : pendant l'examen OpenAI, ne modifier le contrat MCP, les annotations, le widget ou les textes de frontière qu'en réponse à un défaut de production ou à une demande du reviewer.
9. **Bascule de publication vérifiable** : le statut ChatGPT public provient d'un contrat unique qui distingue revue, approbation non publiée, publication et corrections demandées. La CI exige une confirmation explicite de lecture du portail, des dates cohérentes et une URL officielle `chatgpt.com`; le contrat MCP soumis reste inchangé.

### Ordre d'exécution

1. Recette physique et collecte des preuves sur les machines disponibles.
2. Correction des défauts reproductibles et ajout de tests de non-régression.
3. Recette native complète du candidat `0.1.2`, puis publication Windows/Linux cohérente.
4. Étude et mise en place de la signature Windows.
5. Mesure du funnel réel avant toute extension grand public des Workstacks.

Ne pas lancer maintenant un orchestrateur multi-agents généraliste, un leaderboard présenté comme scientifique ou une installation distante depuis ChatGPT. Ces pistes restent subordonnées à la fluidité et à la preuve du parcours diagnostic → modèle recommandé → benchmark → rapport.

## Cap stratégique - cockpit pilotable par les IA

Le MCP local read-only n'est plus une idée : le candidat expose déjà huit outils
et quatre ressources issus d'un Passport figé, sur loopback, avec token
éphémère. Les recettes natives valident le protocole et les refus ; des recettes
séparées font lire des preuves bornées par Codex CLI et Claude Code. Cette
capacité reste candidate tant qu'elle n'appartient pas à un manifeste public.

Le palier suivant ne consiste pas à ouvrir les commandes Tauri derrière une API
HTTP générique. OutilsIA conserve un seul noyau métier Rust et deux contrats
strictement séparés :

1. **Evidence Plane** : MCP read-only actuel, sans effet de bord.
2. **Local Action Lane** : l'IA propose un plan ; l'application native seule
   recueille le consentement et émet une capacité temporaire à usage unique.

### Local Action Lane v0

- [x] Servir un snapshot MCP read-only sur `127.0.0.1`, port aléatoire, quinze
  minutes, token 256 bits en mémoire.
- [x] Vérifier les outils et ressources par client HTTP, Codex CLI et Claude
  Code sans conserver le jeton ou les transcriptions.
- [x] Formaliser un schéma versionné de demande avec action, modèle, runtime,
  taille, durée, effets, risques, provenance client et hash canonique.
- [x] Ajouter une file native `awaiting_human / approved / executing
  / completed / failed / rejected / expired / cancelled`.
- [x] Afficher dans Tauri une confirmation non contournable. Un paramètre
  `confirm:true` fourni par le modèle ne vaut jamais consentement humain.
- [x] Émettre après ce clic une capacité liée au plan, au client et à la session,
  valable deux minutes et consommable une seule fois.
- [x] Commencer par trois opérations allowlistées : installer une référence
  Ollama validée, benchmarker un modèle déjà installé, exporter un rapport vers
  une destination choisie dans l'app.
- [x] Réutiliser Install Safety Preflight, les runtimes par modèle, les délais
  adaptatifs, l'anti-réentrance et l'annulation existants ; ne dupliquer aucune
  logique dans le serveur MCP.
- [x] Écrire un reçu Evidence Ledger minimal séparant demande, consentement,
  exécution et résultat, sans prompt, réponse brute, chemin personnel ou token.
- [x] Rejeter replay, expiration, altération du plan, consommation par un autre
  client, arrêt serveur, redémarrage app et changement de Passport.
- [x] Garder hors périmètre : shell, chemin/URL arbitraire, pilote graphique,
  élévation lancée par l'IA, suppression de modèle, contrôle distant, backtest et
  trading.
- [x] Tester le réseau loopback, l'absence d'outil MCP d'approbation/exécution,
  l'UI desktop/mobile, l'anti-réentrance, l'expiration, le replay, l'altération,
  l'annulation et la confidentialité des reçus.
- [x] Exécuter la recette native sur une candidate Windows : refuser une
  installation sans téléchargement, benchmarker un modèle déjà installé,
  exporter un rapport figé et vérifier le Ledger.
- [ ] Valider le même parcours sur les machines terrain avant toute promotion
  publique. La source candidate ne vaut pas disponibilité dans le build public.

Le noyau candidat est implémenté dans les sources du 28 juillet 2026. Il utilise
un second serveur, un second jeton et une seconde file ; aucun des cinq outils
Action Lane ne rejoint les huit outils read-only. La recette native Windows a
refusé `gemma4:12b` sans téléchargement, benchmarké réellement `qwen3:0.6b`,
exporté un rapport figé et ajouté exactement trois reçus à une chaîne Ledger
valide, sans jeton ni contenu brut. La spécification, la recette et la notice
vivent dans `LOCAL-MCP.md`. La voie ne sera ni promue ni revendiquée dans le
build public avant la gate terrain encore ouverte.

### Benchmark Commons v1 - preuve communautaire opt-in

Le réseau communautaire doit construire un jeu de données utile, pas un
leaderboard décoratif.

- [x] Proposer après un benchmark standard réussi un export séparé, désactivé
  par défaut, précédé d'un aperçu et de deux gestes humains.
- [x] Préparer uniquement matériel normalisé, runtime, version Ollama, modèle
  exact, protocole versionné, tok/s, latences, offload, date, build et hash de
  preuve ; exclure prompt, réponse, fichiers, hostname, compte et token.
- [x] Utiliser un pseudonyme local rotatif tous les trente jours et une empreinte
  d'observation ; ne conserver aucun identifiant machine stable.
- [x] Vérifier localement source native, réussite Ollama API, prompt standard,
  âge, métriques plausibles, modèle/runtime, protocole, intégrité et champs
  interdits avant l'export.
- [x] Écrire sans écrasement, permettre retrait/révocation locale et chaîner des
  reçus minimaux dans Evidence Ledger.
- [x] Tester falsification, faux statut communautaire, faux envoi réseau,
  expiration, consentement séparé, rotation, réécriture du registre Windows et
  UI desktop/mobile.
- [x] Implémenter hors production un endpoint candidat authentifié : validation
  stricte du document, cohérence avec la machine et le benchmark déjà
  synchronisés, déduplication par sujet serveur, reçu strictement rattaché,
  révocation et rétention maximale de 180 jours.
- [x] Relier le client candidat derrière un drapeau de compilation : origine
  OutilsIA fixe, redirections refusées, compte desktop, machine et benchmark
  synchronisés, consentement réseau natif distinct, reçu serveur conservé dans
  le registre local et révocation distante obligatoire avant retrait local.
- [ ] Configurer la clé serveur, déployer l'endpoint privé, installer et
  monitorer la purge quotidienne garantissant la rétention maximale de 180
  jours, produire une build terrain portant
  `OUTILSIA_BENCHMARK_COMMONS_UPLOAD=1` et exécuter la recette réelle soumission
  puis révocation. Les builds actuels gardent le partage désactivé.
- [ ] Afficher médiane, dispersion et taille d'échantillon ; aucun classement
  public sous trois machines distinctes pour une même cohorte.
- [ ] Publier des pages GPU/modèle uniquement à partir de cohortes vérifiées et
  datées, avec lien vers la méthode et les limites.
- [x] Conserver la révocation distante utilisable même si un build futur
  désactive les nouvelles soumissions, afin de ne jamais piéger un export déjà
  reçu par le serveur.

État au 28 juillet 2026 : le palier local est implémenté et reste le seul actif
dans les builds actuels. Un fichier exporté reste sous le contrôle de son
propriétaire. Il porte explicitement
`field_test_proof=false`, `community_verified=false` et
`leaderboard_eligible=false`. Il ne sera pas présenté sur le site comme une
preuve communautaire avant mise en place et audit du palier serveur. Le contrat
serveur privé candidat refuse toute contribution sans compte desktop, machine
native et benchmark synchronisés cohérents. Il ne retourne aucune ligne brute
et masque toute cohorte sous trois machines distinctes. Le client réseau existe
uniquement derrière un drapeau de compilation désactivé ; ni l'endpoint, ni sa
configuration privée, ni une build activée ne sont déployés ou annoncés dans le
manifeste de l'application. Le client vérifie la forme et le rattachement du
reçu ; son digest SHA-256 reste une déclaration du serveur, pas une signature
cryptographique authentifiée localement.

### Monétisation produit, pas péage sur la preuve

Le scan, la première recommandation, le benchmark de base, la sécurité, le
rapport minimal et le MCP read-only restent gratuits. Ils constituent la preuve
que le produit fonctionne et ne doivent pas devenir un appât payant.

Une offre payante pourra viser l'historique long, la comparaison multi-machines,
les politiques d'équipe, les campagnes planifiées Flight Recorder, les exports
professionnels et les contrôles administratifs de Local Action Lane. Elle ne
doit pas vendre une promesse de performance ni masquer les limites.

Gate avant Stripe :

- campagne physique complète à cinq profils ;
- release publique Windows/Linux cohérente et recette native verte ;
- au moins 500 téléchargements vérifiés ou 100 utilisateurs mensuels
  récurrents ;
- demandes utilisateurs observées pour au moins deux fonctions payantes ;
- prix, résiliation, données et frontière gratuit/payant documentés.

Avant ce gate, OutilsIA mesure l'usage et améliore le produit ; il n'ajoute ni
paywall éditorial, ni abonnement artificiel, ni pression commerciale dans le
diagnostic.

## Candidat 0.1.2 - promotion honnête et campagne physique

État au 26 juillet 2026 : la chaîne candidate conserve maintenant l'identité
source/build/canal, la preuve Authenticode de chaque artefact Windows et un
funnel d'activation strictement local. Le build public reste `0.1.1`
(`291439601671`) et les sources `0.1.2` restent candidates tant que les essais
physiques et la décision de promotion ne sont pas terminés.

- [x] Mesurer localement le premier scan, le modèle conseillé prêt et le premier benchmark réussi, sans prompt, réponse, modèle, chemin ni identifiant machine.
- [x] Réinitialiser ces jalons au changement d'identité de build et conserver seulement la première date de chaque étape.
- [x] Lier les fiches terrain à la version, au build, au canal et au commit source.
- [x] Inspecter EXE et MSI sur Windows avec `Get-AuthenticodeSignature`, puis lier chaque statut au SHA-256 exact.
- [x] Interdire toute revendication d'éditeur signé lorsque le statut n'est pas `valid`.
- [x] Préserver la preuve de signature de la RC jusqu'au manifeste public et au reçu de promotion.
- [x] Vérifier séparément la vérité des sources, du manifeste public et des pages scanner/téléchargement.
- [x] Générer dans le kit privé un guide de campagne ordonné : Core i7 + GTX 1080 Ti, second Core i7, CPU-only, RTX 3060 12 Go, RTX 4080/4090.
- [x] Conserver deux seuils honnêtes : smoke RC à deux machines uniques et terrain complet à cinq profils.
- [x] Produire la RC privée Windows/Linux depuis CI et confirmer son statut Authenticode natif : `0.1.2-rc.1`, build `302038485811`, `not_signed`, sans déploiement.
- [x] Préparer un build Authenticode optionnel par empreinte du magasin Windows, SHA-256, timestamp RFC 3161, vérification SignTool et reçu lié aux artefacts.
- [x] Refuser une release dite stable si la signature est valide mais non horodatée ; conserver le mode RC non signé explicite.
- [x] Réaligner la RC Windows sur la distribution publique : portable de recette, setup NSIS et MSI obligatoire.
- [x] Comparer la version réellement lancée au manifeste public sans confondre candidat, build local et mise à jour.
- [x] Sélectionner uniquement un artefact natif : EXE sous Windows, choix AppImage/DEB/RPM sous Linux, aucun repli inter-plateforme.
- [x] Afficher dans Compte une maintenance lisible avec version installée/publique, build, format, taille et SHA, sans installation automatique.
- [x] Verrouiller Windows, Linux, ARM64, macOS/Darwin, RC et builds opaques par tests de politique et recette Playwright.
- [ ] Tester les deux Core i7 et importer leurs rapports réseau réels.
- [ ] Compléter CPU-only, RTX 3060 12 Go et RTX 4080/4090.
- [ ] Approuver puis promouvoir les mêmes octets uniquement après lecture des preuves.
- [ ] Choisir et acheter le certificat ou service de signature, puis valider le nom d'éditeur Windows.
- [ ] Choisir la conservation sécurisée de la clé : poste/token protégé ou signature distante ; aucun secret de signature ne doit entrer dans Git.
- [ ] Produire une première RC signée et horodatée, puis vérifier ses EXE/MSI téléchargés sur une machine Windows distincte.

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
- [x] Replier les six étapes techniques de ForgeBench tout en gardant leur synthèse et leur état accessibles.
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
- [x] Ajouter un serveur MCP Streamable HTTP v0.1 sur la même liaison loopback : huit outils et quatre ressources strictement read-only, snapshot figé, aucune action locale.
- [x] Publier dans le handshake MCP les instructions de frontière et annoter chaque outil `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=false`.
- [ ] Ajouter le consommateur côté Strategy Arena dans une session séparée, sans déplacer la gestion Ollama.
- [x] Recetter les lectures bornées avec Codex CLI et Claude Code sur le candidat Windows, sans persister le jeton ni les transcriptions.
- [x] Ajouter le client TypeScript MCP officiel à la matrice Windows/Linux :
  handshake, notification initialized, huit outils/quatre ressources read-only,
  cinq outils Action Lane, refus d'exécution, annulation et absence de fuite.
- [ ] Conserver une recette MCP Inspector visible avant promotion publique ; la
  conformité automatisée au SDK officiel ne remplace pas cette preuve manuelle.
- [ ] Étudier séparément une v0.2 `prepare -> confirmer dans l'app -> exécuter`, sans modifier le contrat read-only v0.1.

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

Capability Router v0 implémenté dans les sources le 12 juillet 2026, étendu à Kimi Code le 24 juillet 2026 et non publié : il valide l'empreinte du Workstack, sonde en parallèle et avec timeout Codex CLI, Claude Code, Hermes Agent et Kimi Code dans l'environnement natif et le WSL par défaut, ajoute les modèles Ollama déjà remontés par le scan, puis propose Planificateur, Exécutant et Vérificateur indépendant selon leurs capacités déclarées. Il ne lit aucun jeton, ne vérifie ni compte ni quota, ne scanne aucun dépôt, ne lance aucun agent et ne dépense aucun crédit API. Le résultat `outilsia.capability_router_result.v1` est signé, étiqueté dry-run et invalidé après un nouveau scan, une installation ou une suppression de modèle.

Agent Adapter Policy v1 implémenté dans les sources le 24 juillet 2026, sans publication : un registre local signé décrit séparément Codex CLI, Claude Code, Hermes Agent et Kimi Code sans lancer de sonde ni de worker. Codex expose uniquement le pilote public `codex_cli_signal_maze_pilot_v1`, avec une tentative, 3/5/10 minutes, 512 Kio, deux consentements par run et aucun accès autorisé au dépôt d'origine, board, suite cachée, credential, fusion, publication ou livraison. Claude Code, Hermes et Kimi restent `detect_only`, sans scope, budget, environnement ou workspace d'exécution autorisé. L'interface replie ce contrat sous Capability Router et rappelle que détection, autorisation et consentement sont trois états distincts.

Workstack Arena Local v0 implémenté dans les sources le 14 juillet 2026, sans publication : le premier adaptateur réel lance uniquement le candidat Codex CLI exact sur le benchmark public `Signal Maze v1`, dans une copie jetable du workspace ForgeBench vérifié. Deux consentements par run couvrent séparément le quota ou coût fournisseur inconnu et l'écriture/exécution du mini-jeu. Une tentative, un budget exact de 3, 5 ou 10 minutes et 512 Kio de sortie maximum sont imposés. Les règles externes sont ignorées et une allowlist d'environnement exclut clés API tierces, tokens cloud et socket SSH. Le dépôt utilisateur, le board, la suite cachée, les credentials, la fusion et la publication ne sont ni transmis ni montés. La soumission passe les mêmes `7/7` contrôles statiques et `39/39` contrôles Chromium publics, puis requiert une revue humaine. Le mode `workspace-write` reste une propriété de la sandbox Codex et n'est pas présenté comme une preuve OutilsIA d'isolation de lecture de tout l'hôte.

Revue humaine du reçu v0 implémentée dans les sources le 14 juillet 2026, sans publication : après un run Codex signé, le propriétaire peut accepter le reçu pour une future comparaison, demander un nouveau run corrigé ou rejeter le run. La décision est structurée, signée, liée à l'empreinte exacte du run et ajoutable une seule fois à l'Evidence Ledger. Elle porte uniquement sur les métriques et limites du reçu public : aucune capture ni code n'étant conservé, elle ne revendique jamais une inspection visuelle, une approbation de qualité, une livraison, un gagnant, une écriture board, une fusion ou une publication.

Holdout Ollama v1 implémenté dans les sources le 15 juillet 2026, sans publication : le candidat termine sa génération, sa soumission est gelée et les 39 contrôles visibles passent avant toute lecture du vault. Un second processus bubblewrap/Chromium reçoit ensuite cinq seeds comme entrées runtime et vérifie cinq familles de holdout sur desktop et Android. Le vault n'est pas monté ; seeds, identifiants privés, observations, DOM et captures ne sortent pas. Cette preuve reste non scientifique parce que les familles de checks sont publiques dans le code, le vault n'est ni chiffré ni inaccessible aux processus du même compte, les candidats pairs n'ont pas tourné et l'énergie n'est pas mesurée.

Préflight Chromium guidé v1 implémenté dans les sources le 24 juillet 2026, sans publication : après un canari Bubblewrap valide, OutilsIA lance une page headless minimale dans le runtime Linux ou WSL sans réseau, ne retourne aucun chemin et n'exécute aucun worker. Si Chromium manque, l'app distingue `npx`, Playwright Python ou l'absence d'installateur compatible, puis propose au maximum une commande Playwright bornée à copier. Aucun téléchargement, réseau ou privilège n'est déclenché par le préflight ; les candidats Ollama et Codex restent bloqués tant que le canari navigateur n'est pas vert.

- [x] Détecter les CLI officielles par commande de version bornée, sans retourner leur chemin.
- [x] Distinguer Windows natif, Linux natif, WSL par défaut, Ollama natif et Ollama WSL.
- [x] Router par capacités et type de mission sans verrouiller la proposition sur une marque.
- [x] Imposer un vérificateur différent de l'exécutant lorsqu'une proposition complète est possible.
- [x] Garder le panneau dans Atelier IA et fournir JSON, résumé et preuve visuelle desktop/mobile.
- [x] Signer un registre de permissions, consentements et budgets par adaptateur : Codex borné au pilote public, Claude Code, Hermes et Kimi en détection seule.
- [x] Ajouter un consentement séparé et strict pour le pilote technique de référence : aucun CLI candidat, réseau ou crédit payant.
- [x] Ajouter un second consentement et un budget explicite avant l'appel d'un modèle Ollama local déjà installé, sans accès fichier, Internet ou API payante ; la suite cachée n'est lue qu'après gel du code et l'exécution du candidat comme du holdout requiert une autorisation explicite.
- [x] Ajouter un premier adaptateur CLI borné à Codex + Signal Maze public, avec contrat strict, budget, consentements, sortie limitée, workspace jetable et coût fournisseur inconnu.
- [ ] Étendre ce mécanisme à Claude Code, Hermes, Kimi et aux cartes arbitraires seulement après un contrat de permissions et de budget propre à chaque adaptateur.

Evidence Ledger v0 implémenté dans les sources le 12 juillet 2026, sans publication : le fichier local stable `evidence-ledger-v1.json` accepte volontairement les preuves Board Observer, Workstack Composer, Capability Router et préflight ForgeBench après validation de leur contrat. Chaque entrée contient uniquement auteur composant, claims bornés, métriques, empreinte source et empreinte précédente. La chaîne complète est revalidée à chaque lecture et écriture, les doublons sont refusés, une rotation de secours protège le remplacement du fichier et aucun contenu brut n'est persisté. Le Ledger ne transforme pas une empreinte en preuve d'identité ou de qualité et ne lance aucune exécution. Le contrat de stockage v2 ajouté le 28 juillet 2026 migre automatiquement un Ledger v1 valide en conservant ses entrées et sa tête de chaîne ; toute version inconnue est refusée sans toucher au fichier.

- [x] Chaîner les entrées `outilsia.evidence_entry.v1` et signer le document `outilsia.evidence_ledger.v2`.
- [x] Migrer sans perte le contrat v1 vers v2 avec historique, écriture atomique et refus non destructif des versions inconnues.
- [x] Refuser Workstack modifiée, Router exécutable, worker identique au vérificateur et identifiants non bornés.
- [x] Tester écriture/lecture réelle, restauration vérifiée, corruption, doublon et absence de contenu brut.
- [x] Ajouter les actions explicites Ajouter, Vérifier, Copier, Télécharger et Réinitialiser dans Atelier IA.
- [x] Maintenir la notice canonique `NOTICE-UTILISATION-WORKSTACK.md` et vérifier ses responsabilités en CI.
- [x] Ajouter `isolated_reference_run` avec exécution réelle, vérification visible indépendante et consentement enregistré, sans contenu brut.
- [x] Ajouter `isolated_visible_and_hidden_holdout_candidate` pour une génération Ollama locale, une vérification structurelle, une exécution Chromium visible puis un holdout Chromium séparé, sans sortie brute ni claim scientifique.
- [x] Ajouter la preuve de gameplay visible seulement après 39 contrôles publics, trois seeds, trois viewports et trois captures signées.
- [x] Ajouter `isolated_codex_visible_browser_pilot` après invocation réelle et bornée de Codex CLI, sans sortie brute, coût inventé, dépôt utilisateur ou claim de gagnant.
- [x] Ajouter `explicit_local_human_review` pour une décision humaine structurée sur le reçu public signé, sans approbation visuelle, livraison ou gagnant.
- [x] Ajouter une preuve de holdout Ollama après gel de la soumission, dans un évaluateur séparé du worker, avec uniquement compteurs et empreintes dans le Ledger.
- [ ] Durcir ce holdout pour une prétention scientifique : logique de checks non publique, vault chiffré et inaccessible au même utilisateur, candidats pairs complets et énergie mesurée.

- Séparer quatre responsabilités : Composer définit la chaîne, Workstack Arena exécute, ForgeBench évalue et Evidence Ledger conserve la preuve.
- [x] Créer le contrat exploratoire `Signal Maze v1` avec règles déterministes, starter public scellé, trois seeds, checks visibles et viewports desktop/Android.
- [x] Compiler un préflight signé qui valide Workstack, Router, disponibilité des stacks, équité du protocole et absence d'exécution.
- [x] Afficher séparément readiness exploratoire et scientifique, avec holdout local explicitement distinct d'une validation scientifique.
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
- [x] Conserver dans l'Evidence Ledger uniquement génération, structure, métriques et empreintes ; y ajouter les attestations visible et holdout sans image, DOM, seed ou observation brute, garder science et vainqueur à faux, et l'énergie locale inconnue.
- [x] Exécuter le code candidat dans Chromium réellement isolé par bubblewrap, avec tests visibles et captures éphémères, avant toute affirmation de gameplay visible.
- [x] Lancer Codex CLI en session éphémère sur la seule tâche Signal Maze publique, avec un essai borné, contrôle de la taille de sortie, vérification des références amont et suppression obligatoire du workspace.
- [x] Afficher le reçu Codex desktop/mobile : worker invoqué, structure `7/7`, gameplay `39/39`, coût inconnu, absence de livraison et gate humaine.
- [x] Fournir un préflight/installateur guidé de Chromium dans Linux/WSL sans installation silencieuse ni élargissement du réseau du worker.
- [ ] Généraliser les adaptateurs CLI au-delà du pilote Codex public sans élargir implicitement réseau, credentials, accès dépôt ou budget.
- [x] Construire un évaluateur holdout Ollama séparé capable de consommer les seeds privés après gel du code sans les révéler au worker ni les retourner.
- [ ] Remplacer les familles publiques et le vault même-utilisateur par une isolation et une politique de secret suffisantes avant toute affirmation scientifique.
- Mesurer séparément résultat, vitesse, efficacité et coût ; toujours publier les valeurs brutes, les sous-scores et le caractère estimé ou inconnu d'une donnée.
- Utiliser comme score équilibré initial `50 % résultat + 20 % efficacité + 15 % vitesse + 15 % coût`, sans masquer les podiums par dimension ni la frontière de Pareto.
- Comparer d'abord trois stacks : Codex CLI seul, Claude Code seul et Hermes planification -> Codex construction -> Claude audit.
- Exiger un worktree et une session neufs par worker, un évaluateur indépendant, des versions datées et au moins trois seeds pour tout résultat présenté comme scientifique.
- Invalider ou pénaliser les runs qui changent les règles, retirent des tests, élargissent les permissions ou reçoivent une aide non enregistrée.
- Étendre ensuite ForgeBench aux pistes maintenance et évolution afin d'éviter un classement dépendant d'un seul mini-jeu.

## Phase 8 - Réseau et communauté opt-in

- Découvrir plusieurs machines OutilsIA sur un réseau privé et router vers la capacité disponible.
- Collecter uniquement sur consentement des benchmarks pseudonymisés et vérifiables.
- Recaler les estimations d'upgrade et produire des pages SEO/GEO depuis des mesures réelles.

### Cap six mois - mesurer, expliquer, diffuser

Doctrine produit : soustraire ce qui détourne du premier résultat, évaluer avant
d'affirmer et enseigner ce que la mesure signifie. Le parcours novice reste
`scanner -> tester -> comprendre -> décider`. Les fonctions ci-dessous ne
doivent pas ajouter une nouvelle falaise d'interface.

1. **Benchmark Protocol v2 reproductible**
   - Figer et versionner modèle exact, digest du prompt public, paramètres,
     runtime, version Ollama, build OutilsIA, mode CPU/GPU, profil Autopilot et
     conditions mesurables.
   - Séparer génération, préremplissage, chargement, offload, mémoire et
     thermiques ; ne jamais réduire la preuve à un unique score opaque.
   - Refuser toute comparaison lorsque les conditions indispensables diffèrent
     ou sont inconnues.
2. **Expliqueur de goulot d'étranglement**
   - Produire après mesure une décision courte : fait observé, cause possible,
     inconnue restante et prochain test utile.
   - Ne recommander un achat qu'après un blocage mesuré ; conserver explicitement
     le verdict « n'achetez rien » lorsque la machine répond déjà à l'usage.
   - Ne jamais transformer une corrélation, une estimation ou un catalogue en
     causalité certaine.
3. **Carte de preuve partageable**
   - Transformer un rapport public révoquable `/r/{token}` en carte lisible,
     Open Graph et embarquable : machine normalisée, modèle exact, protocole,
     débit mesuré, date et limites.
   - Réserver tout badge « mesuré » ou « vérifié » à une preuve réelle qui passe
     les contrôles réseau et de cohérence ; les estimations restent visuellement
     distinctes.
   - Exclure hostname, compte, IP, token, chemin, prompt privé et réponse brute.
4. **Corpus communautaire et pages factuelles**
   - Publier médiane, dispersion et taille de cohorte seulement après opt-in,
     révocation possible et seuil minimal de machines distinctes.
   - Produire les pages `GPU X vs GPU Y` ou `modèle X vs modèle Y` depuis les
     mesures comparables du corpus, jamais depuis des chiffres inventés.
   - Exposer un index compact lisible par les moteurs et les LLM, avec provenance,
     protocole, fraîcheur et limites de chaque agrégat.
5. **Veille de régression et comparaison multi-machines**
   - Prévenir lorsqu'une mesure comparable régresse après changement de pilote,
     runtime ou réglage, sans attribuer automatiquement la cause.
   - Comparer deux machines d'un même propriétaire avec les mêmes protocoles ;
     aucune découverte réseau ou synchronisation implicite.

Le seul composant appris envisagé à ce stade est un futur estimateur de débit
calibré sur un corpus suffisant. Il devra retourner un intervalle et un niveau de
confiance, être daté et céder systématiquement la place à une mesure locale
réelle. Aucune marketplace de recettes agent n'est prioritaire avant un usage
récurrent démontré et une demande explicite d'au moins 500 utilisateurs actifs.

## Garde-fous permanents

- Aucun téléchargement, installation, suppression, synchronisation ou publication sans action explicite.
- Aucun score matériel ne doit masquer un runtime GPU non prouvé.
- Toute estimation doit être étiquetée et accompagnée de sa source ou de sa limite.
- Aucune preuve terrain physique ne peut être créée depuis une fixture ou une machine différente.
- OutilsIA prépare les modèles locaux ; Strategy Arena compile, backteste et valide les stratégies.
