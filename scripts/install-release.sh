#!/usr/bin/env bash
set -euo pipefail
asset_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$asset_dir"
if [[ "$(uname -m)" != x86_64 ]]; then echo 'This build requires Linux x86_64.' >&2; exit 1; fi
sha256sum --check print-arch-linux-x86_64.sha256
if pgrep -u "$(id -u)" -x print-arch >/dev/null; then echo 'Close Print Arch before installing.' >&2; exit 1; fi
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/print-arch"
launcher_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
install -Dm755 print-arch-linux-x86_64 "$install_dir/print-arch"
install -Dm644 icon.png "$install_dir/icon.png"
mkdir -p "$launcher_dir"
python3 - "$install_dir" "$launcher_dir/print-arch.desktop" <<'PY'
from pathlib import Path
import sys
root, target = sys.argv[1:]
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'
Path(target).write_text('[Desktop Entry]\nType=Application\nName=Print Arch\nComment=Local printer workspace\nExec=' + quote(root + '/print-arch') + '\nIcon=' + root + '/icon.png\nTerminal=false\nCategories=Utility;Office;\nStartupNotify=true\nStartupWMClass=Print-arch\n')
PY
if command -v update-desktop-database >/dev/null; then update-desktop-database "$launcher_dir"; fi
printf 'Installed Print Arch: %s\n' "$install_dir/print-arch"
