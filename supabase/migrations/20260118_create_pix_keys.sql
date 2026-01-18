create table if not exists pix_keys (
    id uuid primary key default uuid_generate_v4(),
    key text not null,
    key_type text not null check (key_type in ('cpf', 'cnp', 'email', 'phone', 'random')),
    description text,
    is_default boolean default false,
    created_at timestamp with time zone default now()
);

-- Policy to allow authenticated users to view/manage keys (assuming simple single-tenant or shared for now, based on existing pattern)
-- If we need multi-tenant, we should add company_id. For now, matching existing pattern where some tables are global or RLS is open.
-- Checking existing RLS patterns... Most tables have RLS enabled.
alter table pix_keys enable row level security;

create policy "Enable all access for authenticated users" 
on pix_keys for all 
to authenticated 
using (true) 
with check (true);
