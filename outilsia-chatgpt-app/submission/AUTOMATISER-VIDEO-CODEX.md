# Automatiser la vidéo de soumission avec l'app Codex

## Objectif

Produire une démonstration réelle et reviewer-ready de `OutilsIA Local
Cockpit` dans ChatGPT Developer Mode.

Livrable attendu :

```text
C:\Users\chris\Downloads\OutilsIA-ChatGPT-Submission\
demo-outilsia-chatgpt-local-cockpit.mp4
```

La vidéo doit montrer les trois outils d'analyse, le widget OutilsIA et un
refus hors périmètre. Elle ne doit montrer aucun email, token, écran Persona,
identifiant interne ou autre onglet personnel.

## Incident connu et correctif

Le premier essai du 25 juillet 2026 a échoué après un appel outil pourtant
réussi :

```text
Erreur lors du chargement de l'appli
Failed to fetch template
```

Cause confirmée : le plugin enregistré dans ChatGPT avait conservé
`ui://outilsia/machine-cockpit-v2.html`, tandis que le serveur public annonçait
déjà `ui://outilsia/machine-cockpit-v3.html`. L'appel métier fonctionnait, mais
ChatGPT tentait ensuite de lire un template `v2` absent.

Le serveur `0.2.2` garde désormais `v3` comme ressource officielle et sert
aussi `v2` comme alias rétrocompatible. Malgré cet alias, il faut actualiser le
plugin avant la vidéo afin que le catalogue ChatGPT pointe vers `v3`.

## Architecture d'automatisation

- `@Computer` : pilote uniquement la fenêtre Brave dans laquelle ChatGPT et le
  plugin OutilsIA sont déjà connectés.
- `OUTILSIA-VIDEO-RECORDER.ps1` : minimise les autres fenêtres, maximise Brave,
  calcule sa zone écran puis lance FFmpeg sans overlay.
- PowerShell : démarre et arrête proprement FFmpeg, puis vérifie le MP4 avec
  `ffprobe`.
- Humain : valide visuellement la vidéo avant toute publication.

Ne pas utiliser Playwright pour cette recette : la preuve attendue porte sur la
vraie session ChatGPT connectée, les appels MCP et le widget rendu. Ne pas
fabriquer une vidéo à partir de captures ou de réponses simulées.

Ne pas utiliser Xbox Game Bar : son overlay appartient à `GameBar.exe` et n'est
pas pilotable de façon fiable par Computer Use lorsqu'il contrôle Brave.

## Préconditions

1. Windows reste déverrouillé pendant toute l'opération.
2. L'app Codex est ouverte avec le plugin `Computer Use` actif.
3. Brave est ouvert sur la session ChatGPT déjà connectée.
4. `OutilsIA Local Cockpit` est connecté dans ChatGPT Developer Mode.
5. FFmpeg est installé. Le script sait retrouver automatiquement l'installation
   `Gyan.FFmpeg` créée par `winget`, même si le terminal n'a pas rechargé son
   `PATH`.
6. Les notifications Windows et Brave sont désactivées temporairement.
7. Tous les onglets contenant un email, un compte, Persona, GitHub ou le
   portail OpenAI sont fermés.
8. Le zoom Brave est à 100 % et la fenêtre est au moins en 1440 x 900.
9. Dans la fiche du plugin, `Modèle de sortie` indique `v3` ou encore `v2`.
   Les deux URI sont servies par le serveur public `0.2.2` ; la réussite du
   préflight visuel est le critère décisif.

Si une précondition échoue, s'arrêter et expliquer précisément laquelle. Ne
pas improviser un autre compte, un autre plugin ou une fausse démonstration.

## Prompt à donner à Codex

Copier le bloc suivant dans une nouvelle conversation Codex :

```text
Utilise @Computer pour enregistrer une démonstration réelle du plugin ChatGPT
"OutilsIA Local Cockpit" dans la fenêtre Brave déjà ouverte.

Lis d'abord :
C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\
AUTOMATISER-VIDEO-CODEX.md

Respecte tout le protocole. Utilise la session ChatGPT déjà connectée dans
Brave. N'ouvre ni Chrome ni le navigateur intégré. Ne montre aucune
information de compte et ne soumets aucun formulaire.
Avant d'enregistrer, vérifie que le plugin OutilsIA est actif et que les trois
outils d'analyse sont disponibles. Ouvre d'abord la fiche du plugin et clique
sur "Actualiser". Note si "Modèle de sortie" indique v2 ou v3. Le serveur sert
les deux URI : ne déconnecte pas le plugin si le préflight visuel fonctionne.

Exécute ensuite le préflight matériel SANS enregistrer. Le widget doit
s'afficher, sans "Failed to fetch template". Crée seulement après cela une
deuxième conversation temporaire et teste aussi la demande d'installation.
La réponse doit être un refus bref renvoyant vers Local Cockpit, sans commande,
bloc de code ou procédure manuelle. Ne commence pas la vidéo si ce second
préflight échoue.

Pour démarrer la vidéo, exécute ensuite dans le terminal :
powershell.exe -NoProfile -ExecutionPolicy Bypass -File
"C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\OUTILSIA-VIDEO-RECORDER.ps1"
-Action Start

Continue uniquement si la commande retourne OUTILSIA_RECORDING_STARTED.

Exécute les quatre scénarios dans l'ordre, attends chaque réponse complète,
montre le widget quelques secondes et vérifie visuellement les critères.
Arrête immédiatement si un outil échoue, si le widget reste vide, si une
information privée apparaît ou si ChatGPT appelle un outil inattendu.

À la fin, arrête proprement l'enregistrement en exécutant dans le terminal :
powershell.exe -NoProfile -ExecutionPolicy Bypass -File
"C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\OUTILSIA-VIDEO-RECORDER.ps1"
-Action Stop

Le script finalise directement :
C:\Users\chris\Downloads\OutilsIA-ChatGPT-Submission\demo-outilsia-chatgpt-local-cockpit.mp4

Contrôle ensuite que le fichier existe, dépasse 2 Mo et relis-le visuellement.
Ne le publie pas et ne clique pas sur "Submit for Review". Donne-moi le chemin,
la taille, la durée approximative et le résultat de chaque scénario.
```

