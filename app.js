// app.js - login, profiles, Home, Settings and Tasks (Step 3)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, deleteField,
  runTransaction, serverTimestamp, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, PEOPLE } from "./firebase-config.js";
import { setAvatar, pickPhoto } from "./avatar.js";
import { startChat, onChatOpen, onChatClose, refreshChat } from "./chat.js";
import { startVet } from "./vet.js";
import { startPetReports, onPetReportOpen } from "./petreports.js";
import { startInsurance, refreshInsurance, policySheet } from "./insurance.js";
import { startPets, refreshPets, getPets, edit as petEdit } from "./pets.js";
import { startPetstock, onPetstockOpen, refreshPetstock, itemSheet as stockSheet } from "./petstock.js";
import { startNotes, onNotesOpen, refreshNotes, sheet as noteSheet } from "./notes.js";
import { startWishlist, onWishlistOpen, refreshWishlist, sheet as wishSheet } from "./wishlist.js";
import { startSavings, onSavingsOpen, refreshSavings, edit as goalEdit } from "./savings.js";
import { startCalendar, onCalendarOpen, refreshCalendar, newEventOnSelected } from "./calendar.js";
import { startPantry, onPantryOpen, refreshPantry, sheet as pantrySheet, addFromRestock } from "./pantry.js";
import { startMealplan, onMealsOpen, refreshMeals } from "./mealplan.js";
import { startRecipes, onRecipesOpen, refreshRecipes, edit as recipeEdit } from "./recipes.js";
import { startGroceries, onGroceriesOpen, refreshGroceries } from "./groceries.js";
import { startRestock, onRestockOpen, refreshRestock, sheet as restockSheet } from "./restock.js";
import { startExpenses, onExpensesOpen, refreshExpenses, sheet as expenseSheet } from "./expenses.js";
import { startBills, onBillsOpen, refreshBills, openSheet as openBillSheet } from "./bills.js";

// Lets the app install on a phone and open without internet.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));

/* ---------- Helpers ---------- */
// Builds page pieces safely. Text is always added as plain text, never as HTML.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c) e.append(c); });
  return e;
}
const DOT = "\u00A0· "; // keeps the dot with the item before it

const PAGES = ["home", "tasks", "restock", "calendar", "more", "chat", "bills", "expenses", "groceries", "recipes", "mealplan", "pantry", "wishlist", "savings", "notes", "pets", "petdetail", "petstock", "insurance", "petreport", "settings"];
let page = "home";
const NAV = [
  ["home", "Home", '<path d="M4 11l8-7 8 7v9H4z"/>'],
  ["tasks", "Tasks", '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'],
  ["restock", "Restock", '<path d="M5 7h14l-1 12H6z"/><path d="M9 7a3 3 0 016 0"/>'],
  ["calendar", "Calendar", '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ["more", "More", '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>']
];
$("nav").innerHTML = NAV.map((n) => `<button data-p="${n[0]}"><svg viewBox="0 0 24 24">${n[2]}</svg>${n[1]}</button>`).join("");
$("nav").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.p); });

function go(p) {
  PAGES.forEach((id) => $(id).classList.toggle("on", id === p));
  page = p;
  const navP = p === "chat" ? "home" : (p === "bills" || p === "expenses" || p === "groceries" || p === "recipes" || p === "mealplan" || p === "pantry" || p === "wishlist" || p === "savings" || p === "notes" || p === "pets" || p === "petdetail" || p === "petstock" || p === "insurance" || p === "petreport" || p === "settings") ? "more" : p;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.p === navP));
  $("nav").classList.toggle("on", p !== "chat");
  $("fab").classList.toggle("hide", p !== "tasks" && p !== "bills" && p !== "expenses" && p !== "restock" && p !== "groceries" && p !== "recipes" && p !== "pantry" && p !== "calendar" && p !== "wishlist" && p !== "savings" && p !== "notes" && p !== "pets" && p !== "petstock" && p !== "insurance");
  $("fab").textContent = p === "bills" ? "+ New bill" : p === "expenses" ? "+ Add expense" : p === "restock" ? "+ Add item" : p === "groceries" ? "+ Add grocery spend" : p === "recipes" ? "+ New recipe" : p === "pantry" ? "+ Add pantry item" : p === "calendar" ? "+ New event" : p === "wishlist" ? "+ New wish" : p === "savings" ? "+ New goal" : p === "notes" ? "+ New note" : p === "pets" ? "+ Add pet" : p === "petstock" ? "+ Add item" : p === "insurance" ? "+ Add policy" : "+ New task";
  if (p === "bills") onBillsOpen();
  if (p === "expenses") onExpensesOpen();
  if (p === "restock") onRestockOpen();
  if (p === "groceries") onGroceriesOpen();
  if (p === "recipes") onRecipesOpen();
  if (p === "mealplan") onMealsOpen();
  if (p === "pantry") onPantryOpen();
  if (p === "calendar") onCalendarOpen();
  if (p === "wishlist") onWishlistOpen();
  if (p === "savings") onSavingsOpen();
  if (p === "notes") onNotesOpen();
  if (p === "petstock") onPetstockOpen();
  if (p === "petreport") onPetReportOpen();
  if (p === "chat") onChatOpen(); else onChatClose();
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
  if (!inApp) { onChatClose(); PAGES.forEach((id) => $(id).classList.remove("on")); $("fab").classList.add("hide"); }
  else go("home");
}

