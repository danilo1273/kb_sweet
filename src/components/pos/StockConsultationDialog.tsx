import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Table imports removed as we switched to Card layout
import { Search, PackageSearch, Loader2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";

import { POSProduct as Product, POSOrderItem as OrderItem } from "@/types";

// Removed local Product interface to match parent type

// ... imports

interface StockConsultationDialogProps {

    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    onAddProduct?: (product: Product) => void;

    stockSource?: string; // Location ID
    cartItems?: OrderItem[];
}

export function StockConsultationDialog({ isOpen, onOpenChange, onAddProduct, stockSource = '', cartItems = [] }: StockConsultationDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = isOpen !== undefined && onOpenChange !== undefined;
    const finalOpen = isControlled ? isOpen : internalOpen;
    const finalSetOpen = isControlled ? onOpenChange : setInternalOpen;

    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [addedFeedback, setAddedFeedback] = useState<Record<string, boolean>>({});

    const handleAdd = (product: Product) => {
        if (onAddProduct) {
            onAddProduct(product);
            setAddedFeedback(prev => ({ ...prev, [product.id]: true }));
            setTimeout(() => {
                setAddedFeedback(prev => ({ ...prev, [product.id]: false }));
            }, 1000);
        }
    };

    // Load stock when opened
    useEffect(() => {
        if (finalOpen) {
            loadStock();
        }
    }, [finalOpen]);

    useEffect(() => {
        if (!search.trim()) {
            setFilteredProducts(products);
        } else {
            const lowerSearchParams = search.toLowerCase();
            setFilteredProducts(products.filter(p => p.name.toLowerCase().includes(lowerSearchParams)));
        }
    }, [search, products]);

    const [locations, setLocations] = useState<any[]>([]);

    async function loadStock() {
        setLoading(true);

        // 1. Fetch Locations to map IDs to Slugs (for legacy fallback)
        const { data: locs } = await supabase.from('stock_locations').select('id, slug');
        setLocations(locs || []);

        // 2. Fetch Products with their stocks
        const { data } = await supabase.from('products')
            .select(`
                *,
                product_stocks (
                    quantity,
                    location_id,
                    average_cost
                )
            `)
            .neq('type', 'intermediate')
            .order('name');

        setProducts(data || []);
        setFilteredProducts(data || []);
        setLoading(false);
    }

    // ... (existing useEffects)

    return (
        <Dialog open={finalOpen} onOpenChange={finalSetOpen}>
            {!isControlled && (
                <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2 text-blue-700 bg-blue-50 border-blue-200">
                        <PackageSearch className="h-4 w-4" /> Ver Estoque
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Consulta Rápida de Estoque (Produtos Acabados)</DialogTitle>
                </DialogHeader>

                <div className="relative mb-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                    <Input
                        className="pl-10 bg-zinc-50"
                        placeholder="Buscar produto..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-auto p-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p>Carregando estoque...</p>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4 text-muted-foreground">
                            <PackageSearch className="h-12 w-12 opacity-20" />
                            <p>Nenhum produto encontrado.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredProducts.map(p => {
                                // Resolve Stock Logic
                                let currentStock = 0;

                                // 1. Try new product_stocks table first
                                const stockEntry = (p as any).product_stocks?.find((s: any) => s.location_id === stockSource);

                                if (stockEntry) {
                                    currentStock = stockEntry.quantity || 0;
                                } else {
                                    // 2. Fallback to Legacy Columns for safety
                                    const locationSlug = locations.find(l => l.id === stockSource)?.slug;

                                    if (locationSlug === 'stock-danilo') {
                                        currentStock = (p as any).stock_danilo || 0;
                                    } else if (locationSlug === 'stock-adriel') {
                                        currentStock = (p as any).stock_adriel || 0;
                                    } else if (!stockSource) {
                                        // If no source selected, sum everything available
                                        const sumNew = (p as any).product_stocks?.reduce((acc: number, s: any) => acc + (s.quantity || 0), 0) || 0;
                                        const sumLegacy = ((p as any).stock_danilo || 0) + ((p as any).stock_adriel || 0);
                                        currentStock = Math.max(sumNew, sumLegacy);
                                    }
                                }

                                // Calculate qty in cart
                                const qtyInCart = cartItems
                                    .filter(item => item.product.id === p.id)
                                    .reduce((acc, item) => acc + item.quantity, 0);

                                const availableStock = currentStock - qtyInCart;
                                const canAdd = availableStock > 0;
                                const isAddedFeedback = addedFeedback[p.id];

                                return (
                                    <div
                                        key={p.id}
                                        className={`
                                            relative flex flex-col p-3 rounded-xl border transition-all duration-200
                                            ${canAdd
                                                ? "bg-white border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-200"
                                                : "bg-zinc-50 border-zinc-100 opacity-80"
                                            }
                                        `}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-start gap-2 mb-2">
                                            <span className="font-semibold text-zinc-800 text-sm leading-tight line-clamp-2">
                                                {p.name}
                                            </span>
                                            <span className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded-md text-sm whitespace-nowrap">
                                                R$ {p.price.toFixed(2)}
                                            </span>
                                        </div>

                                        {/* Stock Info */}
                                        <div className="flex gap-2 mb-3 mt-auto">
                                            <div className={`flex-1 flex flex-col items-center p-1.5 rounded-md border bg-zinc-50 border-zinc-100`}>
                                                <span className="text-[10px] uppercase font-bold text-zinc-500 mb-0.5">Estoque</span>
                                                <Badge
                                                    variant={availableStock > 0 ? "outline" : "destructive"}
                                                    className={`h-5 px-1.5 text-[10px] ${availableStock > 0 ? 'bg-white' : ''}`}
                                                >
                                                    {availableStock} {p.unit}
                                                </Badge>
                                            </div>

                                            {/* Cart Info */}
                                            {qtyInCart > 0 && (
                                                <div className="flex flex-col items-center justify-center px-2">
                                                    <span className="text-[10px] uppercase font-bold text-blue-500 mb-0.5">Carrinho</span>
                                                    <span className="font-bold text-sm text-blue-700">
                                                        +{qtyInCart}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action */}
                                        {onAddProduct && (
                                            <Button
                                                size="sm"
                                                variant={canAdd ? "default" : "secondary"}
                                                disabled={!canAdd}
                                                onClick={() => handleAdd(p)}
                                                className={`
                                                    w-full font-bold shadow-sm transition-all duration-300
                                                    ${isAddedFeedback
                                                        ? "bg-green-600 hover:bg-green-700 scale-95"
                                                        : canAdd
                                                            ? "bg-blue-600 hover:bg-blue-700"
                                                            : ""
                                                    }
                                                `}
                                            >
                                                {isAddedFeedback ? "ADICIONADO! ✓" : canAdd ? "+ ADICIONAR" : "SEM ESTOQUE"}
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>


                <DialogFooter className="mt-4 border-t pt-4">
                    <Button variant="outline" onClick={() => finalSetOpen(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => finalSetOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
                        Concluir Seleção
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}
