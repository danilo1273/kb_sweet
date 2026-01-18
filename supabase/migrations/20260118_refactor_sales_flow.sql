-- Refactor Sales Flow to fix duplication, history and restoration

-- 1. DROP Problematic Trigger (Double Deduction)
DROP TRIGGER IF EXISTS on_sale_item_created ON sale_items;
-- We can also drop the function if it's not used, but let's leave it or drop it cleanly.
DROP FUNCTION IF EXISTS public.handle_sale_item_stock;

-- 2. Update process_sale to include client_id in Financial Movements
CREATE OR REPLACE FUNCTION public.process_sale(
    p_client_id uuid,
    p_total numeric,
    p_discount numeric,
    p_payment_method text,
    p_stock_source text,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_stock numeric;
  v_new_stock numeric;
BEGIN
  -- 1. Insert Sale Header
  INSERT INTO sales (
    client_id, user_id, total, discount, payment_method, status, stock_source
  ) VALUES (
    p_client_id, auth.uid(), p_total, p_discount, p_payment_method, 'completed', p_stock_source
  ) RETURNING id INTO v_sale_id;

  -- 2. Process Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    -- Check and Update Stock (This is the ONLY place deduction should happen)
    IF p_stock_source = 'danilo' THEN
      SELECT stock_danilo INTO v_stock FROM products WHERE id = v_product_id FOR UPDATE;
      v_new_stock := v_stock - v_qty;
      IF v_new_stock < 0 THEN
         -- Optional: Raise error or allow negative. Raising error is safer.
         -- RAISE EXCEPTION 'Estoque insuficiente para produto %', v_product_id;
      END IF;
      UPDATE products SET stock_danilo = v_new_stock WHERE id = v_product_id;
    ELSE
      SELECT stock_adriel INTO v_stock FROM products WHERE id = v_product_id FOR UPDATE;
      v_new_stock := v_stock - v_qty;
      IF v_new_stock < 0 THEN
        -- RAISE EXCEPTION 'Estoque insuficiente para produto %', v_product_id;
      END IF;
      UPDATE products SET stock_adriel = v_new_stock WHERE id = v_product_id;
    END IF;

    -- Insert Sale Item
    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price, cost_price_snapshot
    ) VALUES (
      v_sale_id, v_product_id, v_qty, (v_item->>'unit_price')::numeric, (v_item->>'cost')::numeric
    );
  END LOOP;

  -- 3. Insert Financial Movement (Linked to Client)
  INSERT INTO financial_movements (
    description,
    amount,
    type,
    status,
    due_date,
    payment_date,
    related_sale_id,
    client_id, -- FIXED: Now linking client
    bank_account_id
  ) VALUES (
    'Venda PDV #' || left(v_sale_id::text, 8),
    p_total,
    'income',
    'pending', -- Always pending per requirement
    now(),
    NULL, 
    v_sale_id,
    p_client_id, -- Saving the client_id here
    NULL
  );

  RETURN v_sale_id;
END;
$function$;

-- 3. Create Trigger to Restore Stock on Delete
CREATE OR REPLACE FUNCTION public.restore_sales_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    r_item RECORD;
BEGIN
    -- Loop through items of the sale being deleted
    FOR r_item IN SELECT product_id, quantity FROM sale_items WHERE sale_id = OLD.id
    LOOP
        -- Restore Stock based on the Sale's stock_source
        IF OLD.stock_source = 'danilo' THEN
            UPDATE products 
            SET stock_danilo = COALESCE(stock_danilo, 0) + r_item.quantity 
            WHERE id = r_item.product_id;
        ELSIF OLD.stock_source = 'adriel' THEN
            UPDATE products 
            SET stock_adriel = COALESCE(stock_adriel, 0) + r_item.quantity 
            WHERE id = r_item.product_id;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS on_sale_delete_restore_stock ON sales;
CREATE TRIGGER on_sale_delete_restore_stock
BEFORE DELETE ON sales
FOR EACH ROW
EXECUTE FUNCTION restore_sales_stock();
