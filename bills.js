// bills.js - monthly household bills (Step 5)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = [["Rent / Mortgage", "🏠"], ["Utilities", "💡"], ["Internet & phone", "📶"], ["Insurance", "🛡️"],
  ["Subscriptions", "📺"], ["Loans", "🏦"], ["Transport", "🚗"], ["Other", "🧾"]];
const iconOf = (c) => (CATS.find((x) => x[0] === c) || CATS[7])[1];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let C = null;
let bills = [];
let month = "";
let view = "month";

const curMonth = () => C.dates.todayIso().slice(0, 7);
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
// Same day next month, using the bill's original day (so the 31st does not drift to the 28th).
function nextMonthDue(dueDate, dueDay) {
  const [y, m, d0] = dueDate.split("-").map(Number);
  const day = dueDay || d0;
  const last = new Date(y, m + 1, 0).getDate();
  return C.dates.isoOf(new Date(y, m, Math.min(day, last)));
}

/* ---------- Start ---------- */
export function startBills(ctx) {
  C = ctx;
  bills = [];
  month = curMonth();
  view = "month";
  const unsub = onSnapshot(collection(C.db, "bills"), (s) => {
    bills = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshBills();
  });
  return () => { unsub(); C = null; };
}
export function onBillsOpen() { if (!C) return; month = curMonth(); view = "month"; refreshBills(); }

/* ---------- Helpers ---------- */
const person = (b) => (b.assignee === "both" ? "Both of us" : C.nameByUid(b.assignee));
function dueText(b) {
  const diff = C.dates.daysBetween(C.dates.todayIso(), b.dueDate);
  if (b.paid) return "Due " + C.dates.shortDate(b.dueDate);
  if (diff < 0) return Math.abs(diff) + (Math.abs(diff) === 1 ? " day late" : " days late");
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return "Due " + C.dates.shortDate(b.dueDate);
}
const isOverdue = (b) => !b.paid && b.dueDate < C.dates.todayIso();
const dueSoon = (b) => !b.paid && !isOverdue(b) && C.dates.daysBetween(C.dates.todayIso(), b.dueDate) <= 3;

function billRow(b) {
  const chk = C.el("button", { class: "chk" + (b.recurring ? " rec" : "") + (b.paid ? " done" : ""), "aria-label": "Mark paid", text: "✓", onclick: () => togglePaid(b) });
  const parts = [b.category, dueText(b), person(b)];
  const body = C.el("div", { class: "t", onclick: () => openSheet(b) }, C.el("b", { text: b.name }), C.el("span", { class: "sub", text: parts.join(DOT) }));
  const row = C.el("div", { class: "row" }, chk, body);
  if (isOverdue(b)) row.append(C.el("span", { class: "tag e", text: "Overdue" }));
  else if (dueSoon(b)) row.append(C.el("span", { class: "tag w", text: "Soon" }));
  row.append(C.el("b", { text: rm(b.amount) }));
  return row;
}

/* ---------- Screen ---------- */
export function refreshBills() {
  if (!C) return;
  renderHome();
  if (!$("bills").classList.contains("on")) return;

  $("billTabs").replaceChildren(
    ...[["month", "This month"], ["history", "History"]].map(([k, l]) =>
      C.el("button", { class: "pill" + (view === k ? " on" : ""), text: l, onclick: () => { view = k; refreshBills(); } })));
  const body = $("billBody");
  body.replaceChildren(...(view === "month" ? monthView() : historyView()));
}

function monthView() {
  const list = bills.filter((b) => (b.dueDate || "").startsWith(month)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const total = list.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const paidAmt = list.filter((b) => b.paid).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const unpaid = list.filter((b) => !b.paid);
  const paid = list.filter((b) => b.paid);
  const pct = total ? Math.round((paidAmt / total) * 100) : 0;

  const nav = C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Previous month", onclick: () => { month = shiftMonth(month, -1); refreshBills(); } }),
    C.el("b", { text: monthLabel(month) }),
    C.el("button", { class: "round", text: "›", "aria-label": "Next month", onclick: () => { month = shiftMonth(month, 1); refreshBills(); } }));

  const bar = C.el("div", { class: "bar" }, C.el("i", { style: "width:" + pct + "%" }));
  const summary = C.el("div", { class: "card" },
    C.el("div", { class: "sub", text: "Total for the month" }),
    C.el("div", { class: "serif", style: "font-size:30px", text: rm(total) }),
    bar,
    C.el("div", { class: "sub", text: "Paid " + rm(paidAmt) + DOT + "Remaining " + rm(total - paidAmt) + DOT + paid.length + " of " + list.length + " paid" }));

  const out = [nav, summary];
  if (!list.length) { out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: "No bills this month. Tap + New bill to add one." }))); return out; }
  out.push(card("To pay " + unpaid.length, unpaid, "Everything is paid ✓"));
  out.push(card("Paid " + paid.length, paid, "Nothing paid yet."));
  return out;
}
function card(title, list, emptyText) {
  const c = C.el("div", { class: "card" }, C.el("b", { text: title }));
  if (!list.length) c.append(C.el("div", { class: "empty", text: emptyText }));
  list.forEach((b) => c.append(billRow(b)));
  return c;
}

