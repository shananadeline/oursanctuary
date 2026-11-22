// insurance.js - pet insurance policies, premiums and claims (Phase 4, Step 4)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getVisits } from "./vet.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const FREQ = [["monthly", "Monthly", 1], ["quarterly", "Every 3 months", 3], ["halfyearly", "Every 6 months", 6], ["yearly", "Yearly", 12]];
const STATUS = [["draft", "Not submitted yet"], ["submitted", "Submitted"], ["approved", "Approved"], ["partial", "Partly approved"], ["rejected", "Rejected"], ["paid", "Reimbursed"]];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const freqInfo = (k) => FREQ.find((f) => f[0] === k) || FREQ[0];
const statusLabel = (k) => (STATUS.find((s) => s[0] === k) || STATUS[0])[1];

let C = null;
let policies = [], claims = [], payments = [];

const today = () => C.dates.todayIso();
const petName = (id) => { const p = C.getPets().find((x) => x.id === id); return p ? p.name : "Pet"; };
const petsOf = (pol) => (pol.petIds || []).map(petName).join(", ") || "No pet chosen";
function addMonths(iso, n) {
  const d = C.dates.parseIso(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return C.dates.isoOf(d);
}
const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

/* ---------- Start ---------- */
export function startInsurance(ctx) {
  C = ctx;
  policies = []; claims = []; payments = [];
  const subs = [
    onSnapshot(collection(C.db, "inspolicies"), (s) => { policies = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "insclaims"), (s) => { claims = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "inspayments"), (s) => { payments = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); })
  ];
  return () => { subs.forEach((u) => u()); C = null; };
}
function changed() { refreshInsurance(); if (C && C.afterChange) C.afterChange(); }

// For the "Coming up for our pets" list.
export function upcomingInsuranceItems() {
  if (!C) return [];
  const out = [];
  policies.filter((p) => !p.ended).forEach((p) => {
    const pid = (p.petIds || [])[0];
    if (!pid) return;
    if (p.renewalDate) out.push({ date: p.renewalDate, petId: pid, label: (p.provider || "Insurance") + " renewal", icon: "🛡️" });
    if (p.nextPremiumDue) out.push({ date: p.nextPremiumDue, petId: pid, label: (p.provider || "Insurance") + " premium", icon: "🛡️" });
  });
  return out.filter((i) => i.date >= today());
}

/* ---------- Calendar link ---------- */
async function sync(eventId, data) {
  if (!data) { if (eventId) { try { await deleteDoc(doc(C.db, "events", eventId)); } catch (e) {} } return ""; }
  const full = { ...data, repeatYearly: false, source: "insurance", updatedAt: serverTimestamp() };
  if (eventId) { try { await updateDoc(doc(C.db, "events", eventId), full); return eventId; } catch (e) { /* deleted, so make a new one */ } }
  return (await addDoc(collection(C.db, "events"), { ...full, createdBy: C.uid, createdAt: serverTimestamp() })).id;
}

/* ---------- Totals ---------- */
function totals(polList) {
  const ids = new Set(polList.map((p) => p.id));
  const pay = payments.filter((x) => ids.has(x.policyId));
  const cl = claims.filter((x) => ids.has(x.policyId));
  const year = today().slice(0, 4);
  const submitted = cl.filter((c) => c.status && c.status !== "draft");
  return {
    premiumsAll: pay.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    premiumsYear: pay.filter((x) => (x.date || "").startsWith(year)).reduce((s, x) => s + (Number(x.amount) || 0), 0),
    claimed: submitted.reduce((s, c) => s + (Number(c.amountClaimed) || 0), 0), claimCount: submitted.length,
    reimbursed: cl.reduce((s, c) => s + (Number(c.amountReimbursed) || 0), 0)
  };
}
function totalsCard(polList) {
  const t = totals(polList);
  const cell = (label, value) => C.el("div", { style: "flex:1;min-width:120px;background:var(--pale);border-radius:16px;padding:10px" }, C.el("div", { class: "sub", text: label }), C.el("b", { text: value }));
  return C.el("div", { class: "card" }, C.el("b", { text: "Insurance totals" }),
    C.el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px" },
      cell("Premiums this year", rm(t.premiumsYear)), cell("Premiums paid, all time", rm(t.premiumsAll)),
      cell("Claims submitted (" + t.claimCount + ")", rm(t.claimed)), cell("Reimbursed", rm(t.reimbursed))),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Premiums less reimbursements: " + rm(t.premiumsAll - t.reimbursed) + ". Totals only count what you record here." }));
}

