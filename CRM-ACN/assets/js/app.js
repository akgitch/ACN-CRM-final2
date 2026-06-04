/**
 * ACN Broadband CRM - Core App Engine
 * Handles State, Routing, UI Feedback, and Navigation
 */
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, limit, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";

// Global App State
window.AppState = {
    customers: [
        { id: '101', name: 'Alen Walker', phone: '9876543210', address: '123 Blue St', plan: '50 Mbps Unlimited', price: 499, install: '2026-01-25', expiry: '2026-03-25', mac: 'AA:BB:CC:DD:EE:01', status: 'Active', notes: '' },
        { id: '102', name: 'John Doe', phone: '8765432109', address: '456 Orange Ave', plan: '100 Mbps Pro', price: 799, install: '2026-01-22', expiry: '2026-02-22', mac: 'AA:BB:CC:DD:EE:02', status: 'Active', notes: '' },
        { id: '103', name: 'Jane Smith', phone: '7654321098', address: '789 Link Rd', plan: '50 Mbps Unlimited', price: 499, install: '2026-01-15', expiry: '2026-02-15', mac: 'AA:BB:CC:DD:EE:03', status: 'Expired', notes: '' },
        { id: '104', name: 'Michael Ross', phone: '6543210987', address: '101 Signal Way', plan: '200 Mbps Ultra', price: 1299, install: '2026-01-26', expiry: '2026-02-26', mac: 'AA:BB:CC:DD:EE:04', status: 'Active', notes: '' },
        { id: '105', name: 'Rachel Zane', phone: '5432109876', address: '202 Fiber Blvd', plan: '100 Mbps Pro', price: 799, install: '2026-02-10', expiry: '2026-03-10', mac: 'AA:BB:CC:DD:EE:05', status: 'Active', notes: '' }
    ],
    plans: [
        { name: '50 Mbps Unlimited', price: 499, validity: 30 },
        { name: '100 Mbps Pro', price: 799, validity: 30 },
        { name: '200 Mbps Ultra', price: 1299, validity: 30 }
    ],
    staff: [
        { id: 'S1', name: 'Admin User', role: 'Super Admin', access: 'Full', status: 'Online', password: 'password' },
        { id: 'S2', name: 'Staff One', role: 'Support', access: 'Read/Write', status: 'Away', password: 'password' },
        { id: 'S3', name: 'Technician Ali', role: 'Technician', access: 'Read Only', status: 'Offline', password: 'password' }
    ],
    payments: [
        { id: 'RC-8821', customer: 'Alen Walker', amount: 499, date: new Date().toISOString().split('T')[0], method: 'UPI', status: 'Paid' },
        { id: 'RC-8820', customer: 'Michael Ross', amount: 1299, date: new Date().toISOString().split('T')[0], method: 'Cash', status: 'Paid' },
        { id: 'RC-8819', customer: 'John Doe', amount: 799, date: '2026-02-15', method: 'UPI', status: 'Paid' }
    ],
    currentSection: 'dashboard',
    currentFilter: 'all',
    user: { name: 'Admin User', role: 'Super Admin' },
    initialized: false,
    isAuthenticated: false,
    isAuthChecking: true
};

document.addEventListener('DOMContentLoaded', () => {
    // We delay the actual app start slightly to let other modules register themselves
    setTimeout(() => {
        initApp();
    }, 100);
});

