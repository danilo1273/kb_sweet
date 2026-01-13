import { useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { POSOrderItem } from '@/types';

export function usePOS() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    async function processSale(
        items: POSOrderItem[],
        total: number,
        discount: number,
        paymentMethod: string,
        clientId: string | null,
        stockSource: 'danilo' | 'adriel'
    ) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // 0. Validate Stock
            for (const item of items) {
                const product = item.product;
                const availableStock = stockSource === 'danilo' ? product.stock_danilo : product.stock_adriel;
                if (item.quantity > availableStock) {
                    throw new Error(`Estoque insuficiente para ${product.name} no estoque de ${stockSource.toUpperCase()}. Disponível: ${availableStock}`);
                }
            }

            // 1. Create Sale Header
            const { data: saleData, error: saleError } = await supabase
                .from('sales')
                .insert([{
                    client_id: clientId === 'anonymous' ? null : clientId,
                    user_id: user.id,
                    total: total,
                    discount: discount,
                    payment_method: paymentMethod,
                    status: 'completed',
                    stock_source: stockSource
                }])
                .select()
                .single();

            if (saleError) throw saleError;

            // 2. Create Sale Items
            const itemsPayload = items.map(item => ({
                sale_id: saleData.id,
                product_id: item.product.id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                cost_price_snapshot: item.product.cost
            }));

            const { error: itemsError } = await supabase.from('sale_items').insert(itemsPayload);
            if (itemsError) throw itemsError;

            // 3. Update Stock (Deduct)
            for (const item of items) {
                const product = item.product;
                const newStock = stockSource === 'danilo'
                    ? (product.stock_danilo - item.quantity)
                    : (product.stock_adriel - item.quantity);

                const updatePayload = stockSource === 'danilo'
                    ? { stock_danilo: newStock }
                    : { stock_adriel: newStock };

                await supabase.from('products').update(updatePayload).eq('id', product.id);
            }

            // 4. Create Financial Movement (Income)
            // Only if it's not "Credit" (Receivable) or if we want to track it as pending?
            // "Lançador de Vendas" typically implies immediate or tracked revenue.
            // Let's create it as 'paid' if money/pix/debit, 'pending' if credit?
            // For now, let's assume all are 'paid' except explicitly Credit, or just create 'paid' for simplicity as POS implies completed transaction.
            // Actually, let's stick to the prompt: "Integration with... financial movement creation".

            const isPaid = paymentMethod !== 'credit_card'; // Simplified logic
            const movementStatus = isPaid ? 'paid' : 'pending';
            const paymentDate = isPaid ? new Date().toISOString() : null;

            await supabase.from('financial_movements').insert({
                description: `Venda PDV #${saleData.id.slice(0, 8)}`,
                amount: total,
                type: 'income',
                status: movementStatus,
                due_date: new Date().toISOString(),
                payment_date: paymentDate,
                detail_order_id: saleData.id
            });

            toast({ title: "Venda realizada com sucesso!", className: "bg-green-600 text-white" });
            return true;

        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: "Erro ao processar venda", description: error.message });
            return false;
        } finally {
            setLoading(false);
        }
    }

    return {
        processSale,
        loading
    };
}
