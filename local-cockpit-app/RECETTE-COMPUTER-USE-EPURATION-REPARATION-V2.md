# Recette Computer Use V2 - Epuration et réparation du Local Cockpit

Version de la recette : 2.0

Date : 27 juillet 2026

Produit : OutilsIA Local Cockpit, application desktop Tauri/Rust

Mission : auditer le produit natif en boîte noire, épurer son parcours, réparer
les défauts observés, construire un nouveau RC, puis prouver les corrections
dans l'application native.

## Prompt exact à donner à Codex Computer Use

> Lis intégralement le fichier
> `C:\Users\chris\outilsia-repo\local-cockpit-app\RECETTE-COMPUTER-USE-EPURATION-REPARATION-V2.md`.
> Exécute toute la mission dans l'ordre. Commence obligatoirement par une
> recette en boîte noire du RC natif indiqué, sans lire les sources pour
> anticiper les résultats. Gèle les preuves avant de modifier le code. Ensuite,
> corrige les P0, les P1 et les P2 qui nuisent réellement à la compréhension,
> en privilégiant la suppression de bruit, la divulgation progressive et des
> actions explicites. Ajoute un test de non-régression pour chaque correction,
> lance la suite complète, construis un nouveau RC Windows propre, puis rejoue
> les scénarios concernés en boîte noire sur ce nouvel EXE. Ne déploie rien,
> ne publie rien, ne touche à aucun autre produit et ne crée aucun fichier sur
> le Bureau. Ne déclare GO que si le nouveau binaire prouve les corrections.

## 1. Résultat attendu

La mission ne doit pas produire seulement un audit ou une liste d'idées.

Elle doit produire, dans cet ordre :

1. une baseline noire du RC actuel ;
2. un inventaire hiérarchisé des frictions ;
3. des corrections ciblées dans le repo canonique ;
4. des tests automatiques liés aux anomalies observées ;
5. un nouveau RC Windows traçable ;
6. un re-test natif avant/après ;
7. un verdict GO ou NO-GO justifié.

Le but produit est simple :

> En moins de 30 secondes, un débutant doit comprendre sa machine, le modèle
> local à essayer et la prochaine action sûre.

La profondeur technique reste disponible, mais elle ne doit jamais masquer ce
premier résultat.

## 2. Source de vérité et candidat de départ

Repo canonique :

`C:\Users\chris\outilsia-repo`

Application :

`C:\Users\chris\outilsia-repo\local-cockpit-app`

RC de départ :

`C:\Users\chris\Desktop\_OutilsIA\OutilsIA-Local-Cockpit-0.1.2-rc.2-Test\OutilsIA-Local-Cockpit-0.1.2-rc.2-20260727124017-windows-x64-portable.exe`

Manifest RC :

`C:\Users\chris\Desktop\_OutilsIA\OutilsIA-Local-Cockpit-0.1.2-rc.2-Test\release-candidate.json`

Commit attendu pour ce RC :

`e60b45a6582d0ba2b1ce65fc48f8d17c6759040d`

Build attendu :

`20260727124017`

Si ces trois identités ne correspondent pas, classer `BLOCKED_VERSION` et ne
pas attribuer le résultat au RC 2.

## 3. Frontière absolue

### 3.1 Produit autorisé

La mission concerne uniquement OutilsIA Local Cockpit.

Les fichiers autorisés après la phase noire sont :

- `local-cockpit-app/src/index.html`
- `local-cockpit-app/src/app.js`
- `local-cockpit-app/src/styles.css`
- `local-cockpit-app/src-tauri/src/lib.rs` si le défaut est natif
- `local-cockpit-app/scripts/` pour les tests
- `local-cockpit-app/package.json` si un test doit être câblé
- cette recette et les documents de recette du Local Cockpit

Une page OutilsIA peut recevoir plus tard une note candidate, mais seulement
après un test vert et dans une mission distincte. Cette recette ne déploie pas.

### 3.2 Produits interdits

Ne jamais ouvrir, modifier, tester ou mentionner comme fonctionnalité interne :

- GardenArena ;
- Garden ;
- Fable Joint Sentinel ;
- Strategy Arena, sauf le contrat d'export en lecture seule déjà présent ;
- ScoreLook ;
- ScoreCredit ;
- Vigi-Sky ;
- Dragon Labyrinth ;
- Pac-Man ;
- un autre site ou dépôt.

Toute contamination GardenArena ou logique de jeu dans le Local Cockpit est P0.

### 3.3 Fichiers étrangers à ignorer

Ne pas ajouter, supprimer ou modifier les éléments non suivis suivants :

- `.claude/`
- `AGENTS.md`
- `CLAUDE.md`
- `server-work/static/games/`

Ne jamais utiliser `git clean`, `git reset --hard`, `git checkout --` ou une
commande de suppression globale.

