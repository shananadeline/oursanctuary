// sw.js - lets Our Sanctuary install like an app and open even without internet.
const CACHE = "oursanctuary-v3";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "firebase-config.js", "manifest.webmanifest",
  "chat.js", "bills.js", "expenses.js", "restock.js", "groceries.js", "recipes.js", "mealplan.js", "pantry.js",
  "avatar.js", "notify.js", "calendar.js", "wishlist.js", "savings.js", "notes.js", "pets.js", "petstock.js", "vet.js", "insurance.js", "petreports.js",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Alerts from the Cloudflare helper arrive here, even when the app is closed.
self.addEventListener("push", (e) => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (err) {}
  const title = d.title || "Our Sanctuary";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "favicon.png",
    tag: d.tag || undefined,
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  const sdk = url.href.startsWith("https://www.gstatic.com/firebasejs/");
  if (!ours && !sdk) return; // never touch Google sign-in, database or other websites

  // Firebase code files never change for a given version, so keep them.
  if (sdk) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Our own files: always try for the newest version, fall back to the saved one when offline.
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))
      )
  );
});
