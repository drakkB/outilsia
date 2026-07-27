# Recette Computer Use - OutilsIA Local Cockpit

Version de la recette : 1.0

Date : 27 juillet 2026

Produit testé : application desktop native Tauri/Rust OutilsIA Local Cockpit

Nature du test : audit fonctionnel et visuel en boîte noire, piloté par Computer Use

## Prompt de départ à donner à Computer Use

> Lis intégralement le fichier
> `%USERPROFILE%\outilsia-repo\local-cockpit-app\RECETTE-COMPUTER-USE-LOCAL-COCKPIT.md`,
> puis exécute la recette sur l'application native OutilsIA Local Cockpit déjà
> présente sur cette machine. Respecte les limites de sécurité, n'utilise pas le
> code source pour déduire qu'une fonction marche, et ne transforme jamais une
> estimation en preuve. Continue après les anomalies non bloquantes afin de
> couvrir le maximum de parcours. Produis les captures et le rapport final dans
> le dossier demandé par la recette. Ne déploie rien, ne publie rien et ne
> modifie aucun autre produit.

## 1. Objectif

Évaluer ce qu'un nouvel utilisateur voit et comprend réellement dans
OutilsIA Local Cockpit :

1. lancement de l'application native ;
2. analyse du matériel et des runtimes ;
3. compréhension du résultat ;
4. inventaire exact des modèles installés ;
5. recommandation par usage ;
6. benchmark réellement mesuré ;
7. dialogue local ;
8. Arena locale ;
9. rapport, PDF, MemoryForge et Passport ;
10. diagnostic Hardware Doctor et conseil d'upgrade ;
11. navigation, accessibilité et persistance ;
12. séparation entre fonctions publiques, candidates et expérimentales ;
13. respect de la vie privée et absence d'action implicite.

Le test ne doit pas seulement vérifier qu'un bouton répond. Il doit déterminer :

- si l'utilisateur comprend ce qui vient de se passer ;
- si le résultat visible correspond au matériel réellement détecté ;
- si l'action suivante est évidente ;
- si une mesure est clairement distinguée d'une estimation ;
- si un échec est honnête, explicable et récupérable ;
- si le produit reste utilisable sans connaître Ollama, WSL, CUDA ou ForgeBench.

## 2. Règles absolues

### 2.1 Test en boîte noire

- Utiliser l'application native, pas une copie HTML ouverte dans un navigateur.
- Ne pas lire `app.js`, `lib.rs`, les tests ou les fixtures pour conclure qu'une
  fonction marche.
- Ne pas utiliser les outils de développement du navigateur.
- Les sources peuvent uniquement servir après le test pour localiser un défaut
  déjà observé. Elles ne constituent jamais une preuve utilisateur.
- Une fonctionnalité est réussie seulement si elle est visible et utilisable
  depuis l'interface.

### 2.2 Périmètre produit

- Tester uniquement OutilsIA Local Cockpit et, dans le lot optionnel, ses pages
  officielles sur `https://outilsia.fr`.
- Ne pas ouvrir, modifier ou tester GardenArena, Strategy Arena, ScoreLook,
  ScoreCredit, Vigi-Sky ou un autre produit.
- Une mention Strategy Arena est acceptable uniquement comme passerelle
  d'export en lecture seule.
- Toute présence de GardenArena, Garden, Fable Joint Sentinel ou règles de
  jardin dans OutilsIA Local Cockpit est une contamination produit P0.

### 2.3 Actions interdites

- Aucun achat.
- Aucun clic sur un lien affilié.
- Aucun changement de BIOS, ReBAR, XMP/EXPO, pilote, CUDA, ROCm ou Vulkan.
- Aucune installation automatique de pilote.
- Aucun changement de pare-feu, DNS, Cloudflare, service Windows ou registre.
- Aucun arrêt forcé d'Ollama depuis les outils système.
- Aucune suppression de modèle Ollama.
- Aucun effacement de rapport, de fiche terrain ou de mémoire existante.
- Aucun backtest, ordre de trading ou génération de stratégie financière.
- Aucun déploiement, commit, push ou publication.
- Aucun partage public de rapport sans instruction explicite du propriétaire.

### 2.4 Actions locales autorisées

- Lancer et fermer OutilsIA Local Cockpit.
- Redimensionner la fenêtre.
- Naviguer dans tous les espaces et sections.
- Analyser le PC.
- Vérifier l'état d'Ollama Windows et WSL.
- Tester un modèle déjà installé.
- Poser une question locale non sensible.
- Générer des exports locaux de test.
- Copier du texte uniquement si cela est nécessaire à la vérification.
- Installer uniquement `qwen3:0.6b` si toutes les conditions suivantes sont
  réunies :
  - il n'est pas déjà installé ;
  - l'application affiche explicitement sa référence exacte ;
  - le préflight annonce une taille inférieure ou égale à 1 Go ;
  - l'espace disque est mesuré comme suffisant ;
  - aucune élévation ou modification système n'est demandée.
- Refuser toute autre installation dans cette recette.

