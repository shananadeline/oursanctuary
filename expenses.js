// expenses.js - shared household expenses (Step 6)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, setDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = [["Food", "🍜"], ["Household", "🏠"], ["Groceries", "🛒"], ["Bills", "🧾"], ["Transport", "🚗"], ["Pets", "🐾"],
  ["Pet food", "🥣"], ["Veterinary", "🩺"], ["Pet insurance", "🛡️"], ["Shopping", "🛍️"], ["Travel", "✈️"], ["Other", "✨"]];
const COLORS = ["#5934A5", "#7650C8", "#9875D8", "#D9C8F4", "#549B83", "#D6A34B", "#C86D86", "#8E6AC8", "#B79CEB", "#3F2478", "#6FB3A0", "#E3C27F"];
const iconOf = (c) => (CATS.find((x) => x[0] === c) || CATS[11])[1];
const colorOf = (c) => COLORS[Math.max(0, CATS.findIndex((x) => x[0] === c)) % COLORS.length];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => "RM " + Math.round(n).toLocaleString("en-MY");

let C = null;
let expenses = [];
let bills = [];
let month = "";
let view = "overview";
let catFilter = "All";
let query = "";

const curMonth = () => C.dates.todayIso().slice(0, 7);
function shiftMonth(ym, d) {
  const [y, m] = ym.split("-").map(Number);
  const x = new Date(y, m - 1 + d, 1);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0");
}
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
const monthShort = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" }); };

/* ---------- Start ---------- */
export function startExpenses(ctx) {
  C = ctx;
  expenses = []; bills = [];
  month = curMonth(); view = "overview"; catFilter = "All"; query = "";
  const a = onSnapshot(collection(C.db, "expenses"), (s) => { expenses = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshExpenses(); });
  const b = onSnapshot(collection(C.db, "bills"), (s) => { bills = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshExpenses(); });
  return () => { a(); b(); C = null; };
}
export function onExpensesOpen() {
  if (!C) return;
  month = curMonth(); view = "overview"; catFilter = "All"; query = ""; $("expSearch").value = "";
  refreshExpenses();
}

// Expenses you typed in, plus bills you ticked as paid (counted once, never copied).
function allItems() {
  const items = expenses.map((e) => ({ kind: "exp", id: e.id, date: e.date || "", amount: Number(e.amount) || 0, title: e.description,
    category: e.category, paidBy: e.paidBy, note: e.note || "", raw: e }));
  bills.filter((b) => b.paid && b.paidDate).forEach((b) => items.push({ kind: "bill", id: b.id, date: b.paidDate, amount: Number(b.amount) || 0,
    title: b.name, category: "Bills", paidBy: b.paidBy, note: b.note || "", raw: b }));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}
const sum = (list) => list.reduce((s, i) => s + i.amount, 0);

/* ---------- Screen ---------- */
export function refreshExpenses() {
  if (!C || !$("expenses").classList.contains("on")) return;
  $("expTabs").replaceChildren(
    ...[["overview", "Overview"], ["history", "History"]].map(([k, l]) =>
      C.el("button", { class: "pill" + (view === k ? " on" : ""), text: l, onclick: () => { view = k; refreshExpenses(); } })));
  $("expSearch").classList.toggle("hide", view !== "history");
  $("expBody").replaceChildren(...(view === "overview" ? overview() : history()));
}

function monthNav() {
  return C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Previous month", onclick: () => { month = shiftMonth(month, -1); refreshExpenses(); } }),
    C.el("b", { text: monthLabel(month) }),
    C.el("button", { class: "round", text: "›", "aria-label": "Next month", onclick: () => { month = shiftMonth(month, 1); refreshExpenses(); } }));
}

