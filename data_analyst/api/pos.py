import frappe
from frappe import _
from datetime import datetime, timedelta
import json
from collections import defaultdict
import statistics
import numpy as np

@frappe.whitelist(allow_guest=False, methods=['GET', 'POST'])
def get_pos_predictions(company=None, pos_profiles=None, date_from=None, date_to=None, prediction_days=30):
    """
    Mendapatkan prediksi dan analisis dari POS Invoice
    
    Args:
        company: Nama company
        pos_profiles: List POS Profile (opsional, default ambil 3 teratas)
        date_from: Tanggal mulai (default: 90 hari yang lalu)
        date_to: Tanggal akhir (default: hari ini)
        prediction_days: Jumlah hari untuk prediksi (default: 30)
    
    Usage:
        GET: /api/method/data_analyst.api.pos.get_pos_predictions?company=ABC&pos_profiles=["POS1","POS2"]
        POST: Body JSON atau Form Data
    """
    
    # Handle JSON request body for POST
    if not company and frappe.request and frappe.request.data:
        try:
            data = json.loads(frappe.request.data)
            company = data.get('company')
            pos_profiles = data.get('pos_profiles')
            date_from = data.get('date_from')
            date_to = data.get('date_to')
            prediction_days = data.get('prediction_days', 30)
        except:
            pass
    
    if not company:
        frappe.throw(_("Parameter 'company' wajib diisi"))
    
    # Convert prediction_days to int
    try:
        prediction_days = int(prediction_days)
    except:
        prediction_days = 30
    
    if not date_to:
        date_to = datetime.now().strftime('%Y-%m-%d')
    
    if not date_from:
        date_from = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
    
    # Ambil 3 POS Profile jika tidak dispesifikasikan
    if not pos_profiles:
        pos_profiles_data = frappe.get_all(
            'POS Profile',
            filters={'company': company, 'disabled': 0},
            fields=['name', 'warehouse'],
            limit=3
        )
        pos_profiles = [p['name'] for p in pos_profiles_data]
    else:
        if isinstance(pos_profiles, str):
            pos_profiles = json.loads(pos_profiles)
    
    if not pos_profiles:
        frappe.throw(_("Tidak ada POS Profile aktif untuk company ini"))
    
    # Kumpulkan semua prediksi
    predictions = {
        'company': company,
        'pos_profiles': pos_profiles,
        'date_range': {'from': date_from, 'to': date_to},
        'prediction_period': f"{prediction_days} hari ke depan",
        'sales_prediction': predict_sales(company, pos_profiles, date_from, date_to, prediction_days),
        'product_demand_prediction': predict_product_demand(company, pos_profiles, date_from, date_to, prediction_days),
        'profit_prediction': predict_profit(company, pos_profiles, date_from, date_to, prediction_days),
        'active_customer_prediction': predict_active_customers(company, pos_profiles, date_from, date_to, prediction_days),
        'bestseller_prediction': predict_bestsellers(company, pos_profiles, date_from, date_to, prediction_days),
        'stock_prediction': predict_stock_needs(company, pos_profiles, date_from, date_to, prediction_days)
    }
    
    return predictions


#================ Simple Linear Regression + Statistical Average ===================
def predict_sales(company, pos_profiles, date_from, date_to, prediction_days):
    """Prediksi Penjualan berdasarkan trend historis"""
    
    # Ambil data sales per hari
    sales_data = frappe.db.sql("""
        SELECT 
            DATE(posting_date) as date,
            SUM(grand_total) as total_sales,
            COUNT(name) as transaction_count
        FROM `tabPOS Invoice`
        WHERE company = %s 
            AND pos_profile IN %s
            AND docstatus = 1
            AND posting_date BETWEEN %s AND %s
        GROUP BY DATE(posting_date)
        ORDER BY posting_date
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not sales_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data penjualan untuk periode ini'
        }
    
    # Hitung statistik
    daily_sales = [d['total_sales'] for d in sales_data]
    avg_daily_sales = statistics.mean(daily_sales)
    
    # Simple linear regression untuk trend
    days = list(range(len(daily_sales)))
    if len(days) > 1:
        trend = np.polyfit(days, daily_sales, 1)[0]  # slope
    else:
        trend = 0
    
    # Prediksi
    predicted_daily_sales = avg_daily_sales + (trend * len(days))
    predicted_monthly_sales = predicted_daily_sales * prediction_days
    
    # Hitung growth rate
    if len(daily_sales) >= 7:
        recent_avg = statistics.mean(daily_sales[-7:])
        older_avg = statistics.mean(daily_sales[:7])
        growth_rate = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
    else:
        growth_rate = 0
    
    return {
        'status': 'success',
        'current_avg_daily_sales': round(avg_daily_sales, 2),
        'predicted_daily_sales': round(predicted_daily_sales, 2),
        'predicted_total_sales': round(predicted_monthly_sales, 2),
        'growth_rate_percentage': round(growth_rate, 2),
        'trend': 'naik' if trend > 0 else 'turun' if trend < 0 else 'stabil',
        'confidence': 'tinggi' if len(daily_sales) > 30 else 'sedang' if len(daily_sales) > 14 else 'rendah',
        'historical_data_points': len(daily_sales)
    }


#====================== Moving Average with Daily Rate Analysis ========================
def predict_product_demand(company, pos_profiles, date_from, date_to, prediction_days):
    """Prediksi Permintaan Produk"""
    
    # Ambil data item yang terjual
    items_data = frappe.db.sql("""
        SELECT 
            pii.item_code,
            pii.item_name,
            SUM(pii.qty) as total_qty,
            COUNT(DISTINCT pi.name) as transaction_count,
            SUM(pii.amount) as total_amount,
            AVG(pii.qty) as avg_qty_per_transaction
        FROM `tabPOS Invoice Item` pii
        INNER JOIN `tabPOS Invoice` pi ON pii.parent = pi.name
        WHERE pi.company = %s 
            AND pi.pos_profile IN %s
            AND pi.docstatus = 1
            AND pi.posting_date BETWEEN %s AND %s
        GROUP BY pii.item_code
        ORDER BY total_qty DESC
        LIMIT 20
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not items_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data produk'
        }
    
    # Hitung periode dalam hari
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    predictions = []
    for item in items_data:
        daily_avg = item['total_qty'] / date_diff
        predicted_demand = daily_avg * prediction_days
        
        predictions.append({
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'historical_total_qty': round(item['total_qty'], 2),
            'daily_average_demand': round(daily_avg, 2),
            'predicted_demand': round(predicted_demand, 2),
            'transaction_frequency': item['transaction_count'],
            'avg_qty_per_transaction': round(item['avg_qty_per_transaction'], 2)
        })
    
    return {
        'status': 'success',
        'top_products': predictions[:10],
        'total_products_analyzed': len(predictions)
    }

