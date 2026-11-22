// app.js - login and profile (Step 1)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, PEOPLE } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

function show(which) {
  for (const id of ["loading", "login"]) $(id).classList.toggle("on", id === which);
  $("main").classList.toggle("on", which === "main");
}

function findPerson(email) {
  return PEOPLE.find((p) => p.email === (email || "").toLowerCase());
}

$("signin").addEventListener("click", async () => {
  $("err").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") {
      $("err").textContent = "Sign-in did not finish. Please try again.";
    }
  }
});

$("signout").addEventListener("click", () => signOut(auth));

let stopPartnerWatch = null;

onAuthStateChanged(auth, async (user) => {
  if (stopPartnerWatch) { stopPartnerWatch(); stopPartnerWatch = null; }

  if (!user) { show("login"); return; }

  // Only our two verified Google accounts may continue.
  const person = findPerson(user.email);
  if (!person || !user.emailVerified) {
    await signOut(auth);
    $("err").textContent = "This account is not allowed in this app.";
    show("login");
    return;
  }

  try {
    // Create our profile the first time we sign in.
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: person.defaultName,
        email: user.email.toLowerCase(),
        createdAt: serverTimestamp()
      });
    }
    const name = (snap.exists() && snap.data().name) || person.defaultName;

    $("hello").textContent = "Hello, " + name;
    $("me").textContent = name.charAt(0).toUpperCase();
    $("email").textContent = user.email;

    // Show whether our partner has signed in yet.
    const partner = PEOPLE.find((p) => p.email !== person.email);
    stopPartnerWatch = onSnapshot(collection(db, "users"), (snapshot) => {
      const found = snapshot.docs.map((d) => d.data()).find((d) => d.email === partner.email);
      $("partner").textContent = found
        ? found.name + " has signed in ✓"
        : "Waiting for " + partner.defaultName + " to sign in for the first time";
    });

    show("main");
  } catch (e) {
    await signOut(auth);
    $("err").textContent = "Could not reach your data. Check the security rules and try again.";
    show("login");
  }
});