function overview() {
  const items = allItems();
  const list = items.filter((i) => i.date.startsWith(month));
  const total = sum(list);
  const budget = Number((C.getSettings() || {}).monthlyBudget) || 0;

  // Summary and budget
  const summary = C.el("div", { class: "card" },
    C.el("div", { class: "sub", text: "Spent in " + monthLabel(month) }),
    C.el("div", { class: "serif", style: "font-size:30px", text: rm(total) }));
  if (budget) {
    const pct = Math.min(100, Math.round((total / budget) * 100));
    const over = total > budget;
    summary.append(C.el("div", { class: "bar" }, C.el("i", { style: "width:" + pct + "%" + (over ? ";background:var(--err)" : "") })),
      C.el("div", { class: "sub", text: over ? rm(total - budget) + " over your " + rm0(budget) + " budget" : rm(budget - total) + " left of " + rm0(budget) }));
  }
  summary.append(C.el("button", { class: "tag", style: "margin-top:10px", text: budget ? "Change budget" : "Set a monthly budget", onclick: budgetSheet }));

  // Donut by category
  const byCat = {};
  list.forEach((i) => { byCat[i.category] = (byCat[i.category] || 0) + i.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  let acc = 0;
  const stops = cats.map(([c, v]) => { const from = acc; acc += (v / total) * 100; return colorOf(c) + " " + from.toFixed(2) + "% " + acc.toFixed(2) + "%"; });
  const donut = C.el("div", { class: "donut", style: "background:" + (stops.length ? "conic-gradient(" + stops.join(",") + ")" : "var(--pale)") },
    C.el("i", { text: rm0(total) }));
  const legend = C.el("div", { style: "flex:1;min-width:0" });
  cats.slice(0, 6).forEach(([c, v]) => legend.append(C.el("div", { class: "sub", style: "display:flex;justify-content:space-between;gap:8px;padding:2px 0" },
    C.el("span", { text: iconOf(c) + " " + c }), C.el("b", { text: rm0(v) }))));
  if (!cats.length) legend.append(C.el("div", { class: "empty", text: "No spending recorded this month." }));
  const byCatCard = C.el("div", { class: "card" }, C.el("b", { text: "By category" }),
    C.el("div", { class: "pcard", style: "margin-top:10px" }, donut, legend));

  // By person
  const byPerson = {};
  list.forEach((i) => { const n = i.paidBy ? C.nameByUid(i.paidBy) : "Unknown"; byPerson[n] = (byPerson[n] || 0) + i.amount; });
  const personCard = C.el("div", { class: "card" }, C.el("b", { text: "By person" }));
  Object.entries(byPerson).forEach(([n, v]) => personCard.append(
    C.el("div", { style: "margin-top:8px" }, C.el("div", { style: "display:flex;justify-content:space-between" }, C.el("span", { text: n }), C.el("b", { text: rm(v) })),
      C.el("div", { class: "bar" }, C.el("i", { style: "width:" + (total ? Math.round((v / total) * 100) : 0) + "%" })))));
  if (!list.length) personCard.append(C.el("div", { class: "empty", text: "Nothing yet." }));

  // Last 6 months
  const months = [];
  for (let k = 5; k >= 0; k--) months.push(shiftMonth(month, -k));
  const totals = months.map((m) => sum(items.filter((i) => i.date.startsWith(m))));
  const max = Math.max(...totals, 1);
  const bars = C.el("div", { style: "display:flex;gap:8px;align-items:flex-end;height:110px;margin-top:10px" },
    months.map((m, idx) => C.el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px" },
      C.el("div", { class: "sub", style: "font-size:11px", text: totals[idx] ? rm0(totals[idx]).replace("RM ", "") : "" }),
      C.el("div", { style: "width:100%;border-radius:10px;background:" + (m === month ? "var(--el)" : "var(--lilac)") + ";height:" + Math.max(4, Math.round((totals[idx] / max) * 70)) + "px" }),
      C.el("div", { class: "sub", style: "font-size:11px", text: monthShort(m) }))));
  const monthsCard = C.el("div", { class: "card" }, C.el("b", { text: "Spending by month" }), bars);

  return [monthNav(), summary, byCatCard, personCard, monthsCard];
}

function history() {
  let list = allItems();
  if (catFilter !== "All") list = list.filter((i) => i.category === catFilter);
  if (query) list = list.filter((i) => (i.title + " " + i.note + " " + i.category).toLowerCase().includes(query));

  const pills = C.el("div", { class: "pills" },
    ["All", ...CATS.map((c) => c[0])].map((c) => C.el("button", { class: "pill" + (catFilter === c ? " on" : ""), text: c,
      onclick: (e) => { catFilter = c; refreshExpenses(); const on = $("expBody").querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); } })));

  const card = C.el("div", { class: "card" }, C.el("b", { text: list.length + (list.length === 1 ? " record" : " records") }));
  if (!list.length) card.append(C.el("div", { class: "empty", text: "No expenses found." }));
  list.slice(0, 100).forEach((i) => card.append(C.el("div", { class: "row", onclick: () => (i.kind === "bill" ? C.go("bills") : sheet(i.raw)) },
    C.el("div", { class: "ic", text: iconOf(i.category) }),
    C.el("div", { class: "t" }, C.el("b", { text: i.title }),
      C.el("span", { class: "sub", text: [i.category, C.dates.shortDate(i.date), i.paidBy ? C.nameByUid(i.paidBy) : "", i.kind === "bill" ? "From Bills" : ""].filter(Boolean).join(DOT) })),
    C.el("b", { text: rm(i.amount) }))));
  if (list.length > 100) card.append(C.el("div", { class: "empty", text: "Showing the latest 100. Export to see everything." }));

  const exp = C.el("button", { class: "btn ghost", style: "width:100%", text: "Export all records (CSV)", onclick: exportCsv });
  return [pills, card, exp];
}