/* ---------- Offline notice ---------- */
function showOnline() { $("offline").classList.toggle("hide", navigator.onLine); }
window.addEventListener("online", showOnline);
window.addEventListener("offline", showOnline);
showOnline();

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
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayIso = () => isoOf(new Date());
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
function daysBetween(aIso, bIso) { // b minus a
  const a = parseIso(aIso), b = parseIso(bIso);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
}
const daysTogether = (iso) => Math.max(0, daysBetween(iso, todayIso()));
const prettyDate = (iso) => parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = (iso) => parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function stepDate(iso, repeat) {
  const d = parseIso(iso);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "monthly") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return isoOf(d);
}
function nextDue(due, repeat) {
  let next = stepDate(due || todayIso(), repeat);
  for (let i = 0; i < 400 && next < todayIso(); i++) next = stepDate(next, repeat);
  return next;
}
function dueLabel(t) {
  if (!t.dueDate) return "No date";
  const diff = daysBetween(todayIso(), t.dueDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0 && !t.done) return Math.abs(diff) + (Math.abs(diff) === 1 ? " day late" : " days late");
  return shortDate(t.dueDate);
}

/* ---------- Sign in and out ---------- */
const findPerson = (email) => PEOPLE.find((p) => p.email === (email || "").toLowerCase());

$("signin").addEventListener("click", async () => {
  $("err").textContent = "";
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    // Some phones block the pop-up window, so use the full-page way instead.
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      try { await signInWithRedirect(auth, provider); return; } catch (e2) {}
    }
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("err").textContent = "Sign-in did not finish. Please try again.";
  }
});
$("signout").addEventListener("click", () => signOut(auth));
getRedirectResult(auth).catch(() => {});

/* ---------- Live data ---------- */
let stops = [];
const users = {};
let settings = {};
let tasks = [];
let myUid = null;
let myPerson = null;
let filled = { name: false, start: false };
let filter = "all";
const open = { overdue: true, today: true, coming: true, done: false };

const nameByUid = (uid) => (users[uid] && users[uid].name) || "Someone";
function partnerInfo() {
  const pp = PEOPLE.find((p) => p.email !== myPerson.email);
  const entry = Object.entries(users).find(([id, u]) => u.email === pp.email);
  return { person: pp, uid: entry ? entry[0] : null, name: entry ? entry[1].name : pp.defaultName };
}

function render() {
  if (!myUid) return;
  const partner = partnerInfo();
  const myName = nameByUid(myUid);

  $("hello").textContent = "Hello, " + myName;
  const myPhoto = (users[myUid] || {}).photo;
  const partnerPhoto = partner.uid ? (users[partner.uid] || {}).photo : "";
  setAvatar($("me"), myPhoto, myName.charAt(0).toUpperCase());
  setAvatar($("av1"), myPhoto, myName.charAt(0).toUpperCase());
  setAvatar($("av2"), partnerPhoto, partner.name.charAt(0).toUpperCase());
  setAvatar($("setAv"), myPhoto, myName.charAt(0).toUpperCase());
  $("today").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  $("partner").textContent = partner.uid ? partner.name + " has signed in ✓" : "Waiting for " + partner.person.defaultName + " to sign in for the first time";

  if (settings.relationshipStart) {
    $("days").textContent = daysTogether(settings.relationshipStart).toLocaleString("en-US");
    $("dayslabel").textContent = "days together ✦";
    $("since").textContent = "Since " + prettyDate(settings.relationshipStart);
  } else {
    $("days").textContent = "–";
    $("dayslabel").textContent = "Set your start date in More";
    $("since").textContent = "";
  }

  if (!filled.name && document.activeElement !== $("name")) { $("name").value = myName; filled.name = true; }
  if (!filled.start && settings.relationshipStart && document.activeElement !== $("start")) { $("start").value = settings.relationshipStart; filled.start = true; }

  renderTasks();
  renderHomeTasks(partner, myName);
  refreshChat();
  refreshBills();
  refreshExpenses();
  refreshRestock();
  refreshGroceries();
  refreshRecipes();
  refreshMeals();
  refreshPantry();
  refreshCalendar();
  refreshWishlist();
  refreshSavings();
  refreshNotes();
  refreshPets();
  refreshPetstock();
  refreshInsurance();
}

