// petstock.js - pet food, litter and supplies (Phase 4, Step 2)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addRestockItem } from "./restock.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const KINDS = [["dry", "Dry food", "🥣"], ["wet", "Wet food", "🐟"], ["treat", "Treats", "🍬"], ["supplement", "Supplements", "💊"], ["litter", "Litter", "🪣"], ["supply", "Supplies", "🧸"]];
const FOOD = ["dry", "wet", "treat", "supplement"];
const UNITS = ["pack", "pouch", "can", "bag", "kg", "g", "pcs", "L", "box"];
const STEP = { g: 100, kg: 0.5, L: 0.5 };
const RESTOCK_CAT = { dry: "Cat food", wet: "Cat food", treat: "Cat treats", supplement: "Pet supplies", litter: "Cat litter", supply: "Pet supplies" };
const kindInfo = (k) => KINDS.find((x) => x[0] === k) || KINDS[5];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };

let C = null;
let stock = [], purchases = [], feeds = [];
let kind = "All", tab = "all", query = "";

const activePets = () => C.getPets().filter((p) => p.status === "active" || !p.status);
const petNamesOf = (it) => ((it.petIds || []).length ? it.petIds.map((id) => (C.getPets().find((p) => p.id === id) || {}).name).filter(Boolean).join(", ") : "All cats");
const isLow = (i) => i.minQty != null && Number(i.quantity) <= Number(i.minQty);
const daysToExpiry = (i) => (i.expiryDate ? C.dates.daysBetween(C.dates.todayIso(), i.expiryDate) : null);
const isExpiring = (i) => { const d = daysToExpiry(i); return d != null && d <= 14; };

/* ---------- Start ---------- */
export function startPetstock(ctx) {
  C = ctx;
  stock = []; purchases = []; feeds = []; kind = "All"; tab = "all"; query = "";
  const subs = [
    onSnapshot(collection(C.db, "petstock"), (s) => { stock = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "petpurchases"), (s) => { purchases = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "petfeeds"), (s) => { feeds = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); })
  ];
  return () => { subs.forEach((u) => u()); C = null; };
}
function changed() { refreshPetstock(); if (C && C.afterChange) C.afterChange(); }
export function onPetstockOpen() { if (C) { kind = "All"; tab = "all"; query = ""; $("psSearch").value = ""; refreshPetstock(); } }
export const lowStockCount = () => (C ? stock.filter(isLow).length : 0);

/* ---------- Estimates and spending ---------- */
// How much of an item is used per day: from the feeding log if there is enough, otherwise the number you entered.
function perDay(it) {
  const t = C.dates.todayIso();
  const recent = feeds.filter((f) => f.stockId === it.id && C.dates.daysBetween(f.date, t) <= 14 && C.dates.daysBetween(f.date, t) >= 0);
  const days = new Set(recent.map((f) => f.date));
  if (days.size >= 3) {
    const first = recent.map((f) => f.date).sort()[0];
    const span = Math.max(3, C.dates.daysBetween(first, t) + 1);
    return recent.reduce((s, f) => s + (Number(f.amount) || 0), 0) / span;
  }
  return Number(it.perDay) > 0 ? Number(it.perDay) : null;
}
function daysLeft(it) { const p = perDay(it); return p ? Math.floor(Number(it.quantity) / p) : null; }

export function spend(month, opts = {}) {
  const pets = activePets();
  return purchases.reduce((sum, p) => {
    if (!p.price || !(p.date || "").startsWith(month)) return sum;
    const it = stock.find((s) => s.id === p.stockId);
    if (!it) return sum;
    if (opts.foodOnly && !FOOD.includes(it.kind)) return sum;
    if (opts.nonFoodOnly && FOOD.includes(it.kind)) return sum;
    if (opts.petId) {
      const ids = (it.petIds || []).length ? it.petIds : pets.map((x) => x.id);
      return ids.includes(opts.petId) ? sum + p.price / ids.length : sum;
    }
    return sum + p.price;
  }, 0);
}