### 2.5 Protection des données

- Ne jamais saisir de nom, adresse, email, mot de passe, token ou clé API.
- Utiliser uniquement les prompts neutres fournis dans cette recette.
- Ne pas ouvrir l'Explorateur sur un dossier personnel contenant des documents.
- Ne pas inclure de chemin utilisateur complet dans les captures.
- Masquer toute identité de compte visible avant une capture.
- Ne jamais enregistrer un token de passerelle locale dans le rapport.
- Si une donnée privée apparaît, arrêter immédiatement la capture concernée,
  la supprimer et classer le défaut P0 confidentialité.

### 2.6 Vérité de version

- Identifier le build avant d'évaluer les fonctions avancées.
- Tester comme obligations uniquement les fonctions revendiquées par le build
  réellement lancé.
- Une fonction présente dans les sources `0.1.2` mais absente du build public
  `0.1.1` est `NOT_APPLICABLE`, pas automatiquement un bug du build public.
- En revanche, si le build affiche un bouton ou une promesse pour cette fonction,
  son parcours visible doit fonctionner.
- Ne jamais télécharger un candidat privé pour compléter artificiellement la
  recette.
- Le rapport final doit séparer clairement :
  - preuves du build lancé ;
  - fonctions absentes ;
  - fonctions candidates visibles ;
  - hypothèses non testées.

## 3. Conditions d'arrêt

### Arrêt immédiat de toute la mission

- L'application tente une action destructive sans consentement.
- Un secret, token, email privé ou chemin personnel sensible est exporté.
- L'application installe ou modifie un pilote automatiquement.
- L'application exécute un outil externe non annoncé.
- Une autre application ou un autre site est modifié.

### Arrêt du scénario seulement

- Une opération dépasse son délai maximal.
- L'application se ferme ou devient inutilisable.
- Le modèle demandé n'est pas installé et dépasse la limite autorisée.
- Une confirmation implique une dépense, un téléchargement important ou un
  changement système.

Après un arrêt de scénario, enregistrer les preuves, relancer l'application une
seule fois si nécessaire, puis continuer avec le scénario indépendant suivant.

## 4. Dossier de preuves

Créer un seul dossier, hors Bureau :

