# Verification

Verified locally on Arch Linux / Hyprland on 2026-10-23.

## Automated

- Production TypeScript/Vite build and native Rust/Tauri release build pass.
- 36 Python backend tests: real Poppler PDF assembly/preview, LibreOffice DOCX conversion, ImageMagick imports, exact order/repeats, expanded copies, duplex boundaries, disconnected printers, uncertain submissions, CUPS status privacy, cancellation/cleanup, same-ID resume, and native-auth fallback. Printing is mocked in automated tests.
- Eight Chromium/Playwright tests cover controls, capability filtering, 780px tiled layout, keyboard listboxes, per-file settings, real Python conversion behind a mocked native IPC contract, and same-job resume confirmation without creating a new request.

## Actual desktop GUI and hardware

- Native KDE portal file picker opened from Tauri and imported the user-selected PDF. Real converted page preview, page navigation, odd/custom pages and copies were exercised via desktop accessibility controls.
- GUI job 47: odd pages, two copies; user confirmed exactly two sheets, both look good (small text/photo readable, no dotted text).
- GUI job 48: custom order 2,1, one copy; user confirmed two sheets and no visible problem. CUPS subsequently paused after a USB reset; exact pending job was cancelled through the GUI to prevent duplicate output.
- Native close dialog showed both choices. Finish printing then exit cleared the private session directory and recovery marker.
- Initial backend-only copy test overcounted in CUPS (7 reported versus 5 physical sheets confirmed by user). Copies now expand in the document and submit with CUPS copies=1. GUI copy test reported and physically produced two sheets.

## Unresolved paper-out hardware path

The user removed paper, then loaded it again. Job 49 stayed tracked without a new submission, but the P1007 repeatedly disconnected/re-enumerated on USB, the queue paused, and refill/resume did not produce confirmed output. GUI recovery exposed CUPS authorization failures; local UNIX-socket transport and native Polkit fallback were added and tested. After the user reconnected USB, exact job 49 was cancelled and firmware recovery was exercised before one deliberate GUI retry (job 50). Its physical output was not confirmed. The user then powered the printer off/on and explicitly asked to stop this test and move on.

Jobs 49 and 50 were cancelled. Final local queue check was empty. No further printing is authorized under this test session without a new request. Fresh-batch physical output confirmed: four sheets; the final retry is unconfirmed. Do not claim physical paper-out/refill recovery passed.

## Remaining limits

Other printer models, privileged all-user cancellation, and complete operating-system shutdown recovery remain unverified. Watchdog logic is tested; native normal-exit cleanup was exercised. Preview is the converted source page, not a calibrated output simulation. Multi-frame images import their first frame. Printer compatibility depends on the installed CUPS drivers.

## Desktop integration 0.2.0

The CI workflow builds a Linux release on Ubuntu 24.04 and launches the native GTK/WebKit app under a nested GNOME Wayland compositor and an XFCE X11 desktop. Accessibility smoke tests exercise appearance and the release dialog without printing. These are virtual desktop checks; physical printers and GNOME extensions are not covered. Results are recorded in GitHub Actions and desktop screenshot/log artifacts.

Local Hyprland verification includes a native Wayland launch (not XWayland). Tray visibility depends on the desktop providing an AppIndicator/StatusNotifier host.

### Release 0.2.0 results, 2026-10-24

[GitHub Actions run 40003115804](https://github.com/wrestle-R/ArchJet/actions/runs/40003115804) passed the release build, 36 backend tests, eight browser tests, native GNOME Wayland and XFCE X11 checks. The XFCE job was retried after slow Ubuntu mirror downloads; its native test passed. Desktop screenshots and logs are attached to the run. The earlier native test script needed case-insensitive accessibility labels; that correction was verified locally and in both runner desktops.

The Ubuntu-built release binary was downloaded from GitHub and installed on Arch. Its SHA-256 matches the published release asset. The installed binary passed the native Hyprland appearance/release-dialog smoke check with `GDK_BACKEND=wayland`; Hyprland reported `xwayland: false`. Tray registration, Hide, Open and Quit were exercised locally; Quit opened both cleanup options and normal exit cleared the session. The release installer was also checked in an isolated path containing spaces. These checks submitted no print jobs.
