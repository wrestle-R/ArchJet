import { useEffect, useRef, useState } from "react";
import { Download, Moon, Sun, X, LoaderCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

type Release = {
  current: string;
  version: string;
  available: boolean;
  notes: string;
};
const notes = [
  "Dark, light and system appearance, with unchanged document colours.",
  "Tray menu to open, hide or quit through the cleanup dialog.",
  "GitHub release checks and verified per-user updates.",
  "Ordered pages, per-file options and clearer queue recovery.",
];
export function AppControls({ native }: { native: boolean }) {
  const [theme, setTheme] = useState("system");
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
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
        <button
          className="icon-button"
          aria-label="Change appearance"
          title={`Appearance: ${theme}`}
          onClick={() =>
            setTheme(
              theme === "system"
                ? "dark"
                : theme === "dark"
                  ? "light"
                  : "system",
            )
          }
        >
          {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label="Updates and what’s new"
          title="Updates and what’s new"
          onClick={() => setOpen(true)}
        >
          <Download size={17} />
        </button>
      </div>
      {open && (
        <div className="modal-backdrop">
          <div
            ref={dialog}
            className="modal updates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="updates-title"
          >
            <div className="updates-heading">
              <span className="eyebrow">PRINT ARCH · 0.2.0</span>
              <button
                className="icon-button"
                aria-label="Close updates"
                disabled={!!busy}
                onClick={() => setOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <h2 id="updates-title">A little more at home.</h2>
            <p className="updates-subtitle">What’s new in this version</p>
            <ul className="release-list">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="appearance-options" aria-label="Appearance">
              {["light", "dark", "system"].map((value) => (
                <button
                  key={value}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="update-help">
              Updates use GitHub CLI access to the private repository.
              Installation requires the per-user install and an empty print
              queue. Quit and reopen after installing.
            </p>
            <p role="status" className="update-message">
              {message}
            </p>
            {release?.available && (
              <details>
                <summary>What’s new in {release.version}</summary>
                <pre className="release-notes">{release.notes}</pre>
              </details>
            )}
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
