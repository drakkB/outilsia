#!/usr/bin/env python3
"""Post-deploy monitor for Local Cockpit SEO/GSC remediation.

This covers what can be verified without Search Console API access:
- old 404 examples now redirect to 200
- Local Cockpit teaser is present on high-impression pages
- download page and screenshots are live
- known Alpine/JS false-link patterns are absent
- sitemap is reachable and contains key pages
"""

from __future__ import annotations

import argparse
import html
import json
import re
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


LEGACY_404_PATHS = [
    "/blog/memoire-unifiée-ia-locale",
    "/blog/ia-gratuite-française",
    "/blog/memoire-unifiée-ia-locale-mac-vs-pc",
    "/glossaire",
    "/blog/meilleur-os-ia-locale-2026",
    "/blog/ia-gratuite-sans-inscription-2026",
    "/blog/mac-mini-m4-ia-locale-2026",
    "/blog/ollama-docker-guide-2026",
    "/blog/meilleur-ia-code-2026",
    "/blog/ia-pour-les-profs-enseignants-2026",
    "/blog/ollama-vs-lm-studio-2026",
]

TEASER_PAGES = [
    "/blog",
    "/blog/chatgpt-gratuit-francais-guide-2026",
    "/blog/claude-gratuit-guide-complet-2026",
    "/blog/gemini-gratuit-guide-complet-2026",
    "/blog/ia-gratuite-francaise",
    "/blog/ia-gratuite-sans-inscription",
    "/blog/meilleur-ia-gratuite-2026",
]

FALSE_LINK_PAGES = [
    "/mon-pc-peut-il",
    "/blog/ia-raspberry-pi-guide-complet-2026",
]

KEY_SITEMAP_PATHS = [
    "/scanner-ia-local",
    "/telecharger-scanner-ia-local",
    *TEASER_PAGES,
]

SCREENSHOT_PATHS = [
    "/static/images/local-cockpit/local-cockpit-scanned-desktop-20260703.png?v=202607032140",
    "/static/images/local-cockpit/local-cockpit-scanned-mobile-20260703.png?v=202607032140",
    "/static/images/local-cockpit/local-cockpit-capability-passport-v1.png?v=20260710",
    "/static/images/local-cockpit/local-cockpit-model-autopilot-v1.png?v=20260710",
    "/static/images/local-cockpit/local-cockpit-flight-recorder-v1.png?v=20260710",
    "/static/images/local-cockpit/local-cockpit-upgrade-digital-twin-v1.png?v=20260711",
]

FALSE_JS_LINK_RE = re.compile(r'(?:href|src)="(?:get[A-Z][^"]*|item\.[^"]*|\$\{[^"]*)')
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
META_DESC_RE = re.compile(
    r'<meta(?:\s+name="description"\s+content="([^"]*)"|\s+content="([^"]*)"\s+name="description")',
    re.IGNORECASE,
)
CANONICAL_LINK_RE = re.compile(r"<link[^>]+>", re.IGNORECASE)
OG_URL_RE = re.compile(r'<meta[^>]+property="og:url"[^>]+content="([^"]*)"', re.IGNORECASE)
JSON_LD_RE = re.compile(r'<script\s+type="application/ld\+json">(.*?)</script>', re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
NON_VISIBLE_BLOCK_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)

CTR_REQUIRED = {
    "/blog/chatgpt-gratuit-francais-guide-2026": ("ChatGPT gratuit", "scanner"),
    "/blog/claude-gratuit-guide-complet-2026": ("Claude gratuit", "IA locale"),
    "/blog/gemini-gratuit-guide-complet-2026": ("Gemini gratuit", "IA locale"),
    "/blog/ia-gratuite-francaise": ("IA gratuite", "scanner"),
    "/blog/ia-gratuite-sans-inscription": ("IA gratuite", "IA locale"),
    "/blog/meilleur-ia-gratuite-2026": ("Meilleure IA gratuite", "scanner"),
}


