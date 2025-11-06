// Sales Invoice Predictions Dashboard - Rebuilt
(function() {
    'use strict';

    // ==================== GLOBAL VARIABLES ====================
    let predictions = null;
    let chartInstances = {};
    let allCompanies = [];

    // ==================== INITIALIZATION ====================
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Sales Dashboard initialized');
        initializeApp();
    });

    function initializeApp() {
        setupCompanyDropdown();
        setupFormSubmit();
        loadCompanyList();
        loadCustomerGroups();
        loadTerritories();
    }

    // ==================== COMPANY DROPDOWN ====================
    function setupCompanyDropdown() {
        const btn = document.getElementById('company-select-btn');
        const dropdown = document.getElementById('company-select-dropdown');
        const searchInput = document.getElementById('company-search');
        const optionsList = document.getElementById('company-options-list');
        const hiddenInput = document.getElementById('company');
        const label = document.getElementById('company-select-label');

        if (!btn || !dropdown) {
            console.error('Company dropdown elements not found');
            return;
        }

        // Toggle dropdown
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = dropdown.style.display === 'flex';
            dropdown.style.display = isOpen ? 'none' : 'flex';
            if (!isOpen) {
                searchInput.focus();
            }
        });

        // Search functionality
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = allCompanies.filter(company => 
                company.name.toLowerCase().includes(searchTerm)
            );
            renderCompanyOptions(filtered);
        });

        // Handle option selection
        optionsList.addEventListener('click', function(e) {
            const item = e.target.closest('.select-option-item');
            if (item) {
                const value = item.dataset.value;
                hiddenInput.value = value;
                label.textContent = value;
                dropdown.style.display = 'none';
                searchInput.value = '';
                renderCompanyOptions(allCompanies);
                
                // Trigger change event
                onCompanyChange(value);
            }
        });

        // Close on outside click
        document.addEventListener('click', function(e) {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function loadCompanyList() {
        fetch('/api/resource/Company', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': getCookie('csrf_token')
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.data && Array.isArray(data.data)) {
                allCompanies = data.data;
                renderCompanyOptions(allCompanies);
                console.log('Companies loaded:', allCompanies.length);
            }
        })
        .catch(error => {
            console.error('Error loading companies:', error);
            showError('Failed to load company list');
        });
    }

    function renderCompanyOptions(companies) {
        const optionsList = document.getElementById('company-options-list');
        const currentValue = document.getElementById('company').value;
        
        if (!optionsList) return;
        
        optionsList.innerHTML = '';

        if (companies.length === 0) {
            optionsList.innerHTML = '<div style="padding: 10px; color: #7f8c8d;">No companies found</div>';
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

    function onCompanyChange(companyName) {
        console.log('Company changed to:', companyName);
        clearResults();
        hideError();
    }

    // ==================== CUSTOMER GROUPS & TERRITORIES ====================
    function loadCustomerGroups() {
        fetch('/api/resource/Customer Group?fields=["name"]&limit_page_length=999', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': getCookie('csrf_token')
            }
        })
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('customer_group');
            if (data.data && select) {
                data.data.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.name;
                    option.textContent = group.name;
                    select.appendChild(option);
                });
                console.log('Customer groups loaded:', data.data.length);
            }
        })
        .catch(error => console.error('Error loading customer groups:', error));
    }

    function loadTerritories() {
        fetch('/api/resource/Territory?fields=["name"]&limit_page_length=999', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': getCookie('csrf_token')
            }
        })
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('territory');
            if (data.data && select) {
                data.data.forEach(territory => {
                    const option = document.createElement('option');
                    option.value = territory.name;
                    option.textContent = territory.name;
                    select.appendChild(option);
                });
                console.log('Territories loaded:', data.data.length);
            }
        })
        .catch(error => console.error('Error loading territories:', error));
    }

    // ==================== FORM SUBMIT ====================
    function setupFormSubmit() {
        const form = document.getElementById('prediction-form');
        
        if (!form) {
            console.error('Form not found');
            return;
        }

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            handleFormSubmit();
        });
    }

    function handleFormSubmit() {
        const company = document.getElementById('company').value;
        const customerGroup = document.getElementById('customer_group').value;
        const territory = document.getElementById('territory').value;
        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;
        const predictionDays = document.getElementById('prediction_days').value || 30;

        // Validation
        if (!company) {
            showError('Please select a Company');
            return;
        }

        // Build params
        const params = {
            company: company,
            customer_group: customerGroup,
            territory: territory,
            date_from: dateFrom,
            date_to: dateTo,
            prediction_days: predictionDays
        };

        fetchPredictions(params);
    }

    // ==================== API CALL ====================
    function fetchPredictions(params) {
        showLoading(true);
        hideError();
        clearResults();

        const url = '/api/method/data_analyst.api.pos.get_sales_invoice_predictions';
        const queryParams = new URLSearchParams();
        
        queryParams.append('company', params.company);
        if (params.customer_group) queryParams.append('customer_group', params.customer_group);
        if (params.territory) queryParams.append('territory', params.territory);
        if (params.date_from) queryParams.append('date_from', params.date_from);
        if (params.date_to) queryParams.append('date_to', params.date_to);
        queryParams.append('prediction_days', params.prediction_days);

        fetch(`${url}?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': getCookie('csrf_token')
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.message || 'API request failed');
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
            console.error('Fetch error:', error);
        });
    }

    // ==================== RENDER RESULTS ====================
    function renderResults() {
        if (!predictions) return;

        // Destroy existing charts
        Object.keys(chartInstances).forEach(key => {
            if (chartInstances[key]) {
                chartInstances[key].destroy();
            }
        });
        chartInstances = {};

        let html = '';
        html += renderInfoHeader();
        
        if (predictions.sales_prediction?.status === 'success') {
            html += `<div id="sales-section" class="tab-section">${renderSalesPrediction()}</div>`;
        }
        if (predictions.product_demand_prediction?.status === 'success') {
            html += `<div id="products-section" class="tab-section">${renderProductDemand()}</div>`;
        }
        if (predictions.profit_prediction?.status === 'success') {
            html += `<div id="profit-section" class="tab-section">${renderProfitPrediction()}</div>`;
        }
        if (predictions.customer_analysis?.status === 'success') {
            html += `<div id="customers-section" class="tab-section">${renderCustomerAnalysis()}</div>`;
        }
        if (predictions.bestseller_prediction?.status === 'success') {
            html += `<div id="bestsellers-section" class="tab-section">${renderBestsellerPrediction()}</div>`;
        }
        if (predictions.payment_prediction?.status === 'success') {
            html += `<div id="payment-section" class="tab-section">${renderPaymentPrediction()}</div>`;
        }
        
        document.getElementById('results-container').innerHTML = html;
        document.getElementById('results-nav').innerHTML = renderResultsNav();
        document.getElementById('results-nav').style.display = 'block';
        
        setupNavigation();
        
        // Show first tab
        const firstTab = document.querySelector('.nav-btn');
        if (firstTab) {
            showTab(firstTab.dataset.target);
            firstTab.classList.add('active');
        }

        // Render charts after DOM update
        setTimeout(() => renderCharts(), 100);
    }

    function renderInfoHeader() {
        const p = predictions;
        let filters = [];
        if (p.filters.customer_group) filters.push(`Customer Group: ${p.filters.customer_group}`);
        if (p.filters.territory) filters.push(`Territory: ${p.filters.territory}`);
        
        return `
            <div class="info-header">
                <h3>Prediction Summary</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Company</label>
                        <value>${p.company}</value>
                    </div>
                    <div class="info-item">
                        <label>Filters</label>
                        <value>${filters.length > 0 ? filters.join(', ') : 'None'}</value>
                    </div>
                    <div class="info-item">
                        <label>Date Range</label>
                        <value>${p.date_range.from} ~ ${p.date_range.to}</value>
                    </div>
                    <div class="info-item">
                        <label>Prediction Period</label>
                        <value>${p.prediction_period}</value>
                    </div>
                </div>
            </div>
        `;
    }

    function renderResultsNav() {
        let navHtml = '<div class="results-nav-inner">';
        if (predictions.sales_prediction?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="sales-section">Sales</button>`;
        }
        if (predictions.product_demand_prediction?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="products-section">Product</button>`;
        }
        if (predictions.profit_prediction?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="profit-section">Profit</button>`;
        }
        if (predictions.customer_analysis?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="customers-section">Customer</button>`;
        }
        if (predictions.bestseller_prediction?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="bestsellers-section">Bestseller</button>`;
        }
        if (predictions.payment_prediction?.status === 'success') {
            navHtml += `<button class="nav-btn" data-target="payment-section">Payment</button>`;
        }
        navHtml += '</div>';
        return navHtml;
    }

    function setupNavigation() {
        const buttons = document.querySelectorAll('.nav-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const target = this.getAttribute('data-target');
                showTab(target);
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }

    function showTab(id) {
        const sections = document.querySelectorAll('.tab-section');
        sections.forEach(sec => sec.classList.remove('active'));
        const targetSection = document.getElementById(id);
        if (targetSection) {
            targetSection.classList.add('active');
        }
    }

    // ==================== RENDER CHARTS ====================
    function renderCharts() {
        if (predictions.sales_prediction?.status === 'success') renderSalesChart();
        if (predictions.product_demand_prediction?.status === 'success') renderProductDemandChart();
        if (predictions.profit_prediction?.status === 'success') renderProfitChart();
        if (predictions.customer_analysis?.status === 'success') renderCustomerChart();
        if (predictions.bestseller_prediction?.status === 'success') renderBestsellerChart();
        if (predictions.payment_prediction?.status === 'success') renderPaymentChart();
    }

    function renderSalesChart() {
        const canvas = document.getElementById('salesChart');
        if (!canvas) return;
        
        const sp = predictions.sales_prediction;
        const predictionDays = parseInt(predictions.prediction_period.split(' ')[0]);
        const labels = [];
        const actualData = [];
        const predictedData = [];
        
        for (let i = -30; i < predictionDays; i++) {
            if (i < 0) {
                labels.push(`Day ${i}`);
                actualData.push(sp.current_avg_daily_sales);
                predictedData.push(null);
            } else {
                labels.push(`Day +${i}`);
                actualData.push(null);
                predictedData.push(sp.predicted_daily_sales);
            }
        }
        
        chartInstances.sales = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Actual Sales',
                        data: actualData,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Predicted Sales',
                        data: predictedData,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': Rp ' + (context.parsed.y || 0).toLocaleString('id-ID');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'Rp ' + value.toLocaleString('id-ID');
                            }
                        }
                    }
                }
            }
        });
    }

    function renderProductDemandChart() {
        const canvas = document.getElementById('productDemandChart');
        if (!canvas) return;
        
        const pd = predictions.product_demand_prediction;
        const topProducts = pd.top_products.slice(0, 10);
        const labels = topProducts.map(p => p.item_name.length > 20 ? p.item_name.substring(0, 20) + '...' : p.item_name);
        const actualData = topProducts.map(p => p.daily_average_demand);
        const predictedData = topProducts.map(p => p.predicted_demand);
        
        chartInstances.productDemand = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Daily Average',
                        data: actualData,
                        backgroundColor: 'rgba(52, 152, 219, 0.7)',
                        borderColor: '#3498db',
                        borderWidth: 1
                    },
                    {
                        label: 'Predicted Demand',
                        data: predictedData,
                        backgroundColor: 'rgba(39, 174, 96, 0.7)',
                        borderColor: '#27ae60',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    function renderProfitChart() {
        const canvas = document.getElementById('profitChart');
        if (!canvas) return;
        
        const pp = predictions.profit_prediction;
        
        chartInstances.profit = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['Profit', 'Cost'],
                datasets: [{
                    data: [pp.current_total_profit, pp.current_total_cost],
                    backgroundColor: ['rgba(39, 174, 96, 0.8)', 'rgba(231, 76, 60, 0.8)'],
                    borderColor: ['#27ae60', '#e74c3c'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': Rp ' + context.parsed.toLocaleString('id-ID');
                            }
                        }
                    }
                }
            }
        });
    }

    function renderCustomerChart() {
        const canvas = document.getElementById('customerChart');
        if (!canvas) return;
        
        const cp = predictions.customer_analysis;
        
        chartInstances.customer = new Chart(canvas, {
            type: 'pie',
            data: {
                labels: ['Loyal Customers', 'Repeat Customers', 'New Customers'],
                datasets: [{
                    data: [
                        cp.loyal_customers,
                        cp.repeat_customers - cp.loyal_customers,
                        cp.current_total_customers - cp.repeat_customers
                    ],
                    backgroundColor: [
                        'rgba(39, 174, 96, 0.8)',
                        'rgba(52, 152, 219, 0.8)',
                        'rgba(243, 156, 18, 0.8)'
                    ],
                    borderColor: ['#27ae60', '#3498db', '#f39c12'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const percentage = ((context.parsed / cp.current_total_customers) * 100).toFixed(1);
                                return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    function renderBestsellerChart() {
        const canvas = document.getElementById('bestsellerChart');
        if (!canvas) return;
        
        const bp = predictions.bestseller_prediction;
        const topItems = bp.top_bestsellers.slice(0, 10);
        const labels = topItems.map(item => item.item_name.length > 15 ? item.item_name.substring(0, 15) + '...' : item.item_name);
        const data = topItems.map(item => item.popularity_score);
        
        chartInstances.bestseller = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Popularity Score',
                    data: data,
                    backgroundColor: 'rgba(253, 126, 20, 0.7)',
                    borderColor: '#fd7e14',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    }

    function renderPaymentChart() {
        const canvas = document.getElementById('paymentChart');
        if (!canvas) return;
        
        const pp = predictions.payment_prediction;
        
        chartInstances.payment = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Current', 'Predicted'],
                datasets: [
                    {
                        label: 'Invoiced',
                        data: [pp.current_total_invoiced, pp.predicted_invoiced],
                        backgroundColor: 'rgba(52, 152, 219, 0.7)',
                        borderColor: '#3498db',
                        borderWidth: 1
                    },
                    {
                        label: 'Collected',
                        data: [pp.current_total_collected, pp.predicted_collection],
                        backgroundColor: 'rgba(39, 174, 96, 0.7)',
                        borderColor: '#27ae60',
                        borderWidth: 1
                    },
                    {
                        label: 'Outstanding',
                        data: [pp.current_total_outstanding, pp.predicted_outstanding],
                        backgroundColor: 'rgba(231, 76, 60, 0.7)',
                        borderColor: '#e74c3c',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'Rp ' + value.toLocaleString('id-ID');
                            }
                        }
                    }
                }
            }
        });
    }

    // ==================== RENDER CONTENT ====================
    function renderSalesPrediction() {
        const sp = predictions.sales_prediction;
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #d4edda; color: #27ae60;">📊</div>
                    <div class="prediction-title">
                        <h3>Sales Prediction</h3>
                        <p>Prediksi revenue berdasarkan trend historis</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="salesChart"></canvas></div>
                    <div class="metrics-grid">
                        <div class="metric-box info">
                            <div class="metric-label">Current Total Sales</div>
                            <div class="metric-value">${formatCurrency(sp.current_total_sales)}</div>
                            <div class="metric-small">Avg Daily: ${formatCurrency(sp.current_avg_daily_sales)}</div>
                        </div>
                        <div class="metric-box success">
                            <div class="metric-label">Predicted Total Sales</div>
                            <div class="metric-value">${formatCurrency(sp.predicted_total_sales)}</div>
                            <div class="metric-small">Avg Daily: ${formatCurrency(sp.predicted_daily_sales)}</div>
                        </div>
                        <div class="metric-box purple">
                            <div class="metric-label">Total Invoices</div>
                            <div class="metric-value">${sp.current_total_invoices}</div>
                            <div class="metric-small">Predicted: ${sp.predicted_invoice_count}</div>
                        </div>
                        <div class="metric-box ${sp.growth_rate_percentage >= 0 ? 'success' : 'danger'}">
                            <div class="metric-label">Growth Rate</div>
                            <div class="metric-value">${sp.growth_rate_percentage}%</div>
                        </div>
                    </div>
                    <div class="metrics-grid">
                        <div class="metric-box warning">
                            <div class="metric-label">Outstanding Amount</div>
                            <div class="metric-value">${formatCurrency(sp.total_outstanding)}</div>
                        </div>
                        <div class="metric-box info">
                            <div class="metric-label">Collection Rate</div>
                            <div class="metric-value">${sp.collection_rate}%</div>
                        </div>
                    </div>
                    <div>
                        <span class="badge badge-info">Trend: ${sp.trend}</span>
                        <span class="badge badge-info">Confidence: ${sp.confidence}</span>
                        <span class="badge badge-info">Data Points: ${sp.historical_data_points}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderProductDemand() {
        const pd = predictions.product_demand_prediction;
        let rows = '';
        pd.top_products.forEach(item => {
            rows += `<tr>
                <td><strong>${item.item_name}</strong><br><small style="color: #7f8c8d;">${item.item_code}</small></td>
                <td style="text-align: right;">${formatNumber(item.daily_average_demand)}</td>
                <td style="text-align: right;"><span class="badge badge-info">${formatNumber(item.predicted_demand)}</span></td>
                <td style="text-align: right;">${item.invoice_frequency}x</td>
                <td style="text-align: right;">${formatCurrency(item.total_revenue)}</td>
            </tr>`;
        });
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #d1ecf1; color: #0c5460;">📦</div>
                    <div class="prediction-title">
                        <h3>Product Demand Prediction</h3>
                        <p>Top ${pd.top_products.length} produk dengan prediksi demand tertinggi</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="productDemandChart"></canvas></div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style="text-align: right;">Daily Avg</th>
                                <th style="text-align: right;">Predicted Demand</th>
                                <th style="text-align: right;">Frequency</th>
                                <th style="text-align: right;">Revenue</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderProfitPrediction() {
        const pp = predictions.profit_prediction;
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #fff3cd; color: #856404;">💰</div>
                    <div class="prediction-title">
                        <h3>Profit Prediction</h3>
                        <p>Prediksi keuntungan dan margin</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="profitChart"></canvas></div>
                    <div class="metrics-grid">
                        <div class="metric-box success">
                            <div class="metric-label">Current Total Profit</div>
                            <div class="metric-value">${formatCurrency(pp.current_total_profit)}</div>
                            <div class="metric-small">Margin: ${pp.current_profit_margin}%</div>
                        </div>
                        <div class="metric-box info">
                            <div class="metric-label">Predicted Total Profit</div>
                            <div class="metric-value">${formatCurrency(pp.predicted_total_profit)}</div>
                            <div class="metric-small">Avg Daily: ${formatCurrency(pp.avg_daily_profit)}</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Revenue</div>
                            <div class="metric-value">${formatCurrency(pp.current_total_revenue)}</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Cost</div>
                            <div class="metric-value">${formatCurrency(pp.current_total_cost)}</div>
                        </div>
                    </div>
                    <div class="note-box"><strong>Note:</strong> ${pp.note}</div>
                </div>
            </div>
        `;
    }

    function renderCustomerAnalysis() {
        const cp = predictions.customer_analysis;
        let customerRows = '';
        cp.top_customers.forEach(cust => {
            const badgeClass = cust.customer_type === 'loyal' ? 'badge-success' : 
                              cust.customer_type === 'repeat' ? 'badge-info' : 'badge-warning';
            customerRows += `<tr>
                <td>${cust.customer_name}</td>
                <td style="text-align: right;">${cust.invoice_count}x</td>
                <td style="text-align: right;"><strong>${formatCurrency(cust.total_spent)}</strong></td>
                <td style="text-align: right;">${formatCurrency(cust.outstanding)}</td>
                <td style="text-align: center;"><span class="badge ${badgeClass}">${cust.customer_type}</span></td>
            </tr>`;
        });
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #e2d5f1; color: #6f42c1;">👥</div>
                    <div class="prediction-title">
                        <h3>Customer Analysis</h3>
                        <p>Analisis pelanggan dan retention</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="customerChart"></canvas></div>
                    <div class="metrics-grid">
                        <div class="metric-box">
                            <div class="metric-label">Total Customers</div>
                            <div class="metric-value">${formatNumber(cp.current_total_customers)}</div>
                        </div>
                        <div class="metric-box success">
                            <div class="metric-label">Loyal Customers</div>
                            <div class="metric-value">${formatNumber(cp.loyal_customers)}</div>
                        </div>
                        <div class="metric-box info">
                            <div class="metric-label">Retention Rate</div>
                            <div class="metric-value">${cp.retention_rate}%</div>
                        </div>
                        <div class="metric-box purple">
                            <div class="metric-label">Collection Efficiency</div>
                            <div class="metric-value">${cp.collection_efficiency}%</div>
                        </div>
                    </div>
                    <h4 style="margin-top: 20px; margin-bottom: 10px; font-size: 14px; font-weight: 600;">Top Customers</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th style="text-align: right;">Invoices</th>
                                <th style="text-align: right;">Total Spent</th>
                                <th style="text-align: right;">Outstanding</th>
                                <th style="text-align: center;">Type</th>
                            </tr>
                        </thead>
                        <tbody>${customerRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderBestsellerPrediction() {
        const bp = predictions.bestseller_prediction;
        let bestsellerHtml = '';
        bp.top_bestsellers.forEach(item => {
            bestsellerHtml += `
                <div class="bestseller-item">
                    <div class="bestseller-rank">${item.rank}</div>
                    <div class="bestseller-info">
                        <div class="bestseller-name">${item.item_name}</div>
                        <div class="bestseller-details">Predicted: ${formatNumber(item.predicted_qty_needed)} units</div>
                    </div>
                    <div class="bestseller-value">
                        <div class="bestseller-revenue">${formatCurrency(item.revenue_contribution)}</div>
                        <div class="bestseller-score">Score: ${item.popularity_score}</div>
                    </div>
                </div>
            `;
        });
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #ffe5d9; color: #fd7e14;">🛒</div>
                    <div class="prediction-title">
                        <h3>Bestseller Prediction</h3>
                        <p>Produk terlaris dan popularity score</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="bestsellerChart"></canvas></div>
                    ${bestsellerHtml}
                </div>
            </div>
        `;
    }

    function renderPaymentPrediction() {
        const pp = predictions.payment_prediction;
        let agingRows = '';
        pp.aging_analysis.forEach(aging => {
            agingRows += `<tr>
                <td><strong>${aging.bucket}</strong></td>
                <td style="text-align: right;">${aging.invoice_count}</td>
                <td style="text-align: right;"><strong>${formatCurrency(aging.outstanding)}</strong></td>
            </tr>`;
        });
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-icon" style="background: #d1f2eb; color: #0f6848;">💳</div>
                    <div class="prediction-title">
                        <h3>Payment Collection Prediction</h3>
                        <p>Prediksi collection dan outstanding analysis</p>
                    </div>
                </div>
                <div class="prediction-content expanded">
                    <div class="chart-container"><canvas id="paymentChart"></canvas></div>
                    <div class="metrics-grid">
                        <div class="metric-box info">
                            <div class="metric-label">Current Collection Rate</div>
                            <div class="metric-value">${pp.current_collection_rate}%</div>
                        </div>
                        <div class="metric-box success">
                            <div class="metric-label">Total Collected</div>
                            <div class="metric-value">${formatCurrency(pp.current_total_collected)}</div>
                        </div>
                        <div class="metric-box warning">
                            <div class="metric-label">Total Outstanding</div>
                            <div class="metric-value">${formatCurrency(pp.current_total_outstanding)}</div>
                        </div>
                        <div class="metric-box purple">
                            <div class="metric-label">Predicted Outstanding</div>
                            <div class="metric-value">${formatCurrency(pp.predicted_outstanding)}</div>
                        </div>
                    </div>
                    <h4 style="margin-top: 20px; margin-bottom: 10px; font-size: 14px; font-weight: 600;">Outstanding Aging Analysis</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Aging Bucket</th>
                                <th style="text-align: right;">Invoice Count</th>
                                <th style="text-align: right;">Outstanding Amount</th>
                            </tr>
                        </thead>
                        <tbody>${agingRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ==================== UTILITY FUNCTIONS ====================
    function showLoading(show) {
        const loading = document.getElementById('loading');
        const btn = document.getElementById('submit-btn');
        const btnText = btn ? btn.querySelector('.btn-text') : null;
        const btnLoader = btn ? btn.querySelector('.btn-loader') : null;
        
        if (show) {
            if (loading) loading.style.display = 'block';
            if (btn) {
                btn.disabled = true;
                if (btnText) btnText.style.display = 'none';
                if (btnLoader) btnLoader.style.display = 'inline';
            }
        } else {
            if (loading) loading.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                if (btnText) btnText.style.display = 'inline';
                if (btnLoader) btnLoader.style.display = 'none';
            }
        }
    }

    function showError(message) {
        const errorBox = document.getElementById('error-message');
        if (errorBox) {
            errorBox.textContent = message;
            errorBox.style.display = 'block';
        }
        console.error('Error:', message);
    }

    function hideError() {
        const errorBox = document.getElementById('error-message');
        if (errorBox) {
            errorBox.style.display = 'none';
        }
    }

    function clearResults() {
        const resultsContainer = document.getElementById('results-container');
        const resultsNav = document.getElementById('results-nav');
        
        if (resultsContainer) resultsContainer.innerHTML = '';
        if (resultsNav) resultsNav.style.display = 'none';
    }

    function formatCurrency(value) {
        if (!value && value !== 0) return 'Rp 0';
        return 'Rp ' + parseFloat(value).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    function formatNumber(value) {
        if (!value && value !== 0) return '0';
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

})();