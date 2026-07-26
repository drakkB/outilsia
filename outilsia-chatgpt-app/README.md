# OutilsIA ChatGPT App

Application MCP en lecture seule pour utiliser le moteur de décision OutilsIA dans ChatGPT et Codex.

## Frontière produit

- ChatGPT reçoit un profil déclaré ou un rapport public OutilsIA, puis explique la compatibilité.
- Le serveur MCP appelle les API déterministes d'OutilsIA et rend une fiche visuelle.
- Local Cockpit reste seul à scanner le matériel, installer Ollama ou un modèle, lancer un benchmark et écrire sur la machine.
- Une demande d'action locale appelle une action explicative en lecture seule et reçoit un refus bref sans commande ni procédure manuelle.
- Aucun appel OpenAI payant n'est nécessaire dans ce serveur. Le modèle hôte choisit et appelle les outils MCP.

## Outils v0.3

| Outil | Rôle | Écritures |
|---|---|---|
| `check_pc_for_local_ai` | Estimer la compatibilité depuis un profil explicite | Aucune |
| `analyze_shared_report` | Lire un rapport public `/r/...` anonymisé | Aucune |
| `simulate_hardware_upgrade` | Comparer le profil avant/après RAM ou VRAM | Aucune |
| `explain_local_action_boundary` | Refuser proprement une action réservée au logiciel desktop | Aucune |
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

La soumission initiale a été envoyée à OpenAI le 26 juillet 2026 et reste en
cours d'examen. L'app demeure disponible en bêta développeur et n'est pas
présentée comme déjà approuvée ou publiée dans l'annuaire public.

## Statut de publication

Le fichier `submission/publication-status.json` est l'unique source de vérité
pour les mentions publiques de la revue OpenAI. Il distingue quatre états :

- `review` : soumission en cours d'examen ;
- `approved_unpublished` : fiche approuvée, mais pas encore publiée ;
- `published` : fiche publiée avec son URL officielle `chatgpt.com` ;
- `changes_requested` : corrections demandées avant une nouvelle soumission.

La page produit, le hub scanner, les conditions et `llms.txt` sont générés à
partir de cet état. La CI refuse toute dérive. Une modification manuelle des
phrases publiques ne suffit donc pas à annoncer une approbation.

Après avoir vérifié le portail OpenAI, utiliser une commande explicite. Exemples :

```bash
# Fiche approuvée, publication pas encore déclenchée
npm run set:publication-status -- \
  --state approved_unpublished \
  --checked-on 2026-07-28 \
  --approved-on 2026-07-28 \
  --status-label Approved \
  --confirm-openai-portal

# Fiche effectivement publiée dans le répertoire
npm run set:publication-status -- \
  --state published \
  --checked-on 2026-07-29 \
  --approved-on 2026-07-28 \
  --published-on 2026-07-29 \
  --directory-url https://chatgpt.com/plugins/URL-OFFICIELLE \
  --status-label Published \
  --confirm-openai-portal
```

Le second état est refusé sans date d'approbation, date de publication et URL
HTTPS officielle `chatgpt.com`. Après la synchronisation, déployer les pages,
puis lancer `npm run smoke:production`. L'approbation et la publication restent
deux actions distinctes.

## Déploiement

Le service systemd écoute seulement sur `127.0.0.1:8787`. Le bloc
`deploy/nginx-mcp-location.conf` doit être inclus dans chaque listener d'origine
`outilsia.fr` réellement utilisé par le CDN. La cible recommandée reste
Cloudflare en mode `Full (strict)` ; tant qu'une origine HTTP est utilisée, la
route exacte `/mcp` doit aussi y être déclarée pour éviter qu'elle ne tombe sur
le backend web général.

## Variables

Voir `.env.example`. Aucun secret n'est requis pour la v0.3 anonyme.

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
