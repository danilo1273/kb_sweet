
-- 1. Ensure columns exist (Safely)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_movements' AND column_name = 'related_sale_id') THEN
        ALTER TABLE financial_movements ADD COLUMN related_sale_id uuid REFERENCES sales(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_movements' AND column_name = 'client_id') THEN
        ALTER TABLE financial_movements ADD COLUMN client_id uuid REFERENCES clients(id);
    END IF;
END $$;

-- 2. Function to handle Sale Status Changes (Complete/Cancel)
CREATE OR REPLACE FUNCTION handle_sale_status_change()
RETURNS TRIGGER AS $$
DECLARE
    r_item RECORD;
BEGIN
    -- CASE 1: Sale Completed (Generate Financial + Deduct Stock handled by item trigger initially, but let's ensure consistency)
    -- Note: Stock deduction is currently handled by 'on_sale_item_created' for new items.
    -- Here we only handle the header-level actions like Financials.

    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        -- Insert into financial_movements (Receita)
        INSERT INTO financial_movements (
            description,
            amount,
            type,
            status,
            due_date,
            payment_date,
            related_sale_id,
            client_id
        ) VALUES (
            'Venda #' || SUBSTRING(NEW.id::text, 1, 8), 
            NEW.total,
            'income',      
            'paid',        
            CURRENT_DATE,
            CURRENT_DATE,
            NEW.id,
            NEW.client_id
        );
    END IF;

    -- CASE 2: Sale Canceled (Void Financial + Restore Stock)
    IF NEW.status = 'canceled' AND OLD.status <> 'canceled' THEN
        -- A. Delete Financial Record
        DELETE FROM financial_movements WHERE related_sale_id = NEW.id;

        -- B. Restore Stock
        -- Loop through items and add back to inventory
        FOR r_item IN SELECT * FROM sale_items WHERE sale_id = NEW.id LOOP
            IF NEW.stock_source = 'adriel' THEN
                UPDATE products SET stock_adriel = COALESCE(stock_adriel, 0) + r_item.quantity WHERE id = r_item.product_id;
            ELSE
                UPDATE products SET stock_danilo = COALESCE(stock_danilo, 0) + r_item.quantity WHERE id = r_item.product_id;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger for Sales Status
DROP TRIGGER IF EXISTS on_sale_status_change ON sales;
CREATE TRIGGER on_sale_status_change
AFTER UPDATE OF status ON sales  -- Trigger only on status change
FOR EACH ROW
EXECUTE FUNCTION handle_sale_status_change();

-- 4. Trigger for NEW Sales (Insert) - Separate to avoid conflict
CREATE OR REPLACE FUNCTION handle_new_sale_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        INSERT INTO financial_movements (
            description, amount, type, status, due_date, payment_date, related_sale_id, client_id
        ) VALUES (
            'Venda #' || SUBSTRING(NEW.id::text, 1, 8), NEW.total, 'income', 'paid', CURRENT_DATE, CURRENT_DATE, NEW.id, NEW.client_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_sale_insert ON sales;
CREATE TRIGGER on_sale_insert
AFTER INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION handle_new_sale_insert();

-- 5. Trigger for Stock Deduction (On Item Insert)
-- Only deducts if sale is already completed (or assuming instant completion flow)
CREATE OR REPLACE FUNCTION handle_sale_item_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_source text;
    v_sale_status text;
BEGIN
    -- Get parent sale info
    SELECT stock_source, status INTO v_stock_source, v_sale_status FROM sales WHERE id = NEW.sale_id;

    -- Only deduct if valid (simplification: always deduct on insert, restore on cancel)
    IF v_stock_source = 'adriel' THEN
        UPDATE products SET stock_adriel = COALESCE(stock_adriel, 0) - NEW.quantity WHERE id = NEW.product_id;
    ELSE
        UPDATE products SET stock_danilo = COALESCE(stock_danilo, 0) - NEW.quantity WHERE id = NEW.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_sale_item_created ON sale_items;
CREATE TRIGGER on_sale_item_created
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION handle_sale_item_stock();