## 4. Actions interdites

- Aucun déploiement.
- Aucun remplacement de la release publique 0.1.1.
- Aucun push forcé.
- Aucun achat ou clic affilié.
- Aucune suppression de modèle.
- Aucune installation de pilote.
- Aucun changement CUDA, ROCm, Vulkan, WSL, BIOS, ReBAR, XMP ou EXPO.
- Aucun changement de pare-feu, DNS, Cloudflare, nginx ou service VPS.
- Aucun partage public de rapport.
- Aucun accès à des documents personnels.
- Aucun benchmark d'un modèle absent qui déclencherait un gros téléchargement.
- Aucun test financier, backtest ou export TradingView.
- Aucun changement visuel global sans finding noir préalable.

## 5. Actions autorisées

Pendant la baseline noire :

- lancer et fermer le RC portable ;
- redimensionner la fenêtre ;
- analyser la machine ;
- naviguer dans les sept espaces ;
- utiliser des modèles déjà installés ;
- lancer un benchmark court après préflight et second consentement ;
- poser une question locale neutre ;
- générer un rapport local et un aperçu PDF ;
- tester les états vides, historiques, bloqués et avancés ;
- prendre des captures sans données privées.

Après gel de la baseline :

- lire les sources ;
- modifier uniquement les fichiers autorisés ;
- ajouter des tests ;
- exécuter les tests ;
- créer un commit local propre ;
- construire le prochain RC ;
- tester le nouveau RC en boîte noire.

## 6. Discipline des trois phases

### Phase A - Boîte noire

Interdictions supplémentaires :

- ne pas lire `app.js`, `styles.css`, `index.html` ou `lib.rs` ;
- ne pas ouvrir les DevTools ;
- ne pas utiliser une fixture HTML ;
- ne pas déduire un succès depuis un test existant ;
- ne pas modifier les fichiers.

À la fin de la phase A, écrire et fermer :

- `BASELINE.md`
- `ANOMALIES.csv`
- `CAPTURES-AVANT.md`
- `MESURES-AVANT.csv`

Une fois écrits, ces fichiers ne doivent plus être réécrits pour embellir le
résultat. Une correction ultérieure apparaît uniquement dans les preuves
`APRES`.

### Phase B - Réparation

Pour chaque finding retenu :

1. localiser la cause réelle ;
2. choisir le plus petit correctif cohérent ;
3. préserver les fonctions existantes ;
4. ajouter une assertion de non-régression ;
5. exécuter le test ciblé ;
6. exécuter la suite complète ;
7. documenter ce qui a réellement changé.

### Phase C - Nouveau RC et re-test

Le nouveau RC doit :

- provenir d'un commit propre ;
- avoir un numéro RC supérieur au RC 2 ;
- avoir un nouveau build ID ;
- exposer la version 0.1.2 ;
- être non public ;
- démarrer comme application native ;
- passer les scénarios corrigés ;
- ne pas régresser le scan, Hermes, le rapport ou les runtimes.

## 7. Doctrine d'épuration

Epurer ne signifie pas supprimer la puissance du produit.

Epurer signifie :

- montrer d'abord la décision ;
- replier les détails ;
- retirer les doublons ;
- transformer les statuts morts en actions ;
- déplacer les modules experts dans l'espace adapté ;
- limiter les boutons concurrents ;
- employer un vocabulaire utilisateur ;
- rendre chaque action observable ;
- conserver les preuves et limites.

### 7.1 Règle du premier écran

Avant tout scroll, un nouvel utilisateur doit voir :

1. le nom du produit ;
2. une phrase de promesse ;
3. une action principale unique ;
4. après scan, CPU, RAM, GPU et VRAM ;
5. le verdict ;
6. le modèle recommandé ;
7. la prochaine action.

Ne doivent pas apparaître avant le résultat principal :

- une console ;
- un journal technique ;
- ForgeBench ;
- Evidence Ledger ;
- Workstack ;
- une longue liste de modèles ;
- une shopping list ;
- des détails de pairing ;
- plusieurs CTA de même poids.

### 7.2 Budget visuel du mode Essentiel

Dans chaque espace :

- une action primaire maximum ;
- deux actions secondaires maximum dans le premier viewport ;
- quatre preuves synthétiques maximum avant les détails ;
- aucun groupe de plus de six boutons visibles sans repli ;
- aucune carte imbriquée dans une autre carte ;
- aucun titre technique plus grand que le besoin utilisateur ;
- aucun texte tronqué par points de suspension si la donnée décide du résultat ;
- aucun statut `non lancé` sans bouton adjacent ou explication du prérequis.

### 7.3 Budget de longueur

À 1183 x 811 :