`%USERPROFILE%\Downloads\OutilsIA-Computer-Use-Audit\AAAA-MM-JJ_HHMM\`

Sous-dossiers :

```text
01-lancement
02-scan
03-navigation
04-machine-doctor
05-modeles
06-benchmark
07-recommandation-arena
08-assistant
09-exports
10-atelier
11-responsive-accessibilite
12-reprise
```

Livrables obligatoires :

```text
RAPPORT-COMPUTER-USE.md
ANOMALIES.csv
CHRONOLOGIE.csv
CAPTURES-INDEX.md
```

Ne pas produire de fichier sur le Bureau.

## 5. Discipline de preuve

Pour chaque scénario, consigner :

- identifiant ;
- heure de début et de fin ;
- action exacte ;
- état avant ;
- résultat attendu ;
- résultat observé ;
- durée ;
- capture avant ;
- capture après ;
- verdict `PASS`, `FAIL`, `BLOCKED`, `NOT_APPLICABLE` ou `NOT_RUN` ;
- sévérité si échec ;
- possibilité de reprise ;
- commentaire utilisateur en une phrase.

Ne jamais écrire `PASS` si :

- le contrôle était masqué ;
- le clic n'a produit aucun changement visible ;
- le résultat a été déduit du code ;
- l'application affiche une donnée de démonstration ;
- une estimation est présentée comme mesure ;
- un autre modèle ou runtime a été testé ;
- une erreur a disparu uniquement après plusieurs clics non expliqués.

## 6. Sévérité des anomalies

### P0 - Bloquant

- mauvaise machine ou mauvaise VRAM présentée comme fait ;
- mauvais modèle ou mauvais runtime utilisé à l'action ;
- scan ou fenêtre bloquée sans reprise ;
- action destructive ou téléchargement important implicite ;
- preuve, rapport ou Passport mensonger ;
- fuite de donnée privée ;
- fonction candidate présentée comme publique ;
- contamination avec un autre produit ;
- rapport partageable attribué à une autre machine.

### P1 - Sérieux

- parcours principal impossible à terminer ;
- bouton d'action principal sans effet ou masqué ;
- résultat de benchmark qui disparaît ;
- échec non expliqué ou impossible à retester ;
- recommandation sans moyen visible de la lancer ;
- élément essentiel tronqué sur 1366 x 768 ;
- navigation clavier bloquée ;
- état obsolète après un nouveau scan ou benchmark.

### P2 - Important

- texte ambigu ou trop technique ;
- hiérarchie visuelle confuse ;
- répétition excessive ;
- statut peu compréhensible ;
- action secondaire trop visible ;
- incohérence de libellé sans mauvaise action.

### P3 - Cosmétique

- alignement, espacement ou formulation sans impact sur la décision.

## 7. Préflight de la machine

### CU-00 - Environnement

1. Noter le nom du profil terrain, parmi :
   - `old_laptop`
   - `core_i7_gtx_1080_ti`
   - `rtx_3060_12gb`
   - `rtx_4080_4090`
   - `cpu_only`
   - `other`
2. Noter la résolution et le facteur d'échelle Windows visibles dans Paramètres.
3. Vérifier que la machine est sur secteur si c'est un portable.
4. Fermer les fenêtres susceptibles de recouvrir l'application.
5. Ne pas fermer Ollama s'il est déjà lancé.
6. Ne pas lancer de terminal.
7. Capturer uniquement les informations système nécessaires, sans identité.

Critère : le profil de test et les conditions d'affichage sont documentés.

### CU-01 - Lancement natif

1. Lancer OutilsIA Local Cockpit depuis son raccourci ou son exécutable installé.
2. Mesurer le temps jusqu'à une fenêtre utilisable.
3. Vérifier le titre de fenêtre.
4. Vérifier qu'aucune console parasite ne reste ouverte.
5. Vérifier qu'aucune erreur blanche, écran vide ou contenu de démonstration
   n'occupe l'écran.
6. Capturer le premier écran sans faire défiler.

Attendu :

- fenêtre native utilisable ;
- `Analyser ce PC` visible immédiatement ;
- résumé `Machine détectée` proche de l'action ;
- aucune fonction avancée ne domine le premier écran ;
- aucun PromptForge ou dialogue local placé avant le diagnostic ;
- aucun `undefined`, `NaN`, `[object Object]` ou score factice.

### CU-02 - Identité de build

1. Ouvrir `Compte`.
2. Rechercher l'état de version et maintenance de l'application.
3. Noter :
   - version lancée ;
   - build ID ;
   - canal ou statut ;
   - système cible ;
   - build public connu.
4. Vérifier que l'app distingue :
   - build public ;
   - candidat privé ;
   - build local ;
   - mise à jour disponible ;
   - version plus récente que le public.

Attendu : aucune invitation à rétrograder un candidat plus récent vers la
version publique.

## 8. Parcours principal

### CU-10 - Analyse du PC

1. Revenir à `Accueil`.
2. Cliquer une seule fois sur `Analyser ce PC`.
3. Ne plus cliquer pendant l'analyse.
4. Observer :
   - retour visuel immédiat ;
   - progression ou état compréhensible ;
   - possibilité d'annulation si une opération longue démarre ;
   - absence de gel de la fenêtre.
5. Essayer de déplacer légèrement la fenêtre pendant le scan.
6. Mesurer le temps total.
7. Capturer le résultat dès son apparition, sans changer d'espace.

Échec P0 si la fenêtre ne répond plus pendant plus de 10 secondes.

Échec P1 si le scan dépasse 90 secondes sans message utile ni reprise.

Attendu :

- CPU, RAM, GPU, VRAM, OS et Ollama apparaissent près du bouton ;
- l'utilisateur voit le résultat avant les détails avancés ;
- aucun panneau de console ne pousse le résultat hors écran ;
- le bouton ne lance pas une deuxième analyse tout seul ;
- le résultat n'est pas remplacé par un simple texte intermédiaire.

### CU-11 - Vérité matérielle

Comparer le résultat à ce que Windows expose visuellement dans le Gestionnaire
des tâches ou les Paramètres, sans utiliser de terminal.

Vérifier :

- nom du CPU ;
- RAM totale avec tolérance raisonnable liée au système ;
- nom exact du GPU ;
- VRAM dédiée ;
- OS ;
- fréquence mémoire si détectée ;
- nombre de modules si détecté ;
- canal mémoire uniquement si la preuve est suffisante ;
- carte mère et BIOS uniquement si réellement détectés.

Régressions obligatoires :

- RTX 4080 SUPER : afficher 16 Go, jamais 12 Go comme capacité actuelle ;
- GTX 1080 Ti : afficher environ 11 Go, jamais 12 ou 16 Go ;
- RTX 3060 12 Go : ne pas la confondre avec une 3060 Ti 8 Go ;
- GPU AMD : ne pas parler de CUDA comme runtime actif ;
- mémoire unifiée : ne pas la présenter comme VRAM NVIDIA dédiée ;
- CPU only : ne pas inventer un GPU ou un backend accéléré.

Une valeur inconnue doit être affichée comme inconnue, pas comme zéro certain.

### CU-12 - Décision principale

Depuis `Accueil > Bilan machine`, vérifier que l'utilisateur peut répondre sans
ouvrir les détails à ces quatre questions :

1. Mon PC est-il adapté à l'IA locale ?
2. Quel modèle dois-je tester maintenant ?
3. Ai-je déjà une preuve mesurée ?
4. Quelle est la prochaine action utile ?

Attendu :

- maximum trois actions prioritaires ;
- une recommandation nommée avec sa référence Ollama exacte ;
- une estimation clairement étiquetée ;
- un benchmark absent présenté comme absent ;
- pas d'achat prioritaire si la machine suffit déjà ;
- un conseil d'upgrade relié à un blocage réel.

## 9. Navigation et compréhension

### CU-20 - Les sept espaces

Ouvrir successivement :

1. Accueil
2. Machine
3. Modèles
4. Tests
5. Assistant
6. Atelier IA
7. Compte

Pour chacun :

- vérifier que le titre correspond ;
- vérifier qu'un seul module est montré par défaut ;
- utiliser les flèches section précédente/suivante ;
- utiliser le menu `Section` ;
- activer puis désactiver `Toutes les sections` si disponible ;
- revenir à l'espace précédent.

Attendu :

- aucune perte des champs saisis ;
- aucune réinitialisation du scan ;
- aucune action automatique lors d'un changement d'espace ;
- aucun défilement horizontal global ;
- l'espace actif est visuellement identifiable ;
- les fonctions avancées restent dans leur espace.

### CU-21 - Routage des actions

Tester les relais visibles sans confirmer l'opération finale :

- `Bench` ou `Tester` ouvre `Tests > Benchmark` ;
- `Dialogue` ouvre `Assistant > Dialogue local` ;
- une action upgrade ouvre `Machine` ;
- une action Workstack ouvre `Atelier IA` ;
- une action Passport ouvre le module Passport ;
- une dépendance ForgeBench ouvre son prérequis.

Attendu : le premier clic navigue et explique ; il ne télécharge, ne benche et
n'exécute rien sans un second consentement.

### CU-22 - Persistance de navigation

1. Choisir une section non initiale dans `Machine`.
2. Passer dans `Tests`.
3. Revenir dans `Machine`.
4. Vérifier la section restaurée.
5. Fermer puis relancer l'application à la fin de la mission et vérifier le
   comportement prévu.

## 10. Hardware Doctor et runtime

### CU-30 - Hardware Doctor

1. Ouvrir `Machine > Hardware Doctor`.
2. Identifier les mesures, contrôles et recommandations.
3. Déplier le détail technique.
4. Vérifier que les niveaux de confiance sont visibles.
5. Vérifier qu'une mesure inconnue reste inconnue.

Contrôles :

- RAM : capacité, fréquence, modules, canal et niveau de confiance ;
- GPU : VRAM, pilote et source de détection ;
- NVIDIA : `CUDA driver max` n'est pas présenté comme toolkit CUDA installé ;
- AMD : ROCm/Vulkan avec statut honnête ;
- Intel : backend et limites adaptés ;
- WSL : installé, distro et Ollama WSL distingués ;
- température/throttling : seulement si réellement mesurés ;
- ReBAR : ne pas promettre un gain chiffré non mesuré ;
- alimentation : ne pas prétendre mesurer le PSU si ce n'est pas possible.

### CU-31 - Runtime & Driver Intelligence

1. Vérifier le runtime conseillé.
2. Vérifier le runtime de chaque modèle installé.
3. Ouvrir une recommandation de pilote sans poursuivre vers l'installation.
4. Vérifier que le lien est officiel et que l'app annonce qu'elle n'installe
   aucun pilote automatiquement.

Attendu :

- Windows natif et WSL ne sont jamais fusionnés silencieusement ;
- un modèle WSL est testé dans WSL ;
- un modèle Windows est testé sous Windows ;
- un modèle présent dans un runtime n'est pas présenté comme installé dans
  l'autre ;
- aucun bouton ne promet `Mettre à jour CUDA` si l'action réelle est seulement
  l'ouverture d'une documentation officielle.

### CU-32 - Scan répété et concurrence

1. Lancer une nouvelle analyse.
2. Pendant le scan, cliquer une fois de plus sur le bouton si celui-ci reste
   actif.
3. Vérifier qu'une deuxième analyse concurrente ne démarre pas.
4. Vérifier que les résultats finaux ne se dupliquent pas.

Attendu : verrou de réentrance visible ou bouton désactivé.

## 11. Modèles et installation contrôlée

### CU-40 - Inventaire

1. Ouvrir `Modèles`.
2. Comparer la liste installée aux références visibles dans Ollama si
   l'application les expose.
3. Vérifier les tags exacts.
4. Rechercher les cas suivants s'ils existent :
   - `qwen3:0.6b`
   - `qwen3:8b`
   - `qwen3:14b`
   - `hermes3:8b`
   - `nous-hermes2-mixtral:8x7b`
   - `mistral-nemo:12b`

Attendu :

- `qwen3:0.6b` n'équivaut jamais à `qwen3:14b` ;
- `hermes3:8b` n'équivaut jamais à `nous-hermes2-mixtral:8x7b` ;
- installé, option, non disponible et frontier sont distincts ;
- les actions chat/bench n'apparaissent pas sur un modèle non conversationnel ;
- la taille et le runtime ne se contredisent pas.

### CU-41 - Préflight d'installation

Ne poursuivre que pour `qwen3:0.6b` et seulement s'il manque.

1. Cliquer sur son action d'installation.
2. Lire le préflight sans confirmer immédiatement.
3. Vérifier :
   - modèle exact ;
   - runtime exact ;
   - taille ;
   - espace libre ;
   - marge de sécurité ;
   - chemin personnel absent des exports ;
   - action d'annulation.
4. Confirmer seulement si toutes les limites de la section 2.4 sont satisfaites.
5. Observer la progression sans ouvrir une console cachée.

Attendu :

- progression visible dans l'espace actif ;
- aucun basculement silencieux en mode technique ;
- annulation compréhensible ;
- état final installé uniquement après succès réel ;
- un échec ne devient jamais `Installé`.

### CU-42 - Téléchargement déjà installé

Sur un modèle déjà installé, vérifier qu'une action `Installer + bench` ne
retélécharge pas plusieurs gigaoctets. Elle doit reconnaître l'installation et
passer au préflight de test sur le bon runtime.

## 12. Benchmark réel

### CU-50 - Benchmark léger

Modèle prioritaire : `qwen3:0.6b` déjà installé.

Prompt exact :

```text
Réponds en français en trois phrases maximum : pourquoi la VRAM compte-t-elle pour un modèle IA local ?
```

1. Ouvrir `Tests > Benchmark`.
2. Sélectionner le modèle exact.
3. Vérifier le préflight avant lancement.
4. Lancer une seule fois.
5. Ne pas interagir pendant le run.
6. Mesurer la durée.
7. Capturer le résultat.

Attendu :

- modèle exact ;
- runtime exact ;
- budget annoncé ;
- résultat `succès`, `échec`, `annulé` ou `incomplet` ;
- tokens/s uniquement si réellement mesurés ;
- temps écoulé plausible, jamais `1 ms` pour une vraie génération ;
- placement CPU/GPU/hybride seulement si Ollama `/api/ps` l'a observé ;
- résultat toujours visible après la fin ;
- historique mis à jour ;
- aucun score `undefined/100`.

### CU-51 - Benchmark Hermes ciblé

Condition : `hermes3:8b` est déjà installé. Ne pas l'installer dans cette recette.

1. Sélectionner exactement `hermes3:8b`.
2. Vérifier que le préflight ne décrit pas Hermes Mixtral 8x7B.
3. Lancer avec le budget annoncé, maximum 120 secondes.
4. Si le test échoue, vérifier :
   - raison claire ;
   - runtime ;
   - stderr expurgé de chemins privés ;
   - bouton de retest ;
   - absence de faux succès.

L'échec du modèle n'est pas automatiquement un bug produit. L'impossibilité de
comprendre ou reprendre l'échec est un bug.

### CU-52 - Modèle lourd et timeout

Condition : un modèle lourd est déjà installé. Ne pas le télécharger.

1. Ouvrir seulement son préflight.
2. Vérifier l'avertissement offload et le budget long.
3. Ne lancer que si le budget total annoncé est inférieur ou égal à 120 secondes.
4. Vérifier qu'un timeout est `test incomplet`, jamais `incompatible`.

### CU-53 - Annulation et double clic

Sur un benchmark léger :

1. lancer le test ;
2. vérifier que le bouton principal est verrouillé ;
3. utiliser `Annuler` une seule fois si disponible ;
4. vérifier le retour à un état récupérable ;
5. relancer ensuite normalement.

## 13. Recommandation et Arena

### CU-60 - Choisir le meilleur modèle

1. Ouvrir `Tests > Choisir le meilleur modèle`.
2. Vérifier qu'un état `non lancé` possède une action visible.
3. Choisir successivement les usages disponibles :
   - polyvalent ;
   - assistant ;
   - code ;
   - français ;
   - portable ;
   - mémoire si disponible.
4. Pour chaque profil, noter les deux candidats et la justification.
5. Ne lancer qu'une comparaison dont tous les modèles sont déjà installés.

Attendu :

- aucune installation cachée ;
- candidats adaptés au matériel ;
- profil et action toujours visibles ;
- résultat mesuré séparé du score catalogue ;
- modèle gagnant relié au profil choisi ;
- échec individuel conservé sans invalider les succès ;
- aucune formule ou valeur `undefined`.

### CU-61 - Arena locale

Condition : au moins deux modèles conversationnels sont déjà installés.

1. Ouvrir le préflight Arena.
2. Vérifier la liste, les runtimes, le budget global et `zéro téléchargement`.
3. Lancer une seule campagne de deux ou trois modèles maximum.
4. Vérifier le verrou de concurrence.
5. Attendre la fin ou le délai annoncé.
6. Examiner les rôles :
   - rapide ;
   - assistant ;
   - code ;
   - mémoire ;
   - français ;
   - compromis.

Attendu :

- les rôles découlent des résultats disponibles ;
- un échec n'est pas affiché comme `0/100` gagnant ;
- le compromis n'est pas choisi sur une donnée absente ;
- les références exactes et runtimes restent visibles ;
- la preuve Arena rejoint le rapport sans changer les mesures.

## 14. Assistant local

### CU-70 - Dialogue

Modèle : le modèle léger qui vient de réussir le benchmark.

Question exacte :

```text
Donne deux conseils simples pour choisir entre un modèle local rapide et un modèle local plus qualitatif.
```

1. Ouvrir `Assistant > Dialogue local`.
2. Vérifier le modèle sélectionné.
3. Envoyer une seule fois.
4. Attendre la réponse.
5. Vérifier l'historique.
6. Changer d'espace puis revenir.

Attendu :

- aucune confusion avec le benchmark ;
- réponse attribuée au bon modèle ;
- bouton verrouillé pendant la génération ;
- réponse conservée au changement d'espace ;
- échec explicite et récupérable ;
- aucune réponse cloud présentée comme locale.

### CU-71 - PromptForge

Prompt de test :

```text
explique vram
```

1. Optimiser le prompt.
2. Vérifier avant/après.
3. Vérifier qu'aucune note arbitraire n'est présentée comme scientifique.
4. Utiliser le prompt optimisé pour le benchmark sans lancer automatiquement.
5. Revenir au dialogue et vérifier l'absence de mélange des historiques.

PromptForge doit rester secondaire par rapport au diagnostic machine.

## 15. Rapport, PDF, MemoryForge et Passport

### CU-80 - Rapport

1. Générer le rapport final après un benchmark réussi.
2. Vérifier qu'il devient visible dans l'espace courant ou dans une destination
   clairement annoncée.
3. Comparer le rapport à l'écran.

Le rapport doit contenir :

- machine ;
- score ;
- modèle conseillé ;
- benchmark exact ;
- runtime ;
- mesure vs estimation ;
- limites ;
- conseil d'upgrade ou absence d'achat utile ;
- version/build ;
- date.

Il ne doit pas contenir :

- autre modèle attribué au benchmark ;
- `0 tok/s` présenté comme preuve réussie ;
- prompt ou réponse privée ;
- chemin personnel ;
- token ;
- faux statut `rapport prêt`.

### CU-81 - PDF

1. Générer le PDF local.
2. Vérifier visuellement sa première page et une page de détail.
3. Vérifier :
   - absence de coupe ;
   - graphiques lisibles ;
   - modèle et VRAM exacts ;
   - conseil d'achat conditionnel ;
   - date et build ;
   - aucune donnée privée.

Ne pas ouvrir un dossier contenant d'autres documents personnels.

### CU-82 - MemoryForge / Obsidian

1. Générer uniquement l'export de test.
2. Vérifier qu'il contient des faits durables et non tout l'historique brut.
3. Vérifier que prompt, sortie modèle, token et chemin privé sont exclus.
4. Vérifier la cohérence des valeurs avec le rapport.

### CU-83 - AI Capability Passport

1. Générer le Passport après le benchmark.
2. Vérifier la version de schéma.
3. Vérifier :
   - matériel ;
   - runtime ;
   - modèles ;
   - benchmark ;
   - date ;
   - build ;
   - empreinte ;
   - frontières de capacité.
4. Modifier l'état de mesure par un nouveau benchmark si raisonnable.
5. Vérifier que l'ancien Passport devient périmé ou doit être régénéré.

L'empreinte prouve l'intégrité du document, pas l'identité du propriétaire ou
de la machine.

### CU-84 - Passerelle locale

Ne pas copier ni exposer le token.

1. Ouvrir le module après un Passport à jour.
2. Vérifier qu'il est désactivé par défaut.
3. Lire le consentement.
4. Démarrer uniquement si le texte garantit :
   - `127.0.0.1` ;
   - lecture seule ;
   - 15 minutes ;
   - aucune installation ;
   - aucun fichier personnel ;
   - aucun backtest ou ordre.
5. Vérifier l'indicateur actif.
6. Arrêter manuellement.

## 16. Upgrade et vérité d'achat

### CU-90 - Conseil actuel

Vérifier que le conseil part de la vraie limite :

- VRAM ;
- RAM ;
- stockage ;
- runtime/pilote ;
- ou aucun achat nécessaire.

Échec P0 si l'app affirme que la machine actuelle possède 12 Go de VRAM alors
qu'elle a détecté une RTX 4080 SUPER 16 Go.

### CU-91 - Simulation

1. Ouvrir le simulateur d'upgrade.
2. Choisir un seul changement raisonnable.
3. Comparer avant/après.
4. Vérifier les modèles nouvellement accessibles.
5. Revenir au matériel actuel.

Attendu :

- simulation étiquetée comme hypothèse ;
- aucun tokens/s inventé ;
- aucun gain si le catalogue ne montre aucun modèle supplémentaire ;
- contraintes carte mère, boîtier, alimentation et connectique présentées comme
  inconnues si elles ne sont pas prouvées ;
- recommandation `n'achetez rien` possible.