/* ---------- Screens ---------- */
function dueTag(iso) {
  const d = C.dates.daysBetween(today(), iso);
  if (d < 0) return C.el("span", { class: "tag e", text: "Overdue" });
  if (d <= 30) return C.el("span", { class: "tag w", text: d === 0 ? "Today" : "In " + d + (d === 1 ? " day" : " days") });
  return null;
}

function policyCard(pol) {
  const f = freqInfo(pol.frequency);
  const c = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;gap:8px;align-items:center" },
      C.el("b", { style: "font-size:17px", text: [pol.provider, pol.name].filter(Boolean).join(" · ") || "Policy" }),
      pol.ended ? C.el("span", { class: "tag", text: "Ended" }) : null),
    C.el("div", { class: "sub", text: "Covers " + petsOf(pol) }),
    C.el("div", { class: "sub", text: [pol.premium != null ? rm(pol.premium) + " " + f[1].toLowerCase() : "", pol.coverageStart ? "Since " + C.dates.prettyDate(pol.coverageStart) : ""].filter(Boolean).join(DOT) }));
  if (!pol.ended) {
    const lines = C.el("div", { style: "margin-top:8px" });
    if (pol.nextPremiumDue) lines.append(C.el("div", { style: "display:flex;gap:8px;align-items:center" }, C.el("span", { class: "sub", text: "Next premium " + C.dates.shortDate(pol.nextPremiumDue) }), dueTag(pol.nextPremiumDue)));
    if (pol.renewalDate) lines.append(C.el("div", { style: "display:flex;gap:8px;align-items:center" }, C.el("span", { class: "sub", text: "Renews " + C.dates.shortDate(pol.renewalDate) }), dueTag(pol.renewalDate)));
    c.append(lines);
  }
  const pc = claims.filter((x) => x.policyId === pol.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (pc.length) {
    c.append(C.el("b", { style: "display:block;margin-top:10px;font-size:14px", text: "Claims " + pc.length }));
    pc.slice(0, 3).forEach((cl) => c.append(claimRow(cl)));
  }
  c.append(C.el("div", { style: "display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" },
    pol.ended ? null : C.el("button", { class: "btn", style: "padding:9px 14px;font-size:14px", text: "Record premium paid", onclick: () => paySheet(pol) }),
    C.el("button", { class: "tag", text: "+ Add claim", onclick: () => claimSheet(pol) }),
    C.el("button", { class: "tag", text: "Details", onclick: () => detail(pol.id) })));
  return c;
}

function claimRow(cl) {
  return C.el("div", { class: "row", onclick: () => claimSheet(null, cl) },
    C.el("div", { class: "t" }, C.el("b", { text: (petName(cl.petId)) + ": " + (cl.treatment || "Claim") }),
      C.el("span", { class: "sub", text: [cl.date ? C.dates.shortDate(cl.date) : "", "Claimed " + rm(cl.amountClaimed), cl.amountReimbursed ? "Back " + rm(cl.amountReimbursed) : ""].filter(Boolean).join(DOT) })),
    C.el("span", { class: "tag" + (cl.status === "rejected" ? " e" : cl.status === "paid" ? " o" : ""), text: statusLabel(cl.status) }));
}

export function refreshInsurance() {
  if (!C || !$("insurance").classList.contains("on")) return;
  const out = [totalsCard(policies)];
  if (!policies.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: "No policies yet. Tap + Add policy." })));
  policies.slice().sort((a, b) => (a.ended ? 1 : 0) - (b.ended ? 1 : 0) || (a.renewalDate || "9999").localeCompare(b.renewalDate || "9999")).forEach((p) => out.push(policyCard(p)));
  out.push(C.el("div", { class: "sub", style: "margin:0 4px 12px", text: "Policy details are stored here for your own reference. They don't mean a treatment is covered, so check with your insurer." }));
  $("insBody").replaceChildren(...out);
}

