const menuButton = document.querySelector(".side-menu-toggle");
const sidebar = document.querySelector("#homepageSidebar");
const backdrop = document.querySelector(".side-menu-backdrop");
const closeTargets = document.querySelectorAll("[data-sidebar-close]");
const sidebarLinks = document.querySelectorAll(".sidebar-nav a");

function setSidebarOpen(isOpen) {
  if (!menuButton || !sidebar || !backdrop) return;
  menuButton.setAttribute("aria-expanded", String(isOpen));
  sidebar.hidden = !isOpen;
  backdrop.hidden = !isOpen;
}

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  setSidebarOpen(!isOpen);
});

closeTargets.forEach((target) => {
  target.addEventListener("click", () => setSidebarOpen(false));
});

sidebarLinks.forEach((link) => {
  link.addEventListener("click", () => setSidebarOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebarOpen(false);
  }
});