function initApp() {
    updateCustomerStatuses(); // Check expiries on load

    // Firebase Auth Persistence & Initialization Guard
    onAuthStateChanged(auth, async (user) => {
        const overlay = document.getElementById('login-overlay');
        const lastSection = localStorage.getItem('acn_last_section') || 'dashboard';
        const lastParamData = localStorage.getItem('acn_last_params');
        const lastParams = lastParamData ? JSON.parse(lastParamData) : {};

        window.AppState.isAuthChecking = false;

        if (user) {
            try {
                const staffDocRef = doc(db, "staff", user.uid);
                const staffDoc = await getDoc(staffDocRef);

                let isAuthorized = false;

                if (staffDoc.exists()) {
                    const data = staffDoc.data();
                    window.AppState.isAuthenticated = true;
                    window.AppState.user = {
                        uid: user.uid,
                        name: data.fullName,
                        role: data.role,
                        accessLevel: data.accessLevel
                    };
                    isAuthorized = true;
                    await checkAndSeedDatabase(user.uid);
                } else {
                    // Check if the staff collection is completely empty (fresh bootstrap)
                    const staffSnap = await getDocs(collection(db, "staff"));
                    if (staffSnap.empty || user.email === 'admin@acn.com') {
                        // Bootstrap this first user as Super Admin
                        const adminName = user.email.split('@')[0];
                        const capitalizedName = adminName.charAt(0).toUpperCase() + adminName.slice(1);
                        
                        await setDoc(staffDocRef, {
                            fullName: capitalizedName + ' (Admin)',
                            role: 'Super Admin',
                            accessLevel: 'Full',
                            status: 'Online',
                            email: user.email,
                            createdAt: serverTimestamp()
                        });

                        window.AppState.isAuthenticated = true;
                        window.AppState.user = {
                            uid: user.uid,
                            name: capitalizedName + ' (Admin)',
                            role: 'Super Admin',
                            accessLevel: 'Full'
                        };
                        isAuthorized = true;
                        await checkAndSeedDatabase(user.uid);
                    }
                }

                if (!isAuthorized) {
                    showToast('Access Denied: Not a staff member', 'error');
                    await signOut(auth);
                    return;
                }

                if (overlay) overlay.style.display = 'none';

                // Restore section only once
                if (!window.AppState.initialized) {
                    window.AppState.initialized = true;
                    navigateTo(lastSection, lastParams);
                }
            } catch (error) {
                console.error("Auth verification failed:", error);
                showToast('Authentication error', 'error');
                await signOut(auth);
            }
        } else {
            window.AppState.isAuthenticated = false;
            window.AppState.currentSection = 'login';
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.remove('login-hidden');
            }
        }
    });

    setupEventListeners();
    setupRippleEffects();

    // Midnight Refresh Check (every 10 minutes)
    setInterval(() => {
        updateCustomerStatuses();
        if (window.AppState.currentSection === 'dashboard') renderSection('dashboard');
        if (window.AppState.currentSection === 'expiring-soon') renderSection('expiring-soon');
    }, 600000);
}

function updateCustomerStatuses() {
    const today = new Date().toISOString().split('T')[0];
    window.AppState.customers.forEach(async c => {
        // Data Migration: Unified SSoT field 'amount'
        const currentAmount = c.amount ?? c.planPrice ?? c.price ?? 0;
        const currentExpiry = c.expiryDate || c.expiry;

        let needsUpdate = false;
        const updateData = {};

        // Migrate to amount if missing
        if (c.amount === undefined || c.amount === null) {
            updateData.amount = currentAmount;
            needsUpdate = true;
        }

        if (!c.expiryDate && c.expiry) {
            updateData.expiryDate = c.expiry;
            needsUpdate = true;
        }

        if (currentExpiry < today && c.status === 'Active') {
            c.status = 'Expired';
            updateData.status = 'Expired';
            updateData.paymentStatus = 'Due';
            needsUpdate = true;

            // Automated Billing: Create "Due" entry using customer.amount
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const dateLimit = thirtyDaysAgo.toISOString().split('T')[0];

            const q = query(
                collection(db, "payments"),
                where("customer", "==", c.name),
                where("status", "==", "Due"),
                where("date", ">=", dateLimit),
                limit(1)
            );

            const existing = await getDocs(q);
            if (existing.empty) {
                const newDue = {
                    id: `RC-${Math.floor(Math.random() * 9000 + 1000)}`,
                    customer: c.name,
                    amount: currentAmount,
                    date: today,
                    method: '-',
                    status: 'Due',
                    paid: false,
                    customerId: c.id,
                    createdAt: new Date().toISOString()
                };
                await addDoc(collection(db, "payments"), newDue);
                console.log(`Automated billing created for ${c.name} with amount ${currentAmount}`);
            }
        } else if (currentExpiry >= today && c.status === 'Expired') {
            c.status = 'Active';
            updateData.status = 'Active';
            needsUpdate = true;
        }

        if (needsUpdate) {
            await updateDoc(doc(db, "customers", c.firestoreId), updateData);
        }
    });
}

/**
 * Utility: Calculate Days Left & Formatting
 * @param {string} dateStr - Expiry date
 * @returns {object} { text, color }
 */
function getDaysLeft(dateStr) {
    if (!dateStr) return { text: '-', color: 'var(--text-secondary)' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr);
    exp.setHours(0, 0, 0, 0);

    if (isNaN(exp.getTime())) return { text: '-', color: 'var(--text-secondary)' };

    const diffTime = exp - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return { text: `${diffDays} Day${diffDays > 1 ? 's' : ''} Left`, color: 'var(--acn-orange)' };
    } else if (diffDays === 0) {
        return { text: 'Expires Today', color: 'var(--acn-blue)' };
    } else {
        const absDays = Math.abs(diffDays);
        return { text: `Expired ${absDays} Day${absDays > 1 ? 's' : ''} Ago`, color: '#ef4444' };
    }
}

