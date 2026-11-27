// expenses.js - shared household expenses (Step 6)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, setDoc, doc, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CATS = [["Food", "🍜"], ["Household", "🏠"], ["Groceries", "🛒"], ["Bills", "🧾"], ["Transport", "🚗"], ["Pets", "🐾"],
  ["Pet food", "🥣"], ["Veterinary", "🩺"], ["Pet insurance", "🛡️"], ["Shopping", "🛍️"], ["Travel", "✈️"], ["Other", "✨"]];
const COLORS = ["#5934A5", "#7650C8", "#9875D8", "#D9C8F4", "#549B83", "#D6A34B", "#C86D86", "#8E6AC8", "#B79CEB", "#3F2478", "#6FB3A0", "#E3C27F"];
const PET_CATS = ["Pets", "Pet food", "Veterinary", "Pet insurance"];
const PET_TYPES = [["Cat food", "Pet food"], ["Treats", "Pet food"], ["Litter", "Pets"], ["Pet supplies", "Pets"], ["Veterinary consultation", "Veterinary"],
  ["Medication", "Veterinary"], ["Vaccinations", "Veterinary"], ["Grooming", "Pets"], ["Pet insurance", "Pet insurance"], ["Other pet expenses", "Pets"]];
const iconOf = (c) => (CATS.find((x) => x[0] === c) || CATS[11])[1];
const colorOf = (c) => COLORS[Math.max(0, CATS.findIndex((x) => x[0] === c)) % COLORS.length];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => "RM " + Math.round(n).toLocaleString("en-MY");

let C = null;
let expenses = [];
let bills = [];
let income = [];
let plans = [];
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
  expenses = []; bills = []; income = []; plans = [];
  month = curMonth(); view = "overview"; catFilter = "All"; query = "";
  const a = onSnapshot(collection(C.db, "expenses"), (s) => { expenses = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshExpenses(); });
  const b = onSnapshot(collection(C.db, "bills"), (s) => { bills = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshExpenses(); });
  const c = onSnapshot(collection(C.db, "income"), (s) => { income = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshExpenses(); ensureRecurring(); });
  const d = onSnapshot(collection(C.db, "incomeplans"), (s) => { plans = s.docs.map((x) => ({ id: x.id, ...x.data() })); refreshExpenses(); ensureRecurring(); });
  return () => { a(); b(); c(); d(); C = null; };
}
export function onExpensesOpen() {
  if (!C) return;
  month = curMonth(); view = "overview"; catFilter = "All"; query = ""; $("expSearch").value = "";
  refreshExpenses();
}

// Expenses you typed in, plus bills you ticked as paid (counted once, never copied).
function allItems() {
  const items = expenses.map((e) => ({ kind: "exp", id: e.id, date: e.date || "", amount: Number(e.amount) || 0, title: e.description,
    category: e.category, paidBy: e.paidBy, note: e.note || "", petId: e.petId || "", raw: e }));
  bills.filter((b) => b.paid && b.paidDate).forEach((b) => items.push({ kind: "bill", id: b.id, date: b.paidDate, amount: Number(b.amount) || 0,
    title: b.name, category: "Bills", paidBy: b.paidBy, note: b.note || "", raw: b }));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}
const sum = (list) => list.reduce((s, i) => s + i.amount, 0);

/* ---------- Screen ---------- */
export function refreshExpenses() {
  if (!C || !$("expenses").classList.contains("on")) return;
  $("expTabs").replaceChildren(
    ...[["overview", "Overview"], ["history", "History"], ["income", "Income"]].map(([k, l]) =>
      C.el("button", { class: "pill" + (view === k ? " on" : ""), text: l, onclick: () => { view = k; refreshExpenses(); } })));
  $("expSearch").classList.toggle("hide", view !== "history");
  $("fab").textContent = view === "income" ? "+ Add income" : "+ Add expense";
  $("expBody").replaceChildren(...(view === "overview" ? overview() : view === "income" ? incomeView() : history()));
}

