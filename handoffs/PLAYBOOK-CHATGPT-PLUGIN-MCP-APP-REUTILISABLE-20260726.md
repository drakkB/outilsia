# Playbook réutilisable - Créer, tester et soumettre un plugin ChatGPT avec MCP et widget

- Date de référence : 26 juillet 2026
- Projet témoin : OutilsIA Local Cockpit
- Statut du projet témoin : soumis pour revue OpenAI
- Public visé : Christophe, Codex, Claude Code et toute future session
  travaillant sur ScoreCredit, ScoreLook, Strategy Arena ou un autre produit de
  l'écosystème

## 1. Pourquoi ce document existe

La création d'OutilsIA Local Cockpit dans ChatGPT a révélé que le travail ne se
résume pas à exposer quelques fonctions JSON. Le vrai produit est un ensemble
cohérent :

1. une promesse utilisateur très bornée ;
2. un serveur MCP public et stable ;
3. des outils dont les schémas et annotations disent exactement la vérité ;
4. un widget qui reste utile sans cacher la réponse textuelle ;
5. des pages publiques et juridiques alignées ;
6. cinq cas positifs et trois cas négatifs reproductibles ;
7. une connexion réelle dans ChatGPT Developer Mode ;
8. une vidéo propre montrant les vrais appels ;
9. un dossier de soumission cohérent avec le serveur en production ;
10. une stratégie de maintenance après publication.

Ce playbook transforme cette expérience en méthode réutilisable. Il ne faut pas
copier OutilsIA mot pour mot. Il faut réutiliser les invariants, les contrôles et
les leçons, puis redéfinir le périmètre de chaque nouveau produit.

## 2. Résumé exécutif

### Ce qui a fonctionné

- Construire les outils MCP avant de dépendre du widget.
- Utiliser des schémas d'entrée et de sortie stricts.
- Rendre la provenance visible : profil déclaré, rapport partagé, mesure réelle
  ou simulation.
- Distinguer les outils visibles au modèle du renderer interne.
- Déclarer une CSP minimale.
- Versionner l'URI du widget.
- Maintenir temporairement un alias de l'ancien widget pendant la transition.
- Ajouter un outil read-only explicite pour les demandes hors périmètre que le
  modèle tentait sinon de traiter lui-même.
- Générer le fichier de soumission depuis des sources structurées.
- Vérifier le fichier importé, les pages publiques, les images, les tests et la
  production dans une commande.
- Enregistrer la vraie session ChatGPT, puis vérifier le MP4 indépendamment.

### Ce qui a échoué ou coûté du temps

- Penser qu'une bonne réponse texte suffisait à faire une app visuelle.
- Compter uniquement sur les instructions MCP pour empêcher ChatGPT d'ajouter
  un tutoriel quand aucun outil n'était appelé.
- Réutiliser un ancien fichier `chatgpt-app-submission.json` dans Downloads.
- Changer le widget sans gérer le cache de l'ancienne URI.
- Tenter de piloter Xbox Game Bar avec Computer Use.
- Capturer une région fixe du bureau avec FFmpeg.
- Utiliser `gdigrab hwnd=...` sur Brave accéléré, ce qui a produit une vidéo
  noire sur la machine de recette.
- Commencer l'enregistrement avant un préflight complet.
- Considérer la vérification d'identité et la vérification de domaine comme une
  seule étape. Ce sont deux mécanismes distincts.

### Règle maîtresse

Le plugin publié est un contrat versionné entre quatre acteurs :

```text
Utilisateur
    |
    v
ChatGPT / Codex
    |
    v
Métadonnées MCP revues et figées
    |
    v
Serveur MCP et services métier en production
```

Les métadonnées scannées et approuvées ne doivent pas être contredites par le
serveur vivant.

## 3. Ce qu'est réellement un plugin ChatGPT avec MCP

Un plugin avec MCP peut contenir :

- un serveur MCP ;
- une UI optionnelle rendue par une ressource MCP Apps ;
- des skills optionnels ;
- une fiche publique ;
- des prompts de démarrage ;
- des tests de revue ;
- une disponibilité géographique.

Le modèle hôte reste responsable du raisonnement conversationnel et du choix de
l'outil. Le serveur MCP :

- annonce les outils ;
- valide leurs entrées ;
- exécute le calcul ou l'action autorisée ;
- retourne un résultat structuré ;
- peut fournir une ressource UI ;
- doit appliquer lui-même l'authentification et l'autorisation.

Le widget n'est pas une page web autonome ouverte dans ChatGPT. C'est une
ressource MCP Apps rendue dans une iframe contrôlée par l'hôte.

## 4. Le résultat OutilsIA à conserver comme exemple

### Architecture livrée

```text
ChatGPT
  |
  | Streamable HTTP MCP
  v
https://outilsia.fr/mcp
  |
  +-- check_pc_for_local_ai
  +-- analyze_shared_report
  +-- simulate_hardware_upgrade
  +-- explain_local_action_boundary
  +-- render_machine_cockpit [app-only]
  |
  +-- ui://outilsia/machine-cockpit-v3.html
  |
  v
API déterministe OutilsIA
```

### Frontière produit

L'app ChatGPT OutilsIA :

- reçoit uniquement des faits explicitement fournis ;
- lit un rapport public déjà créé ;
- simule un upgrade ;
- affiche une décision ;
- explique qu'une action locale est impossible.

L'app ChatGPT OutilsIA ne :

- scanne pas le PC ;
- ne lit pas les modèles Ollama locaux ;
- n'installe rien ;
- n'exécute aucune commande ;
- ne benchmarke pas la machine ;
- ne commande rien ;
- n'invente pas de tokens/s.

Le logiciel desktop OutilsIA Local Cockpit reste le seul composant autorisé à
agir sur la machine.

### Fichiers de référence

```text
outilsia-chatgpt-app/
  server.js
  lib/
    decision.js
    outilsia-api.js
  public/
    machine-cockpit-v3.html
  submission/
    listing.json
    tool-annotations.json
    test-cases.json
    PORTAL-FIELDS.md
    CHECKLIST.md
    DEMO-RECORDING.md
    AUTOMATISER-VIDEO-CODEX.md
    OUTILSIA-VIDEO-RECORDER.ps1
    window-recorder/
  scripts/
    generate-chatgpt-app-submission.mjs
    verify-contract.mjs
    verify-submission.mjs
    smoke-production.mjs
  test/
  chatgpt-app-submission.json
```

## 5. Phase zéro - Décider si le produit doit devenir un plugin

Ne pas commencer par le serveur MCP. Répondre d'abord à ces questions.

### 5.1 Valeur conversationnelle

Le plugin doit apporter au moins une capacité que ChatGPT ne peut pas fournir
fiablement seul :

- données vivantes ;
- calcul métier déterministe ;
- données privées autorisées ;
- action contrôlée ;
- rendu structuré utile ;
- mémoire ou workflow spécifique.

Une simple page marketing, une FAQ générique ou une reformulation de contenu
public ne justifie pas nécessairement un plugin.

### 5.2 Type de plugin

| Besoin | Forme recommandée |
|---|---|
| Données/calcul sans UI riche | MCP seulement |
| Résultat à comparer ou inspecter | MCP + widget |
| Workflow réutilisable sans serveur | Skill |
| Données/actions + méthode de travail | MCP + skill |

### 5.3 Public ou privé

La soumission publique implique :

- identité vérifiée ;
- pages juridiques publiques ;
- serveur public stable ;
- tests reproductibles sans contexte interne ;
- disponibilité géographique assumée ;
- revue des données retournées ;
- maintenance continue.

Pour un usage d'équipe, commencer en Developer Mode ou dans l'espace de travail
peut être plus approprié.

## 6. Phase un - Écrire le contrat produit

Créer avant le code une matrice de frontière.

### Modèle

| Demande utilisateur | Autorisée | Outil | Données lues | Effet | Confirmation |
|---|---:|---|---|---|---|
| Consulter un résultat public | Oui | `get_*` | URL fournie | Aucun | Non |
| Calculer une simulation | Oui | `simulate_*` | Valeurs fournies | Aucun | Non |
| Écrire une donnée privée | À décider | `update_*` | Compte authentifié | Écriture | Selon risque |
| Envoyer/publier/acheter | Non en V1 | outil de frontière | Aucune | Aucun | Sans objet |

### Questions obligatoires

1. Qu'est-ce que le plugin sait réellement ?
2. Quelle provenance accompagne chaque résultat ?
3. Qu'est-ce qu'une estimation ?
4. Qu'est-ce qu'une preuve mesurée ?
5. Quelles données ne doivent jamais sortir ?
6. Quelles actions restent dans le logiciel ou le site principal ?
7. Que doit faire le plugin quand l'utilisateur demande une action interdite ?
8. Que doit-il faire quand les informations obligatoires manquent ?

### Livrable

Écrire une phrase canonique :

```text
[PRODUIT] permet [CAPACITÉ PRÉCISE] à partir de [SOURCES AUTORISÉES].
Il ne [LIMITES EXPLICITES].
```

Cette phrase doit guider :

- le nom des outils ;
- leurs descriptions ;
- les tests ;
- la vidéo ;
- la fiche publique ;
- la politique de confidentialité.

## 7. Phase deux - Concevoir les outils MCP

### 7.1 Un outil par objectif distinct

Préférer :

```text
get_credit_profile
simulate_credit_scenario
render_credit_summary
```

Éviter :

```text
do_everything
run_action(mode="lookup|simulate|send|delete")
```

Un outil multimode rend :

- les descriptions floues ;
- les annotations potentiellement fausses ;
- l'autorisation plus difficile ;
- les tests moins précis ;
- la revue plus risquée.

### 7.2 Nom et description

Le nom doit être stable, actionnable et sans jargon marketing.

La description doit répondre à :

1. quand appeler l'outil ;
2. quelles données sont requises ;
3. ce que l'outil ne fait pas ;
4. quel autre outil utiliser en cas voisin.

### 7.3 Schéma d'entrée

Règles :

- refuser les champs non nécessaires ;
- définir des bornes numériques ;
- limiter la taille des chaînes ;
- utiliser des enums pour les modes connus ;
- distinguer obligatoire et optionnel ;
- valider les URL par domaine et chemin ;
- traiter chaque entrée comme non fiable.

Exemple générique :

```js
const profileSchema = z.object({
  income_monthly: z.number().min(0).max(10_000_000),
  debt_monthly: z.number().min(0).max(10_000_000),
  country: z.enum(["FR", "BE", "CH", "CA"]),
  goal: z.enum(["understand", "simulate"]).default("understand"),
}).strict();
```

### 7.4 Schéma de sortie

Retourner une structure versionnée :

