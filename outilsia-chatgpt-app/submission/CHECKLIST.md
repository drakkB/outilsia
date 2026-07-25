# OutilsIA ChatGPT App - dossier de soumission

## Prêt dans le dépôt

- Serveur MCP public en lecture seule : `https://outilsia.fr/mcp`
- Trois outils d'analyse qui rendent directement le widget, plus un outil de rendu interne réservé à l'app
- Widget versionné `machine-cockpit-v3.html`, sans iframe ni script tiers
- Origine UI dédiée : `https://chatgpt-local-cockpit.outilsia.fr`
- CSP limitée à `https://outilsia.fr`
- Cinq tests positifs et trois tests négatifs
- Trois prompts de démarrage
- Page produit, support, confidentialité et conditions dédiées
- Challenge de domaine implémenté, désactivé tant que le portail n'a pas fourni le token
- Logo 512 x 512 et trois captures 706 x 860
- Script de démonstration reviewer-ready dans `DEMO-RECORDING.md`

## État au 25 juillet 2026

- Technique locale : prête (`npm run verify`)
- Production : prête (`npm run smoke:production`)
- Connexion en mode développeur : testée
- Identité OpenAI : vérifiée pour l'organisation `OutilsIA.fr`
- Challenge de domaine : en attente du token fourni par le portail
- Vidéo : script prêt, enregistrement et URL encore à produire
- Soumission publique : non lancée

## Actions humaines restantes dans le portail

1. Vérifier que le rôle OpenAI Platform possède `Apps Management: Write`.
2. Créer une soumission `With MCP` sur le portail Plugins.
3. Reporter les champs de `listing.json`.
4. Lorsque le portail fournit le challenge, écrire uniquement ce token dans `/etc/outilsia-chatgpt-app.env` :

   ```text
   OUTILSIA_OPENAI_CHALLENGE_TOKEN=<token exact du portail>
   ```

5. Redémarrer `outilsia-chatgpt-app`, puis vérifier :

   ```text
   https://outilsia.fr/.well-known/openai-apps-challenge
   ```

6. Lancer `Scan Tools`, vérifier que les trois outils d'analyse sont visibles au modèle, que `render_machine_cockpit` est réservé à l'app, puis reporter les justifications de `tool-annotations.json`.
7. Téléverser le logo et une capture par prompt de démarrage.
8. Enregistrer la démonstration décrite dans `DEMO-RECORDING.md`, puis vérifier que son URL est lisible sans connexion.
9. Soumettre pour revue. Ne pas annoncer une publication avant l'approbation puis la publication manuelle.

## Recette finale

```bash
cd outilsia-chatgpt-app
npm run verify
npm run smoke:production
```

Le challenge doit retourner `404` avant configuration. Pendant la vérification OpenAI, il doit retourner `200 text/plain` avec le token exact et rien d'autre.
