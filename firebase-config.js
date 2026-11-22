// firebase-config.js
// Your Firebase connection details. These are not passwords.
export const firebaseConfig = {
  apiKey: "AIzaSyDtwjW-m0AX87eurVNi-3f5v0sn92v7n1c",
  authDomain: "oursanctuary-9e032.firebaseapp.com",
  projectId: "oursanctuary-9e032",
  storageBucket: "oursanctuary-9e032.firebasestorage.app",
  messagingSenderId: "749310399630",
  appId: "1:749310399630:web:c57dcb1ae32c14c717e5df"
};

// The only two people allowed in. The real protection is in the Firestore rules.
export const PEOPLE = [
  { email: "shona180199@gmail.com", defaultName: "Shana" },
  { email: "mohamadrizuan47@gmail.com", defaultName: "Rizuan" }
];
