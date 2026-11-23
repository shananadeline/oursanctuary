// savings.js - savings goals and contributions (Step 14)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, writeBatch, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => "RM " + Math.round(n).toLocaleString("en-MY");

let C = null;
let goals = [];
let contribs = [];
let wishes = [];

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
const saved = (g) => contribs.filter((c) => c.goalId === g.id).reduce((s, c) => s + (Number(c.amount) || 0), 0);
const ownerLabel = (g) => (g.owner === "shared" || !g.owner ? "Shared" : C.nameByUid(g.owner) + "'s");
const linkedWish = (g) => wishes.find((w) => w.goalId === g.id);

/* ---------- Start ---------- */
export function startSavings(ctx) {
  C = ctx;
  goals = []; contribs = []; wishes = [];
  const subs = [
    onSnapshot(collection(C.db, "goals"), (s) => { goals = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshSavings(); }),
    onSnapshot(collection(C.db, "contributions"), (s) => { contribs = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshSavings(); }),
    onSnapshot(collection(C.db, "wishes"), (s) => { wishes = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshSavings(); })
  ];
  return () => { subs.forEach((u) => u()); C = null; };
}
export function onSavingsOpen() { if (C) refreshSavings(); }

/* ---------- Screen ---------- */
function monthsLeft(iso) {
  const now = C.dates.parseIso(C.dates.todayIso()), t = C.dates.parseIso(iso);
  return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()) + (t.getDate() >= now.getDate() ? 0 : -1);
}

function goalCard(g) {
  const s = saved(g);
  const target = Number(g.target) || 0;
  const pct = target ? Math.min(100, Math.round((s / target) * 100)) : 0;
  const reached = target > 0 && s >= target;
  const w = linkedWish(g);
  const lines = [];
  if (g.targetDate && !g.completed) {
    const d = C.dates.daysBetween(C.dates.todayIso(), g.targetDate);
    let t = "Target " + C.dates.prettyDate(g.targetDate);
    if (d < 0) t += DOT + "date passed";
    else if (!reached) { const m = Math.max(1, monthsLeft(g.targetDate)); t += DOT + "about " + rm0((target - s) / m) + " a month"; }
    lines.push(t);
  }
  const card = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;gap:8px;align-items:center" },
      C.el("b", { style: "font-size:17px", text: g.name }), C.el("span", { class: "tag", text: ownerLabel(g) })),
    C.el("div", { class: "bar", style: "height:12px" }, C.el("i", { style: "width:" + pct + "%" + (g.completed || reached ? ";background:var(--ok)" : "") })),
    C.el("div", { style: "display:flex;justify-content:space-between" }, C.el("b", { text: rm(s) }), C.el("span", { class: "sub", text: "of " + rm(target) + DOT + pct + "%" })),
    ...lines.map((t) => C.el("div", { class: "sub", text: t })),
    w ? C.el("div", { class: "sub", text: "💜 For wish: " + w.title }) : null);
  const actions = C.el("div", { style: "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap" });
  if (!g.completed) actions.append(C.el("button", { class: "btn", style: "padding:9px 16px;font-size:14px", text: "+ Add money", onclick: () => contributeSheet(g) }));
  actions.append(C.el("button", { class: "tag", text: "Details", onclick: () => detail(g.id) }));
  if (reached && !g.completed) actions.append(C.el("span", { class: "tag o", text: "Goal reached 🎉" }));
  card.append(actions);
  return card;
}

export function refreshSavings() {
  if (!C || !$("savings").classList.contains("on")) return;
  const active = goals.filter((g) => !g.completed).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const done = goals.filter((g) => g.completed).sort((a, b) => ms(b.completedAt) - ms(a.completedAt));
  const total = active.reduce((s, g) => s + saved(g), 0);
  const out = [C.el("div", { class: "card hero" },
    C.el("div", { style: "opacity:.9;font-size:13px", text: "Saved across active goals" }),
    C.el("div", { class: "serif", style: "font-size:34px;position:relative", text: rm(total) }))];
  if (!active.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: "No goals yet. Tap + New goal to start saving together." })));
  active.forEach((g) => out.push(goalCard(g)));
  if (done.length) {
    out.push(C.el("div", { class: "sub", style: "margin:12px 4px 6px", text: "Completed goals" }));
    done.forEach((g) => out.push(goalCard(g)));
  }
  $("svBody").replaceChildren(...out);
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}
const people = () => {
  const p = C.partnerInfo();
  const list = [[C.uid, C.nameByUid(C.uid)]];
  if (p.uid) list.push([p.uid, p.name]);
  return list;
};