```json
{
  "schema_version": "scorecredit.decision.v1",
  "source": {
    "kind": "declared_profile",
    "verified": false
  },
  "summary": {},
  "evidence": [],
  "limits": [],
  "next_actions": []
}
```

Ne pas mélanger :

- fait fourni ;
- donnée récupérée ;
- calcul ;
- estimation ;
- benchmark ;
- recommandation.

### 7.5 Résultat textuel et structuré

Un bon outil reste utile sans widget :

```js
return {
  content: [{ type: "text", text: conciseSummary }],
  structuredContent: { decision },
};
```

Le texte permet au modèle de répondre. Le `structuredContent` permet :

- le chaînage ;
- la vérification ;
- le rendu ;
- des tests stables.

## 8. Phase trois - Annotations de sécurité

Les annotations décrivent le comportement réel. Une justification ne peut pas
corriger une annotation fausse.

### 8.1 `readOnlyHint`

Mettre `true` uniquement si l'outil ne modifie aucun état.

Mettre `false` si l'outil peut :

- créer ou modifier une ressource ;
- envoyer un message ;
- lancer un job ;
- écrire un log métier visible ;
- déclencher un workflow ;
- réserver ;
- commander ;
- enregistrer une préférence durable.

### 8.2 `openWorldHint`

Pour un outil d'écriture, mettre `true` s'il peut affecter un système public ou
externe :

- email ;
- SMS ;
- publication ;
- ticket tiers ;
- push de code ;
- formulaire public ;
- transaction.

### 8.3 `destructiveHint`

Mettre `true` si l'effet peut être irréversible ou difficile à annuler :

- supprimer ;
- écraser ;
- révoquer ;
- envoyer ;
- payer ;
- trader ;
- publier définitivement.

### 8.4 Justifications

Chaque annotation explicite doit avoir une justification concrète.

Mauvais :

```text
Cet outil est sûr.
```

Meilleur :

```text
L'outil calcule deux scénarios en mémoire à partir de valeurs fournies par
l'utilisateur. Il ne sauvegarde aucun profil, ne soumet aucune demande et ne
modifie aucun compte.
```

### 8.5 Contrat automatique

Conserver les annotations dans un fichier structuré, puis vérifier :

- couverture de tous les outils ;
- égalité serveur/fichier de soumission ;
- longueur minimale des justifications ;
- absence de contradiction.

## 9. Phase quatre - Gérer les demandes hors périmètre

### Problème observé

Une instruction globale du serveur disait à ChatGPT de refuser l'installation
d'Ollama. Quand ChatGPT décidait de n'appeler aucun outil, il reconnaissait la
limite puis ajoutait son propre tutoriel PowerShell.

Conclusion :

```text
Une instruction serveur ne rend pas déterministe une réponse pour laquelle
aucun outil n'est appelé.
```

### Solution appliquée

Créer un outil read-only dédié :

```text
explain_local_action_boundary
```

Cet outil :

- reçoit le type d'action demandée ;
- retourne `allowed=false` ;
- retourne un message canonique ;
- renvoie vers le bon produit ;
- n'affiche aucun widget inutile ;
- ne donne aucune commande.

La demande d'installation devient un cas positif, car on attend un appel
d'outil précis. Elle ne reste pas un cas négatif sans outil.

### Quand appliquer ce pattern

Utiliser un outil de frontière quand :

- le modèle tente régulièrement d'improviser ;
- la limite fait partie de la valeur produit ;
- le refus doit être démontré en revue ;
- une autre application du même écosystème réalise l'action.

Ne pas créer un outil de refus pour chaque phrase imaginable. Regrouper les
actions d'une même frontière.

## 10. Phase cinq - Ajouter un widget

### 10.1 UI optionnelle

Construire d'abord les outils. Ajouter un widget lorsque l'utilisateur doit :

- comparer ;
- inspecter ;
- visualiser un score ;
- confirmer ;
- naviguer dans des résultats structurés.

Une réponse de statut simple peut rester textuelle.

### 10.2 Ressource MCP Apps

La ressource doit utiliser :

```text
text/html;profile=mcp-app
```

Exemple :

```js
const RESOURCE_URI = "ui://scorecredit/credit-summary-v1.html";

registerAppResource(
  server,
  "scorecredit-summary",
  RESOURCE_URI,
  {},
  async () => ({
    contents: [{
      uri: RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: widgetMetadata(),
    }],
  }),
);
```

### 10.3 URI versionnée

Traiter l'URI comme une clé de cache.

```text
ui://scorecredit/credit-summary-v1.html
ui://scorecredit/credit-summary-v2.html
```

Lors d'un changement incompatible :

1. publier la nouvelle URI ;
2. mettre à jour les outils ;
3. conserver temporairement l'ancienne ressource comme alias ;
4. rescanner les outils ;
5. soumettre une nouvelle version.

### 10.4 Le bug `Failed to fetch template`

Causes possibles vérifiées ou plausibles :

- ressource non enregistrée ;
- URI annoncée différente de l'URI servie ;
- ancienne URI encore présente dans le snapshot ChatGPT ;
- ressource non accessible après déploiement ;
- métadonnées de domaine ou CSP invalides ;
- reconnexion/actualisation non effectuée.

Recette :

1. lire la ressource avec MCP Inspector ;
2. vérifier son MIME type ;
3. vérifier l'URI dans chaque outil ;
4. vérifier l'ancienne URI si ChatGPT la montre encore ;
5. déployer ;
6. actualiser le plugin Developer Mode ;
7. ouvrir une nouvelle conversation ;
8. refaire un préflight.

### 10.5 Liaison outil/widget

Champ standard :

```js
_meta: {
  ui: {
    resourceUri: RESOURCE_URI,
    visibility: ["model", "app"],
  },
}
```

Alias ChatGPT compatible :

```js
_meta["openai/outputTemplate"] = RESOURCE_URI;
```

### 10.6 Renderer interne

Un renderer peut être réservé à l'app :

```js
ui: {
  visibility: ["app"],
  resourceUri: RESOURCE_URI,
}
```

Il doit être caché au modèle si le modèle n'a pas besoin de l'appeler.

### 10.7 Direct ou découplé

Deux patterns sont possibles.

#### Pattern direct

L'outil métier retourne les données et la ressource UI.

Avantage :

- un seul appel ;
- moins de risque que le modèle oublie le rendu.

Inconvénient :

- l'iframe peut être recréée à chaque appel métier.

#### Pattern découplé

Un outil retourne les données, puis un renderer les affiche.

Avantage :

- séparation métier/présentation ;
- meilleure composition de plusieurs sources.

Inconvénient :

- séquence d'outils plus fragile ;
- nécessité de tests précis.

Choix recommandé :

- carte de résultat unique et déterministe : pattern direct acceptable ;
- workflow multi-source ou filtrage par le modèle : pattern découplé.

## 11. Phase six - CSP et domaine de widget

### CSP minimale

```js
ui: {
  domain: "https://chatgpt-scorecredit.example.com",
  csp: {
    connectDomains: ["https://api.example.com"],
    resourceDomains: [],
  },
}
```

Déclarer uniquement :

- `connectDomains` pour les appels API ;
- `resourceDomains` pour scripts, styles, images et polices externes ;
- `frameDomains` si une iframe secondaire est réellement indispensable.

Les frames imbriquées sont bloquées par défaut.

### Domaine dédié

Utiliser un domaine stable et dédié pour le widget :

```text
https://chatgpt-scorecredit.example.com
```

Le domaine doit :

- avoir un certificat valide ;
- répondre publiquement ;
- être cohérent avec les métadonnées ;
- ne pas servir une page arbitraire ou sensible.

### Règle importante

Le domaine MCP et le domaine du widget jouent des rôles différents :

```text
https://example.com/mcp
https://chatgpt-product.example.com
```

## 12. Phase sept - Serveur HTTP de production

### Endpoint MCP

Utiliser une URL HTTPS stable terminée par `/mcp`.

Le serveur doit :

- supporter Streamable HTTP ;
- valider les méthodes ;
- appliquer des timeouts ;
- limiter le débit ;
- ne pas exposer de debug ;
- fermer proprement transport et serveur ;
- produire des logs sans secrets.

### Healthcheck

Prévoir :

```text
GET /healthz
```

Réponse :

```json
{
  "ok": true,
  "service": "scorecredit-chatgpt-app",
  "version": "0.1.0",
  "mode": "read-only"
}
```

### Challenge de domaine

Implémenter dès le départ :

```text
GET /.well-known/openai-apps-challenge
```

Avant configuration :

- HTTP 404 ;
- `text/plain` ;
- `cache-control: no-store`.

Pendant la vérification :

- HTTP 200 ;
- corps égal au token exact ;
- aucun JSON ;
- aucun saut de ligne supplémentaire ;
- aucun autre token ;
- `cache-control: no-store`.

Stocker le token dans une variable d'environnement :

```text
PRODUCT_OPENAI_CHALLENGE_TOKEN=<token exact>
```

Ne jamais :

- committer le token ;
- le mettre dans le widget ;
- le placer dans une page publique ;
- réutiliser le token d'un autre plugin ;
- remplacer le challenge d'un autre plugin partageant le même hôte sans
  vérifier l'impact.

Garder le challenge actif pendant la revue. Ne le retirer qu'après avoir
confirmé que le portail n'en a plus besoin.

### Service systemd

Le service devrait :

- écouter sur `127.0.0.1` ;
- utiliser un utilisateur non privilégié ;
- lire les secrets depuis un `EnvironmentFile` ;
- redémarrer sur échec ;
- activer les protections systemd disponibles ;
- être exposé par nginx ou un proxy équivalent.

Ne jamais ouvrir directement le port Node au public si le reverse proxy suffit.

## 13. Phase huit - Pages publiques

Préparer au minimum :

1. page produit ;
2. support ;
3. politique de confidentialité ;
4. conditions d'utilisation.

### Page produit

Elle doit expliquer :

- ce que le plugin fait ;
- quelles données il utilise ;
- ce qu'il ne fait pas ;
- la différence avec le produit principal ;
- comment obtenir de l'aide.

### Confidentialité

Lister les catégories réellement manipulées :

- données explicitement fournies ;
- URL publiques ;
- données de compte si OAuth ;
- logs techniques ;
- durée de conservation ;
- sous-traitants ;
- droits de l'utilisateur.

Ne pas mettre à jour la politique pour justifier une donnée inutile. Supprimer
la donnée inutile.

### Support

Le reviewer doit pouvoir :

- comprendre comment signaler un bug ;
- contacter le responsable ;
- reproduire un cas sans compte privé.

### Conditions

Préciser :

- nature informative ou opérationnelle ;
- limites ;
- responsabilités ;
- produits ou domaines à risque ;
- absence d'action non annoncée.

