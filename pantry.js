// pantry.js - kitchen and pantry inventory (Step 11)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addRestockItem } from "./restock.js";
import { getRecipes } from "./recipes.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = ["Rice & grains", "Cooking essentials", "Fresh produce", "Meat & seafood", "Dairy & eggs", "Frozen", "Canned & packaged", "Snacks & drinks", "Other"];
const LOCS = ["Pantry cupboard", "Fridge", "Freezer", "Counter", "Other"];
const UNITS = ["pcs", "g", "kg", "ml", "L", "pack", "bottle", "can", "tray", "bag"];
const STEP = { g: 100, ml: 100, kg: 0.5, L: 0.5 };
const QUICK = [["Rice", "Rice & grains", "kg", "Pantry cupboard"], ["Eggs", "Dairy & eggs", "pcs", "Fridge"], ["Cooking oil", "Cooking essentials", "bottle", "Pantry cupboard"],
  ["Onion", "Fresh produce", "pcs", "Pantry cupboard"], ["Garlic", "Fresh produce", "pcs", "Pantry cupboard"], ["Soy sauce", "Cooking essentials", "bottle", "Pantry cupboard"],
  ["Sugar", "Cooking essentials", "kg", "Pantry cupboard"], ["Salt", "Cooking essentials", "pack", "Pantry cupboard"], ["Flour", "Rice & grains", "kg", "Pantry cupboard"],
  ["Noodles", "Rice & grains", "pack", "Pantry cupboard"], ["Chicken", "Meat & seafood", "kg", "Freezer"], ["Milk", "Dairy & eggs", "L", "Fridge"]];

let C = null;
let items = [];
let tab = "all";
let cat = "All";
let query = "";

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const fmt = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
const isLow = (i) => i.minQty != null && Number(i.quantity) <= Number(i.minQty);
const daysLeft = (i) => (i.expiryDate ? C.dates.daysBetween(C.dates.todayIso(), i.expiryDate) : null);
const isExpiring = (i) => { const d = daysLeft(i); return d != null && d <= 7; };

/* ---------- Start ---------- */
export function startPantry(ctx) {
  C = ctx;
  items = [];
  tab = "all"; cat = "All"; query = "";
  const unsub = onSnapshot(collection(C.db, "pantry"), (s) => { items = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshPantry(); });
  return () => { unsub(); C = null; };
}
export function onPantryOpen() { if (C) { tab = "all"; cat = "All"; query = ""; $("pnSearch").value = ""; refreshPantry(); } }

/* ---------- Screen ---------- */
export function refreshPantry() {
  if (!C || !$("pantry").classList.contains("on")) return;
  const low = items.filter(isLow), soon = items.filter(isExpiring);

  $("pnTabs").replaceChildren(...[["all", "All " + items.length], ["low", "Low stock " + low.length], ["exp", "Expiring " + soon.length]].map(([k, l]) =>
    C.el("button", { class: "pill" + (tab === k ? " on" : ""), text: l, onclick: () => { tab = k; refreshPantry(); } })));
  $("pnCats").replaceChildren(...["All", ...CATS].map((c) =>
    C.el("button", { class: "pill" + (cat === c ? " on" : ""), text: c, onclick: () => { cat = c; refreshPantry();
      const on = $("pnCats").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  let list = items.slice();
  if (tab === "low") list = low; else if (tab === "exp") list = soon;
  if (cat !== "All") list = list.filter((i) => i.category === cat);
  if (query) list = list.filter((i) => ((i.name || "") + " " + (i.note || "")).toLowerCase().includes(query));
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const quick = C.el("div", { class: "pills", style: "margin-bottom:8px" },
    C.el("button", { class: "pill", text: "🍳 What can we cook?", onclick: cookSheet }),
    ...QUICK.map(([n, c, u, l]) => C.el("button", { class: "pill", text: "+ " + n, onclick: () => sheet(null, { name: n, category: c, unit: u, location: l }) })));

  const card = C.el("div", { class: "card" }, C.el("b", { text: list.length + (list.length === 1 ? " item" : " items") }));
  if (!list.length) card.append(C.el("div", { class: "empty", text: items.length ? "Nothing matches." : "Your pantry is empty. Tap a + button above or + Add pantry item." }));
  list.forEach((i) => card.append(row(i)));
  $("pnBody").replaceChildren(quick, card);
}
$("pnSearch").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); if (C) refreshPantry(); });

function expiryText(i) {
  const d = daysLeft(i);
  if (d == null) return "";
  if (d < 0) return "Expired " + Math.abs(d) + (Math.abs(d) === 1 ? " day ago" : " days ago");
  if (d === 0) return "Expires today";
  if (d <= 7) return "Expires in " + d + (d === 1 ? " day" : " days");
  return "Expires " + C.dates.shortDate(i.expiryDate);
}

function row(i) {
  const step = STEP[i.unit] || 1;
  const change = (dir) => async () => {
    const q = Math.max(0, Math.round((Number(i.quantity) + dir * step) * 100) / 100);
    try { await updateDoc(doc(C.db, "pantry", i.id), { quantity: q, updatedAt: serverTimestamp() }); }
    catch (e) { C.toast("Could not update. Try again."); }
  };
  const d = daysLeft(i);
  const r = C.el("div", { class: "row" },
    C.el("div", { class: "t", onclick: () => sheet(i) }, C.el("b", { text: i.name }),
      C.el("span", { class: "sub", text: [i.category, i.location, expiryText(i)].filter(Boolean).join(DOT) })));
  if (d != null && d < 0) r.append(C.el("span", { class: "tag e", text: "Expired" }));
  else if (d != null && d <= 7) r.append(C.el("span", { class: "tag w", text: "Soon" }));
  if (isLow(i)) r.append(C.el("button", { class: "tag e", text: "+ Restock", onclick: () => toRestock(i) }));
  r.append(C.el("button", { class: "round", style: "width:34px;height:34px", text: "−", "aria-label": "Use some", onclick: change(-1) }),
    C.el("b", { style: "min-width:54px;text-align:center;font-size:14px", text: fmt(i.quantity) + " " + (i.unit || "") }),
    C.el("button", { class: "round", style: "width:34px;height:34px", text: "+", "aria-label": "Add some", onclick: change(1) }));
  return r;
}

async function toRestock(i) {
  try {
    const res = await addRestockItem({ name: i.name, category: ["Dairy & eggs", "Meat & seafood", "Fresh produce", "Rice & grains"].includes(i.category) ? "Groceries" : i.category === "Cooking essentials" ? "Kitchen" : "Groceries", quantity: "1 " + (i.unit || "") });
    C.toast(res === "duplicate" ? i.name + " is already on Restock" : i.name + " added to Restock ✓");
  } catch (e) { C.toast("Could not add. Try again."); }
}

/* ---------- Recipe suggestions from what we have ---------- */
function cookSheet() {
  const have = items.filter((i) => Number(i.quantity) > 0).map((i) => i.name.trim().toLowerCase()).filter((n) => n.length >= 3);
  const matches = (ing) => { const n = ing.trim().toLowerCase(); return have.some((h) => h.includes(n) || n.includes(h)); };
  const ranked = getRecipes().filter((r) => (r.ingredients || []).length).map((r) => {
    const ings = r.ingredients.map((x) => x.name);
    const got = ings.filter(matches);
    return { r, got: got.length, total: ings.length, missing: ings.filter((x) => !matches(x)) };
  }).filter((x) => x.got > 0).sort((a, b) => b.got / b.total - a.got / a.total || b.got - a.got).slice(0, 10);

  const rows = ranked.map((x) => C.el("div", { class: "row" }, C.el("div", { class: "ic", text: "🍳" }),
    C.el("div", { class: "t" }, C.el("b", { text: x.r.name }),
      C.el("span", { class: "sub", text: "Have " + x.got + " of " + x.total + " ingredients" + (x.missing.length ? DOT + "Need " + x.missing.slice(0, 4).join(", ") + (x.missing.length > 4 ? "…" : "") : DOT + "Ready to cook ✓") }))));
  setSheet(C.el("h2", { style: "font-size:24px", text: "What can we cook?" }),
    C.el("div", { class: "sub", text: "Matched by ingredient names against what's in your pantry. It's a guide, so check quantities yourself." }),
    ...(rows.length ? rows : [C.el("div", { class: "empty", text: "No matches yet. Add pantry items and recipes with ingredients." })]),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: () => $("sbg").classList.remove("on") })));
  $("sbg").classList.add("on");
}

