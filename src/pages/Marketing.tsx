import { useState, useEffect, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { LayoutTemplate, Download, Type, Image as ImageIcon, Palette, Loader2, Check, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Link } from "react-router-dom";

export default function Marketing() {
    const { toast } = useToast();
    const [products, setProducts] = useState<any[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [company, setCompany] = useState<any>(null);

    // Customization State
    const [title, setTitle] = useState("Cardápio da Semana");
    const [subtitle, setSubtitle] = useState("Confira nossas delícias fresquinhas!");
    const [footer, setFooter] = useState("Peça pelo WhatsApp: (11) 99999-9999");
    const [themeColor, setThemeColor] = useState("#9333ea"); // Purple-600
    const [layout, setLayout] = useState<'list' | 'grid'>('list');

    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);

            // 1. Fetch User & Company
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
                if (profile?.company_id) {
                    const { data: comp } = await supabase.from('companies').select('name, logo_url').eq('id', profile.company_id).single();
                    setCompany(comp);
                }
            }

            // 2. Fetch Products
            const { data, error } = await supabase
                .from("products")
                .select("*, product_stocks(quantity)")
                .eq('type', 'finished');

            if (error) throw error;

            if (data) {
                const formatted = data
                    .map((product: any) => {
                        const totalQty = product.product_stocks?.reduce((acc: number, s: any) => acc + (Number(s.quantity) || 0), 0) || 0;
                        return {
                            id: product.id,
                            name: product.name,
                            price: Number(product.price) || 0,
                            unit: product.unit,
                            image: product.image_url,
                            stock: totalQty
                        };
                    })
                    .filter(p => p.stock > 0)
                    .sort((a, b) => b.stock - a.stock);

                setProducts(formatted);
                setSelectedProducts(formatted.slice(0, 9).map((p: any) => p.id)); // Default up to 9
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Erro", description: "Falha ao carregar dados.", variant: "destructive" });
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
            const canvas = await html2canvas(canvasRef.current, { scale: 2, useCORS: true, backgroundColor: null });
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
                                {['#9333ea', '#ea335d', '#ea9333', '#33ea78', '#338eea', '#000000'].map(color => (
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
                                            {product.image && <img src={product.image} className="w-8 h-8 rounded object-cover" />}
                                            <div className="flex-1 overflow-hidden">
                                                <div className="text-sm font-medium truncate">{product.name}</div>
                                                <div className="text-xs text-zinc-500">R$ {product.price.toFixed(2)}</div>
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
                    className="bg-white shadow-xl transition-all duration-300 relative rounded-sm flex flex-col"
                    style={{
                        width: '500px', // Fixed width for consistent generation
                        minHeight: '700px',
                        height: 'auto',
                    }}
                >
                    {/* Header with Curve */}
                    <div className="relative text-white overflow-hidden" style={{ backgroundColor: themeColor }}>
                        <div className="relative z-10 px-8 py-10 text-center">
                            {company?.logo_url ? (
                                <img src={company.logo_url} className="h-16 w-auto mx-auto mb-4 object-contain brightness-0 invert drop-shadow-md" alt="Logo" />
                            ) : (
                                <div className="flex flex-col items-center justify-center mb-4 opacity-70">
                                    <Store className="h-12 w-12 mb-1" />
                                    <span className="text-[10px] uppercase tracking-widest font-bold">Sua Logo Aqui</span>
                                </div>
                            )}
                            <h1 className="text-3xl font-black uppercase tracking-tight mb-2 drop-shadow-sm">{title}</h1>
                            <p className="opacity-90 font-medium text-purple-50">{subtitle}</p>
                        </div>
                        {/* Decorative Circles */}
                        <div className="absolute top-0 left-0 w-48 h-48 bg-white/10 rounded-full -translate-x-12 -translate-y-12 blur-3xl"></div>
                        <div className="absolute bottom-0 right-0 w-64 h-64 bg-black/10 rounded-full translate-x-20 translate-y-20 blur-3xl"></div>

                        {/* Wave SVG Divider */}
                        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0]">
                            <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none" className="relative block w-[calc(118%)] h-[40px] rotate-0 fill-white">
                                <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
                            </svg>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8 space-y-4 flex-1">
                        {selectedProducts.length === 0 ? (
                            <div className="text-center py-20 text-zinc-300 italic">Selecione produtos para visualizar...</div>
                        ) : (
                            layout === 'list' ? (
                                <div className="space-y-4">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="flex items-center gap-4 border-b border-dashed border-zinc-200 pb-4 last:border-0">
                                            {/* Product Image in List */}
                                            {product.image && (
                                                <div className="h-16 w-16 rounded-md bg-zinc-100 overflow-hidden flex-shrink-0 border border-zinc-100">
                                                    <img src={product.image} className="h-full w-full object-cover" />
                                                </div>
                                            )}

                                            <div className="flex-1">
                                                <div className="font-bold text-zinc-800 text-lg leading-tight">{product.name}</div>
                                                <div className="text-xs text-zinc-400 uppercase tracking-wide mt-1">Pronta Entrega</div>
                                            </div>
                                            <div className="text-xl font-black whitespace-nowrap" style={{ color: themeColor }}>
                                                R$ {product.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="bg-white rounded-xl p-3 text-center border border-zinc-100 shadow-sm relative overflow-hidden group">
                                            {product.image ? (
                                                <div className="h-32 w-full bg-zinc-100 rounded-lg mb-3 overflow-hidden">
                                                    <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                </div>
                                            ) : (
                                                <div className="h-32 w-full bg-zinc-50 rounded-lg mb-3 flex items-center justify-center text-zinc-300">
                                                    <Store className="h-8 w-8" />
                                                </div>
                                            )}
                                            <div className="font-bold text-zinc-900 mb-1 leading-tight text-sm line-clamp-2 h-10">{product.name}</div>
                                            <div className="inline-block px-3 py-1 rounded-full text-white font-bold text-sm shadow-sm" style={{ backgroundColor: themeColor }}>
                                                R$ {product.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-zinc-50 border-t text-center mt-auto">
                        {!company?.logo_url && (
                            <Link to="/admin/settings" className="text-[10px] text-purple-400 hover:underline mb-2 block mx-auto w-fit">
                                Cadastrar Logo da Empresa
                            </Link>
                        )}
                        <div className="flex items-center justify-center gap-2 text-zinc-600 font-bold mb-1 border-2 border-zinc-200 rounded-full py-2 px-6 inline-block bg-white">
                            {footer}
                        </div>
                        <div className="text-[9px] text-zinc-400 uppercase tracking-widest mt-2">Oferta válida enquanto durarem os estoques</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Separator() {
    return <div className="h-px bg-zinc-100 my-2" />
}
