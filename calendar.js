// calendar.js - shared calendar and events (Step 12)
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, arrayUnion, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
const TYPES = [["Birthday", "🎂"], ["Anniversary", "💜"], ["Appointment", "🗓️"], ["Travel", "✈️"], ["Family event", "👨‍👩‍👧"],
  ["Veterinary appointment", "🐾"], ["Vaccination", "💉"], ["Insurance renewal", "🛡️"], ["Other", "✨"]];
const REMIND = [["none", "No reminder"], ["atTime", "At the time (9 am for all-day events)"], ["1h", "1 hour before"], ["1d", "1 day before"], ["2d", "2 days before"], ["1w", "1 week before"]];
const iconOf = (t) => (TYPES.find((x) => x[0] === t) || TYPES[8])[1];

let C = null;
let events = [];
let month = "";   // YYYY-MM
let selected = ""; // YYYY-MM-DD

const timeText = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }); };
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
function shiftMonth(ym, d) { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); }

// Events on a given day, including yearly repeats.
function eventsOn(iso) {
  return events.filter((e) => e.date === iso || (e.repeatYearly && e.date.slice(5) === iso.slice(5) && e.date.slice(0, 4) <= iso.slice(0, 4)))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}
// Next date an event happens, from today onwards.
function nextDate(e) {
  const t = C.dates.todayIso();
  if (!e.repeatYearly) return e.date >= t ? e.date : null;
  const y = Number(t.slice(0, 4));
  let c = y + e.date.slice(4);
  if (c < t) c = (y + 1) + e.date.slice(4);
  return c >= e.date ? c : e.date;
}
function upcoming(limit) {
  return events.map((e) => ({ e, d: nextDate(e) })).filter((x) => x.d).sort((a, b) => a.d.localeCompare(b.d) || (a.e.time || "").localeCompare(b.e.time || "")).slice(0, limit);
}
function inDays(iso) {
  const n = C.dates.daysBetween(C.dates.todayIso(), iso);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days";
}

/* ---------- Start ---------- */
export function startCalendar(ctx) {
  C = ctx;
  events = [];
  month = C.dates.todayIso().slice(0, 7);
  selected = C.dates.todayIso();
  const unsub = onSnapshot(collection(C.db, "events"), (s) => { events = s.docs.map((d) => ({ id: d.id, ...d.data() })); refreshCalendar(); });
  return () => { unsub(); C = null; };
}
export function onCalendarOpen() { if (C) { month = C.dates.todayIso().slice(0, 7); selected = C.dates.todayIso(); refreshCalendar(); } }
export const newEventOnSelected = () => sheet(null, { date: selected });

/* ---------- Screen ---------- */
function eventRow(e, dateIso, showDate) {
  return C.el("div", { class: "row", onclick: () => sheet(e) },
    C.el("div", { class: "ic", text: iconOf(e.type) }),
    C.el("div", { class: "t" }, C.el("b", { text: e.title }),
      C.el("span", { class: "sub", text: [showDate ? inDays(dateIso) + " (" + C.dates.shortDate(dateIso) + ")" : "", e.time ? timeText(e.time) : showDate ? "" : "All day", e.location, e.type].filter(Boolean).join(DOT) })));
}

export function refreshCalendar() {
  if (!C) return;
  renderHome();
  if (!$("calendar").classList.contains("on")) return;
  const today = C.dates.todayIso();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();

  const head = C.el("div", { class: "top", style: "margin-bottom:8px" },
    C.el("button", { class: "round", text: "‹", "aria-label": "Previous month", onclick: () => { month = shiftMonth(month, -1); refreshCalendar(); } }),
    C.el("b", { text: monthLabel(month) }),
    C.el("button", { class: "round", text: "›", "aria-label": "Next month", onclick: () => { month = shiftMonth(month, 1); refreshCalendar(); } }));

  const cells = ["M", "T", "W", "T", "F", "S", "S"].map((d) => C.el("div", { class: "h", text: d }));
  for (let i = 0; i < offset; i++) cells.push(C.el("div"));
  for (let d = 1; d <= days; d++) {
    const iso = month + "-" + String(d).padStart(2, "0");
    const cls = [iso === today ? "today" : "", eventsOn(iso).length ? "ev" : "", iso === selected ? "sel" : ""].filter(Boolean).join(" ");
    cells.push(C.el("button", { class: cls, text: String(d), onclick: () => { selected = iso; refreshCalendar(); } }));
  }
  const grid = C.el("div", { class: "card" }, C.el("div", { class: "cal" }, cells));

  const dayList = eventsOn(selected);
  const dayCard = C.el("div", { class: "card" },
    C.el("div", { style: "display:flex;justify-content:space-between;align-items:center" },
      C.el("b", { text: (selected === today ? "Today" : C.dates.shortDate(selected)) }),
      C.el("button", { class: "tag", text: "+ Add here", onclick: () => sheet(null, { date: selected }) })));
  if (!dayList.length) dayCard.append(C.el("div", { class: "empty", text: "No events on this day." }));
  dayList.forEach((e) => dayCard.append(eventRow(e, selected, false)));

  const up = upcoming(8);
  const upCard = C.el("div", { class: "card" }, C.el("b", { text: "Coming up" }));
  if (!up.length) upCard.append(C.el("div", { class: "empty", text: "No upcoming events. Tap + New event." }));
  up.forEach((x) => upCard.append(eventRow(x.e, x.d, true)));

  $("calBody").replaceChildren(head, grid, dayCard, upCard);
}

