window.GALLERY = [];

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

async function loadPublicShowcase() {
  const origin = window.SITE.apiOrigin.replace(/\/$/, "");
  const response = await fetch(`${origin}/api/public/showcase`);
  if (!response.ok) throw new Error("showcase unavailable");
  return response.json();
}

(function () {
  const schoolsRoot = document.querySelector("[data-schools]");
  const root = document.querySelector("[data-gallery]");
  if (!schoolsRoot && !root) return;

  loadPublicShowcase()
    .then((data) => {
      if (schoolsRoot) {
        const schools = data.schools || [];
        schoolsRoot.innerHTML = schools.length
          ? schools
              .map((school) => {
                const logo = school.logoUrl
                  ? `<img src="${escapeHtml(resolvePublicFile(school.logoUrl))}" alt="" />`
                  : "";
                return `<article class="card org-card">${logo}<h3>${escapeHtml(school.name)}</h3></article>`;
              })
              .join("")
          : `<p class="lead">No schools are available from the application yet.</p>`;
      }
      if (!root) return;
      window.GALLERY = (data.brochures || []).map((item) => ({
        title: item.name,
        category: "Brochures",
        src: resolvePublicFile(item.fileUrl),
      }));
      renderGallery(root);
    })
    .catch(() => {
      if (schoolsRoot) {
        schoolsRoot.innerHTML =
          `<p class="lead">School list could not be loaded.</p>`;
      }
      if (root) {
        root.innerHTML = `<p class="lead">Brochures could not be loaded.</p>`;
      }
    });
})();

function renderGallery(root) {
  const filters = document.querySelector("[data-filters]");
  const limit = Number(root.dataset.limit || 0);
  let active = "All";
  let index = 0;
  const box = document.getElementById("lightbox");
  if (!box) return;

  function items() {
    const list = window.GALLERY.filter(
      (item) => active === "All" || item.category === active
    );
    return limit ? list.slice(0, limit) : list;
  }

  function render() {
    const list = items();
    root.innerHTML = list.length
      ? list
          .map(
            (item, i) => `
      <button class="shot" type="button" data-i="${i}">
        <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}" />
        <strong>${escapeHtml(item.title)}</strong>
        <span>View</span>
      </button>`
          )
          .join("")
      : `<p class="lead">No brochures are available from the application yet.</p>`;
    root.querySelectorAll(".shot").forEach((btn) => {
      btn.addEventListener("click", () => open(Number(btn.dataset.i)));
    });
  }

  if (filters) {
    const cats = ["All", ...new Set(window.GALLERY.map((item) => item.category))];
    filters.innerHTML = cats
      .map(
        (c) =>
          `<button type="button" data-cat="${c}" class="${c === "All" ? "active" : ""}">${c}</button>`
      )
      .join("");
    filters.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      active = btn.dataset.cat;
      filters.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === btn));
      render();
    });
  }

  const img = box.querySelector("img");
  const title = document.getElementById("lbTitle");
  function open(i) {
    const list = items();
    if (!list.length) return;
    index = i;
    const item = list[index];
    img.src = item.src;
    img.alt = item.title;
    title.textContent = item.title;
    box.classList.add("open");
  }
  function step(dir) {
    const list = items();
    if (!list.length) return;
    index = (index + dir + list.length) % list.length;
    open(index);
  }
  box.querySelector(".lb-close").addEventListener("click", () => box.classList.remove("open"));
  box.querySelector(".lb-prev").addEventListener("click", () => step(-1));
  box.querySelector(".lb-next").addEventListener("click", () => step(1));
  render();
}