// Global Event Listeners
function setupEventListeners() {
    // Navigation routing via Event Delegation
    document.addEventListener('click', (e) => {
        const navLink = e.target.closest('.nav-link');
        if (navLink) {
            const section = navLink.getAttribute('data-section');
            if (section) {
                e.preventDefault();
                if (section === 'logout') {
                    showLogoutConfirmation();
                    return;
                }
                navigateTo(section);

                // Close sidebar on mobile after navigation
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.querySelector('.sidebar-overlay');
                if (sidebar?.classList.contains('active')) {
                    sidebar.classList.remove('active');
                    overlay?.classList.remove('active');
                }
            }
        }
    });

    // Mobile Sidebar Toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const appContainer = document.querySelector('.app-container');

    // Create overlay if not exists
    let sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (!sidebarOverlay) {
        sidebarOverlay = document.createElement('div');
        sidebarOverlay.className = 'sidebar-overlay';
        appContainer.appendChild(sidebarOverlay);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
    }

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });

    // Close modal on overlay click
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // Login logic
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-id').value;
            const password = document.getElementById('admin-password').value;

            if (!email || !password) {
                showToast('Please enter both Email and Password', 'error');
                return;
            }

            try {
                // Formatting email if only username provided
                const loginEmail = email.includes('@') ? email : `${email}@acn.com`;
                await signInWithEmailAndPassword(auth, loginEmail, password);
                showToast('Login Successful', 'success');
            } catch (error) {
                console.error("Login Error:", error.code, error.message);
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    showToast('Invalid email or password. Please try again.', 'error');
                } else if (error.code === 'auth/operation-not-allowed') {
                    showToast('Login provider not enabled in Firebase Console.', 'error');
                } else {
                    showToast('Login failed: ' + error.message, 'error');
                }
            }
        });
    }

    // Forgot Password Logic
    const forgotBtn = document.getElementById('forgot-password-link');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-id').value;
            if (!email) {
                showToast('Please enter your email address first', 'error');
                return;
            }
            const loginEmail = email.includes('@') ? email : `${email}@acn.com`;
            try {
                await sendPasswordResetEmail(auth, loginEmail);
                showToast('Password reset link sent to ' + loginEmail, 'success');
            } catch (error) {
                showToast('Failed to send reset link: ' + error.message, 'error');
            }
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        body.setAttribute('data-theme', newTheme);
        themeToggle.innerHTML = newTheme === 'light' ? '<i class="lucide-sun"></i>' : '<i class="lucide-moon"></i>';
    });
}

/**
 * SPA Router
 * @param {string} sectionId - The destination section
 * @param {object} params - Optional state/data for the section (e.g. filter)
 */
function navigateTo(sectionId, params = {}) {
    // Auth Guard check on navigation
    const user = auth.currentUser;
    if (!user && sectionId !== 'logout') {
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.remove('login-hidden');
        }
        return;
    }

    window.AppState.currentSection = sectionId;
    window.AppState.currentFilter = params.filter || 'all';
    window.AppState.lastParams = params;

    // Persist View State
    localStorage.setItem('acn_last_section', sectionId);
    localStorage.setItem('acn_last_params', JSON.stringify(params));

    // Update active state in sidebar
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.remove('active');
        if (l.getAttribute('data-section') === sectionId) {
            l.classList.add('active');
        }
    });

    renderSection(sectionId);
}