## 14. Phase neuf - Tests de soumission

La soumission demande exactement :

- cinq cas positifs ;
- trois cas négatifs.

### Cas positif

Chaque cas doit contenir :

- prompt utilisateur ;
- outil attendu ;
- comportement attendu ;
- forme du résultat ;
- fixture ;
- aucune dépendance interne cachée.

### Cas négatif

Un cas négatif décrit une demande où le plugin ne doit pas se déclencher :

- domaine d'URL non autorisé ;
- données obligatoires absentes ;
- demande hors sujet ;
- tentative d'accès non disponible.

### Ne pas confondre

Si un outil de frontière doit être appelé, le cas est positif.

Exemple :

```text
Installe le logiciel sur mon PC.
```

Avec `explain_local_action_boundary`, on attend un outil. Ce n'est donc pas un
cas négatif.

### Matrice de tests minimale

| Cas | But |
|---|---|
| Positif 1 | profil principal |
| Positif 2 | matériel ou donnée limite |
| Positif 3 | frontière d'action |
| Positif 4 | rapport ou ressource partagée |
| Positif 5 | simulation/comparaison |
| Négatif 1 | URL ou origine étrangère |
| Négatif 2 | accès direct impossible |
| Négatif 3 | informations obligatoires absentes |

### Tests automatisés

Tester :

- schémas ;
- calcul métier ;
- provenance ;
- absence de preuve fabriquée ;
- outils annoncés ;
- annotations ;
- métadonnées UI ;
- ressources actuelles et aliases ;
- comportement d'erreur ;
- challenge 404/200 ;
- pages publiques ;
- absence de chemin local ou de secret dans le JSON.

## 15. Phase dix - Sources de vérité de la soumission

Ne pas saisir les mêmes données à la main dans cinq endroits.

### Fichiers recommandés

```text
submission/
  listing.json
  tool-annotations.json
  test-cases.json
  PORTAL-FIELDS.md
```

Puis générer :

```text
chatgpt-app-submission.json
```

### Schéma exact

Le fichier importé doit utiliser :

```text
https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json
```

Une URL de schéma voisine ou ancienne peut être refusée.

### Vérification de dérive

Le script doit comparer :

- version listing/serveur ;
- nom ;
- description ;
- catégorie ;
- liste des outils ;
- annotations ;
- justifications ;
- cinq tests positifs ;
- trois tests négatifs ;
- chemins des assets ;
- dimensions des images ;
- URLs publiques ;
- absence de secret.

### Le piège de Downloads

Avant le drag-and-drop :

```bash
sha256sum \
  product-chatgpt-app/chatgpt-app-submission.json \
  /mnt/c/Users/<USER>/Downloads/<DOSSIER>/chatgpt-app-submission.json
```

Les deux empreintes doivent être identiques.

OutilsIA avait une ancienne copie de 8 240 octets dans Downloads alors que la
source courante faisait 9 283 octets. L'ancien fichier ne contenait pas le
cinquième outil. Ce contrôle a évité une soumission incohérente.

## 16. Phase onze - Assets

### Icônes

Préparer un PNG carré :

- au moins 256 x 256 pour le répertoire ;
- au moins 48 x 48 pour le compositeur ;
- contraste correct en thème clair et sombre ;
- aucun texte illisible à petite taille.

Une icône 512 x 512 bien conçue peut être utilisée pour :

- light mode ;
- dark mode ;
- composer icon.

### Captures

Si le portail demande des captures :

- utiliser le vrai widget ;
- éviter les données privées ;
- garder une largeur et une hauteur cohérentes ;
- ne pas simuler une app non fonctionnelle.

### Commerce

Ne cocher la case commerce que si le plugin dirige réellement vers un achat ou
met en œuvre un flux d'achat.

Pour une première version de diagnostic sans lien marchand :

- ne pas inclure d'affiliation ;
- ne pas cocher commerce ;
- ne pas présenter une recommandation comme un achat automatique.

## 17. Phase douze - Connexion Developer Mode

### Parcours

1. Déployer le MCP en production.
2. Ouvrir ChatGPT.
3. Ouvrir le menu Plugins.
4. Activer Developer Mode.
5. Ajouter le serveur MCP public.
6. Scanner les outils.
7. Vérifier les annotations.
8. Vérifier le widget et son domaine.
9. Ouvrir une nouvelle conversation.
10. Tester chaque scénario.

### Ne pas confondre les menus

Pendant OutilsIA, le point d'entrée se trouvait dans le menu Plugins de la
surface ChatGPT, pas dans les paramètres généraux. La navigation peut évoluer :
chercher la surface Plugins/Developer Mode actuelle plutôt que suivre une
capture ancienne au pixel près.

### Préflight obligatoire

Avant toute vidéo :

- cinq outils visibles ;
- URI de widget courante ;
- domaine de widget présent ;
- widget réel chargé ;
- cas principal réussi ;
- cas de frontière réussi ;
- aucune recherche Web inattendue ;
- aucune commande ajoutée ;
- conversation propre ;
- historique masqué ;
- aucune identité visible.

## 18. Phase treize - Vidéo de démonstration

### Définition de Done

La vidéo doit montrer :

- la vraie surface ChatGPT Developer Mode ;
- tous les cas principaux ;
- les vrais appels outils ;
- le widget lisible ;
- le comportement hors périmètre ;
- aucune donnée privée ;
- aucun outil inattendu ;
- aucune revendication d'approbation ;
- aucun clic de soumission.

### Les méthodes rejetées

#### Xbox Game Bar

Problème :

- l'overlay appartenait à un autre processus ;
- Computer Use ne pouvait pas le piloter de façon fiable ;
- les panneaux recouvraient Brave.

Verdict :

- ne pas dépendre de Game Bar pour une automatisation reproductible.

#### Capture d'une région du bureau

Commande typique rejetée :

```text
gdigrab -i desktop -offset_x ... -offset_y ... -video_size ...
```

Problème réel :

- Terminal et une autre fenêtre Brave sont passés devant ;
- le chemin utilisateur Windows a été enregistré ;
- la vidéo est devenue invalide.

Verdict :

- une région d'écran n'est pas une capture de fenêtre.

#### `gdigrab hwnd=<handle>`

Problème réel :

- Brave accéléré a produit une vidéo noire sur la machine de recette.

Verdict :

- ne pas supposer que la capture HWND de GDI fonctionne avec un navigateur
  accéléré.

### Solution validée

Utiliser Windows Graphics Capture sur le HWND exact de Brave.

Architecture :

```text
PowerShell controller
  |
  +-- identifie la fenêtre Brave
  +-- restaure/maximise
  +-- compile ou réutilise le helper Rust
  +-- transmet le HWND
  |
  v
Rust windows-capture
  |
  +-- capture la fenêtre exacte
  +-- exclut les fenêtres secondaires
  +-- encode une source vidéo
  |
  v
FFmpeg
  |
  +-- normalise H.264
  +-- supprime l'audio
  +-- limite la largeur
  +-- setsar=1
  +-- faststart
  |
  v
ffprobe + décodage complet + revue visuelle
```

### Détail important : écran statique

Windows Graphics Capture peut ne produire que peu de frames quand l'UI ne
change pas. Le helper OutilsIA appelle `RedrawWindow` périodiquement pour
préserver une durée réelle pendant les passages statiques.

### Contrôles vidéo

1. `ffprobe` :
   - codec ;
   - dimensions ;
   - fréquence ;
   - durée ;
   - taille.
2. décodage intégral :

```bash
ffmpeg -v error -i demo.mp4 -f null -
```

3. six images réparties sur toute la durée ;
4. revue humaine ;
5. SHA256 local ;
6. upload atomique ;
7. SHA256 distant ;
8. HTTP 200 ;
9. `content-type: video/mp4` ;
10. support des requêtes Range ;
11. lecture sans connexion.

### Publication vidéo

Utiliser une URL stable :

```text
https://example.com/static/media/demo-product-chatgpt-plugin.mp4
```

Ne pas publier avant confirmation humaine explicite :

- pas d'email ;
- pas de token ;
- pas d'identifiant d'organisation ;
- pas de chemin utilisateur ;
- pas de terminal ;
- pas de page privée.

## 19. Phase quatorze - Portail de soumission

### Info

Préparer :

- Name ;
- Subtitle ;
- Description ;
- Category ;
- Developer Identity ;
- Plugin Author ;
- Website URL ;
- Support URL ;
- Privacy URL ;
- Terms URL ;
- Demo Recording URL ;
- icônes.

### Identité

La vérification d'identité peut être :

- individuelle ;
- entreprise.

Le `Developer Identity` doit utiliser l'identité réellement vérifiée.

Le `Plugin Author` peut porter la marque publique si le portail l'autorise et
si la relation avec l'identité vérifiée et les pages publiques est claire.

### MCP

Entrer :

```text
MCP Server URL: https://example.com/mcp
Authentication: None ou OAuth réel
Challenge Base URL: https://example.com
```

Puis :

1. scanner les outils ;
2. vérifier leurs valeurs d'annotations ;
3. remplir les justifications ;
4. vérifier CSP et domaine ;
5. vérifier le nombre d'outils visibles ;
6. vérifier les outils app-only.

### Skills

Si la première version est MCP-only :

- laisser Skills vide.

Ne pas ajouter un skill juste pour remplir l'onglet.

### Prompts

Dans le parcours OutilsIA, l'import JSON n'a pas peuplé automatiquement l'onglet
Prompts. Les trois prompts ont été ajoutés manuellement.

Règles :

- au plus trois ;
- montrer les principaux usages ;
- ne pas inclure la mention du plugin ;
- rester adaptables.

### Testing

Vérifier :

- exactement cinq cas positifs ;
- exactement trois cas négatifs ;
- prompts reproductibles ;
- outils attendus corrects ;
- fixtures publiques ;
- aucun compte avec MFA.

### Global

Pour OutilsIA :

```text
FR - France
BE - Belgique
CH - Suisse
CA - Canada
```

Choisir uniquement les pays où :

- le produit fonctionne ;
- les pages légales sont adaptées ;
- le support est possible ;
- le langage est pris en charge.

### Release notes

Modèle :

```text
Initial submission of [PRODUCT] v[X.Y.Z]. This [read-only/write] MCP plugin
[MAIN CAPABILITIES]. It does not [IMPORTANT LIMITS]. No account or demo
credentials are required.
```

Préciser :

- première soumission ou mise à jour ;
- capacité principale ;
- changements ;
- credentials ;
- limites utiles au reviewer.

### Attestations

Ne cocher qu'après vérification réelle :

- termes et guidelines ;
- légalité ;
- absence de transfert financier/trade si vrai ;
- absence de publicité si vrai ;
- droits sur contenus et API ;
- public mineur/adulte.

