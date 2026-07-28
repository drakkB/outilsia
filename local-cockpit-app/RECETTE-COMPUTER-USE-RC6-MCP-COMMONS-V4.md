# Recette Computer Use V4 - RC6 MCP local, actions gardées et Benchmark Commons

Version de la recette : 4.0

Date : 28 juillet 2026

Produit : OutilsIA Local Cockpit, application desktop Tauri/Rust

Nature : recette native en boîte noire, suivie de contrôles de contrat en
lecture seule

## Prompt exact à donner à Codex Computer Use

> Lis intégralement le fichier
> `C:\Users\chris\outilsia-repo\local-cockpit-app\RECETTE-COMPUTER-USE-RC6-MCP-COMMONS-V4.md`.
> Exécute la mission dans l'ordre, uniquement sur l'EXE portable contenu dans
> `C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.6-Test`.
> N'utilise aucun RC5, aucun kit du Bureau et aucun artefact du repo. Commence
> en boîte noire et gèle les preuves
> avant de lire le code ou les tests. Vérifie le MCP local read-only, la
> frontière de Local Action Lane, l'export pseudonymisé Benchmark Commons,
> l'absence d'envoi automatique, le double consentement, la confidentialité et
> la révocation. Le partage réseau est désactivé dans les builds ordinaires :
> marque sa recette réelle `NOT_RUN_EXPECTED` tant qu'une build privée activée,
> un endpoint privé et un compte de test déjà appairé ne sont pas fournis. Ne
> déploie rien, ne publie rien, ne modifie aucune source, n'installe et ne
> supprime aucun modèle, ne révèle aucun token, et ne crée rien sur le Bureau.
> Produis le rapport et les captures uniquement dans le dossier Downloads
> demandé. Ne transforme jamais un reçu serveur en preuve terrain ou en
> validation communautaire.

## 1. Question à laquelle la recette doit répondre

À la fin, le rapport doit répondre sans ambiguïté :

1. Le MCP local expose-t-il seulement des vues en lecture seule ?
2. Une IA peut-elle préparer une action bornée sans pouvoir l'approuver ni
   l'exécuter elle-même ?
3. Benchmark Commons accepte-t-il uniquement un benchmark standard réellement
   mesuré ?
4. Le document exact est-il visible avant tout consentement ?
5. L'export local exige-t-il deux gestes distincts ?
6. Le build ordinaire empêche-t-il tout partage réseau ?
7. Une build réseau privée exige-t-elle compte, synchronisation et consentement
   HTTPS supplémentaire ?
8. Le document exclut-il prompt, réponse, scan brut, identifiants et chemins ?
9. Une soumission serveur active empêche-t-elle la suppression locale avant
   révocation distante ?
10. L'interface distingue-t-elle reçu, preuve terrain, validation
    communautaire et classement ?

## 2. Vérité produit au début de la recette

État attendu des sources candidates au 28 juillet 2026 :

- Local Capability Bridge : MCP loopback read-only ;
- Local Action Lane v0 : préparation MCP, approbation et exécution natives ;
- Benchmark Commons : aperçu et export local disponibles ;
- client HTTPS Benchmark Commons : présent derrière le drapeau de compilation
  `OUTILSIA_BENCHMARK_COMMONS_UPLOAD=1` ;
- drapeau réseau : désactivé dans les builds ordinaires ;
- endpoint Benchmark Commons : candidat privé, non déployé ;
- release publique : ne doit pas être présentée comme contenant ce palier ;
- reçu HMAC : structure et rattachement contrôlés par le client, authenticité
  vérifiable côté serveur seulement ;
- preuve terrain : `false` ;
- validation communautaire : `false` ;
- classement : indisponible.

Le testeur doit signaler tout écart entre cet état et l'application observée.

## 3. Source de vérité et identité du binaire

Repo canonique :

`C:\Users\chris\outilsia-repo`

Application :

`C:\Users\chris\outilsia-repo\local-cockpit-app`

### 3.1 Verrou de sélection RC6

Le seul kit autorisé est :

`C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.6-Test`

