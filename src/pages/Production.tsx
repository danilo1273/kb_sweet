
import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Box, Layers, CheckCircle2, Factory, History, PlayCircle, Trash2, Edit, ClipboardList } from "lucide-react";
import { ProductionPlanningDialog } from "@/components/production/ProductionPlanningDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// --- Types ---

interface Product {
    id: string;
    name: string;
    stock_quantity: number;
    cost: number;
    type: 'finished' | 'intermediate';
    batch_size?: number;
    unit?: string;
    image_url?: string;
    product_stocks?: {
        location_id: string;
        quantity: number;
        average_cost: number;
    }[];
}

interface Ingredient {
    id: string;
    name: string;
    unit: string;
    cost: number;
    unit_weight: number;
    unit_type: string;
    product_stocks?: {
        location_id: string;
        quantity: number;
        average_cost: number;
    }[];
    // Legacy support
    stock_danilo?: number;
    stock_adriel?: number;
    cost_danilo?: number;
    cost_adriel?: number;
}

interface StockLocation {
    id: string;
    name: string;
    slug: string;
}

interface ProductionOrder {
    id: string;
    created_at: string;
    product_id: string;
    quantity: number;
    status: 'open' | 'closed' | 'canceled';
    user_id: string;
    closed_at?: string;
    products?: Product;
    cost_at_production?: number;
    profiles?: { email: string; full_name: string };
    location_id?: string;
    stock_location?: { name: string };
}

interface ProductionOrderItem {
    id: string;
    order_id: string;
    type: 'ingredient' | 'product';
    item_id: string;
    name: string;
    unit: string;
    quantity_planned: number;
    quantity_used: number;
    waste_quantity: number;
    unit_cost: number;
}

interface ProductBOM {
    id: string;
    product_id: string;
    ingredient_id?: string;
    child_product_id?: string;
    quantity: number;
    unit: string;
}

