# Champs de soumission OpenAI - OutilsIA Local Cockpit

Importer d'abord `../chatgpt-app-submission.json`. Le fichier est généré depuis
`listing.json`, `tool-annotations.json` et `test-cases.json` avec :

```bash
npm run generate:submission
```

## Info

- Plugin name : `OutilsIA Local Cockpit`
- Short description : `Choisir une IA locale`
- Developer identity : `OutilsIA.fr` (vérifiée)
- Plugin author : `OutilsIA.fr`
- Category : `Productivity`
- Website : `https://outilsia.fr/chatgpt-ia-locale`
- Support : `https://outilsia.fr/support-plugin-outilsia`
- Privacy policy : `https://outilsia.fr/confidentialite-plugin-outilsia`
- Terms : `https://outilsia.fr/conditions-plugin-outilsia`
- Directory icon : `assets/outilsia-local-cockpit-512.png`
- Composer icon : `assets/outilsia-local-cockpit-512.png`

La description longue et les capacités sont à copier depuis `listing.json`.

L'identité OpenAI de l'organisation est vérifiée. Ne pas sélectionner une autre
organisation ou une identité personnelle différente au moment du dépôt.

### Commerce

Laisser décoché `My plugin links or directs users out of ChatGPT to make
purchases`. La version soumise recommande éventuellement un upgrade, mais
n'affiche aucun lien d'achat, ne commande rien et ne vend aucun bien.

## MCP

- Submission type : `With MCP`
- MCP server URL : `https://outilsia.fr/mcp`
- Authentication : `None`
- Demo credentials : aucun
- Challenge Base URL : `https://outilsia.fr`
- Widget resource : `ui://outilsia/machine-cockpit-v3.html`
- Dedicated widget domain : `https://chatgpt-local-cockpit.outilsia.fr`

### CSP

- Connect domains : `https://outilsia.fr`
- Resource domains : aucun
- Frame domains : aucun
- Redirect domains : `https://outilsia.fr`

Après `Scan Tools`, trois outils doivent être visibles au modèle :

1. `check_pc_for_local_ai`
2. `analyze_shared_report`
3. `simulate_hardware_upgrade`

`render_machine_cockpit` doit avoir `ui.visibility=["app"]`. C'est un outil de
rendu interne, pas une seconde étape demandée au modèle.

Les annotations et leurs justifications sont dans `tool-annotations.json`.

## Starter prompts

1. `Quels modèles locaux tester avec mon Ryzen 7, 64 Go RAM et une RTX 4080 SUPER 16 Go ?`
2. `Que puis-je lancer avec un Core i7-4790K, 16 Go RAM et une GTX 1080 Ti 11 Go ?`
3. `Analyse mon rapport OutilsIA partagé et dis-moi quoi tester avant d'acheter.`

Téléverser la capture correspondante `starter-01`, `starter-02` ou
`starter-03` depuis `assets/`.

## Testing

Le fichier `chatgpt-app-submission.json` importe exactement cinq cas positifs
et trois cas négatifs. Aucun compte, credential, MFA ou réseau privé n'est
requis.

Le rapport public de recette est :

`https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m`

## Global

- Langue : français
- Pays initiaux : France, Belgique, Suisse, Canada

## Release notes

Copier `releaseNotes` depuis `listing.json`.

## Skills

Laisser vide. Cette première version est un plugin MCP avec widget, sans bundle
de skills.

## Demo recording

Suivre `DEMO-RECORDING.md`, héberger la vidéo à une URL accessible sans
connexion, puis reporter cette URL dans le champ demandé par le portail.

## Étape manuelle de vérification

Quand le portail affiche le challenge de domaine, copier son token exact dans :

```text
OUTILSIA_OPENAI_CHALLENGE_TOKEN=<token exact>
```

sur le service `outilsia-chatgpt-app`, puis redémarrer le service. L'URL
suivante doit retourner uniquement le token en `text/plain` :

`https://outilsia.fr/.well-known/openai-apps-challenge`

Avant le challenge, un statut `404` est volontaire.
