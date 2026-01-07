import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Loader2, Pencil, Check, X, Trash2, RotateCcw, Clock, ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface PurchaseOrder {
    id: string;
    nickname: string;
    supplier_id?: string;
    created_at: string;
    created_by: string;
    status: 'open' | 'closed' | 'partial';
    total_value: number;
    requests: PurchaseRequest[];
    creator_name?: string;
}

interface PurchaseRequest {
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

interface PurchaseHistory {
    id: string;
    changed_at: string;
    change_reason: string;
    old_value: string;
    new_value: string;
    changed_by_email?: string;
    changed_by?: string;
    field_changed?: string;
}

interface ItemDraft {
    item_name: string;
    ingredient_id?: string;
    quantity: number;
    unit: string;
    cost: number;
    destination: 'danilo' | 'adriel';
}

interface Ingredient {
    id: string;
    name: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number;
    cost_danilo?: number;
    cost_adriel?: number;
    unit: string;
    purchase_unit?: string;
    purchase_unit_factor?: number;
    category?: string;
    unit_weight?: number;
    unit_type?: string;
}

interface Supplier {
    id: string;
    name: string;
}

const Purchases = () => {
    const { toast } = useToast();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [profiles, setProfiles] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // New Order State
    const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
    const [newOrderNickname, setNewOrderNickname] = useState("");
    const [newOrderSupplier, setNewOrderSupplier] = useState<string>("default");
    const [orderItems, setOrderItems] = useState<ItemDraft[]>([]);
    const [draftItem, setDraftItem] = useState<ItemDraft>({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });
    const [isSavingOrder, setIsSavingOrder] = useState(false);

    // MANAGE ORDER Dialog (New V3.7)
    const [isManageOrderOpen, setIsManageOrderOpen] = useState(false);
    const [manageOrderData, setManageOrderData] = useState<{ id: string, nickname: string, supplier_id: string, items: PurchaseRequest[] }>({ id: '', nickname: '', supplier_id: '', items: [] });
    const [newItemDraft, setNewItemDraft] = useState<ItemDraft>({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });

    // Filter State
    const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending' | 'partial' | 'rejected' | 'editing'>('all');
    const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

    // Dialogs
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyLogs, setHistoryLogs] = useState<PurchaseHistory[]>([]);
    const [isEditRequestOpen, setIsEditRequestOpen] = useState(false);
    const [editReason, setEditReason] = useState("");
    const [itemToRequestEdit, setItemToRequestEdit] = useState<PurchaseRequest | null>(null);
    const [isEditItemOpen, setIsEditItemOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<PurchaseRequest | null>(null);
    const [editedValues, setEditedValues] = useState<{ quantity: number, cost: number, item_name: string, unit: string, ingredient_id?: string, destination: 'danilo' | 'adriel' }>({ quantity: 0, cost: 0, item_name: '', unit: 'un', destination: 'danilo' });
    const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Ingredient>>({ unit: 'un' });

    // New Supplier State
    const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState("");

    useEffect(() => {
        fetchData();
        fetchMeta();
    }, []);

    async function fetchMeta() {
        const { data: ing } = await supabase.from('ingredients').select('id, name, stock_danilo, stock_adriel, cost, cost_danilo, cost_adriel, unit, purchase_unit, purchase_unit_factor, category').order('name');
        if (ing) setIngredients(ing as Ingredient[]);
        const { data: sup } = await supabase.from('suppliers').select('id, name').order('name');
        if (sup) setSuppliers(sup);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
            const { data: profile } = await supabase.from('profiles').select('roles, role').eq('id', user.id).single();
            if (profile) {
                let roles = profile.roles || [];
                if (!roles.length && profile.role) roles = [profile.role];
                setUserRoles(roles);
            }
        }
    }

    async function fetchProfilesForUsers(userIds: string[]) {
        const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
        if (uniqueIds.length === 0) return;
        const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', uniqueIds);
        if (data) {
            const map: Record<string, string> = {};
            data.forEach(p => map[p.id] = p.full_name || p.email);
            setProfiles(prev => ({ ...prev, ...map }));
        }
    }

    async function fetchData() {
        setLoading(true);
        const { data: ordersData, error } = await supabase
            .from('purchase_orders')
            .select(`*, requests:purchase_requests(*)`)
            .order('created_at', { ascending: false });

        if (error) {
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        } else {
            let fetchedOrders: PurchaseOrder[] = ordersData || [];

            // Financial Status Check
            const requestIds = fetchedOrders.flatMap(o => o.requests.map(r => r.id));
            if (requestIds.length > 0) {
                const { data: financial } = await supabase.from('financial_movements').select('related_purchase_id, status').in('related_purchase_id', requestIds);
                const statusMap: Record<string, 'pending' | 'paid'> = {};
                financial?.forEach(f => { statusMap[f.related_purchase_id!] = f.status; });

                fetchedOrders = fetchedOrders.map(o => ({
                    ...o,
                    requests: o.requests.map(r => ({ ...r, financial_status: statusMap[r.id] || 'none' }))
                }));
            }

            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('roles, role').eq('id', user?.id).single();
            let roles = profile?.roles || (profile?.role ? [profile.role] : []);

            if (!roles.includes('admin') && !roles.includes('approver') && !roles.includes('financial')) {
                fetchedOrders = fetchedOrders.filter(o => o.created_by === user?.id);
            }

            setOrders(fetchedOrders);
            const userIds = (fetchedOrders || []).map((o: PurchaseOrder) => o.created_by).concat((fetchedOrders || []).flatMap((o: PurchaseOrder) => o.requests.map((r: PurchaseRequest) => r.user_id || '')));
            fetchProfilesForUsers(userIds as string[]);

            // Check URL for direct order open
            const params = new URLSearchParams(window.location.search);
            const openOrderId = params.get('openOrder');
            if (openOrderId) {
                const found = fetchedOrders.find(o => o.id === openOrderId);
                if (found) {
                    openManageOrder(found);
                    // Clear param to avoid re-opening on simple refresh if desired, or keep it. Keeping for deep link feeling.
                } else {
                    // Try fetching single if not in list
                    const { data: singleOrder, error: singleErr } = await supabase
                        .from('purchase_orders')
                        .select(`*, requests:purchase_requests(*)`)
                        .eq('id', openOrderId)
                        .single();

                    if (singleOrder && !singleErr) {
                        // Enrich single order with financial status
                        const rIds = singleOrder.requests.map((r: any) => r.id);
                        if (rIds.length > 0) {
                            const { data: fin } = await supabase.from('financial_movements').select('related_purchase_id, status').in('related_purchase_id', rIds);
                            const sMap: Record<string, any> = {};
                            fin?.forEach((f: any) => sMap[f.related_purchase_id] = f.status);
                            singleOrder.requests = singleOrder.requests.map((r: any) => ({ ...r, financial_status: sMap[r.id] || 'none' }));
                        }

                        setOrders(prev => [singleOrder, ...prev.filter(p => p.id !== singleOrder.id)]);
                        openManageOrder(singleOrder);
                    }
                }
            }
        }
        setLoading(false);
    }

