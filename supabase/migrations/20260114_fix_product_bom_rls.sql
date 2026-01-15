-- Fix RLS for product_bom to allow authenticated users to manage recipe items
DROP POLICY IF EXISTS "Enable all access for admin and confections" ON public.product_bom;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.product_bom;

-- Create a more permissive policy for authenticated users (since this is an internal tool)
CREATE POLICY "Enable all access for authenticated users"
ON public.product_bom
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
