-- Migration to allow deleting products by cascading deletion to dependencies
-- This makes deleting a product also delete its production history, 
-- usages in other recipes (BOM), and sales history.

-- 1. Production Orders
ALTER TABLE "production_orders"
DROP CONSTRAINT "production_orders_product_id_fkey";

ALTER TABLE "production_orders"
ADD CONSTRAINT "production_orders_product_id_fkey"
FOREIGN KEY ("product_id")
REFERENCES "products" ("id")
ON DELETE CASCADE;

-- 2. Product BOM (Child Products / Ingredients)
-- If a product (e.g. Filling) is deleted, remove it from any recipes that use it.
ALTER TABLE "product_bom"
DROP CONSTRAINT "product_bom_child_product_id_fkey";

ALTER TABLE "product_bom"
ADD CONSTRAINT "product_bom_child_product_id_fkey"
FOREIGN KEY ("child_product_id")
REFERENCES "products" ("id")
ON DELETE CASCADE;

-- 3. Sale Items
-- If a product is deleted, remove it from sales history.
ALTER TABLE "sale_items"
DROP CONSTRAINT "sale_items_product_id_fkey";

ALTER TABLE "sale_items"
ADD CONSTRAINT "sale_items_product_id_fkey"
FOREIGN KEY ("product_id")
REFERENCES "products" ("id")
ON DELETE CASCADE;