/* ---------- Page ---------- */
export function refreshPetstock() {
  if (!C || !$("petstock").classList.contains("on")) return;
  const month = C.dates.todayIso().slice(0, 7);
  $("psTabs").replaceChildren(...[["all", "All " + stock.length], ["low", "Low stock " + stock.filter(isLow).length], ["exp", "Expiring " + stock.filter(isExpiring).length]].map(([k, l]) =>
    C.el("button", { class: "pill" + (tab === k ? " on" : ""), text: l, onclick: () => { tab = k; refreshPetstock(); } })));
  $("psKinds").replaceChildren(...[["All", "All"], ...KINDS.map((k) => [k[0], k[2] + " " + k[1]])].map(([k, l]) =>
    C.el("button", { class: "pill" + (kind === k ? " on" : ""), text: l, onclick: () => { kind = k; refreshPetstock(); const on = $("psKinds").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  let list = stock.slice();
  if (tab === "low") list = list.filter(isLow); else if (tab === "exp") list = list.filter(isExpiring);
  if (kind !== "All") list = list.filter((i) => i.kind === kind);
  if (query) list = list.filter((i) => ((i.brand || "") + " " + (i.name || "") + " " + (i.flavour || "")).toLowerCase().includes(query));
  list.sort((a, b) => (a.kind || "").localeCompare(b.kind || "") || (a.name || "").localeCompare(b.name || ""));

  const summary = C.el("div", { class: "card" },
    C.el("div", { class: "sub", text: "Spent this month on pets' food and supplies" }),
    C.el("div", { class: "serif", style: "font-size:28px", text: rm(spend(month)) }),
    C.el("div", { class: "sub", text: "Food " + rm(spend(month, { foodOnly: true })) + DOT + "Litter and supplies " + rm(spend(month, { nonFoodOnly: true })) }));

  const card = C.el("div", { class: "card" }, C.el("b", { text: list.length + (list.length === 1 ? " item" : " items") }));
  if (!list.length) card.append(C.el("div", { class: "empty", text: stock.length ? "Nothing matches." : "Nothing added yet. Tap + Add item to start." }));
  list.forEach((i) => card.append(row(i)));
  $("psBody").replaceChildren(summary, card);
}
$("psSearch").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); if (C) refreshPetstock(); });

function title(i) { return [i.brand, i.name].filter(Boolean).join(" ") || "Unnamed item"; }

function row(i) {
  const step = STEP[i.unit] || 1;
  const change = (dir) => async () => {
    try { await updateDoc(doc(C.db, "petstock", i.id), { quantity: Math.max(0, Math.round((Number(i.quantity) + dir * step) * 100) / 100), updatedAt: serverTimestamp() }); }
    catch (e) { C.toast("Could not update. Try again."); }
  };
  const d = daysLeft(i), ex = daysToExpiry(i);
  const meta = [kindInfo(i.kind)[1], petNamesOf(i), d != null ? "~" + d + (d === 1 ? " day" : " days") + " left (estimate)" : "", ex != null ? (ex < 0 ? "Expired" : "Expires " + C.dates.shortDate(i.expiryDate)) : ""].filter(Boolean).join(DOT);
  const r = C.el("div", { class: "row" }, C.el("div", { class: "ic", text: kindInfo(i.kind)[2] }),
    C.el("div", { class: "t", onclick: () => itemSheet(i) }, C.el("b", { text: title(i) }), C.el("span", { class: "sub", text: meta })));
  if (ex != null && ex < 0) r.append(C.el("span", { class: "tag e", text: "Expired" }));
  else if (ex != null && ex <= 14) r.append(C.el("span", { class: "tag w", text: "Soon" }));
  if (isLow(i)) r.append(C.el("button", { class: "tag e", text: "+ Restock", onclick: () => toRestock(i) }));
  r.append(C.el("button", { class: "round", style: "width:34px;height:34px", text: "−", "aria-label": "Use some", onclick: change(-1) }),
    C.el("b", { style: "min-width:50px;text-align:center;font-size:14px", text: fmt(i.quantity) + " " + (i.unit || "") }),
    C.el("button", { class: "round", style: "width:34px;height:34px", text: "+", "aria-label": "Add some", onclick: change(1) }));
  return r;
}

async function toRestock(i) {
  try {
    const res = await addRestockItem({ name: title(i), category: RESTOCK_CAT[i.kind] || "Pet supplies", quantity: i.packSize || "1", brand: i.brand || "", link: "", note: "Low stock" + (i.shop ? " · usual shop: " + i.shop : "") });
    C.toast(res === "duplicate" ? "Already on Restock" : "Added to Restock ✓");
  } catch (e) { C.toast("Could not add. Try again."); }
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}
const checkbox = () => C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });

