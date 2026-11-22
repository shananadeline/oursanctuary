// notify.js - phone alerts: turning them on, choosing what you get, and sounds
import { getMessaging, getToken, deleteToken, isSupported }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { VAPID_KEY, WORKER_URL } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const CATS = [["tasks", "Tasks and bills"], ["restock", "Restock"], ["grocery", "Grocery and pantry reminders"], ["events", "Events and appointments"],
  ["chat", "Chat messages"], ["petcare", "Pet care and vet reminders"], ["petstock", "Pet food and supplies"], ["petins", "Pet insurance"],
  ["recipes", "Recipes and meal plans"], ["wishsave", "Wishlist and savings goals"], ["notes", "Notes"], ["expenses", "Expenses"]];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULTS = {
  enabled: true,
  cats: Object.fromEntries(CATS.map((c) => [c[0], true])),
  quiet: { on: true, start: "22:00", end: "07:00" },
  daily: { on: true, time: "08:00" },
  weekly: { on: true, day: 0, time: "19:00" }
};

let X = null; // things handed over by app.js

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const supportsPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function prefs() {
  const saved = (X && X.getUsers()[X.uid()] || {}).notif || {};
  return {
    enabled: saved.enabled !== false,
    cats: { ...DEFAULTS.cats, ...(saved.cats || {}) },
    quiet: { ...DEFAULTS.quiet, ...(saved.quiet || {}) },
    daily: { ...DEFAULTS.daily, ...(saved.daily || {}) },
    weekly: { ...DEFAULTS.weekly, ...(saved.weekly || {}) }
  };
}
async function savePrefs(p) {
  try {
    let tz = "Asia/Kuala_Lumpur";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
    await updateDoc(doc(X.db, "users", X.uid()), { notif: p, tz });
  } catch (e) { X.toast("Could not save. Try again."); }
}

/* ---------- Start ---------- */
export function initNotify(ctx) {
  X = ctx;
  // If alerts are already allowed on this device, keep this device's address up to date.
  if (supportsPush() && Notification.permission === "granted") registerDevice(true).catch(() => {});
}
export function stopNotify() { X = null; }