- Accueil en mode Essentiel : maximum 2,5 hauteurs de fenêtre ;
- Machine en mode Essentiel : maximum 3 hauteurs ;
- Modèles en mode Essentiel : maximum 3 hauteurs ;
- Tests en mode Essentiel : maximum 3 hauteurs ;
- Assistant en mode Essentiel : maximum 2,5 hauteurs ;
- Atelier IA peut être plus long, mais ses familles doivent être repliées ;
- Compte en mode Essentiel : maximum 2,5 hauteurs.

Mesurer par nombre de scrolls plein écran nécessaires, pas par impression
subjective.

### 7.4 Règle de duplication

Une information centrale ne doit pas être répétée plus de deux fois dans le
même espace :

- score machine ;
- GPU / VRAM ;
- modèle recommandé ;
- preuve tokens/s ;
- upgrade prioritaire ;
- prochaine action.

Si elle apparaît trois fois ou plus sans apporter de contexte nouveau, classer
`DUPLICATION`.

### 7.5 Règle d'action

Chaque bouton doit appartenir à une seule catégorie :

- naviguer ;
- préparer ;
- exécuter ;
- exporter ;
- supprimer.

Le libellé doit annoncer la catégorie réelle.

Un bouton de navigation ne lance jamais :

- benchmark ;
- installation ;
- téléchargement ;
- suppression ;
- partage ;
- écriture dans le compte.

Un bouton qui prépare doit ouvrir un préflight.

Un bouton qui exécute doit montrer :

- l'objet exact ;
- le runtime exact ;
- le budget ou délai ;
- une progression ;
- une issue ;
- une possibilité d'annuler si l'opération est longue.

## 8. Vérité produit obligatoire

### 8.1 Fait actuel contre historique

Après un scan :

- l'inventaire courant décide si un modèle est installé ;
- un ancien benchmark reste visible uniquement comme mesure historique ;
- l'historique ne peut pas transformer un modèle absent en modèle installé ;
- le rapport doit conserver ce statut.

### 8.2 Mesure contre estimation

Libellés obligatoires :

- `mesuré` pour une métrique Ollama réelle ;
- `historique` pour une ancienne mesure ;
- `estimé` pour une compatibilité ou un besoin matériel ;
- `heuristique` pour PromptForge ;
- `inconnu` quand la sonde ne répond pas ;
- `non prouvé` pour un offload absent.

Interdictions :

- un tokens/s inventé ;
- une VRAM inconnue transformée en zéro ;
- de la RAM unifiée appelée VRAM dédiée ;
- un pilote CUDA présenté comme preuve d'offload ;
- un score ForgeBench présenté comme scientifique ;
- un SHA présenté comme signature d'identité.

### 8.3 Etat final

Une action réussie doit laisser un état visible et persistant :

- benchmark : résultat et provenance ;
- dialogue : réponse complète ou avertissement d'incomplétude ;
- rapport : confirmation et destination ;
- export : fichier ou confirmation ;
- échec : raison et bouton de reprise.

## 9. Dossier de travail

Créer :

