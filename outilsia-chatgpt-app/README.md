# OutilsIA ChatGPT App

Application MCP en lecture seule pour utiliser le moteur de décision OutilsIA dans ChatGPT et Codex.

## Frontière produit

- ChatGPT reçoit un profil déclaré ou un rapport public OutilsIA, puis explique la compatibilité.
- Le serveur MCP appelle les API déterministes d'OutilsIA et rend une fiche visuelle.
- Local Cockpit reste seul à scanner le matériel, installer Ollama ou un modèle, lancer un benchmark et écrire sur la machine.
- Aucun appel OpenAI payant n'est nécessaire dans ce serveur. Le modèle hôte choisit et appelle les outils MCP.

## Outils v1

| Outil | Rôle | Écritures |
|---|---|---|
| `check_pc_for_local_ai` | Estimer la compatibilité depuis un profil explicite | Aucune |
| `analyze_shared_report` | Lire un rapport public `/r/...` anonymisé | Aucune |
| `simulate_hardware_upgrade` | Comparer le profil avant/après RAM ou VRAM | Aucune |
| `render_machine_cockpit` | Afficher le résultat dans un widget | Aucune |

Une estimation déclarative ne doit jamais être présentée comme un scan. Les tokens/s ne sont affichés que lorsqu'un rapport partagé contient un benchmark réel.

## Développement

```bash
cd outilsia-chatgpt-app
npm install
npm run verify
npm start
```

Le serveur écoute par défaut sur `http://127.0.0.1:8787/mcp`.

Test avec MCP Inspector :

```bash
npx @modelcontextprotocol/inspector@latest
```

Choisir `Streamable HTTP`, puis `http://127.0.0.1:8787/mcp`.

## Connexion ChatGPT

ChatGPT exige une URL HTTPS publique terminée par `/mcp`. En mode développeur :

1. Ouvrir les réglages ChatGPT et activer le mode développeur.
2. Ajouter un plugin/serveur MCP.
3. Saisir l'URL publique, par exemple `https://outilsia.fr/mcp`.
4. Ouvrir une nouvelle conversation avec OutilsIA activé.
5. Tester un profil déclaré, un rapport partagé, puis une demande hors périmètre.

Le domaine de widget dédié est configuré seulement pour la soumission publique avec `OUTILSIA_WIDGET_DOMAIN`. Il doit être unique à cette app et contrôlé par OutilsIA.

## Déploiement

Le service systemd écoute seulement sur `127.0.0.1:8787`. Le bloc
`deploy/nginx-mcp-location.conf` doit être inclus dans chaque listener d'origine
`outilsia.fr` réellement utilisé par le CDN. La cible recommandée reste
Cloudflare en mode `Full (strict)` ; tant qu'une origine HTTP est utilisée, la
route exacte `/mcp` doit aussi y être déclarée pour éviter qu'elle ne tombe sur
le backend web général.

## Variables

Voir `.env.example`. Aucun secret n'est requis pour la v1 anonyme.

## Recette avant soumission

- Cinq demandes positives : PC gaming, vieux PC, CPU only, rapport réel, simulation utile.
- Trois demandes négatives : URL étrangère, demande d'installation locale, demande sans caractéristiques.
- Vérifier le CSP, les liens sortants, la confidentialité et le rendu mobile.
- Vérifier que le serveur est stable en HTTPS et que le widget n'utilise aucun sous-iframe.
- Soumettre ensuite le plugin qui contient cette app depuis le portail OpenAI.
