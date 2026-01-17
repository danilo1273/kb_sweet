import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Search, Loader2, Edit, Trash2, History, Settings, Plus, Package, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { InventoryAuditDialog } from "@/components/inventory/InventoryAuditDialog";
// import { useIngredients } from "@/hooks/useIngredients";
import { Ingredient, Category } from "@/types";

interface UnifiedHistoryItem {
    id: string;
    date: string;
    type: 'purchase' | 'usage';
    description: string;
    quantity: number;
    unit: string;
    total_value: number;
    user_name?: string;
    link_id?: string; // Order ID
}

import { motion, AnimatePresence } from "framer-motion";

export default function Inventory() {
    const navigate = useNavigate();
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();

    // Modal State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentIngredient, setCurrentIngredient] = useState<Partial<Ingredient>>({});
    const [isSaving, setIsSaving] = useState(false);

    // History Modal State
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyData, setHistoryData] = useState<UnifiedHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedIngName, setSelectedIngName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);

    // Dynamic meta
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);

    // Dialog Management
    const [isManageUnitsOpen, setIsManageUnitsOpen] = useState(false);
    const [newUnitName, setNewUnitName] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [stockFilter, setStockFilter] = useState("all");
    const [typeFilter] = useState("all"); // 'all', 'stock' (insumo), 'product' (acabado)

    // Category State
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryType, setNewCategoryType] = useState<'stock' | 'expense'>('stock');

    const [isAuditOpen, setIsAuditOpen] = useState(false);

    useEffect(() => {
        checkUserRole();
        fetchIngredients();
        fetchUnits();
        fetchCategories();
    }, []);

    async function fetchCategories() {
        // Fetch categories for STOCK (exclude product types)
        const { data, error } = await supabase.from('custom_categories')
            .select('*')
            .neq('type', 'product')
            .order('name');

        if (!error && data) {
            setAvailableCategories(data.map((d: any) => ({
                id: d.id,
                name: d.name,
                type: d.type || 'stock'
            })));
        }
    }

    async function handleAddCategory() {
        if (!newCategoryName) return;
        const name = newCategoryName.trim();
        const { error } = await supabase.from('custom_categories').insert({ name, type: newCategoryType });
        if (error) {
            if (error.code === '42P01') {
                toast({ title: "Modo Local", description: "Tabela 'custom_categories' não encontrada. A categoria será usada apenas nesta sessão." });
                // Mock local addition
                setAvailableCategories(prev => [...prev, { id: Date.now(), name, type: newCategoryType }]);
                setNewCategoryName("");
            } else {
                toast({ variant: 'destructive', title: "Erro", description: error.message });
            }
        } else {
            toast({ title: "Categoria adicionada!" });
            fetchCategories();
            setNewCategoryName("");
        }
    }

    async function handleDeleteCategory(name: string) {
        if (!confirm(`Remover categoria "${name}"?`)) return;
        const { error } = await supabase.from('custom_categories').delete().eq('name', name);
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Categoria removida" });
            fetchCategories();
        }
    }

    async function fetchUnits() {
        const { data, error } = await supabase.from('custom_units').select('name').order('name');
        if (!error && data) {
            setAvailableUnits(data.map(d => d.name.toLowerCase()));
        }
    }

    async function handleAddUnit() {
        if (!newUnitName) return;
        const norm = newUnitName.toLowerCase().trim();
        const { error } = await supabase.from('custom_units').insert({ name: norm });
        if (error) {
            if (error.code === '42P01') {
                toast({ title: "Modo Local", description: "Tabela 'custom_units' não encontrada. A unidade será usada apenas nesta sessão." });
                setAvailableUnits(prev => [...prev, norm]);
                setNewUnitName("");
            } else {
                toast({ variant: 'destructive', title: "Erro", description: error.message });
            }
        } else {
            toast({ title: "Unidade salva com sucesso!" });
            fetchUnits();
            setNewUnitName("");
        }
    }

    async function handleDeleteUnit(name: string) {
        if (!confirm(`Remover unidade "${name}" da lista padrão?`)) return;
        const { error } = await supabase.from('custom_units').delete().eq('name', name);
        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Unidade removida" });
            fetchUnits();
        }
    }

    async function checkUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('roles, role').eq('id', user.id).single();
            const roles = data?.roles || (data?.role ? [data.role] : []) || [];
            setIsAdmin(roles.includes('admin'));
        }
    }

    async function fetchIngredients() {
        setLoading(true);

        const { data: ingData, error: ingError } = await supabase
            .from('ingredients')
            .select('*, type')
            .eq('is_active', true)
            .neq('type', 'expense')
            .order('name');

        const { data: prodData, error: prodError } = await supabase
            .from('products')
            .select('*')
            .order('name');

        if (ingError) {
            console.error(ingError);
            toast({ variant: "destructive", title: "Erro ao carregar insumos", description: ingError.message });
        }

        if (prodError) {
            console.error(prodError);
        }

        const mappedIngredients: Ingredient[] = (ingData || []).map((i: any) => ({
            ...i,
            type: i.type || 'stock'
        }));

        const mappedProducts: Ingredient[] = (prodData || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category || 'Produtos',
            unit: p.unit || 'un',
            stock_danilo: p.stock_danilo || 0,
            stock_adriel: p.stock_adriel || 0,
            cost: p.cost || 0,
            cost_danilo: p.cost || 0,
            cost_adriel: p.cost || 0,
            min_stock: 0,
            type: 'product',
            // @ts-ignore
            is_product_entity: true
        }));

        setIngredients([...mappedIngredients, ...mappedProducts]);
        setLoading(false);
    }

    const filteredIngredients = ingredients.filter((ing) => {
        const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || (ing.category && ing.category === categoryFilter);
        const matchesStock = stockFilter === 'all' ||
            (stockFilter === 'low' && ((ing.stock_danilo || 0) <= (ing.min_stock || 0) || (ing.stock_adriel || 0) <= (ing.min_stock || 0))) ||
            (stockFilter === 'with_balance' && ((ing.stock_danilo || 0) > 0 || (ing.stock_adriel || 0) > 0)) ||
            (stockFilter === 'no_balance' && ((ing.stock_danilo || 0) <= 0 && (ing.stock_adriel || 0) <= 0));

        let matchesType = true;
        if (typeFilter === 'product') matchesType = ing.type === 'product'; // Acabado
        if (typeFilter === 'stock') matchesType = ing.type !== 'product'; // Insumos (stock or expense)

        return matchesSearch && matchesCategory && matchesStock && matchesType;
    });

    const uniqueCategories = Array.from(new Set(ingredients.map(i => i.category))).filter(Boolean).sort();

    async function handleSave() {
        setIsSaving(true);
        try {
            if (currentIngredient.is_product_entity) {
                toast({ variant: 'destructive', title: "Ação Inválida", description: "Produtos Acabados devem ser editados na tela de Receitas." });
                return;
            }

            // Apenas edição do Min Stock é permitida agora (e custo tecnicamente, mas vou travar)
            if (!currentIngredient.id) return; // Não cria mais aqui

            const payload = {
                min_stock: Number(currentIngredient.min_stock || 0),
                name: currentIngredient.name,
                category: currentIngredient.category,
                unit: currentIngredient.unit,
                unit_weight: Number(currentIngredient.unit_weight || 1), // Fator de Conversão
                unit_type: currentIngredient.unit_type, // Nome da Unidade Secundária
                type: currentIngredient.type,
                cost: currentIngredient.cost,
                // Legacy fields cleanup (optional, or keep generic)
                purchase_unit: null,
                purchase_unit_factor: 1
            };

            const { error } = await supabase.from('ingredients').update(payload).eq('id', currentIngredient.id);
            if (error) throw error;

            toast({ title: "Estoque Mínimo atualizado!" });

            setIsDialogOpen(false);
            fetchIngredients();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Escolha uma opção:\n\n1. Desativar (Remove da lista mas mantém histórico)\n2. EXCLUIR PERMANENTEMENTE (Cuidado: pode falhar se houver pedidos)")) return;

        const option = prompt("Digite 'desativar' para ocultar ou 'EXCLUIR' para apagar permanentemente:");

        if (option === 'desativar') {
            await deleteIngredient(id, 'deactivate');
        } else if (option === 'EXCLUIR') {
            await deleteIngredient(id, 'delete');
        }
    }

    async function deleteIngredient(id: string, mode: 'deactivate' | 'delete') {
        try {
            if (mode === 'deactivate') {
                const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id);
                if (error) throw error;
                toast({ title: "Ingrediente desativado" });
            } else {
                const { error } = await supabase.from('ingredients').delete().eq('id', id);
                if (error) {
                    throw new Error("Não é possível excluir itens que possuem histórico. Tente desativar.");
                }
                toast({ title: "Ingrediente EXCLUÍDO definitivamente" });
            }
            await fetchIngredients();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
        }
    }

    const openEdit = (ingredient: Ingredient) => {
        setCurrentIngredient(ingredient);
        setIsDialogOpen(true);
    };

    const openHistory = async (ingredient: Ingredient) => {
        setIsHistoryOpen(true);
        setSelectedIngName(ingredient.name);
        setHistoryLoading(true);

        try {
            const safeName = ingredient.name.replace(/"/g, '\\"');

            // 1. Fetch Purchases
            const purchasesPromise = supabase
                .from('purchase_requests')
                .select('*, purchase_orders(id, nickname, created_by, created_at, suppliers(name))')
                .or(`ingredient_id.eq.${ingredient.id},item_name.eq."${safeName}"`)
                .eq('status', 'approved')
                .order('created_at', { ascending: false })
                .limit(15);

            // 2. Fetch Production Usage
            const productionPromise = supabase
                .from('production_order_items')
                .select(`
                    id, quantity_used, waste_quantity, unit, unit_cost,
                    production_orders!inner (
                        id, closed_at, quantity, status,
                        products (name),
                        profiles:user_id (full_name)
                    )
                `)
                .eq('item_id', ingredient.id)
                .eq('type', 'ingredient')
                .eq('production_orders.status', 'closed') // Only closed orders deduct stock
                .order('id', { ascending: false }) // Approximate time sort
                .eq('production_orders.status', 'closed') // Only closed orders deduct stock
                .order('id', { ascending: false }) // Approximate time sort
                .limit(15);

            // 3. Fetch Sales
            const salesPromise = supabase
                .from('sale_items')
                .select(`
                    id, quantity, unit_price,
                    sales!inner (
                        id, created_at, status, stock_source,
                        profiles:user_id (full_name)
                    )
                `)
                .eq('product_id', ingredient.id)
                .neq('sales.status', 'canceled')
                .order('created_at', { foreignTable: 'sales', ascending: false })
                .limit(20);

            // 5. Fetch Adjustments
            const adjustmentsPromise = supabase
                .from('stock_adjustments')
                .select('*, profiles:user_id(full_name)')
                .eq('ingredient_id', ingredient.id)
                .order('created_at', { ascending: false })
                .limit(10);

            const [purchasesRes, productionRes, adjustmentsRes, salesRes] = await Promise.all([purchasesPromise, productionPromise, adjustmentsPromise, salesPromise]);

            if (purchasesRes.error) throw purchasesRes.error;
            if (productionRes.error) throw productionRes.error;
            if (salesRes.error) console.error("Error fetching sales history:", salesRes.error); // Log warning but continue

            // 3. Process Purchases
            let purchaseItems: UnifiedHistoryItem[] = [];

            // Collect user IDs for manual fetch if needed (though we tried to join profiles)
            const userIds = new Set<string>();
            purchasesRes.data?.forEach((r: any) => {
                if (r.purchase_orders?.created_by) userIds.add(r.purchase_orders.created_by);
            });

            // Fetch Profiles Map if needed (Purchase Orders join usually returns simplified or nothing if RLS blocks, but let's assume valid)
            let profileMap = new Map<string, string>();
            if (userIds.size > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds));
                profiles?.forEach(p => profileMap.set(p.id, p.full_name || 'Desconhecido'));
            }

            purchaseItems = (purchasesRes.data || []).map((r: any) => {
                const po = r.purchase_orders || {};
                const supplierName = po.suppliers?.name || r.supplier || 'Fornecedor Externo';
                const userName = profileMap.get(po.created_by) || 'Sistema'; // Fallback

                return {
                    id: r.id,
                    date: r.created_at || new Date().toISOString(),
                    type: 'purchase',
                    description: `Compra: ${supplierName}`,
                    quantity: Number(r.quantity || 0),
                    unit: r.unit || 'un',
                    total_value: Number(r.cost || 0),
                    user_name: userName,
                    link_id: po.id
                };
            });

            // 4. Process Production
            const productionItems: UnifiedHistoryItem[] = (productionRes.data || []).map((item: any) => {
                const order = item.production_orders;
                const prodName = order.products?.name || 'Produto Desconhecido';
                const qtdUsed = (item.quantity_used || 0) + (item.waste_quantity || 0);
                const cost = qtdUsed * (item.unit_cost || 0);

                // Safe access to profile name (array or object depending on join)
                let userName = 'Produção';
                if (order.profiles) {
                    if (Array.isArray(order.profiles)) userName = order.profiles[0]?.full_name;
                    else userName = (order.profiles as any).full_name;
                }

                return {
                    id: item.id,
                    date: order.closed_at || new Date().toISOString(),
                    type: 'usage',
                    description: `Produção: ${prodName}`,
                    quantity: qtdUsed,
                    unit: item.unit || 'un',
                    total_value: cost,
                    user_name: userName,
                    link_id: order.id // Could link to production view
                };
            });

            // Process Sales
            const salesItems: UnifiedHistoryItem[] = (salesRes.data || []).map((item: any) => {
                const sale = item.sales;
                let userName = 'Vendedor';
                if (sale.profiles) {
                    if (Array.isArray(sale.profiles)) userName = sale.profiles[0]?.full_name;
                    else userName = (sale.profiles as any).full_name;
                }

                return {
                    id: item.id,
                    date: sale.created_at,
                    type: 'usage', // Sales are outgoing, so 'usage' color (red-ish) is appropriate
                    description: `Venda PDV`,
                    quantity: Number(item.quantity),
                    unit: ingredient.unit || 'un',
                    total_value: Number(item.quantity * item.unit_price),
                    user_name: userName,
                    link_id: sale.id
                };
            });

            // 6. Process Adjustments
            const adjustmentItems: UnifiedHistoryItem[] = (adjustmentsRes.data || []).map((adj: any) => {
                let userName = 'Sistema';
                if (adj.profiles) {
                    if (Array.isArray(adj.profiles)) userName = adj.profiles[0]?.full_name;
                    else userName = (adj.profiles as any).full_name;
                }

                // If type is 'found' (sobra), allow positive? Normally adjustment shows diff.
                // quantity_diff is the signed change.
                const descMap: any = { 'found': 'Sobra de Estoque', 'loss': 'Quebra/Perda', 'adjustment': 'Ajuste Manual' };

                return {
                    id: adj.id,
                    date: adj.created_at,
                    type: adj.quantity_diff >= 0 ? 'purchase' : 'usage', // Reuse visual types for color (green/red) or add new 'adjustment' type supported by UI?
                    // Let's stick to usage=red (out), purchase=green (in).
                    // Actually, if we use 'purchase' type it might show supplier fields which are missing.
                    // Let's patch the type definition or map to existing.
                    description: `${descMap[adj.type] || 'Ajuste'}: ${adj.reason || '-'} (${adj.stock_owner})`,
                    quantity: Math.abs(adj.quantity_diff),
                    unit: ingredient.unit || 'un',
                    total_value: 0, // No monetary value stored usually, or we could estimate? Keep 0 for now.
                    user_name: userName
                };
            });


            // 5. Merge & Sort
            const allHistory = [...purchaseItems, ...productionItems, ...adjustmentItems, ...salesItems].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            setHistoryData(allHistory);

        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao carregar histórico', description: error.message || "Verifique sua conexão." });
            setHistoryData([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Estoque de Ingredientes</h2>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/stock-history')}>
                        <History className="mr-2 h-4 w-4" /> Histórico Global
                    </Button>
                    {isAdmin && (
                        <Button variant="outline" onClick={() => setIsAuditOpen(true)} className="text-blue-700 bg-blue-50 border-blue-200">
                            <ClipboardCheck className="mr-2 h-4 w-4" /> Realizar Inventário
                        </Button>
                    )}
                </div>
            </div>

            <InventoryAuditDialog
                isOpen={isAuditOpen}
                onClose={() => setIsAuditOpen(false)}
                onSuccess={() => { fetchIngredients(); }}
                ingredients={ingredients}
                categories={availableCategories}
            />

            <div className="flex gap-2 mb-4 bg-zinc-50 p-2 rounded-lg border">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Buscar ingrediente..."
                        className="pl-8 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Filtrar Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as Categorias</SelectItem>
                        {uniqueCategories.map(cat => (
                            <SelectItem key={cat || 'unknown'} value={cat || 'unknown'}>{cat}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={stockFilter} onValueChange={setStockFilter}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Filtrar Saldo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="with_balance">Com Saldo</SelectItem>
                        <SelectItem value="no_balance">Sem Saldo</SelectItem>
                    </SelectContent>
                </Select>
            </div >

            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-3 mb-4">
                {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : filteredIngredients.length === 0 ? (
                    <EmptyState
                        icon={Package}
                        title="Nenhum ingrediente"
                        description="Tente ajustar sua busca."
                        className="py-8"
                    />
                ) : (
                    filteredIngredients.map((item) => {
                        const totalQtd = (item.stock_danilo || 0) + (item.stock_adriel || 0);
                        return (
                            <div key={item.id} className={cn("bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3", item.type === 'expense' ? 'bg-purple-50/30' : '')}>
                                <div className="flex justify-between items-start">
                                    <div className="w-[70%]">
                                        <div className="font-bold text-zinc-900 truncate" title={item.name}>{item.name}</div>
                                        <div className="text-xs text-zinc-500 flex items-center gap-2">
                                            {item.category}
                                            {item.type === 'expense' && <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded">Despesa</span>}
                                        </div>
                                    </div>
                                    <div className="w-[30%] flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                                            <Edit className="h-4 w-4 text-zinc-400" />
                                        </Button>
                                    </div>
                                </div>
                                {item.type !== 'expense' && (
                                    <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                                        <div className="bg-blue-50 p-2 rounded">
                                            <div className="text-[10px] text-blue-700 font-bold uppercase">Danilo</div>
                                            <div className={cn("font-medium", item.stock_danilo <= item.min_stock ? "text-red-600" : "text-zinc-700")}>
                                                {(item.stock_danilo || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <span className="text-[10px]">{item.unit}</span>
                                            </div>
                                        </div>
                                        <div className="bg-amber-50 p-2 rounded">
                                            <div className="text-[10px] text-amber-700 font-bold uppercase">Adriel</div>
                                            <div className="font-medium text-zinc-700">
                                                {(item.stock_adriel || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <span className="text-[10px]">{item.unit}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-xs text-zinc-400 pt-1">
                                    <span>Total: {item.type === 'expense' ? '-' : `${totalQtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unit}`}</span>
                                    <Button variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => openHistory(item)}>
                                        <History className="h-3 w-3 mr-1" /> Histórico
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="hidden md:block rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead rowSpan={2} className="align-bottom w-[200px] max-w-[200px]">Nome</TableHead>
                            <TableHead rowSpan={2} className="w-[60px] align-bottom">Un.</TableHead>
                            <TableHead colSpan={3} className="text-center bg-blue-50/80 text-blue-700 border-b border-blue-100 font-semibold h-8 py-1">Estoque Danilo</TableHead>
                            <TableHead colSpan={3} className="text-center bg-amber-50/80 text-amber-700 border-b border-amber-100 font-semibold h-8 py-1">Estoque Adriel</TableHead>
                            <TableHead colSpan={2} className="text-center bg-zinc-100 text-zinc-700 border-b border-zinc-200 font-semibold h-8 py-1">Total Geral</TableHead>
                            <TableHead rowSpan={2} className="text-right w-[80px] align-bottom">Ações</TableHead>
                        </TableRow>
                        <TableRow>
                            {/* Danilo Sub-headers */}
                            <TableHead className="text-right bg-blue-50/30 h-8 py-1 text-xs">Qtd</TableHead>
                            <TableHead className="text-right bg-blue-50/30 h-8 py-1 text-xs">Médio</TableHead>
                            <TableHead className="text-right bg-blue-50/30 h-8 py-1 text-xs font-bold">Total</TableHead>
                            {/* Adriel Sub-headers */}
                            <TableHead className="text-right bg-amber-50/30 h-8 py-1 text-xs">Qtd</TableHead>
                            <TableHead className="text-right bg-amber-50/30 h-8 py-1 text-xs">Médio</TableHead>
                            <TableHead className="text-right bg-amber-50/30 h-8 py-1 text-xs font-bold">Total</TableHead>
                            {/* Total Geral Sub-headers */}
                            <TableHead className="text-right bg-zinc-50 h-8 py-1 text-xs font-bold">Qtd</TableHead>
                            <TableHead className="text-right bg-zinc-50 h-8 py-1 text-xs font-bold">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={10} className="text-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : filteredIngredients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} className="h-64">
                                    <EmptyState
                                        icon={Package}
                                        title="Nenhum ingrediente encontrado"
                                        description="Tente ajustar sua busca ou filtros, ou adicione novos itens."
                                        className="border-none shadow-none bg-transparent"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            <AnimatePresence>
                                {filteredIngredients.map((item) => {
                                    const totalQtd = (item.stock_danilo || 0) + (item.stock_adriel || 0);
                                    const totalVal = ((item.stock_danilo || 0) * (item.cost_danilo || 0)) + ((item.stock_adriel || 0) * (item.cost_adriel || 0));

                                    return (
                                        <motion.tr
                                            key={item.id}
                                            layoutId={item.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", item.type === 'expense' ? 'bg-gray-50/50' : '')}
                                        >
                                            <TableCell className="font-medium max-w-[200px] truncate" title={item.name}>
                                                <div className="flex flex-col">
                                                    <span>{item.name}</span>
                                                    <div className="flex gap-2 items-center">
                                                        <span className="text-[10px] text-zinc-400 font-normal truncate">{item.category}</span>
                                                        {item.type === 'expense' && <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded border border-purple-200">Despesa</span>}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{item.unit}</TableCell>

                                            {/* Danilo Columns */}
                                            <TableCell className={cn("text-right bg-blue-50/30", item.stock_danilo <= item.min_stock && item.type !== 'expense' ? "text-red-600 font-bold" : "")}>
                                                {item.type === 'expense' ? '-' : (
                                                    <div className="flex flex-col items-end">
                                                        <span>{`${(item.stock_danilo || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unit}`}</span>
                                                        {item.unit_type && item.unit_weight && item.unit_weight > 0 && (
                                                            <span className="text-[10px] text-zinc-500 font-normal opacity-80">
                                                                = {((item.stock_danilo || 0) * item.unit_weight).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {item.unit_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs bg-blue-50/30">
                                                {item.type === 'expense' ? '-' : (
                                                    (item.stock_danilo || 0) <= 0 ? <div className="text-zinc-300">-</div> : (
                                                        <>
                                                            <div>R$ {item.cost_danilo?.toFixed(2) || '0.00'}</div>
                                                            <div className="text-[9px] text-zinc-500 font-normal">p/ {item.unit}</div>
                                                        </>
                                                    )
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-blue-700 bg-blue-50/30">
                                                {item.type === 'expense' ? '-' : `R$ ${((item.stock_danilo || 0) * (item.cost_danilo || 0)).toFixed(2)}`}
                                            </TableCell>

                                            {/* Adriel Columns */}
                                            <TableCell className="text-right bg-amber-50/30">
                                                {item.type === 'expense' ? '-' : (
                                                    <div className="flex flex-col items-end">
                                                        <span>{`${(item.stock_adriel || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unit}`}</span>
                                                        {item.unit_type && item.unit_weight && item.unit_weight > 0 && (
                                                            <span className="text-[10px] text-zinc-500 font-normal opacity-80">
                                                                = {((item.stock_adriel || 0) * item.unit_weight).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {item.unit_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs bg-amber-50/30">
                                                {item.type === 'expense' ? '-' : (
                                                    (item.stock_adriel || 0) <= 0 ? <div className="text-zinc-300">-</div> : (
                                                        <>
                                                            <div>R$ {item.cost_adriel?.toFixed(2) || '0.00'}</div>
                                                            <div className="text-[9px] text-zinc-500 font-normal">p/ {item.unit}</div>
                                                        </>
                                                    )
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-amber-700 bg-amber-50/30">
                                                {item.type === 'expense' ? '-' : `R$ ${((item.stock_adriel || 0) * (item.cost_adriel || 0)).toFixed(2)}`}
                                            </TableCell>

                                            {/* Total Geral Columns */}
                                            <TableCell className="text-right font-bold bg-zinc-50">
                                                {item.type === 'expense' ? '-' : (
                                                    <div className="flex flex-col items-end">
                                                        <span>{`${totalQtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unit}`}</span>
                                                        {item.unit_type && item.unit_weight && item.unit_weight > 0 && (
                                                            <span className="text-[10px] text-zinc-500 font-normal opacity-80 font-mono">
                                                                = {(totalQtd * item.unit_weight).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {item.unit_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-green-700 bg-zinc-50">{item.type === 'expense' ? '-' : `R$ ${totalVal.toFixed(2)}`}</TableCell>

                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => openHistory(item)} title="Histórico de Compras">
                                                    <History className="h-4 w-4 text-blue-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Editar">
                                                    <Edit className="h-4 w-4 text-zinc-500" />
                                                </Button>
                                                {isAdmin && (
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} title="Excluir (Admin)">
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Dialog de Edição Flexível */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px] overflow-visible">
                    <DialogHeader>
                        <DialogTitle>Editar Produto</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {/* Nome */}
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome do Produto</Label>
                            <Input
                                id="name"
                                value={currentIngredient.name || ''}
                                onChange={(e) => setCurrentIngredient({ ...currentIngredient, name: e.target.value })}
                                disabled={!isAdmin}
                                placeholder="Ex: Leite Condensado"
                            />
                        </div>

                        {/* Tipo de Produto */}
                        <div className="space-y-2">
                            <Label>Tipo de Produto</Label>
                            <div className="flex gap-4">
                                <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                                    <input
                                        type="radio"
                                        name="editProductType"
                                        value="stock"
                                        checked={currentIngredient.type === 'stock' || !currentIngredient.type}
                                        onChange={() => setCurrentIngredient({ ...currentIngredient, type: 'stock' })}
                                        disabled={!isAdmin}
                                        className="text-blue-600"
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">Estoque</span>
                                    </div>
                                </label>
                                <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                                    <input
                                        type="radio"
                                        name="editProductType"
                                        value="expense"
                                        checked={currentIngredient.type === 'expense'}
                                        onChange={() => setCurrentIngredient({ ...currentIngredient, type: 'expense', min_stock: 0 })}
                                        disabled={!isAdmin}
                                        className="text-blue-600"
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">Despesa</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Categoria (Híbrido) */}
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <div className="flex gap-2">
                                <Select
                                    value={currentIngredient.category}
                                    onValueChange={(val) => setCurrentIngredient({ ...currentIngredient, category: val })}
                                    disabled={!isAdmin}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCategories
                                            .filter(c => c.type === (currentIngredient.type || 'stock'))
                                            .map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)
                                        }
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setIsManageCategoriesOpen(true)}
                                    title="Gerenciar Categorias"
                                    disabled={!isAdmin}
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                    </div>

                    {(!currentIngredient.type || currentIngredient.type === 'stock') && (
                        <div className="grid grid-cols-2 gap-4">
                            {/* Unidade Principal */}
                            <div className="space-y-2">
                                <Label>Unidade Principal (Estoque)</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={currentIngredient.unit}
                                        onValueChange={(val) => setCurrentIngredient({ ...currentIngredient, unit: val })}
                                        disabled={!isAdmin}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setIsManageUnitsOpen(true)}
                                        title="Gerenciar Lista de Unidades"
                                        disabled={!isAdmin}
                                    >
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Estoque Mínimo */}
                            <div className="space-y-2">
                                <Label htmlFor="min_stock">Estoque Mínimo</Label>
                                <Input
                                    id="min_stock"
                                    type="number"
                                    value={currentIngredient.min_stock || 0}
                                    onChange={(e) => setCurrentIngredient({ ...currentIngredient, min_stock: Number(e.target.value) })}
                                />
                            </div>


                        </div>
                    )}

                    {/* Conversão Opcional */}
                    {(!currentIngredient.type || currentIngredient.type === 'stock') && (
                        <div className="border rounded-md p-3 bg-zinc-50 space-y-3">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="has-conversion"
                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                    checked={!!currentIngredient.unit_type}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setCurrentIngredient({ ...currentIngredient, unit_weight: 0, unit_type: 'g' });
                                        } else {
                                            setCurrentIngredient({ ...currentIngredient, unit_weight: 1, unit_type: '' });
                                        }
                                    }}
                                    disabled={!isAdmin}
                                />
                                <Label htmlFor="has-conversion" className="text-sm font-medium cursor-pointer">
                                    Habilitar conversão secundária (Receita)
                                </Label>
                            </div>

                            {(!!currentIngredient.unit_type) && (
                                <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="col-span-1 space-y-1">
                                        <Label className="text-[10px]">Unid. Secundária</Label>
                                        <div className="flex gap-2">
                                            <Select
                                                value={currentIngredient.unit_type}
                                                onValueChange={(val) => setCurrentIngredient({ ...currentIngredient, unit_type: val })}
                                                disabled={!isAdmin}
                                            >
                                                <SelectTrigger className="w-full h-8 text-xs">
                                                    <SelectValue placeholder="Selecione..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setIsManageUnitsOpen(true)}
                                                title="Gerenciar Lista de Unidades"
                                                disabled={!isAdmin}
                                            >
                                                <Settings className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-[10px]">Fator de Conversão</Label>
                                        <Input
                                            type="number"
                                            value={currentIngredient.unit_weight || ''}
                                            onChange={(e) => setCurrentIngredient({ ...currentIngredient, unit_weight: Number(e.target.value) })}
                                            className="h-8 text-xs"
                                            placeholder="Ex: 395"
                                            disabled={!isAdmin}
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-[11px] text-zinc-500 bg-white p-2 border rounded text-center italic">
                                            "1 <strong>{currentIngredient.unit || '...'}</strong> equivale a <strong>{currentIngredient.unit_weight || '?'} {currentIngredient.unit_type || '...'}</strong>"
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {!isAdmin && <span className="text-xs text-amber-600 flex items-center mr-auto">Apenas: Estoque Mínimo.</span>}
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button type="submit" onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog de Histórico */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Movimentações: {selectedIngName}</DialogTitle>
                    </DialogHeader>
                    <div className="border rounded-md overflow-x-auto max-h-[60vh]">
                        <Table>
                            <TableHeader className="bg-zinc-50 sticky top-0">
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Resp.</TableHead>
                                    <TableHead className="text-right">Qtd</TableHead>
                                    <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyLoading ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-zinc-400" /></TableCell></TableRow>
                                ) : historyData.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma movimentação recente.</TableCell></TableRow>
                                ) : (
                                    historyData.map(h => (
                                        <TableRow key={`${h.type}-${h.id}`} className="hover:bg-zinc-50/50">
                                            <TableCell className="text-xs whitespace-nowrap text-zinc-500">
                                                {new Date(h.date).toLocaleDateString()} <span className="text-[10px]">{new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                                                    h.type === 'purchase' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                )}>
                                                    {h.type === 'purchase' ? 'Entrada' : 'Baixa'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {h.description}
                                                {h.link_id && (
                                                    <Button
                                                        variant="link"
                                                        className="h-auto p-0 ml-2 text-[10px] text-blue-500 underline decoration-blue-200"
                                                        onClick={() => {
                                                            setIsHistoryOpen(false);
                                                            if (h.type === 'purchase') navigate(`/purchases?openOrder=${h.link_id}`);
                                                            if (h.type === 'usage') navigate(`/production?openOrder=${h.link_id}`);
                                                        }}
                                                    >
                                                        #{h.link_id.slice(0, 6)}...
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-zinc-600">{h.user_name || '-'}</TableCell>
                                            <TableCell className="text-right font-semibold">
                                                <span className={h.type === 'purchase' ? "text-green-700" : "text-red-700"}>
                                                    {h.type === 'purchase' ? '+' : '-'}{h.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {h.unit}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">
                                                R$ {h.total_value.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Gerenciar Unidades */}
            <Dialog open={isManageUnitsOpen} onOpenChange={setIsManageUnitsOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Gerenciar Unidades</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nova Unidade (Ex: barra)"
                                value={newUnitName}
                                onChange={e => setNewUnitName(e.target.value.toLowerCase())}
                            />
                            <Button onClick={handleAddUnit}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                            {availableUnits.map(u => (
                                <div key={u} className="flex justify-between items-center bg-zinc-50 p-2 rounded text-sm">
                                    <span>{u}</span>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteUnit(u)}>
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Gerenciar Categorias */}
            <Dialog open={isManageCategoriesOpen} onOpenChange={setIsManageCategoriesOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Gerenciar Categorias</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-3 p-3 bg-zinc-50 rounded border">
                            <Label>Adicionar Nova</Label>
                            <Input
                                placeholder="Nome da Categoria"
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                            />
                            <div className="flex gap-4">
                                <label className="flex items-center space-x-2">
                                    <input type="radio" checked={newCategoryType === 'stock'} onChange={() => setNewCategoryType('stock')} className="text-blue-600" />
                                    <span className="text-sm">Estoque</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input type="radio" checked={newCategoryType === 'expense'} onChange={() => setNewCategoryType('expense')} className="text-blue-600" />
                                    <span className="text-sm">Despesa</span>
                                </label>
                            </div>
                            <Button onClick={handleAddCategory} disabled={!newCategoryName} className="w-full">
                                <Plus className="h-4 w-4 mr-2" /> Adicionar Categoria
                            </Button>
                        </div>

                        <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                            <Label className="text-xs text-muted-foreground px-2">Categorias Existentes</Label>
                            {availableCategories.map(c => (
                                <div key={c.name} className="flex justify-between items-center bg-white border p-2 rounded text-sm">
                                    <div className="flex flex-col">
                                        <span>{c.name}</span>
                                        <span className={`text-[10px] ${c.type === 'expense' ? 'text-purple-600' : 'text-blue-600'}`}>
                                            {c.type === 'expense' ? 'Despesa' : 'Estoque'}
                                        </span>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteCategory(c.name)}>
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
}