## 17. Atelier IA et fonctions avancées

Ce lot vérifie la compréhension et les garde-fous. Il ne doit pas exécuter
Codex, Claude, Kimi ou un modèle lourd.

### CU-100 - Divulgation progressive

1. Ouvrir `Atelier IA`.
2. Vérifier que ces modules n'apparaissent pas dans le parcours débutant :
   - Board Observer ;
   - Workstack Composer ;
   - Capability Router ;
   - ForgeBench ;
   - Workstack Arena ;
   - Evidence Ledger.
3. Vérifier que chaque prérequis manquant possède une explication et un relais.

### CU-101 - Workstack sans exécution

1. Observer une carte de démonstration non privée si l'interface en fournit une.
2. Compiler une Workstack locale.
3. Vérifier rôles, budget, permissions et gate humaine.
4. Ne lancer aucun worker.

Attendu : une Workstack est un plan signé, pas une preuve d'exécution.

### CU-102 - Capability Router

1. Proposer le routage sans exécution.
2. Vérifier que :
   - les modèles installés et versions peuvent être lus ;
   - les tokens, comptes et quotas ne sont pas lus ;
   - `detect_only` n'est pas présenté comme exécutable ;
   - aucun coût API n'est inventé.

### CU-103 - ForgeBench

1. Ouvrir `Comparer des stacks`.
2. Vérifier la tâche publique `Signal Maze v1`.
3. Vérifier que les étapes détaillées sont repliées.
4. Préparer au maximum l'expérience, sans candidat IA ni CLI.
5. Vérifier les termes :
   - public ;
   - visible ;
   - exploratoire ;
   - non scientifique ;
   - aucun vainqueur.

