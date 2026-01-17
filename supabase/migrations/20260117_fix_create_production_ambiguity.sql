-- Clean up ambiguous functions and recreate create_production_order
-- Drop both potential variants to ensure clean slate

-- Drop the version with stock source if it exists
DROP FUNCTION IF EXISTS public.create_production_order(uuid, numeric, uuid, text);
-- Drop the version without stock source if it exists
DROP FUNCTION IF EXISTS public.create_production_order(uuid, numeric, uuid);

-- Recreate the correct single version with default parameter
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
BEGIN
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

    -- 3. Copy BOM items (ingredients & products) to production_order_items
    -- Schema Adaptation: product_bom has ingredient_id OR child_product_id
    
    -- Count BOM items first
    SELECT COUNT(*) INTO v_bom_count FROM product_bom WHERE product_id = p_product_id;
    
    INSERT INTO production_order_items (
        order_id,
        item_id,
        type,            -- Derived
        quantity_planned,
        quantity_used,   
        waste_quantity, 
        unit,
        name,
        unit_cost       
    )
    SELECT 
        v_order_id,
        COALESCE(bom.ingredient_id, bom.child_product_id),
        CASE WHEN bom.ingredient_id IS NOT NULL THEN 'ingredient' ELSE 'product' END,
        (bom.quantity * p_quantity), 
        0, 
        0,
        -- Fetch Unit/Name dynamically
        CASE 
            WHEN bom.ingredient_id IS NOT NULL THEN (SELECT unit FROM ingredients WHERE id = bom.ingredient_id)
            ELSE 'un' -- Products usually count as units
        END,
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

    -- Return success + debug info
    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id,
        'items_created', v_inserted_items,
        'bom_found', v_bom_count
    );
END;
$function$;