function historyView() {
  const list = bills.filter((b) => b.paid).sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || "")).slice(0, 50);
  const c = C.el("div", { class: "card" }, C.el("b", { text: "Payment history" }));
  if (!list.length) c.append(C.el("div", { class: "empty", text: "Paid bills will appear here." }));
  list.forEach((b) => c.append(C.el("div", { class: "row", onclick: () => openSheet(b) },
    C.el("div", { class: "ic", text: iconOf(b.category) }),
    C.el("div", { class: "t" }, C.el("b", { text: b.name }),
      C.el("span", { class: "sub", text: "Paid " + (b.paidDate ? C.dates.prettyDate(b.paidDate) : "") + DOT + "by " + (b.paidBy ? C.nameByUid(b.paidBy) : "?") })),
    C.el("b", { text: rm(b.amount) }))));
  return [c];
}

function renderHome() {
  const box = $("homeBills");
  if (!box) return;
  const limitIso = C.dates.isoOf(new Date(Date.now() + 14 * 864e5));
  const list = bills.filter((b) => !b.paid && b.dueDate && b.dueDate <= limitIso).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  box.replaceChildren();
  if (!list.length) box.append(C.el("div", { class: "empty", text: "No bills due in the next two weeks ✓" }));
  list.slice(0, 3).forEach((b) => box.append(C.el("div", { class: "row", onclick: () => C.go("bills") },
    C.el("div", { class: "ic", text: iconOf(b.category) }),
    C.el("div", { class: "t" }, C.el("b", { text: b.name }), C.el("span", { class: "sub", text: dueText(b) })),
    C.el("b", { text: rm(b.amount) }))));
  if (list.length > 3) box.append(C.el("div", { class: "empty", text: "+" + (list.length - 3) + " more in Bills" }));
}

/* ---------- Mark paid / unpaid ---------- */
async function togglePaid(b) {
  const ref = doc(C.db, "bills", b.id);
  try {
    await runTransaction(C.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      let nextSnap = null;
      if (d.paid && d.nextId) nextSnap = await tx.get(doc(C.db, "bills", d.nextId));

      if (!d.paid) {
        const update = { paid: true, paidDate: C.dates.todayIso(), paidBy: C.uid, updatedAt: serverTimestamp() };
        if (d.recurring && !d.nextId) {
          const nref = doc(collection(C.db, "bills"));
          tx.set(nref, {
            name: d.name, amount: d.amount, dueDate: nextMonthDue(d.dueDate, d.dueDay), dueDay: d.dueDay || null,
            category: d.category, note: d.note || "", assignee: d.assignee, recurring: true, paid: false,
            createdBy: d.createdBy || C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          });
          update.nextId = nref.id;
        }
        tx.update(ref, update);
      } else {
        tx.update(ref, { paid: false, paidDate: deleteField(), paidBy: deleteField(), nextId: deleteField(), updatedAt: serverTimestamp() });
        if (nextSnap && nextSnap.exists() && !nextSnap.data().paid) tx.delete(nextSnap.ref);
      }
    });
  } catch (e) { C.toast("Could not update. Try again."); }
}

/* ---------- Add / edit sheet ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

export function openSheet(b) {
  if (!C) return;
  const isNew = !b;
  const p = C.partnerInfo();
  const who = [[C.uid, C.nameByUid(C.uid)]];
  if (p.uid) who.push([p.uid, p.name]);
  who.push(["both", "Both of us"]);

  const name = C.el("input", { type: "text", maxlength: "80", placeholder: "e.g. TNB electricity" });
  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "0.00" });
  const due = C.el("input", { type: "date" });
  const cat = select(CATS.map((c) => [c[0], c[1] + " " + c[0]]), isNew ? "Utilities" : b.category);
  const asg = select(who, isNew ? "both" : b.assignee);
  const rec = C.el("input", { type: "checkbox", style: "width:22px;height:22px;margin:0" });
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  const paidOn = C.el("input", { type: "date" });
  if (!isNew) {
    name.value = b.name; amt.value = b.amount; due.value = b.dueDate; rec.checked = !!b.recurring;
    note.value = b.note || ""; paidOn.value = b.paidDate || "";
  } else due.value = C.dates.todayIso();

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    const amount = parseFloat(amt.value);
    if (!nm) { C.toast("Please type a bill name"); return; }
    if (!(amount > 0)) { C.toast("Please enter the amount"); return; }
    if (!due.value) { C.toast("Please choose a due date"); return; }
    const data = { name: nm, amount: Math.round(amount * 100) / 100, dueDate: due.value, dueDay: Number(due.value.slice(8, 10)),
      category: cat.value, assignee: asg.value, recurring: rec.checked, note: note.value.trim(), updatedAt: serverTimestamp() };
    if (!isNew && b.paid && paidOn.value) data.paidDate = paidOn.value;
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "bills"), { ...data, paid: false, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("tasks", C.nameByUid(C.uid) + " added a bill", nm + " · RM " + data.amount); });
      else await updateDoc(doc(C.db, "bills", b.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete bill", onclick: async () => {
    if (!window.confirm("Delete this bill for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(C.db, "bills", b.id)); closeSheet(); C.toast("Bill deleted"); }
    catch (e) { C.toast("Could not delete. Try again."); }
  } });

  const recRow = C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px" }, rec, C.el("span", { text: "Repeats every month" }));
  setSheet(
    C.el("h2", { style: "font-size:24px", text: isNew ? "New bill" : "Edit bill" }),
    ...field("Bill name", name), ...field("Amount in RM", amt), ...field("Due date", due),
    ...field("Category", cat), ...field("Who pays", asg), recRow,
    ...(!isNew && b.paid ? field("Payment date", paidOn) : []),
    ...field("Note", note),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save),
    remove
  );
  $("sbg").classList.add("on");
}
