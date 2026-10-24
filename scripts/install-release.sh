#!/usr/bin/env bash
set -euo pipefail
asset_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'ArchJet requires Linux x86_64.' >&2; exit 1; }
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/archjet"
launcher_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
python3 - "$asset_dir" "$install_dir" <<'PY'
import hashlib, os, platform, sys
from pathlib import Path
assets, dest = map(Path, sys.argv[1:])
libc, version = platform.libc_ver()
if libc != 'glibc' or tuple(map(int, version.split('.')[:2])) < (2, 39):
    raise SystemExit('ArchJet requires glibc 2.39 or newer (Arch Linux or Ubuntu 24.04+).')
binary = assets / 'archjet-linux-x86_64'
expected = (assets / 'archjet-linux-x86_64.sha256').read_text().split()[0]
if hashlib.sha256(binary.read_bytes()).hexdigest() != expected:
    raise SystemExit('Checksum mismatch. Nothing was installed.')
header = binary.read_bytes()[:20]
if header[:5] != b'\x7fELF\x02' or header[18:20] != b'\x3e\x00':
    raise SystemExit('Release is not a Linux x86_64 executable.')
for process in Path('/proc').glob('[0-9]*/exe'):
    try:
        path = os.readlink(process).removesuffix(' (deleted)')
        if path in (str(dest / 'archjet'), str(dest.parent / 'print-arch' / 'print-arch')):
            raise SystemExit('Fully quit ArchJet / Print Arch before installing. Your session was left untouched.')
    except OSError:
        pass
PY
mkdir -p "$install_dir" "$launcher_dir"
staged="$(mktemp "$install_dir/.install-XXXXXXXX")"
trap 'rm -f "$staged"' EXIT
install -m755 "$asset_dir/archjet-linux-x86_64" "$staged"
install -m644 "$asset_dir/icon.png" "$install_dir/icon.png"
mv -f "$staged" "$install_dir/archjet"
python3 - "$install_dir" "$launcher_dir" <<'PY'
from pathlib import Path
import sys
root, launchers = sys.argv[1:]
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'
folder = Path(launchers)
(folder / 'archjet.desktop').write_text('[Desktop Entry]\nType=Application\nName=ArchJet\nComment=Local printer workspace for Linux\nExec=' + quote(root + '/archjet') + '\nIcon=' + root + '/icon.png\nTerminal=false\nCategories=Utility;Office;\nStartupNotify=true\nStartupWMClass=Archjet\n')
legacy = folder / 'print-arch.desktop'
if legacy.exists() and '/print-arch/print-arch' in legacy.read_text():
    legacy.rename(folder / 'print-arch.desktop.pre-archjet')
PY
if command -v update-desktop-database >/dev/null; then update-desktop-database "$launcher_dir"; fi
printf 'Installed: %s/archjet\nRuntime: GTK 3, WebKitGTK 4.1, AppIndicator, Python 3, CUPS and Poppler.\n' "$install_dir"