/* ---------- This device ---------- */
async function registerDevice(quiet) {
  if (!(await isSupported())) throw new Error("This browser can't receive alerts");
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(X.app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error("No alert address was given");
  await setDoc(doc(X.db, "devices", token), { uid: X.uid(), token, platform: isIOS() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Computer",
    ua: navigator.userAgent.slice(0, 140), lastSeen: serverTimestamp() }, { merge: true });
  try { localStorage.setItem("pushToken", token); } catch (e) {}
  return token;
}

async function turnOn() {
  if (!supportsPush()) { X.toast(isIOS() ? "Add the app to your Home Screen first" : "This browser can't show alerts"); return; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { X.toast("Alerts are blocked. Allow them in your phone settings."); renderNotifSettings(); return; }
  try { await registerDevice(false); X.toast("Alerts are on for this device ✓"); }
  catch (e) { X.toast(e.message || "Could not turn on alerts"); }
  renderNotifSettings();
}

async function turnOff() {
  await removeDevice();
  X.toast("Alerts are off for this device");
  renderNotifSettings();
}

// Called when turning alerts off or signing out, so this phone stops getting them.
export async function removeDevice() {
  if (!X) return;
  let token = "";
  try { token = localStorage.getItem("pushToken") || ""; } catch (e) {}
  try { if (await isSupported()) await deleteToken(getMessaging(X.app)); } catch (e) {}
  try { if (token) await deleteDoc(doc(X.db, "devices", token)); } catch (e) {}
  try { localStorage.removeItem("pushToken"); } catch (e) {}
}

/* ---------- In-app sounds ---------- */
const TONES = { chime: [880, 1320], soft: [523], bell: [988, 740, 988] };
const soundOn = () => { try { return localStorage.getItem("sound") === "1"; } catch (e) { return false; } };
const toneName = () => { try { return localStorage.getItem("tone") || "chime"; } catch (e) { return "chime"; } };
export function playTone(name) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    (TONES[name] || TONES.chime).forEach((f) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.32); t += 0.18;
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {}
}
export function playSound() { if (soundOn()) playTone(toneName()); }

/* ---------- Telling your partner (used once the Cloudflare helper is set up) ---------- */
export async function notifyPartner(category, title, body, url) {
  if (!X || !WORKER_URL) return;
  try {
    const token = await X.getIdToken();
    await fetch(WORKER_URL.replace(/\/$/, "") + "/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ category, title, body, url: url || "" }) });
  } catch (e) { /* alerts are a bonus, so never get in the way */ }
}

/* ---------- Settings screen ---------- */
function toggle(label, sub, on, onChange) {
  const sw = X.el("button", { class: "sw" + (on ? " on" : ""), "aria-label": label, "aria-pressed": String(!!on) });
  sw.addEventListener("click", () => { const v = !sw.classList.contains("on"); sw.classList.toggle("on", v); sw.setAttribute("aria-pressed", String(v)); onChange(v); });
  return X.el("div", { class: "row" }, X.el("div", { class: "t" }, X.el("b", { style: "font-weight:500", text: label }), sub ? X.el("span", { class: "sub", text: sub }) : null), sw);
}
function timeInput(value, onChange) {
  const i = X.el("input", { type: "time", style: "width:auto;margin:0;padding:8px 10px" });
  i.value = value;
  i.addEventListener("change", () => { if (i.value) onChange(i.value); });
  return i;
}

export function renderNotifSettings() {
  const box = $("notifBody");
  if (!box || !X || !X.uid()) return;
  const p = prefs();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const deviceOn = supportsPush() && perm === "granted" && (() => { try { return !!localStorage.getItem("pushToken"); } catch (e) { return false; } })();

  const nodes = [];
  // This device
  let status = "";
  if (!supportsPush()) status = isIOS() && !isStandalone() ? "On iPhone, alerts only work from the app on your Home Screen. Add it there first, then open it from the icon." : "This browser can't show alerts.";
  else if (perm === "denied") status = "Alerts are blocked for this app. Allow them in your phone's settings, then come back.";
  else if (deviceOn) status = "Alerts are on for this device.";
  else status = "Alerts are off on this device.";
  nodes.push(X.el("div", { class: "sub", style: "margin:6px 0 10px", text: status }));
  if (supportsPush() && perm !== "denied") {
    nodes.push(deviceOn
      ? X.el("button", { class: "btn ghost", text: "Turn off alerts on this device", onclick: turnOff })
      : X.el("button", { class: "btn", text: "Turn on alerts on this device", onclick: turnOn }));
  }
  nodes.push(X.el("div", { style: "margin-top:12px" }, X.el("button", { class: "tag", text: "Send a test alert", onclick: testAlert })));

  // What you get
  nodes.push(X.el("b", { style: "display:block;margin-top:18px", text: "What to be alerted about" }));
  nodes.push(toggle("All alerts", "Switch off to pause everything for you", p.enabled, (v) => { p.enabled = v; savePrefs(p); }));
  CATS.forEach(([k, label]) => nodes.push(toggle(label, "", p.cats[k], (v) => { p.cats[k] = v; savePrefs(p); })));

  // Quiet hours
  nodes.push(X.el("b", { style: "display:block;margin-top:18px", text: "Quiet hours" }));
  nodes.push(toggle("Don't alert me during quiet hours", "Alerts wait until the morning", p.quiet.on, (v) => { p.quiet.on = v; savePrefs(p); }));
  nodes.push(X.el("div", { style: "display:flex;gap:10px;align-items:center;margin:6px 0 4px" }, X.el("span", { class: "sub", text: "From" }),
    timeInput(p.quiet.start, (v) => { p.quiet.start = v; savePrefs(p); }), X.el("span", { class: "sub", text: "to" }), timeInput(p.quiet.end, (v) => { p.quiet.end = v; savePrefs(p); })));

  // Summaries
  nodes.push(X.el("b", { style: "display:block;margin-top:18px", text: "Summaries" }));
  nodes.push(toggle("Morning summary", "Today's tasks, events, bills and pet care", p.daily.on, (v) => { p.daily.on = v; savePrefs(p); }));
  nodes.push(X.el("div", { style: "margin:4px 0 8px" }, timeInput(p.daily.time, (v) => { p.daily.time = v; savePrefs(p); })));
  nodes.push(toggle("Weekly summary", "Spending, tasks done, what's coming up", p.weekly.on, (v) => { p.weekly.on = v; savePrefs(p); }));
  const day = X.el("select", { style: "width:auto;margin:0" }, DAYS.map((d, i) => X.el("option", { value: String(i), text: d })));
  day.value = String(p.weekly.day);
  day.addEventListener("change", () => { p.weekly.day = Number(day.value); savePrefs(p); });
  nodes.push(X.el("div", { style: "display:flex;gap:10px;align-items:center;margin:4px 0" }, day, timeInput(p.weekly.time, (v) => { p.weekly.time = v; savePrefs(p); })));

  // Sounds
  nodes.push(X.el("b", { style: "display:block;margin-top:18px", text: "Sounds" }));
  nodes.push(toggle("Sound when the app is open", "A short tone for new chat messages on this device", soundOn(), (v) => { try { localStorage.setItem("sound", v ? "1" : "0"); } catch (e) {} if (v) playTone(toneName()); }));
  const tone = X.el("select", { style: "width:auto;margin:0" }, [["chime", "Chime"], ["soft", "Soft"], ["bell", "Bell"]].map(([v, l]) => X.el("option", { value: v, text: l })));
  tone.value = toneName();
  tone.addEventListener("change", () => { try { localStorage.setItem("tone", tone.value); } catch (e) {} playTone(tone.value); });
  nodes.push(X.el("div", { style: "display:flex;gap:10px;align-items:center;margin:4px 0" }, tone, X.el("button", { class: "tag", text: "Play", onclick: () => playTone(tone.value) })));
  nodes.push(X.el("div", { class: "sub", style: "margin-top:6px", text: "The sound for alerts when the app is closed is set in your phone's settings. Web apps can't choose it." }));

  box.replaceChildren(...nodes);
}

async function testAlert() {
  if (!supportsPush() || Notification.permission !== "granted") { X.toast("Turn on alerts on this device first"); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Test alert ✦", { body: "Alerts are working on this device.", icon: "icon-192.png", badge: "favicon.png", tag: "test" });
    // When the Cloudflare helper is ready, this also sends a test through it.
    if (WORKER_URL) {
      const token = await X.getIdToken();
      const r = await fetch(WORKER_URL.replace(/\/$/, "") + "/test", { method: "POST", headers: { Authorization: "Bearer " + token } });
      X.toast(r.ok ? "Test alert sent ✓" : "The helper couldn't send it");
    }
  } catch (e) { X.toast("Could not show a test alert"); }
}
