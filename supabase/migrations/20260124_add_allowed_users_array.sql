-- Add allowed_users array column
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS allowed_users UUID[] DEFAULT NULL;

-- Migrate existing created_by to allowed_users
-- If created_by is set, initialize allowed_users with that single ID
UPDATE public.products
SET allowed_users = ARRAY[created_by]
WHERE created_by IS NOT NULL AND allowed_users IS NULL;

-- Index for performance on array contains check
CREATE INDEX IF NOT EXISTS idx_products_allowed_users ON public.products USING GIN (allowed_users);

-- Comment: Logic for visibility will be:
-- 1. Admin/Super Admin: See ALL.
-- 2. Regular User: See if allowed_users IS NULL (Public) OR allowed_users @> ARRAY[auth.uid()]