Échec P0 si une référence ou un préflight est présenté comme victoire d'un
modèle.

### CU-104 - Evidence Ledger

1. Ajouter uniquement une preuve correspondant à une étape réellement réalisée.
2. Vérifier la chaîne et l'empreinte.
3. Tenter d'ajouter une étape non réalisée.
4. Vérifier son refus.

Le Ledger ne prouve pas :

- la qualité ;
- l'identité ;
- l'absence absolue de triche ;
- l'inspection humaine d'un code supprimé ;
- un gagnant scientifique.

## 18. Affichage et accessibilité

### CU-110 - Fenêtre desktop compacte

Tester au minimum :

- 1366 x 768 ;
- fenêtre réduite à environ 1024 x 700 ;
- fenêtre maximisée.

Pour chaque taille :

- premier écran ;
- résultat du scan ;
- Benchmark ;
- Modèles ;
- Atelier IA ;
- Rapport.

Attendu :

- aucun chevauchement ;
- aucun bouton hors fenêtre sans moyen de défilement ;
- aucun texte coupé ;
- aucun défilement horizontal global ;
- barre d'espaces utilisable ;
- résultat principal visible avant les détails.

### CU-111 - Échelle Windows

Si possible sans perturber la session, vérifier à 100 % puis 125 %. Ne pas
modifier si Windows exige une déconnexion.

