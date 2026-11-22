// mealplan.js - weekly meal planner and grocery list (Step 10)
import { collection, onSnapshot, setDoc, addDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getRecipes } from "./recipes.js";
import { addRestockItem } from "./restock.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const SLOTS = [["breakfast", "Breakfast", "🌅"], ["lunch", "Lunch", "🍱"], ["dinner", "Dinner", "🍽️"], ["snacks", "Snacks", "🍪"]];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => "RM " + Math.round(n).toLocaleString("en-MY");
const fmtQty = (n) => (n == null ? "" : String(Math.round(n * 100) / 100));

let C = null;
let plans = {};      // weekly plans, keyed by the Monday date
let saved = [];      // saved favourite plans
let groceries = [];  // grocery expenses (for spending so far)
let weekStart = "";

function mondayOf(iso) { const d = C.dates.parseIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return C.dates.isoOf(d); }
function addDays(iso, n) { const d = C.dates.parseIso(iso); d.setDate(d.getDate() + n); return C.dates.isoOf(d); }
function weekLabel(start) {
  const a = C.dates.parseIso(start), b = C.dates.parseIso(addDays(start, 6));
  const mo = (d) => d.toLocaleDateString("en-GB", { month: "short" });
  return a.getMonth() === b.getMonth() ? a.getDate() + "–" + b.getDate() + " " + mo(b) : a.getDate() + " " + mo(a) + " – " + b.getDate() + " " + mo(b);
}
function budget() {
  const g = (C.getSettings() || {}).groceryBudget || {};
  return Number(g.weekly) > 0 ? Number(g.weekly) : 130;
}
const spentThisWeek = () => groceries.filter((e) => e.date >= weekStart && e.date <= addDays(weekStart, 6)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
const slotKey = (day, slot) => day + "_" + slot;
const entries = (day, slot) => ((plans[weekStart] || {}).slots || {})[slotKey(day, slot)] || [];
const weekHasMeals = () => Object.values((plans[weekStart] || {}).slots || {}).some((a) => a && a.length);

/* ---------- Start ---------- */
export function startMealplan(ctx) {
  C = ctx;
  plans = {}; saved = []; groceries = [];
  weekStart = mondayOf(C.dates.todayIso());
  const subs = [
    onSnapshot(collection(C.db, "mealplans"), (s) => { plans = {}; s.docs.forEach((d) => { plans[d.id] = d.data(); }); refreshMeals(); }),
    onSnapshot(collection(C.db, "savedPlans"), (s) => { saved = s.docs.map((d) => ({ id: d.id, ...d.data() })); }),
    onSnapshot(collection(C.db, "expenses"), (s) => { groceries = s.docs.map((d) => d.data()).filter((e) => e.category === "Groceries" && e.date); refreshMeals(); })
  ];
  return () => { subs.forEach((u) => u()); C = null; };
}
export function onMealsOpen() { if (C) { weekStart = mondayOf(C.dates.todayIso()); refreshMeals(); } }

/* ---------- Grocery list (combined from the planned recipes) ---------- */
function buildList() {
  const recipes = getRecipes();
  const map = new Map();
  let manual = 0;
  for (let i = 0; i < 7; i++) {
    for (const [slot] of SLOTS) {
      for (const m of entries(addDays(weekStart, i), slot)) {
        const r = m.recipeId && recipes.find((x) => x.id === m.recipeId);
        if (!r) { manual++; continue; }
        const factor = (Number(m.servings) || 2) / (Number(r.servings) || 2);
        for (const ing of r.ingredients || []) {
          const key = ing.name.trim().toLowerCase() + "|" + (ing.unit || "").trim().toLowerCase();
          const row = map.get(key) || { name: ing.name, unit: ing.unit || "", qty: 0, qtyKnown: false, cost: 0, costKnown: false, uses: 0 };
          if (ing.qty != null) { row.qty += ing.qty * factor; row.qtyKnown = true; }
          if (ing.cost != null) { row.cost += ing.cost * factor; row.costKnown = true; }
          row.uses++;
          map.set(key, row);
        }
      }
    }
  }
  const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { rows, manual, est: rows.reduce((s, r) => s + (r.costKnown ? r.cost : 0), 0), withCost: rows.filter((r) => r.costKnown).length };
}

/* ---------- Screen ---------- */
export function refreshMeals() {
  if (!C || !$("mealplan").classList.contains("on")) return;
  const today = C.dates.todayIso();
  const list = buildList();
  const b = budget();
  const spent = spentThisWeek();

  const nav = C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Previous week", onclick: () => { weekStart = addDays(weekStart, -7); refreshMeals(); } }),
    C.el("b", { text: weekStart === mondayOf(today) ? "This week" + DOT + weekLabel(weekStart) : weekLabel(weekStart) }),
    C.el("button", { class: "round", text: "›", "aria-label": "Next week", onclick: () => { weekStart = addDays(weekStart, 7); refreshMeals(); } }));

  const warn = list.est > b ? "The estimated shopping cost is over this week's " + rm0(b) + " budget."
    : list.est > b - spent ? "The estimate is more than what's left of this week's budget after " + rm0(spent) + " already spent." : "";
  const summary = C.el("div", { class: "card" },
    C.el("div", { class: "sub", text: "Estimated cost of planned meals" }),
    C.el("div", { class: "serif", style: "font-size:30px", text: list.rows.length ? rm(list.est) : "–" }),
    C.el("div", { class: "sub", text: "Budget " + rm0(b) + DOT + "Spent so far " + rm(spent) + DOT + "Left " + rm(Math.max(0, b - spent)) }),
    list.rows.length ? C.el("div", { class: "sub", style: "margin-top:6px", text: "Based on your own ingredient costs for " + list.withCost + " of " + list.rows.length + " ingredients. Check prices in-store or online." }) : null,
    list.manual ? C.el("div", { class: "sub", text: list.manual + " meal" + (list.manual === 1 ? "" : "s") + " without a recipe aren't counted." }) : null,
    C.el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" },
      C.el("button", { class: "btn", style: "padding:10px 16px", text: "Grocery list", onclick: () => listSheet(list) }),
      C.el("button", { class: "tag", text: "Save plan", onclick: saveSheet }),
      C.el("button", { class: "tag", text: "Saved plans", onclick: savedSheet })));
  const out = [nav, summary];
  if (warn) out.push(C.el("div", { class: "card", style: "display:flex;gap:10px;align-items:center" }, C.el("span", { class: "tag w", text: "Over" }), C.el("span", { text: warn })));

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const card = C.el("div", { class: "card" }, C.el("b", { style: day === today ? "color:var(--pri)" : "", text: C.dates.shortDate(day) + (day === today ? " · Today" : "") }));
    SLOTS.forEach(([slot, label, icon]) => {
      const items = entries(day, slot);
      const names = items.length ? items.map((m, k) => C.el("button", { class: "pill", style: "margin:2px 6px 2px 0", text: m.name + (m.recipeId ? " ×" + m.servings : ""), onclick: () => entrySheet(day, slot, k) })) : [C.el("span", { class: "sub", text: "Nothing planned" })];
      card.append(C.el("div", { class: "row" }, C.el("div", { class: "ic", text: icon }),
        C.el("div", { class: "t" }, C.el("span", { class: "sub", text: label }), C.el("div", {}, names)),
        C.el("button", { class: "round", text: "+", "aria-label": "Add " + label, onclick: () => addSheet(day, slot) })));
    });
    out.push(card);
  }
  $("mpBody").replaceChildren(...out);
}