Le seul manifeste autorisé est :

`C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.6-Test\release-candidate.json`

Interdictions :

- ne pas chercher de candidat sur le Bureau ;
- ne pas utiliser `_OutilsIA\OutilsIA-Local-Cockpit-0.1.2-rc.5-Test` ;
- ne pas utiliser `.artifacts\github-run-*` ;
- ne pas choisir un EXE par date, nom approchant ou ordre d'affichage ;
- ne pas continuer si le manifeste exact ci-dessus est absent ;
- ne pas continuer si son label n'est pas `0.1.2-rc.6`.

Si le dossier exact manque, conclure `BLOCKED_BINARY_NOT_BUILT`. Ne pas se
rabattre sur une autre candidate.

### 3.2 Identité cryptographique

Le kit privé doit contenir :

- un `release-candidate.json` ;
- un EXE portable ;
- un commit source complet ;
- un build ID ;
- les SHA-256 des artefacts.

Ne jamais choisir un EXE seulement parce qu'il est le plus récent visuellement.
Lire le manifeste et conserver :

- version ;
- label RC ;
- build ID ;
- commit source ;
- SHA-256 du portable ;
- statut de signature.

Vérification obligatoire :

```powershell
git -C C:\Users\chris\outilsia-repo cat-file -e `
  "<COMMIT_DU_MANIFEST>:local-cockpit-app/RECETTE-COMPUTER-USE-RC6-MCP-COMMONS-V4.md"