`C:\Users\chris\Downloads\OutilsIA-Computer-Use-Epuration\AAAA-MM-JJ_HHMM\`

Structure :

```text
00-identite/
01-avant-premier-ecran/
02-avant-scan/
03-avant-espaces/
04-avant-actions/
05-avant-responsive/
06-reparation/
07-tests-automatiques/
08-build-rc/
09-apres-premier-ecran/
10-apres-parcours/
11-apres-responsive/
12-verdict/
```

Livrables :

```text
BASELINE.md
ANOMALIES.csv
MESURES-AVANT.csv
CAPTURES-AVANT.md
PLAN-REPARATION.md
CHANGEMENTS.csv
TESTS.md
MESURES-APRES.csv
CAPTURES-APRES.md
COMPARATIF-AVANT-APRES.md
RAPPORT-FINAL.md
```

Ne rien créer sur le Bureau. Les RC générés par le script peuvent rester dans
`Desktop\_OutilsIA`, qui est leur emplacement produit prévu.

## 10. Préflight de la mission

### EP-00 - Identité

1. Vérifier le hash du RC de départ dans `SHA256SUMS.txt`.
2. Lancer le portable depuis le kit RC 2.
3. Ouvrir l'identité de build.
4. Capturer version, build ID et canal.
5. Confirmer que la release publique reste 0.1.1.

Verdict :

- `PASS` si version, build et canal correspondent ;
- `BLOCKED_VERSION` sinon.

### EP-01 - Etat initial

Noter sans modifier :

- résolution de la fenêtre ;
- zoom ou échelle visible si connue ;
- Ollama Windows disponible ou non ;
- Ollama WSL disponible ou non ;
- nombre de modèles détectés ;
- présence de `hermes3:8b` ;
- présence de `qwen3:0.6b` dans le scan courant ;
- dernier benchmark historique visible.

Ne pas installer de modèle pour compléter la recette.

## 11. Test des dix premières secondes

### EP-10 - Compréhension immédiate

Lancer l'application dans un état propre.

Sans cliquer et sans scroller, répondre dans `BASELINE.md` :

1. Quel est le but du produit ?
2. Quelle action faut-il faire ?
3. Que va lire l'application ?
4. Une action locale va-t-elle démarrer automatiquement ?
5. Où voit-on la différence entre Essentiel et Détails ?

Echec P1 si deux réponses ou plus sont impossibles à déduire de l'écran.

### EP-11 - Carte thermique visuelle

Sur la capture du premier écran, annoter :

- premier élément regardé ;
- deuxième élément regardé ;
- action primaire perçue ;
- éléments qui rivalisent avec elle ;
- jargon avant le scan ;
- zone vide excessive ;
- zone trop dense ;
- texte coupé.

Ne pas modifier la capture originale. Produire une copie annotée.

## 12. Scan et résultat immédiat

### EP-20 - Scan unique

1. Cliquer une seule fois sur l'action d'analyse.
2. Mesurer le temps jusqu'au résultat.
3. Déplacer légèrement la fenêtre pendant l'opération.
4. Vérifier la progression.
5. Ne pas ouvrir de console.
6. Capturer le premier état complet.

Attendu :

- fenêtre réactive ;
- résultat en moins de 90 secondes ;
- matériel placé près de l'action ;
- aucune ligne de suivi inutile au-dessus du résultat ;
- aucune action cachée lancée après le scan.

### EP-21 - Vérité machine

Vérifier :

- AMD Ryzen 7 7800X3D ;
- RAM détectée autour de 63/64 Go ;
- NVIDIA GeForce RTX 4080 SUPER ;
- 16 Go VRAM ;
- Windows 11 ;
- Ollama Windows et WSL distingués ;
- aucun palier 12 Go présenté comme VRAM réelle de la 4080 SUPER.

Un palier d'upgrade 12 Go peut être expliqué comme catégorie, mais ne doit pas
ressembler au matériel détecté.

### EP-22 - Résultat en 30 secondes

Après le scan, chronométrer 30 secondes et répondre :

- score ;
- verdict ;
- modèle recommandé ;
- preuve mesurée existante ;
- prochaine action ;
- achat utile ou inutile.

Echec P1 si le résultat exige l'ouverture de Détails.

### EP-23 - Densité après scan

Compter avant le premier scroll :

- nombres de boutons ;
- nombres de cartes ;
- nombres de messages de statut ;
- nombres de répétitions du score ;
- nombres de répétitions du modèle recommandé ;
- nombres de termes techniques non expliqués.

Seuils :

- plus de 6 boutons : finding P2 ;
- plus de 6 cartes concurrentes : finding P2 ;
- plus de 2 statuts pour la même action : finding P2 ;
- plus de 2 répétitions identiques : finding P2 ;
- un terme technique qui bloque la décision : P1.

## 13. Audit des sept espaces

Les espaces attendus sont :

1. Accueil ;
2. Machine ;
3. Modèles ;
4. Tests ;
5. Assistant ;
6. Atelier IA ;
7. Compte.

### EP-30 - Navigation

Pour chaque espace :

1. cliquer son onglet ;
2. vérifier l'état actif ;
3. noter le titre principal ;
4. noter l'action primaire ;
5. compter les scrolls ;
6. revenir à Accueil ;
7. vérifier qu'aucune opération n'a démarré.

Tester aussi :

- flèches gauche/droite dans le tablist ;
- `Tab` ;
- `Shift+Tab` ;
- `Enter` ;
- `Espace` ;
- focus visible.

### EP-31 - Accueil

Doit contenir :

- décision machine ;
- preuve principale ;
- modèle recommandé ;
- prochaine action ;
- rapport final quand généré.

Doit éviter :

- listes techniques ;
- catalogue complet ;
- Workstacks ;
- historique détaillé ;
- options de compte envahissantes.

### EP-32 - Machine

Doit contenir :

- CPU, RAM, GPU, VRAM, OS ;
- Hardware Doctor ;
- runtime et pilotes ;
- upgrade justifié ;
- détails repliables.

Doit éviter :

- plusieurs verdicts incompatibles ;
- achat avant diagnostic ;
- simulation présentée comme fait ;
- répétition intégrale du Bilan.

### EP-33 - Modèles

Doit contenir :

- modèles installés actuels ;
- modèles compatibles ;
- taille et runtime ;
- action claire par modèle ;
- catalogue secondaire.

Doit éviter :

- modèle historique marqué installé ;
- trois boutons équivalents par carte ;
- `Tester` qui lance sans préflight ;
- modèle optionnel plus visible que le recommandé.

### EP-34 - Tests

Doit contenir :

- premier test ;
- benchmark ;
- Arena ;
- résultat persistant ;
- progression et annulation.

Doit éviter :

- démarrage par navigation ;
- résultat qui disparaît ;
- plusieurs preuves appelées `score` sans méthode ;
- préflight sous le pli sans indication.

### EP-35 - Assistant

Doit contenir :

- PromptForge ;
- dialogue local ;
- historique local ;
- MemoryForge en secondaire.

Doit éviter :

- réponse coupée silencieusement ;
- note PromptForge présentée comme benchmark ;
- confusion entre modèle sélectionné et modèle réellement interrogé ;
- prompt privé ajouté automatiquement à un export.

### EP-36 - Atelier IA

Doit rester expert et replié.

Familles possibles :

- Passport et passerelle ;
- Board Observer / Workstack ;
- Capability Router ;
- ForgeBench ;
- Workstack Arena ;
- Evidence Ledger.

Attendu :

- résumé lisible avant les étapes ;
- prérequis adjacent ;
- aucune exécution au simple affichage ;
- aucun faux résultat scientifique ;
- aucun autre produit fusionné ;
- une fonction non prête clairement indiquée comme candidate ou bloquée.

Echec P1 si Atelier IA domine le produit principal.

### EP-37 - Compte

Doit contenir :

- état connecté ou non connecté ;
- sauvegarde volontaire ;
- rapports ;
- feedback ;
- mise à jour.

Doit éviter :

- demander une connexion avant le scan ;
- confondre rapport local et rapport partagé ;
- sauvegarder sans consentement ;
- afficher un chemin personnel.

## 14. Régressions obligatoires LC-001 à LC-006

Ces six vérifications sont non négociables.

### EP-40 - LC-001 CPU long

Le nom complet du Ryzen doit :

- revenir à la ligne ;
- rester lisible ;
- ne pas déborder ;
- ne pas déplacer les autres cellules au survol.

### EP-41 - LC-002 historique qwen

Si `qwen3:0.6b` est absent du scan courant mais possède un historique :

- afficher `Mesure historique` ;
- afficher `modèle absent du scan actuel` ;
- ne jamais afficher `installé` ;
- proposer une installation ou une autre action cohérente ;
- exporter le même statut dans le rapport.

### EP-42 - LC-003 second consentement

Depuis Accueil ou une recommandation :

1. cliquer `Préparer le benchmark` ou équivalent ;
2. vérifier qu'aucun tokens/s ne change ;
3. vérifier qu'aucune progression ne démarre ;
4. vérifier que Tests s'ouvre ;
5. vérifier le modèle et le runtime ;
6. seulement ensuite cliquer le bouton d'exécution.

Tout lancement au premier clic est P1.

### EP-43 - LC-006 rapport visible

Après `Générer le rapport final` :

- une confirmation persistante apparaît ;
- l'heure ou un état daté est visible ;
- l'action suivante change ;
- la destination est nommée ;
- PDF, MemoryForge, Copier et Partager utilisent ce rapport ;
- un second clic ne crée pas un état contradictoire.

### EP-44 - LC-004 PromptForge

Le résultat doit dire :

- `grille heuristique locale` ;
- ce qui a été vérifié ;
- que ce n'est pas un benchmark du modèle ;
- que ce n'est pas une note scientifique.

### EP-45 - LC-005 dialogue complet

Utiliser ce prompt :

```text
Réponds en français en exactement 8 lignes. Explique pourquoi 16 Go de VRAM ne
signifient pas que tous les modèles 32B seront rapides, puis termine par :
FIN DU TEST OUTILSIA
```

Attendu :

- la fin est visible si Ollama la renvoie ;
- les retours à la ligne sont conservés ;
- une limite `length` ou un timeout produit `Réponse incomplète` ;
- Copier et MemoryForge utilisent la même réponse ;
- l'historique ne remplace pas le texte complet par un aperçu de 700 caractères.

## 15. Parcours principal complet

### EP-50 - Modèle recommandé

1. Depuis Accueil, préparer le modèle recommandé.
2. Vérifier sa référence exacte.
3. Vérifier Windows ou WSL.
4. Refuser tout téléchargement inattendu.
5. Vérifier le préflight.
6. Lancer seulement si le modèle est déjà installé.

### EP-51 - Benchmark Hermes

Si `hermes3:8b` est installé :

1. préparer le test ;
2. capturer le préflight ;
3. lancer avec le second clic ;
4. vérifier le progrès ;
5. attendre au maximum 60 secondes ;
6. capturer tokens/s, latence, runtime et placement ;
7. vérifier la persistance après changement d'espace.

Ne pas exiger exactement 116,5 tok/s. Comparer seulement l'ordre de grandeur et
la provenance, car les performances varient.

### EP-52 - Recommandation Engine

Tester le profil `Polyvalent` ou `Chat`.

Attendu :

- deux modèles maximum présélectionnés ;
- aucun téléchargement ;
- même protocole ;
- résultat mesuré ;
- confiance et limites ;
- pas de vainqueur universel ;
- action suivante compréhensible.

### EP-53 - Arena

Ne lancer que si tous les modèles sont déjà installés et si le budget global est
visible.

Vérifier :

- exécution séquentielle ;
- annulation ;
- modèle exact ;
- runtime exact ;
- succès et échecs conservés ;
- aucun échec transformé en score zéro sans explication.

## 16. Etats négatifs et reprise

### EP-60 - Double clic

Double-cliquer rapidement sur :

- analyser ;
- préparer benchmark ;
- lancer benchmark ;
- générer rapport.

Attendu :

- une seule opération ;
- bouton désactivé pendant l'exécution ;
- aucun résultat dupliqué ;
- aucune transition incohérente.

### EP-61 - Modèle absent

Choisir un modèle absent sans accepter l'installation.

Attendu :

- `Préparer installation + test` ou équivalent ;
- taille et runtime ;
- préflight ;
- aucune exécution ;
- retour possible.

### EP-62 - Ollama indisponible

Ne pas arrêter Ollama depuis cette recette.

Tester seulement un état déjà indisponible s'il se présente naturellement.

Attendu :

- diagnostic clair ;
- bouton de reprise ;
- aucune attente de 45 secondes sans retour ;
- aucune commande système cachée.

Sinon marquer `NOT_RUN`.

### EP-63 - Réseau indisponible

Ne pas couper le réseau Windows.

Si une route réseau échoue naturellement :

- le scan local reste utile ;
- les modules cloud indiquent leur limite ;
- aucun état local n'est effacé.

Sinon marquer `NOT_RUN`.

### EP-64 - Fermeture et relance

1. fermer proprement ;
2. relancer ;
3. vérifier le temps ;
4. vérifier l'absence de fenêtre blanche ;
5. vérifier que l'historique reste historique ;
6. vérifier qu'un scan courant est demandé avant une nouvelle décision.

## 17. Responsive et stabilité visuelle

Tester au minimum :

- 1920 x 1050 ;
- 1366 x 768 ;
- 1280 x 720 ;
- 1024 x 768 ;
- fenêtre étroite autour de 900 x 700.

Ne pas modifier l'échelle Windows globale.

### EP-70 - Non-chevauchement

Pour chaque taille :

- aucun bouton sur un texte ;
- aucun menu hors écran ;
- aucun scroll horizontal ;
- aucun label coupé ;
- aucun tooltip indispensable ;
- aucune carte qui change de hauteur au survol ;
- aucune action principale inaccessible.

### EP-71 - Texte long

Vérifier :

- CPU ;
- GPU ;
- version Ollama ;
- nom de modèle Mixtral ;
- message d'erreur ;
- état runtime WSL ;
- avertissement de réponse incomplète.

### EP-72 - Mouvement de mise en page

Observer avant/après :

- chargement ;
- scan ;
- hover ;
- benchmark ;
- génération rapport ;
- ouverture des détails.

Un texte dynamique ne doit pas déplacer brutalement l'action en cours.

### EP-73 - Contraste et focus

Vérifier :

- texte secondaire lisible ;
- focus clavier visible ;
- état actif non fondé uniquement sur la couleur ;
- bouton désactivé identifiable ;
- succès, avertissement et erreur distinguables.

## 18. Questions de novice

Après la baseline, répondre sans consulter le code :

1. Est-ce que le PC est prêt ?
2. Quel modèle tester en premier ?
3. Quel modèle garder pour un assistant ?
4. Ollama utilise-t-il le GPU ?
5. Une mesure est-elle actuelle ou historique ?
6. Faut-il acheter quelque chose ?
7. Où lancer le benchmark ?
8. Où poser une question locale ?
9. Où retrouver le rapport ?
10. À quoi sert Atelier IA ?

Pour chaque réponse :

- `0` impossible ;
- `1` possible après recherche ;
- `2` immédiate.

Score attendu avant GO : au moins 17/20.

## 19. Priorisation des réparations

### P0

- donnée matérielle fausse ;
- mauvaise machine ;
- mauvaise VRAM ;
- mauvaise référence modèle ;
- mauvais runtime exécuté ;
- action destructive implicite ;
- fuite privée ;
- contamination produit ;
- rapport mensonger ;
- blocage sans reprise.

### P1

- parcours principal incompréhensible ;
- action cachée ;
- exécution sans consentement ;
- rapport invisible ;
- état historique présenté comme actuel ;
- action principale hors écran ;
- résultat qui disparaît ;
- interface inutilisable à 1366 x 768 ;
- onglet ou clavier bloqué.

### P2

- duplication ;
- jargon évitable ;
- densité ;
- hiérarchie ;
- texte tronqué ;
- statut non actionnable ;
- libellé ambigu ;
- contraste faible ;
- scroll excessif.

### P3

- cosmétique sans impact sur la décision.

Réparer :

- tous les P0 ;
- tous les P1 ;
- les P2 qui réduisent clairement le bruit ou ferment une ambiguïté ;
- les P3 seulement s'ils sont dans le même composant déjà modifié.

## 20. Règles de modification

### 20.1 Réduire avant d'ajouter

Avant d'ajouter un composant, vérifier si le problème peut être résolu par :

- renommer ;
- déplacer ;
- replier ;
- fusionner ;
- supprimer un doublon ;
- rendre un état existant actionnable.

### 20.2 Préserver les fonctions

Ne pas supprimer Workstacks, ForgeBench, Passport, Evidence Ledger ou un autre
module avancé uniquement parce qu'il est complexe.

Les déplacer derrière :

- l'espace Atelier IA ;
- le mode Détails ;
- un accordéon ;
- un prérequis explicite.

### 20.3 Pas de refonte globale

Une refonte globale n'est autorisée que si au moins trois P1 indépendants ont
la même cause structurelle et qu'un patch ciblé ne peut pas les résoudre.

Sinon, conserver :

- palette ;
- typographie ;
- structure des sept espaces ;
- composants existants ;
- contrats de données ;
- navigation clavier.

### 20.4 Commenter seulement la complexité

Ajouter des commentaires uniquement pour :

- état historique contre courant ;
- consentement à deux clics ;
- bornage de sortie ;
- orchestration d'une opération longue.

## 21. Tests obligatoires après réparation

Pour chaque bug :

- un test doit échouer avant le correctif ou reproduire le défaut ;
- le même test doit passer après ;
- le test doit vérifier le comportement, pas une chaîne de code isolée.

Suite minimale :

```text
npm run verify:computer-use-regressions
npm run verify:workspace-navigation
npm run verify:visual
npm run verify:scanned-state-ui
npm run verify:activation-funnel
npm run verify:app-core
```

Exécuter les tests Python/Playwright depuis Ubuntu WSL pour conserver
l'environnement déjà validé :

```powershell
wsl.exe -d Ubuntu --cd /mnt/c/Users/chris/outilsia-repo/local-cockpit-app bash -lc "npm run verify:app-core"
```

Rust natif Windows :

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd C:\Users\chris\outilsia-repo\local-cockpit-app
cargo test --lib --manifest-path .\src-tauri\Cargo.toml
```