/* ---------- Saving to the week ---------- */
async function writeSlot(day, slot, arr) {
  try { await setDoc(doc(C.db, "mealplans", weekStart), { weekStart, slots: { [slotKey(day, slot)]: arr }, updatedAt: serverTimestamp() }, { merge: true }); return true; }
  catch (e) { C.toast("Could not save. Try again."); return false; }
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }

function addSheet(day, slot) {
  const label = SLOTS.find((s) => s[0] === slot)[1];
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "Type a meal, e.g. Roti canai" });
  const add = async (m) => { if (await writeSlot(day, slot, [...entries(day, slot), m])) { closeSheet(); C.toast("Added ✓"); } };
  const recipes = getRecipes().slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const rows = recipes.map((r) => C.el("div", { class: "row", onclick: () => add({ name: r.name, recipeId: r.id, servings: 2 }) },
    C.el("div", { class: "ic", text: "🍳" }), C.el("div", { class: "t" }, C.el("b", { text: r.name }), C.el("span", { class: "sub", text: r.category + DOT + "Serves " + (r.servings || 2) }))));
  setSheet(C.el("h2", { style: "font-size:24px", text: label + DOT + C.dates.shortDate(day) }),
    C.el("label", { text: "Add your own meal" }), name,
    C.el("button", { class: "btn", style: "width:100%", text: "Add meal", onclick: () => { const n = name.value.trim(); if (!n) { C.toast("Please type a meal"); return; } add({ name: n, recipeId: null, servings: 2 }); } }),
    C.el("label", { style: "margin-top:16px", text: "Or choose a saved recipe (planned for 2 people)" }),
    ...(rows.length ? rows : [C.el("div", { class: "empty", text: "No recipes yet. Add some in More → Recipes." })]),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet })));
  $("sbg").classList.add("on");
}

function entrySheet(day, slot, k) {
  const arr = entries(day, slot);
  const m = arr[k];
  if (!m) return;
  const step = (d) => C.el("button", { class: "round", text: d > 0 ? "+" : "−", "aria-label": d > 0 ? "More servings" : "Fewer servings", onclick: async () => {
    const next = arr.map((x, i) => (i === k ? { ...x, servings: Math.min(20, Math.max(1, (Number(x.servings) || 2) + d)) } : x));
    if (await writeSlot(day, slot, next)) setTimeout(() => entrySheet(day, slot, k), 200);
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: m.name }),
    C.el("div", { class: "sub", text: SLOTS.find((s) => s[0] === slot)[1] + DOT + C.dates.shortDate(day) }),
    m.recipeId ? C.el("div", { style: "display:flex;align-items:center;gap:12px;margin:14px 0" }, step(-1), C.el("b", { text: "Serves " + m.servings }), step(1)) : null,
    C.el("button", { class: "btn ghost del", style: "width:100%;margin-top:10px", text: "Remove from plan", onclick: async () => { if (await writeSlot(day, slot, arr.filter((_, i) => i !== k))) closeSheet(); } }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet })));
  $("sbg").classList.add("on");
}