```

Si cette commande échoue, le binaire précède ce palier. Classer
`BLOCKED_VERSION` et ne pas lui attribuer les résultats attendus ici.

Calculer le SHA-256 réel de l'EXE portable du dossier autorisé et exiger une
égalité exacte avec `files[].sha256` dans ce manifeste. Inscrire également le
chemin absolu du kit dans `IDENTITE-CANDIDAT.json`.

Si un contrôle d'identité échoue, ne pas tester RC4 ou RC5 à la place. Exécuter
uniquement les contrôles source de la section 18 et conclure avec le code
approprié.

## 4. Frontière absolue

### 4.1 Produit autorisé

Tester uniquement OutilsIA Local Cockpit.

Strategy Arena peut apparaître comme destination d'un handoff read-only. Elle
ne doit jamais être lancée, modifiée ou testée dans cette recette.

### 4.2 Produits interdits

Ne pas ouvrir, modifier ou tester un autre produit, dépôt, site ou jeu.

Toute logique étrangère au Local Cockpit dans OutilsIA est une contamination P0.

### 4.3 Fichiers étrangers à ignorer

Ne jamais modifier, ajouter ou supprimer :

- `.claude/`
- `AGENTS.md`
- `CLAUDE.md`
- `server-work/static/games/`

Ne jamais utiliser `git clean`, `git reset --hard` ou `git checkout --`.

## 5. Actions interdites

- Aucun déploiement.
- Aucune promotion de release.
- Aucun push.
- Aucune modification de source.
- Aucun changement du VPS, nginx, Cloudflare, DNS ou pare-feu.
- Aucune installation ou suppression de modèle.
- Aucune installation de pilote, CUDA, ROCm, Vulkan, WSL ou Ollama.
- Aucun changement BIOS, ReBAR, XMP ou EXPO.
- Aucun achat ni clic affilié.
- Aucun partage public de rapport.
- Aucun backtest, trading ou génération de stratégie.
- Aucun accès à un document personnel.
- Aucun affichage ou enregistrement d'email, token, clé ou chemin utilisateur
  complet.
- Aucun appel direct d'une commande Tauri depuis les DevTools.
- Aucun appel direct à l'endpoint privé depuis un script pour simuler un succès
  UI.
- Aucune soumission réseau avec un compte personnel non prévu pour la recette.

## 6. Actions autorisées

- Lancer et fermer l'EXE portable privé.
- Redimensionner la fenêtre.
- Analyser la machine.
- Utiliser un modèle déjà installé.
- Lancer un benchmark court après les confirmations visibles.
- Préparer un plan Local Action Lane sans l'exécuter.
- Démarrer puis arrêter le MCP local depuis l'interface.
- Créer un export Benchmark Commons de test dans Downloads.
- Révoquer uniquement l'export créé par cette recette.
- Prendre des captures sans donnée privée.
- Après gel de la boîte noire, lire les contrats et lancer les tests de la
  section 18.

## 7. Dossier de livraison

Créer uniquement :

`C:\Users\chris\Downloads\OutilsIA-Computer-Use-MCP-Commons\<YYYY-MM-DD_HHMM>\`

Sous-dossiers :

- `captures\`
- `preuves\`
- `logs\`

Livrables obligatoires :

- `RAPPORT-COMPUTER-USE.md`
- `MATRICE-RESULTATS.csv`
- `ANOMALIES.csv`
- `CHRONOLOGIE.csv`
- `PRIVACY-CHECK.json`
- `IDENTITE-CANDIDAT.json`
- `COMMANDES-ET-RESULTATS.txt`
- `CAPTURES-INDEX.md`

Ne rien écrire sur le Bureau.

## 8. Codes de résultat

Utiliser seulement :

- `PASS`
- `FAIL`
- `BLOCKED_PREREQUISITE`
- `BLOCKED_VERSION`
- `NOT_RUN_EXPECTED`
- `NOT_RUN_UNSAFE`
- `WONT_TEST_DESTRUCTIVE`

`NOT_RUN_EXPECTED` est le résultat correct pour la soumission HTTPS lorsque le
build affiche que le partage est désactivé.

Il est interdit de convertir `NOT_RUN_EXPECTED` en `PASS`.

## 9. Règles d'arrêt immédiat

Arrêter la phase concernée et classer P0 si :

- une donnée part sur Internet sans consentement réseau séparé ;
- l'application envoie le prompt ou la réponse du modèle ;
- un token, email, hostname, `machine_key`, chemin ou fichier personnel apparaît
  dans l'export ;
- le MCP écoute sur autre chose que loopback ;
- un outil MCP approuve ou exécute une action locale ;
- un bouton d'envoi réseau est actif dans le build ordinaire ;
- une suppression locale réussit alors qu'une soumission serveur est encore
  active ;
- un reçu est présenté comme preuve terrain, validation communautaire ou
  classement ;
- un benchmark estimé, échoué, personnalisé ou non mesuré devient éligible ;
- la mauvaise machine ou le mauvais benchmark est synchronisé ;
- une installation, suppression ou commande système démarre sans confirmation
  native ;
- une fenêtre étrangère ou une donnée privée contamine une capture.

Arrêter uniquement la phase réseau, sans supprimer l'export local, si :

- le serveur retourne une erreur ;
- le réseau tombe après soumission ;
- la révocation distante ne peut pas être confirmée ;
- le compte n'est plus appairé ;
- le reçu est incomplet ou incohérent.

Dans ce cas, conserver l'état local et documenter la récupération nécessaire.

## 10. Discipline de preuve

### Phase A - Boîte noire

Pendant cette phase :

- ne pas lire les sources ;
- ne pas ouvrir les DevTools ;
- ne pas utiliser les fixtures ;
- ne pas lire les tests ;
- ne pas déduire un succès depuis un log CI.

Chaque résultat doit être visible dans l'application native.

### Phase B - Contrat en lecture seule

Seulement après avoir gelé :

- les captures ;
- la chronologie ;
- les anomalies ;
- le verdict noir provisoire.

Il devient alors permis de lire les sources et lancer les tests de contrat.
Une preuve source ne corrige jamais rétroactivement un défaut UI observé.

## 11. Baseline novice

Lancer l'application et, sans utiliser la recherche interne, mesurer :

1. temps pour trouver `Analyser ce PC` ;
2. temps pour comprendre score, matériel et prochaine action ;
3. temps pour trouver `Tests` puis `Historique benchmarks` ;
4. temps pour identifier `Benchmark Commons` ;
5. temps pour comprendre la différence entre export local et partage réseau.

Critères :

- le premier parcours reste dominant ;
- MCP, actions agentiques et Commons ne masquent pas le résultat matériel ;
- `Benchmark Commons v1 · local par défaut · partage opt-in` est lisible ;
- aucune promesse de collecte communautaire active n'est affichée ;
- le bouton d'envoi n'est pas l'action principale de l'écran.

Captures :

- `01-accueil-resultat.png`
- `02-tests-historique.png`
- `03-benchmark-commons-etat-initial.png`

## 12. Recette MCP local read-only

### 12.1 État initial

Vérifier :

- serveur arrêté par défaut ;
- aucune URL distante ;
- aucun token persistant affiché au chargement ;
- frontière lecture seule expliquée ;
- expiration de session visible ou documentée dans l'UI.

### 12.2 Démarrage

Démarrer le MCP local depuis l'interface.

Vérifier sans capturer le secret :

- hôte `127.0.0.1` ou équivalent loopback ;
- URL locale uniquement ;
- token éphémère ;
- bouton d'arrêt immédiat ;
- aucune ouverture de port LAN revendiquée.

Masquer toute zone contenant le token avant capture.

### 12.3 Surface d'outils

La surface read-only doit rester limitée aux vues typées du cockpit :

- cockpit ;
- machine ;
- Hardware Doctor ;
- modèles ;
- recommandation ;
- benchmarks ;
- Passport ;
- handoff Strategy Arena read-only.

Échec P0 si un outil :

- installe ;
- supprime ;
- lance un benchmark ;
- lance un dialogue ;
- lit un fichier ;
- écrit une mémoire ;
- déclenche un backtest ;
- exécute une commande shell.

### 12.4 Arrêt

Arrêter le MCP depuis l'interface.

Vérifier :

- état arrêté visible ;
- ancien accès refusé ;
- aucun token réaffiché ;
- l'application principale continue de fonctionner.

## 13. Recette Local Action Lane

Cette lane est distincte du MCP read-only.

### 13.1 Contrat visible

Vérifier que l'UI explique :

- l'IA prépare ;
- le propriétaire relit ;
- l'interface native approuve ;
- l'interface native exécute ;
- un outil MCP ne peut jamais s'auto-approuver.

### 13.2 Préparation sûre

Préparer uniquement une action non destructive sur un modèle déjà installé :

- benchmark standard, ou
- export de rapport local.

Ne pas exécuter l'action dans cette section.

Vérifier que le plan montre :

- action exacte ;
- modèle exact s'il existe ;
- runtime exact ;
- budget ou délai ;
- téléchargements attendus ;
- interdits ;
- empreinte du plan ;
- expiration ;
- statut `awaiting_human`.

### 13.3 Anti-réentrance et annulation

Sans exécuter :

- tenter de préparer une seconde action ;
- vérifier que le doublon est bloqué ou clairement séparé ;
- annuler le premier plan ;
- vérifier qu'il ne peut plus être approuvé ;
- vérifier qu'aucune action locale n'a démarré.

### 13.4 Frontière de sécurité

Chercher visuellement toute possibilité de fournir :

- une commande shell ;
- une URL arbitraire ;
- un chemin arbitraire ;
- un modèle non validé ;
- une suppression ;
- une installation de pilote ;
- une élévation.

La présence d'un tel champ libre est P0.

## 14. Préparer une mesure Benchmark Commons éligible

### 14.1 Préconditions

- scan natif terminé ;
- Ollama détecté ;
- modèle déjà installé ;
- aucune installation ;
- machine stable ;
- aucun autre benchmark en cours.

### 14.2 Test standard

Dans `Tests > Historique benchmarks > Benchmark Commons` :

1. cliquer `Préparer le test standard` ;
2. vérifier que le modèle est déjà installé ;
3. vérifier que la question standard porte sur la VRAM ;
4. lancer le benchmark seulement après le préflight et la confirmation native ;
5. attendre la fin ;
6. relever modèle, runtime, tok/s, durée, placement GPU et source de mesure.

Éligibilité obligatoire :

- succès ;
- source `ollama_api` ;
- métriques exactes ;
- durée de génération au moins 200 ms ;
- prompt standard inchangé ;
- modèle et runtime exacts ;
- mesure liée au scan courant.

Ne jamais saisir de prompt personnel.

### 14.3 Tests négatifs non destructifs

Vérifier successivement, sans créer d'export :

- aucun scan : préparation bloquée ;
- aucun benchmark : préparation bloquée ;
- benchmark échoué visible dans l'historique : non éligible ;
- prompt personnalisé neutre : non éligible ;
- estimation sans métriques exactes : non éligible ;
- benchmark d'une autre machine restaurée : non éligible ;
- benchmark ancien ou périmé si un tel historique existe : non éligible.

Si un état n'existe pas naturellement, marquer `NOT_RUN_UNSAFE`. Ne pas falsifier
le registre natif.

## 15. Aperçu, double consentement et export local

### 15.1 Préparer

Cliquer `Préparer la contribution`.

Vérifier avant toute case cochée :

- aperçu visible ;
- modèle ;
- tok/s ;
- durée ;
- GPU, VRAM, CPU, RAM ;
- runtime et version Ollama ;
- placement ;
- pseudonyme tronqué ;
- SHA-256 ;
- liste des données exclues ;
- aucun fichier créé ;
- aucun envoi réseau.

### 15.2 Premier geste

Vérifier :

- bouton d'approbation désactivé avant la case ;
- case de confidentialité explicite ;
- mention `ni preuve terrain ni classement communautaire`.

Cocher la case.

Vérifier :

- approbation activée ;
- export toujours désactivé.

Cliquer l'approbation, puis annuler la boîte native une première fois.

Vérifier :

- aucun changement d'état ;
- aucun fichier ;
- aucun envoi.

Recommencer et confirmer.

Vérifier :

- état autorisé pour deux minutes ;
- export activé ;
- approbation consommée ou désactivée ;
- mention `second clic requis`.

### 15.3 Second geste

Cliquer `Exporter`, puis annuler la confirmation une première fois.

Vérifier qu'aucun fichier n'est créé.

Recommencer et confirmer.

Vérifier :

- succès visible ;
- nom de fichier ;
- destination locale ;
- `Serveur : aucune soumission` ;
- bouton de retrait local disponible ;
- case réseau toujours décochée ;
- aucune ouverture automatique de navigateur.

## 16. Audit de confidentialité de l'export

Ne pas afficher le fichier brut dans une capture.

Lire uniquement l'export créé par cette recette et générer
`PRIVACY-CHECK.json` avec :

```json
{
  "schema_ok": false,
  "integrity_digest_present": false,
  "prompt_absent": false,
  "model_output_absent": false,
  "raw_scan_absent": false,
  "machine_key_absent": false,
  "hostname_absent": false,
  "account_absent": false,
  "email_absent": false,
  "token_absent": false,
  "file_path_absent": false,
  "personal_file_absent": false,
  "ip_absent": false,
  "user_agent_absent": false,
  "field_test_proof_false": false,
  "community_verified_false": false,
  "leaderboard_eligible_false": false,
  "network_sent_false": false,
  "notes": []
}
```

Chaque clé doit être calculée depuis le document, pas remplie à la main.

Le rapport peut citer :

- les noms des clés ;
- les booléens ;
- les empreintes tronquées.

Il ne doit pas recopier :

- le pseudonyme complet ;
- le document complet ;
- un chemin utilisateur ;
- une donnée d'identité.

## 17. Matrice de partage réseau

### 17.1 Build ordinaire, attendu maintenant

Résultat attendu :

- état `Désactivé dans ce build candidat` ;
- case réseau désactivée ;
- synchronisation Commons désactivée ;
- envoi désactivé ;
- retrait distant désactivé ;
- export et retrait local fonctionnels.

Classer la soumission réelle `NOT_RUN_EXPECTED`.

Échec P0 si le bouton d'envoi devient actif.

### 17.2 Build privé réseau, futur test conditionnel

N'exécuter cette section que si les quatre préconditions sont prouvées :

1. build privé portant explicitement le drapeau réseau ;
2. endpoint candidat déployé pour test ;
3. clé HMAC serveur configurée ;
4. purge quotidienne de rétention installée et monitorée ;
5. compte de test déjà appairé, sans identité visible dans les captures.

Sinon, sauter à la section 17.8.

### 17.3 Synchronisation

Avant synchronisation :

- export local actif ;
- compte connecté ;
- machine non encore synchronisée ou statut visible ;
- benchmark non encore synchronisé ou statut visible ;
- case réseau désactivée ;
- envoi désactivé.

Cliquer la synchronisation.

Vérifier :

- machine synchronisée ;
- benchmark standard exact synchronisé ;
- aucun autre historique envoyé ;
- aucun prompt ni réponse envoyé ;
- statut `Prêt · consentement réseau séparé`.

### 17.4 Consentement réseau séparé

Avant de cocher :

- envoi désactivé ;
- conservation maximale 180 jours visible ;
- rattachement serveur au compte et à la machine synchronisée expliqué ;
- finalités limitées à vérifier, dédupliquer et permettre le retrait ;
- absence de retour de ces identifiants expliquée ;
- retrait disponible visible ;
- absence de preuve terrain visible.

Cocher la case réseau.

Vérifier que l'envoi devient disponible.

Cliquer l'envoi et annuler la confirmation native.

Vérifier :

- aucune soumission ;
- case toujours révocable ;
- état local inchangé.

Recommencer, confirmer une seule fois et attendre la réponse.

### 17.5 Reçu serveur

Vérifier :

- réception visible ;
- date ;
- empreinte HMAC déclarée et tronquée ;
- forme et rattachement contrôlés localement ;
- texte précisant que le HMAC reste vérifiable côté serveur ;
- `field_test_proof=false` ;
- `community_verified=false` ;
- `leaderboard_eligible=false` ;
- aucun compte, machine ID, subject key, IP ou User-Agent dans
  l'enregistrement Commons affiché.

Important :

> Le client ne connaît pas la clé HMAC. Il ne doit jamais afficher
> `signature HMAC vérifiée localement`.

### 17.6 Ordre de révocation

Avec la soumission serveur active :

1. vérifier que `Retirer l'export local` est désactivé ;
2. vérifier que `Retirer du Commons` est actif ;
3. cliquer le retrait distant et annuler une première fois ;
4. vérifier que l'état serveur reste actif ;
5. recommencer et confirmer ;
6. vérifier `Contribution retirée du serveur` ;
7. vérifier que l'export local reste présent ;
8. vérifier que le retrait local devient actif ;
9. retirer seulement l'export créé par cette recette.

