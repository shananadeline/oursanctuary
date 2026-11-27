// search.js - "Search everything" on the Home page
const DOT = "\u00A0· ";
const has = (q, ...parts) => parts.flat().filter((p) => p != null && p !== "").join(" ").toLowerCase().includes(q);
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// X holds the getters and helpers handed over by app.js.
export function searchAll(raw, X) {
  const q = (raw || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const g = X.get;
  const pets = g.pets();
  const petName = (id) => { const p = pets.find((x) => x.id === id); return p ? p.name : ""; };
  const groups = [];
  const add = (title, icon, items) => { if (items.length) groups.push({ title, icon, items }); };

  add("Tasks", "✅", g.tasks().filter((t) => has(q, t.title, t.note)).map((t) => ({ title: t.title, sub: [t.done ? "Done" : "Open", t.dueDate, X.nameByUid(t.assignee)].filter(Boolean).join(DOT), go: () => X.go("tasks") })));
  add("Events", "🗓️", g.events().filter((e) => has(q, e.title, e.location, e.note, e.type)).map((e) => ({ title: e.title, sub: [e.date, e.time, e.type].filter(Boolean).join(DOT), go: () => X.go("calendar") })));
  add("Bills", "🧾", g.bills().filter((b) => has(q, b.name, b.category, b.note)).map((b) => ({ title: b.name, sub: [b.paid ? "Paid" : "Unpaid", "Due " + b.dueDate, rm(b.amount)].join(DOT), go: () => X.go("bills") })));
  add("Expenses", "💸", g.expenses().filter((e) => has(q, e.description, e.category, e.note, e.petType)).map((e) => ({ title: e.description, sub: [e.category, e.date, rm(e.amount)].join(DOT), go: () => X.go("expenses") })));
  add("Income", "💼", g.income().filter((i) => has(q, i.source, i.category, i.note)).map((i) => ({ title: i.source, sub: [i.category, i.date, rm(i.amount)].join(DOT), go: () => X.go("expenses") })));
  add("Shopping list", "🛒", g.restock().filter((i) => has(q, i.name, i.brand, i.note, i.category)).map((i) => ({ title: i.name, sub: [i.category, i.bought ? "Bought" : "To buy"].join(DOT), go: () => X.go("restock") })));
  add("Pantry", "🥫", g.pantry().filter((i) => has(q, i.name, i.category, i.note, i.location)).map((i) => ({ title: i.name, sub: [i.category, i.quantity + " " + (i.unit || "")].join(DOT), go: () => X.go("pantry") })));
  add("Recipes", "🍳", g.recipes().filter((r) => has(q, r.name, r.notes, (r.ingredients || []).map((i) => i.name))).map((r) => ({ title: r.name, sub: r.category || "", go: () => X.go("recipes") })));
  add("Notes", "📝", g.notes().filter((n) => has(q, n.title, n.body, (n.items || []).map((i) => i.text))).map((n) => ({ title: n.title || "Untitled", sub: [n.category, n.archived ? "Archived" : ""].filter(Boolean).join(DOT), go: () => X.go("notes") })));
  add("Wishlist", "✨", g.wishes().filter((w) => has(q, w.title, w.note, w.category)).map((w) => ({ title: w.title, sub: [w.category, w.done ? "Done" : ""].filter(Boolean).join(DOT), go: () => X.go("wishlist") })));
  add("Savings goals", "🏦", g.goals().filter((s) => has(q, s.name, s.note)).map((s) => ({ title: s.name, sub: "Target " + rm(s.target), go: () => X.go("savings") })));
  add("Pets", "🐾", pets.filter((p) => has(q, p.name, p.breed, p.colour, p.notes, p.allergies, p.foodPrefs)).map((p) => ({ title: p.name, sub: [p.species, p.breed].filter(Boolean).join(DOT), go: () => X.openPet(p.id) })));
  add("Pet vet records", "🩺", [
    ...g.visits().filter((v) => has(q, v.reason, v.clinic, v.treatment, v.notes, v.vet)).map((v) => ({ title: petName(v.petId) + ": " + (v.reason || "Vet visit"), sub: [v.date, v.clinic].filter(Boolean).join(DOT), go: () => X.openPet(v.petId, "vet") })),
    ...g.vaccines().filter((v) => has(q, v.name, v.clinic, v.notes)).map((v) => ({ title: petName(v.petId) + ": " + v.name, sub: ["Vaccine", v.nextDue ? "Next " + v.nextDue : ""].filter(Boolean).join(DOT), go: () => X.openPet(v.petId, "vet") }))]);
  add("Pet food and supplies", "🥣", g.stock().filter((s) => has(q, s.brand, s.name, s.flavour, s.notes)).map((s) => ({ title: [s.brand, s.name].filter(Boolean).join(" "), sub: s.quantity + " " + (s.unit || ""), go: () => X.go("petstock") })));

  const nodes = [];
  groups.forEach((gr) => {
    const card = X.el("div", { class: "card" }, X.el("b", { text: gr.icon + " " + gr.title + " " + gr.items.length }));
    gr.items.slice(0, 5).forEach((it) => card.append(X.el("div", { class: "row", onclick: it.go },
      X.el("div", { class: "t" }, X.el("b", { text: it.title }), X.el("span", { class: "sub", text: it.sub })))));
    if (gr.items.length > 5) card.append(X.el("div", { class: "empty", text: "+" + (gr.items.length - 5) + " more. Open that section to see them all." }));
    nodes.push(card);
  });
  if (!nodes.length) nodes.push(X.el("div", { class: "card" }, X.el("div", { class: "empty", text: "Nothing found for \"" + raw.trim().slice(0, 40) + "\"." })));
  return nodes;
}
