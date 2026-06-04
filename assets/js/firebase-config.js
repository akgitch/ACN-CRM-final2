// Firebase Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyAi9MmZ8Q5mjDkfJyDuGBNglpsvXVxI3HQ",
    authDomain: "acn-crm-e6d2b.firebaseapp.com",
    projectId: "acn-crm-e6d2b",
    storageBucket: "acn-crm-e6d2b.firebasestorage.app",
    messagingSenderId: "335754989768",
    appId: "1:335754989768:web:7789f080824f4f7f7f15fd",
    measurementId: "G-M9B6B685EH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Expose to global scope for vanilla scripts IMMEDIATELY
window.Firebase = { auth, db };

const analytics = getAnalytics(app);