Échec P0 si l'étape 1 ou l'étape 7 est fausse.

### 17.7 Doublons et panne

Sans forcer un appel interne :

- après réception, le bouton d'envoi doit être désactivé ;
- après révocation, le bouton distant doit être désactivé ;
- un double clic rapide ne doit pas lancer deux opérations ;
- l'état `Opération HTTPS en cours` doit empêcher la réentrance.

Ne pas couper le réseau après une vraie soumission. Les pannes, mauvais comptes,
payloads incohérents et doublons serveur sont couverts par les tests de contrat
de la section 18.

### 17.8 Retrait local dans le build ordinaire

Si la section réseau n'a pas été exécutée :

1. cliquer le retrait local ;
2. annuler une première fois ;
3. vérifier que l'export reste actif ;
4. recommencer et confirmer ;
5. vérifier que le fichier de test est supprimé s'il existait ;
6. vérifier qu'un reçu de révocation locale est conservé ;
7. vérifier qu'aucun réseau n'est revendiqué.

Ne jamais retirer un export antérieur à cette recette.

## 18. Contrôles source après gel de la boîte noire

Exécuter depuis :

`C:\Users\chris\outilsia-repo\local-cockpit-app`

### 18.1 Contrat UI et confidentialité

```powershell
python scripts\verify-benchmark-commons.py
```

