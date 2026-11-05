/**
 * Customer Management Module
 * Handles List, Filter, Add, Edit, Delete, and View
 */
import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, doc, deleteDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";

// Expose Globals IMMEDIATELY
window.renderCustomersTable = renderCustomersTable;
window.renderAddCustomer = renderAddCustomer;
window.filterTable = filterTable;
window.getStatusClass = getStatusClass;
window.viewCustomer = viewCustomer;
window.editCustomer = editCustomer;
window.confirmDelete = confirmDelete;
window.deleteCustomer = deleteCustomer;
window.togglePaymentStatus = togglePaymentStatus;
window.exportCustomersToExcel = exportCustomersToExcel;

const getCustomerDisplayStatus = (c) => {
    if (window.getCustomerDisplayStatus) return window.getCustomerDisplayStatus(c);
    const today = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];
    const expiry = c.expiryDate || c.expiry;
    if (c.status === 'Suspended') return 'Suspended';
    if (expiry && expiry < today) return 'Expired';
    return c.status || 'Active';
};

// Real-time listener initializer for Customers
window.initCustomersListener = function() {
    if (window.AppState.customersUnsub) {
        window.AppState.customersUnsub();
    }
    window.AppState.customersUnsub = onSnapshot(collection(db, "customers"), (snapshot) => {
        window.AppState.customers = snapshot.docs.map(doc => ({
            firestoreId: doc.id,
            ...doc.data()
        }));
        // Sort locally by ID descending
        window.AppState.customers.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));

        // Call updateCustomerStatuses if available to update any newly expired customer records in the DB
        if (typeof window.updateCustomerStatuses === 'function') {
            window.updateCustomerStatuses();
        }

        // Trigger re-render if we are in customers or dashboard
        if (['all-customers', 'dashboard', 'expiring-soon', 'expiring-today', 'expiring-tomorrow', 'expired-yesterday', 'unpaid-recharges'].includes(window.AppState.currentSection) ||
            window.AppState.currentSection.includes('customers')) {
            renderSection(window.AppState.currentSection);
        }
    }, (error) => {
        console.error("Customers onSnapshot error:", error);
    });
};