// Optionally records a purchase in the main Expenses (once, never twice).
async function makeExpense(it, price, date, qty) {
  const pets = (it.petIds || []).length === 1 ? it.petIds[0] : null;
  const ref = await addDoc(collection(C.db, "expenses"), { amount: Math.round(price * 100) / 100, description: title(it) + (qty ? " ×" + qty : ""),
    category: FOOD.includes(it.kind) ? "Pet food" : "Pets", date, paidBy: C.uid, note: "From Pet supplies", petId: pets, linkedPurchase: true, createdBy: C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export function itemSheet(it, preset) {
  if (!C) return;
  const isNew = !it;
  const p = preset || {};
  const k = select(KINDS.map((x) => [x[0], x[2] + " " + x[1]]), isNew ? p.kind || "dry" : it.kind);
  const brand = C.el("input", { type: "text", maxlength: "40", placeholder: "e.g. Royal Canin" });
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "e.g. Indoor Adult" });
  const flavour = C.el("input", { type: "text", maxlength: "40", placeholder: "Optional" });
  const pack = C.el("input", { type: "text", maxlength: "30", placeholder: "e.g. 2 kg bag or 85 g pouch" });
  const qty = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal" });
  const unit = select(UNITS.map((u) => [u, u]), isNew ? "pack" : it.unit || "pack");
  const min = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "Optional minimum stock" });
  const expiry = C.el("input", { type: "date" });
  const where = C.el("input", { type: "text", maxlength: "40", placeholder: "e.g. Kitchen cupboard" });
  const price = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Optional, in RM" });
  const shop = C.el("input", { type: "text", maxlength: "40", placeholder: "Preferred shop" });
  const perd = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "Optional, e.g. 1.5" });
  const notes = C.el("textarea", { maxlength: "300", placeholder: "Feeding notes or other details" });
  const addExp = checkbox(); addExp.checked = true;
  const petBoxes = activePets().map((pt) => { const c = checkbox(); c.checked = isNew ? (p.petIds || []).includes(pt.id) : (it.petIds || []).includes(pt.id);
    return { pet: pt, c, node: C.el("label", { style: "display:flex;gap:10px;align-items:center;margin:6px 0;color:var(--tx);font-size:15px" }, c, C.el("span", { text: pt.name })) }; });
  qty.value = "1";
  if (!isNew) { brand.value = it.brand || ""; name.value = it.name || ""; flavour.value = it.flavour || ""; pack.value = it.packSize || ""; qty.value = it.quantity; min.value = it.minQty == null ? "" : it.minQty;
    expiry.value = it.expiryDate || ""; where.value = it.location || ""; price.value = it.price == null ? "" : it.price; shop.value = it.shop || ""; perd.value = it.perDay == null ? "" : it.perDay; notes.value = it.notes || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    if (!brand.value.trim() && !name.value.trim()) { C.toast("Please type a brand or product name"); return; }
    const q = num(qty.value);
    if (q == null) { C.toast("Please enter the quantity"); return; }
    const data = { kind: k.value, brand: brand.value.trim(), name: name.value.trim(), flavour: flavour.value.trim(), packSize: pack.value.trim(), quantity: q, unit: unit.value,
      minQty: num(min.value), expiryDate: expiry.value || "", location: where.value.trim(), price: num(price.value), shop: shop.value.trim(), perDay: num(perd.value),
      petIds: petBoxes.filter((b) => b.c.checked).map((b) => b.pet.id), notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) {
        const today = C.dates.todayIso();
        const ref = await addDoc(collection(C.db, "petstock"), { ...data, purchaseDate: today, createdBy: C.uid, createdAt: serverTimestamp() });
        if (data.price) {
          let expenseId = null;
          if (addExp.checked) expenseId = await makeExpense({ ...data }, data.price, today, q);
          await addDoc(collection(C.db, "petpurchases"), { stockId: ref.id, date: today, qty: q, price: data.price, shop: data.shop, expenseId, by: C.uid, createdAt: serverTimestamp() });
        }
      } else await updateDoc(doc(C.db, "petstock", it.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const history = isNew ? [] : purchases.filter((x) => x.stockId === it.id).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8)
    .map((x) => C.el("div", { class: "sub", text: [C.dates.shortDate(x.date), x.qty ? "×" + x.qty : "", x.price ? rm(x.price) : "", x.shop].filter(Boolean).join(DOT) }));
  const more = isNew ? null : C.el("button", { class: "btn ghost", style: "width:100%;margin-top:12px", text: "I bought more", onclick: () => boughtSheet(it) });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete item", onclick: async () => {
    if (!window.confirm("Delete this item and its purchase and feeding records for both of you? Expenses already recorded stay.")) return;
    try {
      const b = writeBatch(C.db);
      purchases.filter((x) => x.stockId === it.id).slice(0, 200).forEach((x) => b.delete(doc(C.db, "petpurchases", x.id)));
      feeds.filter((x) => x.stockId === it.id).slice(0, 200).forEach((x) => b.delete(doc(C.db, "petfeeds", x.id)));
      b.delete(doc(C.db, "petstock", it.id));
      await b.commit(); closeSheet(); C.toast("Item deleted");
    } catch (e) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add item" : "Edit item" }),
    ...field("Type", k), ...field("Brand", brand), ...field("Product name", name), ...field("Flavour or formula", flavour), ...field("Pack size", pack),
    ...field("Quantity in stock", qty), ...field("Unit", unit), ...field("Low-stock alert at (or below)", min), ...field("Expiry date", expiry),
    ...field("Storage location", where), ...field("Price in RM", price), ...field("Preferred shop", shop),
    C.el("label", { text: "Who eats or uses it (leave all unticked for everyone)" }), ...petBoxes.map((b) => b.node),
    ...field("Usually used per day (optional, for the days-left estimate)", perd), ...field("Notes", notes),
    isNew ? C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, addExp, C.el("span", { text: "Also add to Expenses (when a price is entered)" })) : null,
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Enter amounts from your vet or the product's feeding guide. The app doesn't suggest feeding amounts." }),
    history.length ? C.el("b", { style: "display:block;margin-top:14px", text: "Purchase history" }) : null, ...history, more,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function boughtSheet(it) {
  const qty = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "How many " + (it.unit || "units") });
  const price = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Total price in RM" });
  const date = C.el("input", { type: "date" });
  const shop = C.el("input", { type: "text", maxlength: "40" });
  const exp = checkbox(); exp.checked = true;
  date.value = C.dates.todayIso(); shop.value = it.shop || ""; if (it.price) price.value = it.price;
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const q = num(qty.value);
    if (!q) { C.toast("Please enter how many you bought"); return; }
    const pr = num(price.value);
    save.disabled = true;
    try {
      let expenseId = null;
      if (pr && exp.checked) expenseId = await makeExpense(it, pr, date.value, q);
      await addDoc(collection(C.db, "petpurchases"), { stockId: it.id, date: date.value, qty: q, price: pr, shop: shop.value.trim(), expenseId, by: C.uid, createdAt: serverTimestamp() });
      await updateDoc(doc(C.db, "petstock", it.id), { quantity: Math.round((Number(it.quantity) + q) * 100) / 100, price: pr != null ? pr : it.price || null, shop: shop.value.trim(), purchaseDate: date.value, updatedAt: serverTimestamp() });
      closeSheet(); C.toast("Stock updated ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Bought more" }), C.el("div", { class: "sub", text: title(it) }),
    ...field("Quantity bought", qty), ...field("Total price in RM", price), ...field("Date", date), ...field("Shop", shop),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, exp, C.el("span", { text: "Also add to Expenses" })),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

