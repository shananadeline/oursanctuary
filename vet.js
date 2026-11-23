// vet.js - vet visits, vaccinations and preventive care (Phase 4, Step 3)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const CARE = [["deworming", "Deworming", "🪱"], ["flea", "Flea and tick", "🦟"], ["grooming", "Grooming", "✂️"], ["other", "Other care", "🩹"]];
const EVERY = [["0", "No regular repeat"], ["1", "Every month"], ["2", "Every 2 months"], ["3", "Every 3 months"], ["6", "Every 6 months"], ["12", "Every year"]];
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const careInfo = (k) => CARE.find((c) => c[0] === k) || CARE[3];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };

let C = null;
let visits = [], vaccines = [], cares = [];

function addMonths(iso, n) {
  const d = C.dates.parseIso(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return C.dates.isoOf(d);
}
const petOf = (id) => C.getPets().find((p) => p.id === id);
const pname = (id) => (petOf(id) || {}).name || "Pet";
const today = () => C.dates.todayIso();

/* ---------- Start ---------- */
export function startVet(ctx) {
  C = ctx;
  visits = []; vaccines = []; cares = [];
  const subs = [
    onSnapshot(collection(C.db, "vetvisits"), (s) => { visits = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "vaccines"), (s) => { vaccines = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); }),
    onSnapshot(collection(C.db, "precare"), (s) => { cares = s.docs.map((d) => ({ id: d.id, ...d.data() })); changed(); })
  ];
  return () => { subs.forEach((u) => u()); C = null; };
}
function changed() { if (C && C.afterChange) C.afterChange(); }
export const getVisits = () => visits;

/* ---------- What's coming up (used on the Pets page and Home) ---------- */
export function upcomingPetItems(limit) {
  if (!C) return [];
  const t = today();
  const items = [];
  visits.forEach((v) => {
    if (v.date >= t) items.push({ date: v.date, petId: v.petId, label: (v.reason || "Vet visit"), icon: "🩺" });
    if (v.followUpDate && v.followUpDate >= t) items.push({ date: v.followUpDate, petId: v.petId, label: "Follow-up visit", icon: "🩺" });
  });
  vaccines.forEach((v) => { if (v.nextDue) items.push({ date: v.nextDue, petId: v.petId, label: v.name + " due", icon: "💉" }); });
  cares.forEach((c) => { if (c.nextDue) items.push({ date: c.nextDue, petId: c.petId, label: (c.name || careInfo(c.kind)[1]) + " due", icon: careInfo(c.kind)[2] }); });
  return items.filter((i) => petOf(i.petId) && (petOf(i.petId).status || "active") !== "archived")
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit || 20);
}
function dueTag(iso) {
  const d = C.dates.daysBetween(today(), iso);
  if (d < 0) return C.el("span", { class: "tag e", text: "Overdue" });
  if (d <= 14) return C.el("span", { class: "tag w", text: d === 0 ? "Today" : "In " + d + (d === 1 ? " day" : " days") });
  return null;
}

/* ---------- Calendar link (keeps one event per record, no duplicates) ---------- */
async function sync(eventId, data) {
  if (!data) { if (eventId) { try { await deleteDoc(doc(C.db, "events", eventId)); } catch (e) {} } return ""; }
  const full = { ...data, repeatYearly: false, source: "vet", updatedAt: serverTimestamp() };
  if (eventId) { try { await updateDoc(doc(C.db, "events", eventId), full); return eventId; } catch (e) { /* it was deleted, so make a new one */ } }
  const ref = await addDoc(collection(C.db, "events"), { ...full, createdBy: C.uid, createdAt: serverTimestamp() });
  return ref.id;
}

