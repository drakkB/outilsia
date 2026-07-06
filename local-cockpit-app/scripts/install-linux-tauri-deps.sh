#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Unsupported package manager. Install the Tauri Linux dependencies manually for your distribution."
  echo "Required on Debian/Ubuntu: pkg-config libdbus-1-dev libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev"
  exit 1
fi

packages=(
  pkg-config
  libdbus-1-dev
  libglib2.0-dev
  libgtk-3-dev
  libwebkit2gtk-4.1-dev
  libayatana-appindicator3-dev
  librsvg2-dev
)

echo "Installing Linux Tauri dependencies:"
printf ' - %s\n' "${packages[@]}"

sudo apt-get update
sudo apt-get install -y "${packages[@]}"

echo "linux_tauri_deps_ok"
