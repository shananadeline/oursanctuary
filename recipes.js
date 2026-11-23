// recipes.js - shared recipe book (Step 9)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addRestockItem } from "./restock.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = ["Breakfast", "Lunch", "Dinner", "Snacks", "Dessert", "Drinks", "Other"];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let C = null;
let recipes = [];
let filter = "All";
let query = "";

// Reads 2, 1.5, 1/2 and 1 1/2. Returns null if it is not a number.
function parseQty(s) {
  s = (s || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m && +m[3]) return +m[1] + +m[2] / +m[3];
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && +m[2]) return +m[1] / +m[2];
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const fmtQty = (n) => (n == null ? "" : String(Math.round(n * 100) / 100));
const mins = (r) => (Number(r.prepMins) || 0) + (Number(r.cookMins) || 0);
const estCost = (r, factor = 1) => {
  const costs = (r.ingredients || []).map((i) => i.cost).filter((c) => c != null);
  return costs.length ? costs.reduce((s, c) => s + c, 0) * factor : null;
};

/* ---------- Start ---------- */
export function startRecipes(ctx) {
  C = ctx;
  recipes = [];
  filter = "All";
  query = "";
  const unsub = onSnapshot(collection(C.db, "recipes"), (s) => {
    recipes = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshRecipes();
  });
  return () => { unsub(); C = null; };
}
export function onRecipesOpen() { if (C) { filter = "All"; query = ""; $("rcSearch").value = ""; refreshRecipes(); } }
export const getRecipes = () => recipes;

/* ---------- List ---------- */
export function refreshRecipes() {
  if (!C || !$("recipes").classList.contains("on")) return;
  $("rcCats").replaceChildren(...["All", "Favourites", ...CATS].map((c) =>
    C.el("button", { class: "pill" + (filter === c ? " on" : ""), text: c === "Favourites" ? "★ Favourites" : c, onclick: () => {
      filter = c; refreshRecipes(); const on = $("rcCats").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  let list = recipes.slice();
  if (filter === "Favourites") list = list.filter((r) => r.favourite);
  else if (filter !== "All") list = list.filter((r) => r.category === filter);
  if (query) list = list.filter((r) => ((r.name || "") + " " + (r.ingredients || []).map((i) => i.name).join(" ")).toLowerCase().includes(query));
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const card = C.el("div", { class: "card" }, C.el("b", { text: list.length + (list.length === 1 ? " recipe" : " recipes") }));
  if (!list.length) card.append(C.el("div", { class: "empty", text: recipes.length ? "No recipes match." : "No recipes yet. Tap + New recipe to save your first one." }));
  list.forEach((r) => {
    const cost = estCost(r);
    const meta = [r.category, mins(r) ? mins(r) + " min" : "", "Serves " + (r.servings || 2), cost != null ? "~" + rm(cost) : ""].filter(Boolean).join(DOT);
    card.append(C.el("div", { class: "row" },
      C.el("div", { class: "ic", text: "🍳" }),
      C.el("div", { class: "t", onclick: () => detail(r.id) }, C.el("b", { text: r.name }), C.el("span", { class: "sub", text: meta })),
      C.el("button", { class: "round", style: "background:none", "aria-label": "Favourite", text: r.favourite ? "★" : "☆", onclick: () => toggleFav(r) })));
  });
  $("rcBody").replaceChildren(card);
}
$("rcSearch").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); if (C) refreshRecipes(); });

async function toggleFav(r) {
  try { await updateDoc(doc(C.db, "recipes", r.id), { favourite: !r.favourite }); }
  catch (e) { C.toast("Could not update. Try again."); }
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];

// Opens a recipe. Looks it up again after any change so it never shows old data.
function detail(id, servingsNow) {
  const r = recipes.find((x) => x.id === id);
  if (!r) { closeSheet(); return; }
  const base = Number(r.servings) || 2;
  const target = servingsNow || base;
  const factor = target / base;
  const cost = estCost(r, factor);

  const step = (d) => C.el("button", { class: "round", text: d > 0 ? "+" : "−", "aria-label": d > 0 ? "More servings" : "Fewer servings",
    onclick: () => detail(id, Math.min(50, Math.max(1, target + d))) });

  const ings = (r.ingredients || []).map((i) => C.el("div", { class: "row" },
    C.el("div", { class: "t" }, C.el("b", { text: i.name }),
      C.el("span", { class: "sub", text: [i.qty != null ? fmtQty(i.qty * factor) + (i.unit ? " " + i.unit : "") : i.unit || "", i.cost != null ? "~" + rm(i.cost * factor) : ""].filter(Boolean).join(DOT) }))));

  const steps = (r.instructions || "").split("\n").map((s) => s.trim()).filter(Boolean)
    .map((s, k) => C.el("div", { style: "display:flex;gap:10px;margin:8px 0" }, C.el("b", { style: "color:var(--pri)", text: String(k + 1) }), C.el("span", { text: s })));

  const addAll = C.el("button", { class: "btn", style: "width:100%;margin-top:10px", text: "Add ingredients to Restock", onclick: async () => {
    let added = 0, dup = 0;
    try {
      for (const i of r.ingredients || []) {
        const q = i.qty != null ? fmtQty(i.qty * factor) + (i.unit ? " " + i.unit : "") : i.unit || "1";
        const res = await addRestockItem({ name: i.name, category: "Groceries", quantity: q, note: "For " + r.name });
        if (res === "duplicate") dup++; else if (res) added++;
      }
      C.toast(added + " added" + (dup ? ", " + dup + " already on the list" : "") + " ✓");
    } catch (e) { C.toast("Could not add. Try again."); }
  } });

  setSheet(
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px" },
      C.el("h2", { style: "font-size:26px", text: r.name }),
      C.el("button", { class: "round", style: "background:none", text: r.favourite ? "★" : "☆", "aria-label": "Favourite", onclick: async () => { await toggleFav(r); setTimeout(() => detail(id, target), 150); } })),
    C.el("div", { class: "sub", text: [r.category, r.prepMins ? "Prep " + r.prepMins + " min" : "", r.cookMins ? "Cook " + r.cookMins + " min" : ""].filter(Boolean).join(DOT) }),
    C.el("div", { style: "display:flex;align-items:center;gap:12px;margin:14px 0" }, step(-1), C.el("b", { text: "Serves " + target }), step(1)),
    C.el("b", { text: "Ingredients" }), ...(ings.length ? ings : [C.el("div", { class: "empty", text: "No ingredients added." })]),
    cost != null ? C.el("div", { class: "sub", style: "margin-top:8px", text: "Estimated cost " + rm(cost) + ". This is your own estimate, so check prices in-store or online." }) : null,
    addAll,
    steps.length ? C.el("b", { style: "display:block;margin-top:16px", text: "Method" }) : null, ...steps,
    r.notes ? C.el("div", { class: "card", style: "margin-top:12px" }, C.el("b", { text: "Our notes" }), C.el("div", { class: "sub", text: r.notes })) : null,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet }), C.el("button", { class: "btn", text: "Edit", onclick: () => edit(r) })));
  $("sbg").classList.add("on");
}