# ========================== Naive Forecasting ===============================
import statistics
import frappe

def predict_profit(company, pos_profiles, date_from, date_to, prediction_days):
    """
    Prediksi Keuntungan menggunakan:
    - Harga Jual: dari rate di POS Invoice Item
    - Cost: dari valuation_rate di Stock Ledger Entry terakhir (sebelum/saat transaksi)
    
    Fallback Priority:
    1. SLE Valuation Rate (dari stock ledger entry terakhir)
    2. Item Valuation Rate (dari master item)
    3. Last Purchase Rate (dari master item)
    4. 0 (jika tidak ada data)
    """
    
    # Convert params jika dari API call
    if isinstance(pos_profiles, str):
        import json
        pos_profiles = json.loads(pos_profiles)
    
    if not isinstance(pos_profiles, (list, tuple)):
        pos_profiles = [pos_profiles]
    
    prediction_days = int(prediction_days)
    
    # Query - Ambil cost dari SLE terakhir (tidak peduli voucher type)
    invoice_items = frappe.db.sql("""
        SELECT 
            DATE(pi.posting_date) as date,
            pii.item_code,
            pii.item_name,
            pii.qty,
            pii.rate as selling_price,
            pii.amount as revenue,
            -- Ambil cost dari SLE terakhir sebelum/saat transaksi
            COALESCE(
                (
                    SELECT sle.valuation_rate
                    FROM `tabStock Ledger Entry` sle
                    WHERE sle.item_code = pii.item_code
                        AND sle.warehouse = pi.set_warehouse
                        AND (sle.posting_date < pi.posting_date 
                             OR (sle.posting_date = pi.posting_date AND sle.posting_time <= pi.posting_time))
                    ORDER BY sle.posting_date DESC, sle.posting_time DESC, sle.creation DESC
                    LIMIT 1
                ),
                item.valuation_rate,
                item.last_purchase_rate,
                0
            ) as cost_per_unit,
            -- Track sumber cost
            item.valuation_rate as item_valuation_rate,
            item.last_purchase_rate as item_last_purchase_rate,
            CASE
                WHEN (
                    SELECT COUNT(*)
                    FROM `tabStock Ledger Entry` sle
                    WHERE sle.item_code = pii.item_code
                        AND sle.warehouse = pi.set_warehouse
                        AND (sle.posting_date < pi.posting_date 
                             OR (sle.posting_date = pi.posting_date AND sle.posting_time <= pi.posting_time))
                    LIMIT 1
                ) > 0 THEN 'SLE Valuation Rate'
                WHEN item.valuation_rate > 0 THEN 'Item Valuation'
                WHEN item.last_purchase_rate > 0 THEN 'Last Purchase'
                ELSE 'No Cost'
            END as cost_source
        FROM `tabPOS Invoice Item` pii
        INNER JOIN `tabPOS Invoice` pi ON pii.parent = pi.name
        LEFT JOIN `tabItem` item ON pii.item_code = item.name
        WHERE pi.company = %s 
            AND pi.pos_profile IN %s
            AND pi.docstatus = 1
            AND pi.posting_date BETWEEN %s AND %s
        ORDER BY pi.posting_date, pii.idx
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not invoice_items:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data transaksi dalam periode ini'
        }
    
    # Aggregate per hari dan tracking cost source
    daily_data = {}
    cost_source_count = {'SLE Valuation Rate': 0, 'Item Valuation': 0, 'Last Purchase': 0, 'No Cost': 0}
    items_no_cost = set()
    
    for item in invoice_items:
        date = item['date']
        
        if date not in daily_data:
            daily_data[date] = {
                'revenue': 0,
                'cost': 0,
                'profit': 0,
                'qty': 0
            }
        
        # Calculate
        revenue = item['revenue']
        cost = item['qty'] * item['cost_per_unit']
        profit = revenue - cost
        
        daily_data[date]['revenue'] += revenue
        daily_data[date]['cost'] += cost
        daily_data[date]['profit'] += profit
        daily_data[date]['qty'] += item['qty']
        
        # Track cost source
        cost_source_count[item['cost_source']] += 1
        if item['cost_source'] == 'No Cost':
            items_no_cost.add(item['item_code'])
    
    # Calculate totals
    total_revenue = sum(d['revenue'] for d in daily_data.values())
    total_cost = sum(d['cost'] for d in daily_data.values())
    total_profit = sum(d['profit'] for d in daily_data.values())
    daily_profits = [d['profit'] for d in daily_data.values()]
    
    # Statistics
    num_days = len(daily_data)
    avg_daily_profit = statistics.mean(daily_profits) if daily_profits else 0
    avg_daily_revenue = total_revenue / num_days if num_days > 0 else 0
    avg_daily_cost = total_cost / num_days if num_days > 0 else 0
    profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    # Predictions
    predicted_revenue = avg_daily_revenue * prediction_days
    predicted_cost = avg_daily_cost * prediction_days
    predicted_profit = avg_daily_profit * prediction_days
    predicted_margin = (predicted_profit / predicted_revenue * 100) if predicted_revenue > 0 else 0
    
    # Build result - Compatible dengan frontend
    result = {
        'status': 'success',
        'method': 'Naive Forecasting - Using Last SLE Valuation Rate',
        
        # New structure (untuk frontend baru)
        'historical': {
            'revenue': round(total_revenue, 2),
            'cost': round(total_cost, 2),
            'profit': round(total_profit, 2),
            'margin': round(profit_margin, 2),
            'days': num_days
        },
        
        'daily_average': {
            'revenue': round(avg_daily_revenue, 2),
            'cost': round(avg_daily_cost, 2),
            'profit': round(avg_daily_profit, 2)
        },
        
        'prediction': {
            'days': prediction_days,
            'revenue': round(predicted_revenue, 2),
            'cost': round(predicted_cost, 2),
            'profit': round(predicted_profit, 2),
            'margin': round(predicted_margin, 2)
        },
        
        # Legacy structure (backward compatibility)
        'current_total_revenue': round(total_revenue, 2),
        'current_total_cost': round(total_cost, 2),
        'current_total_profit': round(total_profit, 2),
        'current_profit_margin': round(profit_margin, 2),
        'avg_daily_profit': round(avg_daily_profit, 2),
        'avg_daily_revenue': round(avg_daily_revenue, 2),
        'avg_daily_cost': round(avg_daily_cost, 2),
        'predicted_total_revenue': round(predicted_revenue, 2),
        'predicted_total_cost': round(predicted_cost, 2),
        'predicted_total_profit': round(predicted_profit, 2),
        'predicted_profit_margin': round(predicted_margin, 2),
        'data_period_days': num_days,
        'prediction_days': prediction_days,
        'note': f'Cost dari SLE Valuation Rate: {cost_source_count["SLE Valuation Rate"]}/{sum(cost_source_count.values())} transaksi ({round(cost_source_count["SLE Valuation Rate"] / sum(cost_source_count.values()) * 100, 1) if sum(cost_source_count.values()) > 0 else 0}%)',
        
        'cost_data_quality': {
            'sources': cost_source_count,
            'total_transactions': sum(cost_source_count.values()),
            'sle_percentage': round(cost_source_count['SLE Valuation Rate'] / sum(cost_source_count.values()) * 100, 1) if sum(cost_source_count.values()) > 0 else 0,
            'items_without_cost': len(items_no_cost)
        }
    }
    
    # Warnings
    warnings = []
    
    if cost_source_count['SLE Valuation Rate'] == 0:
        warnings.append({
            'type': 'warning',
            'message': 'Tidak ada cost dari Stock Ledger Entry',
            'impact': 'Semua cost menggunakan fallback (item valuation_rate/last_purchase_rate)',
            'action': 'Pastikan ada stock movement (Purchase Receipt, Stock Entry) sebelum POS Invoice'
        })
    
    if items_no_cost:
        warnings.append({
            'type': 'critical',
            'message': f'{len(items_no_cost)} item TIDAK memiliki data cost',
            'items': sorted(list(items_no_cost))[:10],
            'impact': 'Profit untuk item ini = Revenue (cost dihitung 0)',
            'action': 'Update valuation_rate atau last_purchase_rate di master Item'
        })
    
    if cost_source_count['Last Purchase'] > 0:
        warnings.append({
            'type': 'warning',
            'message': f'{cost_source_count["Last Purchase"]} transaksi menggunakan last_purchase_rate',
            'impact': 'Cost mungkin tidak akurat jika harga sudah berubah'
        })
    
    if warnings:
        result['warnings'] = warnings
    
    # Daily breakdown
    result['daily_breakdown'] = [
        {
            'date': str(date),
            'revenue': round(d['revenue'], 2),
            'cost': round(d['cost'], 2),
            'profit': round(d['profit'], 2),
            'margin': round((d['profit'] / d['revenue'] * 100) if d['revenue'] > 0 else 0, 1),
            'qty': d['qty']
        }
        for date, d in sorted(daily_data.items())
    ]
    
    return result

# Customer Behavior Analysis & Retention Modeling
def predict_active_customers(company, pos_profiles, date_from, date_to, prediction_days):
    """Prediksi Pelanggan Aktif"""
    
    # Ambil data customer per periode
    customer_data = frappe.db.sql("""
        SELECT 
            customer,
            customer_name,
            COUNT(name) as transaction_count,
            SUM(grand_total) as total_spent,
            MIN(posting_date) as first_purchase,
            MAX(posting_date) as last_purchase,
            COUNT(DISTINCT DATE(posting_date)) as active_days
        FROM `tabPOS Invoice`
        WHERE company = %s 
            AND pos_profile IN %s
            AND docstatus = 1
            AND posting_date BETWEEN %s AND %s
            AND customer IS NOT NULL
            AND customer != ''
        GROUP BY customer
        ORDER BY transaction_count DESC
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not customer_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data customer'
        }
    
    # Analisis customer behavior
    total_customers = len(customer_data)
    repeat_customers = len([c for c in customer_data if c['transaction_count'] > 1])
    loyal_customers = len([c for c in customer_data if c['transaction_count'] >= 5])
    
    # Hitung retention rate
    retention_rate = (repeat_customers / total_customers * 100) if total_customers > 0 else 0
    
    # Prediksi berdasarkan trend
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    avg_daily_new_customers = total_customers / date_diff
    predicted_new_customers = round(avg_daily_new_customers * prediction_days)
    predicted_active_customers = round(total_customers * (1 + retention_rate/100))
    
    # Top customers
    top_customers = []
    for cust in customer_data[:10]:
        top_customers.append({
            'customer': cust['customer'],
            'customer_name': cust['customer_name'],
            'transaction_count': cust['transaction_count'],
            'total_spent': round(cust['total_spent'], 2),
            'avg_transaction_value': round(cust['total_spent'] / cust['transaction_count'], 2),
            'customer_type': 'loyal' if cust['transaction_count'] >= 5 else 'repeat' if cust['transaction_count'] > 1 else 'new'
        })
    
    return {
        'status': 'success',
        'current_total_customers': total_customers,
        'repeat_customers': repeat_customers,
        'loyal_customers': loyal_customers,
        'retention_rate': round(retention_rate, 2),
        'predicted_new_customers': predicted_new_customers,
        'predicted_active_customers': predicted_active_customers,
        'top_customers': top_customers
    }

