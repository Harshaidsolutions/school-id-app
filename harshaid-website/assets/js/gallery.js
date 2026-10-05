function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicFile(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const origin = window.SITE.apiOrigin.replace(/\/$/, "");
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function isImage(url) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

async function loadPublicShowcase() {
  const origin = window.SITE.apiOrigin.replace(/\/$/, "");
  const response = await fetch(`${origin}/api/public/showcase`, { cache: "no-store" });
  if (!response.ok) throw new Error("showcase unavailable");
  return response.json();
}

(function () {
  const brochureRoot = document.querySelector("[data-brochures]");
  if (!brochureRoot) return;

  loadPublicShowcase()
    .then((data) => {
      const brochures = (data.brochures || []).filter((item) => item.fileUrl);
      const images = brochures.filter((item) => isImage(item.fileUrl));
      brochureRoot.innerHTML = brochures.length
        ? brochures
            .map((item) => {
              const src = resolvePublicFile(item.fileUrl);
              const imageIndex = images.findIndex((image) => image.fileUrl === item.fileUrl);
              if (!isImage(item.fileUrl)) {
                return `<a class="brochure-card" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">
                  <span class="file-mark">Brochure</span>
                </a>`;
              }
              return `<button class="brochure-card" type="button" aria-label="Open brochure ${imageIndex + 1}" data-i="${imageIndex}">
                <img src="${escapeHtml(src)}" alt="" loading="lazy" />
              </button>`;
            })
            .join("")
        : `<p class="empty">No brochures are available from the application yet.</p>`;

      const box = document.getElementById("lightbox");
      if (!box || !images.length) return;
      const img = box.querySelector("img");
      const title = document.getElementById("lbTitle");
      let index = 0;
      function open(i) {
        index = i;
        const item = images[index];
        img.src = resolvePublicFile(item.fileUrl);
        img.alt = "";
        title.textContent = "";
        box.classList.add("open");
        box.querySelector(".lb-close").focus();
      }
      brochureRoot.querySelectorAll("button[data-i]").forEach((button) => {
        button.addEventListener("click", () => open(Number(button.dataset.i)));
      });
      box.querySelector(".lb-close").addEventListener("click", () => box.classList.remove("open"));
      box.querySelector(".lb-prev").addEventListener("click", () => open((index + images.length - 1) % images.length));
      box.querySelector(".lb-next").addEventListener("click", () => open((index + 1) % images.length));
      document.addEventListener("keydown", (event) => {
        if (!box.classList.contains("open")) return;
        if (event.key === "Escape") box.classList.remove("open");
        if (event.key === "ArrowLeft") open((index + images.length - 1) % images.length);
        if (event.key === "ArrowRight") open((index + 1) % images.length);
      });
    })
    .catch(() => {
      brochureRoot.innerHTML = `<p class="empty">Brochures could not be loaded.</p>`;
    });
})();
