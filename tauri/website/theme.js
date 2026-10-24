// Runs before styles to keep the first paint in the chosen appearance.
(() => {
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try {
    preference = localStorage.getItem("archjet-theme") || "system";
  } catch {}
  if (!["light", "dark", "system"].includes(preference)) preference = "system";
  function apply() {
    const theme =
      preference === "system"
        ? system.matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    for (const select of document.querySelectorAll("[data-theme-select]"))
      select.value = preference;
    for (const image of document.querySelectorAll("[data-theme-image]")) {
      if (image.dataset[theme + "Srcset"])
        image.srcset = image.dataset[theme + "Srcset"];
      image.src = image.dataset[theme];
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#171c19" : "#f7f7f4";
  }
  window.archjetTheme = {
    apply,
    set(value) {
      preference = ["light", "dark", "system"].includes(value)
        ? value
        : "system";
      try {
        localStorage.setItem("archjet-theme", preference);
      } catch {}
      apply();
    },
  };
  system.addEventListener("change", apply);
  addEventListener("storage", (event) => {
    if (event.key === "archjet-theme") {
      preference = event.newValue || "system";
      apply();
    }
  });
  apply();
})();
