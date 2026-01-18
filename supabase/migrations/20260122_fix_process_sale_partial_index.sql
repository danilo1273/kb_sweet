-- Fix process_sale RPC to handle partial unique indexes on product_stocks
-- The previous version failed with "no unique or exclusion constraint matching the ON CONFLICT specification"
-- because we replaced the standard unique constraint with a partial index (WHERE product_id IS NOT NULL).

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
        -- Insert Key if missing
        -- FIXED: Explicitly target the partial index predicate for product_id
        INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
        VALUES (v_product_id, p_location_id, 0, 0)
        ON CONFLICT (product_id, location_id) WHERE product_id IS NOT NULL DO NOTHING;
        
        v_current_stock := 0;
    END IF;

    v_new_stock := v_current_stock - v_qty;
    
    -- NOTE: Allowing negative stock for now to prevent sale blocking, or uncomment to strict:
    -- IF v_new_stock < 0 THEN
    --    RAISE EXCEPTION 'Estoque insuficiente para produto % no local selecionado', v_product_id;
    -- END IF;

    -- Update table
    UPDATE product_stocks 
    SET quantity = v_new_stock, last_updated = now()
    WHERE product_id = v_product_id AND location_id = p_location_id;

    -- Update Legacy Columns (Legacy Mirroring)
    -- Try updating products first (Finished Goods)
    IF v_stock_source_slug = 'stock-danilo' THEN
       -- Try update products (if it has the column - distinct per implementation)
       -- Usually finished goods just use stock_quantity? 
       -- Let's stick to updating ingredients if it was there, or ignore if not found.
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
    detail_order_id,
    client_id,        -- NEW: Link to client for "Total Bought"
    related_sale_id   -- NEW: Link to sale for details in Financial
  ) VALUES (
    'Venda PDV #' || left(v_sale_id::text, 8),
    p_total,
    'income',
    'pending',
    now(),
    v_sale_id,
    p_client_id,      -- Insert client_id
    v_sale_id         -- Insert related_sale_id
  );

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
