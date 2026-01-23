export interface Company {
    id: string;
    name: string;
    status: 'active' | 'suspended';
    plan: 'plan_i' | 'plan_ii';
    created_at: string;
    logo_url?: string;
}

export interface Profile {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
    role: string;
    roles: string[];
    company_id?: string;
}

export interface FinancialMovement {
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    status: 'pending' | 'paid';
    due_date: string;
    payment_date: string | null;
    created_at: string;
    related_purchase_id?: string;
    related_sale_id?: string;
    // Enriched fields
    detail_supplier?: string;
    detail_buyer?: string;
    detail_order_nickname?: string;
    detail_order_id?: string;
    bank_account_id?: string; // Link to BankAccount
    detail_bank_name?: string; // Enriched
}

export interface BankAccount {
    id: string;
    name: string;
    initial_balance: number;
    created_at: string;
}

export interface BatchGroup {
    order_id: string;
    order_nickname: string;
    supplier_name: string;
    movements: FinancialMovement[];
    total_pending: number;
    total_paid: number;
    buyer_name?: string;
}

export interface Ingredient {
    id: string;
    name: string;
    category?: string;
    unit: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number;
    cost_danilo?: number;
    cost_adriel?: number;
    min_stock: number;
    unit_weight?: number; // Conversion factor
    unit_type?: string;   // Secondary unit (e.g. 'g')
    purchase_unit?: string;
    purchase_unit_factor?: number;
    type?: 'stock' | 'expense' | 'product';
    is_product_entity?: boolean;
    stocks?: {
        location_id: string;
        location_name: string;
        location_slug: string;
        quantity: number;
        average_cost: number;
    }[];
}

export interface PurchaseRequest {
    id: string;
    order_id: string;
    item_name: string;
    ingredient_id?: string;
    quantity: number;
    unit: string;
    status: 'pending' | 'approved' | 'rejected' | 'edit_requested' | 'edit_approved';
    cost: number;
    supplier?: string;
    destination?: 'danilo' | 'adriel';
    created_at: string;
    user_id?: string;
    requested_by?: string;
    change_reason?: string;
    financial_status?: 'pending' | 'paid' | 'none';
}

export interface PurchaseOrder {
    id: string;
    nickname: string;
    supplier_id?: string;
    created_at: string;
    created_by: string;
    status: 'open' | 'closed' | 'partial' | 'edit_requested' | 'edit_approved';
    total_value: number;
    requests: PurchaseRequest[];
    creator_name?: string;
    supplier_name?: string;
    suppliers?: { name: string }; // Join result
    profiles?: { full_name: string }; // Join result
}

export interface Supplier {
    id: string;
    name: string;

}

export interface Category {
    id: number;
    name: string;
    type: 'stock' | 'expense';
}

export interface ItemDraft {
    item_name: string;
    ingredient_id?: string;
    quantity: number;
    unit: string;
    cost: number;
    destination: 'danilo' | 'adriel';
}

export interface Sale {
    id: string;
    client_id?: string;
    user_id: string;
    total: number;
    discount: number;
    payment_method: string;
    status: 'completed' | 'pending' | 'cancelled';
    stock_source: 'danilo' | 'adriel' | string; // Updated to allow legacy string or generic
    location_id?: string;
    created_at: string;
    clients?: { name: string };
    stock_locations?: { name: string; slug: string };
    sale_items?: SaleItem[];
}

export interface SaleItem {
    id: string;
    sale_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    cost_price_snapshot: number;
    products?: { name: string };
}

export interface POSProduct {
    id: string;
    name: string;
    price: number;
    cost: number;
    cost_danilo?: number; // Added
    cost_adriel?: number; // Added
    category: string;
    stock_danilo: number;
    stock_adriel: number;
    unit?: string;
    product_stocks?: ProductStock[];
}

export interface POSOrderItem {
    tempId: string;
    product: POSProduct;
    quantity: number;
    unit_price: number;
    cost?: number; // Added: Effective Cost Snapshot
    total: number;
}

export interface StockLocation {
    id: string;
    company_id: string;
    name: string;
    slug: string;
    is_default: boolean;
    type: string;
    created_at: string;
}

export interface ProductStock {
    id: string;
    product_id?: string; // Finished Good
    ingredient_id?: string; // Raw Material
    location_id: string;
    quantity: number;
    average_cost: number;
    last_updated: string;
    location?: StockLocation;
}

export interface Product {
    id: string;
    name: string;
    unit: string;
    category?: string;
    batch_size?: number;
    product_stocks?: ProductStock[];
    // Add other product fields as needed from usage
}
