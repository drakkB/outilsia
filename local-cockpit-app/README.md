# OutilsIA Local Cockpit

Application desktop Tauri pour scanner une machine, detecter Ollama et estimer quels modeles IA locaux peuvent tourner dessus.

## Lancer en developpement

```bash
cd local-cockpit-app
npm install
npm run dev
```

Sur Linux, Tauri peut demander les paquets systeme suivants avant compilation :

```bash
bash scripts/install-linux-tauri-deps.sh
```

Preflight rapide :

```bash
bash scripts/preflight-linux.sh
```

Verification backend pairing/sync avec base temporaire :

```bash
python3 scripts/verify-desktop-pairing.py
```

Smoke test live des endpoints publics desktop :

```bash
python3 scripts/smoke-live-desktop-api.py https://outilsia.fr
```

Smoke test live du parcours compte desktop complet :

```bash
python3 scripts/smoke-live-desktop-account.py https://outilsia.fr
```

Avec nettoyage du compte temporaire sur le VPS :

```bash
python3 scripts/smoke-live-desktop-account.py https://outilsia.fr --ssh-cleanup user@host
```

Verification statique UI/Tauri :

```bash
node scripts/verify-static-ui.mjs
```

Verification visuelle desktop/mobile :

```bash
npm run verify:visual
```

Ce controle ouvre l'interface avec Playwright, verifie l'absence de debordement horizontal, la lisibilite des boutons et la grille desktop, puis genere les captures dans `.artifacts/visual-ui/`.

Si `cargo` n'est pas dans le `PATH` mais que rustup existe, utiliser :

```bash
/home/chris/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml
```

## Publier une beta desktop

### Build Linux local

Sur Ubuntu/Debian, installer d'abord les dependances systeme Tauri :

```bash
cd local-cockpit-app
bash scripts/install-linux-tauri-deps.sh
```

Puis construire la beta Linux :

```bash
npm run build:beta:linux
```

Le script `scripts/build-linux-beta.sh` lance :

- `scripts/preflight-linux.sh` ;
- `npm run verify:ui` ;
- `npm run build:beta` ;
- `npm run package:beta` ;
- `npm run verify:linux:artifacts`.

Il echoue explicitement si aucun artefact Linux n'apparait dans `release.json`.

Verification des artefacts Linux deja produits :

```bash
npm run verify:linux:artifacts
npm run verify:linux:artifacts -- --release-dir ../server-work/static/downloads/local-cockpit
```

Ce controle exige une plateforme `linux` dans `release.json`, compare tailles et SHA256, refuse les extensions non natives et inspecte les fichiers avec `file` si disponible.

Test du verificateur Linux sans attendre une vraie release CI :

```bash
npm run test:linux:artifacts
```

Ce test fabrique une release Linux temporaire avec un binaire ELF minimal renomme en `.AppImage`, verifie le succes, puis corrompt le SHA256 pour verifier que le controle echoue bien.

Dans WSL, ce build peut rester bloque si les paquets `pkg-config`, `libgtk-3-dev` et `libwebkit2gtk-4.1-dev` ne sont pas installes. Dans ce cas, utiliser le workflow GitHub Actions Linux ci-dessous.

Kit de build Linux exportable :

```bash
npm run kit:linux
```

Le script cree sur le Bureau `OutilsIA-Local-Cockpit-Linux-Build-Kit` avec :

- `outilsia-local-cockpit-linux-source.tar.gz` ;
- `README-Linux-Build.md` ;
- `LINUX-BUILD-MANIFEST.txt` avec SHA256 et taille.

Ce kit sert a produire l'artefact Linux sur une vraie machine Ubuntu/Debian avec les dependances Tauri installees, puis a l'importer avec `--merge`.

### Build Windows local

Depuis PowerShell, avec Node.js et Rust dans le `PATH` :

```powershell
cd C:\chemin\vers\outilsia\local-cockpit-app
npm run build:beta:windows
```

Le script `scripts/build-windows-beta.ps1` lance le build Tauri Windows, puis copie sur le Bureau :

