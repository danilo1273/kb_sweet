import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
// Table imports removed as they were unused
import { useToast } from "@/components/ui/use-toast";
import { Plus, Clock, Package, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NewOrderDialog } from "@/components/purchases/NewOrderDialog";
import { ManageOrderDialog } from "@/components/purchases/ManageOrderDialog";

import { EditItemDialog } from "@/components/purchases/EditItemDialog";
import { QuickProductDialog } from "@/components/purchases/QuickProductDialog";
import { CreateSupplierDialog } from "@/components/purchases/CreateSupplierDialog";
import { ManageCategoriesDialog } from "@/components/purchases/ManageCategoriesDialog";
import { ManageUnitsDialog } from "@/components/purchases/ManageUnitsDialog";
import { usePurchases } from "@/hooks/usePurchases";
import { PurchaseOrder, PurchaseRequest, Ingredient, Supplier, Category } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

const Purchases = () => {
    const { toast } = useToast();
    const { orders, loading, fetchOrders, createOrder, deleteOrder, profilesCache } = usePurchases();

    // Meta State (Ingredients, Suppliers, Categories)
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);

    // New Order State
    const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

    // MANAGE ORDER Dialog (New V3.7)
    const [isManageOrderOpen, setIsManageOrderOpen] = useState(false);
    const [isManageOrderReadOnly, setIsManageOrderReadOnly] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const selectedOrder = orders.find(o => o.id === selectedOrderId) || null;

    // Filter State
    const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending' | 'partial' | 'rejected' | 'editing'>('all');

    // Dialogs

    const [isEditItemOpen, setIsEditItemOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<PurchaseRequest | null>(null);
    const [editedValues, setEditedValues] = useState<{ quantity: number, cost: number, item_name: string, unit: string, ingredient_id?: string, destination: 'danilo' | 'adriel' }>({ quantity: 0, cost: 0, item_name: '', unit: 'un', destination: 'danilo' });
    const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Ingredient>>({ unit: 'un' });

    // New Supplier State
    const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState("");

    // Dynamic Lists
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);

    // Manage Dialogs State
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryType, setNewCategoryType] = useState<'stock' | 'expense'>('stock');
    const [isManageUnitsOpen, setIsManageUnitsOpen] = useState(false);
    const [newUnitName, setNewUnitName] = useState("");

    useEffect(() => {
        fetchOrders();
        fetchMeta();
    }, [fetchOrders]);

    useEffect(() => {
        if (orders.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('openOrder');
            if (orderId) {
                const order = orders.find(o => o.id === orderId);
                if (order) {
                    setSelectedOrderId(orderId);
                    setIsManageOrderOpen(true);
                    setIsManageOrderReadOnly(true);
                }
            }
        }
    }, [orders]);


    async function fetchMeta() {
        const { data: ing } = await supabase.from('ingredients').select('id, name, stock_danilo, stock_adriel, cost, cost_danilo, cost_adriel, unit, purchase_unit, purchase_unit_factor, category, type').order('name');
        if (ing) setIngredients(ing as Ingredient[]);
        const { data: sup } = await supabase.from('suppliers').select('id, name').order('name');
        if (sup) setSuppliers(sup);

        // Fetch Categories
        const { data: catData } = await supabase.from('custom_categories').select('*').order('name');
        if (catData) {
            setAvailableCategories(catData.map((d: any) => ({
                id: d.id,
                name: d.name,
                type: d.type || 'stock'
            })));
        }

        // Fetch Units
        const { data: unitData } = await supabase.from('custom_units').select('name').order('name');
        if (unitData) {
            setAvailableUnits(unitData.map(d => d.name.toLowerCase()));
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
            const { data: profile } = await supabase.from('profiles').select('roles').eq('id', user.id).single();
            if (profile && profile.roles) {
                setCurrentUserRoles(profile.roles);
            }
        }
    }

    async function handleAddCategory() {
        if (!newCategoryName) return;
        const name = newCategoryName.trim();
        const { error } = await supabase.from('custom_categories').insert({ name, type: newCategoryType });
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Categoria adicionada!" });
            fetchMeta();
        }
        setNewCategoryName("");
    }

    async function handleDeleteCategory(name: string) {
        if (!confirm(`Remover categoria "${name}"?`)) return;
        const { error } = await supabase.from('custom_categories').delete().eq('name', name);
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Categoria removida" });
            fetchMeta();
        }
    }

    async function handleAddUnit() {
        if (!newUnitName) return;
        const norm = newUnitName.toLowerCase().trim();
        const { error } = await supabase.from('custom_units').insert({ name: norm });
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Unidade adicionada!" });
            fetchMeta();
            setNewUnitName("");
        }
    }

    async function handleDeleteUnit(name: string) {
        if (!confirm(`Remover unidade "${name}"?`)) return;
        const { error } = await supabase.from('custom_units').delete().eq('name', name);
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Unidade removida" });
            fetchMeta();
        }
    }

    // --- MANAGE ORDER LOGIC ---
    function openManageOrder(order: PurchaseOrder, readOnly: boolean = false) {
        setSelectedOrderId(order.id);
        setIsManageOrderReadOnly(readOnly);
        setIsManageOrderOpen(true);
    }

    // --- Order Logic ---
    async function handleCreateOrder(nickname: string, supplierId: string, items: any[]) {
        const success = await createOrder(nickname, supplierId, items, currentUserId || '');
        if (success) {
            setIsOrderDialogOpen(false);
            fetchOrders();
        }
    }

    function openEditItem(item: PurchaseRequest) {
        setEditingItem(item);

        let initialIngId = item.ingredient_id;
        // Auto-match by name if ID is missing (fixes "forgotten" links)
        if (!initialIngId && item.item_name) {
            const match = ingredients.find(i => i.name.toLowerCase().trim() === item.item_name?.toLowerCase().trim());
            if (match) initialIngId = match.id;
        }

        setEditedValues({
            quantity: item.quantity,
            cost: item.cost,
            item_name: item.item_name,
            unit: item.unit,
            ingredient_id: initialIngId,
            destination: item.destination || 'danilo'
        });
        setIsEditItemOpen(true);
    }

    async function saveEditItem() {
        if (!editingItem) return;
        try {
            const { error } = await supabase.from('purchase_requests').update({
                quantity: editedValues.quantity,
                cost: editedValues.cost,
                item_name: editedValues.item_name,
                unit: editedValues.unit,
                ingredient_id: editedValues.ingredient_id || null,
                destination: editedValues.destination
            }).eq('id', editingItem.id);

            if (error) throw error;

            toast({ title: "Item atualizado" });
            setIsEditItemOpen(false);
            fetchOrders();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
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
                type: newProduct.type || 'stock',
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
            setNewProduct({ unit: 'UN', type: 'stock' }); // Reset clean
            fetchMeta();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Erro", description: e.message });
        }
    }

    async function handleSaveSupplier() {
        try {
            if (!newSupplierName.trim()) return toast({ variant: 'destructive', title: "Nome obrigatório" });

            const { error } = await supabase.from('suppliers').insert({ name: newSupplierName.trim() }).select().single();
            if (error) throw error;

            toast({ title: "Fornecedor cadastrado" });
            setIsSupplierDialogOpen(false);
            setNewSupplierName("");

            // Refresh suppliers and select the new one if a modal is open
            await fetchMeta();

        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro", description: e.message });
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
        const map: Record<string, string> = {
            'pending': 'Pendente',
            'approved': 'Aprovado',
            'rejected': 'Rejeitado',
            'open': 'Aberto',
            'closed': 'Fechado',
            'edit_requested': 'Edição Solicitada',
            'edit_approved': 'Edição Autorizada',
            'partial': 'Parcial'
        };
        return map[status] || status;
    };

    const getOrderStatus = (order: PurchaseOrder) => {
        // DEBUG: Temporary check for "Compra Teste"
        if (order.nickname === 'Compra Teste') {
            const reqs = order.requests || [];
            const statuses = reqs.map(r => r.status);
            // Uncomment to debug if needed, but for now silent observation or targeted log
            console.log(`DEBUG: Order ${order.nickname}`, { orderStatus: order.status, reqStatuses: statuses });
        }
        // 1. Check Order-Level Status First (New Workflow)
        if (order.status === 'edit_requested') return { label: 'Edição Solicitada', color: 'bg-amber-100 text-amber-800 border-amber-500 border', value: 'editing' };
        if (order.status === 'edit_approved') return { label: 'Edição Liberada', color: 'bg-blue-100 text-blue-800 border-blue-500 border', value: 'editing' };

        const reqs = order.requests || [];
        if (reqs.length === 0) return { label: 'Vazio', color: 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200', value: 'empty' };

        // Prioridade: Em Edição > Parcial > Pendente > Aprovado > Rejeitado
        const hasEditing = reqs.some(r => ['edit_requested', 'edit_approved'].includes(r.status));

        const allApproved = reqs.every(r => r.status === 'approved');
        const allRejected = reqs.every(r => r.status === 'rejected');
        const allPending = reqs.every(r => r.status === 'pending');

        if (hasEditing) return { label: 'Item em Edição', color: 'bg-indigo-100 text-indigo-800 border border-indigo-200', value: 'editing' };
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
                        <Button onClick={() => setIsOrderDialogOpen(true)} variant="gradient">
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
                                {st === 'all' ? 'Todos' : st === 'pending' ? 'Pendentes' : st === 'editing' ? 'Solic. Edição' : st === 'approved' ? 'Aprovados' : st === 'partial' ? 'Parciais' : 'Rejeitados'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
            ) : filteredOrders.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title="Nenhum pedido encontrado"
                    description={
                        filterStatus !== 'all'
                            ? `Não há pedidos com o status "${{
                                'pending': 'Pendente',
                                'approved': 'Aprovado',
                                'rejected': 'Rejeitado',
                                'open': 'Aberto',
                                'closed': 'Fechado',
                                'edit_requested': 'Edição Solicitada',
                                'edit_approved': 'Edição Autorizada',
                                'partial': 'Parcial',
                                'editing': 'Em Edição'
                            }[filterStatus] || filterStatus}".`
                            : "Comece criando um novo pedido de compra."
                    }
                    actionLabel="Novo Pedido"
                    onAction={() => setIsOrderDialogOpen(true)}
                    actionVariant="gradient"
                    className="border-2 border-dashed border-zinc-200 bg-transparent shadow-none"
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <AnimatePresence>
                        {filteredOrders.map(order => {
                            const status = getOrderStatus(order);
                            return (
                                <motion.div
                                    key={order.id}
                                    layoutId={order.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    whileHover={{ scale: 1.02 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Card
                                        className="p-4 hover:shadow-lg transition-shadow cursor-pointer relative overflow-hidden group border-zinc-200"
                                        onClick={() => openManageOrder(order)}
                                    >
                                        <div className={`absolute top-0 left-0 w-1 h-full ${status.value === 'approved' ? 'bg-green-500' : status.value === 'pending' ? 'bg-yellow-500' : status.value === 'rejected' ? 'bg-red-500' : status.value === 'editing' ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                                        <div className="flex justify-between items-start mb-2 pl-3">
                                            <div>
                                                <h3 className="font-bold text-lg">{order.nickname}</h3>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                    <span>•</span>
                                                    <span>{profilesCache[order.created_by] || '...'}</span>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className={status.color}>{status.label}</Badge>
                                        </div>

                                        <div className="pl-3 mt-4 flex justify-between items-end">
                                            <div>
                                                <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Total estimado</p>
                                                <p className="text-xl font-bold text-zinc-900">{formatCurrency(order.requests?.reduce((acc, r) => acc + (Number(r.cost) || 0), 0) || 0)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-zinc-400">{order.requests?.length || 0} itens</p>
                                                <div className="mt-1 flex justify-end">
                                                    <span className="text-xs font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-md truncate max-w-[120px]" title={order.supplier_name}>
                                                        {order.supplier_name || 'Fornecedor n/d'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}


            <NewOrderDialog
                isOpen={isOrderDialogOpen}
                onOpenChange={setIsOrderDialogOpen}
                suppliers={suppliers}
                ingredients={ingredients}
                onNewSupplier={() => setIsSupplierDialogOpen(true)}
                onNewProduct={() => setIsProductDialogOpen(true)}
                onCreate={handleCreateOrder}
            />

            <ManageOrderDialog
                isOpen={isManageOrderOpen}
                onOpenChange={setIsManageOrderOpen}
                isReadOnly={isManageOrderReadOnly}
                order={selectedOrder}
                suppliers={suppliers}
                ingredients={ingredients}
                onNewSupplier={() => setIsSupplierDialogOpen(true)}
                onNewProduct={() => setIsProductDialogOpen(true)}
                formatCurrency={formatCurrency}
                formatStatus={formatStatus}
                onEditItem={openEditItem}
                currentUserRoles={currentUserRoles}
                currentUserId={currentUserId || ''}
                onDeleteOrder={async (id) => {
                    const success = await deleteOrder(id);
                    if (success) setIsManageOrderOpen(false);
                }}
                onOrderUpdated={fetchOrders}
            />

            <EditItemDialog
                isOpen={isEditItemOpen}
                onOpenChange={setIsEditItemOpen}
                editingItem={editingItem}
                editedValues={editedValues}
                onEditedValuesChange={setEditedValues}
                ingredients={ingredients}
                availableUnits={availableUnits}
                onSave={saveEditItem}
            />

            <QuickProductDialog
                isOpen={isProductDialogOpen}
                onOpenChange={setIsProductDialogOpen}
                newProduct={newProduct}
                onNewProductChange={setNewProduct}
                availableCategories={availableCategories}
                availableUnits={availableUnits}
                onManageCategories={() => setIsManageCategoriesOpen(true)}
                onManageUnits={() => setIsManageUnitsOpen(true)}
                onSave={handleSaveProduct}
            />

            <CreateSupplierDialog
                isOpen={isSupplierDialogOpen}
                onOpenChange={setIsSupplierDialogOpen}
                supplierName={newSupplierName}
                onSupplierNameChange={setNewSupplierName}
                onSave={handleSaveSupplier}
            />

            <ManageCategoriesDialog
                isOpen={isManageCategoriesOpen}
                onOpenChange={setIsManageCategoriesOpen}
                newCategoryName={newCategoryName}
                onNewCategoryNameChange={setNewCategoryName}
                newCategoryType={newCategoryType}
                onNewCategoryTypeChange={setNewCategoryType as any}
                onAddCategory={handleAddCategory}
                availableCategories={availableCategories}
                onDeleteCategory={handleDeleteCategory}
            />

            <ManageUnitsDialog
                isOpen={isManageUnitsOpen}
                onOpenChange={setIsManageUnitsOpen}
                newUnitName={newUnitName}
                onNewUnitNameChange={setNewUnitName}
                onAddUnit={handleAddUnit}
                availableUnits={availableUnits}
                onDeleteUnit={handleDeleteUnit}
            />
        </div>
    );
}

export default Purchases;
