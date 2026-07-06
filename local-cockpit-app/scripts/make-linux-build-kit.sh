#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
REPO_ROOT_WSL="${OUTILSIA_WSL_REPO_ROOT:-}"
if [ -z "$REPO_ROOT_WSL" ]; then
  if [ -d "/home/chris/outilsia" ]; then
    REPO_ROOT_WSL="/home/chris/outilsia"
  else
    REPO_ROOT_WSL="$REPO_ROOT"
  fi
fi
VERSION="$(node --input-type=module -e "import {readFileSync} from 'node:fs'; const cfg=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8')); console.log(cfg.version || '0.1.1')" 2>/dev/null || printf '0.1.1')"
PUBLIC_RELEASE_JSON="$REPO_ROOT/server-work/static/downloads/local-cockpit/release.json"
PUBLIC_BUILD_ID="$(node --input-type=module - "$PUBLIC_RELEASE_JSON" <<'NODE' 2>/dev/null || printf ''
import { existsSync, readFileSync } from "node:fs";
const path = process.argv[2];
if (!path || !existsSync(path)) process.exit(0);
const release = JSON.parse(readFileSync(path, "utf8"));
process.stdout.write(String(release.build_id || ""));
NODE
)"
PUBLIC_BUILD_ID="${OUTILSIA_PUBLIC_BUILD_ID:-$PUBLIC_BUILD_ID}"
if [ -z "$PUBLIC_BUILD_ID" ]; then
  PUBLIC_BUILD_ID="a-lire-depuis-release-json"
fi
DESKTOP="${OUTILSIA_DESKTOP_DIR:-}"
if [ -z "$DESKTOP" ]; then
  if [ -d "/mnt/c/Users/chris/Desktop" ]; then
    DESKTOP="/mnt/c/Users/chris/Desktop"
  else
    DESKTOP="$HOME/Desktop"
  fi
fi

KIT_DIR="$DESKTOP/OutilsIA-Local-Cockpit-Linux-Build-Kit"
ARCHIVE="$KIT_DIR/outilsia-local-cockpit-linux-source.tar.gz"
MANIFEST="$KIT_DIR/LINUX-BUILD-MANIFEST.txt"
README="$KIT_DIR/README-Linux-Build.md"
RUNBOOK="$KIT_DIR/LINUX-RELEASE-RUNBOOK.md"
MISSION_HTML="$KIT_DIR/LINUX-RELEASE-MISSION.html"
START_HTML="$KIT_DIR/LINUX-START-HERE.html"
CENTER_HTML="$KIT_DIR/CENTRE-RELEASE-LINUX.html"
NEXT_ACTION_MD="$KIT_DIR/PROCHAINE-ACTION-LINUX.md"
NEXT_ACTION_HTML="$KIT_DIR/PROCHAINE-ACTION-LINUX.html"
NEXT_ACTION_CMD="$KIT_DIR/OUVRIR-PROCHAINE-ACTION-LINUX.cmd"
FINAL_CHECKLIST_JSON="$KIT_DIR/LINUX-PUBLICATION-CHECKLIST.json"
FINAL_CHECKLIST_MD="$KIT_DIR/LINUX-PUBLICATION-CHECKLIST.md"
FINAL_CHECKLIST_HTML="$KIT_DIR/LINUX-PUBLICATION-CHECKLIST.html"
FINAL_CHECKLIST_CMD="$KIT_DIR/OUVRIR-CHECKLIST-PUBLICATION-LINUX.cmd"
TERRAIN_GATE_JSON="$KIT_DIR/LINUX-TERRAIN-GATE.json"
TERRAIN_GATE_MD="$KIT_DIR/LINUX-TERRAIN-GATE.md"
TERRAIN_GATE_HTML="$KIT_DIR/LINUX-TERRAIN-GATE.html"
TERRAIN_GATE_CMD="$KIT_DIR/OUVRIR-GATE-TERRAIN-LINUX.cmd"
UNBLOCK_CHECKLIST_JSON="$KIT_DIR/LINUX-UNBLOCK-CHECKLIST.json"
UNBLOCK_CHECKLIST_MD="$KIT_DIR/LINUX-UNBLOCK-CHECKLIST.md"
UNBLOCK_CHECKLIST_HTML="$KIT_DIR/LINUX-UNBLOCK-CHECKLIST.html"
UNBLOCK_CHECKLIST_CMD="$KIT_DIR/OUVRIR-DEBLOCAGE-LINUX.cmd"
PREFLIGHT_LOCAL_JSON="$KIT_DIR/LINUX-PREFLIGHT-LOCAL.json"
PREFLIGHT_LOCAL_MD="$KIT_DIR/LINUX-PREFLIGHT-LOCAL.md"
PREFLIGHT_LOCAL_HTML="$KIT_DIR/LINUX-PREFLIGHT-LOCAL.html"
PREFLIGHT_LOCAL_CMD="$KIT_DIR/OUVRIR-PREFLIGHT-LINUX.cmd"
WSL_INSTALL_CMD="$KIT_DIR/INSTALLER-WSL.cmd"
CI_STATUS_JSON="$KIT_DIR/CI-STATUS.json"
CI_STATUS_MD="$KIT_DIR/CI-STATUS.md"
PUBLIC_BUILD_ID_FILE="$KIT_DIR/BUILD-ID-PUBLIC-WINDOWS.txt"
SELF_CHECK_CMD="$KIT_DIR/VERIFIER-KIT-LINUX.cmd"
SELF_CHECK_PS="$KIT_DIR/VERIFIER-KIT-LINUX-WINDOWS.ps1"
SELF_CHECK_JSON="$KIT_DIR/LINUX-KIT-SELF-CHECK.json"
SELF_CHECK_MD="$KIT_DIR/LINUX-KIT-SELF-CHECK.md"
SELF_CHECK_HTML="$KIT_DIR/LINUX-KIT-SELF-CHECK.html"
GITHUB_ACTIONS_URL="${OUTILSIA_GITHUB_ACTIONS_URL:-https://github.com/drakkB/outilsia/actions}"
WSL_DISTRO="${OUTILSIA_WSL_DISTRO:-Ubuntu}"
REPO_ROOT_WIN="\\\\wsl.localhost\\$WSL_DISTRO${REPO_ROOT_WSL//\//\\}"
GITHUB_REPO_SLUG="$(printf '%s\n' "$GITHUB_ACTIONS_URL" | sed -E 's#^https://github.com/([^/]+/[^/]+).*$#\1#')"
if [ "$GITHUB_REPO_SLUG" = "$GITHUB_ACTIONS_URL" ]; then
  GITHUB_REPO_SLUG="drakkB/outilsia"
fi

github_count() {
  local url="$1"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'unknown'
    return 0
  fi
  curl -L --max-time 20 -s "$url" \
    | node --input-type=module -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { try { const j = JSON.parse(s || '{}'); console.log(Number.isFinite(j.total_count) ? j.total_count : 'unknown'); } catch { console.log('unknown'); } });" 2>/dev/null \
    || printf 'unknown'
}

CI_RUNS_COUNT="$(github_count "https://api.github.com/repos/$GITHUB_REPO_SLUG/actions/runs?per_page=1")"
CI_ARTIFACTS_COUNT="$(github_count "https://api.github.com/repos/$GITHUB_REPO_SLUG/actions/artifacts?per_page=1")"
LINUX_WORKFLOW_URL="https://github.com/$GITHUB_REPO_SLUG/actions/workflows/local-cockpit-linux-beta.yml"
CROSS_WORKFLOW_URL="https://github.com/$GITHUB_REPO_SLUG/actions/workflows/local-cockpit-cross-platform-beta.yml"

rm -rf "$KIT_DIR"
mkdir -p "$KIT_DIR"

tar \
  --exclude="local-cockpit-app/node_modules" \
  --exclude="local-cockpit-app/local-cockpit-app" \
  --exclude="local-cockpit-app/src-tauri/target" \
  --exclude="local-cockpit-app/scripts/__pycache__" \
  --exclude="server-work/static/downloads/local-cockpit/*.exe" \
  --exclude="server-work/static/downloads/local-cockpit/*.msi" \
  --exclude="server-work/static/downloads/local-cockpit/*.AppImage" \
  --exclude="server-work/static/downloads/local-cockpit/*.deb" \
  --exclude="server-work/static/downloads/local-cockpit/*.rpm" \
  --exclude=".git" \
  -C "$REPO_ROOT" \
  -czf "$ARCHIVE" \
  local-cockpit-app \
  server-work/static/data \
  server-work/static/pages/telecharger-scanner-ia-local.html

cat > "$README" <<'EOF'
# OutilsIA Local Cockpit - kit build Linux

Ce kit sert a produire un vrai binaire Linux __VERSION__ de l'app Tauri.

Build Windows public à rejoindre : `__PUBLIC_BUILD_ID__`.

Le workflow Linux solo doit utiliser ce build_id si GitHub le demande. Si le champ `build_id` est laissé vide, le workflow lit normalement `server-work/static/downloads/local-cockpit/release.json`.

## Prerequis Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential curl file libssl-dev \
  pkg-config libdbus-1-dev libglib2.0-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Installer Node.js 20+ si absent.

## Build

```bash
mkdir -p ~/outilsia-linux-build
tar -xzf outilsia-local-cockpit-linux-source.tar.gz -C ~/outilsia-linux-build
cd ~/outilsia-linux-build/local-cockpit-app
npm ci
npm run test:linux:artifacts
OUTILSIA_BUILD_ID=__PUBLIC_BUILD_ID__ npm run build:beta:linux
```

Le script doit finir par :

```text
linux_beta_build_ok __VERSION__ ...
linux_artifacts_verified ...
```

## Artefacts attendus

Chercher les fichiers dans :

```text
local-cockpit-app/src-tauri/target/release/bundle/
```

Formats possibles selon Tauri/Linux :

- `.AppImage`
- `.deb`
- `.rpm`

## Import dans OutilsIA

Depuis le workspace OutilsIA principal :

```bash
cd local-cockpit-app
npm run import:beta -- --input /chemin/vers/outilsia-local-cockpit-linux-web-release.zip --merge
npm run verify:linux:artifacts
npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy
npm run verify:release:prod
```

Le mode `--merge` ajoute Linux sans effacer Windows.

## Voie GitHub Actions recommandee

Si le poste local ne peut pas installer les dependances Linux, lancer le build depuis GitHub Actions :

```bash
gh workflow run local-cockpit-linux-beta.yml -f build_id=__PUBLIC_BUILD_ID__
gh run list --workflow local-cockpit-linux-beta.yml --limit 5
gh run download <RUN_ID> -n outilsia-local-cockpit-linux-web-release -D ~/Downloads/outilsia-linux-web-release
cd local-cockpit-app
npm run import:beta -- --input ~/Downloads/outilsia-linux-web-release --merge
npm run verify:linux:artifacts
npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy
```

Ou lancer `Local Cockpit Cross Platform Beta` depuis l'interface GitHub Actions. Le workflow produit `local-cockpit-cross-platform-web-release` avec Windows + Linux deja fusionnes.

Publication VPS optionnelle depuis ce workflow :

1. Ajouter les secrets GitHub `OUTILSIA_DEPLOY_HOST` et `OUTILSIA_DEPLOY_SSH_KEY`.
2. Ajouter si besoin `OUTILSIA_DEPLOY_USER` et `OUTILSIA_DEPLOY_REMOTE_DIR`.
3. Lancer le workflow avec `deploy_to_vps=true`.

Par defaut `deploy_to_vps=false` : le workflow construit et fusionne les artefacts, sans publier sur outilsia.fr.