def fetch(url: str, method: str = "GET", read_limit: int = 250_000) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "OutilsIA-Local-Cockpit-SEO-monitor/20260703"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = b"" if method == "HEAD" else response.read(read_limit)
            return {
                "ok": 200 <= response.status < 400,
                "status": response.status,
                "url": url,
                "final_url": response.geturl(),
                "content_type": response.headers.get("content-type", ""),
                "content_length": response.headers.get("content-length", ""),
                "text": body.decode("utf-8", errors="replace"),
            }
    except urllib.error.HTTPError as error:
        body = b"" if method == "HEAD" else error.read(min(read_limit, 40_000))
        return {
            "ok": False,
            "status": error.code,
            "url": url,
            "final_url": error.geturl(),
            "content_type": error.headers.get("content-type", ""),
            "content_length": error.headers.get("content-length", ""),
            "text": body.decode("utf-8", errors="replace"),
            "error": str(error),
        }
    except Exception as error:
        return {"ok": False, "status": "ERR", "url": url, "final_url": url, "error": str(error), "text": ""}


def absolute(base_url: str, path: str) -> str:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            urllib.parse.quote(parts.path, safe="/%:@"),
            urllib.parse.quote(parts.query, safe="=&%:@/?"),
            urllib.parse.quote(parts.fragment, safe="=&%:@/?"),
        )
    )


def attr_value(tag: str, attr: str) -> str:
    match = re.search(rf'{attr}="([^"]*)"', tag, re.IGNORECASE)
    return match.group(1) if match else ""


def canonical_href(text: str) -> str:
    for tag in CANONICAL_LINK_RE.findall(text):
        if attr_value(tag, "rel").lower() == "canonical":
            return attr_value(tag, "href")
    return ""


def faq_visibility(text: str) -> dict[str, object]:
    visible_source = NON_VISIBLE_BLOCK_RE.sub(" ", text)
    visible = " ".join(html.unescape(TAG_RE.sub(" ", visible_source)).split())
    faq_docs = []
    for block in JSON_LD_RE.findall(text):
        try:
            document = json.loads(html.unescape(block.strip()))
        except json.JSONDecodeError:
            continue
        if isinstance(document, dict) and document.get("@type") == "FAQPage":
            faq_docs.append(document)
    entities = faq_docs[0].get("mainEntity", []) if len(faq_docs) == 1 else []
    missing = []
    for entity in entities if isinstance(entities, list) else []:
        question = " ".join(str(entity.get("name") or "").split())
        answer = " ".join(str((entity.get("acceptedAnswer") or {}).get("text") or "").split())
        if not question or question not in visible or not answer or answer not in visible:
            missing.append(question or "question sans nom")
    return {
        "faq_documents": len(faq_docs),
        "faq_questions": len(entities) if isinstance(entities, list) else 0,
        "faq_missing_visible": missing,
        "faq_visible_ok": len(faq_docs) == 1 and bool(entities) and not missing,
    }


def check_legacy_404(base_url: str) -> list[dict[str, object]]:
    results = []
    for path in LEGACY_404_PATHS:
        result = fetch(absolute(base_url, path))
        results.append(
            {
                "path": path,
                "status": result.get("status"),
                "final_url": result.get("final_url"),
                "ok": result.get("status") == 200,
            }
        )
    return results


