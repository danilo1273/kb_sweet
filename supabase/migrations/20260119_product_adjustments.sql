-- Migration to enable Product Stock Adjustments (Audit)

-- 1. Create table for Product Adjustments
CREATE TABLE IF NOT EXISTS public.product_stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_diff double precision NOT NULL,
    old_stock double precision NOT NULL,
    new_stock double precision NOT NULL,
    stock_owner text CHECK (stock_owner IN ('danilo', 'adriel')),
    reason text,
    user_id uuid REFERENCES auth.users(id),
    type text CHECK (type IN ('found', 'loss', 'correction')),
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Create RPC Function to Apply Adjustment
CREATE OR REPLACE FUNCTION public.apply_product_stock_adjustment(
    p_product_id uuid,
    p_new_stock double precision,
    p_stock_owner text,
    p_reason text,
    p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_old_stock float;
  v_diff float;
BEGIN
  -- Lock the row and get current stock
  IF p_stock_owner = 'danilo' THEN
    SELECT stock_danilo INTO v_old_stock FROM products WHERE id = p_product_id FOR UPDATE;
    v_diff := p_new_stock - COALESCE(v_old_stock, 0);
    UPDATE products SET stock_danilo = p_new_stock WHERE id = p_product_id;
  ELSE
    SELECT stock_adriel INTO v_old_stock FROM products WHERE id = p_product_id FOR UPDATE;
    v_diff := p_new_stock - COALESCE(v_old_stock, 0);
    UPDATE products SET stock_adriel = p_new_stock WHERE id = p_product_id;
  END IF;

  -- Record the adjustment
  INSERT INTO product_stock_adjustments (
    product_id, quantity_diff, old_stock, new_stock, stock_owner, reason, user_id, type
  ) VALUES (
    p_product_id, v_diff, COALESCE(v_old_stock, 0), p_new_stock, p_stock_owner, p_reason, auth.uid(), p_type
  );
END;
$function$;
