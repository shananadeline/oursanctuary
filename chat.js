// chat.js - private chat between the two of us (Step 4)
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, doc, writeBatch, arrayUnion, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
// Fills the pop-up sheet and skips empty pieces (so the word "null" never shows).
const setSheet = (...n) => $("sheet").replaceChildren(...n.filter(Boolean));
const DOT = "\u00A0· ";
let C = null;          // things handed over by app.js
let msgs = [];
let isOpen = false;
let search = "";
let heartbeat = null;
const marking = new Set();

const tm = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
function dayLabel(ms) {
  const now = Date.now();
  if (dayKey(ms) === dayKey(now)) return "Today";
  if (dayKey(ms) === dayKey(now - 864e5)) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const msOf = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());

/* ---------- Start and stop ---------- */
export function startChat(ctx) {
  C = ctx;
  msgs = [];
  search = "";
  const q = query(collection(C.db, "messages"), orderBy("createdAt", "desc"), limit(200));
  const unsub = onSnapshot(q, (s) => {
    msgs = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).reverse();
    refreshChat();
    if (isOpen) { renderMsgs(false); markRead(); }
  });
  beat();
  heartbeat = setInterval(beat, 60000);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    unsub();
    clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", onVisible);
    onChatClose();
    C = null;
  };
}

function beat() {
  if (!C || document.visibilityState !== "visible") return;
  updateDoc(doc(C.db, "users", C.uid), { lastSeen: serverTimestamp() }).catch(() => {});
}
function onVisible() { beat(); markRead(); }

/* ---------- Open and close the chat page ---------- */
export function onChatOpen() {
  if (!C) return;
  isOpen = true;
  search = "";
  $("chatSearch").value = "";
  $("chatSearch").classList.add("hide");
  refreshChat();
  renderMsgs(true);
  markRead();
  fit();
}
export function onChatClose() {
  isOpen = false;
  const a = $("app");
  if (a) a.style.height = "";
}

// Keeps the message box above the phone keyboard.
function fit() {
  const vv = window.visualViewport;
  if (!isOpen || !vv) return;
  $("app").style.height = vv.height + "px";
  window.scrollTo(0, 0);
  const box = $("msgs");
  box.scrollTop = box.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fit);
  window.visualViewport.addEventListener("scroll", fit);
}

/* ---------- Header, preview and unread ---------- */
function unreadCount() {
  return msgs.filter((m) => m.sender !== C.uid && !(m.readBy || []).includes(C.uid)).length;
}

export function refreshChat() {
  if (!C) return;
  const p = C.partnerInfo();
  const last = msgs[msgs.length - 1];
  const unread = unreadCount();

  $("homeChatTitle").textContent = "Chat with " + p.name;
  $("homeChatAv").textContent = p.name.charAt(0).toUpperCase();
  $("homeChatText").textContent = last ? (last.sender === C.uid ? "You: " : "") + last.text : "Say hello 💜";
  $("homeChatBadge").textContent = unread;
  $("homeChatBadge").classList.toggle("hide", unread === 0);

  $("chatName").textContent = p.name;
  $("chatAv").textContent = p.name.charAt(0).toUpperCase();
  const seen = p.uid && C.users[p.uid] && C.users[p.uid].lastSeen;
  let status = "";
  if (seen && seen.toMillis) {
    const ms = seen.toMillis();
    status = Date.now() - ms < 120000 ? "Online" : "Last seen " + (dayKey(ms) === dayKey(Date.now()) ? "" : dayLabel(ms) + " ") + tm(ms);
  }
  $("chatStatus").textContent = status;

  const pinned = msgs.filter((m) => m.pinned);
  $("pinbar").classList.toggle("hide", pinned.length === 0);
  $("pinbar").textContent = "📌 " + pinned.length + " pinned message" + (pinned.length === 1 ? "" : "s");
}

/* ---------- Messages ---------- */
function renderMsgs(forceBottom) {
  const box = $("msgs");
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const list = search ? msgs.filter((m) => (m.text || "").toLowerCase().includes(search)) : msgs;
  const p = C.partnerInfo();
  const nodes = [];
  let lastDay = "";

  if (!list.length) nodes.push(C.el("div", { class: "empty", style: "text-align:center;margin-top:20px", text: search ? "No messages found." : "No messages yet. Say hello 💜" }));

  list.forEach((m) => {
    const ms = msOf(m.createdAt);
    const k = dayKey(ms);
    if (k !== lastDay) { nodes.push(C.el("div", { class: "day", text: dayLabel(ms) })); lastDay = k; }
    const mine = m.sender === C.uid;
    const bits = [];
    if (m.pinned) bits.push("📌");
    bits.push(tm(ms));
    if (m.editedAt) bits.push("edited");
    let meta = bits.join(DOT);
    if (mine) meta += (p.uid && (m.readBy || []).includes(p.uid)) ? " ✓✓" : " ✓";
    nodes.push(C.el("div", { class: "m " + (mine ? "me" : "you"), onclick: () => actions(m) },
      C.el("div", { text: m.text }), C.el("small", { text: meta })));
  });

  box.replaceChildren(...nodes);
  if (forceBottom || near) box.scrollTop = box.scrollHeight;
}

