-- Fix Recalculate Product Cost to store UNIT COST instead of BATCH COST

CREATE OR REPLACE FUNCTION recalculate_product_cost(p_product_id UUID)
RETURNS void AS $$
DECLARE
    v_total_cost numeric := 0;
    v_batch_size numeric := 1;
    r_item record;
BEGIN
    -- Get Product Batch Size to calculate Unit Cost
    SELECT COALESCE(batch_size, 1) INTO v_batch_size FROM products WHERE id = p_product_id;
    
    -- Prevent division by zero
    IF v_batch_size <= 0 THEN v_batch_size := 1; END IF;

    FOR r_item IN
        SELECT
            b.quantity,
            b.unit as bom_unit,
            
            -- Ingredient info
            i.id as ing_id,
            i.cost as ing_cost,
            i.unit_weight as ing_weight,
            i.unit as ing_primary_unit,
            i.unit_type as ing_secondary_unit,
            
            -- Child Product info
            p.id as child_id,
            p.cost as child_cost -- NOW ASSUMED TO BE UNIT COST
            
        FROM product_bom b
        LEFT JOIN ingredients i ON b.ingredient_id = i.id
        LEFT JOIN products p ON b.child_product_id = p.id
        WHERE b.product_id = p_product_id
    LOOP
        -- Logic for Ingredients
        IF r_item.ing_id IS NOT NULL THEN
            IF r_item.ing_secondary_unit IS NOT NULL AND r_item.ing_secondary_unit <> '' AND r_item.ing_weight > 0 THEN
                 -- Check if using primary or secondary unit
                 IF r_item.bom_unit = r_item.ing_primary_unit THEN
                     v_total_cost := v_total_cost + (r_item.quantity * COALESCE(r_item.ing_cost, 0));
                 ELSE
                     -- Using secondary unit (e.g. g), calculate based on weight
                     v_total_cost := v_total_cost + (r_item.quantity * (COALESCE(r_item.ing_cost, 0) / r_item.ing_weight));
                 END IF;
            ELSE
                -- Direct multiplication
                v_total_cost := v_total_cost + (r_item.quantity * COALESCE(r_item.ing_cost, 0));
            END IF;
            
        -- Logic for Sub-products
        ELSIF r_item.child_id IS NOT NULL THEN
            -- Cost = Quantity * Unit Cost
            -- Removed division by child_batch because child_cost is now Unit Cost
            v_total_cost := v_total_cost + (r_item.quantity * COALESCE(r_item.child_cost, 0));
        END IF;
    END LOOP;

    -- Update the product cost: Total Batch Cost / Batch Size = Unit Cost
    UPDATE products SET cost = ROUND(v_total_cost / v_batch_size, 4) WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Recalculate all products that have a BOM to fix existing data
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT DISTINCT product_id FROM product_bom LOOP
        PERFORM recalculate_product_cost(r.product_id);
    END LOOP;
END $$;
