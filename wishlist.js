// wishlist.js - things we want to do, buy or experience (Step 13)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = [["Travel", "✈️"], ["Food", "🍜"], ["Shopping", "🛍️"], ["Experiences", "🎟️"], ["Home", "🏠"], ["Plans", "🗺️"], ["Other", "✨"]];
const PRI = [["none", "None"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]];
const PRI_RANK = { high: 0, medium: 1, low: 2, none: 3 };
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let C = null;
let wishes = [];
let goals = [];
let filter = "All";

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
function safeUrl(s) {
  s = (s || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:" ? u.href : null; } catch (e) { return null; }
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "Link"; } };

/* ---------- Start ---------- */
export function startWishlist(ctx) {
  C = ctx;
  wishes = []; goals = []; filter = "All";
  const a = onSnapshot(collection(C.db, "wishes"), (s) => { wishes = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshWishlist(); });
  const b = onSnapshot(collection(C.db, "goals"), (s) => { goals = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshWishlist(); });
  return () => { a(); b(); C = null; };
}
export function onWishlistOpen() { if (C) { filter = "All"; refreshWishlist(); } }

/* ---------- Screen ---------- */
export function refreshWishlist() {
  if (!C || !$("wishlist").classList.contains("on")) return;
  $("wsCats").replaceChildren(...["All", "Favourites", ...CATS.map((c) => c[0])].map((c) =>
    C.el("button", { class: "pill" + (filter === c ? " on" : ""), text: c === "Favourites" ? "★ Favourites" : c, onclick: () => {
      filter = c; refreshWishlist(); const on = $("wsCats").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  let list = wishes.slice();
  if (filter === "Favourites") list = list.filter((w) => w.favourite);
  else if (filter !== "All") list = list.filter((w) => w.category === filter);
  const open = list.filter((w) => !w.done).sort((a, b) => (PRI_RANK[a.priority || "none"] - PRI_RANK[b.priority || "none"]) || ms(a.createdAt) - ms(b.createdAt));
  const done = list.filter((w) => w.done).sort((a, b) => ms(b.doneAt) - ms(a.doneAt));

  const out = [];
  CATS.forEach(([cat, icon]) => {
    const items = open.filter((w) => w.category === cat);
    if (!items.length) return;
    const card = C.el("div", { class: "card" }, C.el("b", { text: icon + " " + cat + " " + items.length }));
    items.forEach((w) => card.append(row(w)));
    out.push(card);
  });
  if (!open.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: wishes.length ? "Nothing here." : "No wishes yet. Tap + New wish to add the first one." })));
  if (done.length) {
    const card = C.el("div", { class: "card" }, C.el("b", { text: "Done together " + done.length }));
    done.forEach((w) => card.append(row(w)));
    out.push(card);
  }
  $("wsBody").replaceChildren(...out);
}

function row(w) {
  const goal = w.goalId && goals.find((g) => g.id === w.goalId);
  const parts = [w.estCost != null ? "~" + rm(w.estCost) : "", w.priority && w.priority !== "none" ? w.priority[0].toUpperCase() + w.priority.slice(1) + " priority" : "", w.addedBy ? "Added by " + C.nameByUid(w.addedBy) : ""].filter(Boolean);
  const r = C.el("div", { class: "row" },
    C.el("button", { class: "chk" + (w.done ? " done" : ""), "aria-label": "Mark done", text: "✓", onclick: () => toggleDone(w) }),
    C.el("div", { class: "t", onclick: () => sheet(w) }, C.el("b", { text: w.title }),
      C.el("span", { class: "sub", text: [w.note ? w.note.slice(0, 40) + (w.note.length > 40 ? "…" : "") : "", ...parts].filter(Boolean).join(DOT) })));
  if (goal) r.append(C.el("span", { class: "tag o", text: "💜 " + goal.name.slice(0, 14) }));
  const link = safeUrl(w.link);
  if (link) r.append(C.el("a", { class: "tag", href: link, target: "_blank", rel: "noopener noreferrer", text: hostOf(link) }));
  r.append(C.el("button", { class: "round", style: "background:none", "aria-label": "Favourite", text: w.favourite ? "★" : "☆", onclick: () => toggleFav(w) }));
  return r;
}

async function toggleDone(w) {
  try {
    if (!w.done) await updateDoc(doc(C.db, "wishes", w.id), { done: true, doneBy: C.uid, doneAt: serverTimestamp(), updatedAt: serverTimestamp() });
    else await updateDoc(doc(C.db, "wishes", w.id), { done: false, doneBy: deleteField(), doneAt: deleteField(), updatedAt: serverTimestamp() });
  } catch (e) { C.toast("Could not update. Try again."); }
}
async function toggleFav(w) {
  try { await updateDoc(doc(C.db, "wishes", w.id), { favourite: !w.favourite }); } catch (e) { C.toast("Could not update. Try again."); }
}

/* ---------- Add / edit ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

export function sheet(w) {
  if (!C) return;
  const isNew = !w;
  const title = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Trip to Langkawi" });
  const cat = select(CATS.map((c) => [c[0], c[1] + " " + c[0]]), isNew ? (CATS.some((c) => c[0] === filter) ? filter : "Plans") : w.category);
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  const link = C.el("input", { type: "url", maxlength: "300", placeholder: "Optional link" });
  const cost = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Optional, in RM" });
  const pri = select(PRI, isNew ? "none" : w.priority || "none");
  const activeGoals = goals.filter((g) => !g.completed);
  const goal = select([["", "Not linked"], ...activeGoals.map((g) => [g.id, g.name])], isNew ? "" : (activeGoals.some((g) => g.id === w.goalId) ? w.goalId : ""));
  const fav = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0" });
  if (!isNew) { title.value = w.title; note.value = w.note || ""; link.value = w.link || ""; cost.value = w.estCost == null ? "" : w.estCost; fav.checked = !!w.favourite; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const t = title.value.trim();
    if (!t) { C.toast("Please type a title"); return; }
    const url = safeUrl(link.value);
    if (url === null) { C.toast("That link doesn't look right"); return; }
    const data = { title: t, category: cat.value, note: note.value.trim(), link: url, estCost: cost.value === "" ? null : Math.max(0, parseFloat(cost.value) || 0),
      priority: pri.value, favourite: fav.checked, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (goal.value) data.goalId = goal.value;
      if (isNew) await addDoc(collection(C.db, "wishes"), { ...data, done: false, addedBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("wishsave", C.nameByUid(C.uid) + " added a wish", t); });
      else { if (!goal.value) data.goalId = deleteField(); await updateDoc(doc(C.db, "wishes", w.id), data); }
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete wish", onclick: async () => {
    if (!window.confirm("Delete this wish for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(C.db, "wishes", w.id)); closeSheet(); C.toast("Wish deleted"); }
    catch (e) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "New wish" : "Edit wish" }),
    ...field("Title", title), ...field("Category", cat), ...field("Note", note), ...field("Link", link), ...field("Estimated cost (RM)", cost),
    ...field("Priority", pri), ...field("Saving for it in goal", goal),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px" }, fav, C.el("span", { text: "Favourite" })),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

export const getWishes = () => wishes;
