import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ArrowDownCircle, RotateCcw, Trash2, Filter, ChevronDown, ChevronUp, Layers, Calculator } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface FinancialMovement {
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    status: 'pending' | 'paid';
    due_date: string;
    payment_date: string | null;
    created_at: string;
    related_purchase_id?: string;
    // Enriched fields
    detail_supplier?: string;
    detail_buyer?: string;
    detail_order_nickname?: string;
    detail_order_id?: string;
}

interface BatchGroup {
    order_id: string;
    order_nickname: string;
    supplier_name: string;
    movements: FinancialMovement[];
    total_pending: number;
    total_paid: number;
}

export default function Financial() {
    const [movements, setMovements] = useState<FinancialMovement[]>([]);
    const [batches, setBatches] = useState<BatchGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isFinancial, setIsFinancial] = useState(false);

    // Filters
    const [filterBuyer, setFilterBuyer] = useState<string>('all');
    const [filterSupplier, setFilterSupplier] = useState<string>('all');
    const [availableBuyers, setAvailableBuyers] = useState<string[]>([]);
    const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);

    // Expansion & Selection
    const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
    const [selectedBatches, setSelectedBatches] = useState<Record<string, boolean>>({}); // IDs das batches selecionadas para subtotal

    const { toast } = useToast();

    useEffect(() => {
        checkUserRole();
        fetchMovements();
    }, []);

    async function checkUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('roles, role').eq('id', user.id).single();
            const roles = data?.roles || (data?.role ? [data.role] : []) || [];
            setIsAdmin(roles.includes('admin'));
            setIsFinancial(roles.includes('financial'));
        }
    }

    async function fetchMovements() {
        setLoading(true);
        // 1. Fetch Movements
        const { data: movs, error } = await supabase
            .from('financial_movements')
            .select('*')
            .order('due_date', { ascending: true });

        if (error) {
            toast({ variant: 'destructive', title: 'Erro ao carregar', description: error.message });
            setLoading(false);
            return;
        }

        let enrichedMovements: FinancialMovement[] = movs || [];

        // 2. Fetch Related Data (Purchases & Profiles) to enrich
        const purchaseIds = enrichedMovements.map(m => m.related_purchase_id).filter(Boolean);
        if (purchaseIds.length > 0) {
            const { data: requests } = await supabase
                .from('purchase_requests')
                .select('id, user_id, requested_by, item_name, order_id')
                .in('id', purchaseIds);

            const orderIds = requests?.map(r => r.order_id).filter(Boolean) || [];
            let ordersMap: Record<string, any> = {};
            if (orderIds.length > 0) {
                const { data: orders } = await supabase.from('purchase_orders').select('id, supplier_id, nickname').in('id', orderIds);
                if (orders) {
                    // Fetch suppliers
                    const supplierIds = orders.map(o => o.supplier_id).filter(Boolean);
                    const { data: suppliers } = await supabase.from('suppliers').select('id, name').in('id', supplierIds);

                    orders.forEach(o => {
                        const sup = suppliers?.find(s => s.id === o.supplier_id);
                        ordersMap[o.id] = { ...o, supplier_name: sup?.name };
                    });
                }
            }

            // Fetch Profiles for Buyers
            const userIds = requests?.map(r => r.user_id).filter(Boolean) || [];
            let profilesMap: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
                profiles?.forEach(p => profilesMap[p.id] = p.full_name || p.email);
            }

            // Map back to movements
            enrichedMovements = enrichedMovements.map(m => {
                const req = requests?.find(r => r.id === m.related_purchase_id);
                let buyerName = 'Sistema';
                let supplierName = '-';
                let orderNickname = '';
                let orderId = '';

                if (req) {
                    buyerName = profilesMap[req.user_id] || req.requested_by || 'Desconhecido';
                    if (req.order_id && ordersMap[req.order_id]) {
                        orderId = req.order_id;
                        supplierName = ordersMap[req.order_id].supplier_name || 'Vários';
                        orderNickname = ordersMap[req.order_id].nickname || 'Lote sem nome';
                        if (supplierName === 'Vários' || !supplierName) {
                            const nick = ordersMap[req.order_id].nickname || '';
                            if (nick.includes(' - ')) supplierName = nick.split(' - ')[0];
                        }
                    }
                }
                return { ...m, detail_buyer: buyerName, detail_supplier: supplierName, detail_order_nickname: orderNickname, detail_order_id: orderId };
            });
        }

        setMovements(enrichedMovements);

        // Group into Batches
        const grouped: Record<string, BatchGroup> = {};
        const looseItems: FinancialMovement[] = [];

        enrichedMovements.forEach(m => {
            if (m.detail_order_id) {
                if (!grouped[m.detail_order_id]) {
                    grouped[m.detail_order_id] = {
                        order_id: m.detail_order_id,
                        order_nickname: m.detail_order_nickname || 'Sem Nome',
                        supplier_name: m.detail_supplier || '-',
                        movements: [],
                        total_pending: 0,
                        total_paid: 0
                    };
                }
                grouped[m.detail_order_id].movements.push(m);
                if (m.type === 'expense') {
                    if (m.status === 'pending') grouped[m.detail_order_id].total_pending += m.amount;
                    else grouped[m.detail_order_id].total_paid += m.amount;
                }
            } else {
                looseItems.push(m);
            }
        });

        // Add "Avulsos" group if any
        if (looseItems.length > 0) {
            const loosePending = looseItems.filter(m => m.type === 'expense' && m.status === 'pending').reduce((a, b) => a + b.amount, 0);
            const loosePaid = looseItems.filter(m => m.type === 'expense' && m.status === 'paid').reduce((a, b) => a + b.amount, 0);
            grouped['avulso'] = {
                order_id: 'avulso',
                order_nickname: 'Lançamentos Avulsos',
                supplier_name: '-',
                movements: looseItems,
                total_pending: loosePending,
                total_paid: loosePaid
            };
        }

        setBatches(Object.values(grouped));

        // Filters UI
        const buyers = Array.from(new Set(enrichedMovements.map(m => m.detail_buyer).filter(Boolean))) as string[];
        const suppliers = Array.from(new Set(enrichedMovements.map(m => m.detail_supplier).filter(Boolean))) as string[];
        setAvailableBuyers(buyers.sort());
        setAvailableSuppliers(suppliers.sort());

        setLoading(false);
    }

    async function markAsPaid(id: string) {
        if (!confirm("Confirmar pagamento/recebimento?")) return;
        const { error } = await supabase.from('financial_movements').update({ status: 'paid', payment_date: new Date().toISOString() }).eq('id', id);
        if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
        else { toast({ title: "Registro atualizado!" }); fetchMovements(); }
    }

    async function deleteMovement(id: string) {
        if (!confirm("Excluir este lançamento permanentemente?")) return;
        const { error } = await supabase.from('financial_movements').delete().eq('id', id);
        if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
        else { toast({ title: "Removido" }); fetchMovements(); }
    }

    async function handleReversePayment(id: string) {
        if (!confirm("Estornar baixa deste lançamento?")) return;
        const { error } = await supabase.from('financial_movements').update({ status: 'pending', payment_date: null }).eq('id', id);
        if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
        else { toast({ title: "Pagamento estornado" }); fetchMovements(); }
    }

    // --- Derived State ---
    const filteredBatches = batches.filter(batch => {
        // If sorting strictly by batch, we check if *any* movement in batch matches filters?
        // Or if the batch's primary supplier matches?
        // Let's filter the MOVEMENTS inside the batch mainly.
        // If filters are active, we show batches that contain at least one matching movement.

        if (filterBuyer === 'all' && filterSupplier === 'all') return true;

        const hasMatchingMovement = batch.movements.some(m => {
            const matchBuyer = filterBuyer === 'all' || m.detail_buyer === filterBuyer;
            const matchSupplier = filterSupplier === 'all' || m.detail_supplier === filterSupplier;
            return matchBuyer && matchSupplier;
        });

        return hasMatchingMovement;
    });

    // Calculate Subtotal from SELECTED batches
    const selectedBatchesTotal = batches
        .filter(b => selectedBatches[b.order_id])
        .reduce((acc, b) => acc + b.total_pending, 0);

    const toggleBatchSelection = (id: string, checked: boolean) => {
        setSelectedBatches(prev => ({ ...prev, [id]: checked }));
    }

    const toggleExpand = (id: string) => {
        setExpandedBatches(prev => ({ ...prev, [id]: !prev[id] }));
    }

    const totalPendingGlobal = movements.filter(m => m.type === 'expense' && m.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
    const totalPaidGlobal = movements.filter(m => m.type === 'expense' && m.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Financeiro (Por Lote)</h2>
                    <p className="text-zinc-500">Contas a pagar agrupadas.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => { await fetchMovements(); toast({ title: "Sincronizado!", description: "Dados atualizados." }) }} className="text-orange-600 border-orange-200">
                        <RotateCcw className="mr-2 h-4 w-4" /> Sincronizar
                    </Button>
                </div>
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-lg shadow-sm border sticky top-0 z-10">
                <div className="flex items-center gap-2 text-sm text-zinc-500"><Filter className="h-4 w-4" /> Filtros:</div>
                <Select value={filterBuyer} onValueChange={setFilterBuyer}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Comprador" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos Compradores</SelectItem>{availableBuyers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos Fornecedores</SelectItem>{availableSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>

                {/* Selection Subtotal */}
                <div className="ml-auto flex items-center gap-4">
                    {Object.values(selectedBatches).some(Boolean) ? (
                        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md font-medium border border-blue-100 flex items-center gap-2 animate-in fade-in">
                            <Calculator className="h-4 w-4" />
                            <span>Selecionados: </span>
                            <span className="text-lg font-bold">R$ {Math.abs(selectedBatchesTotal).toFixed(2)}</span>
                        </div>
                    ) : (
                        <div className="text-sm text-zinc-400 italic">Selecione lotes para somar</div>
                    )}
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Global Pendente</CardTitle>
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">R$ {Math.abs(totalPendingGlobal).toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Global Pago</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">R$ {Math.abs(totalPaidGlobal).toFixed(2)}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Batch List */}
            {loading ? <Loader2 className="animate-spin h-8 w-8 mx-auto" /> : (
                <div className="space-y-4">
                    {filteredBatches.length === 0 && <div className="text-center py-10 text-muted-foreground">Nenhum lote encontrado.</div>}

                    {filteredBatches.map(batch => (
                        <Card key={batch.order_id} className={`overflow-hidden transition-all ${selectedBatches[batch.order_id] ? 'ring-2 ring-blue-500 shadow-md' : 'shadow-sm hover:shadow'}`}>
                            {/* Header */}
                            <div className="flex items-center p-4 bg-zinc-50 border-b gap-4">
                                <Checkbox
                                    id={`check-${batch.order_id}`}
                                    checked={!!selectedBatches[batch.order_id]}
                                    onCheckedChange={(c) => toggleBatchSelection(batch.order_id, c as boolean)}
                                />
                                <div className="flex-1 cursor-pointer" onClick={() => toggleExpand(batch.order_id)}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Layers className="h-4 w-4 text-zinc-400" />
                                            <h3 className="font-semibold text-lg">{batch.order_nickname}</h3>
                                            <Badge variant="outline">{batch.supplier_name}</Badge>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <div className="text-xs text-zinc-500">Pendente</div>
                                                <div className={`font-bold ${batch.total_pending !== 0 ? 'text-red-500' : 'text-zinc-400'}`}>R$ {Math.abs(batch.total_pending).toFixed(2)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-zinc-500">Pago</div>
                                                <div className="font-bold text-green-600">R$ {Math.abs(batch.total_paid).toFixed(2)}</div>
                                            </div>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                {expandedBatches[batch.order_id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expandable Content (Table) */}
                            {expandedBatches[batch.order_id] && (
                                <div className="p-0 animate-in slide-in-from-top-2">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Vencimento</TableHead>
                                                <TableHead>Descrição</TableHead>
                                                <TableHead>Comprador</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {batch.movements.map(mov => (
                                                <TableRow key={mov.id} className="hover:bg-zinc-50">
                                                    <TableCell>{mov.due_date ? new Date(mov.due_date).toLocaleDateString() : '-'}</TableCell>
                                                    <TableCell className="font-medium">{mov.description}</TableCell>
                                                    <TableCell className="text-zinc-600">{mov.detail_buyer}</TableCell>
                                                    <TableCell className="font-bold">R$ {Math.abs(mov.amount).toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={mov.status === 'paid' ? 'default' : 'secondary'} className={mov.status === 'paid' ? 'bg-green-600' : 'bg-yellow-500 text-white'}>
                                                            {mov.status === 'paid' ? 'Pago' : 'Pendente'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {mov.status === 'pending' && (
                                                            <Button size="sm" variant="ghost" onClick={() => markAsPaid(mov.id)} title="Baixar">
                                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                        )}
                                                        {mov.status === 'paid' && (isAdmin || isFinancial) && (
                                                            <Button size="sm" variant="ghost" className="text-orange-500 hover:text-orange-700" onClick={() => handleReversePayment(mov.id)} title="Estornar Baixa">
                                                                <RotateCcw className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        {isAdmin && (
                                                            <Button size="sm" variant="ghost" onClick={() => deleteMovement(mov.id)} title="Excluir">
                                                                <Trash2 className="h-4 w-4 text-red-400" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
