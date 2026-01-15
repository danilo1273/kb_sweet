-- Create table for tracking manual stock adjustments
create table if not exists stock_adjustments (
  id uuid default gen_random_uuid() primary key,
  ingredient_id uuid references ingredients(id) on delete cascade not null,
  quantity_diff float not null,
  old_stock float not null,
  new_stock float not null,
  stock_owner text not null check (stock_owner in ('danilo', 'adriel')),
  reason text,
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now() not null,
  type text check (type in ('adjustment', 'loss', 'found')) default 'adjustment'
);

-- Enable RLS
alter table stock_adjustments enable row level security;

create policy "Enable read for authenticated users" on stock_adjustments
  for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users" on stock_adjustments
  for insert with check (auth.role() = 'authenticated');

-- Function to apply adjustment transactionally
create or replace function apply_stock_adjustment(
  p_ingredient_id uuid,
  p_new_stock float,
  p_stock_owner text,
  p_reason text,
  p_type text
) returns void as $$
declare
  v_old_stock float;
  v_diff float;
begin
  -- Lock the row and get current stock
  if p_stock_owner = 'danilo' then
    select stock_danilo into v_old_stock from ingredients where id = p_ingredient_id for update;
    v_diff := p_new_stock - coalesce(v_old_stock, 0);
    update ingredients set stock_danilo = p_new_stock where id = p_ingredient_id;
  else
    select stock_adriel into v_old_stock from ingredients where id = p_ingredient_id for update;
    v_diff := p_new_stock - coalesce(v_old_stock, 0);
    update ingredients set stock_adriel = p_new_stock where id = p_ingredient_id;
  end if;

  -- Record the adjustment
  insert into stock_adjustments (
    ingredient_id, quantity_diff, old_stock, new_stock, stock_owner, reason, user_id, type
  ) values (
    p_ingredient_id, v_diff, coalesce(v_old_stock, 0), p_new_stock, p_stock_owner, p_reason, auth.uid(), p_type
  );
end;
$$ language plpgsql security definer;