- `outilsia-local-cockpit.exe` ;
- `OutilsIA Local Cockpit_0.1.0_x64-setup.exe`.

Le MSI est optionnel. La beta Windows publie en priorite le setup NSIS `.exe`, plus fiable pour cette chaine de build. Le script affiche aussi les SHA256 de chaque fichier.

Verification des artefacts Windows deja produits :

```powershell
npm run verify:windows:artifacts
```

Pour verifier aussi que l'executable natif se lance, depuis PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-windows-artifacts.ps1 -LaunchSmoke
```

Kit testeur Windows sur le Bureau :

```powershell
npm run kit:windows
```

Le kit contient les artefacts, un raccourci de lancement, un README de parcours manuel et un script `Verifier-et-lancer.ps1`.

La page publique de distribution est :

```text
https://outilsia.fr/telecharger-scanner-ia-local
```

Elle reste en mode "build en preparation" tant que le fichier suivant n'existe pas cote site :

```text
server-work/static/downloads/local-cockpit/release.json
```

Preflight avant de lancer ou publier une beta Windows :

```bash
npm run preflight:beta
```

Ce preflight verifie les scripts npm, la configuration Tauri, le workflow GitHub Actions Windows, les scripts `package:beta`/`deploy:beta`, les pages publiques de telechargement/securite, l'absence d'artefacts locaux incoherents et le manifeste desktop production.

Procedure sur la machine qui construit le binaire cible :

```bash
cd local-cockpit-app
npm install
npm run build:beta
npm run package:beta
```

Procedure via GitHub Actions :

```text
Actions -> Local Cockpit Windows Beta -> Run workflow
```

Le workflow `.github/workflows/local-cockpit-windows-beta.yml` :

- installe Node 20 ;
- installe Rust stable ;
- lance `npm ci` ;
- verifie l'UI statique ;
- build Tauri sur `windows-latest` ;
- lance `npm run package:beta` ;
- publie deux artifacts GitHub :
  - `outilsia-local-cockpit-web-release` ;
  - `outilsia-local-cockpit-tauri-bundles`.

Procedure Linux via GitHub Actions :

```text
Actions -> Local Cockpit Linux Beta -> Run workflow
```

Le workflow `.github/workflows/local-cockpit-linux-beta.yml` :

- installe les dependances Tauri Linux/WebKit ;
- installe Node 20 ;
- installe Rust stable ;
- lance `npm ci` ;
- lance `npm run build:beta:linux` ;
- lance `npm run verify:linux:artifacts` ;
- publie deux artifacts GitHub :
  - `outilsia-local-cockpit-linux-web-release` ;
  - `outilsia-local-cockpit-linux-tauri-bundles`.

Procedure multi-plateforme via GitHub Actions :

```text
Actions -> Local Cockpit Cross Platform Beta -> Run workflow
```

Le workflow `.github/workflows/local-cockpit-cross-platform-beta.yml` :

- build une vraie application Windows sur `windows-latest` ;
- build une vraie application Linux sur `ubuntu-24.04` avec GTK/WebKit ;
- lance le packaging beta de chaque plateforme ;
- importe le payload Windows en remplacement ;
- fusionne le payload Linux avec `--merge` ;
- verifie que `release.json` contient `windows-x64`, `linux` et `downloads_by_platform` ;
- publie l'artifact final `local-cockpit-cross-platform-web-release`.

Ce workflow est la voie propre pour sortir une release publique qui contient a la fois le setup Windows et le paquet Linux. La page web ne sert qu'a telecharger les binaires natifs et afficher les hashes SHA256.

Pour activer le bouton de telechargement public, recuperer le contenu de l'artifact `outilsia-local-cockpit-web-release`, puis le deployer dans :

```text
/var/www/outilsia/static/downloads/local-cockpit/
```

Importer l'artifact GitHub dans le workspace local :

```bash
cd local-cockpit-app
npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-web-release.zip --replace
```

Le script accepte aussi un dossier deja extrait. Il verifie `release.json`, les fichiers references, les tailles, les SHA256 et la presence d'au moins un artefact desktop supporte (`windows-x64`, `linux` ou `macos`), puis copie vers `../server-work/static/downloads/local-cockpit/`.

Pour composer une release publique multi-plateforme, importer d'abord le build Windows en remplacement, puis fusionner le build Linux :

```bash
cd local-cockpit-app
npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-web-release.zip --replace
npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-linux-web-release.zip --merge
```

Le mode `--merge` conserve les fichiers deja presents, ajoute ou remplace les fichiers du nouvel artifact, reconstruit `downloads_by_platform` et garde l'installateur Windows `.exe` comme `primary_download` si disponible. Verification rapide du merge :

```bash
npm run test:import:merge
```

Publication assistee d'une release Windows + Linux :

```bash
cd local-cockpit-app
npm run publish:cross-platform -- --input ~/Downloads/local-cockpit-cross-platform-web-release.zip
npm run publish:cross-platform -- --input ~/Downloads/local-cockpit-cross-platform-web-release.zip --deploy
```

Ou avec deux artefacts separes :

```bash
npm run publish:cross-platform -- --windows ~/Downloads/local-cockpit-windows-web-release.zip --linux ~/Downloads/local-cockpit-linux-web-release.zip
```

Le script importe, exige `windows-x64` et `linux`, lance `verify:release:contract`, lance `verify:linux:artifacts`, puis publie seulement avec `--deploy`.

Test local de cette orchestration sans deploiement :

```bash
npm run test:publish:cross-platform
npm run test:release:prod
```

Verification du contrat de release native :

```bash
npm run verify:release:contract
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
```

Ce controle verifie que `release.json` ne pointe que vers des artefacts desktop natifs attendus (`.exe` Windows, MSI optionnel, `.AppImage`/`.deb`/`.rpm`, `.dmg`), que les tailles et SHA256 correspondent aux fichiers, que `primary_download` est coherent et que `downloads_by_platform` reference seulement des fichiers presents.

Publication controlee depuis le workspace local apres import de l'artifact :

```bash
cd local-cockpit-app
npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit
```

Cette commande valide seulement la release en dry-run : presence de `release.json`, fichiers references, tailles et SHA256.

Pour publier sur le VPS OutilsIA :

```bash
cd local-cockpit-app
npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy
```

Le script cree un backup sur le serveur, copie les fichiers dans `/var/www/outilsia/static/downloads/local-cockpit/`, puis reverifie `release.json`, tailles et SHA256 a distance.

Controle public apres deploiement :

```bash
cd local-cockpit-app
npm run verify:release:prod
npm run verify:release:prod -- --require-platform windows-x64 --require-platform linux
```

Cette commande relit `https://outilsia.fr/static/downloads/local-cockpit/release.json`, telecharge chaque fichier public reference, puis compare tailles et SHA256. Le mode `--require-platform` doit etre utilise apres une publication multi-plateforme pour refuser un flux public sans `.exe` Windows et artefact Linux natif. Avant la premiere publication reelle, utiliser le mode optionnel :

