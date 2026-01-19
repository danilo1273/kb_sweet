CREATE OR REPLACE FUNCTION finalize_raffle_stock(p_raffle_id UUID)
RETURNS VOID AS $$
DECLARE
    prize RECORD;
    current_stock NUMERIC;
BEGIN
    -- Loop through all prizes for this raffle
    FOR prize IN 
        SELECT product_id, quantity 
        FROM raffle_prizes 
        WHERE raffle_id = p_raffle_id
    LOOP
        -- Check if product_stocks entry exists for this product (finished-good)
        -- We assume 'finished-good' type for prizes as per requirements
        
        -- OPTIONAL: Check if stock is sufficient? 
        -- If we want to allow negative stock (forcing it), we can proceed. 
        -- Or we can just update. Let's just update and let it go negative if needed (or assume user checked).
        
        -- Update stock
        UPDATE product_stocks
        SET quantity = quantity - prize.quantity,
            updated_at = NOW()
        WHERE product_id = prize.product_id;
        
        -- If no stock record exists, we might need to handle it, but the UI only allows selecting from existing stock.
        
    END LOOP;
END;
$$ LANGUAGE plpgsql;