// Section Renderer
function renderSection(sectionId) {
    const area = document.getElementById('content-area');
    if (!area) return;

    area.innerHTML = `
        <div style="height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px;">
            <div class="loader"></div>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">Loading ${sectionId}...</p>
        </div>
    `;

    // Store params in state for modules to access
    const params = window.AppState.lastParams || {};

    // Small delay for smooth transition feel and to ensure module evaluation
    let retryCount = 0;
    const maxRetries = 5;

    const attemptRender = () => {
        try {
            switch (sectionId) {
                case 'dashboard':
                    if (window.renderDashboard) renderDashboard(area);
                    else throw new Error("renderDashboard not found");
                    break;
                case 'add-customer':
                    if (window.renderAddCustomer) renderAddCustomer(area);
                    else throw new Error("renderAddCustomer not found");
                    break;
                case 'all-customers':
                    if (window.renderCustomersTable) renderCustomersTable(area, { filter: window.AppState.currentFilter });
                    else throw new Error("renderCustomersTable not found");
                    break;
                case 'expiring-soon':
                    if (window.renderCustomersTable) renderCustomersTable(area, { filter: 'expiring' });
                    else throw new Error("renderCustomersTable not found");
                    break;
                case 'payments':
                    if (window.renderPayments) renderPayments(area, params);
                    else throw new Error("renderPayments not found");
                    break;
                case 'plans':
                    if (window.renderPlans) renderPlans(area);
                    else throw new Error("renderPlans not found");
                    break;
                case 'settings':
                    if (window.renderSettings) renderSettings(area);
                    else throw new Error("renderSettings not found");
                    break;
                case 'reports':
                    if (window.renderReports) renderReports(area, params);
                    else throw new Error("renderReports not found");
                    break;
                case 'staff':
                case 'staff-management': // Support both ID variants
                    if (window.renderStaff) renderStaff(area);
                    else throw new Error("renderStaff not found");
                    break;
                default: renderPlaceholder(area, sectionId);
            }
        } catch (err) {
            console.warn(`Render attempt ${retryCount + 1} failed for ${sectionId}:`, err.message);
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(attemptRender, 200);
            } else {
                console.error("Final Routing Error:", err);
                area.innerHTML = `
                    <div class="glass-card" style="padding: 40px; text-align: center; border: 1px solid rgba(239, 68, 68, 0.2);">
                        <i class="lucide-alert-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 16px;"></i>
                        <h3>System Recovery</h3>
                        <p style="color: var(--text-secondary); margin: 8px 0 20px;">The module for "${sectionId}" is taking too long to respond.</p>
                        <button class="glass-button primary" onclick="location.reload()">Force Restart</button>
                        <button class="glass-button" style="margin-left: 8px;" onclick="navigateTo('dashboard')">To Dashboard</button>
                    </div>
                `;
            }
        }
    };

    setTimeout(attemptRender, 300);
    window.AppState.lastParams = null; // Clear after use
}

