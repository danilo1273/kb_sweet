
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
import { Plus, Loader2, Box, Layers, CheckCircle2, Factory, History, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// --- Types ---

interface Product {
    id: string;
    name: string;
    stock_quantity: number;
    cost: number;
    type: 'finished' | 'intermediate';
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
    profiles?: { email: string };
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
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);

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
    useEffect(() => {
        fetchInitialData();
    }, []);

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
            .select('*, products(name, stock_quantity, cost), profiles(email)')
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

            const { data, error } = await supabase.rpc('create_production_order', {
                p_product_id: newOrderProduct,
                p_quantity: newOrderQuantity,
                p_user_id: user.id
            });

            if (error) throw error;

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
        // Fetch items
        const { data } = await supabase
            .from('production_order_items')
            .select('*')
            .eq('order_id', order.id);
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
    // Allowing inline edits. For simplicity, we save all items when closing or have a "Save Progress" button.
    // Let's implement "Execute/Close" which saves implicitly or explicitly.
    // Ideally we update the specific item row in DB on blur, but bulk update on Close is atomic.
    // **Wait**, RPC close_production_order reads from the DB table. So we MUST save changes to DB first.

    async function saveOrderItems() {
        // Bulk update
        const updates = orderItems.map(item => ({
            id: item.id,
            quantity_used: item.quantity_used,
            waste_quantity: item.waste_quantity
        }));

        const { error } = await supabase.from('production_order_items').upsert(updates);
        if (error) throw error;
    }

    async function handleCloseOrder() {
        if (!selectedOrder) return;
        if (!confirm("Isso irá baixar o estoque dos insumos e dar entrada no produto final. Confirmar?")) return;

        setIsSaving(true);
        try {
            // 1. Save current state of items/waste
            await saveOrderItems();

            // 2. Call RPC to close
            const { data, error } = await supabase.rpc('close_production_order', {
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
                                        <TableHead>Qtd Planejada</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500">Nenhuma produção em andamento.</TableCell></TableRow>
                                    ) : (
                                        orders.map(order => (
                                            <TableRow key={order.id}>
                                                <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                                                <TableCell className="font-medium text-lg">{order.products?.name}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-base">{order.quantity}</Badge></TableCell>
                                                <TableCell><Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Em Aberto</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" onClick={() => openExecution(order)} className="bg-blue-600 hover:bg-blue-700">
                                                        <PlayCircle className="mr-2 h-4 w-4" /> Executar
                                                    </Button>
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
                                        <TableHead>Qtd Produzida</TableHead>
                                        <TableHead>Custo Total</TableHead>
                                        <TableHead>Custo Unitário</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">Histórico vazio.</TableCell></TableRow>
                                    ) : (
                                        orders.map(order => (
                                            <TableRow key={order.id}>
                                                <TableCell>{order.closed_at ? new Date(order.closed_at).toLocaleString() : '-'}</TableCell>
                                                <TableCell className="font-medium">{order.products?.name}</TableCell>
                                                <TableCell>{order.quantity}</TableCell>
                                                <TableCell>R$ {order.cost_at_production?.toFixed(2)}</TableCell>
                                                <TableCell className="text-zinc-500 font-mono">
                                                    R$ {order.quantity > 0 && order.cost_at_production ? (order.cost_at_production / order.quantity).toFixed(2) : '-'}
                                                </TableCell>
                                                <TableCell><Badge className="bg-zinc-100 text-zinc-800">Concluído</Badge></TableCell>
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
                            <Select onValueChange={setNewOrderProduct}>
                                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Quantidade a Produzir</Label>
                            <Input type="number" min={1} value={newOrderQuantity} onChange={e => setNewOrderQuantity(Number(e.target.value))} />
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
                        <div className="border rounded-md overflow-hidden">
                            <div className="bg-zinc-100 p-2 text-sm font-semibold text-zinc-700 flex justify-between px-4">
                                <span>Insumos Planejados (Receita)</span>
                                <span>Ajuste Manual</span>
                            </div>
                            <div className="max-h-[300px] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="w-24">Unid.</TableHead>
                                            <TableHead className="w-32">Planejado</TableHead>
                                            <TableHead className="w-32">Qtd. Real</TableHead>
                                            <TableHead className="w-32 text-amber-600">Desperdício</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orderItems.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">
                                                    {item.type === 'product' ? <Layers className="inline h-3 w-3 mr-1 text-amber-600" /> : <Box className="inline h-3 w-3 mr-1 text-blue-600" />}
                                                    {item.name}
                                                </TableCell>
                                                <TableCell className="text-xs text-zinc-500">{item.unit}</TableCell>
                                                <TableCell>{Number(item.quantity_planned).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-24"
                                                        value={item.quantity_used}
                                                        onChange={e => updateItemUsage(item.id, 'quantity_used', Number(e.target.value))}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        className="h-8 w-24 border-amber-200 focus:ring-amber-500"
                                                        value={item.waste_quantity}
                                                        onChange={e => updateItemUsage(item.id, 'waste_quantity', Number(e.target.value))}
                                                        placeholder="0"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-md flex items-start gap-3 border border-blue-100">
                            <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-blue-900">Resumo da Ação</h4>
                                <p className="text-sm text-blue-700 mt-1">
                                    Ao confirmar, o sistema irá baixar do estoque: <br />
                                    <strong>(Qtd Real + Desperdício)</strong> de cada item listado acima.
                                </p>
                            </div>
                        </div>

                        {/* Actual Output Input */}
                        <div className="flex items-center gap-4 p-4 border rounded-md bg-zinc-50">
                            <div className="flex-1">
                                <Label className="text-base font-semibold">Quantidade Final Produzida (Real)</Label>
                                <p className="text-sm text-zinc-500">Se houve quebra ou rendimento maior que o planejado.</p>
                            </div>
                            <div className="w-32">
                                <Input
                                    type="number"
                                    className="text-lg font-bold text-center h-12"
                                    value={actualOutputQuantity}
                                    onChange={(e) => setActualOutputQuantity(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
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
