import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
let directory: string, session: string, source: string;
const engine = resolve("backend/engine.py");
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "archjet-ui-test-"));
  session = join(directory, "session");
  mkdirSync(session);
  source = join(directory, "literal name (1).pdf");
  execFileSync("/usr/bin/python3", [
    "-c",
    `import sys;sys.path.insert(0,'tests');from test_engine import fixture_pdf;from pathlib import Path;fixture_pdf(Path(sys.argv[1]))`,
    source,
  ]);
});
test.afterAll(() => rmSync(directory, { recursive: true, force: true }));
test("native IPC contract: picker → real conversion → preview → close options", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("engineBridge", (command: string, args: any) => {
    if (command === "choose_files") return [source];
    if (command === "call") {
      if (args.action === "check-update")
        return {
          current: "0.2.0",
          version: "0.2.0",
          available: false,
          notes: "",
        };
      if (
        [
          "submit",
          "cancel",
          "recover",
          "cleanup",
          "startup",
          "open-cups",
        ].includes(args.action)
      )
        throw Error("Mutation disabled during integration test");
      return new Promise((resolve, reject) => {
        const child = spawn("/usr/bin/python3", [engine, session, args.action]);
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.on("close", () => {
          try {
            const data = JSON.parse(output);
            data.error ? reject(Error(data.error)) : resolve(data);
          } catch (e) {
            reject(e);
          }
        });
        child.stdin.end(JSON.stringify(args.payload));
      });
    }
    return null;
  });
  await page.addInitScript(() => {
    const w = window as any;
    let next = 1;
    const callbacks = new Map(),
      listeners = new Map();
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: (fn: any) => {
        const id = next++;
        callbacks.set(id, fn);
        return id;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (cmd: string, args: any) => {
        if (cmd === "plugin:event|listen") {
          listeners.set(args.event, args.handler);
          return args.handler;
        }
        if (cmd === "plugin:event|unlisten") return null;
        return w.engineBridge(cmd, args);
      },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.testClose = () => {
      const id = listeners.get("tauri://close-requested");
      callbacks.get(id)?.({
        event: "tauri://close-requested",
        id,
        payload: null,
      });
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose documents" }).click();
  await expect(
    page.getByRole("button", { name: /literal name \(1\).pdf 5 pages/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "literal name (1).pdf, page 1" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Pages", exact: true }).click();
  await page.getByRole("option", { name: "Custom order", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Custom page order" })
    .fill("5,1,3-2");
  await expect(
    page.getByRole("button", { name: "Print 4 sheets" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("img", { name: "literal name (1).pdf, page 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Minimise window" }).click();
  await page.getByRole("button", { name: "Maximise window" }).click();
  await page.getByRole("button", { name: "Close window", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Finish this session?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish printing, then exit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel all printing and exit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("paper recovery requires confirmation and resumes the original job only", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.testCalls = [];
    w.resumed = false;
    w.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command.startsWith("plugin:event|")) return 1;
        if (command !== "call") return null;
        w.testCalls.push({ action: args.action, payload: args.payload });
        if (args.action === "discover")
          return {
            printers: [
              {
                id: "Test",
                name: "Test printer",
                ready: false,
                connected: true,
                state: "disabled",
                default: true,
                papers: ["A4"],
                defaultPaper: "A4",
                duplex: [],
                colors: [],
              },
            ],
          };
        if (args.action === "diagnostics")
          return { checks: [], desktop: "Test", session: "wayland" };
        if (args.action === "status")
          return {
            active: w.resumed
              ? []
              : [
                  {
                    id: "Test-99",
                    owner: "test",
                    description: "Waiting for paper",
                    state: "held",
                    printerPaused: true,
                    reportedSheets: 0,
                  },
                ],
            jobs: [],
          };
        if (args.action === "resume") {
          w.resumed = true;
          return { message: "Original job resumed; no new request." };
        }
        throw Error("Unexpected operation: " + args.action);
      },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Queue 1" }).click();
  await expect(page.getByText("Printer paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Paper added / resume" }).click();
  await expect(
    page.getByRole("button", { name: "Resume existing job", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I've checked the output and loaded paper" })
    .check();
  await page
    .getByRole("button", { name: "Resume existing job", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nothing waiting." }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).testCalls);
  expect(calls.filter((c: any) => c.action === "resume")).toEqual([
    { action: "resume", payload: { id: "Test-99", confirmed: true } },
  ]);
  expect(calls.filter((c: any) => c.action === "submit")).toHaveLength(0);
});
