import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ArrowDownCircle, RotateCcw, Trash2, ChevronDown, Layers, TrendingUp, TrendingDown, Building2, MessageCircle, ChevronsUpDown, Check } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FinancialMovement, BatchGroup } from "@/types";
import { PaymentConfirmationDialog } from "@/components/financial/PaymentConfirmationDialog";
import { WhatsAppChargeDialog, ChargeItem } from "@/components/financial/WhatsAppChargeDialog";

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
    const [selectedMovements, setSelectedMovements] = useState<Record<string, boolean>>({});
    // Helper to check if a batch is fully selected, partially selected, or none.
    // derived state can be calculated in render.

    // Payment Dialog State
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [paymentDialogData, setPaymentDialogData] = useState<{
        mode: 'single' | 'batch',
        id?: string, // for single
        amount?: number,
        type: 'income' | 'expense',
        count?: number
    }>({ mode: 'single', type: 'expense' });

    // WhatsApp Dialog State
    const [isWhatsAppDialogOpen, setIsWhatsAppDialogOpen] = useState(false);
    const [whatsAppDialogData, setWhatsAppDialogData] = useState<{
        clientName: string;
        phone: string;
        items: ChargeItem[];
        pixKey?: string;
    }>({
        clientName: '',
        phone: '',
        items: [],
        pixKey: ''
    });

    // Combobox State
    const [openBuyer, setOpenBuyer] = useState(false);

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

        // Fetch Bank Accounts for display
        const bankAccountIds = movs?.map(m => m.bank_account_id).filter(Boolean) || [];
        let banksMap: Record<string, string> = {};
        if (bankAccountIds.length > 0) {
            const { data: banks } = await supabase.from('bank_accounts').select('id, name').in('id', bankAccountIds);
            banks?.forEach(b => banksMap[b.id] = b.name);
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
                return {
                    ...m,
                    detail_buyer: buyerName,
                    detail_supplier: supplierName,
                    detail_order_nickname: orderNickname,
                    detail_order_id: orderId,
                    detail_bank_name: m.bank_account_id ? banksMap[m.bank_account_id] : undefined
                };
            });

            // Fetch Sales Details for Income items that are likely Sales
            const saleIds = enrichedMovements
                .map(m => m.related_sale_id)
                .filter(Boolean) as string[];

            if (saleIds.length > 0) {
                const { data: sales, error: salesError } = await supabase
                    .from('sales')
                    .select('id, client_id, clients(name, phone), sale_items(quantity, products(name))')
                    .in('id', saleIds);

                if (sales) {
                    enrichedMovements = enrichedMovements.map(m => {
                        if (m.related_sale_id) {
                            const sale = sales.find(s => s.id === m.related_sale_id);
                            if (sale) {
                                // It's a sale
                                const clientName = (sale.clients as any)?.name || 'Consumidor Final';
                                const itemsSummary = (sale.sale_items as any[])?.map(i => {
                                    const prodName = i.products?.name || 'Item';
                                    return `${i.quantity}x ${prodName}`;
                                }).join(', ');

                                const desc = `${clientName} - ${itemsSummary || 'Sem itens'}`;

                                return {
                                    ...m,
                                    description: desc.length > 60 ? desc.substring(0, 60) + '...' : desc,
                                    detail_buyer: clientName === 'Consumidor Final' ? 'Balcão' : clientName,
                                    detail_phone: (sale.clients as any)?.phone, // Extract phone


                                    detail_supplier: 'Loja', // Income source
                                    detail_bank_name: m.bank_account_id ? banksMap[m.bank_account_id] : undefined
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
                        order_nickname: `Vendas - ${dateKey}`,
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

    function openPaymentDialog(movement: FinancialMovement) {
        setPaymentDialogData({
            mode: 'single',
            id: movement.id,
            amount: movement.amount,
            type: movement.type as any,
            count: 1
        });
        setIsPaymentDialogOpen(true);
    }

    function openWhatsAppDialog(movement: FinancialMovement) {
        const clientPhone = (movement as any).clients?.phone || (movement as any).detail_phone;
        const clientName = movement.detail_buyer || 'Cliente';

        if (!clientPhone) {
            toast({ variant: 'destructive', title: "Sem telefone", description: "Telefone não encontrado." });
            return;
        }

        const item: ChargeItem = {
            id: movement.id,
            description: movement.description,
            amount: Math.abs(movement.amount),
            date: movement.created_at,
            originalDescription: movement.description
        };

        setWhatsAppDialogData({
            clientName: clientName,
            phone: clientPhone,
            items: [item]
        });
        setIsWhatsAppDialogOpen(true);
    }

    async function handlePaymentConfirm(bankAccountId: string, date: string) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            if (paymentDialogData.mode === 'single' && paymentDialogData.id) {
                const { error } = await supabase.rpc('pay_financial_movement_secure', {
                    p_movement_id: paymentDialogData.id,
                    p_payment_date: date,
                    p_bank_account_id: bankAccountId,
                    p_user_id: user.id
                });

                if (error) throw error;
                toast({ title: "Pagamento registrado!" });

            } else if (paymentDialogData.mode === 'batch') {
                const selectedIds = Object.keys(selectedMovements).filter(id => selectedMovements[id]);
                const idsToPay: string[] = [];

                // Use flattened look up or just logic
                const allMovements = batches.flatMap(b => b.movements);

                selectedIds.forEach(id => {
                    const m = allMovements.find(mov => mov.id === id);
                    if (m) {
                        const matchesTab = activeTab === 'payable' ? m.type === 'expense' : m.type === 'income';
                        if (m.status === 'pending' && matchesTab) {
                            idsToPay.push(m.id);
                        }
                    }
                });

                if (idsToPay.length > 0) {
                    const { error } = await supabase.rpc('pay_batch_financial_movements', {
                        p_movement_ids: idsToPay,
                        p_payment_date: date,
                        p_bank_account_id: bankAccountId,
                        p_user_id: user.id
                    });

                    if (error) throw error;
                    if (error) throw error;
                    toast({ title: "Pagamento em lote realizado!" });
                    setSelectedMovements({});
                }
            }
            fetchMovements();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Erro', description: e.message });
        } finally {
            setLoading(false);
            setIsPaymentDialogOpen(false);
        }
    }

    async function deleteMovement(id: string) {
        if (!confirm("Excluir este lançamento permanentemente?")) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.rpc('delete_financial_movement_secure', {
                p_movement_id: id,
                p_user_id: user?.id
            });

            if (error) throw error;
            toast({ title: "Removido com auditoria" });
            fetchMovements();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message });
        }
    }

    async function handleReversePayment(id: string) {
        if (!confirm("Estornar baixa deste lançamento? O saldo bancário será revertido.")) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.rpc('reverse_financial_movement_secure', {
                p_movement_id: id,
                p_user_id: user?.id
            });

            if (error) throw error;
            toast({ title: "Pagamento estornado com sucesso!" });
            fetchMovements();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        }
    }

    // --- Bulk Actions ---
    async function processBatchAction(action: 'pay' | 'reverse') {
        // Reverse Batch functionality implies calling reverse secure for many items.
        // We only implemented pay_batch, so for reverse batch we iterate client side safely or block it.
        // Given complexity, let's keep only 'pay' supported for batch via RPC for now, or just allow pay.
        // If user wants Batch Reverse, we should strictly speaking implement it.
        // But for this "Security Analysis" task, ensuring 'Pay' is atomic is most critical.
        // Let's implement batch reverse via client loop to secure RPC to be consistent.

        // But for this "Security Analysis" task, ensuring 'Pay' is atomic is most critical.
        // Let's implement batch reverse via client loop to secure RPC to be consistent.

        const selectedIds = Object.keys(selectedMovements).filter(id => selectedMovements[id]);
        if (selectedIds.length === 0) return;

        const isPay = action === 'pay';

        if (isPay) {
            // Calculate totals from selected movements
            let count = 0;
            let total = 0;

            // We need to look up movement details. Best way is to flatten batches or find in movements list.
            const allMovements = batches.flatMap(b => b.movements);

            selectedIds.forEach(id => {
                const m = allMovements.find(mov => mov.id === id);
                if (m) {
                    const matchesTab = activeTab === 'payable' ? m.type === 'expense' : m.type === 'income';
                    if (m.status === 'pending' && matchesTab) {
                        count++;
                        total += m.amount;
                    }
                }
            });

            if (count === 0) {
                toast({ title: "Nenhum item pendente nos lotes selecionados." });
                return;
            }

            setPaymentDialogData({
                mode: 'batch',
                type: activeTab === 'payable' ? 'expense' : 'income',
                count: count,
                amount: total
            });
            setIsPaymentDialogOpen(true);
            return;
        }

        // Reverse Batch
        if (!confirm(`Confirma o ESTORNO de ${selectedIds.length} itens selecionados?`)) return;

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const idsToReverse: string[] = [];
            // We need to look up movement details.
            const allMovements = batches.flatMap(b => b.movements);

            selectedIds.forEach(id => {
                const m = allMovements.find(mov => mov.id === id);
                if (m) {
                    const matchesTab = activeTab === 'payable' ? m.type === 'expense' : m.type === 'income';
                    if (m.status === 'paid' && matchesTab) {
                        idsToReverse.push(m.id);
                    }
                }
            });

            if (idsToReverse.length === 0) {
                toast({ title: "Nenhum item pago elegível." });
                return;
            }

            // Loop calls
            for (const id of idsToReverse) {
                const { error } = await supabase.rpc('reverse_financial_movement_secure', {
                    p_movement_id: id,
                    p_user_id: user?.id
                });
                if (error) console.error("Falha ao estornar id " + id, error);
            }

            toast({ title: "Estorno em lote concluído!" });
            setSelectedMovements({});
            fetchMovements();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro na ação em lote", description: e.message });
        } finally {
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
            // Expenses might be stored as negative numbers. We want visual totals to be positive sum of magnitude.
            const pending = filteredMovements.filter(m => m.status === 'pending').reduce((a, b) => a + Math.abs(b.amount), 0);
            const paid = filteredMovements.filter(m => m.status === 'paid').reduce((a, b) => a + Math.abs(b.amount), 0);

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

    useEffect(() => {
        // Reset selection when filters change to prevent accidental bulk actions
        setSelectedMovements({});
    }, [activeTab, filterBuyer, filterSupplier, filterStatus, startDate, endDate]);

    // Totals for Cards
    const totalPending = filteredBatches.reduce((acc, b) => acc + b.visual_total_pending, 0);
    const totalPaid = filteredBatches.reduce((acc, b) => acc + b.visual_total_paid, 0);

    // Selection Totals
    // Re-calculate based on selected movements
    const selectedMovementsList = filteredBatches.flatMap(b => b.movements).filter(m => selectedMovements[m.id]);
    const selectionTotalPending = selectedMovementsList.reduce((acc, m) => m.status === 'pending' ? acc + Math.abs(m.amount) : acc, 0);
    const selectionTotalPaid = selectedMovementsList.reduce((acc, m) => m.status === 'paid' ? acc + Math.abs(m.amount) : acc, 0);

    const toggleMovementSelection = (id: string, checked: boolean) => {
        setSelectedMovements(prev => ({ ...prev, [id]: checked }));
    }

    const toggleBatchSelection = (batch: BatchGroup, checked: boolean) => {
        const newSelection = { ...selectedMovements };
        batch.movements.forEach(m => {
            newSelection[m.id] = checked;
        });
        setSelectedMovements(newSelection);
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
                    {/* <div className="flex items-center gap-2 text-sm text-zinc-500"><Filter className="h-4 w-4" /> Filtros:</div> */}

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-400">Comprador</label>
                        <Popover open={openBuyer} onOpenChange={setOpenBuyer}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openBuyer}
                                    className="w-[200px] justify-between h-9 text-sm font-normal"
                                >
                                    {filterBuyer === "all"
                                        ? "Todos"
                                        : availableBuyers.find((b) => b === filterBuyer) || filterBuyer}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar..." />
                                    <CommandList>
                                        <CommandEmpty>Não encontrado.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="all"
                                                keywords={['todos', 'all']}
                                                className="cursor-pointer data-[disabled]:pointer-events-auto data-[disabled]:opacity-100"
                                                onSelect={() => {
                                                    setFilterBuyer("all");
                                                    setOpenBuyer(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        filterBuyer === "all" ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                Todos
                                            </CommandItem>
                                            {availableBuyers.map((buyer, idx) => (
                                                <CommandItem
                                                    key={`${buyer}-${idx}`}
                                                    value={buyer}
                                                    keywords={[buyer]}
                                                    className="cursor-pointer data-[disabled]:pointer-events-auto data-[disabled]:opacity-100"
                                                    onSelect={() => {
                                                        setFilterBuyer(filterBuyer === buyer ? "all" : buyer);
                                                        setOpenBuyer(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            filterBuyer === buyer ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {buyer}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Only show Supplier filter for Payable? Or rename? */}
                    {activeTab === 'payable' && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-400">Fornecedor</label>
                            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                                <SelectContent><SelectItem value="all">Todos</SelectItem>{availableSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-400">Status</label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos Status</SelectItem>
                                <SelectItem value="pending">Pendentes</SelectItem>
                                <SelectItem value="paid">Baixados / Realizados</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1 border-l pl-4 ml-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-400">Período</label>
                        <div className="flex items-center gap-2">
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-min h-9" />
                            <span className="text-zinc-300">-</span>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-min h-9" />
                        </div>
                    </div>

                    {/* Quick Stats for Selection */}
                </div>

                {/* Fixed Bottom Bar for Bulk Actions (Mobile Friendly) */}
                {selectedMovementsList.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 flex items-center justify-between lg:static lg:p-0 lg:border-0 lg:shadow-none lg:bg-transparent lg:z-auto lg:ml-auto lg:flex-none">
                        <div className="flex flex-col lg:items-end">
                            <span className="text-sm font-bold text-zinc-900 lg:hidden">
                                {selectedMovementsList.length} selecionado(s)
                            </span>
                            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm font-medium border border-blue-100 shadow-sm hidden lg:block">
                                Total: {selectionTotalPending > 0.01 ? `Pendente R$ ${selectionTotalPending.toFixed(2)}` : `Pago R$ ${selectionTotalPaid.toFixed(2)}`}
                            </div>
                            <span className="text-xs text-zinc-500 lg:hidden">
                                Total: {selectionTotalPending > 0.01 ? `R$ ${selectionTotalPending.toFixed(2)}` : `R$ ${selectionTotalPaid.toFixed(2)}`}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            {selectionTotalPending > 0.01 && (
                                <Button size="sm" onClick={() => processBatchAction('pay')} className={activeTab === 'payable' ? "bg-red-600 hover:bg-red-700 h-9" : "bg-green-600 hover:bg-green-700 h-9"}>
                                    <CheckCircle className="mr-2 h-3 w-3" /> {activeTab === 'payable' ? 'Baixar' : 'Receber'}
                                </Button>
                            )}

                            {selectionTotalPending <= 0.01 && selectionTotalPaid > 0 && (
                                <Button size="sm" variant="outline" onClick={() => processBatchAction('reverse')} className="text-orange-600 border-orange-200 hover:bg-orange-50 h-9">
                                    <RotateCcw className="mr-2 h-3 w-3" /> Estornar
                                </Button>
                            )}
                        </div>
                    </div>
                )}

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
                            <Card key={batch.order_id} className={`overflow-hidden transition-all duration-200 ${batch.movements.some(m => selectedMovements[m.id]) ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'}`}>
                                <div className="flex items-center p-4 bg-white border-b gap-4">
                                    <Checkbox
                                        checked={batch.movements.every(m => selectedMovements[m.id])}
                                        onCheckedChange={(c) => toggleBatchSelection(batch, c as boolean)}
                                        className={batch.movements.some(m => selectedMovements[m.id]) && !batch.movements.every(m => selectedMovements[m.id]) ? "opacity-50" : ""}
                                    />
                                    <div className="flex-1 cursor-pointer" onClick={() => toggleExpand(batch.order_id)}>
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                            <div className="flex flex-row flex-wrap items-center gap-2">
                                                <Layers className="h-4 w-4 text-zinc-400 shrink-0" />
                                                <div className="flex flex-col">
                                                    <h3 className="font-semibold text-zinc-800 text-sm md:text-base break-words max-w-[150px] md:max-w-none">{batch.order_nickname}</h3>
                                                    <span className="text-xs text-zinc-500">
                                                        {batch.movements.length} item(s) • {batch.movements[0]?.due_date ? new Date(batch.movements[0].due_date).toLocaleDateString() : '-'}
                                                    </span>
                                                </div>
                                                {batch.supplier_name !== '-' && <Badge variant="outline" className="text-[10px] h-5 px-1">{batch.supplier_name}</Badge>}
                                                {batch.buyer_name !== '-' && <Badge variant="secondary" className="text-[10px] h-5 px-1">{batch.buyer_name}</Badge>}
                                            </div>

                                            <div className="flex items-center justify-between md:justify-end md:gap-8 w-full md:w-auto pl-6 md:pl-0">
                                                <div className="flex gap-4 md:gap-8">
                                                    <div className="text-right min-w-[70px] md:min-w-[100px]">
                                                        <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-400">Pendente</div>
                                                        <div className={`text-sm md:text-lg font-bold ${batch.visual_total_pending > 0 ? (activeTab === 'payable' ? 'text-red-600' : 'text-blue-600') : 'text-zinc-300'}`}>
                                                            R$ {batch.visual_total_pending.toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div className="text-right min-w-[70px] md:min-w-[100px]">
                                                        <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-400">Realizado</div>
                                                        <div className="text-sm md:text-lg font-bold text-green-600">
                                                            R$ {batch.visual_total_paid.toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`transition-transform duration-200 ${expandedBatches[batch.order_id] ? 'rotate-180' : ''} ml-2`}>
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
                                                        <div className="font-bold text-zinc-900">R$ {Math.abs(mov.amount).toFixed(2)}</div>
                                                    </div>

                                                    <div className="flex justify-between items-center border-t pt-2 mt-1">
                                                        <Badge variant={mov.status === 'paid' ? 'default' : 'outline'} className={mov.status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'text-yellow-700 bg-yellow-50 mobile-badge'}>
                                                            {mov.status === 'paid' ? 'Pago' : 'Pendente'}
                                                        </Badge>
                                                        {mov.detail_bank_name && (
                                                            <div className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded">
                                                                <Building2 className="h-3 w-3" /> {mov.detail_bank_name}
                                                            </div>
                                                        )}

                                                        <div className="flex gap-2">
                                                            {mov.status === 'pending' && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-green-600 bg-green-50" onClick={() => openPaymentDialog(mov)}>
                                                                    <CheckCircle className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {/* WhatsApp Button for Pending Income */}
                                                            {mov.status === 'pending' && mov.type === 'income' && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-green-600 bg-green-50" onClick={() => openWhatsAppDialog(mov)}>
                                                                    <MessageCircle className="h-4 w-4" />
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
                                                        <TableHead className="w-[30px]"></TableHead>
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
                                                            <TableCell>
                                                                <Checkbox
                                                                    checked={!!selectedMovements[mov.id]}
                                                                    onCheckedChange={(c) => toggleMovementSelection(mov.id, c as boolean)}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-xs font-medium text-zinc-600">
                                                                {mov.due_date ? new Date(mov.due_date).toLocaleDateString() : '-'}
                                                            </TableCell>
                                                            <TableCell className="text-sm font-medium text-zinc-700">{mov.description}</TableCell>
                                                            <TableCell className="text-xs text-zinc-500">{mov.detail_buyer}</TableCell>
                                                            <TableCell className="text-right font-bold text-sm">
                                                                R$ {Math.abs(mov.amount).toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant={mov.status === 'paid' ? 'default' : 'outline'} className={mov.status === 'paid' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' : 'text-yellow-600 border-yellow-200 bg-yellow-50 hover:bg-yellow-50'}>
                                                                    {mov.status === 'paid' ? 'Pago' : 'Pendente'}
                                                                </Badge>
                                                                {mov.detail_bank_name && (
                                                                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
                                                                        <Building2 className="h-3 w-3" /> {mov.detail_bank_name}
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {mov.status === 'pending' && (
                                                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openPaymentDialog(mov)} title="Baixar">
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


            <PaymentConfirmationDialog
                isOpen={isPaymentDialogOpen}
                onClose={() => setIsPaymentDialogOpen(false)}
                onConfirm={handlePaymentConfirm}
                amount={Math.abs(paymentDialogData.amount || 0)}
                type={paymentDialogData.mode === 'batch' ? (activeTab === 'payable' ? 'expense' : 'income') : (paymentDialogData.type as any)}
                count={paymentDialogData.count}
            />

            <WhatsAppChargeDialog
                isOpen={isWhatsAppDialogOpen}
                onClose={() => setIsWhatsAppDialogOpen(false)}
                data={{
                    clientName: whatsAppDialogData.clientName,
                    phone: whatsAppDialogData.phone,
                    items: whatsAppDialogData.items,
                    pixKey: whatsAppDialogData.pixKey
                }}
            />
        </div>
    );
}
