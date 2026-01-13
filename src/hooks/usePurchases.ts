import { useState, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { PurchaseOrder, PurchaseRequest, Supplier } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export function usePurchases() {
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Cache profiles to avoid repeated fetches
    const [profilesCache, setProfilesCache] = useState<Record<string, string>>({});

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Orders
            const { data: ordersData, error: ordersError } = await supabase
                .from('purchase_orders')
                .select('*, suppliers(name)')
                .order('created_at', { ascending: false });

            if (ordersError) throw ordersError;

            // 2. Fetch Requests
            const { data: requestsData, error: requestsError } = await supabase
                .from('purchase_requests')
                .select('*')
                .order('created_at', { ascending: true });

            if (requestsError) throw requestsError;

            // 3. Map Requests to Orders
            const ordersWithRequests = (ordersData || []).map((o: any) => ({
                ...o,
                supplier_name: o.suppliers?.name,
                requests: (requestsData || []).filter((r: any) => r.order_id === o.id)
            }));

            setOrders(ordersWithRequests);

            // 4. Fetch Profiles (Creators & Requesters)
            const userIds = new Set<string>();
            ordersData?.forEach((o: any) => {
                if (o.created_by) userIds.add(o.created_by);
            });
            requestsData?.forEach((r: any) => {
                if (r.user_id) userIds.add(r.user_id);
            });

            const uniqueIds = Array.from(userIds).filter(id => !profilesCache[id]);
            if (uniqueIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', uniqueIds);
                if (profiles) {
                    const newCache = { ...profilesCache };
                    profiles.forEach(p => newCache[p.id] = p.full_name || p.email);
                    setProfilesCache(newCache);
                }
            }

        } catch (error: any) {
            console.error("Error fetching purchases:", error);
            toast({ variant: 'destructive', title: "Erro ao carregar pedidos", description: error.message });
        } finally {
            setLoading(false);
        }
    }, [profilesCache, toast]);

    const createOrder = async (nickname: string, supplierId: string, items: any[], currentUserId: string) => {
        try {
            // 1. Create Order
            const { data: order, error: orderError } = await supabase
                .from('purchase_orders')
                .insert({
                    nickname,
                    supplier_id: supplierId === 'default' ? null : supplierId,
                    created_by: currentUserId,
                    status: 'open'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 2. Add Items
            if (items.length > 0) {
                const requestsPayload = items.map(item => ({
                    order_id: order.id,
                    user_id: currentUserId,
                    item_name: item.item_name,
                    quantity: item.quantity,
                    unit: item.unit,
                    cost: item.cost,
                    status: 'pending',
                    destination: item.destination
                }));

                const { error: reqError } = await supabase.from('purchase_requests').insert(requestsPayload);
                if (reqError) throw reqError;
            }

            toast({ title: "Pedido criado com sucesso!" });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao criar pedido", description: error.message });
            return false;
        }
    };

    const deleteOrder = async (orderId: string) => {
        try {
            // Cascading delete is handled by DB usually, but let's be safe if UI needs explicit steps
            // Assuming DB has ON DELETE CASCADE for foreign keys on requests
            const { error } = await supabase.from('purchase_orders').delete().eq('id', orderId);
            if (error) throw error;

            toast({ title: "Pedido excluído" });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message });
            return false;
        }
    };

    const normalizeString = (str: string) =>
        str.toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, ' ');

    const reverseStockAndFinancial = async (item: any) => {
        // Logic moved from Purchases.tsx
        let ingId = item.ingredient_id;
        if (!ingId) {
            const normName = normalizeString(item.item_name);
            const { data: allIngs } = await supabase.from('ingredients').select('id, name');
            const match = allIngs?.find(i => normalizeString(i.name) === normName);
            if (match) ingId = match.id;
        }

        if (ingId) {
            const { data: currentIng } = await supabase.from('ingredients').select('*').eq('id', ingId).single();
            if (currentIng && currentIng.type !== 'expense') {
                const targetStockField = item.destination === 'adriel' ? 'stock_adriel' : 'stock_danilo';
                const currentStock = currentIng[targetStockField] || 0;

                const isPurchaseUnit = item.unit === currentIng.purchase_unit;
                const factor = isPurchaseUnit ? (Number(currentIng.purchase_unit_factor) || 1) : 1;
                const qtyToReverse = Number(item.quantity) * factor;

                const newStock = Math.max(0, currentStock - qtyToReverse);
                await supabase.from('ingredients').update({ [targetStockField]: newStock }).eq('id', ingId);
            }
        }
    };

    const addRequestToOrder = async (orderId: string, item: any, userId: string, requestedBy: string) => {
        try {
            const { error } = await supabase.from('purchase_requests').insert({
                order_id: orderId,
                item_name: item.item_name,
                ingredient_id: item.ingredient_id || null,
                quantity: item.quantity,
                unit: item.unit,
                cost: item.cost,
                destination: item.destination,
                status: 'pending',
                user_id: userId,
                requested_by: requestedBy
            });

            if (error) throw error;
            toast({ title: "Item adicionado ao lote" });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao adicionar item", description: error.message });
            return false;
        }
    };

    const deleteRequestFromOrder = async (requestId: string, currentStatus: string) => {
        try {
            // Retrieve item details first to be able to revert if needed
            const { data: item } = await supabase.from('purchase_requests').select('*').eq('id', requestId).single();
            if (!item) return false;

            if (currentStatus === 'approved') {
                await reverseStockAndFinancial(item);
                await supabase.from('financial_movements').delete().eq('related_purchase_id', requestId);
            }

            const { error } = await supabase.from('purchase_requests').delete().eq('id', requestId);
            if (error) throw error;

            toast({ title: "Item removido" });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao remover item", description: error.message });
            return false;
        }
    };

    const updateOrderHeader = async (orderId: string, updates: Partial<PurchaseOrder>) => {
        try {
            const { error } = await supabase.from('purchase_orders').update(updates).eq('id', orderId);
            if (error) throw error;
            toast({ title: "Pedido atualizado" });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao atualizar pedido", description: error.message });
            return false;
        }
    };


    const approveRequest = async (item: any, approved: boolean) => {
        try {
            const newStatus = approved ? 'approved' : 'rejected';

            if (approved) {
                let ingId = item.ingredient_id;
                if (!ingId) {
                    const normName = normalizeString(item.item_name);
                    const { data: allIngs } = await supabase.from('ingredients').select('id, name');
                    const match = allIngs?.find(i => normalizeString(i.name) === normName);
                    if (match) ingId = match.id;
                }

                if (ingId) {
                    const { data: freshIng, error: fetchErr } = await supabase.from('ingredients').select('*').eq('id', ingId).single();
                    if (fetchErr) throw new Error("Falha ao buscar dados atuais do ingrediente");

                    if (freshIng) {
                        if (freshIng.type === 'expense') {
                            // Skip stock update for Expense
                        } else {
                            const isPrimary = (item.unit || '').trim().toLowerCase() === (freshIng.unit || '').trim().toLowerCase();
                            const isSecondary = (item.unit || '').trim().toLowerCase() === (freshIng.unit_type || '').trim().toLowerCase();
                            const isLegacyPurchase = (item.unit || '').trim().toLowerCase() === (freshIng.purchase_unit || '').trim().toLowerCase();

                            let factor = 1;
                            if (isPrimary) factor = 1;
                            else if (isSecondary) factor = Number(freshIng.unit_weight) || 1;
                            else if (isLegacyPurchase) factor = Number(freshIng.purchase_unit_factor) || 1;

                            const convertedQty = Number(item.quantity) * factor;
                            const targetField = item.destination === 'adriel' ? 'stock_adriel' : 'stock_danilo';
                            const targetCostField = item.destination === 'adriel' ? 'cost_adriel' : 'cost_danilo';

                            const currentOwnerStock = freshIng[targetField] || 0;
                            const currentOwnerCost = freshIng[targetCostField] || 0;

                            const newOwnerStock = currentOwnerStock + convertedQty;
                            const newOwnerAvg = ((currentOwnerStock * (currentOwnerCost || 0)) + Number(item.cost)) / newOwnerStock;

                            const totalStock = (freshIng.stock_danilo || 0) + (freshIng.stock_adriel || 0);
                            const newTotalStock = totalStock + convertedQty;
                            const newGlobalAvg = ((totalStock * (freshIng.cost || 0)) + Number(item.cost)) / newTotalStock;

                            const { error: updateErr } = await supabase.from('ingredients').update({
                                [targetField]: newOwnerStock,
                                [targetCostField]: isNaN(newOwnerAvg) ? currentOwnerCost : newOwnerAvg,
                                cost: isNaN(newGlobalAvg) ? (freshIng.cost || 0) : newGlobalAvg
                            }).eq('id', ingId);
                            if (updateErr) throw new Error("Falha ao atualizar estoque/custo");
                        }
                    }
                }

                if (item.cost > 0) {
                    const { data: existing } = await supabase.from('financial_movements').select('id').eq('related_purchase_id', item.id).single();
                    const movementPayload = {
                        description: `Compra: ${item.item_name}`,
                        amount: -Math.abs(Number(item.cost)),
                        type: 'expense' as const,
                        status: 'pending' as const,
                        related_purchase_id: item.id,
                        due_date: new Date().toISOString()
                    };
                    if (existing) await supabase.from('financial_movements').update(movementPayload).eq('id', existing.id);
                    else await supabase.from('financial_movements').insert(movementPayload);
                }

            } else if (!approved && item.status === 'approved') {
                await reverseStockAndFinancial(item);
                await supabase.from('financial_movements').delete().eq('related_purchase_id', item.id);
            }

            const { error: statusErr } = await supabase.from('purchase_requests').update({ status: newStatus }).eq('id', item.id);
            if (statusErr) throw new Error("Falha ao atualizar status");

            toast({ title: `Item ${approved ? 'Aprovado' : 'Rejeitado'}` });
            await fetchOrders();
            return true;

        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
            return false;
        }
    };

    return {
        orders,
        loading,
        fetchOrders,
        createOrder,
        deleteOrder,
        addRequestToOrder,
        deleteRequestFromOrder,
        updateOrderHeader,
        profilesCache,
        reverseStockAndFinancial,
        approveRequest
    };
}