/* ---------- Feeding tab for one pet (used by pets.js) ---------- */
export function foodTab(p) {
  if (!C) return [];
  const month = C.dates.todayIso().slice(0, 7);
  const mine = stock.filter((i) => FOOD.includes(i.kind) && (!(i.petIds || []).length || i.petIds.includes(p.id)));

  const sched = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Feeding" }),
      C.el("button", { class: "tag", text: "Edit schedule", onclick: () => scheduleSheet(p) })),
    C.el("div", { style: "margin-top:6px;white-space:pre-wrap", text: p.feedSchedule || "No schedule set." }),
    p.foodPrefs ? C.el("div", { class: "sub", style: "margin-top:6px", text: "Preferences: " + p.foodPrefs }) : null,
    C.el("div", { class: "sub", style: "margin-top:6px", text: "Enter amounts from your vet or the product's feeding guide. The app doesn't suggest feeding amounts." }));

  const foods = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Food for " + p.name }),
      C.el("button", { class: "tag", text: "+ Add food", onclick: () => itemSheet(null, { kind: "dry", petIds: [p.id] }) })));
  if (!mine.length) foods.append(C.el("div", { class: "empty", text: "No food added yet." }));
  mine.forEach((i) => foods.append(row(i)));

  const log = feeds.filter((f) => f.petId === p.id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0)).slice(0, 10);
  const meals = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Meal log" }),
      C.el("button", { class: "tag", text: "+ Log a meal", onclick: () => feedSheet(p, mine) })));
  if (!log.length) meals.append(C.el("div", { class: "empty", text: "Logging meals keeps stock up to date and improves the days-left estimate." }));
  log.forEach((f) => { const it = stock.find((s) => s.id === f.stockId);
    meals.append(C.el("div", { class: "row" }, C.el("div", { class: "t" }, C.el("b", { text: it ? title(it) : "Removed item" }),
      C.el("span", { class: "sub", text: [C.dates.shortDate(f.date), fmt(f.amount) + " " + (it ? it.unit : ""), f.note].filter(Boolean).join(DOT) })),
      C.el("button", { class: "tag e", text: "Undo", onclick: () => undoFeed(f, it) }))); });

  const spendCard = C.el("div", { class: "card" }, C.el("b", { text: "Food spending this month" }),
    C.el("div", { class: "serif", style: "font-size:26px", text: rm(spend(month, { foodOnly: true, petId: p.id })) }),
    C.el("div", { class: "sub", text: "Shared food is split evenly between the cats who eat it." }));
  return [sched, foods, meals, spendCard];
}

