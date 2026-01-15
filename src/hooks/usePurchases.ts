import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import { PurchaseOrder } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export function usePurchases() {
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Cache profiles using useRef to avoid re-triggering effects
    const profilesCache = useRef<Record<string, string>>({});

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

            // 4. Fetch Profiles (Creators, Requesters, Approvers)
            const userIds = new Set<string>();
            ordersData?.forEach((o: any) => {
                if (o.created_by) userIds.add(o.created_by);
            });
            requestsData?.forEach((r: any) => {
                if (r.user_id) userIds.add(r.user_id);
                if (r.approved_by) userIds.add(r.approved_by);
            });

            const uniqueIds = Array.from(userIds).filter(id => !profilesCache.current[id]);
            if (uniqueIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', uniqueIds);
                if (profiles) {
                    profiles.forEach(p => {
                        profilesCache.current[p.id] = p.full_name || p.email;
                    });
                }
            }

            // 5. Attach Names & Set State
            const enrichedOrders = ordersWithRequests.map(o => {
                // Find primary approver (if any request is approved)
                const approval = o.requests.find((r: any) => r.approved_by);

                return {
                    ...o,
                    creator_name: profilesCache.current[o.created_by] || 'Desconhecido',
                    approver_name: approval ? profilesCache.current[approval.approved_by] : undefined
                };
            });

            setOrders(enrichedOrders);

        } catch (error: any) {
            console.error("Error fetching purchases:", error);
            toast({ variant: 'destructive', title: "Erro ao carregar pedidos", description: error.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

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

    /**
     * DELETE ORDER (Secure via RPC)
     */
    const deleteOrder = async (orderId: string, reason: string, userId: string) => {
        try {
            const { error } = await supabase.rpc('secure_delete_purchase_order', {
                p_order_id: orderId,
                p_reason: reason,
                p_user_id: userId
            });

            if (error) throw error;

            toast({ title: "Pedido e itens excluídos com segurança." });
            await fetchOrders();
            return true;
        } catch (error: any) {
            console.error("Delete Error:", error);
            toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message || error.details });
            return false;
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
            // First revert if needed
            if (currentStatus === 'approved' || currentStatus === 'edit_approved') {
                const { error: revError } = await supabase.rpc('revert_purchase_item', { p_request_id: requestId });
                if (revError) throw revError;
            }

            // Then delete
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

    /**
     * APPROVE REQUEST (Secure via RPC)
     */
    const approveRequest = async (item: any, approved: boolean, userId: string, skipFetch = false) => {
        try {
            if (approved) {
                // Use RPC to approve, move stock, create finance
                const { error } = await supabase.rpc('approve_purchase_item', {
                    p_request_id: item.id,
                    p_user_id: userId
                });
                if (error) throw error;

                if (!skipFetch) toast({ title: "Item Aprovado e Estoque Atualizado" });
            } else {
                // REJECT Logic
                // If it was previously approved, we must revert first
                if (item.status === 'approved') {
                    const { error: revError } = await supabase.rpc('revert_purchase_item', { p_request_id: item.id });
                    if (revError) throw revError;
                }

                // Initial rejection (just sets status, no stock logic needed if it was pending)
                // If it was pending, we just set to rejected. RPC doesn't handle "rejecting pending" explicitly other than ignore.
                // So we do manual update for rejection status.
                const { error: statusErr } = await supabase.from('purchase_requests')
                    .update({ status: 'rejected', approved_by: null, approved_at: null })
                    .eq('id', item.id);

                if (statusErr) throw statusErr;

                if (!skipFetch) toast({ title: "Item Rejeitado" });
            }

            if (!skipFetch) await fetchOrders();
            return true;

        } catch (e: any) {
            console.error("Approval Error:", e);
            toast({ variant: 'destructive', title: "Erro na aprovação", description: e.message || e.details });
            return false;
        }
    };

    const batchApproveRequests = async (items: any[], approve: boolean, userId: string) => {
        try {
            // Sequential processing to allow RPCs to run without race conditions on same tables if any
            for (const item of items) {
                if (item.status === 'pending') {
                    await approveRequest(item, approve, userId, true);
                }
            }
            toast({ title: `Processamento em lote concluído.` });
            await fetchOrders();
            return true;
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro em lote", description: e.message });
            return false;
        }
    };

    const updateOrderStatus = async (orderId: string, status: string) => {
        try {
            const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', orderId);
            if (error) throw error;
            toast({ title: `Status atualizado.` });
            await fetchOrders();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao atualizar status", description: error.message });
            return false;
        }
    };

    /**
     * REPROCESS (Revert to Pending)
     */
    const reprocessOrderToPending = async (orderId: string) => {
        try {
            // 1. Fetch all requests
            const { data: requests, error: fetchErr } = await supabase
                .from('purchase_requests')
                .select('*')
                .eq('order_id', orderId);

            if (fetchErr) throw fetchErr;

            if (requests) {
                for (const req of requests) {
                    // Start by Calling REVERT RPC for everyone that is approved
                    if (['approved', 'edit_approved'].includes(req.status)) {
                        const { error: revError } = await supabase.rpc('revert_purchase_item', { p_request_id: req.id });
                        if (revError) throw revError;
                    } else {
                        // Just reset status for non-approved ones
                        await supabase.from('purchase_requests').update({ status: 'pending' }).eq('id', req.id);
                    }
                }
            }

            // 2. Set Order to Open
            const { error } = await supabase.from('purchase_orders').update({ status: 'open' }).eq('id', orderId);
            if (error) throw error;

            toast({ title: "Edição finalizada. Pedido pendente para aprovação." });
            await fetchOrders();
            return true;

        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro ao finalizar edição", description: e.message });
            return false;
        }
    };

    // Deprecated client-side logic removed.
    // We keep this empty function or remove it entirely if no longer used.
    // Checking usage in other files... likely used in POS? No, looks like internal use only or legacy.
    // Safe to remove or keep empty stub to avoid breaking imports immediately.
    const reverseStockAndFinancial = async (item: any) => {
        console.warn("Legacy reverseStockAndFinancial called - should use RPC");
    };

    // Deprecated
    const recalculateStockFromHistory = async () => {
        console.warn("Legacy recalculateStockFromHistory called - no longer needed with RPCs");
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
        updateOrderStatus,
        profilesCache: profilesCache.current,
        reverseStockAndFinancial,
        approveRequest,
        batchApproveRequests,
        reprocessOrderToPending,
        recalculateStockFromHistory
    };
}
