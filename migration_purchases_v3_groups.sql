-- 1. Create Purchase Orders (Groups)
create table if not exists purchase_orders (
    id uuid default uuid_generate_v4() primary key,
    nickname text not null, -- "Apelido" da compra (ex: "Semanal Kibarato")
    supplier_id uuid references suppliers(id),
    created_at timestamp with time zone default now(),
    created_by uuid references auth.users(id),
    status text default 'open', -- 'open', 'closed', 'partial'
    total_value numeric default 0
);

-- 2. Link Requests to Orders
alter table purchase_requests 
add column if not exists order_id uuid references purchase_orders(id);

-- 3. Create History Table for Auditing
create table if not exists purchase_edits_history (
    id uuid default uuid_generate_v4() primary key,
    purchase_request_id uuid references purchase_requests(id) on delete cascade,
    changed_by uuid references auth.users(id),
    changed_at timestamp with time zone default now(),
    change_reason text,
    field_changed text, -- 'quantity', 'cost', 'status', etc.
    old_value text,
    new_value text
);

-- 4. Enable RLS
alter table purchase_orders enable row level security;
alter table purchase_edits_history enable row level security;

-- 5. Policies (Simple allow-all for authenticated for now, refine later)
create policy "Enable all access for authenticated users" on purchase_orders for all using (auth.role() = 'authenticated');
create policy "Enable all access for authenticated users" on purchase_edits_history for all using (auth.role() = 'authenticated');

-- 6. RPC to Create Order with Items (Transaction-like)
-- Note: Supabase JS client update usually handles parent-child inserts if configured, but we might do it in two steps in frontend.
-- Keeping it simple initially without complex RPCs.
