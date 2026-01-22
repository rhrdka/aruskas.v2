// ================= CONFIG & STATE =================
// PASTIKAN URL INI SUDAH YANG TERBARU DARI DEPLOYMENT GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbx4kBUmk0MkbPq1C_4Vi1I6BSmVLLAD3IenNBNmRfGMs5Ae3l4QerEZypRnXwuJEnNolQ/exec';

let state = {
    user: JSON.parse(localStorage.getItem('user')) || null,
    transactions: [],
    currentType: 'income',
    editingId: null,
    charts: {},
    theme: localStorage.getItem('theme') || 'light'
};

const CATEGORIES = {
    income: ['Gaji', 'Bonus', 'Investasi', 'Freelance', 'Lainnya', 'Dividen'],
    expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Amal', 'Cicilan', 'Lainnya']
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    initTheme(); 
    
    if (state.user) {
        initApp();
    } else {
        document.getElementById('authContainer').classList.remove('hidden');
    }
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateEl = document.getElementById('currentDate');
    if(dateEl) dateEl.textContent = new Date().toLocaleDateString('id-ID', options);

    const amountInput = document.getElementById('amountInput');
    if(amountInput) {
        amountInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if(val) e.target.value = parseInt(val).toLocaleString('id-ID');
        });
    }
});

// ================= THEME ENGINE =================
function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
    if (state.transactions.length > 0) renderCharts();
}

function updateThemeIcon() {
    const btnText = document.getElementById('themeText');
    const btnIcon = document.getElementById('themeIcon');
    if (state.theme === 'dark') {
        if(btnText) btnText.textContent = 'Light Mode';
        if(btnIcon) btnIcon.className = 'ph ph-sun';
    } else {
        if(btnText) btnText.textContent = 'Dark Mode';
        if(btnIcon) btnIcon.className = 'ph ph-moon';
    }
}

// ================= AUTHENTICATION =================
function toggleAuth(mode) {
    const login = document.getElementById('loginFormSection');
    const register = document.getElementById('registerFormSection');
    if(mode === 'register') { login.classList.add('hidden'); register.classList.remove('hidden'); }
    else { register.classList.add('hidden'); login.classList.remove('hidden'); }
}

