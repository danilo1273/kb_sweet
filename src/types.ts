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
    // Enriched fields
    detail_supplier?: string;
    detail_buyer?: string;
    detail_order_nickname?: string;
    detail_order_id?: string;
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