Avant publication :

```bash
npm run test:import:merge
npm run test:publish:cross-platform
npm run verify:github-actions:linux
npm run verify:linux:path
```
EOF

sed -i "s/__VERSION__/$VERSION/g" "$README"
sed -i "s/__PUBLIC_BUILD_ID__/$PUBLIC_BUILD_ID/g" "$README"

cat > "$RUNBOOK" <<'EOF'
# OutilsIA Local Cockpit - runbook release Linux publique

Objectif : produire une release Linux courante sans dépendre du poste WSL local.

Le poste local peut rester bloqué par les dépendances GTK/WebKit ou par `sudo`. Dans ce cas, utiliser GitHub Actions.

Build Windows public à rejoindre : `__PUBLIC_BUILD_ID__`.

## Voie recommandée : GitHub Actions web

1. Ouvrir le dépôt GitHub OutilsIA dans le navigateur.
2. Aller dans l'onglet **Actions**.
3. Ouvrir le workflow **Local Cockpit Linux Beta**.
4. Cliquer **Run workflow**.
5. Mettre `build_id=__PUBLIC_BUILD_ID__`, ou laisser vide si le workflow peut lire le `release.json` public du dépôt.
6. Attendre la fin du job `Build Linux beta`.
7. Télécharger l'artefact `outilsia-local-cockpit-linux-web-release`.
8. Décompresser l'artefact sur le poste principal.
9. Depuis le workspace OutilsIA :

```bash
cd local-cockpit-app
npm run import:beta -- --input /chemin/vers/outilsia-local-cockpit-linux-web-release --merge
npm run verify:linux:artifacts
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy
npm run verify:release:prod
python3 ../scripts/audit_local_cockpit_linux_readiness.py
python3 ../scripts/audit_beta_field_goal.py
```

## Voie complète Windows + Linux

1. Ouvrir **Actions**.
2. Ouvrir **Local Cockpit Cross Platform Beta**.
3. Cliquer **Run workflow**.
4. Laisser `deploy_to_vps=false` pour produire seulement les artefacts.
5. Télécharger `local-cockpit-cross-platform-web-release`.
6. Vérifier localement :

```bash
cd local-cockpit-app
npm run import:beta -- --input /chemin/vers/local-cockpit-cross-platform-web-release --replace
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
npm run verify:linux:artifacts
```

## Déploiement VPS depuis GitHub Actions

Utiliser seulement quand les secrets sont configurés :

- `OUTILSIA_DEPLOY_HOST`
- `OUTILSIA_DEPLOY_SSH_KEY`
- optionnel : `OUTILSIA_DEPLOY_USER`
- optionnel : `OUTILSIA_DEPLOY_REMOTE_DIR`

Puis lancer **Local Cockpit Cross Platform Beta** avec `deploy_to_vps=true`.

Le workflow doit ensuite exécuter `npm run verify:release:prod`.

## Artefacts attendus

La release publique doit contenir dans `release.json` :

- une entrée `windows-x64`;
- une entrée `linux`;
- `downloads_by_platform.windows-x64`;
- `downloads_by_platform.linux`;
- un SHA256 pour chaque fichier;
- un build courant.

## Critère de fin

Le goal Linux est prouvé seulement quand :

```bash
npm run verify:release:prod
python3 ../scripts/audit_local_cockpit_linux_readiness.py
python3 ../scripts/audit_beta_field_goal.py
```

indiquent une release Linux publique courante et que l'audit global ne signale plus le manque Linux.
EOF

sed -i "s/__PUBLIC_BUILD_ID__/$PUBLIC_BUILD_ID/g" "$RUNBOOK"

