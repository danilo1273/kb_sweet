
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Loader2, Edit, Trash2, Image as ImageIcon, X } from "lucide-react";

interface Product {
    id: string;
    name: string;
    category: string;
    price: number;
    cost: number;
    image_url: string;
}

interface Ingredient {
    id: string;
    name: string;
    unit: string;
    unit_weight: number;
    unit_type: 'weight' | 'volume' | 'unit';
    cost: number;
}

interface BomItem {
    id: string;
    ingredient_id: string;
    quantity: number;
    unit: string;
    ingredients?: Ingredient; // Join result
}

export default function Recipes() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});
    const [isSaving, setIsSaving] = useState(false);

    // BOM State
    const [bomItems, setBomItems] = useState<BomItem[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
    const [loadingBom, setLoadingBom] = useState(false);
    const [newBomItem, setNewBomItem] = useState({ ingredient_id: '', quantity: 0, unit: 'g' });

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        setLoading(true);
        const { data, error } = await supabase.from('products').select('*').order('name');
        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar receitas", description: error.message });
        } else {
            setProducts(data || []);
        }
        setLoading(false);
    }

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    async function handleSave() {
        setIsSaving(true);
        try {
            if (!currentProduct.name) throw new Error("Nome é obrigatório");

            const payload = {
                name: currentProduct.name,
                category: currentProduct.category || 'Geral',
                price: Number(currentProduct.price || 0),
                cost: Number(currentProduct.cost || 0), // Idealmente calculado via ficha técnica
                image_url: currentProduct.image_url
            };

            if (currentProduct.id) {
                const { error } = await supabase.from('products').update(payload).eq('id', currentProduct.id);
                if (error) throw error;
                toast({ title: "Produto atualizado!" });
            } else {
                const { error } = await supabase.from('products').insert([payload]);
                if (error) throw error;
                toast({ title: "Produto criado!" });
            }

            setIsDialogOpen(false);
            fetchProducts();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir este produto?")) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
        } else {
            toast({ title: "Produto excluído" });
            fetchProducts();
        }
    }



    async function fetchAvailableIngredients() {
        const { data } = await supabase
            .from('ingredients')
            .select('*')
            .eq('is_active', true)
            .order('name');
        setAvailableIngredients(data || []);
    }

    async function fetchBom(productId: string) {
        setLoadingBom(true);
        const { data, error } = await supabase
            .from('product_bom')
            .select('*, ingredients(*)')
            .eq('product_id', productId);

        if (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao carregar ficha técnica' });
        } else {
            setBomItems(data || []);
        }
        setLoadingBom(false);
    }

    async function handleAddBomItem() {
        if (!currentProduct.id) return toast({ title: "Salve o produto antes de adicionar ingredientes." });
        if (!newBomItem.ingredient_id || newBomItem.quantity <= 0) return toast({ variant: 'destructive', title: "Preencha os campos corretamente." });

        // Conversão automática de unidade se possível? Indiferente por enquanto, salvamos como o user escolheu.
        // Mas idealmente o BOM table tem "quantity" e "unit".

        const { error } = await supabase.from('product_bom').insert([{
            product_id: currentProduct.id,
            ingredient_id: newBomItem.ingredient_id,
            quantity: newBomItem.quantity,
            unit: newBomItem.unit
        }]);

        if (error) {
            toast({ variant: 'destructive', title: "Erro ao adicionar", description: error.message });
        } else {
            toast({ title: "Ingrediente adicionado" });
            fetchBom(currentProduct.id);
            setNewBomItem({ ingredient_id: '', quantity: 0, unit: 'g' });
        }
    }

    async function handleDeleteBomItem(id: string) {
        const { error } = await supabase.from('product_bom').delete().eq('id', id);
        if (error) toast({ variant: 'destructive', title: "Erro ao remover" });
        else fetchBom(currentProduct.id!);
    }

    async function calculateAndUpdateCost() {
        if (!currentProduct.id) return;
        let totalCost = 0;

        bomItems.forEach(item => {
            const ing = item.ingredients;
            if (ing && ing.unit_weight && ing.cost) {
                // Custo por grama/ml/unidade base
                const costPerBaseUnit = ing.cost / ing.unit_weight;

                // Converter a quantidade usada na receita para a unidade base do ingrediente
                // Simplificação: Assumindo que o user seleciona a MESMA unidade ou conversão direta g/ml.
                // TODO: Melhorar lógica de conversão se units forem diferentes (ex: receita usa 'xicara').
                // Por hora, assumimos que se ing.unit_type = 'weight' (g), a receita usa 'g' ou 'kg'.

                // se ing é 'weight', cost é por 'unit_weight'.

                // Lógica robusta:
                // Custo Unitário Real = (Custo Compra / Peso Compra)
                // Custo Ingrediente na Receita = Custo Unitário Real * Qtd Receita (em gramas)

                // Se ingrediente é KG/G/ML/L, é direto.
                // Se ingrediente é UN (ex: Lata), e receita usa G.
                // 1 Lata = 5.00, Peso = 395g. -> 5.00 / 395 = 0.0126/g. * 200g = 2.53.

                // Então sempre calculamos costPerGram (ou ml ou un).
                // ing.cost é o custo de compra (da quantidade unit_weight?). 
                // NÃO! ing.cost é o custo da compra da 'unit' de compra.
                // E ing.unit_weight é o peso dessa 'unit' de compra.

                // Ex: Leite - Compra 'CX', cost 5.00. unit_weight 1000 (ml).
                // Ex: Ovo - Compra 'BJ', cost 20.00. unit_weight 30 (un). (Bandeja 30 ovos).

                // Então: CostPerBase = ing.cost / ing.unit_weight.

                // Qtd Receita:
                // Se item.unit == 'g' ou 'ml', qty = item.quantity.
                // Se item.unit == 'kg' ou 'l', qty = item.quantity * 1000.
                // Se item.unit == 'un' (ex: 2 ovos).

                let quantityInBase = item.quantity; // Default assumindo mesma base
                if (['kg', 'l'].includes(item.unit.toLowerCase())) quantityInBase *= 1000;

                totalCost += costPerBaseUnit * quantityInBase;
            }
        });

        if (totalCost > 0) {
            // Atualizar produto
            await supabase.from('products').update({ cost: totalCost }).eq('id', currentProduct.id!);
            toast({ title: "Custo atualizado!", description: `Novo custo calculado: R$ ${totalCost.toFixed(2)}` });
            fetchProducts();
            setCurrentProduct(prev => ({ ...prev, cost: totalCost }));
        } else {
            toast({ title: "Não foi possível calcular o custo", description: "Verifique pesos e custos dos ingredientes." });
        }
    }

    const openNew = () => {
        setCurrentProduct({});
        setIsDialogOpen(true);
    };

    const openEdit = (product: Product) => {
        setCurrentProduct(product);
        setIsDialogOpen(true);
        fetchBom(product.id);
        fetchAvailableIngredients();
    };

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Receitas e Produtos</h2>
                    <p className="text-zinc-500">Gerencie seu cardápio e fichas técnicas.</p>
                </div>
                <Button onClick={openNew} className="bg-zinc-900 text-white hover:bg-zinc-800">
                    <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </Button>
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar produto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 bg-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-3 flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : filteredProducts.length === 0 ? (
                    <div className="col-span-3 text-center text-zinc-500 py-10">Nenhum produto cadastrado.</div>
                ) : (
                    filteredProducts.map((product) => (
                        <div key={product.id} className="group relative bg-white border border-zinc-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="aspect-video bg-zinc-100 flex items-center justify-center relative overflow-hidden">
                                {product.image_url ? (
                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="h-10 w-10 text-zinc-300" />
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => openEdit(product)}>
                                        <Edit className="h-4 w-4 mr-2" /> Editar
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDelete(product.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="font-semibold text-lg text-zinc-900">{product.name}</h3>
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                            {product.category || 'Geral'}
                                        </span>
                                    </div>
                                    <span className="font-bold text-green-600">R$ {product.price.toFixed(2)}</span>
                                </div>
                                <p className="text-sm text-zinc-500 mt-2">Custo Estimado: R$ {product.cost.toFixed(2)}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{currentProduct.id ? 'Editar' : 'Novo'} Produto</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="basic" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="basic">Dados Básicos</TabsTrigger>
                            <TabsTrigger value="bom">Ficha Técnica</TabsTrigger>
                        </TabsList>

                        <TabsContent value="basic">
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Nome</Label>
                                    <Input
                                        id="name"
                                        value={currentProduct.name || ''}
                                        onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="category" className="text-right">Categoria</Label>
                                    <Select
                                        value={currentProduct.category}
                                        onValueChange={(val) => setCurrentProduct({ ...currentProduct, category: val })}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Bolos">Bolos</SelectItem>
                                            <SelectItem value="Doces">Doces</SelectItem>
                                            <SelectItem value="Salgados">Salgados</SelectItem>
                                            <SelectItem value="Bebidas">Bebidas</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="price" className="text-right">Preço (R$)</Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        step="0.01"
                                        value={currentProduct.price || 0}
                                        onChange={(e) => setCurrentProduct({ ...currentProduct, price: Number(e.target.value) })}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="cost" className="text-right">Custo Manual</Label>
                                    <Input
                                        id="cost"
                                        type="number"
                                        step="0.01"
                                        placeholder="Auto se ficha técnica vazia"
                                        value={currentProduct.cost || 0}
                                        onChange={(e) => setCurrentProduct({ ...currentProduct, cost: Number(e.target.value) })}
                                        className="col-span-3"
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="bom">
                            <div className="flex flex-col gap-4 py-4 min-h-[300px]">
                                {!currentProduct.id ? (
                                    <div className="text-center py-8 text-muted-foreground bg-zinc-50 rounded-md border border-dashed">
                                        Salve o produto primeiro para adicionar ingredientes.
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-2 items-end border-b pb-4">
                                            <div className="flex-1 space-y-1">
                                                <Label>Ingrediente</Label>
                                                <Select
                                                    value={newBomItem.ingredient_id}
                                                    onValueChange={(val) => setNewBomItem({ ...newBomItem, ingredient_id: val })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableIngredients.map(ing => (
                                                            <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-[100px] space-y-1">
                                                <Label>Qtd</Label>
                                                <Input
                                                    type="number"
                                                    value={newBomItem.quantity}
                                                    onChange={(e) => setNewBomItem({ ...newBomItem, quantity: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="w-[80px] space-y-1">
                                                <Label>Un</Label>
                                                <Select
                                                    value={newBomItem.unit}
                                                    onValueChange={(val) => setNewBomItem({ ...newBomItem, unit: val })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="g">g</SelectItem>
                                                        <SelectItem value="kg">kg</SelectItem>
                                                        <SelectItem value="ml">ml</SelectItem>
                                                        <SelectItem value="l">l</SelectItem>
                                                        <SelectItem value="un">un</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button onClick={handleAddBomItem} size="icon"><Plus className="h-4 w-4" /></Button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto border rounded-md">
                                            {loadingBom ? (
                                                <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                                            ) : bomItems.length === 0 ? (
                                                <div className="text-center p-4 text-sm text-muted-foreground">Nenhum ingrediente na ficha técnica.</div>
                                            ) : (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Ingrediente</TableHead>
                                                            <TableHead>Qtd</TableHead>
                                                            <TableHead>Custo Aprox</TableHead>
                                                            <TableHead className="w-[50px]"></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {bomItems.map(item => {
                                                            const cost = item.ingredients?.cost && item.ingredients.unit_weight
                                                                ? ((item.ingredients.cost / item.ingredients.unit_weight) * (['kg', 'l'].includes(item.unit) ? item.quantity * 1000 : item.quantity))
                                                                : 0;
                                                            return (
                                                                <TableRow key={item.id}>
                                                                    <TableCell>{item.ingredients?.name}</TableCell>
                                                                    <TableCell>{item.quantity} {item.unit}</TableCell>
                                                                    <TableCell>R$ {cost.toFixed(2)}</TableCell>
                                                                    <TableCell>
                                                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteBomItem(item.id)}>
                                                                            <X className="h-4 w-4 text-red-500" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