    const toggleOrder = (id: string) => {
        setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
    }

    // --- MANAGE ORDER LOGIC ---
    function openManageOrder(order: PurchaseOrder) {
        const hasPaidItem = order.requests.some(r => r.financial_status === 'paid');
        if (hasPaidItem) {
            return toast({
                title: "Lote Bloqueado",
                description: "Este lote contém itens já pagos. Para editar, o Financeiro precisa estornar a baixa primeiro.",
                variant: "destructive"
            });
        }
        setManageOrderData({
            id: order.id,
            nickname: order.nickname,
            supplier_id: order.supplier_id || 'default',
            items: order.requests
        });
        setIsManageOrderOpen(true);
    }

    async function handleAddItemToExistingOrder() {
        if (!newItemDraft.item_name && !newItemDraft.ingredient_id) return toast({ title: "Preencha o item" });

        let finalName = newItemDraft.item_name;
        if (newItemDraft.ingredient_id && !finalName) {
            const ing = ingredients.find(i => i.id === newItemDraft.ingredient_id);
            finalName = ing?.name || 'Unknown';
        }

        try {
            const { data: user } = await supabase.auth.getUser();
            const userName = profiles[user.user?.id!] || 'Sistema';

            await supabase.from('purchase_requests').insert({
                order_id: manageOrderData.id,
                item_name: finalName,
                ingredient_id: newItemDraft.ingredient_id || null,
                quantity: newItemDraft.quantity,
                unit: newItemDraft.unit,
                cost: newItemDraft.cost,
                destination: newItemDraft.destination,
                status: 'pending',
                user_id: user.user?.id,
                requested_by: userName
            });

            toast({ title: "Item adicionado ao lote" });
            fetchData();
            // Update modal data manually to show new item immediately
            const { data: updatedReqs } = await supabase.from('purchase_requests').select('*').eq('order_id', manageOrderData.id);
            if (updatedReqs) {
                // Re-enrich with financial status (default none for new)
                const enriched = updatedReqs.map(r => ({ ...r, financial_status: 'none' as const }));
                setManageOrderData(prev => ({ ...prev, items: enriched }));
            }
            setNewItemDraft({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function handleDeleteItemFromOrder(itemId: string, finStatus?: string) {
        if (finStatus === 'paid') return toast({ variant: 'destructive', title: "Bloqueado", description: "Item já pago não pode ser excluído." });

        const itemToDelete = manageOrderData.items.find(i => i.id === itemId);
        if (!itemToDelete) return;

        if (!confirm(`Remover "${itemToDelete.item_name}" do pedido?`)) return;

        try {
            if (itemToDelete.status === 'approved') {
                await reverseStockAndFinancial(itemToDelete);
                await supabase.from('financial_movements').delete().eq('related_purchase_id', itemId);
            }

            await supabase.from('purchase_requests').delete().eq('id', itemId);

            // Re-fetch everything to ensure data integrity
            fetchData();

            // Update local modal state
            const updatedItems = manageOrderData.items.filter(i => i.id !== itemId);
            setManageOrderData(prev => ({ ...prev, items: updatedItems }));

            toast({ title: "Item removido e estoque/financeiro revertidos" });
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function saveManageOrderHeader() {
        try {
            await supabase.from('purchase_orders').update({
                nickname: manageOrderData.nickname,
                supplier_id: manageOrderData.supplier_id === 'default' ? null : manageOrderData.supplier_id
            }).eq('id', manageOrderData.id);
            toast({ title: "Dados atualizados" });
            setIsManageOrderOpen(false);
            fetchData();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    // --- Order Logic ---
    function addItemToDraft() {
        if (!draftItem.item_name && !draftItem.ingredient_id) return toast({ title: "Nome ou produto obrigatório" });
        let finalName = draftItem.item_name;
        if (draftItem.ingredient_id && !finalName) {
            const ing = ingredients.find(i => i.id === draftItem.ingredient_id);
            finalName = ing?.name || 'Unknown';
        }
        setOrderItems([...orderItems, { ...draftItem, item_name: finalName }]);
        setDraftItem({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo', ingredient_id: undefined });
    }

    function removeItemFromDraft(index: number) {
        const newItems = [...orderItems];
        newItems.splice(index, 1);
        setOrderItems(newItems);
    }

    async function handleSaveOrder() {
        if (orderItems.length === 0) return toast({ variant: 'destructive', title: 'Adicione pelo menos um item' });
        if (!newOrderNickname) return toast({ variant: 'destructive', title: 'Defina um apelido para a compra' });

        setIsSavingOrder(true);
        try {
            const { data: user } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.user?.id).single();
            const requestedByName = profile?.full_name || user.user?.user_metadata?.full_name || 'Comprador';

            const { data: order, error: orderError } = await supabase.from('purchase_orders').insert({
                nickname: newOrderNickname,
                supplier_id: newOrderSupplier === 'default' ? null : newOrderSupplier,
                created_by: user.user?.id,
                total_value: orderItems.reduce((acc, i) => acc + Number(i.cost), 0)
            }).select().single();

            if (orderError) throw orderError;

            const requestsPayload = orderItems.map(item => ({
                order_id: order.id,
                item_name: item.item_name,
                ingredient_id: item.ingredient_id || null,
                quantity: item.quantity,
                unit: item.unit,
                cost: item.cost,
                destination: item.destination,
                status: 'pending',
                user_id: user.user?.id,
                requested_by: requestedByName
            }));

            const { error: itemsError } = await supabase.from('purchase_requests').insert(requestsPayload);
            if (itemsError) throw itemsError;

            toast({ title: "Pedido de Compra criado!" });
            setIsOrderDialogOpen(false);
            setOrderItems([]);
            setNewOrderNickname("");
            fetchData();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
        } finally {
            setIsSavingOrder(false);
        }
    }

    async function handleDeleteOrder(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        const hasPaidItem = order?.requests.some(r => r.financial_status === 'paid');
        if (hasPaidItem) {
            return toast({
                title: "Exclusão Bloqueada",
                description: "Este lote contém itens já pagos. O Financeiro precisa estornar a baixa antes de excluir o pedido.",
                variant: "destructive"
            });
        }
        if (!confirm("Excluir este pedido excluirá TODOS os itens dele e reverterá estoque se aprovado. Confirmar?")) return;
        try {
            const { data: reqs } = await supabase.from('purchase_requests').select('id, status, ingredient_id, item_name, quantity, destination, cost').eq('order_id', orderId);
            if (reqs) {
                for (const r of reqs) {
                    if (r.status === 'approved') await reverseStockAndFinancial(r);
                    await supabase.from('financial_movements').delete().eq('related_purchase_id', r.id);
                }
                await supabase.from('purchase_requests').delete().eq('order_id', orderId);
            }
            await supabase.from('purchase_orders').delete().eq('id', orderId);
            toast({ title: "Pedido excluído" });
            fetchData();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function reverseStockAndFinancial(item: any) {
        let ingId = item.ingredient_id;
        if (!ingId) {
            const normName = normalizeString(item.item_name);
            const { data: allIngs } = await supabase.from('ingredients').select('id, name');
            const match = allIngs?.find(i => normalizeString(i.name) === normName);
            if (match) ingId = match.id;
        }

        if (ingId) {
            const { data: currentIng } = await supabase.from('ingredients').select('*').eq('id', ingId).single();
            if (currentIng) {
                const targetStockField = item.destination === 'adriel' ? 'stock_adriel' : 'stock_danilo';
                const currentStock = currentIng[targetStockField] || 0;

                // Use factor in reverse too
                const isPurchaseUnit = item.unit === currentIng.purchase_unit;
                const factor = isPurchaseUnit ? (Number(currentIng.purchase_unit_factor) || 1) : 1;
                const qtyToReverse = Number(item.quantity) * factor;

                const newStock = Math.max(0, currentStock - qtyToReverse);
                await supabase.from('ingredients').update({ [targetStockField]: newStock }).eq('id', ingId);
            }
        }
    }

    async function handleApproveItem(item: PurchaseRequest, approved: boolean) {
        try {
            const newStatus = approved ? 'approved' : 'rejected';

            if (approved) {
                let ingId = item.ingredient_id;
                if (!ingId) {
                    const normalizedItemName = normalizeString(item.item_name);
                    const match = ingredients.find(i => normalizeString(i.name) === normalizedItemName);
                    if (match) ingId = match.id;
                    console.log(`[Approve] Ingredient lookup by name: "${item.item_name}" (norm: "${normalizedItemName}") -> ${ingId ? 'Found (' + ingId + ')' : 'Not Found'}`);
                }

                if (ingId) {
                    const { data: freshIng, error: fetchErr } = await supabase.from('ingredients').select('*').eq('id', ingId).single();
                    if (fetchErr) throw new Error("Falha ao buscar dados atuais do ingrediente");

                    if (freshIng) {
                        // Updated Conversion Logic (Primary/Secondary + Legacy)
                        const isPrimary = (item.unit || '').trim().toLowerCase() === (freshIng.unit || '').trim().toLowerCase();
                        const isSecondary = (item.unit || '').trim().toLowerCase() === (freshIng.unit_type || '').trim().toLowerCase();
                        const isLegacyPurchase = (item.unit || '').trim().toLowerCase() === (freshIng.purchase_unit || '').trim().toLowerCase();

                        let factor = 1;
                        if (isPrimary) {
                            factor = 1;
                        } else if (isSecondary) {
                            factor = Number(freshIng.unit_weight) || 1;
                        } else if (isLegacyPurchase) {
                            factor = Number(freshIng.purchase_unit_factor) || 1;
                        } else {
                            // Fallback: If unit names match roughly (e.g. 'un' vs 'UN')
                            console.warn(`[Approve] Unit mismatch: Request=${item.unit}, Stock=${freshIng.unit}. Assumed factor 1.`);
                        }

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

                        console.log(`[Approve] Calc: Factor=${factor}, ConvertedQty=${convertedQty}, OldStock=${currentOwnerStock}, NewStock=${newOwnerStock}, NewAvg=${newOwnerAvg}`);

                        const { error: updateErr } = await supabase.from('ingredients').update({
                            [targetField]: newOwnerStock,
                            [targetCostField]: isNaN(newOwnerAvg) ? currentOwnerCost : newOwnerAvg,
                            cost: isNaN(newGlobalAvg) ? (freshIng.cost || 0) : newGlobalAvg
                        }).eq('id', ingId);

                        if (updateErr) throw new Error("Falha ao atualizar estoque/custo");
                    }
                } else {
                    console.warn(`[Approve] No ingredient found for "${item.item_name}". Stock not updated.`);
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
            if (statusErr) throw new Error("Falha ao atualizar status do pedido");

            toast({ title: `Item ${approved ? 'Aprovado' : 'Rejeitado'}` });

            // Refresh everything
            fetchData();
            fetchMeta();

        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }



    // --- Edit & History Logic ---
    async function handleRequestEdit(item: PurchaseRequest) {
        if (item.financial_status === 'paid') {
            return toast({
                variant: 'destructive',
                title: "Bloqueado",
                description: "Este item já foi pago. Para editar, o Financeiro precisa estornar a baixa primeiro."
            });
        }
        setItemToRequestEdit(item);
        setEditReason("");
        setIsEditRequestOpen(true);
    }

    async function submitEditRequest() {
        if (!itemToRequestEdit) return;
        try {
            await supabase.from('purchase_requests').update({ status: 'edit_requested', change_reason: editReason }).eq('id', itemToRequestEdit.id);
            await supabase.from('purchase_edits_history').insert({
                purchase_request_id: itemToRequestEdit.id,
                changed_by: currentUserId,
                change_reason: editReason,
                field_changed: 'status',
                old_value: itemToRequestEdit.status,
                new_value: 'edit_requested'
            });
            toast({ title: "Solicitação enviada" });
            setIsEditRequestOpen(false);
            fetchData();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function handleAuthorizeEdit(item: PurchaseRequest, approved: boolean) {
        try {
            if (approved) {
                // IMMEDIATE STOCK REVERSAL upon authorization
                await reverseStockAndFinancial(item);
                await supabase.from('financial_movements').delete().eq('related_purchase_id', item.id);
            }

            const nextStatus = approved ? 'edit_approved' : 'approved';
            await supabase.from('purchase_requests').update({ status: nextStatus }).eq('id', item.id);
            toast({ title: approved ? "Edição Autorizada e Estoque Revertido" : "Solicitação Negada" });
            fetchData();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function handleSendToApproval(item: PurchaseRequest) {
        if (!confirm("Enviar este item para re-aprovação? Ele será removido do estoque até ser aprovado novamente.")) return;
        try {
            // Se já estava aprovado, reverte antes de mudar pra pendente. 
            // Se estiver 'edit_approved', JÁ FOI revertido na autorização, então não reverte de novo.
            if (item.status === 'approved') {
                await reverseStockAndFinancial(item);
                await supabase.from('financial_movements').delete().eq('related_purchase_id', item.id);
            }
            await supabase.from('purchase_requests').update({ status: 'pending' }).eq('id', item.id);
            toast({ title: "Enviado para aprovação" });
            fetchData();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    function openEditItem(item: PurchaseRequest) {
        if (item.financial_status === 'paid') {
            return toast({
                variant: 'destructive',
                title: "Bloqueado",
                description: "Este item já foi pago. Para editar, o Financeiro precisa estornar a baixa primeiro."
            });
        }
        setEditingItem(item);
        setEditedValues({ quantity: item.quantity, cost: item.cost, item_name: item.item_name, unit: item.unit, ingredient_id: item.ingredient_id, destination: item.destination || 'danilo' });
        setIsEditItemOpen(true);
    }

    async function saveEditItem() {
        if (!editingItem) return;
        try {
            const oldData = { q: editingItem.quantity, c: editingItem.cost, n: editingItem.item_name };
            const newData = { q: editedValues.quantity, c: editedValues.cost, n: editedValues.item_name };

            // Se o item já estava autorizado para edição (era aprovado antes), o estoque JÁ FOI revertido na autorização.
            // Apenas salvamos os novos dados.

            await supabase.from('purchase_requests').update({
                quantity: editedValues.quantity,
                cost: editedValues.cost,
                item_name: editedValues.item_name,
                unit: editedValues.unit,
                ingredient_id: editedValues.ingredient_id,
                destination: editedValues.destination,
                status: editingItem.status === 'edit_approved' ? 'pending' : editingItem.status // Volta pra pendente se era edit_approved
            }).eq('id', editingItem.id);

            await supabase.from('purchase_edits_history').insert({
                purchase_request_id: editingItem.id,
                changed_by: currentUserId,
                change_reason: "Edição de valores",
                field_changed: 'details',
                old_value: `Qtd: ${oldData.q}, Total: ${oldData.c}, Nome: ${oldData.n}`,
                new_value: `Qtd: ${newData.q}, Total: ${newData.c}, Nome: ${newData.n}`
            });

            toast({ title: "Item atualizado" });
            setIsEditItemOpen(false);
            fetchData();

            if (isManageOrderOpen && manageOrderData.items) {
                const updatedItems = manageOrderData.items.map(item =>
                    item.id === editingItem.id ? { ...item, ...editedValues, status: editingItem.status === 'edit_approved' ? 'pending' : item.status } : item
                );
                setManageOrderData({ ...manageOrderData, items: updatedItems });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function openHistory(item: PurchaseRequest) {
        const { data } = await supabase.from('purchase_edits_history').select('*').eq('purchase_request_id', item.id).order('changed_at', { ascending: false });
        if (data && data.length > 0) {
            const uids = data.map(d => d.changed_by).filter(Boolean);
            fetchProfilesForUsers(uids as string[]);
        }
        setHistoryLogs(data || []);
        setIsHistoryOpen(true);
    }

    async function handleApproveAll(order: PurchaseOrder) {
        const pending = order.requests.filter(r => r.status === 'pending');
        if (pending.length === 0) return toast({ title: "Nada pendente para aprovar." });

        if (!confirm(`Confirmar aprovação de todos os ${pending.length} itens pendentes?`)) return;

        setLoading(true);
        try {
            // Process sequentially to avoid race conditions on stock updates
            for (const item of pending) {
                await handleApproveItem(item, true);
            }
            toast({ title: "Todos os itens aprovados!" });
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro na aprovação em lote", description: e.message });
        } finally {
            setLoading(false);
            fetchData();
        }
    }

    async function handleSaveProduct() {
        try {
            if (!newProduct.name) return;
            const payload = {
                name: newProduct.name,
                category: newProduct.category || 'Outros',
                unit: newProduct.unit || 'UN',
                unit_weight: Number(newProduct.unit_weight || 1),
                unit_type: newProduct.unit_type || '',
                is_active: true,
                stock_danilo: 0,
                stock_adriel: 0,
                // Legacy / Unused in new model
                purchase_unit: null,
                purchase_unit_factor: 1
            };

            await supabase.from('ingredients').insert(payload);
            toast({ title: "Produto criado com sucesso" });
            setIsProductDialogOpen(false);
            setNewProduct({ unit: 'UN' }); // Reset clean
            fetchMeta();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Erro", description: e.message });
        }
    }

    async function handleSaveSupplier() {
        try {
            if (!newSupplierName.trim()) return toast({ variant: 'destructive', title: "Nome obrigatório" });

            const { data, error } = await supabase.from('suppliers').insert({ name: newSupplierName.trim() }).select().single();
            if (error) throw error;

            toast({ title: "Fornecedor cadastrado" });
            setIsSupplierDialogOpen(false);
            setNewSupplierName("");

            // Refresh suppliers and select the new one if a modal is open
            await fetchMeta();

            if (isOrderDialogOpen) setNewOrderSupplier(data.id);
            if (isManageOrderOpen) setManageOrderData(prev => ({ ...prev, supplier_id: data.id }));

        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
        }
    }

    async function handleSyncStock() {
        if (!confirm("Recalcular estoque e custos médios? Isso reconstruirá os valores com base apenas nos pedidos 'Aprovados'.")) return;
        setLoading(true);
        try {
            const { data: allApproved } = await supabase.from('purchase_requests').select('*').eq('status', 'approved');
            const { data: currentIngs } = await supabase.from('ingredients').select('*');
            if (!currentIngs) throw new Error("Não foi possível carregar ingredientes para sincronização.");

            const stockMap: Record<string, { qD: number, vD: number, qA: number, vA: number }> = {};

            // Inicializa mapa com zeros para todos os ingredientes existentes
            currentIngs.forEach(ing => {
                stockMap[ing.id] = { qD: 0, vD: 0, qA: 0, vA: 0 };
            });

            for (const p of allApproved || []) {
                let id = p.ingredient_id;
                if (!id && p.item_name) {
                    const norm = normalizeString(p.item_name);
                    const m = currentIngs.find(i => normalizeString(i.name) === norm);
                    if (m) id = m.id;
                }

                if (id && stockMap[id]) {
                    const ing = currentIngs.find(i => i.id === id);
                    if (!ing) continue;

                    if (!ing) continue;

                    const factor = (normalizeString(p.unit) === normalizeString(ing.purchase_unit || '')) ? (Number(ing.purchase_unit_factor) || 1) : 1;
                    const convertedQty = Number(p.quantity) * factor;
                    const costVal = Number(p.cost);

                    if (p.destination === 'adriel') {
                        stockMap[id].qA += convertedQty;
                        stockMap[id].vA += costVal;
                    } else {
                        stockMap[id].qD += convertedQty;
                        stockMap[id].vD += costVal;
                    }
                }
            }

            for (const [id, s] of Object.entries(stockMap)) {
                const totalQty = s.qD + s.qA;
                const totalVal = s.vD + s.vA;

                const costDanilo = s.qD > 0 ? (s.vD / s.qD) : 0;
                const costAdriel = s.qA > 0 ? (s.vA / s.qA) : 0;
                const costGlobal = totalQty > 0 ? (totalVal / totalQty) : 0;

                await supabase.from('ingredients').update({
                    stock_danilo: s.qD,
                    stock_adriel: s.qA,
                    cost_danilo: costDanilo,
                    cost_adriel: costAdriel,
                    cost: costGlobal
                }).eq('id', id);
            }
            toast({ title: "Estoques e Custos recalculados com sucesso" });
            fetchData();
            fetchMeta();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro na sincronização", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const normalizeString = (str: string) =>
        str.toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, ' ');

    const formatStatus = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendente';
            case 'approved': return 'Aprovado';
            case 'rejected': return 'Rejeitado';
            case 'edit_requested': return 'Edição Solicitada';
            case 'edit_approved': return 'Edição Autorizada';
            case 'partial': return 'Parcial';
            default: return status;
        }
    };

    const getOrderStatus = (order: PurchaseOrder) => {
        const reqs = order.requests || [];
        if (reqs.length === 0) return { label: 'Vazio', color: 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200', value: 'empty' };

        // Prioridade: Em Edição > Parcial > Pendente > Aprovado > Rejeitado
        const hasEditing = reqs.some(r => ['edit_requested', 'edit_approved'].includes(r.status));

        const allApproved = reqs.every(r => r.status === 'approved');
        const allRejected = reqs.every(r => r.status === 'rejected');
        const allPending = reqs.every(r => r.status === 'pending');

        if (hasEditing) return { label: 'Em Edição', color: 'bg-indigo-100 text-indigo-800 border border-indigo-200', value: 'editing' };
        if (allApproved) return { label: 'Aprovado', color: 'bg-green-100 text-green-800 border border-green-200', value: 'approved' };
        if (allRejected) return { label: 'Rejeitado', color: 'bg-red-100 text-red-800 border border-red-200', value: 'rejected' };
        if (allPending) return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 border border-yellow-200', value: 'pending' };

        // Se tem mistura (aprovado + pendente, ou aprovado + rejeitado) -> Parcial
        return { label: 'Parcial', color: 'bg-orange-100 text-orange-800 border border-orange-200', value: 'partial' };
    };

    const filteredOrders = orders.filter(order => {
        const status = getOrderStatus(order).value;
        if (filterStatus === 'all') return true;
        return status === filterStatus;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Pedidos de Compra</h2>
                    <p className="text-zinc-500">Gerencie e acompanhe as solicitações.</p>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleSyncStock} disabled={loading} className="text-orange-600 border-orange-200">
                            <RotateCcw className="mr-2 h-4 w-4" /> Sync
                        </Button>
                        <Button onClick={() => { setNewOrderNickname(`Compra ${new Date().toLocaleDateString()}`); setIsOrderDialogOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> Novo Pedido
                        </Button>
                    </div>
                    <div className="flex bg-zinc-100 p-1 rounded-lg flex-wrap justify-end">
                        {(['all', 'pending', 'editing', 'approved', 'partial', 'rejected'] as const).map(st => (
                            <button
                                key={st}
                                onClick={() => setFilterStatus(st)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterStatus === st ? 'bg-white shadow text-black' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                                {st === 'all' ? 'Todos' : st === 'pending' ? 'Pendentes' : st === 'editing' ? 'Em Edição' : st === 'approved' ? 'Aprovados' : st === 'partial' ? 'Parciais' : 'Rejeitados'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div> : (
                <div className="space-y-4">
                    {filteredOrders.map(order => (
                        <Card key={order.id} className="overflow-hidden">
                            <div className="flex items-center justify-between p-4 bg-zinc-50/50 cursor-pointer hover:bg-zinc-100/50 transition-colors" onClick={() => toggleOrder(order.id)}>
                                <div className="flex items-center gap-4">
                                    <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                                        {expandedOrders[order.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                    <div>
                                        <h3 className="font-semibold text-lg flex items-center gap-2">
                                            {order.nickname}
                                            <Badge variant="outline" className={`text-[10px] font-normal px-2 ${getOrderStatus(order).color}`}>
                                                {getOrderStatus(order).label}
                                            </Badge>
                                            <span className="text-xs font-normal text-zinc-400">por {profiles[order.created_by] || '...'}</span>
                                        </h3>
                                        <div className="text-sm text-zinc-500 flex gap-4">
                                            <span>{new Date(order.created_at).toLocaleDateString()}</span>
                                            <span>{order.requests?.length || 0} itens</span>
                                            <span className="font-medium text-zinc-700">{formatCurrency(order.requests?.reduce((acc, req) => acc + Number(req.cost), 0) || 0)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                                    {(userRoles.includes('admin') || userRoles.includes('approver')) && (
                                        <>
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleApproveAll(order); }} title="Aprovar Lote Pendente" className="text-green-600 hover:bg-green-50">
                                                <CheckCheck className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => openManageOrder(order)} title="Gerenciar Lote" className="text-blue-500 hover:bg-blue-50">
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteOrder(order.id)} className="text-red-400 hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {expandedOrders[order.id] && (
                                <div className="p-4 pt-0 border-t">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead><TableHead>Qtd</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead>Destino</TableHead><TableHead>Solicitante</TableHead><TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {order.requests?.map(req => (
                                                <TableRow key={req.id}>
                                                    <TableCell className="font-medium">
                                                        {req.item_name}
                                                        {req.change_reason && <div className="text-[10px] text-orange-600 ml-2" title={req.change_reason}>Obs: {req.change_reason}</div>}
                                                    </TableCell>
                                                    <TableCell>{req.quantity} {req.unit}</TableCell>
                                                    <TableCell>{formatCurrency(req.cost)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <Badge className={req.status === 'approved' ? 'bg-green-600' : ''}>{formatStatus(req.status)}</Badge>
                                                            {req.financial_status === 'paid' && <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50 w-fit">PAGO</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="capitalize">{req.destination}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground capitalize">{profiles[req.user_id || ''] || req.requested_by}</TableCell>
                                                    <TableCell className="text-right flex justify-end gap-1 items-center">
                                                        <Button variant="ghost" size="icon" onClick={() => openHistory(req)} title="Histórico"><Clock className="h-3 w-3 text-zinc-400" /></Button>

                                                        {(userRoles.includes('admin') || userRoles.includes('approver')) && req.status === 'pending' && (
                                                            <>
                                                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-green-600" onClick={() => handleApproveItem(req, true)} title="Aprovar"><Check className="h-3 w-3" /></Button>
                                                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600" onClick={() => handleApproveItem(req, false)} title="Rejeitar"><X className="h-3 w-3" /></Button>
                                                            </>
                                                        )}

                                                        {(userRoles.includes('admin') || userRoles.includes('approver')) && req.status === 'edit_requested' && (
                                                            <>
                                                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-blue-600" onClick={() => handleAuthorizeEdit(req, true)} title="Autorizar Edição"><Check className="h-3 w-3" /></Button>
                                                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-zinc-400" onClick={() => handleAuthorizeEdit(req, false)} title="Negar Edição"><X className="h-3 w-3" /></Button>
                                                            </>
                                                        )}

                                                        {(userRoles.includes('buyer') || userRoles.includes('admin')) && req.status === 'approved' && (
                                                            <Button size="sm" variant="ghost" onClick={() => handleRequestEdit(req)} title="Solicitar Edição"><Pencil className="h-3 w-3" /></Button>
                                                        )}

                                                        {(userRoles.includes('buyer') || userRoles.includes('admin')) && req.status === 'edit_approved' && (
                                                            <div className="flex gap-1">
                                                                <Button size="sm" variant="ghost" onClick={() => openEditItem(req)} title="Editar Agora"><Pencil className="h-3 w-3 text-orange-500" /></Button>
                                                                <Button size="sm" variant="outline" className="text-[10px] h-6 px-1" onClick={() => handleSendToApproval(req)}>Enviar p/ Aprovação</Button>
                                                            </div>
                                                        )}

                                                        {(userRoles.includes('buyer') || userRoles.includes('admin')) && req.status === 'pending' && (
                                                            <Button size="sm" variant="ghost" onClick={() => openEditItem(req)}><Pencil className="h-3 w-3" /></Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal: New Order */}
            <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Novo Pedido</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Fornecedor</Label>
                                <div className="flex gap-2">
                                    <Select value={newOrderSupplier} onValueChange={(val) => {
                                        setNewOrderSupplier(val);
                                        if (val !== 'default') {
                                            const sup = suppliers.find(s => s.id === val);
                                            if (sup) setNewOrderNickname(`${sup.name} - ${new Date().toLocaleDateString()}`);
                                        } else {
                                            setNewOrderNickname(`Compra - ${new Date().toLocaleDateString()}`);
                                        }
                                    }}>
                                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger> <SelectContent><SelectItem value="default">Vários</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button variant="outline" size="icon" onClick={() => setIsSupplierDialogOpen(true)} title="Novo Fornecedor">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 px-1">
                            <Label>Apelido</Label>
                            <Input value={newOrderNickname} readOnly className="bg-zinc-100 text-zinc-500" />
                        </div>
                        <div className="border rounded p-4 bg-zinc-50 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                                <div className="col-span-2 md:col-span-3">
                                    <Label className="text-[10px]">Produto</Label>
                                    <div className="flex items-center gap-1">
                                        <Select value={draftItem.ingredient_id || "custom"} onValueChange={(val) => {
                                            if (val === 'custom') setDraftItem({ ...draftItem, ingredient_id: undefined, item_name: '' });
                                            else {
                                                const i = ingredients.find(x => x.id === val);
                                                setDraftItem({ ...draftItem, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                            }
                                        }}>
                                            <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="custom">Outro</SelectItem>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsProductDialogOpen(true)} title="Cadastrar Novo Ingrediente"><Plus className="h-3 w-3" /></Button>
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Unid. Selecionada</Label>
                                    <Select
                                        value={draftItem.unit || 'un'}
                                        onValueChange={(val) => setDraftItem({ ...draftItem, unit: val })}
                                    >
                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {(() => {
                                                const ing = ingredients.find(i => i.id === draftItem.ingredient_id);
                                                if (!ing) return <SelectItem value="un">un</SelectItem>;
                                                return (
                                                    <>
                                                        <SelectItem value={ing.unit}>Estoque ({ing.unit})</SelectItem>
                                                        {ing.purchase_unit && <SelectItem value={ing.purchase_unit}>Compra ({ing.purchase_unit})</SelectItem>}
                                                    </>
                                                );
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Destino</Label>
                                    <Select value={draftItem.destination} onValueChange={(val: any) => setDraftItem({ ...draftItem, destination: val })}>
                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="danilo">Danilo</SelectItem>
                                            <SelectItem value="adriel">Adriel</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-2 md:col-span-2">
                                    <Label className="text-[10px]">Marca/Ref</Label>
                                    <Input className="h-8" placeholder="Ex: Marca" value={draftItem.item_name} onChange={e => setDraftItem({ ...draftItem, item_name: e.target.value })} />
                                </div>
                                <div className="col-span-1 md:col-span-1">
                                    <Label className="text-[10px]">Qtd</Label>
                                    <Input className="h-8" type="number" placeholder="Qtd" value={draftItem.quantity || ''} onChange={e => setDraftItem({ ...draftItem, quantity: Number(e.target.value) })} />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Total (R$)</Label>
                                    <Input className="h-8" type="number" placeholder="R$" value={draftItem.cost || ''} onChange={e => setDraftItem({ ...draftItem, cost: Number(e.target.value) })} />
                                </div>
                                <div className="col-span-2 md:col-span-1"><Button onClick={addItemToDraft} size="sm" className="h-8 w-full md:w-8 px-2 md:p-0"><Plus className="h-4 w-4 mx-auto" /></Button></div>
                            </div>
                        </div>
                        <div className="max-h-[200px] overflow-auto border bg-white rounded">
                            <Table><TableBody>{orderItems.map((i, x) => <TableRow key={x}><TableCell>{i.item_name}</TableCell><TableCell>{i.quantity} {i.unit}</TableCell><TableCell>{i.cost}</TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => removeItemFromDraft(x)}><Trash2 className="h-3 w-3 text-red-400" /></Button></TableCell></TableRow>)}</TableBody></Table>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveOrder} disabled={isSavingOrder}>Salvar Pedido</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: MANAGE ORDER */}
            <Dialog open={isManageOrderOpen} onOpenChange={setIsManageOrderOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Gerenciar Lote / Pedido</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-6">
                        <div className="grid grid-cols-2 gap-4 border-b pb-4">
                            <div className="space-y-2">
                                <Label>Fornecedor</Label>
                                <div className="flex gap-2">
                                    <Select value={manageOrderData.supplier_id} onValueChange={(val) => setManageOrderData({ ...manageOrderData, supplier_id: val })}>
                                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="default">Vários</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button variant="outline" size="icon" onClick={() => setIsSupplierDialogOpen(true)} title="Novo Fornecedor">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2"><Label>Apelido</Label><Input value={manageOrderData.nickname} onChange={e => setManageOrderData({ ...manageOrderData, nickname: e.target.value })} /></div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="font-semibold text-sm text-zinc-700">Itens neste Lote ({manageOrderData.items.length})</h4>
                            <div className="border rounded bg-white overflow-hidden max-h-[300px] overflow-y-auto">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qtd</TableHead><TableHead>Custo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {manageOrderData.items.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.item_name}</TableCell>
                                                <TableCell>{item.quantity} {item.unit}</TableCell>
                                                <TableCell>{formatCurrency(item.cost)}</TableCell>
                                                <TableCell>
                                                    {item.financial_status === 'paid' ? <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Pago</Badge> : <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>}
                                                </TableCell>
                                                <TableCell className="text-right flex justify-end gap-1">
                                                    {item.financial_status !== 'paid' && (
                                                        <>
                                                            <Button variant="ghost" size="sm" onClick={() => openEditItem(item)} className="h-6 w-6 p-0 text-blue-500">
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteItemFromOrder(item.id, item.financial_status)} className="h-6 w-6 p-0 text-red-400">
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="pt-4 border-t space-y-3">
                            <h4 className="font-semibold text-sm text-zinc-700">Adicionar Novo Item ao Lote</h4>
                            <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end bg-zinc-50 p-3 rounded border">
                                <div className="col-span-2 md:col-span-3">
                                    <Label className="text-[10px]">Produto</Label>
                                    <div className="flex items-center gap-1">
                                        <Select
                                            value={newItemDraft.ingredient_id || 'custom'}
                                            onValueChange={(val) => {
                                                if (val === 'custom') setNewItemDraft({ ...newItemDraft, ingredient_id: undefined, item_name: '' });
                                                else {
                                                    const i = ingredients.find(x => x.id === val);
                                                    setNewItemDraft({ ...newItemDraft, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="custom">Outro</SelectItem>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsProductDialogOpen(true)}><Plus className="h-3 w-3" /></Button>
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Unid. Selecionada</Label>
                                    <Select
                                        value={newItemDraft.unit || 'un'}
                                        onValueChange={(val) => setNewItemDraft({ ...newItemDraft, unit: val })}
                                    >
                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {(() => {
                                                const ing = ingredients.find(i => i.id === newItemDraft.ingredient_id);
                                                if (!ing) return <SelectItem value="un">un</SelectItem>;
                                                return (
                                                    <>
                                                        <SelectItem value={ing.unit}>Estoque ({ing.unit})</SelectItem>
                                                        {ing.purchase_unit && <SelectItem value={ing.purchase_unit}>Compra ({ing.purchase_unit})</SelectItem>}
                                                    </>
                                                );
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Destino</Label>
                                    <Select value={newItemDraft.destination} onValueChange={(val: any) => setNewItemDraft({ ...newItemDraft, destination: val })}>
                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="danilo">Danilo</SelectItem>
                                            <SelectItem value="adriel">Adriel</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-2 md:col-span-2">
                                    <Label className="text-[10px]">Obs/Marca</Label>
                                    <Input className="h-8" value={newItemDraft.item_name} onChange={e => setNewItemDraft({ ...newItemDraft, item_name: e.target.value })} />
                                </div>
                                <div className="col-span-1 md:col-span-1">
                                    <Label className="text-[10px]">Qtd</Label>
                                    <Input className="h-8" type="number" value={newItemDraft.quantity || ''} onChange={e => setNewItemDraft({ ...newItemDraft, quantity: Number(e.target.value) })} />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <Label className="text-[10px]">Total (R$)</Label>
                                    <Input className="h-8" type="number" value={newItemDraft.cost || ''} onChange={e => setNewItemDraft({ ...newItemDraft, cost: Number(e.target.value) })} />
                                </div>
                                <div className="col-span-2 md:col-span-1"><Button onClick={handleAddItemToExistingOrder} size="sm" className="h-8 w-full md:w-8 px-2 md:p-0" title="Adicionar ao lote"><Plus className="h-4 w-4 mx-auto" /></Button></div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsManageOrderOpen(false)}>Fechar</Button>
                        <Button onClick={saveManageOrderHeader}>Salvar Cabeçalho</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: Edit Request */}
            <Dialog open={isEditRequestOpen} onOpenChange={setIsEditRequestOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Solicitar Edição</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <Label>Motivo da alteração</Label>
                        <Textarea
                            placeholder="Descreva por que este item precisa ser alterado..."
                            value={editReason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditRequestOpen(false)}>Cancelar</Button>
                        <Button onClick={submitEditRequest} disabled={!editReason.trim()}>Enviar Solicitação</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: Edit Item */}
            <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar Item</DialogTitle></DialogHeader>
                    {editingItem && (
                        <div className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label>Nome / Marca</Label>
                                <Label>Item (Estoque)</Label>
                                <Select value={editedValues.ingredient_id || 'custom'} onValueChange={(val) => {
                                    if (val !== 'custom') {
                                        const i = ingredients.find(x => x.id === val);
                                        setEditedValues({ ...editedValues, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                    }
                                }}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o produto..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="custom" disabled>Selecione um produto da lista</SelectItem>
                                        {ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Unidade</Label>
                                    <Select value={editedValues.unit} onValueChange={(v) => setEditedValues({ ...editedValues, unit: v })} disabled>
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="un">un</SelectItem>
                                            <SelectItem value="g">g</SelectItem>
                                            <SelectItem value="ml">ml</SelectItem>
                                            <SelectItem value="kg">kg</SelectItem>
                                            <SelectItem value="l">l</SelectItem>
                                            <SelectItem value="Caixa">Caixa</SelectItem>
                                            <SelectItem value="Fardo">Fardo</SelectItem>
                                            <SelectItem value="Pacote">Pacote</SelectItem>
                                            {/* Add dynamic purchase unit from ingredient if found? Hard to get here without fetching. */}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Quantidade</Label>
                                    <Input type="number" value={editedValues.quantity || ''} onChange={(e) => setEditedValues({ ...editedValues, quantity: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Custo Total R$</Label>
                                    <Input type="number" value={editedValues.cost || ''} onChange={(e) => setEditedValues({ ...editedValues, cost: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Estoque de Destino (Para onde vai?)</Label>
                                <Select value={editedValues.destination} onValueChange={(v: any) => setEditedValues({ ...editedValues, destination: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="danilo">Danilo</SelectItem>
                                        <SelectItem value="adriel">Adriel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editingItem.status === 'edit_approved' && (
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                                    <strong>Atenção:</strong> Ao salvar, o estoque será revertido e o item voltará para aprovação.
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditItemOpen(false)}>Cancelar</Button>
                        <Button onClick={saveEditItem}>Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: History */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Histórico de Alterações</DialogTitle></DialogHeader>
                    <div className="py-4">
                        {historyLogs.length === 0 ? (
                            <p className="text-center text-zinc-500 py-8">Nenhuma alteração registrada para este item.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Usuário</TableHead>
                                        <TableHead>Motivo</TableHead>
                                        <TableHead>Alteração</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs">{new Date(log.changed_at).toLocaleString()}</TableCell>
                                            <TableCell className="text-xs">{profiles[log.changed_by || ''] || '...'}</TableCell>
                                            <TableCell className="text-xs font-medium">{log.change_reason}</TableCell>
                                            <TableCell className="text-xs">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-red-500 line-through">{log.old_value}</span>
                                                    <span className="text-green-600">{log.new_value}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal: Quick Product Creation */}
            <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <DialogContent className="overflow-visible">
                    <DialogHeader><DialogTitle>Cadastrar Novo Produto</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Nome do Produto</Label>
                            <Input value={newProduct.name || ''} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Ex: Fita de Cetim" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Categoria</Label>
                                <div className="relative">
                                    <Input
                                        list="new-prod-categories"
                                        value={newProduct.category || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        placeholder="Selecione ou digite..."
                                    />
                                    <datalist id="new-prod-categories">
                                        <option value="Laticínios" />
                                        <option value="Secos" />
                                        <option value="Embalagens" />
                                        <option value="Outros" />
                                    </datalist>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Unidade Principal</Label>
                                <div className="relative">
                                    <Input
                                        list="new-prod-units"
                                        value={newProduct.unit || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                                        className="uppercase"
                                        placeholder="Ex: UN"
                                    />
                                    <datalist id="new-prod-units">
                                        <option value="UN" />
                                        <option value="LATA" />
                                        <option value="CX" />
                                        <option value="KG" />
                                        <option value="L" />
                                    </datalist>
                                </div>
                            </div>
                        </div>

                        {/* Conversão Opcional */}
                        <div className="border rounded-md p-3 bg-zinc-50 space-y-3">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="new-prod-conversion"
                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                    checked={!!newProduct.unit_type}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setNewProduct({ ...newProduct, unit_weight: 0, unit_type: 'g' });
                                        } else {
                                            setNewProduct({ ...newProduct, unit_weight: 1, unit_type: '' });
                                        }
                                    }}
                                />
                                <Label htmlFor="new-prod-conversion" className="text-sm font-medium cursor-pointer">
                                    Habilitar conversão secundária (Receita)
                                </Label>
                            </div>

                            {(!!newProduct.unit_type) && (
                                <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="col-span-1 space-y-1">
                                        <Label className="text-[10px]">Unid. Secundária</Label>
                                        <Input
                                            list="new-prod-sec-units"
                                            value={newProduct.unit_type || ''}
                                            onChange={(e) => setNewProduct({ ...newProduct, unit_type: e.target.value })}
                                            className="h-8 text-xs"
                                            placeholder="g, ml..."
                                        />
                                        <datalist id="new-prod-sec-units">
                                            <option value="g" />
                                            <option value="ml" />
                                            <option value="fatias" />
                                            <option value="un" />
                                        </datalist>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-[10px]">Fator de Conversão</Label>
                                        <Input
                                            type="number"
                                            value={newProduct.unit_weight || ''}
                                            onChange={(e) => setNewProduct({ ...newProduct, unit_weight: Number(e.target.value) })}
                                            className="h-8 text-xs"
                                            placeholder="Ex: 395"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-[11px] text-zinc-500 bg-white p-2 border rounded text-center italic">
                                            "1 <strong>{newProduct.unit || '...'}</strong> equivale a <strong>{newProduct.unit_weight || '?'} {newProduct.unit_type || '...'}</strong>"
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProductDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveProduct} disabled={!newProduct.name}>Criar Produto</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: Create Supplier */}
            <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Novo Fornecedor</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <Label>Nome do Fornecedor</Label>
                        <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Digite o nome..." />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSupplierDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveSupplier} disabled={!newSupplierName.trim()}>Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Purchases;
