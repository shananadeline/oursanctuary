// pets.js - pet profiles, weight and health notes (Phase 4, Step 1)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { foodTab, lowStockCount } from "./petstock.js";
import { vetTab, upcomingPetItems } from "./vet.js";
import { insuranceTab, upcomingInsuranceItems } from "./insurance.js";

const nextItems = (n) => [...upcomingPetItems(50), ...upcomingInsuranceItems()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const SPECIES = [["Cat", "🐱"], ["Dog", "🐶"], ["Rabbit", "🐰"], ["Bird", "🐦"], ["Other", "🐾"]];
const emojiOf = (sp) => (SPECIES.find((s) => s[0] === sp) || SPECIES[4])[1];
const SEX = [["", "Not sure / not set"], ["Female", "Female"], ["Male", "Male"]];
const STATUS = [["active", "Active (living with us)"], ["upcoming", "Upcoming (not home yet)"], ["archived", "Archived"]];
const OBS = [["appetite", "Appetite"], ["grooming", "Grooming"], ["other", "Other care note"]];

let C = null;
let pets = [];
let logs = [];
let selId = "";
let tab = "profile";

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };

function ageText(p) {
  if (p.dob) {
    const b = C.dates.parseIso(p.dob), n = C.dates.parseIso(C.dates.todayIso());
    let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
    if (months < 0) return "";
    const y = Math.floor(months / 12), m = months % 12;
    return y ? y + (y === 1 ? " yr" : " yrs") + (m ? " " + m + " mo" : "") : m + (m === 1 ? " month" : " months");
  }
  return p.approxAge || "";
}
const weights = (id) => logs.filter((l) => l.petId === id && l.type === "weight").sort((a, b) => a.date.localeCompare(b.date));
const latestWeight = (id) => { const w = weights(id); return w.length ? w[w.length - 1].weight : null; };
export const getPets = () => pets;
export const petName = (id) => { const p = pets.find((x) => x.id === id); return p ? p.name : "Unknown"; };

/* ---------- Start ---------- */
export function startPets(ctx) {
  C = ctx;
  pets = []; logs = []; selId = ""; tab = "profile";
  const a = onSnapshot(collection(C.db, "pets"), (s) => { pets = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshPets(); });
  const b = onSnapshot(collection(C.db, "petlogs"), (s) => { logs = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshPets(); });
  return () => { a(); b(); C = null; };
}
export function openPet(id, toTab) { if (!C) return; selId = id; tab = toTab || "profile"; C.go("petdetail"); refreshPets(); }

/* ---------- Screens ---------- */
function avatar(p, size) {
  return C.el("span", { class: "av cat" + (size ? " s" : ""), style: p.status === "archived" ? "opacity:.5" : "", text: emojiOf(p.species) });
}

export function refreshPets() {
  if (!C) return;
  renderHome();
  if ($("pets").classList.contains("on")) renderList();
  if ($("petdetail").classList.contains("on")) renderDetail();
}

function petRow(p) {
  const bits = [p.species === "Cat" ? "" : p.species, p.breed, ageText(p), latestWeight(p.id) != null ? latestWeight(p.id) + " kg" : ""].filter(Boolean);
  const r = C.el("div", { class: "row", onclick: () => openPet(p.id) }, avatar(p),
    C.el("div", { class: "t" }, C.el("b", { text: p.name }), C.el("span", { class: "sub", text: bits.join(DOT) || "Tap to add details" })));
  if (p.status === "upcoming") r.append(C.el("span", { class: "tag", text: "Coming soon" }));
  return r;
}

