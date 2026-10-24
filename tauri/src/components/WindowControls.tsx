import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

export function WindowControls({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const window = getCurrentWindow();
    let active = true;
    let off: (() => void) | undefined;
    const refresh = () =>
      window
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch((error) => {
          if (active) onError(String(error));
        });
    refresh();
    window
      .onResized(refresh)
      .then((unlisten) => {
        if (active) off = unlisten;
        else unlisten();
      })
      .catch((error) => {
        if (active) onError(String(error));
      });
    return () => {
      active = false;
      off?.();
    };
  }, []);
  async function toggle() {
    try {
      const window = getCurrentWindow();
      await window.toggleMaximize();
      setMaximized(await window.isMaximized());
    } catch (error) {
      onError(String(error));
    }
  }
  return (
    <div className="window-titlebar">
      <div
        className="window-drag-region"
        data-tauri-drag-region
      >
        <span data-tauri-drag-region>ArchJet</span>
      </div>
      <div className="window-buttons" aria-label="Window controls">
        <button
          type="button"
          aria-label="Minimise window"
          title="Minimise"
          onClick={() =>
            getCurrentWindow()
              .minimize()
              .catch((error) => onError(String(error)))
          }
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore window" : "Maximise window"}
          title={maximized ? "Restore" : "Maximise"}
          onClick={toggle}
        >
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          type="button"
          className="window-close"
          aria-label="Close window"
          title="Close"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
