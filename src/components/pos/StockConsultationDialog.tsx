import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, PackageSearch, Loader2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";

interface Product {
    id: string;
    name: string;
    stock_danilo: number;
    stock_adriel: number;
    unit: string;
    price: number;
}

interface StockConsultationDialogProps {
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function StockConsultationDialog({ isOpen, onOpenChange }: StockConsultationDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = isOpen !== undefined && onOpenChange !== undefined;
    const finalOpen = isControlled ? isOpen : internalOpen;
    const finalSetOpen = isControlled ? onOpenChange : setInternalOpen;

    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

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

    async function loadStock() {
        setLoading(true);
        const { data } = await supabase.from('products').select('*').order('name');
        setProducts(data || []);
        setFilteredProducts(data || []);
        setLoading(false);
    }

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
                    <DialogTitle>Consulta Rápida de Estoque</DialogTitle>
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

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader className="bg-zinc-50 sticky top-0">
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-center">Danilo</TableHead>
                                <TableHead className="text-center">Adriel</TableHead>
                                <TableHead className="text-right">Preço</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        Nenhum produto encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium">{p.name}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={p.stock_danilo > 0 ? "outline" : "destructive"}>
                                                {p.stock_danilo} {p.unit}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={p.stock_adriel > 0 ? "outline" : "destructive"}>
                                                {p.stock_adriel} {p.unit}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-green-700">
                                            R$ {p.price.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}