function renderList() {
  const active = pets.filter((p) => p.status === "active" || !p.status);
  const upcoming = pets.filter((p) => p.status === "upcoming");
  const archived = pets.filter((p) => p.status === "archived");
  const sort = (a, b) => (a.name || "").localeCompare(b.name || "");
  const out = [C.el("div", { class: "card hero" },
    C.el("div", { style: "opacity:.9;font-size:13px", text: "Active pets" }),
    C.el("div", { class: "serif", style: "font-size:40px;position:relative", text: String(active.length) }),
    C.el("div", { style: "position:relative", text: active.map((p) => emojiOf(p.species) + " " + p.name).join("  ") }))];
  const group = (title, list) => {
    const c = C.el("div", { class: "card" }, C.el("b", { text: title + " " + list.length }));
    list.sort(sort).forEach((p) => c.append(petRow(p)));
    return c;
  };
  if (!pets.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: "No pets yet. Tap + Add pet to create the first profile." })));
  const soon = nextItems(6);
  if (soon.length) {
    const sc = C.el("div", { class: "card" }, C.el("b", { text: "Coming up for our pets" }));
    soon.forEach((i) => { const d = C.dates.daysBetween(C.dates.todayIso(), i.date);
      sc.append(C.el("div", { class: "row", onclick: () => openPet(i.petId, "vet") }, C.el("div", { class: "ic", text: i.icon }),
        C.el("div", { class: "t" }, C.el("b", { text: petName(i.petId) + ": " + i.label }), C.el("span", { class: "sub", text: C.dates.shortDate(i.date) })),
        d < 0 ? C.el("span", { class: "tag e", text: "Overdue" }) : d <= 14 ? C.el("span", { class: "tag w", text: d === 0 ? "Today" : "In " + d + (d === 1 ? " day" : " days") }) : null)); });
    out.push(sc);
  }
  const low = lowStockCount();
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Food, litter and supplies" }),
    C.el("div", { class: "sub", text: low ? low + (low === 1 ? " item is" : " items are") + " running low." : "Track stock, expiry dates and spending." }),
    C.el("button", { class: "btn", style: "margin-top:10px", text: "Open pet supplies", onclick: () => C.go("petstock") })));
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Pet insurance" }),
    C.el("div", { class: "sub", text: "Policies, premiums, renewals and claims." }),
    C.el("button", { class: "btn", style: "margin-top:10px", text: "Open pet insurance", onclick: () => C.go("insurance") })));
  if (active.length) out.push(group("Our pets", active));
  if (upcoming.length) out.push(group("Coming soon", upcoming));
  if (archived.length) out.push(group("Archived", archived));
  $("ptBody").replaceChildren(...out);
}

function renderHome() {
  const box = $("homePets");
  if (!box) return;
  const active = pets.filter((p) => p.status === "active" || !p.status).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  box.replaceChildren();
  if (!pets.length) { box.append(C.el("div", { class: "empty", text: "Add your pets in More → Pets." })); return; }
  box.append(C.el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px" }, active.map((p) => C.el("div", { style: "text-align:center;width:56px", onclick: () => openPet(p.id) },
    avatar(p), C.el("div", { class: "sub", style: "font-size:12px;overflow:hidden;text-overflow:ellipsis", text: p.name })))));
  const nextUp = nextItems(1)[0];
  if (nextUp) box.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "Next: " + petName(nextUp.petId) + " · " + nextUp.label + " · " + C.dates.shortDate(nextUp.date) }));
  const low = lowStockCount();
  if (low) box.append(C.el("div", { style: "margin-top:8px" }, C.el("button", { class: "tag e", text: low + " low-stock item" + (low === 1 ? "" : "s"), onclick: () => C.go("petstock") })));
  const up = pets.filter((p) => p.status === "upcoming");
  if (up.length) box.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "Coming soon: " + up.map((p) => p.name).join(", ") }));
}

/* ---------- Pet detail ---------- */
function renderDetail() {
  const p = pets.find((x) => x.id === selId);
  if (!p) { $("pdBody").replaceChildren(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: "This pet could not be found." }))); return; }
  $("pdTitle").textContent = p.name;
  $("pdTabs").replaceChildren(...[["profile", "Profile"], ["food", "Feeding"], ["vet", "Vet"], ["ins", "Insurance"], ["health", "Health"]].map(([k, l]) =>
    C.el("button", { class: "pill" + (tab === k ? " on" : ""), text: l, onclick: () => { tab = k; renderDetail(); } })));
  $("pdBody").replaceChildren(...(tab === "profile" ? profileTab(p) : tab === "food" ? foodTab(p) : tab === "vet" ? vetTab(p) : tab === "ins" ? insuranceTab(p) : healthTab(p)));
}

function kv(label, value) { return value ? C.el("div", { class: "row" }, C.el("div", { class: "t" }, C.el("span", { class: "sub", text: label }), C.el("b", { style: "font-weight:500", text: value }))) : null; }

