import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calculator, CheckCircle2, AlertTriangle, AlertCircle, ShoppingCart, ClipboardList, Box } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { POSProduct } from "@/types";

// Define minimal shape for existing order to avoid circular dependencies if reusing Types
interface MinimalOrder {
    product_id: string;
    quantity: number;
    stock_source?: 'danilo' | 'adriel';
}

interface ProductionPlanningDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onOrderCreated: () => void;
    existingOrder?: MinimalOrder | null;
    openOrders?: MinimalOrder[]; // List of all open orders for batch analysis
}

interface AnalysisItem {
    id: string; // ingredient_id or product_id
    name: string;
    type: 'ingredient' | 'product';
    unit: string;
    requiredQty: number;
    currentStock: number;
    balance: number;
    status: 'ok' | 'buy' | 'produce';
}

export function ProductionPlanningDialog({ isOpen, onClose, onOrderCreated, existingOrder, openOrders = [] }: ProductionPlanningDialogProps) {
    const { toast } = useToast();
    const [step, setStep] = useState<'input' | 'analysis'>('input');
    const [loading, setLoading] = useState(false);

    // Input State
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [stockSource, setStockSource] = useState<'danilo' | 'adriel'>('danilo');

    // Tab State
    const [currentTab, setCurrentTab] = useState<'single' | 'batch'>('single');

    // Analysis State
    const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
    const [batchAnalysisItems, setBatchAnalysisItems] = useState<{ source: string, items: AnalysisItem[] }[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
            setAnalysisItems([]);
            setBatchAnalysisItems([]);

            if (existingOrder) {
                // Pre-fill and Prepare to Simulate
                setSelectedProductId(existingOrder.product_id);
                setQuantity(existingOrder.quantity);
                setStockSource(existingOrder.stock_source || 'danilo');
                setCurrentTab('single');
            } else {
                setStep('input');
                setQuantity(1);
                setSelectedProductId("");
                setCurrentTab('single');
            }
        }
    }, [isOpen, existingOrder]);

    // Trigger simulation once products are loaded if existingOrder is present
    useEffect(() => {
        if (isOpen && existingOrder && products.length > 0 && !loading && analysisItems.length === 0) {
            handleSimulate(existingOrder.product_id, existingOrder.quantity, existingOrder.stock_source || 'danilo');
        }
    }, [isOpen, existingOrder, products]);

    async function fetchProducts() {
        const { data } = await supabase.from('products')
            .select('*')
            .order('name');
        if (data) setProducts(data);
    }

    async function handleSimulate(manualProdId?: string, manualQty?: number, manualSource?: 'danilo' | 'adriel') {
        const pId = manualProdId || selectedProductId;
        const qty = manualQty || quantity;
        const source = manualSource || stockSource;

        if (!pId) return;
        setLoading(true);
        try {
            // 1. Get Product Info (Batch Size)
            const product = products.find(p => p.id === pId);
            const batchSize = (product as any)?.batch_size || 1;

            // 2. Fetch BOM
            const { data: bomData, error: bomError } = await supabase
                .from('product_bom')
                .select('*')
                .eq('product_id', pId);

            if (bomError) throw bomError;

            if (!bomData || bomData.length === 0) {
                toast({ title: "Aviso", description: "Este produto não possui ficha técnica cadastrada." });
                setAnalysisItems([]);
                setStep('analysis');
                setLoading(false);
                return;
            }

            // 3. Prepare IDs to fetch details
            const ingIds = bomData.filter(b => b.ingredient_id).map(b => b.ingredient_id);
            const prodIds = bomData.filter(b => b.child_product_id).map(b => b.child_product_id);

            // 4. Fetch Details & Stock
            let ingredientsMap = new Map();
            let productsMap = new Map();

            if (ingIds.length > 0) {
                const { data: ings } = await supabase.from('ingredients').select('*').in('id', ingIds);
                ings?.forEach(i => ingredientsMap.set(i.id, i));
            }

            if (prodIds.length > 0) {
                const { data: prods } = await supabase.from('products').select('*').in('id', prodIds);
                prods?.forEach(p => productsMap.set(p.id, p));
            }

            // 5. Build Analysis
            const items: AnalysisItem[] = bomData.map(bomItem => {
                const ratio = qty / (batchSize || 1);
                const required = bomItem.quantity * ratio;

                let currentStock = 0;
                let name = "Desconhecido";
                let type: 'ingredient' | 'product' = 'ingredient';

                if (bomItem.ingredient_id) {
                    type = 'ingredient';
                    const ing = ingredientsMap.get(bomItem.ingredient_id);
                    if (ing) {
                        name = ing.name;
                        const rawStock = source === 'danilo' ? (ing.stock_danilo || 0) : (ing.stock_adriel || 0);

                        // Unit Conversion Logic
                        // If BOM unit is different from Stock Unit, try to convert Stock -> BOM Unit
                        if (ing.unit && bomItem.unit && ing.unit.toLowerCase() !== bomItem.unit.toLowerCase()) {
                            // Case: Stock is in 'UN' / 'CX' and BOM is in 'g' / 'ml'
                            // We expect a conversion factor in 'unit_weight' or 'purchase_unit_factor'
                            // Usually 'unit_weight' is the weight of 1 'UN' in grams

                            if ((ing.unit.toLowerCase() === 'un' || ing.unit.toLowerCase() === 'cx' || ing.unit.toLowerCase() === 'sc') &&
                                (bomItem.unit.toLowerCase() === 'g' || bomItem.unit.toLowerCase() === 'ml')) {

                                const factor = ing.unit_weight || ing.purchase_unit_factor || 1;
                                // If factor is 1 and units differ significantly (UN vs g), it might be missing data, but we proceed with 1
                                currentStock = rawStock * factor;
                            } else {
                                // Unknown conversion, assume direct mapping or 1:1 fallback
                                // Or maybe Stock is in 'kg' and BOM in 'g'?
                                if (ing.unit.toLowerCase() === 'kg' && bomItem.unit.toLowerCase() === 'g') currentStock = rawStock * 1000;
                                else if (ing.unit.toLowerCase() === 'l' && bomItem.unit.toLowerCase() === 'ml') currentStock = rawStock * 1000;
                                else currentStock = rawStock;
                            }
                        } else {
                            currentStock = rawStock;
                        }
                    }
                } else if (bomItem.child_product_id) {
                    type = 'product';
                    const prod = productsMap.get(bomItem.child_product_id);
                    if (prod) {
                        name = prod.name;
                        // Products usually have 'un' stock. If BOM needs 'g', it implies usage of part of a batch? 
                        // Or maybe Child Product is used as UN?
                        // Assuming Child Product is always UN for now unless we see otherwise.
                        currentStock = source === 'danilo' ? (prod.stock_danilo || 0) : (prod.stock_adriel || 0);

                        if (bomItem.unit.toLowerCase() === 'g' || bomItem.unit.toLowerCase() === 'ml') {
                            // Intermediate product used by weight?
                            // Typically intermediate products are "Recheio X" produced in batches.
                            // Their stock might be in 'g' if they are produced in bulk.
                            // Let's assume Product stock is in the unit defined by Product.unit (default 'un')
                            const prodUnit = prod.unit || 'un';
                            if (prodUnit.toLowerCase() !== bomItem.unit.toLowerCase()) {
                                // Example: Product is 'un' (1 batch), BOM needs '500g'.
                                // We need batch weight. `batch_size` is legally quantity produced?
                                // If `batch_size` depends on recipe, calculating weight of 1 unit of product might be tricky.
                                // For now, let's assume if units differ, we warn or use raw if no factor.
                                // But usually Intermediates (Fillings) should be stocked in 'g' or 'kg' if used by weight.
                                // If stocked in 'un' (batch), we need batch weight.

                                // Simple assumption: If units match (e.g. both 'un' or both 'g'), no conversion.
                                // If Product is 'kg' and BOM is 'g', convert.
                                if (prodUnit.toLowerCase() === 'kg' && bomItem.unit.toLowerCase() === 'g') currentStock = currentStock * 1000;
                                else if (prodUnit.toLowerCase() === 'l' && bomItem.unit.toLowerCase() === 'ml') currentStock = currentStock * 1000;
                            }
                        }
                    }
                }

                const balance = currentStock - required;
                let status: 'ok' | 'buy' | 'produce' = 'ok';
                if (balance < 0) {
                    status = type === 'ingredient' ? 'buy' : 'produce';
                }

                return {
                    id: bomItem.ingredient_id || bomItem.child_product_id,
                    name,
                    type,
                    unit: bomItem.unit,
                    requiredQty: required,
                    currentStock,
                    balance,
                    status
                };
            });

            setAnalysisItems(items);
            setStep('analysis');

        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: "Erro na simulação", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    async function handleBatchSimulate() {
        if (!openOrders || openOrders.length === 0) {
            toast({ title: "Nenhuma Ordem", description: "Não há ordens abertas para analisar." });
            return;
        }

        setLoading(true);
        try {
            // 1. Collect all unique product IDs from orders
            const productIds = Array.from(new Set(openOrders.map(o => o.product_id)));

            // 2. Fetch BOMs for all involved products
            const { data: allBoms, error: bomError } = await supabase
                .from('product_bom')
                .select('*')
                .in('product_id', productIds);

            if (bomError) throw bomError;
            if (!allBoms) return;

            // 3. Collect Ingredients and Child Products needing lookup
            const ingIds = Array.from(new Set(allBoms.filter(b => b.ingredient_id).map(b => b.ingredient_id)));
            const childProdIds = Array.from(new Set(allBoms.filter(b => b.child_product_id).map(b => b.child_product_id)));

            // 4. Fetch Details
            let ingredientsMap = new Map();
            let productsMap = new Map();

            if (ingIds.length > 0) {
                const { data: ings } = await supabase.from('ingredients').select('*').in('id', ingIds);
                ings?.forEach(i => ingredientsMap.set(i.id, i));
            }

            // Map for products (both main products and intermediate products)
            const allProductIdsToFetch = Array.from(new Set([...productIds, ...childProdIds]));
            if (allProductIdsToFetch.length > 0) {
                const { data: prods } = await supabase.from('products').select('*').in('id', allProductIdsToFetch);
                prods?.forEach(p => productsMap.set(p.id, p));
            }

            // 5. Aggregate Requirements by Stock Source
            // structure: requirements[source] = Map<ItemId, {req, type, name, unit}>
            const requirements: Record<string, Map<string, any>> = {
                danilo: new Map<string, any>(),
                adriel: new Map<string, any>()
            };

            openOrders.forEach(order => {
                const source = order.stock_source || 'danilo';
                // Initialize map if source is unexpected, though type limits to danilo/adriel
                if (!requirements[source]) requirements[source] = new Map();

                const product = productsMap.get(order.product_id);
                // Fallback to fetchProducts state if not in map (should be in map due to step 4)
                const fallbackProd = products.find(p => p.id === order.product_id);
                const batchSize = product?.batch_size || fallbackProd?.batch_size || 1;

                const ratio = order.quantity / Number(batchSize);

                const orderBoms = allBoms.filter(b => b.product_id === order.product_id);

                orderBoms.forEach(bom => {
                    const reqQty = bom.quantity * ratio;
                    const itemId = bom.ingredient_id || bom.child_product_id;
                    const map = requirements[source];

                    // Logic to find previous requirement to add to it, OR create new
                    let itemEntry = map.get(itemId);

                    if (!itemEntry) {
                        let name = "Desconhecido";
                        let type = bom.ingredient_id ? 'ingredient' : 'product';
                        let stockDanilo = 0;
                        let stockAdriel = 0;
                        let unit = bom.unit;

                        if (bom.ingredient_id && ingredientsMap.has(bom.ingredient_id)) {
                            const i = ingredientsMap.get(bom.ingredient_id);
                            name = i.name;

                            let rawStockDanilo = i.stock_danilo || 0;
                            let rawStockAdriel = i.stock_adriel || 0;

                            // Apply Conversion Logic for Stock (Same as Single Mode)
                            if (i.unit && bom.unit && i.unit.toLowerCase() !== bom.unit.toLowerCase()) {
                                if ((i.unit.toLowerCase() === 'un' || i.unit.toLowerCase() === 'cx' || i.unit.toLowerCase() === 'sc') &&
                                    (bom.unit.toLowerCase() === 'g' || bom.unit.toLowerCase() === 'ml')) {
                                    const factor = i.unit_weight || i.purchase_unit_factor || 1;
                                    rawStockDanilo *= factor;
                                    rawStockAdriel *= factor;
                                } else if (i.unit.toLowerCase() === 'kg' && bom.unit.toLowerCase() === 'g') {
                                    rawStockDanilo *= 1000;
                                    rawStockAdriel *= 1000;
                                } else if (i.unit.toLowerCase() === 'l' && bom.unit.toLowerCase() === 'ml') {
                                    rawStockDanilo *= 1000;
                                    rawStockAdriel *= 1000;
                                }
                            }

                            stockDanilo = rawStockDanilo;
                            stockAdriel = rawStockAdriel;

                        } else if (bom.child_product_id && productsMap.has(bom.child_product_id)) {
                            const p = productsMap.get(bom.child_product_id);
                            name = p.name;

                            let rawStockDanilo = p.stock_danilo || 0;
                            let rawStockAdriel = p.stock_adriel || 0;

                            // Product Unit Conversion (Simple kg->g)
                            const pUnit = p.unit || 'un';
                            if (pUnit.toLowerCase() === 'kg' && bom.unit.toLowerCase() === 'g') {
                                rawStockDanilo *= 1000;
                                rawStockAdriel *= 1000;
                            } else if (pUnit.toLowerCase() === 'l' && bom.unit.toLowerCase() === 'ml') {
                                rawStockDanilo *= 1000;
                                rawStockAdriel *= 1000;
                            }

                            stockDanilo = rawStockDanilo;
                            stockAdriel = rawStockAdriel;
                        }

                        itemEntry = {
                            id: itemId,
                            name,
                            type,
                            unit,
                            req: 0, // initialized below
                            stockDanilo,
                            stockAdriel,
                            source
                        };
                        map.set(itemId, itemEntry);
                    }

                    itemEntry.req += reqQty;
                });
            });

            // 6. Convert to Array and Analyze Stock
            const result: { source: string, items: AnalysisItem[] }[] = [];

            ['danilo', 'adriel'].forEach(src => {
                const map = requirements[src];
                if (map && map.size > 0) {
                    const items: AnalysisItem[] = [];
                    map.forEach((val) => {
                        // Check stock against specific source
                        // If source is danilo, check stockDanilo. If adriel, check stockAdriel.
                        const currentStock = src === 'danilo' ? val.stockDanilo : val.stockAdriel;
                        const balance = currentStock - val.req;

                        items.push({
                            id: val.id,
                            name: val.name,
                            type: val.type,
                            unit: val.unit,
                            requiredQty: val.req,
                            currentStock: currentStock,
                            balance: balance,
                            status: balance < 0 ? (val.type === 'ingredient' ? 'buy' : 'produce') : 'ok'
                        });
                    });

                    if (items.length > 0) {
                        result.push({ source: src, items });
                    }
                }
            });

            setBatchAnalysisItems(result);
            setStep('analysis');

        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: "Erro na Análise Geral", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateOrder() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não logado");

            const { error } = await supabase.rpc('create_production_order', {
                p_product_id: selectedProductId,
                p_quantity: quantity,
                p_user_id: user.id,
                p_stock_source: stockSource
            });

            if (error) throw error;

            toast({ title: "Ordem Criada com Sucesso!" });
            onOrderCreated(); // Call callback to refresh parent
            onClose();

        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao criar", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    // Single Sim Stats
    const missingCount = analysisItems.filter(i => i.status !== 'ok').length;
    const canProduce = missingCount === 0;

    function renderAnalysisTable(items: AnalysisItem[], title?: string) {
        // Calculate missing for this batch
        const missing = items.filter(i => i.status !== 'ok').length;

        return (
            <div className="space-y-2 mb-6" key={title}>
                {title && (
                    <div className="flex items-center justify-between bg-zinc-50 p-2 rounded border">
                        <h3 className="font-bold text-lg capitalize flex items-center gap-2">
                            <Box className="h-5 w-5 text-zinc-500" /> Estoque: {title}
                        </h3>
                        <div className="text-sm">
                            {missing === 0 ? (
                                <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Tudo Disponível</span>
                            ) : (
                                <span className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {missing} Itens em Falta</span>
                            )}
                        </div>
                    </div>
                )}

                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Componente</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Necessário</TableHead>
                                <TableHead className="text-right">Disponível</TableHead>
                                <TableHead className="text-right">Saldo Final</TableHead>
                                <TableHead className="text-center">Ação Recomendada</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>
                                        <span className={`text-[10px] uppercase px-2 py-1 rounded font-bold ${item.type === 'ingredient' ? 'bg-zinc-100 text-zinc-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {item.type === 'ingredient' ? 'Insumo' : 'Intermediário'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">{item.requiredQty.toFixed(2)} {item.unit}</TableCell>
                                    <TableCell className="text-right text-zinc-500">{item.currentStock.toFixed(2)} {item.unit}</TableCell>
                                    <TableCell className={`text-right font-bold ${item.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {item.balance.toFixed(2)} {item.unit}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {item.status === 'ok' && <span className="text-green-600 flex justify-center"><CheckCircle2 className="h-4 w-4" /></span>}
                                        {item.status === 'buy' && (
                                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
                                                <ShoppingCart className="h-3 w-3" /> Comprar
                                            </span>
                                        )}
                                        {item.status === 'produce' && (
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" /> Produzir
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-blue-500" />
                        {existingOrder ? "Análise de Disponibilidade (OP Existente)" : "Planejamento de Produção"}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 px-1">
                    {!existingOrder ? (
                        <div className="flex flex-col h-full">
                            <Tabs value={currentTab} onValueChange={(v: any) => { setCurrentTab(v); setStep('input'); }} className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-4">
                                    <TabsTrigger value="single">Simulação Individual</TabsTrigger>
                                    <TabsTrigger value="batch">Análise Geral (OPs Abertas)</TabsTrigger>
                                </TabsList>

                                <TabsContent value="single" className="mt-0">
                                    {step === 'input' ? (
                                        <div className="space-y-6 max-w-lg mx-auto mt-8">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Produto a Produzir</label>
                                                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione um produto..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">
                                                        Quantidade
                                                        {selectedProductId && (
                                                            <span className="ml-1 text-zinc-500 font-normal">
                                                                ({products.find(p => p.id === selectedProductId)?.unit || 'un'})
                                                            </span>
                                                        )}
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={quantity}
                                                        onChange={e => setQuantity(Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Usar Estoque de:</label>
                                                    <Select value={stockSource} onValueChange={(v: any) => setStockSource(v)}>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="danilo">Danilo</SelectItem>
                                                            <SelectItem value="adriel">Adriel</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="pt-4">
                                                <Button className="w-full" size="lg" onClick={() => handleSimulate()} disabled={!selectedProductId || loading}>
                                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                                                    Simular Produção
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        // Single Result
                                        <div className="space-y-6">
                                            {/* Header Summary */}
                                            <div className="grid grid-cols-3 gap-4">
                                                <Card>
                                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Resultado</CardTitle></CardHeader>
                                                    <CardContent>
                                                        <div className={`text-2xl font-bold flex items-center gap-2 ${canProduce ? 'text-green-600' : 'text-amber-600'}`}>
                                                            {canProduce ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                                                            {canProduce ? "Viável" : "Restrições"}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                                <Card>
                                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Itens em Falta</CardTitle></CardHeader>
                                                    <CardContent>
                                                        <div className="text-2xl font-bold text-red-600">{missingCount}</div>
                                                    </CardContent>
                                                </Card>
                                                <Card>
                                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Estoque Selecionado</CardTitle></CardHeader>
                                                    <CardContent>
                                                        <div className="text-2xl font-bold capitalize">{stockSource}</div>
                                                    </CardContent>
                                                </Card>
                                            </div>
                                            {renderAnalysisTable(analysisItems)}
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="batch" className="mt-0">
                                    {step === 'input' ? (
                                        <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
                                            <div className="bg-blue-50 p-4 rounded-full">
                                                <ClipboardList className="h-12 w-12 text-blue-500" />
                                            </div>
                                            <h3 className="text-xl font-semibold">Analisar {openOrders.length} Ordens em Aberto</h3>
                                            <p className="text-zinc-500 max-w-md">
                                                O sistema irá calcular a necessidade total de insumos para todas as {openOrders.length} ordens abertas, respeitando a fonte de estoque (Danilo/Adriel) definida em cada ordem.
                                            </p>
                                            <Button size="lg" onClick={handleBatchSimulate} disabled={loading || openOrders.length === 0} className="mt-4">
                                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                                                Gerar Relatório Geral
                                            </Button>
                                        </div>
                                    ) : (
                                        // Batch Result
                                        <div className="space-y-8">
                                            {batchAnalysisItems.length === 0 && <div className="text-center py-8 text-zinc-500">Nenhuma pendência encontrada ou erro ao processar.</div>}
                                            {batchAnalysisItems.map(batch => renderAnalysisTable(batch.items, batch.source))}
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    ) : (
                        // Existing Order Analysis (Original View)
                        step === 'input' ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                        ) : (
                            <div className="space-y-6">
                                {/* Header Summary for Existing Order */}
                                <div className="grid grid-cols-3 gap-4">
                                    <Card>
                                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Resultado</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className={`text-2xl font-bold flex items-center gap-2 ${canProduce ? 'text-green-600' : 'text-amber-600'}`}>
                                                {canProduce ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                                                {canProduce ? "Viável" : "Restrições"}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Itens em Falta</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold text-red-600">{missingCount}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Estoque Selecionado</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold capitalize">{stockSource}</div>
                                        </CardContent>
                                    </Card>
                                </div>
                                {renderAnalysisTable(analysisItems)}
                            </div>
                        )
                    )}
                </div>

                <DialogFooter className="border-t pt-4">
                    {step === 'input' && !existingOrder ? (
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    ) : (
                        <>
                            {!existingOrder && <Button variant="outline" onClick={() => setStep('input')}>Voltar</Button>}
                            <Button variant="outline" onClick={onClose}>{existingOrder ? 'Fechar' : 'Sair'}</Button>

                            {/* Only show Create button if in Single Mode and not existing order */}
                            {!existingOrder && currentTab === 'single' && step === 'analysis' && (
                                <Button onClick={handleCreateOrder} disabled={loading} className={canProduce ? "bg-green-600 hover:bg-green-700" : ""}>
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {canProduce ? "Confirmar e Criar OP" : "Criar OP (Mesmo com pendências)"}
                                </Button>
                            )}
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
