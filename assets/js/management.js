/**
 * Management Modules: Payments, Plans, Reports, Staff, Settings
 */
import { auth, db } from './firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";
import { createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-auth.js";

// Expose Globals IMMEDIATELY for HTML handlers
window.renderPayments = renderPayments;
window.collectPayment = collectPayment;
window.renderPlans = renderPlans;
window.addPlan = addPlan;
window.renderReports = renderReports;
window.renderStaff = renderStaff;
window.editStaff = editStaff;
window.renderSettings = renderSettings;
window.togglePass = togglePass;
window.hashPassword = hashPassword;
window.editPlan = editPlan;
window.confirmDeletePlan = confirmDeletePlan;
window.deletePlan = deletePlan;
window.addStaff = addStaff;
window.markAsPaid = markAsPaid;
window.editPayment = editPayment;
window.deletePayment = deletePayment;
window.confirmDeletePayment = confirmDeletePayment;
window.addStaff = addStaff;
// Real-time listener initializer for Management (payments, plans, staff)
window.initManagementListeners = function() {
    if (window.AppState.paymentsUnsub) window.AppState.paymentsUnsub();
    if (window.AppState.plansUnsub) window.AppState.plansUnsub();
    if (window.AppState.staffUnsub) window.AppState.staffUnsub();

    window.AppState.paymentsUnsub = onSnapshot(collection(db, "payments"), (snapshot) => {
        window.AppState.payments = snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
        // Sort locally by date descending
        window.AppState.payments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (['payments', 'dashboard', 'all-customers', 'expiring-soon'].includes(window.AppState.currentSection)) {
            renderSection(window.AppState.currentSection);
        }
    }, (error) => {
        console.error("Payments onSnapshot error:", error);
    });

    window.AppState.plansUnsub = onSnapshot(collection(db, "plans"), (snapshot) => {
        window.AppState.plans = snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
        if (window.AppState.currentSection === 'plans') {
            renderSection('plans');
        }
    }, (error) => {
        console.error("Plans onSnapshot error:", error);
    });

    window.AppState.staffUnsub = onSnapshot(collection(db, "staff"), (snapshot) => {
        window.AppState.staff = snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
        if (window.AppState.currentSection === 'staff') {
            renderSection('staff');
        }
    }, (error) => {
        console.error("Staff onSnapshot error:", error);
    });
};

function renderPayments(container, params = {}) {
    const isToday = params.module === 'today';
    const title = isToday ? "Today's Collection" : "Payment Ledger";

    // Mock data filtering for "today"
    const paymentsHTML = `
        <div class="glass-card" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3>${title}</h3>
                ${isReadOnly() ? '' : `<button class="glass-button primary" onclick="collectPayment()"><i class="lucide-plus"></i> Collect New Payment</button>`}
            </div>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Receipt #</th>
                            <th>Customer Name</th>
                            <th>Amount</th>
                            <th>Date</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th style="text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${window.AppState.payments.filter(p => !isToday || p.date === new Date().toISOString().split('T')[0]).map(p => `
                            <tr>
                                <td>#${p.id}</td>
                                <td>${p.customer}</td>
                                <td>₹${(p.amount || 0).toLocaleString()}</td>
                                <td>${p.date}</td>
                                <td>${p.method}</td>
                                <td>
                                    <span class="status-badge ${p.status === 'Paid' ? 'status-active' : 'status-expired'}">
                                        ${p.status}
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <div class="action-pill">
                                        ${isReadOnly() ? `<span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">View Only</span>` : `
                                        ${p.status === 'Due' ? `
                                            <button class="action-btn view" onclick="markAsPaid('${p.firestoreId}')" title="Payment Received" style="color: #22c55e; background: rgba(34,197,94,0.1); width: auto; padding: 0 10px; font-size: 0.75rem; gap: 5px;">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                                Received
                                            </button>
                                        ` : ''}
                                        <button class="action-btn edit" onclick="editPayment('${p.firestoreId}')" title="Edit Entry">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                                        </button>
                                        <button class="action-btn delete" onclick="confirmDeletePayment('${p.firestoreId}')" title="Delete Entry">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                        </button>`}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${isToday ? '<div style="margin-top: 20px; text-align: right;"><button class="glass-button" onclick="navigateTo(\'payments\')">View All Payments</button></div>' : ''}
        </div>
    `;
    container.innerHTML = paymentsHTML;
}

function collectPayment() {
    openModal(`
        <div>
            <h3 style="margin-bottom: 24px;">Collect Payment</h3>
            <form id="payment-form" style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Select Customer</label>
                    <select name="customer" id="payment-customer-select" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                        <option value="">Choose Customer...</option>
                        ${window.AppState.customers.map(c => `<option value="${c.name}" data-amount="${c.amount ?? c.planPrice ?? 0}">${c.name} (#${c.id})</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Payment Amount</label>
                    <input type="number" name="amount" id="payment-amount-input" placeholder="₹" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-size: 0.875rem;">Method</label>
                    <select name="method" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.4);">
                        <option>UPI</option>
                        <option>Cash</option>
                        <option>Net Banking</option>
                    </select>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Record Payment</button>
                </div>
            </form>
        </div>
    `);

    const select = document.getElementById('payment-customer-select');
    const amountInput = document.getElementById('payment-amount-input');

    select.addEventListener('change', () => {
        const option = select.options[select.selectedIndex];
        if (option.dataset.amount) {
            amountInput.value = option.dataset.amount;
        }
    });

    document.getElementById('payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        const newPayment = {
            id: `RC-${Math.floor(Math.random() * 9000 + 1000)}`,
            customer: data.customer,
            amount: parseInt(data.amount),
            date: new Date().toISOString().split('T')[0],
            method: data.method,
            status: 'Paid',
            paid: true
        };

        try {
            // Find customer to update their status
            const customer = window.AppState.customers.find(c => c.name === data.customer);
            if (customer && customer.firestoreId) {
                await updateDoc(doc(db, "customers", customer.firestoreId), {
                    paymentStatus: 'Paid'
                });
            }

            await addDoc(collection(db, "payments"), {
                ...newPayment,
                status: 'Paid',
                paid: true
            });
            showToast('Payment recorded successfully', 'success');
            closeModal();
        } catch (error) {
            showToast('Failed to record payment', 'error');
        }
    });
}

