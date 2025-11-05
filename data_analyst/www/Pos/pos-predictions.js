// POS Predictions Dashboard - Fixed: Manual Fetch Only
(function() {
    'use strict';

    // Variabel global
    let predictions = null;
    let chartInstances = {};
    let autoSlideInterval = null;
    let allCompanies = []; // Cache untuk daftar company

    /**
     * Titik awal: Dijalankan saat halaman selesai dimuat
     */
    document.addEventListener('DOMContentLoaded', function() {
        initDashboard();
    });

    /**
     * Menyiapkan semua listener dan memanggil data awal
     */
    function initDashboard() {
        initFormListeners();
        initCompanySelect();
        initPosSelect();
        fetchCompanyList();
        // REMOVED: Tidak ada auto-fetch saat page load
    }

    /**
     * Menyiapkan listener untuk form submit SAJA
     */
    function initFormListeners() {
        // Listener untuk company change - hanya update POS dropdown
        document.getElementById('company').addEventListener('change', () => {
            updatePosProfiles();
        });

        // Listener untuk form submit - SATU-SATUNYA trigger untuk fetch
        const form = document.getElementById('prediction-form');
        if(form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                triggerFetch(); // Fetch hanya saat submit
            });
        }
    }

    /**
     * Mengumpulkan semua nilai filter dan memanggil API
     */
    function triggerFetch() {
        const company = document.getElementById('company').value;
        const pos_profiles = document.getElementById('pos_profiles').value;
        const date_from = document.getElementById('date_from').value;
        const date_to = document.getElementById('date_to').value;
        const prediction_days = document.getElementById('prediction_days').value;

        // Validasi: Company wajib diisi
        if (!company) {
            showError('Please select a Company first');
            return; 
        }

        // Lolos validasi, panggil API
        fetchPredictions({
            company: company,
            pos_profiles: pos_profiles,
            date_from: date_from,
            date_to: date_to,
            prediction_days: prediction_days || 30
        });
    }

    /**
     * Fungsi utama untuk memanggil API prediksi
     */
    function fetchPredictions(params) {
        showLoading(true);
        hideError();
        clearResults(); 

        const url = '/api/method/data_analyst.api.pos.get_pos_predictions';
        const queryParams = new URLSearchParams();
        queryParams.append('company', params.company);
        
        if (params.pos_profiles) {
            const profiles = params.pos_profiles.split(',').map(p => p.trim()).filter(p => p);
            if (profiles.length > 0) {
                queryParams.append('pos_profiles', JSON.stringify(profiles)); 
            }
        }
        
        if (params.date_from) queryParams.append('date_from', params.date_from);
        if (params.date_to) queryParams.append('date_to', params.date_to);
        queryParams.append('prediction_days', params.prediction_days);

        fetch(`${url}?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': getCookie('csrf_token') }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { 
                    throw new Error(err.message || 'Network response was not ok');
                });
            }
            return response.json();
        })
        .then(data => {
            showLoading(false);
            if (data.message) {
                predictions = data.message;
                renderResults();
            } else {
                showError('No data received from API');
            }
        })
        .catch(error => {
            showLoading(false);
            showError('Failed to fetch predictions: ' + error.message);
            console.error('Error:', error);
        });
    }

    // --- FITUR 1: DROPDOWN COMPANY (KUSTOM & SEARCHABLE) ---

    function initCompanySelect() {
        const btn = document.getElementById('company-select-btn');
        const dropdown = document.getElementById('company-select-dropdown');
        const hiddenInput = document.getElementById('company');
        const label = document.getElementById('company-select-label');
        const searchInput = document.getElementById('company-search');
        const optionsList = document.getElementById('company-options-list');

        btn.addEventListener('click', () => {
            const isVisible = dropdown.style.display === 'flex';
            dropdown.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                searchInput.focus();
            }
        });

        // Search filter
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = allCompanies.filter(company => 
                company.name.toLowerCase().includes(searchTerm)
            );
            populateCompanyDropdown(filtered);
        });

        // Item selection
        optionsList.addEventListener('click', (e) => {
            const item = e.target.closest('.select-option-item');
            if (item) {
                const value = item.dataset.value;
                hiddenInput.value = value;
                label.textContent = value;
                dropdown.style.display = 'none';
                searchInput.value = '';
                populateCompanyDropdown(allCompanies);
                
                // Trigger change event
                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
    
    function fetchCompanyList() {
        const url = '/api/resource/Company'; 
        fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': getCookie('csrf_token') }
        })
        .then(response => response.json())
        .then(data => {
            if (data.data) { 
                allCompanies = data.data;
                populateCompanyDropdown(allCompanies);
            }
        })
        .catch(error => console.error('Error fetching company list:', error));
    }

    function populateCompanyDropdown(companies) {
        const optionsList = document.getElementById('company-options-list');
        const currentValue = document.getElementById('company').value;
        if (!optionsList) return;
        optionsList.innerHTML = '';

        if (companies.length === 0) {
            optionsList.innerHTML = '<span style="padding: 10px; display: block; color: #7f8c8d;">No matching company</span>';
            return;
        }

        companies.forEach(company => {
            const item = document.createElement('div');
            item.className = 'select-option-item';
            item.dataset.value = company.name;
            item.textContent = company.name;
            if (company.name === currentValue) {
                item.classList.add('selected');
            }
            optionsList.appendChild(item);
        });
    }

    // --- FITUR 2: MULTI-SELECT POS PROFILE (KUSTOM) ---

    function initPosSelect() {
        const btn = document.getElementById('pos-select-btn');
        const dropdown = document.getElementById('pos-select-dropdown');
        const hiddenInput = document.getElementById('pos_profiles');
        const label = document.getElementById('pos-select-label');

        btn.addEventListener('click', () => {
            if (btn.classList.contains('disabled')) return;
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });

        // Event listener for checkbox changes
        dropdown.addEventListener('change', () => {
            const selected = [];
            const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
            
            checkboxes.forEach(cb => selected.push(cb.value));
            
            hiddenInput.value = selected.join(',');
            
            if (selected.length === 0) label.textContent = 'Select profiles...';
            else if (selected.length === 1) label.textContent = selected[0];
            else label.textContent = `${selected.length} profiles selected`;
            
            // NO FETCH - hanya update label
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function fetchPosProfiles(companyName) {
        const btn = document.getElementById('pos-select-btn');
        const label = document.getElementById('pos-select-label');
        const dropdown = document.getElementById('pos-select-dropdown');
        const note = document.getElementById('pos-profiles-note');

        if (!companyName) {
            btn.classList.add('disabled');
            label.textContent = 'Select profiles...';
            dropdown.innerHTML = '';
            note.textContent = 'Pilih Company terlebih dahulu';
            return;
        }
        
        btn.classList.remove('disabled');
        label.textContent = 'Loading profiles...';
        note.textContent = 'Kosongkan untuk ambil 3 teratas';

        const filters = JSON.stringify([["company", "=", companyName], ["disabled", "=", 0]]);
        const fields = JSON.stringify(["name"]);
        const url = `/api/resource/POS Profile?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}`;

        fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': getCookie('csrf_token') }
        })
        .then(response => response.json())
        .then(data => {
            populatePosProfileDropdown(data.data || []);
            const hiddenInput = document.getElementById('pos_profiles').value;
            if (!hiddenInput) {
                label.textContent = 'Select profiles...';
            }
        })
        .catch(error => {
            console.error('Error fetching POS Profiles:', error);
            label.textContent = 'Error loading profiles';
            btn.classList.add('disabled');
        });
    }

    function populatePosProfileDropdown(profiles) {
        const dropdown = document.getElementById('pos-select-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = ''; 

        if (profiles.length === 0) {
            dropdown.innerHTML = '<span style="padding: 10px; display: block; color: #7f8c8d;">No profiles found</span>';
            return;
        }

        profiles.forEach(profile => {
            const item = document.createElement('div');
            item.className = 'multiselect-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = profile.name;
            checkbox.id = 'pos-' + profile.name;
            
            const label = document.createElement('label');
            label.htmlFor = 'pos-' + profile.name;
            label.textContent = profile.name;
            
            label.addEventListener('click', e => e.stopPropagation());
            item.addEventListener('click', () => { 
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            });
            checkbox.addEventListener('click', e => e.stopPropagation());

            item.appendChild(checkbox);
            item.appendChild(label);
            dropdown.appendChild(item);
        });
    }

    /**
     * Fungsi yang dipanggil saat Company berubah
     * HANYA update POS dropdown, TIDAK fetch data
     */
    function updatePosProfiles() {
        const companyName = document.getElementById('company').value;
        
        if (companyName) {
            fetchPosProfiles(companyName);
        } else {
            fetchPosProfiles(null);
        }
        
        // Reset selection
        document.getElementById('pos_profiles').value = '';
        document.getElementById('pos-select-label').textContent = 'Select profiles...';
        
        // Clear results jika ada
        clearResults();
        hideError();
    }
    
    /**
     * Clear results container
     */
    function clearResults() {
        document.getElementById('results-container').innerHTML = '';
        document.getElementById('results-nav').style.display = 'none';
    }

    // --- BAGIAN RENDER HASIL (TABS) ---

    function renderResults() {
        if (!predictions) return;
        Object.keys(chartInstances).forEach(key => { if (chartInstances[key]) chartInstances[key].destroy(); });
        chartInstances = {};
        let html = '';
        html += renderInfoHeader();
        
        if (predictions.sales_prediction?.status === 'success') html += `<div id="sales-section" class="tab-section">${renderSalesPrediction()}</div>`;
        if (predictions.product_demand_prediction?.status === 'success') html += `<div id="products-section" class="tab-section">${renderProductDemand()}</div>`;
        if (predictions.profit_prediction?.status === 'success') html += `<div id="profit-section" class="tab-section">${renderProfitPrediction()}</div>`;
        if (predictions.active_customer_prediction?.status === 'success') html += `<div id="customers-section" class="tab-section">${renderCustomerPrediction()}</div>`;
        if (predictions.bestseller_prediction?.status === 'success') html += `<div id="bestsellers-section" class="tab-section">${renderBestsellerPrediction()}</div>`;
        if (predictions.stock_prediction?.status === 'success') html += `<div id="stock-section" class="tab-section">${renderStockPrediction()}</div>`;
        
        document.getElementById('results-container').innerHTML = html;
        
        document.getElementById('results-nav').innerHTML = renderResultsNav();
        document.getElementById('results-nav').style.display = 'block';
        
        bindResultsNav();
        
        const firstTab = document.querySelector('.nav-btn');
        if (firstTab) {
            showTab(firstTab.dataset.target);
            firstTab.classList.add('active');
        } else {
            document.getElementById('results-nav').style.display = 'none';
        }

        setTimeout(() => renderCharts(), 100);
    }
    
    function renderResultsNav() {
        let navHtml = '<div class="results-nav-inner">';
        if (predictions.sales_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="sales-section">Sales</button>`;
        if (predictions.product_demand_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="products-section">Product</button>`;
        if (predictions.profit_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="profit-section">Profit</button>`;
        if (predictions.active_customer_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="customers-section">Customer</button>`;
        if (predictions.bestseller_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="bestsellers-section">Bestseller</button>`;
        if (predictions.stock_prediction?.status === 'success') navHtml += `<button class="nav-btn" data-target="stock-section">Stock</button>`;
        navHtml += '</div>';
        return navHtml;
    }
    
    function bindResultsNav() {
        const buttons = document.querySelectorAll('.nav-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (autoSlideInterval) clearInterval(autoSlideInterval);
                const target = btn.getAttribute('data-target');
                showTab(target);
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    
    function showTab(id) {
        const sections = document.querySelectorAll('.tab-section');
        sections.forEach(sec => sec.classList.remove('active'));
        const targetSection = document.getElementById(id);
        if (targetSection) targetSection.classList.add('active');
    }

    // --- BAGIAN RENDER CHARTS (LENGKAP) ---

    function renderCharts() {
        if (predictions.sales_prediction?.status === 'success') renderSalesChart();
        if (predictions.product_demand_prediction?.status === 'success') renderProductDemandChart();
        if (predictions.profit_prediction?.status === 'success') renderProfitChart();
        if (predictions.active_customer_prediction?.status === 'success') renderCustomerChart();
        if (predictions.bestseller_prediction?.status === 'success') renderBestsellerChart();
        if (predictions.stock_prediction?.status === 'success') renderStockChart();
    }
    
    function renderSalesChart() {
        const canvas = document.getElementById('salesChart'); if (!canvas) return;
        const sp = predictions.sales_prediction; const predictionDays = parseInt(predictions.prediction_period.split(' ')[0]); const labels = [], actualData = [], predictedData = [];
        for (let i = -30; i < predictionDays; i++) { if (i < 0) { labels.push(`Day ${i}`); actualData.push(sp.current_avg_daily_sales); predictedData.push(null); } else { labels.push(`Day +${i}`); actualData.push(null); predictedData.push(sp.predicted_daily_sales); } }
        chartInstances.sales = new Chart(canvas, { type: 'line', data: { labels: labels, datasets: [ { label: 'Actual Sales', data: actualData, borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.1)', borderWidth: 2, tension: 0.4, fill: true }, { label: 'Predicted Sales', data: predictedData, borderColor: '#27ae60', backgroundColor: 'rgba(39, 174, 96, 0.1)', borderWidth: 2, borderDash: [5, 5], tension: 0.4, fill: true } ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': Rp ' + (context.parsed.y || 0).toLocaleString('id-ID'); }}}}, scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return 'Rp ' + value.toLocaleString('id-ID'); }}}} } });
    }
    
    function renderProductDemandChart() {
        const canvas = document.getElementById('productDemandChart'); if (!canvas) return;
        const pd = predictions.product_demand_prediction; const topProducts = pd.top_products.slice(0, 10); const labels = topProducts.map(p => p.item_name.length > 20 ? p.item_name.substring(0, 20) + '...' : p.item_name); const actualData = topProducts.map(p => p.daily_average_demand); const predictedData = topProducts.map(p => p.predicted_demand);
        chartInstances.productDemand = new Chart(canvas, { type: 'bar', data: { labels: labels, datasets: [ { label: 'Daily Average', data: actualData, backgroundColor: 'rgba(52, 152, 219, 0.7)', borderColor: '#3498db', borderWidth: 1 }, { label: 'Predicted Demand', data: predictedData, backgroundColor: 'rgba(39, 174, 96, 0.7)', borderColor: '#27ae60', borderWidth: 1 } ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } }, scales: { y: { beginAtZero: true } } } });
    }
    
    function renderProfitChart() {
        const canvas = document.getElementById('profitChart'); if (!canvas) return;
        const pp = predictions.profit_prediction;
        chartInstances.profit = new Chart(canvas, { type: 'doughnut', data: { labels: ['Profit', 'Cost'], datasets: [{ data: [pp.current_total_profit, pp.current_total_cost], backgroundColor: ['rgba(39, 174, 96, 0.8)', 'rgba(231, 76, 60, 0.8)'], borderColor: ['#27ae60', '#e74c3c'], borderWidth: 2 }]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: function(context) { return context.label + ': Rp ' + context.parsed.toLocaleString('id-ID'); }}}} } });
    }
    
    function renderCustomerChart() {
        const canvas = document.getElementById('customerChart'); if (!canvas) return;
        const cp = predictions.active_customer_prediction;
        chartInstances.customer = new Chart(canvas, { type: 'pie', data: { labels: ['Loyal Customers', 'Regular Customers'], datasets: [{ data: [cp.loyal_customers, cp.current_total_customers - cp.loyal_customers], backgroundColor: ['rgba(39, 174, 96, 0.8)', 'rgba(52, 152, 219, 0.8)'], borderColor: ['#27ae60', '#3498db'], borderWidth: 2 }]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: function(context) { const percentage = ((context.parsed / cp.current_total_customers) * 100).toFixed(1); return context.label + ': ' + context.parsed + ' (' + percentage + '%)'; }}}} } });
    }
    
    function renderBestsellerChart() {
        const canvas = document.getElementById('bestsellerChart'); if (!canvas) return;
        const bp = predictions.bestseller_prediction; const topItems = bp.top_bestsellers.slice(0, 10); const labels = topItems.map(item => item.item_name.length > 15 ? item.item_name.substring(0, 15) + '...' : item.item_name); const data = topItems.map(item => item.popularity_score);
        chartInstances.bestseller = new Chart(canvas, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Popularity Score', data: data, backgroundColor: 'rgba(253, 126, 20, 0.7)', borderColor: '#fd7e14', borderWidth: 1 }]}, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } } });
    }
    
    function renderStockChart() {
        const canvas = document.getElementById('stockChart'); if (!canvas) return;
        const sp = predictions.stock_prediction; const allItems = [...(sp.critical_items || []), ...(sp.low_stock_items || [])].slice(0, 10); const labels = allItems.map(item => item.item_name.length > 15 ? item.item_name.substring(0, 15) + '...' : item.item_name); const currentStock = allItems.map(item => item.current_stock); const predictedUse = allItems.map(item => item.predicted_consumption); const reorderQty = allItems.map(item => item.reorder_quantity);
        chartInstances.stock = new Chart(canvas, { type: 'bar', data: { labels: labels, datasets: [ { label: 'Current Stock', data: currentStock, backgroundColor: 'rgba(52, 152, 219, 0.7)', borderColor: '#3498db', borderWidth: 1 }, { label: 'Predicted Use', data: predictedUse, backgroundColor: 'rgba(243, 156, 18, 0.7)', borderColor: '#f39c12', borderWidth: 1 }, { label: 'Reorder Quantity', data: reorderQty, backgroundColor: 'rgba(231, 76, 60, 0.7)', borderColor: '#e74c3c', borderWidth: 1 } ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } }, scales: { y: { beginAtZero: true } } } });
    }

    // --- BAGIAN RENDER KONTEN TAB (LENGKAP) ---

    function renderInfoHeader() {
        const p = predictions;
        return `
            <div class="info-header">
                <h3>Prediction Summary</h3>
                <div class="info-grid">
                    <div class="info-item"><label>Company</label><value>${p.company}</value></div>
                    <div class="info-item"><label>POS Profiles</label><value>${p.pos_profiles.length > 0 ? p.pos_profiles.length : 'All'} profiles</value></div>
                    <div class="info-item"><label>Date Range</label><value>${p.date_range.from} ~ ${p.date_range.to}</value></div>
                    <div class="info-item"><label>Prediction Period</label><value>${p.prediction_period}</value></div>
                </div>
            </div>
        `;
    }
    
    function renderSalesPrediction() {
        const sp = predictions.sales_prediction;
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #d4edda; color: #27ae60;">📈</div><div class="prediction-title"><h3>Sales Prediction</h3><p>Prediksi penjualan berdasarkan trend historis</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="salesChart"></canvas></div><div class="metrics-grid"><div class="metric-box info"><div class="metric-label">Current Avg Daily Sales</div><div class="metric-value">${formatCurrency(sp.current_avg_daily_sales)}</div></div><div class="metric-box success"><div class="metric-label">Predicted Daily Sales</div><div class="metric-value">${formatCurrency(sp.predicted_daily_sales)}</div></div><div class="metric-box purple"><div class="metric-label">Predicted Total Sales</div><div class="metric-value">${formatCurrency(sp.predicted_total_sales)}</div></div><div class="metric-box ${sp.growth_rate_percentage >= 0 ? 'success' : 'danger'}"><div class="metric-label">Growth Rate</div><div class="metric-value">${sp.growth_rate_percentage}%</div></div></div><div><span class="badge badge-info">Trend: ${sp.trend}</span><span class="badge badge-info">Confidence: ${sp.confidence}</span><span class="badge badge-info">Data Points: ${sp.historical_data_points}</span></div></div>
            </div>
        `;
    }
    
    function renderProductDemand() {
        const pd = predictions.product_demand_prediction; let rows = ''; pd.top_products.forEach(item => { rows += `<tr><td><strong>${item.item_name}</strong><br><small style="color: #7f8c8d;">${item.item_code}</small></td><td style="text-align: right;">${formatNumber(item.daily_average_demand)}</td><td style="text-align: right;"><span class="badge badge-info">${formatNumber(item.predicted_demand)}</span></td><td style="text-align: right;">${item.transaction_frequency}x</td></tr>`; });
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #d1ecf1; color: #0c5460;">📦</div><div class="prediction-title"><h3>Product Demand Prediction</h3><p>Top ${pd.top_products.length} produk dengan prediksi demand tertinggi</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="productDemandChart"></canvas></div><table class="data-table"><thead><tr><th>Item</th><th style="text-align: right;">Daily Avg</th><th style="text-align: right;">Predicted Demand</th><th style="text-align: right;">Frequency</th></tr></thead><tbody>${rows}</tbody></table></div>
            </div>
        `;
    }
    
    function renderProfitPrediction() {
        const pp = predictions.profit_prediction;
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #fff3cd; color: #856404;">💰</div><div class="prediction-title"><h3>Profit Prediction</h3><p>Prediksi keuntungan dan margin</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="profitChart"></canvas></div><div class="metrics-grid"><div class="metric-box success"><div class="metric-label">Current Total Profit</div><div class="metric-value">${formatCurrency(pp.current_total_profit)}</div><div class="metric-small">Margin: ${pp.current_profit_margin}%</div></div><div class="metric-box info"><div class="metric-label">Predicted Total Profit</div><div class="metric-value">${formatCurrency(pp.predicted_total_profit)}</div><div class="metric-small">Avg Daily: ${formatCurrency(pp.avg_daily_profit)}</div></div><div class="metric-box"><div class="metric-label">Revenue</div><div class="metric-value">${formatCurrency(pp.current_total_revenue)}</div></div><div class="metric-box"><div class="metric-label">Cost</div><div class="metric-value">${formatCurrency(pp.current_total_cost)}</div></div></div><div class="note-box"><strong>Note:</strong> ${pp.note}</div></div>
            </div>
        `;
    }
    
    function renderCustomerPrediction() {
        const cp = predictions.active_customer_prediction; let customerRows = ''; cp.top_customers.forEach(cust => { const badgeClass = cust.customer_type === 'loyal' ? 'badge-success' : 'badge-info'; customerRows += `<tr><td>${cust.customer_name}</td><td style="text-align: right;">${cust.transaction_count}x</td><td style="text-align: right;"><strong>${formatCurrency(cust.total_spent)}</strong></td><td style="text-align: center;"><span class="badge ${badgeClass}">${cust.customer_type}</span></td></tr>`; });
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #e2d5f1; color: #6f42c1;">👥</div><div class="prediction-title"><h3>Active Customer Prediction</h3><p>Analisis pelanggan dan retention</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="customerChart"></canvas></div><div class="metrics-grid"><div class="metric-box"><div class="metric-label">Total Customers</div><div class="metric-value">${formatNumber(cp.current_total_customers)}</div></div><div class="metric-box success"><div class="metric-label">Loyal Customers</div><div class="metric-value">${formatNumber(cp.loyal_customers)}</div></div><div class="metric-box info"><div class="metric-label">Retention Rate</div><div class="metric-value">${cp.retention_rate}%</div></div><div class="metric-box purple"><div class="metric-label">Predicted New</div><div class="metric-value">${formatNumber(cp.predicted_new_customers)}</div></div></div><h4 style="margin-top: 20px; margin-bottom: 10px; font-size: 14px; font-weight: 600;">Top Customers</h4><table class="data-table"><thead><tr><th>Customer</th><th style="text-align: right;">Transactions</th><th style="text-align: right;">Total Spent</th><th style="text-align: center;">Type</th></tr></thead><tbody>${customerRows}</tbody></table></div>
            </div>
        `;
    }
    
    function renderBestsellerPrediction() {
        const bp = predictions.bestseller_prediction; let bestsellerHtml = ''; bp.top_bestsellers.forEach(item => { bestsellerHtml += `<div class="bestseller-item"><div class="bestseller-rank">${item.rank}</div><div class="bestseller-info"><div class="bestseller-name">${item.item_name}</div><div class="bestseller-details">Predicted: ${formatNumber(item.predicted_qty_needed)} units</div></div><div class="bestseller-value"><div class="bestseller-revenue">${formatCurrency(item.revenue_contribution)}</div><div class="bestseller-score">Score: ${item.popularity_score}</div></div></div>`; });
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #ffe5d9; color: #fd7e14;">🛒</div><div class="prediction-title"><h3>Bestseller Prediction</h3><p>Produk terlaris dan popularity score</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="bestsellerChart"></canvas></div>${bestsellerHtml}</div>
            </div>
        `;
    }
    
    function renderStockPrediction() {
        const sp = predictions.stock_prediction; let criticalHtml = ''; if (sp.critical_items && sp.critical_items.length > 0) { criticalHtml = '<h4 style="color: #e74c3c; margin-bottom: 12px; font-size: 14px; font-weight: 600;">⚠️ Critical Stock Items</h4>'; sp.critical_items.forEach(item => { criticalHtml += `<div class="stock-alert critical"><div class="stock-alert-title" style="color: #e74c3c;"><span>${item.item_name}</span><span style="font-size: 12px;">⚠️ ${item.days_until_stockout} days until stockout</span></div><div class="stock-alert-grid"><div class="stock-alert-item"><label>Current</label><value>${formatNumber(item.current_stock)}</value></div><div class="stock-alert-item"><label>Predicted Use</label><value>${formatNumber(item.predicted_consumption)}</value></div><div class="stock-alert-item"><label>Reorder</label><value style="color: #e74c3c;">${formatNumber(item.reorder_quantity)}</value></div><div class="stock-alert-item"><label>Status</label><value><span class="badge badge-danger">${item.stock_status}</span></value></div></div></div>`; }); }
        let lowHtml = ''; if (sp.low_stock_items && sp.low_stock_items.length > 0) { lowHtml = '<h4 style="color: #f39c12; margin: 20px 0 12px 0; font-size: 14px; font-weight: 600;">⚡ Low Stock Items</h4>'; sp.low_stock_items.forEach(item => { lowHtml += `<div class="stock-alert low"><div class="stock-alert-title" style="color: #f39c12;"><span>${item.item_name}</span><span style="font-size: 12px;">${item.days_until_stockout} days remaining</span></div><div class="stock-alert-grid"><div class="stock-alert-item"><label>Current</label><value>${formatNumber(item.current_stock)}</value></div><div class="stock-alert-item"><label>Predicted Use</label><value>${formatNumber(item.predicted_consumption)}</value></div><div class="stock-alert-item"><label>Reorder</label><value style="color: #f39c12;">${formatNumber(item.reorder_quantity)}</value></div><div class="stock-alert-item"><label>Status</label><value><span class="badge badge-warning">${item.stock_status}</span></value></div></div></div>`; }); }
        return `
            <div class="prediction-card">
                <div class="prediction-header"><div class="prediction-icon" style="background: #f8d7da; color: #e74c3c;">⚠️</div><div class="prediction-title"><h3>Stock Prediction</h3><p>${sp.summary.critical_stock_count} critical, ${sp.summary.low_stock_count} low stock items</p></div></div>
                <div class="prediction-content expanded"><div class="chart-container"><canvas id="stockChart"></canvas></div>${criticalHtml}${lowHtml}
                    <div class="summary-box"><div class="summary-title">Stock Summary</div><div class="summary-grid"><div class="summary-item"><label>Total Items</label><value style="color: #2c3e50;">${sp.summary.total_items_analyzed}</value></div><div class="summary-item"><label>Critical</label><value style="color: #e74c3c;">${sp.summary.critical_stock_count}</value></div><div class="summary-item"><label>Low Stock</label><value style="color: #f39c12;">${sp.summary.low_stock_count}</value></div></div></div>
                </div>
            </div>
        `;
    }

    // --- BAGIAN HELPER (LENGKAP) ---

    function showLoading(show) {
        const loading = document.getElementById('loading');
        const btn = document.getElementById('submit-btn');
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');
        
        if (show) {
            loading.style.display = 'block';
            if(btn) {
                btn.disabled = true;
                if(btnText) btnText.style.display = 'none';
                if(btnLoader) btnLoader.style.display = 'inline';
            }
        } else {
            loading.style.display = 'none';
            if(btn) {
                btn.disabled = false;
                if(btnText) btnText.style.display = 'inline';
                if(btnLoader) btnLoader.style.display = 'none';
            }
        }
    }

    function showError(message) {
        const errorBox = document.getElementById('error-message');
        errorBox.textContent = message;
        errorBox.style.display = 'block';
    }

    function hideError() {
        document.getElementById('error-message').style.display = 'none';
    }

    function formatCurrency(value) {
        if (!value) return 'Rp 0';
        return 'Rp ' + parseFloat(value).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    function formatNumber(value) {
        if (!value) return '0';
        return parseFloat(value).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    }

})(); // AKHIR DARI IIFE