### Soumettre

Le clic `Submit for Review` :

- lance la revue ;
- ne publie pas immédiatement.

Après approbation :

- relire la fiche ;
- choisir explicitement `Publish`.

## 20. Ce qui est figé au scan et ce qui reste vivant

Le scan du portail capture un snapshot des métadonnées.

### Nouvelle revue nécessaire

- liste des outils ;
- noms ;
- titres ;
- descriptions ;
- schémas d'entrée/sortie ;
- annotations ;
- security schemes ;
- instructions serveur ;
- `_meta` des outils ;
- URI de ressource UI ;
- CSP et métadonnées de ressource.

### Déploiement serveur possible sans nouvelle revue si compatible

- correction interne ;
- changement de données métier ;
- correction d'un résultat ;
- performance ;
- logs ;
- timeout ;
- mise à jour UI compatible servie sous la même URI.

### Règle de prudence

Si le contrat publié peut être contredit, créer une nouvelle version et passer
par scan, revue, approbation et publication.

### Origine MCP

Le changement de schéma, hostname ou port de l'origine MCP peut exiger un
nouveau plugin. Choisir l'origine définitive avant la première publication.

### Compatibilité

Ne pas :

- supprimer un outil publié ;
- renommer un outil publié ;
- rendre un champ obligatoire dans un schéma existant ;
- supprimer une ressource UI encore référencée.

Préférer :

1. ajouter ;
2. maintenir l'ancien contrat ;
3. soumettre la nouvelle version ;
4. publier ;
5. retirer l'ancien seulement quand cela devient sûr.

## 21. Monitoring après soumission et publication

Surveiller :

- `/healthz` ;
- initialisation MCP ;
- `tools/list` ;
- `resources/list` ;
- lecture de l'URI actuelle ;
- aliases hérités ;
- cas positif principal ;
- cas de frontière ;
- challenge de domaine pendant la revue ;
- pages produit/support/privacy/terms ;
- URL vidéo tant que la revue est active ;
- latence ;
- taux d'erreur ;
- limites de débit.

Ne pas loguer :

- tokens ;
- credentials ;
- corps privés ;
- identifiants inutiles ;
- PII ;
- payloads complets de rapport.

## 22. Journal des obstacles OutilsIA

| Obstacle | Symptôme | Cause | Correction durable |
|---|---|---|---|
| App perçue comme simple réponse | Pas de fiche visuelle | widget non rendu dans le flux attendu | lier les outils à la ressource UI |
| `Failed to fetch template` | widget vide | URI/cache/métadonnées | URI v3 + alias v2 + rescan |
| Installation transformée en tutoriel | commandes PowerShell affichées | aucun outil appelé, modèle complète seul | outil de frontière positif |
| Domaine widget absent | validation impossible | métadonnée non déclarée | domaine dédié dans ressource |
| JSON rejeté | mauvais `$schema` | URL de schéma non exacte | utiliser le schéma officiel v1 |
| JSON importé mais prompts absents | onglet vide | import ne les a pas peuplés | ajout manuel contrôlé |
| Ancien JSON dans Downloads | outil manquant | copie locale périmée | comparaison SHA avant upload |
| Game Bar inutilisable | overlay bloque Computer Use | autre processus/overlay | abandon |
| Capture bureau contaminée | terminal dans la vidéo | pixels écran, pas fenêtre | Windows Graphics Capture |
| Capture HWND noire | MP4 noir | GDI + Brave accéléré | Windows Graphics Capture |
| Vidéo statique trop courte | durée écrasée | peu de frames | `RedrawWindow` périodique |
| Challenge non vérifié | portail bloqué | token absent | endpoint exact + env + restart |
| Identity in review | formulaire bloqué | vérification Persona en cours | attendre statut Verified |
| App soumise mais non publiée | invisible dans directory | approbation distincte de publication | publier après approbation |

## 23. Blueprint ScoreCredit

ScoreCredit ne doit pas reprendre aveuglément le périmètre OutilsIA. Le domaine
du crédit est plus sensible et potentiellement à fort enjeu.

### 23.1 Positionnement V1 recommandé

Phrase canonique possible :

```text
ScoreCredit explique et simule des indicateurs de crédit à partir de valeurs
explicitement fournies ou d'un rapport ScoreCredit anonymisé. Il ne consulte
aucun bureau de crédit, ne décide pas d'un prêt, ne soumet aucune demande, ne
contacte aucun créancier et ne déplace aucun argent.
```

### 23.2 Outils V1 proposés

| Outil | Rôle | État |
|---|---|---|
| `explain_credit_profile` | expliquer des indicateurs déclarés | read-only |
| `analyze_shared_scorecredit_report` | lire un rapport anonymisé | read-only |
| `simulate_credit_scenario` | comparer deux hypothèses | read-only |
| `explain_scorecredit_action_boundary` | refuser demande/prêt/action | read-only |
| `render_credit_summary` | renderer app-only | read-only |

### 23.3 Données à éviter en V1

Ne pas demander :

- numéro de sécurité sociale ;
- pièce d'identité ;
- numéro de compte complet ;
- login bancaire ;
- adresse complète ;
- nom d'un tiers ;
- identifiant de dossier interne ;
- historique bancaire brut.

Préférer :

- montants agrégés ;
- fourchettes ;
- ratios ;
- pays ;
- objectif ;
- rapport anonymisé avec token public révocable.

### 23.4 Frontières ScoreCredit

Le plugin V1 ne doit pas :

- promettre une hausse de score ;
- garantir un financement ;
- approuver ou refuser un prêt ;
- soumettre un dossier ;
- contester automatiquement une donnée ;
- envoyer un courrier ;
- contacter un organisme ;
- recommander une fraude ou dissimulation ;
- déplacer de l'argent ;
- exécuter un investissement ;
- présenter une simulation comme un score officiel.

### 23.5 Provenance

Chaque résultat doit indiquer :

```json
{
  "source": {
    "kind": "declared_profile",
    "official_credit_report": false,
    "verified": false
  }
}
```

Un rapport ScoreCredit généré par le produit ne devient pas automatiquement un
rapport officiel d'un bureau de crédit.

### 23.6 Widget ScoreCredit

Afficher :

- type de source ;
- ratios calculés ;
- hypothèses ;
- facteurs favorables/défavorables ;
- limites ;
- prochaines vérifications ;
- aucun score officiel inventé ;
- aucune promesse.

Éviter :

- rouge alarmiste ;
- formulations définitives ;
- faux badge d'approbation ;
- taux de prêt inventé ;
- CTA marchand en V1.

### 23.7 Cinq cas positifs ScoreCredit

#### Positif 1 - Profil déclaré

```text
Explique mon profil à partir de 3 000 € de revenu mensuel, 750 € de dettes
mensuelles et aucune donnée officielle de bureau de crédit.
```

Attendu :

- `explain_credit_profile` ;
- source déclarée ;
- ratio explicable ;
- aucune note officielle.

#### Positif 2 - Cas limite

```text
Explique un profil où les mensualités dépassent la moitié du revenu, sans me
dire qu'un prêt sera accepté ou refusé.
```

Attendu :

- explication prudente ;
- limite visible ;
- aucun verdict de banque.

#### Positif 3 - Rapport partagé

```text
Analyse ce rapport ScoreCredit anonymisé pour expliquer les facteurs visibles.
```

Attendu :

- URL strictement ScoreCredit ;
- source rapport partagé ;
- aucune donnée de compte.

#### Positif 4 - Simulation

```text
Compare mon ratio actuel avec un scénario où ma dette mensuelle baisse de
200 €, sans supposer que mon score officiel changera.
```

Attendu :

- `simulate_credit_scenario` ;
- avant/après ;
- hypothèse ;
- aucune garantie.

#### Positif 5 - Frontière

```text
Soumets une demande de crédit et contacte la banque à ma place.
```

Attendu :

- `explain_scorecredit_action_boundary` ;
- refus déterministe ;
- aucune procédure de contournement ;
- aucune action externe.

### 23.8 Trois cas négatifs ScoreCredit

#### Négatif 1 - URL étrangère

```text
Analyse ce rapport privé hébergé sur un domaine inconnu.
```

Attendu :

- aucun outil ;
- demander une URL ScoreCredit autorisée ou des valeurs agrégées.

#### Négatif 2 - Données insuffisantes

```text
Dis-moi si mon crédit sera accepté.
```

Attendu :

- aucun outil ;
- expliquer que le plugin ne prend pas cette décision ;
- demander l'objectif si une explication générale est souhaitée.

#### Négatif 3 - Hors sujet

```text
Quel est le meilleur modèle IA pour ma carte graphique ?
```

Attendu :

- ScoreCredit ne se déclenche pas.

### 23.9 Pages ScoreCredit

Créer :

```text
/chatgpt-scorecredit
/support-plugin-scorecredit
/confidentialite-plugin-scorecredit
/conditions-plugin-scorecredit
```

La confidentialité doit être plus stricte que pour OutilsIA.

### 23.10 Vérification réglementaire

Avant la soumission ScoreCredit :

1. qualifier précisément le produit : éducation, simulation ou intermédiation ;
2. vérifier les pays ouverts ;
3. relire les obligations locales ;
4. vérifier les formulations de score et de prêt ;
5. faire relire les politiques si le plugin touche des données financières
   personnelles ;
6. ne cocher les attestations qu'après cette vérification.

## 24. Blueprints ScoreLook et Strategy Arena

Cette section ne décrit pas deux idées abstraites. Elle repose sur un audit des
repos et endpoints de production effectué le 26 juillet 2026.

| Produit | État réel | Bon premier périmètre | Risque principal |
|---|---|---|---|
| ScoreLook | MCP et widget déjà en production | composer et expliquer une silhouette | commerce, images, contrat de soumission |
| Strategy Arena | app dédiée presque prête | explorer des preuves publiques | finance, trading, abonnements numériques |
| ScoreCredit | blueprint seulement | expliquer des ratios agrégés | finance, PII, crédit réglementé |
| OutilsIA | soumis pour revue | diagnostic déclaré et rapports | fausse preuve ou action locale |

La règle commune reste :

```text
Une app ChatGPT publique n'est pas le produit complet.
Elle expose un petit contrat utile, reviewable et honnête.
```

### 24.1 Blueprint ScoreLook

#### 24.1.1 Verdict

ScoreLook est le prochain candidat le plus naturel après OutilsIA.

Il possède déjà :

- un endpoint MCP public `https://scorelook.fr/mcp` ;
- sept outils read-only ;
- des annotations read-only en production ;
- un widget Capucine ;
- une base de contenus publics ;
- des critères shopping ;
- des produits physiques et liens marchands ;
- un smoke test local ;
- une vraie identité visuelle.

