# Security Policy

## Scope

This public repository contains the OutilsIA Local Cockpit desktop client and release tooling.

The desktop client can inspect local hardware and local AI runtimes so users can decide which local models their machine can run. The public client repository is intentionally separate from the private OutilsIA server, database, account system, recommendation backend, business documents, traffic data and affiliate data.

## What the desktop app checks

OutilsIA Local Cockpit may read technical machine information such as:

- operating system;
- CPU, RAM, GPU and VRAM;
- available storage;
- Ollama availability;
- locally installed Ollama model names and sizes;
- optional benchmark results launched by the user.

## What the desktop app should not read

The app must not scan personal documents, browser history, private folders, passwords, API keys, wallet files or unrelated user content.

If you find code that appears to read personal files without a clear user action, treat it as a security issue.

## Reporting a vulnerability

Please do not open a public issue for sensitive vulnerabilities.

Report security issues through the contact channel published on https://outilsia.fr or by contacting the project maintainer directly from the GitHub profile.

When reporting, include:

- affected file or feature;
- operating system;
- reproduction steps;
- expected behavior;
- observed behavior;
- whether personal data or credentials may be exposed.

## Release integrity

Public builds are published with SHA256 hashes in `release.json` and on the download page:

https://outilsia.fr/telecharger-scanner-ia-local

Users should compare the downloaded file hash with the published SHA256 before running a beta build.

## Product boundary

OutilsIA Local Cockpit prepares and benchmarks local AI models.

Strategy Arena remains the separate product for strategy generation, CUDA backtests, robustness checks and TradingView/Pine export. OutilsIA must not run financial backtests or generate trading strategies inside this client.