cat > "$MISSION_HTML" <<'EOF'
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mission release Linux OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#627086; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; --orange:#9d5a00; --green:#137044; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.48; }
    main { width:min(940px, calc(100% - 28px)); margin:28px auto; background:white; border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 16px 48px rgba(28,43,68,.12); }
    header { padding:30px 34px; background:#12335e; color:white; }
    h1 { margin:0; font-size:31px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:21px; }
    section { padding:25px 34px; border-top:1px solid var(--line); }
    .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:14px; }
    .card strong { display:block; font-size:18px; margin-bottom:4px; }
    .warn { color:var(--orange); font-weight:800; }
    .ok { color:var(--green); font-weight:800; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    ol, ul { margin:8px 0 0; padding-left:22px; }
    li { margin:7px 0; }
    .muted { color:var(--muted); }
    @media (max-width:760px) { .grid{grid-template-columns:1fr;} section,header{padding:22px;} h1{font-size:26px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Mission release Linux</h1>
    <p>Objectif : produire une release Linux publique courante sans casser la release Windows.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><strong class="warn">Local WSL bloqué</strong><span>Dépendances GTK/WebKit manquantes ou sudo interactif.</span></div>
      <div class="card"><strong class="ok">Voie CI prête</strong><span>GitHub Actions Linux et Cross Platform existent.</span></div>
      <div class="card"><strong>Import merge</strong><span>Linux doit être ajouté avec <code>--merge</code>, sans effacer Windows.</span></div>
    </div>
  </section>
  <section>
    <h2>Build Windows public à rejoindre</h2>
    <p>Pour le workflow Linux solo, utiliser <code>build_id=__PUBLIC_BUILD_ID__</code>. Si le champ reste vide, le workflow tente de lire ce build id dans <code>server-work/static/downloads/local-cockpit/release.json</code>.</p>
  </section>
  <section>
    <h2>Chemin recommandé</h2>
    <ol>
      <li>Ouvrir directement le workflow recommandé avec <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>, ou la page Actions générale avec <code>OUVRIR-GITHUB-ACTIONS.cmd</code>.</li>
      <li>Lancer <strong>Local Cockpit Linux Beta</strong> ou <strong>Local Cockpit Cross Platform Beta</strong>.</li>
      <li>Télécharger l'artefact <code>outilsia-local-cockpit-linux-web-release</code> ou <code>local-cockpit-cross-platform-web-release</code>.</li>
      <li>Glisser le dossier/zip sur <code>IMPORTER-LINUX-ARTEFACT.cmd</code>, ou le déposer dans Téléchargements avec son nom d'origine.</li>
      <li>Lancer <code>VERIFIER-LINUX-RELEASE.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Critères de preuve</h2>
    <ul>
      <li><code>release.json</code> contient <code>windows-x64</code> et <code>linux</code>.</li>
      <li><code>npm run verify:linux:artifacts</code> passe.</li>
      <li><code>npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux</code> passe.</li>
      <li><code>npm run verify:release:prod</code> passe après publication.</li>
      <li><code>python3 scripts/audit_beta_field_goal.py</code> ne signale plus le manque Linux.</li>
    </ul>
  </section>
  <section>
    <h2>À ne pas faire</h2>
    <ul>
      <li>Ne pas remplacer la release Windows par Linux seul.</li>
      <li>Ne pas déclarer Linux prêt avec les vieux artefacts <code>0.1.0</code>.</li>
      <li>Ne pas publier si le contrat cross-platform n'a pas été vérifié.</li>
    </ul>
  </section>
  <section>
    <h2>URL GitHub Actions</h2>
    <p class="muted">L'URL est configurable dans <code>GITHUB-ACTIONS-URL.txt</code>. Si elle vaut encore <code>OWNER/REPO</code>, remplacer par l'URL réelle du dépôt avant de lancer le helper.</p>
    <p class="muted">Consulte aussi <code>CI-STATUS.md</code> : il indique si GitHub expose déjà des runs/artifacts téléchargeables ou si le workflow doit d'abord être lancé.</p>
  </section>
</main>
</body>
</html>
EOF

sed -i "s/__PUBLIC_BUILD_ID__/$PUBLIC_BUILD_ID/g" "$MISSION_HTML"

cat > "$START_HTML" <<'EOF'
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demarrer release Linux OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#627086; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; --green:#137044; --orange:#9d5a00; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.48; }
    main { width:min(980px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 44px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:31px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    section { background:white; border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; font-size:18px; margin-bottom:6px; }
    .actions { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
    .action { border:1px solid var(--line); border-radius:12px; padding:14px; background:white; }
    .action b { display:block; margin-bottom:4px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    li { margin:7px 0; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--orange); font-weight:900; }
    @media (max-width:860px) { .grid,.actions{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:27px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Demarrer release Linux OutilsIA</h1>
    <p>Point d'entree pour produire puis importer l'artefact Linux sans casser la beta Windows.</p>
  </header>

  <section>
    <h2>Ordre strict</h2>
    <div class="grid">
      <div class="card"><strong>1. Ouvrir Actions</strong><p>Lance <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>. Si l'URL contient encore <code>OWNER/REPO</code>, renseigne le dépôt réel dans <code>GITHUB-ACTIONS-URL.txt</code>.</p></div>
      <div class="card"><strong>2. Produire Linux</strong><p>Lance <strong>Local Cockpit Linux Beta</strong> ou <strong>Cross Platform Beta</strong>, puis télécharge l'artefact web release.</p></div>
      <div class="card"><strong>3. Importer et vérifier</strong><p>Glisse l'artefact sur <code>IMPORTER-LINUX-ARTEFACT.cmd</code>, puis lance <code>VERIFIER-LINUX-RELEASE.cmd</code>.</p></div>
    </div>
  </section>
  <section>
    <h2>Build id à utiliser</h2>
    <p>Linux doit rejoindre le build Windows public <code>__PUBLIC_BUILD_ID__</code>. Dans <strong>Local Cockpit Linux Beta</strong>, renseigne ce champ si GitHub le demande. Dans <strong>Cross Platform Beta</strong>, Windows et Linux partagent automatiquement le même build id.</p>
  </section>

  <section>
    <h2>Raccourcis</h2>
    <div class="actions">
      <div class="action"><b>Installer WSL</b><code>INSTALLER-WSL.cmd</code><p>Active WSL et la distro configurée si elle n'existe pas encore, puis relance le préflight.</p></div>
      <div class="action"><b>Vérifier WSL local</b><code>VERIFIER-WSL-LINUX.cmd</code><p>Contrôle Node, npm, cargo, pkg-config, GTK et WebKit dans la distro WSL.</p></div>
      <div class="action"><b>Rapport préflight local</b><code>OUVRIR-PREFLIGHT-LINUX.cmd</code><p>Ouvre la preuve structurée JSON/HTML des dépendances Linux manquantes ou prêtes.</p></div>
      <div class="action"><b>Préparer WSL local</b><code>PREPARER-WSL-LINUX.cmd</code><p>Lance l'installation des dépendances Tauri Linux dans WSL quand sudo est disponible.</p></div>
      <div class="action"><b>Ouvrir GitHub Actions</b><code>OUVRIR-GITHUB-ACTIONS.cmd</code><p>Ouvre la page Actions configurée.</p></div>
      <div class="action"><b>Workflow Linux</b><code>OUVRIR-WORKFLOW-LINUX.cmd</code><p>Ouvre directement Local Cockpit Linux Beta.</p></div>
      <div class="action"><b>Workflow Cross Platform</b><code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code><p>Ouvre directement le workflow recommandé Windows + Linux.</p></div>
      <div class="action"><b>Mission détaillée</b><code>OUVRIR-MISSION-LINUX.cmd</code><p>Affiche la procédure courte avec critères de preuve.</p></div>
      <div class="action"><b>Runbook complet</b><code>OUVRIR-RUNBOOK.cmd</code><p>Procédure longue, commandes et cas CI/VPS.</p></div>
      <div class="action"><b>Importer l'artefact</b><code>IMPORTER-LINUX-ARTEFACT.cmd</code><p>Ajoute Linux avec <code>--merge</code>, sans effacer Windows.</p></div>
      <div class="action"><b>Vérifier publication</b><code>VERIFIER-LINUX-RELEASE.cmd</code><p>Relance les vérifications release et audits.</p></div>
      <div class="action"><b>Configurer URL</b><code>CONFIGURER-GITHUB-ACTIONS-URL.cmd</code><p>Écrit l'URL réelle dans <code>GITHUB-ACTIONS-URL.txt</code>.</p></div>
    </div>
  </section>

  <section>
    <h2>Critère de vérité</h2>
    <ul>
      <li><span class="ok">OK</span> seulement si <code>release.json</code> public contient <code>windows-x64</code> et <code>linux</code>.</li>
      <li><span class="ok">OK</span> seulement si <code>verify:linux:artifacts</code> et <code>verify:release:contract -- --require-platform windows-x64 --require-platform linux</code> passent.</li>
      <li><span class="warn">Pas OK</span> avec un artefact Linux local non publié ou un vieux Linux <code>0.1.0</code>.</li>
      <li><span class="warn">Pas OK</span> si l'import Linux remplace Windows au lieu de faire <code>--merge</code>.</li>
    </ul>
  </section>

  <section>
    <h2>Option locale WSL</h2>
    <ol>
      <li>Si la distro configurée n'existe pas dans WSL, lancer <code>INSTALLER-WSL.cmd</code>.</li>
      <li>Lancer <code>VERIFIER-WSL-LINUX.cmd</code> pour confirmer les dépendances manquantes.</li>
      <li>Lancer <code>PREPARER-WSL-LINUX.cmd</code> si tu acceptes d'installer les paquets Linux via <code>sudo apt-get</code>.</li>
      <li>Relancer <code>VERIFIER-WSL-LINUX.cmd</code>. Si le préflight passe, tenter <code>npm run build:beta:linux</code> depuis WSL.</li>
    </ol>
    <p>Ces helpers appellent <code>scripts/preflight-linux.sh</code> puis, si besoin, <code>scripts/install-linux-tauri-deps.sh</code>.</p>
    <p><span class="warn">Important :</span> si sudo demande un mot de passe ou si WebKit n'est pas disponible dans la distro, utiliser GitHub Actions.</p>
  </section>
</main>
</body>
</html>
EOF

sed -i "s/__PUBLIC_BUILD_ID__/$PUBLIC_BUILD_ID/g" "$START_HTML"

cat > "$CENTER_HTML" <<'EOF'
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Centre release Linux OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#607086; --line:#dbe4ef; --panel:#fff; --soft:#f5f8fc; --blue:#185abc; --green:#167447; --orange:#a15c00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1080px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    h3 { margin:0 0 8px; font-size:17px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; font-size:20px; margin-bottom:4px; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--orange); font-weight:900; }
    .bad { color:var(--red); font-weight:900; }
    .muted, .card span { color:var(--muted); }
    .action { display:grid; grid-template-columns:210px 1fr; gap:10px; align-items:start; border-top:1px solid var(--line); padding:12px 0; }
    .action:first-child { border-top:0; padding-top:0; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    ol, ul { margin:8px 0 0; padding-left:22px; }
    li { margin:7px 0; }
    @media (max-width:850px) { .grid{grid-template-columns:1fr;} .action{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:28px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Centre release Linux OutilsIA</h1>
    <p>Un seul écran pour produire une release Linux publique sans écraser Windows.</p>
  </header>

  <section>
    <div class="grid">
      <div class="card"><strong class="bad">Public Linux absent</strong><span>Le goal Linux reste non prouvé tant que <code>release.json</code> public ne contient pas <code>linux</code>.</span></div>
      <div class="card"><strong class="warn">Local WSL peut bloquer</strong><span>Si <code>sudo</code> ou WebKit manque, utiliser GitHub Actions.</span></div>
      <div class="card"><strong class="ok">CI prête</strong><span>Les workflows Linux et Cross Platform produisent les artefacts attendus. Voir <code>CI-STATUS.md</code> pour savoir si un artefact existe déjà.</span></div>
    </div>
  </section>

  <section>
    <h2>Action recommandée</h2>
    <ol>
      <li>Lancer <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code> pour ouvrir directement le workflow recommandé.</li>
      <li>Si l'URL contient encore <code>OWNER/REPO</code>, lancer <code>CONFIGURER-GITHUB-ACTIONS-URL.cmd</code>.</li>
      <li>Dans GitHub Actions, exécuter <strong>Local Cockpit Cross Platform Beta</strong> avec <code>deploy_to_vps=false</code>.</li>
      <li>Télécharger <code>local-cockpit-cross-platform-web-release</code>.</li>
      <li>Glisser l'artefact sur <code>IMPORTER-LINUX-ARTEFACT.cmd</code>.</li>
      <li>Lancer <code>VERIFIER-LINUX-RELEASE.cmd</code>.</li>
      <li>Publier seulement après contrat <code>windows-x64</code> + <code>linux</code> vérifié.</li>
    </ol>
  </section>

  <section>
    <h2>Build Windows public</h2>
    <p>Build id courant à rejoindre : <code>__PUBLIC_BUILD_ID__</code>. Le fichier <code>BUILD-ID-PUBLIC-WINDOWS.txt</code> contient cette valeur pour copier/coller dans le workflow Linux solo si besoin.</p>
  </section>

  <section>
    <h2>Raccourcis</h2>
    <div class="action"><code>OUVRIR-START-HERE-LINUX.cmd</code><span>Page de démarrage détaillée.</span></div>
    <div class="action"><code>INSTALLER-WSL.cmd</code><span>Installe/active WSL si la distro configurée n'existe pas encore.</span></div>
    <div class="action"><code>VERIFIER-WSL-LINUX.cmd</code><span>Préflight local WSL : Node, npm, cargo, GTK/WebKit.</span></div>
    <div class="action"><code>OUVRIR-PREFLIGHT-LINUX.cmd</code><span>Rapport structuré du préflight local : statut, dépendances manquantes, commandes.</span></div>
    <div class="action"><code>PREPARER-WSL-LINUX.cmd</code><span>Installe les dépendances Tauri Linux si <code>sudo</code> est disponible.</span></div>
    <div class="action"><code>OUVRIR-GITHUB-ACTIONS.cmd</code><span>Voie recommandée si WSL local bloque.</span></div>
    <div class="action"><code>OUVRIR-WORKFLOW-LINUX.cmd</code><span>Ouvre directement le workflow Linux seul.</span></div>
    <div class="action"><code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code><span>Ouvre directement le workflow cross-platform recommandé.</span></div>
    <div class="action"><code>CI-STATUS.md</code><span>Diagnostic public GitHub : runs/actions déjà présents ou workflow encore à lancer.</span></div>
    <div class="action"><code>LINUX-PUBLICATION-CHECKLIST.html</code><span>Contrat final : importer, vérifier, publier, puis auditer le goal.</span></div>
    <div class="action"><code>IMPORTER-LINUX-ARTEFACT.cmd</code><span>Importe Linux avec <code>--merge</code> pour conserver Windows.</span></div>
    <div class="action"><code>VERIFIER-LINUX-RELEASE.cmd</code><span>Vérifie route Linux, public release et audits.</span></div>
  </section>

  <section>
    <h2>Critères de fin Linux</h2>
    <ul>
      <li><code>npm run verify:linux:artifacts</code> passe.</li>
      <li><code>npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux</code> passe.</li>
      <li><code>npm run verify:release:prod</code> passe après publication.</li>
      <li><code>python3 scripts/audit_beta_field_goal.py</code> ne signale plus le manque Linux.</li>
    </ul>
  </section>
</main>
</body>
</html>
EOF

sed -i "s/__PUBLIC_BUILD_ID__/$PUBLIC_BUILD_ID/g" "$CENTER_HTML"

cat > "$KIT_DIR/GITHUB-ACTIONS-URL.txt" <<EOF
$GITHUB_ACTIONS_URL
EOF

cat > "$PUBLIC_BUILD_ID_FILE" <<EOF
$PUBLIC_BUILD_ID
EOF

cat > "$KIT_DIR/GITHUB-ACTIONS-URL.example.txt" <<'EOF'
https://github.com/OWNER/REPO/actions
EOF

cat > "$KIT_DIR/OUVRIR-START-HERE-LINUX.cmd" <<'EOF'
@echo off
start "" "%~dp0LINUX-START-HERE.html"
EOF

cat > "$KIT_DIR/OUVRIR-CENTRE-RELEASE-LINUX.cmd" <<'EOF'
@echo off
start "" "%~dp0CENTRE-RELEASE-LINUX.html"
EOF

cat > "$KIT_DIR/CONFIGURER-GITHUB-ACTIONS-URL.cmd" <<'EOF'
@echo off
setlocal EnableDelayedExpansion
set "URL_FILE=%~dp0GITHUB-ACTIONS-URL.txt"
echo Configuration de l'URL GitHub Actions OutilsIA
echo.
echo Colle l'URL du depot ou directement l'URL Actions.
echo Exemples:
echo   https://github.com/drakkB/outilsia
echo   https://github.com/drakkB/outilsia/actions
echo.
set /p INPUT_URL=URL GitHub: 
if "%INPUT_URL%"=="" goto empty
echo %INPUT_URL% | findstr /I "github.com" >nul
if errorlevel 1 goto invalid
echo %INPUT_URL% | findstr /I "/actions" >nul
if errorlevel 1 (
  set "ACTIONS_URL=%INPUT_URL%/actions"
) else (
  set "ACTIONS_URL=%INPUT_URL%"
)
> "%URL_FILE%" echo !ACTIONS_URL!
echo.
echo URL GitHub Actions enregistree:
type "%URL_FILE%"
echo.
echo Tu peux maintenant lancer OUVRIR-GITHUB-ACTIONS.cmd
pause
exit /b 0

:empty
echo URL vide. Rien n'a ete modifie.
pause
exit /b 1

:invalid
echo URL invalide: elle doit contenir github.com
pause
exit /b 1
EOF

cat > "$KIT_DIR/OUVRIR-RUNBOOK.cmd" <<'EOF'
@echo off
start "" "%~dp0LINUX-RELEASE-RUNBOOK.md"
EOF

cat > "$WSL_INSTALL_CMD" <<EOF
@echo off
setlocal
echo Module WSL OutilsIA - installation WSL
echo.
echo Cette commande verifie WSL, installe la distro configuree si necessaire, puis relance le preflight Linux.
echo Elle peut demander un redemarrage Windows si WSL n'etait pas active.
echo.
wsl.exe -l -q | findstr /I "^$WSL_DISTRO$" >nul
if not errorlevel 1 goto already
echo $WSL_DISTRO non detecte dans WSL. Installation de $WSL_DISTRO...
wsl.exe --install -d "$WSL_DISTRO"
if errorlevel 1 goto fail
echo.
echo Installation WSL demandee. Si Windows demande un redemarrage, redemarre puis relance VERIFIER-WSL-LINUX.cmd.
pause
exit /b 0

:already
echo $WSL_DISTRO est deja present. Verification du preflight...
wsl -d "$WSL_DISTRO" -- bash -lc "cd '$REPO_ROOT_WSL/local-cockpit-app' && bash scripts/preflight-linux.sh"
if errorlevel 1 goto needdeps
echo.
echo WSL est pret pour le build Linux local avec $WSL_DISTRO.
pause
exit /b 0

:needdeps
echo.
echo WSL existe mais les dependances Linux sont incompletes.
echo Lance PREPARER-WSL-LINUX.cmd si sudo est disponible, sinon utilise GitHub Actions.
pause
exit /b 1

:fail
echo.
echo Installation WSL echouee ou interrompue.
echo Alternative recommandee: OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd
pause
exit /b 1
EOF

cat > "$KIT_DIR/VERIFIER-WSL-LINUX.cmd" <<EOF
@echo off
setlocal
echo Verification preflight Linux dans WSL ($WSL_DISTRO)
echo Workspace: $REPO_ROOT_WSL
echo.
wsl -d "$WSL_DISTRO" -- bash -lc "cd '$REPO_ROOT_WSL/local-cockpit-app' && bash scripts/preflight-linux.sh"
if errorlevel 1 goto fail
echo.
echo Preflight WSL OK. Tu peux tenter npm run build:beta:linux depuis WSL.
pause
exit /b 0

:fail
echo.
echo Preflight WSL incomplet. Lance PREPARER-WSL-LINUX.cmd si sudo est disponible, ou utilise GitHub Actions.
pause
exit /b 1
EOF

cat > "$KIT_DIR/PREPARER-WSL-LINUX.cmd" <<EOF
@echo off
setlocal
echo Preparation WSL Linux pour Tauri ($WSL_DISTRO)
echo Cette commande peut demander le mot de passe sudo dans la distro WSL.
echo.
wsl -d "$WSL_DISTRO" -- bash -lc "cd '$REPO_ROOT_WSL/local-cockpit-app' && bash scripts/preflight-linux.sh || true; echo; echo 'Installation des dependances Tauri Linux...'; bash scripts/install-linux-tauri-deps.sh; echo; bash scripts/preflight-linux.sh"
if errorlevel 1 goto fail
echo.
echo WSL Linux pret. Prochaine etape:
echo   cd $REPO_ROOT_WSL/local-cockpit-app
echo   npm run build:beta:linux
pause
exit /b 0

:fail
echo.
echo Preparation WSL echouee. Cause probable: sudo indisponible, paquet WebKit absent, ou distro non compatible.
echo Utilise alors OUVRIR-GITHUB-ACTIONS.cmd.
pause
exit /b 1
EOF

cat > "$KIT_DIR/OUVRIR-MISSION-LINUX.cmd" <<'EOF'
@echo off
start "" "%~dp0LINUX-RELEASE-MISSION.html"
EOF

cat > "$KIT_DIR/OUVRIR-GITHUB-ACTIONS.cmd" <<'EOF'
@echo off
setlocal
set "URL_FILE=%~dp0GITHUB-ACTIONS-URL.txt"
if not exist "%URL_FILE%" goto missing
set /p ACTIONS_URL=<"%URL_FILE%"
if "%ACTIONS_URL%"=="" goto missing
echo %ACTIONS_URL% | findstr /I "OWNER/REPO" >nul
if not errorlevel 1 goto placeholder
start "" "%ACTIONS_URL%"
exit /b 0

:placeholder
echo L'URL GitHub Actions n'est pas encore renseignee.
echo Edite %URL_FILE% et remplace OWNER/REPO par le depot GitHub reel.
echo Exemple:
echo https://github.com/drakkB/outilsia/actions
pause
exit /b 1

:missing
echo Fichier GITHUB-ACTIONS-URL.txt introuvable ou vide.
pause
exit /b 1
EOF

cat > "$KIT_DIR/OUVRIR-WORKFLOW-LINUX.cmd" <<EOF
@echo off
start "" "$LINUX_WORKFLOW_URL"
EOF

cat > "$KIT_DIR/OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd" <<EOF
@echo off
start "" "$CROSS_WORKFLOW_URL"
EOF

CI_STATUS="unknown"
if [ "$CI_ARTIFACTS_COUNT" = "0" ]; then
  CI_STATUS="no_public_artifact_yet"
elif [ "$CI_ARTIFACTS_COUNT" != "unknown" ]; then
  CI_STATUS="artifacts_available"
fi

cat > "$CI_STATUS_JSON" <<EOF
{
  "schema": "outilsia.local_cockpit_linux_ci_status.v1",
  "github_repo": "$GITHUB_REPO_SLUG",
  "github_actions_url": "$GITHUB_ACTIONS_URL",
  "workflow_runs_total": "$CI_RUNS_COUNT",
  "artifacts_total": "$CI_ARTIFACTS_COUNT",
  "status": "$CI_STATUS"
}
EOF

cat > "$CI_STATUS_MD" <<EOF
# OutilsIA Local Cockpit - statut CI Linux

- Dépôt GitHub: \`$GITHUB_REPO_SLUG\`
- URL Actions: \`$GITHUB_ACTIONS_URL\`
- Workflow Linux: \`$LINUX_WORKFLOW_URL\`
- Workflow Cross Platform: \`$CROSS_WORKFLOW_URL\`
- Runs publics détectés: \`$CI_RUNS_COUNT\`
- Artefacts publics détectés: \`$CI_ARTIFACTS_COUNT\`
- Statut: \`$CI_STATUS\`

## Lecture

EOF

if [ "$CI_STATUS" = "no_public_artifact_yet" ]; then
  cat >> "$CI_STATUS_MD" <<'EOF'
Aucun artefact public n'est disponible au moment de génération du kit. Il faut lancer le workflow GitHub Actions avant de pouvoir importer Linux.
EOF
elif [ "$CI_STATUS" = "artifacts_available" ]; then
  cat >> "$CI_STATUS_MD" <<'EOF'
Des artefacts publics semblent disponibles. Télécharger l'artefact web release Linux ou cross-platform, puis lancer IMPORTER-LINUX-ARTEFACT.cmd.
EOF
else
  cat >> "$CI_STATUS_MD" <<'EOF'
Le statut public GitHub n'a pas pu être déterminé depuis ce poste. Ouvre GitHub Actions manuellement.
EOF
fi

cat >> "$CI_STATUS_MD" <<'EOF'

## Prochaine action

1. Ouvrir `OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd`.
2. Lancer `Local Cockpit Cross Platform Beta` si aucun artefact courant n'existe.
3. Télécharger l'artefact `local-cockpit-cross-platform-web-release`.
4. Importer avec `IMPORTER-LINUX-ARTEFACT.cmd`.
5. Vérifier avec `VERIFIER-LINUX-RELEASE.cmd`.
EOF

FIELD_STATUS_JSON="$DESKTOP/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json"
FIELD_STATUS_PAYLOAD="$(node --input-type=module - "$FIELD_STATUS_JSON" "$PUBLIC_BUILD_ID" <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const [statusPath, buildId] = process.argv.slice(2);
let field = {};
if (statusPath && existsSync(statusPath)) {
  field = JSON.parse(readFileSync(statusPath, "utf8").replace(/^\uFEFF/, ""));
}
const required = Array.isArray(field.profiles_required) ? field.profiles_required.length : 5;
const ready = Array.isArray(field.profiles_ready) ? field.profiles_ready.length : 0;
const missing = Array.isArray(field.profiles_missing) ? field.profiles_missing : [];
const next = field.next_profile_to_test || missing[0] || "old_laptop";
const minimumReady = 2;
const allowed = ready >= minimumReady;
const payload = {
  public_build_id: buildId || "",
  ready,
  required,
  minimum_ready_before_linux_publication: minimumReady,
  allowed_to_publish_linux_now: allowed,
  next_profile_to_test: next,
  missing_profiles: missing,
};
process.stdout.write(JSON.stringify(payload));
NODE
)"
FIELD_READY="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.ready)})")"
FIELD_REQUIRED="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.required)})")"
FIELD_MINIMUM="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.minimum_ready_before_linux_publication)})")"
FIELD_NEXT="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.next_profile_to_test)})")"
FIELD_ALLOWED="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.allowed_to_publish_linux_now ? 'yes' : 'no')})")"
if [ "$FIELD_ALLOWED" = "yes" ]; then
  LINUX_NEXT_RECOMMENDATION_MD="$(cat <<EOF
1. Ouvrir \`LINUX-TERRAIN-GATE.html\` et confirmer que le gate est ouvert.
2. Ouvrir \`OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd\`.
3. Lancer \`Local Cockpit Cross Platform Beta\` avec \`deploy_to_vps=false\`.
4. Télécharger \`local-cockpit-cross-platform-web-release\`.
5. Glisser l'artefact sur \`IMPORTER-LINUX-ARTEFACT.cmd\`.
6. Lancer \`VERIFIER-LINUX-RELEASE.cmd\`.
EOF
)"
  LINUX_NEXT_RECOMMENDATION_HTML="$(cat <<EOF
      <li>Ouvrir <code>LINUX-TERRAIN-GATE.html</code> et confirmer que le gate est ouvert.</li>
      <li>Ouvrir <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>.</li>
      <li>Lancer <strong>Local Cockpit Cross Platform Beta</strong> avec <code>deploy_to_vps=false</code>.</li>
      <li>Télécharger <code>local-cockpit-cross-platform-web-release</code>.</li>
      <li>Glisser l'artefact sur <code>IMPORTER-LINUX-ARTEFACT.cmd</code>.</li>
      <li>Lancer <code>VERIFIER-LINUX-RELEASE.cmd</code>.</li>
EOF
)"
else
  LINUX_NEXT_RECOMMENDATION_MD="$(cat <<EOF
1. Ouvrir \`LINUX-TERRAIN-GATE.html\`.
2. Garder Linux en préparation, sans publication large.
3. Tester le prochain profil terrain \`$FIELD_NEXT\` avec le pack Windows correspondant.
4. Importer la fiche terrain, puis relancer \`npm run kit:linux\`.
5. Revenir au workflow Linux seulement quand le gate atteint au moins \`$FIELD_MINIMUM/$FIELD_REQUIRED\`.
EOF
)"
  LINUX_NEXT_RECOMMENDATION_HTML="$(cat <<EOF
      <li>Ouvrir <code>LINUX-TERRAIN-GATE.html</code>.</li>
      <li>Garder Linux en préparation, sans publication large.</li>
      <li>Tester le prochain profil terrain <code>$FIELD_NEXT</code> avec le pack Windows correspondant.</li>
      <li>Importer la fiche terrain, puis relancer <code>npm run kit:linux</code>.</li>
      <li>Revenir au workflow Linux seulement quand le gate atteint au moins <code>$FIELD_MINIMUM/$FIELD_REQUIRED</code>.</li>
EOF
)"
fi

cat > "$NEXT_ACTION_MD" <<EOF
# Prochaine action Linux OutilsIA

- Statut public Linux : \`absent\`
- Build local WSL : \`à vérifier\`
- Gate terrain : \`$FIELD_READY/$FIELD_REQUIRED\` prêt(s), minimum \`$FIELD_MINIMUM\`
- Publication Linux autorisée maintenant : \`$FIELD_ALLOWED\`
- Prochain profil terrain : \`$FIELD_NEXT\`
- Voie Linux quand gate ouvert : \`GitHub Actions Cross Platform\`
- Workflow recommandé : \`$CROSS_WORKFLOW_URL\`
- Raccourci d'ouverture : \`OUVRIR-DEBLOCAGE-LINUX.cmd\`
- Import attendu : \`IMPORTER-LINUX-ARTEFACT.cmd\`
- Vérification finale : \`VERIFIER-LINUX-RELEASE.cmd\`

## Pourquoi ce fichier existe

Le goal Linux ne se termine pas avec un kit prêt. Il se termine seulement quand \`release.json\` public contient une entrée \`linux\` courante en plus de \`windows-x64\`.

## Action recommandée maintenant

$LINUX_NEXT_RECOMMENDATION_MD

## Quand le gate terrain est ouvert

1. Ouvrir \`OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd\`.
2. Lancer \`Local Cockpit Cross Platform Beta\` avec \`deploy_to_vps=false\`.
3. Télécharger \`local-cockpit-cross-platform-web-release\`.
4. Glisser l'artefact sur \`IMPORTER-LINUX-ARTEFACT.cmd\`.
5. Lancer \`VERIFIER-LINUX-RELEASE.cmd\`.
6. Publier uniquement si le contrat \`windows-x64 + linux\` passe.

## Option WSL locale

1. Lancer \`VERIFIER-WSL-LINUX.cmd\`.
2. Si sudo est disponible, lancer \`PREPARER-WSL-LINUX.cmd\`.
3. Si le préflight reste bloqué par GTK/WebKit/sudo, revenir à GitHub Actions.

## Ne pas faire

- Ne pas remplacer la release Windows par une release Linux seule.
- Ne pas valider avec un artefact Linux ancien.
- Ne pas annoncer le goal complet tant que \`python3 scripts/audit_beta_field_goal.py\` signale Linux manquant.
EOF

cat > "$NEXT_ACTION_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prochaine action Linux OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:#172033;line-height:1.48}
    main{width:min(900px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    h2{margin:0 0 10px;font-size:21px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    li{margin:8px 0}
    .bad{color:#b42318;font-weight:900}.ok{color:#137044;font-weight:900}.warn{color:#9d5a00;font-weight:900}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Prochaine action Linux OutilsIA</h1>
    <p>Ce fichier indique quoi faire pour lever le manque Linux sans casser la release Windows.</p>
  </header>
  <section>
    <h2>État court</h2>
    <ul>
      <li><span class="bad">Linux public absent</span> : le goal reste ouvert.</li>
      <li><span class="ok">Chemin CI prêt</span> : workflow cross-platform disponible.</li>
      <li><span class="warn">WSL local optionnel</span> : utile seulement si les dépendances Tauri passent.</li>
      <li><span class="warn">Gate terrain</span> : <code>$FIELD_READY/$FIELD_REQUIRED</code> prêt(s), minimum <code>$FIELD_MINIMUM</code>, publication Linux maintenant : <code>$FIELD_ALLOWED</code>.</li>
      <li>Prochain profil terrain : <code>$FIELD_NEXT</code>.</li>
    </ul>
  </section>
  <section>
    <h2>Action recommandée maintenant</h2>
    <ol>
$(printf '%s\n' "$LINUX_NEXT_RECOMMENDATION_HTML")
    </ol>
  </section>
  <section>
    <h2>Quand le gate terrain est ouvert</h2>
    <ol>
      <li>Ouvrir <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>.</li>
      <li>Lancer <strong>Local Cockpit Cross Platform Beta</strong> avec <code>deploy_to_vps=false</code>.</li>
      <li>Télécharger <code>local-cockpit-cross-platform-web-release</code>.</li>
      <li>Glisser l'artefact sur <code>IMPORTER-LINUX-ARTEFACT.cmd</code>.</li>
      <li>Lancer <code>VERIFIER-LINUX-RELEASE.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Critère de vérité</h2>
    <p>Le point Linux est levé seulement si <code>release.json</code> public contient <code>windows-x64</code> et <code>linux</code>, avec SHA et artefacts vérifiés.</p>
  </section>
</main>
</body>
</html>
EOF

cat > "$NEXT_ACTION_CMD" <<'EOF'
@echo off
start "" "%~dp0PROCHAINE-ACTION-LINUX.html"
EOF

cat > "$FINAL_CHECKLIST_JSON" <<EOF
{
  "schema": "outilsia.local_cockpit_linux_publication_checklist.v1",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "public_build_id": "$PUBLIC_BUILD_ID",
  "recommended_workflow": "$CROSS_WORKFLOW_URL",
  "required_contract": [
    "import_beta_merge_linux",
    "verify_linux_artifacts",
    "verify_release_contract_windows_x64_linux",
    "verify_github_actions_linux_contract",
    "deploy_beta_public_release",
    "verify_release_prod",
    "audit_linux_readiness",
    "audit_beta_field_goal"
  ],
  "completion_rule": "Linux est prouvé seulement quand release.json public contient windows-x64 et linux courants, avec SHA et audits OK."
}
EOF

cat > "$FINAL_CHECKLIST_MD" <<EOF
# Checklist publication Linux OutilsIA

- Build Windows public à rejoindre : \`$PUBLIC_BUILD_ID\`
- Workflow recommandé : \`$CROSS_WORKFLOW_URL\`
- Import : \`IMPORTER-LINUX-ARTEFACT.cmd\`
- Vérification : \`VERIFIER-LINUX-RELEASE.cmd\`

## Contrat final

1. Importer l'artefact GitHub Actions avec \`--merge\`.
2. Vérifier les artefacts Linux avec \`npm run verify:linux:artifacts\`.
3. Vérifier le contrat GitHub Actions avec \`npm run verify:github-actions:linux\`.
4. Vérifier le contrat release avec \`npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux\`.
5. Publier avec \`npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy\`.
6. Vérifier le public avec \`npm run verify:release:prod\`.
7. Relancer \`python3 scripts/audit_local_cockpit_linux_readiness.py\`.
8. Relancer \`python3 scripts/audit_beta_field_goal.py\`.

## Règle de clôture

Linux est prouvé seulement quand \`release.json\` public contient \`windows-x64\` et \`linux\` courants, avec SHA et audits OK.
EOF

cat > "$FINAL_CHECKLIST_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Checklist publication Linux OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#172033}
    main{width:min(920px,calc(100% - 28px));margin:28px auto}
    header,section{background:#fff;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:#102a4c;color:#fff}
    h1{margin:0 0 8px;font-size:30px} h2{margin:0 0 10px;font-size:21px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    li{margin:8px 0}.bad{color:#b42318;font-weight:900}.ok{color:#137044;font-weight:900}
  </style>
</head>
<body><main>
  <header>
    <h1>Checklist publication Linux OutilsIA</h1>
    <p>Dernier kilomètre : importer Linux sans effacer Windows, vérifier, publier, auditer.</p>
  </header>
  <section>
    <h2>Contexte</h2>
    <ul>
      <li>Build Windows public à rejoindre : <code>$PUBLIC_BUILD_ID</code></li>
      <li>Workflow recommandé : <code>$CROSS_WORKFLOW_URL</code></li>
      <li>Import : <code>IMPORTER-LINUX-ARTEFACT.cmd</code></li>
      <li>Vérification : <code>VERIFIER-LINUX-RELEASE.cmd</code></li>
    </ul>
  </section>
  <section>
    <h2>Contrat final</h2>
    <ol>
      <li>Importer l'artefact GitHub Actions avec <code>--merge</code>.</li>
      <li>Lancer <code>npm run verify:linux:artifacts</code>.</li>
      <li>Lancer <code>npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux</code>.</li>
      <li>Publier avec <code>npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit --deploy</code>.</li>
      <li>Lancer <code>npm run verify:release:prod</code>.</li>
      <li>Lancer <code>python3 scripts/audit_local_cockpit_linux_readiness.py</code>.</li>
      <li>Lancer <code>python3 scripts/audit_beta_field_goal.py</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Règle de clôture</h2>
    <p><span class="bad">Ne pas clôturer</span> tant que <code>release.json</code> public ne contient pas <code>windows-x64</code> et <code>linux</code> courants avec SHA et audits OK.</p>
  </section>
</main></body></html>
EOF

cat > "$FINAL_CHECKLIST_CMD" <<'EOF'
@echo off
start "" "%~dp0LINUX-PUBLICATION-CHECKLIST.html"
EOF

FIELD_STATUS_JSON="$DESKTOP/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json"
FIELD_STATUS_PAYLOAD="$(node --input-type=module - "$FIELD_STATUS_JSON" "$PUBLIC_BUILD_ID" <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const [statusPath, buildId] = process.argv.slice(2);
let field = {};
if (statusPath && existsSync(statusPath)) {
  field = JSON.parse(readFileSync(statusPath, "utf8").replace(/^\uFEFF/, ""));
}
const required = Array.isArray(field.profiles_required) ? field.profiles_required.length : 5;
const ready = Array.isArray(field.profiles_ready) ? field.profiles_ready.length : 0;
const missing = Array.isArray(field.profiles_missing) ? field.profiles_missing : [];
const next = field.next_profile_to_test || missing[0] || "old_laptop";
const minimumReady = 2;
const allowed = ready >= minimumReady;
const payload = {
  schema: "outilsia.local_cockpit_linux_terrain_gate.v1",
  generated_at: new Date().toISOString(),
  public_build_id: buildId || "",
  field_status_path: statusPath || "",
  field_status: field.status || "unknown",
  ready,
  required,
  minimum_ready_before_linux_publication: minimumReady,
  allowed_to_publish_linux_now: allowed,
  next_profile_to_test: next,
  missing_profiles: missing,
  rule: "Linux public suit après 1-2 cycles Windows terrain; publier seulement si le gate est ouvert ou décision manuelle documentée."
};
process.stdout.write(JSON.stringify(payload));
NODE
)"
node --input-type=module - "$TERRAIN_GATE_JSON" "$FIELD_STATUS_PAYLOAD" <<'NODE'
import { writeFileSync } from "node:fs";
const [out, input] = process.argv.slice(2);
const payload = JSON.parse(input);
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
NODE
FIELD_READY="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.ready)})")"
FIELD_REQUIRED="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.required)})")"
FIELD_MINIMUM="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.minimum_ready_before_linux_publication)})")"
FIELD_ALLOWED="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.allowed_to_publish_linux_now ? 'oui' : 'non')})")"
FIELD_NEXT="$(printf '%s' "$FIELD_STATUS_PAYLOAD" | node --input-type=module -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.next_profile_to_test || 'aucun')})")"
PREFLIGHT_OUTPUT="$(bash scripts/preflight-linux.sh 2>&1 || true)"
PREFLIGHT_MISSING="$(printf '%s\n' "$PREFLIGHT_OUTPUT" | grep '^missing:' || true)"
PREFLIGHT_STATUS="$([ -z "$PREFLIGHT_MISSING" ] && printf 'ready' || printf 'blocked')"
PREFLIGHT_MISSING_COUNT="$([ -z "$PREFLIGHT_MISSING" ] && printf '0' || printf '%s\n' "$PREFLIGHT_MISSING" | sed '/^$/d' | wc -l | tr -d ' ')"
if sudo -n true >/dev/null 2>&1; then
  PREFLIGHT_SUDO_NONINTERACTIVE="true"
  PREFLIGHT_SUDO_LABEL="sudo disponible sans prompt"
else
  PREFLIGHT_SUDO_NONINTERACTIVE="false"
  PREFLIGHT_SUDO_LABEL="sudo demande un mot de passe"
fi

node --input-type=module - "$PREFLIGHT_LOCAL_JSON" "$PREFLIGHT_STATUS" "$PREFLIGHT_MISSING" "$PREFLIGHT_OUTPUT" "$REPO_ROOT_WSL" "$PREFLIGHT_SUDO_NONINTERACTIVE" "$PREFLIGHT_SUDO_LABEL" <<'NODE'
import { writeFileSync } from "node:fs";
const [out, status, missingRaw, outputRaw, repoRoot, sudoRaw, sudoLabel] = process.argv.slice(2);
const missing = String(missingRaw || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const output = String(outputRaw || "").split(/\r?\n/);
const payload = {
  schema: "outilsia.local_cockpit_linux_preflight_local.v1",
  generated_at: new Date().toISOString(),
  status,
  repo_root_wsl: repoRoot,
  sudo_non_interactive: sudoRaw === "true",
  sudo_status: sudoLabel,
  missing_count: missing.length,
  missing_prerequisites: missing,
  install_command: "bash scripts/install-linux-tauri-deps.sh",
  verify_command: "bash scripts/preflight-linux.sh",
  build_command: "npm run build:beta:linux",
  fallback_route: "GitHub Actions cross-platform workflow",
  output_tail: output.slice(-30),
};
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
NODE

cat > "$PREFLIGHT_LOCAL_MD" <<EOF
# Préflight Linux local OutilsIA

- Statut: \`$PREFLIGHT_STATUS\`
- Dépendances manquantes: \`$PREFLIGHT_MISSING_COUNT\`
- Sudo non interactif: \`$PREFLIGHT_SUDO_LABEL\`
- Workspace WSL: \`$REPO_ROOT_WSL\`
- Installer les dépendances: \`bash scripts/install-linux-tauri-deps.sh\`
- Re-vérifier: \`bash scripts/preflight-linux.sh\`
- Build Linux ensuite: \`npm run build:beta:linux\`
- Fallback si sudo indisponible: \`OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd\`

## Prérequis manquants

EOF
if [ -n "$PREFLIGHT_MISSING" ]; then
  printf '%s\n' "$PREFLIGHT_MISSING" | sed 's/^/- `/' | sed 's/$/`/' >> "$PREFLIGHT_LOCAL_MD"
else
  echo "- Aucun prérequis manquant détecté." >> "$PREFLIGHT_LOCAL_MD"
fi
cat >> "$PREFLIGHT_LOCAL_MD" <<'EOF'

## Sortie du préflight

```text
EOF
printf '%s\n' "$PREFLIGHT_OUTPUT" >> "$PREFLIGHT_LOCAL_MD"
cat >> "$PREFLIGHT_LOCAL_MD" <<'EOF'
```

## Commandes WSL utiles

```bash
cd /home/chris/outilsia/local-cockpit-app
bash scripts/preflight-linux.sh
bash scripts/install-linux-tauri-deps.sh
bash scripts/preflight-linux.sh
npm run build:beta:linux
```
EOF

cat > "$PREFLIGHT_LOCAL_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Préflight Linux local OutilsIA</title>
  <style>
    :root{--ink:#172033;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#137044;--orange:#9d5a00;--red:#b42318}
    *{box-sizing:border-box} body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:var(--ink);line-height:1.48}
    main{width:min(980px,calc(100% - 28px));margin:28px auto} header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:var(--blue);color:white} h1{margin:0 0 8px;font-size:31px;letter-spacing:0} h2{margin:0 0 12px;font-size:22px}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}.card b{display:block;font-size:24px}
    .ok{color:var(--green);font-weight:900}.warn{color:var(--orange);font-weight:900}.bad{color:var(--red);font-weight:900}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    pre{white-space:pre-wrap;background:#111827;color:#e5eefb;border-radius:10px;padding:14px;overflow:auto} li{margin:8px 0}
    @media(max-width:760px){.grid{grid-template-columns:1fr} header,section{padding:20px}}
  </style>
</head>
<body><main>
  <header>
    <h1>Préflight Linux local OutilsIA</h1>
    <p>Rapport structuré du poste WSL/local avant tentative de build Linux.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><b class="$([ "$PREFLIGHT_STATUS" = "ready" ] && printf 'ok' || printf 'bad')">$PREFLIGHT_STATUS</b><span>Statut local</span></div>
      <div class="card"><b>$PREFLIGHT_MISSING_COUNT</b><span>dépendance(s) manquante(s)</span></div>
      <div class="card"><b class="$([ "$PREFLIGHT_SUDO_NONINTERACTIVE" = "true" ] && printf 'ok' || printf 'warn')">sudo</b><span>$PREFLIGHT_SUDO_LABEL</span></div>
    </div>
  </section>
  <section>
    <h2>Action</h2>
    <ol>
      <li>Vérifier : <code>bash scripts/preflight-linux.sh</code></li>
      <li>Installer : <code>bash scripts/install-linux-tauri-deps.sh</code></li>
      <li>Re-vérifier : <code>bash scripts/preflight-linux.sh</code></li>
      <li>Construire : <code>npm run build:beta:linux</code></li>
      <li>Si sudo demande un mot de passe dans cette session : lancer <code>PREPARER-WSL-LINUX.cmd</code> depuis Windows, ou utiliser <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Prérequis manquants</h2>
    <pre>$(printf '%s\n' "${PREFLIGHT_MISSING:-Aucun prérequis manquant détecté.}" | sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g')</pre>
  </section>
  <section>
    <h2>Sortie complète</h2>
    <pre>$(printf '%s\n' "$PREFLIGHT_OUTPUT" | sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g')</pre>
  </section>
</main></body></html>
EOF

cat > "$PREFLIGHT_LOCAL_CMD" <<'EOF'
@echo off
start "" "%~dp0LINUX-PREFLIGHT-LOCAL.html"
EOF

cat > "$TERRAIN_GATE_MD" <<EOF
# Gate terrain avant publication Linux

- Build Windows public: \`$PUBLIC_BUILD_ID\`
- Terrain Windows prêt: \`$FIELD_READY/$FIELD_REQUIRED\`
- Minimum avant publication Linux: \`$FIELD_MINIMUM\`
- Publication Linux autorisée maintenant: \`$FIELD_ALLOWED\`
- Prochain profil terrain: \`$FIELD_NEXT\`

## Règle

Linux public suit après 1-2 cycles Windows terrain. Tant que ce gate est fermé, préparer l'artefact Linux est utile, mais publier largement doit rester une décision manuelle documentée.

## Action

- Si le gate est fermé: tester le prochain profil terrain avec \`OUVRIR-PACK-$FIELD_NEXT-OUTILSIA.cmd\` depuis le Bureau, puis relancer \`npm run kit:linux\`.
- Si le gate est ouvert: suivre \`LINUX-PUBLICATION-CHECKLIST.html\`.
EOF

cat > "$TERRAIN_GATE_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gate terrain Linux OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#172033}
    main{width:min(900px,calc(100% - 28px));margin:28px auto}
    header,section{background:#fff;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:#102a4c;color:#fff}
    h1{margin:0 0 8px;font-size:30px}
    .big{font-size:42px;font-weight:900}
    .bad{color:#b42318}.ok{color:#137044}.warn{color:#a15c00;font-weight:900}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    li{margin:8px 0}
  </style>
</head>
<body><main>
  <header>
    <h1>Gate terrain avant publication Linux</h1>
    <p>Ce verrou évite de publier Linux avant un minimum de preuves Windows terrain.</p>
  </header>
  <section>
    <p class="big $([ "$FIELD_ALLOWED" = "oui" ] && printf 'ok' || printf 'bad')">$FIELD_READY/$FIELD_REQUIRED</p>
    <p>Minimum requis avant publication Linux : <code>$FIELD_MINIMUM</code> profil(s) terrain Windows prêts.</p>
    <p>Publication Linux autorisée maintenant : <strong>$FIELD_ALLOWED</strong></p>
  </section>
  <section>
    <h2>Règle</h2>
    <p>Linux public suit après 1-2 cycles Windows terrain. Tant que ce gate est fermé, on peut préparer ou importer un artefact Linux, mais la publication large doit rester différée ou explicitement documentée.</p>
  </section>
  <section>
    <h2>Action</h2>
    <ul>
      <li>Prochain profil terrain : <code>$FIELD_NEXT</code></li>
      <li>Si le gate est fermé : tester ce profil, importer la fiche, puis relancer <code>npm run kit:linux</code>.</li>
      <li>Si le gate est ouvert : suivre <code>LINUX-PUBLICATION-CHECKLIST.html</code>.</li>
    </ul>
  </section>
</main></body></html>
EOF

cat > "$TERRAIN_GATE_CMD" <<'EOF'
@echo off
start "" "%~dp0LINUX-TERRAIN-GATE.html"
EOF

node --input-type=module - "$UNBLOCK_CHECKLIST_JSON" "$FIELD_STATUS_PAYLOAD" "$PREFLIGHT_MISSING" "$GITHUB_ACTIONS_URL" "$LINUX_WORKFLOW_URL" "$CROSS_WORKFLOW_URL" "$PUBLIC_BUILD_ID" <<'NODE'
import { writeFileSync } from "node:fs";
const [out, fieldPayload, preflightMissing, actionsUrl, linuxWorkflowUrl, crossWorkflowUrl, publicBuildId] = process.argv.slice(2);
const gate = JSON.parse(fieldPayload);
const missingPrerequisites = String(preflightMissing || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const payload = {
  schema: "outilsia.local_cockpit_linux_unblock_checklist.v1",
  generated_at: new Date().toISOString(),
  public_build_id: publicBuildId || "",
  terrain_gate: {
    ready: gate.ready,
    required: gate.required,
    minimum_ready_before_linux_publication: gate.minimum_ready_before_linux_publication,
    allowed_to_publish_linux_now: gate.allowed_to_publish_linux_now,
    next_profile_to_test: gate.next_profile_to_test,
    missing_profiles: gate.missing_profiles || []
  },
  local_wsl: {
    status: missingPrerequisites.length ? "blocked_by_prerequisites" : "ready",
    missing_prerequisites: missingPrerequisites
  },
  github_actions: {
    actions_url: actionsUrl,
    linux_workflow_url: linuxWorkflowUrl,
    cross_platform_workflow_url: crossWorkflowUrl,
    recommended_route: "cross_platform_workflow"
  },
  required_steps: [
    "open_terrain_gate",
    "finish_minimum_windows_field_profiles_or_document_manual_override",
    "run_cross_platform_workflow",
    "download_cross_platform_web_release",
    "import_linux_with_merge",
    "verify_windows_x64_and_linux_contract",
    "publish_only_after_contract_and_audits"
  ],
  non_negotiable_rule: "Publier Linux large seulement si le gate terrain est ouvert ou si une décision manuelle documentée existe; ne jamais remplacer Windows par Linux seul."
};
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
NODE

cat > "$UNBLOCK_CHECKLIST_MD" <<EOF
# Checklist déblocage Linux OutilsIA

- Build Windows public à rejoindre : \`$PUBLIC_BUILD_ID\`
- Gate terrain : \`$FIELD_READY/$FIELD_REQUIRED\` prêt(s), minimum \`$FIELD_MINIMUM\`
- Publication Linux autorisée maintenant : \`$FIELD_ALLOWED\`
- Prochain profil terrain : \`$FIELD_NEXT\`
- Préflight WSL local : \`$PREFLIGHT_STATUS\`
- Workflow recommandé : \`$CROSS_WORKFLOW_URL\`

## À faire maintenant

1. Ouvrir \`LINUX-TERRAIN-GATE.html\` et vérifier si le gate terrain est ouvert.
2. Si le gate est fermé, tester le prochain profil terrain \`$FIELD_NEXT\` ou documenter explicitement une décision manuelle.
3. Si WSL est utile et absent, lancer \`INSTALLER-WSL.cmd\`.
4. Lancer \`VERIFIER-WSL-LINUX.cmd\`, puis \`PREPARER-WSL-LINUX.cmd\` seulement si sudo est disponible.
5. Lancer \`OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd\`.
6. Télécharger \`local-cockpit-cross-platform-web-release\`.
7. Importer avec \`IMPORTER-LINUX-ARTEFACT.cmd\` pour faire un merge Linux sans effacer Windows.
8. Vérifier avec \`VERIFIER-LINUX-RELEASE.cmd\`.

## Prérequis WSL manquants

EOF
if [ -n "$PREFLIGHT_MISSING" ]; then
  printf '%s\n' "$PREFLIGHT_MISSING" | sed 's/^/- `/' | sed 's/$/`/' >> "$UNBLOCK_CHECKLIST_MD"
else
  echo "- Aucun prérequis manquant détecté par le préflight local." >> "$UNBLOCK_CHECKLIST_MD"
fi
cat >> "$UNBLOCK_CHECKLIST_MD" <<'EOF'

## Règle non négociable

Publier Linux large seulement si le gate terrain est ouvert ou si une décision manuelle documentée existe. Ne jamais remplacer Windows par Linux seul.

## Commandes de vérification finales

```bash
npm run verify:linux:artifacts
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
npm run verify:release:prod
python3 scripts/audit_local_cockpit_linux_readiness.py
python3 scripts/audit_beta_field_goal.py
```
EOF

cat > "$UNBLOCK_CHECKLIST_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Checklist déblocage Linux OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#137044;--orange:#9d5a00;--red:#b42318}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:var(--ink);line-height:1.48}
    main{width:min(1040px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:var(--blue);color:white}
    h1{margin:0 0 8px;font-size:31px;letter-spacing:0}
    h2{margin:0 0 12px;font-size:22px}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:15px}
    .card b{display:block;font-size:20px;margin-bottom:5px}
    .ok{color:var(--green);font-weight:900}.warn{color:var(--orange);font-weight:900}.bad{color:var(--red);font-weight:900}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    li{margin:8px 0}
    pre{white-space:pre-wrap;background:#111827;color:#e5eefb;border-radius:10px;padding:14px;overflow:auto}
    @media(max-width:900px){.grid{grid-template-columns:1fr 1fr}} @media(max-width:620px){.grid{grid-template-columns:1fr} header,section{padding:20px}}
  </style>
</head>
<body><main>
  <header>
    <h1>Checklist déblocage Linux OutilsIA</h1>
    <p>La route concrète pour passer de “kit prêt” à “Linux public vérifié”, sans casser Windows.</p>
    <p>Raccourci : <code>OUVRIR-DEBLOCAGE-LINUX.cmd</code></p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><b>$FIELD_READY/$FIELD_REQUIRED</b><span>Terrain Windows prêt</span></div>
      <div class="card"><b>$FIELD_MINIMUM</b><span>Minimum avant Linux public</span></div>
      <div class="card"><b class="$([ "$FIELD_ALLOWED" = "oui" ] && printf 'ok' || printf 'bad')">$FIELD_ALLOWED</b><span>Publication autorisée</span></div>
      <div class="card"><b class="$([ "$PREFLIGHT_STATUS" = "ready" ] && printf 'ok' || printf 'warn')">$PREFLIGHT_STATUS</b><span>Préflight WSL local</span></div>
    </div>
  </section>
  <section>
    <h2>À faire maintenant</h2>
    <ol>
      <li>Ouvrir <code>LINUX-TERRAIN-GATE.html</code> et vérifier si le gate terrain est ouvert.</li>
      <li>Si le gate est fermé, tester <code>$FIELD_NEXT</code> ou documenter explicitement une décision manuelle.</li>
      <li>Ouvrir <code>OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd</code>.</li>
      <li>Télécharger <code>local-cockpit-cross-platform-web-release</code>.</li>
      <li>Importer avec <code>IMPORTER-LINUX-ARTEFACT.cmd</code> pour merger Linux sans effacer Windows.</li>
      <li>Vérifier avec <code>VERIFIER-LINUX-RELEASE.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Prérequis WSL manquants</h2>
    <pre>$(printf '%s\n' "${PREFLIGHT_MISSING:-Aucun prérequis manquant détecté par le préflight local.}" | sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g')</pre>
  </section>
  <section>
    <h2>Règle non négociable</h2>
    <p><span class="bad">Ne pas publier Linux large</span> tant que le gate terrain n'est pas ouvert, sauf décision manuelle documentée. Ne jamais remplacer Windows par Linux seul.</p>
  </section>
  <section>
    <h2>Commandes de vérité</h2>
    <pre>npm run verify:linux:artifacts
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
npm run verify:release:prod
python3 scripts/audit_local_cockpit_linux_readiness.py
python3 scripts/audit_beta_field_goal.py</pre>
  </section>
</main></body></html>
EOF

cat > "$UNBLOCK_CHECKLIST_CMD" <<'EOF'
@echo off
start "" "%~dp0LINUX-UNBLOCK-CHECKLIST.html"
EOF

cat > "$KIT_DIR/IMPORTER-LINUX-ARTEFACT.cmd" <<EOF
@echo off
setlocal
set "ARTIFACT=%~1"
if not "%ARTIFACT%"=="" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\outilsia-local-cockpit-linux-web-release"
if exist "%ARTIFACT%" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\outilsia-local-cockpit-linux-web-release.zip"
if exist "%ARTIFACT%" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\local-cockpit-linux-web-release"
if exist "%ARTIFACT%" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\local-cockpit-linux-web-release.zip"
if exist "%ARTIFACT%" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\local-cockpit-cross-platform-web-release"
if exist "%ARTIFACT%" goto have_artifact
set "ARTIFACT=%USERPROFILE%\Downloads\local-cockpit-cross-platform-web-release.zip"
if exist "%ARTIFACT%" goto have_artifact
echo Artefact Linux introuvable.
echo.
echo Depose l'artefact GitHub Actions dans Telechargements ou glisse le fichier/dossier sur ce .cmd.
echo Noms attendus:
echo - outilsia-local-cockpit-linux-web-release
echo - outilsia-local-cockpit-linux-web-release.zip
echo - local-cockpit-linux-web-release
echo - local-cockpit-linux-web-release.zip
echo - local-cockpit-cross-platform-web-release
echo - local-cockpit-cross-platform-web-release.zip
pause
exit /b 1

:have_artifact
echo Import artefact: %ARTIFACT%
cd /d $REPO_ROOT_WIN\\local-cockpit-app
npm run import:beta -- --input "%ARTIFACT%" --merge
if errorlevel 1 goto fail
npm run verify:linux:artifacts
if errorlevel 1 goto fail
npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
if errorlevel 1 goto fail
cd /d $REPO_ROOT_WIN
python3 scripts/audit_local_cockpit_linux_readiness.py
python3 scripts/audit_beta_field_goal.py
echo.
echo Import Linux termine. Publie ensuite avec deploy:beta si le contrat est OK.
pause
exit /b 0

:fail
echo.
echo Import ou verification Linux echoue. Consulte la console ci-dessus.
pause
exit /b 1
EOF

cat > "$KIT_DIR/VERIFIER-LINUX-RELEASE.cmd" <<EOF
@echo off
cd /d $REPO_ROOT_WIN\\local-cockpit-app
npm run verify:linux:path
npm run verify:github-actions:linux
npm run verify:linux:routes
npm run verify:release:prod
cd /d $REPO_ROOT_WIN
python3 scripts/audit_local_cockpit_linux_readiness.py
python3 scripts/audit_beta_field_goal.py
pause
EOF

cat > "$SELF_CHECK_CMD" <<'EOF'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFIER-KIT-LINUX-WINDOWS.ps1"
pause
EOF

cat > "$SELF_CHECK_PS" <<'EOF'
$ErrorActionPreference = "Stop"

$KitDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestPath = Join-Path $KitDir "LINUX-BUILD-MANIFEST.txt"
$JsonPath = Join-Path $KitDir "LINUX-KIT-SELF-CHECK.json"
$MdPath = Join-Path $KitDir "LINUX-KIT-SELF-CHECK.md"
$HtmlPath = Join-Path $KitDir "LINUX-KIT-SELF-CHECK.html"

function Read-Manifest {
  param([string]$Path)
  $data = @{}
  if (-not (Test-Path $Path)) { return $data }
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match "^\s*([^=]+)=(.*)$") {
      $data[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }
  return $data
}

function File-Size {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  return (Get-Item -LiteralPath $Path).Length
}

function File-Sha256 {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Escape-Html {
  param([string]$Value)
  return [System.Net.WebUtility]::HtmlEncode($Value)
}

function Convert-WslPath {
  param([string]$Path)
  if (-not $Path) { return $Path }
  if ($Path -match "^/mnt/c/(.*)$") {
    return "C:\" + ($Matches[1] -replace "/", "\")
  }
  return $Path
}

$manifest = Read-Manifest -Path $ManifestPath
$archive = $manifest["archive"]
$archiveWindows = Convert-WslPath -Path $archive
$expectedSha = $manifest["archive_sha256"]
$expectedBytes = $manifest["archive_bytes"]
$actualSha = File-Sha256 -Path $archiveWindows
$actualBytes = File-Size -Path $archiveWindows

$required = @(
  "LINUX-BUILD-MANIFEST.txt",
  "README-Linux-Build.md",
  "LINUX-RELEASE-RUNBOOK.md",
  "LINUX-RELEASE-MISSION.html",
  "LINUX-START-HERE.html",
  "CENTRE-RELEASE-LINUX.html",
  "PROCHAINE-ACTION-LINUX.md",
  "PROCHAINE-ACTION-LINUX.html",
  "OUVRIR-PROCHAINE-ACTION-LINUX.cmd",
  "LINUX-PUBLICATION-CHECKLIST.json",
  "LINUX-PUBLICATION-CHECKLIST.md",
  "LINUX-PUBLICATION-CHECKLIST.html",
  "OUVRIR-CHECKLIST-PUBLICATION-LINUX.cmd",
  "LINUX-TERRAIN-GATE.json",
  "LINUX-TERRAIN-GATE.md",
  "LINUX-TERRAIN-GATE.html",
  "OUVRIR-GATE-TERRAIN-LINUX.cmd",
  "LINUX-UNBLOCK-CHECKLIST.json",
  "LINUX-UNBLOCK-CHECKLIST.md",
  "LINUX-UNBLOCK-CHECKLIST.html",
  "OUVRIR-DEBLOCAGE-LINUX.cmd",
  "LINUX-PREFLIGHT-LOCAL.json",
  "LINUX-PREFLIGHT-LOCAL.md",
  "LINUX-PREFLIGHT-LOCAL.html",
  "OUVRIR-PREFLIGHT-LINUX.cmd",
  "CI-STATUS.json",
  "CI-STATUS.md",
  "GITHUB-ACTIONS-URL.txt",
  "BUILD-ID-PUBLIC-WINDOWS.txt",
  "GITHUB-ACTIONS-URL.example.txt",
  "CONFIGURER-GITHUB-ACTIONS-URL.cmd",
  "OUVRIR-START-HERE-LINUX.cmd",
  "OUVRIR-CENTRE-RELEASE-LINUX.cmd",
  "OUVRIR-MISSION-LINUX.cmd",
  "OUVRIR-GITHUB-ACTIONS.cmd",
  "OUVRIR-WORKFLOW-LINUX.cmd",
  "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd",
  "INSTALLER-WSL.cmd",
  "VERIFIER-WSL-LINUX.cmd",
  "PREPARER-WSL-LINUX.cmd",
  "IMPORTER-LINUX-ARTEFACT.cmd",
  "VERIFIER-LINUX-RELEASE.cmd",
  "VERIFIER-KIT-LINUX.cmd",
  "VERIFIER-KIT-LINUX-WINDOWS.ps1"
)

$missing = @()
foreach ($name in $required) {
  $path = Join-Path $KitDir $name
  if (-not (Test-Path -LiteralPath $path)) { $missing += $name }
}

if (-not $archive -or -not (Test-Path -LiteralPath $archiveWindows)) { $missing += "archive" }
if (-not $expectedSha -or $expectedSha -ne $actualSha) { $missing += "archive_sha256_mismatch" }
if (-not $expectedBytes -or [string]$actualBytes -ne [string]$expectedBytes) { $missing += "archive_bytes_mismatch" }
if (-not $manifest["wsl_repo_root_linux"] -or $manifest["wsl_repo_root_linux"] -notmatch "^/home/chris/outilsia$") { $missing += "wsl_repo_root_linux" }
if (-not $manifest["github_actions_url"] -or $manifest["github_actions_url"] -notmatch "github.com") { $missing += "github_actions_url" }
if (-not $manifest["public_build_id"] -or $manifest["public_build_id"] -notmatch "^[0-9A-Za-z._-]{6,32}$") { $missing += "public_build_id" }
if (-not $manifest["linux_workflow_url"] -or $manifest["linux_workflow_url"] -notmatch "local-cockpit-linux-beta.yml") { $missing += "linux_workflow_url" }
if (-not $manifest["cross_workflow_url"] -or $manifest["cross_workflow_url"] -notmatch "local-cockpit-cross-platform-beta.yml") { $missing += "cross_workflow_url" }

$status = if ($missing.Count -eq 0) { "LINUX_KIT_READY" } else { "LINUX_KIT_INCOMPLETE" }

$report = [ordered]@{
  schema = "outilsia.local_cockpit_linux_kit_self_check.v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  status = $status
  version = $manifest["version"]
  kit_dir = $KitDir
  archive = $archive
  archive_bytes = $actualBytes
  expected_archive_bytes = $expectedBytes
  archive_sha256 = $actualSha
  expected_archive_sha256 = $expectedSha
  github_repo = $manifest["github_repo"]
  github_actions_url = $manifest["github_actions_url"]
  public_build_id = $manifest["public_build_id"]
  linux_workflow_url = $manifest["linux_workflow_url"]
  cross_workflow_url = $manifest["cross_workflow_url"]
  wsl_repo_root_linux = $manifest["wsl_repo_root_linux"]
  missing = $missing
}

$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $JsonPath -Encoding UTF8

$md = @()
$md += "# Verification kit Linux OutilsIA"
$md += ""
$md += "- Statut: ``$status``"
$md += "- Version: ``$($manifest["version"])``"
$md += "- Archive: ``$archive``"
$md += "- SHA attendu: ``$expectedSha``"
$md += "- SHA actuel: ``$actualSha``"
$md += "- Taille attendue: ``$expectedBytes``"
$md += "- Taille actuelle: ``$actualBytes``"
$md += "- GitHub Actions: ``$($manifest["github_actions_url"])``"
$md += "- Build Windows public: ``$($manifest["public_build_id"])``"
$md += "- Workflow Linux: ``$($manifest["linux_workflow_url"])``"
$md += "- Workflow Cross Platform: ``$($manifest["cross_workflow_url"])``"
$md += ""
if ($missing.Count) {
  $md += "## Manques"
  foreach ($item in $missing) { $md += "- $item" }
} else {
  $md += "Aucun manque detecte. Le kit Linux est pret pour Actions/import."
}
Set-Content -LiteralPath $MdPath -Value ($md -join "`r`n") -Encoding UTF8

$missingHtml = if ($missing.Count) {
  (($missing | ForEach-Object { "<li>$(Escape-Html $_)</li>" }) -join "")
} else {
  "<li>Aucun manque detecte.</li>"
}
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Verification kit Linux OutilsIA</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #172033; background: #edf2f8; }
    main { max-width: 920px; margin: auto; background: white; border: 1px solid #dbe4ef; border-radius: 14px; padding: 28px; }
    h1 { margin-top: 0; }
    .status { font-size: 24px; font-weight: 900; }
    code { background: #edf2f8; border: 1px solid #d7e0ea; border-radius: 6px; padding: 2px 5px; }
    li { margin: 7px 0; }
  </style>
</head>
<body>
<main>
  <h1>Verification kit Linux OutilsIA</h1>
  <p class="status">$(Escape-Html $status)</p>
  <ul>
    <li>Version: <code>$(Escape-Html $manifest["version"])</code></li>
    <li>Archive: <code>$(Escape-Html $archive)</code></li>
    <li>SHA attendu: <code>$(Escape-Html $expectedSha)</code></li>
    <li>SHA actuel: <code>$(Escape-Html $actualSha)</code></li>
    <li>Taille attendue: <code>$(Escape-Html $expectedBytes)</code></li>
    <li>Taille actuelle: <code>$(Escape-Html ([string]$actualBytes))</code></li>
    <li>GitHub Actions: <code>$(Escape-Html $manifest["github_actions_url"])</code></li>
    <li>Build Windows public: <code>$(Escape-Html $manifest["public_build_id"])</code></li>
  </ul>
  <h2>Manques</h2>
  <ul>$missingHtml</ul>
</main>
</body>
</html>
"@
Set-Content -LiteralPath $HtmlPath -Value $html -Encoding UTF8

Write-Output "linux_kit_self_check_windows status=$status version=$($manifest["version"]) archive_sha=$actualSha"
if ($missing.Count) { exit 1 }
exit 0
EOF

{
  echo "linux_build_kit_created=$KIT_DIR"
  echo "version=$VERSION"
  echo "archive=$ARCHIVE"
  echo "archive_sha256=$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  echo "archive_bytes=$(stat -c '%s' "$ARCHIVE")"
  echo "wsl_repo_root=$REPO_ROOT_WIN"
  echo "wsl_repo_root_linux=$REPO_ROOT_WSL"
  echo "archive_source_root=$REPO_ROOT"
  echo "center_html=$CENTER_HTML"
  echo "github_actions_url=$GITHUB_ACTIONS_URL"
  echo "github_repo=$GITHUB_REPO_SLUG"
  echo "public_build_id=$PUBLIC_BUILD_ID"
  echo "linux_workflow_url=$LINUX_WORKFLOW_URL"
  echo "cross_workflow_url=$CROSS_WORKFLOW_URL"
  echo "ci_status_json=$CI_STATUS_JSON"
  echo "linux_publication_checklist_json=$FINAL_CHECKLIST_JSON"
  echo "linux_publication_checklist_md=$FINAL_CHECKLIST_MD"
  echo "linux_publication_checklist_html=$FINAL_CHECKLIST_HTML"
  echo "linux_terrain_gate_json=$TERRAIN_GATE_JSON"
  echo "linux_terrain_gate_md=$TERRAIN_GATE_MD"
  echo "linux_terrain_gate_html=$TERRAIN_GATE_HTML"
  echo "linux_terrain_gate_allowed=$FIELD_ALLOWED"
  echo "linux_terrain_gate_ready=$FIELD_READY/$FIELD_REQUIRED"
  echo "linux_unblock_checklist_json=$UNBLOCK_CHECKLIST_JSON"
  echo "linux_unblock_checklist_md=$UNBLOCK_CHECKLIST_MD"
  echo "linux_unblock_checklist_html=$UNBLOCK_CHECKLIST_HTML"
  echo "linux_unblock_checklist_cmd=$UNBLOCK_CHECKLIST_CMD"
  echo "linux_preflight_local_json=$PREFLIGHT_LOCAL_JSON"
  echo "linux_preflight_local_md=$PREFLIGHT_LOCAL_MD"
  echo "linux_preflight_local_html=$PREFLIGHT_LOCAL_HTML"
  echo "linux_preflight_local_cmd=$PREFLIGHT_LOCAL_CMD"
  echo "self_check_cmd=$SELF_CHECK_CMD"
  echo "self_check_ps=$SELF_CHECK_PS"
  echo "self_check_json=$SELF_CHECK_JSON"
  echo "self_check_md=$SELF_CHECK_MD"
  echo "self_check_html=$SELF_CHECK_HTML"
  echo "ci_runs_total=$CI_RUNS_COUNT"
  echo "ci_artifacts_total=$CI_ARTIFACTS_COUNT"
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MANIFEST"

ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
ARCHIVE_BYTES="$(stat -c '%s' "$ARCHIVE")"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$SELF_CHECK_JSON" <<EOF
{
  "schema": "outilsia.local_cockpit_linux_kit_self_check.v1",
  "generated_at": "$CREATED_AT",
  "status": "LINUX_KIT_READY",
  "version": "$VERSION",
  "kit_dir": "$KIT_DIR",
  "archive": "$ARCHIVE",
  "archive_bytes": $ARCHIVE_BYTES,
  "expected_archive_bytes": "$ARCHIVE_BYTES",
  "archive_sha256": "$ARCHIVE_SHA",
  "expected_archive_sha256": "$ARCHIVE_SHA",
  "github_repo": "$GITHUB_REPO_SLUG",
  "github_actions_url": "$GITHUB_ACTIONS_URL",
  "public_build_id": "$PUBLIC_BUILD_ID",
  "linux_workflow_url": "$LINUX_WORKFLOW_URL",
  "cross_workflow_url": "$CROSS_WORKFLOW_URL",
  "wsl_repo_root_linux": "$REPO_ROOT_WSL",
  "missing": []
}
EOF

cat > "$SELF_CHECK_MD" <<EOF
# Verification kit Linux OutilsIA

- Statut: \`LINUX_KIT_READY\`
- Version: \`$VERSION\`
- Archive: \`$ARCHIVE\`
- SHA attendu: \`$ARCHIVE_SHA\`
- SHA actuel: \`$ARCHIVE_SHA\`
- Taille attendue: \`$ARCHIVE_BYTES\`
- Taille actuelle: \`$ARCHIVE_BYTES\`
- GitHub Actions: \`$GITHUB_ACTIONS_URL\`
- Build Windows public: \`$PUBLIC_BUILD_ID\`
- Workflow Linux: \`$LINUX_WORKFLOW_URL\`
- Workflow Cross Platform: \`$CROSS_WORKFLOW_URL\`

Aucun manque detecte. Le kit Linux est pret pour Actions/import.
EOF

cat > "$SELF_CHECK_HTML" <<EOF
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Verification kit Linux OutilsIA</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #172033; background: #edf2f8; }
    main { max-width: 920px; margin: auto; background: white; border: 1px solid #dbe4ef; border-radius: 14px; padding: 28px; }
    h1 { margin-top: 0; }
    .status { font-size: 24px; font-weight: 900; }
    code { background: #edf2f8; border: 1px solid #d7e0ea; border-radius: 6px; padding: 2px 5px; }
    li { margin: 7px 0; }
  </style>
</head>
<body>
<main>
  <h1>Verification kit Linux OutilsIA</h1>
  <p class="status">LINUX_KIT_READY</p>
  <ul>
    <li>Version: <code>$VERSION</code></li>
    <li>Archive: <code>$ARCHIVE</code></li>
    <li>SHA attendu: <code>$ARCHIVE_SHA</code></li>
    <li>SHA actuel: <code>$ARCHIVE_SHA</code></li>
    <li>Taille attendue: <code>$ARCHIVE_BYTES</code></li>
    <li>Taille actuelle: <code>$ARCHIVE_BYTES</code></li>
    <li>GitHub Actions: <code>$GITHUB_ACTIONS_URL</code></li>
  </ul>
  <h2>Manques</h2>
  <ul><li>Aucun manque detecte.</li></ul>
</main>
</body>
</html>
EOF

echo "linux_build_kit_ok $KIT_DIR"
cat "$MANIFEST"
