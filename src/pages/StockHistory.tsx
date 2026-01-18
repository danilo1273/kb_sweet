import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ArrowUpCircle, AlertCircle, ShoppingCart, Box, ClipboardCheck, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/ui/empty-state";

interface HistoryItem {
    id: string;
    date: string; // ISO date
    type: 'purchase' | 'usage' | 'adjustment' | 'loss' | 'found';
    itemName: string;
    quantity: number;
    unit: string;
    description: string;
    userName: string;
    details?: string;
    cost?: number;
}

export default function StockHistory() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [range, setRange] = useState<number>(30); // days

    useEffect(() => {
        fetchGlobalHistory();
    }, [range]);

    async function fetchGlobalHistory() {
        setLoading(true);
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - range);
            const isoStart = startDate.toISOString();

            // 1. Fetch Purchases (Approved)
            const purchasesPromise = supabase
                .from('purchase_requests')
                .select(`
                    id, quantity, unit, cost, created_at, item_name,
                    purchase_orders:order_id (created_by, suppliers(name)),
                    ingredient:ingredient_id (name)
                `)
                .eq('status', 'approved')
                .gte('created_at', isoStart)
                .order('created_at', { ascending: false });

            // 2. Fetch Production Usage (Closed)
            const productionPromise = supabase
                .from('production_order_items')
                .select(`
                    id, quantity_used, waste_quantity, unit, created_at,
                    production_orders!inner (closed_at, status, products(name), profiles:user_id(full_name)),
                    ingredients:item_id (name)
                `)
                .eq('production_orders.status', 'closed')
                .gte('production_orders.closed_at', isoStart)
                .order('id', { ascending: false });

            // 3. Fetch Adjustments
            const adjustmentsPromise = supabase
                .from('stock_adjustments')
                .select(`
                    id, quantity_diff, old_stock, new_stock, reason, type, created_at, stock_owner,
                    ingredients:ingredient_id (name, unit),
                    profiles:user_id (full_name)
                `)
                .gte('created_at', isoStart)
                .order('created_at', { ascending: false });

            // Fetch Maps for Users if needed
            // Actually purchases.purchase_orders.created_by is ID, we need to map to Name.
            // Let's optimize by fetching profiles separately if needed or assume we can live with IDs/lookups.
            // For now, let's just fetch profiles map.

            const [purchasesRes, productionRes, adjustmentsRes] = await Promise.all([purchasesPromise, productionPromise, adjustmentsPromise]);

            if (purchasesRes.error) console.error("Purchases Error", purchasesRes.error);
            if (productionRes.error) console.error("Production Error", productionRes.error);
            if (adjustmentsRes.error) console.error("Adjustments Error", adjustmentsRes.error);

            // Fetch needed profiles
            const userIds = new Set<string>();
            purchasesRes.data?.forEach((p: any) => p.purchase_orders?.created_by && userIds.add(p.purchase_orders.created_by));

            const profileMap = new Map<string, string>();
            if (userIds.size > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds));
                profiles?.forEach((p: any) => profileMap.set(p.id, p.full_name || 'Usuário'));
            }

            // Normalization
            const mappedPurchases: HistoryItem[] = (purchasesRes.data || []).map((p: any) => ({
                id: p.id,
                date: p.created_at,
                type: 'purchase',
                itemName: p.ingredient?.name || p.item_name || 'Item desconhecido',
                quantity: Number(p.quantity),
                unit: p.unit || 'un',
                description: `Compra: ${p.purchase_orders?.suppliers?.name || 'Fornecedor'}`,
                userName: profileMap.get(p.purchase_orders?.created_by) || 'Sistema',
                details: `Custo: R$ ${Number(p.cost || 0).toFixed(2)}`,
                cost: p.cost
            }));

            const mappedProduction: HistoryItem[] = (productionRes.data || []).map((p: any) => {
                const totalQtd = (p.quantity_used || 0) + (p.waste_quantity || 0);
                const prof = p.production_orders?.profiles;
                const userName = Array.isArray(prof) ? prof[0]?.full_name : (prof as any)?.full_name;

                return {
                    id: p.id,
                    date: p.production_orders?.closed_at || p.created_at,
                    type: 'usage',
                    itemName: p.ingredients?.name || 'Ingrediente',
                    quantity: totalQtd,
                    unit: p.unit || 'un',
                    description: `Produção: ${p.production_orders?.products?.name || 'Rec'}`,
                    userName: userName || 'Produção',
                    details: p.waste_quantity > 0 ? `Desperdício: ${p.waste_quantity}` : undefined
                };
            });

            const mappedAdjustments: HistoryItem[] = (adjustmentsRes.data || []).map((a: any) => {
                const prof = a.profiles;
                const userName = Array.isArray(prof) ? prof[0]?.full_name : (prof as any)?.full_name;

                return {
                    id: a.id,
                    date: a.created_at,
                    type: a.type as any, // 'adjustment', 'loss', 'found'
                    itemName: a.ingredients?.name || 'Ingrediente',
                    quantity: Math.abs(a.quantity_diff),
                    unit: a.ingredients?.unit || 'un',
                    description: `${getAdjLabel(a.type)} (${a.stock_owner})`,
                    userName: userName || 'Sistema',
                    details: a.reason ? `Motivo: ${a.reason}` : undefined
                };
            });

            const all = [...mappedPurchases, ...mappedProduction, ...mappedAdjustments].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            setHistoryData(all);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const filteredData = historyData.filter(item => {
        const matchesSearch = item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesType = filterType === 'all' ||
            (filterType === 'in' && ['purchase', 'found'].includes(item.type)) ||
            (filterType === 'out' && ['usage', 'loss'].includes(item.type)) ||
            (filterType === 'adjustment' && ['adjustment', 'loss', 'found'].includes(item.type));

        return matchesSearch && matchesType;
    });

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/inventory')}>
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Histórico Global</h2>
                    <p className="text-zinc-500">Linha do tempo de todas as movimentações de estoque.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-lg border shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Buscar por item, fornecedor ou motivo..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Tipo de Movimento" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="in">Entradas (Compras/Sobras)</SelectItem>
                        <SelectItem value="out">Saídas (Uso/Perdas)</SelectItem>
                        <SelectItem value="adjustment">Ajustes & Inventário</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2 border-l pl-4">
                    <span className="text-sm text-zinc-500">Período:</span>
                    <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">Últimos 7 dias</SelectItem>
                            <SelectItem value="30">Últimos 30 dias</SelectItem>
                            <SelectItem value="90">Últimos 3 meses</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[150px]">Data</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Quantidade</TableHead>
                                <TableHead className="w-[150px]">Usuário</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10">
                                        <Loader2 className="animate-spin h-8 w-8 text-zinc-400 mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-64">
                                        <EmptyState
                                            icon={Box}
                                            title="Nenhuma movimentação"
                                            description="Tente alterar os filtros de data ou tipo."
                                        />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredData.map((item) => (
                                    <TableRow key={`${item.type}-${item.id}`} className="hover:bg-zinc-50/50">
                                        <TableCell className="text-sm font-medium text-zinc-600">
                                            {new Date(item.date).toLocaleDateString()} <span className="text-xs text-zinc-400 ml-1">{new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </TableCell>
                                        <TableCell>
                                            {getIcon(item.type)}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {item.itemName}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>{item.description}</span>
                                                {item.details && <span className="text-xs text-zinc-500">{item.details}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="outline" className={getBadgeColor(item.type)}>
                                                {['usage', 'loss'].includes(item.type) ? '-' : '+'}{item.quantity.toLocaleString('pt-BR')} {item.unit}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-500">
                                            {item.userName}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function getAdjLabel(type: string) {
    if (type === 'found') return 'Sobra de Estoque';
    if (type === 'loss') return 'Perda/Quebra';
    return 'Ajuste Manual';
}

function getIcon(type: string) {
    switch (type) {
        case 'purchase': return <ShoppingCart className="h-4 w-4 text-green-500" />;
        case 'usage': return <Box className="h-4 w-4 text-amber-500" />;
        case 'found': return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
        case 'loss': return <AlertCircle className="h-4 w-4 text-red-500" />;
        default: return <ClipboardCheck className="h-4 w-4 text-zinc-500" />;
    }
}

function getBadgeColor(type: string) {
    switch (type) {
        case 'purchase': return "bg-green-50 text-green-700 border-green-200";
        case 'found': return "bg-blue-50 text-blue-700 border-blue-200";
        case 'usage': return "bg-amber-50 text-amber-700 border-amber-200";
        case 'loss': return "bg-red-50 text-red-700 border-red-200";
        default: return "bg-zinc-100 text-zinc-700";
    }
}