function contributeSheet(g) {
  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "0.00" });
  const who = select(people(), C.uid);
  const date = C.el("input", { type: "date" });
  const note = C.el("input", { type: "text", maxlength: "100", placeholder: "Optional" });
  date.value = C.dates.todayIso();
  const save = C.el("button", { class: "btn", text: "Add", onclick: async () => {
    const a = parseFloat(amt.value);
    if (!(a > 0)) { C.toast("Please enter an amount"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    save.disabled = true;
    try {
      await addDoc(collection(C.db, "contributions"), { goalId: g.id, amount: Math.round(a * 100) / 100, by: who.value, date: date.value, note: note.value.trim(), createdBy: C.uid, createdAt: serverTimestamp() });
      if (C.notify) C.notify("wishsave", C.nameByUid(C.uid) + " added to " + g.name, "RM " + Math.round(a * 100) / 100);
      closeSheet();
      C.toast("Added to " + g.name + " ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Add to " + g.name }),
    ...field("Amount in RM", amt), ...field("Who saved it", who), ...field("Date", date), ...field("Note", note),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

function detail(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) { closeSheet(); return; }
  const list = contribs.filter((c) => c.goalId === id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || ms(b.createdAt) - ms(a.createdAt));
  const byPerson = {};
  list.forEach((c) => { const n = C.nameByUid(c.by); byPerson[n] = (byPerson[n] || 0) + (Number(c.amount) || 0); });
  const s = saved(g);

  const history = list.map((c) => C.el("div", { class: "row" },
    C.el("div", { class: "t" }, C.el("b", { text: rm(c.amount) }), C.el("span", { class: "sub", text: [C.dates.shortDate(c.date), C.nameByUid(c.by), c.note].filter(Boolean).join(DOT) })),
    C.el("button", { class: "tag e", text: "Remove", onclick: async () => {
      if (!window.confirm("Remove this contribution of " + rm(c.amount) + "?")) return;
      try { await deleteDoc(doc(C.db, "contributions", c.id)); setTimeout(() => detail(id), 250); } catch (e) { C.toast("Could not remove. Try again."); }
    } })));

  setSheet(C.el("h2", { style: "font-size:24px", text: g.name }),
    C.el("div", { class: "sub", text: ownerLabel(g) + " goal" + DOT + rm(s) + " of " + rm(g.target) }),
    g.note ? C.el("div", { style: "margin:8px 0", text: g.note }) : null,
    C.el("b", { style: "display:block;margin-top:12px", text: "Who saved" }),
    ...(Object.keys(byPerson).length ? Object.entries(byPerson).map(([n, v]) => C.el("div", { class: "sub", text: n + ": " + rm(v) })) : [C.el("div", { class: "empty", text: "Nothing saved yet." })]),
    C.el("b", { style: "display:block;margin-top:12px", text: "History" }),
    ...(history.length ? history : [C.el("div", { class: "empty", text: "No contributions yet." })]),
    C.el("button", { class: "btn", style: "width:100%;margin-top:14px", text: g.completed ? "Reopen goal" : "Mark goal completed", onclick: async () => {
      try {
        await updateDoc(doc(C.db, "goals", id), g.completed ? { completed: false, completedAt: deleteField(), updatedAt: serverTimestamp() } : { completed: true, completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        closeSheet(); C.toast(g.completed ? "Goal reopened" : "Goal completed 🎉");
      } catch (e) { C.toast("Could not update. Try again."); }
    } }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet }), C.el("button", { class: "btn", text: "Edit goal", onclick: () => edit(g) })));
  $("sbg").classList.add("on");
}

export function edit(g) {
  if (!C) return;
  const isNew = !g;
  const name = C.el("input", { type: "text", maxlength: "80", placeholder: "e.g. Holiday fund" });
  const target = C.el("input", { type: "number", min: "1", step: "0.01", inputmode: "decimal", placeholder: "0.00" });
  const date = C.el("input", { type: "date" });
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  const owner = select([["shared", "Shared (both of us)"], ...people().map(([id, n]) => [id, n + "'s own goal"])], isNew ? "shared" : g.owner || "shared");
  const open = wishes.filter((w) => !w.done || (g && w.goalId === g.id));
  const current = g ? linkedWish(g) : null;
  const wish = select([["", "Not linked"], ...open.map((w) => [w.id, w.title])], current ? current.id : "");
  if (!isNew) { name.value = g.name; target.value = g.target; date.value = g.targetDate || ""; note.value = g.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim(), t = parseFloat(target.value);
    if (!nm) { C.toast("Please type a goal name"); return; }
    if (!(t > 0)) { C.toast("Please enter the target amount"); return; }
    const data = { name: nm, target: Math.round(t * 100) / 100, targetDate: date.value || "", note: note.value.trim(), owner: owner.value, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      let id = g && g.id;
      if (isNew) { const ref = await addDoc(collection(C.db, "goals"), { ...data, completed: false, createdBy: C.uid, createdAt: serverTimestamp() }); id = ref.id; }
      else await updateDoc(doc(C.db, "goals", id), data);
      // Keep the link to the wishlist in step.
      if ((current ? current.id : "") !== wish.value) {
        if (current) await updateDoc(doc(C.db, "wishes", current.id), { goalId: deleteField() });
        if (wish.value) await updateDoc(doc(C.db, "wishes", wish.value), { goalId: id });
      }
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete goal", onclick: async () => {
    if (!window.confirm("Delete this goal and all its saved money records for both of you? This cannot be undone.")) return;
    try {
      const b = writeBatch(C.db);
      contribs.filter((c) => c.goalId === g.id).slice(0, 400).forEach((c) => b.delete(doc(C.db, "contributions", c.id)));
      wishes.filter((w) => w.goalId === g.id).forEach((w) => b.update(doc(C.db, "wishes", w.id), { goalId: deleteField() }));
      b.delete(doc(C.db, "goals", g.id));
      await b.commit();
      closeSheet(); C.toast("Goal deleted");
    } catch (e) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "New savings goal" : "Edit goal" }),
    ...field("Goal name", name), ...field("Target amount in RM", target), ...field("Target date (optional)", date), ...field("Whose goal", owner),
    ...field("Linked wish (optional)", wish), ...field("Note", note),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}
