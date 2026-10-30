/* Injected by the My School ID Admin Android app.
 * Makes website-generated files (Excel, ZIP, PDF, images — blob:/data: links) save to the
 * phone's Downloads folder, and maps window.print / navigator.share to Android. */
(function () {
  if (window.__msidcApp) return;
  window.__msidcApp = true;
  var B = window.MSIDCAndroid;
  if (!B) return;

  // The screens are inside the app, so the website's service worker is not needed.
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
      navigator.serviceWorker.register = function () { return Promise.reject(new Error("Not used in the app")); };
    }
  } catch (e) {}

  var blobs = {};
  var origCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = origCreate.apply(URL, arguments);
    try { if (obj instanceof Blob) blobs[url] = obj; } catch (e) {}
    return url;
  };
  var origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url) {
    // Keep the blob a little longer so the app can still save it.
    setTimeout(function () { delete blobs[url]; try { origRevoke.call(URL, url); } catch (e) {} }, 120000);
  };

  function save(blob, name) {
    var id = B.begin(String(name || ""), String(blob.type || ""), blob.size || 0);
    if (!id) return;
    var CHUNK = 768 * 1024, offset = 0;
    function next() {
      if (offset >= blob.size) { B.end(id); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || "");
        B.chunk(id, s.substring(s.indexOf(",") + 1));
        offset += CHUNK;
        next();
      };
      reader.onerror = function () { B.fail(id, String(reader.error || "read error")); };
      reader.readAsDataURL(blob.slice(offset, offset + CHUNK));
    }
    next();
  }

  function saveUrl(href, name) {
    if (blobs[href]) { save(blobs[href], name); return; }
    fetch(href).then(function (r) { return r.blob(); })
      .then(function (b) { save(b, name); })
      .catch(function (e) { B.fail("", "Download failed: " + e); });
  }
  window.__msidcSaveUrl = saveUrl;

  function isFileLink(a) {
    var h = (a && a.href) || "";
    return h.indexOf("blob:") === 0 || h.indexOf("data:") === 0;
  }
  function dl(a) { saveUrl(a.href, a.getAttribute("download") || ""); }

  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (a && isFileLink(a)) { ev.preventDefault(); ev.stopImmediatePropagation(); dl(a); }
  }, true);

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isFileLink(this)) { dl(this); return; }
    return origClick.apply(this, arguments);
  };
  var origDispatch = EventTarget.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === "click" && isFileLink(this)) { dl(this); return false; }
    return origDispatch.call(this, ev);
  };

  window.print = function () { B.print(document.title || "My School ID Card"); };

  try {
    navigator.share = function (data) {
      data = data || {};
      if (data.files && data.files.length) {
        for (var i = 0; i < data.files.length; i++) save(data.files[i], data.files[i].name);
        return Promise.resolve();
      }
      B.share(String(data.title || ""), String(data.text || ""), String(data.url || ""));
      return Promise.resolve();
    };
    navigator.canShare = function () { return true; };
  } catch (e) {}
})();
