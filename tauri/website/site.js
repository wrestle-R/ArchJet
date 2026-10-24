archjetTheme.apply();
for (const select of document.querySelectorAll("[data-theme-select]")) {
  select.addEventListener("change", () => archjetTheme.set(select.value));
}
for (const [index, pre] of [
  ...document.querySelectorAll(".doc pre"),
].entries()) {
  pre.id ||= `code-${index}`;
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";
  pre.before(wrapper);
  wrapper.append(pre);
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.copy = pre.id;
  button.className = "code-copy";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code block");
  wrapper.append(button);
}
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      document.querySelector("#copy-status").textContent = "Commands copied.";
    } catch {
      button.textContent = "Select commands";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copy));
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector("#copy-status").textContent =
        "Commands selected. Copy them with your keyboard.";
    }
  });
}

// A page-order example, kept separate from any document or printer access.
const examples = {
  all: {
    pages: [1, 2, 3, 4, 5, 6],
    expression: "1–6",
    caption: "All six pages. Start to finish.",
  },
  odd: {
    pages: [1, 3, 5],
    expression: "1,3,5",
    caption: "Only the odd pages. Nothing in between.",
  },
  custom: {
    pages: [1, 5, 2, 3, 4, 1],
    expression: "1,5,2–4,1",
    caption: "Six pages. In exactly that order.",
  },
};
for (const button of document.querySelectorAll("[data-sequence]")) {
  button.addEventListener("click", () => {
    const example = examples[button.dataset.sequence];
    for (const option of document.querySelectorAll("[data-sequence]"))
      option.setAttribute("aria-pressed", String(option === button));
    const sheets = example.pages.map((page, index) => {
      const sheet = document.createElement("li");
      const order = document.createElement("span");
      order.className = "sheet-index";
      order.textContent = String(index + 1).padStart(2, "0");
      const number = document.createElement("strong");
      number.textContent = page;
      const lines = document.createElement("span");
      lines.className = "sheet-lines";
      lines.setAttribute("aria-hidden", "true");
      const footer = document.createElement("span");
      footer.className = "sheet-footer";
      footer.textContent = `ARCHJET / PAGE ${page}`;
      sheet.append(order, number, lines, footer);
      return sheet;
    });
    document.getElementById("page-sequence").replaceChildren(...sheets);
    document.getElementById("sequence-expression").textContent =
      example.expression;
    document.getElementById("sequence-status").textContent = example.caption;
  });
}
const preview = document.getElementById("workspace-dialog");
if (preview) {
  for (const button of document.querySelectorAll("[data-open-preview]"))
    button.addEventListener("click", () => preview.showModal());
  document
    .querySelector("[data-close-preview]")
    .addEventListener("click", () => preview.close());
  preview.addEventListener("click", (event) => {
    if (event.target === preview) preview.close();
  });
}
const outline = document.querySelector(".page-outline");
if (outline) {
  const narrow = matchMedia("(max-width: 800px)");
  const resizeOutline = () => {
    outline.open = !narrow.matches;
  };
  resizeOutline();
  narrow.addEventListener("change", resizeOutline);
  const links = [...outline.querySelectorAll("a")];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links) {
          if (link.hash === `#${entry.target.id}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-110px 0px -65% 0px", threshold: 0 },
  );
  for (const heading of document.querySelectorAll("article h2[id]"))
    observer.observe(heading);
}