Attendu :

`benchmark_commons_ok ... network=build_gated consent=local_plus_network revoke=server_before_local privacy=strict`

### 18.2 Contrats Rust

```powershell
cd src-tauri
cargo test --lib
```

Attendu au moment de cette recette :

- 156 tests minimum ;
- 0 échec.

Noter le total réel sans le réécrire à la baisse.

### 18.3 Suite applicative

```powershell
cd ..
npm run verify:app-core
npm run verify:ci-source
```

Attendu :

- deux commandes vertes ;
- aucun changement de source ;
- aucune publication.

### 18.4 Contrat serveur privé

Exécuter seulement depuis WSL, sans démarrer le serveur public :

```bash
cd /home/chris/projects/outilsia
python3 scripts/verify_benchmark_commons_server.py
python3 local-cockpit-app/scripts/verify-desktop-pairing.py
```

Attendu :

- auth stricte ;
- correspondance machine ;
- correspondance benchmark ;
- HMAC ;
- déduplication ;
- limite par compte ;
- aucune IP dans les enregistrements Commons ;
- révocation ;
- cohorte masquée sous trois machines ;
- aucun endpoint brut ;
- appairage desktop vert.

### 18.5 Contrat réseau à lire

Vérifier dans les sources, sans les modifier :

- origine fixe `https://outilsia.fr` ;
- aucune URL fournie par l'agent ;
- redirections refusées ;
- timeout 20 secondes ;
- authentification desktop ;
- drapeau de compilation ;
- révocation distante non bloquée par la désactivation des nouveaux envois ;
- limite de payload serveur 64 Ko ;
- rétention maximale 180 jours ;
- limite de dix soumissions par compte et par jour ;
- purge de rétention explicite et script quotidien disponible ;
- aucun stockage IP/User-Agent dans l'enregistrement Commons ;
- aucune ligne brute dans l'agrégat public ;
- seuil de trois machines distinctes.

