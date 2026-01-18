-- Fix Broken Production Items
-- Detects items where the stored Unit is 'un' but the BOM uses 'g' (or 'ml') and updates them.
-- Use safe update logic.

DO $$
DECLARE
    r_item RECORD;
    v_bom_unit TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    FOR r_item IN 
        SELECT pi.id, pi.item_id, pi.unit, pb.unit as user_bom_unit, pb.quantity as bom_qty
        FROM production_order_items pi
        JOIN product_bom pb ON (
            -- Join logic is tricky because PI doesn't link directly to BOM ID, 
            -- but we can infer from Product ID + Ingredient ID
            pi.item_id = COALESCE(pb.ingredient_id, pb.child_product_id)
        )
        JOIN production_orders po ON po.id = pi.order_id
        WHERE 
            po.status = 'open' 
            AND pi.type = 'ingredient' 
            AND pi.unit = 'un' -- The problem: was copied as 'un'
            AND pb.unit IN ('g', 'ml', 'kg', 'l') -- But BOM says weight/vol
            AND pb.product_id = po.product_id -- Ensure we match the correct BOM for this order's product
    LOOP
        -- Update the item to use the BOM unit
        UPDATE production_order_items
        SET unit = r_item.user_bom_unit
        WHERE id = r_item.id;
        
        v_updated_count := v_updated_count + 1;
    END LOOP;

    RAISE NOTICE 'Fixed % items.', v_updated_count;
END;
$$;