function profileTab(p) {
  const home = p.adoptedDate ? (() => { const d = C.dates.daysBetween(p.adoptedDate, C.dates.todayIso()); return d >= 0 ? C.dates.prettyDate(p.adoptedDate) + " (" + d.toLocaleString("en-US") + " days with us)" : C.dates.prettyDate(p.adoptedDate); })() : "";
  const card = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;gap:12px;align-items:center" }, avatar(p),
      C.el("div", {}, C.el("b", { style: "font-size:18px", text: p.name }), C.el("div", { class: "sub", text: [p.species, p.breed, p.sex].filter(Boolean).join(DOT) }))),
    kv("Age", ageText(p) + (p.dob ? " (born " + C.dates.prettyDate(p.dob) + ")" : "")), kv("Joined us", home), kv("Colour and markings", p.colour), kv("Microchip", p.microchip),
    kv("Allergies or sensitivities", p.allergies), kv("Food preferences", p.foodPrefs), kv("Care notes", p.notes),
    kv("Latest weight", latestWeight(p.id) != null ? latestWeight(p.id) + " kg" : ""));
  return [card, C.el("div", { style: "display:flex;gap:8px" },
    C.el("button", { class: "btn", style: "flex:1", text: "Edit profile", onclick: () => edit(p) }),
    C.el("button", { class: "btn ghost", style: "flex:1", text: p.status === "archived" ? "Reactivate" : "Archive", onclick: () => setStatus(p, p.status === "archived" ? "active" : "archived") })),
    C.el("div", { class: "sub", style: "margin:12px 4px", text: "These records are for keeping track and reminders. For health decisions, always ask your vet." })];
}

async function setStatus(p, status) {
  try { await updateDoc(doc(C.db, "pets", p.id), { status, updatedAt: serverTimestamp() }); C.toast(status === "archived" ? p.name + " archived" : p.name + " is active again"); }
  catch (e) { C.toast("Could not update. Try again."); }
}

// A simple weight line chart (drawn with SVG).
function chart(list) {
  const ns = "http://www.w3.org/2000/svg";
  const W = 300, H = 110, pad = 14;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.style.width = "100%";
  const vals = list.map((l) => l.weight);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const t0 = C.dates.parseIso(list[0].date).getTime(), t1 = C.dates.parseIso(list[list.length - 1].date).getTime();
  const pts = list.map((l, i) => {
    const x = list.length === 1 ? W / 2 : pad + ((C.dates.parseIso(l.date).getTime() - t0) / ((t1 - t0) || 1)) * (W - pad * 2);
    const y = H - pad - ((l.weight - min) / span) * (H - pad * 2 - 6);
    return [x, y];
  });
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  if (pts.length > 1) svg.append(mk("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#7650C8", "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" }));
  pts.forEach((p) => svg.append(mk("circle", { cx: p[0], cy: p[1], r: "4.5", fill: "#9875D8" })));
  return svg;
}

function healthTab(p) {
  const w = weights(p.id);
  const wc = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Weight" }),
      C.el("button", { class: "tag", text: "+ Log weight", onclick: () => weightSheet(p) })));
  if (!w.length) wc.append(C.el("div", { class: "empty", text: "No weights yet. Log the first one to start the chart." }));
  else {
    wc.append(chart(w));
    const last = w[w.length - 1], first = w[0];
    const diff = Math.round((last.weight - first.weight) * 100) / 100;
    wc.append(C.el("div", { class: "sub", text: "Latest " + last.weight + " kg on " + C.dates.shortDate(last.date) + (w.length > 1 ? DOT + (diff > 0 ? "+" : "") + diff + " kg since " + C.dates.shortDate(first.date) : "") }));
    w.slice().reverse().slice(0, 8).forEach((l) => wc.append(C.el("div", { class: "row", onclick: () => weightSheet(p, l) },
      C.el("div", { class: "t" }, C.el("b", { text: l.weight + " kg" }), C.el("span", { class: "sub", text: [C.dates.shortDate(l.date), l.note].filter(Boolean).join(DOT) })))));
  }

  const obs = logs.filter((l) => l.petId === p.id && l.type === "note").sort((a, b) => b.date.localeCompare(a.date));
  const oc = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Observations" }),
      C.el("button", { class: "tag", text: "+ Add note", onclick: () => noteSheet(p) })));
  if (!obs.length) oc.append(C.el("div", { class: "empty", text: "Appetite, grooming and other care notes will appear here." }));
  obs.slice(0, 15).forEach((l) => oc.append(C.el("div", { class: "row", onclick: () => noteSheet(p, l) },
    C.el("div", { class: "t" }, C.el("b", { text: l.note }), C.el("span", { class: "sub", text: [(OBS.find((o) => o[0] === l.kind) || OBS[2])[1], C.dates.shortDate(l.date), l.by ? C.nameByUid(l.by) : ""].filter(Boolean).join(DOT) })))));
  return [wc, oc];
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

