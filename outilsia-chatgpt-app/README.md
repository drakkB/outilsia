# OutilsIA ChatGPT App

Application MCP en lecture seule pour utiliser le moteur de décision OutilsIA dans ChatGPT et Codex.

## Frontière produit

- ChatGPT reçoit un profil déclaré ou un rapport public OutilsIA, puis explique la compatibilité.
- Le serveur MCP appelle les API déterministes d'OutilsIA et rend une fiche visuelle.
- Local Cockpit reste seul à scanner le matériel, installer Ollama ou un modèle, lancer un benchmark et écrire sur la machine.
- Aucun appel OpenAI payant n'est nécessaire dans ce serveur. Le modèle hôte choisit et appelle les outils MCP.

## Outils v0.2

| Outil | Rôle | Écritures |
|---|---|---|
| `check_pc_for_local_ai` | Estimer la compatibilité depuis un profil explicite | Aucune |
| `analyze_shared_report` | Lire un rapport public `/r/...` anonymisé | Aucune |
| `simulate_hardware_upgrade` | Comparer le profil avant/après RAM ou VRAM | Aucune |
| `render_machine_cockpit` | Rendu interne réservé à l'app | Aucune |

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

1. Ouvrir le menu `Plugins` en haut de ChatGPT Pro.
2. Activer le mode développeur, puis sélectionner `+`.
3. Sélectionner le bouton `+` et créer une app en mode développeur.
4. Saisir l'URL publique `https://outilsia.fr/mcp`.
5. Ouvrir une nouvelle conversation, activer OutilsIA depuis le menu `Plus`, puis tester un profil déclaré, un rapport partagé et une demande hors périmètre.

Le domaine de widget dédié est `https://chatgpt-local-cockpit.outilsia.fr`. La variable `OUTILSIA_WIDGET_DOMAIN` permet de le surcharger pour une recette isolée.

L'app est disponible en bêta développeur. Elle n'est pas présentée comme
déjà approuvé ou publié dans l'annuaire public.

## Déploiement

Le service systemd écoute seulement sur `127.0.0.1:8787`. Le bloc
`deploy/nginx-mcp-location.conf` doit être inclus dans chaque listener d'origine
`outilsia.fr` réellement utilisé par le CDN. La cible recommandée reste
Cloudflare en mode `Full (strict)` ; tant qu'une origine HTTP est utilisée, la
route exacte `/mcp` doit aussi y être déclarée pour éviter qu'elle ne tombe sur
le backend web général.

## Variables

Voir `.env.example`. Aucun secret n'est requis pour la v0.2 anonyme.

`OUTILSIA_OPENAI_CHALLENGE_TOKEN` reste vide en fonctionnement normal. Lorsque
le portail OpenAI fournit un challenge de domaine, placez le token exact dans
`/etc/outilsia-chatgpt-app.env`, redémarrez le service et vérifiez que
`/.well-known/openai-apps-challenge` renvoie uniquement ce token en texte brut.

## Recette avant soumission

- Cinq demandes positives et trois demandes négatives sont figées dans
  `submission/test-cases.json`.
- Vérifier le CSP, les liens sortants, la confidentialité et le rendu mobile.
- Vérifier que le serveur est stable en HTTPS et que le widget n'utilise aucun sous-iframe.
- Exécuter `npm run smoke:production` après chaque déploiement.
- Suivre `submission/CHECKLIST.md` avant toute soumission publique.