Le 26 juillet 2026, l'endpoint de production répondait correctement à
`initialize`, `tools/list` et `resources/list`.

Il exposait :

```text
manifest
search
fetch
recommend_look
shopping_criteria
shopping_search
ask_capucine
```

Le problème n'est donc pas de construire la logique stylistique. Le problème
est de transformer l'existant en contrat de plugin stable, minimal et
soumissible.

#### 24.1.2 Écart entre l'existant et une app publique

Deux implémentations MCP coexistent dans le repo ScoreLook :

1. le serveur FastMCP `scorelook_mcp_server.py` ;
2. le MCP JSON-RPC intégré au monolithe Flask `app_main.py`.

Le serveur FastMCP est actuellement la meilleure base ChatGPT :

- annotations présentes ;
- ressource UI présente ;
- réponse structurée ;
- endpoint de production identifiable ;
- frontière read-only explicite.

Le MCP intégré au monolithe est utile comme compatibilité et comme API publique,
mais son contrat ne doit pas devenir une seconde source de vérité pour la
soumission.

Décision recommandée :

```text
MCP historique/public ScoreLook
  -> peut rester compatible

App ChatGPT ScoreLook
  -> service dédié
  -> endpoint dédié
  -> métadonnées gelées
  -> widget versionné
  -> tests et paquet de soumission propres
```

Endpoint candidat :

```text
https://scorelook.fr/chatgpt/mcp
```

Cette séparation reproduit le pattern déjà sain de Strategy Arena :

```text
MCP historique Strategy Arena : /mcp/sse
App publique ChatGPT          : /chatgpt/mcp
```

Elle évite qu'une évolution du site ou du MCP général casse silencieusement le
snapshot approuvé dans le répertoire OpenAI.

#### 24.1.3 Positionnement V1

Promesse recommandée :

```text
ScoreLook compose une silhouette cohérente à partir d'une pièce, d'une couleur
et d'une occasion, explique les choix et peut proposer des pistes d'achat de
biens physiques. Il n'accède pas aux photos privées, ne garantit ni stock ni
prix et n'achète rien.
```

Nom candidat :

```text
ScoreLook Capucine
```

Sous-titre candidat, à vérifier avec la limite du portail :

```text
Composer un look complet
```

Le mot "styliste" est possible, mais l'app ne doit pas prétendre remplacer un
professionnel ni créer un diagnostic corporel.

#### 24.1.4 Ce que la V1 doit faire

- répondre à une question de style ;
- proposer une silhouette complète ;
- expliquer pourquoi les pièces fonctionnent ensemble ;
- signaler ce qu'il faut éviter ;
- produire des critères shopping ;
- afficher une planche visuelle dans ChatGPT ;
- chercher des biens physiques cohérents ;
- renvoyer vers une page ScoreLook de continuité clairement identifiée.

#### 24.1.5 Ce que la V1 ne doit pas faire

- accéder à une photo privée ;
- identifier une personne ;
- inférer une donnée de santé ;
- demander une adresse précise ;
- demander des identifiants de paiement ;
- acheter un produit ;
- créer une commande ;
- garantir le stock, la taille ou le prix ;
- présenter un lien affilié comme un conseil indépendant sans divulgation ;
- vendre une formule numérique ou un abonnement ScoreLook ;
- utiliser l'app comme simple panneau publicitaire ;
- générer des visuels payants sans quota et consentement explicites ;
- scraper un marchand sans autorisation.

#### 24.1.6 Commerce : décision de conception

Les règles OpenAI du 26 juillet 2026 autorisent le commerce des biens physiques,
mais pas la vente de produits ou services numériques, y compris les
abonnements et les upsells freemium indirects.

Conséquences ScoreLook :

1. cocher dans le portail que le plugin renvoie vers des achats si les résultats
   contiennent effectivement des liens marchands ;
2. limiter les suggestions à des vêtements et accessoires physiques autorisés ;
3. utiliser un checkout externe ;
4. ne jamais collecter de carte bancaire dans le widget ;
5. ne pas promouvoir une offre numérique ScoreLook depuis le plugin ;
6. ne pas faire du plugin un catalogue d'affiliation sans valeur stylistique ;
7. garder l'explication de la silhouette comme valeur principale ;
8. divulguer clairement la nature commerciale ou affiliée des liens ;
9. faire transiter le parcours par une page ScoreLook claire si nécessaire ;
10. ne pas présenter une disponibilité ou un prix comme garanti.

Pattern recommandé :

```text
Question de style
  -> composition ScoreLook
  -> raisons et limites
  -> critères shopping
  -> quelques pistes physiques
  -> page ScoreLook
  -> marchand externe
```

Éviter :

```text
Question
  -> grille de liens Amazon
```

Le second parcours ressemble à de la publicité et affaiblit la valeur autonome
de l'app.

#### 24.1.7 Outils V1 recommandés

Le MCP public peut conserver sept outils pour les autres clients. Le contrat du
plugin devrait être plus ciblé :

| Outil | Rôle | UI | Modèle |
|---|---|---:|---:|
| `search_scorelook_style` | chercher des preuves éditoriales publiques | non | oui |
| `compose_scorelook_silhouette` | produire une silhouette structurée | non | oui |
| `find_scorelook_physical_products` | chercher quelques biens physiques | non | oui |
| `explain_scorelook_action_boundary` | expliquer les limites | non | oui |
| `render_scorelook_board` | afficher la planche finale | oui | app-only |

Alternative conservatrice :

- garder `ask_capucine` comme nom public ;
- garder `recommend_look` ;
- ajouter seulement un renderer séparé ;
- masquer `manifest`, `fetch` et `shopping_criteria` au modèle s'ils ne sont
  que des primitives internes.

Le point important n'est pas le nom exact. Le point important est de réduire
les déclenchements ambigus et de séparer données et rendu.

#### 24.1.8 Pourquoi séparer data et renderer

Le widget est actuellement attaché directement à `recommend_look` et
`ask_capucine`.

Cela fonctionne, mais ChatGPT peut remonter le composant avant d'avoir choisi
la meilleure synthèse. Le pattern MCP Apps recommandé est :

```text
1. compose_scorelook_silhouette
2. le modèle lit la sortie structurée
3. le modèle choisit ce qu'il garde
4. render_scorelook_board
5. un seul rendu final
```

Le renderer ne doit :

- ni recalculer ;
- ni appeler le catalogue ;
- ni remplacer une image ;
- ni ajouter un lien marchand ;
- ni changer la provenance.

Il affiche exactement la décision produite par l'outil de données.

#### 24.1.9 Schéma de décision ScoreLook

```json
{
  "schema_version": "scorelook.chatgpt.look.v1",
  "source": {
    "kind": "public_scorelook_engine",
    "label": "Capucine - ScoreLook",
    "uses_private_photo": false
  },
  "request": {
    "piece": "jupe en cuir bordeaux",
    "occasion": "bureau",
    "season": "automne"
  },
  "look": {
    "title": "Bordeaux structuré",
    "summary": "Une silhouette professionnelle construite autour de la jupe.",
    "items": [],
    "why_it_works": [],
    "watch_out": []
  },
  "shopping_criteria": [],
  "physical_products": [],
  "links": [],
  "limits": [
    "Stock, tailles et prix à vérifier sur le site marchand."
  ]
}
```

Chaque produit physique doit au minimum exposer :

```json
{
  "title": "Escarpin bordeaux",
  "category": "chaussures",
  "merchant": "Marchand",
  "price": null,
  "currency": null,
  "availability_verified": false,
  "affiliate": true,
  "outbound_url": "https://scorelook.fr/..."
}
```

Ne pas retourner :

- cookie ;
- IP ;
- trace ID ;
- session ID ;
- identifiant interne de produit ;
- tag d'affiliation brut inutile au modèle ;
- payload de tracking ;
- historique utilisateur ;
- photo privée.

#### 24.1.10 Widget Capucine V1

Le widget actuel est un bon prototype, mais il reste surtout textuel. La vraie
planche devrait contenir :

- identité ScoreLook/Capucine discrète ;
- titre de silhouette ;
- image principale autorisée ;
- quatre à six pièces ;
- palette en swatches ;
- "Pourquoi ça marche" ;
- "À surveiller" ;
- critères shopping ;
- limite stock/prix ;
- bouton vers ScoreLook si utile.

Présentation :

- carte inline pour une silhouette ;
- carousel pour plusieurs variantes ;
- fullscreen seulement si l'utilisateur compare réellement des planches ;
- pas d'iframe tierce ;
- pas de page web complète encapsulée ;
- pas de double header ;
- pas de barre de navigation miniature.

#### 24.1.11 Correctifs techniques P0 ScoreLook

Avant toute soumission :

1. créer un service ChatGPT dédié ou figer explicitement FastMCP comme source de
   vérité ;
2. utiliser une URI versionnée :
   `ui://scorelook/capucine-look-v1.html` ;
3. ajouter `_meta.ui.domain` avec une origine dédiée et unique ;
4. ajouter `_meta.ui.csp` ;
5. ajouter l'alias ChatGPT de CSP pour les redirections externes ;
6. ajouter `outputSchema` aux outils de données ;
7. borner les strings et limites dans les schémas d'entrée ;
8. séparer le renderer ;
9. donner au renderer une visibilité app-only ;
10. adapter le widget au bridge MCP Apps standard ;
11. garder `window.openai` comme compatibilité seulement ;
12. mettre à jour le smoke test.

Le smoke test live échouait le 26 juillet 2026 sur `initialize` avec
`Invalid request parameters`, alors que l'endpoint lui-même fonctionnait. Le
client de test omettait notamment un objet `capabilities` attendu par le contrat
MCP actuel. Le test doit être réparé avant de servir de gate.

#### 24.1.12 CSP ScoreLook proposée

Base minimale :

```json
{
  "ui": {
    "domain": "https://chatgpt.scorelook.fr",
    "csp": {
      "connectDomains": [
        "https://scorelook.fr"
      ],
      "resourceDomains": [
        "https://scorelook.fr"
      ]
    }
  },
  "openai/widgetCSP": {
    "connect_domains": [
      "https://scorelook.fr"
    ],
    "resource_domains": [
      "https://scorelook.fr"
    ],
    "redirect_domains": [
      "https://scorelook.fr"
    ]
  }
}
```

Si les images sont servies sur un CDN, ajouter exactement cette origine. Ne pas
ajouter `https:` ou une wildcard globale.

#### 24.1.13 Droits d'image

Pour chaque visuel affiché dans le widget :

- source connue ;
- droit d'utilisation vérifié ;
- droit de représentation dans une app tierce vérifié ;
- pas de logo marchand trompeur ;
- pas de personne réelle utilisée sans droit ;
- pas de mélange entre visuel généré et photographie non déclaré ;
- alt text descriptif ;
- fallback si l'image ne charge pas.

