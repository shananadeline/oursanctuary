// notes.js - shared notes and checklists (Step 15)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = ["General", "Shopping", "Household", "Important", "Personal"];

let C = null;
let notes = [];
let filter = "All";
let query = "";

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
const dateText = (ts) => (ms(ts) ? new Date(ms(ts)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/* ---------- Start ---------- */
export function startNotes(ctx) {
  C = ctx;
  notes = []; filter = "All"; query = "";
  const unsub = onSnapshot(collection(C.db, "notes"), (s) => { notes = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshNotes(); });
  return () => { unsub(); C = null; };
}
export function onNotesOpen() { if (C) { filter = "All"; query = ""; $("ntSearch").value = ""; refreshNotes(); } }

/* ---------- Screen ---------- */
export function refreshNotes() {
  if (!C || !$("notes").classList.contains("on")) return;
  $("ntCats").replaceChildren(...["All", "📌 Pinned", ...CATS, "Archived"].map((c) =>
    C.el("button", { class: "pill" + (filter === c ? " on" : ""), text: c, onclick: () => {
      filter = c; refreshNotes(); const on = $("ntCats").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  let list = notes.filter((n) => (filter === "Archived" ? n.archived : !n.archived));
  if (filter === "📌 Pinned") list = list.filter((n) => n.pinned);
  else if (CATS.includes(filter)) list = list.filter((n) => n.category === filter);
  if (query) list = list.filter((n) => ((n.title || "") + " " + (n.body || "") + " " + (n.items || []).map((i) => i.text).join(" ")).toLowerCase().includes(query));
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.updatedAt) - ms(a.updatedAt));

  const out = list.map(card);
  if (!out.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: notes.length ? "Nothing here." : "No notes yet. Tap + New note." })));
  $("ntBody").replaceChildren(...out);
}
$("ntSearch").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); if (C) refreshNotes(); });

function card(n) {
  const head = C.el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px" },
    C.el("b", { style: "font-size:17px;flex:1;min-width:0", onclick: () => sheet(n), text: n.title || "Untitled" }),
    C.el("button", { class: "round", style: "background:none;width:34px;height:34px", "aria-label": "Pin", text: n.pinned ? "📌" : "📍", onclick: () => togglePin(n) }));
  const c = C.el("div", { class: "card" }, head);

  if (n.type === "checklist") {
    const items = n.items || [];
    const done = items.filter((i) => i.done).length;
    c.append(C.el("div", { class: "sub", text: done + "/" + items.length + " done" }));
    items.slice(0, 6).forEach((it, k) => c.append(C.el("div", { class: "row", style: "padding:8px 0" },
      C.el("button", { class: "chk" + (it.done ? " done" : ""), style: "width:24px;height:24px;font-size:13px", "aria-label": "Tick", text: "✓", onclick: () => toggleItem(n, k) }),
      C.el("div", { class: "t", onclick: () => sheet(n) }, C.el("span", { style: it.done ? "text-decoration:line-through;color:var(--tx2)" : "", text: it.text })))));
    if (items.length > 6) c.append(C.el("div", { class: "empty", text: "+" + (items.length - 6) + " more" }));
  } else if (n.body) {
    c.append(C.el("div", { style: "margin-top:6px;white-space:pre-wrap;overflow:hidden;max-height:4.4em;cursor:pointer", onclick: () => sheet(n), text: n.body }));
  }

  const meta = [n.category, "By " + (n.createdBy ? C.nameByUid(n.createdBy) : "?"), n.updatedBy && n.updatedBy !== n.createdBy ? "Edited by " + C.nameByUid(n.updatedBy) : "", dateText(n.updatedAt)].filter(Boolean).join(DOT);
  c.append(C.el("div", { class: "sub", style: "margin-top:8px", text: meta }));
  if (n.archived) c.append(C.el("div", { style: "display:flex;gap:8px;margin-top:8px" },
    C.el("button", { class: "tag", text: "Restore", onclick: () => setArchived(n, false) }),
    C.el("button", { class: "tag e", text: "Delete", onclick: () => del(n) })));
  return c;
}

