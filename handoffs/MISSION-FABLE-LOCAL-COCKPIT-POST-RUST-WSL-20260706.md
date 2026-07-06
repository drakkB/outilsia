# Mission Fable - audit post-corrections Rust/WSL Local Cockpit

Contexte court : Codex vient de fermer les points techniques critiques du Local Cockpit :
- scan natif borne par timeout pour eviter les gels ;
- actions Ollama routees vers le runtime exact du modele installe (Windows natif vs WSL) ;
- benchmark/chat avec lecture concurrente stdout/stderr ;
- sortie `wsl.exe` UTF-16LE decodee ;
- installation WSL neutralisee (`wsl.exe --install`, pas Ubuntu force) ;
- `cargo test --lib` ajoute aux workflows Windows/Linux/cross-platform.

Frontiere stricte : mission lecture seule. Ne modifie pas `local-cockpit-app/src/app.js`, `local-cockpit-app/src-tauri/src/lib.rs`, les workflows, ni les pages site. Ne deploie rien. Ne cree rien sur le Bureau Windows.

Objectif
Auditer la coherence produit apres ces corrections et sortir uniquement un rapport dans `reports/` + un handoff dans `handoffs/`.

Points a verifier
1. Release CI
   - Verifier les derniers runs GitHub Actions du repo `drakkB/outilsia`.
   - Confirmer que Windows Beta et Linux Beta passent sur le dernier commit.
   - Si un run echoue, identifier le job et l'etape sans patcher.

2. Parcours Windows + WSL
   - Relire l'UI et le backend pour confirmer qu'un modele installe seulement en WSL est teste en WSL.
   - Verifier qu'aucun texte important ne pretend encore que WSL = Ubuntu obligatoire.
   - Rechercher les libelles restants "Ubuntu" et classer : acceptable si exemple/demo, problematique si promesse produit.

3. UX Essentiel
   - Verifier que le bouton principal ne renvoie pas vers un rescan inutile apres preuve/rapport.
   - Verifier que la preuve benchmark et le rapport restent visibles en mode Essentiel.
   - Verifier que PromptForge ne remonte pas au-dessus du coeur scan/materiel/modeles.

4. Terrain / preuves
   - Verifier que les gates terrain reseau/coherence restent en place apres les commits.
   - Ne pas fabriquer de fiches. Si tu fais des tests negatifs, utilise un scratchpad hors kit reel et dis-le.

5. SEO/GEO release
   - Verifier que la page telechargement reste lisible sans JS : liens, versions, SHA.
   - Verifier que `/scanner-ia-local` et `/telecharger-scanner-ia-local` gardent une frontiere claire : hub conseil vs page transactionnelle.

Sortie attendue
- `reports/fable_local_cockpit_post_rust_wsl_audit_20260706.md`
- `handoffs/HANDOFF-FABLE-LOCAL-COCKPIT-POST-RUST-WSL-20260706.md`

Format souhaite
- Verdict 5 lignes.
- Findings par gravite P0/P1/P2.
- "Verified sane" pour les points qui tiennent.
- "Next 5" pour Codex, sans patch direct.
