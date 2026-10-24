import { useEffect, useRef, useState } from "react";
import { Download, X, LoaderCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Select } from "./Select";

type Release = {
  current: string;
  version: string;
  available: boolean;
  notes: string;
};
export function AppControls({ native }: { native: boolean }) {
  const [theme, setTheme] = useState("system");
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const startupCheck = useRef<Promise<Release> | null>(null);
  useEffect(() => {
    if (!native) return;
    let active = true;
    // Reuse the request when StrictMode replays effects in development.
    startupCheck.current ??= invoke<Release>("call", {
      action: "check-update",
      payload: {},
    });
    startupCheck.current
      .then((result) => {
        if (!active) return;
        setRelease(result);
        if (result.available) setOpen(true);
      })
      .catch(() => {
        // Offline/auth failures should not interrupt startup. Manual checks explain them.
      });
    return () => {
      active = false;
    };
  }, [native]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    const nodes = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) || [],
      );
    nodes()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        setOpen(false);
      }
      if (event.key === "Tab") {
        const items = nodes(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      previous?.focus();
    };
  }, [open, busy]);
  async function update(install = false) {
    if (busy) return;
    setBusy(install ? "Installing…" : "Checking…");
    setMessage("");
    try {
      if (!native)
        throw Error("Open the desktop app to check GitHub releases.");
      if (install) {
        const result = await invoke<{ message: string }>("call", {
          action: "install-update",
          payload: { version: release?.version },
        });
        setInstalled(true);
        setMessage(result.message);
      } else {
        const result = await invoke<Release>("call", {
          action: "check-update",
          payload: {},
        });
        setRelease(result);
        setOpen(result.available);
        setMessage(
          result.available
            ? `Version ${result.version} is available.`
            : "You’re up to date.",
        );
      }
    } catch (error) {
      setMessage(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="app-controls">
        <Select
          className="appearance-select"
          aria-label="Appearance"
          value={theme}
          onValueChange={setTheme}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </Select>
        {message && !open && (
          <span className="update-status" role="status">
            {message}
          </span>
        )}
        <button
          className="icon-button"
          aria-label="Check for updates"
          title="Check for updates"
          disabled={!!busy}
          onClick={() => update()}
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Download size={17} />
          )}
        </button>
      </div>
      {open && release?.available && (
        <div className="modal-backdrop">
          <div
            ref={dialog}
            className="modal updates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="updates-title"
          >
            <div className="updates-heading">
              <span className="eyebrow">ARCHJET · {release.current}</span>
              <button
                className="icon-button"
                aria-label="Close updates"
                disabled={!!busy}
                onClick={() => setOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <h2 id="updates-title">
              {installed
                ? "Update installed."
                : `Version ${release.version} is available.`}
            </h2>
            <p className="updates-subtitle">What’s new</p>
            <pre className="release-notes">{release.notes}</pre>
            <p className="update-help">
              {installed
                ? "Quit and reopen ArchJet to use the new version."
                : "Finish or cancel your print queue before installing."}
            </p>
            <p role="status" className="update-message">
              {message}
            </p>
            <div className="update-actions">
              <button
                className="secondary"
                disabled={!!busy || installed}
                onClick={() => update()}
              >
                {busy && <LoaderCircle size={15} className="spin" />}
                {busy || "Check for updates"}
              </button>
              {release?.available && !installed && (
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => update(true)}
                >
                  Install {release.version}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
