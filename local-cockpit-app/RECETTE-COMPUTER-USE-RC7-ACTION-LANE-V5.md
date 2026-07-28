# Recette Computer Use V5 - RC7 Benchmark Commons et client MCP externe

## 1. Mission

Qualifier exclusivement le candidat privé :

`C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.7-Test`

Cette recette ferme les deux P2 restés ouverts après RC6 :

1. la question standard Benchmark Commons doit être identifiée comme standard,
   jamais comme prompt personnalisé ;
2. un vrai client HTTP MCP externe doit injecter deux demandes Local Action
   Lane, prouver leur séparation, le refus de toute exécution MCP et leur
   annulation sans action locale.

Le RC6 a déjà qualifié le scan, MCP read-only, Commons local, confidentialité,
responsive, serveur privé, appairage et 156 tests Rust. Ne pas transformer cette
recette de delta en nouvelle campagne produit complète.

## 2. Compétence et environnement

Utiliser la compétence Computer Use et lire ses règles intégralement avant de
commencer.

Contraintes :

- Windows natif ;
- portable exact du kit RC7 ;
- aucune autre version OutilsIA ouverte ;
- navigateur inutile ;
- aucun déploiement ;
- aucune publication ;
- aucune installation ou suppression de modèle ;
- aucun partage de rapport public ;
- aucune soumission Benchmark Commons réseau ;
- aucun token dans une capture, un rapport, une commande ou un fichier ;
- aucun fichier de preuve sur le Bureau.

Créer les preuves uniquement dans :

`C:\Users\chris\Downloads\OutilsIA-Computer-Use-RC7-Action-Lane\<UTC_YYYYMMDD_HHMMSS>`

## 3. Règle boîte noire

Avant la fin des étapes 4 à 10 :

- ne lire aucun fichier source ;
- ne lancer aucun validateur du dépôt ;
- ne consulter aucun ancien rapport ;
- ne lancer aucun RC6 ;
- ne manipuler l'application que par l'interface native visible ;
- le script `Probe-Local-Action-Lane.py` livré dans le kit est autorisé, car il
  est l'objet externe à tester et son SHA est couvert par le manifeste du kit.

Après la boîte noire, les validations source de la section 11 sont autorisées.

## 4. Identité exacte

Lire uniquement :

- `release-candidate.json` ;
- `SHA256SUMS.txt` ;
- `AUTHENTICODE.json` ;
- `RC-KIT-MANIFEST.json`.

Exiger :

- `label = 0.1.2-rc.7` ;
- `version = 0.1.2` ;
- `channel = release-candidate` ;
- `deployment.public_allowed = false` ;
- `source.tracked_dirty = false` ;
- `action_lane_probe.external_http_client = true` ;
- `action_lane_probe.approval_available = false` ;
- `action_lane_probe.execution_available = false` ;
- `action_lane_probe.token_persisted = false`.

Calculer le SHA-256 :

- du portable ;
- de `Probe-Local-Action-Lane.py`.

Ils doivent correspondre respectivement au manifeste RC et à
`RC-KIT-MANIFEST.json`.

Vérifier Authenticode sans sur-revendication. `NotSigned` est acceptable pour
ce candidat privé, jamais pour une promotion stable.

Si le label, le commit, un SHA ou la politique de déploiement diffère :

`BLOCKED_IDENTITY`

et arrêter.

## 5. Lancement et scan

1. Fermer toute autre fenêtre OutilsIA.
2. Lancer `01-LANCER-LE-RC.cmd`.
3. Vérifier visuellement `0.1.2`, le build et le canal candidat.
4. Cliquer `Analyser ce PC`.
5. Attendre la fin sans relancer.
6. Vérifier CPU, RAM, GPU, VRAM, OS et runtime.

Ne télécharger aucun modèle. Utiliser seulement un modèle déjà installé.

Capture :

`captures/01-rc7-scan.png`

## 6. Régression du prompt standard

Ouvrir :

`Tests > Historique benchmarks > Benchmark Commons`

1. Cliquer `Préparer le test standard`.
2. Vérifier que la question visible est exactement :

   `Pourquoi la VRAM est importante pour un LLM local ?`

3. Choisir un modèle déjà installé si nécessaire.
4. Cliquer le bouton de benchmark pour faire apparaître la confirmation native.
5. Vérifier dans cette confirmation :

   - `Prompt : standard Benchmark Commons` ;
   - le modèle exact ;
   - le runtime exact ;
   - la durée maximale ;
   - `Aucun téléchargement ni envoi cloud`.

6. Échec P1 si `personnalisé` apparaît pour cette question exacte.
7. Annuler une première fois : aucun benchmark ne doit démarrer.
8. Recommencer, confirmer, attendre la mesure réelle.
9. Vérifier succès, tok/s, durée, source et placement.

Captures :

- `captures/02-prompt-standard-confirmation.png`
- `captures/03-benchmark-standard-resultat.png`

## 7. Préparer le rapport et le Passport

1. Générer le rapport final local sans le partager.
2. Générer l'AI Capability Passport courant.
3. Ouvrir `Atelier IA > Local Action Lane`.
4. Choisir `Client MCP local`.
5. Vérifier que la lane est arrêtée par défaut.
6. Démarrer la lane après confirmation native.
7. Vérifier :

   - bind `127.0.0.1` ;
   - URL `/mcp` ;
   - durée quinze minutes ;
   - cinq outils ;
   - aucun outil d'approbation ;
   - aucun outil d'exécution ;
   - file en mémoire ;
   - jeton éphémère.

Ne jamais capturer le jeton.

Capture :

`captures/04-action-lane-active.png`

## 8. Client MCP externe