### CU-112 - Clavier

1. Revenir à `Accueil`.
2. Utiliser `Tab`, `Maj+Tab`, `Entrée`, `Espace` et les flèches sur les onglets.
3. Vérifier :
   - ordre logique ;
   - focus visible ;
   - aucun piège clavier ;
   - activation correcte ;
   - pas d'action destructive sur simple focus.

### CU-113 - Texte long et erreurs

Vérifier les états longs déjà présents :

- nom CPU long ;
- version Ollama avec avertissement ;
- modèle Mixtral 8x7B ;
- message d'échec ;
- conseil d'upgrade.

Attendu : retour à la ligne propre, sans recouvrir une commande.

## 19. Résilience et reprise

### CU-120 - Fermeture et relance

1. Noter l'espace, la section, le modèle et le dernier benchmark.
2. Fermer normalement l'application.
3. Relancer.
4. Vérifier :
   - aucun écran blanc ;
   - scan ou cache présenté honnêtement ;
   - historique benchmark conservé ;
   - état d'opération non bloqué ;
   - Passport périmé si nécessaire ;
   - navigation restaurée selon le contrat.

### CU-121 - Réseau indisponible

Ne pas couper le réseau de la machine. Si une erreur réseau naturelle apparaît :

- vérifier que le scan local reste utile ;
- vérifier que le catalogue live est marqué indisponible ;
- vérifier que l'app n'efface pas les modèles locaux ;
- vérifier qu'une reprise est proposée.

