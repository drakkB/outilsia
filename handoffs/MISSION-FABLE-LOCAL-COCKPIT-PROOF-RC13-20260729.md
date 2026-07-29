# Mission Fable - Jury externe OutilsIA Local Cockpit RC13

## Rôle

Agis comme un jury technique indépendant. Ne cherche ni à féliciter le projet
ni à confirmer le récit de Codex. Cherche le premier endroit où OutilsIA
confond mesure, estimation, cohérence, provenance ou identité.

La mission est 100 % lecture seule. Tu ne modifies aucun fichier, ne déploies
rien, n'installes aucun modèle et n'écris rien sur le Bureau.

## Sources de vérité

- Candidate privée :
  `C:\Users\chris\Downloads\OutilsIA-Local-Cockpit-0.1.2-rc.13-Test`
- Repo Windows :
  `C:\Users\chris\outilsia-repo`
- Résultats Computer Use RC13, s'ils existent :
  `C:\Users\chris\Downloads\OutilsIA-Computer-Use-RC13-Proof`
- Backend candidat non déployé :
  `/home/chris/projects/outilsia/server-work/routers/ops_routes.py`

Commence par l'identité du manifeste. N'attribue jamais au binaire une fonction
présente seulement dans un commit ultérieur.

## Question de jury

> OutilsIA transforme-t-il réellement un benchmark local en décision
> compréhensible et en preuve portable, sans fabriquer de causalité, de
> provenance, de vérification communautaire ou de besoin d'achat ?

## Axes d'audit

### A. Identité et niveau de preuve

- SHA-256 portable/manifeste.
- Commit exact, arbre propre, version et canal.
- Statut de signature Windows rapporté honnêtement.
- Différence claire entre candidat privé, public et backend non déployé.
- Absence de fixture présentée comme mesure terrain.

### B. Benchmark Protocol v2

- Inventorier tous les champs qui lient une mesure à son contexte.
- Vérifier que modèle, prompt digest, runtime, Ollama, réglages et mode
  d'allocation participent à la comparabilité.
- Construire une matrice de falsification : changer un champ à la fois.
- Signaler toute comparaison acceptée malgré une différence indispensable.
- Vérifier qu'un prompt personnalisé reste mesuré localement mais sort de
  l'agrégation standard.

### C. Bottleneck Explainer v1

- Pour chaque branche, classer ce qui est fait, hypothèse ou inconnue.
- Chercher les raccourcis faux :
  - plusieurs barrettes = dual channel ;
  - température = throttling ;
  - API détectée = accélération utilisée ;
  - offload = cause certaine ;
  - score matériel = vitesse.
- Vérifier le prochain test proposé.
- Exiger `no_buy` lorsque rien ne justifie un achat.

### D. Proof Card v1

- Recalculer le digest canonique.
- Vérifier qu'il est décrit comme cohérence, jamais signature.
- Comparer UI, JSON, Markdown, PDF, MemoryForge, Passport et MCP.
- Chercher toute fuite de prompt, réponse, machine_key, compte, hostname,
  token, chemin ou IP.
- Vérifier `verified=false`, `identity_verified=false` et
  `physical_field_proof=false`.
- Modifier modèle, débit et décision ; vérifier que le serveur isolé refuse les
  incohérences.

### E. Révocation et absence de commerce forcé

- Vérifier la révocation du lien dans le scénario backend isolé.
- Vérifier qu'un rapport révoqué ne reste pas accessible.
- Vérifier qu'un verdict `no_buy` retire les upgrades et liens marchands.
- Vérifier que l'absence de preuve n'est jamais remplacée par une affiliation.

### F. Valeur produit

Évaluer séparément :

1. compréhension novice en moins de cinq minutes ;
2. valeur pour un utilisateur avancé ;
3. utilité pour un agent via MCP read-only ;
4. caractère difficilement copiable du corpus futur ;
5. capacité de la carte à produire des partages et backlinks sans faux badge.

Ne récompense pas le nombre de fonctions. Pénalise toute falaise UX ou module
avancé visible avant le premier résultat.

### G. SEO/GEO candidat

- Vérifier que le site candidat décrit seulement les fonctions présentes dans
  la source candidate.
- Distinguer explicitement build public et source candidate.
- Vérifier que les pages parlent de mesures originales plutôt que de réécrire
  un catalogue.
- Évaluer si la future carte `/r/` est lisible sans JavaScript, partageable,
  révoquable et exploitable par un moteur ou LLM.
- Refuser toute publication de chiffres communautaires avant cohorte minimale.

### H. Tests et angles morts

- Lire les tests, puis chercher ce qu'ils ne couvrent pas.
- Vérifier Windows, Linux, responsive et client MCP officiel.
- Distinguer test déterministe, simulation, test isolé et preuve physique.
- Relever tout scénario qui ne peut être fermé que par les tests terrain de
  Christophe.

## Scénarios adversariaux minimum

1. Preuve avec débit carte différent du protocole.
2. Preuve avec modèle carte différent du benchmark.
3. Preuve avec réglages standard modifiés.
4. Carte avec un hostname dans un champ inattendu.
5. Carte avec `verified=true`.
6. Bottleneck `no_buy` mais upgrade présent.
7. Benchmark ancien avec modèle absent du scan courant.
8. Preuve valide située après plus de cinq benchmarks récents.
9. Lien partagé puis révoqué.
10. MCP arrêté puis ancien token rejoué.

## Livrable

Écrire uniquement :

`C:\Users\chris\Downloads\AUDIT-FABLE-OUTILSIA-PROOF-RC13-20260729.md`

Structure imposée :

1. Verdict en dix lignes.
2. Identité exacte auditée.
3. Findings P0/P1/P2, d'abord, avec fichier et ligne.
4. Ce qui est réellement rare et défendable.
5. Ce qui reste copiable ou trop conceptuel.
6. Matrice de falsification.
7. Évaluation novice / avancé / agent / SEO.
8. Tests terrain encore nécessaires.
9. Trois simplifications à faire avant promotion.
10. Trois fonctions à ne pas construire maintenant.
11. Plan 30 jours / 90 jours / 6 mois.
12. Verdict final : `GO`, `NO_GO` ou `BLOCKED`, avec conditions exactes.

Chaque affirmation doit porter l'une des étiquettes :

- `PROUVÉ BINAIRE`
- `PROUVÉ SOURCE`
- `PROUVÉ TEST ISOLÉ`
- `OBSERVÉ TERRAIN`
- `HYPOTHÈSE`
- `NON TESTÉ`

## Definition of Done

- Aucun fichier modifié.
- Aucun déploiement.
- Aucun modèle installé ou supprimé.
- Aucun secret dans le rapport.
- Aucun compliment sans preuve.
- Toute critique est reproductible.
- Le rapport distingue clairement candidat, public et futur.
- Le verdict répond à la question de jury, pas au volume de fonctionnalités.