Si un test échoue :

- ne pas le désactiver ;
- ne pas relâcher son assertion sans justification ;
- déterminer s'il révèle une régression ou un contrat périmé ;
- documenter la décision.

## 22. Contrôle git avant build

Depuis le repo canonique :

```text
git status --short
git diff --check
git diff --stat
```

Exigences :

- aucun fichier étranger ajouté ;
- aucun changement généré non compris ;
- aucun secret ;
- aucun binaire suivi dans le commit ;
- commit limité au Local Cockpit et à ses tests ;
- arbre suivi propre avant build.

Le commit doit expliquer le résultat utilisateur, pas seulement le nom interne
du module.

Exemple :

`Simplify Local Cockpit core journeys`

## 23. Construction du nouveau RC

Déterminer le prochain numéro RC libre. Ne jamais écraser le RC 2.

PowerShell Windows :

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\node-portable\node-v22.23.1-win-x64;$env:USERPROFILE\.cargo\bin;$env:Path"
cd C:\Users\chris\outilsia-repo\local-cockpit-app
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows-release-candidate.ps1 -RcNumber NUMERO -SkipInstall
```

Le script doit produire :

- portable EXE ;
- setup EXE ;
- MSI ;
- manifest RC ;
- SHA-256 ;
- kit de test ;
- ZIP du kit.

Refuser le build si :

- source suivie sale ;
- version différente de 0.1.2 ;
- build ID absent ;
- artefact manquant ;
- hash incohérent ;
- provenance ne pointe pas vers le commit de correction.

Le statut `not_signed` est acceptable pour un RC privé, mais doit rester visible.

## 24. Smoke natif avant re-test

1. lancer le portable du nouveau kit ;
2. attendre huit secondes ;
3. vérifier le titre de fenêtre ;
4. vérifier version 0.1.2 ;
5. vérifier l'absence de fermeture précoce ;
6. fermer proprement ;
7. relancer pour la phase C.

Le smoke ne remplace jamais Computer Use.

## 25. Re-test après réparation

Rejouer au minimum :

- EP-10 ;
- EP-20 à EP-23 ;
- EP-30 à EP-37 ;
- EP-40 à EP-45 ;
- EP-50 et EP-51 ;
- EP-64 ;
- EP-70 à EP-73 ;
- questionnaire novice.

Pour chaque finding :

```text
ID
Avant
Correctif
Test automatique
Preuve native après
Régression observée
Verdict
```

Une capture après ne doit jamais remplacer la capture avant.

## 26. Format des fichiers

### ANOMALIES.csv

```csv
id,severite,phase,espace,titre,attendu,observe,reproductible,capture,statut
```

Statuts :

- `OPEN`
- `FIXED_CODE`
- `FIXED_TESTED`
- `NOT_FIXED`
- `WONT_FIX_JUSTIFIED`
- `NOT_RUN`

### CHANGEMENTS.csv

```csv
finding,fichier,zone,type,raison,test_associe,risque
```

### MESURES-AVANT.csv et MESURES-APRES.csv

```csv
metric,viewport,workspace,before_or_after,value,unit,evidence
```

Métriques minimales :

- temps de scan ;
- boutons premier viewport ;
- cartes premier viewport ;
- scrolls par espace ;
- score novice ;
- temps jusqu'au modèle recommandé ;
- temps jusqu'au préflight benchmark ;
- temps jusqu'au rapport visible ;
- erreurs visibles ;
- chevauchements ;
- scroll horizontal.

## 27. Score de sortie

Le score mesure la confiance dans le parcours, pas la qualité universelle du
produit.

| Axe | Points |
|---|---:|
| Vérité matériel, modèle, runtime et preuve | 25 |
| Compréhension du premier parcours | 25 |
| Consentement, feedback et reprise | 20 |
| Densité, hiérarchie et divulgation progressive | 15 |
| Résilience et persistance | 10 |
| Clavier, contraste et responsive | 5 |
| Total | 100 |

Règles :

- un P0 plafonne à 49 ;
- un P1 ouvert plafonne à 79 ;
- un scénario principal `NOT_RUN` plafonne à 89 ;
- GO exige 90/100 minimum ;
- GO exige zéro P0 et zéro P1 ;
- GO exige les six régressions LC fermées sur le nouveau RC ;
- GO exige tests automatiques verts et preuve native.

## 28. Format du rapport final

`RAPPORT-FINAL.md` doit contenir :

### 1. Verdict

- GO ou NO-GO ;
- score ;
- version et build ;
- commit ;
- hash du kit ;
- signature ou absence de signature.

### 2. Ce qui a été épuré

Maximum dix lignes, avec impacts utilisateur.

### 3. Findings avant

Table P0/P1/P2/P3.

### 4. Corrections

Table finding, cause, fichiers, test, preuve.

### 5. Comparatif avant/après

Inclure :

- premier écran ;
- scan ;
- modèle recommandé ;
- benchmark ;
- rapport ;
- Assistant ;
- responsive ;
- score novice.

### 6. Vérité produit

Confirmer :

- scan courant ;
- historique ;
- mesure ;
- estimation ;
- heuristique ;
- output incomplet ;
- runtime ;
- placement GPU.

### 7. Régressions

Lister chaque module touché et les scénarios non régressés.

### 8. Restes

Seulement des points observés, pas une liste d'idées générales.

### 9. Next 5

Actions concrètes, ordonnées et bornées.

### 10. Décision de publication

La décision peut être :

- `NO-GO`
- `RC_RETEST_REQUIRED`
- `READY_FOR_HUMAN_REVIEW`

La recette ne peut jamais publier elle-même.

## 29. Definition of Done

La mission est terminée seulement si :

- baseline noire figée ;
- captures avant conservées ;
- anomalies hiérarchisées ;
- P0/P1 corrigés ou NO-GO explicite ;
- P2 d'épuration utiles traités ;
- aucun autre produit touché ;
- aucun fichier privé exporté ;
- tests ciblés verts ;
- `verify:app-core` vert ;
- `cargo test --lib` vert sous Windows ;
- commit propre ;
- nouveau RC produit ;
- SHA vérifié ;
- smoke natif réussi ;
- re-test Computer Use réalisé ;
- captures après conservées ;
- rapport avant/après complet ;
- aucun déploiement ;
- aucun remplacement de la release publique.

## 30. Rappels finaux

Ne pas confondre :

- joli et clair ;
- visible et fonctionnel ;
- compatible et testé ;
- historique et actuel ;
- estimé et mesuré ;
- heuristique et scientifique ;
- SHA et signature ;
- RC privé et release publique ;
- module avancé et parcours principal.

La meilleure correction peut être de retirer un doublon.

La meilleure fonction avancée peut rester repliée.

La meilleure recommandation peut être de ne rien acheter.

La mission réussit quand l'utilisateur comprend plus vite sans perdre les
preuves, les limites ou la puissance du cockpit.
