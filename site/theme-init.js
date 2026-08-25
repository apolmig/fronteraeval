(() => {
  "use strict";

  const STORAGE_KEY = "fronteraeval-theme";
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }

  const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = saved === "dark" || saved === "light"
    ? saved
    : prefersDark ? "dark" : "light";

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