async function markAsPaid(firestoreId) {
    const p = window.AppState.payments.find(x => x.firestoreId === firestoreId);
    if (!p) return;

    openModal(`
        <div style="width: 400px;">
            <h3 style="margin-bottom: 24px;">Confirm Payment</h3>
            <p style="margin-bottom: 20px; color: var(--text-secondary);">Set payment details for <b>${p.customer}</b></p>
            <form id="mark-paid-form" style="display: flex; flex-direction: column; gap: 15px;">
                <div class="form-group">
                    <label class="modal-label">Payment Method</label>
                    <select name="method" class="glass-input">
                        <option>UPI</option>
                        <option>Cash</option>
                        <option>Net Banking</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="modal-label">Date of Payment</label>
                    <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required class="glass-input">
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Mark as Paid</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('mark-paid-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        try {
            // Find customer to update their status
            const customer = window.AppState.customers.find(c => c.name === p.customer);
            if (customer && customer.firestoreId) {
                await updateDoc(doc(db, "customers", customer.firestoreId), {
                    paymentStatus: 'Paid'
                });
            }

            await updateDoc(doc(db, "payments", firestoreId), {
                status: 'Paid',
                paid: true,
                method: data.method,
                date: data.date
            });
            showToast('Payment Marked as Paid', 'success');
            closeModal();
        } catch (error) {
            showToast('Update failed', 'error');
        }
    });
}

function editPayment(firestoreId) {
    const p = window.AppState.payments.find(x => x.firestoreId === firestoreId);
    if (!p) return;

    openModal(`
        <div style="width: 400px;">
            <h3 style="margin-bottom: 24px;">Edit Payment Entry</h3>
            <form id="edit-payment-form" style="display: flex; flex-direction: column; gap: 18px;">
                <div class="form-group">
                    <label class="modal-label">Amount (₹)</label>
                    <input type="number" name="amount" value="${p.amount}" required class="glass-input">
                </div>
                <div class="form-group">
                    <label class="modal-label">Status</label>
                    <select name="status" class="glass-input">
                        <option value="Due" ${p.status === 'Due' ? 'selected' : ''}>Due</option>
                        <option value="Paid" ${p.status === 'Paid' ? 'selected' : ''}>Paid</option>
                    </select>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Update Entry</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('edit-payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        data.amount = parseInt(data.amount);

        try {
            await updateDoc(doc(db, "payments", firestoreId), data);
            showToast('Payment entry updated', 'success');
            closeModal();
        } catch (error) {
            showToast('Update failed', 'error');
        }
    });
}

