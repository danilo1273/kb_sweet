
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, ShoppingCart, TrendingUp, Edit, Trash2, Eye, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function Sales() {
    const navigate = useNavigate();
    const [sales, setSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchSales();
    }, []);

    const filteredSales = useMemo(() => {
        if (!searchTerm) return sales;
        const lower = searchTerm.toLowerCase();
        return sales.filter(s =>
            s.clients?.name?.toLowerCase().includes(lower) ||
            String(s.total).includes(lower) ||
            s.status?.toLowerCase().includes(lower)
        );
    }, [sales, searchTerm]);

    const groupedSales = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredSales.forEach(sale => {
            const date = new Date(sale.created_at);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            let key = date.toLocaleDateString();
            if (date.toDateString() === today.toDateString()) key = "Hoje";
            else if (date.toDateString() === yesterday.toDateString()) key = "Ontem";

            if (!groups[key]) groups[key] = [];
            groups[key].push(sale);
        });
        return groups;
    }, [filteredSales]);

    async function fetchSales() {
        setLoading(true);
        // Fetch sales with client info - REMOVED profiles(full_name) causing issues
        const { data: rawSales, error } = await supabase
            .from('sales')
            .select('*, clients(name), stock_locations(name, slug), financial_movements!financial_movements_related_sale_id_fkey(status), sale_items(*, products(name, product_stocks(average_cost, location_id, quantity)))')
            .order('created_at', { ascending: false });

        if (!error && rawSales) {
            // Manual fetch for profiles (Sellers) to ensure no data loss if FK is missing
            const userIds = Array.from(new Set(rawSales.map((s: any) => s.user_id).filter(Boolean)));

            let profilesMap: Record<string, any> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds);

                profiles?.forEach((p: any) => {
                    profilesMap[p.id] = p;
                });
            }

            const salesWithProfiles = rawSales.map((sale: any) => ({
                ...sale,
                profiles: profilesMap[sale.user_id] || { full_name: 'Sistema' }
            }));

            setSales(salesWithProfiles);
        } else {
            console.error("Sales Fetch Error:", error);
            setSales([]);
        }
        setLoading(false);
    }

    // View Items State
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [viewSaleItems, setViewSaleItems] = useState<any[]>([]);
    const [selectedViewSale, setSelectedViewSale] = useState<any>(null);

    // User State for Permissions
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setCurrentUser(user);
                // Check if admin (this logic depends on your role system, typically stored in profiles or metadata)
                // For now, assuming profile fetch or checking email/metadata if available.
                // Or simplified: fetch profile
                supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
                    if (data?.role === 'super_admin' || data?.role === 'admin') setIsAdmin(true);
                });
            }
        });
    }, []);

    // Edit State
    const { toast } = useToast();
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingSale, setEditingSale] = useState<any>(null);
    const [clients, setClients] = useState<any[]>([]);

    useEffect(() => {
        // Load clients for dropdown
        supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data || []));
    }, []);

    const handleEditClick = async (sale: any) => {
        // Security Rule: If sale is completed, require request/approval
        if (sale.status === 'completed' && sale.edit_status !== 'approved') {
            if (sale.edit_status === 'requested') {
                toast({ title: "Aguardando Aprovação", description: "A solicitação de edição já foi enviada ao financeiro." });
                return;
            }

            if (confirm("Para editar uma venda já finalizada, é necessário solicitar liberação ao financeiro. Deseja solicitar?")) {
                const { error } = await supabase.from('sales').update({
                    edit_status: 'requested',
                    edit_requested_at: new Date().toISOString()
                }).eq('id', sale.id);

                if (error) toast({ variant: 'destructive', title: "Erro", description: error.message });
                else {
                    toast({ title: "Solicitação Enviada", description: "Aguarde a liberação pelo financeiro." });
                    fetchSales();
                }
            }
            return;
        }

        setEditingSale({
            id: sale.id,
            total: sale.total,
            client_id: sale.client_id || 'anonymous'
        });
        setIsEditOpen(true);
    };

    // SECURE EDIT
    const [editReason, setEditReason] = useState("");

    const handleSaveEdit = async () => {
        if (!editingSale) return;
        if (!editReason.trim()) {
            toast({ variant: 'destructive', title: "Justificativa Obrigatória", description: "Informe o motivo da alteração para auditoria." });
            return;
        }

        const { error } = await supabase.rpc('update_sale_secure', {
            p_sale_id: editingSale.id,
            p_new_total: editingSale.total,
            p_new_client_id: editingSale.client_id === 'anonymous' ? null : editingSale.client_id,
            p_reason: editReason
        });

        if (error) {
            toast({ variant: 'destructive', title: "Erro ao atualizar", description: error.message });
        } else {
            toast({ title: "Venda atualizada!", description: "Valores sincronizados e auditoria registrada." });
            setIsEditOpen(false);
            setEditReason("");
            fetchSales();
        }
    };

    const totalRevenue = filteredSales.filter(s => s.status === 'completed').reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    const countSales = filteredSales.filter(s => s.status === 'completed').length;

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Vendas</h2>
                    <p className="text-zinc-500">Histórico e Lançamento de Vendas.</p>
                </div>
                <div className="flex gap-2">

                    <Button onClick={() => navigate('/clients')} variant="outline" size="sm" className="md:size-default">
                        <span className="hidden md:inline">Gerenciar Clientes</span>
                        <span className="md:hidden">Clientes</span>
                    </Button>
                    <Button onClick={() => navigate('/pos')} className="bg-green-600 hover:bg-green-700 text-white" size="sm">
                        <Plus className="mr-0 md:mr-2 h-4 w-4" />
                        <span className="hidden md:inline">Nova Venda (PDV)</span>
                        <span className="md:hidden">Vender</span>
                    </Button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative z-20">
                <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input
                    className="pl-10 h-10 bg-white border-zinc-200 shadow-sm"
                    placeholder="Buscar por cliente, valor ou status..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">R$ {totalRevenue.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Vendas Realizadas</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{countSales}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Mobile View: Grouped Timeline */}
            <div className="md:hidden space-y-6 mb-4">
                {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : filteredSales.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center opacity-50">
                        <ShoppingCart className="h-12 w-12 text-zinc-300 mb-2" />
                        <span className="text-zinc-500">Nenhuma venda encontrada.</span>
                    </div>
                ) : (
                    Object.entries(groupedSales).map(([date, dailySales]) => {
                        const dailyTotal = dailySales.filter(s => s.status === 'completed').reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);

                        return (
                            <div key={date} className="relative">
                                <div className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm py-2 mb-2 border-b border-zinc-200/50 flex justify-between items-end">
                                    <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">{date}</h3>
                                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                        Total: R$ {dailyTotal.toFixed(2)}
                                    </span>
                                </div>

                                <div className="pl-4 space-y-3 border-l-2 border-zinc-200 ml-2">
                                    {dailySales.map(sale => (
                                        <div key={sale.id} className="relative bg-white p-4 rounded-xl shadow-sm border border-zinc-100 flex flex-col gap-3 group active:scale-[0.98] transition-all">
                                            {/* Timestamp dot */}
                                            <div className="absolute -left-[21px] top-6 h-3 w-3 rounded-full bg-zinc-300 border-2 border-zinc-50 group-hover:bg-blue-500 transition-colors" />

                                            <div className="flex justify-between items-start">
                                                <div className="flex gap-3">
                                                    <Avatar className="h-10 w-10 border border-zinc-100 bg-zinc-50">
                                                        <AvatarFallback className="text-zinc-600 font-bold text-xs bg-zinc-100">
                                                            {sale.clients?.name?.substring(0, 2).toUpperCase() || 'CF'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="text-[10px] text-zinc-400 font-medium">
                                                            {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        <div className="font-bold text-zinc-900 leading-tight">
                                                            {sale.clients?.name || 'Consumidor Final'}
                                                        </div>
                                                        <div className="text-xs text-zinc-500 mt-0.5 max-w-[140px] truncate">
                                                            {sale.sale_items?.map((i: any) => i.products?.name).join(', ') || 'Venda Rápida'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {(sale.financial_movements?.[0]?.status === 'paid' || sale.financial_movements?.[0]?.status === 'received') && (
                                                            <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px] h-5 px-1.5 flex items-center gap-0.5">
                                                                <span className="text-[9px]">✔</span>
                                                            </Badge>
                                                        )}
                                                        <Badge
                                                            variant="secondary"
                                                            className={cn("text-[10px] font-bold px-2 h-5 flex items-center gap-1",
                                                                sale.status === 'completed' ? 'bg-green-100/50 text-green-700 hover:bg-green-100' :
                                                                    sale.status === 'canceled' ? 'bg-red-100/50 text-red-700 hover:bg-red-100' : 'bg-amber-100/50 text-amber-700 hover:bg-amber-100'
                                                            )}
                                                        >
                                                            {sale.status === 'completed' ? 'Concluída' : sale.status}
                                                        </Badge>
                                                    </div>

                                                    <div className="font-bold text-green-600 text-base">
                                                        R$ {Number(sale.total).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions Footer */}
                                            <div className="flex justify-between items-center pt-2 mt-1 border-t border-zinc-50">
                                                <div className="flex gap-2">
                                                    <Badge variant="outline" className="text-[10px] h-5 border-zinc-200 text-zinc-500">
                                                        {sale.payment_method === 'money' ? 'Dinheiro' : sale.payment_method}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] h-5 border-blue-100 text-blue-600 bg-blue-50/30">
                                                        {sale.stock_locations?.slug?.includes('danilo') ? 'Danilo' : 'Adriel'}
                                                    </Badge>
                                                </div>

                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                                                        onClick={() => {
                                                            setSelectedViewSale(sale);
                                                            setViewSaleItems(sale.sale_items || []);
                                                            setIsViewOpen(true);
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>

                                                    {(isAdmin || (currentUser && sale.user_id === currentUser.id)) && !(sale.financial_movements?.[0]?.status === 'paid' || sale.financial_movements?.[0]?.status === 'received') && (
                                                        <>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-full" onClick={() => handleEditClick(sale)}>
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                                                                onClick={async () => {
                                                                    if (!confirm('Excluir venda?')) return;
                                                                    const reason = prompt("Motivo:");
                                                                    if (!reason) return;

                                                                    setLoading(true);
                                                                    try {
                                                                        const { error } = await supabase.rpc('delete_sale_secure', { p_sale_id: sale.id, p_reason: reason });
                                                                        if (error) throw error;
                                                                        toast({ title: "Excluída!" });
                                                                        fetchSales();
                                                                    } catch (e: any) {
                                                                        alert('Erro: ' + e.message);
                                                                    } finally {
                                                                        setLoading(false);
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            <div className="hidden md:block bg-white rounded-lg border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Origem Estoque</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : sales.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma venda registrada.</TableCell></TableRow>
                        ) : (
                            sales.map(sale => (
                                <TableRow key={sale.id}>
                                    <TableCell>{new Date(sale.created_at).toLocaleString()}</TableCell>
                                    <TableCell>{sale.clients?.name || 'Consumidor Final'}</TableCell>
                                    <TableCell className="capitalize text-zinc-600 text-xs">{(sale.profiles?.full_name || 'Sistema').split(' ')[0]}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sale.stock_locations?.slug === 'stock-danilo' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                            }`}>
                                            {sale.stock_locations?.name || `Estoque ${sale.stock_source}`}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sale.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                sale.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {sale.status === 'completed' ? 'Concluída' : sale.status === 'canceled' ? 'Cancelada' : sale.status}
                                            </span>
                                            {sale.edit_status === 'requested' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200"
                                                    onClick={async () => {
                                                        if (!confirm("Autorizar edição desta venda?")) return;
                                                        await supabase.from('sales').update({ edit_status: 'approved' }).eq('id', sale.id);
                                                        toast({ title: "Edição Autorizada" });
                                                        fetchSales();
                                                    }}
                                                >
                                                    Autorizar Edição
                                                </Button>
                                            )}
                                            {sale.edit_status === 'approved' && (
                                                <span className="text-[10px] text-green-600 font-medium text-center">Edição Liberada</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-green-600">
                                        R$ {Number(sale.total).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-zinc-500 hover:text-blue-500"
                                                onClick={() => {
                                                    setSelectedViewSale(sale);
                                                    setViewSaleItems(sale.sale_items || []);
                                                    setIsViewOpen(true);
                                                }}
                                                title="Ver Itens"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>

                                            {(isAdmin || (currentUser && sale.user_id === currentUser.id)) && !(sale.financial_movements?.[0]?.status === 'paid' || sale.financial_movements?.[0]?.status === 'received') && (
                                                <>
                                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-blue-500" onClick={() => handleEditClick(sale)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    {sale.status !== 'canceled' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={async () => {
                                                                if (!confirm('Tem certeza que deseja EXCLUIR permanentemente? O estoque será devolvido.')) return;
                                                                const reason = prompt("Digite o motivo da exclusão para auditoria:");
                                                                if (!reason) return;

                                                                setLoading(true);
                                                                try {
                                                                    const { error } = await supabase.rpc('delete_sale_secure', {
                                                                        p_sale_id: sale.id,
                                                                        p_reason: reason
                                                                    });

                                                                    if (error) throw error;

                                                                    toast({ title: "Venda excluída e estoque estornado!" });
                                                                    fetchSales();

                                                                } catch (e: any) {
                                                                    alert('Erro: ' + e.message);
                                                                } finally {
                                                                    setLoading(false);
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Editar Venda</DialogTitle>
                    </DialogHeader>
                    {editingSale && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Valor Total (R$)</Label>
                                <Input
                                    type="number"
                                    value={editingSale.total}
                                    onChange={e => setEditingSale({ ...editingSale, total: Number(e.target.value) })}
                                />
                                <p className="text-xs text-zinc-500">Alterar este valor atualiza o financeiro automaticamente.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Select value={editingSale.client_id} onValueChange={v => setEditingSale({ ...editingSale, client_id: v })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="anonymous">Consumidor Final</SelectItem>
                                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Motivo da Alteração (Obrigatório)</Label>
                                <Input
                                    value={editReason}
                                    onChange={e => setEditReason(e.target.value)}
                                    placeholder="Ex: Cliente pediu desconto, Erro de digitação..."
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveEdit}>Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5 text-blue-600" />
                            Detalhamento da Venda
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                            <Table>
                                <TableHeader className="bg-zinc-50">
                                    <TableRow>
                                        <TableHead className="font-bold">Produto</TableHead>
                                        <TableHead className="text-right font-bold">Qtd</TableHead>
                                        <TableHead className="text-right font-bold">Preço Un.</TableHead>
                                        <TableHead className="text-right font-bold">Custo Un.</TableHead>
                                        <TableHead className="text-right font-bold">Total Venda</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {viewSaleItems.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-400 italic">Nenhum item encontrado.</TableCell></TableRow>
                                    ) : (
                                        viewSaleItems.map((item: any) => (
                                            <TableRow key={item.id} className="hover:bg-zinc-50/50">
                                                <TableCell className="font-medium">{item.products?.name || 'Item Desconhecido'}</TableCell>
                                                <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                                                <TableCell className="text-right text-zinc-600">R$ {Number(item.unit_price).toFixed(2)}</TableCell>
                                                <TableCell className="text-right text-zinc-400 text-xs">
                                                    R$ {(() => {
                                                        const currentStock = item.products?.product_stocks?.find((s: any) => s.average_cost > 0) || item.products?.product_stocks?.[0];
                                                        const cost = Number(currentStock?.average_cost) || 0;
                                                        return cost.toFixed(2);
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-zinc-900">R$ {(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {(() => {
                                const totalSale = Number(selectedViewSale?.total || 0);
                                const totalCost = viewSaleItems.reduce((acc, item) => {
                                    const currentStock = item.products?.product_stocks?.find((s: any) => s.average_cost > 0) || item.products?.product_stocks?.[0];
                                    const cost = Number(currentStock?.average_cost) || 0;
                                    return acc + (item.quantity * cost);
                                }, 0);
                                const profit = totalSale - totalCost;
                                const margin = totalSale > 0 ? (profit / totalSale) * 100 : 0;

                                return (
                                    <>
                                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 flex flex-col gap-1">
                                            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Custo de Mercadoria</span>
                                            <span className="text-lg font-bold text-zinc-700">R$ {totalCost.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 flex flex-col gap-1">
                                            <span className="text-[10px] uppercase font-bold text-green-600/70 tracking-wider">Lucro Bruto</span>
                                            <span className="text-lg font-bold text-green-700">R$ {profit.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col gap-1">
                                            <span className="text-[10px] uppercase font-bold text-blue-600/70 tracking-wider">Margem de Contribuição</span>
                                            <span className="text-lg font-bold text-blue-700">{margin.toFixed(1)}%</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                    <DialogFooter className="bg-zinc-50/50 -mx-6 -mb-6 p-4 border-t mt-2">
                        <Button variant="outline" onClick={() => setIsViewOpen(false)} className="bg-white">Fechar Detalhes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