function listSheet(list) {
  if (!list.rows.length) {
    setSheet(C.el("h2", { style: "font-size:24px", text: "Grocery list" }),
      C.el("div", { class: "sub", text: "Plan some meals that use saved recipes, and the ingredients will be combined here." }),
      C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet })));
    $("sbg").classList.add("on");
    return;
  }
  const boxes = list.rows.map((r) => {
    const cb = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
    cb.checked = true;
    const qty = r.qtyKnown ? fmtQty(r.qty) + (r.unit ? " " + r.unit : "") : r.unit || "as needed";
    const row = C.el("label", { class: "row", style: "display:flex;margin:0;color:var(--tx)" }, cb,
      C.el("div", { class: "t" }, C.el("b", { text: r.name }),
        C.el("span", { class: "sub", text: [qty, r.costKnown ? "~" + rm(r.cost) : "", r.uses > 1 ? "Used in " + r.uses + " meals" : ""].filter(Boolean).join(DOT) })));
    row.cb = cb; row.item = r; row.qty = qty;
    return row;
  });
  const send = C.el("button", { class: "btn", text: "Send to Restock", onclick: async () => {
    let added = 0, dup = 0;
    send.disabled = true;
    try {
      for (const row of boxes.filter((x) => x.cb.checked)) {
        const res = await addRestockItem({ name: row.item.name, category: "Groceries", quantity: row.qty, note: "For this week's meal plan" });
        if (res === "duplicate") dup++; else if (res) added++;
      }
      closeSheet();
      C.toast(added + " added to Restock" + (dup ? ", " + dup + " already there" : "") + " ✓");
    } catch (e) { C.toast("Could not send. Try again."); send.disabled = false; }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Grocery list" }),
    C.el("div", { class: "sub", text: "Combined from your planned recipes. Untick anything you already have at home." }),
    ...boxes,
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Estimated total " + rm(list.est) + ". Costs are your own estimates, so check prices before you shop." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet }), send));
  $("sbg").classList.add("on");
}

/* ---------- Saved favourite plans ---------- */
function saveSheet() {
  if (!weekHasMeals()) { C.toast("Plan some meals first"); return; }
  const name = C.el("input", { type: "text", maxlength: "50", placeholder: "e.g. Budget week" });
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const n = name.value.trim();
    if (!n) { C.toast("Please type a name"); return; }
    const slots = {};
    for (let i = 0; i < 7; i++) for (const [slot] of SLOTS) { const a = entries(addDays(weekStart, i), slot); if (a.length) slots[i + "_" + slot] = a; }
    try { await addDoc(collection(C.db, "savedPlans"), { name: n, slots, createdBy: C.uid, createdAt: serverTimestamp() }); closeSheet(); C.toast("Plan saved ✓"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Save this week's plan" }),
    C.el("label", { text: "Plan name" }), name,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

function savedSheet() {
  const rows = saved.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((p) => C.el("div", { class: "row" },
    C.el("div", { class: "t" }, C.el("b", { text: p.name }), C.el("span", { class: "sub", text: Object.values(p.slots || {}).reduce((s, a) => s + a.length, 0) + " meals" })),
    C.el("button", { class: "tag", text: "Use", onclick: async () => {
      if (weekHasMeals() && !window.confirm("This replaces the meals already planned for this week. Continue?")) return;
      const slots = {};
      Object.entries(p.slots || {}).forEach(([k, arr]) => { const [i, slot] = k.split("_"); slots[slotKey(addDays(weekStart, Number(i)), slot)] = arr; });
      try { await setDoc(doc(C.db, "mealplans", weekStart), { weekStart, slots, updatedAt: serverTimestamp() }); closeSheet(); C.toast("Plan applied ✓"); }
      catch (e) { C.toast("Could not apply. Try again."); }
    } }),
    C.el("button", { class: "tag e", text: "Delete", onclick: async () => {
      if (!window.confirm("Delete the saved plan \"" + p.name + "\"?")) return;
      try { await deleteDoc(doc(C.db, "savedPlans", p.id)); closeSheet(); C.toast("Deleted"); } catch (e) { C.toast("Could not delete. Try again."); }
    } })));
  setSheet(C.el("h2", { style: "font-size:24px", text: "Saved plans" }),
    ...(rows.length ? rows : [C.el("div", { class: "empty", text: "No saved plans yet. Plan a week, then tap Save plan." })]),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet })));
  $("sbg").classList.add("on");
}