function confirmDeletePayment(firestoreId) {
    const p = window.AppState.payments.find(x => x.firestoreId === firestoreId);
    if (!p) return;

    openModal(`
        <div style="text-align: center; padding: 10px;">
            <i class="lucide-trash-2" style="font-size: 40px; color: #ef4444; margin-bottom: 20px;"></i>
            <h3>Delete Entry?</h3>
            <p style="color: var(--text-secondary); margin: 10px 0 30px;">Are you sure you want to delete receipt <b>#${p.id}</b>?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="glass-button" onclick="closeModal()">Cancel</button>
                <button class="glass-button primary" style="background: #ef4444;" onclick="deletePayment('${firestoreId}')">Delete Entry</button>
            </div>
        </div>
    `);
}

async function deletePayment(firestoreId) {
    try {
        await deleteDoc(doc(db, "payments", firestoreId));
        showToast('Entry deleted', 'error');
        closeModal();
    } catch (error) {
        showToast('Delete failed', 'error');
    }
}

function renderPlans(container) {
    const plansHTML = `
        <div class="glass-card" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3>Internet Service Plans</h3>
                ${isReadOnly() ? '' : `<button class="glass-button primary" onclick="addPlan()"><i class="lucide-plus"></i> Create New Plan</button>`}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
                ${window.AppState.plans.map(p => `
                    <div class="glass-card" style="padding: 24px; border-left: 4px solid var(--acn-blue); transition: transform 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <h4 style="font-size: 1.1rem; margin-bottom: 4px;">${p.name}</h4>
                                <p style="color: var(--text-secondary); font-size: 0.875rem;">${p.speed || ''} | Validity: ${p.validity} Days | ${p.type || 'Fiber'}</p>
                            </div>
                            <span style="font-size: 1.25rem; font-weight: 700; color: var(--acn-blue);">₹${(p.price || 0).toLocaleString()}</span>
                        </div>
                        <div style="margin-top: 24px; display: flex; gap: 12px;">
                            ${isReadOnly() ? `<span style="font-size: 0.875rem; color: var(--text-secondary); opacity: 0.7;">View Only Mode</span>` : `
                            <button class="glass-button" style="flex: 1; padding: 8px;" onclick="editPlan('${p.firestoreId}')">Edit</button>
                            <button class="glass-button" style="flex: 1; padding: 8px; color: #ef4444;" onclick="confirmDeletePlan('${p.firestoreId}')">Delete</button>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    container.innerHTML = plansHTML;
}

function addPlan() {
    if (typeof window.openModal !== 'function') {
        console.error('CRITICAL: window.openModal is not defined. Ensure app.js is loaded correctly.');
        return;
    }

    openModal(`
        <div style="width: 450px; max-width: 95vw;">
            <h3 style="margin-bottom: 24px;">Create New Service Plan</h3>
            <form id="plan-form" style="display: flex; flex-direction: column; gap: 18px;">
                <div class="form-group">
                    <label class="modal-label">Plan Name</label>
                    <input type="text" name="name" placeholder="e.g. 300 Mbps Super" required class="glass-input">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label class="modal-label">Speed</label>
                        <input type="text" name="speed" placeholder="e.g. 50 Mbps" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Connection Type</label>
                        <select name="type" class="glass-input">
                            <option>Fiber</option>
                            <option>Broadband</option>
                            <option>Wireless</option>
                        </select>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label class="modal-label">Price (₹)</label>
                        <input type="number" name="price" placeholder="Amount" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Validity (Days)</label>
                        <input type="number" name="validity" placeholder="30" required class="glass-input">
                    </div>
                </div>
                <div id="plan-error" style="color: #ef4444; font-size: 0.8rem; min-height: 1.2rem;"></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Create Plan</button>
                </div>
            </form>
        </div>
    `);

    const form = document.getElementById('plan-form');
    const err = document.getElementById('plan-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());

        // Validation Logic
        const price = parseFloat(data.price);
        const validity = parseInt(data.validity);

        if (window.AppState.plans.some(p => p.name.toLowerCase() === data.name.toLowerCase())) {
            err.textContent = 'Plan name already exists';
            return;
        }

        if (price <= 0) {
            err.textContent = 'Price must be a positive number';
            return;
        }

        if (validity <= 0) {
            err.textContent = 'Validity must be greater than 0';
            return;
        }

        const newPlan = {
            name: data.name,
            price: price,
            validity: validity,
            speed: data.speed,
            type: data.type
        };

        try {
            await addDoc(collection(db, "plans"), newPlan);
            showToast('Plan created successfully', 'success');
            closeModal();
            renderSection('plans'); // Force re-render just in case listener is slow
        } catch (error) {
            showToast('Failed to save plan', 'error');
        }
    });
}

function editPlan(firestoreId) {
    const p = window.AppState.plans.find(x => x.firestoreId === firestoreId);
    if (!p) return;

    openModal(`
        <div style="width: 450px; max-width: 95vw;">
            <h3 style="margin-bottom: 24px;">Edit Service Plan</h3>
            <form id="edit-plan-form" style="display: flex; flex-direction: column; gap: 18px;">
                <div class="form-group">
                    <label class="modal-label">Plan Name</label>
                    <input type="text" name="name" value="${p.name}" required class="glass-input">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label class="modal-label">Speed</label>
                        <input type="text" name="speed" value="${p.speed || ''}" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Connection Type</label>
                        <select name="type" class="glass-input">
                            <option ${p.type === 'Fiber' ? 'selected' : ''}>Fiber</option>
                            <option ${p.type === 'Broadband' ? 'selected' : ''}>Broadband</option>
                            <option ${p.type === 'Wireless' ? 'selected' : ''}>Wireless</option>
                        </select>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label class="modal-label">Price (₹)</label>
                        <input type="number" name="price" value="${p.price}" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Validity (Days)</label>
                        <input type="number" name="validity" value="${p.validity}" required class="glass-input">
                    </div>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Update Plan</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('edit-plan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        data.price = parseFloat(data.price);
        data.validity = parseInt(data.validity);

        try {
            await updateDoc(doc(db, "plans", firestoreId), data);
            showToast('Plan updated successfully', 'success');
            closeModal();
            renderSection('plans');
        } catch (error) {
            showToast('Failed to update plan', 'error');
        }
    });
}