async function togglePin(n) {
  try { await updateDoc(doc(C.db, "notes", n.id), { pinned: !n.pinned }); } catch (e) { C.toast("Could not update. Try again."); }
}
async function toggleItem(n, k) {
  const items = (n.items || []).map((it, i) => (i === k ? { ...it, done: !it.done } : it));
  try { await updateDoc(doc(C.db, "notes", n.id), { items }); } catch (e) { C.toast("Could not update. Try again."); }
}
async function setArchived(n, v) {
  try { await updateDoc(doc(C.db, "notes", n.id), { archived: v, updatedAt: serverTimestamp(), updatedBy: C.uid }); closeSheet(); C.toast(v ? "Archived" : "Restored"); }
  catch (e) { C.toast("Could not update. Try again."); }
}
async function del(n) {
  if (!window.confirm("Delete this note for both of you? This cannot be undone.")) return;
  try { await deleteDoc(doc(C.db, "notes", n.id)); closeSheet(); C.toast("Note deleted"); } catch (e) { C.toast("Could not delete. Try again."); }
}

/* ---------- Add / edit ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];

export function sheet(n) {
  if (!C) return;
  const isNew = !n;
  let type = isNew ? "note" : n.type || "note";
  const title = C.el("input", { type: "text", maxlength: "100", placeholder: "Title" });
  const cat = C.el("select", {}, CATS.map((c) => C.el("option", { value: c, text: c })));
  const body = C.el("textarea", { maxlength: "5000", placeholder: "Write your note…", style: "min-height:140px" });
  const rows = C.el("div");
  const addRow = (it) => {
    const t = C.el("input", { type: "text", maxlength: "120", placeholder: "Item" });
    const d = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
    if (it) { t.value = it.text; d.checked = !!it.done; }
    const w = C.el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0" }, d, t,
      C.el("button", { class: "round", text: "✕", "aria-label": "Remove item", onclick: () => w.remove() }));
    w.get = () => ({ text: t.value.trim(), done: d.checked });
    rows.append(w);
  };
  const noteBox = C.el("div", {}, ...field("Note", body));
  const listBox = C.el("div", {}, C.el("label", { text: "Checklist" }), rows,
    C.el("button", { class: "tag", text: "+ Add item", onclick: () => { if (rows.children.length < 60) addRow(); } }));

  cat.value = isNew ? (CATS.includes(filter) ? filter : "General") : n.category || "General";
  if (!isNew) { title.value = n.title || ""; body.value = n.body || ""; (n.items || []).forEach(addRow); }
  if (!rows.children.length) addRow();

  const tabs = C.el("div", { class: "pills", style: "margin:10px 0 0" });
  const draw = () => {
    tabs.replaceChildren(...[["note", "Note"], ["checklist", "Checklist"]].map(([k, l]) =>
      C.el("button", { class: "pill" + (type === k ? " on" : ""), text: l, onclick: () => { type = k; draw(); } })));
    noteBox.classList.toggle("hide", type !== "note");
    listBox.classList.toggle("hide", type !== "checklist");
  };
  draw();

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const items = [...rows.children].map((w) => w.get()).filter((i) => i.text);
    if (!title.value.trim() && !body.value.trim() && !items.length) { C.toast("Please write something first"); return; }
    const data = { title: title.value.trim(), category: cat.value, type, body: type === "note" ? body.value.trim() : (n && n.body) || "",
      items: type === "checklist" ? items : (n && n.items) || [], updatedAt: serverTimestamp(), updatedBy: C.uid };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "notes"), { ...data, pinned: false, archived: false, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("notes", C.nameByUid(C.uid) + " added a note", data.title || "New note"); });
      else await updateDoc(doc(C.db, "notes", n.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const info = isNew ? null : C.el("div", { class: "sub", style: "margin-top:12px", text: "Created by " + (n.createdBy ? C.nameByUid(n.createdBy) : "?") + (dateText(n.createdAt) ? DOT + dateText(n.createdAt) : "") +
    (n.updatedBy ? DOT + "Last edited by " + C.nameByUid(n.updatedBy) : "") });
  const extra = isNew ? null : C.el("div", { style: "display:flex;gap:8px;margin-top:12px" },
    C.el("button", { class: "btn ghost", style: "flex:1", text: n.archived ? "Restore" : "Archive", onclick: () => setArchived(n, !n.archived) }),
    C.el("button", { class: "btn ghost del", style: "flex:1", text: "Delete", onclick: () => del(n) }));

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "New note" : "Edit note" }),
    ...field("Title", title), ...field("Category", cat), tabs, noteBox, listBox, info,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), extra);
  $("sbg").classList.add("on");
}

export const getNotes = () => notes;
