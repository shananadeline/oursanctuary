// petreports.js - pet spending reports (Phase 4, Step 5)
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sheet as expenseSheet } from "./expenses.js";

const $ = (id) => document.getElementById(id);
const DOT = "\u00A0· ";
const PET_CATS = ["Pets", "Pet food", "Veterinary", "Pet insurance"];
const GROUPS = { "Pet food": "Food and treats", Veterinary: "Veterinary", "Pet insurance": "Insurance", Pets: "Litter, supplies and other" };
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => Math.round(n).toLocaleString("en-MY");

let C = null;
let expenses = [];
let period = "month";   // "month" or "year"
let cursor = "";        // YYYY-MM or YYYY

const petExpenses = () => expenses.filter((e) => PET_CATS.includes(e.category) && e.date);
const petName = (id) => { const p = C.getPets().find((x) => x.id === id); return p ? p.name : "Removed pet"; };
function shiftMonth(ym, d) { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); }
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
const monthShort = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" }); };
const sum = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

/* ---------- Start ---------- */
export function startPetReports(ctx) {
  C = ctx;
  expenses = [];
  period = "month"; cursor = C.dates.todayIso().slice(0, 7);
  const unsub = onSnapshot(collection(C.db, "expenses"), (s) => { expenses = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshPetReport(); if (C && C.afterChange) C.afterChange(); });
  return () => { unsub(); C = null; };
}
export function onPetReportOpen() { if (C) { period = "month"; cursor = C.dates.todayIso().slice(0, 7); refreshPetReport(); } }
export function refreshPetReport() {
  if (!C || !$("petreport").classList.contains("on")) return;
  $("prBody").replaceChildren(...reportNodes(null));
}
export const petSpendTab = (p) => (C ? reportNodes(p.id) : []);

/* ---------- The report (for everyone, or for one pet) ---------- */
function setPeriod(p) {
  if (p === period) return;
  period = p;
  cursor = p === "month" ? C.dates.todayIso().slice(0, 7) : C.dates.todayIso().slice(0, 4);
  C.afterChange();
  refreshPetReport();
}