async function handleAuth(action, data) {
    const btn = document.getElementById(`${action}Btn`);
    const txt = btn.innerHTML;
    btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Memproses...`;
    btn.disabled = true;

    try {
        const res = await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action, ...data }) 
        });
        
        const responseText = await res.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.error("Server Response Error:", responseText);
            throw new Error("Respon server tidak valid.");
        }
        
        if (result.status === 'success') {
            if (action === 'register') {
                showToast('Pendaftaran berhasil! Silakan login.', 'success');
                toggleAuth('login');
            } else {
                state.user = result.data;
                localStorage.setItem('user', JSON.stringify(state.user));
                initApp();
                showToast(`Selamat datang, ${state.user.name}!`, 'success');
            }
        } else {
            showToast(result.message || 'Gagal login', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = txt;
        btn.disabled = false;
    }
}

const loginForm = document.getElementById('loginForm');
if(loginForm) {
    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        handleAuth('login', { email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value });
    });
}

const registerForm = document.getElementById('registerForm');
if(registerForm) {
    registerForm.addEventListener('submit', e => {
        e.preventDefault();
        handleAuth('register', { name: document.getElementById('registerName').value, email: document.getElementById('registerEmail').value, password: document.getElementById('registerPassword').value });
    });
}

function logout() { localStorage.removeItem('user'); location.reload(); }

// ================= APP LOGIC =================
function initApp() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    document.getElementById('userName').textContent = state.user.name;
    document.getElementById('userEmail').textContent = state.user.email;
    document.getElementById('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();

    loadTransactions();
    updateCategorySelect();
    document.getElementById('dateInput').valueAsDate = new Date();
}

async function loadTransactions() {
    const list = document.getElementById('recentTransactionsList');
    if(list) list.innerHTML = `<div class="loading-skeleton" style="height: 60px; margin-bottom: 12px;"></div>`.repeat(4);
    
    try {
        const res = await fetch(`${API_URL}?action=getTransactions&email=${state.user.email}`);
        const responseText = await res.text();
        let result;
        
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.warn("Gagal parse history:", responseText);
            return; 
        }

        if (result.status === 'success') {
            state.transactions = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            updateUI();
        } 
    } catch (err) { 
        console.error(err);
        showToast('Gagal memuat riwayat. Cek internet.', 'error');
    }
}

function updateUI() {
    updateDashboard();
    renderCharts();
    renderTransactions(state.transactions.slice(0, 5), 'recentTransactionsList');
    renderTransactions(state.transactions, 'fullTransactionList');
    performAnalysis();
}

// ================= FORM SUBMISSION (LOADING & ROBUST FETCH) =================
document.getElementById('transactionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const rawAmount = document.getElementById('amountInput').value.replace(/\./g, '');
    if(!rawAmount || rawAmount == 0) return showToast('Jumlah tidak boleh nol', 'error');

    // Show Loading
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.remove('hidden');

    // Prepare Data with Time
    const dateInputVal = document.getElementById('dateInput').value;
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const fullDateTime = `${dateInputVal} ${timeString}`;

    const id = state.editingId || Date.now();
    const payload = {
        action: 'addTransaction',
        email: state.user.email,
        id: id,
        type: state.currentType,
        amount: parseInt(rawAmount),
        category: document.getElementById('categoryInput').value,
        date: fullDateTime,
        description: document.getElementById('notesInput').value || document.getElementById('categoryInput').value,
        notes: document.getElementById('notesInput').value
    };

    // Optimistic Update
    state.transactions = state.transactions.filter(t => t.id !== id);
    state.transactions.unshift(payload);
    updateUI();
    cancelEdit();
    switchPage('dashboard', document.querySelector('.nav-item')); 

    try {
        const res = await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify(payload)
        });
        
        const responseText = await res.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.warn("Non-JSON response, assuming success:", responseText);
        }

        if (result && result.status === 'error') {
            throw new Error(result.message);
        } else {
            showToast(state.editingId ? 'Data diperbarui' : 'Tersimpan', 'success');
        }

    } catch (err) {
        console.error("Sync Error:", err);
        showToast('Data tersimpan di perangkat (Sync pending)', 'success');
    } finally {
        // Hide Loading
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
        }, 500);
    }
});

// ================= LIST & ACTIONS (WITH TIME) =================
function renderTransactions(data, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;

    if (data.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-sub);">
                <i class="ph ph-receipt" style="font-size: 40px; margin-bottom: 10px; opacity:0.5;"></i>
                <p>Belum ada data transaksi.</p>
            </div>`;
        return;
    }

    container.innerHTML = data.map(t => {
        const dateObj = new Date(t.date);
        const dateStr = dateObj.toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: '2-digit'});
        const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        const iconClass = getIconCategory(t.category);
        
        return `
        <div class="transaction-row">
            <div class="t-icon" style="background: ${t.type === 'income' ? 'rgba(16,185,129,0.1); color:#10b981' : 'rgba(239,68,68,0.1); color:#ef4444'}">
                <i class="ph ${iconClass}"></i>
            </div>
            <div class="t-main">
                <h4>${t.description}</h4>
                <div class="t-sub">
                    <span>${t.category}</span>
                    <span style="display: inline-block; width: 4px; height: 4px; background: var(--text-sub); border-radius: 50%; margin: 0 5px; opacity: 0.5;"></span>
                    <span class="mobile-date" style="font-size: 0.8rem;">${dateStr}</span>
                </div>
            </div>
            <div class="t-date">
                ${dateStr} <span class="t-time">${timeStr}</span>
            </div>
            <div class="t-amount" style="color: ${t.type === 'income' ? 'var(--success)' : 'var(--danger)'}">
                ${t.type === 'income' ? '+' : '-'} ${formatRupiah(t.amount, false)}
            </div>
            <div class="t-actions">
                <div class="action-btn-group">
                    <button class="btn-icon" onclick="editTransaction(${t.id})" title="Edit">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-icon delete" onclick="deleteTransaction(${t.id})" title="Hapus">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}

function editTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if(!tx) return;
    
    state.editingId = id;
    state.currentType = tx.type;
    setType(tx.type); 
    
    document.getElementById('amountInput').value = tx.amount.toLocaleString('id-ID');
    document.getElementById('categoryInput').value = tx.category;
    // Handle date format safely
    try {
        const d = new Date(tx.date);
        const isoDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('dateInput').value = isoDate;
    } catch(e) {
        document.getElementById('dateInput').valueAsDate = new Date();
    }
    
    document.getElementById('notesInput').value = tx.notes || '';

    const title = document.getElementById('formTitle');
    const btnText = document.getElementById('btnSubmitText');
    const cancelBox = document.getElementById('cancelEditContainer');

    if(title) title.textContent = 'Edit Transaksi';
    if(btnText) btnText.textContent = 'PERBARUI DATA';
    if(cancelBox) cancelBox.classList.remove('hidden');

    switchPage('input');
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function cancelEdit() {
    state.editingId = null;
    const form = document.getElementById('transactionForm');
    if(form) form.reset();
    
    document.getElementById('dateInput').valueAsDate = new Date();
    
    const title = document.getElementById('formTitle');
    const btnText = document.getElementById('btnSubmitText');
    const cancelBox = document.getElementById('cancelEditContainer');
    
    if(title) title.textContent = 'Input Transaksi Baru';
    if(btnText) btnText.textContent = 'SIMPAN TRANSAKSI';
    if(cancelBox) cancelBox.classList.add('hidden');
}

async function deleteTransaction(id) {
    if(!confirm('Apakah Anda yakin ingin menghapus data ini secara permanen?')) return;
    
    // Optimistic Delete
    const originalData = [...state.transactions];
    state.transactions = state.transactions.filter(t => t.id !== id);
    updateUI(); 

    try {
        await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'deleteTransaction', id, email: state.user.email }) 
        });
        showToast('Data berhasil dihapus', 'success');
    } catch (err) {
        console.warn('Delete response error', err);
    }
}

// ================= DASHBOARD & CHARTS =================
function updateDashboard() {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const monthTx = state.transactions.filter(t => t.date.startsWith(currentMonth));
    
    const income = monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = income - expense;
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

    animateValue('dashIncome', income);
    animateValue('dashExpense', expense);
    animateValue('dashBalance', balance);
    const savEl = document.getElementById('dashSavings');
    if(savEl) savEl.textContent = savingsRate.toFixed(1) + '%';
}

function animateValue(id, end) {
    const obj = document.getElementById(id);
    if(!obj) return;
    obj.textContent = formatRupiah(end); 
}

function renderCharts() {
    const ctxMain = document.getElementById('mainChart');
    if(!ctxMain) return; 

    const isDark = state.theme === 'dark';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const months = {};
    const today = new Date();
    for(let i=5; i>=0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        months[key] = { income: 0, expense: 0, label: d.toLocaleDateString('id-ID', {month:'short'}) };
    }

    state.transactions.forEach(t => {
        const m = t.date.slice(0, 7);
        if (months[m]) months[m][t.type] += t.amount;
    });

    const labels = Object.values(months).map(m => m.label);
    const dataInc = Object.values(months).map(m => m.income);
    const dataExp = Object.values(months).map(m => m.expense);

    const ctx = ctxMain.getContext('2d');
    let gradInc = ctx.createLinearGradient(0, 0, 0, 400);
    gradInc.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradInc.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    let gradExp = ctx.createLinearGradient(0, 0, 0, 400);
    gradExp.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    gradExp.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    if (state.charts.main) state.charts.main.destroy();
    state.charts.main = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Pemasukan', data: dataInc, borderColor: '#10b981', backgroundColor: gradInc, fill: true, tension: 0.4, borderWidth: 2 },
                { label: 'Pengeluaran', data: dataExp, borderColor: '#ef4444', backgroundColor: gradExp, fill: true, tension: 0.4, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: textColor } } },
            scales: { 
                y: { grid: { color: gridColor }, ticks: { color: textColor } }, 
                x: { grid: { display: false }, ticks: { color: textColor } } 
            }
        }
    });

    const ctxDoughnut = document.getElementById('doughnutChart');
    if(ctxDoughnut) {
        const cats = {};
        state.transactions.filter(t => t.type === 'expense').forEach(t => cats[t.category] = (cats[t.category] || 0) + t.amount);
        
        if (state.charts.doughnut) state.charts.doughnut.destroy();
        state.charts.doughnut = new Chart(ctxDoughnut, {
            type: 'doughnut',
            data: {
                labels: Object.keys(cats),
                datasets: [{
                    data: Object.values(cats),
                    backgroundColor: ['#4361ee', '#3a0ca3', '#4cc9f0', '#f72585', '#7209b7', '#f59e0b', '#10b981'],
                    borderWidth: 0, hoverOffset: 4
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '75%', 
                plugins: { legend: { display: false } } 
            }
        });
    }
}

// ================= ANALYTICS =================
function performAnalysis() {
    const tx = state.transactions;
    if (tx.length === 0) return;

    const totalInc = tx.filter(t => t.type === 'income').reduce((a,b)=>a+b.amount,0);
    const totalExp = tx.filter(t => t.type === 'expense').reduce((a,b)=>a+b.amount,0);

    const today = new Date();
    const currentMonthStr = today.toISOString().slice(0, 7);
    const daysPassed = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
    
    const monthExpTx = tx.filter(t => t.date.startsWith(currentMonthStr) && t.type === 'expense');
    const monthExpTotal = monthExpTx.reduce((a,b)=>a+b.amount, 0);
    
    const dailyAvg = daysPassed > 0 ? monthExpTotal / daysPassed : 0;
    const projection = dailyAvg * daysInMonth;

    const elAvg = document.getElementById('anaDailyAvg');
    const elProj = document.getElementById('anaProjection');
    if(elAvg) elAvg.textContent = formatRupiah(dailyAvg);
    if(elProj) elProj.textContent = formatRupiah(projection);

    const maxTx = [...tx].sort((a,b)=>b.amount - a.amount)[0];
    if(maxTx) {
        const elMax = document.getElementById('anaMaxTx');
        const elMaxName = document.getElementById('anaMaxTxName');
        if(elMax) elMax.textContent = formatRupiah(maxTx.amount);
        if(elMaxName) elMaxName.textContent = maxTx.description;
    }

    let score = 50;
    const ratio = totalInc > 0 ? (totalExp / totalInc) : 1;
    if (ratio < 0.5) score += 30; 
    else if (ratio < 0.8) score += 10; 
    else if (ratio > 1.0) score -= 30; 
    if(totalInc > totalExp) score += 10;
    score = Math.max(0, Math.min(100, score));
    
    const scoreEl = document.getElementById('anaHealthScore');
    if(scoreEl) {
        scoreEl.textContent = score + '/100';
        scoreEl.style.color = score > 70 ? 'var(--success)' : (score > 40 ? 'var(--warning)' : 'var(--danger)');
    }

    const catMap = {};
    tx.filter(t => t.type === 'expense').forEach(t => catMap[t.category] = (catMap[t.category] || 0) + t.amount);
    const sortedCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0, 5);
    
    const topCatList = document.getElementById('topCategoriesList');
    if(topCatList) {
        topCatList.innerHTML = sortedCats.map(([cat, val], i) => {
            const maxVal = sortedCats[0][1] || 1;
            const pct = (val / maxVal) * 100;
            return `
            <div style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 0.9rem;">
                    <span style="font-weight:600;">${i+1}. ${cat}</span>
                    <span style="font-weight:700;">${formatRupiah(val)}</span>
                </div>
                <div style="width:100%; height:8px; background:var(--bg-body); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--primary); border-radius:4px;"></div>
                </div>
            </div>`;
        }).join('');
    }

    const radarEl = document.getElementById('radarChart');
    if(radarEl) {
        if(state.charts.radar) state.charts.radar.destroy();
        
        const isDark = state.theme === 'dark';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        state.charts.radar = new Chart(radarEl, {
            type: 'radar',
            data: {
                labels: ['Hemat', 'Investasi', 'Pemasukan', 'Kesehatan', 'Konsistensi'],
                datasets: [{
                    label: 'Metrik',
                    data: [
                        (1-ratio) * 100, 
                        Math.min(100, (catMap['Investasi'] || 0) / (totalInc || 1) * 500), 
                        Math.min(100, totalInc / 10000000 * 100), 
                        score, 
                        80 
                    ],
                    backgroundColor: 'rgba(67, 97, 238, 0.2)',
                    borderColor: '#4361ee',
                    pointBackgroundColor: '#4361ee'
                }]
            },
            options: {
                scales: {
                    r: {
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: { color: textColor, font: { size: 12 } },
                        suggestedMin: 0, suggestedMax: 100
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function showExpenseAnalysis() {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const daysPassed = now.getDate();
    
    const monthTx = state.transactions.filter(t => t.date.startsWith(currentMonth));
    const expense = monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const avg = expense / daysPassed;
    
    alert(`ANALISIS CEPAT:\n\nPengeluaran Bulan Ini: ${formatRupiah(expense)}\nRata-rata per hari: ${formatRupiah(avg)}`);
}

// ================= HELPERS & FILTER =================
function setType(type) {
    state.currentType = type;
    const btnInc = document.getElementById('btnTypeIncome');
    const btnExp = document.getElementById('btnTypeExpense');
    
    if(btnInc && btnExp) {
        if(type === 'income') {
            btnInc.classList.add('active'); btnInc.style.borderColor = 'var(--primary)';
            btnExp.classList.remove('active'); btnExp.style.borderColor = 'var(--border-color)';
        } else {
            btnExp.classList.add('active'); btnExp.style.borderColor = 'var(--primary)';
            btnInc.classList.remove('active'); btnInc.style.borderColor = 'var(--border-color)';
        }
    }
    updateCategorySelect();
}

function updateCategorySelect() {
    const select = document.getElementById('categoryInput');
    if(select) {
        select.innerHTML = '<option value="">Pilih Kategori</option>';
        CATEGORIES[state.currentType].forEach(cat => select.innerHTML += `<option value="${cat}">${cat}</option>`);
    }
}

function switchPage(pageId, btn) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(pageId + 'Page');
    if(target) target.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    
    const titles = { dashboard: 'Dashboard Overview', input: 'Input Data', history: 'Riwayat Transaksi', analytics: 'Analisis Finansial' };
    const titleEl = document.getElementById('pageTitle');
    if(titleEl) titleEl.textContent = titles[pageId] || 'Dashboard';

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.sidebar-overlay').classList.remove('active');
    }
    window.scrollTo({top: 0});
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function formatRupiah(num, withSymbol = true) {
    return (withSymbol ? 'Rp ' : '') + Math.round(num).toLocaleString('id-ID');
}

function getIconCategory(cat) {
    const map = { 
        'Gaji': 'ph-money', 'Makanan': 'ph-hamburger', 'Transportasi': 'ph-car',
        'Belanja': 'ph-shopping-bag', 'Hiburan': 'ph-film-strip', 'Investasi': 'ph-trend-up',
        'Kesehatan': 'ph-heartbeat', 'Pendidikan': 'ph-student', 'Cicilan': 'ph-credit-card',
        'Service': 'ph-wrench' 
    };
    return map[cat] || 'ph-receipt';
}

function showToast(msg, type) {
    const existing = document.querySelector('.notification-toast');
    if(existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.style.borderLeftColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
    toast.innerHTML = `<i class="ph ${type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${type==='success'?'var(--success)':'var(--danger)'}; font-size:1.5rem;"></i> <div><strong>${type==='success'?'Berhasil':'Info'}</strong><div style="font-size:0.9rem;">${msg}</div></div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Filtering
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyFilter();
    });
});
const searchBox = document.getElementById('searchBox');
if(searchBox) searchBox.addEventListener('input', applyFilter);

function applyFilter() {
    const activeBtn = document.querySelector('.filter-btn.active');
    const type = activeBtn ? activeBtn.dataset.filter : 'all';
    
    const searchBox = document.getElementById('searchBox');
    const search = searchBox ? searchBox.value.toLowerCase() : '';
    
    const filtered = state.transactions.filter(t => {
        const matchType = type === 'all' || t.type === type;
        const matchSearch = t.description.toLowerCase().includes(search) || t.category.toLowerCase().includes(search);
        return matchType && matchSearch;
    });
    renderTransactions(filtered, 'fullTransactionList');
}

function exportCSV() {
    const csvContent = "data:text/csv;charset=utf-8," + "Tanggal,Tipe,Kategori,Deskripsi,Jumlah\n" + state.transactions.map(e => `${e.date},${e.type},${e.category},${e.description},${e.amount}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cashflow_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
}