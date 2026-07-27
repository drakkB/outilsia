#!/usr/bin/env python3
"""Track OutilsIA Google visibility recovery and send a daily private report."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import smtplib
import ssl
from datetime import date, datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import urlopen

DEFAULT_ENV_FILES = (
    Path("/etc/scorezenith/master.env"),
    Path("/var/www/outilsia/.env"),
)
DEFAULT_OUTPUT_DIR = Path("/var/lib/outilsia/seo-recovery")
DEFAULT_GSC_KEY = Path("/etc/scorezenith/gsc-service-account.json")
GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
GSC_API = "https://www.googleapis.com/webmasters/v3"
BING_API = "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats"


def load_env(paths: tuple[Path, ...] = DEFAULT_ENV_FILES) -> None:
    for path in paths:
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(
                key.strip(),
                value.strip().strip('"').strip("'"),
            )


def parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def daily_average(totals: dict[str, float], days: int) -> dict[str, float]:
    days = max(1, days)
    return {
        "clicks": float(totals.get("clicks", 0)) / days,
        "impressions": float(totals.get("impressions", 0)) / days,
        "position": float(totals.get("position", 0)),
        "ctr": float(totals.get("ctr", 0)),
    }


def recovery_percent(current: float, trough: float, baseline: float) -> float:
    span = baseline - trough
    if span <= 0:
        raise ValueError("baseline must be greater than trough")
    return round(((current - trough) / span) * 100.0, 1)


def recovery_status(percent: float) -> tuple[str, str]:
    if percent < -10:
        return "aggravation", "#dc2626"
    if percent < 10:
        return "point bas", "#b91c1c"
    if percent < 50:
        return "reprise fragile", "#d97706"
    if percent < 90:
        return "reprise nette", "#2563eb"
    return "niveau retrouve", "#059669"


class GscClient:
    def __init__(self, key_file: Path, site_url: str):
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        credentials = service_account.Credentials.from_service_account_file(
            str(key_file),
            scopes=[GSC_SCOPE],
        )
        self.session = AuthorizedSession(credentials)
        self.site_url = site_url

    def query(
        self,
        start: date,
        end: date,
        *,
        dimensions: list[str] | None = None,
        row_limit: int = 25000,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "type": "web",
            "dataState": "final",
            "rowLimit": row_limit,
        }
        if dimensions:
            body["dimensions"] = dimensions
        endpoint = (
            f"{GSC_API}/sites/{quote(self.site_url, safe='')}"
            "/searchAnalytics/query"
        )
        response = self.session.post(endpoint, json=body, timeout=45)
        response.raise_for_status()
        return response.json()

    def totals(self, start: date, end: date) -> dict[str, float]:
        rows = self.query(start, end).get("rows") or []
        if not rows:
            return {
                "clicks": 0.0,
                "impressions": 0.0,
                "ctr": 0.0,
                "position": 0.0,
            }
        row = rows[0]
        return {
            "clicks": float(row.get("clicks", 0)),
            "impressions": float(row.get("impressions", 0)),
            "ctr": float(row.get("ctr", 0)),
            "position": float(row.get("position", 0)),
        }

    def latest_final_date(self, today: date) -> date:
        start = today - timedelta(days=14)
        end = today - timedelta(days=1)
        rows = self.query(start, end, dimensions=["date"]).get("rows") or []
        dates = [
            parse_iso_date(str(row["keys"][0]))
            for row in rows
            if row.get("keys")
        ]
        if not dates:
            raise RuntimeError("GSC returned no final daily row in the last 14 days")
        return max(dates)

    def pages(self, start: date, end: date) -> dict[str, dict[str, float]]:
        rows = self.query(start, end, dimensions=["page"]).get("rows") or []
        return {
            str(row["keys"][0]): {
                "clicks": float(row.get("clicks", 0)),
                "impressions": float(row.get("impressions", 0)),
            }
            for row in rows
            if row.get("keys")
        }


def parse_bing_date(value: str) -> date | None:
    match = re.search(r"/Date\((\d+)", value or "")
    if not match:
        return None
    timestamp = int(match.group(1)) / 1000
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).date()


def fetch_bing_daily(site_url: str, api_key: str) -> dict[date, dict[str, float]]:
    query = urlencode({"siteUrl": site_url, "apikey": api_key})
    with urlopen(f"{BING_API}?{query}", timeout=45) as response:
        payload = json.load(response)
    result: dict[date, dict[str, float]] = {}
    for row in payload.get("d") or []:
        day = parse_bing_date(str(row.get("Date") or ""))
        if day is None:
            continue
        result[day] = {
            "clicks": float(row.get("Clicks") or 0),
            "impressions": float(row.get("Impressions") or 0),
        }
    return result


def aggregate_daily(
    values: dict[date, dict[str, float]],
    start: date,
    end: date,
) -> dict[str, float]:
    return {
        metric: sum(values.get(day, {}).get(metric, 0) for day in date_range(start, end))
        for metric in ("clicks", "impressions")
    }


def top_page_losses(
    baseline: dict[str, dict[str, float]],
    current: dict[str, dict[str, float]],
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    rows = []
    for page in set(baseline) | set(current):
        before = baseline.get(page, {}).get("impressions", 0)
        now = current.get(page, {}).get("impressions", 0)
        loss = before - now
        if loss <= 0:
            continue
        rows.append(
            {
                "page": page,
                "baseline_impressions": round(before, 1),
                "current_impressions": round(now, 1),
                "loss": round(loss, 1),
            }
        )
    return sorted(rows, key=lambda row: row["loss"], reverse=True)[:limit]


def build_report(
    *,
    generated_at: datetime,
    latest_final_date: date,
    baseline_window: tuple[date, date],
    trough_window: tuple[date, date],
    current_window: tuple[date, date],
    baseline_totals: dict[str, float],
    trough_totals: dict[str, float],
    current_totals: dict[str, float],
    bing: dict[str, Any] | None,
    page_losses: list[dict[str, Any]],
) -> dict[str, Any]:
    def days(window: tuple[date, date]) -> int:
        return (window[1] - window[0]).days + 1

    baseline_daily = daily_average(baseline_totals, days(baseline_window))
    trough_daily = daily_average(trough_totals, days(trough_window))
    current_daily = daily_average(current_totals, days(current_window))
    impressions_recovery = recovery_percent(
        current_daily["impressions"],
        trough_daily["impressions"],
        baseline_daily["impressions"],
    )
    clicks_recovery = recovery_percent(
        current_daily["clicks"],
        trough_daily["clicks"],
        baseline_daily["clicks"],
    )
    status, color = recovery_status(impressions_recovery)

    return {
        "schema_version": "outilsia.seo-recovery.v1",
        "generated_at": generated_at.isoformat(),
        "latest_final_gsc_date": latest_final_date.isoformat(),
        "gsc_lag_days": (generated_at.date() - latest_final_date).days,
        "headline": {
            "visibility_recovered_pct": impressions_recovery,
            "clicks_recovered_pct": clicks_recovery,
            "status": status,
            "color": color,
        },
        "method": {
            "primary_metric": "GSC impressions per day",
            "formula": "(current_daily - trough_daily) / (baseline_daily - trough_daily) * 100",
            "baseline_window": [item.isoformat() for item in baseline_window],
            "trough_window": [item.isoformat() for item in trough_window],
            "current_window": [item.isoformat() for item in current_window],
            "note": "Negative means worse than the trough; 100 means the pre-drop baseline is restored.",
        },
        "google": {
            "baseline_total": baseline_totals,
            "baseline_daily": baseline_daily,
            "trough_total": trough_totals,
            "trough_daily": trough_daily,
            "current_total": current_totals,
            "current_daily": current_daily,
            "top_page_losses": page_losses,
        },
        "bing_control": bing,
        "intervention": {
            "deployed_at": "2026-07-27T00:02:00+00:00",
            "summary": "Article schema normalized and sitemap lastmod made semantic.",
            "expectation": "GSC changes are delayed; no same-day recovery should be inferred.",
        },
    }


def render_text(report: dict[str, Any]) -> str:
    headline = report["headline"]
    google = report["google"]
    method = report["method"]
    lines = [
        "OutilsIA - reprise de visibilite Google",
        "",
        f"Visibilite recuperee : {headline['visibility_recovered_pct']:.1f} %",
        f"Statut : {headline['status']}",
        f"Clics recuperes : {headline['clicks_recovered_pct']:.1f} %",
        f"Derniere date GSC finale : {report['latest_final_gsc_date']} "
        f"(retard {report['gsc_lag_days']} j)",
        "",
        "Impressions/jour :",
        f"- avant chute : {google['baseline_daily']['impressions']:.1f}",
        f"- point bas : {google['trough_daily']['impressions']:.1f}",
        f"- fenetre actuelle : {google['current_daily']['impressions']:.1f}",
        "",
        "Clics/jour :",
        f"- avant chute : {google['baseline_daily']['clicks']:.1f}",
        f"- point bas : {google['trough_daily']['clicks']:.1f}",
        f"- fenetre actuelle : {google['current_daily']['clicks']:.1f}",
        "",
        f"Fenetre actuelle : {method['current_window'][0]} au {method['current_window'][1]}",
        "Attention : les donnees GSC arrivent avec retard. Le correctif du 27 juillet "
        "ne peut pas produire un signal fiable le jour meme.",
    ]
    bing = report.get("bing_control")
    if bing:
        lines.extend(
            [
                "",
                "Controle Bing :",
                f"- impressions/jour actuelles : {bing['current_daily']['impressions']:.1f}",
                f"- variation vs avant chute Google : {bing['impressions_change_pct']:.1f} %",
            ]
        )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    headline = report["headline"]
    google = report["google"]
    method = report["method"]
    color = headline["color"]
    losses = "".join(
        "<tr>"
        f"<td>{html.escape(row['page'].replace('https://outilsia.fr', '') or '/')}</td>"
        f"<td>{row['baseline_impressions']:.0f}</td>"
        f"<td>{row['current_impressions']:.0f}</td>"
        "</tr>"
        for row in google["top_page_losses"]
    ) or "<tr><td colspan='3'>Aucune perte de page detectee.</td></tr>"
    bing = report.get("bing_control")
    bing_html = ""
    if bing:
        bing_html = (
            "<div class='panel'><h2>Controle Bing</h2>"
            f"<p><strong>{bing['current_daily']['impressions']:.1f}</strong> impressions/jour, "
            f"variation <strong>{bing['impressions_change_pct']:+.1f} %</strong> par rapport "
            "a la fenetre avant la chute Google.</p></div>"
        )
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Reprise Google OutilsIA</title>
<style>
body{{margin:0;background:#0b1220;color:#e5e7eb;font:15px Arial,sans-serif}}
.wrap{{max-width:760px;margin:auto;padding:28px}} .hero{{border-top:5px solid {color};background:#111827;padding:24px;border-radius:6px}}
.score{{font-size:52px;font-weight:800;color:{color}}} h1{{font-size:24px;margin:0 0 8px}} h2{{font-size:17px}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}} .metric,.panel{{background:#111827;padding:16px;border-radius:6px}}
.metric b{{display:block;font-size:23px;margin-top:6px}} table{{width:100%;border-collapse:collapse}} td,th{{padding:8px;border-bottom:1px solid #334155;text-align:left}}
.muted{{color:#94a3b8;font-size:13px}} @media(max-width:600px){{.grid{{grid-template-columns:1fr}}}}
</style></head><body><main class="wrap">
<section class="hero"><h1>Reprise de visibilite Google</h1>
<div class="score">{headline['visibility_recovered_pct']:.1f} %</div>
<p><strong>{html.escape(headline['status'])}</strong> · clics recuperes {headline['clicks_recovered_pct']:.1f} %</p>
<p class="muted">Derniere date GSC finale : {report['latest_final_gsc_date']} · retard {report['gsc_lag_days']} j</p></section>
<section class="grid">
<div class="metric">Avant chute<b>{google['baseline_daily']['impressions']:.1f}</b><span>impressions/jour</span></div>
<div class="metric">Point bas<b>{google['trough_daily']['impressions']:.1f}</b><span>impressions/jour</span></div>
<div class="metric">Actuel<b>{google['current_daily']['impressions']:.1f}</b><span>impressions/jour</span></div>
</section>
{bing_html}
<section class="panel"><h2>Pages encore les plus touchees</h2><table><thead><tr><th>Page</th><th>Avant</th><th>Actuel</th></tr></thead><tbody>{losses}</tbody></table></section>
<section class="panel"><h2>Lecture correcte</h2>
<p>0 % correspond au point bas des 20-24 juillet. 100 % signifie que le niveau des 15-19 juillet est retrouve. Une valeur negative signale une aggravation.</p>
<p class="muted">Fenetre actuelle : {method['current_window'][0]} au {method['current_window'][1]}. Le correctif schema/sitemap a ete deploye le 27 juillet ; les donnees GSC sont retardees.</p></section>
</main></body></html>"""