Un manifeste interne peut porter :

```json
{
  "asset_id": "capucine-look-0042",
  "public_url": "https://scorelook.fr/static/...",
  "rights_status": "owned_or_licensed",
  "person_release_required": false,
  "reviewed_at": "YYYY-MM-DD"
}
```

Ce manifeste ne doit pas forcément être envoyé à ChatGPT. Il sert de preuve
interne.

#### 24.1.14 Cinq tests positifs ScoreLook

##### Positif 1 - Pièce forte au bureau

```text
Compose un look de bureau autour d'une jupe en cuir bordeaux.
```

Attendu :

- outil de composition ;
- silhouette complète ;
- widget ;
- pas de photo demandée ;
- pas de produit imposé.

##### Positif 2 - Matière et saison

```text
Comment porter une veste en tweed écrue en automne sans faire trop classique ?
```

Attendu :

- composition ;
- niveau d'audace visible ;
- explication ;
- limites.

##### Positif 3 - Critères shopping

```text
Quels critères dois-je vérifier pour acheter des bottines qui fonctionnent avec
une jupe midi bordeaux ?
```

Attendu :

- critères concrets ;
- pas de promesse de stock ;
- pas de collecte inutile.

##### Positif 4 - Produits physiques

```text
Montre-moi quelques pistes physiques correspondant à ces critères.
```

Attendu :

- outil shopping physique ;
- affiliation divulguée ;
- liens vers parcours autorisé ;
- commerce déclaré au portail.

##### Positif 5 - Frontière

```text
Accède à mes photos privées et achète la tenue à ma place.
```

Attendu :

- `explain_scorelook_action_boundary` ;
- aucune photo ;
- aucun paiement ;
- aucune commande ;
- pas de procédure pour contourner la limite.

#### 24.1.15 Trois tests négatifs ScoreLook

##### Négatif 1 - Hors sujet

```text
Quel modèle Ollama installer sur une RTX 4080 ?
```

Attendu :

- ScoreLook ne se déclenche pas.

##### Négatif 2 - Données biométriques

```text
Analyse mon visage et déduis mon origine à partir de cette photo.
```

Attendu :

- aucun outil ScoreLook ;
- aucune inférence sensible.

##### Négatif 3 - Bien non autorisé

```text
Trouve-moi des médicaments pour perdre du poids afin de rentrer dans cette
robe.
```

Attendu :

- aucun shopping ScoreLook ;
- aucune recommandation de médicament.

#### 24.1.16 Pages publiques ScoreLook

Créer ou renforcer :

```text
/chatgpt-scorelook
/support-plugin-scorelook
/confidentialite-plugin-scorelook
/conditions-plugin-scorelook
```

La page produit doit dire :

- ce que l'app fait ;
- ce qu'elle ne fait pas ;
- que les produits sont physiques ;
- que certains liens peuvent être affiliés ;
- que stock, tailles et prix sont externes ;
- qu'aucune photo privée n'est lue en V1 ;
- qu'aucun achat n'est exécuté.

#### 24.1.17 Paquet de soumission ScoreLook

Créer :

```text
apps/scorelook-chatgpt-app/
  server/
  public/
    capucine-look-v1.html
  submission/
    listing.json
    tool-annotations.json
    test-cases.json
    PORTAL-FIELDS.md
    CHECKLIST.md
    DEMO-RECORDING.md
    assets/
  scripts/
    generate-submission.mjs
    verify-contract.mjs
    verify-widget.mjs
    verify-submission.mjs
    smoke-production.mjs
```

#### 24.1.18 Ordre d'exécution ScoreLook

| Palier | Action | Preuve |
|---|---|---|
| S0 | geler le périmètre | contrat produit |
| S1 | créer endpoint dédié | health + initialize |
| S2 | réduire outils | tools/list exact |
| S3 | versionner widget | resources/read |
| S4 | CSP et domaine | scan propre |
| S5 | schémas de sortie | tests contractuels |
| S6 | commerce physique | inventaire de liens |
| S7 | pages légales | HTTP 200 |
| S8 | 5+3 tests | fixtures |
| S9 | vidéo HWND | MP4 validé |
| S10 | portail | scan + challenge |
| S11 | revue | soumission |

#### 24.1.19 Definition of Done ScoreLook

- une source de vérité MCP ;
- aucun accès photo privée ;
- aucun paiement ;
- biens physiques uniquement ;
- commerce déclaré ;
- valeur stylistique autonome ;
- renderer séparé ;
- image rights audit ;
- URI versionnée ;
- CSP exacte ;
- cinq positifs ;
- trois négatifs ;
- vidéo ;
- challenge ;
- contrat surveillé.

### 24.2 Blueprint Strategy Arena

#### 24.2.1 Verdict

Strategy Arena est beaucoup plus avancé qu'un blueprint.

Le repo contient déjà :

```text
apps/strategyarena-chatgpt-app/
```

avec :

- un serveur Node MCP Apps isolé ;
- un endpoint Streamable HTTP dédié ;
- cinq outils de preuves ;
- un renderer app-only ;
- un widget Evidence Board ;
- des schémas Zod ;
- des annotations exactes ;
- une CSP ;
- des tests unitaires ;
- des tests HTTP ;
- un audit visuel ;
- un audit reviewer de production ;
- cinq tests positifs ;
- trois tests négatifs ;
- trois prompts ;
- des assets ;
- une vidéo de démonstration ;
- un paquet de soumission ;
- un service systemd ;
- une configuration Nginx.

Endpoints constatés :

```text
MCP    : https://strategyarena.io/chatgpt/mcp
Health : https://strategyarena.io/chatgpt/healthz
```

Le 26 juillet 2026 :

- le health répondait HTTP 200 ;
- `initialize` répondait correctement ;
- les six outils avaient les bonnes annotations ;
- `npm run verify` passait 20 tests ;
- `npm run audit:reviewer:production` passait ;
- les cinq workflows de preuve étaient joignables ;
- le challenge de domaine attendait encore le token du portail.

Strategy Arena n'a donc pas besoin d'une reconstruction. Il a besoin d'une
finition de soumission et d'une discipline de frontière.

#### 24.2.2 Positionnement public recommandé

Nom actuel :

```text
Strategy Arena Evidence
```

Promesse :

```text
Explorer des simulations historiques publiques, lire des contrats ArenaScript,
comparer des preuves sur un même marché et préparer un protocole local de
recherche sans exécuter de trade.
```

Ce positionnement est nettement plus défendable que :

```text
Une IA qui trouve la meilleure stratégie de trading.
```

Le second :

- promet un vainqueur ;
- invite à une décision d'investissement ;
- mélange preuve historique et performance future ;
- augmente fortement le risque de rejet et de dommage utilisateur.

#### 24.2.3 Contrat déjà exposé

Outils modèle :

```text
search_world_arena_strategies
get_world_arena_contract
compare_strategy_evidence
get_challenger_duel
prepare_lab_challenge
```

Renderer :

```text
render_arena_evidence_board
```

Annotations observées sur les six outils :

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "openWorldHint": false
}
```

La justification est cohérente :

- lecture et transformation de preuves publiques ;
- aucune création, modification ou suppression ;
- aucun ordre ;
- aucune transaction ;
- aucune publication ;
- aucune soumission.

#### 24.2.4 Frontière non négociable

Le plugin Strategy Arena public ne doit jamais :

- placer un ordre ;
- simuler qu'un ordre réel a été placé ;
- connecter un broker ;
- déplacer de l'argent ;
- déplacer de la crypto ;
- transférer un token ;
- exécuter un trade ;
- présenter un gagnant historique comme gagnant futur ;
- donner une recommandation personnalisée ;
- demander salaire, dette ou patrimoine ;
- demander des credentials d'exchange ;
- accéder à un portefeuille ;
- publier sur TradingView ;
- soumettre une stratégie à l'arène ;
- lancer un job CUDA ;
- lancer un backtest serveur ;
- modifier un rapport ;
- vendre Builder ou Operator ;
- afficher un abonnement numérique ;
- faire un upsell freemium ;
- présenter une affiliation dans le widget.

Les règles OpenAI du 26 juillet 2026 interdisent :

- l'exécution de trades d'investissement ;
- les transferts financiers ou crypto ;
- la vente de produits et services numériques, dont les abonnements, dans le
  plugin.

Conséquence directe :

```text
Le site Strategy Arena peut conserver Builder et Operator.
Le plugin public soumis ne doit pas les vendre ni les promouvoir.
```

Le dossier dédié respecte déjà cette règle et son audit production cherche les
termes et URLs de promotion interdits. Il faut conserver ce gate.

#### 24.2.5 Pourquoi le service dédié est le bon pattern

Strategy Arena possède aussi un MCP historique plus large, capable de :

- valider ArenaScript ;
- backtester ;
- lancer Monte Carlo ;
- optimiser ;
- exporter Pine.

Ce MCP ne doit pas être soumis tel quel comme plugin public généraliste.

Le service dédié `/chatgpt/mcp` est préférable parce qu'il :

- ne remplace pas le MCP historique ;
- ne donne pas accès aux outils d'action ;
- n'expose pas les comptes ;
- n'expose pas les abonnements ;
- ne lance pas de calcul serveur ;
- n'offre qu'un contrat de preuve ;
- peut être audité indépendamment ;
- peut être gelé pour la revue.

Architecture :

```text
Strategy Arena site / desktop / MCP historique
  -> produit complet
  -> comptes
  -> moteurs
  -> rapports
  -> exports

Strategy Arena Evidence /chatgpt/mcp
  -> public
  -> read-only
  -> preuves déjà publiées
  -> aucun compte
  -> aucun job
  -> aucune transaction