### CU-122 - Ollama indisponible

Ne pas arrêter Ollama volontairement. Si Ollama est absent ou indisponible sur
la machine :

- le scan doit terminer ;
- l'installation ou l'ouverture de la procédure doit être explicite ;
- le score matériel ne doit pas devenir zéro ;
- aucun modèle ne doit être présenté comme testé ;
- WSL et Windows doivent rester distingués.

## 20. Distribution publique optionnelle

Ce lot ne remplace pas la recette native.

1. Ouvrir `https://outilsia.fr/telecharger-scanner-ia-local`.
2. Vérifier :
   - Windows et Linux visibles ;
   - version et build ;
   - tailles ;
   - SHA-256 ;
   - sécurité et confidentialité ;
   - lien vers le hub fonctionnel.
3. Cliquer seulement jusqu'au déclenchement de téléchargement de l'artefact
   natif, puis annuler si une copie est déjà installée.
4. Vérifier qu'il n'y a ni 404 ni `Method Not Allowed`.
5. Ne pas exécuter ni remplacer l'application installée.

## 21. Questions de compréhension utilisateur

Après la recette, répondre sans relire la documentation :

1. Que fait le bouton principal ?
2. Quelle est la différence entre compatible et mesuré ?
3. Quel modèle exact a été testé ?
4. Dans quel runtime ?
5. Le benchmark a-t-il réussi ?
6. Quelle action est recommandée ensuite ?
7. L'achat proposé est-il nécessaire ou seulement possible ?
8. Où pose-t-on une question locale ?
9. Où compare-t-on deux modèles ?
10. À quoi servent Passport, ForgeBench et Evidence Ledger ?