/* ---------- Add / edit ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map((o) => C.el("option", { value: o, text: o })));
  s.value = value;
  return s;
}

export function sheet(i, preset) {
  if (!C) return;
  const isNew = !i;
  const p = preset || {};
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "e.g. Jasmine rice" });
  const category = select(CATS, isNew ? p.category || "Other" : i.category);
  const qty = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal" });
  const unit = select(UNITS, isNew ? p.unit || "pcs" : i.unit || "pcs");
  const min = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "Optional, e.g. 1" });
  const bought = C.el("input", { type: "date" });
  const expiry = C.el("input", { type: "date" });
  const loc = select(LOCS, isNew ? p.location || "Pantry cupboard" : i.location || "Pantry cupboard");
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  if (isNew) { name.value = p.name || ""; qty.value = p.quantity != null ? p.quantity : ""; bought.value = p.purchaseDate || C.dates.todayIso(); }
  else { name.value = i.name; qty.value = i.quantity; min.value = i.minQty == null ? "" : i.minQty; bought.value = i.purchaseDate || ""; expiry.value = i.expiryDate || ""; note.value = i.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    const q = num(qty.value);
    if (!nm) { C.toast("Please type the item name"); return; }
    if (q == null) { C.toast("Please enter the quantity"); return; }
    const data = { name: nm, category: category.value, quantity: q, unit: unit.value, minQty: num(min.value), purchaseDate: bought.value || "",
      expiryDate: expiry.value || "", location: loc.value, note: note.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "pantry"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "pantry", i.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Remove item", onclick: async () => {
    if (!window.confirm("Remove this item for both of you?")) return;
    try { await deleteDoc(doc(C.db, "pantry", i.id)); closeSheet(); C.toast("Item removed"); }
    catch (e) { C.toast("Could not remove. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add pantry item" : "Edit item" }),
    ...field("Item name", name), ...field("Category", category), ...field("Quantity", qty), ...field("Unit", unit),
    ...field("Low-stock alert at (or below)", min), ...field("Purchase date", bought), ...field("Expiry date", expiry),
    ...field("Storage location", loc), ...field("Note", note),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

// Used by Restock: after buying something, move it into the pantry.
export function addFromRestock(item) {
  const q = parseFloat(item.quantity);
  sheet(null, { name: item.name, category: item.category === "Kitchen" ? "Cooking essentials" : "Other", quantity: Number.isFinite(q) ? q : 1, purchaseDate: C ? C.dates.todayIso() : "" });
}

export const getPantry = () => items;
