#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
binary="$project_dir/tauri/src-tauri/target/release/archjet"
[[ -x "$binary" ]] || { echo 'Build first: cd tauri && npm ci && npm run tauri -- build --no-bundle' >&2; exit 1; }
stage_dir="$(mktemp -d -t archjet-local-XXXXXXXX)"
trap 'rm -rf "$stage_dir"' EXIT
cp "$binary" "$stage_dir/archjet-linux-x86_64"
cp "$project_dir/tauri/src-tauri/icons/icon.png" "$stage_dir/icon.png"
cp "$project_dir/scripts/install-release.sh" "$stage_dir/install-release.sh"
(cd "$stage_dir" && sha256sum archjet-linux-x86_64 > archjet-linux-x86_64.sha256)
bash "$stage_dir/install-release.sh"
