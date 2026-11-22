// app.js - login, profiles, Home and Settings (Step 2)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, PEOPLE } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

/* ---------- Small helpers ---------- */
const PAGES = ["home", "tasks", "restock", "calendar", "more"];
const NAV = [
  ["home", "Home", '<path d="M4 11l8-7 8 7v9H4z"/>'],
  ["tasks", "Tasks", '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'],
  ["restock", "Restock", '<path d="M5 7h14l-1 12H6z"/><path d="M9 7a3 3 0 016 0"/>'],
  ["calendar", "Calendar", '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ["more", "More", '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>']
];

// Build the bottom navigation bar (fixed icons, no user text).
$("nav").innerHTML = NAV.map(
  (n) => `<button data-p="${n[0]}"><svg viewBox="0 0 24 24">${n[2]}</svg>${n[1]}</button>`
).join("");
$("nav").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) go(b.dataset.p);
});

function go(p) {
  PAGES.forEach((id) => $(id).classList.toggle("on", id === p));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
  $(p).scrollTop = 0;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1800);
}

function show(which) {
  $("loading").classList.toggle("on", which === "loading");
  $("login").classList.toggle("on", which === "login");
  const inApp = which === "main";
  $("nav").classList.toggle("on", inApp);
  if (!inApp) PAGES.forEach((id) => $(id).classList.remove("on"));
  else go("home");
}

/* ---------- Theme ---------- */
function applyTheme(choice) {
  const dark = choice === "dark" || (choice !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "";
}
let themeChoice = "auto";
try { themeChoice = localStorage.getItem("theme") || "auto"; } catch (e) {}
applyTheme(themeChoice);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(themeChoice));

/* ---------- Dates ---------- */
function daysTogether(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.max(0, Math.round((today - start) / 864e5));
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------- Sign in and out ---------- */
function findPerson(email) {
  return PEOPLE.find((p) => p.email === (email || "").toLowerCase());
}

$("signin").addEventListener("click", async () => {
  $("err").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") $("err").textContent = "Sign-in did not finish. Please try again.";
  }
});
$("signout").addEventListener("click", () => signOut(auth));

/* ---------- Live data ---------- */
let stops = [];
const users = {};
let settings = {};
let myUid = null;
let myPerson = null;
let filled = { name: false, start: false };

function nameOf(uid, person) {
  return (users[uid] && users[uid].name) || person.defaultName;
}

function render() {
  if (!myUid) return;
  const partnerPerson = PEOPLE.find((p) => p.email !== myPerson.email);
  const partnerEntry = Object.entries(users).find(([id, u]) => u.email === partnerPerson.email);
  const myName = nameOf(myUid, myPerson);
  const partnerName = partnerEntry ? partnerEntry[1].name : partnerPerson.defaultName;

  $("hello").textContent = "Hello, " + myName;
  $("me").textContent = myName.charAt(0).toUpperCase();
  $("av1").textContent = myName.charAt(0).toUpperCase();
  $("av2").textContent = partnerName.charAt(0).toUpperCase();
  $("today").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  $("partner").textContent = partnerEntry
    ? partnerName + " has signed in ✓"
    : "Waiting for " + partnerPerson.defaultName + " to sign in for the first time";

  if (settings.relationshipStart) {
    $("days").textContent = daysTogether(settings.relationshipStart).toLocaleString("en-US");
    $("dayslabel").textContent = "days together ✦";
    $("since").textContent = "Since " + prettyDate(settings.relationshipStart);
  } else {
    $("days").textContent = "–";
    $("dayslabel").textContent = "Set your start date in More";
    $("since").textContent = "";
  }

  // Fill the form boxes once, so we never overwrite what you are typing.
  if (!filled.name && document.activeElement !== $("name")) { $("name").value = myName; filled.name = true; }
  if (!filled.start && settings.relationshipStart && document.activeElement !== $("start")) {
    $("start").value = settings.relationshipStart; filled.start = true;
  }
}

$("savename").addEventListener("click", async () => {
  const name = $("name").value.trim();
  if (!name) { toast("Please type a name"); return; }
  try {
    await updateDoc(doc(db, "users", myUid), { name });
    toast("Name saved ✓");
  } catch (e) { toast("Could not save. Try again."); }
});

$("savestart").addEventListener("click", async () => {
  const v = $("start").value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Please choose a date"); return; }
  try {
    await setDoc(doc(db, "shared", "settings"), { relationshipStart: v }, { merge: true });
    toast("Date saved ✓");
  } catch (e) { toast("Could not save. Try again."); }
});

$("theme").addEventListener("change", async () => {
  themeChoice = $("theme").value;
  try { localStorage.setItem("theme", themeChoice); } catch (e) {}
  applyTheme(themeChoice);
  try { await updateDoc(doc(db, "users", myUid), { theme: themeChoice }); } catch (e) {}
});

/* ---------- When sign-in changes ---------- */
onAuthStateChanged(auth, async (user) => {
  stops.forEach((s) => s());
  stops = [];
  myUid = null;

  if (!user) { show("login"); return; }

  // Only our two verified Google accounts may continue.
  const person = findPerson(user.email);
  if (!person || !user.emailVerified) {
    await signOut(auth);
    $("err").textContent = "This account is not allowed in this app.";
    show("login");
    return;
  }

  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name: person.defaultName, email: user.email.toLowerCase(), createdAt: serverTimestamp() });
    }

    myUid = user.uid;
    myPerson = person;
    filled = { name: false, start: false };
    $("email").textContent = user.email;

    stops.push(onSnapshot(collection(db, "users"), (s) => {
      s.docs.forEach((d) => { users[d.id] = d.data(); });
      const mine = users[myUid];
      if (mine && mine.theme && mine.theme !== themeChoice) {
        themeChoice = mine.theme;
        try { localStorage.setItem("theme", themeChoice); } catch (e) {}
        applyTheme(themeChoice);
      }
      $("theme").value = themeChoice;
      render();
    }));
    stops.push(onSnapshot(doc(db, "shared", "settings"), (s) => {
      settings = s.exists() ? s.data() : {};
      render();
    }));

    $("theme").value = themeChoice;
    render();
    show("main");
  } catch (e) {
    await signOut(auth);
    $("err").textContent = "Could not reach your data (" + (e.code || e.message) + ")";
    show("login");
  }
});
