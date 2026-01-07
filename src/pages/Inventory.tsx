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
import { Search, Loader2, Edit, Trash2, History, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Ingredient {
    id: string;
    name: string;
    category: string;
    unit: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number;
    cost_danilo: number;
    cost_adriel: number;
    min_stock: number;
    unit_weight?: number;
    unit_type?: string;
    purchase_unit?: string;
    purchase_unit_factor?: number;
}

interface PurchaseHistory {
    id: string;
    created_at: string;
    supplier?: string; // Legacy or direct
    quantity: number;
    cost: number;
    unit: string;
    purchase_orders?: {
        id: string;
        nickname: string;
        suppliers?: { name: string };
        profiles?: { full_name: string };
    };
}

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
    const [historyData, setHistoryData] = useState<PurchaseHistory[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedIngName, setSelectedIngName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);

    const [availableUnits, setAvailableUnits] = useState<string[]>(['un', 'kg', 'l', 'lata', 'cx', 'pct', 'ml', 'g']);
    const [isManageUnitsOpen, setIsManageUnitsOpen] = useState(false);
    const [newUnitName, setNewUnitName] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");

    // Category State
    const [availableCategories, setAvailableCategories] = useState<string[]>(['Ingrediente', 'Embalagem', 'Uso Geral', 'Limpeza']);
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    useEffect(() => {
        checkUserRole();
        fetchIngredients();
        fetchUnits();
        fetchCategories();
    }, []);

    async function fetchCategories() {
        const { data, error } = await supabase.from('custom_categories').select('name').order('name');
        if (!error && data) {
            setAvailableCategories(Array.from(new Set([...data.map(d => d.name), 'Ingrediente', 'Embalagem', 'Uso Geral', 'Limpeza'])));
        }
    }

    async function handleAddCategory() {
        if (!newCategoryName) return;
        const name = newCategoryName.trim();
        const { error } = await supabase.from('custom_categories').insert({ name });
        if (error) {
            if (error.code === '42P01') {
                toast({ title: "Modo Local", description: "Tabela 'custom_categories' não encontrada." });
                setAvailableCategories(prev => [...prev, name]);
            } else {
                toast({ variant: 'destructive', title: "Erro", description: error.message });
            }
        } else {
            toast({ title: "Categoria adicionada!" });
            fetchCategories();
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
            fetchCategories();
        }
    }

    async function fetchUnits() {
        const { data, error } = await supabase.from('custom_units').select('name').order('name');
        if (!error && data) {
            const custom = data.map(d => d.name.toLowerCase());
            setAvailableUnits(Array.from(new Set([...custom, 'un', 'kg', 'l', 'lata', 'cx', 'pct', 'ml', 'g', 'fardo', 'saco'])));
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
        const { data, error } = await supabase
            .from('ingredients')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar estoque", description: error.message });
        } else {
            setIngredients(data || []);
        }
        setLoading(false);
    }

    const filteredIngredients = ingredients.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || i.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const uniqueCategories = Array.from(new Set(ingredients.map(i => i.category))).filter(Boolean).sort();

    async function handleSave() {
        setIsSaving(true);
        try {
            // Apenas edição do Min Stock é permitida agora (e custo tecnicamente, mas vou travar)
            if (!currentIngredient.id) return; // Não cria mais aqui

            const payload = {
                min_stock: Number(currentIngredient.min_stock || 0),
                name: currentIngredient.name,
                category: currentIngredient.category,
                unit: currentIngredient.unit,
                unit_weight: Number(currentIngredient.unit_weight || 1), // Fator de Conversão
                unit_type: currentIngredient.unit_type, // Nome da Unidade Secundária
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
            const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id);
            if (error) toast({ variant: "destructive", title: "Erro ao desativar", description: error.message });
            else { toast({ title: "Ingrediente desativado" }); fetchIngredients(); }
        } else if (option === 'EXCLUIR') {
            const { error } = await supabase.from('ingredients').delete().eq('id', id);
            if (error) {
                toast({ variant: "destructive", title: "Erro ao excluir permanentemente", description: "Não é possível excluir itens que possuem histórico de pedidos ou fichas técnicas. Tente desativar ao invés de excluir." });
            } else {
                toast({ title: "Ingrediente EXCLUÍDO definitivamente" });
                fetchIngredients();
            }
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
            // 1. Fetch Request + Order info (Safe Join for Supplier if possible, else just ID)
            // Try enabling suppliers(name) join. If it fails, we might need to fetch suppliers manually too.
            // For now, assuming suppliers FK is standard. Removing profiles FK query which is often problematic.
            const { data: rawData, error } = await supabase
                .from('purchase_requests')
                .select('*, purchase_orders(id, nickname, created_by, suppliers(name))')
                .eq('ingredient_id', ingredient.id)
                .eq('status', 'approved')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) {
                console.error("History fetch error:", error);
                throw error;
            }

            let enrichedData: PurchaseHistory[] = rawData as any;

            // 2. Manual Profile Fetch (Safest approach for User link)
            const userIds = new Set<string>();
            rawData?.forEach((r: any) => {
                if (r.purchase_orders?.created_by) userIds.add(r.purchase_orders.created_by);
            });

            if (userIds.size > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds));
                const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

                enrichedData = rawData.map((r: any) => {
                    const creatorId = r.purchase_orders?.created_by;
                    const creatorName = profileMap.get(creatorId);
                    return {
                        ...r,
                        purchase_orders: {
                            ...r.purchase_orders,
                            profiles: creatorName ? { full_name: creatorName } : undefined
                        }
                    };
                });
            }

            setHistoryData(enrichedData);

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
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar ingrediente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 bg-white"
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Filtrar Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as Categorias</SelectItem>
                        {uniqueCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableHead>Nome</TableHead>
                        <TableHead className="w-[80px]">Un.</TableHead>
                        <TableHead className="text-right bg-blue-50/50">Qtd (D)</TableHead>
                        <TableHead className="text-right bg-blue-50/50">Médio (D)</TableHead>
                        <TableHead className="text-right bg-blue-50/50 font-bold">Total (D)</TableHead>
                        <TableHead className="text-right bg-amber-50/50">Qtd (A)</TableHead>
                        <TableHead className="text-right bg-amber-50/50">Médio (A)</TableHead>
                        <TableHead className="text-right bg-amber-50/50 font-bold">Total (A)</TableHead>
                        <TableHead className="text-right w-[80px]">Ações</TableHead>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : filteredIngredients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                    Nenhum ingrediente encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredIngredients.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">
                                        {item.name}
                                        <div className="text-[10px] text-zinc-400 font-normal">{item.category}</div>
                                    </TableCell>
                                    <TableCell>{item.unit}</TableCell>

                                    {/* Danilo Columns */}
                                    <TableCell className={cn("text-right bg-blue-50/30", item.stock_danilo <= item.min_stock ? "text-red-600 font-bold" : "")}>
                                        {item.stock_danilo}
                                    </TableCell>
                                    <TableCell className="text-right text-xs bg-blue-50/30">
                                        <div>R$ {item.cost_danilo?.toFixed(2) || '0.00'}</div>
                                        <div className="text-[9px] text-zinc-500 font-normal">p/ {item.unit}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-bold text-blue-700 bg-blue-50/30">
                                        R$ {((item.stock_danilo || 0) * (item.cost_danilo || 0)).toFixed(2)}
                                    </TableCell>

                                    {/* Adriel Columns */}
                                    <TableCell className="text-right bg-amber-50/30">
                                        {item.stock_adriel}
                                    </TableCell>
                                    <TableCell className="text-right text-xs bg-amber-50/30">
                                        <div>R$ {item.cost_adriel?.toFixed(2) || '0.00'}</div>
                                        <div className="text-[9px] text-zinc-500 font-normal">p/ {item.unit}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-bold text-amber-700 bg-amber-50/30">
                                        R$ {((item.stock_adriel || 0) * (item.cost_adriel || 0)).toFixed(2)}
                                    </TableCell>
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
                                </TableRow>
                            ))
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
                                        {availableCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

                        {/* Conversão Opcional */}
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

                    </div>
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
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Histórico de Compras: {selectedIngName}</DialogTitle>
                    </DialogHeader>
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Comprador</TableHead>
                                    <TableHead>Qtd</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Unit. (Calc)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyLoading ? (
                                    <TableRow><TableCell colSpan={7} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                                ) : historyData.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma compra registrada.</TableCell></TableRow>
                                ) : (
                                    historyData.map(h => (
                                        <TableRow key={h.id} className="whitespace-nowrap">
                                            <TableCell>{new Date(h.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="text-xs font-medium">
                                                {h.purchase_orders?.id ? (
                                                    <Button
                                                        variant="link"
                                                        className="p-0 h-auto font-medium text-blue-600 underline decoration-blue-300 underline-offset-2"
                                                        onClick={() => navigate(`/purchases?openOrder=${h.purchase_orders?.id}`)}
                                                    >
                                                        {h.purchase_orders?.nickname || 'Ver Lote'}
                                                    </Button>
                                                ) : (
                                                    <span className="text-zinc-400">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{h.purchase_orders?.suppliers?.name || h.supplier || '-'}</TableCell>
                                            <TableCell>{h.purchase_orders?.profiles?.full_name?.split(' ')[0] || '-'}</TableCell>
                                            <TableCell>{h.quantity} {h.unit}</TableCell>
                                            <TableCell>R$ {h.cost?.toFixed(2)}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs">
                                                {h.quantity > 0 && h.cost > 0 ? `R$ ${(h.cost / h.quantity).toFixed(2)}` : '-'}
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
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nova Categoria"
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                            />
                            <Button onClick={handleAddCategory}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                            {availableCategories.map(c => (
                                <div key={c} className="flex justify-between items-center bg-zinc-50 p-2 rounded text-sm">
                                    <span>{c}</span>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteCategory(c)}>
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
