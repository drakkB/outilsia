# OutilsIA Local MCP v0.1

Le serveur MCP local expose un instantané OutilsIA à un client installé sur la
même machine. Il complète le Capability Bridge HTTP sans modifier l'app
ChatGPT publique, qui reste distante et strictement read-only.

## Frontière

- liaison : `127.0.0.1` sur un port aléatoire ;
- transport : MCP Streamable HTTP ;
- endpoint : `http://127.0.0.1:<port>/mcp` ;
- protocole préféré : `2025-11-25` ;
- durée : 15 minutes par défaut, 30 minutes maximum ;
- authentification : jeton Bearer aléatoire de 256 bits ;
- persistance du jeton : aucune ;
- source : snapshot figé du dernier AI Capability Passport ;
- action locale : aucune.

Le serveur ne déclenche jamais de scan, benchmark, dialogue, installation,
suppression, accès fichier, configuration, backtest ou trading. Un changement
des preuves invalide le Passport et arrête la connexion.

## Outils

| Outil | Donnée retournée |
|---|---|
| `outilsia_get_cockpit_status` | Version, expiration, frontière et empreinte du snapshot |
| `outilsia_get_machine_profile` | CPU, RAM, GPU, VRAM, OS et provenance |
| `outilsia_get_hardware_doctor` | Diagnostic matériel et readiness runtime |
| `outilsia_list_installed_models` | Modèles et runtimes observés |
| `outilsia_get_model_recommendation` | Recommandation déjà calculée |
| `outilsia_get_benchmark_proofs` | Mesures exportables sans prompts ni réponses |
| `outilsia_get_capability_passport` | Passport complet et empreinte SHA-256 |
| `outilsia_get_strategy_arena_handoff` | Handoff borné pour Strategy Arena |

Chaque outil porte :

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Ressources

- `outilsia://passport/current`
- `outilsia://models/installed`
- `outilsia://recommendation/current`
- `outilsia://strategy-arena/handoff`

## Démarrage

1. Ouvrir l'application native.
2. Scanner la machine.
3. Dans **Atelier IA**, générer le Passport.
4. Ouvrir **Serveur MCP local**.
5. Confirmer **Démarrer MCP 15 min**.
6. Cliquer sur **Copier connexion MCP**.

La connexion copiée fournit l'URL, le protocole, les outils et l'en-tête
`Authorization`. Elle contient un secret temporaire et ne doit pas rejoindre
un fichier versionné, une capture publique ou un rapport.

## Codex

Codex accepte un serveur Streamable HTTP avec un jeton lu depuis une variable
d'environnement. Après avoir récupéré l'URL et le jeton dans OutilsIA :

```toml
[mcp_servers.outilsia_local]
url = "http://127.0.0.1:PORT/mcp"
bearer_token_env_var = "OUTILSIA_LOCAL_MCP_TOKEN"
enabled = true
required = false
default_tools_approval_mode = "writes"
```

Définir `OUTILSIA_LOCAL_MCP_TOKEN` dans le processus qui démarre Codex, puis
redémarrer le client. Comme le port et le jeton expirent, cette configuration
est volontairement temporaire.

## MCP Inspector

Choisir `Streamable HTTP`, coller l'URL `/mcp`, puis ajouter :

```text
Authorization: Bearer <jeton copié>
```

La recette minimale doit réussir `initialize`, `tools/list`,
`outilsia_get_machine_profile`, `resources/list` et
`resources/read` sur `outilsia://passport/current`.

## Recette native automatisée