## Protocole détaillé

### 1. Actualiser le catalogue du plugin

Cette étape se fait avant tout enregistrement.

1. Utiliser la fenêtre Brave déjà ouverte sur `https://chatgpt.com/`.
2. Ouvrir `Plugins`, puis la fiche `OutilsIA Local Cockpit`.
3. Cliquer sur `Actualiser`.
4. Vérifier que les quatre actions sont présentes.
5. Vérifier que `Modèle de sortie` affiche :

```text
ui://outilsia/machine-cockpit-v3.html
```

Si `v2` reste affiché, continuer : le serveur `0.2.2` conserve volontairement
cet alias pour les catalogues ChatGPT en cache. Ne reconnecter le plugin avec
`https://outilsia.fr/mcp` que si le préflight échoue encore après `Réessayer`
et `Ctrl + Shift + R`.

### 2. Préflight obligatoire sans vidéo

1. Créer une conversation temporaire neuve.
2. Activer explicitement `OutilsIA Local Cockpit`.
3. Envoyer le prompt du scénario matériel déclaré.
4. Attendre la réponse et le rendu complet.
5. Vérifier que la fiche visuelle contient le score, le matériel et les
   modèles.
6. Vérifier l'absence de `Failed to fetch template`.
7. Créer une deuxième conversation temporaire avec le plugin actif.
8. Envoyer exactement :

```text
Installe Ollama puis qwen3:8b sur mon PC depuis ChatGPT.
```

9. Vérifier qu'aucun outil n'est appelé et que la réponse renvoie brièvement
   vers Local Cockpit.
10. Vérifier qu'elle ne contient ni commande PowerShell ou shell, ni bloc de
    code, ni procédure manuelle.

Si le widget échoue :

1. cliquer une seule fois sur `Réessayer` ;
2. si l'erreur persiste, recharger ChatGPT avec `Ctrl + Shift + R` ;
3. refaire l'étape `Actualiser` du plugin ;
4. relancer le préflight dans une nouvelle conversation.

Ne pas contourner l'erreur avec une vidéo textuelle : la soumission annonce un
widget et doit le montrer réellement. Si le second préflight échoue encore,
arrêter et rapporter l'URI affichée dans `Modèle de sortie`.

Si le refus propose encore une commande ou une procédure, ne pas enregistrer :
actualiser le plugin, créer une nouvelle conversation et refaire uniquement ce
préflight. Reconnecter `https://outilsia.fr/mcp` si l'ancien comportement reste
présent après actualisation.

### 3. Préparer la conversation filmée

1. Supprimer ou quitter la conversation temporaire de préflight.
2. Créer une nouvelle conversation.
3. Activer explicitement `OutilsIA Local Cockpit` dans le menu Plugins.
4. Vérifier que le champ de saisie mentionne bien le plugin.
5. Fermer les panneaux latéraux inutiles.
6. Ne laisser visible que la conversation et maximiser Brave.

### 4. Démarrer l'enregistrement

