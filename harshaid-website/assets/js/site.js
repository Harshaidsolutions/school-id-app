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

  document.querySelector("[data-header]").innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <header class="header">
      <div class="wrap header-inner"><a class="site-brand" href="/" aria-label="Harsha ID Solutions home"><img src="/assets/images/harsha-official-logo.png" alt="Harsha ID Solutions"/></a>
        <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav">
          ${links
            .map(
              ([id, href, label]) =>
                `<a href="${href}" class="${page === id ? "active" : ""}">${label}</a>`
            )
            .join("")}
        </nav>
      </div>
    </header>`;

  document.querySelector("[data-footer]").innerHTML = `
    <footer class="footer">
      <div class="wrap footer-grid">
        <div>
          <h2>Contact</h2>
          <a href="tel:${site.phone}">${site.phone}</a>
          <a href="${site.whatsapp}">WhatsApp</a>
          <a href="mailto:${site.email}">${site.email}</a>
        </div>
        <div>
          <h2>Social</h2>
          <div class="socials">
            <a href="${site.social.facebook}">Facebook</a>
            <a href="${site.social.instagram}">Instagram</a>
            <a href="${site.social.youtube}">YouTube</a>
            <a href="${site.whatsapp}">WhatsApp</a>
            <a href="mailto:${site.email}">Email</a>
          </div>
        </div>
      </div>
      <div class="wrap footer-bottom">© All Rights Reserved to Harsha ID Solutions</div>
    </footer>`;

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
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />
          <h3>${escapeHtml(product.name)}</h3>
          <a class="button book-product" target="_blank" rel="noopener noreferrer" href="${escapeHtml(site.whatsapp + '?text=' + encodeURIComponent('Hello, I would like to order ' + product.name + '. Please share the price and availability.\nProduct image: ' + new URL(product.image, location.origin).href))}">Book Now ↗</a>
          <button class="share-product" type="button" data-product="${escapeHtml(product.name)}">Share product image</button>
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
    clientsRoot.innerHTML = (site.clients || [])
      .map(
        (name) => `
        <article class="client-card">
          <img src="${escapeHtml(image)}" alt="" loading="lazy" />
          <h3>${escapeHtml(name)}</h3>
        </article>`
      )
      .join("");
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
})();