const petLabel = (id) => { const p = (C.getPets ? C.getPets() : []).find((x) => x.id === id); return p ? "🐾 " + p.name : ""; };

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

  return [monthNav(), summary, incomeSpendCard(total), byCatCard, personCard, monthsCard];
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
      C.el("span", { class: "sub", text: [i.category, i.petId ? petLabel(i.petId) : "", C.dates.shortDate(i.date), i.paidBy ? C.nameByUid(i.paidBy) : "", i.kind === "bill" ? "From Bills" : ""].filter(Boolean).join(DOT) })),
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
  // Pet details only show for pet categories
  const livePets = (C.getPets ? C.getPets() : []).filter((x) => (x.status || "active") !== "archived");
  const petSel = select([["", "Not for one specific pet"], ...livePets.map((x) => [x.id, x.name])], isNew ? (preset && preset.petId) || "" : e.petId || "");
  const typeSel = select([["", "Choose a type (optional)"], ...PET_TYPES.map((t) => [t[0], t[0]])], isNew ? "" : e.petType || "");
  const petBlock = C.el("div", {}, ...field("For which pet", petSel), ...field("Pet expense type", typeSel));
  const syncPet = () => petBlock.classList.toggle("hide", !PET_CATS.includes(cat.value));
  cat.addEventListener("change", syncPet);
  typeSel.addEventListener("change", () => { const t = PET_TYPES.find((x) => x[0] === typeSel.value); if (t) cat.value = t[1]; });
  syncPet();
  if (isNew) date.value = C.dates.todayIso();
  else { amt.value = e.amount; desc.value = e.description; date.value = e.date; note.value = e.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const amount = parseFloat(amt.value);
    if (!(amount > 0)) { C.toast("Please enter the amount"); return; }
    if (!desc.value.trim()) { C.toast("Please add a description"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { amount: Math.round(amount * 100) / 100, description: desc.value.trim(), category: cat.value, date: date.value,
      paidBy: by.value, note: note.value.trim(), petId: PET_CATS.includes(cat.value) ? petSel.value || null : null,
      petType: PET_CATS.includes(cat.value) ? typeSel.value : "", updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "expenses"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("expenses", C.nameByUid(C.uid) + " added an expense", data.description + " · RM " + data.amount); });
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
    ...field("Amount in RM", amt), ...field("Description", desc), ...field("Category", cat), petBlock, ...field("Date", date), ...field("Paid by", by), ...field("Note", note),
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Bills you tick as paid in Bills already count here. Don't add them again." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

// For Home and Search
export const getExpenses = () => expenses;
export function monthTotal() {
  if (!C) return 0;
  const m = curMonth();
  return allItems().filter((i) => i.date.startsWith(m)).reduce((s, i) => s + i.amount, 0);
}

/* ---------- Income ---------- */
const INCOME_CATS = [["Salary", "💼"], ["Bonus", "🎁"], ["Side income", "🧑‍💻"], ["Allowance", "👛"], ["Gift", "💝"], ["Investment", "📈"], ["Refund", "↩️"], ["Other", "✨"]];
const incIcon = (c) => (INCOME_CATS.find((x) => x[0] === c) || INCOME_CATS[7])[1];
const liveIncome = () => income.filter((i) => !i.deleted && i.date);
const incomeIn = (m) => liveIncome().filter((i) => i.date.startsWith(m));
const incSum = (list) => list.reduce((s, i) => s + (Number(i.amount) || 0), 0);
const whoLabel = (id) => (id === "joint" ? "Joint" : id ? C.nameByUid(id) : "");
export const getIncome = () => liveIncome();
export const monthIncome = () => (C ? incSum(incomeIn(curMonth())) : 0);
export function expenseFab() { if (view === "income") incomeSheet(null); else sheet(null); }

// Regular income (like a salary) adds its own record each month. Each record has a fixed name, so it can never be added twice.
const dayIn = (m, day) => { const [y, mo] = m.split("-").map(Number); return Math.min(Math.max(1, Number(day) || 1), new Date(y, mo, 0).getDate()); };
let generating = false;
async function ensureRecurring() {
  if (!C || generating) return;
  generating = true;
  try {
    const today = C.dates.todayIso(), cur = today.slice(0, 7);
    for (const p of plans.filter((x) => x.active !== false)) {
      let m = p.startMonth || cur, n = 0;
      while (m <= cur && n++ < 24) {
        const id = p.id + "_" + m;
        const date = m + "-" + String(dayIn(m, p.day)).padStart(2, "0");
        if (date <= today && !income.some((i) => i.id === id)) {
          await runTransaction(C.db, async (tx) => {
            const ref = doc(C.db, "income", id);
            if (!(await tx.get(ref)).exists()) tx.set(ref, { amount: p.amount, source: p.source, category: p.category, date, receivedBy: p.receivedBy, note: "", planId: p.id, auto: true,
              createdBy: p.createdBy || C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          });
        }
        m = shiftMonth(m, 1);
      }
    }
  } catch (e) { /* it will try again next time */ }
  generating = false;
}

function incomeSpendCard(spent) {
  const inc = incSum(incomeIn(month));
  const card = C.el("div", { class: "card" }, C.el("b", { text: "Income and spending" }));
  if (!inc) {
    card.append(C.el("div", { class: "sub", style: "margin:6px 0", text: "No income recorded for " + monthLabel(month) + "." }),
      C.el("button", { class: "tag", text: "+ Add income", onclick: () => { view = "income"; refreshExpenses(); incomeSheet(null); } }));
    return card;
  }
  const left = inc - spent;
  const cell = (label, value, color) => C.el("div", { style: "flex:1;min-width:0" }, C.el("div", { class: "sub", text: label }), C.el("b", { style: "font-size:16px" + (color ? ";color:" + color : ""), text: value }));
  card.append(C.el("div", { style: "display:flex;gap:10px;margin-top:10px" }, cell("Income", rm0(inc), "var(--ok)"), cell("Spent", rm0(spent)),
    cell(left >= 0 ? "Left over" : "Over by", rm0(Math.abs(left)), left >= 0 ? "" : "var(--err)")),
    C.el("div", { class: "bar" }, C.el("i", { style: "width:" + Math.min(100, Math.round((spent / inc) * 100)) + "%" + (left < 0 ? ";background:var(--err)" : "") })),
    C.el("div", { class: "sub", text: left >= 0 ? "You kept " + Math.round((left / inc) * 100) + "% of this month's income. Savings goal deposits aren't counted as spending." : "Spending is above this month's income." }));
  return card;
}

function incomeView() {
  const list = incomeIn(month).sort((a, b) => b.date.localeCompare(a.date));
  const total = incSum(list);
  const spent = sum(allItems().filter((i) => i.date.startsWith(month)));
  const out = [monthNav(), C.el("div", { class: "card hero" },
    C.el("div", { style: "opacity:.9;font-size:13px;position:relative", text: "Income in " + monthLabel(month) }),
    C.el("div", { class: "serif", style: "font-size:34px;position:relative", text: rm(total) }),
    C.el("div", { style: "opacity:.9;font-size:13px;position:relative", text: "Spent " + rm(spent) + DOT + (total - spent >= 0 ? "Left " + rm(total - spent) : "Over by " + rm(spent - total)) }))];

  const byPerson = {};
  list.forEach((i) => { const n = whoLabel(i.receivedBy) || "Unknown"; byPerson[n] = (byPerson[n] || 0) + (Number(i.amount) || 0); });
  if (list.length) {
    const pc = C.el("div", { class: "card" }, C.el("b", { text: "By person" }));
    Object.entries(byPerson).forEach(([n, v]) => pc.append(C.el("div", { style: "margin-top:8px" },
      C.el("div", { style: "display:flex;justify-content:space-between" }, C.el("span", { text: n }), C.el("b", { text: rm(v) })),
      C.el("div", { class: "bar" }, C.el("i", { style: "width:" + (total ? Math.round((v / total) * 100) : 0) + "%" })))));
    out.push(pc);
  }

  const rc = C.el("div", { class: "card" }, C.el("b", { text: "Income records" + DOT + list.length }));
  if (!list.length) rc.append(C.el("div", { class: "empty", text: "Nothing recorded this month. Tap + Add income." }));
  list.forEach((i) => rc.append(C.el("div", { class: "row", onclick: () => incomeSheet(i) }, C.el("div", { class: "ic", text: incIcon(i.category) }),
    C.el("div", { class: "t" }, C.el("b", { text: i.source }), C.el("span", { class: "sub", text: [i.category, C.dates.shortDate(i.date), whoLabel(i.receivedBy), i.planId ? "Regular" : ""].filter(Boolean).join(DOT) })),
    C.el("b", { style: "color:var(--ok)", text: rm(i.amount) }))));
  out.push(rc);

  const pl = C.el("div", { class: "card" }, C.el("b", { text: "Regular income" }),
    C.el("div", { class: "sub", text: "Salary and other income that arrives every month adds itself on its day." }));
  if (!plans.length) pl.append(C.el("div", { class: "empty", text: "None yet. Tick \"Repeats every month\" when you add income." }));
  plans.forEach((p) => pl.append(C.el("div", { class: "row", onclick: () => planSheet(p) }, C.el("div", { class: "ic", text: incIcon(p.category) }),
    C.el("div", { class: "t" }, C.el("b", { text: p.source }), C.el("span", { class: "sub", text: ["Day " + p.day, whoLabel(p.receivedBy), p.active === false ? "Paused" : "Active"].filter(Boolean).join(DOT) })),
    C.el("b", { text: rm(p.amount) }))));
  out.push(pl);

  const months = []; for (let k = 5; k >= 0; k--) months.push(shiftMonth(month, -k));
  const totals = months.map((m) => incSum(incomeIn(m)));
  const max = Math.max(...totals, 1);
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Income by month" }),
    C.el("div", { style: "display:flex;gap:8px;align-items:flex-end;height:110px;margin-top:10px" }, months.map((m, i) => C.el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px" },
      C.el("div", { class: "sub", style: "font-size:11px", text: totals[i] ? rm0(totals[i]).replace("RM ", "") : "" }),
      C.el("div", { style: "width:100%;border-radius:10px;height:" + Math.max(4, Math.round((totals[i] / max) * 70)) + "px;background:" + (m === month ? "var(--ok)" : "var(--lilac)") }),
      C.el("div", { class: "sub", style: "font-size:11px", text: monthShort(m) }))))));
  out.push(C.el("button", { class: "btn ghost", style: "width:100%", text: "Export income records (CSV)", onclick: exportIncomeCsv }));
  return out;
}

function exportIncomeCsv() {
  const safe = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [["Date", "Source", "Category", "Received by", "Amount (RM)", "Note", "Regular"]];
  liveIncome().sort((a, b) => b.date.localeCompare(a.date)).forEach((i) => rows.push([i.date, i.source, i.category, whoLabel(i.receivedBy), Number(i.amount).toFixed(2), i.note || "", i.planId ? "Yes" : "No"]));
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "our-sanctuary-income-" + C.dates.todayIso() + ".csv";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  C.toast("Exported ✓");
}

const receivers = () => { const p = C.partnerInfo(); const l = [[C.uid, C.nameByUid(C.uid)]]; if (p.uid) l.push([p.uid, p.name]); l.push(["joint", "Joint / shared"]); return l; };

export function incomeSheet(e) {
  if (!C) return;
  const isNew = !e;
  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "0.00" });
  const src = C.el("input", { type: "text", maxlength: "80", placeholder: "e.g. Monthly salary" });
  const cat = select(INCOME_CATS.map((c) => [c[0], c[1] + " " + c[0]]), isNew ? "Salary" : e.category);
  const date = C.el("input", { type: "date" });
  const who = select(receivers(), isNew ? C.uid : e.receivedBy || C.uid);
  const note = C.el("textarea", { maxlength: "300", placeholder: "Optional note" });
  const rep = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
  date.value = isNew ? C.dates.todayIso() : e.date;
  if (!isNew) { amt.value = e.amount; src.value = e.source; note.value = e.note || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const a = parseFloat(amt.value);
    if (!(a > 0)) { C.toast("Please enter the amount"); return; }
    if (!src.value.trim()) { C.toast("Please say where it's from"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { amount: Math.round(a * 100) / 100, source: src.value.trim(), category: cat.value, date: date.value, receivedBy: who.value, note: note.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew && rep.checked) {
        const plan = await addDoc(collection(C.db, "incomeplans"), { source: data.source, amount: data.amount, category: data.category, receivedBy: data.receivedBy,
          day: Number(date.value.slice(8)), startMonth: shiftMonth(date.value.slice(0, 7), 1), active: true, createdBy: C.uid, createdAt: serverTimestamp() });
        await setDoc(doc(C.db, "income", plan.id + "_" + date.value.slice(0, 7)), { ...data, planId: plan.id, createdBy: C.uid, createdAt: serverTimestamp() });
      } else if (isNew) await addDoc(collection(C.db, "income"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "income", e.id), data);
      if (isNew && C.notify) C.notify("expenses", C.nameByUid(C.uid) + " added income", data.source);
      month = date.value.slice(0, 7);
      closeSheet(); C.toast("Saved ✓");
    } catch (err) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete this record", onclick: async () => {
    if (!window.confirm("Delete this income record for both of you? This cannot be undone.")) return;
    try {
      // Regular income leaves a small marker so it isn't added back again.
      if (e.planId) await setDoc(doc(C.db, "income", e.id), { deleted: true, planId: e.planId, updatedAt: serverTimestamp() });
      else await deleteDoc(doc(C.db, "income", e.id));
      closeSheet(); C.toast("Deleted");
    } catch (err) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add income" : "Edit income" }),
    ...field("Amount in RM", amt), ...field("Where it's from", src), ...field("Type", cat), ...field("Date received", date), ...field("Received by", who), ...field("Note", note),
    isNew ? C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, rep, C.el("span", { text: "Repeats every month, on this day" })) : null,
    !isNew && e.planId ? C.el("div", { class: "sub", style: "margin-top:10px", text: "This comes from regular income. Changes here only affect this month. To change future months, edit it under Regular income." }) : null,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function planSheet(p) {
  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal" });
  const src = C.el("input", { type: "text", maxlength: "80" });
  const cat = select(INCOME_CATS.map((c) => [c[0], c[1] + " " + c[0]]), p.category || "Salary");
  const who = select(receivers(), p.receivedBy || C.uid);
  const day = C.el("input", { type: "number", min: "1", max: "31", inputmode: "numeric" });
  const active = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
  amt.value = p.amount; src.value = p.source; day.value = p.day; active.checked = p.active !== false;
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const a = parseFloat(amt.value), d = parseInt(day.value, 10);
    if (!(a > 0) || !src.value.trim() || !(d >= 1 && d <= 31)) { C.toast("Please fill in the amount, name and day"); return; }
    try {
      await updateDoc(doc(C.db, "incomeplans", p.id), { amount: Math.round(a * 100) / 100, source: src.value.trim(), category: cat.value, receivedBy: who.value, day: d, active: active.checked, updatedAt: serverTimestamp() });
      closeSheet(); C.toast("Saved ✓");
    } catch (err) { C.toast("Could not save. Try again."); }
  } });
  const remove = C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete regular income", onclick: async () => {
    if (!window.confirm("Stop this regular income? Records already added stay.")) return;
    try { await deleteDoc(doc(C.db, "incomeplans", p.id)); closeSheet(); C.toast("Deleted"); } catch (err) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Regular income" }), ...field("Amount in RM", amt), ...field("Where it's from", src), ...field("Type", cat), ...field("Received by", who),
    ...field("Arrives on day of the month", day),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, active, C.el("span", { text: "Active (adds itself each month)" })),
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Changes apply to future months. Past records stay as they are." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

