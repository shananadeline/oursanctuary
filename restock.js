// restock.js - shared shopping and restocking list (Step 7)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, setDoc, doc, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = ["Kitchen", "Groceries", "Household", "Cat food", "Cat treats", "Cat litter", "Pet supplies", "Cleaning", "Personal care", "Other"];
const DEFAULT_QUICK = [["Rice", "Groceries"], ["Eggs", "Groceries"], ["Milk", "Groceries"], ["Bread", "Groceries"], ["Cooking oil", "Groceries"],
  ["Vegetables", "Groceries"], ["Chicken", "Groceries"], ["Toiletries", "Personal care"], ["Cleaning products", "Cleaning"],
  ["Cat food", "Cat food"], ["Cat treats", "Cat treats"], ["Cat litter", "Cat litter"], ["Wet food", "Cat food"], ["Dry food", "Cat food"]];

let C = null;
let items = [];
let filter = "All";

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

// Only http and https links are allowed.
function safeUrl(s) {
  s = (s || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch (e) { return null; }
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "Link"; } };
const qtyText = (q) => (/^\d+$/.test(q || "") ? "×" + q : q || "");

/* ---------- Start ---------- */
export function startRestock(ctx) {
  C = ctx;
  items = [];
  filter = "All";
  const unsub = onSnapshot(collection(C.db, "restock"), (s) => {
    items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshRestock();
  });
  return () => { unsub(); C = null; };
}
export function onRestockOpen() { if (C) { filter = "All"; refreshRestock(); } }