```bash
npm run verify:release:prod -- --optional
```

`npm run package:beta` cherche les artefacts Tauri dans `src-tauri/target/release/bundle`, les copie vers :

```text
server-work/static/downloads/local-cockpit/
```

Puis genere :

```text
server-work/static/downloads/local-cockpit/release.json
```

Ce JSON contient :

- version ;
- canal beta ;
- URL du fichier ;
- taille ;
- SHA256 ;
- release notes ;
- telechargement principal.

Quand `release.json` est deployee avec les binaires, la page `/telecharger-scanner-ia-local` active automatiquement le bouton de telechargement, choisit le build recommande selon l'OS visiteur, liste les autres artefacts disponibles et affiche le SHA256.

Pour une beta Windows propre, publier en priorite :

```text
OutilsIA-Local-Cockpit-0.1.0-beta-YYYYMMDDHHMMSS-windows-x64.exe
```

Le timestamp dans le nom evite qu'un ancien binaire reste servi par le cache CDN alors que `release.json` pointe vers un nouveau hash.

Avant diffusion publique :

- verifier le hash SHA256 ;
- tester le scan sur une vraie machine Windows ;
- tester le pairing compte ;
- tester la sync machine ;
- tester MemoryForge et le rapport partageable ;
- documenter l'avertissement SmartScreen si Windows l'affiche.

