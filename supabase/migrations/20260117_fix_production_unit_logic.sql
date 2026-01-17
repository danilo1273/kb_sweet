-- Fix Production Unit Logic
-- Ensures that the Production Item inherits the BOM UNIT (e.g. 'g') instead of the Ingredient Unit (e.g. 'un').
-- This allows the Close Function to detect the unit mismatch ('g' vs 'un') and apply the correct conversion (dividing by weight).

CREATE OR REPLACE FUNCTION public.create_production_order(
    p_product_id uuid,
    p_quantity numeric,
    p_user_id uuid,
    p_stock_source text DEFAULT 'danilo' 
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_order_id UUID;
    v_bom_count INTEGER;
    v_inserted_items INTEGER;
    v_batch_size NUMERIC;
BEGIN
    -- 0. Get Product Batch Size
    SELECT COALESCE(batch_size, 1) INTO v_batch_size 
    FROM products 
    WHERE id = p_product_id;
    
    IF v_batch_size <= 0 THEN v_batch_size := 1; END IF;

    -- 1. Create Production Order
    INSERT INTO production_orders (
        product_id,
        user_id,
        quantity,
        status,
        stock_source 
    ) VALUES (
        p_product_id,
        p_user_id,
        p_quantity,
        'open',
        p_stock_source
    )
    RETURNING id INTO v_order_id;

    -- 2. Audit Log
    PERFORM audit_production_log('create_production', v_order_id, jsonb_build_object('quantity', p_quantity, 'product_id', p_product_id), p_user_id);

    -- 3. Copy BOM items
    SELECT COUNT(*) INTO v_bom_count FROM product_bom WHERE product_id = p_product_id;
    
    INSERT INTO production_order_items (
        order_id,
        item_id,
        type,            
        quantity_planned,
        quantity_used,   
        waste_quantity, 
        unit,           -- FIXED: Uses BOM unit
        name,
        unit_cost       
    )
    SELECT 
        v_order_id,
        COALESCE(bom.ingredient_id, bom.child_product_id),
        CASE WHEN bom.ingredient_id IS NOT NULL THEN 'ingredient' ELSE 'product' END,
        
        -- Formula: (ItemQty * OrderQty) / BatchSize
        (bom.quantity * p_quantity) / v_batch_size,
        
        0, 
        0,
        
        -- FIX: Prefer BOM unit (e.g. 'g'), fallback to Ingredient unit ('un')
        COALESCE(bom.unit, 
            CASE 
                WHEN bom.ingredient_id IS NOT NULL THEN (SELECT unit FROM ingredients WHERE id = bom.ingredient_id)
                ELSE 'un' 
            END
        ),

        CASE 
            WHEN bom.ingredient_id IS NOT NULL THEN (SELECT name FROM ingredients WHERE id = bom.ingredient_id)
            ELSE (SELECT name FROM products WHERE id = bom.child_product_id)
        END,
        CASE 
            WHEN bom.ingredient_id IS NOT NULL THEN (SELECT cost FROM ingredients WHERE id = bom.ingredient_id)
            ELSE (SELECT cost FROM products WHERE id = bom.child_product_id)
        END
    FROM product_bom bom
    WHERE bom.product_id = p_product_id;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id,
        'items_created', v_inserted_items,
        'scaling_factor', (p_quantity / v_batch_size)
    );
END;
$function$;
