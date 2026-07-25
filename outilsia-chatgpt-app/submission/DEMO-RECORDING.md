# Démonstration de soumission OutilsIA

La vidéo doit montrer l'app réellement connectée dans ChatGPT. Une capture du
widget seul ou un diaporama ne suffit pas. Utiliser une URL accessible aux
reviewers sans connexion, par exemple une vidéo non répertoriée.

## Préparation

- Ouvrir une nouvelle conversation ChatGPT.
- Activer `OutilsIA Local Cockpit` depuis le menu Plugins.
- Masquer les notifications, autres onglets et données de compte.
- Utiliser uniquement le rapport public de recette :
  `https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m`.
- Afficher la conversation et la fiche OutilsIA à une taille lisible.

## Déroulé recommandé

### 1. Profil matériel déclaré

Saisir :

```text
Mon PC possède un AMD Ryzen 7 7800X3D, 64 Go de RAM, une NVIDIA RTX 4080 SUPER avec 16 Go de VRAM et Windows 11. Quels modèles locaux dois-je tester pour un usage polyvalent ?
```

Montrer que :

- `check_pc_for_local_ai` est appelé ;
- la fiche indique qu'il s'agit d'un profil déclaré, pas d'un scan ;
- aucun tokens/s n'est inventé ;
- la décision peut conclure qu'aucun achat n'est prioritaire.

### 2. Rapport OutilsIA partagé

Saisir :

```text
Analyse ce rapport OutilsIA pour un usage assistant : https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m
```

Montrer que :

- `analyze_shared_report` est appelé ;
- la source est identifiée comme un rapport partagé ;
- l'app ne prétend jamais accéder directement à la machine ;
- seules les mesures réellement présentes dans le rapport peuvent être citées.

### 3. Simulation d'upgrade

Saisir :

```text
Simule le passage de mon Core i7-4790K, 16 Go RAM et GTX 1080 Ti 11 Go vers 32 Go RAM et 16 Go VRAM pour de gros modèles.
```

Montrer que :

- `simulate_hardware_upgrade` est appelé ;
- le GPU cible est présenté comme simulé lorsque seul un volume de VRAM est fourni ;
- le gain reste théorique et demande un benchmark avant achat ;
- aucun achat ou changement matériel n'est effectué.

### 4. Refus hors périmètre

Saisir :

```text
Installe Ollama puis qwen3:8b sur mon PC depuis ChatGPT.
```

Montrer que :

- `explain_local_action_boundary` est appelé ;
- cet outil est en lecture seule et ne lance aucune action locale ;
- son message renvoie brièvement vers OutilsIA Local Cockpit ;
- aucune commande, aucun bloc de code, aucune procédure manuelle, recherche Web
  ou source externe n'est ajouté.

## Contrôle avant dépôt

- La vidéo montre les trois outils d'analyse, l'outil de frontière et le widget
  sans erreur visuelle.
- Aucun token, identifiant interne, adresse IP ou écran Persona n'est visible.
- Le lien de vidéo fonctionne dans une fenêtre privée sans connexion.
- Le son est facultatif si les étapes et résultats restent lisibles.
- La vidéo ne présente pas l'app comme déjà approuvée ou publiée.
