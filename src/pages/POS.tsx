
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Dialog imports removed
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
    Search,
    Trash2,
    ArrowLeft,
    Loader2,
    ShoppingCart,
    Plus,
    Minus
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { usePOS } from "@/hooks/usePOS"; // Import Hook
import { StockConsultationDialog } from "@/components/pos/StockConsultationDialog";
import { POSProduct as Product, POSOrderItem as OrderItem } from "@/types";

interface Client {
    id: string;
    name: string;
}


export default function POS() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { processSale, loading: processingSale } = usePOS();


    // Data
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    // Filter & Search
    const [searchTerm, setSearchTerm] = useState("");
    const [showResults, setShowResults] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Order State
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [selectedClient, setSelectedClient] = useState<string | null>(null);
    const [stockSource, setStockSource] = useState<string>('');

    // Checkout State
    const [globalDiscount, setGlobalDiscount] = useState<number>(0);
    const [stockLocations, setStockLocations] = useState<{ id: string, name: string, slug: string }[]>([]);


    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        // Fetch Locations
        const { data: locData } = await supabase.from('stock_locations').select('id, name, slug').order('created_at');
        if (locData) {
            setStockLocations(locData);
            // Default to Danilo or first one
            const def = locData.find(l => l.slug === 'stock-danilo') || locData[0];
            if (def && !stockSource) setStockSource(def.id);
            // If stockSource is already set (legacy 'danilo' string?), we should map it if possible, 
            // but for now let's reset to valid ID if current value is definitely invalid UUID.
            // Actually, we'll handle the type change of stockSource below.
        }

        const { data: prodData } = await supabase.from('products')
            .select(`
                *, 
                product_stocks (
                    quantity,
                    location_id
                )
            `)
            .order('name');

        const { data: clientData } = await supabase.from('clients').select('id, name').order('name');
        setProducts(prodData || []);
        setClients(clientData || []);
    }

    const filteredProducts = products.filter(p => {
        if (!searchTerm) return false;
        return p.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    // --- Actions ---

    const handleProductSelect = (product: Product) => {
        setOrderItems(prev => {
            const existing = prev.find(i => i.product.id === product.id);
            if (existing) {
                return prev.map(i => i.tempId === existing.tempId ? {
                    ...i,
                    quantity: i.quantity + 1,
                    total: (i.quantity + 1) * i.unit_price
                } : i);
            }
            return [...prev, {
                tempId: crypto.randomUUID(),
                product,
                quantity: 1,
                unit_price: product.price,
                total: product.price
            }];
        });
        setSearchTerm("");
        setShowResults(false);
        searchInputRef.current?.focus();
    };

    // INLINE EDITING
    const updateItem = (tempId: string, field: 'quantity' | 'unit_price' | 'total', value: number) => {
        const val = isNaN(value) ? 0 : Math.max(0, value);
        setOrderItems(prev => prev.map(item => {
            if (item.tempId !== tempId) return item;

            if (field === 'total') {
                const newTotal = val;
                // Calcule unit price based on total / qty
                const newUnitPrice = item.quantity > 0 ? newTotal / item.quantity : 0;
                return {
                    ...item,
                    total: newTotal,
                    unit_price: Number(newUnitPrice.toFixed(4))
                };
            }

            if (field === 'unit_price') {
                const newUnitPrice = val;
                const newTotal = item.quantity * newUnitPrice;
                return {
                    ...item,
                    unit_price: newUnitPrice,
                    total: newTotal
                };
            }

            // If changing quantity, update total
            const newQuantity = val;
            const newTotal = newQuantity * item.unit_price;
            return {
                ...item,
                quantity: newQuantity,
                total: newTotal
            };
        }));
    };

    const removeOrderItem = (tempId: string) => {
        setOrderItems(prev => prev.filter(i => i.tempId !== tempId));
    };

    // --- Calculations ---

    const subtotal = orderItems.reduce((acc, item) => acc + item.total, 0);
    const total = Math.max(0, subtotal - globalDiscount);
    const totalCost = orderItems.reduce((acc, item) => acc + (item.product.cost * item.quantity), 0);
    const estimatedProfit = total - totalCost;
    const marginPercent = total > 0 ? (estimatedProfit / total) * 100 : 0;

    const handleFinalizeSale = async () => {
        if (orderItems.length === 0) return;

        const success = await processSale(
            orderItems,
            total,
            globalDiscount,
            'pending', // Default payment method for pending sales
            selectedClient,
            stockSource
        );

        if (success) {
            setOrderItems([]);
            setGlobalDiscount(0);
            loadData(); // Reload stock
            toast({ title: "Venda realizada!", description: "Redirecionando para histórico..." });
            navigate('/sales');
        }
    };

    return (
        <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
            {/* TOP HEADER & SEARCH */}
            <div className="bg-white border-b border-zinc-200 z-30 shadow-sm shrink-0">
                <div className="p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-800 font-bold text-lg">
                            <Button variant="ghost" size="icon" onClick={() => navigate('/sales')} className="-ml-2">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            Novo Pedido
                        </div>
                        <div className="flex gap-2">
                            <StockConsultationDialog
                                onAddProduct={handleProductSelect}
                                stockSource={stockSource}
                                cartItems={orderItems}
                            />
                            <Select value={stockSource} onValueChange={(v) => setStockSource(v)}>
                                <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-100 border-zinc-200">
                                    <SelectValue placeholder="Local de Estoque" />
                                </SelectTrigger>
                                <SelectContent>
                                    {stockLocations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="relative z-40">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                        <Input
                            ref={searchInputRef}
                            className="pl-10 h-10 bg-zinc-50 border-zinc-200"
                            placeholder="Buscar produto para adicionar..."
                            value={searchTerm}
                            onChange={e => {
                                setSearchTerm(e.target.value);
                                setShowResults(true);
                            }}
                            onFocus={() => setShowResults(true)}
                        />
                        {showResults && searchTerm && (
                            <div className="absolute top-11 left-0 right-0 bg-white rounded-md border shadow-xl max-h-[300px] overflow-y-auto">
                                {filteredProducts.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">Nenhum produto encontrado</div>
                                ) : (
                                    filteredProducts.map(p => {
                                        // Find stock for selected source
                                        const stockEntry = p.product_stocks?.find((s: any) => s.location_id === stockSource);
                                        const stock = stockEntry ? stockEntry.quantity : 0;

                                        return (
                                            <button
                                                key={p.id}
                                                className="w-full text-left p-3 hover:bg-zinc-50 border-b last:border-0 flex justify-between items-center"
                                                onClick={() => handleProductSelect(p)}
                                            >
                                                <div>
                                                    <div className="font-medium text-sm">{p.name}</div>
                                                    <div className={cn("text-xs", stock > 0 ? "text-green-600" : "text-red-500")}>
                                                        Estoque: {stock} {p.unit}
                                                    </div>
                                                </div>
                                                <div className="font-bold text-zinc-700">R$ {p.price.toFixed(2)}</div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                        {showResults && searchTerm && (
                            <div className="fixed inset-0 z-[-1]" onClick={() => setShowResults(false)} />
                        )}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT - LIST */}
            <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-3 pb-32">
                {orderItems.length === 0 ? (
                    <EmptyState
                        icon={ShoppingCart}
                        title="Carrinho vazio"
                        description="Busque produtos acima para iniciar a venda."
                        className="mt-8"
                    />
                ) : (
                    orderItems.map(item => (
                        <div key={item.tempId} className="bg-white p-3 rounded-lg border border-zinc-200 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-zinc-800 line-clamp-1">{item.product.name}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 -mr-2 text-zinc-300 hover:text-red-500 hover:bg-red-50"
                                    onClick={() => removeOrderItem(item.tempId)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="flex gap-3 items-end">
                                {/* Qty */}
                                <div className="w-24 shrink-0">
                                    <Label className="text-[10px] text-zinc-400 uppercase font-bold">Qtd</Label>
                                    <div className="flex items-center border rounded-md h-9 mt-1 bg-zinc-50">
                                        <button className="px-2 h-full hover:bg-zinc-200 text-zinc-500 rounded-l-md" onClick={() => updateItem(item.tempId, 'quantity', item.quantity - 1)}><Minus className="h-3 w-3" /></button>
                                        <input
                                            className="w-full text-center bg-transparent font-bold text-sm outline-none"
                                            type="number"
                                            value={item.quantity}
                                            onChange={e => updateItem(item.tempId, 'quantity', Number(e.target.value))}
                                        />
                                        <button className="px-2 h-full hover:bg-zinc-200 text-zinc-500 rounded-r-md" onClick={() => updateItem(item.tempId, 'quantity', item.quantity + 1)}><Plus className="h-3 w-3" /></button>
                                    </div>
                                </div>

                                {/* Unit Price */}
                                <div className="flex-1 min-w-[80px]">
                                    <Label className="text-[10px] text-zinc-400 uppercase font-bold">Unitário (R$)</Label>
                                    <Input
                                        className="h-9 mt-1 font-medium bg-zinc-50 border-zinc-200"
                                        type="number"
                                        step="0.01"
                                        value={item.unit_price}
                                        onChange={e => updateItem(item.tempId, 'unit_price', Number(e.target.value))}
                                    />
                                </div>

                                {/* Total Price */}
                                <div className="flex-1 min-w-[80px]">
                                    <Label className="text-[10px] text-zinc-400 uppercase font-bold text-green-600">Total (R$)</Label>
                                    <Input
                                        className="h-9 mt-1 font-bold text-green-700 bg-green-50/50 border-green-200"
                                        type="number"
                                        step="0.01"
                                        value={item.total || ''}
                                        onChange={e => updateItem(item.tempId, 'total', parseFloat(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* BOTTOM FOOTER */}
            <div className="bg-white border-t border-zinc-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30 shrink-0">
                <div className="max-w-2xl mx-auto w-full space-y-4">
                    {/* Client & Discount */}
                    <div className="flex gap-2">
                        <Select value={selectedClient || ''} onValueChange={setSelectedClient}>
                            <SelectTrigger className="h-10 bg-zinc-50 flex-1">
                                <SelectValue placeholder="Selecione o Cliente..." />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Removed Consumers Final option as requested */}
                                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input
                            type="number"
                            className="w-24 text-right bg-zinc-50"
                            placeholder="Desc."
                            value={globalDiscount || ''}
                            onChange={e => setGlobalDiscount(Number(e.target.value))}
                        />
                    </div>

                    <div className="flex items-end justify-between">
                        <div className="text-zinc-500 text-sm">{orderItems.length} Itens</div>
                        <div className="flex flex-col items-end mr-4">
                            <div className="text-xs text-zinc-400 uppercase font-bold">Lucro Est.</div>
                            <div className={cn("text-lg font-bold", estimatedProfit >= 0 ? "text-green-600" : "text-red-500")}>
                                R$ {estimatedProfit.toFixed(2)}
                                <span className="text-xs ml-1 opacity-70">({marginPercent.toFixed(1)}%)</span>
                            </div>
                        </div>
                        <div className="text-right border-l pl-4">
                            <div className="text-xs text-zinc-400 uppercase font-bold">Total Final</div>
                            <div className="text-2xl font-black text-zinc-900 tracking-tight">R$ {total.toFixed(2)}</div>
                        </div>
                    </div>

                    <Button
                        size="lg"
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-12 text-lg"
                        disabled={orderItems.length === 0 || processingSale}
                        onClick={handleFinalizeSale}
                    >
                        {processingSale ? <Loader2 className="animate-spin mr-2" /> : "FINALIZAR VENDA (PENDENTE)"}
                    </Button>
                </div>
            </div>

        </div>
    );
}