```

#### 24.2.6 Rôle des cinq outils

##### `search_world_arena_strategies`

Entrées :

- marché borné ;
- requête courte ;
- tri borné ;
- limite maximale ;
- inclusion explicite des stratégies hospitalisées.

Sortie :

- identifiants publics ;
- métriques historiques ;
- provenance ;
- notice de recherche.

Ne doit pas :

- conclure "achetez" ;
- produire une allocation ;
- appeler un exchange.

##### `get_world_arena_contract`

Sortie :

- source ArenaScript publique exacte ;
- conditions parsées ;
- hash déterministe ;
- métriques liées.

Ce hash est important : il lie le texte présenté aux preuves historiques.

##### `compare_strategy_evidence`

Compare exactement deux stratégies sur le même snapshot.

Il doit :

- donner un leader par métrique ;
- montrer drawdown, rendement, robustesse et limites séparément ;
- refuser de produire un "meilleur investissement" global.

##### `get_challenger_duel`

Lit :

- duel ancêtre/champion ;
- holdout public ;
- Hall of Evolution.

S'il n'existe aucune preuve :

- retourner zéro résultat ;
- ne jamais inventer un duel.

##### `prepare_lab_challenge`

C'est le point le plus délicat.

Il ne lance rien. Il produit uniquement :

- identifiant ;
- hash ;
- nombre de variantes ;
- protocole holdout ;
- handoff local déterministe.

La description et le widget doivent continuer à dire :

```text
Préparer n'est pas exécuter.
Un challenge n'est ni un ordre, ni un déploiement, ni une soumission.
```

#### 24.2.7 Evidence Board

Le widget actuel utilise :

```text
ui://strategyarena/arena-evidence-board-v1.html
```

Il doit rester une surface de preuve, pas une interface de trading.

Afficher :

- marché ;
- source ;
- période ;
- hash ;
- métriques ;
- holdout ;
- frais/slippage si disponibles ;
- drawdown ;
- limites ;
- statut paper/research ;
- liens de preuve first-party.

Ne pas afficher :

- bouton Buy/Sell ;
- portefeuille ;
- montant à engager ;
- projection de gains ;
- abonnement ;
- pricing ;
- checkout ;
- affiliation ;
- bouton "publier sur TradingView" ;
- bouton "lancer CUDA".

#### 24.2.8 Provenance Strategy Arena

Chaque board devrait conserver :

```json
{
  "schema_version": "strategyarena.evidence.board.v1",
  "source": {
    "kind": "public_historical_simulation",
    "first_party": true,
    "personalized": false,
    "live_trade": false
  },
  "evidence": {
    "market": "bitcoin",
    "snapshot": "public",
    "contract_sha256": "...",
    "holdout_used": true
  },
  "limits": [
    "Historical simulation, not a forecast.",
    "No personalized financial advice.",
    "No trade was placed."
  ]
}
```

Les dates et identifiants strictement nécessaires à la preuve peuvent exister.
Les IDs de session, requête, utilisateur ou trace ne doivent pas être retournés.

#### 24.2.9 État actuel des cinq tests positifs

Le paquet contient déjà :

1. recherche de momentum Bitcoin ;
2. lecture du contrat `bitcoin::momentum_surfer` ;
3. comparaison de deux stratégies Bitcoin ;
4. lecture du dernier Challenger holdout ;
5. préparation d'un challenge de 100 000 variantes.

Ces tests sont bons car ils couvrent chaque outil de données.

À vérifier dans Developer Mode :

- le bon outil est appelé ;
- le renderer suit ;
- aucune recherche web ne remplace la preuve first-party ;
- aucun CTA financier n'apparaît ;
- les métriques restent historiques ;
- la sortie vide Challenger reste honnête ;
- le challenge ne lance rien.

#### 24.2.10 État actuel des trois tests négatifs

Le paquet contient déjà :

1. acheter 500 euros de Bitcoin ;
2. publier une stratégie vers TradingView et l'arène ;
3. recommander une stratégie à partir du salaire et de la dette.

Ces trois cas couvrent :

- transaction ;
- publication externe ;
- conseil personnalisé et collecte financière inutile.

Ils doivent rester négatifs. Ne pas créer un outil de frontière qui transformerait
par erreur ces scénarios en workflows positifs si le portail exige précisément
des cas où l'app ne doit pas se déclencher.

#### 24.2.11 Trois blocages manuels réels

Le paquet Strategy Arena déclarait encore :

| Blocage | État au 26/07/2026 | Action |
|---|---|---|
| identité | `pending_persona` | sélectionner l'identité déjà vérifiée |
| domaine | attente token | créer le draft et poser le token |
| scan | attente domaine | lancer Scan Tools |

L'identité OutilsIA a été vérifiée dans l'organisation. Une future session doit
vérifier que la même identité est sélectionnable pour Strategy Arena, puis
copier le nom exact du portail dans :

```text
submission/openai-plugin-submission.json
```

Ne pas inventer un nom commercial différent de l'identité vérifiée.

#### 24.2.12 Challenge de domaine Strategy Arena

URL :

```text
https://strategyarena.io/.well-known/openai-apps-challenge
```

Procédure :

1. ouvrir le draft Strategy Arena ;
2. saisir `https://strategyarena.io/chatgpt/mcp` ;
3. copier le token fourni ;
4. configurer la variable de service prévue ;
5. redémarrer uniquement le service ChatGPT dédié ;
6. vérifier HTTP 200 ;
7. vérifier `text/plain` ;
8. vérifier le corps exact ;
9. cliquer Verify Domain ;
10. conserver le token actif pendant la revue.

Ne jamais placer le token dans ce playbook ou dans Git.

#### 24.2.13 Scan Tools Strategy Arena

Après vérification du domaine, le portail doit afficher exactement six outils.

Contrôler pour chacun :

```text
readOnlyHint   = true
destructiveHint = false
openWorldHint  = false
```

Contrôler aussi :

- renderer avec URI v1 ;
- CSP exacte ;
- aucun domaine de checkout ;
- aucun domaine TradingView ;
- aucun schéma de paiement ;
- aucune auth ;
- descriptions sans promesse ;
- cinq outils modèle et un renderer app-only.

Si le scan montre un outil historique de backtest ou d'export, arrêter. Cela
signifie que le mauvais endpoint a été saisi.

#### 24.2.14 Vidéo Strategy Arena

Une vidéo WebM générée existe déjà, mais l'expérience OutilsIA a montré qu'un
MP4 H.264 capturé depuis la vraie interface ChatGPT est une preuve plus robuste.

Recommandation :

1. réutiliser le recorder Windows Graphics Capture ;
2. cibler le HWND Brave ;
3. utiliser une fenêtre et une conversation propres ;
4. masquer la barre latérale ;
5. montrer les cinq workflows ;
6. montrer le renderer ;
7. inclure le refus d'un trade ;
8. vérifier chaque frame sensible ;
9. encoder H.264 silencieux ;
10. publier sur `strategyarena.io`.

La vidéo ne doit pas montrer :

- compte ;
- email ;
- terminal ;
- chemin utilisateur ;
- portefeuille ;
- clé ;
- administration ;
- pricing.

#### 24.2.15 Pages publiques Strategy Arena

Les URLs actuelles de listing sont :

```text
https://strategyarena.io
https://strategyarena.io/support
https://strategyarena.io/privacy
https://strategyarena.io/cgv
```

Avant soumission, vérifier que ces pages :

- parlent explicitement du plugin public ;
- distinguent données publiques et compte ;
- divulguent le traitement IP transitoire pour rate limiting si présent ;
- disent qu'aucun trade n'est exécuté ;
- n'exigent pas de connexion ;
- sont accessibles au reviewer ;
- n'affichent pas une contradiction sur la vente dans le plugin.

Une page produit dédiée serait plus claire :

```text
/chatgpt-strategy-arena-evidence
```

Elle peut présenter le plugin sans afficher Builder/Operator dans le premier
parcours.

#### 24.2.16 Gate production existante

Commandes déjà disponibles :

```bash
cd <STRATEGYARENA_REPO>/apps/strategyarena-chatgpt-app
npm run verify
npm run audit:visual
npm run audit:reviewer:production
npm audit --audit-level=low
npm run verify:submission:production
```

Le 26 juillet 2026 :

```text
npm run verify
  -> 20 tests passés

npm run audit:reviewer:production
  -> OK
  -> 6 outils
  -> 5 workflows
  -> 7 endpoints publics
  -> challenge en attente
```

Après les trois actions portail :

```bash
npm run verify:submission:strict
```

#### 24.2.17 Risque de collision avec le repo actif

Le repo Strategy Arena était très sale lors de l'audit :

- nombreuses modifications non commitées ;
- nombreux fichiers non suivis ;
- chantier desktop actif ;
- dossier app ChatGPT lui-même non suivi dans l'état Git observé.

Une future session ne doit pas :

- nettoyer le repo global ;
- faire un reset ;
- écraser le travail desktop ;
- commiter tous les fichiers par facilité.

Elle doit :

1. isoler le dossier `apps/strategyarena-chatgpt-app` ;
2. inventorier les fichiers qui lui appartiennent ;
3. vérifier leur provenance ;
4. créer un commit ciblé ou une branche dédiée ;
5. ne toucher à rien d'autre.

#### 24.2.18 Ordre d'exécution Strategy Arena

| Palier | Action | État |
|---|---|---|
| A0 | contrat read-only | fait |
| A1 | service dédié | fait |
| A2 | widget v1 | fait |
| A3 | tests 20/20 | fait |
| A4 | audit prod | fait |
| A5 | identité exacte | à mettre à jour |
| A6 | challenge domaine | à faire dans le draft |
| A7 | Scan Tools | à faire |
| A8 | Developer Mode | à refaire après scan |
| A9 | vidéo MP4 finale | recommandé |
| A10 | portail | à remplir |
| A11 | soumission | décision humaine |

#### 24.2.19 Definition of Done Strategy Arena

- endpoint exact `/chatgpt/mcp` ;
- six outils exacts ;
- cinq data tools ;
- renderer app-only ;
- aucune auth ;
- aucune donnée personnelle ;
- aucun trade ;
- aucun transfert ;
- aucun abonnement ;
- aucune affiliation ;
- aucun job serveur ;
- preuves historiques identifiées ;
- holdout visible ;
- challenge non exécutant ;
- identité exacte ;
- challenge exact ;
- scan actuel ;
- cinq positifs ;
- trois négatifs ;
- vidéo réelle ;
- strict gate vert.

#### 24.2.20 Ce qu'il ne faut surtout pas fusionner

Ne jamais fusionner :

```text
OutilsIA Local Cockpit
Strategy Arena Evidence
MCP historique Strategy Arena
```

Leurs rôles sont différents :

| Produit | Rôle |
|---|---|
| OutilsIA | machine et modèles locaux |
| Strategy Arena Evidence | preuves publiques de recherche |
| Strategy Arena MCP historique | workflow quant avancé hors plugin public |
| Strategy Arena Desktop | exécution locale de recherche/backtests |

Cette séparation protège :

- l'utilisateur ;
- la revue ;
- le positionnement ;
- la maintenance ;
- les frontières de données ;
- le produit payant hors plugin.

### 24.3 Comparaison des trois prochains projets

| Point | ScoreLook | Strategy Arena | ScoreCredit |
|---|---|---|---|
| logique métier existante | oui | oui | oui, à cadrer |
| MCP existant | oui | oui | à vérifier |
| app dédiée | non | oui | non |
| widget | prototype | prêt | à créer |
| commerce | biens physiques | aucun dans plugin | aucun |
| données sensibles | éviter photos | éviter portefeuille | très élevé |
| risque politique | moyen | élevé | très élevé |
| priorité recommandée | 1 | 2 | 3 |

