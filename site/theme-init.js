(() => {
  "use strict";

  const STORAGE_KEY = "fronteraeval-theme";
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = saved === "dark" || saved === "light"
    ? saved
    : prefersDark ? "dark" : "light";

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