function renderCustomersTable(container, options = {}) {
    const filter = options.filter || window.AppState.currentFilter || 'all';
    let displayCustomers = [...window.AppState.customers];
    let title = 'All Customers';

    // Apply Filters
    const todayStr = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = window.getLocalDateString ? window.getLocalDateString(yesterdayDate) : yesterdayDate.toISOString().split('T')[0];

    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = window.getLocalDateString ? window.getLocalDateString(tomorrowDate) : tomorrowDate.toISOString().split('T')[0];

    const sevenDaysLaterDate = new Date();
    sevenDaysLaterDate.setDate(sevenDaysLaterDate.getDate() + 7);
    const sevenDaysLaterStr = window.getLocalDateString ? window.getLocalDateString(sevenDaysLaterDate) : sevenDaysLaterDate.toISOString().split('T')[0];

    if (filter === 'expiring') {
        displayCustomers = displayCustomers.filter(c => {
            const exp = c.expiryDate || c.expiry;
            return exp && exp > tomorrowStr && exp <= sevenDaysLaterStr;
        });
        title = 'Expiring Soon (Next 7 Days)';
    } else if (filter === 'expiring-today') {
        displayCustomers = displayCustomers.filter(c => {
            const exp = c.expiryDate || c.expiry;
            return exp && exp === todayStr;
        });
        title = 'Expiring Today';
    } else if (filter === 'expiring-tomorrow') {
        displayCustomers = displayCustomers.filter(c => {
            const exp = c.expiryDate || c.expiry;
            return exp && exp === tomorrowStr;
        });
        title = 'Expiring Tomorrow';
    } else if (filter === 'expired-yesterday') {
        displayCustomers = displayCustomers.filter(c => {
            const exp = c.expiryDate || c.expiry;
            return exp && exp === yesterdayStr;
        });
        title = 'Expired Yesterday';
    } else if (filter === 'Active' || filter === 'Expired') {
        displayCustomers = displayCustomers.filter(c => getCustomerDisplayStatus(c) === filter);
        title = `${filter} Customers`;
    } else if (filter === 'unpaid-recharges') {
        displayCustomers = displayCustomers.filter(c => {
            const currentExpiry = c.expiryDate || c.expiry || null;
            const payStatus = c.paymentStatus || (currentExpiry && currentExpiry < todayStr ? 'Due' : 'Paid');
            return payStatus === 'Due';
        });
        title = 'Recharges Done but Payment Due';
    } else if (filter === 'unpaid-recharges-2m') {
        displayCustomers = displayCustomers.filter(c => {
            const currentExpiry = c.expiryDate || c.expiry || null;
            const payStatus = c.paymentStatus || (currentExpiry && currentExpiry < todayStr ? 'Due' : 'Paid');
            return payStatus === 'Due' && (c.dueMonths || 1) === 2;
        });
        title = '2 Months Due Customers';
    } else if (filter === 'unpaid-recharges-more-2m') {
        displayCustomers = displayCustomers.filter(c => {
            const currentExpiry = c.expiryDate || c.expiry || null;
            const payStatus = c.paymentStatus || (currentExpiry && currentExpiry < todayStr ? 'Due' : 'Paid');
            return payStatus === 'Due' && (c.dueMonths || 1) > 2;
        });
        title = '2+ Months Due Customers';
    }

    // Sorting: Nearest Expiry first for expiring filters
    if (['expiring', 'expiring-today', 'expiring-tomorrow', 'expired-yesterday'].includes(filter)) {
        displayCustomers.sort((a, b) => {
            const expA = a.expiryDate || a.expiry || '';
            const expB = b.expiryDate || b.expiry || '';
            return expA.localeCompare(expB);
        });
    }

    window.AppState.currentCustomerList = displayCustomers;
    window.AppState.currentCustomerTitle = title;

    const tableHTML = `
        <div class="glass-card" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3>${title}</h3>
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <button class="glass-button" onclick="exportCustomersToExcel()" title="Export with Excel (All fields as entered)" style="display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.12); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.35); font-weight: 600; padding: 9px 16px; border-radius: 12px; cursor: pointer; transition: all 0.2s ease;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="8" y1="13" x2="16" y2="13"></line>
                            <line x1="8" y1="17" x2="16" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span>Export with Excel</span>
                    </button>
                    ${isReadOnly() ? '' : `
                    <button class="glass-button primary" onclick="navigateTo('add-customer')">
                        <i class="lucide-user-plus"></i> Add New
                    </button>`}
                    <div class="search-bar" style="width: 250px;">
                        <i class="lucide-search" style="position: absolute; left: 12px; top: 12px; font-size: 16px; color: var(--text-secondary);"></i>
                        <input type="text" placeholder="Search name/phone..." onkeyup="filterTable(this.value)" style="padding-left: 36px; height: 40px;">
                    </div>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table id="customer-data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Plan</th>
                            <th>Expiry</th>
                            <th>Days Left</th>
                            <th>Status</th>
                            <th>Payment</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayCustomers.map(c => {
        const currentExpiry = c.expiryDate || c.expiry || null;
        const days = getDaysLeft(currentExpiry);
        const payStatus = c.paymentStatus || (currentExpiry && currentExpiry < todayStr ? 'Due' : 'Paid');
        const displayStatus = getCustomerDisplayStatus(c);
        const displayMonths = c.dueMonths || 1;
        const displayAmount = (c.amount || 0) * (payStatus === 'Due' ? displayMonths : 1);

        return `
                            <tr data-id="${c.id}">
                                <td>#${c.id}</td>
                                <td style="font-weight: 600;">${c.name}</td>
                                <td>${c.phone}</td>
                                <td>${c.plan}</td>
                                <td>${currentExpiry || '-'}</td>
                                <td style="color: ${days.color}; font-weight: 600;">${days.text}</td>
                                <td><span class="status-badge ${getStatusClass(displayStatus)}">${displayStatus}</span></td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.05); padding: 2px; border-radius: 20px; width: fit-content;">
                                            <button onclick="togglePaymentStatus('${c.name}', '${c.firestoreId}', 'Due')" 
                                                style="padding: 4px 10px; border-radius: 15px; border: none; cursor: pointer; font-size: 0.7rem; font-weight: 600; transition: all 0.3s;
                                                ${payStatus === 'Due' ? 'background: #ef4444; color: white; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);' : 'background: transparent; color: var(--text-secondary);'}">
                                                Due
                                            </button>
                                            <button onclick="togglePaymentStatus('${c.name}', '${c.firestoreId}', 'Paid')" 
                                                style="padding: 4px 10px; border-radius: 15px; border: none; cursor: pointer; font-size: 0.7rem; font-weight: 600; transition: all 0.3s;
                                                ${payStatus === 'Paid' ? 'background: #22c55e; color: white; box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);' : 'background: transparent; color: var(--text-secondary);'}">
                                                Paid
                                            </button>
                                        </div>
                                        <span style="font-size: 0.85rem; font-weight: 600; color: ${payStatus === 'Due' ? '#ef4444' : '#22c55e'}; white-space: nowrap;">
                                            ${payStatus} ${payStatus === 'Due' ? `(${displayMonths}M due)` : ''} ₹${displayAmount.toLocaleString()}
                                        </span>
                                    </div>
                                </td>
                                <td style="text-align: center;">
                                    <div class="action-pill">
                                        <button class="action-btn view" onclick="viewCustomer('${c.firestoreId}')" title="View Customer Details">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                        </button>
                                        ${isReadOnly() ? '' : `
                                        <button class="action-btn recharge" onclick="rechargeCustomer('${c.firestoreId}')" title="Recharge Customer">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                        </button>
                                        <button class="action-btn edit" onclick="editCustomer('${c.firestoreId}')" title="Edit Customer Profile">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                                        </button>
                                        <button class="action-btn delete" onclick="confirmDelete('${c.firestoreId}')" title="Delete Customer">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                        </button>`}
                                    </div>
                                </td>
                            </tr>
                        `;
    }).join('')}
                        ${displayCustomers.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">No customers found matching the criteria.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = tableHTML;
}

function filterTable(val) {
    const rows = document.querySelectorAll('#customer-data-table tbody tr');
    val = val.toLowerCase();
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(val) ? '' : 'none';
    });
}

function getStatusClass(status) {
    if (status === 'Active') return 'status-active';
    if (status === 'Expired') return 'status-expired';
    return 'status-warning';
}

// Add Customer Logic
function renderAddCustomer(container) {
    const formHTML = `
        <div class="glass-card" style="padding: 32px; max-width: 800px; margin: 0 auto;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 24px;">
                <button class="glass-button" style="padding: 8px;" onclick="navigateTo('all-customers')"><i class="lucide-arrow-left"></i></button>
                <h3>Add New Customer</h3>
            </div>
            <form id="add-customer-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Full Name</label>
                    <input type="text" name="name" placeholder="Enter name" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Phone Number</label>
                    <input type="tel" name="phone" placeholder="Enter phone" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Address</label>
                    <textarea name="address" placeholder="Enter address" rows="2" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);"></textarea>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Router MAC</label>
                    <input type="text" name="mac" placeholder="XX:XX:XX:XX:XX:XX" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Installation Date</label>
                    <input type="date" id="install-date" name="install" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Select Plan</label>
                    <select id="plan-select" name="plan" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                        <option value="">Choose a plan</option>
                        ${window.AppState.plans.map(p => `<option value="${p.name}" data-price="${p.price}">${p.name} - ₹${p.price}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Select Duration</label>
                    <select id="duration-select" name="duration" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                        <option value="1">1 Month</option>
                        <option value="2">2 Months</option>
                        <option value="3">3 Months</option>
                        <option value="4">4 Months</option>
                        <option value="5">5 Months</option>
                        <option value="6">6 Months</option>
                        <option value="7">7 Months</option>
                        <option value="8">8 Months</option>
                        <option value="9">9 Months</option>
                        <option value="10">10 Months</option>
                        <option value="11">11 Months</option>
                        <option value="12">12 Months</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Expiry Date (Calculated)</label>
                    <input type="date" name="expiryDate" id="expiry-date" readonly style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(var(--acn-blue-rgb), 0.2); background: rgba(var(--acn-blue-rgb), 0.05); cursor: not-allowed;">
                </div>
                
                <div style="grid-column: span 2; display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
                    <button type="button" class="glass-button" onclick="navigateTo('all-customers')">Cancel</button>
                    <button type="submit" class="glass-button primary">Register Customer</button>
                </div>
            </form>
        </div>
    `;

    container.innerHTML = formHTML;

    // Auto-calculate expiry
    const iIn = document.getElementById('install-date');
    const pSel = document.getElementById('plan-select');
    const dSel = document.getElementById('duration-select');
    const eIn = document.getElementById('expiry-date');

    const updateCalculatedExpiry = () => {
        if (iIn.value) {
            const d = new Date(iIn.value);
            const selectedPlan = window.AppState.plans.find(p => p.name === pSel.value);
            const validity = selectedPlan ? (selectedPlan.validity || 30) : 30;
            const duration = parseInt(dSel.value) || 1;
            d.setDate(d.getDate() + (validity * duration));
            eIn.value = window.getLocalDateString ? window.getLocalDateString(d) : d.toISOString().split('T')[0];
        }
    };

    [iIn, pSel, dSel].forEach(e => e.addEventListener('change', updateCalculatedExpiry));

    document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        // Find selected plan price
        const selectedPlan = window.AppState.plans.find(p => p.name === data.plan);
        const amount = selectedPlan ? (selectedPlan.price || 0) : 0;

        const maxId = window.AppState.customers.reduce((max, c) => {
            const num = parseInt(c.id);
            return !isNaN(num) && num > max ? num : max;
        }, 100);

        const newCust = {
            ...data,
            amount: amount,
            id: (maxId + 1).toString(),
            status: 'Active',
            paymentStatus: 'Paid',
            dueMonths: 0,
            expiry: data.expiryDate || '',
            createdAt: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, "customers"), newCust);
            showToast(`Customer ${newCust.name} added successfully!`, 'success');
            navigateTo('all-customers');
        } catch (error) {
            showToast('Failed to add customer to database', 'error');
            console.error(error);
        }
    });
}

