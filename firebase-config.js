import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Mesmo projeto Firebase que os módulos originais já usam.
const firebaseConfig = {
  apiKey: "AIzaSyD9LEeiOOIBlSNKY44j9ajPCp4T1PPp_f4",
  authDomain: "rg29-75af8.firebaseapp.com",
  projectId: "rg29-75af8",
  storageBucket: "rg29-75af8.firebasestorage.app",
  messagingSenderId: "843460649372",
  appId: "1:843460649372:web:6bc6b14f35684ccf47a859"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