function scheduleSheet(p) {
  const t = C.el("textarea", { maxlength: "400", placeholder: "e.g. 7am dry food, 6pm wet food", style: "min-height:100px" });
  t.value = p.feedSchedule || "";
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    try { await updateDoc(doc(C.db, "pets", p.id), { feedSchedule: t.value.trim(), updatedAt: serverTimestamp() }); closeSheet(); C.toast("Saved ✓"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · feeding schedule" }), ...field("Schedule", t),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

function feedSheet(p, foods) {
  if (!foods.length) { C.toast("Add a food for " + p.name + " first"); return; }
  const food = select(foods.map((f) => [f.id, title(f)]), foods[0].id);
  const amt = C.el("input", { type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "Amount, e.g. 1" });
  const date = C.el("input", { type: "date" });
  const note = C.el("input", { type: "text", maxlength: "100", placeholder: "Optional, e.g. left some" });
  date.value = C.dates.todayIso();
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const a = num(amt.value);
    if (!a) { C.toast("Please enter the amount"); return; }
    const it = stock.find((s) => s.id === food.value);
    save.disabled = true;
    try {
      await addDoc(collection(C.db, "petfeeds"), { petId: p.id, stockId: food.value, amount: a, date: date.value, note: note.value.trim(), by: C.uid, createdAt: serverTimestamp() });
      if (it) await updateDoc(doc(C.db, "petstock", it.id), { quantity: Math.max(0, Math.round((Number(it.quantity) - a) * 100) / 100), updatedAt: serverTimestamp() });
      closeSheet(); C.toast("Meal logged ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · log a meal" }), ...field("Food", food), ...field("Amount used (in the food's unit)", amt), ...field("Date", date), ...field("Note", note),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "This takes the amount off your stock." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

async function undoFeed(f, it) {
  if (!window.confirm("Undo this meal and put the amount back into stock?")) return;
  try {
    await deleteDoc(doc(C.db, "petfeeds", f.id));
    if (it) await updateDoc(doc(C.db, "petstock", it.id), { quantity: Math.round((Number(it.quantity) + (Number(f.amount) || 0)) * 100) / 100, updatedAt: serverTimestamp() });
  } catch (e) { C.toast("Could not undo. Try again."); }
}
