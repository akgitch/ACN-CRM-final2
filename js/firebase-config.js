// Firebase Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLUO9eI4dymvkRhoS7KamZe-N3nqQiEeY",
  authDomain: "crm-acn.firebaseapp.com",
  projectId: "crm-acn",
  storageBucket: "crm-acn.firebasestorage.app",
  messagingSenderId: "532398336692",
  appId: "1:532398336692:web:02141f59fdd90d489a85e1",
  measurementId: "G-V5N9CXL58N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Expose to global scope for vanilla scripts IMMEDIATELY
window.Firebase = { auth, db };

const analytics = getAnalytics(app);