# Multi-factor Popularity Scoring
def predict_bestsellers(company, pos_profiles, date_from, date_to, prediction_days):
    """Prediksi Produk Terlaris"""
    
    # Ambil data penjualan produk dengan trend
    bestseller_data = frappe.db.sql("""
        SELECT 
            pii.item_code,
            pii.item_name,
            pii.item_group,
            SUM(pii.qty) as total_qty,
            SUM(pii.amount) as total_amount,
            COUNT(DISTINCT pi.name) as transaction_count,
            COUNT(DISTINCT pi.customer) as unique_customers,
            AVG(pii.rate) as avg_price
        FROM `tabPOS Invoice Item` pii
        INNER JOIN `tabPOS Invoice` pi ON pii.parent = pi.name
        WHERE pi.company = %s 
            AND pi.pos_profile IN %s
            AND pi.docstatus = 1
            AND pi.posting_date BETWEEN %s AND %s
        GROUP BY pii.item_code
        ORDER BY total_qty DESC
        LIMIT 20
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not bestseller_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data produk terlaris'
        }
    
    # Hitung periode
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    predictions = []
    for idx, item in enumerate(bestseller_data, 1):
        daily_sales = item['total_qty'] / date_diff
        predicted_sales = daily_sales * prediction_days
        revenue_contribution = item['total_amount']
        
        predictions.append({
            'rank': idx,
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'item_group': item['item_group'],
            'historical_qty_sold': round(item['total_qty'], 2),
            'predicted_qty_needed': round(predicted_sales, 2),
            'daily_avg_sales': round(daily_sales, 2),
            'transaction_frequency': item['transaction_count'],
            'unique_customers': item['unique_customers'],
            'avg_price': round(item['avg_price'], 2),
            'revenue_contribution': round(revenue_contribution, 2),
            'popularity_score': round((item['transaction_count'] * item['unique_customers']) / date_diff, 2)
        })
    
    # Group by item group
    group_summary = {}
    for item in predictions:
        group = item['item_group']
        if group not in group_summary:
            group_summary[group] = {
                'total_qty': 0,
                'total_revenue': 0,
                'item_count': 0
            }
        group_summary[group]['total_qty'] += item['historical_qty_sold']
        group_summary[group]['total_revenue'] += item['revenue_contribution']
        group_summary[group]['item_count'] += 1
    
    return {
        'status': 'success',
        'top_bestsellers': predictions[:10],
        'all_bestsellers': predictions,
        'category_performance': group_summary
    }

# Consumption-based Forecasting dengan Safety Stock
def predict_stock_needs(company, pos_profiles, date_from, date_to, prediction_days):
    """Prediksi Kebutuhan Stok"""
    
    # Ambil warehouse dari POS Profile
    warehouses = frappe.db.sql("""
        SELECT DISTINCT warehouse 
        FROM `tabPOS Profile` 
        WHERE name IN %s AND warehouse IS NOT NULL
    """, [pos_profiles], as_dict=1)
    
    warehouse_list = [w['warehouse'] for w in warehouses]
    
    # Ambil data penjualan dan stok
    stock_data = frappe.db.sql("""
        SELECT 
            pii.item_code,
            pii.item_name,
            pii.uom,
            SUM(pii.qty) as total_sold,
            AVG(pii.qty) as avg_qty_per_transaction,
            COUNT(DISTINCT pi.name) as transaction_count
        FROM `tabPOS Invoice Item` pii
        INNER JOIN `tabPOS Invoice` pi ON pii.parent = pi.name
        WHERE pi.company = %s 
            AND pi.pos_profile IN %s
            AND pi.docstatus = 1
            AND pi.posting_date BETWEEN %s AND %s
        GROUP BY pii.item_code
        ORDER BY total_sold DESC
        LIMIT 50
    """, (company, pos_profiles, date_from, date_to), as_dict=1)
    
    if not stock_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data stok'
        }
    
    # Hitung periode
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    predictions = []
    for item in stock_data:
        # Daily sales rate
        daily_sales_rate = item['total_sold'] / date_diff
        
        # Predicted needs
        predicted_consumption = daily_sales_rate * prediction_days
        
        # Safety stock (20% buffer)
        safety_stock = predicted_consumption * 0.2
        recommended_stock = predicted_consumption + safety_stock
        
        # Current stock level
        current_stock = 0
        if warehouse_list:
            stock_balance = frappe.db.get_value(
                'Bin',
                {'item_code': item['item_code'], 'warehouse': ['in', warehouse_list]},
                'sum(actual_qty)'
            )
            current_stock = stock_balance or 0
        
        # Status
        stock_status = 'sufficient'
        if current_stock < predicted_consumption:
            stock_status = 'critical'
        elif current_stock < recommended_stock:
            stock_status = 'low'
        
        reorder_qty = max(0, recommended_stock - current_stock)
        
        predictions.append({
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'uom': item['uom'],
            'current_stock': round(current_stock, 2),
            'daily_sales_rate': round(daily_sales_rate, 2),
            'predicted_consumption': round(predicted_consumption, 2),
            'safety_stock': round(safety_stock, 2),
            'recommended_stock_level': round(recommended_stock, 2),
            'reorder_quantity': round(reorder_qty, 2),
            'stock_status': stock_status,
            'days_until_stockout': round(current_stock / daily_sales_rate, 1) if daily_sales_rate > 0 else 999
        })
    
    # Prioritize critical items
    critical_items = [p for p in predictions if p['stock_status'] == 'critical']
    low_stock_items = [p for p in predictions if p['stock_status'] == 'low']
    
    return {
        'status': 'success',
        'critical_items': sorted(critical_items, key=lambda x: x['days_until_stockout'])[:10],
        'low_stock_items': sorted(low_stock_items, key=lambda x: x['days_until_stockout'])[:10],
        'all_items': sorted(predictions, key=lambda x: x['predicted_consumption'], reverse=True)[:20],
        'summary': {
            'total_items_analyzed': len(predictions),
            'critical_stock_count': len(critical_items),
            'low_stock_count': len(low_stock_items)
        }
    }


@frappe.whitelist(allow_guest=False, methods=['GET', 'POST'])
def get_pos_dashboard(company=None, pos_profiles=None, date_from=None, date_to=None):
    """
    Dashboard summary untuk POS Analytics
    
    Usage:
        GET: /api/method/data_analyst.api.pos.get_pos_dashboard?company=ABC
        POST: Body JSON atau Form Data
    """
    
    # Handle JSON request body for POST
    if not company and frappe.request and frappe.request.data:
        try:
            data = json.loads(frappe.request.data)
            company = data.get('company')
            pos_profiles = data.get('pos_profiles')
            date_from = data.get('date_from')
            date_to = data.get('date_to')
        except:
            pass
    
    if not company:
        frappe.throw(_("Parameter 'company' wajib diisi"))
    
    if not date_to:
        date_to = datetime.now().strftime('%Y-%m-%d')
    
    if not date_from:
        date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    # Ambil 3 POS Profile jika tidak dispesifikasikan
    if not pos_profiles:
        pos_profiles_data = frappe.get_all(
            'POS Profile',
            filters={'company': company, 'disabled': 0},
            fields=['name'],
            limit=3
        )
        pos_profiles = [p['name'] for p in pos_profiles_data]
    else:
        if isinstance(pos_profiles, str):
            pos_profiles = json.loads(pos_profiles)
    
    # Summary data
    summary = frappe.db.sql("""
        SELECT 
            COUNT(name) as total_invoices,
            SUM(grand_total) as total_sales,
            COUNT(DISTINCT customer) as unique_customers,
            AVG(grand_total) as avg_transaction_value
        FROM `tabPOS Invoice`
        WHERE company = %s 
            AND pos_profile IN %s
            AND docstatus = 1
            AND posting_date BETWEEN %s AND %s
    """, (company, pos_profiles, date_from, date_to), as_dict=1)[0]
    
    return {
        'company': company,
        'pos_profiles': pos_profiles,
        'date_range': {'from': date_from, 'to': date_to},
        'summary': {
            'total_invoices': summary.get('total_invoices', 0),
            'total_sales': round(summary.get('total_sales', 0), 2),
            'unique_customers': summary.get('unique_customers', 0),
            'avg_transaction_value': round(summary.get('avg_transaction_value', 0), 2)
        }
    }

#================ Simple Linear Regression + Statistical Average ===================
@frappe.whitelist(allow_guest=False, methods=['GET', 'POST'])
def get_sales_invoice_predictions(company=None, customer_group=None, territory=None, date_from=None, date_to=None, prediction_days=30):
    """
    Mendapatkan prediksi dan analisis dari Sales Invoice
    
    Args:
        company: Nama company
        customer_group: Filter berdasarkan Customer Group (opsional)
        territory: Filter berdasarkan Territory (opsional)
        date_from: Tanggal mulai (default: 90 hari yang lalu)
        date_to: Tanggal akhir (default: hari ini)
        prediction_days: Jumlah hari untuk prediksi (default: 30)
    
    Usage:
        GET: /api/method/data_analyst.api.pos.get_sales_invoice_predictions?company=ABC
        POST: Body JSON atau Form Data
    """
    
    # Handle JSON request body for POST
    if not company and frappe.request and frappe.request.data:
        try:
            data = json.loads(frappe.request.data)
            company = data.get('company')
            customer_group = data.get('customer_group')
            territory = data.get('territory')
            date_from = data.get('date_from')
            date_to = data.get('date_to')
            prediction_days = data.get('prediction_days', 30)
        except:
            pass
    
    if not company:
        frappe.throw(_("Parameter 'company' wajib diisi"))
    
    # Convert prediction_days to int
    try:
        prediction_days = int(prediction_days)
    except:
        prediction_days = 30
    
    if not date_to:
        date_to = datetime.now().strftime('%Y-%m-%d')
    
    if not date_from:
        date_from = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
    
    # Build filters
    filters = {
        'company': company,
        'docstatus': 1,
        'posting_date': ['between', [date_from, date_to]]
    }
    
    if customer_group:
        filters['customer_group'] = customer_group
    
    if territory:
        filters['territory'] = territory
    
    # Kumpulkan semua prediksi
    predictions = {
        'company': company,
        'filters': {
            'customer_group': customer_group,
            'territory': territory
        },
        'date_range': {'from': date_from, 'to': date_to},
        'prediction_period': f"{prediction_days} hari ke depan",
        'sales_prediction': predict_sales_revenue(filters, date_from, date_to, prediction_days),
        'product_demand_prediction': predict_product_demand_si(filters, date_from, date_to, prediction_days),
        'profit_prediction': predict_profit_si(filters, date_from, date_to, prediction_days),
        'customer_analysis': analyze_customers(filters, date_from, date_to, prediction_days),
        'bestseller_prediction': predict_bestsellers_si(filters, date_from, date_to, prediction_days),
        'payment_prediction': predict_payment_collection(filters, date_from, date_to, prediction_days)
    }
    
    return predictions


def predict_sales_revenue(filters, date_from, date_to, prediction_days):
    """Prediksi Revenue dari Sales Invoice"""
    
    # Ambil data sales per hari
    sales_data = frappe.db.sql("""
        SELECT 
            DATE(posting_date) as date,
            SUM(grand_total) as total_sales,
            SUM(base_grand_total) as base_total_sales,
            SUM(outstanding_amount) as outstanding,
            COUNT(name) as invoice_count,
            AVG(grand_total) as avg_invoice_value
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = %(docstatus)s
            AND posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY DATE(posting_date)
        ORDER BY posting_date
    """.format(
        customer_group_filter="AND customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not sales_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data penjualan untuk periode ini'
        }
    
    # Hitung statistik
    daily_sales = [d['total_sales'] for d in sales_data]
    daily_invoices = [d['invoice_count'] for d in sales_data]
    avg_daily_sales = statistics.mean(daily_sales)
    avg_daily_invoices = statistics.mean(daily_invoices)
    
    # Simple linear regression untuk trend
    days = list(range(len(daily_sales)))
    if len(days) > 1:
        trend = np.polyfit(days, daily_sales, 1)[0]  # slope
    else:
        trend = 0
    
    # Prediksi
    predicted_daily_sales = avg_daily_sales + (trend * len(days))
    predicted_total_sales = predicted_daily_sales * prediction_days
    predicted_invoice_count = int(avg_daily_invoices * prediction_days)
    
    # Hitung growth rate
    if len(daily_sales) >= 7:
        recent_avg = statistics.mean(daily_sales[-7:])
        older_avg = statistics.mean(daily_sales[:7])
        growth_rate = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
    else:
        growth_rate = 0
    
    # Outstanding amount
    total_outstanding = sum([d['outstanding'] for d in sales_data])
    
    return {
        'status': 'success',
        'current_total_sales': round(sum(daily_sales), 2),
        'current_avg_daily_sales': round(avg_daily_sales, 2),
        'current_total_invoices': sum(daily_invoices),
        'current_avg_invoice_value': round(sum(daily_sales) / sum(daily_invoices), 2) if sum(daily_invoices) > 0 else 0,
        'predicted_daily_sales': round(predicted_daily_sales, 2),
        'predicted_total_sales': round(predicted_total_sales, 2),
        'predicted_invoice_count': predicted_invoice_count,
        'growth_rate_percentage': round(growth_rate, 2),
        'trend': 'naik' if trend > 0 else 'turun' if trend < 0 else 'stabil',
        'total_outstanding': round(total_outstanding, 2),
        'collection_rate': round((1 - total_outstanding / sum(daily_sales)) * 100, 2) if sum(daily_sales) > 0 else 0,
        'confidence': 'tinggi' if len(daily_sales) > 30 else 'sedang' if len(daily_sales) > 14 else 'rendah',
        'historical_data_points': len(daily_sales)
    }

#====================== Moving Average with Daily Rate Analysis ========================
def predict_product_demand_si(filters, date_from, date_to, prediction_days):
    """Prediksi Permintaan Produk dari Sales Invoice"""
    
    items_data = frappe.db.sql("""
        SELECT 
            sii.item_code,
            sii.item_name,
            sii.item_group,
            SUM(sii.qty) as total_qty,
            SUM(sii.stock_qty) as total_stock_qty,
            COUNT(DISTINCT si.name) as invoice_count,
            SUM(sii.amount) as total_amount,
            AVG(sii.qty) as avg_qty_per_invoice,
            AVG(sii.rate) as avg_rate
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
        WHERE si.company = %(company)s 
            AND si.docstatus = %(docstatus)s
            AND si.posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY sii.item_code
        ORDER BY total_qty DESC
        LIMIT 50
    """.format(
        customer_group_filter="AND si.customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND si.territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not items_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data produk'
        }
    
    # Hitung periode dalam hari
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    predictions = []
    for item in items_data:
        daily_avg = item['total_qty'] / date_diff
        predicted_demand = daily_avg * prediction_days
        
        predictions.append({
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'item_group': item['item_group'],
            'historical_total_qty': round(item['total_qty'], 2),
            'daily_average_demand': round(daily_avg, 2),
            'predicted_demand': round(predicted_demand, 2),
            'invoice_frequency': item['invoice_count'],
            'avg_qty_per_invoice': round(item['avg_qty_per_invoice'], 2),
            'avg_rate': round(item['avg_rate'], 2),
            'total_revenue': round(item['total_amount'], 2)
        })
    
    return {
        'status': 'success',
        'top_products': predictions[:20],
        'total_products_analyzed': len(predictions)
    }

# ========================== Naive Forecasting ===============================
def predict_profit_si(filters, date_from, date_to, prediction_days):
    """Prediksi Profit dari Sales Invoice"""
    
    # Ambil data profit per hari
    profit_data = frappe.db.sql("""
        SELECT 
            DATE(posting_date) as date,
            SUM(grand_total) as revenue,
            SUM(net_total) as net_revenue,
            SUM(total_taxes_and_charges) as taxes,
            SUM(discount_amount) as discount,
            COUNT(name) as invoice_count
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = %(docstatus)s
            AND posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY DATE(posting_date)
        ORDER BY posting_date
    """.format(
        customer_group_filter="AND customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not profit_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data profit'
        }
    
    # Hitung total item dan item dengan valuation rate
    item_stats = frappe.db.sql("""
        SELECT 
            COUNT(DISTINCT sii.item_code) as total_items,
            COUNT(DISTINCT CASE 
                WHEN i.valuation_rate IS NOT NULL AND i.valuation_rate > 0 
                THEN sii.item_code 
            END) as items_with_valuation
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
        LEFT JOIN `tabItem` i ON sii.item_code = i.name
        WHERE si.company = %(company)s 
            AND si.docstatus = %(docstatus)s
            AND si.posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
    """.format(
        customer_group_filter="AND si.customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND si.territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    total_items = item_stats[0]['total_items'] if item_stats else 0
    items_with_valuation = item_stats[0]['items_with_valuation'] if item_stats else 0
    
    # Hitung cost menggunakan valuation rate saja
    items_cost = frappe.db.sql("""
        SELECT 
            DATE(si.posting_date) as date,
            SUM(sii.qty * sii.rate) as item_amount,
            SUM(sii.qty * i.valuation_rate) as estimated_cost
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
        INNER JOIN `tabItem` i ON sii.item_code = i.name
        WHERE si.company = %(company)s 
            AND si.docstatus = %(docstatus)s
            AND si.posting_date BETWEEN %(date_from)s AND %(date_to)s
            AND i.valuation_rate IS NOT NULL
            AND i.valuation_rate > 0
            {customer_group_filter}
            {territory_filter}
        GROUP BY DATE(si.posting_date)
    """.format(
        customer_group_filter="AND si.customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND si.territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    cost_dict = {d['date']: d['estimated_cost'] for d in items_cost}
    
    total_revenue = 0
    total_cost = 0
    total_taxes = 0
    total_discount = 0
    daily_profits = []
    
    for day in profit_data:
        # Skip hari yang tidak punya data cost
        if day['date'] not in cost_dict:
            continue
            
        revenue = day['revenue']
        cost = cost_dict[day['date']]
        profit = revenue - cost
        
        daily_profits.append(profit)
        total_revenue += revenue
        total_cost += cost
        total_taxes += day['taxes']
        total_discount += day['discount']
    
    if not daily_profits:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data valuation rate yang valid'
        }
    
    # Hitung statistik
    avg_daily_profit = statistics.mean(daily_profits)
    total_profit = sum(daily_profits)
    profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    # Prediksi
    predicted_total_profit = avg_daily_profit * prediction_days
    predicted_revenue = (total_revenue / len(daily_profits)) * prediction_days
    predicted_cost = predicted_revenue - predicted_total_profit
    
    return {
        'status': 'success',
        'current_total_revenue': round(total_revenue, 2),
        'current_total_cost': round(total_cost, 2),
        'current_total_profit': round(total_profit, 2),
        'current_profit_margin': round(profit_margin, 2),
        'current_total_taxes': round(total_taxes, 2),
        'current_total_discount': round(total_discount, 2),
        'avg_daily_profit': round(avg_daily_profit, 2),
        'predicted_total_revenue': round(predicted_revenue, 2),
        'predicted_total_cost': round(predicted_cost, 2),
        'predicted_total_profit': round(predicted_total_profit, 2),
        'predicted_profit_margin': round(profit_margin, 2),
        'total_items': total_items,
        'items_with_valuation': items_with_valuation,
        'note': f'Prediksi menggunakan metode rata-rata historis. {items_with_valuation} dari {total_items} item memiliki valuation rate.'
    }


def analyze_customers(filters, date_from, date_to, prediction_days):
    """Analisis dan Prediksi Customer Behavior"""
    
    customer_data = frappe.db.sql("""
        SELECT 
            customer,
            customer_name,
            customer_group,
            territory,
            COUNT(name) as invoice_count,
            SUM(grand_total) as total_spent,
            SUM(outstanding_amount) as total_outstanding,
            AVG(grand_total) as avg_invoice_value,
            MIN(posting_date) as first_invoice,
            MAX(posting_date) as last_invoice,
            COUNT(DISTINCT DATE(posting_date)) as active_days
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = %(docstatus)s
            AND posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY customer
        ORDER BY total_spent DESC
    """.format(
        customer_group_filter="AND customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not customer_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data customer'
        }
    
    # Analisis customer behavior
    total_customers = len(customer_data)
    repeat_customers = len([c for c in customer_data if c['invoice_count'] > 1])
    loyal_customers = len([c for c in customer_data if c['invoice_count'] >= 5])
    
    # Hitung retention dan payment behavior
    retention_rate = (repeat_customers / total_customers * 100) if total_customers > 0 else 0
    total_revenue = sum([c['total_spent'] for c in customer_data])
    total_outstanding = sum([c['total_outstanding'] for c in customer_data])
    collection_efficiency = ((total_revenue - total_outstanding) / total_revenue * 100) if total_revenue > 0 else 0
    
    # Prediksi
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    avg_daily_new_customers = total_customers / date_diff
    predicted_new_customers = round(avg_daily_new_customers * prediction_days)
    predicted_active_customers = round(total_customers * (1 + retention_rate/100))
    
    # Top customers
    top_customers = []
    for cust in customer_data[:15]:
        payment_score = ((cust['total_spent'] - cust['total_outstanding']) / cust['total_spent'] * 100) if cust['total_spent'] > 0 else 0
        
        top_customers.append({
            'customer': cust['customer'],
            'customer_name': cust['customer_name'],
            'customer_group': cust['customer_group'],
            'territory': cust['territory'],
            'invoice_count': cust['invoice_count'],
            'total_spent': round(cust['total_spent'], 2),
            'outstanding': round(cust['total_outstanding'], 2),
            'avg_invoice_value': round(cust['avg_invoice_value'], 2),
            'payment_score': round(payment_score, 2),
            'customer_type': 'loyal' if cust['invoice_count'] >= 5 else 'repeat' if cust['invoice_count'] > 1 else 'new'
        })
    
    return {
        'status': 'success',
        'current_total_customers': total_customers,
        'repeat_customers': repeat_customers,
        'loyal_customers': loyal_customers,
        'retention_rate': round(retention_rate, 2),
        'collection_efficiency': round(collection_efficiency, 2),
        'predicted_new_customers': predicted_new_customers,
        'predicted_active_customers': predicted_active_customers,
        'top_customers': top_customers
    }


def predict_bestsellers_si(filters, date_from, date_to, prediction_days):
    """Prediksi Produk Terlaris dari Sales Invoice"""
    
    bestseller_data = frappe.db.sql("""
        SELECT 
            sii.item_code,
            sii.item_name,
            sii.item_group,
            SUM(sii.qty) as total_qty,
            SUM(sii.amount) as total_amount,
            COUNT(DISTINCT si.name) as invoice_count,
            COUNT(DISTINCT si.customer) as unique_customers,
            AVG(sii.rate) as avg_price
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
        WHERE si.company = %(company)s 
            AND si.docstatus = %(docstatus)s
            AND si.posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY sii.item_code
        ORDER BY total_qty DESC
        LIMIT 30
    """.format(
        customer_group_filter="AND si.customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND si.territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not bestseller_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data produk terlaris'
        }
    
    date_diff = (datetime.strptime(date_to, '%Y-%m-%d') - 
                 datetime.strptime(date_from, '%Y-%m-%d')).days + 1
    
    predictions = []
    for idx, item in enumerate(bestseller_data, 1):
        daily_sales = item['total_qty'] / date_diff
        predicted_sales = daily_sales * prediction_days
        
        predictions.append({
            'rank': idx,
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'item_group': item['item_group'],
            'historical_qty_sold': round(item['total_qty'], 2),
            'predicted_qty_needed': round(predicted_sales, 2),
            'daily_avg_sales': round(daily_sales, 2),
            'invoice_frequency': item['invoice_count'],
            'unique_customers': item['unique_customers'],
            'avg_price': round(item['avg_price'], 2),
            'revenue_contribution': round(item['total_amount'], 2),
            'popularity_score': round((item['invoice_count'] * item['unique_customers']) / date_diff, 2)
        })
    
    return {
        'status': 'success',
        'top_bestsellers': predictions[:15],
        'all_bestsellers': predictions
    }

#Outstanding Analysis & Aging Bucket Classification
def predict_payment_collection(filters, date_from, date_to, prediction_days):
    """Prediksi Payment Collection dan Outstanding"""
    
    # Ambil data payment collection
    payment_data = frappe.db.sql("""
        SELECT 
            DATE(posting_date) as date,
            SUM(grand_total) as invoiced_amount,
            SUM(outstanding_amount) as outstanding,
            SUM(paid_amount) as paid_amount,
            COUNT(name) as invoice_count
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = %(docstatus)s
            AND posting_date BETWEEN %(date_from)s AND %(date_to)s
            {customer_group_filter}
            {territory_filter}
        GROUP BY DATE(posting_date)
        ORDER BY posting_date
    """.format(
        customer_group_filter="AND customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'date_from': date_from,
        'date_to': date_to,
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    if not payment_data:
        return {
            'status': 'no_data',
            'message': 'Tidak ada data payment'
        }
    
    # Hitung statistik
    total_invoiced = sum([d['invoiced_amount'] for d in payment_data])
    total_outstanding = sum([d['outstanding'] for d in payment_data])
    total_collected = total_invoiced - total_outstanding
    
    collection_rate = (total_collected / total_invoiced * 100) if total_invoiced > 0 else 0
    avg_daily_invoiced = total_invoiced / len(payment_data)
    avg_daily_collection = total_collected / len(payment_data)
    
    # Prediksi
    predicted_invoiced = avg_daily_invoiced * prediction_days
    predicted_collection = avg_daily_collection * prediction_days
    predicted_outstanding = predicted_invoiced - predicted_collection
    
    # Aging analysis
    aging_data = frappe.db.sql("""
        SELECT 
            CASE 
                WHEN DATEDIFF(CURDATE(), due_date) <= 0 THEN 'Not Due'
                WHEN DATEDIFF(CURDATE(), due_date) <= 30 THEN '1-30 Days'
                WHEN DATEDIFF(CURDATE(), due_date) <= 60 THEN '31-60 Days'
                WHEN DATEDIFF(CURDATE(), due_date) <= 90 THEN '61-90 Days'
                ELSE 'Over 90 Days'
            END as aging_bucket,
            COUNT(name) as invoice_count,
            SUM(outstanding_amount) as outstanding_amount
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = %(docstatus)s
            AND outstanding_amount > 0
            {customer_group_filter}
            {territory_filter}
        GROUP BY aging_bucket
        ORDER BY 
            CASE aging_bucket
                WHEN 'Not Due' THEN 1
                WHEN '1-30 Days' THEN 2
                WHEN '31-60 Days' THEN 3
                WHEN '61-90 Days' THEN 4
                ELSE 5
            END
    """.format(
        customer_group_filter="AND customer_group = %(customer_group)s" if filters.get('customer_group') else "",
        territory_filter="AND territory = %(territory)s" if filters.get('territory') else ""
    ), {
        'company': filters['company'],
        'docstatus': filters['docstatus'],
        'customer_group': filters.get('customer_group'),
        'territory': filters.get('territory')
    }, as_dict=1)
    
    return {
        'status': 'success',
        'current_total_invoiced': round(total_invoiced, 2),
        'current_total_collected': round(total_collected, 2),
        'current_total_outstanding': round(total_outstanding, 2),
        'current_collection_rate': round(collection_rate, 2),
        'avg_daily_invoiced': round(avg_daily_invoiced, 2),
        'avg_daily_collection': round(avg_daily_collection, 2),
        'predicted_invoiced': round(predicted_invoiced, 2),
        'predicted_collection': round(predicted_collection, 2),
        'predicted_outstanding': round(predicted_outstanding, 2),
        'predicted_collection_rate': round(collection_rate, 2),
        'aging_analysis': [
            {
                'bucket': a['aging_bucket'],
                'invoice_count': a['invoice_count'],
                'outstanding': round(a['outstanding_amount'], 2)
            } for a in aging_data
        ]
    }


@frappe.whitelist(allow_guest=False, methods=['GET', 'POST'])
def get_sales_invoice_dashboard(company=None, customer_group=None, territory=None, date_from=None, date_to=None):
    """
    Dashboard summary untuk Sales Invoice Analytics
    
    Usage:
        GET: /api/method/data_analyst.api.pos.get_sales_invoice_dashboard?company=ABC
        POST: Body JSON atau Form Data
    """
    
    # Handle JSON request body for POST
    if not company and frappe.request and frappe.request.data:
        try:
            data = json.loads(frappe.request.data)
            company = data.get('company')
            customer_group = data.get('customer_group')
            territory = data.get('territory')
            date_from = data.get('date_from')
            date_to = data.get('date_to')
        except:
            pass
    
    if not company:
        frappe.throw(_("Parameter 'company' wajib diisi"))
    
    if not date_to:
        date_to = datetime.now().strftime('%Y-%m-%d')
    
    if not date_from:
        date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    # Build filters
    filter_conditions = []
    filter_values = {
        'company': company,
        'date_from': date_from,
        'date_to': date_to
    }
    
    if customer_group:
        filter_conditions.append("AND customer_group = %(customer_group)s")
        filter_values['customer_group'] = customer_group
    
    if territory:
        filter_conditions.append("AND territory = %(territory)s")
        filter_values['territory'] = territory
    
    filter_sql = " ".join(filter_conditions)
    
    # Summary data
    summary = frappe.db.sql(f"""
        SELECT 
            COUNT(name) as total_invoices,
            SUM(grand_total) as total_sales,
            SUM(outstanding_amount) as total_outstanding,
            COUNT(DISTINCT customer) as unique_customers,
            AVG(grand_total) as avg_invoice_value
        FROM `tabSales Invoice`
        WHERE company = %(company)s 
            AND docstatus = 1
            AND posting_date BETWEEN %(date_from)s AND %(date_to)s
            {filter_sql}
    """, filter_values, as_dict=1)[0]
    
    return {
        'company': company,
        'filters': {
            'customer_group': customer_group,
            'territory': territory
        },
        'date_range': {'from': date_from, 'to': date_to},
        'summary': {
            'total_invoices': summary.get('total_invoices', 0),
            'total_sales': round(summary.get('total_sales', 0), 2),
            'total_outstanding': round(summary.get('total_outstanding', 0), 2),
            'total_collected': round(summary.get('total_sales', 0) - summary.get('total_outstanding', 0), 2),
            'collection_rate': round((1 - summary.get('total_outstanding', 0) / summary.get('total_sales', 1)) * 100, 2) if summary.get('total_sales', 0) > 0 else 0,
            'unique_customers': summary.get('unique_customers', 0),
            'avg_invoice_value': round(summary.get('avg_invoice_value', 0), 2)
        }
    }
