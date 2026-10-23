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
  await page.screenshot({ path: "docs/workspace-preview.png", fullPage: true });
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
  await page.screenshot({ path: "docs/printer-picker.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
});

test("appearance follows system, can be overridden, and release dialog is keyboard accessible", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?demo");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Updates and what’s new" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "desktop app",
  );
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await page.screenshot({ path: "docs/dark-preview.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Updates and what’s new" }),
  ).toBeFocused();
});
