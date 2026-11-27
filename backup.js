// backup.js - download a copy of everything we've saved together
import { collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const COLLECTIONS = ["tasks", "bills", "expenses", "income", "incomeplans", "restock", "recipes", "mealplans", "savedPlans", "pantry", "events", "wishes", "goals", "contributions", "notes",
  "pets", "petlogs", "petstock", "petpurchases", "petfeeds", "vetvisits", "vaccines", "precare", "inspolicies", "insclaims", "inspayments"];

// Turns database dates into plain text dates, and leaves out the tiny profile pictures.
function clean(v, key) {
  if (key === "photo") return undefined;
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map((x) => clean(x));
  if (v && typeof v === "object") {
    const o = {};
    Object.entries(v).forEach(([k, x]) => { const c = clean(x, k); if (c !== undefined) o[k] = c; });
    return o;
  }
  return v;
}

export function renderBackup(X) {
  const box = $("backupBody");
  if (!box) return;
  let last = "";
  try { last = localStorage.getItem("lastBackup") || ""; } catch (e) {}
  const chat = X.el("input", { type: "checkbox", style: "width:22px;height:22px;padding:0;margin:0;flex:none" });
  const btn = X.el("button", { class: "btn", text: "Download a backup", onclick: async () => {
    btn.disabled = true;
    X.toast("Gathering everything…");
    try {
      const out = { app: "Our Sanctuary", version: 1, exportedAt: new Date().toISOString(), exportedBy: X.nameByUid(X.uid()), collections: {} };
      for (const name of COLLECTIONS) {
        const snap = await getDocs(collection(X.db, name));
        out.collections[name] = snap.docs.map((d) => ({ id: d.id, ...clean(d.data()) }));
      }
      const settings = await getDoc(doc(X.db, "shared", "settings"));
      out.collections.settings = settings.exists() ? [{ id: "settings", ...clean(settings.data()) }] : [];
      const users = await getDocs(collection(X.db, "users"));
      out.collections.profiles = users.docs.map((d) => { const u = clean(d.data()); return { id: d.id, name: u.name, email: u.email }; });
      if (chat.checked) {
        const m = await getDocs(collection(X.db, "messages"));
        out.collections.messages = m.docs.map((d) => ({ id: d.id, ...clean(d.data()) }));
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date();
      a.href = url;
      a.download = "our-sanctuary-backup-" + today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + ".json";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      try { localStorage.setItem("lastBackup", today.toISOString()); } catch (e) {}
      X.toast("Backup downloaded ✓");
      renderBackup(X);
    } catch (e) { X.toast("Could not make the backup. Try again."); }
    btn.disabled = false;
  } });
  const item = (t) => X.el("div", { class: "sub", text: t });
  box.replaceChildren(
    X.el("div", { class: "sub", style: "margin:6px 0 10px", text: last ? "Last backup from this device: " + new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No backup made from this device yet." }),
    X.el("label", { style: "display:flex;gap:10px;align-items:center;margin:8px 0;color:var(--tx);font-size:15px" }, chat, X.el("span", { text: "Also include our chat messages" })),
    btn,
    X.el("b", { style: "display:block;margin-top:16px;font-size:14px", text: "What's in the backup" }),
    item("Tasks, bills, expenses, shopping list, recipes, meal plans, pantry, calendar events, wishlist, savings goals and contributions, notes."),
    item("Pets: profiles, weights and care notes, food and supplies, purchases, meal logs, vet visits, vaccinations, preventive care, insurance policies, claims and premiums."),
    item("Your names, emails and shared settings such as the relationship date and budgets."),
    X.el("b", { style: "display:block;margin-top:12px;font-size:14px", text: "What's not in it" }),
    item("Profile photos. They're tiny pictures kept in the app, and aren't part of the file."),
    item("Photos of any other kind. The app doesn't store them."),
    item("Your Google accounts and passwords, which Google keeps. Alert settings for each phone aren't included either."),
    X.el("div", { class: "sub", style: "margin-top:10px", text: "The file is plain text and holds private information. Keep it somewhere safe, and don't share it. There's no restore button yet, so it's a safe copy to keep. I can build a restore tool later if you want one." })
  );
}