Le build Windows peut être testé en boîte noire avec WebView2 ouvert en mode
CDP. La recette pilote les boutons réels, récupère la connexion via le
presse-papiers, appelle les huit outils et les quatre ressources depuis un
client HTTP séparé, vérifie les refus, arrête le serveur puis efface le jeton :

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"
Start-Process .\src-tauri\target\release\outilsia-local-cockpit.exe
python .\scripts\verify-local-mcp-native.py
```

Le rapport est écrit dans
`.artifacts/native-local-mcp/native-local-mcp-e2e.json`. Il ne contient ni
jeton, ni prompt, ni sortie brute de modèle.

## Recette clients réels

La recette suivante démarre le serveur depuis les boutons natifs, puis fait
réellement appeler trois outils de lecture par Codex CLI et Claude Code sous
Windows :

```powershell
python .\scripts\verify-local-mcp-clients.py --cdp-url http://127.0.0.1:9444
```

Codex et Claude utilisent leurs connexions existantes. Le jeton MCP est fourni
uniquement par variable d'environnement. Les configurations et transcriptions
restent dans un dossier temporaire supprimé à la fin. Le rapport expurgé
`.artifacts/native-local-mcp-clients/native-local-mcp-clients.json` conserve
seulement les outils appelés, les valeurs vérifiées et le résultat du nettoyage.

Cette recette doit confirmer :

- lecture du profil CPU/GPU/VRAM ;
- lecture du nombre de modèles installés ;
- lecture du nombre de preuves benchmark ;
- absence d'outil d'installation, de benchmark ou de dialogue ;
- arrêt du serveur, effacement du presse-papiers et suppression des fichiers
  temporaires.

## Évolutions exclues de v0.1

Une future action locale devra utiliser un autre contrat :

1. préparer un plan exact ;
2. afficher modèle, runtime, taille, durée et effets dans l'application ;
3. obtenir une confirmation humaine non contournable ;
4. exécuter un plan signé, temporaire et utilisable une seule fois ;
5. écrire un reçu minimal dans Evidence Ledger.

La v0.1 read-only ne sera pas élargie silencieusement à ces actions.

## Local Action Lane - contrat de conception

La voie d'action sera un service séparé du MCP read-only. Elle réutilisera les
commandes Rust existantes, mais n'exposera ni shell, ni chemin arbitraire, ni
commande Ollama libre. Un champ fourni par le modèle, y compris
`confirm: true`, ne constitue jamais un consentement humain.

### Cycle de vie

1. Le client IA appelle un outil de préparation borné.
2. OutilsIA valide les paramètres et produit un plan immuable sans l'exécuter.
3. La demande apparaît dans une file native avec le client, le modèle, le
   runtime, la taille, le délai, les effets et les risques.
4. L'utilisateur accepte ou refuse dans la fenêtre Local Cockpit.
5. Une acceptation crée une capacité liée au hash exact du plan, au client et à
   la session, valable deux minutes et utilisable une seule fois.
6. Le noyau Rust exécute uniquement l'opération allowlistée.
7. Evidence Ledger conserve le résultat minimal, les durées, les empreintes et
   la décision humaine, sans prompt ni sortie brute.

États autorisés :

```text
proposed -> awaiting_human -> approved -> executing -> completed
                         \-> rejected
approved                 \-> expired
proposed/awaiting_human   \-> cancelled
executing                 \-> failed
```

Un redémarrage de l'app, l'arrêt du serveur, une modification du plan ou un
nouveau scan invalident toutes les capacités encore ouvertes.

### Outils envisagés

Les outils de préparation ne réalisent aucune action :

| Outil | Plan préparé |
|---|---|
| `outilsia_prepare_model_install` | Référence Ollama exacte, runtime, taille haute, volume et délai |
| `outilsia_prepare_benchmark` | Modèle déjà installé, runtime, protocole, délai et charge probable |
| `outilsia_prepare_model_comparison` | Deux ou trois modèles installés, ordre, budget global et zéro téléchargement |
| `outilsia_prepare_report_export` | Format borné et destination choisie dans l'app |
| `outilsia_get_action_request` | État et résumé expurgé d'une demande |
| `outilsia_cancel_action_request` | Annulation d'une demande non exécutée |

`outilsia_get_model_recommendation` reste une lecture et n'a besoin d'aucune
confirmation. L'installation, la suppression, l'exécution d'un benchmark, la
modification d'un profil et l'écriture d'un export restent des actions.

La première version ne proposera pas :

- suppression de modèle ;
- installation de pilote ;
- téléchargement ou exécution de binaire arbitraire ;
- accès à un fichier fourni par le client ;
- contrôle distant ou écoute hors loopback ;
- action groupée qui masquerait plusieurs consentements ;
- élévation administrateur lancée par l'IA.

### Propriétés de sécurité à tester

- une instruction dans un prompt ne peut pas approuver sa propre demande ;
- un token rejoué, expiré ou lié à un plan modifié est refusé ;
- le runtime et la référence de modèle exécutés correspondent octet pour octet
  au plan affiché ;
- deux clients ne peuvent pas consommer la même capacité ;
- aucun appel MCP ne contourne le préflight stockage ou les limites de temps ;
- l'arrêt d'urgence révoque la session et annule les demandes non exécutées ;
- le reçu distingue demande, consentement, exécution et résultat ;
- les tests négatifs recherchent shell, chemins, URL, variables
  d'environnement, credentials et sorties brutes.

Cette voie ne sera exposée aux clients réels qu'après validation de la recette
physique et revue séparée de son modèle de menace.
