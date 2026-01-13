-- 1. Update Function to create PENDING receivables instead of PAID
CREATE OR REPLACE FUNCTION handle_sale_status_change()
RETURNS TRIGGER AS $$
DECLARE
    r_item RECORD;
BEGIN
    -- CASE 1: Sale Completed (Generate PENDING Financial + Deduct Stock)
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        -- Insert into financial_movements (Receita PENDENTE)
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
            'pending',     -- CHANGED: Now Pending
            CURRENT_DATE,  -- Due today by default
            NULL,          -- CHANGED: No payment date yet
            NEW.id,
            NEW.client_id
        );
    END IF;

    -- CASE 2: Sale Canceled (Void Financial + Restore Stock)
    IF NEW.status = 'canceled' AND OLD.status <> 'canceled' THEN
        -- A. Delete Financial Record
        DELETE FROM financial_movements WHERE related_sale_id = NEW.id;

        -- B. Restore Stock
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

-- 2. Update INSERT trigger to match (Pending)
CREATE OR REPLACE FUNCTION handle_new_sale_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        INSERT INTO financial_movements (
            description, amount, type, status, due_date, payment_date, related_sale_id, client_id
        ) VALUES (
            'Venda #' || SUBSTRING(NEW.id::text, 1, 8), 
            NEW.total, 
            'income', 
            'pending',   -- CHANGED
            CURRENT_DATE, 
            NULL,        -- CHANGED
            NEW.id, 
            NEW.client_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. NEW TRIGGER: Sync Financial when Sale is Updated (Client or Total change)
CREATE OR REPLACE FUNCTION sync_sale_update_to_financial()
RETURNS TRIGGER AS $$
BEGIN
    -- Only if connected to a financial record
    -- Update Amount if Total changed
    -- Update Client if Client changed
    IF (OLD.total IS DISTINCT FROM NEW.total) OR (OLD.client_id IS DISTINCT FROM NEW.client_id) THEN
        UPDATE financial_movements
        SET 
            amount = NEW.total,
            client_id = NEW.client_id
        WHERE related_sale_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_sale_update_financial ON sales;
CREATE TRIGGER on_sale_update_financial
AFTER UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION sync_sale_update_to_financial();
