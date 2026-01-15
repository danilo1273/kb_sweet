-- Function to Reset Database for Testing
-- Clears all transactional data but keeps Users, Profiles, and Master Data
-- Resets Stock and Bank Balances to 0.

CREATE OR REPLACE FUNCTION test_reset_db_keep_users()
RETURNS JSONB AS $$
BEGIN
    -- 1. Truncate Transactional Tables (Cascade to items)
    TRUNCATE TABLE 
        audit_logs,
        financial_movements,
        sale_items,
        sales,
        production_order_items,
        production_orders,
        stock_adjustments,
        purchase_edits_history,
        purchase_orders,
        purchase_requests
    CASCADE;

    -- 2. Reset Stock in Ingredients
    UPDATE ingredients SET stock_danilo = 0, stock_adriel = 0;
    
    -- 3. Reset Stock in Products (All columns)
    UPDATE products SET stock_quantity = 0, stock_danilo = 0, stock_adriel = 0;

    -- 4. Reset Bank Balances
    UPDATE bank_accounts SET balance = COALESCE(initial_balance, 0);

    RETURN jsonb_build_object('success', true, 'message', 'Database transactions reset. Users and Master Data preserved.');
END;
$$ LANGUAGE plpgsql;
