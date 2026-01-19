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
        stockSource: string
    ) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Prepare Items Payload
            const itemsPayload = items.map(item => ({
                product_id: item.product.id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                cost: item.cost ?? item.product.cost // Use effective cost if available
            }));

            // Call Secure RPC
            const { error } = await supabase.rpc('process_sale', {
                p_items: itemsPayload,
                p_total: total,
                p_discount: discount,
                p_payment_method: paymentMethod,
                p_client_id: clientId === 'anonymous' ? null : clientId,
                p_location_id: stockSource
            });

            if (error) throw error;

            toast({
                title: "Venda Registrada!",
                description: "Estoque atualizado. Confirme o recebimento no menu Financeiro.",
                className: "bg-green-600 text-white"
            });
            return true;

        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: "Erro ao processar venda", description: error.message || error.details });
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