// Actions: View, Edit, Delete
function viewCustomer(firestoreId) {
    const c = window.AppState.customers.find(x => x.firestoreId === firestoreId);
    if (!c) {
        showToast('Customer record not found', 'error');
        return;
    }
    const displayStatus = getCustomerDisplayStatus(c);
    openModal(`
        <div style="padding: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">
                <h3>Customer Details: #${c.id}</h3>
                <span class="status-badge ${getStatusClass(displayStatus)}">${displayStatus}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Full Name</label>
                    <p style="font-weight: 600; font-size: 1.1rem; margin-top: 4px;">${c.name}</p>
                </div>
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Phone Number</label>
                    <p style="font-weight: 600; font-size: 1.1rem; margin-top: 4px;">${c.phone}</p>
                </div>
                <div style="grid-column: span 2;">
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Address</label>
                    <p style="margin-top: 4px;">${c.address}</p>
                </div>
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Router MAC</label>
                    <p style="font-family: monospace; margin-top: 4px;">${c.mac || 'N/A'}</p>
                </div>
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Plan</label>
                    <p style="margin-top: 4px; color: var(--acn-blue); font-weight: 600;">${c.plan}</p>
                </div>
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Plan Amount</label>
                    <p style="margin-top: 4px; font-weight: 600;">₹${c.amount || 0}</p>
                </div>
                <div>
                    <label style="color: var(--text-secondary); font-size: 0.875rem;">Expiry Date</label>
                    <p style="margin-top: 4px; color: var(--acn-orange); font-weight: 700;">${c.expiryDate}</p>
                </div>
            </div>
            <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
                <button class="glass-button primary" onclick="closeModal()">Close</button>
            </div>
        </div>
    `);
}

