#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_dir/src-tauri/target/release/print-arch"
if [[ ! -x "$binary_path" ]]; then
  printf '%s\n' 'Build first: npm ci && npm run tauri -- build --no-bundle' >&2
  exit 1
fi
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/print-arch"
launcher_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
if pgrep -u "$(id -u)" -x print-arch >/dev/null; then
  printf '%s\n' 'Close Print Arch before installing or updating.' >&2
  exit 1
fi
install -Dm755 "$binary_path" "$install_dir/print-arch"
install -Dm644 "$project_dir/src-tauri/icons/icon.png" "$install_dir/icon.png"
mkdir -p "$launcher_dir"
# Desktop entry Exec fields use double quoting and require escaping reserved characters.
python3 - "$install_dir" "$launcher_dir/print-arch.desktop" <<'PY'
from pathlib import Path
import sys
root, target = sys.argv[1:]
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'
Path(target).write_text('[Desktop Entry]\nType=Application\nName=Print Arch\nComment=Local printer workspace\nExec=' + quote(root + '/print-arch') + '\nIcon=' + root + '/icon.png\nTerminal=false\nCategories=Utility;Office;\nStartupNotify=true\nStartupWMClass=io.github.wrestle-r.print-arch\n')
PY
if command -v update-desktop-database >/dev/null; then update-desktop-database "$launcher_dir"; fi
printf 'Installed Print Arch at %s\nOpen it from your app launcher.\n' "$install_dir"