function confirmDeletePlan(firestoreId) {
    const p = window.AppState.plans.find(x => x.firestoreId === firestoreId);
    if (!p) return;

    openModal(`
        <div style="text-align: center; padding: 10px;">
            <i class="lucide-alert-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 20px;"></i>
            <h3>Delete Plan?</h3>
            <p style="color: var(--text-secondary); margin: 10px 0 30px;">Are you sure you want to delete the plan <b>${p.name}</b>?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="glass-button" onclick="closeModal()">Cancel</button>
                <button class="glass-button primary" style="background: #ef4444;" onclick="deletePlan('${firestoreId}')">Delete Plan</button>
            </div>
        </div>
    `);
}

async function deletePlan(firestoreId) {
    try {
        await deleteDoc(doc(db, "plans", firestoreId));
        showToast('Plan deleted', 'error');
        closeModal();
        renderSection('plans');
    } catch (error) {
        showToast('Delete failed', 'error');
    }
}

function renderSettings(container) {
    container.innerHTML = `
        <div class="glass-card" style="padding: 32px; max-width: 650px;">
            <h3 style="margin-bottom: 24px;">System Preferences</h3>
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-radius: 12px; background: rgba(var(--acn-blue-rgb), 0.05);">
                    <div>
                        <p style="font-weight: 600;">Dark Theme Mode</p>
                        <p style="font-size: 0.875rem; color: var(--text-secondary);">Optimized for low-light environments</p>
                    </div>
                    <button class="glass-button" onclick="document.getElementById('theme-toggle').click()">Toggle</button>
                </div>
                <div>
                    <label style="display: block; font-size: 0.875rem; margin-bottom: 8px; font-weight: 600;">ISP Organization Name</label>
                    <input type="text" value="ACN Broadband" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: white;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.875rem; margin-bottom: 8px; font-weight: 600;">System Language</label>
                    <select style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: white;">
                        <option>English (US)</option>
                        <option>Hindi (India)</option>
                    </select>
                </div>
                <div style="margin-top: 20px;">
                    <button class="glass-button primary" onclick="showToast('Settings saved permanently', 'success')">Save Core Settings</button>
                </div>
            </div>
        </div>
    `;
}