## 19. Responsive et compréhension

Tester au minimum :

- 1440 x 900 ;
- 1024 x 768 ;
- 963 x 700 ;
- 390 x 844.

À chaque taille :

- aucun débordement horizontal ;
- aucun bouton hors écran ;
- aucun texte coupé ;
- cases à cocher associées au bon texte ;
- état réseau visible ;
- boutons locaux et distants distinguables ;
- première mission de l'app toujours compréhensible ;
- zone Commons non dominante ;
- aucun panneau n'écrase le footer ou la barre d'action.

Captures :

- `10-commons-1440x900.png`
- `11-commons-1024x768.png`
- `12-commons-963x700.png`
- `13-commons-390x844.png`

## 20. Matrice minimale de résultats

`MATRICE-RESULTATS.csv` doit contenir au moins :

```csv
id,scenario,result,severity,evidence,notes
ID-01,Identité du candidat,,
MCP-01,Serveur arrêté par défaut,,
MCP-02,Loopback et token éphémère,,
MCP-03,Outils read-only seulement,,
MCP-04,Arrêt et révocation du token,,
ACT-01,Préparation sans exécution MCP,,
ACT-02,Approbation native seulement,,
ACT-03,Anti-réentrance et annulation,,
BC-01,Benchmark standard exact,,
BC-02,Prompt personnalisé refusé,,
BC-03,Aperçu avant consentement,,
BC-04,Premier geste puis autorisation,,
BC-05,Second geste puis export local,,
BC-06,Audit confidentialité JSON,,
BC-07,Partage réseau désactivé par défaut,,
BC-08,Synchronisation exacte conditionnelle,,
BC-09,Consentement HTTPS séparé conditionnel,,
BC-10,Reçu serveur borné conditionnel,,
BC-11,Révocation distante avant locale conditionnelle,,
BC-12,Retrait local du seul export de test,,
UI-01,Responsive 1440x900,,
UI-02,Responsive 1024x768,,
UI-03,Responsive 963x700,,
UI-04,Responsive 390x844,,
SRC-01,verify benchmark commons,,
SRC-02,cargo test lib,,
SRC-03,verify app core,,
SRC-04,verify ci source,,
SRV-01,contrat serveur privé,,
BOUND-01,Aucune contamination produit,,
```