/* ---------- Tasks: list ---------- */
function taskMeta(t) {
  const parts = [nameByUid(t.assignee), dueLabel(t)];
  if (t.repeat && t.repeat !== "never") parts.push(t.repeat.charAt(0).toUpperCase() + t.repeat.slice(1));
  if (t.amount != null) parts.push("RM " + Number(t.amount).toFixed(2));
  return parts.join(DOT);
}

function taskRow(t) {
  const rec = t.repeat && t.repeat !== "never";
  const chk = el("button", { class: "chk" + (rec ? " rec" : "") + (t.done ? " done" : ""), "aria-label": "Mark done", text: "✓", onclick: () => toggleDone(t) });
  const body = el("div", { class: "t", onclick: () => openSheet(t) }, el("b", { text: t.title }), el("span", { class: "sub", text: taskMeta(t) }));
  const row = el("div", { class: "row" }, chk, body);
  if (!t.done) {
    if (t.priority === "high") row.append(el("span", { class: "tag w", text: "High" }));
    if (t.nudgedBy && t.nudgedBy !== myUid && t.assignee === myUid) row.append(el("span", { class: "tag", text: "👋 " + nameByUid(t.nudgedBy) }));
    if (t.assignee !== myUid) row.append(el("button", { class: "tag", text: "Nudge", onclick: () => nudge(t) }));
  }
  return row;
}

function group(key, title, list, note) {
  const card = el("div", { class: "card grp" + (open[key] ? " open" : "") });
  const head = el("button", { class: "gh", onclick: () => { open[key] = !open[key]; card.classList.toggle("open", open[key]); } },
    el("span", { text: title + " " + list.length }), el("span", { class: "ch", text: "⌄" }));
  const bodyEl = el("div", { class: "body" });
  if (!list.length) bodyEl.append(el("div", { class: "empty", text: "Nothing here." }));
  list.forEach((t) => bodyEl.append(taskRow(t)));
  if (note) bodyEl.append(el("div", { class: "empty", text: note }));
  card.append(head, bodyEl);
  return card;
}

function renderTasks() {
  const partner = partnerInfo();
  const fl = $("filters");
  fl.replaceChildren(
    ...[["all", "All"], ["mine", nameByUid(myUid)], ["partner", partner.name], ["rec", "Recurring"]].map(([k, label]) =>
      el("button", { class: "pill" + (filter === k ? " on" : ""), text: label, onclick: () => { filter = k; renderTasks(); } }))
  );

  const keep = (t) => filter === "all" || (filter === "mine" && t.assignee === myUid) ||
    (filter === "partner" && t.assignee !== myUid) || (filter === "rec" && t.repeat && t.repeat !== "never");
  const list = tasks.filter(keep);
  const t0 = todayIso();
  const byDue = (a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  const openTasks = list.filter((t) => !t.done);
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < t0).sort(byDue);
  const today = openTasks.filter((t) => t.dueDate === t0);
  const coming = openTasks.filter((t) => !t.dueDate || t.dueDate > t0).sort(byDue);
  const doneAll = list.filter((t) => t.done).sort((a, b) => ms(b.completedAt) - ms(a.completedAt));
  const done = doneAll.slice(0, 15);

  $("groups").replaceChildren(
    group("overdue", "Overdue", overdue),
    group("today", "Today", today),
    group("coming", "Coming up", coming),
    group("done", "Done", done, doneAll.length > 15 ? "Showing the latest 15." : "")
  );
}
const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

