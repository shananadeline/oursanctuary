// groceries.js - weekly grocery budget (Step 8)
import { collection, onSnapshot, setDoc, doc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sheet as expenseSheet } from "./expenses.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const DEFAULT = { weekly: 130, target: 115 };
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = (n) => "RM " + Math.round(n).toLocaleString("en-MY");

let C = null;
let spends = [];
let weekStart = "";

function mondayOf(iso) {
  const d = C.dates.parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return C.dates.isoOf(d);
}
function addDays(iso, n) { const d = C.dates.parseIso(iso); d.setDate(d.getDate() + n); return C.dates.isoOf(d); }
function weekLabel(start) {
  const a = C.dates.parseIso(start), b = C.dates.parseIso(addDays(start, 6));
  const mo = (d) => d.toLocaleDateString("en-GB", { month: "short" });
  return a.getMonth() === b.getMonth() ? a.getDate() + "–" + b.getDate() + " " + mo(b) : a.getDate() + " " + mo(a) + " – " + b.getDate() + " " + mo(b);
}
const inWeek = (e, start) => e.date >= start && e.date <= addDays(start, 6);
const sumWeek = (start) => spends.filter((e) => inWeek(e, start)).reduce((s, e) => s + (Number(e.amount) || 0), 0);

function budget() {
  const g = (C.getSettings() || {}).groceryBudget || {};
  const weekly = Number(g.weekly) > 0 ? Number(g.weekly) : DEFAULT.weekly;
  const target = Number(g.target) > 0 && Number(g.target) <= weekly ? Number(g.target) : Math.min(DEFAULT.target, weekly);
  return { weekly, target, buffer: weekly - target };
}

/* ---------- Start ---------- */
export function startGroceries(ctx) {
  C = ctx;
  spends = [];
  weekStart = mondayOf(C.dates.todayIso());
  const unsub = onSnapshot(collection(C.db, "expenses"), (s) => {
    spends = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.category === "Groceries" && e.date);
    refreshGroceries();
  });
  return () => { unsub(); C = null; };
}
export function onGroceriesOpen() { if (C) { weekStart = mondayOf(C.dates.todayIso()); refreshGroceries(); } }