Lancer depuis le kit :

`04-SONDER-ACTION-LANE.cmd`

Le script doit demander successivement :

1. la configuration sans secret ;
2. le jeton temporaire.

À chaque demande :

- revenir dans OutilsIA ;
- utiliser le bouton demandé ;
- revenir au terminal ;
- appuyer sur Entrée.

Le terminal ne doit jamais afficher l'URL complète, le port, le jeton, un
chemin personnel ou le contenu du rapport.

Attendre :

`ACTION_LANE_EXTERNAL_PROBE_AWAITING`

La ligne doit annoncer :

- `tools=5` ;
- `requests=2` ;
- `distinct=true` ;
- `same_plan=true` ;
- `execution_tool=false` ;
- `actions_started=false` ;
- `token_leak=false`.

Ne pas encore appuyer sur Entrée.

## 9. Preuve native des deux demandes

Dans OutilsIA :

1. cliquer `Actualiser la file` ;
2. vérifier deux cartes distinctes ;
3. vérifier deux identifiants distincts ;
4. vérifier le même digest `Plan SHA-256` ;
5. vérifier l'état `En attente de votre décision` sur les deux ;
6. vérifier l'absence de bouton `Exécuter maintenant` ;
7. vérifier que chaque carte propose seulement l'accusé, l'autorisation native
   et le refus ;
8. ne cocher aucune case ;
9. ne cliquer aucun bouton de décision.

Capture :

`captures/05-deux-demandes-mcp-en-attente.png`

Revenir au terminal et appuyer sur Entrée.

Exiger :

`ACTION_LANE_EXTERNAL_PROBE_OK`

avec :

- `execute_rejected=true` ;
- `cancelled=true` ;
- `actions_started=false` ;
- `token_leak=false`.

Dans OutilsIA :

1. actualiser la file ;
2. vérifier les deux états `Annulé par le client` ;
3. vérifier l'absence de tout bouton d'autorisation ou d'exécution ;
4. vérifier qu'aucun benchmark supplémentaire n'a été créé ;
5. vérifier qu'aucun fichier de rapport n'a été écrit ;
6. vérifier qu'aucun modèle n'a été installé ou supprimé.

Capture :

`captures/06-deux-demandes-mcp-annulees.png`

## 10. Arrêt et confidentialité

1. Arrêter la Local Action Lane.
2. Vérifier l'état `désactivée`.
3. Vérifier que le jeton n'est plus visible ni réutilisable.
4. Vérifier qu'aucun export Benchmark Commons n'a été créé par cette recette.
5. Vérifier qu'aucune soumission réseau n'existe.
6. Vérifier que le presse-papiers ne contient plus le jeton.
7. Vérifier dans Evidence Ledger qu'aucun reçu d'exécution Action Lane n'a été
   ajouté par la sonde.

Capture :

`captures/07-action-lane-arretee.png`

Échec P0 si la sonde a déclenché une installation, un benchmark, un export, une
écriture ou une requête réseau hors loopback.

## 11. Validations source après boîte noire

Source de vérité :

`C:\Users\chris\outilsia-repo`

Vérifier que le commit courant est exactement celui du manifeste RC7, puis
exécuter :

```powershell
cd C:\Users\chris\outilsia-repo\local-cockpit-app
python scripts\test-probe-local-action-lane.py
python scripts\verify-computer-use-regressions.py
python scripts\verify-local-action-lane.py
python scripts\verify-benchmark-commons.py
cd src-tauri
cargo test --lib
```

Puis sous WSL sur la même source montée :

```bash
cd /mnt/c/Users/chris/outilsia-repo/local-cockpit-app
npm run verify:app-core
npm run verify:ci-source
```

Exiger :

- sonde protocolaire verte ;
- prompt standard identifié ;
- Action Lane desktop/mobile verte ;
- Commons desktop/mobile vert ;
- `156 passed; 0 failed` ou davantage ;
- suite applicative complète verte ;
- CI source verte.

## 12. Fichiers de livraison

Créer :

- `RAPPORT-COMPUTER-USE-RC7.md`
- `MATRICE-RESULTATS.csv`
- `ANOMALIES.csv`
- `CHRONOLOGIE.csv`
- `COMMANDES-ET-RESULTATS.txt`
- `CAPTURES-INDEX.md`
- le dossier `captures`.

Ne jamais enregistrer :

- jeton ;
- chemin utilisateur ;
- contenu brut du rapport ;
- prompt ou sortie de modèle hors question standard publique.

L'URL loopback et son port peuvent apparaître dans la seule capture native
bornée de la lane active ; ne pas les recopier dans les tableaux ou le rapport.

## 13. Verdicts

`GO_LOCAL_CANDIDATE`

si :

- identité exacte ;
- prompt standard correctement libellé ;
- benchmark réel réussi ;
- deux demandes injectées par le client externe ;
- mêmes plans, identifiants distincts ;
- aucune approbation ou exécution MCP ;
- deux annulations durables ;
- aucune fuite ;
- toutes les validations source vertes ;
- aucun P0/P1.

`NO_GO`

si un P0/P1 est relevé.

`BLOCKED_PREREQUISITE`

uniquement si Python 3 ou le client loopback ne peut réellement pas être lancé,
avec preuve précise. Ne pas remplacer la sonde par un test source.

## 14. Bornes finales obligatoires

Le rapport doit terminer par :

```text
Release publique modifiée : NON
Déploiement serveur effectué : NON
Source modifiée : NON
Modèle installé : NON
Modèle supprimé : NON
Rapport public partagé : NON
Token enregistré dans une preuve : NON
Action locale exécutée par la sonde : NON
Soumission Benchmark Commons réseau : NON
```
