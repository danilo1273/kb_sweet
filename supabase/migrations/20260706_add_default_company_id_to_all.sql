-- Migration: 20260706_add_default_company_id_to_all.sql
-- Goal: Enforce automatic get_user_company_id() default on the company_id column across all tables.

ALTER TABLE public.profiles ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.production_orders ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.bank_accounts ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.suppliers ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.purchase_requests ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.financial_movements ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.products ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.purchase_orders ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.ingredients ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.sale_items ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.stock_locations ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.sales ALTER COLUMN company_id SET DEFAULT get_user_company_id();
ALTER TABLE public.clients ALTER COLUMN company_id SET DEFAULT get_user_company_id();