$("expSearch").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); if (C) refreshExpenses(); });

/* ---------- Export ---------- */
function exportCsv() {
  const safe = (v) => {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops spreadsheet formulas from running
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = [["Date", "Description", "Category", "Paid by", "Amount (RM)", "Note", "Source"]];
  allItems().forEach((i) => rows.push([i.date, i.title, i.category, i.paidBy ? C.nameByUid(i.paidBy) : "", i.amount.toFixed(2), i.note, i.kind === "bill" ? "Bills" : "Expenses"]));
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "our-sanctuary-expenses-" + C.dates.todayIso() + ".csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  C.toast("Exported ✓");
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

function budgetSheet() {
  const cur = Number((C.getSettings() || {}).monthlyBudget) || "";
  const amt = C.el("input", { type: "number", min: "0", step: "1", inputmode: "decimal", placeholder: "e.g. 3000" });
  amt.value = cur;
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const v = parseFloat(amt.value);
    if (!(v > 0)) { C.toast("Please enter an amount"); return; }
    try { await setDoc(doc(C.db, "shared", "settings"), { monthlyBudget: v }, { merge: true }); closeSheet(); C.toast("Budget saved ✓"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } });
  const remove = cur ? C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Remove budget", onclick: async () => {
    try { await setDoc(doc(C.db, "shared", "settings"), { monthlyBudget: deleteField() }, { merge: true }); closeSheet(); C.toast("Budget removed"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } }) : null;
  setSheet(C.el("h2", { style: "font-size:24px", text: "Monthly budget" }),
    C.el("div", { class: "sub", text: "Total household spending you'd like to stay under each month." }),
    ...field("Amount in RM", amt),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

export function sheet(e, preset) {
  if (!C) return;
  const isNew = !e;
  const p = C.partnerInfo();
  const who = [[C.uid, C.nameByUid(C.uid)]];
  if (p.uid) who.push([p.uid, p.name]);

  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "0.00" });
  const desc = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Dinner at mamak" });
  const cat = select(CATS.map((c) => [c[0], c[1] + " " + c[0]]), isNew ? ((preset && preset.category) || "Food") : e.category);
  const date = C.el("input", { type: "date" });
  const by = select(who, isNew ? C.uid : e.paidBy);
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  if (isNew) date.value = C.dates.todayIso();
  else { amt.value = e.amount; desc.value = e.description; date.value = e.date; note.value = e.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const amount = parseFloat(amt.value);
    if (!(amount > 0)) { C.toast("Please enter the amount"); return; }
    if (!desc.value.trim()) { C.toast("Please add a description"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { amount: Math.round(amount * 100) / 100, description: desc.value.trim(), category: cat.value, date: date.value,
      paidBy: by.value, note: note.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "expenses"), { ...data, petId: null, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "expenses", e.id), data);
      closeSheet();
      C.toast("Saved ✓");
    } catch (err) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete expense", onclick: async () => {
    if (!window.confirm("Delete this expense for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(C.db, "expenses", e.id)); closeSheet(); C.toast("Expense deleted"); }
    catch (err) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add expense" : "Edit expense" }),
    ...field("Amount in RM", amt), ...field("Description", desc), ...field("Category", cat), ...field("Date", date), ...field("Paid by", by), ...field("Note", note),
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Bills you tick as paid in Bills already count here. Don't add them again." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}