Si Computer Use ne peut pas répondre à une question à partir de l'interface,
classer le point comme dette de compréhension, même si la fonction technique
marche.

## 22. Format de `ANOMALIES.csv`

```csv
id,severite,scenario,titre,attendu,observe,reproductible,reprise,capture
```

Exemple :

```csv
LC-001,P1,CU-60,Action de comparaison introuvable,Un bouton visible doit lancer la comparaison,L'état reste non lancé sans action,oui,non,07-recommandation-arena/CU-60-apres.png
```

## 23. Format de `CHRONOLOGIE.csv`

```csv
scenario,debut,fin,duree_secondes,verdict,operation,modele,runtime
```

## 24. Structure du rapport final

Le rapport `RAPPORT-COMPUTER-USE.md` doit suivre exactement cet ordre :

### 1. Verdict exécutif

- 10 lignes maximum ;
- score de confiance sur 100 ;
- état `bloqué`, `candidat testable`, `bêta contrôlée` ou `prêt publication` ;
- principal point fort ;
- principal risque.

### 2. Identité testée

- date ;
- profil machine ;
- matériel détecté ;
- OS ;
- version/build/canal ;
- résolution/échelle ;
- runtimes Ollama.

### 3. Résultats du parcours principal

Tableau :

| Étape | Verdict | Durée | Preuve | Commentaire |
|---|---|---:|---|---|

### 4. Findings

Findings d'abord, triés P0, P1, P2, P3. Pour chaque finding :

- titre ;
- scénario ;
- étapes de reproduction ;
- attendu ;
- observé ;
- impact utilisateur ;
- capture ;
- reprise possible ;
- recommandation précise.

### 5. Vérité des données

Tableau comparant :

- matériel Windows ;
- scan OutilsIA ;
- recommandation ;
- benchmark ;
- rapport ;
- PDF ;
- Passport.

### 6. UX et compréhension

- ce qui est évident ;
- ce qui reste confus ;
- actions invisibles ;
- jargon ;
- densité ;
- cohérence des espaces.

### 7. Vie privée et sécurité

- données lues ;
- données exportées ;
- actions locales ;
- consentements ;
- incidents.

### 8. Fonctions avancées

Pour chaque module :

| Module | Visible | Utilisable | Exécute réellement | Preuve exacte | Limite affichée |
|---|---|---|---|---|---|

### 9. Régressions historiques

Répondre explicitement :

- bouton d'action principal visible et opérant ;
- scan sans boucle ;
- résultat benchmark persistant ;
- rapport visible ;
- alias Ollama exact ;
- runtime Windows/WSL exact ;
- 4080 SUPER à 16 Go ;
- Recommendation Engine lançable ;
- aucun `undefined/100` ;
- aucune contamination GardenArena ;
- fonctions candidates non revendiquées comme publiques.

### 10. Next 5

Cinq actions maximum, ordonnées par impact utilisateur.

### 11. Verdict de publication

Une seule conclusion :

- `GO`
- `GO BETA WITH KNOWN LIMITS`
- `NO-GO`

Justification factuelle en cinq lignes maximum.

## 25. Definition of Done

La mission est terminée seulement si :

- l'application native a été testée ;
- le build est identifié ;
- le scan a été exécuté ;
- les sept espaces ont été parcourus ;
- la vérité matérielle a été contrôlée ;
- au moins un benchmark réel a été tenté ;
- Hermes a été testé s'il était déjà installé ;
- Recommendation Engine a été localisé et exercé si possible ;
- le rapport et le Passport ont été vérifiés si un benchmark a réussi ;
- la navigation compacte et le clavier ont été testés ;
- la reprise après relance a été testée ;
- toutes les anomalies possèdent une preuve ;
- aucune donnée privée n'apparaît dans les livrables ;
- les scénarios non exécutés sont marqués `NOT_RUN` avec raison ;
- le verdict final n'exagère pas ce qui a été prouvé.

## 26. Rappel final à Computer Use

Un écran joli n'est pas une preuve fonctionnelle.

Un bouton présent n'est pas une action réussie.

Un modèle compatible n'est pas un modèle testé.

Un tokens/s estimé n'est pas une mesure.

Un hash n'identifie pas une personne.

Un Ledger n'est pas un audit scientifique.

Un test réussi sur cette machine n'est pas une validation multi-machines.

Rapporte exactement ce qui est visible, mesuré et reproductible.
