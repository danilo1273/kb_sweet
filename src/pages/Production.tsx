import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Loader2 } from "lucide-react";

interface Product {
    id: string;
    name: string;
    stock_quantity: number;
    cost: number;
}

interface ProductionOrder {
    id: string;
    created_at: string;
    product_id: string;
    quantity: number;
    status: string;
    user_id: string;
    products?: Product;
    profiles?: { email: string };
    cost_at_production: number;
}

interface BomItem {
    ingredient_id: string;
    quantity: number; // Qty per unit of product
    unit: string;
    ingredients: {
        id: string;
        name: string;
        stock_danilo: number;
        stock_adriel: number;
        unit_weight: number;
        unit_type: string;
        cost: number;
    };
}

export default function Production() {
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [stockSource, setStockSource] = useState<'danilo' | 'adriel' | ''>('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulatedBom, setSimulatedBom] = useState<BomItem[]>([]);
    const [canProduce, setCanProduce] = useState(false);
    const [productionCost, setProductionCost] = useState(0);

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        const { data: ords, error: errOrders } = await supabase
            .from('production_orders')
            .select('*, products(name, stock_quantity, cost), profiles(email)')
            .order('created_at', { ascending: false });

        const { data: prods } = await supabase
            .from('products')
            .select('*')
            .order('name');

        if (errOrders) toast({ variant: 'destructive', title: 'Erro ao carregar', description: errOrders.message });
        else setOrders(ords || []);

        if (prods) setProducts(prods);
        setLoading(false);
    }

    // Simulation: Calculate ingredients needed and check stock
    useEffect(() => {
        if (selectedProductId && quantity > 0 && stockSource) {
            simulateProduction();
        } else {
            setSimulatedBom([]);
            setCanProduce(false);
        }
    }, [selectedProductId, quantity, stockSource]);

    async function simulateProduction() {
        setIsSimulating(true);
        setCanProduce(true);

        // Fetch BOM for product
        const { data: bomData } = await supabase
            .from('product_bom')
            .select('*, ingredients(*)')
            .eq('product_id', selectedProductId);

        if (!bomData) {
            setSimulatedBom([]);
            setIsSimulating(false);
            return;
        }

        const items: BomItem[] = bomData.map((item: any) => ({
            ingredient_id: item.ingredient_id,
            quantity: item.quantity,
            unit: item.unit,
            ingredients: item.ingredients
        }));

        let producible = true;
        let totalBatchCost = 0;

        const simulated = items.map(item => {
            // Conversion logic (reuse from Recipes roughly or simplified)
            let qtyNeeded = item.quantity * quantity; // Total needed for Batch

            // Adjust based on Unit?
            // Assuming item.quantity is ALREADY in the unit specified in BOM.
            // If BOM says 200g, and unit is 'g', needed is 200 * qty.
            // If BOM says 1 'un', needed is 1 * qty.

            // Availability check
            const available = stockSource === 'danilo' ? item.ingredients.stock_danilo : item.ingredients.stock_adriel;

            // Normalize available to BOM unit? 
            // Inventory 'stock_danilo' is in 'item.ingredients.unit'.
            // BOM 'quantity' and 'unit' might differ.
            // COMPLEXITY: We need to normalize units.

            // Simplification: Assume BOM unit matches Inventory unit OR handle g/kg/l/ml.
            let qtyNeededNormal = qtyNeeded;

            // If BOM is kg and Stock is g -> *1000
            if (item.unit === 'kg' && item.ingredients.unit_type === 'weight') qtyNeededNormal = qtyNeeded * 1000;
            if (item.unit === 'l' && item.ingredients.unit_type === 'volume') qtyNeededNormal = qtyNeeded * 1000;

            // If BOM is g and Stock is kg (unlikely, stock usually base unit).
            // Assume Stock is ALWAYS stored in base units (g, ml, un) as implied by 'unit_weight' logic in Inventory.
            // Inventory.tsx doesn't enforce unit types on stock columns yet, just labels.
            // But let's assume standard names.

            const isEnough = available >= qtyNeededNormal;
            if (!isEnough) producible = false;

            // Cost calculation
            // Cost of ingredient per base unit
            const costPerBase = item.ingredients.unit_weight && item.ingredients.cost
                ? item.ingredients.cost / item.ingredients.unit_weight
                : 0;

            totalBatchCost += costPerBase * qtyNeededNormal;

            return {
                ...item,
                needed: qtyNeededNormal,
                available,
                isEnough
            };
        });

        setSimulatedBom(simulated as any);
        setCanProduce(producible);
        setProductionCost(totalBatchCost);
        setIsSimulating(false);
    }

    async function handleProduce() {
        if (!canProduce) return;
        setIsSaving(true);

        try {
            const product = products.find(p => p.id === selectedProductId);
            if (!product) throw new Error("Produto não encontrado");

            // 1. Deduct Stock from Ingredients
            for (const item of simulatedBom) {
                const { needed, ingredients } = item as any;
                const field = stockSource === 'danilo' ? 'stock_danilo' : 'stock_adriel';

                const newStock = ingredients[field] - needed;

                const { error } = await supabase.from('ingredients')
                    .update({ [field]: newStock })
                    .eq('id', ingredients.id);

                if (error) throw new Error(`Falha ao baixar estoque de ${ingredients.name}`);
            }

            // 2. Add Stock to Product & Update Average Cost
            // New Cost Formula: ((CurrQty * CurrCost) + (NewQty * NewBatchUnitCost)) / (CurrQty + NewQty)

            const currentQty = product.stock_quantity || 0;
            const currentCost = product.cost || 0;
            const batchUnitCost = productionCost / quantity;

            const newTotalQty = currentQty + quantity;
            const newAvgCost = ((currentQty * currentCost) + (quantity * batchUnitCost)) / newTotalQty;

            const { error: prodError } = await supabase.from('products')
                .update({
                    stock_quantity: newTotalQty,
                    cost: newAvgCost
                })
                .eq('id', selectedProductId);

            if (prodError) throw new Error("Falha ao atualizar estoque do produto");

            // 3. Create Production Order Log
            const { error: ordError } = await supabase.from('production_orders').insert([{
                product_id: selectedProductId,
                quantity: quantity,
                status: 'completed',
                user_id: (await supabase.auth.getUser()).data.user?.id,
                cost_at_production: batchUnitCost
            }]);

            if (ordError) throw new Error("Falha ao criar registro de ordem");

            toast({ title: "Produção concluída!", description: `${quantity}un de ${product.name} adicionados.` });
            setIsDialogOpen(false);
            fetchData();

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
                    <p className="text-zinc-500">Registre produção e atualize estoques automaticamente.</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)} className="bg-zinc-900 text-white hover:bg-zinc-800">
                    <Plus className="mr-2 h-4 w-4" /> Nova Produção
                </Button>
            </div>

            <div className="bg-white rounded-lg border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead>Qtd Produzida</TableHead>
                            <TableHead>Custo Unit. (Produção)</TableHead>
                            <TableHead>Estoque Atual</TableHead>
                            <TableHead>Usuário</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? <TableRow><TableCell colSpan={6} className="text-center py-4"><Loader2 className="animate-spin" /></TableCell></TableRow> :
                            orders.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-4">Nenhuma ordem registrada.</TableCell></TableRow> :
                                orders.map(order => (
                                    <TableRow key={order.id}>
                                        <TableCell>{new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                                        <TableCell className="font-medium">{order.products?.name}</TableCell>
                                        <TableCell>{order.quantity}</TableCell>
                                        <TableCell>R$ {order.cost_at_production?.toFixed(2)}</TableCell>
                                        <TableCell>{order.products?.stock_quantity}</TableCell>
                                        <TableCell>{order.profiles?.email}</TableCell>
                                    </TableRow>
                                ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Nova Produção</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Produto</Label>
                                <Select onValueChange={setSelectedProductId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {products.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Quantidade a Produzir</Label>
                                <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Origem da Matéria Prima</Label>
                                <Select value={stockSource} onValueChange={(v: any) => setStockSource(v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="danilo">Estoque Danilo</SelectItem>
                                        <SelectItem value="adriel">Estoque Adriel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {selectedProductId && stockSource && (
                            <div className="border rounded-md p-4 bg-zinc-50">
                                <h4 className="font-semibold mb-2">Simulação de Matéria Prima</h4>
                                {isSimulating ? <Loader2 className="animate-spin" /> :
                                    simulatedBom.length === 0 ? <p className="text-sm text-muted-foreground">Este produto não possui ficha técnica cadastrada.</p> :
                                        (
                                            <div className="space-y-2">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Ingrediente</TableHead>
                                                            <TableHead>Necessário</TableHead>
                                                            <TableHead>Disponível ({stockSource})</TableHead>
                                                            <TableHead>Status</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {simulatedBom.map((item: any) => (
                                                            <TableRow key={item.ingredient_id}>
                                                                <TableCell>{item.ingredients.name}</TableCell>
                                                                <TableCell>{item.needed?.toFixed(2)} {item.ingredients.unit}</TableCell>
                                                                <TableCell>{item.available?.toFixed(2)} {item.ingredients.unit}</TableCell>
                                                                <TableCell>
                                                                    {item.isEnough ?
                                                                        <span className="text-green-600 font-bold">OK</span> :
                                                                        <span className="text-red-500 font-bold">FALTA</span>}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                                {!canProduce && <p className="text-red-600 font-bold text-sm text-center">Material insuficiente para produção.</p>}
                                                <div className="text-right text-sm text-zinc-600 pt-2">
                                                    Custo Estimado do Lote: <strong>R$ {productionCost.toFixed(2)}</strong> (R$ {(productionCost / quantity).toFixed(2)}/un)
                                                </div>
                                            </div>
                                        )
                                }
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleProduce} disabled={!canProduce || isSaving || !selectedProductId}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Produção
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


