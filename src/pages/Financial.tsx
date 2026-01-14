import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ArrowDownCircle, RotateCcw, Trash2, Filter, ChevronDown, ChevronUp, Layers, Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FinancialMovement, BatchGroup } from "@/types";
import { calculateTotalPending, calculateTotalPaid } from "@/lib/financialUtils";

export default function Financial() {
    const [movements, setMovements] = useState<FinancialMovement[]>([]);
    const [batches, setBatches] = useState<BatchGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isFinancial, setIsFinancial] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState("payable");

    // Filters
    const [filterBuyer, setFilterBuyer] = useState<string>('all');
    const [filterSupplier, setFilterSupplier] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [availableBuyers, setAvailableBuyers] = useState<string[]>([]);
    const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Expansion & Selection
    const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
    const [selectedBatches, setSelectedBatches] = useState<Record<string, boolean>>({});

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

        // Fetch Related Data
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
                    const supplierIds = orders.map(o => o.supplier_id).filter(Boolean);
                    const { data: suppliers } = await supabase.from('suppliers').select('id, name').in('id', supplierIds);

                    orders.forEach(o => {
                        const sup = suppliers?.find(s => s.id === o.supplier_id);
                        ordersMap[o.id] = { ...o, supplier_name: sup?.name };
                    });
                }
            }

            const userIds = requests?.map(r => r.user_id).filter(Boolean) || [];
            let profilesMap: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
                profiles?.forEach(p => profilesMap[p.id] = p.full_name || p.email);
            }

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

            // Fetch Sales Details for Income items that are likely Sales
            const saleIds = enrichedMovements
                .filter(m => !m.related_purchase_id && m.detail_order_id)
                .map(m => m.detail_order_id!)
                .filter(Boolean);

            if (saleIds.length > 0) {
                const { data: sales, error: salesError } = await supabase
                    .from('sales')
                    .select('id, client_id, clients(name)')
                    .in('id', saleIds);

                if (sales) {
                    enrichedMovements = enrichedMovements.map(m => {
                        if (!m.related_purchase_id && m.detail_order_id) {
                            const sale = sales.find(s => s.id === m.detail_order_id);
                            if (sale) {
                                // It's a sale
                                const clientName = (sale.clients as any)?.name || 'Consumidor Final';
                                return {
                                    ...m,
                                    description: `Venda - ${clientName} - ${m.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
                                    detail_buyer: clientName === 'Consumidor Final' ? 'Balcão' : clientName,
                                    detail_supplier: 'Loja' // Income source
                                };
                            }
                        }
                        return m;
                    });
                }
            }
        }

        setMovements(enrichedMovements);

        // Group into Batches
        const grouped: Record<string, BatchGroup> = {};
        const looseItems: FinancialMovement[] = [];

        enrichedMovements.forEach(m => {
            if (m.detail_order_id && m.related_purchase_id) {
                if (!grouped[m.detail_order_id]) {
                    grouped[m.detail_order_id] = {
                        order_id: m.detail_order_id,
                        order_nickname: m.detail_order_nickname || 'Sem Nome',
                        supplier_name: m.detail_supplier || '-',
                        movements: [],
                        total_pending: 0,
                        total_paid: 0,
                        buyer_name: m.detail_buyer
                    };
                }
                grouped[m.detail_order_id].movements.push(m);
                if (m.status === 'pending') grouped[m.detail_order_id].total_pending += m.amount;
                else grouped[m.detail_order_id].total_paid += m.amount;
            } else {
                looseItems.push(m);
            }
        });

        // AVULSOS Handling
        // We might want to group avulsos by TYPE (Income vs Expense) to avoid mixing in the same "Avulso" batch?
        // Or just keep them together and let the filter handle it.
        // Let's split loose items by type effectively creating two "Avulso" groups if needed, or just one mixed.
        // Actually, for the Tab separation to work clean, the "Avulso" batch should probably be respecting the type filter later.
        // But if we have one batch with mixed types, the batch total will be weird.
        // Let's create separate "Avulso Expense" and "Avulso Income" groups to be safe?
        // Or simpler: Just put them in 'avulso' and the filter logic downstream will hide the irrelevant ones.

        if (looseItems.length > 0) {
            looseItems.forEach(item => {
                const dateKey = item.due_date ? new Date(item.due_date).toLocaleDateString() : 'Sem Data';
                // Create a sortable key for ordering: YYYY-MM-DD
                const sortKey = item.due_date ? item.due_date.split('T')[0] : '0000-00-00';
                const groupId = `avulso_${sortKey}`;

                if (!grouped[groupId]) {
                    grouped[groupId] = {
                        order_id: groupId,
                        order_nickname: `Avulsos - ${dateKey}`,
                        supplier_name: '-', // Mixed
                        movements: [],
                        total_pending: 0,
                        total_paid: 0,
                        buyer_name: '-'
                    };
                }
                grouped[groupId].movements.push(item);
                if (item.status === 'pending') grouped[groupId].total_pending += item.amount;
                else grouped[groupId].total_paid += item.amount;
            });
        }

        setBatches(Object.values(grouped).sort((a, b) => {
            // Sort logic: 
            // 1. "Avulso" batches by date descending
            // 2. Named batches by nickname
            const aIsAvulso = a.order_id.startsWith('avulso_');
            const bIsAvulso = b.order_id.startsWith('avulso_');

            if (aIsAvulso && bIsAvulso) {
                return b.order_id.localeCompare(a.order_id); // Descending date (avulso_YYYY-MM-DD)
            }
            if (aIsAvulso) return 1; // Avulso at bottom? Or top? User asked for "Data do dia", let's put recent dates at top.
            if (bIsAvulso) return -1;

            return a.order_nickname.localeCompare(b.order_nickname);
        }));

        // Filters UI Data
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

    // --- Bulk Actions ---
    async function processBatchAction(action: 'pay' | 'reverse') {
        const selectedIds = Object.keys(selectedBatches).filter(id => selectedBatches[id]);
        if (selectedIds.length === 0) return;

        const isPay = action === 'pay';
        const confirmMsg = isPay
            ? `Confirma a BAIXA de todos os itens PENDENTES nos ${selectedIds.length} lotes?`
            : `Confirma o ESTORNO de todos os itens BAIXADOS nos ${selectedIds.length} lotes?`;

        if (!confirm(confirmMsg)) return;

        setLoading(true);
        try {
            const targetStatus = isPay ? 'pending' : 'paid';
            const newStatus = isPay ? 'paid' : 'pending';
            const paymentDate = isPay ? new Date().toISOString() : null;

            const idsToUpdate: string[] = [];

            selectedIds.forEach(batchId => {
                const batch = batches.find(b => b.order_id === batchId);
                if (batch) {
                    batch.movements.forEach(m => {
                        // IMPORTANT: Only affect items visible in current tab?
                        // Ideally yes. So we should check the movement type matches the active tab.
                        const isExpense = m.type === 'expense';
                        const isIncome = m.type === 'income';
                        const matchesTab = activeTab === 'payable' ? isExpense : isIncome;

                        if (m.status === targetStatus && matchesTab) {
                            idsToUpdate.push(m.id);
                        }
                    });
                }
            });

            if (idsToUpdate.length === 0) {
                toast({ title: "Nenhum item elegível para esta ação nos lotes selecionados." });
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from('financial_movements')
                .update({ status: newStatus, payment_date: paymentDate })
                .in('id', idsToUpdate);

            if (error) throw error;

            toast({ title: "Sucesso!", description: `${idsToUpdate.length} lançamentos atualizados.` });
            setSelectedBatches({});
            fetchMovements();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro na ação em lote", description: e.message });
            setLoading(false);
        }
    }

    // --- Filtering Logic ---
    const getFilteredBatches = (type: 'expense' | 'income') => {
        return batches.map(batch => {
            const filteredMovements = batch.movements.filter(m => {
                // Type Filter (Core of Tabs)
                if (m.type !== type) return false;

                // Standard Filters
                const matchBuyer = filterBuyer === 'all' || m.detail_buyer === filterBuyer;
                const matchSupplier = filterSupplier === 'all' || m.detail_supplier === filterSupplier;
                const matchStatus = filterStatus === 'all' || m.status === filterStatus;

                // Date Filter
                let dateMatches = true;
                if (startDate || endDate) {
                    const refDate = (m.status === 'paid' && m.payment_date) ? m.payment_date : m.due_date;
                    if (refDate) {
                        const d = new Date(refDate).toISOString().split('T')[0];
                        if (startDate && d < startDate) dateMatches = false;
                        if (endDate && d > endDate) dateMatches = false;
                    } else {
                        dateMatches = false;
                    }
                }

                return matchBuyer && matchSupplier && matchStatus && dateMatches;
            });

            // Re-calculate totals for this filtered batch view
            // This ensures the card shows only the totals for the relevant items (e.g. only expenses)
            const pending = filteredMovements.filter(m => m.status === 'pending').reduce((a, b) => a + b.amount, 0);
            const paid = filteredMovements.filter(m => m.status === 'paid').reduce((a, b) => a + b.amount, 0);

            return {
                ...batch,
                movements: filteredMovements,
                visual_total_pending: pending,
                visual_total_paid: paid
            };
        }).filter(batch => batch.movements.length > 0);
    };

    const currentType = activeTab === 'payable' ? 'expense' : 'income';
    const filteredBatches = getFilteredBatches(currentType);

    // Totals for Cards
    const totalPending = filteredBatches.reduce((acc, b) => acc + b.visual_total_pending, 0);
    const totalPaid = filteredBatches.reduce((acc, b) => acc + b.visual_total_paid, 0);

    // Selection Totals
    const selectedBatchesList = filteredBatches.filter(b => selectedBatches[b.order_id]);
    const selectionTotal = selectedBatchesList.reduce((acc, b) => acc + b.visual_total_pending, 0);

    const toggleBatchSelection = (id: string, checked: boolean) => {
        setSelectedBatches(prev => ({ ...prev, [id]: checked }));
    }

    const toggleExpand = (id: string) => {
        setExpandedBatches(prev => ({ ...prev, [id]: !prev[id] }));
    }

    return (
        <div className="flex-1 p-4 md:p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Financeiro</h2>
                    <p className="text-zinc-500">Gestão de Contas a Pagar e Receber</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => { await fetchMovements(); toast({ title: "Sincronizado!" }) }} className="text-orange-600 border-orange-200">
                        <RotateCcw className="mr-2 h-4 w-4" /> Atualizar
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-white border text-zinc-500">
                    <TabsTrigger value="payable" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                        <TrendingDown className="mr-2 h-4 w-4" /> Contas a Pagar
                    </TabsTrigger>
                    <TabsTrigger value="receivable" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                        <TrendingUp className="mr-2 h-4 w-4" /> Contas a Receber
                    </TabsTrigger>
                </TabsList>

                {/* Shared Filters Bar */}
                <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-lg shadow-sm border">
                    <div className="flex items-center gap-2 text-sm text-zinc-500"><Filter className="h-4 w-4" /> Filtros:</div>
                    <Select value={filterBuyer} onValueChange={setFilterBuyer}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Comprador" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Todos</SelectItem>{availableBuyers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>

                    {/* Only show Supplier filter for Payable? Or rename? */}
                    {activeTab === 'payable' && (
                        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                            <SelectContent><SelectItem value="all">Todos</SelectItem>{availableSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                    )}

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos Status</SelectItem>
                            <SelectItem value="pending">Pendentes</SelectItem>
                            <SelectItem value="paid">Baixados / Realizados</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 border-l pl-4 ml-2">
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-min" />
                        <span className="text-zinc-300">-</span>
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-min" />
                    </div>

                    {/* Quick Stats for Selection */}
                    {selectionTotal > 0 && (
                        <div className="ml-auto flex items-center gap-4 animate-in fade-in slide-in-from-right-5">
                            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm font-medium border border-blue-100">
                                Seleção: R$ {selectionTotal.toFixed(2)}
                            </div>
                            <Button size="sm" onClick={() => processBatchAction('pay')} className={activeTab === 'payable' ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}>
                                <CheckCircle className="mr-2 h-3 w-3" /> {activeTab === 'payable' ? 'Baixar' : 'Receber'}
                            </Button>
                        </div>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
                            <ArrowDownCircle className={`h-4 w-4 ${activeTab === 'payable' ? 'text-red-500' : 'text-zinc-500'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${activeTab === 'payable' ? 'text-red-600' : 'text-zinc-700'}`}>R$ {totalPending.toFixed(2)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Realizado</CardTitle>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">R$ {totalPaid.toFixed(2)}</div>
                        </CardContent>
                    </Card>
                </div>

                {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-zinc-400" /></div> : (
                    <TabsContent value={activeTab} className="space-y-4 mt-0">
                        {filteredBatches.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-lg border border-dashed text-zinc-400">
                                Nenhum lançamento encontrado para esta visão.
                            </div>
                        )}

                        {filteredBatches.map(batch => (
                            <Card key={batch.order_id} className={`overflow-hidden transition-all duration-200 ${selectedBatches[batch.order_id] ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'}`}>
                                <div className="flex items-center p-4 bg-white border-b gap-4">
                                    <Checkbox
                                        checked={!!selectedBatches[batch.order_id]}
                                        onCheckedChange={(c) => toggleBatchSelection(batch.order_id, c as boolean)}
                                    />
                                    <div className="flex-1 cursor-pointer" onClick={() => toggleExpand(batch.order_id)}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Layers className="h-4 w-4 text-zinc-400" />
                                                <div className="flex flex-col">
                                                    <h3 className="font-semibold text-zinc-800">{batch.order_nickname}</h3>
                                                    <span className="text-xs text-zinc-500">ID: {batch.order_id.slice(0, 8)}...</span>
                                                </div>
                                                {batch.supplier_name !== '-' && <Badge variant="outline">{batch.supplier_name}</Badge>}
                                                {batch.buyer_name !== '-' && <Badge variant="secondary">{batch.buyer_name}</Badge>}
                                            </div>

                                            <div className="flex items-center gap-8">
                                                <div className="text-right min-w-[100px]">
                                                    <div className="text-[10px] uppercase font-bold text-zinc-400">Pendente</div>
                                                    <div className={`text-lg font-bold ${batch.visual_total_pending > 0 ? (activeTab === 'payable' ? 'text-red-600' : 'text-blue-600') : 'text-zinc-300'}`}>
                                                        R$ {batch.visual_total_pending.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="text-right min-w-[100px]">
                                                    <div className="text-[10px] uppercase font-bold text-zinc-400">Realizado</div>
                                                    <div className="text-lg font-bold text-green-600">
                                                        R$ {batch.visual_total_paid.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className={`transition-transform duration-200 ${expandedBatches[batch.order_id] ? 'rotate-180' : ''}`}>
                                                    <ChevronDown className="h-5 w-5 text-zinc-400" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {expandedBatches[batch.order_id] && (
                                    <div className="animate-in slide-in-from-top-1 bg-zinc-50/50">
                                        {/* Mobile View: Cards */}
                                        <div className="md:hidden space-y-2 p-2">
                                            {batch.movements.map(mov => (
                                                <div key={mov.id} className="bg-white p-3 rounded-lg border shadow-sm flex flex-col gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-medium text-sm text-zinc-900">{mov.description}</div>
                                                            <div className="text-xs text-zinc-500">{mov.due_date ? new Date(mov.due_date).toLocaleDateString() : '-'} • {mov.detail_buyer}</div>
                                                        </div>
                                                        <div className="font-bold text-zinc-900">R$ {mov.amount.toFixed(2)}</div>
                                                    </div>

                                                    <div className="flex justify-between items-center border-t pt-2 mt-1">
                                                        <Badge variant={mov.status === 'paid' ? 'default' : 'outline'} className={mov.status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'text-yellow-700 bg-yellow-50 mobile-badge'}>
                                                            {mov.status === 'paid' ? 'Pago' : 'Pendente'}
                                                        </Badge>

                                                        <div className="flex gap-2">
                                                            {mov.status === 'pending' && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-green-600 bg-green-50" onClick={() => markAsPaid(mov.id)}>
                                                                    <CheckCircle className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {mov.status === 'paid' && (isAdmin || isFinancial) && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-orange-600 bg-orange-50" onClick={() => handleReversePayment(mov.id)}>
                                                                    <RotateCcw className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {isAdmin && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-red-600 bg-red-50" onClick={() => deleteMovement(mov.id)}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Desktop View: Table */}
                                        <div className="hidden md:block">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="w-[120px]">Vencimento</TableHead>
                                                        <TableHead>Descrição</TableHead>
                                                        <TableHead>Conta</TableHead>
                                                        <TableHead className="text-right">Valor</TableHead>
                                                        <TableHead className="text-center w-[100px]">Status</TableHead>
                                                        <TableHead className="text-right w-[100px]">Ações</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {batch.movements.map(mov => (
                                                        <TableRow key={mov.id} className="group hover:bg-white">
                                                            <TableCell className="text-xs font-medium text-zinc-600">
                                                                {mov.due_date ? new Date(mov.due_date).toLocaleDateString() : '-'}
                                                            </TableCell>
                                                            <TableCell className="text-sm font-medium text-zinc-700">{mov.description}</TableCell>
                                                            <TableCell className="text-xs text-zinc-500">{mov.detail_buyer}</TableCell>
                                                            <TableCell className="text-right font-bold text-sm">
                                                                R$ {mov.amount.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant={mov.status === 'paid' ? 'default' : 'outline'} className={mov.status === 'paid' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' : 'text-yellow-600 border-yellow-200 bg-yellow-50 hover:bg-yellow-50'}>
                                                                    {mov.status === 'paid' ? 'Pago' : 'Pendente'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {mov.status === 'pending' && (
                                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => markAsPaid(mov.id)} title="Baixar">
                                                                            <CheckCircle className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    {mov.status === 'paid' && (isAdmin || isFinancial) && (
                                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-orange-500 hover:text-orange-700 hover:bg-orange-50" onClick={() => handleReversePayment(mov.id)} title="Estornar">
                                                                            <RotateCcw className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    {isAdmin && (
                                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => deleteMovement(mov.id)} title="Excluir">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