## V1

- Scan OS, CPU, RAM, GPU et VRAM.
- Detection NVIDIA via `nvidia-smi` quand disponible.
- Detection Ollama via `ollama --version` et `ollama list`.
- Appel public `https://outilsia.fr/api/compatibility/check`.
- Chargement du manifeste `https://outilsia.fr/api/desktop/manifest` pour afficher canal beta, version app, catalogue et capacites backend.
- Interface cockpit desktop avec branding OutilsIA, icone native dediee et controle `verify:branding`.
- Affichage du flux release beta depuis le manifeste : page officielle, `release_feed_url`, bouton download actif quand `release.json` existe.
- Panneau "Nouveaux modeles" depuis `compatibility.new`.
- Panneau "Achats guides" vers les pages OutilsIA adaptees a la machine.
- Historique local des 25 derniers diagnostics, avec rechargement d'un snapshot, actualisation avec le catalogue OutilsIA courant, delta avant/apres en Markdown, export Markdown, suppression d'une entree ou vidage complet depuis l'app.
- Synchronisation compte via `POST /api/desktop/sync`.
- Updates compte via `GET /api/desktop/updates` : machines sauvegardees, nouveaux modeles, commandes Ollama recommandees, upgrade principal, score apres upgrade, modeles debloques/ameliores et achats guides.
- Suppression machine depuis l'app via `DELETE /api/account/machines/{id}` avec nettoyage modeles installes, benchmarks, snapshots et rapports partageables.
- Feedback beta depuis l'app via `POST /api/desktop/feedback` pour signaler detection materiel incorrecte, modele manquant, Ollama, benchmark, sync ou probleme UX.
- Export MemoryForge compte via `GET /api/desktop/machines/{machine_id}/memoryforge.md` avec token desktop.
- Creation d'un rapport partageable `/r/...` apres synchronisation compte.
- Generation locale d'une note MemoryForge/Obsidian avec modeles compatibles, nouveaux modeles, upgrades et shopping list.
- Export natif d'un dossier Obsidian local avec `00-Machine.md`, modeles, benchmarks, achats guides, `05-Shopping-list.md`, `MEMORY.md` et `HERMES.md`.
- Benchmark Ollama local court avec debit estime en tokens/s.
- Synchronisation du benchmark vers le compte via `POST /api/desktop/benchmarks`.
- Benchmarks visibles dans le JSON machine, le compte et l'export MemoryForge.

## Synchronisation compte V1

Le backend synchronise une machine avec un token desktop dedie.
Flux :

1. Cliquer sur `Connecter le compte`.
2. Ouvrir l'URL OutilsIA affichee par l'app.
3. Se connecter au compte OutilsIA si necessaire.
4. Autoriser le code de pairing.
5. Revenir dans l'app et cliquer sur `Verifier le pairing`.
6. Cliquer sur `Synchroniser le PC`.

L'app stocke seulement le token desktop dans son dossier applicatif local. Le cookie web `outilsia_session` n'est pas copie dans l'app.

## Deja present

- Module Windows Runtime discret : etat `Windows natif`, `WSL detecte`, `WSL a installer/configurer`, sans encombrer l'ecran principal.
- Detection et installation guidee WSL si absent, puis detection Ubuntu/Ollama WSL et commandes `wsl.exe ollama ...` quand le runtime Windows natif n'est pas disponible.
- Detection LM Studio, llama.cpp, Docker/WSL et dossiers de modeles.

## Suite prevue

- Historique des machines dans le compte.
- Recommandations Amazon/LDLC par upgrade detecte.
- Benchmarks tokens/s Ollama plus precis avec contexte, modele et backend.
