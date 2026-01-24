-- Add created_by column to products table for row level security/visibility logic
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Optional: Index for performance
CREATE INDEX IF NOT EXISTS idx_products_created_by ON public.products(created_by);

-- Update existing products to have a creator if possible (e.g. the first admin found, or null)
-- For now, we leave NULL, or we could set to the current user executing this if run manually.
-- But usually NULL is fine, logic will handle "OR created_by IS NULL" if we want legacy to be visible to all, 
-- or we strictly hide it. User asked for "each user sees their own".
-- Let's enable RLS later if needed, but for now we just filter in the frontend/query as requested.
