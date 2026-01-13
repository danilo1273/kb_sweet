-- 1. Function to recalculate cost for a single product
CREATE OR REPLACE FUNCTION recalculate_product_cost(p_product_id UUID)
RETURNS void AS $$
DECLARE
    v_total_cost numeric := 0;
    r_item record;
BEGIN
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
            p.cost as child_cost,
            p.batch_size as child_batch
            
        FROM product_bom b
        LEFT JOIN ingredients i ON b.ingredient_id = i.id
        LEFT JOIN products p ON b.child_product_id = p.id
        WHERE b.product_id = p_product_id
    LOOP
        -- Logic for Ingredients
        IF r_item.ing_id IS NOT NULL THEN
            -- Check if we are using the secondary unit (e.g. BOM in 'g', Ingredient in 'un' with weight 395g)
            IF r_item.ing_secondary_unit IS NOT NULL AND r_item.ing_secondary_unit <> '' AND r_item.ing_weight > 0 THEN
                 
                 IF r_item.bom_unit = r_item.ing_primary_unit THEN
                     -- BOM uses "un", cost is per "un"
                     v_total_cost := v_total_cost + (r_item.quantity * COALESCE(r_item.ing_cost, 0));
                 ELSE
                     -- BOM uses secondary unit (e.g. "g"), Calculate cost per gram
                     v_total_cost := v_total_cost + (r_item.quantity * (COALESCE(r_item.ing_cost, 0) / r_item.ing_weight));
                 END IF;
            ELSE
                -- No conversion, direct multiplication (Assumes BOM unit matches Ingredient base unit)
                v_total_cost := v_total_cost + (r_item.quantity * COALESCE(r_item.ing_cost, 0));
            END IF;
            
        -- Logic for Sub-products
        ELSIF r_item.child_id IS NOT NULL THEN
            -- Cost = (Child Cost / Child Batch Size) * Qty
            v_total_cost := v_total_cost + (r_item.quantity * (COALESCE(r_item.child_cost, 0) / COALESCE(NULLIF(r_item.child_batch, 0), 1)));
        END IF;
    END LOOP;

    -- Update the product cost
    UPDATE products SET cost = ROUND(v_total_cost, 4) WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger Function: Update products when ingredient changes
CREATE OR REPLACE FUNCTION fn_update_cost_from_ingredient()
RETURNS TRIGGER AS $$
DECLARE
    r_product record;
BEGIN
    -- Only run if relevant columns changed
    IF (TG_OP = 'UPDATE') AND (OLD.cost = NEW.cost) AND (OLD.unit_weight = NEW.unit_weight) THEN
        RETURN NEW;
    END IF;

    FOR r_product IN
        SELECT DISTINCT product_id FROM product_bom WHERE ingredient_id = NEW.id
    LOOP
        PERFORM recalculate_product_cost(r_product.product_id);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger Function: Cascade update when sub-product cost changes
CREATE OR REPLACE FUNCTION fn_update_cost_from_sub_product()
RETURNS TRIGGER AS $$
DECLARE
    r_product record;
BEGIN
    -- Only run if costs changed
    IF (TG_OP = 'UPDATE') AND (OLD.cost = NEW.cost) THEN
        RETURN NEW;
    END IF;

    FOR r_product IN
        SELECT DISTINCT product_id FROM product_bom WHERE child_product_id = NEW.id
    LOOP
        PERFORM recalculate_product_cost(r_product.product_id);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger Function: Update cost when BOM changes
CREATE OR REPLACE FUNCTION fn_update_cost_from_bom()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM recalculate_product_cost(OLD.product_id);
        RETURN OLD;
    ELSE
        PERFORM recalculate_product_cost(NEW.product_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Apply Triggers

-- Trigger for Ingredients
DROP TRIGGER IF EXISTS tr_update_cost_on_ingredient_change ON ingredients;
CREATE TRIGGER tr_update_cost_on_ingredient_change
AFTER UPDATE OF cost, unit_weight ON ingredients
FOR EACH ROW
EXECUTE FUNCTION fn_update_cost_from_ingredient();

-- Trigger for Products (Cascade)
DROP TRIGGER IF EXISTS tr_update_cost_on_product_change ON products;
CREATE TRIGGER tr_update_cost_on_product_change
AFTER UPDATE OF cost ON products
FOR EACH ROW
EXECUTE FUNCTION fn_update_cost_from_sub_product();

-- Trigger for BOM
DROP TRIGGER IF EXISTS tr_update_cost_on_bom_change ON product_bom;
CREATE TRIGGER tr_update_cost_on_bom_change
AFTER INSERT OR UPDATE OR DELETE ON product_bom
FOR EACH ROW
EXECUTE FUNCTION fn_update_cost_from_bom();
