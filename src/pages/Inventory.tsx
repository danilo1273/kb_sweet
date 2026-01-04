import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Search, Loader2, Edit, Trash2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Ingredient {
    id: string;
    name: string;
    category: string;
    unit: string;
    stock_danilo: number;
    stock_adriel: number;
    cost: number;
    min_stock: number;
}

interface PurchaseHistory {
    id: string;
    created_at: string;
    supplier: string;
    quantity: number;
    cost: number; // Valor Total
    unit: string;
}

export default function Inventory() {
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

    useEffect(() => {
        fetchIngredients();
    }, []);

    async function fetchIngredients() {
        setLoading(true);
        const { data, error } = await supabase.from('ingredients').select('*').order('name');
        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar estoque", description: error.message });
        } else {
            setIngredients(data || []);
        }
        setLoading(false);
    }

    const filteredIngredients = ingredients.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    async function handleSave() {
        setIsSaving(true);
        try {
            // Apenas edição do Min Stock é permitida agora (e custo tecnicamente, mas vou travar)
            if (!currentIngredient.id) return; // Não cria mais aqui

            const payload = {
                // name: currentIngredient.name, // Nome não edita
                // category: ...
                min_stock: Number(currentIngredient.min_stock || 0),
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
        if (!confirm("Tem certeza que deseja excluir?")) return;

        const { error } = await supabase.from('ingredients').delete().eq('id', id);
        if (error) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
        } else {
            toast({ title: "Ingrediente excluído" });
            fetchIngredients();
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

        const { data, error } = await supabase
            .from('purchase_requests')
            .select('*')
            .eq('ingredient_id', ingredient.id)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao carregar histórico' });
        } else {
            setHistoryData(data || []);
        }
        setHistoryLoading(false);
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
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Un.</TableHead>
                            <TableHead className="text-right">Danilo</TableHead>
                            <TableHead className="text-right">Adriel</TableHead>
                            <TableHead className="text-right">Custo Médio</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : filteredIngredients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                    Nenhum ingrediente encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredIngredients.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>{item.category}</TableCell>
                                    <TableCell>{item.unit}</TableCell>
                                    <TableCell className={cn("text-right font-medium", item.stock_danilo <= item.min_stock ? "text-red-600" : "")}>
                                        {item.stock_danilo}
                                    </TableCell>
                                    <TableCell className="text-right">{item.stock_adriel}</TableCell>
                                    <TableCell className="text-right">R$ {item.cost?.toFixed(2)}</TableCell>
                                    <TableCell className="text-right space-x-1">
                                        <Button variant="ghost" size="icon" onClick={() => openHistory(item)} title="Histórico de Compras">
                                            <History className="h-4 w-4 text-blue-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Editar Estoque Mínimo">
                                            <Edit className="h-4 w-4 text-zinc-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} title="Excluir">
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Dialog de Edição Restrita */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Editar Ingrediente</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-blue-50 text-blue-800 rounded-md text-sm mb-2">
                            Para nome, categoria ou custo, utilize o cadastro de produtos. Saldo é alterado via Compras. Aqui você define apenas o <strong>Estoque Mínimo</strong>.
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nome</Label>
                            <Input id="name" value={currentIngredient.name || ''} disabled className="col-span-3 bg-zinc-100" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="min_stock" className="text-right">Estoque Mín.</Label>
                            <Input
                                id="min_stock"
                                type="number"
                                value={currentIngredient.min_stock || 0}
                                onChange={(e) => setCurrentIngredient({ ...currentIngredient, min_stock: Number(e.target.value) })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
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
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Qtd</TableHead>
                                    <TableHead>Valor Total</TableHead>
                                    <TableHead>Valor Unit. (Calc)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyLoading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                                ) : historyData.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma compra registrada.</TableCell></TableRow>
                                ) : (
                                    historyData.map(h => (
                                        <TableRow key={h.id}>
                                            <TableCell>{new Date(h.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell>{h.supplier || '-'}</TableCell>
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
        </div>
    );
}