function editCustomer(firestoreId) {
    const c = window.AppState.customers.find(x => x.firestoreId === firestoreId);
    if (!c) {
        showToast('Customer record not found', 'error');
        return;
    }
    openModal(`
        <div style="width: 550px; max-width: 95vw;">
            <h3 style="margin-bottom: 24px; display: flex; align-items: center; gap: 10px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--acn-orange);"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                Edit Customer: ${c.name}
            </h3>
            <form id="edit-customer-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Full Name</label>
                    <input type="text" name="name" value="${c.name}" required class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Phone Number</label>
                    <input type="tel" name="phone" value="${c.phone}" required class="glass-input">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Address</label>
                    <input type="text" name="address" value="${c.address}" class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Router MAC</label>
                    <input type="text" name="mac" value="${c.mac || ''}" placeholder="XX:XX:XX:XX:XX:XX" class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Installation Date</label>
                    <input type="date" name="install" id="edit-install-date" value="${c.install || ''}" required class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Select Plan</label>
                    <select id="edit-plan-select" name="plan" required class="glass-input">
                        <option value="">Choose a plan</option>
                        ${window.AppState.plans.map(p => {
                            const isSelected = p.name === c.plan ? 'selected' : '';
                            return `<option value="${p.name}" data-price="${p.price}" ${isSelected}>${p.name} - ₹${p.price}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Plan Amount (₹)</label>
                    <input type="number" name="amount" id="edit-amount" value="${c.amount ?? c.planPrice ?? c.price ?? 0}" placeholder="Enter amount" required class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Expiry Date</label>
                    <input type="date" name="expiryDate" id="edit-expiry-date" value="${c.expiryDate || c.expiry || ''}" required class="glass-input">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Status</label>
                    <select name="status" class="glass-input" id="edit-status">
                        <option value="Active" ${c.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Expired" ${c.status === 'Expired' ? 'selected' : ''}>Expired</option>
                        <option value="Suspended" ${c.status === 'Suspended' ? 'selected' : ''}>Suspended</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600;">Due Months</label>
                    <input type="number" name="dueMonths" id="edit-due-months" value="${c.dueMonths || 0}" min="0" required class="glass-input">
                </div>
                <div id="edit-error" style="grid-column: span 2; color: #ef4444; font-size: 0.8rem; height: 1.2rem;"></div>
                <div style="grid-column: span 2; display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Update Profile</button>
                </div>
            </form>
        </div>
    `);

    const iIn = document.getElementById('edit-install-date');
    const eIn = document.getElementById('edit-expiry-date');
    const planSel = document.getElementById('edit-plan-select');
    const amountIn = document.getElementById('edit-amount');
    const err = document.getElementById('edit-error');

    // Auto-update price when plan changes
    planSel.addEventListener('change', () => {
        const option = planSel.options[planSel.selectedIndex];
        if (option && option.dataset.price) {
            amountIn.value = option.dataset.price;
        }
    });

    iIn.addEventListener('change', () => {
        if (iIn.value) {
            const d = new Date(iIn.value);
            d.setDate(d.getDate() + 30);
            eIn.value = window.getLocalDateString ? window.getLocalDateString(d) : d.toISOString().split('T')[0];
            err.textContent = '';
        }
    });

    eIn.addEventListener('change', () => {
        if (iIn.value && eIn.value < iIn.value) {
            err.textContent = 'Expiry date cannot be before installation date';
        } else {
            err.textContent = '';
        }
    });

    document.getElementById('edit-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (iIn.value && eIn.value < iIn.value) {
            err.textContent = 'Invalid dates. Please check again.';
            return;
        }

        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        data.amount = parseFloat(data.amount) || 0;
        data.dueMonths = parseInt(data.dueMonths) || 0;
        data.paymentStatus = data.dueMonths > 0 ? 'Due' : 'Paid';
        data.expiry = data.expiryDate || '';

        // Auto Status Update Logic
        const today = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];
        if (data.status !== 'Suspended') {
            if (data.expiryDate < today) {
                data.status = 'Expired';
            } else if (data.status === 'Expired') {
                data.status = 'Active'; // Reactivate if date moved to future
            }
        }

        const firestoreId = c.firestoreId;
        try {
            const customerRef = doc(db, "customers", firestoreId);
            await updateDoc(customerRef, data);
            showToast('Customer profile updated successfully', 'success');
            closeModal();
            renderSection('all-customers');
        } catch (error) {
            showToast('Update failed', 'error');
        }
    });
}

function confirmDelete(firestoreId) {
    const c = window.AppState.customers.find(x => x.firestoreId === firestoreId);
    if (!c) return;
    openModal(`
        <div style="text-align: center; padding: 10px;">
            <i class="lucide-alert-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 20px;"></i>
            <h3>Delete Customer?</h3>
            <p style="color: var(--text-secondary); margin: 10px 0 30px;">Are you sure you want to delete <b>${c.name}</b>? This action cannot be undone.</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="glass-button" onclick="closeModal()">Keep Customer</button>
                <button class="glass-button primary" style="background: #ef4444;" onclick="deleteCustomer('${firestoreId}')">Delete Forever</button>
            </div>
        </div>
    `);
}

async function deleteCustomer(firestoreId) {
    try {
        await deleteDoc(doc(db, "customers", firestoreId));
        showToast('Customer deleted', 'error');
        closeModal();
    } catch (error) {
        showToast('Failed to delete customer', 'error');
    }
}

async function togglePaymentStatus(customerName, firestoreId, newStatus) {
    if (isReadOnly()) {
        showToast('Permission Denied: Read-Only User', 'error');
        return;
    }
    const customer = window.AppState.customers.find(c => c.firestoreId === firestoreId);
    if (!customer) return;

    const today = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];

    // Check for existing "Due" entry today to prevent duplicates
    const existingDue = window.AppState.payments.find(p =>
        p.customer === customerName &&
        p.status === 'Due' &&
        p.date === today
    );

    if (newStatus === 'Due') {
        if (existingDue) {
            showToast('Payment already marked as Due for today', 'info');
            return;
        }

        try {
            customer.paymentStatus = 'Due';
            customer.dueMonths = (parseInt(customer.dueMonths) || 0) + 1;
            if (customer.dueMonths < 1) customer.dueMonths = 1;

            // Update customer record with paymentStatus
            await updateDoc(doc(db, "customers", firestoreId), {
                paymentStatus: 'Due',
                dueMonths: customer.dueMonths
            });

            const newDuePay = {
                id: `RC-${Math.floor(Math.random() * 9000 + 1000)}`,
                customer: customerName,
                amount: customer.amount || 0,
                months: 1,
                date: today,
                method: '-',
                status: 'Due',
                paid: false,
                customerId: customer.id,
                createdAt: new Date().toISOString()
            };
            const docRef = await addDoc(collection(db, "payments"), newDuePay);
            newDuePay.firestoreId = docRef.id;
            if (window.AppState.payments) window.AppState.payments.unshift(newDuePay);

            showToast(`Marked ${customerName} as Due`, 'warning');
            if (window.renderSection) window.renderSection(window.AppState.currentSection || 'all-customers');
        } catch (error) {
            showToast('Failed to update status', 'error');
        }
    } else if (newStatus === 'Paid') {
        try {
            customer.paymentStatus = 'Paid';
            customer.dueMonths = 0;

            // Update customer record with paymentStatus
            await updateDoc(doc(db, "customers", firestoreId), {
                paymentStatus: 'Paid',
                dueMonths: 0
            });

            // Settle any existing Due payments for this customer
            const pendingPayments = (window.AppState.payments || []).filter(p =>
                (p.customer === customerName || p.customerId === customer.id) && p.status === 'Due'
            );
            for (const p of pendingPayments) {
                p.status = 'Paid';
                p.paid = true;
                p.method = p.method === '-' ? 'UPI' : p.method;
                if (p.firestoreId) {
                    try {
                        await updateDoc(doc(db, "payments", p.firestoreId), {
                            status: 'Paid',
                            paid: true,
                            method: p.method
                        });
                    } catch (e) {
                        console.error('Failed to update due payment:', e);
                    }
                }
            }

            const newPaidPay = {
                id: `RC-${Math.floor(Math.random() * 9000 + 1000)}`,
                customer: customerName,
                amount: customer.amount || 0,
                months: 1,
                date: today,
                method: 'UPI',
                status: 'Paid',
                paid: true,
                customerId: customer.id,
                createdAt: new Date().toISOString()
            };
            const docRef = await addDoc(collection(db, "payments"), newPaidPay);
            newPaidPay.firestoreId = docRef.id;
            if (window.AppState.payments) window.AppState.payments.unshift(newPaidPay);

            showToast(`Marked ${customerName} as Paid`, 'success');
            if (window.renderSection) window.renderSection(window.AppState.currentSection || 'all-customers');
        } catch (error) {
            showToast('Failed to process payment', 'error');
        }
    }
}

async function rechargeCustomer(firestoreId) {
    if (isReadOnly()) {
        showToast('Permission Denied: Read-Only User', 'error');
        return;
    }
    const c = window.AppState.customers.find(x => x.firestoreId === firestoreId);
    if (!c) return;

    // Calculate base date for expiry extensions
    const currentExpiryStr = c.expiryDate || c.expiry;
    let baseDate = new Date();
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (currentExpiryStr) {
        const expDate = new Date(currentExpiryStr);
        if (!isNaN(expDate.getTime()) && expDate > today) {
            baseDate = expDate; // Extend from future expiry
        }
    }
    baseDate.setHours(0,0,0,0);

    const planOptions = window.AppState.plans.map(p => {
        const isSelected = p.name === c.plan ? 'selected' : '';
        return `<option value="${p.name}" data-price="${p.price}" data-validity="${p.validity || 30}" ${isSelected}>${p.name} - ₹${p.price}</option>`;
    }).join('');
    
    const planExists = window.AppState.plans.some(p => p.name === c.plan);
    const fallbackOption = !planExists && c.plan ? `<option value="${c.plan}" data-price="${c.amount || 0}" data-validity="30" selected>${c.plan} - ₹${c.amount || 0} (Current)</option>` : '';
    const combinedPlanOptions = fallbackOption + planOptions;

    openModal(`
        <div style="text-align: center; padding: 10px; width: 420px; max-width: 95vw; margin: 0 auto;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 20px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <h3 style="margin-bottom: 12px;">Recharge Customer</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                Recharge <b>${c.name}</b>
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px; text-align: left;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Select Plan / Package</label>
                    <select id="recharge-plan-select" class="glass-input" style="width: 100%;">
                        ${combinedPlanOptions}
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Select Duration</label>
                    <select id="recharge-months-select" class="glass-input" style="width: 100%;">
                        <option value="1">1 Month</option>
                        <option value="2">2 Months</option>
                        <option value="3">3 Months</option>
                        <option value="4">4 Months</option>
                        <option value="5">5 Months</option>
                        <option value="6">6 Months</option>
                        <option value="7">7 Months</option>
                        <option value="8">8 Months</option>
                        <option value="9">9 Months</option>
                        <option value="10">10 Months</option>
                        <option value="11">11 Months</option>
                        <option value="12">12 Months</option>
                    </select>
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.02); padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: left; font-size: 0.9rem; border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Plan Price:</span>
                    <span style="font-weight: 600;" id="recharge-price-display">₹0</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Current Expiry:</span>
                    <span style="font-weight: 600;">${currentExpiryStr || 'Expired/None'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; color: #22c55e; font-weight: 600; border-top: 1px solid var(--glass-border); padding-top: 8px; margin-top: 4px;">
                    <span>New Expiry:</span>
                    <span id="recharge-expiry-display">-</span>
                </div>
            </div>
            
            <p style="font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Has the customer paid for this recharge?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="glass-button" style="border-color: #ef4444; color: #ef4444; padding: 10px 16px; font-size: 0.85rem;" onclick="processRecharge('${firestoreId}', 'Due')">No (Mark as Due)</button>
                <button class="glass-button primary" style="background: #22c55e; padding: 10px 16px; font-size: 0.85rem;" onclick="processRecharge('${firestoreId}', 'Paid')">Yes (Mark as Paid)</button>
            </div>
        </div>
    `);

    // Add interactivity
    const planSelect = document.getElementById('recharge-plan-select');
    const monthsSelect = document.getElementById('recharge-months-select');
    const priceDisplay = document.getElementById('recharge-price-display');
    const expiryDisplay = document.getElementById('recharge-expiry-display');

    const updateCalculation = () => {
        if (!planSelect || !monthsSelect) return;
        const selectedOption = planSelect.options[planSelect.selectedIndex];
        if (!selectedOption) return;
        const planPrice = parseFloat(selectedOption.getAttribute('data-price')) || 0;
        const planValidity = parseInt(selectedOption.getAttribute('data-validity')) || 30;
        const months = parseInt(monthsSelect.value) || 1;

        const totalAmount = planPrice * months;
        const totalValidityDays = planValidity * months;

        const calculatedExpiryDate = new Date(baseDate);
        calculatedExpiryDate.setDate(calculatedExpiryDate.getDate() + totalValidityDays);
        const calculatedExpiryStr = window.getLocalDateString ? window.getLocalDateString(calculatedExpiryDate) : calculatedExpiryDate.toISOString().split('T')[0];

        priceDisplay.textContent = `₹${totalAmount.toLocaleString()}`;
        expiryDisplay.textContent = `${calculatedExpiryStr} (+${totalValidityDays} Days)`;
    };

    planSelect.addEventListener('change', updateCalculation);
    monthsSelect.addEventListener('change', updateCalculation);
    
    // Initial display update
    updateCalculation();
}

async function processRecharge(firestoreId, payStatus) {
    try {
        const c = window.AppState.customers.find(x => x.firestoreId === firestoreId);
        if (!c) return;

        const planSelect = document.getElementById('recharge-plan-select');
        const monthsSelect = document.getElementById('recharge-months-select');
        if (!planSelect || !monthsSelect) return;

        const selectedOption = planSelect.options[planSelect.selectedIndex];
        if (!selectedOption) return;

        const planName = planSelect.value;
        const planPrice = parseFloat(selectedOption.getAttribute('data-price')) || 0;
        const planValidity = parseInt(selectedOption.getAttribute('data-validity')) || 30;
        const months = parseInt(monthsSelect.value) || 1;

        const totalAmount = planPrice * months;
        const totalValidityDays = planValidity * months;

        // Calculate base date for expiry extension
        const currentExpiryStr = c.expiryDate || c.expiry;
        let baseDate = new Date();
        const today = new Date();
        today.setHours(0,0,0,0);
        
        if (currentExpiryStr) {
            const expDate = new Date(currentExpiryStr);
            if (!isNaN(expDate.getTime()) && expDate > today) {
                baseDate = expDate; // Extend from future expiry
            }
        }
        baseDate.setHours(0,0,0,0);

        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + totalValidityDays);
        const newExpiryStr = window.getLocalDateString ? window.getLocalDateString(newExpiryDate) : newExpiryDate.toISOString().split('T')[0];

        const todayStr = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];

        let finalPaymentStatus = 'Paid';
        let newDues = 0;
        if (payStatus === 'Due') {
            finalPaymentStatus = 'Due';
            const currentDues = c.paymentStatus === 'Due' ? (parseInt(c.dueMonths) || 1) : 0;
            newDues = currentDues + months;
        } else {
            finalPaymentStatus = 'Paid';
            newDues = 0;
        }




        // 1. Update customer doc
        await updateDoc(doc(db, "customers", firestoreId), {
            plan: planName,
            expiry: newExpiryStr,
            expiryDate: newExpiryStr,
            paymentStatus: finalPaymentStatus,
            dueMonths: newDues,
            status: 'Active',
            amount: planPrice
        });

        // Update in-memory customer immediately
        c.plan = planName;
        c.expiry = newExpiryStr;
        c.expiryDate = newExpiryStr;
        c.paymentStatus = finalPaymentStatus;
        c.dueMonths = newDues;
        c.status = 'Active';
        c.amount = planPrice;

        // Settle previous Due payment records if marked as Paid
        if (payStatus === 'Paid') {
            const pendingPayments = (window.AppState.payments || []).filter(p =>
                (p.customer === c.name || p.customerId === c.id) && p.status === 'Due'
            );
            for (const p of pendingPayments) {
                if (p.firestoreId) {
                    p.status = 'Paid';
                    p.paid = true;
                    p.method = p.method === '-' ? 'UPI' : p.method;
                    try {
                        await updateDoc(doc(db, "payments", p.firestoreId), {
                            status: 'Paid',
                            paid: true,
                            method: p.method
                        });
                    } catch (err) {
                        console.error('Failed to update due payment:', err);
                    }
                }
            }
        }



        // 2. Add payment record (with totalAmount for the recharged duration)
        const rechargePayment = {
            id: `RC-${Math.floor(Math.random() * 9000 + 1000)}`,
            customer: c.name,
            amount: totalAmount,
            months: months,
            date: todayStr,
            method: payStatus === 'Paid' ? 'UPI' : '-',
            status: payStatus,
            paid: payStatus === 'Paid',
            customerId: c.id,
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "payments"), rechargePayment);
        rechargePayment.firestoreId = docRef.id;
        if (window.AppState.payments) {
            window.AppState.payments.unshift(rechargePayment);
        }

        showToast(`Recharge successful! Extended to ${newExpiryStr} (${payStatus})`, 'success');
        closeModal();
        if (window.renderSection) {
            window.renderSection(window.AppState.currentSection || 'all-customers');
        }
    } catch (error) {
        console.error("Recharge failed:", error);
        showToast('Failed to complete recharge', 'error');
    }
}

// Expose Recharge Globals
window.rechargeCustomer = rechargeCustomer;
window.processRecharge = processRecharge;

// Export Customers to Excel
function exportCustomersToExcel() {
    try {
        const todayStr = window.getLocalDateString ? window.getLocalDateString() : new Date().toISOString().split('T')[0];

        // Determine which customers are currently visible/active in the table
        const tableRows = document.querySelectorAll('#customer-data-table tbody tr[data-id]');
        let customersToExport = [];
        const baseList = window.AppState.currentCustomerList || window.AppState.customers || [];

        if (tableRows && tableRows.length > 0) {
            const visibleIds = new Set();
            let anyFiltered = false;
            tableRows.forEach(row => {
                if (row.style.display !== 'none') {
                    const id = row.getAttribute('data-id');
                    if (id) visibleIds.add(id);
                } else {
                    anyFiltered = true;
                }
            });

            if (anyFiltered) {
                // If user searched/filtered rows, only export the visible ones
                customersToExport = baseList.filter(c => visibleIds.has(String(c.id)));
            } else {
                customersToExport = [...baseList];
            }
        } else {
            customersToExport = [...baseList];
        }

        if (!customersToExport || customersToExport.length === 0) {
            showToast('No customer records to export', 'warning');
            return;
        }

        const dataRows = customersToExport.map(c => {
            const currentExpiry = c.expiryDate || c.expiry || '';
            const days = window.getDaysLeft ? window.getDaysLeft(currentExpiry) : { text: '' };
            const payStatus = c.paymentStatus || (currentExpiry && currentExpiry < todayStr ? 'Due' : 'Paid');
            const displayStatus = window.getCustomerDisplayStatus ? window.getCustomerDisplayStatus(c) : (c.status || 'Active');
            const dueMonths = payStatus === 'Due' ? (parseInt(c.dueMonths) || 1) : 0;
            const planAmount = parseFloat(c.amount) || 0;
            const totalDue = payStatus === 'Due' ? (planAmount * dueMonths) : 0;
            const regDate = c.createdAt ? c.createdAt.split('T')[0] : (c.install || '');

            return {
                'Customer ID': c.id ? `#${c.id}` : '-',
                'Full Name': c.name || '-',
                'Phone Number': c.phone || '-',
                'Address': c.address || '-',
                'Router MAC': c.mac || '-',
                'Installation Date': c.install || '-',
                'Plan Name': c.plan || '-',
                'Duration (Months)': parseInt(c.duration) || 1,
                'Plan Price (₹)': planAmount,
                'Expiry Date': currentExpiry || '-',
                'Days Left': days.text || '-',
                'Account Status': displayStatus || 'Active',
                'Payment Status': payStatus,
                'Due Months': dueMonths,
                'Total Due Amount (₹)': totalDue,
                'Registration Date': regDate || '-'
            };
        });

        const rawTitle = (tableRows && tableRows.length > 0 && window.AppState.currentCustomerTitle) ? window.AppState.currentCustomerTitle : (window.AppState.currentCustomerTitle || 'All_Customers');
        const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const fileName = `ACN_${cleanTitle}_${todayStr}.xlsx`;

        if (window.XLSX) {
            const ws = XLSX.utils.json_to_sheet(dataRows);
            ws['!cols'] = [
                { wch: 14 }, // Customer ID
                { wch: 28 }, // Full Name
                { wch: 16 }, // Phone Number
                { wch: 34 }, // Address
                { wch: 22 }, // Router MAC
                { wch: 18 }, // Installation Date
                { wch: 24 }, // Plan Name
                { wch: 18 }, // Duration (Months)
                { wch: 16 }, // Plan Price (₹)
                { wch: 16 }, // Expiry Date
                { wch: 16 }, // Days Left
                { wch: 16 }, // Account Status
                { wch: 16 }, // Payment Status
                { wch: 14 }, // Due Months
                { wch: 20 }, // Total Due Amount (₹)
                { wch: 18 }  // Registration Date
            ];
            const wb = XLSX.utils.book_new();
            const sheetName = cleanTitle.slice(0, 31) || 'Customers';
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, fileName);
            showToast(`Exported ${dataRows.length} customers to Excel successfully!`, 'success');
        } else {
            exportToCSV(dataRows, `ACN_${cleanTitle}_${todayStr}.csv`);
            showToast(`Exported ${dataRows.length} customers to CSV successfully!`, 'success');
        }
    } catch (err) {
        console.error('Export error:', err);
        showToast('Failed to export customers: ' + err.message, 'error');
    }
}

function exportToCSV(data, fileName) {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')
    ];
    for (const row of data) {
        const values = headers.map(h => {
            const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
            return `"${val.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
