document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu toggle
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Copy to clipboard for code blocks
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pre = btn.closest(".code-block")?.querySelector("pre");
      if (!pre) return;
      try {
        await navigator.clipboard.writeText(pre.textContent || "");
        btn.textContent = "Copied";
        btn.setAttribute("aria-label", "Copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.setAttribute("aria-label", "Copy to clipboard");
        }, 1500);
      } catch {
        btn.textContent = "Failed";
        btn.setAttribute("aria-label", "Failed to copy");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.setAttribute("aria-label", "Copy to clipboard");
        }, 1500);
      }
    });
  });

  // Active nav link
  const normalize = (p) => p.replace(/\/$/, "") || "/";
  const currentPath = normalize(location.pathname);
  const links = document.querySelectorAll(".site-nav a");
  links.forEach((link) => {
    const href = link.getAttribute("href");
    const linkPath = normalize(new URL(href, location.href).pathname);
    if (linkPath === currentPath) {
      link.style.color = "var(--fg)";
      link.style.fontWeight = "500";
    }
  });
});
