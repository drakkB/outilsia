# Conformite MCP avec le SDK officiel

Mise a jour : 28 juillet 2026

OutilsIA teste ses deux serveurs loopback avec le client TypeScript officiel du
Model Context Protocol :

- `@modelcontextprotocol/sdk@1.30.0` ;
- transport `StreamableHTTPClientTransport` ;
- protocole negocie `2025-11-25` ;
- notification `notifications/initialized` emise par le SDK ;
- reponses JSON directes, sans flux SSE obligatoire.

Le SDK et Zod sont des dependances de developpement exactes. Ils ne sont ni
charges par l'application Tauri, ni inclus comme runtime du produit. Le
lockfile conserve une version corrigee de `@hono/node-server` et `npm audit`
ne signale aucune vulnerabilite connue au moment de ce gel.

Sources primaires :

- https://github.com/modelcontextprotocol/typescript-sdk
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://www.npmjs.com/package/@modelcontextprotocol/sdk

## Deux niveaux de preuve

### Probe deterministe

```text
npm run verify:mcp-sdk-conformance
```

Deux serveurs de fixture locaux valident le client officiel, les schemas
attendus et l'absence de fuite. Ce test ne pretend pas valider le serveur Rust.

### Serveurs Rust reels

```text
npm run verify:mcp-sdk-conformance:native
```

Deux tests Rust demarrent les vrais serveurs sur `127.0.0.1`, puis lancent le
client officiel dans un sous-processus :

1. le MCP read-only negocie le handshake, expose huit outils et quatre
   ressources, appelle les huit outils, lit les quatre ressources et refuse un
   outil d'installation ;
2. Local Action Lane expose cinq outils sans `approve` ni `execute`, prepare
   deux demandes equivalentes mais distinctes, refuse une tentative
   d'execution MCP, puis annule les deux demandes sans resultat.

Ces tests sont marques `ignored` dans la suite Rust par defaut, car ils exigent
`npm ci` et Node.js. Les workflows Windows et Linux les lancent explicitement
apres l'installation des dependances. Un `cargo test --lib` autonome reste donc
independant de Node.

## Confidentialite

Le client refuse toute URL autre que :

```text
http://127.0.0.1:<port>/mcp
```

Le jeton Bearer :

- provient uniquement de `OUTILSIA_LOCAL_MCP_TOKEN` ;
- n'est jamais accepte dans les arguments de commande ;
- est retire de l'environnement JavaScript apres lecture ;
- n'apparait ni dans la sortie JSON, ni dans une URL, ni dans un fichier ;
- est controle une seconde fois par le parent Rust.

Le rapport de test ne conserve que version SDK, protocole, mode, compteurs et
booleens de securite. Il exclut profil machine, modele, contenu de rapport,
identifiants de demande, empreintes de plan, port et jeton.

## Ce que cette preuve ne remplace pas

La conformite SDK prouve l'interoperabilite du protocole et les frontieres des
outils. Elle ne remplace pas :

- la recette Computer Use native ;
- un essai avec MCP Inspector visible ;
- les tests physiques multi-machines ;
- une validation UX par un utilisateur ;
- la signature des binaires Windows ;
- une disponibilite dans la release publique.
