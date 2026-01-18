import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { Ingredient, Category } from "@/types";

interface InventoryAuditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    ingredients: Ingredient[];
    categories: Category[];
}

interface AuditItem {
    id: string;
    name: string;
    unit: string;
    systemStock: number;
    systemCost: number;
    newCost: string;
    physicalStock: string;
    diff: number;
    reason: string;
}

export function InventoryAuditDialog({ isOpen, onClose, onSuccess, ingredients, categories }: InventoryAuditDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [stockOwner, setStockOwner] = useState<'danilo' | 'adriel' | null>(null);

    // Filter Logic
    const filteredItems = auditItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());

        // Find original ingredient to check category
        const original = ingredients.find(i => i.id === item.id);
        const matchesCategory = categoryFilter === 'all' || (original && original.category === categoryFilter);

        return matchesSearch && matchesCategory;
    });

    useEffect(() => {
        if (!isOpen) {
            setAuditItems([]);
            setStockOwner(null);
        }
    }, [isOpen]);

    const startAudit = (owner: 'danilo' | 'adriel') => {
        setStockOwner(owner);
        // Initialize audit items based on current stock
        // Allow BOTH ingredients (type 'stock' or undefined) and products (is_product_entity=true)
        // Only exclude 'expense' type if it exists
        const validIngredients = ingredients.filter(i => i.type !== 'expense');
        const items = validIngredients.map(ing => {
            // Determine correct cost field based on owner
            // Assuming ingredients have cost_danilo/cost_adriel, fallback to 'cost'
            const currentCost = owner === 'danilo'
                ? (ing.cost_danilo !== undefined ? ing.cost_danilo : ing.cost)
                : (ing.cost_adriel !== undefined ? ing.cost_adriel : ing.cost);

            return {
                id: ing.id,
                name: ing.name,
                unit: ing.unit,
                systemStock: owner === 'danilo' ? (ing.stock_danilo || 0) : (ing.stock_adriel || 0),
                physicalStock: "",
                diff: 0,
                reason: "",
                systemCost: currentCost || 0,
                newCost: (currentCost || 0).toString()
            };
        });
        setAuditItems(items);
    };

    const handleStockChange = (id: string, value: string) => {
        setAuditItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const numVal = value === "" ? "" : Number(value);
            const diff = numVal === "" ? 0 : (Number(numVal) - item.systemStock);
            return { ...item, physicalStock: value, diff };
        }));
    };

    const handleCostChange = (id: string, value: string) => {
        setAuditItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            return { ...item, newCost: value };
        }));
    };

    const handleReasonChange = (id: string, value: string) => {
        setAuditItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            return { ...item, reason: value };
        }));
    };

    const handleSave = async () => {
        const itemsToAdjust = auditItems.filter(i =>
            (i.physicalStock !== "" && Number(i.physicalStock) !== i.systemStock) ||
            (i.newCost !== "" && Number(i.newCost) !== i.systemCost)
        );

        if (itemsToAdjust.length === 0) {
            toast({ title: "Nenhum ajuste identificado." });
            return;
        }

        if (!confirm(`Confirmar ajuste de estoque/custo para ${itemsToAdjust.length} itens?`)) return;

        setLoading(true);
        try {
            for (const item of itemsToAdjust) {
                // 1. Update Stock Quantity if changed
                if (item.physicalStock !== "" && Number(item.physicalStock) !== item.systemStock) {
                    const newStock = Number(item.physicalStock);

                    // Check if it's a product or ingredient
                    // We need to know this. The 'ingredients' array has this info.
                    const originalItem = ingredients.find(ing => ing.id === item.id);
                    // @ts-ignore
                    const isProduct = originalItem?.isProduct || originalItem?.is_product_entity;

                    if (isProduct) {
                        const { error } = await supabase.rpc('apply_product_stock_adjustment', {
                            p_product_id: item.id,
                            p_new_stock: newStock,
                            p_stock_owner: stockOwner,
                            p_reason: item.reason || 'Inventário',
                            p_type: newStock > item.systemStock ? 'found' : 'loss'
                        });
                        if (error) throw error;
                    } else {
                        const { error } = await supabase.rpc('apply_stock_adjustment', {
                            p_ingredient_id: item.id,
                            p_new_stock: newStock,
                            p_stock_owner: stockOwner,
                            p_reason: item.reason || 'Inventário',
                            p_type: newStock > item.systemStock ? 'found' : 'loss'
                        });
                        if (error) throw error;
                    }
                }

                // 2. Update Cost if changed
                // 2. Update Cost if changed
                if (item.newCost !== "" && Number(item.newCost) !== item.systemCost) {
                    const newCostVal = Number(item.newCost);

                    const originalItem = ingredients.find(ing => ing.id === item.id);
                    // @ts-ignore
                    const isProduct = originalItem?.isProduct || originalItem?.is_product_entity;

                    const updatePayload: any = {
                        cost: newCostVal // Always update master cost
                    };

                    // Update specific legacy column
                    if (stockOwner === 'danilo') updatePayload['cost_danilo'] = newCostVal;
                    else if (stockOwner === 'adriel') updatePayload['cost_adriel'] = newCostVal;

                    if (isProduct) {
                        const { error } = await supabase.from('products').update(updatePayload).eq('id', item.id);
                        if (error) throw error;
                    } else {
                        const { error } = await supabase.from('ingredients').update(updatePayload).eq('id', item.id);
                        if (error) throw error;
                    }

                    // 2.1 Update location-specific average_cost in product_stocks
                    const { data: locs } = await supabase.from('stock_locations').select('id, slug');
                    const targetLoc = locs?.find(l => l.slug === `stock-${stockOwner}`);

                    if (targetLoc) {
                        const { data: existingStock } = await supabase.from('product_stocks')
                            .select('id')
                            .eq('location_id', targetLoc.id)
                            .eq(isProduct ? 'product_id' : 'ingredient_id', item.id)
                            .maybeSingle();

                        if (existingStock) {
                            await supabase.from('product_stocks')
                                .update({ average_cost: newCostVal, last_updated: new Date().toISOString() })
                                .eq('id', existingStock.id);
                        } else {
                            const insertData: any = {
                                location_id: targetLoc.id,
                                average_cost: newCostVal,
                                quantity: 0,
                                last_updated: new Date().toISOString()
                            };
                            if (isProduct) insertData.product_id = item.id;
                            else insertData.ingredient_id = item.id;

                            await supabase.from('product_stocks').insert(insertData);
                        }
                    }
                }
            }
            toast({ title: "Inventário processado com sucesso!" });
            onSuccess();
            onClose();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao salvar", description: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl">Realizar Inventário ({stockOwner === 'danilo' ? 'Danilo' : stockOwner === 'adriel' ? 'Adriel' : '...'})</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2 gap-4">
                    {!stockOwner ? (
                        <div className="flex flex-col items-center justify-center h-full gap-8">
                            <h3 className="text-lg font-medium text-zinc-600">Selecione o estoque para auditar:</h3>
                            <div className="flex gap-4">
                                <Button size="lg" className="w-40 h-32 flex flex-col gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200" variant="outline" onClick={() => startAudit('danilo')}>
                                    <span className="text-3xl font-bold">DANILO</span>
                                    <span className="text-sm font-normal opacity-80">Estoque Pessoal</span>
                                </Button>
                                <Button size="lg" className="w-40 h-32 flex flex-col gap-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200" variant="outline" onClick={() => startAudit('adriel')}>
                                    <span className="text-3xl font-bold">ADRIEL</span>
                                    <span className="text-sm font-normal opacity-80">Estoque Pessoal</span>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Toolbar */}
                            <div className="flex gap-2 items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                                    <Input
                                        placeholder="Buscar item..."
                                        className="pl-8"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Categoria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {categories.map(c => <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Table */}
                            <div className="border rounded-md flex-1 overflow-auto bg-white">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-zinc-50 z-10">
                                        <TableRow>
                                            <TableHead className="w-[25%]">Item</TableHead>
                                            <TableHead className="w-[10%] text-right">Sistema</TableHead>
                                            <TableHead className="w-[15%] text-center bg-blue-50/50">Contagem Física</TableHead>
                                            <TableHead className="w-[10%] text-right">Diferença</TableHead>
                                            <TableHead className="w-[15%] text-center bg-amber-50/50">Custo Unit. (R$)</TableHead>
                                            <TableHead className="w-[25%]">Motivo / Obs.</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">Nenhum item encontrado.</TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredItems.map(item => (
                                                <TableRow key={item.id} className={item.diff !== 0 ? (item.diff > 0 ? "bg-green-50/30" : "bg-red-50/30") : ""}>
                                                    <TableCell className="font-medium">
                                                        {item.name}
                                                        <div className="text-[10px] text-zinc-400">{item.unit}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-zinc-500">
                                                        {item.systemStock.toLocaleString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell className="bg-blue-50/30 p-2 align-top">
                                                        <div className="flex flex-col gap-1">
                                                            {/* Primary Stock */}
                                                            <div className="relative">
                                                                <Input
                                                                    type="number"
                                                                    className="text-center font-bold h-7 text-xs pr-8"
                                                                    value={item.physicalStock}
                                                                    onChange={(e) => handleStockChange(item.id, e.target.value)}
                                                                    placeholder={String(item.systemStock)}
                                                                />
                                                                <span className="absolute right-2 top-1.5 text-[10px] text-zinc-400 pointer-events-none">
                                                                    {item.unit}
                                                                </span>
                                                            </div>

                                                            {/* Secondary Stock (if applicable) */}
                                                            {(() => {
                                                                const original = ingredients.find(i => i.id === item.id);

                                                                let factor = 1;
                                                                let secUnit = null;
                                                                let isRecipeUnit = false;

                                                                // Priority 1: Purchase Unit (Base / Factor = Sec)
                                                                if (original?.purchase_unit && original.purchase_unit.toLowerCase() !== item.unit.toLowerCase()) {
                                                                    secUnit = original.purchase_unit;
                                                                    factor = original.purchase_unit_factor || 1;
                                                                    isRecipeUnit = false;
                                                                }
                                                                // Priority 2: Recipe/Secondary Unit (Base * Factor = Sec)
                                                                else if (original?.unit_type && original.unit_type.toLowerCase() !== item.unit.toLowerCase()) {
                                                                    secUnit = original.unit_type;
                                                                    factor = original.unit_weight || 1;
                                                                    isRecipeUnit = true;
                                                                }

                                                                const showSecondary = !!secUnit && factor !== 1;

                                                                if (showSecondary) {
                                                                    const valNum = Number(item.physicalStock);
                                                                    const secVal = item.physicalStock === "" ? "" : (isRecipeUnit ? valNum * factor : valNum / factor);
                                                                    // Format to max 3 decimals for display to avoid ugly floats, but keep precision in calculation
                                                                    const displaySecVal = secVal === "" ? "" : Number(secVal).toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: false });

                                                                    return (
                                                                        <div className="relative">
                                                                            <Input
                                                                                type="number"
                                                                                className="text-center h-7 text-xs bg-blue-100/50 pr-8 text-blue-700"
                                                                                // We use text type or handle number specially to avoid floating point inputs locking up?
                                                                                // Let's rely on standard type="number" but realize it might fight with rounding.
                                                                                // Better: Controlled input.
                                                                                defaultValue={displaySecVal}
                                                                                onBlur={(e) => {
                                                                                    const val = parseFloat(e.target.value);
                                                                                    if (!isNaN(val)) {
                                                                                        // Reverse Logic
                                                                                        const baseVal = isRecipeUnit ? val / factor : val * factor;
                                                                                        handleStockChange(item.id, baseVal.toString());
                                                                                    } else if (e.target.value === "") {
                                                                                        handleStockChange(item.id, "");
                                                                                    }
                                                                                }}
                                                                                key={`${item.id}-sec-stock-${item.physicalStock}`} // Force re-render on base change to update defaultValue?
                                                                            // Actually, controlled value is better.
                                                                            />
                                                                            <span className="absolute right-2 top-1.5 text-[10px] text-blue-400 pointer-events-none">
                                                                                {secUnit}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={`text-right font-bold align-middle ${item.diff > 0 ? "text-green-600" : item.diff < 0 ? "text-red-600" : "text-zinc-300"}`}>
                                                        {item.diff > 0 ? `+${item.diff.toLocaleString('pt-BR')}` : item.diff.toLocaleString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell className="bg-amber-50/30 p-2 align-top">
                                                        <div className="flex flex-col gap-1">
                                                            {/* Primary Cost */}
                                                            <div className="relative">
                                                                <Input
                                                                    type="number"
                                                                    step="0.0001"
                                                                    className="text-center h-7 text-xs pr-8"
                                                                    value={item.newCost}
                                                                    onChange={(e) => handleCostChange(item.id, e.target.value)}
                                                                />
                                                                <span className="absolute right-2 top-1.5 text-[10px] text-zinc-400 pointer-events-none">
                                                                    /{item.unit}
                                                                </span>
                                                            </div>

                                                            {/* Secondary Cost (if applicable) OR Total Value */}
                                                            {(() => {
                                                                const original = ingredients.find(i => i.id === item.id);

                                                                let factor = 1;
                                                                let secUnit = null;
                                                                let isRecipeUnit = false;

                                                                if (original?.purchase_unit && original.purchase_unit.toLowerCase() !== item.unit.toLowerCase()) {
                                                                    secUnit = original.purchase_unit;
                                                                    factor = original.purchase_unit_factor || 1;
                                                                    isRecipeUnit = false;
                                                                }
                                                                else if (original?.unit_type && original.unit_type.toLowerCase() !== item.unit.toLowerCase()) {
                                                                    secUnit = original.unit_type;
                                                                    factor = original.unit_weight || 1;
                                                                    isRecipeUnit = true;
                                                                }

                                                                const showSecondary = !!secUnit && factor !== 1;

                                                                if (showSecondary) {
                                                                    // COST Logic (Inverse of Stock)
                                                                    const baseCost = Number(item.newCost) || 0;
                                                                    const secCost = isRecipeUnit ? baseCost / factor : baseCost * factor;

                                                                    const displaySecCost = secCost === 0 && item.newCost === "" ? "" : secCost.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false });

                                                                    return (
                                                                        <div className="relative">
                                                                            <Input
                                                                                type="number"
                                                                                step="0.01"
                                                                                className="text-center h-7 text-xs bg-amber-100/50 pr-8 text-amber-700"
                                                                                defaultValue={displaySecCost}
                                                                                onBlur={(e) => {
                                                                                    const val = parseFloat(e.target.value);
                                                                                    if (!isNaN(val)) {
                                                                                        // Reverse Logic
                                                                                        const baseVal = isRecipeUnit ? val * factor : val / factor;
                                                                                        handleCostChange(item.id, baseVal.toString());
                                                                                    }
                                                                                }}
                                                                                key={`${item.id}-sec-cost-${item.newCost}`}
                                                                            />
                                                                            <span className="absolute right-2 top-1.5 text-[10px] text-amber-600 pointer-events-none">
                                                                                /{secUnit}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                } else {
                                                                    // Show Total Value Option if no secondary unit
                                                                    // logic: Total = Qty * Cost.
                                                                    // If Qty is 0, we can't really set Unit Cost via Total.
                                                                    const qty = Number(item.physicalStock) || 0;
                                                                    const baseCost = Number(item.newCost) || 0;
                                                                    const totalVal = qty * baseCost;
                                                                    const displayTotal = totalVal === 0 && item.newCost === "" ? "" : totalVal.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });

                                                                    return (
                                                                        <div className="relative" title="Valor Total (Estoque)">
                                                                            <Input
                                                                                type="number"
                                                                                step="0.01"
                                                                                className="text-center h-7 text-xs bg-emerald-50 pr-8 text-emerald-700 border-emerald-200"
                                                                                placeholder="Total"
                                                                                disabled={qty === 0}
                                                                                defaultValue={displayTotal}
                                                                                onBlur={(e) => {
                                                                                    const val = parseFloat(e.target.value);
                                                                                    if (!isNaN(val) && qty > 0) {
                                                                                        handleCostChange(item.id, (val / qty).toString());
                                                                                    }
                                                                                }}
                                                                                key={`${item.id}-total-cost-${item.newCost}-${item.physicalStock}`}
                                                                            />
                                                                            <span className="absolute right-2 top-1.5 text-[10px] text-emerald-600 pointer-events-none">
                                                                                Total
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                }
                                                            })()}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {(Number(item.physicalStock) !== item.systemStock && item.physicalStock !== "") || (Number(item.newCost) !== item.systemCost) ? (
                                                            <Input
                                                                className="h-8 text-xs"
                                                                placeholder="Justificativa..."
                                                                value={item.reason}
                                                                onChange={(e) => handleReasonChange(item.id, e.target.value)}
                                                            />
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Summary */}
                            <div className="flex justify-between items-center pt-2 border-t">
                                <div className="text-sm text-zinc-500">
                                    <span className="text-zinc-900 font-bold">{auditItems.filter(i => (i.physicalStock !== "" && Number(i.physicalStock) !== i.systemStock) || (i.newCost !== "" && Number(i.newCost) !== i.systemCost)).length}</span> alterações pendentes.
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setStockOwner(null)}>Voltar</Button>
                                    <Button onClick={handleSave} disabled={loading} className="w-40">
                                        {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                        Finalizar
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
