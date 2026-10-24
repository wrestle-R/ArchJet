#!/usr/bin/env bash
set -euo pipefail
export NO_AT_BRIDGE=0 GTK_MODULES=atk-bridge LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
export XDG_RUNTIME_DIR="$(mktemp -d)"
chmod 700 "$XDG_RUNTIME_DIR"
cleanup() { kill "${app_pid:-}" "${desktop_pid:-}" 2>/dev/null || true; rm -rf "$XDG_RUNTIME_DIR"; }
trap cleanup EXIT
if [[ "$1" == gnome ]]; then
  export XDG_CURRENT_DESKTOP=GNOME XDG_SESSION_TYPE=wayland
  gnome-shell --nested --wayland > desktop.log 2>&1 & desktop_pid=$!
  for attempt in {1..60}; do
    socket=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -type s -name 'wayland-*' -print -quit)
    [[ -n "$socket" ]] && break
    kill -0 "$desktop_pid"
    sleep 1
  done
  [[ -n "${socket:-}" ]]
  export WAYLAND_DISPLAY="$(basename "$socket")" GDK_BACKEND=wayland
else
  export XDG_CURRENT_DESKTOP=XFCE XDG_SESSION_TYPE=x11 GDK_BACKEND=x11
  startxfce4 > desktop.log 2>&1 & desktop_pid=$!
  sleep 8
fi
./tauri/src-tauri/target/release/archjet > app.log 2>&1 & app_pid=$!
python3 scripts/native-smoke.py
kill -0 "$app_pid"
if [[ "$1" == xfce ]]; then
  wmctrl -l | tee windows.log
  wmctrl -l | grep -q 'ArchJet'
fi
# Screenshot records the complete desktop under test, without private documents.
import -window root desktop.png