// Other parts of the app (pantry, pet food) can use this later to add a low-stock item.
export async function addRestockItem(data) {
  if (!C) return false;
  const dup = items.find((i) => !i.bought && i.name.toLowerCase() === data.name.toLowerCase());
  if (dup) return "duplicate";
  await addDoc(collection(C.db, "restock"), { name: data.name, category: data.category || "Other", quantity: data.quantity || "1",
    note: data.note || "", brand: data.brand || "", link: data.link || "", bought: false, addedBy: C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return true;
}

/* ---------- Screen ---------- */
const customQuick = () => ((C.getSettings() || {}).quickAdds || []).filter((q) => q && q.name);

export function refreshRestock() {
  if (!C || !$("restock").classList.contains("on")) return;

  $("rsCats").replaceChildren(...["All", ...CATS].map((c) =>
    C.el("button", { class: "pill" + (filter === c ? " on" : ""), text: c, onclick: () => { filter = c; refreshRestock();
      const on = $("rsCats").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  const quick = [...DEFAULT_QUICK.map(([n, c]) => ({ name: n, category: c })), ...customQuick()];
  $("rsQuick").replaceChildren(
    ...quick.map((q) => C.el("button", { class: "pill", text: "+ " + q.name, onclick: () => quickAdd(q) })),
    C.el("button", { class: "pill", text: "✎ My suggestions", onclick: suggestionSheet }));

  const list = items.filter((i) => filter === "All" || i.category === filter);
  const pending = list.filter((i) => !i.bought).sort((a, b) => CATS.indexOf(a.category) - CATS.indexOf(b.category) || ms(a.createdAt) - ms(b.createdAt));
  const bought = list.filter((i) => i.bought).sort((a, b) => ms(b.boughtAt) - ms(a.boughtAt));

  const toBuy = C.el("div", { class: "card" }, C.el("b", { text: "To buy " + pending.length }));
  if (!pending.length) toBuy.append(C.el("div", { class: "empty", text: "Nothing to buy. Tap a quick-add above or + Add item." }));
  pending.forEach((i) => toBuy.append(row(i)));

  const done = C.el("div", { class: "card" }, C.el("b", { text: "Bought " + bought.length }));
  if (!bought.length) done.append(C.el("div", { class: "empty", text: "Bought items appear here." }));
  bought.slice(0, 20).forEach((i) => done.append(row(i)));
  if (bought.length > 20) done.append(C.el("div", { class: "empty", text: "Showing the latest 20." }));
  if (bought.length) done.append(C.el("button", { class: "tag", style: "margin-top:10px", text: "Clear bought items", onclick: clearBought }));

  $("rsBody").replaceChildren(toBuy, done);
}

function row(i) {
  const chk = C.el("button", { class: "chk" + (i.bought ? " done" : ""), "aria-label": "Mark bought", text: "✓", onclick: () => toggle(i) });
  const parts = [i.category, qtyText(i.quantity), i.brand];
  parts.push(i.bought ? "Bought by " + (i.boughtBy ? C.nameByUid(i.boughtBy) : "?") : "Added by " + (i.addedBy ? C.nameByUid(i.addedBy) : "?"));
  const body = C.el("div", { class: "t", onclick: () => sheet(i) }, C.el("b", { text: i.name }), C.el("span", { class: "sub", text: parts.filter(Boolean).join(DOT) }));
  const r = C.el("div", { class: "row" }, chk, body);
  if (i.bought && C.pantryAdd && ["Kitchen", "Groceries"].includes(i.category)) r.append(C.el("button", { class: "tag", text: "→ Pantry", onclick: () => C.pantryAdd(i) }));
  const link = safeUrl(i.link);
  if (link) r.append(C.el("a", { class: "tag", href: link, target: "_blank", rel: "noopener noreferrer", text: hostOf(link) }));
  return r;
}

/* ---------- Actions ---------- */
async function toggle(i) {
  try {
    if (!i.bought) await updateDoc(doc(C.db, "restock", i.id), { bought: true, boughtBy: C.uid, boughtAt: serverTimestamp(), updatedAt: serverTimestamp() });
    else await updateDoc(doc(C.db, "restock", i.id), { bought: false, boughtBy: deleteField(), boughtAt: deleteField(), updatedAt: serverTimestamp() });
  } catch (e) { C.toast("Could not update. Try again."); }
}

async function quickAdd(q) {
  try {
    const r = await addRestockItem({ name: q.name, category: q.category });
    C.toast(r === "duplicate" ? q.name + " is already on the list" : q.name + " added ✓");
  } catch (e) { C.toast("Could not add. Try again."); }
}

async function clearBought() {
  const list = items.filter((i) => i.bought);
  if (!list.length) return;
  if (!window.confirm("Remove all " + list.length + " bought items for both of you? This cannot be undone.")) return;
  try {
    for (let k = 0; k < list.length; k += 400) {
      const b = writeBatch(C.db);
      list.slice(k, k + 400).forEach((i) => b.delete(doc(C.db, "restock", i.id)));
      await b.commit();
    }
    C.toast("Cleared ✓");
  } catch (e) { C.toast("Could not clear. Try again."); }
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map((o) => C.el("option", { value: o, text: o })));
  s.value = value;
  return s;
}

export function sheet(i) {
  if (!C) return;
  const isNew = !i;
  const name = C.el("input", { type: "text", maxlength: "80", placeholder: "e.g. Chicken breast" });
  const cat = select(CATS, isNew ? (filter !== "All" ? filter : "Groceries") : i.category);
  const qty = C.el("input", { type: "text", maxlength: "30", placeholder: "e.g. 2 or 1 tray" });
  const brand = C.el("input", { type: "text", maxlength: "60", placeholder: "Optional" });
  const link = C.el("input", { type: "url", maxlength: "300", placeholder: "Optional, e.g. shopee.com.my/..." });
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  qty.value = "1";
  if (!isNew) { name.value = i.name; qty.value = i.quantity || ""; brand.value = i.brand || ""; link.value = i.link || ""; note.value = i.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    if (!nm) { C.toast("Please type the item name"); return; }
    const url = safeUrl(link.value);
    if (url === null) { C.toast("That link doesn't look right"); return; }
    const data = { name: nm, category: cat.value, quantity: qty.value.trim(), brand: brand.value.trim(), link: url, note: note.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "restock"), { ...data, bought: false, addedBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("restock", C.nameByUid(C.uid) + " added to Restock", nm); });
      else await updateDoc(doc(C.db, "restock", i.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Remove item", onclick: async () => {
    try { await deleteDoc(doc(C.db, "restock", i.id)); closeSheet(); C.toast("Item removed"); }
    catch (e) { C.toast("Could not remove. Try again."); }
  } });

  const info = isNew ? null : C.el("div", { class: "sub", style: "margin-top:12px", text: "Added by " + (i.addedBy ? C.nameByUid(i.addedBy) : "?") +
    (ms(i.createdAt) ? DOT + new Date(ms(i.createdAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "") });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add item" : "Edit item" }),
    ...field("Item name", name), ...field("Category", cat), ...field("Quantity", qty), ...field("Preferred brand", brand),
    ...field("Shop link", link), ...field("Note", note), info,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function suggestionSheet() {
  const mine = customQuick();
  const name = C.el("input", { type: "text", maxlength: "40", placeholder: "e.g. Tofu" });
  const cat = select(CATS, "Groceries");
  const write = async (arr) => {
    try { await setDoc(doc(C.db, "shared", "settings"), { quickAdds: arr }, { merge: true }); return true; }
    catch (e) { C.toast("Could not save. Try again."); return false; }
  };
  const add = C.el("button", { class: "btn", text: "Add suggestion", onclick: async () => {
    const n = name.value.trim();
    if (!n) { C.toast("Please type a name"); return; }
    if (mine.length >= 30) { C.toast("You can save up to 30 suggestions"); return; }
    if (await write([...mine, { name: n, category: cat.value }])) { closeSheet(); C.toast("Suggestion added ✓"); }
  } });
  const rows = mine.map((q, idx) => C.el("div", { class: "row" },
    C.el("div", { class: "t" }, C.el("b", { text: q.name }), C.el("span", { class: "sub", text: q.category })),
    C.el("button", { class: "tag", text: "Remove", onclick: async () => { if (await write(mine.filter((_, k) => k !== idx))) { closeSheet(); C.toast("Removed"); } } })));
  setSheet(C.el("h2", { style: "font-size:24px", text: "My quick-add suggestions" }),
    C.el("div", { class: "sub", text: "These appear as + buttons at the top of Restock." }),
    ...(rows.length ? rows : [C.el("div", { class: "empty", text: "None yet." })]),
    ...field("New suggestion", name), ...field("Category", cat),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet }), add));
  $("sbg").classList.add("on");
}

export const getRestock = () => items;
