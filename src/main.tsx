import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Printer,
  Plus,
  FolderOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  GripVertical,
  X,
  ArrowUpRight,
  Check,
  RefreshCw,
  Settings2,
  Layers,
  CircleHelp,
  ArrowRight,
  AlertCircle,
  LoaderCircle,
  Minus,
  ZoomIn,
  ZoomOut,
  Trash2,
  Cable,
  CheckCircle2,
} from "lucide-react";
import "@fontsource-variable/dm-sans";
import "./style.css";
import { Select } from "./components/Select";
import { AppControls } from "./components/AppControls";

type Doc = {
  id: string;
  name: string;
  pages: number;
  size: string;
  bytes: number;
  mode: string;
  range: string;
  copies: number;
  override?: Options;
};
type Device = {
  id: string;
  name: string;
  state: string;
  uri: string;
  ready: boolean;
  default: boolean;
  connected: boolean | null;
  compatibility: boolean;
  papers: string[];
  defaultPaper: string;
  duplex: string[];
  colors: string[];
};
type Job = {
  id: string;
  name: string;
  cupsId?: string;
  state: string;
  pages: number[];
  copies: number;
  detail?: string;
  reportedSheets?: number;
  expectedSheets?: number;
  accountingWarning?: string;
  printer?: string;
  source?: Pick<Doc, "id" | "name" | "pages" | "size" | "bytes">;
  options?: Options;
};
type QueueJob = {
  state?: string;
  reason?: string;
  reportedSheets?: number;
  printerPaused?: boolean;
  id: string;
  owner: string;
  description: string;
};
type Options = {
  paper: string;
  sides: string;
  color: string;
  orientation: string;
  scale: string;
};
type CheckItem = {
  name: string;
  ok: boolean;
  tools: string[];
  command: string;
};
const native = "__TAURI_INTERNALS__" in window;
const demo = !native && new URLSearchParams(location.search).has("demo");
const mockDevice: Device = {
  id: "HP_LaserJet_P1007",
  name: "HP LaserJet P1007",
  state: "is idle. enabled",
  uri: "USB",
  ready: true,
  default: true,
  connected: true,
  compatibility: true,
  papers: ["A4", "Letter", "Legal"],
  defaultPaper: "A4",
  duplex: [],
  colors: ["Gray"],
};
const mockDocs: Doc[] = [
  {
    id: "sample",
    name: "Project proposal.pdf",
    pages: 12,
    size: "595 × 842 pts (A4)",
    bytes: 248000,
    mode: "custom",
    range: "1,5,2-4",
    copies: 1,
  },
  {
    id: "notes",
    name: "Meeting notes.docx",
    pages: 3,
    size: "A4",
    bytes: 42000,
    mode: "all",
    range: "",
    copies: 1,
  },
];
function selection(doc: Doc): number[] {
  if (doc.mode === "all")
    return Array.from({ length: doc.pages }, (_, i) => i + 1);
  if (doc.mode === "odd" || doc.mode === "even")
    return Array.from({ length: doc.pages }, (_, i) => i + 1).filter(
      (n) => n % 2 === (doc.mode === "odd" ? 1 : 0),
    );
  const result: number[] = [];
  if (!doc.range.trim()) throw Error("Enter a page selection.");
  for (const value of doc.range.split(",")) {
    const match = value.match(/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/);
    if (!match) throw Error("Use pages like 1,5,2-4.");
    const a = Number(match[1]),
      b = Number(match[2] || match[1]);
    if (a < 1 || b < 1 || a > doc.pages || b > doc.pages)
      throw Error(`Choose pages between 1 and ${doc.pages}.`);
    for (let n = a; b >= a ? n <= b : n >= b; n += b >= a ? 1 : -1) {
      result.push(n);
      if (result.length > 2000) throw Error("Select at most 2,000 pages.");
    }
  }
  return result;
}
async function api<T>(action: string, payload: unknown = {}): Promise<T> {
  if (!native)
    throw Error("Open the desktop app to access local files and printers.");
  return invoke<T>("call", { action, payload });
}
function App() {
  const [docs, setDocs] = useState<Doc[]>(demo ? mockDocs : []),
    [selected, setSelected] = useState(demo ? "sample" : ""),
    [devices, setDevices] = useState<Device[]>(demo ? [mockDevice] : []),
    [printer, setPrinter] = useState(demo ? mockDevice.id : "");
  const [view, setView] = useState("print"),
    [page, setPage] = useState(1),
    [image, setImage] = useState(""),
    [zoom, setZoom] = useState(100),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]),
    [active, setActive] = useState<QueueJob[]>([]),
    [checks, setChecks] = useState<CheckItem[]>([]),
    [desktop, setDesktop] = useState(""),
    [closeOpen, setCloseOpen] = useState(false),
    [finishing, setFinishing] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [resumeJob, setResumeJob] = useState<QueueJob | null>(null);
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [folderPath, setFolderPath] = useState(""),
    [folderFiles, setFolderFiles] = useState<{ path: string; name: string }[]>(
      [],
    ),
    [folderChecked, setFolderChecked] = useState<Set<string>>(new Set()),
    [recursive, setRecursive] = useState(false),
    [unsupported, setUnsupported] = useState(0);
  const [options, setOptions] = useState<Options>({
    paper: "A4",
    sides: "one-sided",
    color: "",
    orientation: "portrait",
    scale: "fit",
  });
  const pickerOpen = useRef(false);
  const printerDefaults = useRef<Record<string, Options>>({});
  const dragged = useRef(""),
    requestToken = useRef(crypto.randomUUID()),
    submittedToken = useRef(""),
    busyRef = useRef(""),
    allowClose = useRef(false),
    finishRef = useRef(false),
    previewVersion = useRef(0);
  const current = docs.find((d) => d.id === selected),
    device = devices.find((d) => d.id === printer);
  const effectiveOptions = current?.override || options;
  let totalPages = 0,
    totalSheets = 0,
    invalid = "";
  for (const doc of docs) {
    try {
      const count = selection(doc).length;
      if (!count) throw Error("No pages selected.");
      totalPages += count * doc.copies;
      totalSheets +=
        ((doc.override?.sides || options.sides) === "one-sided"
          ? count
          : Math.ceil(count / 2)) * doc.copies;
    } catch (e) {
      invalid = `${doc.name}: ${String(e).replace("Error: ", "")}`;
    }
  }
  const change = (id: string, patch: Partial<Doc>) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    requestToken.current = crypto.randomUUID();
  };
  const setOption = (key: keyof Options, value: string) => {
    if (current?.override)
      change(current.id, { override: { ...current.override, [key]: value } });
    else
      setOptions((o) => {
        const next = { ...o, [key]: value };
        printerDefaults.current[printer] = next;
        return next;
      });
    requestToken.current = crypto.randomUUID();
  };
  const choosePrinter = (id: string, list = devices) => {
    setPrinter(id);
    const p = list.find((d) => d.id === id);
    if (p)
      setOptions(
        printerDefaults.current[id] || {
          paper: p.defaultPaper,
          sides: "one-sided",
          color: p.colors.includes("Gray") ? "Gray" : p.colors[0] || "",
          orientation: "portrait",
          scale: "fit",
        },
      );
    setDocs((all) => all.map((d) => ({ ...d, override: undefined })));
    requestToken.current = crypto.randomUUID();
  };
  async function refresh() {
    if (!native) return;
    try {
      const data = await api<{ printers: Device[]; warning?: string }>(
        "discover",
      );
      setDevices(data.printers);
      if (!data.printers.some((p) => p.id === printer) && data.printers.length)
        choosePrinter(
          (data.printers.find((p) => p.default) || data.printers[0]).id,
          data.printers,
        );
      if (data.warning) setNotice(data.warning);
    } catch (e) {
      setError(String(e));
    }
  }
  async function poll() {
    if (!native) return;
    try {
      const data = await api<{ active: QueueJob[]; jobs: Job[] }>("status");
      setActive(data.active);
      setJobs(data.jobs);
      if (finishRef.current && data.active.length === 0 && !busyRef.current)
        await exit(false);
    } catch (e) {
      if (finishRef.current) {
        setError(String(e));
        finishRef.current = false;
        setFinishing(false);
      }
    }
  }
  useEffect(() => {
    refresh();
    poll();
    if (native)
      api<{
        checks: CheckItem[];
        desktop: string;
        session: string;
        recoveryError?: string;
      }>("diagnostics")
        .then((d) => {
          setChecks(d.checks);
          if (d.recoveryError) setError(d.recoveryError);
          setDesktop(`${d.desktop} · ${d.session}`);
        })
        .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      poll();
    }, 3500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(refresh, 12000);
    return () => clearInterval(timer);
  }, [printer]);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((e) => {
        if (!allowClose.current) {
          e.preventDefault();
          setCloseOpen(true);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let off: (() => void) | undefined;
    getCurrentWindow()
      .onDragDropEvent((e) => {
        if (e.payload.type === "drop") addFiles(e.payload.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  useEffect(() => {
    setPage(1);
  }, [selected]);
  useEffect(() => {
    const version = ++previewVersion.current;
    setImage("");
    if (!current || !native) return;
    api<{ image: string }>("preview", { id: current.id, page })
      .then((d) => {
        if (version === previewVersion.current) setImage(d.image);
      })
      .catch((e) => {
        if (version === previewVersion.current) setError(String(e));
      });
  }, [selected, page]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        pick(false);
      }
      if (e.key === "Escape") {
        setSettingsOpen(false);
        if (!finishRef.current) {
          setCloseOpen(false);
          setFolderPath("");
          setResumeJob(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!closeOpen && !folderPath && !resumeJob) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [closeOpen, folderPath, resumeJob]);
  async function task(label: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = label;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  }
  async function addFiles(paths: string[]) {
    await task("Preparing documents", async () => {
      const added: Doc[] = [],
        failures: string[] = [];
      for (const path of paths) {
        try {
          const d = await api<Omit<Doc, "mode" | "range" | "copies">>(
            "import",
            { path },
          );
          added.push({ ...d, mode: "all", range: "", copies: 1 });
        } catch (e) {
          failures.push(`${path.split("/").pop()}: ${String(e)}`);
        }
      }
      if (added.length) {
        setDocs((d) => [...d, ...added]);
        setSelected(added[0].id);
        setView("print");
        requestToken.current = crypto.randomUUID();
      }
      if (failures.length) setError(failures.join("\n"));
    });
  }
  async function pick(folder: boolean) {
    if (pickerOpen.current || busyRef.current || finishRef.current) return;
    if (!native) {
      setNotice("File access is available in the desktop app.");
      return;
    }
    pickerOpen.current = true;
    try {
      const paths = await invoke<string[]>("choose_files", { folder });
      if (!paths.length) return;
      if (folder) {
        setFolderPath(paths[0]);
        setRecursive(false);
        await loadFolder(paths[0], false);
      } else await addFiles(paths);
    } catch (e) {
      setError(String(e));
    } finally {
      pickerOpen.current = false;
    }
  }
  async function loadFolder(path: string, recurse: boolean) {
    try {
      const d = await api<{
        files: { path: string; name: string }[];
        unsupported: number;
      }>("folder", { path, recursive: recurse });
      setFolderFiles(d.files);
      setFolderChecked(new Set(d.files.map((f) => f.path)));
      setUnsupported(d.unsupported);
    } catch (e) {
      setError(String(e));
    }
  }
  async function print() {
    await task("Preparing and submitting", async () => {
      const token = requestToken.current;
      if (submittedToken.current === token)
        throw Error(
          "This request was already attempted. Check Queue before printing again.",
        );
      submittedToken.current = token;
      await api("submit", {
        token,
        printer,
        items: docs.map(({ id, mode, range, copies, override }) => ({
          id,
          mode,
          range,
          copies,
          override,
        })),
        options,
      });
      setView("queue");
      setNotice(
        "Submitted to CUPS. Queue clearance does not confirm physical print quality.",
      );
      await poll();
    });
  }
  async function exit(cancelAll: boolean) {
    if (busyRef.current) {
      setError("Wait for the current operation to finish before exiting.");
      return;
    }
    try {
      await api("cleanup", { cancelAll });
      allowClose.current = true;
      await getCurrentWindow().destroy();
    } catch (e) {
      setError(String(e));
      finishRef.current = false;
      setFinishing(false);
    }
  }
  async function finishAndExit() {
    finishRef.current = true;
    setFinishing(true);
    await poll();
  }
  function move(from: string, to: string) {
    setDocs((all) => {
      const copy = [...all],
        start = copy.findIndex((d) => d.id === from),
        end = copy.findIndex((d) => d.id === to);
      if (start >= 0 && end >= 0) copy.splice(end, 0, copy.splice(start, 1)[0]);
      return copy;
    });
    requestToken.current = crypto.randomUUID();
  }
  const printDisabled =
    !!busy ||
    !docs.length ||
    !!invalid ||
    !device?.ready ||
    finishing ||
    submittedToken.current === requestToken.current;
  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("print");
          }}
        >
          <span className="brand-icon">
            <Printer size={19} />
          </span>
          print<span className="brand-light">arch</span>
          <span className="linux-tag">LINUX</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={view === "print" ? "nav active" : "nav"}
            onClick={() => setView("print")}
          >
            Workspace
          </button>
          <button
            className={view === "queue" ? "nav active" : "nav"}
            onClick={() => {
              setView("queue");
              poll();
            }}
          >
            Queue <span className="count">{active.length}</span>
          </button>
          <button
            className={view === "printer" ? "nav active" : "nav"}
            onClick={() => setView("printer")}
          >
            Printers
          </button>
        </nav>
        <AppControls native={native} />
        <button
          className="icon-button"
          title="Printer setup and help"
          aria-label="Printer setup and help"
          onClick={() => setView("printer")}
        >
          <CircleHelp size={18} />
        </button>
      </header>
      {demo && (
        <div className="demo-banner">
          Design preview · sample documents and printer · no jobs will be sent
        </div>
      )}
      {!native && !demo && (
        <div className="demo-banner">
          Browser preview. Launch the desktop app for local printing.{" "}
          <a href="?demo">Explore the design →</a>
        </div>
      )}
      {(error || notice) && (
        <div
          className={`message ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <AlertCircle size={17} />
          <span>{error || notice}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="printer-strip">
        <div className="printer-identity">
          <Printer size={17} />
          <Select
            aria-label="Selected printer"
            value={printer}
            onValueChange={(value) => choosePrinter(value)}
          >
            {!devices.length && <option value="">No printers found</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <span className={`status-pill ${device?.ready ? "ready" : ""}`}>
            <i />
            {device?.connected === false
              ? "Disconnected"
              : device?.ready
                ? "Available"
                : "Needs attention"}
          </span>
        </div>
        <button className="text-button" onClick={refresh}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {view === "print" && (
        <main className="workspace">
          <aside className="documents">
            <div className="section-heading">
              <h2>
                Documents <span>{docs.length.toString().padStart(2, "0")}</span>
              </h2>
              <button
                className="icon-button"
                aria-label="Add files"
                onClick={() => pick(false)}
              >
                <Plus size={17} />
              </button>
            </div>
            <p className="muted small">Your files, in print order.</p>
            <div className="document-list">
              {docs.map((d, index) => (
                <div
                  key={d.id}
                  className={`document-row ${d.id === selected ? "selected" : ""}`}
                  draggable={!busy}
                  onDragStart={() => (dragged.current = d.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    move(dragged.current, d.id);
                  }}
                >
                  <button
                    className="document-select"
                    onClick={() => setSelected(d.id)}
                  >
                    <span className="file-thumb">
                      <FileText size={22} />
                      <span>{d.name.split(".").pop()?.toUpperCase()}</span>
                    </span>
                    <span className="document-info">
                      <strong title={d.name}>{d.name}</strong>
                      <span>
                        {d.pages} pages ·{" "}
                        {Math.max(1, Math.round(d.bytes / 1024))} KB
                      </span>
                      <em>
                        {d.mode === "all"
                          ? "All pages"
                          : d.mode === "custom"
                            ? d.range || "Choose pages"
                            : `${d.mode === "odd" ? "Odd" : "Even"} pages`}
                        {d.copies > 1 ? ` · ${d.copies} copies` : ""}
                      </em>
                    </span>
                  </button>
                  <div className="file-actions">
                    <span className="index">{index + 1}</span>
                    <button
                      aria-label={`Move ${d.name} earlier`}
                      disabled={!index || !!busy}
                      onClick={() => move(d.id, docs[index - 1].id)}
                      title="Move earlier"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      aria-label={`Remove ${d.name}`}
                      disabled={!!busy}
                      onClick={() => {
                        const rest = docs.filter((v) => v.id !== d.id);
                        setDocs(rest);
                        if (selected === d.id) setSelected(rest[0]?.id || "");
                        requestToken.current = crypto.randomUUID();
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="add-area">
              <button
                className="outline-button"
                onClick={() => pick(false)}
                disabled={!!busy}
              >
                <Plus size={15} /> Add files <kbd>Ctrl O</kbd>
              </button>
              <button
                className="text-button folder-button"
                onClick={() => pick(true)}
                disabled={!!busy}
              >
                <FolderOpen size={15} /> Choose a folder
              </button>
              <p className="tiny muted">
                PDF, Office documents & images
                <br />
                Drop files anywhere to add them.
              </p>
            </div>
            <div className="local-note">
              <span className="local-dot" />
              Local files. Local printing.
              <br />
              <span>Documents stay on this device.</span>
            </div>
          </aside>
          <section className="preview-section" aria-label="Document preview">
            <div className="preview-toolbar">
              <div>
                <span className="eyebrow">PREVIEW</span>
                <span className="preview-name">
                  {current?.name || "Your next print starts here"}
                </span>
              </div>
              <div className="zoom-controls">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                >
                  <ZoomOut size={15} />
                </button>
                <span>{zoom}%</span>
                <button
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(180, z + 10))}
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            </div>
            <div className="preview-canvas">
              {current ? (
                <div
                  className="paper"
                  style={{ width: `${Math.round((400 * zoom) / 100)}px` }}
                >
                  {image ? (
                    <img src={image} alt={`${current.name}, page ${page}`} />
                  ) : demo ? (
                    <SamplePage page={page} />
                  ) : (
                    <div className="preview-loading">
                      <LoaderCircle size={24} className="spin" />
                      <span>Rendering page {page}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-sheets">
                    <FileText size={42} strokeWidth={1} />
                  </div>
                  <h1>
                    A little less guesswork.
                    <br />A better print.
                  </h1>
                  <p>
                    Add a document to preview every page
                    <br />
                    and get everything just right.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => pick(false)}
                  >
                    <Plus size={16} /> Choose documents
                  </button>
                  <button className="text-button" onClick={() => pick(true)}>
                    or choose a folder <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="preview-bottom">
              <span>{current ? current.size : "Actual document preview"}</span>
              <div className="page-navigation">
                <button
                  aria-label="Previous page"
                  disabled={!current || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  Page <strong>{current ? page : "—"}</strong> of{" "}
                  {current?.pages || "—"}
                </span>
                <button
                  aria-label="Next page"
                  disabled={!current || page >= current.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <span className="actual-label">
                {effectiveOptions.scale === "fit"
                  ? "Fit to paper"
                  : "Actual size"}
              </span>
            </div>
          </section>
          <button
            className="mobile-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={17} /> Print settings
          </button>
          <aside className={`print-settings ${settingsOpen ? "open" : ""}`}>
            <div className="section-heading">
              <h2>Print settings</h2>
              <Settings2 size={16} />
              <button
                className="mobile-close icon-button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="settings-scroll">
              <fieldset disabled={!!busy || finishing}>
                <legend className="eyebrow">SELECTED DOCUMENT</legend>
                <div className="setting">
                  <label htmlFor="pages">Pages</label>
                  <Select
                    id="pages"
                    value={current?.mode || "all"}
                    disabled={!current}
                    onValueChange={(value) =>
                      current && change(current.id, { mode: value })
                    }
                  >
                    <option value="all">All pages</option>
                    <option value="custom">Custom order</option>
                    <option value="odd">Odd pages</option>
                    <option value="even">Even pages</option>
                  </Select>
                </div>
                {current?.mode === "custom" && (
                  <div className="range-control">
                    <input
                      aria-label="Custom page order"
                      value={current.range}
                      placeholder="1,5,2-4"
                      onChange={(e) =>
                        change(current.id, { range: e.target.value })
                      }
                    />
                    <span className="tiny muted">
                      Prints in the order you enter.
                    </span>
                  </div>
                )}
                <div className="setting">
                  <label>Copies</label>
                  <div className="stepper">
                    <button
                      aria-label="Fewer copies"
                      disabled={!current || current.copies <= 1}
                      onClick={() =>
                        current &&
                        change(current.id, { copies: current.copies - 1 })
                      }
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      aria-label="Copies"
                      type="number"
                      min="1"
                      max="99"
                      value={current?.copies || 1}
                      disabled={!current}
                      onChange={(e) =>
                        current &&
                        change(current.id, {
                          copies: Math.max(
                            1,
                            Math.min(99, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                    <button
                      aria-label="More copies"
                      disabled={!current || current.copies >= 99}
                      onClick={() =>
                        current &&
                        change(current.id, { copies: current.copies + 1 })
                      }
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div className="divider" />
                <legend className="eyebrow">PRINT OPTIONS</legend>
                <label className="checkbox-line override-toggle">
                  <input
                    type="checkbox"
                    checked={!!current?.override}
                    disabled={!current}
                    onChange={(e) =>
                      current &&
                      change(current.id, {
                        override: e.target.checked ? { ...options } : undefined,
                      })
                    }
                  />{" "}
                  Custom settings for this file
                </label>
                <div className="setting">
                  <label htmlFor="paper">Paper size</label>
                  <Select
                    id="paper"
                    value={effectiveOptions.paper}
                    onValueChange={(value) => setOption("paper", value)}
                  >
                    {(device?.papers || ["A4"]).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                </div>
                <div className="setting stacked">
                  <label>Orientation</label>
                  <div className="segmented">
                    <button
                      className={
                        effectiveOptions.orientation === "portrait"
                          ? "chosen"
                          : ""
                      }
                      onClick={() => setOption("orientation", "portrait")}
                    >
                      <span className="orientation-icon" />
                      Portrait
                    </button>
                    <button
                      className={
                        effectiveOptions.orientation === "landscape"
                          ? "chosen"
                          : ""
                      }
                      onClick={() => setOption("orientation", "landscape")}
                    >
                      <span className="orientation-icon landscape" />
                      Landscape
                    </button>
                  </div>
                </div>
                <div className="setting">
                  <label htmlFor="sides">Sides</label>
                  <Select
                    id="sides"
                    value={effectiveOptions.sides}
                    onValueChange={(value) => setOption("sides", value)}
                  >
                    <option value="one-sided">One-sided</option>
                    {device?.duplex.some((v) =>
                      ["DuplexNoTumble", "two-sided-long-edge"].includes(v),
                    ) && (
                      <option value="two-sided-long-edge">
                        Two-sided · long edge
                      </option>
                    )}
                    {device?.duplex.some((v) =>
                      ["DuplexTumble", "two-sided-short-edge"].includes(v),
                    ) && (
                      <option value="two-sided-short-edge">
                        Two-sided · short edge
                      </option>
                    )}
                  </Select>
                </div>
                <div className="setting">
                  <label htmlFor="color">Colour</label>
                  <Select
                    id="color"
                    value={effectiveOptions.color}
                    disabled={!device?.colors.length || device?.compatibility}
                    onValueChange={(value) => setOption("color", value)}
                  >
                    {device?.colors.length ? (
                      device.colors.map((c) => (
                        <option key={c} value={c}>
                          {c === "Gray" ? "Grayscale" : c}
                        </option>
                      ))
                    ) : (
                      <option value="">Printer default</option>
                    )}
                  </Select>
                </div>
                <div className="setting">
                  <label htmlFor="scaling">Scaling</label>
                  <Select
                    id="scaling"
                    value={effectiveOptions.scale}
                    onValueChange={(value) => setOption("scale", value)}
                  >
                    <option value="fit">Fit to paper</option>
                    <option value="actual">Actual size</option>
                  </Select>
                </div>
                {device?.compatibility && (
                  <div className="compat-note">
                    <CheckCircle2 size={15} />
                    <div>
                      <strong>Compatibility mode</strong>
                      <span>600 DPI · grayscale raster</span>
                      <p>Reliable text output for this printer.</p>
                    </div>
                  </div>
                )}
              </fieldset>
            </div>
            <div className="print-summary">
              <div className="summary-line">
                <span>Ready to print</span>
                <strong>
                  {totalSheets} <span>sheets</span>
                </strong>
              </div>
              <p className="tiny muted">
                {docs.length} documents · {totalPages} printed pages
              </p>
              {(invalid || (!device?.ready && docs.length > 0)) && (
                <p className="validation" role="status">
                  {invalid || "Connect an available printer to continue."}
                </p>
              )}
              <button
                className="print-button"
                disabled={printDisabled}
                onClick={print}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Printer size={17} />
                )}
                <span>
                  {busy ||
                    `Print ${totalSheets} ${totalSheets === 1 ? "sheet" : "sheets"}`}
                </span>
                {!busy && <ArrowUpRight size={18} />}
              </button>
              <p className="tiny muted summary-foot">
                Review your pages before printing.
              </p>
            </div>
          </aside>
        </main>
      )}
      {view === "queue" && (
        <main className="page-view">
          <div className="page-heading">
            <div>
              <span className="eyebrow">LIVE STATUS</span>
              <h1>The print queue.</h1>
              <p>All local printer jobs, in one place.</p>
            </div>
            <button className="outline-button" onClick={poll}>
              <RefreshCw size={15} /> Refresh queue
            </button>
          </div>
          <h2 className="list-label">
            Active on this device <span>{active.length}</span>
          </h2>
          {!active.length ? (
            <div className="queue-empty">
              <CheckCircle2 size={30} />
              <h2>Nothing waiting.</h2>
              <p>Your local print queues are clear.</p>
              <button className="text-button" onClick={() => setView("print")}>
                Back to workspace <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            active.map((j) => (
              <div className="job-row" key={j.id}>
                <span className="job-icon">
                  <Printer size={20} />
                </span>
                <div>
                  <strong>{j.id}</strong>
                  <p>
                    {j.owner} · {j.description}
                  </p>
                </div>
                <span className="status-pill ready">
                  <i />
                  {j.printerPaused
                    ? "Printer paused"
                    : j.state === "held"
                      ? "Held"
                      : j.state === "processing"
                        ? "Processing"
                        : "Waiting"}
                </span>
                <button
                  className="outline-button"
                  disabled={!!busy}
                  onClick={() => {
                    setResumeJob(j);
                    setResumeConfirmed(false);
                  }}
                >
                  Paper added / resume
                </button>
                <button
                  className="outline-button danger-text"
                  disabled={!!busy}
                  onClick={() =>
                    task("Cancelling job", async () => {
                      await api("cancel", { id: j.id });
                      await poll();
                    })
                  }
                >
                  Cancel job
                </button>
              </div>
            ))
          )}
          {!!jobs.length && (
            <>
              <h2 className="list-label">This session</h2>
              {jobs.map((j) => (
                <div className="job-row" key={j.id}>
                  <FileText size={22} />
                  <div>
                    <strong>{j.name}</strong>
                    <p>
                      {j.pages.join(", ")} · {j.copies}{" "}
                      {j.copies === 1 ? "copy" : "copies"} ·{" "}
                      {j.cupsId || "Submission uncertain"}
                    </p>
                    {j.detail && <p className="danger-text">{j.detail}</p>}
                    {j.accountingWarning && (
                      <p className="danger-text" role="alert">
                        {j.accountingWarning}
                      </p>
                    )}
                  </div>
                  {["cancelled", "failed", "queue-cleared"].includes(j.state) &&
                    (j.source || docs.some((d) => d.name === j.name)) && (
                      <button
                        className="outline-button"
                        disabled={
                          !!busy || active.some((a) => a.id === j.cupsId)
                        }
                        onClick={() => {
                          const source =
                            j.source || docs.find((d) => d.name === j.name);
                          if (!source) return;
                          if (
                            j.printer &&
                            devices.some((p) => p.id === j.printer)
                          )
                            choosePrinter(j.printer);
                          const prepared: Doc = {
                            ...source,
                            mode: "custom",
                            range: j.pages.join(","),
                            copies: j.copies,
                            override: j.options,
                          };
                          setDocs((all) => [
                            ...all.filter((d) => d.id !== source.id),
                            prepared,
                          ]);
                          setSelected(source.id);
                          requestToken.current = crypto.randomUUID();
                          setView("print");
                          setNotice(
                            "Previous job is terminal. Pages and copies restored; review settings before sending a new print request.",
                          );
                        }}
                      >
                        Prepare reprint
                      </button>
                    )}
                  <span className="job-state">
                    {j.state === "queue-cleared"
                      ? "CUPS processing ended"
                      : j.state === "unknown"
                        ? "Outcome unknown"
                        : j.state}
                  </span>
                </div>
              ))}
              <p className="muted small">
                CUPS processing ending does not prove that a page printed
                correctly. Check the physical output.
              </p>
            </>
          )}
          <div className="session-note">
            <Layers size={18} />
            <p>
              Session only. History and documents are cleared on exit. Exit
              cleanup cancels all remaining local jobs, including jobs from
              other apps.
            </p>
          </div>
        </main>
      )}
      {view === "printer" && (
        <main className="page-view">
          <div className="page-heading">
            <div>
              <span className="eyebrow">CONNECTED TO YOUR DESKTOP</span>
              <h1>Printers & setup.</h1>
              <p>Standard CUPS discovery. Device-specific controls.</p>
            </div>
            <div className="heading-actions">
              <button
                className="outline-button"
                onClick={() =>
                  task("Opening CUPS setup", async () => {
                    await api("open-cups");
                  })
                }
              >
                <Plus size={15} /> Add printer
              </button>
              <button className="outline-button" onClick={refresh}>
                <RefreshCw size={15} /> Discover printers
              </button>
            </div>
          </div>
          {!devices.length && (
            <div className="message">
              <Cable size={18} />
              <span>
                No configured printers. Add a printer in your system’s CUPS
                settings, then refresh.
              </span>
            </div>
          )}
          {devices.map((d) => (
            <div className="device-card" key={d.id}>
              <span className="device-art">
                <Printer size={42} strokeWidth={1.2} />
              </span>
              <div>
                <h2>{d.name}</h2>
                <p>
                  {d.connected === false ? "USB device not detected" : d.state}
                </p>
                <span className="tiny muted">
                  {d.compatibility
                    ? "P1007 compatibility profile · 600 DPI raster"
                    : "Standard CUPS driver · reported capabilities"}{" "}
                  · {d.papers.length} paper sizes
                </span>
              </div>
              <div className="device-actions">
                <button
                  className="outline-button"
                  onClick={() => {
                    choosePrinter(d.id);
                    setView("print");
                  }}
                >
                  Use printer <ArrowRight size={14} />
                </button>
                <button
                  className="text-button"
                  disabled={
                    !!busy ||
                    d.connected === false ||
                    active.some(
                      (j) => j.id.slice(0, j.id.lastIndexOf("-")) === d.id,
                    )
                  }
                  onClick={() =>
                    task("Restoring printer", async () => {
                      await api("recover", { printer: d.id });
                      await refresh();
                      setNotice(
                        "Recovery commands finished. Check the refreshed printer status.",
                      );
                    })
                  }
                >
                  Restore queue
                </button>
                {d.compatibility && (
                  <button
                    className="text-button"
                    disabled={
                      !!busy ||
                      d.connected === false ||
                      active.some(
                        (j) => j.id.slice(0, j.id.lastIndexOf("-")) === d.id,
                      )
                    }
                    onClick={() =>
                      task("Loading firmware", async () => {
                        await api("recover", { printer: d.id, firmware: true });
                        await refresh();
                      })
                    }
                  >
                    Load HP firmware
                  </button>
                )}
              </div>
            </div>
          ))}
          <h2 className="list-label">
            System checks <span>{desktop}</span>
          </h2>
          <div className="diagnostic-list">
            {checks.map((c) => (
              <details key={c.name}>
                <summary>
                  <span className={`check-icon ${c.ok ? "ok" : ""}`}>
                    {c.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                  </span>
                  <strong>{c.name}</strong>
                  <span>{c.ok ? "Installed" : "Setup needed"}</span>
                  <ChevronDown size={15} />
                </summary>
                <p>{c.tools.join(", ")}</p>
                <pre>{c.command}</pre>
                <p className="tiny muted">
                  Arch Linux instructions. Run these yourself if needed. HP’s
                  proprietary plugin requires its own licence acceptance.
                  Driverless devices do not need HPLIP.
                </p>
              </details>
            ))}
          </div>
          <div className="session-note">
            <CircleHelp size={18} />
            <p>
              Works with printers supported by your CUPS installation.
              Driverless IPP printers use their standard capabilities. Hardware
              support and reported options vary by driver.
            </p>
          </div>
        </main>
      )}
      <footer className="statusbar">
        <span>
          <span className="local-dot" />
          {busy || "Everything stays on your device"}
        </span>
        <span>
          {demo ? "DESIGN PREVIEW" : desktop || "LINUX DESKTOP"}
          <span className="footer-dot">·</span>v0.1.0
        </span>
      </footer>
      {resumeJob && (
        <div className="modal-backdrop">
          <section
            className="modal close-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-title"
          >
            <span className="job-icon">
              <Printer size={25} />
            </span>
            <h2 id="resume-title">Continue this job?</h2>
            <p>
              Add paper and check for a jam or open cover. This continues{" "}
              <strong>{resumeJob.id}</strong>; it does not create another print
              request.
            </p>
            <p>
              If pages already came out, check them first. A driver can restart
              an interrupted job from the beginning. Cancel an already-printed
              job and select only missing pages instead.
            </p>
            {!!resumeJob.reportedSheets && (
              <p className="validation">
                CUPS reports {resumeJob.reportedSheets} processed sheets. This
                is not proof of physical output.
              </p>
            )}
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={resumeConfirmed}
                onChange={(e) => setResumeConfirmed(e.target.checked)}
              />{" "}
              I've checked the output and loaded paper
            </label>
            <button
              className="primary-button"
              disabled={!resumeConfirmed || !!busy}
              onClick={() =>
                task("Resuming existing job", async () => {
                  const result = await api<{ message: string }>("resume", {
                    id: resumeJob.id,
                    confirmed: true,
                  });
                  setResumeJob(null);
                  setNotice(result.message);
                  await poll();
                  await refresh();
                })
              }
            >
              Resume existing job <ArrowRight size={16} />
            </button>
            <button className="text-button" onClick={() => setResumeJob(null)}>
              Back to queue
            </button>
          </section>
        </div>
      )}
      {folderPath && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-title"
          >
            <div className="section-heading">
              <h2 id="folder-title">Choose documents</h2>
              <button
                className="icon-button"
                aria-label="Close folder review"
                onClick={() => setFolderPath("")}
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted small">{folderPath}</p>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => {
                  setRecursive(e.target.checked);
                  loadFolder(folderPath, e.target.checked);
                }}
              />{" "}
              Include subfolders
            </label>
            <div className="folder-list">
              {folderFiles.map((f) => (
                <label className="checkbox-line" key={f.path}>
                  <input
                    type="checkbox"
                    checked={folderChecked.has(f.path)}
                    onChange={() =>
                      setFolderChecked((prev) => {
                        const n = new Set(prev);
                        n.has(f.path) ? n.delete(f.path) : n.add(f.path);
                        return n;
                      })
                    }
                  />
                  <FileText size={16} />
                  <span>{f.name}</span>
                </label>
              ))}
              {!folderFiles.length && <p>No supported documents found.</p>}
            </div>
            <p className="tiny muted">
              {unsupported} unsupported files skipped. Up to 1,000 documents
              listed.
            </p>
            <button
              className="primary-button"
              disabled={!folderChecked.size || !!busy}
              onClick={() => {
                const paths = [...folderChecked];
                setFolderPath("");
                addFiles(paths);
              }}
            >
              Add {folderChecked.size} documents <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {closeOpen && (
        <div className="modal-backdrop">
          <section
            className="modal close-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-title"
          >
            <span className="job-icon">
              <Printer size={25} />
            </span>
            <h2 id="exit-title">Finish this session?</h2>
            <p>
              Exiting clears all documents, drafts, history and settings.
              Cancellation affects <strong>every local print queue</strong>,
              including jobs from other apps.
            </p>
            {finishing ? (
              <div className="message">
                <LoaderCircle className="spin" size={18} />
                Waiting for all local queues to clear…
              </div>
            ) : (
              <>
                <button
                  className="primary-button"
                  disabled={!!busy}
                  onClick={finishAndExit}
                >
                  Finish printing, then exit <ArrowRight size={16} />
                </button>
                <button
                  className="outline-button danger-text"
                  disabled={!!busy}
                  onClick={() => exit(true)}
                >
                  <Trash2 size={16} /> Cancel all printing and exit
                </button>
              </>
            )}
            <button
              className="text-button"
              onClick={() => {
                finishRef.current = false;
                setFinishing(false);
                setCloseOpen(false);
              }}
            >
              Keep working
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function SamplePage({ page }: { page: number }) {
  return (
    <div className="sample-page">
      <div className="sample-top">
        <span>NORTH / STUDIO</span>
        <span>2026</span>
      </div>
      <div className="sample-rule" />
      <p className="sample-kicker">PROJECT PROPOSAL</p>
      <h1>
        Good ideas.
        <br />
        On paper.
      </h1>
      <p className="sample-description">
        A considered approach to building things
        <br />
        that make everyday life a little better.
      </p>
      <div className="sample-block">
        <span>01 / THE OVERVIEW</span>
        <h3>Clarity comes first.</h3>
        <p>
          Every project begins with a simple question. What matters most? This
          proposal outlines our approach, the work ahead, and a shared direction
          for what comes next.
        </p>
        <div className="sample-line" />
        <div className="sample-line short" />
      </div>
      <div className="sample-grid">
        <div>
          <span>PREPARED FOR</span>
          <strong>The next chapter</strong>
        </div>
        <div>
          <span>PREPARED BY</span>
          <strong>North Studio</strong>
        </div>
      </div>
      <div className="sample-page-number">
        <span>PRIVATE & CONFIDENTIAL</span>
        <span>{String(page).padStart(2, "0")} / 12</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