def check_teasers(base_url: str) -> list[dict[str, object]]:
    results = []
    for path in TEASER_PAGES:
        result = fetch(absolute(base_url, path))
        text = str(result.get("text") or "")
        is_blog = path == "/blog"
        teaser_ok = "Bêta OutilsIA Local Cockpit" in text if is_blog else "Alternative locale OutilsIA" in text
        scanner_ok = "/telecharger-scanner-ia-local" in text
        meta_ok = ("scanner PC" in text) or ("Ollama" in text) or ("IA locale" in text) or ("Local Cockpit" in text)
        proof_ok = is_blog or ("Preuve locale" in text and "Benchmark tokens/s" in text and "Modele conseille" in text)
        title_match = TITLE_RE.search(text)
        desc_match = META_DESC_RE.search(text)
        og_url_match = OG_URL_RE.search(text)
        title = html.unescape(title_match.group(1).strip()) if title_match else ""
        description = html.unescape(next((group for group in desc_match.groups() if group), "").strip()) if desc_match else ""
        ctr_terms = CTR_REQUIRED.get(path, ())
        title_ctr_ok = is_blog or all(term.lower() in title.lower() for term in ctr_terms)
        desc_ctr_ok = is_blog or any(signal in description.lower() for signal in ("ollama", "local cockpit", "ia locale", "scanner"))
        canonical = canonical_href(text)
        og_url = og_url_match.group(1) if og_url_match else canonical
        canonical_ok = is_blog or canonical == absolute(base_url, path)
        og_url_ok = is_blog or og_url == canonical
        results.append(
            {
                "path": path,
                "status": result.get("status"),
                "teaser_ok": teaser_ok,
                "scanner_link_ok": scanner_ok,
                "meta_signal_ok": meta_ok,
                "proof_signal_ok": proof_ok,
                "title": title,
                "description": description,
                "title_ctr_ok": title_ctr_ok,
                "desc_ctr_ok": desc_ctr_ok,
                "canonical_ok": canonical_ok,
                "og_url_ok": og_url_ok,
                "ok": result.get("status") == 200
                and teaser_ok
                and scanner_ok
                and meta_ok
                and proof_ok
                and title_ctr_ok
                and desc_ctr_ok
                and canonical_ok
                and og_url_ok,
            }
        )
    return results


def check_download_page(base_url: str) -> dict[str, object]:
    result = fetch(absolute(base_url, "/telecharger-scanner-ia-local"))
    text = str(result.get("text") or "")
    faq = faq_visibility(text)
    static_links_ok = all(
        pattern in text
        for pattern in (
            'href="/static/downloads/local-cockpit/',
            ".exe",
            ".deb",
            ".rpm",
            "SHA256",
        )
    )
    terrain_caveat_ok = "campagne terrain 5 machines reste en cours" in text
    proof_engine_ok = "eval_count / eval_duration" in text and "load_duration" in text
    objective_arena_ok = "Arena objective v1" in text and "six éléments reproductibles" in text
    recommendation_engine_ok = (
        "Recommendation Engine v2" in text
        and "sept preuves" in text
        and "garder ce modèle" in text.lower()
    )
    model_autopilot_ok = (
        "Model Autopilot v1" in text
        and "Rapide" in text
        and "Équilibré" in text
        and "retour" in text.lower()
        and "num_ctx" in text
    )
    doctor_passport_ok = (
        "Hardware Doctor 2.0" in text
        and "AI Capability Passport" in text
        and "ollama_api_ps" in text
        and "pas une signature d'identité" in text
    )
    hardware_truth_ok = (
        "GPU non déterminé" in text
        and "jamais automatiquement « CPU-only »" in text
        and "mode mémoire reste inconnu" in text
    )
    flight_recorder_ok = (
        "Flight Recorder v1" in text
        and "référence locale" in text
        and "causes possibles" in text.lower()
        and "ne compte jamais comme validation physique" in text
    )
    digital_twin_ok = (
        "Upgrade Digital Twin v1" in text
        and "N'achetez rien pour l'instant" in text
        and "prix ne sont pas en temps réel" in text
        and "simulation locale ne compte jamais comme validation physique" in text
    )
    runtime_driver_ok = (
        "Runtime &amp; Driver Intelligence v1" in text
        and "CUDA toolkit 12.x maximum" in text
        and "Strix Halo" in text
        and "DirectML n'est pas présenté comme backend Ollama" in text
        and "aucune installation silencieuse" in text
    )
    private_workload_ok = (
        "Private Workload Packs v1" in text
        and "2 à 3 modèles" in text
        and "60 secondes maximum par modèle" in text
        and "réponses brutes exclues" in text
        and "ne compte jamais comme validation physique" in text
    )
    return {
        "status": result.get("status"),
        "title_signal_ok": "Scanner PC IA locale" in text,
        "build_signal_ok": "Local Cockpit" in text and "0.1.1" in text,
        "screenshot_refs_ok": all(path in text for path in SCREENSHOT_PATHS),
        "static_links_ok": static_links_ok,
        "terrain_caveat_ok": terrain_caveat_ok,
        "proof_engine_ok": proof_engine_ok,
        "objective_arena_ok": objective_arena_ok,
        "recommendation_engine_ok": recommendation_engine_ok,
        "model_autopilot_ok": model_autopilot_ok,
        "doctor_passport_ok": doctor_passport_ok,
        "hardware_truth_ok": hardware_truth_ok,
        "flight_recorder_ok": flight_recorder_ok,
        "digital_twin_ok": digital_twin_ok,
        "runtime_driver_ok": runtime_driver_ok,
        "private_workload_ok": private_workload_ok,
        **faq,
        "ok": result.get("status") == 200
        and "Scanner PC IA locale" in text
        and all(path in text for path in SCREENSHOT_PATHS)
        and static_links_ok
        and terrain_caveat_ok
        and proof_engine_ok
        and objective_arena_ok
        and recommendation_engine_ok
        and model_autopilot_ok
        and doctor_passport_ok
        and hardware_truth_ok
        and flight_recorder_ok
        and digital_twin_ok
        and runtime_driver_ok
        and private_workload_ok
        and faq["faq_visible_ok"],
    }