/**
 * Toast Notification System
 * @param {string} msg - Message to show
 * @param {string} type - 'success' or 'error'
 */
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'lucide-check-circle' : 'lucide-alert-circle';

    toast.innerHTML = `
        <i class="${icon}" style="color: ${type === 'success' ? '#22c55e' : '#ef4444'}"></i>
        <span>${msg}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Modal System
 * @param {string} html - Content to inject
 */
function openModal(html) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// Ripple Effect Handler
function setupRippleEffects() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('button, .nav-link, .stat-card');
        if (!target) return;

        const ripple = document.createElement('span');
        ripple.className = 'ripple';

        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        target.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
}

function showLogoutConfirmation() {
    openModal(`
        <div style="text-align: center;">
            <i class="lucide-log-out" style="font-size: 40px; color: #ef4444; margin-bottom: 20px;"></i>
            <h3>Confirm Logout</h3>
            <p style="color: var(--text-secondary); margin: 10px 0 30px;">Are you sure you want to exit the system?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="glass-button" onclick="closeModal()">Cancel</button>
                <button class="glass-button primary" style="background: #ef4444;" onclick="logout()">Logout</button>
            </div>
        </div>
    `);
}

async function logout() {
    try {
        await signOut(auth);
        localStorage.removeItem('acn_last_section');
        localStorage.removeItem('acn_last_params');
        location.reload();
    } catch (error) {
        showToast('Logout failed', 'error');
    }
}

function renderPlaceholder(container, id) {
    container.innerHTML = `
        <div class="glass-card" style="padding: 60px; text-align: center;">
            <i class="lucide-construction" style="font-size: 48px; color: var(--acn-orange); margin-bottom: 20px;"></i>
            <h2>System Module: ${id.toUpperCase()}</h2>
            <p style="color: var(--text-secondary); margin-top: 10px;">This feature is currently being optimized for production.</p>
            <button class="glass-button primary" style="margin-top: 30px;" onclick="navigateTo('dashboard')">Back to Dashboard</button>
        </div>
    `;
}

// Expose Globals for HTML handlers (at the end to ensure all are defined)
window.isReadOnly = () => window.AppState.user?.accessLevel === "Read Only (Viewer)" || window.AppState.user?.accessLevel === "Read Only";
window.navigateTo = navigateTo;
window.renderSection = renderSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.showLogoutConfirmation = showLogoutConfirmation;
window.logout = logout;
window.showToast = showToast;
window.getDaysLeft = getDaysLeft;

async function checkAndSeedDatabase(uid) {
    try {
        // 1. Seed plans if empty
        const plansSnap = await getDocs(collection(db, "plans"));
        if (plansSnap.empty) {
            console.log("Seeding default plans...");
            const defaultPlans = [
                { name: '50 Mbps Unlimited', price: 499, validity: 30, speed: '50 Mbps', type: 'Fiber' },
                { name: '100 Mbps Pro', price: 799, validity: 30, speed: '100 Mbps', type: 'Fiber' },
                { name: '200 Mbps Ultra', price: 1299, validity: 30, speed: '200 Mbps', type: 'Fiber' }
            ];
            for (const p of defaultPlans) {
                await addDoc(collection(db, "plans"), p);
            }
        }

        // 2. Seed staff if admin record is missing
        const staffDocRef = doc(db, "staff", uid);
        const staffDoc = await getDoc(staffDocRef);
        if (!staffDoc.exists()) {
            console.log("Seeding admin staff member...");
            await setDoc(staffDocRef, {
                fullName: 'Admin User',
                role: 'Super Admin',
                accessLevel: 'Full',
                status: 'Online',
                email: 'admin@acn.com',
                createdAt: serverTimestamp()
            });
        }

        // 3. Seed customers if empty
        const customersSnap = await getDocs(collection(db, "customers"));
        if (customersSnap.empty) {
            console.log("Seeding default customers...");
            const today = new Date();
            const formatOffsetDate = (daysOffset) => {
                const d = new Date(today);
                d.setDate(today.getDate() + daysOffset);
                return d.toISOString().split('T')[0];
            };

            const defaultCustomers = [
                { id: '101', name: 'Alen Walker', phone: '9876543210', address: '123 Blue St', plan: '50 Mbps Unlimited', amount: 499, install: formatOffsetDate(-10), expiryDate: formatOffsetDate(20), mac: 'AA:BB:CC:DD:EE:01', status: 'Active', notes: '', paymentStatus: 'Paid', expiry: formatOffsetDate(20) },
                { id: '102', name: 'John Doe', phone: '8765432109', address: '456 Orange Ave', plan: '100 Mbps Pro', amount: 799, install: formatOffsetDate(-13), expiryDate: formatOffsetDate(17), mac: 'AA:BB:CC:DD:EE:02', status: 'Active', notes: '', paymentStatus: 'Paid', expiry: formatOffsetDate(17) },
                { id: '103', name: 'Jane Smith', phone: '7654321098', address: '789 Link Rd', plan: '50 Mbps Unlimited', amount: 499, install: formatOffsetDate(-35), expiryDate: formatOffsetDate(-5), mac: 'AA:BB:CC:DD:EE:03', status: 'Expired', notes: '', paymentStatus: 'Due', expiry: formatOffsetDate(-5) },
                { id: '104', name: 'Michael Ross', phone: '6543210987', address: '101 Signal Way', plan: '200 Mbps Ultra', amount: 1299, install: formatOffsetDate(-9), expiryDate: formatOffsetDate(21), mac: 'AA:BB:CC:DD:EE:04', status: 'Active', notes: '', paymentStatus: 'Paid', expiry: formatOffsetDate(21) },
                { id: '105', name: 'Rachel Zane', phone: '5432109876', address: '202 Fiber Blvd', plan: '100 Mbps Pro', amount: 799, install: formatOffsetDate(-26), expiryDate: formatOffsetDate(4), mac: 'AA:BB:CC:DD:EE:05', status: 'Active', notes: '', paymentStatus: 'Paid', expiry: formatOffsetDate(4) }
            ];
            for (const c of defaultCustomers) {
                await addDoc(collection(db, "customers"), c);
            }
        }

        // 4. Seed payments if empty
        const paymentsSnap = await getDocs(collection(db, "payments"));
        if (paymentsSnap.empty) {
            console.log("Seeding default payments...");
            const today = new Date();
            const formatOffsetDate = (daysOffset) => {
                const d = new Date(today);
                d.setDate(today.getDate() + daysOffset);
                return d.toISOString().split('T')[0];
            };

            const defaultPayments = [
                { id: 'RC-8821', customer: 'Alen Walker', amount: 499, date: formatOffsetDate(-10), method: 'UPI', status: 'Paid', paid: true },
                { id: 'RC-8820', customer: 'Michael Ross', amount: 1299, date: formatOffsetDate(-9), method: 'Cash', status: 'Paid', paid: true },
                { id: 'RC-8819', customer: 'John Doe', amount: 799, date: formatOffsetDate(-13), method: 'UPI', status: 'Paid', paid: true },
                { id: 'RC-8818', customer: 'Jane Smith', amount: 499, date: formatOffsetDate(-5), method: '-', status: 'Due', paid: false }
            ];
            for (const p of defaultPayments) {
                await addDoc(collection(db, "payments"), p);
            }
        }
    } catch (e) {
        console.error("Error seeding database:", e);
    }
}
