(function () {
  const site = window.SITE;
  const page = document.body.dataset.page || "home";

  const links = [
    ["home", "/", "Home"],
    ["contact", "/contact-us", "Contact Us"],
    ["about", "/about-us", "About Us"],
    ["brochures", "/brochures", "Brochures"],
    ["videos", "/videos", "Videos"],
    ["buy", "/buy-now", "Buy Now"],
    ["touch", "/get-in-touch", "Get in Touch"],
    ["app", "/my-app", "My App"],
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const ICONS = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8zM9.7 15V9l5.8 3-5.8 3z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-6.2-8-12a8 8 0 0 1 16 0c0 5.8-8 12-8 12z"/><circle cx="12" cy="10" r="3"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    idcard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="8" cy="12" r="2.5"/><path d="M14 10h5M14 14h3"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
    android: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.6 2.3c-.3.3-.4.7-.4 1.2v17c0 .5.1.9.4 1.2l9.5-9.7zm10.9 8.3 2.7-2.8-11-6.3c-.3-.2-.7-.3-1-.3zm0 2.8-9.3 9.4c.3 0 .7-.1 1-.3l11-6.3zm4-2.3-2.4-1.4-3 3 3 3 2.4-1.4c.7-.4 1-1 1-1.6s-.3-1.2-1-1.6z"/></svg>',
  };
  window.SITE_ICONS = ICONS;
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const svg = ICONS[el.dataset.icon];
    if (svg) el.innerHTML = svg;
  });

  document.querySelector("[data-header]").innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="topbar" aria-hidden="true"></div>
    <header class="header">
      <div class="wrap header-inner"><a class="site-brand" href="/" aria-label="Harsha ID Solutions home"><img src="/assets/images/harsha-official-logo.png" alt="Harsha ID Solutions"/></a>
        <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="nav" aria-label="Menu"><span></span></button>
        <nav class="nav" id="nav">
          ${links
            .map(
              ([id, href, label], i) =>
                `<a href="${href}" class="${page === id ? "active" : ""}${i === links.length - 1 ? " nav-cta" : ""}"${page === id ? ' aria-current="page"' : ""}>${label}</a>`
            )
            .join("")}
        </nav>
      </div>
    </header>`;

  document.querySelector("[data-footer]").innerHTML = `
    <footer class="footer">
      <div class="wrap footer-grid">
        <div class="footer-brand">
          <img src="${site.logo}" alt="Harsha ID Solutions" loading="lazy"/>
          <p>${escapeHtml(site.tagline)} ID cards, school essentials and personalised products since 2016.</p>
        </div>
        <div>
          <h2>Explore</h2>
          ${links.slice(0, 5).map(([, href, label]) => `<a href="${href}">${label}</a>`).join("")}
        </div>
        <div>
          <h2>Contact</h2>
          <a href="tel:${site.phone}">${site.phone}</a>
          <a href="${site.whatsapp}">WhatsApp</a>
          <a href="mailto:${site.email}">${site.email}</a>
        </div>
        <div>
          <h2>Social</h2>
          <div class="socials">
            <a class="fb" href="${site.social.facebook}" aria-label="Facebook">${ICONS.facebook}</a>
            <a class="ig" href="${site.social.instagram}" aria-label="Instagram">${ICONS.instagram}</a>
            <a class="yt" href="${site.social.youtube}" aria-label="YouTube">${ICONS.youtube}</a>
            <a class="wa" href="${site.whatsapp}" aria-label="WhatsApp">${ICONS.whatsapp}</a>
            <a class="em" href="mailto:${site.email}" aria-label="Email">${ICONS.mail}</a>
          </div>
        </div>
      </div>
      <div class="wrap footer-bottom"><span>© All Rights Reserved to Harsha ID Solutions</span><span>${escapeHtml(site.tagline)}</span></div>
    </footer>
    <a class="wa-float" href="${site.whatsapp}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">${ICONS.whatsapp}</a>`;

  const onScroll = () => document.body.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const nav = document.getElementById("nav");
  const menuBtn = document.getElementById("menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (event) => {
    if (nav.classList.contains("open") && !nav.contains(event.target) && !menuBtn.contains(event.target)) {
      nav.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("open")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.focus(); }
  });

  const aboutRoot = document.querySelector("[data-about]");
  if (aboutRoot) {
    aboutRoot.innerHTML = site.about
      .map((block) =>
        block.kind === "heading"
          ? `<h2 class="${block.text.includes("GET IDENTITY HERE") ? "identity-line" : ""}">${escapeHtml(block.text)}</h2>`
          : `<p>${escapeHtml(block.text)}</p>`
      )
      .join("");
  }

  const productsRoot = document.querySelector("[data-products]");
  if (productsRoot) {
    productsRoot.innerHTML = site.products
      .map(
        (product) => `
        <article class="product-card">
          <div class="product-media"><span class="product-tag" aria-hidden="true"></span><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
          <h3>${escapeHtml(product.name)}</h3>
          <a class="button book-product" target="_blank" rel="noopener noreferrer" href="${escapeHtml(site.whatsapp + '?text=' + encodeURIComponent('Hello, I would like to order ' + product.name + '. Please share the price and availability.\nProduct image: ' + new URL(product.image, location.origin).href))}">Book Now ↗</a>
          <button class="share-product" type="button" data-product="${escapeHtml(product.name)}">${ICONS.share}Share product image</button>
        </article>`
      )
      .join("");
  }

  productsRoot?.querySelectorAll(".share-product").forEach(button => {
    button.addEventListener("click", async () => {
      const product = site.products.find(item => item.name === button.dataset.product);
      if (!product) return;
      button.disabled = true;
      try {
        const response = await fetch(product.image);
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        const file = new File([blob], product.name.replace(/[^a-z0-9]/gi, "-") + (blob.type === "image/png" ? ".png" : ".jpg"), {type: blob.type});
        const data = {files: [file], title: product.name, text: "Hello, I would like to order " + product.name + ". Please share the price and availability."};
        if (navigator.canShare?.({files:[file]})) await navigator.share(data);
        else window.open(site.whatsapp + "?text=" + encodeURIComponent(data.text + "\nProduct image: " + new URL(product.image, location.origin).href), "_blank", "noopener,noreferrer");
      } catch (error) {
        if (error.name !== "AbortError") alert("Please use Book Now to send the product details and image link to our team.");
      } finally { button.disabled = false; }
    });
  });

  const clientsRoot = document.querySelector("[data-clients]");
  if (clientsRoot) {
    const image = site.clientImage;
    const card = (name) => `
        <article class="client-card">
          <img src="${escapeHtml(image)}" alt="" loading="lazy" />
          <h3>${escapeHtml(name)}</h3>
        </article>`;
    const all = site.clients || [];
    const half = Math.ceil(all.length / 2);
    const rows = [all.slice(0, half), all.slice(half)];
    clientsRoot.classList.remove("client-grid");
    clientsRoot.classList.add("client-marquee");
    clientsRoot.innerHTML = rows
      .map((row) => `<div class="client-track">${row.map(card).join("")}${row.map(card).join("").replace(/<article class="client-card">/g, '<article class="client-card" aria-hidden="true">')}</div>`)
      .join("");
  }

  // Count-up numbers (2016 stays as a year)
  const counters = document.querySelectorAll(".stat-card b");
  const runCount = (el) => {
    const raw = el.textContent.trim();
    const m = raw.match(/^(\d+)(.*)$/);
    if (!m || raw === "2016" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(m[1]), suffix = m[2];
    const start = performance.now(), dur = 1400;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window && counters.length) {
    const co = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { runCount(en.target); co.unobserve(en.target); } }), { threshold: 0.5 });
    counters.forEach((c) => co.observe(c));
  }

  const form = document.getElementById("enquiryForm");
  if (form) {
    const toast = document.getElementById("formToast");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      toast.hidden = true;
      toast.className = "toast";
      const data = new FormData(form);
      const payload = {
        name: String(data.get("name") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        message: String(data.get("message") || "").trim(),
      };
      const phoneDigits = payload.phone.replace(/\D/g, "");
      if (payload.name.length < 2 || payload.name.length > 80) {
        toast.hidden = false;
        toast.classList.add("error");
        toast.textContent = "Enter your name.";
        return;
      }
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        toast.hidden = false;
        toast.classList.add("error");
        toast.textContent = "Enter a valid phone number.";
        return;
      }
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        toast.hidden = false;
        toast.classList.add("error");
        toast.textContent = "Enter a valid email address.";
        return;
      }
      if (payload.message.length > 2000) {
        toast.hidden = false;
        toast.classList.add("error");
        toast.textContent = "Enter a shorter message.";
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        const response = await fetch(`${site.apiOrigin.replace(/\/$/, "")}/api/public/enquiry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.status !== "ok") {
          throw new Error(body.message || "Message could not be sent right now. Please call or use the phone number on Contact Us.");
        }
        form.reset();
        toast.hidden = false;
        toast.classList.add("ok");
        toast.textContent = "Your message sent\nOur representative will contact you shortly.";
      } catch (error) {
        toast.hidden = false;
        toast.classList.add("error");
        toast.textContent = error.message || "Message could not be sent right now. Please call or use the phone number on Contact Us.";
      } finally {
        button.disabled = false;
      }
    });
  }
  // Content remains visible when motion is reduced or observation is unavailable.
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("in-view"); observer.unobserve(entry.target); } });
    }, {threshold:0.06});
    document.querySelectorAll(".product-card,.stat-card,.contact-card,.feature-card,.about-copy,.form,.section-head,.promo,.brochure-card,.app-hero,.enquiry-copy a").forEach((el,i) => {
      el.classList.add("reveal"); el.style.setProperty("--delay", `${(i % 4)*45}ms`); observer.observe(el);
    });
  }
})();