function markRead() {
  if (!C || !isOpen || document.visibilityState !== "visible") return;
  const un = msgs.filter((m) => m.sender !== C.uid && !(m.readBy || []).includes(C.uid) && !marking.has(m.id));
  if (!un.length) return;
  const b = writeBatch(C.db);
  un.slice(0, 400).forEach((m) => { marking.add(m.id); b.update(doc(C.db, "messages", m.id), { readBy: arrayUnion(C.uid) }); });
  b.commit().catch(() => un.forEach((m) => marking.delete(m.id)));
}

async function send() {
  if (!C) return;
  const input = $("mi");
  const text = input.value.trim().slice(0, 2000);
  if (!text) return;
  input.value = "";
  try {
    await addDoc(collection(C.db, "messages"), { text, sender: C.uid, createdAt: serverTimestamp(), readBy: [C.uid], pinned: false });
    $("msgs").scrollTop = $("msgs").scrollHeight;
  } catch (e) { input.value = text; C.toast("Could not send. Try again."); }
}

/* ---------- Tap a message: edit or pin ---------- */
function closeSheet() { $("sbg").classList.remove("on"); }

function actions(m) {
  const mine = m.sender === C.uid;
  const btns = [];
  if (mine) btns.push(C.el("button", { class: "btn", style: "width:100%;margin-top:8px", text: "Edit message", onclick: () => editSheet(m) }));
  btns.push(C.el("button", { class: "btn", style: "width:100%;margin-top:8px", text: m.pinned ? "Unpin message" : "Pin message", onclick: async () => {
    closeSheet();
    try { await updateDoc(doc(C.db, "messages", m.id), { pinned: !m.pinned }); } catch (e) { C.toast("Could not update. Try again."); }
  } }));
  btns.push(C.el("button", { class: "btn ghost", style: "width:100%;margin-top:8px", text: "Cancel", onclick: closeSheet }));
  setSheet(C.el("div", { class: "sub", text: C.nameByUid(m.sender) + DOT + tm(msOf(m.createdAt)) }),
    C.el("div", { style: "margin:6px 0 10px", text: m.text }), ...btns);
  $("sbg").classList.add("on");
}

function editSheet(m) {
  const ta = C.el("textarea", { maxlength: "2000" });
  ta.value = m.text;
  const save = C.el("button", { class: "btn", text: "Save", onclick: async () => {
    const text = ta.value.trim().slice(0, 2000);
    if (!text) { C.toast("Message cannot be empty"); return; }
    try { await updateDoc(doc(C.db, "messages", m.id), { text, editedAt: serverTimestamp() }); closeSheet(); C.toast("Message edited ✓"); }
    catch (e) { C.toast("Could not save. Try again."); }
  } });
  setSheet(C.el("h2", { style: "font-size:24px", text: "Edit message" }), ta,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Cancel", onclick: closeSheet }), save));
}

function pinnedSheet() {
  const pinned = msgs.filter((m) => m.pinned);
  const rows = pinned.map((m) => C.el("div", { class: "row" },
    C.el("div", { class: "t" }, C.el("b", { text: m.text }), C.el("span", { class: "sub", text: C.nameByUid(m.sender) + DOT + dayLabel(msOf(m.createdAt)) })),
    C.el("button", { class: "tag", text: "Unpin", onclick: async () => {
      try { await updateDoc(doc(C.db, "messages", m.id), { pinned: false }); closeSheet(); } catch (e) { C.toast("Could not update. Try again."); }
    } })));
  setSheet(C.el("h2", { style: "font-size:24px", text: "Pinned messages" }), ...rows,
    C.el("div", { class: "acts" }, C.el("button", { class: "btn ghost", text: "Close", onclick: closeSheet })));
  $("sbg").classList.add("on");
}

/* ---------- Buttons on the chat page ---------- */
$("send").addEventListener("click", send);
$("mi").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
$("pinbar").addEventListener("click", () => { if (C) pinnedSheet(); });
$("homeChat").addEventListener("click", () => { if (C) C.go("chat"); });
$("chatBack").addEventListener("click", () => { if (C) C.go("home"); });
$("chatSearchBtn").addEventListener("click", () => {
  const s = $("chatSearch");
  s.classList.toggle("hide");
  if (s.classList.contains("hide")) { s.value = ""; search = ""; renderMsgs(true); }
  else s.focus();
});
$("chatSearch").addEventListener("input", (e) => { search = e.target.value.trim().toLowerCase(); if (C) renderMsgs(false); });