## 21. Classification des anomalies

### P0

- fuite de donnée ;
- action MCP autonome ;
- écoute réseau non loopback ;
- upload sans consentement distinct ;
- suppression locale avant révocation distante ;
- preuve mensongère ;
- mauvaise machine ou mesure ;
- contamination produit ;
- installation ou suppression implicite.

### P1

- action principale incompréhensible ;
- état réseau ambigu ;
- consentement non associé au bon payload ;
- erreur sans récupération ;
- bouton actif au mauvais moment ;
- reçu impossible à relire ;
- interface inutilisable à une taille exigée.

### P2

- libellé perfectible ;
- densité excessive sans blocage ;
- alignement ou espacement ;
- détail technique trop tôt.

## 22. Verdicts autorisés

### `GO_LOCAL_CANDIDATE`

Autorisé si :

- MCP read-only conforme ;
- Action Lane ne s'auto-approuve pas ;
- benchmark exact ;
- aperçu et double geste ;
- export local privé ;
- audit confidentialité vert ;
- gate réseau fermée ;
- retrait local propre ;
- aucun P0/P1.

La section réseau peut être `NOT_RUN_EXPECTED`.

### `GO_PRIVATE_NETWORK_PILOT`

Autorisé seulement si :

- toutes les conditions de `GO_LOCAL_CANDIDATE` ;
- build réseau privé identifié ;
- soumission réelle réussie ;
- reçu borné ;
- révocation distante réussie ;
- retrait local seulement après révocation ;
- aucun P0/P1.

