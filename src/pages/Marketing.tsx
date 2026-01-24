import { useState, useEffect, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { LayoutTemplate, Download, Type, Image as ImageIcon, Palette, Loader2, Check, Store, X } from "lucide-react";
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
            const canvas = await html2canvas(canvasRef.current, { scale: 2, useCORS: true, backgroundColor: null });
            const imgData = canvas.toDataURL('image/png');

            // Generate PDF with dynamic height to fit content exactly (no cut-off)
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`cardapio-${new Date().toISOString().split('T')[0]}.pdf`);
            toast({ title: "PDF baixado!", description: "Pronto para enviar no WhatsApp." });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Erro ao gerar PDF" });
        }
    };

    return (
        <div className="flex flex-col md:h-screen md:flex-row bg-zinc-50 dark:bg-zinc-950 overflow-hidden md:overflow-hidden overflow-y-auto h-auto min-h-screen">
            {/* LEFT SIDEBAR: CONTROLS */}
            <div className="w-full md:w-96 bg-white border-r md:h-full h-auto flex flex-col z-10 overflow-visible md:overflow-hidden shrink-0">
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
                                <Store className="h-4 w-4" /> Identidade Visual
                            </h3>

                            {/* Logo Upload in Marketing */}
                            <div className="p-3 bg-zinc-50 rounded-lg border border-dashed border-zinc-200 text-center">
                                {company?.logo_url ? (
                                    <div className="relative group">
                                        <img src={company.logo_url} className="h-16 w-auto mx-auto object-contain mb-2" />
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="h-6 w-6 absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setCompany({ ...company, logo_url: null })}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-2 text-zinc-400">
                                        <Store className="h-8 w-8 mb-1 opacity-20" />
                                        <span className="text-[10px]">Sem Logo</span>
                                    </div>
                                )}

                                <Label htmlFor="marketing-logo-upload" className="cursor-pointer">
                                    <div className="mt-2 flex items-center justify-center gap-2 bg-white hover:bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded border shadow-sm text-xs font-medium transition-colors">
                                        <ImageIcon className="h-3 w-3" />
                                        {company?.logo_url ? 'Alterar Logo' : 'Enviar Logo'}
                                    </div>
                                    <Input
                                        id="marketing-logo-upload"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            if (!e.target.files?.[0]) return;
                                            try {
                                                const file = e.target.files[0];
                                                const fileName = `menu_logo_${Date.now()}.${file.name.split('.').pop()}`;

                                                // Upload
                                                const { error: upErr } = await supabase.storage.from('company-logos').upload(fileName, file);
                                                if (upErr) throw upErr;

                                                const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(fileName);

                                                // Update local state AND DB
                                                setCompany(prev => ({ ...prev, logo_url: publicUrl }));

                                                // Try to update company if we have a user profile linked
                                                const { data: { user } } = await supabase.auth.getUser();
                                                if (user) {
                                                    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
                                                    if (profile?.company_id) {
                                                        await supabase.from('companies').update({ logo_url: publicUrl }).eq('id', profile.company_id);
                                                    }
                                                }

                                                toast({ title: "Logo atualizado!" });
                                            } catch (err: any) {
                                                console.error(err);
                                                toast({ variant: 'destructive', title: "Erro no upload", description: err.message });
                                            }
                                        }}
                                    />
                                </Label>
                            </div>

                            <Separator />

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
                            <div className="border rounded-md max-h-[40vh] md:max-h-60 overflow-y-auto bg-white">
                                {loading ? <div className="p-4 text-center"><Loader2 className="animate-spin mx-auto h-4 w-4" /></div> :
                                    products.map(product => (
                                        <div key={product.id} className="flex items-center gap-3 p-2 border-b last:border-0 hover:bg-zinc-50 cursor-pointer" onClick={() => toggleProduct(product.id)}>
                                            <Checkbox checked={selectedProducts.includes(product.id)} onCheckedChange={() => toggleProduct(product.id)} className="h-4 w-4" />
                                            {product.image && <img src={product.image} className="w-8 h-8 rounded object-cover border border-zinc-100" />}
                                            <div className="flex-1 overflow-hidden">
                                                <div className="text-xs font-semibold text-zinc-700 truncate">{product.name}</div>
                                                <div className="text-[10px] text-zinc-500">R$ {product.price.toFixed(2)}</div>
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
                        <div className="relative z-10 px-8 pt-12 pb-16 text-center">
                            {company?.logo_url ? (
                                <img
                                    src={company.logo_url}
                                    className="h-28 w-28 mx-auto mb-6 object-contain rounded-full bg-white p-2 shadow-2xl ring-4 ring-white/30"
                                    alt="Logo"
                                />
                            ) : (
                                <div className="h-28 w-28 mx-auto mb-6 flex flex-col items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm border-2 border-white/30">
                                    <Store className="h-12 w-12 mb-1 opacity-90" />
                                    <span className="text-[10px] uppercase tracking-widest font-bold">Logo</span>
                                </div>
                            )}
                            <h1 className="text-4xl font-black uppercase tracking-tight mb-3 drop-shadow-md text-white">{title}</h1>
                            <p className="opacity-100 font-semibold text-purple-50 text-xl drop-shadow-sm">{subtitle}</p>
                        </div>

                        {/* Decorative Elements */}
                        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-20 -translate-y-20 blur-3xl"></div>
                        <div className="absolute bottom-0 right-0 w-64 h-64 bg-black/10 rounded-full translate-x-20 translate-y-10 blur-3xl"></div>

                        {/* Wave SVG Divider */}
                        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0]">
                            <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none" className="relative block w-[calc(118%)] h-[60px] rotate-0 fill-white">
                                <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
                            </svg>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8 space-y-6 flex-1 bg-white">
                        {selectedProducts.length === 0 ? (
                            <div className="text-center py-20 text-zinc-300 italic border-2 border-dashed border-zinc-100 rounded-xl">Selecione produtos para visualizar...</div>
                        ) : (
                            layout === 'list' ? (
                                <div className="space-y-4">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="flex items-end justify-between group py-1">
                                            {/* Product Info */}
                                            <div className="flex-[3] min-w-0 pr-2">
                                                <div className="flex items-baseline gap-2">
                                                    <h3 className="font-bold text-zinc-800 text-xl leading-snug">{product.name}</h3>
                                                </div>
                                                <div className="text-xs text-zinc-500 uppercase tracking-wide font-medium mt-1">Pronta Entrega</div>
                                            </div>

                                            {/* Dotted Leader */}
                                            <div className="flex-[1] border-b-2 border-dotted border-zinc-300 mx-2 mb-2 opacity-40"></div>

                                            {/* Price */}
                                            <div className="text-2xl font-black whitespace-nowrap" style={{ color: themeColor }}>
                                                R$ {product.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {products.filter(p => selectedProducts.includes(p.id)).map(product => (
                                        <div key={product.id} className="bg-white rounded-xl p-3 text-center border border-zinc-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                            {product.image ? (
                                                <div className="h-32 w-full bg-zinc-100 rounded-lg mb-3 overflow-hidden">
                                                    <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                </div>
                                            ) : (
                                                <div className="h-32 w-full bg-zinc-50 rounded-lg mb-3 flex items-center justify-center text-zinc-300">
                                                    <Store className="h-8 w-8 opacity-50" />
                                                </div>
                                            )}
                                            <div className="font-bold text-zinc-900 mb-1 leading-tight text-sm line-clamp-2 h-10 flex items-center justify-center">{product.name}</div>
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
                    <div className="p-8 bg-zinc-50 border-t text-center mt-auto">
                        <div className="flex items-center justify-center gap-3 text-zinc-700 font-bold mb-3 border-2 border-zinc-200 rounded-2xl py-3 px-8 inline-block bg-white shadow-sm">
                            <span className="text-lg">📱</span> {footer}
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Oferta válida enquanto durarem os estoques</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Separator() {
    return <div className="h-px bg-zinc-100 my-2" />
}
