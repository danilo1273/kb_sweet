import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Loader2, ShoppingBag, PackagePlus, Pencil, Undo2, Ban, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea exists, if not use Input

interface Purchase {
    id: string;
    item_name: string;
    ingredient_id?: string;
    quantity: number;
    unit: string;
    status: 'pending' | 'approved' | 'rejected' | 'edit_requested';
    cost: number; // Valor Total da Compra
    supplier?: string;
    destination?: 'danilo' | 'adriel';
    created_at: string;
    user_id?: string;
    requested_by?: string;
    change_reason?: string;
    supplier_id?: string;
}

interface Ingredient {
    id: string;
    name: string;
    category: string;
    unit: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number; // Custo Unitário Médio
    min_stock: number;
}

interface Supplier {
    id: string;
    name: string;
}

export default function Purchases() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Dialog state for New Purchase
    const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
    const [currentPurchase, setCurrentPurchase] = useState<Partial<Purchase>>({ unit: 'un', destination: 'danilo' });
    const [isSavingPurchase, setIsSavingPurchase] = useState(false);

    // Dialog state for New Product (Ingredient)
    const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Ingredient>>({ unit: 'un', category: 'Ingrediente' });
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Revert/Change Request State
    const [isRevertOpen, setIsRevertOpen] = useState(false);
    const [revertReason, setRevertReason] = useState("");
    const [itemToRevert, setItemToRevert] = useState<Purchase | null>(null);

    // Dialog state for New Supplier
    const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState("");
    const [isSavingSupplier, setIsSavingSupplier] = useState(false);

    useEffect(() => {
        fetchData();
        fetchIngredients();
        fetchSuppliers();
    }, []);

    async function fetchData() {
        setLoading(true);
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

        const { data, error } = await supabase.from('purchase_requests').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error(error);
        } else {
            setPurchases(data || []);
        }
        setLoading(false);
    }

    async function fetchIngredients() {
        const { data } = await supabase.from('ingredients').select('*').order('name');
        setIngredients(data || []);
    }

    async function fetchSuppliers() {
        const { data } = await supabase.from('suppliers').select('*').order('name');
        setSuppliers(data || []);
    }

    // --- Purchase Logic ---

    async function handleSavePurchase() {
        setIsSavingPurchase(true);
        try {
            if (!currentPurchase.item_name && !currentPurchase.ingredient_id) throw new Error("Selecione um item");

            let finalName = currentPurchase.item_name;
            if (currentPurchase.ingredient_id && !finalName) {
                const ing = ingredients.find(i => i.id === currentPurchase.ingredient_id);
                finalName = ing?.name || 'Item desconhecido';
            }

            const { data: { user } } = await supabase.auth.getUser();

            // Nome do comprador: Metadata > Email > 'Comprador'
            let buyerName = user?.user_metadata?.full_name;
            if (!buyerName && user?.email) {
                buyerName = user.email.split('@')[0];
                // Capitalize first letter
                buyerName = buyerName.charAt(0).toUpperCase() + buyerName.slice(1);
            }
            if (!buyerName) buyerName = 'Comprador';

            const payload = {
                item_name: finalName,
                ingredient_id: currentPurchase.ingredient_id || null,
                quantity: Number(currentPurchase.quantity || 0),
                unit: currentPurchase.unit || 'un',
                status: 'pending',
                change_reason: null, // Limpa o motivo de alteração ao salvar/editar
                requested_by: buyerName,
                user_id: user?.id,
                cost: Number(currentPurchase.cost || 0),
                supplier: currentPurchase.supplier, // Nome ou ID, idealmente ID
                supplier_id: currentPurchase.supplier && suppliers.find(s => s.name === currentPurchase.supplier)?.id || null,
                destination: currentPurchase.destination || 'danilo'
            };

            let error;
            if (currentPurchase.id) {
                // Edit mode
                const { error: editError } = await supabase.from('purchase_requests').update(payload).eq('id', currentPurchase.id);
                error = editError;
            } else {
                // Create mode
                const { error: insertError } = await supabase.from('purchase_requests').insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            toast({ title: currentPurchase.id ? "Compra atualizada!" : "Compra registrada!" });
            setIsPurchaseDialogOpen(false);
            fetchData();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        } finally {
            setIsSavingPurchase(false);
        }
    }

    async function receiveItem(item: Purchase) {
        if (!confirm(`Confirmar entrada de ${item.quantity} ${item.unit} de ${item.item_name}?`)) return;

        try {
            // 1. Atualizar status da compra
            const { error: updateError } = await supabase
                .from('purchase_requests')
                .update({ status: 'approved' })
                .eq('id', item.id);

            if (updateError) throw updateError;

            // 2. Atualizar Estoque e Custo Médio
            let ingId = item.ingredient_id;
            if (!ingId) {
                // Fallback pelo nome
                const { data: foundIng } = await supabase.from('ingredients').select('id').ilike('name', item.item_name).single();
                if (foundIng) ingId = foundIng.id;
            }

            if (ingId) {
                const { data: currentIng } = await supabase.from('ingredients').select('*').eq('id', ingId).single();

                if (currentIng) {
                    // Atualiza Estoque (Danilo ou Adriel)
                    const targetStockField = item.destination === 'adriel' ? 'stock_adriel' : 'stock_danilo';
                    const currentStock = currentIng[targetStockField] || 0;
                    const newStock = currentStock + item.quantity;

                    // Cálculo de Custo Médio Ponderado
                    // Custo Médio = ((Qtde Atual Total * Custo Atual) + (Qtd Compra * Custo Unitário Compra)) / (Qtd Atual Total + Qtd Compra)
                    // Vamos usar o estoque TOTAL (Danilo + Adriel) para o peso do custo médio para ser mais preciso sobre o valor do ativo?
                    // Ou apenas o estoque onde entrou? Geralmente o custo médio é do ITEM, independente de onde está.

                    const totalCurrentStock = (currentIng.stock_danilo || 0) + (currentIng.stock_adriel || 0);
                    const currentAvgCost = currentIng.cost || 0;

                    const purchaseTotalValue = item.cost || 0; // Valor total da compra
                    // Se o item não tem custo (valor 0), assumimos custo unitário 0.

                    let newAvgCost = currentAvgCost;

                    if (item.quantity > 0) {
                        const currentAssetValue = totalCurrentStock * currentAvgCost;
                        const newAssetValue = currentAssetValue + purchaseTotalValue;
                        const newTotalStock = totalCurrentStock + item.quantity;

                        if (newTotalStock > 0) {
                            newAvgCost = newAssetValue / newTotalStock;
                        }
                    }

                    const updates: any = {
                        cost: newAvgCost
                    };
                    updates[targetStockField] = newStock;

                    await supabase.from('ingredients').update(updates).eq('id', ingId);

                    // 3. Gerar Movimentação Financeira (Contas a Pagar)
                    // Só gera se tiver custo > 0
                    if (item.cost > 0) {
                        const { error: finError } = await supabase.from('financial_movements').insert([{
                            description: `Compra de ${item.item_name} (${item.quantity}${item.unit})`,
                            amount: item.cost,
                            type: 'expense',
                            status: 'pending', // A pagar
                            related_purchase_id: item.id,
                            due_date: new Date().toISOString().split('T')[0] // Vencimento hoje por padrão, ajustar depois
                        }]);
                        if (finError) console.error("Erro ao gerar financeiro:", finError);
                    }

                    toast({ title: "Estoque atualizado e Conta a Pagar gerada!" });
                }
            } else {
                toast({ variant: "destructive", title: "Item não encontrado no estoque", description: "Apenas status atualizado." });
            }
            fetchData();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro na entrada", description: error.message });
        }
    }

    // --- Product Logic ---

    async function handleSaveProduct() {
        setIsSavingProduct(true);
        try {
            if (!newProduct.name) throw new Error("Nome é obrigatório");

            const payload = {
                name: newProduct.name,
                category: newProduct.category || 'Geral',
                unit: newProduct.unit || 'un',
                stock_danilo: 0,
                stock_adriel: 0,
                cost: Number(newProduct.cost || 0),
                min_stock: Number(newProduct.min_stock || 0),
            };

            const { error } = await supabase.from('ingredients').insert([payload]);
            if (error) throw error;

            toast({ title: "Produto cadastrado!" });
            setIsProductDialogOpen(false);
            await fetchIngredients();

        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao cadastrar", description: error.message });
        } finally {
            setIsSavingProduct(false);
        }
    }

    const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending' | 'change_requested' | 'edit_requested'>('all');

    // ... (rest of imports/state)

    const filteredPurchases = purchases.filter(item => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'approved') return item.status === 'approved';
        if (filterStatus === 'pending') return item.status === 'pending' && !item.change_reason;
        if (filterStatus === 'change_requested') return item.status === 'pending' && item.change_reason;
        if (filterStatus === 'edit_requested') return item.status === 'edit_requested';
        return true;
    });

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                    <h2 className="text-3xl font-bold tracking-tight">Compras e Entradas</h2>
                    <p className="text-zinc-500">Registre compras, valores e fornecedores.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto items-center">
                    <Select value={filterStatus} onValueChange={(val: any) => setFilterStatus(val)}>
                        <SelectTrigger className="w-[180px] bg-white">
                            <SelectValue placeholder="Filtrar por Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="approved">Aprovados</SelectItem>
                            <SelectItem value="pending">Pendentes</SelectItem>
                            <SelectItem value="change_requested">Aguardando Edição</SelectItem>
                            <SelectItem value="edit_requested">Solicitações de Edição</SelectItem>
                        </SelectContent>
                    </Select>

                    {(userRoles.includes('admin') || userRoles.includes('buyer')) && (
                        <>
                            <Button onClick={() => { setNewProduct({ unit: 'un', category: 'Ingrediente' }); setIsProductDialogOpen(true); }} variant="outline" className="border-zinc-800 text-zinc-900 w-full md:w-auto">
                                <PackagePlus className="mr-2 h-4 w-4" /> Novo Produto
                            </Button>
                            <Button onClick={() => { setCurrentPurchase({ unit: 'un', destination: 'danilo' }); setIsPurchaseDialogOpen(true); }} className="bg-zinc-900 text-white w-full md:w-auto">
                                <Plus className="mr-2 h-4 w-4" /> Nova Compra
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Comprador</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Fornecedor</TableHead>
                            <TableHead>Qtd.</TableHead>
                            <TableHead>Valor Total</TableHead>
                            <TableHead>Destino</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredPurchases.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Nenhuma compra encontrada.</TableCell></TableRow>
                        ) : (
                            filteredPurchases.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-xs">{item.requested_by || '-'}</TableCell>
                                    <TableCell className="font-medium">
                                        {item.item_name}
                                        {item.change_reason && item.status === 'pending' && (
                                            <div className="text-xs text-red-500 mt-1 flex items-center">
                                                <Ban className="h-3 w-3 mr-1" /> {item.change_reason}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>{item.supplier || '-'}</TableCell>
                                    <TableCell>{item.quantity} {item.unit}</TableCell>
                                    <TableCell>R$ {item.cost?.toFixed(2)}</TableCell>
                                    <TableCell className="capitalize">{item.destination}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={item.status === 'approved' ? 'default' : 'secondary'}
                                            className={
                                                item.status === 'approved'
                                                    ? 'bg-green-600'
                                                    : item.status === 'edit_requested'
                                                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                                        : (item.change_reason ? 'bg-orange-100 text-orange-800 hover:bg-orange-200' : '')
                                            }
                                        >
                                            {item.status === 'approved'
                                                ? 'Aprovado'
                                                : item.status === 'edit_requested'
                                                    ? 'Solic. Edição'
                                                    : (item.change_reason ? 'Aguardando Edição' : 'Pendente')
                                            }
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2 flex justify-end">
                                        {/* Aprovador Aprova/Recusa Solicitação de Edição */}
                                        {item.status === 'edit_requested' && (userRoles.includes('admin') || userRoles.includes('approver')) && (
                                            <div className="flex gap-1">
                                                <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50" onClick={async () => {
                                                    await supabase.from('purchase_requests').update({ status: 'pending', change_reason: null }).eq('id', item.id);
                                                    toast({ title: "Edição Liberada!" });
                                                    fetchData();
                                                }} title="Liberar Edição">
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={async () => {
                                                    await supabase.from('purchase_requests').update({ status: 'approved' }).eq('id', item.id);
                                                    toast({ title: "Edição Negada" });
                                                    fetchData();
                                                }} title="Negar Edição">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}

                                        {/* Aprovador recebe */}
                                        {item.status === 'pending' && (userRoles.includes('admin') || userRoles.includes('approver')) && (
                                            <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => receiveItem(item)}>
                                                <ShoppingBag className="h-4 w-4 mr-2" />
                                                Aprovar
                                            </Button>
                                        )}

                                        {/* Dono Edita (Se pendente) */}
                                        {item.status === 'pending' && (item.user_id === currentUserId || userRoles.includes('admin')) && (
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setCurrentPurchase(item);
                                                setIsPurchaseDialogOpen(true);
                                            }}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Dono Solicita Edição (Se aprovado) */}
                                        {item.status === 'approved' && (item.user_id === currentUserId || userRoles.includes('admin')) && (
                                            <Button variant="ghost" size="sm" className="text-yellow-600 hover:text-yellow-700" onClick={async () => {
                                                if (!confirm("Solicitar permissão para editar este item aprovado?")) return;
                                                await supabase.from('purchase_requests').update({ status: 'edit_requested' }).eq('id', item.id);
                                                toast({ title: "Solicitação enviada!", description: "Aguarde o aprovador liberar." });
                                                fetchData();
                                            }} title="Solicitar Edição">
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Aprovador Reverte (Se aprovado) - Mantem para admin poder forçar retorno */}
                                        {item.status === 'approved' && (userRoles.includes('admin') || userRoles.includes('approver')) && (
                                            <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600" onClick={() => {
                                                setItemToRevert(item);
                                                setRevertReason("");
                                                setIsRevertOpen(true);
                                            }} title="Solicitar Correção (Reverter)">
                                                <Undo2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Modal de Nova Compra */}
            <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Nova Compra</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Linha 1: Produto */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="ing" className="text-right">Produto</Label>
                            <div className="col-span-3 flex gap-2">
                                <Select
                                    value={currentPurchase.ingredient_id}
                                    onValueChange={(val) => {
                                        const ing = ingredients.find(i => i.id === val);
                                        const update = {
                                            ...currentPurchase,
                                            ingredient_id: val,
                                            item_name: ing?.name,
                                            unit: ing?.unit || currentPurchase.unit
                                        };
                                        setCurrentPurchase(update);
                                    }}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Selecione do Estoque..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ingredients.map(ing => (
                                            <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={(e) => { e.preventDefault(); setIsProductDialogOpen(true); }}
                                    title="Novo Produto"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Linha 2: Fornecedor e Destino */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="supplier" className="text-right">Fornecedor</Label>
                            <div className="col-span-3 flex gap-2">
                                <Select
                                    value={currentPurchase.supplier}
                                    onValueChange={(val) => setCurrentPurchase({ ...currentPurchase, supplier: val })}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map(s => (
                                            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={(e) => { e.preventDefault(); setIsSupplierDialogOpen(true); }}
                                    title="Novo Fornecedor"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="dest" className="text-right">Destino</Label>
                            <Select
                                value={currentPurchase.destination}
                                onValueChange={(val: 'danilo' | 'adriel') => setCurrentPurchase({ ...currentPurchase, destination: val })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="danilo">Estoque Danilo</SelectItem>
                                    <SelectItem value="adriel">Estoque Adriel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Linha 3: Qtd e Valor */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="qtd" className="text-right">Qtd.</Label>
                            <div className="col-span-3 flex gap-2">
                                <Input
                                    id="qtd"
                                    type="number"
                                    placeholder="Qtd"
                                    className="flex-1"
                                    value={currentPurchase.quantity || ''}
                                    onChange={(e) => setCurrentPurchase({ ...currentPurchase, quantity: Number(e.target.value) })}
                                />
                                <Select
                                    value={currentPurchase.unit}
                                    onValueChange={(val) => setCurrentPurchase({ ...currentPurchase, unit: val })}
                                >
                                    <SelectTrigger className="w-[100px]">
                                        <SelectValue placeholder="Un" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="un">un</SelectItem>
                                        <SelectItem value="kg">kg</SelectItem>
                                        <SelectItem value="g">g</SelectItem>
                                        <SelectItem value="l">l</SelectItem>
                                        <SelectItem value="ml">ml</SelectItem>
                                        <SelectItem value="cx">cx</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="cost" className="text-right">Valor Total</Label>
                            <div className="col-span-3 relative">
                                <span className="absolute left-3 top-2.5 text-zinc-500">R$</span>
                                <Input
                                    id="cost"
                                    type="number"
                                    step="0.01"
                                    className="pl-9"
                                    value={currentPurchase.cost || ''}
                                    onChange={(e) => setCurrentPurchase({ ...currentPurchase, cost: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSavePurchase} disabled={isSavingPurchase}>
                            {isSavingPurchase && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Registrar Compra
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Novo Produto */}
            <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novo Produto / Ingrediente</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new_name" className="text-right">Nome</Label>
                            <Input
                                id="new_name"
                                value={newProduct.name || ''}
                                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                className="col-span-3"
                                placeholder="Ex: Farinha de Trigo"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new_cat" className="text-right">Categoria</Label>
                            <Select
                                value={newProduct.category}
                                onValueChange={(val) => setNewProduct({ ...newProduct, category: val })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Ingrediente">Ingrediente</SelectItem>
                                    <SelectItem value="Embalagem">Embalagem</SelectItem>
                                    <SelectItem value="Outros">Outros</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new_unit" className="text-right">Unidade</Label>
                            <Select
                                value={newProduct.unit}
                                onValueChange={(val) => setNewProduct({ ...newProduct, unit: val })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="un">Unidade (un)</SelectItem>
                                    <SelectItem value="kg">Quilo (kg)</SelectItem>
                                    <SelectItem value="l">Litro (l)</SelectItem>
                                    <SelectItem value="g">Grama (g)</SelectItem>
                                    <SelectItem value="ml">Mililitro (ml)</SelectItem>
                                    <SelectItem value="cx">Caixa (cx)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new_cost" className="text-right">Custo Ini. (R$)</Label>
                            <Input
                                id="new_cost"
                                type="number"
                                step="0.01"
                                value={newProduct.cost || 0}
                                onChange={(e) => setNewProduct({ ...newProduct, cost: Number(e.target.value) })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="new_min" className="text-right">Estoque Mín.</Label>
                            <Input
                                id="new_min"
                                type="number"
                                value={newProduct.min_stock || 0}
                                onChange={(e) => setNewProduct({ ...newProduct, min_stock: Number(e.target.value) })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSaveProduct} disabled={isSavingProduct}>
                            {isSavingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Produto
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Novo Fornecedor */}
            <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novo Fornecedor</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Nome da Empresa/Fornecedor</Label>
                            <Input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={async () => {
                            if (!newSupplierName) return toast({ variant: 'destructive', title: 'Nome obrigatório' });
                            setIsSavingSupplier(true);
                            try {
                                const { error } = await supabase.from('suppliers').insert([{ name: newSupplierName }]);
                                if (error) throw error;
                                toast({ title: 'Fornecedor cadastrado!' });
                                setIsSupplierDialogOpen(false);
                                setNewSupplierName("");
                                fetchSuppliers();
                            } catch (e: any) {
                                toast({ variant: 'destructive', title: 'Erro', description: e.message });
                            } finally {
                                setIsSavingSupplier(false);
                            }
                        }} disabled={isSavingSupplier}>
                            {isSavingSupplier && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Fornecedor
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Reversão / Solicitar Alteração */}
            <Dialog open={isRevertOpen} onOpenChange={setIsRevertOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Solicitar Alteração</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-zinc-500">
                            Ao solicitar alteração, o item voltará para o status <strong>Pendente</strong> e o comprador poderá editá-lo.
                        </p>
                        <div className="grid gap-2">
                            <Label>Motivo da Alteração</Label>
                            <Textarea
                                value={revertReason}
                                onChange={e => setRevertReason(e.target.value)}
                                placeholder="Explique o motivo (ex: Valor incorreto, Item errado...)"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!itemToRevert) return;
                                if (!revertReason) return toast({ variant: 'destructive', title: 'Informe o motivo' });

                                const { error } = await supabase.from('purchase_requests').update({
                                    status: 'pending',
                                    change_reason: revertReason
                                }).eq('id', itemToRevert.id);

                                if (error) {
                                    toast({ variant: 'destructive', title: 'Erro', description: error.message });
                                } else {
                                    toast({ title: 'Status revertido para Pendente.' });
                                    setIsRevertOpen(false);
                                    setRevertReason("");
                                    fetchData();
                                }
                            }}
                        >
                            Confirmar Retorno
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