export function edit(r) {
  if (!C) return;
  const isNew = !r;
  const name = C.el("input", { type: "text", maxlength: "80", placeholder: "e.g. Nasi lemak" });
  const cat = C.el("select", {}, CATS.map((c) => C.el("option", { value: c, text: c })));
  const serv = C.el("input", { type: "number", min: "1", max: "50", inputmode: "numeric" });
  const prep = C.el("input", { type: "number", min: "0", inputmode: "numeric", placeholder: "Minutes" });
  const cook = C.el("input", { type: "number", min: "0", inputmode: "numeric", placeholder: "Minutes" });
  const how = C.el("textarea", { maxlength: "3000", placeholder: "One step per line", style: "min-height:110px" });
  const notes = C.el("textarea", { maxlength: "500", placeholder: "Optional" });
  serv.value = "2"; cat.value = "Dinner";

  const rowsBox = C.el("div");
  const addRow = (i) => {
    const n = C.el("input", { type: "text", maxlength: "60", placeholder: "Ingredient, e.g. Eggs" });
    const q = C.el("input", { type: "text", inputmode: "decimal", maxlength: "10", placeholder: "Qty" });
    const u = C.el("input", { type: "text", maxlength: "15", placeholder: "Unit" });
    const c = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "RM est." });
    if (i) { n.value = i.name; q.value = fmtQty(i.qty); u.value = i.unit || ""; c.value = i.cost == null ? "" : i.cost; }
    const wrap = C.el("div", { class: "card", style: "padding:10px;margin:8px 0;box-shadow:none" }, n,
      C.el("div", { style: "display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;margin-top:6px;align-items:center" }, q, u, c,
        C.el("button", { class: "round", text: "✕", "aria-label": "Remove ingredient", onclick: () => wrap.remove() })));
    wrap.get = () => ({ name: n.value.trim(), qty: parseQty(q.value), unit: u.value.trim(), cost: c.value === "" ? null : Math.max(0, parseFloat(c.value) || 0) });
    rowsBox.append(wrap);
  };
  if (!isNew) {
    name.value = r.name; cat.value = r.category || "Other"; serv.value = r.servings || 2; prep.value = r.prepMins || ""; cook.value = r.cookMins || "";
    how.value = r.instructions || ""; notes.value = r.notes || "";
    (r.ingredients || []).forEach(addRow);
  } else { addRow(); addRow(); addRow(); }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    if (!nm) { C.toast("Please type a recipe name"); return; }
    const ingredients = [...rowsBox.children].map((w) => w.get()).filter((i) => i.name).slice(0, 40);
    const data = { name: nm, category: cat.value, servings: Math.min(50, Math.max(1, parseInt(serv.value, 10) || 2)),
      prepMins: Math.max(0, parseInt(prep.value, 10) || 0), cookMins: Math.max(0, parseInt(cook.value, 10) || 0),
      ingredients, instructions: how.value.trim(), notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "recipes"), { ...data, favourite: false, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("recipes", C.nameByUid(C.uid) + " added a recipe", nm); });
      else await updateDoc(doc(C.db, "recipes", r.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete recipe", onclick: async () => {
    if (!window.confirm("Delete this recipe for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(C.db, "recipes", r.id)); closeSheet(); C.toast("Recipe deleted"); }
    catch (e) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "New recipe" : "Edit recipe" }),
    ...field("Recipe name", name), ...field("Category", cat), ...field("Servings", serv), ...field("Prep time (minutes)", prep), ...field("Cooking time (minutes)", cook),
    C.el("label", { text: "Ingredients (quantity, unit, optional estimated cost in RM)" }), rowsBox,
    C.el("button", { class: "tag", style: "margin-top:4px", text: "+ Add ingredient", onclick: () => { if (rowsBox.children.length < 40) addRow(); } }),
    ...field("Method", how), ...field("Our notes", notes),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}
