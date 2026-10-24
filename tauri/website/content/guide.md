# ArchJet guide

## Workspace

Add PDFs, Office documents or images using the native file picker, a folder picker, or drag and drop. Reorder files, choose odd/even pages, or enter an exact sequence like `1,5,2-4,1`. Pages and copies stay specific to each document. Paper, orientation, scaling, colour and sides follow the selected printer’s capabilities, with optional per-file overrides.

Documents and print processing stay on your device. Startup and manual update checks contact the public GitHub releases API. Documents are never uploaded.

## Install

ArchJet is available for Linux x86_64. Release builds need glibc 2.39 or newer, GTK 3 and WebKitGTK 4.1. Install the runtime dependencies first.

### Arch Linux

```sh
sudo pacman -S --needed webkit2gtk-4.1 gtk3 libappindicator-gtk3 python cups poppler
sudo systemctl enable --now cups.service
```

### Ubuntu 24.04 or newer

```sh
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 python3 cups-client poppler-utils
```

### Download and install

```sh
curl -fsSL https://raw.githubusercontent.com/wrestle-R/ArchJet/main/scripts/install-app.sh -o /tmp/install-archjet.sh
bash /tmp/install-archjet.sh
```

The installer downloads the latest stable release, verifies its SHA-256 checksum and installs it per-user under `~/.local/share/archjet` (or `$XDG_DATA_HOME`). It creates the ArchJet launcher, requires no GitHub login and does not install system packages. Fully quit the app before updating. Set `ARCHJET_TAG=v0.3.0` before `bash` to pin a specific release. Older Print Arch launchers are retired after a successful install; the old binary remains available for rollback.

### Office documents and images

```sh
sudo pacman -S --needed libreoffice-fresh imagemagick
```

On Ubuntu, install `libreoffice` and `imagemagick`. Document appearance depends on the locally installed fonts and converters, so check the preview.

### Printer setup

On Hyprland, configure the XDG desktop portal with a GTK or KDE file chooser backend. The app uses the native picker. **Printers → Add printer** opens local CUPS setup. Driverless printers use their configured CUPS queue; other printers need their Linux driver. Setup checks installed tools and shows Arch commands, including an installed AUR helper where appropriate. It never installs packages for you.

If the same printer appears twice, check CUPS: a direct USB queue and an HPLIP queue can point to the same hardware. ArchJet lists configured queues. It does not delete or merge them by model name.

## Appearance, tray and updates

Use the **Appearance** selector in the top bar to choose Light, Dark or System. Appearance follows your desktop by default and is reset with session cleanup. The document page stays unchanged in dark mode.

The tray menu offers Open, Hide and Quit. Closing the window still opens the cleanup dialog. Hyprland needs a StatusNotifier tray host (for example, the Waybar tray module); GNOME needs an AppIndicator extension for a visible tray icon. The app remains usable without one.

On startup, ArchJet checks stable GitHub Releases in the background and opens an update dialog only when a newer version is available. The dialog shows that release’s notes and offers **Install**. The update button lets you check again manually; an up-to-date result or connection error appears in the top bar without opening a dialog. Downloads are verified against the release SHA-256 checksum and replace only the per-user installation atomically. Pending print jobs block installation. Quit and reopen afterward. System package installations should use their package manager. A network or checksum failure leaves the installed app unchanged. The checksum detects corruption; release authenticity relies on HTTPS and your GitHub account access.

For source-build updates, close ArchJet and run this from your checkout:

```sh
git pull --ff-only
cd tauri
npm ci
npm run tauri -- build --no-bundle
bash ../scripts/install-local.sh
```

The same installer replaces the local app and desktop launcher.

## When paper runs out

Add paper and check for a jam or open cover. The printer may continue the existing job automatically. If it stays held or the queue is paused, open **Queue → Paper added / resume**, check the physical output, and confirm **Resume existing job**.

**Known P1007 limitation:** the physical empty-tray/refill test did not recover reliably and was stopped at the user’s request. Do not treat that hardware path as verified. Cancel the stalled job before any deliberate reprint; reconnect/power-cycle recovery may also require loading HP firmware.

Resume keeps the same CUPS job ID and does not create a new request. A driver can still restart an interrupted job from the beginning, so if some pages already printed, inspect them first. Cancel an already-printed job and select only missing pages when necessary. Unknown outcomes are never automatically reprinted.

## Window controls

ArchJet draws its own title bar on every desktop, including Hyprland. Use the top-right buttons to minimise, maximise/restore or close. Drag the title bar to move the window and double-click it to maximise or restore. Closing opens the cleanup choices below.

## Closing the app

Choose **Finish printing, then exit** or **Cancel all printing and exit**. Cleanup affects **all pending jobs on the local CUPS server**, including jobs from other apps. Documents, drafts, app history and preferences are cleared on exit.

A separate watchdog attempts cleanup after a force quit. A recovery marker lets the next launch retry if the watchdog or machine also stopped. Queue recovery uses the local CUPS socket and requests native system authentication when CUPS requires administrator approval. The app never handles your password. CUPS permissions can prevent cancelling another user’s jobs; the app reports that failure. Printer-buffered pages, CUPS system history and operating-system logs are outside app-history cleanup.

## Development and testing

```sh
cd tauri
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

[Verification results and hardware limits](verification.html) · [Architecture, dependencies and detailed setup](development.html)

ArchJet uses React, TypeScript, Tauri and a local Python/CUPS adapter. The desktop install/update workflow takes inspiration from [multi-codex](https://github.com/wrestle-R/multi-codex). Broad CUPS support is the goal; every printer model is not claimed tested.