/* ---------- Vet tab for one pet (used by pets.js) ---------- */
export function vetTab(p) {
  if (!C) return [];
  const t = today();
  const pv = visits.filter((v) => v.petId === p.id);
  const upcoming = pv.filter((v) => v.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = pv.filter((v) => v.date < t).sort((a, b) => b.date.localeCompare(a.date));
  const out = [];

  // Appointments
  const ac = C.el("div", { class: "card" }, C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Vet visits" }),
    C.el("button", { class: "tag", text: "+ Add visit", onclick: () => visitSheet(p) })));
  if (!upcoming.length && !past.length) ac.append(C.el("div", { class: "empty", text: "No visits recorded yet." }));
  if (upcoming.length) ac.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "Upcoming" }));
  upcoming.forEach((v) => ac.append(visitRow(p, v)));
  if (past.length) ac.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "History" }));
  past.slice(0, 8).forEach((v) => ac.append(visitRow(p, v)));
  const total = pv.reduce((s, v) => s + (Number(v.fee) || 0), 0);
  if (total) ac.append(C.el("div", { class: "sub", style: "margin-top:8px", text: "Total consultation fees recorded: " + rm(total) }));
  out.push(ac);

  // Vaccinations
  const vc = C.el("div", { class: "card" }, C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Vaccinations" }),
    C.el("button", { class: "tag", text: "+ Add vaccine", onclick: () => vaccineSheet(p) })));
  const pvx = vaccines.filter((v) => v.petId === p.id).sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"));
  if (!pvx.length) vc.append(C.el("div", { class: "empty", text: "No vaccinations recorded yet." }));
  pvx.forEach((v) => { const r = C.el("div", { class: "row" }, C.el("div", { class: "ic", text: "💉" }),
    C.el("div", { class: "t", onclick: () => vaccineSheet(p, v) }, C.el("b", { text: v.name }),
      C.el("span", { class: "sub", text: [v.date ? "Given " + C.dates.shortDate(v.date) : "", v.nextDue ? "Next due " + C.dates.shortDate(v.nextDue) : "", v.clinic].filter(Boolean).join(DOT) })));
    if (v.nextDue) { const tg = dueTag(v.nextDue); if (tg) r.append(tg); }
    vc.append(r); });
  out.push(vc);

  // Preventive care
  const cc = C.el("div", { class: "card" }, C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, C.el("b", { text: "Preventive care" }),
    C.el("button", { class: "tag", text: "+ Add care", onclick: () => careSheet(p) })));
  const pc = cares.filter((c) => c.petId === p.id).sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"));
  if (!pc.length) cc.append(C.el("div", { class: "empty", text: "Deworming, flea and tick, grooming and other regular care go here." }));
  pc.forEach((c) => { const r = C.el("div", { class: "row" }, C.el("div", { class: "ic", text: careInfo(c.kind)[2] }),
    C.el("div", { class: "t", onclick: () => careSheet(p, c) }, C.el("b", { text: c.name || careInfo(c.kind)[1] }),
      C.el("span", { class: "sub", text: [c.lastDate ? "Last " + C.dates.shortDate(c.lastDate) : "", c.nextDue ? "Next " + C.dates.shortDate(c.nextDue) : ""].filter(Boolean).join(DOT) || "No dates yet" })));
    if (c.nextDue) { const tg = dueTag(c.nextDue); if (tg) r.append(tg); }
    r.append(C.el("button", { class: "tag", text: "Done", onclick: () => markDone(p, c) }));
    cc.append(r); });
  out.push(cc);

  out.push(C.el("div", { class: "card" }, C.el("b", { text: "Confirm with your clinic" }),
    C.el("div", { class: "sub", text: "Vaccination and preventive-care schedules differ between pets. Ask your vet to confirm the right timing, and edit any due date here." }),
    C.el("button", { class: "btn", style: "margin-top:10px", text: "Remind us to ask the clinic", onclick: () => clinicReminder(p) })));
  out.push(C.el("div", { class: "sub", style: "margin:0 4px 12px", text: "This app keeps records and reminders only. It doesn't give medical advice." }));
  return out;
}

function visitRow(p, v) {
  const r = C.el("div", { class: "row" }, C.el("div", { class: "ic", text: "🩺" }),
    C.el("div", { class: "t", onclick: () => visitSheet(p, v) }, C.el("b", { text: v.reason || "Vet visit" }),
      C.el("span", { class: "sub", text: [C.dates.shortDate(v.date), v.clinic, v.fee ? rm(v.fee) : ""].filter(Boolean).join(DOT) })));
  if (v.date >= today()) { const tg = dueTag(v.date); if (tg) r.append(tg); }
  return r;
}

async function markDone(p, c) {
  const t = today();
  const months = Number(c.everyMonths) || 0;
  if (!months) { careSheet(p, { ...c, lastDate: t, nextDue: "" }, true); return; }
  try {
    const nextDue = addMonths(t, months);
    const eventId = await sync(c.eventId, { title: p.name + ": " + (c.name || careInfo(c.kind)[1]) + " due", type: "Other", date: nextDue, time: "", location: "", note: "Preventive care reminder", remind: "1w" });
    await updateDoc(doc(C.db, "precare", c.id), { lastDate: t, nextDue, eventId, updatedAt: serverTimestamp() });
    C.toast("Marked done. Next: " + C.dates.shortDate(nextDue) + " ✓");
  } catch (e) { C.toast("Could not update. Try again."); }
}

