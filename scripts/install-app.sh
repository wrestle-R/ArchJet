#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'ArchJet requires Linux x86_64.' >&2; exit 1; }
for tool in curl python3 sha256sum install; do command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }; done
repo='wrestle-R/ArchJet'
tag="${ARCHJET_TAG:-}"
if [[ -z "$tag" ]]; then
  tag="$(curl -fsSL --retry 3 "https://api.github.com/repos/$repo/releases/latest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
fi
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'ARCHJET_TAG must be a stable version such as v0.3.0.' >&2; exit 1; }
asset_dir="$(mktemp -d -t archjet-install-XXXXXXXX)"
trap 'rm -rf "$asset_dir"' EXIT
for asset in archjet-linux-x86_64 archjet-linux-x86_64.sha256 icon.png install-release.sh; do
  curl -fsSL --retry 3 "https://github.com/$repo/releases/download/$tag/$asset" -o "$asset_dir/$asset"
done
bash "$asset_dir/install-release.sh"
printf 'ArchJet %s is ready. Open ArchJet from your app launcher.\n' "$tag"
