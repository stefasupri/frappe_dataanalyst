// POS Predictions Dashboard - Vanilla JavaScript

(function() {
    'use strict';

    let predictions = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        initForm();
    });

    function initForm() {
        const form = document.getElementById('prediction-form');
        form.addEventListener('submit', handleSubmit);
    }

    function handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const company = formData.get('company');
        
        if (!company) {
            showError('Please enter a company name');
            return;
        }

        fetchPredictions({
            company: company,
            pos_profiles: formData.get('pos_profiles'),
            date_from: formData.get('date_from'),
            date_to: formData.get('date_to'),
            prediction_days: formData.get('prediction_days') || 30
        });
    }

    function fetchPredictions(params) {
        showLoading(true);
        hideError();
        clearResults();

        // Prepare request
        const url = '/api/method/data_analyst.api.pos.get_pos_predictions';
        
        // Build query params
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

        // Fetch data
        fetch(`${url}?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': getCookie('csrf_token')
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
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

    function renderResults() {
        if (!predictions) return;

        let html = '';

        // Info Header
        html += renderInfoHeader();

        // Sales Prediction
        if (predictions.sales_prediction?.status === 'success') {
            html += renderSalesPrediction();
        }

        // Product Demand
        if (predictions.product_demand_prediction?.status === 'success') {
            html += renderProductDemand();
        }

        // Profit Prediction
        if (predictions.profit_prediction?.status === 'success') {
            html += renderProfitPrediction();
        }

        // Customer Prediction
        if (predictions.active_customer_prediction?.status === 'success') {
            html += renderCustomerPrediction();
        }

        // Bestseller Prediction
        if (predictions.bestseller_prediction?.status === 'success') {
            html += renderBestsellerPrediction();
        }

        // Stock Prediction
        if (predictions.stock_prediction?.status === 'success') {
            html += renderStockPrediction();
        }

        document.getElementById('results-container').innerHTML = html;
        bindCollapseEvents();
    }

    function renderInfoHeader() {
        const p = predictions;
        return `
            <div class="info-header">
                <h3>Prediction Summary</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Company</label>
                        <value>${p.company}</value>
                    </div>
                    <div class="info-item">
                        <label>POS Profiles</label>
                        <value>${p.pos_profiles.length} profiles</value>
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

    function renderSalesPrediction() {
        const sp = predictions.sales_prediction;
        return `
            <div class="prediction-card">
                <div class="prediction-header" onclick="toggleSection('sales')">
                    <div class="prediction-icon" style="background: #d4edda; color: #27ae60;">
                        📈
                    </div>
                    <div class="prediction-title">
                        <h3>Sales Prediction</h3>
                        <p>Prediksi penjualan berdasarkan trend historis</p>
                    </div>
                    <span class="chevron" id="chevron-sales">▶</span>
                </div>
                <div class="prediction-content" id="content-sales">
                    <div class="metrics-grid">
                        <div class="metric-box info">
                            <div class="metric-label">Current Avg Daily Sales</div>
                            <div class="metric-value">${formatCurrency(sp.current_avg_daily_sales)}</div>
                        </div>
                        <div class="metric-box success">
                            <div class="metric-label">Predicted Daily Sales</div>
                            <div class="metric-value">${formatCurrency(sp.predicted_daily_sales)}</div>
                        </div>
                        <div class="metric-box purple">
                            <div class="metric-label">Predicted Total Sales</div>
                            <div class="metric-value">${formatCurrency(sp.predicted_total_sales)}</div>
                        </div>
                        <div class="metric-box ${sp.growth_rate_percentage >= 0 ? 'success' : 'danger'}">
                            <div class="metric-label">Growth Rate</div>
                            <div class="metric-value">${sp.growth_rate_percentage}%</div>
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
            rows += `
                <tr>
                    <td>
                        <strong>${item.item_name}</strong><br>
                        <small style="color: #7f8c8d;">${item.item_code}</small>
                    </td>
                    <td style="text-align: right;">${formatNumber(item.daily_average_demand)}</td>
                    <td style="text-align: right;">
                        <span class="badge badge-info">${formatNumber(item.predicted_demand)}</span>
                    </td>
                    <td style="text-align: right;">${item.transaction_frequency}x</td>
                </tr>
            `;
        });

        return `
            <div class="prediction-card">
                <div class="prediction-header" onclick="toggleSection('products')">
                    <div class="prediction-icon" style="background: #d1ecf1; color: #0c5460;">
                        📦
                    </div>
                    <div class="prediction-title">
                        <h3>Product Demand Prediction</h3>
                        <p>Top ${pd.top_products.length} produk dengan prediksi demand tertinggi</p>
                    </div>
                    <span class="chevron" id="chevron-products">▶</span>
                </div>
                <div class="prediction-content" id="content-products">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style="text-align: right;">Daily Avg</th>
                                <th style="text-align: right;">Predicted Demand</th>
                                <th style="text-align: right;">Frequency</th>
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
                <div class="prediction-header" onclick="toggleSection('profit')">
                    <div class="prediction-icon" style="background: #fff3cd; color: #856404;">
                        💰
                    </div>
                    <div class="prediction-title">
                        <h3>Profit Prediction</h3>
                        <p>Prediksi keuntungan dan margin</p>
                    </div>
                    <span class="chevron" id="chevron-profit">▶</span>
                </div>
                <div class="prediction-content" id="content-profit">
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
                    <div class="note-box">
                        <strong>Note:</strong> ${pp.note}
                    </div>
                </div>
            </div>
        `;
    }

    function renderCustomerPrediction() {
        const cp = predictions.active_customer_prediction;
        let customerRows = '';
        cp.top_customers.forEach(cust => {
            const badgeClass = cust.customer_type === 'loyal' ? 'badge-success' : 'badge-info';
            customerRows += `
                <tr>
                    <td>${cust.customer_name}</td>
                    <td style="text-align: right;">${cust.transaction_count}x</td>
                    <td style="text-align: right;"><strong>${formatCurrency(cust.total_spent)}</strong></td>
                    <td style="text-align: center;">
                        <span class="badge ${badgeClass}">${cust.customer_type}</span>
                    </td>
                </tr>
            `;
        });

        return `
            <div class="prediction-card">
                <div class="prediction-header" onclick="toggleSection('customers')">
                    <div class="prediction-icon" style="background: #e2d5f1; color: #6f42c1;">
                        👥
                    </div>
                    <div class="prediction-title">
                        <h3>Active Customer Prediction</h3>
                        <p>Analisis pelanggan dan retention</p>
                    </div>
                    <span class="chevron" id="chevron-customers">▶</span>
                </div>
                <div class="prediction-content" id="content-customers">
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
                            <div class="metric-label">Predicted New</div>
                            <div class="metric-value">${formatNumber(cp.predicted_new_customers)}</div>
                        </div>
                    </div>
                    <h4 style="margin-top: 20px; margin-bottom: 10px; font-size: 14px; font-weight: 600;">Top Customers</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th style="text-align: right;">Transactions</th>
                                <th style="text-align: right;">Total Spent</th>
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
                <div class="prediction-header" onclick="toggleSection('bestsellers')">
                    <div class="prediction-icon" style="background: #ffe5d9; color: #fd7e14;">
                        🛒
                    </div>
                    <div class="prediction-title">
                        <h3>Bestseller Prediction</h3>
                        <p>Produk terlaris dan popularity score</p>
                    </div>
                    <span class="chevron" id="chevron-bestsellers">▶</span>
                </div>
                <div class="prediction-content" id="content-bestsellers">
                    ${bestsellerHtml}
                </div>
            </div>
        `;
    }

    function renderStockPrediction() {
        const sp = predictions.stock_prediction;
        
        let criticalHtml = '';
        if (sp.critical_items && sp.critical_items.length > 0) {
            criticalHtml = '<h4 style="color: #e74c3c; margin-bottom: 12px; font-size: 14px; font-weight: 600;">⚠️ Critical Stock Items</h4>';
            sp.critical_items.forEach(item => {
                criticalHtml += `
                    <div class="stock-alert critical">
                        <div class="stock-alert-title" style="color: #e74c3c;">
                            <span>${item.item_name}</span>
                            <span style="font-size: 12px;">⚠️ ${item.days_until_stockout} days until stockout</span>
                        </div>
                        <div class="stock-alert-grid">
                            <div class="stock-alert-item">
                                <label>Current</label>
                                <value>${formatNumber(item.current_stock)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Predicted Use</label>
                                <value>${formatNumber(item.predicted_consumption)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Reorder</label>
                                <value style="color: #e74c3c;">${formatNumber(item.reorder_quantity)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Status</label>
                                <value><span class="badge badge-danger">${item.stock_status}</span></value>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        let lowHtml = '';
        if (sp.low_stock_items && sp.low_stock_items.length > 0) {
            lowHtml = '<h4 style="color: #f39c12; margin: 20px 0 12px 0; font-size: 14px; font-weight: 600;">⚡ Low Stock Items</h4>';
            sp.low_stock_items.forEach(item => {
                lowHtml += `
                    <div class="stock-alert low">
                        <div class="stock-alert-title" style="color: #f39c12;">
                            <span>${item.item_name}</span>
                            <span style="font-size: 12px;">${item.days_until_stockout} days remaining</span>
                        </div>
                        <div class="stock-alert-grid">
                            <div class="stock-alert-item">
                                <label>Current</label>
                                <value>${formatNumber(item.current_stock)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Predicted Use</label>
                                <value>${formatNumber(item.predicted_consumption)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Reorder</label>
                                <value style="color: #f39c12;">${formatNumber(item.reorder_quantity)}</value>
                            </div>
                            <div class="stock-alert-item">
                                <label>Status</label>
                                <value><span class="badge badge-warning">${item.stock_status}</span></value>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="prediction-card">
                <div class="prediction-header" onclick="toggleSection('stock')">
                    <div class="prediction-icon" style="background: #f8d7da; color: #e74c3c;">
                        ⚠️
                    </div>
                    <div class="prediction-title">
                        <h3>Stock Prediction</h3>
                        <p>${sp.summary.critical_stock_count} critical, ${sp.summary.low_stock_count} low stock items</p>
                    </div>
                    <span class="chevron" id="chevron-stock">▶</span>
                </div>
                <div class="prediction-content" id="content-stock">
                    ${criticalHtml}
                    ${lowHtml}
                    <div class="summary-box">
                        <div class="summary-title">Stock Summary</div>
                        <div class="summary-grid">
                            <div class="summary-item">
                                <label>Total Items</label>
                                <value style="color: #2c3e50;">${sp.summary.total_items_analyzed}</value>
                            </div>
                            <div class="summary-item">
                                <label>Critical</label>
                                <value style="color: #e74c3c;">${sp.summary.critical_stock_count}</value>
                            </div>
                            <div class="summary-item">
                                <label>Low Stock</label>
                                <value style="color: #f39c12;">${sp.summary.low_stock_count}</value>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Utility Functions
    function toggleSection(section) {
        const content = document.getElementById('content-' + section);
        const chevron = document.getElementById('chevron-' + section);
        
        if (content.classList.contains('expanded')) {
            content.classList.remove('expanded');
            chevron.classList.remove('rotated');
        } else {
            content.classList.add('expanded');
            chevron.classList.add('rotated');
        }
    }

    function bindCollapseEvents() {
        // Auto-expand all sections on first load
        const sections = ['sales', 'products', 'profit', 'customers', 'bestsellers', 'stock'];
        sections.forEach(section => {
            const content = document.getElementById('content-' + section);
            const chevron = document.getElementById('chevron-' + section);
            if (content && chevron) {
                content.classList.add('expanded');
                chevron.classList.add('rotated');
            }
        });
    }

    function showLoading(show) {
        const loading = document.getElementById('loading');
        const btn = document.getElementById('submit-btn');
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');
        
        if (show) {
            loading.style.display = 'block';
            btn.disabled = true;
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline';
        } else {
            loading.style.display = 'none';
            btn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
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

    function clearResults() {
        document.getElementById('results-container').innerHTML = '';
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

    // Make toggleSection global for onclick
    window.toggleSection = toggleSection;
})();