export default function Production() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [currentUserId, setCurrentUserId] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isPlanningDialogOpen, setIsPlanningDialogOpen] = useState(false);
    const [planningOrder, setPlanningOrder] = useState<ProductionOrder | null>(null);
    const [isExecutionDialogOpen, setIsExecutionDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>("");

    // Create Order State
    const [newOrderProduct, setNewOrderProduct] = useState("");
    const [newOrderQuantity, setNewOrderQuantity] = useState(1);

    // Execution State (Wizard)
    const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
    const [orderItems, setOrderItems] = useState<ProductionOrderItem[]>([]);
    const [actualOutputQuantity, setActualOutputQuantity] = useState(0);

    // URL Params for Deep Linking
    const [searchParams] = useSearchParams();
    const openOrderId = searchParams.get('openOrder');

    // Fetch Data
    // Fetch Data
    useEffect(() => {
        fetchInitialData();
        checkUser();
    }, []);

    // Handle Deep Link
    useEffect(() => {
        if (openOrderId) {
            handleDeepLink(openOrderId);
        }
    }, [openOrderId]);

    async function handleDeepLink(id: string) {
        // Fetch specific order if not in list or to be safe
        const { data, error } = await supabase
            .from('production_orders')
            .select('*, products(name, stock_quantity, cost, unit, batch_size, image_url), profiles(email, full_name)')
            .eq('id', id)
            .single();

        if (data && !error) {
            // If closed, switch tab to history for context
            if (data.status === 'closed') setActiveTab('history');
            openExecution(data);
        }
    }

    async function checkUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
            // Check admin role
            const { data: profile } = await supabase.from('profiles').select('roles, role').eq('id', user.id).single();
            if (profile) {
                const roles = profile.roles || (profile.role ? [profile.role] : []);
                if (roles.includes('admin')) setIsAdmin(true);
            }
        }
    }

    // Also refetch orders when tabs change or after ops
    useEffect(() => {
        setOrders([]); // Avoid flashing wrong data
        setLoading(true);
        fetchOrders().finally(() => setLoading(false));
    }, [activeTab]);

    const [boms, setBoms] = useState<ProductBOM[]>([]); // New state

    // ... 

    async function fetchResources() {
        const { data: prods } = await supabase.from('products')
            .select(`
                *,
                product_stocks (
                    quantity,
                    average_cost,
                    location_id
                )
            `)
            .order('name');

        const { data: ings } = await supabase
            .from('ingredients')
            .select(`
                *,
                product_stocks (
                    quantity,
                    average_cost,
                    location_id
                )
            `)
            .eq('is_active', true)
            .order('name');

        const { data: bomData } = await supabase.from('product_bom').select('*');
        const { data: locs } = await supabase.from('stock_locations').select('*').order('created_at');

        if (prods) setProducts(prods);
        if (ings) setIngredients(ings);
        if (bomData) setBoms(bomData);
        if (locs) {
            setStockLocations(locs);
            if (locs.length > 0 && !selectedLocation) {
                // Default to first location or one with 'danilo' slug if exists for compatibility
                const defaultLoc = locs.find(l => l.slug === 'stock-danilo') || locs[0];
                setSelectedLocation(defaultLoc.id);
            }
        }
    }

    async function fetchInitialData() {
        setLoading(true);
        await Promise.all([fetchOrders(), fetchResources()]);
        setLoading(false);
    }

    async function fetchOrders() {
        let query = supabase
            .from('production_orders')
            .select('*, products(name, stock_quantity, cost, unit, batch_size, image_url), profiles(email, full_name), stock_location:stock_locations(name)')
            .order('created_at', { ascending: false });

        if (activeTab === 'open') {
            query = query.neq('status', 'closed').neq('status', 'canceled');
            // Or usually 'open'?
            // Checking previous behavior: often just status=open.
            // But some might be 'in_progress'? 'open' is the enum in DB usually.
            // Wait, previous code had status: 'open' | 'closed' | 'canceled'.
            query = query.eq('status', 'open');
        } else {
            query = query.in('status', ['closed', 'canceled']);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching orders:', error);
            toast({
                title: "Erro",
                description: "Não foi possível carregar as ordens de produção.",
                variant: 'destructive'
            });
        } else {
            setOrders(data as ProductionOrder[]);
        }
    }

    // ... existing functions ...

    // Helper to calculate cost dynamically if stored cost is zero
    function getProductCost(product: Product): number {
        if (product.cost && product.cost > 0) return product.cost;

        // Try to calculate from BOM
        const productBoms = boms.filter(b => b.product_id === product.id);
        if (productBoms.length === 0) return 0;

        let totalRecipeCost = 0;

        productBoms.forEach(bomItem => {
            let itemCost = 0;
            let itemWeight = 1;

            // Handle Ingredient
            if (bomItem.ingredient_id) {
                const ing = ingredients.find(i => i.id === bomItem.ingredient_id);
                if (ing) {
                    // Use fallback cost logic
                    const baseCost = ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0);
                    itemWeight = ing.unit_weight || 1;

                    // Simplified Cost Calc:
                    // If BOM Quantity is relative (e.g. 395g), we multiply by Price/Weight
                    // If BOM Quantity is units (e.g. 1 can), we multiply by Price

                    // HEURISTIC:
                    // If BaseCost is > 1.00 (likely a full unit price)
                    // AND Unit of Ingredient is 'un' or 'cx' or 'lata'
                    // AND BOM Quantity is large (e.g. > 10, implies grams)
                    // THEN divide by weight.

                    // BETTER HEURISTIC (Matches Recipes.tsx / previous logic):
                    // If ing.unit_weight > 0 (meaning it's defined like 395g)
                    // And usage is clearly fractional (g/ml vs un)

                    // For Production execution, we often just want a rough estimate if "Cost" is 0.
                    // Let's reuse the logic from `useMemo`:

                    // Let's reuse the logic from `useMemo`:
                    // let computedUnitCost = baseCost;
                    // if (itemWeight > 0) computedUnitCost = baseCost / itemWeight;

                    // However, we don't know the BOM item UNIT here (it's not in the simple interface?)
                    // DB `product_bom` table has `unit` column? Yes per Step 885.
                    // We can use bomItem.quantity directly if we assume it aligns with cost.

                    // Safest fallback -> Use simple multiplication if weight is 1, else divide?

                    // Let's assume the safest path:
                    // Cost = Qty * (BaseCost / UnitWeight)
                    itemCost = bomItem.quantity * (baseCost / (itemWeight || 1));

                    // Correction: If UnitWeight is 1 or null, we just multiply.
                }
            }
            // Handle Sub-Product
            else if (bomItem.child_product_id) {
                const comp = products.find(p => p.id === bomItem.child_product_id);
                if (comp) {
                    itemCost = getProductCost(comp) * bomItem.quantity;
                }
            }

            totalRecipeCost += itemCost;
        });

        const batchSize = product.batch_size || 1;
        return totalRecipeCost / batchSize;
    }

    const { totalProjectedCost, unitProjectedCost } = useMemo(() => {
        let total = 0;
        if (!selectedOrder) return { totalProjectedCost: 0, unitProjectedCost: 0 };

        orderItems.forEach(item => {
            const qty = (item.quantity_used ?? item.quantity_planned) + (item.waste_quantity || 0);

            // Find cost info
            let cost = 0;
            let unitWeight = 1;

            if (item.type === 'ingredient') {
                const ing = ingredients.find(i => i.id === item.item_id);
                if (ing) {
                    unitWeight = ing.unit_weight || 1;

                    // Try dynamic cost first
                    const stockEntry = ing.product_stocks?.find(s => s.location_id === selectedLocation);
                    let baseCost = (stockEntry?.average_cost && stockEntry.average_cost > 0)
                        ? stockEntry.average_cost
                        : (ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0));

                    if (unitWeight > 0) cost = baseCost / unitWeight;
                    else cost = baseCost;
                }
            } else {
                const prod = products.find(p => p.id === item.item_id);
                if (prod) {
                    // Start with stored cost, fallback to dynamic clac
                    cost = prod.cost || getProductCost(prod);
                }
            }

            total += qty * cost;
        });

        const safeOutput = actualOutputQuantity > 0 ? actualOutputQuantity : (selectedOrder?.quantity || 1);
        return {
            totalProjectedCost: total,
            unitProjectedCost: total / safeOutput
        };

    }, [orderItems, actualOutputQuantity, ingredients, products, selectedOrder, boms, selectedLocation]);



    // --- Actions ---

    async function handleCreateOrder() {
        if (!newOrderProduct) return;
        setIsSaving(true);
        try {
            // Get user session
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não logado");

            // 1. Diagnostic Check: Verify if BOM exists for this product
            const { count: bomCount } = await supabase
                .from('product_bom')
                .select('*', { count: 'exact', head: true })
                .eq('product_id', newOrderProduct);

            if (bomCount === 0) {
                toast({
                    variant: 'destructive',
                    title: "Atenção: Ficha Técnica Vazia",
                    description: "Este produto não possui itens na ficha técnica. A ordem será criada vazia."
                });
            }

            // 2. Execute RPC
            const { data, error } = await supabase.rpc('create_production_order', {
                p_product_id: newOrderProduct,
                p_quantity: newOrderQuantity,
                p_user_id: user.id
            });

            if (error) throw error;

            console.log("RPC Result:", data);

            // 3. Verify RPC Result (if script was updated to return items_created)
            // We cast data to any because the type definition might not include items_created yet
            const rpcResult = data as any;

            if (rpcResult && typeof rpcResult.items_created === 'number' && rpcResult.items_created === 0 && (bomCount || 0) > 0) {
                toast({
                    variant: 'destructive',
                    title: "Erro de Processamento",
                    description: "A receita existe mas os itens não foram copiados. Contate o suporte (Script DB desatualizado)."
                });
            }

            toast({ title: "Ordem Criada", description: "OP iniciada com sucesso. Acesse-a na aba 'Em Aberto'." });
            setIsCreateDialogOpen(false);
            setNewOrderProduct("");
            setNewOrderQuantity(1);
            fetchOrders();
            // Optional: Switch to open tab and maybe open execution dialog immediately
            setActiveTab('open');

        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao criar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function openExecution(order: ProductionOrder) {
        setSelectedOrder(order);
        setIsExecutionDialogOpen(true);
        // Fetch items for this order
        console.log("Fetching items for Order ID:", order.id);
        const { data, error } = await supabase
            .from('production_order_items')
            .select('id, order_id, type, item_id, name, unit, quantity_planned, quantity_used, waste_quantity, unit_cost')
            .eq('order_id', order.id);

        if (error) {
            console.error("Error fetching items:", error);
        }
        console.log("Items found:", data);

        // Pre-fill quantity_used with planned if used is 0 (first time opening)
        const itemsWithUsage = (data || []).map((item: any) => ({
            ...item,
            quantity_used: item.quantity_used > 0 ? item.quantity_used : item.quantity_planned
        }));

        setOrderItems(itemsWithUsage);
        setActualOutputQuantity(order.quantity); // Default to planned
    }



    // Update LOCAL state of item usage
    function updateItemUsage(itemId: string, field: 'quantity_used' | 'waste_quantity', value: number) {
        setOrderItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    }

    // --- Confirmation Dialog State ---
    const [confirmationDialog, setConfirmationDialog] = useState<{
        open: boolean;
        title: string;
        description: string;
        onConfirm: () => Promise<void> | void;
        variant?: 'destructive' | 'default';
        confirmText?: string;
    }>({ open: false, title: '', description: '', onConfirm: () => { } });

    // --- Actions ---

    async function handleAdminAction(action: 'delete' | 'reopen', orderId: string) {
        if (action === 'delete') {
            setConfirmationDialog({
                open: true,
                title: "Excluir Ordem",
                description: "Tem certeza? Esta ação é irreversível e se a ordem estiver FECHADA, o estoque será revertido.",
                variant: 'destructive',
                confirmText: 'Sim, excluir',
                onConfirm: () => executeAdminAction('delete', orderId)
            });
        } else if (action === 'reopen') {
            setConfirmationDialog({
                open: true,
                title: "Reabrir Ordem",
                description: "Reabrir esta ordem? O estoque consumido será devolvido e a ordem ficará 'Aberta' para edição.",
                confirmText: 'Reabrir',
                onConfirm: () => executeAdminAction('reopen', orderId)
            });
        }
    }

    async function executeAdminAction(action: 'delete' | 'reopen', orderId: string) {
        setConfirmationDialog(prev => ({ ...prev, open: false })); // Close dialog

        if (action === 'delete') {
            // Optimistic Update
            setOrders(prev => prev.filter(order => order.id !== orderId));
            const { error } = await supabase.rpc('delete_production_order_secure', { p_order_id: orderId, p_user_id: currentUserId });

            if (error) {
                toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message });
                await fetchOrders();
            } else {
                toast({ title: "Ordem excluída com sucesso" });
                await fetchOrders();
            }
        } else if (action === 'reopen') {
            const { error } = await supabase.rpc('reopen_production_order', { p_order_id: orderId });
            if (error) toast({ variant: 'destructive', title: "Erro ao reabrir", description: error.message });
            else {
                toast({ title: "Ordem reaberta", description: "Agora você pode editá-la na aba 'Em Aberto'." });
                setActiveTab('open');
            }
        }
    }

    function handleCloseOrder() {
        if (!selectedOrder) return;
        setConfirmationDialog({
            open: true,
            title: "Finalizar Produção",
            description: "Isso irá baixar o estoque dos insumos (com conversões seguras) e dar entrada no produto final. Confirmar?",
            confirmText: 'Sim, Finalizar',
            variant: 'default', // Confirm is Green usually, handled by button variant map later or default
            onConfirm: () => executeCloseOrder()
        });
    }

    async function executeCloseOrder() {
        setConfirmationDialog(prev => ({ ...prev, open: false }));
        if (!selectedOrder) return;

        setIsSaving(true);
        try {
            // Get User ID
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Prepare atomic payload
            const itemsPayload = orderItems.map(item => ({
                id: item.id,
                quantity_used: item.quantity_used || 0,
                waste_quantity: item.waste_quantity || 0
            }));

            // Call Secure RPC directly
            const { error } = await supabase.rpc('close_production_order_secure', {
                p_order_id: selectedOrder.id,
                p_items_usage: itemsPayload,
                p_actual_output_quantity: actualOutputQuantity,
                p_location_id: selectedLocation,
                p_user_id: user.id
            });

            if (error) throw error;

            toast({ title: "Produção Concluída!", description: "Estoque atualizado e auditado com sucesso." });
            setIsExecutionDialogOpen(false);
            fetchOrders();

        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro na produção", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Ordens de Produção</h2>
                    <p className="text-zinc-500">Planejamento e controle de fábrica.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => {
                        setPlanningOrder(null);
                        setIsPlanningDialogOpen(true);
                    }} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                        <ClipboardList className="mr-2 h-4 w-4" /> Planejamento
                    </Button>
                    <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-zinc-900 text-white hover:bg-zinc-800">
                        <Plus className="mr-2 h-4 w-4" /> Nova OP
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="open" className="gap-2"><Factory className="h-4 w-4" /> Em Aberto / Execução</TabsTrigger>
                    <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" /> Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                    {activeTab === 'open' && (
                        <>
                            <div className="md:hidden space-y-3 p-1">
                                {orders.length === 0 ? (
                                    <div className="text-center py-8 text-zinc-500">Nenhuma produção em andamento.</div>
                                ) : (
                                    orders.map(order => (
                                        <div key={order.id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold text-lg text-zinc-900">{order.products?.name}</div>
                                                    <div className="text-xs text-zinc-500">{new Date(order.created_at).toLocaleString()}</div>
                                                </div>
                                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Em Aberto</Badge>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-600">Qtd: <strong>{order.quantity}</strong></span>
                                                <span className="text-zinc-500 text-xs">Por: {order.profiles?.full_name?.split(' ')[0] || '-'}</span>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-2 border-t mt-1">
                                                <Button size="sm" onClick={() => openExecution(order)} className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">
                                                    <PlayCircle className="mr-2 h-3 w-3" /> Executar
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="hidden md:block bg-white rounded-lg border shadow-sm items-center">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-zinc-50/50">
                                            <TableHead className="w-[80px]">Imagem</TableHead>
                                            <TableHead>Data Criação</TableHead>
                                            <TableHead>Produto</TableHead>
                                            <TableHead>Criado Por</TableHead>
                                            <TableHead className="text-center">Qtd</TableHead>
                                            <TableHead className="text-center">Status</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center py-12 text-zinc-500">Nenhuma produção em andamento.</TableCell></TableRow>
                                        ) : (
                                            orders.map(order => (
                                                <TableRow key={order.id} className="hover:bg-zinc-50 transition-colors">
                                                    <TableCell>
                                                        <div className="h-12 w-12 rounded-md bg-zinc-100 border overflow-hidden flex items-center justify-center">
                                                            {order.products?.image_url ? (
                                                                <img src={order.products.image_url} alt={order.products.name} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <Layers className="h-6 w-6 text-zinc-300" />
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-zinc-700">{new Date(order.created_at).toLocaleDateString()}</span>
                                                            <span className="text-xs text-zinc-400">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="font-semibold text-zinc-900 block max-w-[300px] truncate" title={order.products?.name}>
                                                            {order.products?.name}
                                                        </span>
                                                        {order.products?.unit && <span className="text-xs text-zinc-500 uppercase">{order.products.unit}</span>}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-500 text-sm">
                                                        {order.profiles?.full_name?.split(' ')[0] || order.profiles?.email?.split('@')[0] || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary" className="text-base font-mono px-3 py-1">
                                                            {order.quantity}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 shadow-none font-medium">
                                                            Em Aberto
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button size="sm" variant="ghost" className="h-9 w-9 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 p-0 rounded-full" onClick={() => {
                                                                setPlanningOrder(order);
                                                                setIsPlanningDialogOpen(true);
                                                            }} title="Analisar Disponibilidade">
                                                                <ClipboardList className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="sm" onClick={() => openExecution(order)} className="bg-blue-600 hover:bg-blue-700 shadow-sm transition-all active:scale-95">
                                                                <PlayCircle className="mr-2 h-4 w-4" /> Executar
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-zinc-400 hover:text-red-600 hover:bg-red-50 h-9 w-9 p-0 rounded-full" title="Cancelar Ordem">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </TabsContent>

                <TabsContent value="history">
                    {activeTab === 'history' && (
                        <>
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                                </div>
                            ) : (
                                <>
                                    <div className="md:hidden space-y-3 p-1">
                                        {orders.length === 0 ? (
                                            <div className="text-center py-8 text-zinc-500">Histórico vazio.</div>
                                        ) : (
                                            orders.map(order => (
                                                <div key={order.id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-bold text-lg text-zinc-900">{order.products?.name}</div>
                                                            <div className="text-xs text-zinc-500 flex items-center gap-2">
                                                                <span>Fechado em: {order.closed_at ? new Date(order.closed_at).toLocaleDateString() : '-'}</span>
                                                                {order.stock_location?.name && (
                                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-zinc-50">
                                                                        {order.stock_location.name}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Badge variant={order.status === 'closed' ? 'default' : 'secondary'} className={order.status === 'closed' ? 'bg-green-600' : ''}>
                                                            {order.status === 'closed' ? 'Concluído' : order.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-sm bg-zinc-50 p-2 rounded">
                                                        <div>
                                                            <span className="text-xs text-zinc-500">Qtd Produzida</span>
                                                            <div className="font-medium">{order.quantity} {order.products?.unit || 'un'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-xs text-zinc-500">Custo Total</span>
                                                            <div className="font-bold text-green-700">R$ {order.quantity > 0 && order.cost_at_production ? (order.cost_at_production * order.quantity).toFixed(2) : '0.00'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2 border-t mt-1">
                                                        <Button variant="outline" size="sm" onClick={() => handleAdminAction('reopen', order.id)} className="h-8 text-xs">
                                                            <Edit className="h-3 w-3 mr-1" /> Corrigir
                                                        </Button>
                                                        {isAdmin && (
                                                            <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="hidden md:block bg-white rounded-lg border shadow-sm">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Data Fechamento</TableHead>
                                                    <TableHead>Produto</TableHead>
                                                    <TableHead>Local</TableHead>
                                                    <TableHead>Criado Por</TableHead>
                                                    <TableHead>Qtd Produzida</TableHead>
                                                    <TableHead>Custo Total</TableHead>
                                                    <TableHead>Custo Unitário</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {orders.length === 0 ? (
                                                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-zinc-500">Histórico vazio.</TableCell></TableRow>
                                                ) : (
                                                    orders.map(order => (
                                                        <TableRow key={order.id}>
                                                            <TableCell>{order.closed_at ? new Date(order.closed_at).toLocaleString() : '-'}</TableCell>
                                                            <TableCell className="font-medium">{order.products?.name}</TableCell>
                                                            <TableCell>
                                                                {order.stock_location?.name ? (
                                                                    <Badge variant="outline" className="bg-zinc-50 font-normal">{order.stock_location.name}</Badge>
                                                                ) : '-'}
                                                            </TableCell>
                                                            <TableCell className="text-zinc-500">
                                                                {order.profiles?.full_name?.split(' ')[0] || order.profiles?.email?.split('@')[0] || '-'}
                                                            </TableCell>
                                                            <TableCell>{order.quantity} {order.products?.unit || 'un'}</TableCell>
                                                            <TableCell>R$ {order.quantity > 0 && order.cost_at_production ? (order.cost_at_production * order.quantity).toFixed(2) : '0.00'}</TableCell>
                                                            <TableCell className="text-zinc-500 font-mono">
                                                                R$ {order.cost_at_production?.toFixed(2) || '0.00'}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={order.status === 'closed' ? 'default' : 'secondary'} className={order.status === 'closed' ? 'bg-green-600 hover:bg-green-700' : 'bg-zinc-500'}>
                                                                    {order.status === 'closed' ? 'Concluído' : order.status === 'canceled' ? 'Cancelado' : order.status === 'open' ? 'Em Aberto' : order.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1">
                                                                    <Button variant="outline" size="sm" onClick={() => handleAdminAction('reopen', order.id)} title="Corrigir / Reabrir">
                                                                        <Edit className="h-3 w-3 mr-1" /> Corrigir
                                                                    </Button>
                                                                    {isAdmin && (
                                                                        <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0" title="Excluir (Reverter Estoque)">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>

            {/* DIALOG: CREATE OP */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Planejar Nova Produção</DialogTitle>
                        <DialogDescription>Abre uma nova OP sem baixar estoque imediatamente.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Produto</Label>
                            <Select onValueChange={(val) => {
                                setNewOrderProduct(val);
                                const prod = products.find(p => p.id === val);
                                if (prod) {
                                    setNewOrderQuantity(prod.batch_size || 1);
                                }
                            }}>
                                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Quantidade a Produzir</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    min={0.1}
                                    step="0.1"
                                    value={newOrderQuantity}
                                    onChange={e => setNewOrderQuantity(Number(e.target.value))}
                                    className="pr-16"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500 bg-zinc-50 px-3 border-l rounded-r-md">
                                    {products.find(p => p.id === newOrderProduct)?.unit || 'un'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateOrder} disabled={!newOrderProduct || isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar OP
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOG: EXECUTION WIZARD */}
            <Dialog open={isExecutionDialogOpen} onOpenChange={setIsExecutionDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Factory className="h-5 w-5 text-blue-600" />
                            Executar OP: <span className="text-zinc-500 font-normal">{selectedOrder?.products?.name} (Qtd: {selectedOrder?.quantity})</span>
                            {selectedOrder?.status === 'closed' && <Badge variant="secondary">Visualização (Encerrado)</Badge>}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedOrder?.status === 'closed'
                                ? "Detalhes da produção finalizada e insumos utilizados."
                                : "Confirme os insumos utilizados e aponte desperdícios antes de finalizar."
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-6">
                        {/* Wrapper para Tabela (Desktop) e Cards (Mobile) */}
                        <div className="max-h-[400px] overflow-auto border rounded-md">
                            {/* Desktop View: Table */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="w-24">Unid.</TableHead>
                                            <TableHead className="w-24 text-zinc-600">Estoque</TableHead>
                                            <TableHead className="w-32">Planejado</TableHead>
                                            <TableHead className="w-32">Qtd. Real</TableHead>
                                            <TableHead className="w-32 text-amber-600">Desperdício</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orderItems.map(item => {
                                            const stockInfo = item.type === 'ingredient'
                                                ? ingredients.find(i => i.id === item.item_id)
                                                : products.find(p => p.id === item.item_id);

                                            let currentStock = 0;
                                            let stockUnit = '-';
                                            let unitWeight = 1;
                                            let unitType = '';

                                            // Determine Closure Status
                                            const isClosed = selectedOrder?.status === 'closed';

                                            if (stockInfo) {
                                                // Dynamic Stock Logic
                                                const stockEntry = stockInfo.product_stocks?.find(s => s.location_id === selectedLocation);

                                                if (stockEntry) {
                                                    currentStock = stockEntry.quantity;
                                                    stockUnit = stockInfo.unit || 'un';
                                                    if ('unit_weight' in stockInfo) {
                                                        unitWeight = stockInfo.unit_weight || 1;
                                                        unitType = stockInfo.unit_type || '';
                                                    }
                                                } else {
                                                    // Fallback for Legacy Columns
                                                    const loc = stockLocations.find(l => l.id === selectedLocation);
                                                    if (loc?.slug === 'stock-danilo') {
                                                        currentStock = (stockInfo as any).stock_danilo || 0;
                                                        // Fallback cost if needed? not for quantity check
                                                    } else if (loc?.slug === 'stock-adriel') {
                                                        currentStock = (stockInfo as any).stock_adriel || 0;
                                                    } else {
                                                        currentStock = 0;
                                                    }
                                                }
                                            }

                                            // Robust Conversion & Unit Determination
                                            const stockUnitLower = stockUnit?.toLowerCase();

                                            // Priority: 1. Ingredient's Secondary Unit (unit_type) 2. Recipe's Unit 3. Default 'un'
                                            let consumptionUnit = (unitType || item.unit || 'un').toLowerCase();

                                            // Specialized override: if stock is 'un' but we have a weight factor and a target type like 'g'
                                            if (stockUnitLower === 'un' && unitWeight > 1 && unitType && item.unit?.toLowerCase() === 'un') {
                                                consumptionUnit = unitType.toLowerCase();
                                            }

                                            let displayStock = currentStock;

                                            // Apply Conversion Factor
                                            if ((stockUnitLower === 'un' || stockUnitLower === 'saco') && (consumptionUnit === 'g' || consumptionUnit === 'ml')) {
                                                displayStock = currentStock * unitWeight;
                                            } else if (stockUnitLower === 'kg' && consumptionUnit === 'g') displayStock = currentStock * 1000;
                                            else if (stockUnitLower === 'g' && consumptionUnit === 'kg') displayStock = currentStock / 1000;
                                            else if (stockUnitLower === 'l' && consumptionUnit === 'ml') displayStock = currentStock * 1000;
                                            else if (stockUnitLower === 'ml' && consumptionUnit === 'l') displayStock = currentStock / 1000;

                                            const realQty = item.quantity_used ?? item.quantity_planned;
                                            const totalNeeded = realQty + (item.waste_quantity || 0);
                                            const isInsufficient = !isClosed && totalNeeded > (displayStock + 0.001);

                                            return (
                                                <TableRow key={item.id} className={isInsufficient ? "bg-red-50/50" : ""}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                {item.type === 'product' ? <Layers className="h-3.5 w-3.5 text-amber-600" /> : <Box className="h-3.5 w-3.5 text-blue-600" />}
                                                                <span className="text-zinc-900">{item.name}</span>
                                                            </div>
                                                            {isInsufficient && (
                                                                <span className="text-[10px] text-red-600 font-bold mt-0.5">
                                                                    Saldo Insuficiente! (Faltam {(totalNeeded - displayStock).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{consumptionUnit})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-zinc-500 font-medium uppercase text-center">{consumptionUnit}</TableCell>
                                                    <TableCell className="text-xs font-mono">
                                                        <div className="flex flex-col">
                                                            <span className={cn("font-bold", isInsufficient ? "text-red-600" : "text-zinc-700")}>
                                                                {displayStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {consumptionUnit}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-400">
                                                                Estoque: {currentStock} {stockUnit}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium text-zinc-700">
                                                        {Number(item.quantity_planned).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <span className="text-zinc-400 text-[10px] uppercase">{consumptionUnit}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5">
                                                            <Input
                                                                type="number"
                                                                disabled={isClosed}
                                                                className={cn(
                                                                    "h-9 w-24 text-center font-medium",
                                                                    isInsufficient ? "border-red-300 bg-red-50 focus-visible:ring-red-500" : "bg-white"
                                                                )}
                                                                value={item.quantity_used ?? item.quantity_planned}
                                                                onChange={e => updateItemUsage(item.id, 'quantity_used', Number(e.target.value))}
                                                            />
                                                            <span className="text-[10px] text-zinc-400 font-bold uppercase">{consumptionUnit}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5">
                                                            <Input
                                                                type="number"
                                                                disabled={isClosed}
                                                                className="h-9 w-24 border-amber-200 focus:ring-amber-500 text-center font-medium bg-amber-50/10 placeholder:text-amber-300"
                                                                value={item.waste_quantity || ''}
                                                                onChange={e => updateItemUsage(item.id, 'waste_quantity', Number(e.target.value))}
                                                                placeholder="0"
                                                            />
                                                            <span className="text-[10px] text-zinc-400 font-bold uppercase">{consumptionUnit}</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Mobile View: Cards */}
                            <div className="md:hidden space-y-4 p-2 bg-zinc-50/50">
                                {orderItems.map(item => {
                                    const stockInfo = item.type === 'ingredient'
                                        ? ingredients.find(i => i.id === item.item_id)
                                        : products.find(p => p.id === item.item_id);

                                    let currentStock = 0;
                                    let stockUnit = '-';
                                    let unitWeight = 1;
                                    let unitType = '';

                                    if (stockInfo) {
                                        // Dynamic Stock Logic
                                        const stockEntry = stockInfo.product_stocks?.find(s => s.location_id === selectedLocation);

                                        if (stockEntry) {
                                            currentStock = stockEntry.quantity;
                                            stockUnit = stockInfo.unit || 'un';
                                            if ('unit_weight' in stockInfo) {
                                                unitWeight = stockInfo.unit_weight || 1;
                                                unitType = stockInfo.unit_type || '';
                                            }
                                        } else {
                                            // Fallback for Legacy Columns
                                            const loc = stockLocations.find(l => l.id === selectedLocation);
                                            if (loc?.slug === 'stock-danilo') {
                                                currentStock = (stockInfo as any).stock_danilo || 0;
                                            } else if (loc?.slug === 'stock-adriel') {
                                                currentStock = (stockInfo as any).stock_adriel || 0;
                                            } else {
                                                currentStock = 0;
                                            }
                                        }
                                    }

                                    // Robust Conversion & Unit Determination
                                    const stockUnitLower = stockUnit?.toLowerCase();
                                    let consumptionUnit = (unitType || item.unit || 'un').toLowerCase();

                                    if (stockUnitLower === 'un' && unitWeight > 1 && unitType && item.unit?.toLowerCase() === 'un') {
                                        consumptionUnit = unitType.toLowerCase();
                                    }

                                    let displayStock = currentStock;

                                    if ((stockUnitLower === 'un' || stockUnitLower === 'saco') && (consumptionUnit === 'g' || consumptionUnit === 'ml')) {
                                        displayStock = currentStock * unitWeight;
                                    } else if (stockUnitLower === 'kg' && consumptionUnit === 'g') displayStock = currentStock * 1000;
                                    else if (stockUnitLower === 'g' && consumptionUnit === 'kg') displayStock = currentStock / 1000;
                                    else if (stockUnitLower === 'l' && consumptionUnit === 'ml') displayStock = currentStock * 1000;
                                    else if (stockUnitLower === 'ml' && consumptionUnit === 'l') displayStock = currentStock / 1000;

                                    const isClosed = selectedOrder?.status === 'closed';
                                    const realQty = item.quantity_used ?? item.quantity_planned;
                                    const totalNeeded = realQty + (item.waste_quantity || 0);
                                    const isInsufficient = !isClosed && totalNeeded > (displayStock + 0.001);

                                    return (
                                        <div key={item.id} className={cn("bg-white p-3 rounded-lg border shadow-sm space-y-3", isInsufficient ? "border-red-300 bg-red-50/30" : "")}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    {item.type === 'product' ? <Layers className="h-4 w-4 text-amber-600" /> : <Box className="h-4 w-4 text-blue-600" />}
                                                    <span className="font-semibold text-sm">{item.name}</span>
                                                </div>
                                                <Badge variant="outline" className="text-xs bg-zinc-50">
                                                    Est: {displayStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{consumptionUnit}
                                                </Badge>
                                            </div>

                                            {isInsufficient && (
                                                <div className="text-[10px] text-red-600 font-bold bg-red-100 px-2 py-1 rounded">
                                                    Saldo Insuficiente! Faltam {(totalNeeded - displayStock).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{consumptionUnit}
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-zinc-500">Qtd Real ({consumptionUnit})</Label>
                                                    <Input
                                                        type="number"
                                                        disabled={isClosed}
                                                        className={cn("h-9", isInsufficient ? "border-red-300 focus-visible:ring-red-500" : "")}
                                                        value={item.quantity_used ?? item.quantity_planned}
                                                        onChange={e => updateItemUsage(item.id, 'quantity_used', Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-amber-600">Desperdício ({consumptionUnit})</Label>
                                                    <Input
                                                        type="number"
                                                        disabled={isClosed}
                                                        className="h-9 border-amber-200 focus:ring-amber-500 bg-amber-50/10"
                                                        value={item.waste_quantity || ''}
                                                        onChange={e => updateItemUsage(item.id, 'waste_quantity', Number(e.target.value))}
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {orderItems.some(i => {
                        const stockInfo = i.type === 'ingredient' ? ingredients.find(ing => ing.id === i.item_id) : products.find(p => p.id === i.item_id);
                        let currentStock = 0;
                        let stockUnit = 'un';
                        let unitWeight = 1;
                        let unitType = '';

                        if (stockInfo) {
                            const stockEntry = stockInfo.product_stocks?.find(s => s.location_id === selectedLocation);
                            if (stockEntry) {
                                currentStock = stockEntry.quantity;
                                stockUnit = stockInfo.unit || 'un';
                                if ('unit_weight' in stockInfo) {
                                    unitWeight = stockInfo.unit_weight || 1;
                                    unitType = stockInfo.unit_type || '';
                                }
                            } else {
                                // Fallback Logic (Legacy)
                                const loc = stockLocations.find(l => l.id === selectedLocation);
                                if (loc?.slug === 'stock-danilo') currentStock = (stockInfo as any).stock_danilo || 0;
                                else if (loc?.slug === 'stock-adriel') currentStock = (stockInfo as any).stock_adriel || 0;
                                else currentStock = 0;
                            }
                        }

                        const stockUnitLower = stockUnit?.toLowerCase();
                        let consumptionUnit = (unitType || i.unit || 'un').toLowerCase();
                        if (stockUnitLower === 'un' && unitWeight > 1 && unitType && i.unit?.toLowerCase() === 'un') {
                            consumptionUnit = unitType.toLowerCase();
                        }

                        let displayStock = currentStock;
                        if ((stockUnitLower === 'un' || stockUnitLower === 'saco') && (consumptionUnit === 'g' || consumptionUnit === 'ml')) displayStock = currentStock * unitWeight;
                        else if (stockUnitLower === 'kg' && consumptionUnit === 'g') displayStock = currentStock * 1000;
                        else if (stockUnitLower === 'g' && consumptionUnit === 'kg') displayStock = currentStock / 1000;
                        else if (stockUnitLower === 'l' && consumptionUnit === 'ml') displayStock = currentStock * 1000;
                        else if (stockUnitLower === 'ml' && consumptionUnit === 'l') displayStock = currentStock / 1000;

                        const realQty = i.quantity_used ?? i.quantity_planned;
                        const totalNeeded = realQty + (i.waste_quantity || 0);
                        return totalNeeded > (displayStock + 0.001);
                    }) && selectedOrder?.status !== 'closed' && (
                            <div className="bg-red-50 p-4 rounded-md flex items-start gap-3 border border-red-200 mb-4 mx-4">
                                <Trash2 className="h-5 w-5 text-red-600 mt-0.5" />
                                <div>
                                    <h4 className="font-medium text-red-900">Atenção: Estoque Crítico</h4>
                                    <p className="text-sm text-red-700 mt-1">
                                        Há itens com estoque insuficiente para esta OP. O fechamento irá deixar o estoque NEGATIVO.
                                    </p>
                                </div>
                            </div>
                        )}

                    {selectedOrder?.status !== 'closed' && (
                        <div className="bg-blue-50 p-4 rounded-md flex items-start gap-3 border border-blue-100 mx-4">
                            <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-blue-900">Resumo da Ação</h4>
                                <p className="text-sm text-blue-700 mt-1">
                                    Ao confirmar, o sistema irá baixar do estoque: <br />
                                    <strong>(Qtd Real + Desperdício)</strong> de cada item listado acima.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Cost Projection Block */}
                    {selectedOrder?.status !== 'closed' && (
                        <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-white mx-4 mt-2 shadow-sm">
                            <div>
                                <p className="text-xs text-zinc-500 uppercase font-bold">Custo Total Projetado</p>
                                <p className="text-xl font-bold text-zinc-900">R$ {totalProjectedCost.toFixed(2)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-zinc-500 uppercase font-bold">Custo Unitário Projetado</p>
                                <p className="text-xl font-bold text-green-600">
                                    R$ {unitProjectedCost.toFixed(2)}
                                    <span className="text-xs text-zinc-400 font-normal ml-1">
                                        / {selectedOrder?.products?.unit || 'un'}
                                    </span>
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-4 p-4 border rounded-md bg-zinc-50 mx-4 my-6">
                        <div className="flex-1">
                            <Label className="text-base font-semibold">Quantidade Final Produzida (Real)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Se houve quebra ou rendimento maior que o planejado.</p>
                            <div className="relative">
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={selectedOrder?.status === 'closed'}
                                    value={actualOutputQuantity}
                                    onChange={e => {
                                        // Allow only numbers and one dot
                                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                                        // prevent multiple dots
                                        const parts = raw.split('.');
                                        const clean = parts[0] + (parts.length > 1 ? '.' + parts[1] : '');

                                        const val = parseFloat(clean);
                                        setActualOutputQuantity(isNaN(val) ? 0 : val);
                                    }}
                                    className="pr-16"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500 bg-zinc-50 px-3 border-l rounded-r-md">
                                    {selectedOrder?.products?.unit || 'un'}
                                </div>
                            </div>
                        </div>

                        <div className="w-[200px]">
                            <Label className="text-base font-semibold">Destino do Estoque</Label>
                            <p className="text-xs text-muted-foreground mb-2">Local de armazenamento</p>
                            <Select
                                value={selectedLocation}
                                onValueChange={(v) => setSelectedLocation(v)}
                                disabled={selectedOrder?.status === 'closed'}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {stockLocations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="px-4 pb-4">
                        <Button variant="outline" onClick={() => setIsExecutionDialogOpen(false)}>
                            {selectedOrder?.status === 'closed' ? 'Fechar' : 'Voltar'}
                        </Button>
                        {selectedOrder?.status !== 'closed' && (
                            <Button onClick={handleCloseOrder} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Finalizar e Baixar Estoque
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Planning Dialog */}
            <ProductionPlanningDialog
                isOpen={isPlanningDialogOpen}
                onClose={() => {
                    setIsPlanningDialogOpen(false);
                    setPlanningOrder(null);
                }}
                existingOrder={planningOrder}
                openOrders={orders.filter(o => o.status === 'open')}
                onOrderCreated={() => {
                    fetchOrders();
                    setActiveTab('open');
                }}
            />
            {/* Confirmation Dialog */}
            <Dialog open={confirmationDialog.open} onOpenChange={(open) => {
                if (!open) setConfirmationDialog(prev => ({ ...prev, open: false }));
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmationDialog.title}</DialogTitle>
                        <DialogDescription>{confirmationDialog.description}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmationDialog(prev => ({ ...prev, open: false }))}>
                            Cancelar
                        </Button>
                        <Button
                            variant={confirmationDialog.variant || 'default'}
                            onClick={() => confirmationDialog.onConfirm()}
                        >
                            {confirmationDialog.confirmText || 'Confirmar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
