#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PAGES = {
    "scanner": ROOT / "server-work/static/pages/scanner-ia-local.html",
    "download": ROOT / "server-work/static/pages/telecharger-scanner-ia-local.html",
    "proofs": ROOT / "server-work/static/pages/preuves-local-cockpit.html",
    "profiles": ROOT / "server-work/static/pages/profils-machines-ia-locale.html",
    "llms": ROOT / "server-work/static/llms.txt",
}


def read(label: str) -> str:
    path = PAGES[label]
    assert path.is_file(), f"{label}: missing {path}"
    return path.read_text(encoding="utf-8")


def require(label: str, text: str, *needles: str) -> None:
    for needle in needles:
        assert needle in text, f"{label}: missing {needle!r}"


def main() -> int:
    scanner = read("scanner")
    download = read("download")
    proofs = read("proofs")
    profiles = read("profiles")
    llms = read("llms")

    require(
        "scanner",
        scanner,
        "Benchmark Protocol v2 · candidat",
        "Bottleneck Explainer v1 · candidat",
        "Carte de preuve v1 · candidat",
        "identité non attestée",
        "candidat source postérieur au build public actuel",
    )
    require(
        "download",
        download,
        "Un chiffre partageable avec son contexte, pas un badge marketing",
        "Aucun achat prioritaire",
        "révocable",
        "Fonction candidate non incluse dans le build public actuel",
    )
    require(
        "proofs",
        proofs,
        "Benchmark Protocol v2",
        "Bottleneck Explainer v1",
        "Proof Card v1",
        "mesuré localement, identité non attestée",
        "Ce palier reste candidat",
    )
    require(
        "profiles",
        profiles,
        "/r/... révocable",
        "Proof Card v1",
        "identité non attestée",
    )
    require(
        "llms",
        llms,
        "Benchmark Protocol v2 (source candidate, not in the current public build)",
        "Bottleneck Explainer v1 (source candidate, not in the current public build)",
        "Proof Card v1 (source candidate, not in the current public build)",
        "digest semantics are coherence only, not provenance",
        "Public `/r/` links are voluntary and revocable",
    )

    candidate_block = "\n".join((scanner, download, proofs, profiles, llms))
    forbidden_claims = (
        "identité vérifiée par OutilsIA",
        "PC certifié par OutilsIA",
        "preuve matérielle certifiée",
        "hardware identity verified",
    )
    for claim in forbidden_claims:
        assert claim.lower() not in candidate_block.lower(), f"forbidden proof claim: {claim}"

    print(
        "benchmark_proof_seo_ok "
        "pages=5 candidate=true identity_attested=false revocable=true no_buy=true"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