/* ---------- Sheets ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}
const people = () => { const pr = C.partnerInfo(); const l = [[C.uid, C.nameByUid(C.uid)]]; if (pr.uid) l.push([pr.uid, pr.name]); return l; };

function visitSheet(p, v) {
  const isNew = !v;
  const date = C.el("input", { type: "date" });
  const time = C.el("input", { type: "time" });
  const clinic = C.el("input", { type: "text", maxlength: "80", placeholder: "Clinic name" });
  const reason = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Check-up" });
  const vet = C.el("input", { type: "text", maxlength: "60", placeholder: "Optional" });
  const fee = C.el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Optional, in RM" });
  const treat = C.el("textarea", { maxlength: "500", placeholder: "Write what your vet prescribed or advised" });
  const follow = C.el("input", { type: "date" });
  const who = select(people(), isNew ? C.uid : v.attendedBy || C.uid);
  const notes = C.el("textarea", { maxlength: "500", placeholder: "Optional" });
  const addExp = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
  addExp.checked = isNew || !v.expenseId;
  date.value = isNew ? today() : v.date;
  if (!isNew) { time.value = v.time || ""; clinic.value = v.clinic || ""; reason.value = v.reason || ""; vet.value = v.vet || ""; fee.value = v.fee == null ? "" : v.fee; treat.value = v.treatment || ""; follow.value = v.followUpDate || ""; notes.value = v.notes || ""; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    if (!date.value) { C.toast("Please choose the date"); return; }
    const f = num(fee.value);
    const data = { petId: p.id, date: date.value, time: time.value || "", clinic: clinic.value.trim(), reason: reason.value.trim(), vet: vet.value.trim(), fee: f,
      treatment: treat.value.trim(), followUpDate: follow.value || "", attendedBy: who.value, notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      const title = p.name + ": " + (data.reason || "Vet visit");
      data.eventId = await sync(v && v.eventId, data.date >= today() ? { title, type: "Veterinary appointment", date: data.date, time: data.time, location: data.clinic, note: data.reason, remind: "1d" } : null);
      data.followEventId = await sync(v && v.followEventId, data.followUpDate && data.followUpDate >= today() ? { title: p.name + ": follow-up visit", type: "Veterinary appointment", date: data.followUpDate, time: "", location: data.clinic, note: "Follow-up from " + data.date, remind: "1d" } : null);
      // Consultation fee in Expenses (one record, kept in step)
      let expenseId = (v && v.expenseId) || "";
      const exp = { amount: f || 0, description: "Vet: " + (data.reason || "visit") + " (" + p.name + ")", category: "Veterinary", date: data.date, paidBy: who.value, petId: p.id, note: data.clinic, updatedAt: serverTimestamp() };
      if (f && addExp.checked) {
        if (expenseId) { try { await updateDoc(doc(C.db, "expenses", expenseId), exp); } catch (e) { expenseId = ""; } }
        if (!expenseId) expenseId = (await addDoc(collection(C.db, "expenses"), { ...exp, linkedVet: true, createdBy: C.uid, createdAt: serverTimestamp() })).id;
      } else if (expenseId && !f) { try { await deleteDoc(doc(C.db, "expenses", expenseId)); } catch (e) {} expenseId = ""; }
      data.expenseId = expenseId;
      if (isNew) await addDoc(collection(C.db, "vetvisits"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("petcare", C.nameByUid(C.uid) + " added a vet visit for " + p.name, data.reason || "Vet visit"); });
      else await updateDoc(doc(C.db, "vetvisits", v.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete visit", onclick: async () => {
    if (!window.confirm("Delete this visit" + (v.expenseId ? ", its reminders and the linked expense" : " and its reminders") + "? This cannot be undone.")) return;
    try {
      await sync(v.eventId, null); await sync(v.followEventId, null);
      if (v.expenseId) { try { await deleteDoc(doc(C.db, "expenses", v.expenseId)); } catch (e) {} }
      await deleteDoc(doc(C.db, "vetvisits", v.id)); closeSheet(); C.toast("Visit deleted");
    } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · vet visit" }),
    ...field("Date", date), ...field("Time (optional)", time), ...field("Clinic", clinic), ...field("Reason for visit", reason), ...field("Veterinarian", vet),
    ...field("Consultation fee in RM", fee), ...field("Medication or treatment prescribed", treat), ...field("Follow-up date", follow), ...field("Who took them", who), ...field("Notes", notes),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--tx);font-size:15px" }, addExp, C.el("span", { text: "Also record the fee in Expenses" })),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Future visits and follow-ups are added to your Calendar with a reminder. Enter treatment details exactly as your vet gave them." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function vaccineSheet(p, v) {
  const isNew = !v;
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "e.g. F3 core vaccine" });
  const date = C.el("input", { type: "date" });
  const next = C.el("input", { type: "date" });
  const clinic = C.el("input", { type: "text", maxlength: "80", placeholder: "Optional" });
  const notes = C.el("textarea", { maxlength: "300", placeholder: "Optional" });
  date.value = isNew ? today() : v.date || "";
  if (!isNew) { name.value = v.name; next.value = v.nextDue || ""; clinic.value = v.clinic || ""; notes.value = v.notes || ""; }
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const nm = name.value.trim();
    if (!nm) { C.toast("Please type the vaccine name"); return; }
    const data = { petId: p.id, name: nm, date: date.value || "", nextDue: next.value || "", clinic: clinic.value.trim(), notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      data.eventId = await sync(v && v.eventId, data.nextDue ? { title: p.name + ": " + nm + " due", type: "Vaccination", date: data.nextDue, time: "", location: data.clinic, note: "Confirm timing with the clinic", remind: "1w" } : null);
      if (isNew) await addDoc(collection(C.db, "vaccines"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() }).then(() => { if (C.notify) C.notify("petcare", C.nameByUid(C.uid) + " added a vaccination for " + p.name, nm); });
      else await updateDoc(doc(C.db, "vaccines", v.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete record", onclick: async () => {
    if (!window.confirm("Delete this vaccination record and its reminder?")) return;
    try { await sync(v.eventId, null); await deleteDoc(doc(C.db, "vaccines", v.id)); closeSheet(); } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · vaccination" }), ...field("Vaccine name", name), ...field("Date given", date), ...field("Next due date", next),
    ...field("Clinic", clinic), ...field("Notes", notes),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Please confirm the next due date with your clinic. You can change it any time." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function careSheet(p, c, fromDone) {
  const isNew = !c || !c.id;
  const kind = select(CARE.map((x) => [x[0], x[2] + " " + x[1]]), c ? c.kind || "deworming" : "deworming");
  const name = C.el("input", { type: "text", maxlength: "60", placeholder: "Optional, e.g. product name" });
  const last = C.el("input", { type: "date" });
  const every = select(EVERY, c ? String(c.everyMonths || 0) : "0");
  const next = C.el("input", { type: "date" });
  const notes = C.el("textarea", { maxlength: "300", placeholder: "Optional" });
  if (c) { name.value = c.name || ""; last.value = c.lastDate || ""; next.value = c.nextDue || ""; notes.value = c.notes || ""; }
  const fill = () => { if (last.value && Number(every.value) && !next.value) next.value = addMonths(last.value, Number(every.value)); };
  every.addEventListener("change", () => { if (last.value && Number(every.value)) next.value = addMonths(last.value, Number(every.value)); });
  last.addEventListener("change", () => { if (Number(every.value) && last.value) next.value = addMonths(last.value, Number(every.value)); });
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    fill();
    const label = name.value.trim() || careInfo(kind.value)[1];
    const data = { petId: p.id, kind: kind.value, name: name.value.trim(), lastDate: last.value || "", everyMonths: Number(every.value) || 0, nextDue: next.value || "", notes: notes.value.trim(), updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      data.eventId = await sync(c && c.eventId, data.nextDue ? { title: p.name + ": " + label + " due", type: "Other", date: data.nextDue, time: "", location: "", note: "Preventive care reminder", remind: "1w" } : null);
      if (isNew) await addDoc(collection(C.db, "precare"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "precare", c.id), data);
      closeSheet(); C.toast("Saved ✓");
    } catch (e) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });
  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete record", onclick: async () => {
    if (!window.confirm("Delete this care record and its reminder?")) return;
    try { await sync(c.eventId, null); await deleteDoc(doc(C.db, "precare", c.id)); closeSheet(); } catch (e) { C.toast("Could not delete. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: p.name + " · preventive care" }),
    fromDone ? C.el("div", { class: "sub", text: "Set when it's due next, then save." }) : null,
    ...field("Type", kind), ...field("Label", name), ...field("Last done", last), ...field("Repeats", every), ...field("Next due", next), ...field("Notes", notes),
    C.el("div", { class: "sub", style: "margin-top:8px", text: "Please confirm the right schedule with your clinic. Any due date can be changed." }),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}

function clinicReminder(p) {
  const date = C.el("input", { type: "date" });
  const d = C.dates.parseIso(today()); d.setDate(d.getDate() + 7);
  date.value = C.dates.isoOf(d);
  const save = C.el("button", { class: "btn", text: "Add to Calendar", onclick: async () => {
    if (!date.value) { C.toast("Please choose a date"); return; }
    try {
      await addDoc(collection(C.db, "events"), { title: "Ask the clinic: " + p.name + "'s vaccination and preventive-care schedule", type: "Veterinary appointment", date: date.value, time: "", location: "", note: "Confirm vaccine and preventive-care timing with the vet.", remind: "atTime", repeatYearly: false, source: "vet", createdBy: C.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      closeSheet(); C.toast("Reminder added ✓");
    } catch (e) { C.toast("Could not save. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Remind us to ask the clinic" }), C.el("div", { class: "sub", text: "Adds a Calendar reminder for both of you." }), ...field("Remind us on", date),
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
  $("sbg").classList.add("on");
}

export const getVaccines = () => vaccines;
