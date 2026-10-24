import { test, expect } from "@playwright/test";

test("ordered selection, copies, invalid input and file switching", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo");
  await expect(
    page.getByRole("button", { name: "Print 8 sheets" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Custom page order" })
    .fill("9,1,8,4,12,5");
  await expect(
    page.getByRole("button", { name: "Print 9 sheets" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "More copies" }).click();
  await expect(
    page.getByRole("button", { name: "Print 15 sheets" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Custom page order" }).fill("99");
  await expect(
    page.getByRole("button", { name: /Print \d+ sheets/ }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("between 1 and 12");
  await page
    .getByRole("button", { name: /Meeting notes.docx 3 pages/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Pages", exact: true }),
  ).toHaveText("All pages");
  await expect(page.getByLabel("Copies", { exact: true })).toHaveValue("1");
  expect(errors).toEqual([]);
});

test("capabilities hide duplex, navigation and screenshot", async ({
  page,
}) => {
  await page.goto("/?demo");
  await page.getByRole("combobox", { name: "Sides", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "website/assets/workspace-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Printers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Printers & setup." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Queue 0" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing waiting." }),
  ).toBeVisible();
});

test("narrow tiling keeps settings usable", async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 650 });
  await page.goto("/?demo");
  await page
    .getByRole("button", { name: "Print settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Print 8 sheets" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("empty workspace does not fake printers or print capability", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little less guesswork/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print 0 sheets" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Choose documents" }).click();
  await expect(page.getByRole("status")).toContainText("desktop app");
});

test("custom dropdown keyboard selection and per-file settings stay isolated", async ({
  page,
}) => {
  await page.goto("/?demo");
  const pages = page.getByRole("combobox", { name: "Pages", exact: true });
  await pages.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(pages).toHaveText("Odd pages");
  await expect(
    page.getByRole("button", { name: "Print 9 sheets" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Custom settings for this file" })
    .check();
  await page.getByRole("combobox", { name: "Scaling", exact: true }).click();
  await page.getByRole("option", { name: "Actual size", exact: true }).click();
  await page
    .getByRole("button", { name: /Meeting notes.docx 3 pages/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Scaling", exact: true }),
  ).toHaveText("Fit to paper");
  await page.getByRole("combobox", { name: "Selected printer" }).click();
  await page.screenshot({ path: "website/assets/printer-picker.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
});

test("appearance changes visible colours and preserves the document preview", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?demo");
  const background = () =>
    page
      .locator(".topbar")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const paper = () =>
    page
      .locator(".paper")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const dark = await background(),
    documentColour = await paper();
  const appearance = page.getByRole("combobox", {
    name: "Appearance",
    exact: true,
  });
  await appearance.click();
  await page.getByRole("option", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await background()).not.toBe(dark);
  expect(await paper()).toBe(documentColour);
  await page.emulateMedia({ colorScheme: "light" });
  await appearance.click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.click();
  await page.getByRole("option", { name: "System", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "website/assets/dark-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByRole("status")).toContainText("desktop app");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const version of ["0.2.0", "0.1.0", "0.3.0", "offline"]) {
  test(`startup update check: ${version}`, async ({ page }) => {
    await page.addInitScript(
      ({ version }) => {
        const w = window as any;
        w.updateChecks = 0;
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
            if (args.action === "check-update") {
              w.updateChecks++;
              if (version === "offline") throw Error("Connection unavailable");
              return {
                current: "0.2.0",
                version,
                available: version === "0.3.0",
                notes: "New release notes from GitHub.",
              };
            }
            if (args.action === "install-update")
              return { message: "Installed. Quit and reopen." };
            if (args.action === "discover") return { printers: [] };
            if (args.action === "status") return { active: [], jobs: [] };
            if (args.action === "diagnostics")
              return { checks: [], desktop: "Test", session: "wayland" };
            throw Error("Unexpected operation: " + args.action);
          },
        };
        w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      },
      { version },
    );
    await page.goto("/");
    await expect
      .poll(() => page.evaluate(() => (window as any).updateChecks))
      .toBe(1);
    const dialog = page.getByRole("dialog");
    if (version === "0.3.0") {
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("New release notes from GitHub.");
      await expect(dialog).not.toContainText("A little more at home.");
      await expect(
        page.getByRole("button", { name: "Close updates" }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        page.getByRole("button", { name: "Install 0.3.0" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "Check for updates" }).click();
      await expect(dialog).toBeVisible();
      await page.getByRole("button", { name: "Install 0.3.0" }).click();
      await expect(dialog).toContainText("Update installed.");
      await expect(dialog).toContainText("Quit and reopen");
    } else {
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "Check for updates" }).click();
      await expect(page.locator(".update-status")).toContainText(
        version === "offline" ? "Connection unavailable" : "You’re up to date.",
      );
      await expect(dialog).toHaveCount(0);
    }
  });
}