/* ---------- Screen ---------- */
export function refreshGroceries() {
  if (!C || !$("groceries").classList.contains("on")) return;
  const b = budget();
  const spent = sumWeek(weekStart);
  const remaining = b.weekly - spent;
  const bufferLeft = Math.max(0, b.weekly - Math.max(spent, b.target));
  const pct = Math.min(100, Math.round((spent / b.weekly) * 100));
  const targetPct = Math.round((b.target / b.weekly) * 100);
  const over = spent > b.weekly, usingBuffer = !over && spent > b.target;

  const nav = C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Previous week", onclick: () => { weekStart = addDays(weekStart, -7); refreshGroceries(); } }),
    C.el("b", { text: weekStart === mondayOf(C.dates.todayIso()) ? "This week" + DOT + weekLabel(weekStart) : weekLabel(weekStart) }),
    C.el("button", { class: "round", text: "›", "aria-label": "Next week", onclick: () => { weekStart = addDays(weekStart, 7); refreshGroceries(); } }));

  const fillColor = over ? "var(--err)" : usingBuffer ? "var(--warn)" : "";
  const bar = C.el("div", { class: "bar", style: "position:relative;height:12px" },
    C.el("i", { style: "width:" + pct + "%" + (fillColor ? ";background:" + fillColor : "") }),
    C.el("span", { style: "position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--tx2);left:" + targetPct + "%", title: "Target" }));

  const stat = (label, value, danger) => C.el("div", { style: "flex:1;min-width:0" },
    C.el("div", { class: "sub", text: label }), C.el("b", { style: "font-size:17px" + (danger ? ";color:var(--err)" : ""), text: value }));

  const card = C.el("div", { class: "card" },
    C.el("div", { class: "sub", text: "Spent on groceries" }),
    C.el("div", { class: "serif", style: "font-size:30px", text: rm(spent) }),
    bar,
    C.el("div", { class: "sub", text: "Weekly budget " + rm0(b.weekly) + DOT + "Target " + rm0(b.target) + DOT + "Buffer " + rm0(b.buffer) }),
    C.el("div", { style: "display:flex;gap:10px;margin-top:14px" },
      stat(over ? "Over budget" : "Remaining", over ? rm(spent - b.weekly) : rm(remaining), over),
      stat("Buffer left", rm(bufferLeft))),
    C.el("button", { class: "tag", style: "margin-top:12px", text: "Change budget", onclick: budgetSheet }));

  const out = [nav, card];
  if (over) out.push(banner("err", "You're over this week's budget by " + rm(spent - b.weekly) + "."));
  else if (usingBuffer) out.push(banner("w", "You're past your target and using the buffer."));
  else if (spent > 0) out.push(banner("o", "On track. You're within your target."));

  // This week's records
  const list = spends.filter((e) => inWeek(e, weekStart)).sort((a, z) => z.date.localeCompare(a.date));
  const rec = C.el("div", { class: "card" }, C.el("b", { text: "Grocery spending" + DOT + list.length }));
  if (!list.length) rec.append(C.el("div", { class: "empty", text: "Nothing recorded this week. Tap + Add grocery spend after you shop." }));
  list.forEach((e) => rec.append(C.el("div", { class: "row", onclick: () => expenseSheet(e) },
    C.el("div", { class: "ic", text: "🛒" }),
    C.el("div", { class: "t" }, C.el("b", { text: e.description }),
      C.el("span", { class: "sub", text: [C.dates.shortDate(e.date), e.paidBy ? C.nameByUid(e.paidBy) : ""].filter(Boolean).join(DOT) })),
    C.el("b", { text: rm(Number(e.amount)) }))));
  out.push(rec);

  // Last six weeks
  const weeks = [];
  for (let k = 5; k >= 0; k--) weeks.push(addDays(weekStart, -7 * k));
  const totals = weeks.map(sumWeek);
  const max = Math.max(b.weekly * 1.1, ...totals);
  const bars = C.el("div", { style: "display:flex;gap:8px;align-items:flex-end;height:110px;margin-top:10px" },
    weeks.map((w, i) => C.el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px" },
      C.el("div", { class: "sub", style: "font-size:11px", text: totals[i] ? rm0(totals[i]).replace("RM ", "") : "" }),
      C.el("div", { style: "width:100%;border-radius:10px;height:" + Math.max(4, Math.round((totals[i] / max) * 70)) + "px;background:" +
        (totals[i] > b.weekly ? "var(--err)" : w === weekStart ? "var(--el)" : "var(--lilac)") }),
      C.el("div", { class: "sub", style: "font-size:11px", text: C.dates.parseIso(w).getDate() + "/" + (C.dates.parseIso(w).getMonth() + 1) }))));
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Last 6 weeks" }), bars,
    C.el("div", { class: "sub", style: "margin-top:6px", text: "Red bars went over the weekly budget." })));

  // Price tips and what's next
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Shopping smart in Malaysia" }),
    C.el("div", { class: "sub", style: "margin-top:6px", text: "Good places to compare: Lotus's, Mydin, Econsave, Giant, AEON, 99 Speedmart and your local wet market." }),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Prices change by shop and by week, so treat any estimate as a guide and check before you buy. The free PriceCatcher app from KPDN, or " },
      C.el("a", { href: "https://www.manamurah.com", target: "_blank", rel: "noopener noreferrer", style: "color:var(--pri);font-weight:700", text: "manamurah.com" }),
      document.createTextNode(", shows recent prices."))));
  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Coming next" }),
    C.el("div", { class: "sub", text: "Recipes, the weekly meal planner, and a grocery list with estimated cost for your planned meals." })));

  $("grBody").replaceChildren(...out);
}

function banner(kind, text) {
  return C.el("div", { class: "card", style: "display:flex;gap:10px;align-items:center" },
    C.el("span", { class: "tag " + kind, text: kind === "o" ? "OK" : kind === "w" ? "Careful" : "Over" }), C.el("span", { text }));
}

/* ---------- Change budget ---------- */
function budgetSheet() {
  const b = budget();
  const weekly = C.el("input", { type: "number", min: "1", step: "1", inputmode: "decimal" });
  const target = C.el("input", { type: "number", min: "1", step: "1", inputmode: "decimal" });
  weekly.value = b.weekly; target.value = b.target;
  const close = () => $("sbg").classList.remove("on");
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const w = parseFloat(weekly.value), t = parseFloat(target.value);
    if (!(w > 0) || !(t > 0)) { C.toast("Please enter both amounts"); return; }
    if (t > w) { C.toast("Target can't be higher than the weekly budget"); return; }
    try { await setDoc(doc(C.db, "shared", "settings"), { groceryBudget: { weekly: w, target: t } }, { merge: true }); close(); C.toast("Budget saved ✓"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Weekly grocery budget" }),
    C.el("div", { class: "sub", text: "A flexible range of RM100–RM150 works well for two people. Change it any time. The buffer is the gap between your target and your budget." }),
    C.el("label", { text: "Weekly budget in RM" }), weekly, C.el("label", { text: "Target spending in RM" }), target,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: close }), save));
  $("sbg").classList.add("on");
}