def check_scanner_hub(base_url: str) -> dict[str, object]:
    result = fetch(absolute(base_url, "/scanner-ia-local"))
    text = str(result.get("text") or "")
    faq = faq_visibility(text)
    canonical = canonical_href(text)
    proof_engine_ok = "eval_count / eval_duration" in text and "prompt_eval_count" in text
    objective_arena_ok = "Arena objective v1" in text and "six vérifications" in text
    recommendation_engine_ok = (
        "Recommendation Engine v2" in text
        and "7 preuves locales" in text
        and "Garder ce modèle" in text
    )
    model_autopilot_ok = (
        "Model Autopilot v1" in text
        and "Rapide" in text
        and "Équilibré" in text
        and "num_ctx" in text
        and "retour arrière" in text.lower()
    )
    doctor_passport_ok = (
        "Hardware Doctor 2.0" in text
        and "AI Capability Passport" in text
        and "size_vram / size" in text
        and "pas une signature d'identité" in text
    )
    hardware_truth_ok = (
        "GPU non déterminé" in text
        and "faux PC CPU-only" in text
        and "canal reste inconnu" in text
    )
    flight_recorder_ok = (
        "Flight Recorder v1" in text
        and "Comparaison stricte" in text
        and "causes possibles" in text.lower()
        and "ne remplace pas la campagne physique cinq machines" in text
    )
    digital_twin_ok = (
        "Upgrade Digital Twin v1" in text
        and "N'achetez rien pour l'instant" in text
        and "estimations internes OutilsIA" in text
        and "non temps réel" in text
        and "ne compte jamais comme validation physique" in text
    )
    runtime_driver_ok = (
        "Runtime &amp; Driver Intelligence v1" in text
        and "CUDA toolkit 12.x maximum" in text
        and "Strix Halo" in text
        and "DirectML n'est pas présenté comme backend Ollama" in text
        and "Aucun pilote n'est téléchargé" in text
    )
    private_workload_ok = (
        "Private Workload Packs v1" in text
        and "2 à 3 modèles" in text
        and "60 secondes maximum par modèle" in text
        and "réponses brutes" in text
        and "ne compte jamais comme validation physique" in text
    )
    return {
        "status": result.get("status"),
        "canonical_ok": canonical == absolute(base_url, "/scanner-ia-local"),
        "download_link_ok": "/telecharger-scanner-ia-local" in text,
        "terrain_caveat_ok": "validation terrain multi-machines reste en cours" in text,
        "proof_engine_ok": proof_engine_ok,
        "objective_arena_ok": objective_arena_ok,
        "recommendation_engine_ok": recommendation_engine_ok,
        "model_autopilot_ok": model_autopilot_ok,
        "doctor_passport_ok": doctor_passport_ok,
        "hardware_truth_ok": hardware_truth_ok,
        "flight_recorder_ok": flight_recorder_ok,
        "digital_twin_ok": digital_twin_ok,
        "runtime_driver_ok": runtime_driver_ok,
        "private_workload_ok": private_workload_ok,
        **faq,
        "ok": result.get("status") == 200
        and canonical == absolute(base_url, "/scanner-ia-local")
        and "/telecharger-scanner-ia-local" in text
        and "validation terrain multi-machines reste en cours" in text
        and proof_engine_ok
        and objective_arena_ok
        and recommendation_engine_ok
        and model_autopilot_ok
        and doctor_passport_ok
        and hardware_truth_ok
        and flight_recorder_ok
        and digital_twin_ok
        and runtime_driver_ok
        and private_workload_ok
        and faq["faq_visible_ok"],
    }