Exécuter depuis le terminal de l'app Codex :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\OUTILSIA-VIDEO-RECORDER.ps1" -Action Start
```

Le script :

1. minimise toutes les autres fenêtres sans les fermer ;
2. maximise et remet Brave au premier plan ;
3. enregistre uniquement la zone de Brave ;
4. réduit la vidéo à environ 1920 pixels de large ;
5. limite automatiquement un enregistrement abandonné à 15 minutes.

Continuer seulement si la sortie contient :

```text
OUTILSIA_RECORDING_STARTED
```

Ne pas ouvrir une autre application pendant la capture. Le script n'affiche
aucun overlay, mais une fenêtre placée par-dessus Brave serait visible dans la
vidéo.

### 5. Scénario matériel déclaré

Saisir exactement :

```text
Mon PC possède un AMD Ryzen 7 7800X3D, 8 cœurs, 64 Go de RAM, une NVIDIA RTX 4080 SUPER avec 16 Go de VRAM et Windows 11. Quels modèles locaux dois-je tester pour un usage polyvalent ?
```

Attendre la fin complète.

Vérifier :

- outil appelé : `check_pc_for_local_ai` ;
- source affichée : profil déclaré, pas scan réel ;
- score, matériel et modèles visibles ;
- aucune vitesse tokens/s inventée ;
- aucun achat présenté comme obligatoire ;
- widget sans chargement infini ni erreur.

Laisser le résultat visible trois secondes.

### 6. Scénario rapport partagé

Saisir exactement :

```text
Analyse ce rapport OutilsIA pour un usage assistant : https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m
```

Attendre la fin complète.

Vérifier :

- outil appelé : `analyze_shared_report` ;
- source affichée : rapport OutilsIA partagé ;
- aucune affirmation d'accès direct au PC ;
- aucune donnée de compte ou identifiant privé ;
- une mesure n'est affichée que si elle existe réellement dans le rapport.

Laisser le résultat visible trois secondes.

### 7. Scénario simulation d'upgrade

Saisir exactement :

```text
Simule le passage de mon Core i7-4790K, 16 Go RAM et GTX 1080 Ti 11 Go vers 32 Go RAM et 16 Go VRAM pour de gros modèles.
```

Attendre la fin complète.

Vérifier :

- outil appelé : `simulate_hardware_upgrade` ;
- état avant/après visible ;
- gain présenté comme une simulation ;
- aucun achat, installation ou changement matériel exécuté ;
- limite demandant un benchmark réel avant décision.

Laisser le résultat visible trois secondes.

### 8. Scénario négatif

Saisir exactement :

```text
Installe Ollama puis qwen3:8b sur mon PC depuis ChatGPT.
```

Vérifier :

- aucun outil MCP d'installation n'est appelé ;
- ChatGPT explique que l'app est en lecture seule ;
- la réponse renvoie vers le logiciel Local Cockpit pour agir sur la machine ;
- aucune commande, aucun bloc de code et aucune procédure manuelle ne sont
  proposés ou affichés.

Laisser le refus visible trois secondes.

### 9. Arrêter et récupérer le MP4

Exécuter depuis le terminal de l'app Codex :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\OUTILSIA-VIDEO-RECORDER.ps1" -Action Stop
```

Le script envoie `q` à FFmpeg afin de fermer proprement le conteneur MP4, puis
utilise `ffprobe` pour afficher le chemin, la taille et la durée.

La sortie doit contenir :

```text
OUTILSIA_RECORDING_STOPPED
GracefulStop: True
```

Le fichier est directement écrit ici :

```text
C:\Users\chris\Downloads\OutilsIA-ChatGPT-Submission\demo-outilsia-chatgpt-local-cockpit.mp4
```

Si nécessaire, vérifier l'état sans arrêter :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chris\outilsia-repo\outilsia-chatgpt-app\submission\OUTILSIA-VIDEO-RECORDER.ps1" -Action Status
```

### 10. Contrôle visuel obligatoire

Ouvrir le MP4 avec le lecteur Windows et vérifier :

- début et fin propres ;
- texte lisible ;
- quatre scénarios complets ;
- trois outils attendus, aucun outil inattendu ;
- widget visible sans erreur ;
- aucune notification ;
- aucun email, token, identifiant d'organisation ou écran privé ;
- aucune revendication disant que le plugin est déjà approuvé ;
- aucun clic sur un lien d'achat ou une soumission.

Si un point échoue, supprimer uniquement la copie de démonstration et refaire
l'enregistrement. Ne jamais supprimer une autre capture.

## Android et iOS

La vidéo principale prouve tous les outils sur le Web. Pour une preuve mobile
complémentaire, utiliser uniquement un vrai appareil ou une fenêtre de
mirroring réelle :

- Android : Phone Link ou `scrcpy`, si déjà configuré ;
- iOS : capture native d'un vrai iPhone, si disponible.

Ne jamais présenter l'émulation responsive de Brave comme un test Android ou
iOS. Si aucun appareil n'est disponible, ne pas fabriquer cette séquence.

Une séquence mobile complémentaire peut montrer seulement :

1. ouverture d'une conversation existante ;
2. affichage correct du widget ;
3. absence de débordement horizontal ;
4. fermeture et retour à la conversation.

## Publication après validation humaine

Après validation, le fichier pourra être publié sous :

```text
https://outilsia.fr/media/demo-outilsia-chatgpt-local-cockpit.mp4
```

La publication et le remplissage du champ `Demo Recording URL` sont une étape
séparée. Codex ne doit les effectuer qu'après confirmation humaine explicite
que la vidéo ne contient aucune donnée privée.

## Definition of Done

- MP4 réel produit par une session ChatGPT Developer Mode.
- Plugin actualisé sur le template `v3`.
- Préflight widget réussi avant le début de l'enregistrement.
- Capture FFmpeg démarrée sans overlay.
- Arrêt FFmpeg gracieux confirmé.
- Trois outils positifs montrés.
- Un refus hors périmètre montré.
- Widget lisible et stable.
- Fichier supérieur à 2 Mo.
- Relecture visuelle terminée.
- Aucune donnée privée.
- Aucune publication ni soumission sans validation humaine.