// Home page: what's happening soon.
function renderHome() {
  const box = $("homeEvents");
  if (!box) return;
  const up = upcoming(4);
  box.replaceChildren();
  if (!up.length) box.append(C.el("div", { class: "empty", text: "No upcoming events." }));
  up.forEach((x) => box.append(eventRow(x.e, x.d, true)));
}

/* ---------- Google Calendar link ---------- */
function gcalUrl(e) {
  const d = e.date.replace(/-/g, "");
  let dates;
  if (e.time) {
    const [h, mi] = e.time.split(":").map(Number);
    const [y, mo, da] = e.date.split("-").map(Number);
    const end = new Date(y, mo - 1, da, h + 1, mi);
    const f = (x) => x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0") + String(x.getDate()).padStart(2, "0") + "T" + String(x.getHours()).padStart(2, "0") + String(x.getMinutes()).padStart(2, "0") + "00";
    dates = d + "T" + e.time.replace(":", "") + "00/" + f(end);
  } else {
    const next = C.dates.parseIso(e.date); next.setDate(next.getDate() + 1);
    dates = d + "/" + C.dates.isoOf(next).replace(/-/g, "");
  }
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details: e.note || "", location: e.location || "" });
  try { p.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (err) {}
  if (e.repeatYearly) p.set("recur", "RRULE:YEARLY");
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

/* ---------- Add / edit ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }
const field = (label, input) => [C.el("label", { text: label }), input];
function select(options, value) {
  const s = C.el("select", {}, options.map(([v, l]) => C.el("option", { value: v, text: l })));
  s.value = value;
  return s;
}

export function sheet(e, preset) {
  if (!C) return;
  const isNew = !e;
  const p = preset || {};
  const title = C.el("input", { type: "text", maxlength: "100", placeholder: "e.g. Dentist" });
  const type = select(TYPES.map((t) => [t[0], t[1] + " " + t[0]]), isNew ? p.type || "Appointment" : e.type);
  const date = C.el("input", { type: "date" });
  const time = C.el("input", { type: "time" });
  const loc = C.el("input", { type: "text", maxlength: "120", placeholder: "Optional" });
  const note = C.el("textarea", { maxlength: "500", placeholder: "Optional note" });
  const remind = select(REMIND, isNew ? p.remind || "1d" : e.remind || "none");
  const yearly = C.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0" });
  if (isNew) { title.value = p.title || ""; date.value = p.date || C.dates.todayIso(); yearly.checked = !!p.repeatYearly; }
  else { title.value = e.title; date.value = e.date; time.value = e.time || ""; loc.value = e.location || ""; note.value = e.note || ""; yearly.checked = !!e.repeatYearly; }

  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const t = title.value.trim();
    if (!t) { C.toast("Please type a title"); return; }
    if (!date.value) { C.toast("Please choose a date"); return; }
    const data = { title: t, type: type.value, date: date.value, time: time.value || "", location: loc.value.trim(), note: note.value.trim(),
      remind: remind.value, repeatYearly: yearly.checked, updatedAt: serverTimestamp() };
    save.disabled = true;
    try {
      if (isNew) await addDoc(collection(C.db, "events"), { ...data, createdBy: C.uid, createdAt: serverTimestamp() });
      else await updateDoc(doc(C.db, "events", e.id), data);
      selected = date.value; month = date.value.slice(0, 7);
      closeSheet();
      C.toast("Saved ✓");
    } catch (err) { C.toast("Could not save. Try again."); save.disabled = false; }
  } });

  let gbtn = null;
  if (!isNew) {
    const done = (e.googleAddedBy || []).includes(C.uid);
    gbtn = C.el("button", { class: "btn ghost", style: "width:100%;margin-top:12px", text: done ? "Added to your Google Calendar ✓" : "Add to Google Calendar", onclick: async () => {
      if (done && !window.confirm("You already added this. Adding it again may create a duplicate. Continue?")) return;
      window.open(gcalUrl(e), "_blank", "noopener,noreferrer");
      try { await updateDoc(doc(C.db, "events", e.id), { googleAddedBy: arrayUnion(C.uid) }); } catch (err) {}
      closeSheet();
    } });
  }

  const remove = isNew ? null : C.el("button", { class: "btn ghost del", style: "margin-top:10px;width:100%", text: "Delete event", onclick: async () => {
    if (!window.confirm("Delete this event for both of you? This cannot be undone.")) return;
    try { await deleteDoc(doc(C.db, "events", e.id)); closeSheet(); C.toast("Event deleted"); }
    catch (err) { C.toast("Could not delete. Try again."); }
  } });

  setSheet(C.el("h2", { style: "font-size:24px", text: isNew ? "New event" : "Edit event" }),
    ...field("Title", title), ...field("Type", type), ...field("Date", date), ...field("Time (leave empty for all day)", time),
    ...field("Location", loc), ...field("Note", note), ...field("Reminder", remind),
    C.el("label", { style: "display:flex;gap:10px;align-items:center;margin-top:14px" }, yearly, C.el("span", { text: "Repeats every year" })),
    gbtn,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save), remove);
  $("sbg").classList.add("on");
}
