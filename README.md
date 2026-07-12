# OutilsIA.fr

**The French forge of practical AI tools, local-AI guides and reproducible hardware benchmarks.**

🔗 **https://outilsia.fr**

OutilsIA is a French-first toolbox for running AI on your own machine: free in-browser tools, honest hardware guides (which GPU for which model, VRAM tiers, Ollama / LM Studio), and reproducible benchmarks — with no "best AI ever" hype.

## Free tools

| Tool | What it does |
|------|--------------|
| [MemoryForge](https://outilsia.fr/memoryforge) | Turns a messy chat into a clean, portable `MEMORY.md` so your AI stops forgetting your context |
| [Mon PC peut-il ?](https://outilsia.fr/mon-pc-peut-il) | Tells you in 10 seconds which local AI models your PC can actually run |
| [PromptForge](https://outilsia.fr/promptforge) | Scores and optimizes your prompts |
| [Comparateur](https://outilsia.fr/comparateur) | Independent comparison of the major AI models |
| [Benchmark local vs cloud](https://outilsia.fr/benchmark-local-vs-cloud) | Calculates when a GPU is cheaper than your cloud subscriptions |

## OutilsIA Local Cockpit

[Download the Windows/Linux beta](https://outilsia.fr/telecharger-scanner-ia-local) or read the [scanner hub](https://outilsia.fr/scanner-ia-local).

The open desktop client scans CPU, RAM, GPU, VRAM, storage and Ollama runtimes, installs models only after explicit confirmation, benchmarks them with native Ollama metrics and recommends which tested model to keep.

- **Hardware Doctor 2.0** separates detected drivers from observed runtime allocation. After a benchmark it uses Ollama `/api/ps` (`size_vram / size`) to report CPU, hybrid CPU/GPU or GPU execution; missing evidence stays unknown.
- **Runtime & Driver Intelligence v1 (cross-platform candidate `291887472771`, not yet claimed as public)** uses a dated official-source matrix to separate driver presence, CUDA/ROCm/Vulkan signals, Ollama support and measured `/api/ps` execution. Pascal remains capped at CUDA toolkit 12.x, Strix Halo Windows/Linux are evaluated separately, Intel keeps its OEM warning, and shared RAM is never relabeled as dedicated VRAM.
- **Model Autopilot v1** compares three bounded Ollama execution profiles on one already-installed model, requires explicit consent before testing or applying, and can restore the previous profile or Ollama defaults.
- **Private Workload Packs v1 (cross-platform candidate `291887472771`, not yet claimed as public)** compares one identical Code, French, summary, Memory/Obsidian or custom business task on two or three already-installed models. It downloads nothing, uploads nothing, persists no raw prompt/output and exports only scores, checks and SHA-256 digests to report, PDF, MemoryForge and Capability Passport 1.2.0.
- **Flight Recorder v1** stores an explicit local performance reference, compares exact Ollama throughput/prefill/load/offload plus thermal context, suspends verdicts when test conditions differ, and keeps possible causes separate from proven facts.
- **Upgrade Digital Twin v1** compares local-only RAM, GPU/VRAM, SSD, PSU, case and cooling scenarios against measured and catalog constraints. Missing physical facts stay unknown, price ranges are non-live, and the result can explicitly recommend buying nothing yet.
- **AI Capability Passport v1.2** exports a versioned JSON document containing hardware evidence, runtimes, installed models, benchmarks, recommendation and the read-only Strategy Arena handoff boundary.
- **Local Capability Bridge v1 (cross-platform candidate `291887472771`, not public yet)** serves one frozen Passport snapshot on `127.0.0.1` for 15 minutes after explicit consent. It is GET-only, bearer-authenticated, disabled by default and cannot install models, execute benchmarks, access personal files, run backtests or place trades.
- The passport SHA-256 detects document modification. It is not an identity signature for the PC or its owner.
- Prompts, model outputs, personal files and account tokens are excluded from the passport.
- Driver actions open only the official vendor page after an explicit click. The v1 source does not download, elevate or install a graphics driver automatically.

## Guides

- [Local AI guide](https://outilsia.fr/ia-locale) — Ollama, LM Studio, llama.cpp, offline AI, local RAG, private assistants
- [AI hardware guide](https://outilsia.fr/materiel) — GPU RTX, mini-PC, Mac M4, Raspberry Pi
- [Best GPU for local AI](https://outilsia.fr/blog/meilleur-gpu-ia-locale-2026)
- [How we test](https://outilsia.fr/comment-nous-testons) — open methodology, real bench (RTX 4080 Super), affiliate disclosure

## Original research

**[Dragon Labyrinth Benchmark](https://outilsia.fr/blog/dragon-labyrinth-ia-benchmark-2026)** — a reproducible study where a 1980s game chip beats frontier LLMs at imperfect-information play. Methodology, scorecard and data are public (CC-BY).

## About

Built and maintained by Chris Drakkeng. Part of a network of independent French tools: [Strategy Arena](https://strategyarena.io), [ScoreIA](https://scoreia.ai).

Editorial principle: practical, transparent about limits, benchmark-oriented. No universal "best AI" claims.

## License

Content © OutilsIA. Open datasets (e.g. Dragon Labyrinth) released under CC-BY 4.0.
