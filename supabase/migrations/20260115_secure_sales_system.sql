-- Create Audit Logs Table
create table if not exists audit_logs (
  id uuid default gen_random_uuid() primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null, -- 'UPDATE', 'DELETE'
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id),
  reason text,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS for Audit Logs
alter table audit_logs enable row level security;
create policy "Enable read for authenticated users" on audit_logs for select using (auth.role() = 'authenticated');

-- RPC: Process Sale (Transaction: Stock Deduc + Sale + Items + Finance Pending)
create or replace function process_sale(
  p_client_id uuid,
  p_total numeric,
  p_discount numeric,
  p_payment_method text,
  p_stock_source text,
  p_items jsonb -- Array of {product_id, quantity, unit_price, cost}
) returns uuid as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_stock numeric;
  v_new_stock numeric;
begin
  -- 1. Insert Sale Header
  insert into sales (
    client_id, user_id, total, discount, payment_method, status, stock_source
  ) values (
    p_client_id, auth.uid(), p_total, p_discount, p_payment_method, 'completed', p_stock_source
  ) returning id into v_sale_id;

  -- 2. Process Items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    -- Check and Update Stock
    if p_stock_source = 'danilo' then
      select stock_danilo into v_stock from products where id = v_product_id for update;
      v_new_stock := v_stock - v_qty;
      if v_new_stock < 0 then
        raise exception 'Estoque insuficiente para produto %', v_product_id;
      end if;
      update products set stock_danilo = v_new_stock where id = v_product_id;
    else
      select stock_adriel into v_stock from products where id = v_product_id for update;
      v_new_stock := v_stock - v_qty;
      if v_new_stock < 0 then
        raise exception 'Estoque insuficiente para produto %', v_product_id;
      end if;
      update products set stock_adriel = v_new_stock where id = v_product_id;
    end if;

    -- Insert Sale Item
    insert into sale_items (
      sale_id, product_id, quantity, unit_price, cost_price_snapshot
    ) values (
      v_sale_id, v_product_id, v_qty, (v_item->>'unit_price')::numeric, (v_item->>'cost')::numeric
    );
  end loop;

  -- 3. Insert Financial Movement (ALWAYS PENDING)
  insert into financial_movements (
    description,
    amount,
    type,
    status,
    due_date,
    payment_date,
    detail_order_id,
    bank_account_id
  ) values (
    'Venda PDV #' || left(v_sale_id::text, 8),
    p_total,
    'income',
    'pending', -- Always pending per requirement
    now(),
    null, -- No payment date yet
    v_sale_id,
    null
  );

  return v_sale_id;
end;
$$ language plpgsql security definer;

-- RPC: Update Sale Securely
create or replace function update_sale_secure(
  p_sale_id uuid,
  p_new_total numeric,
  p_new_client_id uuid,
  p_reason text
) returns void as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_fin_status text;
begin
  -- Get old data for audit
  select to_jsonb(s.*) into v_old_data from sales s where id = p_sale_id;

  -- Update Sale
  update sales set 
    total = p_new_total,
    client_id = p_new_client_id,
    edit_status = 'approved', -- Auto-approve if calling this secure RPC (assuming guard on frontend or role check)
    edit_requested_at = null
  where id = p_sale_id;

  -- Get new data
  select to_jsonb(s.*) into v_new_data from sales s where id = p_sale_id;

  -- Log Audit
  insert into audit_logs (
    table_name, record_id, action, old_data, new_data, changed_by, reason
  ) values (
    'sales', p_sale_id, 'UPDATE', v_old_data, v_new_data, auth.uid(), p_reason
  );

  -- Sync Financial (Check status first)
  select status into v_fin_status from financial_movements where detail_order_id = p_sale_id;
  
  update financial_movements set
    amount = p_new_total
    -- If it was paid, we warn user or keep it paid? Logic: Just update amount. 
    -- If paid, maybe we should revert to pending? 
    -- For now, let's keep status but update amount.
  where detail_order_id = p_sale_id;

end;
$$ language plpgsql security definer;

-- RPC: Delete Sale Securely
create or replace function delete_sale_secure(
  p_sale_id uuid,
  p_reason text
) returns void as $$
declare
  v_item record;
  v_sale record;
begin
  select * into v_sale from sales where id = p_sale_id;
  
  -- Log Audit (Pre-delete snapshot)
  insert into audit_logs (
    table_name, record_id, action, old_data, changed_by, reason
  ) values (
    'sales', p_sale_id, 'DELETE', to_jsonb(v_sale), auth.uid(), p_reason
  );

  -- 1. Revert Stock
  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    if v_sale.stock_source = 'danilo' then
      update products set stock_danilo = stock_danilo + v_item.quantity where id = v_item.product_id;
    else
      update products set stock_adriel = stock_adriel + v_item.quantity where id = v_item.product_id;
    end if;
  end loop;

  -- 2. Delete Details
  delete from financial_movements where detail_order_id = p_sale_id;
  delete from sale_items where sale_id = p_sale_id;

  -- 3. Delete Header
  delete from sales where id = p_sale_id;
end;
$$ language plpgsql security definer;