function renderHomeTasks(partner, myName) {
  const t0 = todayIso();
  const due = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= t0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const box = $("homeToday");
  box.replaceChildren();
  if (!due.length) box.append(el("div", { class: "empty", text: "Nothing due today ✓" }));
  due.slice(0, 5).forEach((t) => box.append(taskRow(t)));
  if (due.length > 5) box.append(el("div", { class: "empty", text: "+" + (due.length - 5) + " more in Tasks" }));

  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  const count = (uid) => tasks.filter((t) => t.done && t.completedBy === uid && ms(t.completedAt) >= monday).length;
  $("wkName1").textContent = myName;
  $("wk1").textContent = count(myUid);
  $("wkName2").textContent = partner.name;
  $("wk2").textContent = partner.uid ? count(partner.uid) : 0;
}

/* ---------- Tasks: actions ---------- */
async function toggleDone(t) {
  const ref = doc(db, "tasks", t.id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      let nextSnap = null;
      if (d.done && d.nextId) nextSnap = await tx.get(doc(db, "tasks", d.nextId));

      if (!d.done) {
        const update = { done: true, completedBy: myUid, completedAt: serverTimestamp(), updatedAt: serverTimestamp() };
        if (d.repeat && d.repeat !== "never") {
          const nref = doc(collection(db, "tasks"));
          tx.set(nref, {
            title: d.title, note: d.note || "", assignee: d.assignee,
            dueDate: nextDue(d.dueDate, d.repeat), priority: d.priority || "normal",
            repeat: d.repeat, amount: d.amount == null ? null : d.amount,
            done: false, createdBy: d.createdBy || myUid,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          });
          update.nextId = nref.id;
        }
        tx.update(ref, update);
      } else {
        tx.update(ref, { done: false, completedBy: deleteField(), completedAt: deleteField(), nextId: deleteField(), updatedAt: serverTimestamp() });
        // Undoing a repeating task removes the copy we made, if nobody touched it yet.
        if (nextSnap && nextSnap.exists() && !nextSnap.data().done) tx.delete(nextSnap.ref);
      }
    });
  } catch (e) { toast("Could not update. Try again."); }
}

async function nudge(t) {
  try {
    await updateDoc(doc(db, "tasks", t.id), { nudgedBy: myUid, nudgedAt: serverTimestamp() });
    toast("Nudge sent to " + nameByUid(t.assignee) + " 👋");
  } catch (e) { toast("Could not send. Try again."); }
}

