
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Box, Layers, CheckCircle2, Factory, History, PlayCircle, Trash2, Edit } from "lucide-react";
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
}

interface Ingredient {
    id: string;
    name: string;
    unit: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number;
    unit_weight: number;
    unit_type: string;
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

export default function Production() {
    const { toast } = useToast();
    const [, setLoading] = useState(true);
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [currentUserId, setCurrentUserId] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isExecutionDialogOpen, setIsExecutionDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Create Order State
    const [newOrderProduct, setNewOrderProduct] = useState("");
    const [newOrderQuantity, setNewOrderQuantity] = useState(1);

    // Execution State (Wizard)
    const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
    const [orderItems, setOrderItems] = useState<ProductionOrderItem[]>([]);
    const [actualOutputQuantity, setActualOutputQuantity] = useState(0);

    // Fetch Data
    // Fetch Data
    useEffect(() => {
        fetchInitialData();
        checkUser();
    }, []);

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
        fetchOrders();
    }, [activeTab]);

    async function fetchInitialData() {
        setLoading(true);
        await Promise.all([fetchOrders(), fetchResources()]);
        setLoading(false);
    }

    async function fetchResources() {
        const { data: prods } = await supabase.from('products').select('*').order('name');
        const { data: ings } = await supabase.from('ingredients').select('*').eq('is_active', true).order('name');
        if (prods) setProducts(prods);
        if (ings) setIngredients(ings);
    }

    async function fetchOrders() {
        let query = supabase
            .from('production_orders')
            .select('*, products(name, stock_quantity, cost, unit, batch_size), profiles(email, full_name)')
            .order('created_at', { ascending: false });

        if (activeTab === 'open') {
            query = query.eq('status', 'open');
        } else {
            query = query.neq('status', 'open');
        }

        const { data } = await query;
        setOrders(data || []);
    }

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

        setOrderItems(data || []);
        setActualOutputQuantity(order.quantity); // Default to planned
    }

    // Update LOCAL state of item usage
    function updateItemUsage(itemId: string, field: 'quantity_used' | 'waste_quantity', value: number) {
        setOrderItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    }

    // Save changes to items (auto-save or before close?)
    async function saveOrderItems() {
        const updates = orderItems.map(item => ({
            id: item.id,
            quantity_used: item.quantity_used,
            waste_quantity: item.waste_quantity
        }));

        const { error } = await supabase.from('production_order_items').upsert(updates);
        if (error) throw error;
    }

    async function handleAdminAction(action: 'delete' | 'reopen', orderId: string) {
        if (action === 'delete') {
            if (!confirm("Tem certeza? Esta ação é irreversível e se a ordem estiver FECHADA, o estoque será revertido.")) return;
            const { error } = await supabase.rpc('delete_production_order', { p_order_id: orderId });
            if (error) toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message });
            else {
                toast({ title: "Ordem excluída com sucesso" });
                fetchOrders();
            }
        } else if (action === 'reopen') {
            if (!confirm("Reabrir esta ordem? O estoque consumido será devolvido e a ordem ficará 'Aberta' para edição.")) return;
            const { error } = await supabase.rpc('reopen_production_order', { p_order_id: orderId });
            if (error) toast({ variant: 'destructive', title: "Erro ao reabrir", description: error.message });
            else {
                toast({ title: "Ordem reaberta", description: "Agora você pode editá-la na aba 'Em Aberto'." });
                setActiveTab('open');
            }
        }
    }

    async function handleCloseOrder() {
        if (!selectedOrder) return;
        if (!confirm("Isso irá baixar o estoque dos insumos e dar entrada no produto final. Confirmar?")) return;

        setIsSaving(true);
        try {
            await saveOrderItems();

            const { error } = await supabase.rpc('close_production_order', {
                p_order_id: selectedOrder.id,
                p_actual_output_quantity: actualOutputQuantity
            });

            if (error) throw error;

            toast({ title: "Produção Concluída!", description: "Estoque atualizado com sucesso." });
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
                <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-zinc-900 text-white hover:bg-zinc-800">
                    <Plus className="mr-2 h-4 w-4" /> Nova OP
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="open" className="gap-2"><Factory className="h-4 w-4" /> Em Aberto / Execução</TabsTrigger>
                    <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" /> Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                    {activeTab === 'open' && (
                        <div className="bg-white rounded-lg border shadow-sm">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data Criação</TableHead>
                                        <TableHead>Produto</TableHead>
                                        <TableHead>Criado Por</TableHead>
                                        <TableHead>Qtd Planejada</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">Nenhuma produção em andamento.</TableCell></TableRow>
                                    ) : (
                                        orders.map(order => (
                                            <TableRow key={order.id}>
                                                <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                                                <TableCell className="font-medium text-lg">{order.products?.name}</TableCell>
                                                <TableCell className="text-zinc-500">
                                                    {order.profiles?.full_name?.split(' ')[0] || order.profiles?.email?.split('@')[0] || '-'}
                                                </TableCell>
                                                <TableCell><Badge variant="outline" className="text-base">{order.quantity}</Badge></TableCell>
                                                <TableCell><Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Em Aberto</Badge></TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    {(order.user_id === currentUserId || isAdmin) && (
                                                        <>
                                                            <Button size="sm" onClick={() => openExecution(order)} className="bg-blue-600 hover:bg-blue-700">
                                                                <PlayCircle className="mr-2 h-4 w-4" /> Executar
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-red-500 hover:text-red-700 h-9 w-9 p-0" title="Cancelar Ordem">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history">
                    {activeTab === 'history' && (
                        <div className="bg-white rounded-lg border shadow-sm">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data Fechamento</TableHead>
                                        <TableHead>Produto</TableHead>
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
                                                <TableCell className="text-zinc-500">
                                                    {order.profiles?.full_name?.split(' ')[0] || order.profiles?.email?.split('@')[0] || '-'}
                                                </TableCell>
                                                <TableCell>{order.quantity}</TableCell>
                                                <TableCell>R$ {order.cost_at_production?.toFixed(2)}</TableCell>
                                                <TableCell className="text-zinc-500 font-mono">
                                                    R$ {order.quantity > 0 && order.cost_at_production ? (order.cost_at_production / order.quantity).toFixed(2) : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={order.status === 'closed' ? 'default' : 'secondary'} className={order.status === 'closed' ? 'bg-green-600 hover:bg-green-700' : 'bg-zinc-500'}>
                                                        {order.status === 'closed' ? 'Concluído' : order.status === 'canceled' ? 'Cancelado' : order.status === 'open' ? 'Em Aberto' : order.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isAdmin && (
                                                        <div className="flex justify-end gap-1">
                                                            <Button variant="outline" size="sm" onClick={() => handleAdminAction('reopen', order.id)} title="Corrigir / Reabrir">
                                                                <Edit className="h-3 w-3 mr-1" /> Corrigir
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleAdminAction('delete', order.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0" title="Excluir (Reverter Estoque)">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
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
                        </DialogTitle>
                        <DialogDescription>Confirme os insumos utilizados e aponte desperdícios antes de finalizar.</DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-6">

                        <div className="max-h-[400px] overflow-auto border rounded-md">
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

                                        if (stockInfo) {
                                            if ('stock_danilo' in stockInfo) {
                                                currentStock = stockInfo.stock_danilo;
                                                stockUnit = stockInfo.unit;
                                                unitWeight = stockInfo.unit_weight || 1;
                                                unitType = stockInfo.unit_type || '';
                                            } else {
                                                currentStock = stockInfo.stock_quantity;
                                                stockUnit = stockInfo.unit || 'un';
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
                                        const isInsufficient = totalNeeded > (displayStock + 0.001);

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
                                                            {displayStock.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {consumptionUnit}
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
                    </div>

                    {orderItems.some(i => {
                        const stockInfo = i.type === 'ingredient' ? ingredients.find(ing => ing.id === i.item_id) : products.find(p => p.id === i.item_id);
                        let currentStock = 0;
                        let stockUnit = 'un';
                        let unitWeight = 1;
                        let unitType = '';

                        if (stockInfo) {
                            if ('stock_danilo' in stockInfo) {
                                currentStock = stockInfo.stock_danilo;
                                stockUnit = stockInfo.unit;
                                unitWeight = stockInfo.unit_weight || 1;
                                unitType = stockInfo.unit_type || '';
                            } else {
                                currentStock = stockInfo.stock_quantity;
                                stockUnit = stockInfo.unit || 'un';
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
                    }) && (
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

                    <div className="flex items-center gap-4 p-4 border rounded-md bg-zinc-50 mx-4 my-6">
                        <div className="flex-1">
                            <Label className="text-base font-semibold">Quantidade Final Produzida (Real)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Se houve quebra ou rendimento maior que o planejado.</p>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={actualOutputQuantity}
                                    onChange={e => setActualOutputQuantity(Number(e.target.value))}
                                    className="pr-16"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500 bg-zinc-50 px-3 border-l rounded-r-md">
                                    {selectedOrder?.products?.unit || 'un'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-4 pb-4">
                        <Button variant="outline" onClick={() => setIsExecutionDialogOpen(false)}>Voltar</Button>
                        <Button onClick={handleCloseOrder} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Finalizar e Baixar Estoque
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