def check_release_manifest(base_url: str) -> dict[str, object]:
    result = fetch(absolute(base_url, "/static/downloads/local-cockpit/release.json"), read_limit=300_000)
    try:
        release = json.loads(str(result.get("text") or "{}"))
    except json.JSONDecodeError:
        release = {}
    files = release.get("files") if isinstance(release.get("files"), list) else []
    notes = release.get("release_notes") if isinstance(release.get("release_notes"), list) else []
    features = release.get("features") if isinstance(release.get("features"), list) else []
    platforms = {str(item.get("platform") or "") for item in files if isinstance(item, dict)}
    digital_twin_note_ok = any("Upgrade Digital Twin v1" in str(note) for note in notes)
    digital_twin_feature_ok = "upgrade_digital_twin_v1" in features
    hardware_truth_note_ok = any("Hardware Truth v1" in str(note) for note in notes)
    hardware_truth_feature_ok = "hardware_truth_v1" in features
    runtime_driver_note_ok = any("Runtime & Driver Intelligence v1" in str(note) for note in notes)
    runtime_driver_feature_ok = "runtime_driver_intelligence_v1" in features
    private_workload_note_ok = any("Private Workload Packs v1" in str(note) for note in notes)
    private_workload_feature_ok = "private_workload_packs_v1" in features
    provenance = release.get("build_provenance") if isinstance(release.get("build_provenance"), dict) else {}
    build_id_matches = str(provenance.get("build_id") or "") == str(release.get("build_id") or "")
    return {
        "status": result.get("status"),
        "build_id": release.get("build_id") or "",
        "file_count": len(files),
        "platforms": sorted(platforms),
        "digital_twin_note_ok": digital_twin_note_ok,
        "digital_twin_feature_ok": digital_twin_feature_ok,
        "hardware_truth_note_ok": hardware_truth_note_ok,
        "hardware_truth_feature_ok": hardware_truth_feature_ok,
        "runtime_driver_note_ok": runtime_driver_note_ok,
        "runtime_driver_feature_ok": runtime_driver_feature_ok,
        "private_workload_note_ok": private_workload_note_ok,
        "private_workload_feature_ok": private_workload_feature_ok,
        "build_id_matches": build_id_matches,
        "merged_release_ok": provenance.get("merged_release") is True,
        "ok": result.get("status") == 200
        and len(files) == 5
        and {"windows-x64", "linux"}.issubset(platforms)
        and digital_twin_note_ok
        and digital_twin_feature_ok
        and hardware_truth_note_ok
        and hardware_truth_feature_ok
        and runtime_driver_note_ok
        and runtime_driver_feature_ok
        and private_workload_note_ok
        and private_workload_feature_ok
        and build_id_matches
        and provenance.get("merged_release") is True,
    }


