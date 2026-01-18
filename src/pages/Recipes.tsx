
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Loader2, Edit, Trash2, Image as ImageIcon, X, Box, Layers, Settings, UploadCloud } from "lucide-react";

interface Category {
    id: number;
    name: string;
    type: 'stock' | 'expense' | 'product'; // added product
}

interface Product {
    id: string;
    name: string;
    category: string;
    price: number;
    cost: number;
    image_url: string;
    type: 'finished' | 'intermediate';
    stock_quantity: number;
    batch_size?: number;
    unit?: string;
    stock_danilo?: number;
    stock_adriel?: number;
}

interface Ingredient {
    id: string;
    name: string;
    unit: string;
    unit_weight: number;
    unit_type: 'weight' | 'volume' | 'unit';
    cost: number;
    cost_danilo?: number;
    cost_adriel?: number;
}

interface BomItem {
    id: string;
    ingredient_id?: string;
    child_product_id?: string;
    quantity: number;
    unit: string;
    ingredients?: Ingredient;
    child_product?: Product; // Para exibir infos do sub-produto
}

export default function Recipes() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const { toast } = useToast();

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});
    const [isSaving, setIsSaving] = useState(false);

    // BOM State
    const [bomItems, setBomItems] = useState<BomItem[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
    const [availableIntermediates, setAvailableIntermediates] = useState<Product[]>([]);

    // UI State for BOM Addition
    const [bomType, setBomType] = useState<'ingredient' | 'product'>('ingredient');
    const [loadingBom, setLoadingBom] = useState(false);
    const [newBomItem, setNewBomItem] = useState({
        target_id: '',
        quantity: 0,
        unit: 'g'
    });
    const [editingBomId, setEditingBomId] = useState<string | null>(null);

    // Categories
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    // Image Upload State
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchProducts();
        fetchResources();
        fetchCategories();
    }, []);

    async function fetchCategories() {
        // Fetch categories appropriate for products/recipes ONLY
        const { data, error } = await supabase.from('custom_categories')
            .select('*')
            .eq('type', 'product')
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
        const { error } = await supabase.from('custom_categories').insert({ name, type: 'product' });

        if (error) {
            toast({ variant: 'destructive', title: "Erro", description: error.message });
        } else {
            toast({ title: "Categoria adicionada!" });
            fetchCategories();
            setNewCategoryName("");
        }
    }

    // --- GLOBAL RECALCULATION LOGIC ---
    useEffect(() => {
        // Run once on mount to refresh costs
        recalculateGlobalCosts();
    }, []);

    async function recalculateGlobalCosts() {
        try {
            console.log("Starting global cost recalculation...");

            // 1. Fetch ALL products and ingredients
            const { data: allProducts, error: pErr } = await supabase.from('products').select('*');
            const { data: allIngredients, error: iErr } = await supabase.from('ingredients').select('*');

            if (pErr || iErr) {
                console.error("Error fetching data for recalc", pErr, iErr);
                return;
            }

            // 2. Fetch ALL BOM items
            const { data: allBoms, error: bErr } = await supabase.from('product_bom').select('*');
            if (bErr) { console.error(bErr); return; }

            // Map for quick access
            const ingMap = new Map(allIngredients?.map((i: any) => [i.id, i]));
            const productMap = new Map(allProducts?.map((p: any) => [p.id, p]));

            // 3. Build Dependency Graph
            // (Naive approach: Just separate Intermediates and Finished.
            //  Ideally topological sort, but for now: Bases first, then Finished.)
            //  Assuming max 1 level of nesting for simplicity initially, or iterate passes.

            // Let's do 2 passes. Pass 1: Intermediates. Pass 2: Finished.
            // If deeper nesting is used, a topological sort is needed later.

            const intermediates = allProducts?.filter((p: any) => p.type === 'intermediate') || [];
            const finished = allProducts?.filter((p: any) => p.type !== 'intermediate') || [];

            const processList = [...intermediates, ...finished];
            const updates: any[] = [];

            // We need to update productMap as we go, so subsequent items use updated costs.

            for (const prod of processList) {
                const bom = allBoms?.filter((b: any) => b.product_id === prod.id) || [];
                if (bom.length === 0) continue; // No BOM, no cost calc (unless manual) - skip

                let totalCost = 0;
                for (const item of bom) {
                    if (item.ingredient_id) {
                        const ing: any = ingMap.get(item.ingredient_id);
                        if (ing) {
                            const unitBaseCost = ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0);
                            if (ing.unit_weight && unitBaseCost) {
                                let qty = item.quantity;
                                if (['kg', 'l'].includes(item.unit)) qty *= 1000;
                                totalCost += (unitBaseCost / ing.unit_weight) * qty;
                            } else if (unitBaseCost) {
                                // Fallback (unsafe but better than 0 if units match?)
                                // Let's stick to safe: if no weight, 0 unless we are sure.
                                // Actually let's replicate logic:
                                // If item.unit == 'un' and ing.unit == 'un', multiply cost.
                                if (item.unit === 'un' && ing.unit === 'un') {
                                    totalCost += unitBaseCost * item.quantity;
                                }
                            }
                        }
                    } else if (item.child_product_id) {
                        const child = productMap.get(item.child_product_id);
                        if (child) {
                            // Use Unit Cost from child
                            const childCost = Number(child.cost || 0);
                            totalCost += childCost * item.quantity;
                        }
                    }
                }

                // Calculate Unit Cost (Price per gram/unit)
                const batchSize = Number(prod.batch_size) || 1;
                const unitCost = totalCost / batchSize;

                // Diff check (avoid useless updates)
                const currentUnitCost = Number(prod.cost || 0);
                const diff = Math.abs(unitCost - currentUnitCost);

                // If diff > 0.0001 (small float tolerance), update
                if (diff > 0.0001) {
                    updates.push({ id: prod.id, cost: unitCost });
                    // Update map immediately for dependents
                    productMap.set(prod.id, { ...prod, cost: unitCost });
                }
            }

            if (updates.length > 0) {
                console.log(`Updating ${updates.length} product costs...`);
                for (const up of updates) {
                    await supabase.from('products').update({ cost: up.cost }).eq('id', up.id);
                }

                // If current product is open, refresh it
                if (currentProduct.id) {
                    const openUpdate = updates.find(u => u.id === currentProduct.id);
                    if (openUpdate) {
                        setCurrentProduct(prev => ({ ...prev, cost: openUpdate.cost }));
                        // We also need to trigger re-render of UI display?
                        // calculatedCost state handles dynamic BOM.
                        // currentProduct.cost handles "Last Saved".
                    }
                }

                // Reload list to reflect changes
                fetchProducts();
            } else {
                console.log("No cost updates needed.");
            }

        } catch (e) {
            console.error("Auto cost recalc failed", e);
        }
    }

    async function handleDeleteCategory(id: number) {
        if (!confirm("Excluir esta categoria?")) return;
        const { error } = await supabase.from('custom_categories').delete().eq('id', id);
        if (error) {
            toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message });
        } else {
            toast({ title: "Categoria removida" });
            fetchCategories();
        }
    }

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

    async function fetchResources() {
        // Ingredientes
        const { data: ingData } = await supabase
            .from('ingredients')
            .select('*')
            .eq('is_active', true)
            .order('name');
        setAvailableIngredients(ingData || []);

        // Produtos Intermediários (serão filtrados no render para não mostrar o próprio produto)
        const { data: prodData } = await supabase
            .from('products')
            .select('*')
            .eq('type', 'intermediate')
            .order('name');
        setAvailableIntermediates(prodData || []);
    }

    const uniqueCategories = Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort();

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.category?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' ||
            (typeFilter === 'intermediate' ? p.type === 'intermediate' : p.type !== 'intermediate');
        const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

        return matchesSearch && matchesType && matchesCategory;
    });

    async function handleSave() {
        setIsSaving(true);
        try {
            if (!currentProduct.name) throw new Error("Nome é obrigatório");

            const payload = {
                name: currentProduct.name,
                category: currentProduct.category || 'Geral',
                price: Number(currentProduct.price || 0),
                // Use calculated cost if available (dynamic), otherwise fallback to manual entry/saved
                // Correctly calculate Unit Cost = Total / BatchSize
                cost: calculatedCost > 0
                    ? (calculatedCost / (Number(currentProduct.batch_size) || 1))
                    : Number(currentProduct.cost || 0),
                image_url: currentProduct.image_url,
                type: currentProduct.type || 'finished',
                batch_size: Number(currentProduct.batch_size || 1),
                unit: currentProduct.unit || 'un'
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
            // Refresh intermediates list as we might have created one
            fetchResources();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        setUploading(true);
        try {
            // Try uploading to 'product-images' bucket
            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file);

            if (uploadError) {
                console.error('Upload Error:', uploadError);
                throw new Error("Falha ao fazer upload. Verifique se o bucket 'product-images' existe no Supabase.");
            }

            const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);

            if (data) {
                setCurrentProduct(prev => ({ ...prev, image_url: data.publicUrl }));
                toast({ title: "Imagem enviada com sucesso!" });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro no upload", description: error.message });
        } finally {
            setUploading(false);
        }
    }

    async function handleQuickCreateIntermediate(name: string) {
        try {
            const { data, error } = await supabase.from('products').insert([{
                name,
                type: 'intermediate',
                category: 'Bases',
                cost: 0,
                price: 0,
                stock_quantity: 0
            }]).select();

            if (error) throw error;

            toast({ title: "Base criada!", description: `Agora você pode configurar a receita de ${name} separadamente.` });
            await fetchResources(); // Refresh list
            if (data && data[0]) {
                setNewBomItem(prev => ({ ...prev, target_id: data[0].id }));
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao criar", description: error.message });
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

    async function fetchBom(productId: string) {
        setLoadingBom(true);
        // Agora buscamos child_product também. 
        // Nota: A sintaxe de join do Supabase auto-detecta FKs. 
        // Precisamos garantir que a query saiba diferenciar child_product_id -> products

        const { data, error } = await supabase
            .from('product_bom')
            .select(`
                *,
                ingredients (*),
                child_product:products!child_product_id (*)
            `)
            .eq('product_id', productId);

        if (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao carregar ficha técnica' });
        } else {
            // Mapping to normalize structure if needed, but supabase returns objects nicely
            setBomItems(data || []);
        }
        setLoadingBom(false);
    }

    async function handleAddBomItem() {
        if (!currentProduct.id) return toast({ title: "Salve o produto antes de adicionar ingredientes." });
        if (!newBomItem.target_id || newBomItem.quantity <= 0) return toast({ variant: 'destructive', title: "Preencha os campos corretamente." });

        const payload: any = {
            product_id: currentProduct.id,
            quantity: newBomItem.quantity,
            unit: newBomItem.unit
        };

        if (bomType === 'ingredient') {
            payload.ingredient_id = newBomItem.target_id;
        } else {
            payload.child_product_id = newBomItem.target_id;
        }

        let error;

        if (editingBomId) {
            // UPDATE
            const { error: err } = await supabase
                .from('product_bom')
                .update({
                    quantity: newBomItem.quantity,
                    unit: newBomItem.unit,
                    // We allow changing the item too? Yes, why not.
                    ingredient_id: payload.ingredient_id || null,
                    child_product_id: payload.child_product_id || null
                })
                .eq('id', editingBomId);
            error = err;
        } else {
            // INSERT
            const { error: err } = await supabase.from('product_bom').insert([payload]);
            error = err;
        }

        if (error) {
            toast({ variant: 'destructive', title: "Erro ao salvar item", description: error.message });
        } else {
            toast({ title: editingBomId ? "Item atualizado" : "Item adicionado" });
            fetchBom(currentProduct.id);
            setNewBomItem({ target_id: '', quantity: 0, unit: 'g' });
            setEditingBomId(null);

            // Refetch products to get updated cost
            fetchProducts();

            // Also update current product cost locally
            const { data: updatedProd } = await supabase.from('products').select('*').eq('id', currentProduct.id).single();
            if (updatedProd) {
                setCurrentProduct(prev => ({ ...prev, cost: updatedProd.cost }));
            }
        }
    }

    async function handleDeleteBomItem(id: string) {
        const { error } = await supabase.from('product_bom').delete().eq('id', id);
        if (error) toast({ variant: 'destructive', title: "Erro ao remover" });
        else {
            if (editingBomId === id) {
                setEditingBomId(null);
                setNewBomItem({ target_id: '', quantity: 0, unit: 'g' });
            }
            fetchBom(currentProduct.id!);

            // Refetch products to get updated cost
            fetchProducts();

            // Also update current product cost locally
            const { data: updatedProd } = await supabase.from('products').select('*').eq('id', currentProduct.id).single();
            if (updatedProd) {
                setCurrentProduct(prev => ({ ...prev, cost: updatedProd.cost }));
            }
        }
    }

    function handleEditBomItem(item: BomItem) {
        setEditingBomId(item.id);

        // Determine type and target
        if (item.ingredients) {
            setBomType('ingredient');
            setNewBomItem({
                target_id: item.ingredient_id || '',
                quantity: item.quantity,
                unit: item.unit
            });
        } else if (item.child_product) {
            setBomType('product');
            setNewBomItem({
                target_id: item.child_product_id || '',
                quantity: item.quantity,
                unit: item.unit
            });
        }
    }

    // Dynamic Cost Calculation
    const [calculatedCost, setCalculatedCost] = useState(0);

    useEffect(() => {
        let total = 0;
        bomItems.forEach(item => {
            let itemCost = 0;
            if (item.ingredients) {
                const ing = item.ingredients;
                // Use global cost, or fallback to the highest cost from stock sources (conservative approach)
                const unitBaseCost = ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0);

                if (ing.unit_weight && unitBaseCost) {
                    let qty = item.quantity;
                    if (['kg', 'l'].includes(item.unit)) qty *= 1000;

                    itemCost = (unitBaseCost / ing.unit_weight) * qty;
                } else if (unitBaseCost) {
                    itemCost = 0; // If no unit_weight but has cost, we can't safely calculate unless units equal?
                    // existing logic fallback: 
                    // itemCost = unitBaseCost * item.quantity ?? No, unsafe without conversion check.
                }
            } else if (item.child_product) {
                // Child Product Cost
                // Use the child product's cost directly
                itemCost = (item.child_product.cost || 0) * item.quantity;
            }
            total += itemCost;
        });
        setCalculatedCost(total);
        // Also update currentProduct to ensure save picks it up?
        // Better to just use calculatedCost in save/render.
    }, [bomItems]);

    const openNew = () => {
        setCurrentProduct({ type: 'finished' });
        setBomItems([]);
        setIsDialogOpen(true);
    };

    const openEdit = (product: Product) => {
        setCurrentProduct(product);
        setIsDialogOpen(true);
        fetchBom(product.id);
        fetchResources(); // refresh to ensure latest links
    };

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Receitas e Produtos</h2>
                    <p className="text-zinc-500">Gerencie produtos finais e bases/intermediários.</p>
                </div>
                <Button onClick={openNew} className="bg-zinc-900 text-white hover:bg-zinc-800">
                    <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </Button>
            </div>

            <div className="flex flex-col gap-4 mb-6 bg-white p-3 rounded-lg border shadow-sm">

                {/* Search & Type Filters */}
                <div className="flex flex-col md:flex-row gap-3 justify-between">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                        <Input
                            placeholder="Buscar receita ou produto..."
                            className="pl-8 bg-zinc-50"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex p-1 bg-zinc-100 rounded-md self-start md:self-auto w-full md:w-auto overflow-x-auto">
                        {(['all', 'finished', 'intermediate'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={cn(
                                    "flex-1 md:flex-none px-4 py-1.5 text-sm font-medium rounded-sm transition-all whitespace-nowrap",
                                    typeFilter === t
                                        ? "bg-white text-zinc-900 shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-700"
                                )}
                            >
                                {t === 'all' ? 'Todos' : t === 'finished' ? 'Acabados' : 'Bases/Interm.'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Secondary Filters */}
                <div className="flex gap-2">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-[180px] bg-zinc-50">
                            <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as Categorias</SelectItem>
                            {uniqueCategories.map(cat => (
                                <SelectItem key={cat || 'unknown'} value={cat || 'unknown'}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                            <div className="absolute top-2 right-2 z-10">
                                {product.type === 'intermediate' && (
                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                                        BASE / INTERM.
                                    </span>
                                )}
                            </div>

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
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                                {product.category || 'Geral'}
                                            </span>
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                                Estoque: {product.stock_danilo || 0} {product.unit || 'un'}
                                            </span>
                                        </div>
                                    </div>
                                    {product.type === 'finished' && (
                                        <span className="font-bold text-green-600">R$ {product.price.toFixed(2)}</span>
                                    )}
                                </div>
                                <div className="mt-2 text-sm text-zinc-500">
                                    <p>
                                        Custo Unit.: R$ {(product.cost || 0).toFixed(2)} / {product.unit || 'un'}
                                    </p>
                                    {(product.batch_size || 0) > 1 && (
                                        <p className="text-xs text-zinc-400">
                                            Lote ({product.batch_size} {product.unit}): R$ {(product.cost && product.batch_size ? (product.cost * product.batch_size).toFixed(2) : (product.cost || 0).toFixed(2))}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{currentProduct.id ? 'Editar' : 'Novo'} Produto / Receita</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="basic" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="basic">Dados Básicos</TabsTrigger>
                            <TabsTrigger value="bom">Ficha Técnica</TabsTrigger>
                        </TabsList>

                        <TabsContent value="basic">
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nome do Produto</Label>
                                        <Input
                                            id="name"
                                            value={currentProduct.name || ''}
                                            onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Produto</Label>
                                        <Select
                                            value={currentProduct.type}
                                            onValueChange={(val: any) => setCurrentProduct({ ...currentProduct, type: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="finished">Produto Acabado (Venda)</SelectItem>
                                                <SelectItem value="intermediate">Base / Intermediário (Recheio, Massa)</SelectItem>
                                                <SelectItem value="resale">Revenda (Mercadoria)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="category">Categoria</Label>
                                            <Button variant="ghost" size="sm" onClick={() => setIsManageCategoriesOpen(true)} className="h-6 w-6 p-0" title="Gerenciar Categorias">
                                                <Settings className="h-3 w-3 text-zinc-500" />
                                            </Button>
                                        </div>
                                        <Select
                                            value={currentProduct.category}
                                            onValueChange={(val) => setCurrentProduct({ ...currentProduct, category: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {/* Combine hardcoded expected categories with dynamic ones to ensure defaults exist if DB is empty, or just use DB */}
                                                {availableCategories.length === 0 ? (
                                                    <>
                                                        <SelectItem value="Bolos">Bolos</SelectItem>
                                                        <SelectItem value="Doces">Doces</SelectItem>
                                                        <SelectItem value="Salgados">Salgados</SelectItem>
                                                    </>
                                                ) : (
                                                    availableCategories.map(c => (
                                                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="price">Preço de Venda (R$)</Label>
                                        <Input
                                            id="price"
                                            type="number"
                                            step="0.01"
                                            disabled={currentProduct.type === 'intermediate'}
                                            value={currentProduct.price || 0}
                                            onChange={(e) => setCurrentProduct({ ...currentProduct, price: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Imagem do Produto</Label>
                                    <div className="flex flex-col gap-3">
                                        {currentProduct.image_url && (
                                            <div className="relative aspect-video w-full max-w-[200px] rounded-lg overflow-hidden border bg-zinc-100 mx-auto">
                                                <img src={currentProduct.image_url} alt="Preview" className="w-full h-full object-cover" />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    className="absolute top-2 right-2 h-6 w-6"
                                                    onClick={() => setCurrentProduct({ ...currentProduct, image_url: '' })}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="image-upload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleImageUpload}
                                                disabled={uploading}
                                            />
                                            <Label
                                                htmlFor="image-upload"
                                                className={cn(
                                                    "flex-1 flex items-center justify-center gap-2 h-10 px-4 py-2 border rounded-md cursor-pointer hover:bg-zinc-50 transition-colors border-dashed border-zinc-300",
                                                    uploading && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                                {uploading ? "Enviando..." : (currentProduct.image_url ? "Trocar Imagem" : "Carregar Imagem")}
                                            </Label>

                                            {/* Fallback Text Input Toggle could go here if needed, but keeping it simple */}
                                        </div>
                                        <p className="text-[10px] text-zinc-500 text-center">
                                            {currentProduct.image_url ? "Imagem carregada via Supabase Storage" : "Clique para selecionar uma imagem"}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="batch_size">Rendimento Total da Receita</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="batch_size"
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            className="flex-1"
                                            value={currentProduct.batch_size || 1}
                                            onChange={(e) => setCurrentProduct({ ...currentProduct, batch_size: Number(e.target.value) })}
                                            placeholder="Ex: 500, 10..."
                                        />
                                        <Select
                                            value={currentProduct.unit || 'un'}
                                            onValueChange={(val) => setCurrentProduct({ ...currentProduct, unit: val })}
                                        >
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue placeholder="Un" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="un">un</SelectItem>
                                                <SelectItem value="g">g</SelectItem>
                                                <SelectItem value="kg">kg</SelectItem>
                                                <SelectItem value="ml">ml</SelectItem>
                                                <SelectItem value="l">l</SelectItem>
                                                <SelectItem value="cx">cx</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <p className="text-[10px] text-zinc-500">
                                        Defina a quantidade final gerada por esta receita (ex: 500g de recheio, 10 unidades de bolo).
                                    </p>
                                </div>

                                <div className="p-4 bg-zinc-50 rounded border text-sm text-zinc-600 space-y-2">
                                    <div className="flex justify-between items-center text-zinc-500">
                                        <span>Custo Total da Receita:</span>
                                        <span>R$ {calculatedCost.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center font-bold text-blue-600 border-t pt-2 mt-2">
                                        <span>Custo Unitário (Dinâmico):</span>
                                        <span>R$ {(calculatedCost / (Number(currentProduct.batch_size) || 1)).toFixed(4)} / {currentProduct.unit || 'un'}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-zinc-400">
                                        <span>Último Custo Salvo:</span>
                                        <span>R$ {currentProduct.cost?.toFixed(4) || '0.00'} / {currentProduct.unit || 'un'}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        O <strong>Custo Unitário</strong> é calculado dividindo o Custo Total pelo Rendimento ({currentProduct.batch_size || 1} {currentProduct.unit}).
                                        Ao salvar, este valor unitário será atualizado no produto.
                                    </p>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="bom">
                            <div className="flex flex-col gap-4 py-4 min-h-[300px]">
                                {!currentProduct.id ? (
                                    <div className="text-center py-8 text-muted-foreground bg-zinc-50 rounded-md border border-dashed">
                                        Salve o produto primeiro para adicionar itens à ficha técnica.
                                    </div>
                                ) : (
                                    <>
                                        {/* BOM Adder */}
                                        <div className="flex flex-col gap-2 p-3 border rounded-lg bg-zinc-50/50">
                                            <div className="flex gap-4 mb-2">
                                                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="bomType"
                                                        checked={bomType === 'ingredient'}
                                                        onChange={() => { setBomType('ingredient'); setNewBomItem({ ...newBomItem, target_id: '' }); }}
                                                        className="text-blue-600"
                                                    />
                                                    <Box className="h-4 w-4 text-zinc-500" />
                                                    Ingrediente
                                                </label>
                                                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="bomType"
                                                        checked={bomType === 'product'}
                                                        onChange={() => { setBomType('product'); setNewBomItem({ ...newBomItem, target_id: '' }); }}
                                                        className="text-amber-600"
                                                    />
                                                    <Layers className="h-4 w-4 text-zinc-500" />
                                                    Base / Intermediário
                                                </label>
                                            </div>

                                            <div className="flex gap-2 items-end">
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-xs">{bomType === 'ingredient' ? 'Matéria Prima' : 'Produto Base'}</Label>
                                                    <div className="flex gap-2">
                                                        <Select
                                                            value={newBomItem.target_id}
                                                            onValueChange={(val) => setNewBomItem({ ...newBomItem, target_id: val })}
                                                        >
                                                            <SelectTrigger className="bg-white w-full">
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {bomType === 'ingredient' ? (
                                                                    availableIngredients.map(ing => (
                                                                        <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>
                                                                    ))
                                                                ) : (
                                                                    availableIntermediates
                                                                        .filter(p => p.id !== currentProduct.id) // Avoid self-reference
                                                                        .map(p => (
                                                                            <SelectItem key={p.id} value={p.id}>{p.name} (Est: {p.stock_quantity})</SelectItem>
                                                                        ))
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        {bomType === 'product' && (
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                title="Novo Intermediário"
                                                                onClick={() => {
                                                                    const name = prompt("Nome do novo Produto Intermediário (Base):");
                                                                    if (name) handleQuickCreateIntermediate(name);
                                                                }}
                                                            >
                                                                <Plus className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-[100px] space-y-1">
                                                    <Label className="text-xs">Qtd</Label>
                                                    <Input
                                                        type="number"
                                                        className="bg-white"
                                                        value={newBomItem.quantity || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setNewBomItem({ ...newBomItem, quantity: val === '' ? 0 : parseFloat(val) })
                                                        }}
                                                    />
                                                </div>
                                                <div className="w-[80px] space-y-1">
                                                    <Label className="text-xs">Un</Label>
                                                    <Select
                                                        value={newBomItem.unit}
                                                        onValueChange={(val) => setNewBomItem({ ...newBomItem, unit: val })}
                                                    >
                                                        <SelectTrigger className="bg-white">
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
                                                <Button onClick={handleAddBomItem} size="icon" title={editingBomId ? "Salvar Alteração" : "Adicionar Item"}>
                                                    {editingBomId ? <div className="h-4 w-4 font-bold text-xs">OK</div> : <Plus className="h-4 w-4" />}
                                                </Button>
                                                {editingBomId && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => { setEditingBomId(null); setNewBomItem({ target_id: '', quantity: 0, unit: 'g' }); }}
                                                        title="Cancelar Edição"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* BOM List */}
                                        <div className="flex-1 overflow-y-auto border rounded-md min-h-[200px]">
                                            {loadingBom ? (
                                                <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                                            ) : bomItems.length === 0 ? (
                                                <div className="text-center p-4 text-sm text-muted-foreground">Nenhum item na ficha técnica.</div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Tipo</TableHead>
                                                                    <TableHead>Item</TableHead>
                                                                    <TableHead>Qtd</TableHead>
                                                                    <TableHead>Custo Aprox</TableHead>
                                                                    <TableHead className="w-[50px]"></TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {bomItems.map(item => {
                                                                    let name = "Desconhecido";
                                                                    let typeLabel = <span className="text-zinc-400 text-xs">?</span>;
                                                                    let cost = 0;

                                                                    if (item.ingredients) {
                                                                        name = item.ingredients.name;
                                                                        typeLabel = <Box className="h-3 w-3 text-blue-500" />;

                                                                        const ing = item.ingredients;
                                                                        const unitBaseCost = ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0);

                                                                        if (ing.unit_weight && unitBaseCost) {
                                                                            // Simple Calc
                                                                            let qty = item.quantity;
                                                                            if (['kg', 'l'].includes(item.unit)) qty *= 1000;
                                                                            cost = (unitBaseCost / ing.unit_weight) * qty;
                                                                        }
                                                                    } else if (item.child_product) {
                                                                        name = item.child_product.name;
                                                                        typeLabel = <Layers className="h-3 w-3 text-amber-500" />;

                                                                        // Since we now save Unit Cost, we use it directly.
                                                                        // No need to divide by batch_size anymore.

                                                                        let subCost = item.child_product.cost || 0;
                                                                        // Remove redundant division:
                                                                        // if (item.child_product.batch_size && item.child_product.batch_size > 0) {
                                                                        //    subCost = subCost / item.child_product.batch_size;
                                                                        // }

                                                                        cost = subCost * item.quantity;
                                                                    }

                                                                    return (
                                                                        <TableRow key={item.id}>
                                                                            <TableCell>{typeLabel}</TableCell>
                                                                            <TableCell className="font-medium">{name}</TableCell>
                                                                            <TableCell>{item.quantity} {item.unit}</TableCell>
                                                                            <TableCell>R$ {cost.toFixed(2)}</TableCell>
                                                                            <TableCell>
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    <Button variant="ghost" size="icon" onClick={() => handleEditBomItem(item)} className="h-8 w-8 text-zinc-500 hover:text-blue-600">
                                                                                        <Edit className="h-3 w-3" />
                                                                                    </Button>
                                                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteBomItem(item.id)} className="h-8 w-8 text-zinc-500 hover:text-red-500">
                                                                                        <X className="h-4 w-4" />
                                                                                    </Button>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </div>

                                                    {/* Mobile Cards */}
                                                    <div className="md:hidden space-y-2 p-2 bg-zinc-50">
                                                        {bomItems.map(item => {
                                                            let name = "Desconhecido";
                                                            let Icon = Box;
                                                            let iconColor = "text-blue-500";
                                                            let cost = 0;

                                                            if (item.ingredients) {
                                                                name = item.ingredients.name;
                                                                Icon = Box;
                                                                iconColor = "text-blue-500";

                                                                const ing = item.ingredients;
                                                                const unitBaseCost = ing.cost || Math.max(ing.cost_danilo || 0, ing.cost_adriel || 0);

                                                                if (ing.unit_weight && unitBaseCost) {
                                                                    let qty = item.quantity;
                                                                    if (['kg', 'l'].includes(item.unit)) qty *= 1000;
                                                                    cost = (unitBaseCost / ing.unit_weight) * qty;
                                                                }
                                                            } else if (item.child_product) {
                                                                name = item.child_product.name;
                                                                Icon = Layers;
                                                                iconColor = "text-amber-500";
                                                                // Since we now save Unit Cost, we use it directly.
                                                                // No need to divide by batch_size anymore.

                                                                let subCost = item.child_product.cost || 0;
                                                                // Remove redundant division:
                                                                // if (item.child_product.batch_size && item.child_product.batch_size > 0) {
                                                                //    subCost = subCost / item.child_product.batch_size;
                                                                // }

                                                                cost = subCost * item.quantity;
                                                            }

                                                            return (
                                                                <div key={item.id} className="bg-white p-3 rounded border flex justify-between items-center shadow-sm">
                                                                    <div className="flex items-center gap-3">
                                                                        <Icon className={cn("h-4 w-4", iconColor)} />
                                                                        <div>
                                                                            <div className="font-medium text-sm text-zinc-900">{name}</div>
                                                                            <div className="text-xs text-zinc-500">{item.quantity} {item.unit} • R$ {cost.toFixed(2)}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center">
                                                                        <Button variant="ghost" size="sm" onClick={() => handleEditBomItem(item)} className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-600">
                                                                            <Edit className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBomItem(item.id)} className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500">
                                                                            <X className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            {/* Cost is auto-calculated now */}
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage Categories Dialog */}
            <Dialog open={isManageCategoriesOpen} onOpenChange={setIsManageCategoriesOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Gerenciar Categorias</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex bg-zinc-50 p-1 rounded-md mb-2">
                            <div className="flex-1 text-center text-sm font-medium py-1 rounded bg-white shadow-sm text-zinc-800">Produtos/Receitas</div>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nova Categoria..."
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                            />
                            <Button onClick={handleAddCategory}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="border rounded-md max-h-[200px] overflow-y-auto">
                            {availableCategories.length === 0 ? (
                                <div className="p-4 text-center text-sm text-zinc-500">Nenhuma categoria encontrada.</div>
                            ) : (
                                availableCategories.map(cat => (
                                    <div key={cat.id} className="flex justify-between items-center p-2 border-b last:border-0 hover:bg-zinc-50">
                                        <span className="text-sm">{cat.name}</span>
                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat.id)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsManageCategoriesOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
