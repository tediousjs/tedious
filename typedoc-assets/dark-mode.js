const html = document.documentElement;
const button = document.createElement("button");

button.className = "tsd-widget";
button.ariaLabel = "Toggle theme";
button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/></svg>';
button.onclick = () => {
  const theme = html.dataset.theme;
  const isDark = theme === "dark" || (theme === "os" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("tsd-theme", html.dataset.theme);
};
document.getElementById("tsd-search-trigger").before(button);