function weightSheet(p, l) {
  const isNew = !l;
  const kg = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "e.g. 4.2" });
  const date = C.el("input", { type: "date" });
  const note = C.el("input", { type: "text", maxlength: "100", placeholder: "Optional" });
  date.value = isNew ? C.dates.todayIso() : l.date;
  if (!isNew) { kg.value = l.weight; note.value = l.note || ""; }
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const w = num(kg.value);
    if (!w) { C.toast("Please enter the weight in kg"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { petId: p.id, type: "weight", weight: Math.round(w * 100) / 100, date: date.value, note: note.value.trim(), by: C.uid, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "petlogs"), { ...data, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "petlogs", l.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete this weight", onclick: async () => {
    if (!window.confirm("Delete this weight record?")) return;
    try { await deleteDoc(doc(C.db, "petlogs", l.id)); closeSheet(); } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · weight" }), ...field("Weight in kg", kg), ...field("Date", date), ...field("Note", note),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function noteSheet(p, l) {
  const isNew = !l;
  const kind = select(OBS, isNew ? "appetite" : l.kind || "other");
  const note = C.el("textarea", { maxlength: "400", placeholder: "e.g. Ate less than usual today" });
  const date = C.el("input", { type: "date" });
  date.value = isNew ? C.dates.todayIso() : l.date;
  if (!isNew) note.value = l.note || "";
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    if (!note.value.trim()) { C.toast("Please write a note"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { petId: p.id, type: "note", kind: kind.value, note: note.value.trim(), date: date.value, by: C.uid, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "petlogs"), { ...data, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "petlogs", l.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete this note", onclick: async () => {
    if (!window.confirm("Delete this note?")) return;
    try { await deleteDoc(doc(C.db, "petlogs", l.id)); closeSheet(); } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · care note" }), ...field("Type", kind), ...field("Note", note), ...field("Date", date),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

export function edit(p) {
  if (!C) return;
  const isNew = !p;
  const name = C.el("input", { type: "text", maxlength: "40", placeholder: "e.g. Lewis" });
  const species = select(SPECIES.map((s) => [s[0], s[1] + " " + s[0]]), isNew ? "Cat" : p.species || "Cat");
  const breed = C.el("input", { type: "text", maxlength: "60", placeholder: "Optional" });
  const dob = C.el("input", { type: "date" });
  const approx = C.el("input", { type: "text", maxlength: "30", placeholder: "e.g. about 2 years (if birthday unknown)" });
  const sex = select(SEX, isNew ? "" : p.sex || "");
  const adopted = C.el("input", { type: "date" });
  const colour = C.el("input", { type: "text", maxlength: "100", placeholder: "Optional" });
  const chip = C.el("input", { type: "text", maxlength: "30", placeholder: "Optional" });
  const allergies = C.el("textarea", { maxlength: "300", placeholder: "If known" });
  const foodPrefs = C.el("textarea", { maxlength: "300", placeholder: "Favourite and disliked foods" });
  const notes = C.el("textarea", { maxlength: "500", placeholder: "Optional" });
  const status = select(STATUS, isNew ? "active" : p.status || "active");
  if (!isNew) { name.value = p.name; breed.value = p.breed || ""; dob.value = p.dob || ""; approx.value = p.approxAge || ""; adopted.value = p.adoptedDate || "";
    colour.value = p.colour || ""; chip.value = p.microchip || ""; allergies.value = p.allergies || ""; foodPrefs.value = p.foodPrefs || ""; notes.value = p.notes || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    if (!nm) { C.toast("Please type a name"); return; }
    const data = { name: nm, species: species.value, breed: breed.value.trim(), dob: dob.value || "", approxAge: approx.value.trim(), sex: sex.value,
      adoptedDate: adopted.value || "", colour: colour.value.trim(), microchip: chip.value.trim(), allergies: allergies.value.trim(),
      foodPrefs: foodPrefs.value.trim(), notes: notes.value.trim(), status: status.value, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "pets"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "pets", p.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete pet permanently", onclick: async () => {
    if (!window.confirm("Delete " + p.name + " and all their weights and notes for both of you? This cannot be undone. Archiving is usually better.")) return;
    try {
      const b = writeBatch(C.db);
      logs.filter((l) => l.petId === p.id).slice(0, 400).forEach((l) => b.delete(doc(C.db, "petlogs", l.id)));
      b.delete(doc(C.db, "pets", p.id));
      await b.commit();
      closeSheet(); C.go("pets"); C.toast("Deleted");
    } catch (e) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add a pet" : "Edit " + p.name }),
    C.el("div", { class: "sub", text: "Only the name is needed. Fill in the rest whenever you like." }),
    ...field("Name", name), ...field("Species", species), ...field("Breed", breed), ...field("Date of birth (if known)", dob), ...field("Approximate age (if no birthday)", approx),
    ...field("Sex", sex), ...field("Date they joined us", adopted), ...field("Colour and markings", colour), ...field("Microchip number", chip),
    ...field("Allergies or sensitivities", allergies), ...field("Food preferences", foodPrefs), ...field("Care notes", notes), ...field("Status", status),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}
