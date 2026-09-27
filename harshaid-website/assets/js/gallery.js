window.GALLERY = [
  { title: "Student ID layout", category: "ID Cards", src: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80" },
  { title: "Staff identity sample", category: "ID Cards", src: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80" },
  { title: "Card production", category: "Printing", src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=900&q=80" },
  { title: "Print workflow", category: "Printing", src: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=900&q=80" },
  { title: "Admin dashboard", category: "Software", src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80" },
  { title: "Campus records", category: "Software", src: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80" },
  { title: "Lanyards", category: "Accessories", src: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80" },
  { title: "Holders and badges", category: "Accessories", src: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80" },
  { title: "Campus project", category: "Projects", src: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=900&q=80" },
  { title: "Institution project", category: "Projects", src: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80" },
];

(function () {
  const root = document.querySelector("[data-gallery]");
  if (!root) return;
  const filters = document.querySelector("[data-filters]");
  const limit = Number(root.dataset.limit || 0);
  const cats = ["All", ...new Set(window.GALLERY.map((item) => item.category))];
  const shown = filters ? (root.dataset.limit ? ["All", "ID Cards", "Printing", "Software", "Accessories"] : ["All", "ID Cards", "Printing", "Software", "Accessories", "Projects"]) : ["All"];
  let active = "All";
  let index = 0;

  function items() {
    const list = window.GALLERY.filter((item) => active === "All" || item.category === active);
    return limit ? list.slice(0, limit) : list;
  }

  function render() {
    const list = items();
    root.innerHTML = list.map((item, i) => `
      <button class="shot" type="button" data-i="${i}">
        <img src="${item.src}" alt="${item.title}" />
        <span>View</span>
      </button>`).join("");
    root.querySelectorAll(".shot").forEach((btn) => {
      btn.addEventListener("click", () => open(Number(btn.dataset.i)));
    });
  }

  if (filters) {
    filters.innerHTML = shown.filter((c) => cats.includes(c) || c === "All").map((c) => `<button type="button" data-cat="${c}" class="${c === "All" ? "active" : ""}">${c}</button>`).join("");
    filters.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      active = btn.dataset.cat;
      filters.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === btn));
      render();
    });
  }

  const box = document.getElementById("lightbox");
  const img = box.querySelector("img");
  const title = document.getElementById("lbTitle");
  function open(i) {
    const list = items();
    index = i;
    const item = list[index];
    img.src = item.src;
    img.alt = item.title;
    title.textContent = item.title;
    box.classList.add("open");
  }
  function step(dir) {
    const list = items();
    index = (index + dir + list.length) % list.length;
    open(index);
  }
  box.querySelector(".lb-close").addEventListener("click", () => box.classList.remove("open"));
  box.querySelector(".lb-prev").addEventListener("click", () => step(-1));
  box.querySelector(".lb-next").addEventListener("click", () => step(1));
  render();
})();
