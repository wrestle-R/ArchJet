# Print Arch

A local printer workspace for Linux. Choose documents, arrange the exact pages, preview them, and print through CUPS.

Built for Arch Linux and Hyprland. Works with printers supported by your local CUPS setup, with a dedicated compatibility profile for the HP LaserJet P1007.

![Print Arch workspace, with sample documents](docs/workspace-preview.png)

## Workspace

Add PDFs, Office documents or images using the native file picker, a folder picker, or drag and drop. Reorder files, choose odd/even pages, or enter an exact sequence like `1,5,2-4,1`. Pages and copies stay specific to each document. Paper, orientation, scaling, colour and sides follow the selected printer’s capabilities, with optional per-file overrides.

Everything stays on your device. No accounts, uploads or cloud services.

## Install

This is a source-build preview, currently Linux only. Use a current Rust toolchain and Node.js 22 or newer.

### Arch Linux

```sh
sudo pacman -S --needed base-devel rust nodejs npm webkit2gtk-4.1 gtk3 librsvg python cups poppler
sudo systemctl enable --now cups.service

git clone https://github.com/wrestle-R/Print-Arch.git
cd Print-Arch
npm ci
npm run tauri -- build --no-bundle
bash scripts/install-local.sh
```

Open **Print Arch** from your desktop launcher. Installation is per-user, under `~/.local/share/print-arch` (or `$XDG_DATA_HOME`), with no sudo needed for the app itself. A private GitHub repository requires authentication to clone.

Office documents need `libreoffice-fresh`; images need `imagemagick`. Install those formats’ converters if you use them:

```sh
sudo pacman -S --needed libreoffice-fresh imagemagick
```

On Hyprland, configure your desktop portal with a file chooser backend such as GTK or KDE. The app uses the native portal picker. **Printers → Add printer** opens local CUPS setup. Driverless printers use their standard CUPS queue; other models need the appropriate Linux driver. The setup screen checks installed tools and shows Arch commands, including an installed AUR helper where appropriate. It never runs package installation for you.

## Update

Close Print Arch first, then run this from your checkout:

```sh
git pull --ff-only
npm ci
npm run tauri -- build --no-bundle
bash scripts/install-local.sh
```

The same installer replaces the local app and desktop launcher.

## When paper runs out

Add paper and check for a jam or open cover. The printer may continue the existing job automatically. If it stays held or the queue is paused, open **Queue → Paper added / resume**, check the physical output, and confirm **Resume existing job**.

Resume keeps the same CUPS job ID and does not create a new request. A driver can still restart an interrupted job from the beginning, so if some pages already printed, inspect them first. Cancel an already-printed job and select only missing pages when necessary. Unknown outcomes are never automatically reprinted.

## Closing the app

Choose **Finish printing, then exit** or **Cancel all printing and exit**. Cleanup affects **all pending jobs on the local CUPS server**, including jobs from other apps. Documents, drafts, app history and preferences are cleared on exit.

A separate watchdog attempts cleanup after a force quit. A recovery marker lets the next launch retry if the watchdog or machine also stopped. CUPS permissions can prevent cancelling another user’s jobs; the app reports that failure. Printer-buffered pages, CUPS system history and operating-system logs are outside app-history cleanup.

## Development and testing

```sh
npm ci
npm run desktop
```

For a browser-only design preview, run `npm run dev` and open `http://127.0.0.1:1420/?demo`. Sample data is explicitly labelled; real printing requires the desktop app.

```sh
npm run check
npx playwright install chromium
npx playwright test
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

[Verification results and hardware limits](docs/verification.md) · [Architecture, dependencies and detailed setup](docs/development.md)

Print Arch uses React, TypeScript, Tauri and a local Python/CUPS adapter. The desktop install/update workflow takes inspiration from [multi-codex](https://github.com/wrestle-R/multi-codex). Broad CUPS support is the goal; every printer model is not claimed tested.
