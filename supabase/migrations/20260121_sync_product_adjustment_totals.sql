-- Fix apply_product_stock_adjustment to sync stock_quantity
-- This ensures that when an audit changes 'stock_danilo', the 'stock_quantity' total is also updated.

CREATE OR REPLACE FUNCTION apply_product_stock_adjustment(
    p_product_id uuid,
    p_new_stock double precision,
    p_stock_owner text,
    p_reason text,
    p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_stock float;
  v_diff float;
  v_other_stock float;
BEGIN
  -- Lock the row and get current stock
  IF p_stock_owner = 'danilo' THEN
    SELECT stock_danilo, COALESCE(stock_adriel, 0) 
    INTO v_old_stock, v_other_stock 
    FROM products WHERE id = p_product_id FOR UPDATE;
    
    v_diff := p_new_stock - COALESCE(v_old_stock, 0);
    
    UPDATE products 
    SET 
        stock_danilo = p_new_stock,
        stock_quantity = p_new_stock + v_other_stock -- Sync Total
    WHERE id = p_product_id;
  ELSE
    SELECT stock_adriel, COALESCE(stock_danilo, 0)
    INTO v_old_stock, v_other_stock
    FROM products WHERE id = p_product_id FOR UPDATE;
    
    v_diff := p_new_stock - COALESCE(v_old_stock, 0);
    
    UPDATE products 
    SET 
        stock_adriel = p_new_stock,
        stock_quantity = p_new_stock + v_other_stock -- Sync Total
    WHERE id = p_product_id;
  END IF;

  -- Record the adjustment (if table exists, likely yes)
  -- If table missing (due to failed prev migration), this will fail. 
  -- We assume table exists since we are fixing the function.
  INSERT INTO product_stock_adjustments (
    product_id, quantity_diff, old_stock, new_stock, stock_owner, reason, user_id, type
  ) VALUES (
    p_product_id, v_diff, COALESCE(v_old_stock, 0), p_new_stock, p_stock_owner, p_reason, auth.uid(), p_type
  );
END;
$$;