def check_llms_txt(base_url: str) -> dict[str, object]:
    result = fetch(absolute(base_url, "/llms.txt"), read_limit=300_000)
    text = str(result.get("text") or "")
    proof_engine_ok = "eval_count / eval_duration" in text
    objective_arena_ok = "Objective Arena" in text and "six local proofs" in text
    recommendation_engine_ok = (
        "Recommendation Engine v2" in text
        and "usage-specific proof" in text
        and "which tested model to keep" in text
    )
    model_autopilot_ok = (
        "Model Autopilot v1" in text
        and "already-installed model" in text
        and "downloads nothing" in text
        and "restore" in text
    )
    doctor_passport_ok = (
        "Hardware Doctor 2.0" in text
        and "AI Capability Passport v1" in text
        and "size_vram / size" in text
        and "not an identity signature" in text
    )
    hardware_truth_ok = (
        "Hardware Truth" in text
        and "never fabricated as CPU-only or 0 GB VRAM" in text
        and "do not prove the active single/dual/quad-channel topology" in text
    )
    flight_recorder_ok = (
        "Flight Recorder v1" in text
        and "suspends the regression verdict" in text
        and "never proven causality" in text
        and "never count as physical field evidence" in text
    )
    digital_twin_ok = (
        "Upgrade Digital Twin v1" in text
        and "pre-evaluates RAM type, maximum capacity and slots" in text
        and "internal OutilsIA price estimates observed on 2026-07-11" in text
        and "not live prices" in text
        and 'say "do not buy yet"' in text
        and "never count as physical field evidence" in text
    )
    runtime_driver_ok = (
        "Runtime & Driver Intelligence v1" in text
        and "CUDA toolkit 12.x maximum" in text
        and "Strix Halo" in text
        and "DirectML is not presented as an Ollama backend" in text
        and "installs no graphics driver automatically" in text
    )
    private_workload_ok = (
        "Private Workload Packs v1" in text
        and "2 or 3 already-installed Ollama models" in text
        and "60-second limit per model" in text
        and "zero downloads or cloud uploads" in text
        and "never the raw custom prompt or model outputs" in text
        and "not a physical field-validation proof" in text
    )
    return {
        "status": result.get("status"),
        "hub_ok": "https://outilsia.fr/scanner-ia-local" in text,
        "download_ok": "https://outilsia.fr/telecharger-scanner-ia-local" in text,
        "terrain_caveat_ok": "5-machine physical field-validation campaign is not complete yet" in text,
        "proof_engine_ok": proof_engine_ok,
        "objective_arena_ok": objective_arena_ok,
        "recommendation_engine_ok": recommendation_engine_ok,
        "model_autopilot_ok": model_autopilot_ok,
        "doctor_passport_ok": doctor_passport_ok,
        "hardware_truth_ok": hardware_truth_ok,
        "flight_recorder_ok": flight_recorder_ok,
        "digital_twin_ok": digital_twin_ok,
        "runtime_driver_ok": runtime_driver_ok,
        "private_workload_ok": private_workload_ok,
        "ok": result.get("status") == 200
        and "https://outilsia.fr/scanner-ia-local" in text
        and "https://outilsia.fr/telecharger-scanner-ia-local" in text
        and "5-machine physical field-validation campaign is not complete yet" in text
        and proof_engine_ok
        and objective_arena_ok
        and recommendation_engine_ok
        and model_autopilot_ok
        and doctor_passport_ok
        and hardware_truth_ok
        and flight_recorder_ok
        and digital_twin_ok
        and runtime_driver_ok
        and private_workload_ok,
    }


def check_field_claims(base_url: str) -> list[dict[str, object]]:
    results = []
    for path in ("/scanner-ia-local", "/telecharger-scanner-ia-local"):
        result = fetch(absolute(base_url, path))
        text = str(result.get("text") or "")
        mentions_five = bool(re.search(r"5\s*machines", text, re.IGNORECASE))
        claims_validated = bool(re.search(r"5\s*machines[^.]{0,120}valid", text, re.IGNORECASE))
        caveat = bool(re.search(r"(en cours|incomplete|pas complète|reste en cours)", text, re.IGNORECASE))
        results.append(
            {
                "path": path,
                "status": result.get("status"),
                "mentions_five_machines": mentions_five,
                "claims_validated": claims_validated,
                "caveat_ok": caveat,
                "ok": result.get("status") == 200 and (not claims_validated or caveat),
            }
        )
    return results


