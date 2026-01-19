import { useState, useEffect, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { LayoutTemplate, Download, Type, Image as ImageIcon, Palette, Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function Marketing() {
    const { toast } = useToast();
    const [products, setProducts] = useState<any[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Customization State
    const [title, setTitle] = useState("Cardápio da Semana");
    const [subtitle, setSubtitle] = useState("Confira nossas delícias fresquinhas!");
    const [footer, setFooter] = useState("Peça pelo WhatsApp: (11) 99999-9999");
    const [themeColor, setThemeColor] = useState("#9333ea"); // Purple-600
    const [layout, setLayout] = useState<'list' | 'grid'>('list');

    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        try {
            setLoading(true);
            // Fetch finished goods from products table (Source of Truth for legacy + new)
            const { data, error } = await supabase
                .from("products")
                .select("*, product_stocks(quantity)")
                .eq('type', 'finished');

            if (error) throw error;

            if (data) {
                const formatted = data
                    .map((product: any) => {
                        const stockQty = product.product_stocks?.reduce((acc: number, s: any) => acc + (Number(s.quantity) || 0), 0) || 0;
                        const legacyQty = Number(product.stock_quantity) || 0;
                        const totalQty = stockQty > 0 ? stockQty : legacyQty;

                        return {
                            id: product.id,
                            name: product.name,
                            price: product.sale_price,
                            unit: product.unit,
                            stock: totalQty
                        };
                    })
                    .filter(p => p.stock > 0)
                    .sort((a, b) => b.stock - a.stock);

                setProducts(formatted);
                // Select top 5 by default
                setSelectedProducts(formatted.slice(0, 5).map((p: any) => p.id));
            }
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                title: "Erro ao carregar produtos",
                description: "Não foi possível carregar o estoque.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    }

    const toggleProduct = (id: string) => {
        if (selectedProducts.includes(id)) {
            setSelectedProducts(selectedProducts.filter(p => p !== id));
        } else {
            setSelectedProducts([...selectedProducts, id]);
        }
    };

    const handleDownloadImage = async () => {
        if (!canvasRef.current) return;
        try {
            const canvas = await html2canvas(canvasRef.current, { scale: 2, useCORS: true });
            const link = document.createElement('a');
            link.download = `cardapio-${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL();
            link.click();
            toast({ title: "Imagem baixada!", description: "Pronto para postar no Instagram." });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Erro ao gerar imagem" });
        }
    };

    const handleDownloadPDF = async () => {
        if (!canvasRef.current) return;
        try {
            const canvas = await html2canvas(canvasRef.current, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`cardapio-${new Date().toISOString().split('T')[0]}.pdf`);
            toast({ title: "PDF baixado!", description: "Pronto para enviar no WhatsApp." });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Erro ao gerar PDF" });
        }
    };

    return (
        <div className="flex flex-col h-screen md:flex-row bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
            {/* LEFT SIDEBAR: CONTROLS */}
            <div className="w-full md:w-96 bg-white border-r h-full flex flex-col z-10 overflow-hidden">
                <div className="p-6 border-b">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <LayoutTemplate className="h-6 w-6 text-purple-600" />
                        Marketing
                    </h2>
                    <p className="text-zinc-500 text-sm">Crie cardápios digitais em segundos.</p>
                </div>

                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                        {/* 1. Customization */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase text-zinc-400 flex items-center gap-2">
                                <Type className="h-4 w-4" /> Textos
                            </h3>
                            <div className="space-y-2">
                                <Label>Título</Label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={30} />
                            </div>
                            <div className="space-y-2">
                                <Label>Subtítulo</Label>
                                <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} maxLength={50} />
                            </div>
                            <div className="space-y-2">
                                <Label>Rodapé (Contato)</Label>
                                <Input value={footer} onChange={e => setFooter(e.target.value)} maxLength={40} />
                            </div>
                        </div>

                        <Separator />

                        {/* 2. Style */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase text-zinc-400 flex items-center gap-2">
                                <Palette className="h-4 w-4" /> Estilo
                            </h3>
                            <div className="flex gap-2">
                                {['#9333ea', '#ea335d', '#ea9333', '#33ea78', '#338eea'].map(color => (
                                    <div
                                        key={color}
                                        onClick={() => setThemeColor(color)}
                                        className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-all ${themeColor === color ? 'border-zinc-900 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button
                                    variant={layout === 'list' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setLayout('list')}
                                    className="flex-1"
                                >
                                    Lista Simples
                                </Button>
                                <Button
                                    variant={layout === 'grid' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setLayout('grid')}
                                    className="flex-1"
                                >
                                    Grade Visual
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        {/* 3. Products */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase text-zinc-400 flex items-center gap-2">
                                <Check className="h-4 w-4" /> Produtos ({selectedProducts.length})
                            </h3>
                            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                                {loading ? <div className="p-4 text-center"><Loader2 className="animate-spin mx-auto h-4 w-4" /></div> :
                                    products.map(product => (
                                        <div key={product.id} className="flex items-center gap-3 p-3 hover:bg-zinc-50 cursor-pointer" onClick={() => toggleProduct(product.id)}>
                                            <Checkbox checked={selectedProducts.includes(product.id)} onCheckedChange={() => toggleProduct(product.id)} />
                                            <div className="flex-1 overflow-hidden">
                                                <div className="text-sm font-medium truncate">{product.name}</div>
                                                <div className="text-xs text-zinc-500">R$ {product.price.toFixed(2)} | {product.stock} un</div>
                                            </div>
                                        </div>
                                    ))
                                }
                                {products.length === 0 && !loading && <div className="p-4 text-center text-xs text-zinc-400">Nenhum produto pronto no estoque.</div>}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div className="p-6 border-t bg-zinc-50 space-y-2">
                    <Button className="w-full" onClick={handleDownloadImage}>
                        <ImageIcon className="mr-2 h-4 w-4" /> Baixar Imagem (Instagram)
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleDownloadPDF}>
                        <Download className="mr-2 h-4 w-4" /> Baixar PDF (WhatsApp)
                    </Button>
                </div>
            </div>

            {/* MAIN AREA: PREVIEW */}
            <div className="flex-1 bg-zinc-200/50 p-8 flex items-center justify-center overflow-auto">
                <div
                    ref={canvasRef}
                    className="bg-white shadow-2xl transition-all duration-300 overflow-hidden relative"
                    style={{
                        width: '500px', // Fixed width for consistent generation
                        minHeight: '700px',
                        aspectRatio: layout === 'grid' ? '4/5' : 'auto', // Instagram Portrait ratio vs Auto for list
                    }}
                >
                    {/* Header */}
                    <div className="p-8 text-center text-white relative overflow-hidden" style={{ backgroundColor: themeColor }}>
                        <div className="relative z-10">
                            <h1 className="text-3xl font-black uppercase tracking-tight mb-2">{title}</h1>
                            <p className="opacity-90 font-medium">{subtitle}</p>
                        </div>
                        {/* Decorative Circles */}
                        <div className="absolute top-0 left-0 w-32 h-32 bg-white/20 rounded-full -translate-x-16 -translate-y-16 blur-2xl"></div>
                        <div className="absolute bottom-0 right-0 w-40 h-40 bg-black/10 rounded-full translate-x-10 translate-y-10 blur-xl"></div>
                    </div>

                    {/* Content */}
                    <div className="p-8 space-y-4">
                        {selectedProducts.length === 0 ? (
                            <div className="text-center py-20 text-zinc-300 italic">Selecione produtos para visualizar...</div>
                        ) : (
                            layout === 'list' ? (
                                <div className="space-y-3">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="flex justify-between items-center border-b border-zinc-100 pb-3 last:border-0">
                                            <div>
                                                <div className="font-bold text-zinc-800 text-lg">{product.name}</div>
                                                <div className="text-xs text-zinc-500 uppercase tracking-wider">Pronta Entrega</div>
                                            </div>
                                            <div className="text-xl font-black" style={{ color: themeColor }}>
                                                R$ {product.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="bg-zinc-50 rounded-lg p-4 text-center border border-zinc-100 shadow-sm relative overflow-hidden">
                                            <div className="font-bold text-zinc-900 mb-1 leading-tight">{product.name}</div>
                                            <div className="inline-block px-3 py-1 rounded-full text-white font-bold text-sm" style={{ backgroundColor: themeColor }}>
                                                R$ {product.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="absolute bottom-0 w-full p-4 bg-zinc-50 border-t text-center">
                        <div className="flex items-center justify-center gap-2 text-zinc-600 font-semibold mb-1">
                            {footer}
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-widest">Oferta válida enquanto durarem os estoques</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Separator() {
    return <div className="h-px bg-zinc-100 my-2" />
}
