(function () {
  const site = window.SITE;
  const page = document.body.dataset.page || "home";

  function logo() {
    return `
      <a class="brand" href="index.html">
        <img class="brand-logo" src="${site.logo}" alt="Harsha ID Solutions" />
      </a>`;
  }

  const links = [
    ["home", "index.html", "Home"],
    ["about", "about.html", "About Us"],
    ["gallery", "gallery.html", "Gallery"],
    ["contact", "contact.html", "Contact Us"],
  ];

  document.querySelector("[data-header]").innerHTML = `
    <header class="header">
      <div class="wrap header-inner">
        ${logo()}
        <nav class="nav" id="nav">
          ${links.map(([id, href, label]) => `<a href="${href}" class="${page === id ? "active" : ""}">${label}</a>`).join("")}
        </nav>
        <div class="header-actions">
          <button class="icon-btn" id="searchBtn" aria-label="Search" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
          </button>
          <a class="btn btn-primary" href="contact.html">Get in Touch</a>
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
        </div>
      </div>
      <div class="search-panel" id="searchPanel">
        <input id="searchInput" placeholder="Search pages" aria-label="Search pages" />
        <div id="searchResults"></div>
      </div>
    </header>`;

  document.querySelector("[data-footer]").innerHTML = `
    <footer class="footer">
      <div class="wrap footer-grid">
        <div>
          ${logo()}
          <p>${site.description}</p>
        </div>
        <div>
          <h3>Quick Links</h3>
          <a href="index.html">Home</a>
          <a href="about.html">About Us</a>
          <a href="gallery.html">Gallery</a>
          <a href="contact.html">Contact Us</a>
        </div>
        <div>
          <h3>Our Services</h3>
          <a href="index.html#services">ID CARDS</a>
          <a href="index.html#services">TIES</a>
          <a href="index.html#services">MULTI COLOUR BELTS</a>
          <a href="index.html#services">REPORT CARDS</a>
          <a href="index.html#services">DAIRIES</a>
          <a href="index.html#services">T-SHIRT PRINTING</a>
          <a href="index.html#services">LOGO BADGES</a>
          <a href="index.html#services">SCREEN PRINTING</a>
        </div>
        <div>
          <h3>Contact Information</h3>
          <p>Phone<br><a href="tel:${site.phone}">${site.phone}</a></p>
          <p>WhatsApp<br><a href="${site.whatsapp}">${site.phone}</a></p>
          <p>Email<br><a href="mailto:${site.email}">${site.email}</a></p>
          <div class="socials">
            <a href="${site.social.facebook}" aria-label="Facebook">f</a>
            <a href="${site.social.instagram}" aria-label="Instagram">ig</a>
            <a href="${site.social.youtube}" aria-label="YouTube">yt</a>
          </div>
        </div>
      </div>
      <div class="wrap footer-bottom">
        <span>© All Rights Reserved to ${site.businessName}</span>
        <span>Privacy Policy | Terms & Conditions</span>
      </div>
    </footer>`;

  const header = document.querySelector(".header");
  window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8));
  document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("nav").classList.toggle("open"));

  const panel = document.getElementById("searchPanel");
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  document.getElementById("searchBtn").addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = links
      .filter(([, , label]) => !q || label.toLowerCase().includes(q))
      .map(([, href, label]) => `<a href="${href}">${label}</a>`)
      .join("");
  });
  input.dispatchEvent(new Event("input"));

  document.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    if (site[key]) el.textContent = site[key];
  });
})();