// Insurance tab for one pet (used by pets.js)
export function insuranceTab(p) {
  if (!C) return [];
  const mine = policies.filter((x) => (x.petIds || []).includes(p.id));
  const out = [totalsCard(mine)];
  if (!mine.length) out.push(C.el("div", { class: "card" }, C.el("div", { class: "empty", text: p.name + " has no insurance policy recorded." }),
    C.el("button", { class: "btn", style: "margin-top:10px", text: "+ Add policy", onclick: () => policySheet(null, { petIds: [p.id] }) })));
  mine.forEach((x) => out.push(policyCard(x)));
  out.push(C.el("div", { class: "sub", style: "margin:0 4px 12px", text: "Stored for your own reference. This isn't a promise that anything is covered." }));
  return out;
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}
const checkbox = () => C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
const livePets = () => C.getPets().filter((p) => (p.status || "active") !== "archived");

export function policySheet(pol, preset) {
  if (!C) return;
  const isNew = !pol;
  const pr = preset || {};
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "e.g. Cat Care Plus" });
  const provider = C.el("input", { type: "text", maxlength: "60", placeholder: "e.g. Insurer name" });
  const number = C.el("input", { type: "text", maxlength: "40", placeholder: "Optional" });
  const start = C.el("input", { type: "date" });
  const renew = C.el("input", { type: "date" });
  const premium = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Per payment, in RM" });
  const freq = select(FREQ.map((f) => [f[0], f[1]]), isNew ? "monthly" : pol.frequency || "monthly");
  const nextPrem = C.el("input", { type: "date" });
  const cover = C.el("textarea", { maxlength: "600", placeholder: "What the policy says it covers, limits, waiting periods…" });
  const ended = checkbox();
  const boxes = livePets().map((pt) => { const c = checkbox(); c.checked = isNew ? (pr.petIds || []).includes(pt.id) : (pol.petIds || []).includes(pt.id);
    return { pet: pt, c, node: C.el("label", { style: "display:flex;gap:10px;align-items:center;margin:6px 0;color:var(--tx);font-size:15px" }, c, C.el("span", { text: pt.name })) }; });
  if (!isNew) { name.value = pol.name || ""; provider.value = pol.provider || ""; number.value = pol.policyNumber || ""; start.value = pol.coverageStart || ""; renew.value = pol.renewalDate || "";
    premium.value = pol.premium == null ? "" : pol.premium; nextPrem.value = pol.nextPremiumDue || ""; cover.value = pol.coverageNotes || ""; ended.checked = !!pol.ended; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const petIds = boxes.filter((b) => b.c.checked).map((b) => b.pet.id);
    if (!provider.value.trim() && !name.value.trim()) { C.toast("Please type the provider or policy name"); return; }
    if (!petIds.length) { C.toast("Please choose which pet it covers"); return; }
    const data = { name: name.value.trim(), provider: provider.value.trim(), policyNumber: number.value.trim(), petIds, coverageStart: start.value || "", renewalDate: renew.value || "",
      premium: num(premium.value), frequency: freq.value, nextPremiumDue: nextPrem.value || "", coverageNotes: cover.value.trim(), ended: ended.checked, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      const label = (data.provider || "Insurance") + (data.name ? " " + data.name : "");
      const names = petIds.map(petName).join(", ");
      data.eventId = await sync(pol && pol.eventId, !data.ended && data.renewalDate ? { title: label + " renewal (" + names + ")", type: "Insurance renewal", date: data.renewalDate, time: "", location: "", note: "Pet insurance renewal", remind: "1w" } : null);
      data.premiumEventId = await sync(pol && pol.premiumEventId, !data.ended && data.nextPremiumDue ? { title: label + " premium due (" + names + ")", type: "Insurance renewal", date: data.nextPremiumDue, time: "", location: "", note: data.premium ? "Premium " + rm(data.premium) : "Premium payment", remind: "2d" } : null);
      if (isNew) await addDoc(collection(C.db, "inspolicies"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "inspolicies", pol.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete policy", onclick: async () => {
    if (!window.confirm("Delete this policy with its claims, premium records and reminders for both of you? Expenses already recorded stay. This cannot be undone.")) return;
    try {
      await sync(pol.eventId, null); await sync(pol.premiumEventId, null);
      const b = writeBatch(C.db);
      claims.filter((x) => x.policyId === pol.id).slice(0, 200).forEach((x) => b.delete(doc(C.db, "insclaims", x.id)));
      payments.filter((x) => x.policyId === pol.id).slice(0, 200).forEach((x) => b.delete(doc(C.db, "inspayments", x.id)));
      b.delete(doc(C.db, "inspolicies", pol.id));
      await b.commit(); closeSheet(); C.toast("Policy deleted");
    } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add insurance policy" : "Edit policy" }),
    ...field("Insurance provider", provider), ...field("Policy name", name), ...field("Policy number (optional)", number),
    C.el("label", { text: "Pets covered" }), ...boxes.map((b) => b.node),
    ...field("Coverage start date", start), ...field("Renewal date", renew), ...field("Premium amount in RM", premium), ...field("Payment frequency", freq), ...field("Next premium due", nextPrem),
    ...field("Coverage notes", cover),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, ended, C.el("span", { text: "This policy has ended" })),
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Renewal and premium dates are added to your Calendar with reminders. Please don't store card or bank details here." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function paySheet(pol) {
  const amt = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal" });
  const date = C.el("input", { type: "date" });
  const exp = checkbox(); exp.checked = true;
  amt.value = pol.premium == null ? "" : pol.premium; date.value = today();
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const a = num(amt.value);
    if (!a) { C.toast("Please enter the amount"); return; }
    save.disabled = true;
    try {
      let expenseId = "";
      if (exp.checked) expenseId = (await addDoc(collection(C.db, "expenses"), { amount: Math.round(a * 100) / 100, description: "Pet insurance: " + ([pol.provider, pol.name].filter(Boolean).join(" ") || "premium"),
        category: "Pet insurance", date: date.value, paidBy: C.uid, petId: (pol.petIds || []).length === 1 ? pol.petIds[0] : null, note: "From Pet insurance", linkedPremium: true, createdBy: C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id;
      await addDoc(collection(C.db, "inspayments"), { policyId: pol.id, amount: Math.round(a * 100) / 100, date: date.value, expenseId, by: C.uid, createdAt: serverTimestamp() });
      // Move the next premium date forward by one period.
      const months = freqInfo(pol.frequency)[2];
      const nextPremiumDue = addMonths(pol.nextPremiumDue || date.value, months);
      const premiumEventId = await sync(pol.premiumEventId, !pol.ended ? { title: ([pol.provider, pol.name].filter(Boolean).join(" ") || "Insurance") + " premium due (" + petsOf(pol) + ")", type: "Insurance renewal", date: nextPremiumDue, time: "", location: "", note: pol.premium ? "Premium " + rm(pol.premium) : "Premium payment", remind: "2d" } : null);
      await updateDoc(doc(C.db, "inspolicies", pol.id), { nextPremiumDue, premiumEventId, updatedAt: serverTimestamp() });
      closeSheet(); C.toast("Premium recorded. Next: " + C.dates.shortDate(nextPremiumDue) + " ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Record premium paid" }), C.el("div", { class: "sub", text: [pol.provider, pol.name].filter(Boolean).join(" · ") }),
    ...field("Amount paid in RM", amt), ...field("Date paid", date),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, exp, C.el("span", { text: "Also add to Expenses" })),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

function claimSheet(pol, cl) {
  const isNew = !cl;
  const policy = isNew ? pol : policies.find((x) => x.id === cl.policyId);
  if (!policy) { C.toast("Policy not found"); return; }
  const pets = (policy.petIds || []).map((id) => [id, petName(id)]);
  const pet = select(pets, isNew ? pets[0][0] : cl.petId);
  const visitOpts = () => [["", "Other treatment (type below)"], ...getVisits().filter((v) => v.petId === pet.value).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((v) => [v.id, C.dates.shortDate(v.date) + " · " + (v.reason || "Vet visit")])];
  const visit = select(visitOpts(), isNew ? "" : cl.visitId || "");
  const treat = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Dental cleaning" });
  const date = C.el("input", { type: "date" });
  const paid = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Amount you paid, RM" });
  const claimed = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Amount claimed, RM" });
  const status = select(STATUS, isNew ? "draft" : cl.status || "draft");
  const subDate = C.el("input", { type: "date" });
  const back = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Amount reimbursed, RM" });
  const docs = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Invoice in the blue folder" });
  const notes = C.el("textarea", { maxlength: "400", placeholder: "Optional" });
  date.value = isNew ? today() : cl.date || "";
  if (!isNew) { treat.value = cl.treatment || ""; paid.value = cl.amountPaid == null ? "" : cl.amountPaid; claimed.value = cl.amountClaimed == null ? "" : cl.amountClaimed; subDate.value = cl.submittedDate || "";
    back.value = cl.amountReimbursed == null ? "" : cl.amountReimbursed; docs.value = cl.docsNote || ""; notes.value = cl.notes || ""; }
  pet.addEventListener("change", () => { const keep = visit.value; visit.replaceChildren(...visitOpts().map(([v, l]) => C.el("option", { value: v, text: l }))); visit.value = visitOpts().some((o) => o[0] === keep) ? keep : ""; });
  visit.addEventListener("change", () => { const v = getVisits().find((x) => x.id === visit.value); if (v) { treat.value = v.reason || "Vet visit"; date.value = v.date; if (v.fee != null) { paid.value = v.fee; if (!claimed.value) claimed.value = v.fee; } } });

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    if (!treat.value.trim()) { C.toast("Please describe the treatment"); return; }
    const data = { policyId: policy.id, petId: pet.value, visitId: visit.value || "", treatment: treat.value.trim(), date: date.value || "", amountPaid: num(paid.value), amountClaimed: num(claimed.value),
      status: status.value, submittedDate: subDate.value || "", amountReimbursed: num(back.value), docsNote: docs.value.trim(), notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "insclaims"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "insclaims", cl.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete claim", onclick: async () => {
    if (!window.confirm("Delete this claim record?")) return;
    try { await deleteDoc(doc(C.db, "insclaims", cl.id)); closeSheet(); } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "Add claim" : "Edit claim" }), C.el("div", { class: "sub", text: [policy.provider, policy.name].filter(Boolean).join(" · ") }),
    ...field("Pet", pet), ...field("Vet visit (optional)", visit), ...field("Treatment", treat), ...field("Treatment date", date),
    ...field("Amount paid", paid), ...field("Amount claimed", claimed), ...field("Claim status", status), ...field("Date submitted", subDate), ...field("Amount reimbursed", back),
    ...field("Where the invoice or documents are kept", docs), ...field("Notes", notes),
    C.el("div", { class: "sub", style: "margin-top:10px", text: "Keep your invoices and documents safe elsewhere, since photos aren't stored in this app." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function detail(id) {
  const pol = policies.find((x) => x.id === id);
  if (!pol) { closeSheet(); return; }
  const f = freqInfo(pol.frequency);
  const pays = payments.filter((x) => x.policyId === id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const cls = claims.filter((x) => x.policyId === id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const t = totals([pol]);
  const kv = (l, v) => (v ? C.el("div", { class: "row" }, C.el("div", { class: "t" }, C.el("span", { class: "sub", text: l }), C.el("b", { style: "font-weight:500", text: v }))) : null);
  setSheet(C.el("h2", { style: "font-size:24px", text: [pol.provider, pol.name].filter(Boolean).join(" · ") }),
    kv("Covers", petsOf(pol)), kv("Policy number", pol.policyNumber), kv("Premium", pol.premium != null ? rm(pol.premium) + " " + f[1].toLowerCase() : ""),
    kv("Coverage started", pol.coverageStart ? C.dates.prettyDate(pol.coverageStart) : ""), kv("Renewal", pol.renewalDate ? C.dates.prettyDate(pol.renewalDate) : ""),
    kv("Coverage notes", pol.coverageNotes),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Premiums paid: " + rm(t.premiumsAll) + DOT + "Claimed " + rm(t.claimed) + DOT + "Reimbursed " + rm(t.reimbursed) }),
    C.el("b", { style: "display:block;margin-top:12px", text: "Premium payments" }),
    ...(pays.length ? pays.slice(0, 12).map((x) => C.el("div", { class: "row" }, C.el("div", { class: "t" }, C.el("b", { text: rm(x.amount) }), C.el("span", { class: "sub", text: C.dates.shortDate(x.date) })),
      C.el("button", { class: "tag e", text: "Remove", onclick: async () => {
        if (!window.confirm("Remove this payment record" + (x.expenseId ? " and its expense" : "") + "?")) return;
        try { if (x.expenseId) { try { await deleteDoc(doc(C.db, "expenses", x.expenseId)); } catch (e) {} } await deleteDoc(doc(C.db, "inspayments", x.id)); setTimeout(() => detail(id), 250); } catch (e) { C.toast("Could not remove. Try again."); }
      } }))) : [C.el("div", { class: "empty", text: "No premium payments recorded yet." })]),
    C.el("b", { style: "display:block;margin-top:12px", text: "All claims" }), ...(cls.length ? cls.map(claimRow) : [C.el("div", { class: "empty", text: "No claims yet." })]),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet }), C.el("button", { class: "btn", text: "Edit policy", onclick: () => policySheet(pol) })));
  $("sbg").classList.add("on");
}
