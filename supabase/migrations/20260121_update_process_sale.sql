-- Add location_id to sales table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'location_id') THEN
        ALTER TABLE sales ADD COLUMN location_id UUID REFERENCES stock_locations(id);
    END IF;
END $$;

-- Backfill location_id based on stock_source (Legacy Migration)
DO $$
DECLARE
    r RECORD;
    loc_id UUID;
BEGIN
    FOR r IN SELECT id, stock_source, user_id FROM sales WHERE location_id IS NULL LOOP
        -- Attempt to find location for the user's company and the slug
        -- Assuming stock_source is 'danilo' or 'adriel' maps to 'stock-danilo' / 'stock-adriel'
        SELECT sl.id INTO loc_id
        FROM stock_locations sl
        JOIN profiles p ON p.company_id = sl.company_id
        WHERE p.id = r.user_id
        AND sl.slug = 'stock-' || r.stock_source
        LIMIT 1;

        IF loc_id IS NOT NULL THEN
            UPDATE sales SET location_id = loc_id WHERE id = r.id;
        END IF;
    END LOOP;
END $$;


-- Update process_sale RPC
CREATE OR REPLACE FUNCTION process_sale(
  p_items jsonb, -- {product_id, quantity, unit_price, cost}
  p_total numeric,
  p_discount numeric,
  p_payment_method text,
  p_client_id uuid,
  p_location_id uuid -- Changed from stock_source text
) RETURNS uuid AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_current_stock numeric;
  v_new_stock numeric;
  v_stock_source_slug text; -- For legacy compatibility
BEGIN
  -- Get slug for legacy field if needed
  SELECT slug INTO v_stock_source_slug FROM stock_locations WHERE id = p_location_id;

  -- 1. Insert Sale Header
  INSERT INTO sales (
    client_id, user_id, total, discount, payment_method, status, location_id, stock_source
  ) VALUES (
    p_client_id, auth.uid(), p_total, p_discount, p_payment_method, 'completed', p_location_id, 
    COALESCE(REPLACE(v_stock_source_slug, 'stock-', ''), 'other') -- Maintain legacy column for now
  ) RETURNING id INTO v_sale_id;

  -- 2. Process Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    -- Update Product Stocks (Dynamic)
    SELECT quantity INTO v_current_stock 
    FROM product_stocks 
    WHERE product_id = v_product_id AND location_id = p_location_id 
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
        -- If no entry exists, assume 0? Or create? 
        -- Better to assume 0 and error out if negative, or insert 0.
        v_current_stock := 0;
        -- Insert if missing? Usually inventory should exist.
        INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
        VALUES (v_product_id, p_location_id, 0, 0)
        ON CONFLICT DO NOTHING;
    END IF;

    v_new_stock := v_current_stock - v_qty;

    IF v_new_stock < 0 THEN
       RAISE EXCEPTION 'Estoque insuficiente para produto % no local selecionado', v_product_id;
    END IF;

    -- Update table
    UPDATE product_stocks 
    SET quantity = v_new_stock, last_updated = now()
    WHERE product_id = v_product_id AND location_id = p_location_id;

    -- Update Legacy Columns on Products Table (Optional, but good for safety until fully migrated)
    IF v_stock_source_slug = 'stock-danilo' THEN
        UPDATE ingredients SET stock_danilo = stock_danilo - v_qty WHERE id = v_product_id;
    ELSIF v_stock_source_slug = 'stock-adriel' THEN
        UPDATE ingredients SET stock_adriel = stock_adriel - v_qty WHERE id = v_product_id;
    END IF;


    -- Insert Sale Item
    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price, cost_price_snapshot
    ) VALUES (
      v_sale_id, v_product_id, v_qty, (v_item->>'unit_price')::numeric, (v_item->>'cost')::numeric
    );
  END LOOP;

  -- 3. Insert Financial Movement
  INSERT INTO financial_movements (
    description,
    amount,
    type,
    status,
    due_date,
    detail_order_id
  ) VALUES (
    'Venda PDV #' || left(v_sale_id::text, 8),
    p_total,
    'income',
    'pending',
    now(),
    v_sale_id
  );

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update delete_sale_secure RPC
CREATE OR REPLACE FUNCTION delete_sale_secure(
  p_sale_id uuid,
  p_reason text
) RETURNS void AS $$
DECLARE
  v_item RECORD;
  v_sale RECORD;
  v_sl_slug TEXT;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  
  -- Log Audit
  INSERT INTO audit_logs (
    table_name, record_id, action, old_data, changed_by, reason
  ) VALUES (
    'sales', p_sale_id, 'DELETE', to_jsonb(v_sale), auth.uid(), p_reason
  );

  -- 1. Revert Stock
  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    -- Dynamic Stock Revert
    IF v_sale.location_id IS NOT NULL THEN
        UPDATE product_stocks 
        SET quantity = quantity + v_item.quantity 
        WHERE product_id = v_item.product_id AND location_id = v_sale.location_id;
    END IF;

    -- Legacy Stock Revert (Fallback)
    -- If location_id is/was null (old sales), use stock_source text
    IF v_sale.stock_source = 'danilo' THEN
       UPDATE ingredients SET stock_danilo = stock_danilo + v_item.quantity WHERE id = v_item.product_id;
    ELSIF v_sale.stock_source = 'adriel' THEN
       UPDATE ingredients SET stock_adriel = stock_adriel + v_item.quantity WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  -- 2. Delete Details
  DELETE FROM financial_movements WHERE detail_order_id = p_sale_id;
  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  -- 3. Delete Header
  DELETE FROM sales WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
