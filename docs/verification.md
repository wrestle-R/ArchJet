# Verification

## Automated

- Production TypeScript/Vite build passes.
- Rust/Tauri check passes on Arch Linux with GTK 3 and WebKitGTK 4.1.
- Backend tests use real Poppler for snapshots, raster preview and exact ordered PDF assembly; ImageMagick for image import. Submission and cancellation are mocked.
- Browser controls and narrow-window layout tested with Chromium/Playwright.
- Native IPC contract test chooses a real fixture PDF, calls the actual Python backend, renders preview images, navigates pages and checks both close choices. Window/picker IPC is mocked in this test, not claimed as native portal automation.
- Local CUPS discovery detects the configured HP LaserJet P1007, filters out uninstalled duplex hardware, and detects missing USB hardware. Structured read-only IPP Get-Jobs works against the local scheduler.

## Pending hardware checks

The P1007 was later connected and three jobs completed: page 1 (one sheet), pages 2,1 (two sheets), and page 2 with copies=2. CUPS reported four sheets for the copies job, but the user confirmed five physical sheets total across all three jobs. This suggests CUPS overcounting rather than duplicate physical output. The copy path was changed to expand document pages explicitly and use CUPS copies=1. A fresh six-sheet budget was authorized for native GUI verification. Results are recorded below after completion.

Suggested GUI checks: two copies of one selected page, then an exact reverse page sequence, preserving spare sheets for a targeted regression check. Validate physical order, legibility and copy count manually. Check unplugged/paused queues and app restart without automatically reprinting uncertain work.

Printer model compatibility beyond the installed CUPS queues remains unverified. Native portal operation, crash cleanup under real desktop session shutdown, and privileged all-user CUPS cancellation need system-level verification.