/* ---------- Tasks: add / edit sheet ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
$("sbg").addEventListener("click", (e) => { if (e.target === $("sbg")) closeSheet(); });
$("fab").addEventListener("click", () => { if (page === "bills") openBillSheet(null); else if (page === "expenses") expenseSheet(null); else if (page === "restock") restockSheet(null); else if (page === "groceries") expenseSheet(null, { category: "Groceries" }); else if (page === "recipes") recipeEdit(null); else if (page === "pantry") pantrySheet(null); else if (page === "calendar") newEventOnSelected(); else if (page === "wishlist") wishSheet(null); else if (page === "savings") goalEdit(null); else if (page === "notes") noteSheet(null); else if (page === "pets") petEdit(null); else if (page === "petstock") stockSheet(null); else if (page === "insurance") policySheet(null); else openSheet(null); });

// Back buttons and More menu tiles
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { go(g.dataset.go); return; }
  if (e.target.closest("[data-soon]")) toast("Coming soon");
});

function field(label, input) { return [el("label", { text: label }), input]; }
function select(options, value) {
  const s = el("select", {}, options.map(([v, l]) => el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

function openSheet(t) {
  const isNew = !t;
  const partner = partnerInfo();
  const people = [[myUid, nameByUid(myUid)]];
  if (partner.uid) people.push([partner.uid, partner.name]);

  const title = el("input", { type: "text", maxlength: "100", placeholder: "e.g. Buy cat litter" });
  const note = el("textarea", { maxlength: "500", placeholder: "Optional note" });
  const who = select(people, isNew ? myUid : t.assignee);
  const due = el("input", { type: "date" });
  const pri = select([["normal", "Normal"], ["high", "High"], ["low", "Low"]], isNew ? "normal" : t.priority || "normal");
  const rep = select([["never", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]], isNew ? "never" : t.repeat || "never");
  const amt = el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Optional, for bills" });
  if (!isNew) { title.value = t.title; note.value = t.note || ""; due.value = t.dueDate || ""; amt.value = t.amount == null ? "" : t.amount; }

  const save = el("button", { class: "btn", text: "Save", onclick: async () => {
    const name = title.value.trim();
    if (!name) { toast("Please type a title"); return; }
    const amount = amt.value === "" ? null : Math.max(0, parseFloat(amt.value) || 0);
    const data = { title: name, note: note.value.trim(), assignee: who.value, dueDate: due.value || "",
      priority: pri.value, repeat: rep.value, amount, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(db, "tasks"), { ...data, done: false, createdBy: myUid, createdAt: serverTimestamp() });
      else await updateDoc(doc(db, "tasks", t.id), data);
      closeSheet();
      toast("Saved ✓");
    } catch (e) { toast("Could not save. Try again."); save.disabled = false; }
  } });

  const info = [];
  if (!isNew) {
    const bits = ["Added by " + nameByUid(t.createdBy)];
    if (t.done && t.completedBy) bits.push("Done by " + nameByUid(t.completedBy) + (ms(t.completedAt) ? " on " + new Date(ms(t.completedAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""));
    info.push(el("div", { class: "sub", style: "margin-top:12px", text: bits.join(DOT) }));
  }

  const buttons = [el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save];
  const actions = el("div", { class: "acts" }, buttons);
  const remove = isNew ? null : el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete task", onclick: async () => {
    if (!window.confirm("Delete this task for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(db, "tasks", t.id)); closeSheet(); toast("Task deleted"); }
    catch (e) { toast("Could not delete. Try again."); }
  } });

  setSheet(
    el("h2", { style: "font-size:24px", text: isNew ? "New task" : "Edit task" }),
    ...field("Title", title), ...field("Note", note), ...field("Assign to", who), ...field("Due date", due),
    ...field("Priority", pri), ...field("Repeat", rep), ...field("Amount in RM", amt),
    ...info, actions, remove
  );
  $("sbg").classList.add("on");
}

/* ---------- Settings ---------- */
$("photoPick").addEventListener("click", async () => {
  try {
    const photo = await pickPhoto();
    if (!photo) return;
    await updateDoc(doc(db, "users", myUid), { photo });
    toast("Photo saved ✓");
  } catch (e) { toast(e.message || "Could not save the photo"); }
});
$("photoRemove").addEventListener("click", async () => {
  try { await updateDoc(doc(db, "users", myUid), { photo: deleteField() }); toast("Photo removed"); }
  catch (e) { toast("Could not remove. Try again."); }
});

$("savename").addEventListener("click", async () => {
  const name = $("name").value.trim();
  if (!name) { toast("Please type a name"); return; }
  try { await updateDoc(doc(db, "users", myUid), { name }); toast("Name saved ✓"); }
  catch (e) { toast("Could not save. Try again."); }
});
$("savestart").addEventListener("click", async () => {
  const v = $("start").value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Please choose a date"); return; }
  try { await setDoc(doc(db, "shared", "settings"), { relationshipStart: v }, { merge: true }); toast("Date saved ✓"); }
  catch (e) { toast("Could not save. Try again."); }
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
  tasks = [];

  if (!user) { show("login"); return; }

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
    if (!snap.exists()) await setDoc(ref, { name: person.defaultName, email: user.email.toLowerCase(), createdAt: serverTimestamp() });

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
    stops.push(onSnapshot(doc(db, "shared", "settings"), (s) => { settings = s.exists() ? s.data() : {}; render(); }));
    stops.push(onSnapshot(collection(db, "tasks"), (s) => { tasks = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }));

    const dates = { todayIso, parseIso, isoOf, daysBetween, shortDate, prettyDate };
    stops.push(startPetstock({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, getPets, afterChange: refreshPets }));
    stops.push(startInsurance({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, getPets, afterChange: refreshPets }));
    stops.push(startPetReports({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, getPets, afterChange: refreshPets }));
    stops.push(startVet({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, getPets, afterChange: refreshPets }));
    stops.push(startPets({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startNotes({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startWishlist({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startSavings({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startCalendar({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startPantry({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startMealplan({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startRecipes({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startGroceries({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings }));
    stops.push(startRestock({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, pantryAdd: addFromRestock }));
    stops.push(startExpenses({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go, getSettings: () => settings, getPets }));
    stops.push(startBills({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, dates, go }));
    stops.push(startChat({ db, uid: myUid, el, toast, users, nameByUid, partnerInfo, go }));

    $("theme").value = themeChoice;
    render();
    show("main");
  } catch (e) {
    await signOut(auth);
    $("err").textContent = "Could not reach your data (" + (e.code || e.message) + ")";
    show("login");
  }
});