def persist_report(report: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(output_dir, 0o700)
    latest_json = output_dir / "latest.json"
    latest_html = output_dir / "latest.html"
    history = output_dir / "history.jsonl"
    latest_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    latest_html.write_text(render_html(report), encoding="utf-8")
    with history.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(report, ensure_ascii=False, separators=(",", ":")) + "\n")
    for path in (latest_json, latest_html, history):
        os.chmod(path, 0o600)


def send_email(report: dict[str, Any], recipient: str | None = None) -> str:
    smtp_host = os.getenv("SMTP_HOST", "smtp.hostinger.com")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER", os.getenv("SMTP_EMAIL", ""))
    smtp_password = os.getenv("SMTP_PASS", os.getenv("SMTP_PASSWORD", ""))
    recipient = (
        recipient
        or os.getenv("SEO_RECOVERY_EMAIL_TO")
        or os.getenv("AFFILIATE_REPORT_EMAIL")
        or os.getenv("AFFILIATE_ALERT_EMAIL")
        or os.getenv("MAIL_LEAD_ALERT_TO")
        or smtp_user
    )
    if not all((smtp_host, smtp_user, smtp_password, recipient)):
        raise RuntimeError("SMTP or SEO recovery recipient is not configured")
    percent = report["headline"]["visibility_recovered_pct"]
    subject = f"[OutilsIA SEO] {percent:.1f}% recupere - {report['headline']['status']}"
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"OutilsIA SEO <{smtp_user}>"
    message["To"] = recipient
    message.attach(MIMEText(render_text(report), "plain", "utf-8"))
    message.attach(MIMEText(render_html(report), "html", "utf-8"))
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(
        smtp_host,
        smtp_port,
        context=context,
        timeout=30,
    ) as server:
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [recipient], message.as_string())
    return recipient


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-email", action="store_true")
    parser.add_argument("--email-to")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--site-property", default="sc-domain:outilsia.fr")
    parser.add_argument("--site-url", default="https://outilsia.fr/")
    parser.add_argument("--gsc-key", type=Path, default=DEFAULT_GSC_KEY)
    parser.add_argument("--baseline-start", default="2026-07-15")
    parser.add_argument("--baseline-end", default="2026-07-19")
    parser.add_argument("--trough-start", default="2026-07-20")
    parser.add_argument("--trough-end", default="2026-07-24")
    parser.add_argument("--window-days", type=int, default=5)
    args = parser.parse_args()
    load_env()

    generated_at = datetime.now(timezone.utc)
    baseline = (parse_iso_date(args.baseline_start), parse_iso_date(args.baseline_end))
    trough = (parse_iso_date(args.trough_start), parse_iso_date(args.trough_end))
    gsc = GscClient(args.gsc_key, args.site_property)
    latest = gsc.latest_final_date(generated_at.date())
    current = (latest - timedelta(days=args.window_days - 1), latest)

    baseline_totals = gsc.totals(*baseline)
    trough_totals = gsc.totals(*trough)
    current_totals = gsc.totals(*current)
    baseline_pages = gsc.pages(*baseline)
    current_pages = gsc.pages(*current)

    bing_report = None
    bing_key = os.getenv("BING_WEBMASTER_API_KEY", "")
    if bing_key:
        bing_daily = fetch_bing_daily(args.site_url, bing_key)
        bing_baseline = aggregate_daily(bing_daily, *baseline)
        bing_current = aggregate_daily(bing_daily, *current)
        baseline_days = (baseline[1] - baseline[0]).days + 1
        current_days = (current[1] - current[0]).days + 1
        baseline_average = daily_average(bing_baseline, baseline_days)
        current_average = daily_average(bing_current, current_days)
        change = (
            ((current_average["impressions"] / baseline_average["impressions"]) - 1) * 100
            if baseline_average["impressions"]
            else 0.0
        )
        bing_report = {
            "baseline_total": bing_baseline,
            "baseline_daily": baseline_average,
            "current_total": bing_current,
            "current_daily": current_average,
            "impressions_change_pct": round(change, 1),
        }

    report = build_report(
        generated_at=generated_at,
        latest_final_date=latest,
        baseline_window=baseline,
        trough_window=trough,
        current_window=current,
        baseline_totals=baseline_totals,
        trough_totals=trough_totals,
        current_totals=current_totals,
        bing=bing_report,
        page_losses=top_page_losses(baseline_pages, current_pages),
    )

    if args.dry_run:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print("\n" + render_text(report))
        return 0

    persist_report(report, args.output_dir)
    if not args.no_email:
        recipient = send_email(report, args.email_to)
        print(
            f"sent_to={recipient} recovered="
            f"{report['headline']['visibility_recovered_pct']:.1f}%"
        )
    else:
        print(
            f"saved={args.output_dir} recovered="
            f"{report['headline']['visibility_recovered_pct']:.1f}%"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
