-- Migration: Add Telegram Connection columns to Profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_link_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_state jsonb;