function reportNodes(petId) {
  const mine = petExpenses().filter((e) => !petId || e.petId === petId);
  const list = mine.filter((e) => e.date.startsWith(cursor));
  const total = sum(list);
  const rerender = () => { C.afterChange(); refreshPetReport(); };

  const tabs = C.el("div", { class: "pills" }, ...[["month", "Month"], ["year", "Year"]].map(([k, l]) =>
    C.el("button", { class: "pill" + (period === k ? " on" : ""), text: l, onclick: () => setPeriod(k) })));
  const step = (d) => () => { cursor = period === "month" ? shiftMonth(cursor, d) : String(Number(cursor) + d); rerender(); };
  const nav = C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Earlier", onclick: step(-1) }),
    C.el("b", { text: period === "month" ? monthLabel(cursor) : cursor }),
    C.el("button", { class: "round", text: "›", "aria-label": "Later", onclick: step(1) }));

  const summary = C.el("div", { class: "card hero" },
    C.el("div", { style: "opacity:.9;font-size:13px;position:relative", text: (petId ? petName(petId) + "'s" : "Household pet") + " spending" }),
    C.el("div", { class: "serif", style: "font-size:34px;position:relative", text: rm(total) }),
    C.el("div", { style: "opacity:.9;font-size:13px;position:relative", text: list.length + (list.length === 1 ? " record" : " records") }));

  const out = [tabs, nav, summary];

  // By kind of spending
  const byGroup = {};
  list.forEach((e) => { const g = GROUPS[e.category] || "Other"; byGroup[g] = (byGroup[g] || 0) + (Number(e.amount) || 0); });
  const bar = (label, value) => C.el("div", { style: "margin-top:10px" },
    C.el("div", { style: "display:flex;justify-content:space-between" }, C.el("span", { text: label }), C.el("b", { text: rm(value) })),
    C.el("div", { class: "bar" }, C.el("i", { style: "width:" + (total ? Math.round((value / total) * 100) : 0) + "%" })));
  const kinds = C.el("div", { class: "card" }, C.el("b", { text: "Where it went" }));
  if (!list.length) kinds.append(C.el("div", { class: "empty", text: "No pet spending recorded for this period." }));
  Object.entries(byGroup).sort((a, b) => b[1] - a[1]).forEach(([g, v]) => kinds.append(bar(g, v)));
  out.push(kinds);

  // Detailed types, when chosen on the expense
  const byType = {};
  list.forEach((e) => { if (e.petType) byType[e.petType] = (byType[e.petType] || 0) + (Number(e.amount) || 0); });
  if (Object.keys(byType).length) {
    const tc = C.el("div", { class: "card" }, C.el("b", { text: "By type" }));
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([t, v]) => tc.append(C.el("div", { class: "row", style: "padding:8px 0" }, C.el("div", { class: "t", text: t }), C.el("b", { text: rm(v) }))));
    out.push(tc);
  }

  // By pet (household report only)
  if (!petId) {
    const byPet = {};
    list.forEach((e) => { const k = e.petId || ""; byPet[k] = (byPet[k] || 0) + (Number(e.amount) || 0); });
    const pc = C.el("div", { class: "card" }, C.el("b", { text: "By pet" }));
    if (!list.length) pc.append(C.el("div", { class: "empty", text: "Nothing yet." }));
    Object.entries(byPet).sort((a, b) => b[1] - a[1]).forEach(([id, v]) => pc.append(bar(id ? petName(id) : "Not assigned to one pet", v)));
    if (byPet[""]) pc.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "Tip: open an expense and choose a pet to count it in that pet's total." }));
    out.push(pc);
  }

  // History bars
  const months = [];
  if (period === "month") for (let k = 5; k >= 0; k--) months.push(shiftMonth(cursor, -k));
  else for (let m = 1; m <= 12; m++) months.push(cursor + "-" + String(m).padStart(2, "0"));
  const totals = months.map((m) => sum(mine.filter((e) => e.date.startsWith(m))));
  const max = Math.max(...totals, 1);
  const hist = C.el("div", { style: "display:flex;gap:" + (period === "year" ? "4" : "8") + "px;align-items:flex-end;height:110px;margin-top:10px" },
    months.map((m, i) => C.el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px;min-width:0" },
      C.el("div", { class: "sub", style: "font-size:10px", text: totals[i] ? rm0(totals[i]) : "" }),
      C.el("div", { style: "width:100%;border-radius:8px;height:" + Math.max(4, Math.round((totals[i] / max) * 70)) + "px;background:" + (period === "month" && m === cursor ? "var(--el)" : "var(--lilac)") }),
      C.el("div", { class: "sub", style: "font-size:10px", text: monthShort(m) }))));
  out.push(C.el("div", { class: "card" }, C.el("b", { text: period === "month" ? "Last 6 months" : "Spending by month, " + cursor }), hist));

  // Records
  const rc = C.el("div", { class: "card" }, C.el("b", { text: "Records" }));
  if (!list.length) rc.append(C.el("div", { class: "empty", text: "Add pet expenses from Expenses, or from the food, vet and insurance pages." }));
  list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).forEach((e) => rc.append(C.el("div", { class: "row", onclick: () => expenseSheet(e) },
    C.el("div", { class: "t" }, C.el("b", { text: e.description }),
      C.el("span", { class: "sub", text: [petId ? "" : (e.petId ? petName(e.petId) : ""), e.petType || e.category, C.dates.shortDate(e.date)].filter(Boolean).join(DOT) })),
    C.el("b", { text: rm(e.amount) }))));
  if (list.length > 15) rc.append(C.el("div", { class: "empty", text: "Showing the latest 15." }));
  out.push(rc);
  out.push(C.el("div", { class: "sub", style: "margin:0 4px 12px", text: "Reports use your Expenses records, so each purchase is counted once." }));
  return out;
}
