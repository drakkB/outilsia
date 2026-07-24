# OutilsIA ChatGPT App - dossier de soumission

## Prêt dans le dépôt

- Serveur MCP public en lecture seule : `https://outilsia.fr/mcp`
- Quatre outils avec schémas de sortie et annotations explicites
- Widget versionné `machine-cockpit-v2.html`, sans iframe ni script tiers
- CSP limitée à `https://outilsia.fr`
- Cinq tests positifs et trois tests négatifs
- Trois prompts de démarrage
- Page produit, support, confidentialité et conditions dédiées
- Challenge de domaine implémenté, désactivé tant que le portail n'a pas fourni le token
- Logo 512 x 512 et trois captures 706 x 860

## Actions humaines obligatoires dans le portail

1. Vérifier l'identité individuelle ou professionnelle utilisée pour publier OutilsIA.
2. Vérifier que le rôle OpenAI Platform possède `Apps Management: Write`.
3. Créer une soumission `With MCP` sur le portail Plugins.
4. Reporter les champs de `listing.json`.
5. Lorsque le portail fournit le challenge, écrire uniquement ce token dans `/etc/outilsia-chatgpt-app.env` :

   ```text
   OUTILSIA_OPENAI_CHALLENGE_TOKEN=<token exact du portail>
   ```

6. Redémarrer `outilsia-chatgpt-app`, puis vérifier :

   ```text
   https://outilsia.fr/.well-known/openai-apps-challenge
   ```

7. Lancer `Scan Tools`, reporter les justifications de `tool-annotations.json` et corriger toute divergence.
8. Téléverser le logo et une capture par prompt de démarrage.
9. Enregistrer une courte démonstration montrant profil déclaré, rapport partagé, simulation et refus d'installation.
10. Soumettre pour revue. Ne pas annoncer une publication avant l'approbation puis la publication manuelle.

## Recette finale

```bash
cd outilsia-chatgpt-app
npm run verify
npm run smoke:production
```

Le challenge doit retourner `404` avant configuration. Pendant la vérification OpenAI, il doit retourner `200 text/plain` avec le token exact et rien d'autre.
