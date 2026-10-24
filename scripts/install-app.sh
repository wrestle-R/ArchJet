#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'ArchJet requires Linux x86_64.' >&2; exit 1; }
for tool in curl python3 sha256sum install gzip; do command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }; done
repo='wrestle-R/ArchJet'
tag="${ARCHJET_TAG:-}"
if [[ -z "$tag" ]]; then
  tag="$(curl -fsSL --http1.1 --retry 3 --retry-all-errors --connect-timeout 15 --max-time 60 "https://api.github.com/repos/$repo/releases/latest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
fi
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'ARCHJET_TAG must be a stable version such as v0.3.0.' >&2; exit 1; }
asset_dir="$(mktemp -d -t archjet-install-XXXXXXXX)"
trap 'rm -rf "$asset_dir"' EXIT
download_asset() {
  local asset="$1"
  for attempt in {1..6}; do
    if curl -fsSL --http1.1 --connect-timeout 15 --max-time 300 \
      --speed-limit 1024 --speed-time 30 --continue-at - \
      "https://github.com/$repo/releases/download/$tag/$asset" -o "$asset_dir/$asset"; then
      return 0
    fi
    if [[ "$attempt" -lt 6 ]]; then
      printf 'Download interrupted; resuming %s (attempt %s/6).\n' "$asset" "$((attempt + 1))" >&2
      sleep 2
    fi
  done
  echo "Could not download $asset. Nothing was installed." >&2
  return 1
}
printf 'Downloading ArchJet %s…\n' "$tag"
for asset in archjet-linux-x86_64.gz archjet-linux-x86_64.sha256 icon.png install-release.sh; do
  download_asset "$asset"
done
gzip -dc "$asset_dir/archjet-linux-x86_64.gz" > "$asset_dir/archjet-linux-x86_64"
bash "$asset_dir/install-release.sh"
printf 'ArchJet %s is ready. Open ArchJet from your app launcher.\n' "$tag"