def fetch_image_info(url: str) -> dict[str, object]:
    request = urllib.request.Request(url, headers={"User-Agent": "OutilsIA-Local-Cockpit-SEO-monitor/20260711"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(1_000_000)
            width = height = 0
            if body.startswith(b"\x89PNG\r\n\x1a\n") and len(body) >= 24:
                width, height = struct.unpack(">II", body[16:24])
            return {
                "status": response.status,
                "content_type": response.headers.get("content-type", ""),
                "content_length": response.headers.get("content-length", ""),
                "bytes_read": len(body),
                "width": width,
                "height": height,
            }
    except Exception as error:
        return {"status": "ERR", "error": str(error), "bytes_read": 0, "width": 0, "height": 0}


def check_screenshots(base_url: str) -> list[dict[str, object]]:
    results = []
    for path in SCREENSHOT_PATHS:
        result = fetch_image_info(absolute(base_url, path))
        results.append(
            {
                "path": path,
                "status": result.get("status"),
                "content_type": result.get("content_type"),
                "content_length": result.get("content_length"),
                "bytes_read": result.get("bytes_read"),
                "width": result.get("width"),
                "height": result.get("height"),
                "ok": result.get("status") == 200
                and "image/" in str(result.get("content_type", ""))
                and int(result.get("bytes_read") or 0) > 10_000
                and int(result.get("width") or 0) >= 320
                and int(result.get("height") or 0) >= 200,
            }
        )
    return results


def check_false_js_links(base_url: str) -> list[dict[str, object]]:
    results = []
    for path in FALSE_LINK_PAGES:
        result = fetch(absolute(base_url, path))
        text = str(result.get("text") or "")
        hits = FALSE_JS_LINK_RE.findall(text)
        results.append({"path": path, "status": result.get("status"), "false_js_links": len(hits), "ok": result.get("status") == 200 and not hits})
    return results


def check_sitemap(base_url: str) -> dict[str, object]:
    result = fetch(absolute(base_url, "/sitemap.xml"), read_limit=800_000)
    text = str(result.get("text") or "")
    missing = [path for path in KEY_SITEMAP_PATHS if absolute(base_url, path) not in text]
    return {"status": result.get("status"), "missing": missing, "ok": result.get("status") == 200 and not missing}


def summarize(report: dict[str, object]) -> dict[str, int]:
    checks = []
    checks.extend(report["legacy_404"])
    checks.extend(report["teaser_pages"])
    checks.append(report["scanner_hub"])
    checks.append(report["download_page"])
    checks.append(report["release_manifest"])
    checks.append(report["llms_txt"])
    checks.extend(report["field_claims"])
    checks.extend(report["screenshots"])
    checks.extend(report["false_js_links"])
    checks.append(report["sitemap"])
    total = len(checks)
    passed = sum(1 for item in checks if item.get("ok"))
    return {"total": total, "passed": passed, "failed": total - passed}


def write_markdown(report: dict[str, object], path: Path) -> None:
    summary = report["summary"]
    lines = [
        "# Monitoring Local Cockpit SEO/GSC",
        "",
        f"- Généré: `{report['generated_at']}`",
        f"- Base URL: `{report['base_url']}`",
        f"- Résultat: {summary['passed']}/{summary['total']} checks OK",
        "",
        "## Anciennes 404 GSC",
        "",
    ]
    for item in report["legacy_404"]:
        lines.append(f"- `{item['path']}` -> {item['status']} `{item['final_url']}` {'OK' if item['ok'] else 'FAIL'}")
    lines += ["", "## Pages teaser", ""]
    for item in report["teaser_pages"]:
        lines.append(
            f"- `{item['path']}` status={item['status']} teaser={item['teaser_ok']} scanner={item['scanner_link_ok']} meta={item['meta_signal_ok']} proof={item['proof_signal_ok']} title_ctr={item['title_ctr_ok']} desc_ctr={item['desc_ctr_ok']} canonical={item['canonical_ok']} og_url={item['og_url_ok']}"
        )
        if item.get("title"):
            lines.append(f"  - title: `{item['title']}`")
    lines += ["", "## Téléchargement et screenshots", ""]
    hub = report["scanner_hub"]
    lines.append(
        f"- `/scanner-ia-local` status={hub['status']} canonical={hub['canonical_ok']} download={hub['download_link_ok']} proof_engine={hub['proof_engine_ok']} objective_arena={hub['objective_arena_ok']} recommendation_engine={hub['recommendation_engine_ok']} flight_recorder={hub['flight_recorder_ok']} digital_twin={hub['digital_twin_ok']} hardware_truth={hub['hardware_truth_ok']} runtime_driver={hub['runtime_driver_ok']} faq_visible={hub['faq_visible_ok']} doctor_passport={hub['doctor_passport_ok']} terrain_caveat={hub['terrain_caveat_ok']}"
    )
    dp = report["download_page"]
    lines.append(
        f"- `/telecharger-scanner-ia-local` status={dp['status']} title={dp['title_signal_ok']} screenshots={dp['screenshot_refs_ok']} static_links={dp['static_links_ok']} proof_engine={dp['proof_engine_ok']} objective_arena={dp['objective_arena_ok']} recommendation_engine={dp['recommendation_engine_ok']} flight_recorder={dp['flight_recorder_ok']} digital_twin={dp['digital_twin_ok']} hardware_truth={dp['hardware_truth_ok']} runtime_driver={dp['runtime_driver_ok']} faq_visible={dp['faq_visible_ok']} doctor_passport={dp['doctor_passport_ok']} terrain_caveat={dp['terrain_caveat_ok']}"
    )
    manifest = report["release_manifest"]
    lines.append(
        f"- `release.json` status={manifest['status']} build={manifest['build_id']} files={manifest['file_count']} platforms={manifest['platforms']} digital_twin_feature={manifest['digital_twin_feature_ok']} digital_twin_note={manifest['digital_twin_note_ok']} hardware_truth_feature={manifest['hardware_truth_feature_ok']} hardware_truth_note={manifest['hardware_truth_note_ok']} runtime_driver_feature={manifest['runtime_driver_feature_ok']} runtime_driver_note={manifest['runtime_driver_note_ok']} provenance_match={manifest['build_id_matches']} merged={manifest['merged_release_ok']}"
    )
    llms = report["llms_txt"]
    lines.append(
        f"- `/llms.txt` status={llms['status']} hub={llms['hub_ok']} download={llms['download_ok']} proof_engine={llms['proof_engine_ok']} objective_arena={llms['objective_arena_ok']} recommendation_engine={llms['recommendation_engine_ok']} flight_recorder={llms['flight_recorder_ok']} digital_twin={llms['digital_twin_ok']} hardware_truth={llms['hardware_truth_ok']} runtime_driver={llms['runtime_driver_ok']} doctor_passport={llms['doctor_passport_ok']} terrain_caveat={llms['terrain_caveat_ok']}"
    )
    lines += ["", "## Promesses terrain", ""]
    for item in report["field_claims"]:
        lines.append(
            f"- `{item['path']}` status={item['status']} 5_machines={item['mentions_five_machines']} claims_validated={item['claims_validated']} caveat={item['caveat_ok']}"
        )
    for item in report["screenshots"]:
        lines.append(f"- `{item['path']}` status={item['status']} type={item['content_type']} bytes_read={item['bytes_read']} dimensions={item['width']}x{item['height']}")
    lines += ["", "## Faux liens JS connus", ""]
    for item in report["false_js_links"]:
        lines.append(f"- `{item['path']}` status={item['status']} false_js_links={item['false_js_links']}")
    lines += ["", "## Sitemap", ""]
    sitemap = report["sitemap"]
    lines.append(f"- status={sitemap['status']} missing={sitemap['missing']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://outilsia.fr")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"))
    args = parser.parse_args(argv)

    report: dict[str, object] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": args.base_url.rstrip("/"),
        "legacy_404": check_legacy_404(args.base_url),
        "teaser_pages": check_teasers(args.base_url),
        "scanner_hub": check_scanner_hub(args.base_url),
        "download_page": check_download_page(args.base_url),
        "release_manifest": check_release_manifest(args.base_url),
        "llms_txt": check_llms_txt(args.base_url),
        "field_claims": check_field_claims(args.base_url),
        "screenshots": check_screenshots(args.base_url),
        "false_js_links": check_false_js_links(args.base_url),
        "sitemap": check_sitemap(args.base_url),
    }
    report["summary"] = summarize(report)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = args.out_dir / f"local_cockpit_seo_monitor_{stamp}.json"
    md_path = args.out_dir / f"local_cockpit_seo_monitor_{stamp}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(report, md_path)
    summary = report["summary"]
    print(f"local_cockpit_seo_monitor_ok passed={summary['passed']} failed={summary['failed']} json={json_path} md={md_path}")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