Ce verdict n'autorise ni publication ni communication publique.

### `NO_GO`

Obligatoire si :

- un P0 ;
- un P1 non justifié ;
- identité du binaire incertaine ;
- export privé non vérifiable ;
- état distant impossible à révoquer ;
- tests source rouges.

### `BLOCKED_BINARY_NOT_BUILT`

Utiliser si les sources sont vertes mais aucun binaire contenant ce palier n'a
encore été produit.

## 23. Format du rapport final

`RAPPORT-COMPUTER-USE.md` doit contenir :

1. verdict ;
2. identité exacte du candidat ;
3. résumé en dix lignes maximum ;
4. tableau des phases exécutées et non exécutées ;
5. résultats MCP ;
6. résultats Local Action Lane ;
7. résultats Benchmark Commons local ;
8. résultats réseau conditionnel ;
9. audit confidentialité ;
10. responsive ;
11. anomalies P0/P1/P2 ;
12. commandes et résultats ;
13. fichiers créés ;
14. état final de l'export de test ;
15. confirmation qu'aucun déploiement ou publication n'a eu lieu.

Terminer par ces affirmations renseignées :

```text
Release publique modifiée : NON
Déploiement serveur effectué : NON
Source modifiée : NON
Modèle installé : NON
Modèle supprimé : NON
Rapport public partagé : NON
Token enregistré dans une preuve : NON
Export de test encore actif : OUI/NON
Soumission serveur encore active : OUI/NON/NOT_RUN_EXPECTED
```

## 24. Definition of Done

La recette est terminée seulement si :

- le binaire testé contient ce document dans son commit source ;
- le binaire provient du seul dossier RC6 autorisé dans Downloads ;
- la boîte noire précède la lecture du code ;
- aucun ancien RC n'est présenté comme le nouveau palier ;
- toutes les lignes de la matrice ont un code valide ;
- les fonctions réseau absentes sont marquées `NOT_RUN_EXPECTED` ;
- l'export de test est audité sans fuite ;
- l'état final local et distant est explicite ;
- les quatre tailles sont couvertes ;
- les suites Rust, app, CI et serveur sont consignées ;
- aucune source n'a été modifiée ;
- aucun fichier n'a été créé sur le Bureau ;
- aucun déploiement ou publication n'a été effectué.

Le but n'est pas d'obtenir artificiellement un GO. Le but est de savoir
précisément ce que le Local Cockpit sait déjà prouver, ce qui reste candidat et
ce qui n'existe pas encore.
