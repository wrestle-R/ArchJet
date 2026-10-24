# What’s new

## 0.3.0

ArchJet is the new name for Print Arch.

- App-drawn minimise, maximise/restore and close controls, including on Hyprland.
- Explicit Light, Dark and System appearance choices in the top bar.
- Background update check at startup; only newer releases open the update dialog.
- Public downloads and updates without GitHub CLI authentication.
- Two-line curl installer with checksum verification and per-user desktop integration.
- Minimal landing page and a dedicated setup, usage and development guide.
- Repository source consolidated under tauri/ with scripts/ and ignored local-docs/ and release/ folders.

Documents stay local. CUPS printer capabilities, exact page ordering and session cleanup remain available. The HP P1007 paper-out/refill hardware recovery remains unresolved; no new hardware printing was performed for this release.


## 0.2.0

- Light, dark and system appearance. Document previews keep their original colours.
- Native tray menu with Open, Hide and Quit. Quit retains the cleanup choices.
- Updates and What’s new dialog, authenticated GitHub release checks, checksum verification and atomic per-user update installation.
- Native portal file/folder selection, ordered pages and copies, per-file settings and CUPS capabilities.
- Queue status, deliberate same-job resume, native authorization and explicit reprint preparation.
- Hyprland local verification; nested GNOME and XFCE native smoke tests in CI.

The HP LaserJet P1007 paper-out/refill hardware path remains unresolved. No automatic reprint is performed for an unknown outcome.
