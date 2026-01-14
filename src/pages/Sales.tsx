
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, ShoppingCart, TrendingUp, Edit, X, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export default function Sales() {
    const navigate = useNavigate();
    const [sales, setSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSales();
    }, []);

    async function fetchSales() {
        setLoading(true);
        // Fetch sales with client info
        const { data, error } = await supabase
            .from('sales')
            .select('*, clients(name)')
            .order('created_at', { ascending: false });

        if (!error) {
            setSales(data || []);
        }
        setLoading(false);
    }

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

    const handleSaveEdit = async () => {
        if (!editingSale) return;

        const { error } = await supabase.from('sales').update({
            total: editingSale.total,
            client_id: editingSale.client_id === 'anonymous' ? null : editingSale.client_id
        }).eq('id', editingSale.id);

        if (error) {
            toast({ variant: 'destructive', title: "Erro ao atualizar", description: error.message });
        } else {
            toast({ title: "Venda atualizada!", description: "Valores e Cliente sincronizados." });
            setIsEditOpen(false);
            fetchSales();
        }
    };

    const totalRevenue = sales.filter(s => s.status === 'completed').reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    const countSales = sales.filter(s => s.status === 'completed').length;

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Vendas</h2>
                    <p className="text-zinc-500">Histórico e Lançamento de Vendas.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={async () => {
                        if (!confirm("Deseja excluir TODAS as vendas canceladas permanentemente?")) return;
                        setLoading(true);
                        const { error } = await supabase.from('sales').delete().eq('status', 'canceled');
                        if (error) toast({ variant: 'destructive', title: "Erro", description: error.message });
                        else { toast({ title: "Limpeza concluída!" }); fetchSales(); }
                    }} variant="ghost" className="text-red-400 hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="mr-2 h-4 w-4" /> Limpar Cancelados
                    </Button>
                    <Button onClick={() => navigate('/clients')} variant="outline">
                        Gerenciar Clientes
                    </Button>
                    <Button onClick={() => navigate('/pos')} className="bg-green-600 hover:bg-green-700 text-white">
                        <Plus className="mr-2 h-4 w-4" /> Nova Venda (PDV)
                    </Button>
                </div>
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

            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-3 mb-4">
                {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : sales.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Nenhuma venda registrada.</div>
                ) : (
                    sales.map(sale => (
                        <div key={sale.id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-xs text-zinc-500">{new Date(sale.created_at).toLocaleString()}</div>
                                    <div className="font-bold text-zinc-900">{sale.clients?.name || 'Consumidor Final'}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sale.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        sale.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {sale.status === 'completed' ? 'Concluída' : sale.status === 'canceled' ? 'Cancelada' : sale.status}
                                    </span>
                                    {sale.edit_status === 'approved' && (
                                        <span className="text-[10px] text-green-600 font-medium">Edição OK</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs capitalize">{sale.payment_method === 'money' ? 'Dinheiro' : sale.payment_method}</Badge>
                                <Badge variant="secondary" className={`text-xs ${sale.stock_source === 'danilo' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                    Estoque {sale.stock_source === 'danilo' ? 'DANILO' : 'ADRIEL'}
                                </Badge>
                            </div>

                            <div className="flex justify-between items-center pt-3 border-t mt-1">
                                <div className="font-bold text-lg text-green-600">R$ {Number(sale.total).toFixed(2)}</div>
                                <div className="flex gap-2">
                                    {sale.edit_status === 'requested' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200"
                                            onClick={async () => {
                                                if (!confirm("Autorizar edição desta venda?")) return;
                                                await supabase.from('sales').update({ edit_status: 'approved' }).eq('id', sale.id);
                                                toast({ title: "Edição Autorizada" });
                                                fetchSales();
                                            }}
                                        >
                                            Autorizar
                                        </Button>
                                    )}

                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 bg-blue-50" onClick={() => handleEditClick(sale)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    {sale.status !== 'canceled' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500 bg-red-50"
                                            onClick={async () => {
                                                if (!confirm('Tem certeza que deseja EXCLUIR permanentemente? O estoque será devolvido.')) return;
                                                setLoading(true);
                                                try {
                                                    const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
                                                    if (items) {
                                                        for (const item of items) {
                                                            const { data: prod } = await supabase.from('products').select('*').eq('id', item.product_id).single();
                                                            if (prod) {
                                                                const field = sale.stock_source === 'danilo' ? 'stock_danilo' : 'stock_adriel';
                                                                const newStock = (prod[field] || 0) + item.quantity;
                                                                await supabase.from('products').update({ [field]: newStock }).eq('id', item.product_id);
                                                            }
                                                        }
                                                    }
                                                    await supabase.from('financial_movements').delete().eq('detail_order_id', sale.id);
                                                    await supabase.from('sale_items').delete().eq('sale_id', sale.id);
                                                    const { error } = await supabase.from('sales').delete().eq('id', sale.id);
                                                    if (error) throw error;
                                                    toast({ title: "Venda excluída!" });
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
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="hidden md:block bg-white rounded-lg border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Método</TableHead>
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
                                    <TableCell className="capitalize">{sale.payment_method === 'money' ? 'Dinheiro' : sale.payment_method}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sale.stock_source === 'danilo' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                            }`}>
                                            Estoque {sale.stock_source === 'danilo' ? 'DANILO' : 'ADRIEL'}
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
                                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(sale)}>
                                            <Edit className="h-4 w-4 text-blue-500" />
                                        </Button>
                                        {sale.status !== 'canceled' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                onClick={async () => {
                                                    if (!confirm('Tem certeza que deseja EXCLUIR permanentemente? O estoque será devolvido.')) return;

                                                    setLoading(true);
                                                    try {
                                                        // 1. Fetch Items to Revert Stock
                                                        const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);

                                                        if (items) {
                                                            for (const item of items) {
                                                                const { data: prod } = await supabase.from('products').select('*').eq('id', item.product_id).single();
                                                                if (prod) {
                                                                    const field = sale.stock_source === 'danilo' ? 'stock_danilo' : 'stock_adriel';
                                                                    const currentStock = prod[field] || 0;
                                                                    const newStock = currentStock + item.quantity;
                                                                    await supabase.from('products').update({ [field]: newStock }).eq('id', item.product_id);
                                                                }
                                                            }
                                                        }

                                                        // 2. Delete Movement
                                                        await supabase.from('financial_movements').delete().eq('detail_order_id', sale.id);

                                                        // 3. Delete Header (Items cascade if set up, but assuming safe delete)
                                                        // If no cascade on items, we must delete items first.
                                                        await supabase.from('sale_items').delete().eq('sale_id', sale.id);
                                                        const { error } = await supabase.from('sales').delete().eq('id', sale.id);

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
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveEdit}>Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
