-- Fix apply_product_stock_adjustment to update product_stocks table
-- This is critical because the UI now reads from product_stocks, but the audit was only updating legacy columns.

CREATE OR REPLACE FUNCTION apply_product_stock_adjustment(
    p_product_id uuid,
    p_new_stock double precision,
    p_stock_owner text, -- 'danilo' or 'adriel'
    p_reason text,
    p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location_id uuid;
  v_old_stock float;
  v_diff float;
  v_legacy_col text;
BEGIN
  -- 1. Resolve Location ID
  -- Assumes slugs are 'stock-danilo' and 'stock-adriel'
  SELECT id INTO v_location_id 
  FROM stock_locations 
  WHERE slug = 'stock-' || p_stock_owner;

  IF v_location_id IS NULL THEN
     RAISE EXCEPTION 'Location not found for owner: %', p_stock_owner;
  END IF;

  -- 2. Get Current Stock (from new table)
  SELECT quantity INTO v_old_stock 
  FROM product_stocks 
  WHERE product_id = p_product_id 
    AND location_id = v_location_id;

  v_old_stock := COALESCE(v_old_stock, 0);
  v_diff := p_new_stock - v_old_stock;

  -- 3. Upsert product_stocks
  INSERT INTO product_stocks (product_id, location_id, quantity, last_updated)
  VALUES (p_product_id, v_location_id, p_new_stock, now())
  ON CONFLICT (product_id, location_id) WHERE product_id IS NOT NULL
  DO UPDATE SET 
    quantity = EXCLUDED.quantity,
    last_updated = now();

  -- 4. Sync Legacy Columns (Optional but good for safety)
  IF p_stock_owner = 'danilo' THEN
    UPDATE products 
    SET stock_danilo = p_new_stock,
        stock_quantity = p_new_stock + COALESCE(stock_adriel, 0)
    WHERE id = p_product_id;
  ELSE
    UPDATE products 
    SET stock_adriel = p_new_stock,
        stock_quantity = p_new_stock + COALESCE(stock_danilo, 0)
    WHERE id = p_product_id;
  END IF;

  -- 5. Record Adjustment
  -- Ensure product_stock_adjustments table exists or use stock_adjustments if shared?
  -- Providing distinct table usage as per previous migration.
  INSERT INTO product_stock_adjustments (
    product_id, 
    quantity_diff, 
    old_stock, 
    new_stock, 
    stock_owner, 
    reason, 
    user_id, 
    type
  ) VALUES (
    p_product_id, 
    v_diff, 
    v_old_stock, 
    p_new_stock, 
    p_stock_owner, 
    p_reason, 
    auth.uid(), 
    p_type
  );

END;
$$;
