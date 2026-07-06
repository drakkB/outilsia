#!/usr/bin/env bash
set -euo pipefail

missing=0

check() {
  local bin="$1"
  local hint="$2"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "missing: $bin ($hint)"
    missing=1
  else
    echo "ok: $bin"
  fi
}

check node "installer Node.js"
check npm "installer npm"
if command -v cargo >/dev/null 2>&1; then
  echo "ok: cargo"
elif [ -x "$HOME/.cargo/bin/cargo" ]; then
  echo "ok: cargo ($HOME/.cargo/bin/cargo, hors PATH)"
  echo 'hint: export PATH="$HOME/.cargo/bin:$PATH"'
else
  echo "missing: cargo (installer Rust/rustup ou ajouter $HOME/.cargo/bin au PATH)"
  missing=1
fi
check pkg-config "sudo apt install pkg-config"

if ! pkg-config --exists dbus-1 2>/dev/null; then
  echo "missing: dbus-1 headers (sudo apt install libdbus-1-dev)"
  missing=1
else
  echo "ok: dbus-1"
fi

check_pkg() {
  local pkg="$1"
  local hint="$2"
  if ! pkg-config --exists "$pkg" 2>/dev/null; then
    echo "missing: $pkg ($hint)"
    missing=1
  else
    echo "ok: $pkg"
  fi
}

check_pkg glib-2.0 "sudo apt install libglib2.0-dev"
check_pkg gtk+-3.0 "sudo apt install libgtk-3-dev"
if pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
  echo "ok: webkit2gtk-4.1"
elif pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
  echo "ok: webkit2gtk-4.0"
else
  echo "missing: webkit2gtk-4.1 (sudo apt install libwebkit2gtk-4.1-dev)"
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  echo
  echo "Prerequis Linux incomplets."
  echo "Commande Ubuntu/Debian conseillee:"
  echo "bash scripts/install-linux-tauri-deps.sh"
  exit 1
fi

echo "Preflight OK."