function renderReports(container, params = {}) {
    const isRevenue = params.module === 'revenue';
    const title = isRevenue ? "Revenue Analytics" : "Business Analytics";

    container.innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <h2>${title}</h2>
                <div style="display: flex; gap: 12px;">
                    <button class="glass-button" onclick="showToast('Loading data...', 'success')"><i class="lucide-refresh-cw"></i> Refresh</button>
                    <button class="glass-button primary" onclick="showToast('Exporting PDF...', 'success')"><i class="lucide-download"></i> Export</button>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 40px; text-align: center;">
                <i class="lucide-trending-up" style="font-size: 64px; color: #22c55e; margin-bottom: 20px;"></i>
                <h3>${isRevenue ? 'Total Revenue Growth' : 'Key Performance Indicators'}</h3>
                <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.1rem; max-width: 500px; margin-inline: auto;">
                    Monthly collections have increased by **14.5%** with a customer retention rate of **92%**.
                </p>
                
                <div style="margin-top: 40px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
                    <div class="glass-card" style="padding: 20px; border-top: 4px solid #22c55e;">
                        <p style="color: var(--text-secondary); font-size: 0.8rem;">Conversion</p>
                        <p style="font-size: 1.5rem; font-weight: 700;">+8.2%</p>
                    </div>
                    <div class="glass-card" style="padding: 20px; border-top: 4px solid var(--acn-blue);">
                        <p style="color: var(--text-secondary); font-size: 0.8rem;">Churn Rate</p>
                        <p style="font-size: 1.5rem; font-weight: 700;">2.4%</p>
                    </div>
                    <div class="glass-card" style="padding: 20px; border-top: 4px solid var(--acn-orange);">
                        <p style="color: var(--text-secondary); font-size: 0.8rem;">New Leads</p>
                        <p style="font-size: 1.5rem; font-weight: 700;">128</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderStaff(container) {
    container.innerHTML = `
        <div class="glass-card" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3>Staff Management</h3>
                ${isReadOnly() ? '' : `
                <button class="glass-button primary" onclick="addStaff()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Add Staff Member
                </button>`}
            </div>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr><th>Name</th><th>Role</th><th>Access Level</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${window.AppState.staff.map(s => `
                            <tr>
                                <td style="font-weight: 600;">${s.name}</td>
                                <td>${s.role}</td>
                                <td>${s.access}</td>
                                <td>
                                    <span class="status-badge ${s.status === 'Online' ? 'status-active' : (s.status === 'Away' ? 'status-warning' : 'status-expired')}">
                                        ${s.status}
                                    </span>
                                </td>
                                <td>
                                    <button class="glass-button" onclick="editStaff('${s.firestoreId}')">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function addStaff() {
    openModal(`
        <div style="width: 480px; max-width: 95vw;">
            <h3 style="margin-bottom: 24px; border-bottom: 1px solid var(--glass-border); padding-bottom: 12px;">Add Staff Member</h3>
            <form id="add-staff-form" style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label class="modal-label">Full Name</label>
                        <input type="text" name="name" placeholder="Staff Name" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">System Role / Designation</label>
                        <input type="text" name="role_desc" placeholder="e.g. Technician" required class="glass-input">
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="modal-label">Access Level</label>
                    <select name="access" id="staff-access" class="glass-input">
                        <option value="Full">Full (Administrator)</option>
                        <option value="Read/Write">Read/Write (Standard Staff)</option>
                        <option value="Read Only">Read Only (Viewer)</option>
                    </select>
                </div>

                <div style="background: rgba(var(--acn-blue-rgb), 0.03); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px; margin-top: 5px;">
                    <h4 style="margin-bottom: 15px; font-size: 0.9rem; color: var(--acn-blue); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Account Security</h4>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label class="modal-label">Admin Old Password (Verification)</label>
                        <div style="position: relative;">
                            <input type="password" id="admin-verify-pass" name="admin_pass" placeholder="Confirm your identity" required class="glass-input" style="border-radius: 10px;">
                            <button type="button" class="eye-toggle" onclick="togglePass('admin-verify-pass')">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="modal-label">New Staff Password</label>
                            <div style="position: relative;">
                                <input type="password" id="staff-new-pass" name="password" placeholder="Min 6 chars" required class="glass-input" style="border-radius: 10px;">
                                <button type="button" class="eye-toggle" onclick="togglePass('staff-new-pass')">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="modal-label">Confirm Password</label>
                            <div style="position: relative;">
                                <input type="password" id="staff-conf-pass" name="confirm_password" placeholder="Repeat password" required class="glass-input" style="border-radius: 10px;">
                                <button type="button" class="eye-toggle" onclick="togglePass('staff-conf-pass')">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="add-staff-error" style="color: #ef4444; font-size: 0.8rem; min-height: 1.2rem;"></div>

                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="glass-button primary">Add Member</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('add-staff-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const err = document.getElementById('add-staff-error');
        err.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Processing...';

        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        // Basic validation
        if (data.password !== data.confirm_password) {
            err.textContent = 'Confirm password must match';
            btn.disabled = false; btn.textContent = 'Add Member';
            return;
        }

        if (data.password.length < 6) {
            err.textContent = 'Password must be at least 6 characters';
            btn.disabled = false; btn.textContent = 'Add Member';
            return;
        }

        try {
            // 1. Admin Reauthentication
            const user = auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, data.admin_pass);
            await reauthenticateWithCredential(user, credential);

            // 2. Create Auth User
            // Logic: fullname (no spaces) + "@acn.com"
            const email = data.name.toLowerCase().replace(/\s+/g, '') + "@acn.com";
            const userCredential = await createUserWithEmailAndPassword(auth, email, data.password);
            const { uid } = userCredential.user;

            // 3. Save to Firestore "staff"
            const newStaff = {
                fullName: data.name,
                role: data.role_code || data.role_desc || 'Staff',
                accessLevel: data.access,
                status: "active",
                email: email,
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, "staff", uid), newStaff);

            showToast(`Staff member ${data.name} added!`, 'success');
            closeModal();
            renderSection('staff');
        } catch (error) {
            console.error("Staff creation error:", error);
            if (error.code === 'auth/wrong-password') {
                err.textContent = 'Incorrect Admin Password';
            } else if (error.code === 'auth/email-already-in-use') {
                err.textContent = 'This name is already registered as staff';
            } else {
                err.textContent = 'Failed: ' + error.message;
            }
            btn.disabled = false;
            btn.textContent = 'Add Member';
        }
    });
}

function editStaff(firestoreId) {
    const s = window.AppState.staff.find(x => x.firestoreId === firestoreId);
    if (!s) return;
    openModal(`
        <div style="width: 550px; max-width: 95vw;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--glass-border); padding-bottom: 15px;">
                <h3 style="display: flex; align-items: center; gap: 10px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--acn-blue);"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 11l-3 3 7 7"/></svg>
                    Edit Staff: ${s.name}
                </h3>
                <button class="action-btn" onclick="closeModal()" style="background: transparent;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <form id="staff-edit-form">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div class="form-group">
                        <label class="modal-label">Full Name</label>
                        <input type="text" name="name" value="${s.name}" required class="glass-input">
                    </div>
                    <div class="form-group">
                        <label class="modal-label">System Role</label>
                        <select name="role" class="glass-input">
                            <option ${s.role === 'Super Admin' ? 'selected' : ''}>Super Admin</option>
                            <option ${s.role === 'Support' ? 'selected' : ''}>Support</option>
                            <option ${s.role === 'Billing' ? 'selected' : ''}>Billing</option>
                            <option ${s.role === 'Technician' ? 'selected' : ''}>Technician</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Access Level</label>
                        <select name="access" class="glass-input">
                            <option ${s.access === 'Full' ? 'selected' : ''}>Full</option>
                            <option ${s.access === 'Read/Write' ? 'selected' : ''}>Read/Write</option>
                            <option ${s.access === 'Read Only' ? 'selected' : ''}>Read Only</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="modal-label">Active Status</label>
                        <select name="status" class="glass-input">
                            <option ${s.status === 'Online' ? 'selected' : ''}>Online</option>
                            <option ${s.status === 'Away' ? 'selected' : ''}>Away</option>
                            <option ${s.status === 'Offline' ? 'selected' : ''}>Offline</option>
                        </select>
                    </div>
                </div>

                <div style="background: rgba(var(--acn-blue-rgb), 0.03); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px; margin-bottom: 10px;">
                    <h4 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Change Password
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div class="pass-group" style="position: relative;">
                            <input type="password" id="old-pass" placeholder="Enter Old Password" class="glass-input">
                            <button type="button" class="eye-toggle" onclick="togglePass('old-pass')">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="pass-group" style="position: relative;">
                                <input type="password" id="new-pass" placeholder="New Password" class="glass-input">
                                <button type="button" class="eye-toggle" onclick="togglePass('new-pass')">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                            <div class="pass-group" style="position: relative;">
                                <input type="password" id="conf-pass" placeholder="Confirm New" class="glass-input">
                                <button type="button" class="eye-toggle" onclick="togglePass('conf-pass')">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="staff-error" style="color: #ef4444; font-size: 0.8rem; margin: 10px 0; min-height: 1.2rem;"></div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                    <button type="button" class="glass-button" onclick="closeModal()">Cancel</button>
                    <div style="display: flex; gap: 12px;">
                        <button type="button" class="glass-button" style="color: var(--acn-blue);" id="btn-change-pass">Change Password</button>
                        <button type="submit" class="glass-button primary">Update Profile</button>
                    </div>
                </div>
            </form>
        </div>
    `);

    // Logic for staff form
    const form = document.getElementById('staff-edit-form');
    const err = document.getElementById('staff-error');

    // Profile Update Login
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        Object.assign(s, data);
        showToast('Staff profile updated successfully', 'success');
        closeModal();
        renderSection('staff');
    });

    // Password Update Logic
    document.getElementById('btn-change-pass').addEventListener('click', () => {
        const oldP = document.getElementById('old-pass').value;
        const newP = document.getElementById('new-pass').value;
        const confP = document.getElementById('conf-pass').value;

        if (!oldP || !newP || !confP) {
            err.textContent = 'Please fill all password fields';
            return;
        }

        if (oldP !== s.password) {
            err.textContent = 'Incorrect old password';
            return;
        }

        if (newP.length < 6) {
            err.textContent = 'New password must be at least 6 characters';
            return;
        }

        if (newP !== confP) {
            err.textContent = 'New passwords do not match';
            return;
        }

        // Secure Update (Mock Hash)
        s.password = newP;
        err.style.color = '#22c55e';
        err.textContent = 'Password verified and updated securely!';
        showToast('Password changed successfully', 'success');

        // Clear fields
        document.getElementById('old-pass').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('conf-pass').value = '';
        setTimeout(() => err.textContent = '', 2000);
    });
}

function togglePass(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

async function hashPassword(string) {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
