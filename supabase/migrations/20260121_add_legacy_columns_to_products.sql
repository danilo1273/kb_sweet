-- Add legacy stock/cost columns to PRODUCTS table to support Inventory UI and Audit
-- These columns already exist on 'ingredients', but were missing on 'products'.

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_danilo NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_adriel NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_danilo NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_adriel NUMERIC DEFAULT 0;

-- Refresh schema cache happens automatically on Supabase platform usually, 
-- but ensuring the columns exist is key.
