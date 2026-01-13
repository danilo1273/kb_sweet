
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
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
    CreditCard,
    Banknote,
    QrCode,
    ArrowLeft,
    Loader2,
    Package,
    Store,
    ShoppingCart,
    Plus,
    Minus,
    Check
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { usePOS } from "@/hooks/usePOS"; // Import Hook
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
    const [loading, setLoading] = useState(true);

    // Filter
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    // Order State
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [selectedClient, setSelectedClient] = useState<string | null>(null);
    const [stockSource, setStockSource] = useState<'danilo' | 'adriel'>('danilo');

    // Checkout State
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState("money");
    const [globalDiscount, setGlobalDiscount] = useState<number>(0);


    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const { data: prodData } = await supabase.from('products').select('*').order('name');
        const { data: clientData } = await supabase.from('clients').select('id, name').order('name');
        setProducts(prodData || []);
        setClients(clientData || []);
        setLoading(false);
    }

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const uniqueCategories = Array.from(new Set(products.map(p => p.category))).sort();

    // --- Actions ---

    // DIRECT ADD TO CART (No Dialog)
    const handleProductClick = (product: Product) => {
        setOrderItems(prev => {
            // Check if already exists
            const existing = prev.find(i => i.product.id === product.id);
            if (existing) {
                // Increment qty
                return prev.map(i => i.tempId === existing.tempId ? {
                    ...i,
                    quantity: i.quantity + 1,
                    total: (i.quantity + 1) * i.unit_price
                } : i);
            }
            // Add new
            return [...prev, {
                tempId: crypto.randomUUID(),
                product,
                quantity: 1,
                unit_price: product.price,
                total: product.price
            }];
        });
    };

    // INLINE EDITING
    const updateItem = (tempId: string, field: 'quantity' | 'unit_price' | 'total', value: number) => {
        const val = isNaN(value) ? 0 : Math.max(0, value);
        setOrderItems(prev => prev.map(item => {
            if (item.tempId !== tempId) return item;

            if (field === 'total') {
                const newTotal = val;
                // Avoid division by zero
                const newUnitPrice = item.quantity > 0 ? newTotal / item.quantity : 0;
                return {
                    ...item,
                    total: newTotal,
                    unit_price: Number(newUnitPrice.toFixed(4)) // Higher precision for calc
                };
            }

            const newValues = {
                ...item,
                [field]: val
            };
            newValues.total = newValues.quantity * newValues.unit_price;
            return newValues;
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
            paymentMethod,
            selectedClient,
            stockSource
        );

        if (success) {
            setOrderItems([]);
            setGlobalDiscount(0);
            setIsCheckoutOpen(false);
            loadData(); // Reload stock
            toast({ title: "Venda realizada!", description: "Redirecionando para histórico..." });
            navigate('/sales');
        }
    };


    return (
        <div className="h-screen flex flex-col md:flex-row bg-zinc-100 overflow-hidden">
            {/* LEFT PANEL: CATALOG */}
            <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-hidden border-r border-zinc-200">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Store className="h-5 w-5 text-zinc-700" />
                        Catálogo de Produtos
                    </h1>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/sales')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-3 mb-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                        <Input
                            className="pl-10 h-10 bg-white shadow-sm border-zinc-200"
                            placeholder="Buscar por nome..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Categories Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-2">
                    <Button
                        variant={selectedCategory === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory('all')}
                        className="rounded-full whitespace-nowrap"
                    >
                        Todos
                    </Button>
                    {uniqueCategories.map(c => (
                        <Button
                            key={c}
                            variant={selectedCategory === c ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory(c)}
                            className="rounded-full whitespace-nowrap"
                        >
                            {c}
                        </Button>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredProducts.map(product => {
                            const stock = stockSource === 'danilo' ? product.stock_danilo : product.stock_adriel;
                            const hasStock = stock > 0;
                            return (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductClick(product)}
                                    className="bg-white rounded-xl p-0 border border-zinc-100 shadow-sm cursor-pointer hover:shadow-lg transition-all active:scale-95 group overflow-hidden"
                                >
                                    <div className="h-24 bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center relative">
                                        <span className="text-3xl font-black text-blue-100 group-hover:text-blue-200 transition-colors uppercase">
                                            {product.name.substring(0, 2)}
                                        </span>
                                        <div className="absolute right-2 top-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded text-xs font-bold text-green-700 shadow-sm">
                                            R$ {product.price.toFixed(2)}
                                        </div>
                                    </div>

                                    <div className="p-3">
                                        <h3 className="font-bold text-sm text-zinc-700 line-clamp-2 leading-tight min-h-[2.5rem] mb-2">{product.name}</h3>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className={cn("font-medium px-1.5 py-0.5 rounded", hasStock ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-500")}>
                                                {hasStock ? `${stock} unid.` : "Sem Estoque"}
                                            </span>
                                            <Button size="icon" className="h-6 w-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: CART */}
            <div className="w-full md:w-[480px] bg-white shadow-2xl flex flex-col z-10 border-l border-zinc-300">
                <div className="p-3 bg-zinc-800 text-white flex justify-between items-center shadow-md">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        <span className="font-bold text-lg">Carrinho ({orderItems.length})</span>
                    </div>
                    {/* Stock Source Toggle Header */}
                    <Select value={stockSource} onValueChange={(v: any) => setStockSource(v)}>
                        <SelectTrigger className="w-[140px] h-8 bg-zinc-700 border-zinc-600 text-white text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="danilo">Estoque DANILO</SelectItem>
                            <SelectItem value="adriel">Estoque ADRIEL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 overflow-y-auto bg-zinc-50 p-2 space-y-2">
                    {orderItems.map(item => (
                        <div key={item.tempId} className="bg-white p-2 rounded border border-zinc-200 shadow-sm flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate text-zinc-800">{item.product.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {/* QTY INPUT */}
                                    <div className="flex items-center border rounded-md">
                                        <Button size="icon" variant="ghost" className="h-6 w-6 rounded-none text-zinc-500" onClick={() => updateItem(item.tempId, 'quantity', item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                                        <input
                                            className="w-10 text-center text-sm font-bold border-none h-6 focus:ring-0 p-0"
                                            value={item.quantity}
                                            onChange={e => updateItem(item.tempId, 'quantity', Number(e.target.value))}
                                            type="number"
                                        />
                                        <Button size="icon" variant="ghost" className="h-6 w-6 rounded-none text-zinc-500" onClick={() => updateItem(item.tempId, 'quantity', item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                                    </div>
                                    <span className="text-zinc-400 text-xs">x</span>
                                    {/* PRICE INPUT */}
                                    <div className="relative">
                                        <span className="absolute left-1 top-1 text-xs text-zinc-400">R$</span>
                                        <input
                                            className="w-20 text-right text-sm font-bold border rounded-md h-7 pl-4 focus:border-blue-500 outline-none"
                                            value={item.unit_price}
                                            onChange={e => updateItem(item.tempId, 'unit_price', Number(e.target.value))}
                                            type="number"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="relative w-24">
                                    <span className="absolute left-1 top-1 text-xs text-zinc-400">R$ Total</span>
                                    <input
                                        className="w-full text-right text-sm font-bold border rounded-md h-7 pl-4 focus:border-green-500 outline-none text-green-700 bg-green-50"
                                        value={item.total.toFixed(2)}
                                        onChange={e => updateItem(item.tempId, 'total' as any, Number(e.target.value))}
                                        type="number"
                                        step="0.01"
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-300 hover:text-red-500" onClick={() => removeOrderItem(item.tempId)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    {orderItems.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-400 opacity-50 space-y-2">
                            <Package className="h-16 w-16" />
                            <p>Selecione produtos para vender</p>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-white border-t border-zinc-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                    <div className="flex gap-2 mb-3">
                        <Select value={selectedClient || ''} onValueChange={setSelectedClient}>
                            <SelectTrigger className="h-10 bg-zinc-50 flex-1">
                                <SelectValue placeholder="Selectionar Cliente..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="anonymous">Consumidor Final</SelectItem>
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

                    <div className="flex justify-between items-end mb-4">
                        <div className="text-sm text-zinc-500">
                            {orderItems.length} itens
                        </div>
                        <div className="text-right">
                            <span className="text-sm text-zinc-400 block">Total a Pagar</span>
                            <span className="text-3xl font-black text-zinc-900 tracking-tighter">R$ {total.toFixed(2)}</span>
                        </div>
                    </div>

                    <Button
                        size="lg"
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-14 text-lg shadow-lg shadow-green-900/10"
                        disabled={orderItems.length === 0}
                        onClick={() => setIsCheckoutOpen(true)}
                    >
                        FINALIZAR VENDA
                    </Button>
                </div>
            </div>

            {/* CHECKOUT DIALOG */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Confirmar Pagamento</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4">
                        {[
                            { id: 'money', label: 'Dinheiro', icon: Banknote },
                            { id: 'pix', label: 'PIX', icon: QrCode },
                            { id: 'credit_card', label: 'Crédito', icon: CreditCard },
                            { id: 'debit_card', label: 'Débito', icon: CreditCard },
                        ].map(m => (
                            <Button
                                key={m.id}
                                variant={paymentMethod === m.id ? "default" : "outline"}
                                className={cn("h-16 flex flex-col gap-1", paymentMethod === m.id && "bg-blue-600 hover:bg-blue-700")}
                                onClick={() => setPaymentMethod(m.id)}
                            >
                                <m.icon className="h-5 w-5" />
                                {m.label}
                            </Button>
                        ))}
                    </div>
                    <div className="bg-zinc-100 p-3 rounded text-center mb-4">
                        <p className="text-zinc-600 text-sm">Lucro Estimado para esta venda</p>
                        <p className="font-bold text-green-700">R$ {estimatedProfit.toFixed(2)} ({marginPercent.toFixed(0)}%)</p>
                    </div>
                    <Button onClick={handleFinalizeSale} className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg font-bold" disabled={processingSale}>
                        {processingSale ? <Loader2 className="animate-spin" /> : "CONFIRMAR PAGAMENTO"}
                    </Button>
                </DialogContent>
            </Dialog>
        </div>
    );
}