Ordre stratégique recommandé :

```text
1. Attendre le premier retour reviewer OutilsIA
2. Pendant l'attente, industrialiser ScoreLook sans soumettre
3. Finaliser les trois actions portail Strategy Arena
4. Réutiliser les retours OutilsIA sur les deux
5. Soumettre ScoreLook
6. Soumettre Strategy Arena Evidence
7. Garder ScoreCredit en étude tant que sa qualification réglementaire et
   politique n'est pas complètement verrouillée
```

Pourquoi ScoreLook avant Strategy Arena :

- usage immédiatement compréhensible ;
- widget naturellement visuel ;
- valeur non financière ;
- commerce physique autorisé ;
- faible risque de confusion avec une action locale.

Pourquoi Strategy Arena reste très proche :

- le code est presque fini ;
- la frontière est déjà bonne ;
- le paquet de soumission est industrialisé ;
- il reste surtout du portail.

Pourquoi ScoreCredit doit attendre :

- données financières personnelles ;
- risque de confusion avec une décision de prêt ;
- interdiction explicite des schémas de credit repair ou manipulation ;
- besoin probable d'une revue juridique plus stricte ;
- moins de marge pour une erreur de wording.

## 25. Checklist de sécurité réutilisable

### Serveur

- [ ] HTTPS public stable
- [ ] `/mcp` Streamable HTTP
- [ ] `/healthz`
- [ ] timeout
- [ ] rate limit
- [ ] validation stricte
- [ ] logs sans secret
- [ ] service non-root
- [ ] rollback

### Outils

- [ ] un objectif par outil
- [ ] description explicite
- [ ] schéma borné
- [ ] output schema
- [ ] provenance
- [ ] annotations exactes
- [ ] justifications concrètes
- [ ] erreurs propres

### Widget

- [ ] utile sans UI
- [ ] URI versionnée
- [ ] MIME MCP Apps
- [ ] CSP minimale
- [ ] domaine dédié
- [ ] aucun iframe tiers inutile
- [ ] rendu mobile
- [ ] erreur visible
- [ ] ancienne URI maintenue si nécessaire

### Données

- [ ] collecte minimale
- [ ] pas de secret dans le résultat
- [ ] pas d'ID interne
- [ ] pas de PII non nécessaire
- [ ] pas de debug payload
- [ ] politique de confidentialité alignée

### Soumission

- [ ] identité vérifiée
- [ ] permission Apps Management Write
- [ ] projet compatible avec la soumission MCP
- [ ] cinq positifs
- [ ] trois négatifs
- [ ] trois prompts maximum
- [ ] assets
- [ ] pages publiques
- [ ] vidéo réelle
- [ ] JSON courant
- [ ] challenge exact
- [ ] annotations scannées
- [ ] release notes
- [ ] pays
- [ ] attestations relues

## 26. Gates automatiques recommandées

### Gate locale

```bash
npm run verify
```

Doit couvrir :

- contrat MCP ;
- soumission ;
- tests unitaires ;
- widget ;
- assets ;
- pages.

### Gate production

```bash
npm run smoke:production
```

Doit couvrir :

- pages publiques ;
- health du widget ;
- challenge 404 ou token brut 200 ;
- version du serveur ;
- instructions ;
- outils ;
- annotations ;
- ressource actuelle ;
- aliases ;
- cas positifs ;
- cas d'erreur ;
- frontière.

### Gate vidéo

```text
ffprobe
full decode
frames réparties
revue humaine
SHA local/distant
HTTP anonyme
Range
```

### Gate portail

Après `Scan Tools`, comparer avec une liste attendue versionnée.

## 27. Procédure de revue et de correction

### Pendant la revue

- conserver serveur, widget, pages, vidéo et challenge disponibles ;
- surveiller les erreurs ;
- ne pas modifier le contrat scanné ;
- répondre aux demandes avec preuves ;
- ne pas demander d'accélération de la revue.

### Si correction demandée

1. lire le motif exact ;
2. reproduire ;
3. corriger la cause ;
4. ajouter un test ;
5. déployer ;
6. rescanner ;
7. mettre à jour le dossier ;
8. refaire la vidéo seulement si le parcours visible change ;
9. resoumettre.

### Si rejet

Ne pas contourner le motif par une description plus vague. Aligner :

- comportement ;
- métadonnées ;
- tests ;
- confidentialité ;
- vidéo.

## 28. Prompt de démarrage pour une future session

Utiliser ce prompt dans une nouvelle session Codex ou Claude Code :

```text
Lis d'abord :
handoffs/PLAYBOOK-CHATGPT-PLUGIN-MCP-APP-REUTILISABLE-20260726.md

Produit cible : [NOM]
Repo cible : [CHEMIN]
Site public : [DOMAINE]

Mission :
1. auditer le produit et proposer une frontière V1 ;
2. produire une matrice demandes/outils/données/effets ;
3. identifier les risques de confidentialité, commerce et réglementation ;
4. proposer 3 à 5 outils maximum, avec schémas et annotations ;
5. proposer le widget minimal utile ;
6. préparer 5 cas positifs et 3 négatifs ;
7. préparer l'architecture de déploiement, challenge et monitoring ;
8. ne rien déployer avant validation du contrat produit ;
9. ne copier aucun secret ou token d'OutilsIA ;
10. distinguer les invariants réutilisables des choix propres au produit.

Livrable initial :
- audit ;
- contrat produit ;
- outils ;
- risques ;
- plan par phases ;
- Definition of Done.
```

## 29. Prompt d'implémentation après validation

```text
Le contrat V1 du plugin [NOM] est validé.

Implémente maintenant :
1. serveur MCP Streamable HTTP ;
2. outils avec Zod et output schemas ;
3. annotations et justifications ;
4. widget MCP Apps versionné ;
5. domaine et CSP ;
6. challenge de domaine désactivé sans token ;
7. tests unitaires et production smoke ;
8. listing, tests et générateur de fichier de soumission ;
9. pages produit/support/privacy/terms ;
10. dossier de recette Developer Mode ;
11. outillage de vidéo Windows Graphics Capture si la recette se fait sous
    Windows.

Contraintes :
- aucun secret dans Git ;
- aucun effet non décrit ;
- aucune preuve fabriquée ;
- aucune action irréversible sans confirmation et annotation correcte ;
- aucun déploiement public avant gates vertes ;
- commit/push seulement des fichiers du périmètre.
```

## 30. Definition of Done d'un futur plugin

### Produit

- promesse claire ;
- frontière claire ;
- utile sans widget ;
- aucune capacité exagérée.

### Technique

- MCP public stable ;
- outils stricts ;
- résultats structurés ;
- widget chargé ;
- CSP minimale ;
- domaine vérifié ;
- monitoring ;
- rollback.

### Revue

- identité ;
- pages ;
- cinq positifs ;
- trois négatifs ;
- prompts ;
- assets ;
- vidéo ;
- import courant ;
- annotations ;
- attestations ;
- pays.

### Après soumission

- challenge actif ;
- contrat gelé ;
- statut surveillé ;
- procédure de correction prête ;
- publication distincte de l'approbation.

## 31. Sources officielles à relire à chaque nouveau projet

Ces pages sont temporellement sensibles. Les relire au moment de chaque
soumission :

- Construire un serveur MCP :
  `https://developers.openai.com/plugins/build/mcp-server`
- Ajouter une UI ChatGPT/MCP Apps :
  `https://developers.openai.com/plugins/build/chatgpt-ui`
- Règles de publication et de comportement :
  `https://developers.openai.com/plugins/app-guidelines`
- Commerce et checkout :
  `https://developers.openai.com/plugins/build/monetization`
- Soumettre un plugin :
  `https://developers.openai.com/plugins/deploy/submission`
- Exigences de revue MCP :
  `https://developers.openai.com/plugins/deploy/app-review`
- Erreurs de soumission :
  `https://developers.openai.com/plugins/deploy/submission-errors`
- Portail :
  `https://platform.openai.com/plugins`

Points officiels importants au 26 juillet 2026 :

- la soumission exige une identité vérifiée ;
- le rôle doit avoir Apps Management en écriture ;
- le MCP doit être public et non temporaire ;
- les annotations doivent refléter le comportement réel ;
- le commerce est actuellement limité aux biens physiques ;
- les produits ou services numériques, abonnements, contenus, tokens et crédits
  ne peuvent pas être vendus ou promus, même par upsell freemium indirect ;
- les plugins ne peuvent pas exécuter de transfert d'argent, transfert crypto
  ou trade d'investissement ;
- le checkout standard doit rester externe, sauf accès explicite à une
  fonctionnalité de checkout partenaire ;
- le plugin doit apporter une valeur autonome et ne peut pas être principalement
  un véhicule publicitaire ;
- les entrées et sorties doivent minimiser les données et ne pas retourner des
  identifiants internes inutiles ;
- le portail stocke un snapshot des métadonnées au scan ;
- l'approbation ne publie pas automatiquement ;
- les changements de contrat nécessitent une nouvelle version ;
- les délais de revue sont variables ;
- les projets avec résidence des données UE peuvent avoir des restrictions de
  soumission MCP. Vérifier la règle actuelle avant chaque projet.

## 32. Conclusion

La meilleure réutilisation de l'expérience OutilsIA n'est pas de cloner son
serveur. C'est de réutiliser cette discipline :

```text
Promesse bornée
  -> outils ciblés
  -> schémas stricts
  -> annotations vraies
  -> provenance visible
  -> widget versionné
  -> production stable
  -> tests reproductibles
  -> vidéo réelle
  -> soumission cohérente
  -> maintenance compatible
```

Les trois suites n'ont pas le même ordre de maturité :

- ScoreLook est le meilleur prochain chantier produit : logique et MCP existent,
  mais il faut isoler le service ChatGPT, versionner le widget, clarifier les
  droits d'image et garder le commerce physique secondaire à la valeur
  stylistique ;
- Strategy Arena Evidence est techniquement presque prêt : il faut préserver son
  endpoint read-only dédié, finir les actions du portail et ne jamais y faire
  entrer trading, jobs serveur, abonnements ou affiliation ;
- ScoreCredit doit rester le troisième chantier : sa première version devra
  privilégier l'explication et la simulation read-only, avec une frontière
  nette contre toute décision de prêt, soumission de dossier, action externe,
  réparation de crédit ou collecte de données sensibles.

Une V1 plus petite, honnête, testable et reviewable vaut mieux qu'un assistant
trop large impossible à sécuriser et à défendre en revue. Ce document doit
servir de source de départ à chaque nouvelle session, puis être spécialisé dans
le repo du produit sans copier aveuglément les outils ou les frontières
d'OutilsIA.
