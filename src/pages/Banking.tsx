
import { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useBanking, BankAccountWithBalance } from '@/hooks/useBanking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Building2, ChevronLeft, Calendar as CalendarIcon, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FinancialMovement } from '@/types';

export default function Banking() {
    const { accounts, fetchAccounts, createAccount, addTransaction, fetchStatement, loading } = useBanking();
    const [selectedAccount, setSelectedAccount] = useState<BankAccountWithBalance | null>(null);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    return (
        <div className="p-6 space-y-6">
            {!selectedAccount ? (
                <BankSelection accounts={accounts} onSelect={setSelectedAccount} onCreate={createAccount} />
            ) : (
                <BankStatement
                    account={selectedAccount}
                    onBack={() => { setSelectedAccount(null); fetchAccounts(); }}
                    fetchStatement={fetchStatement}
                    onAddTransaction={async (type, val, desc, cat, date) => {
                        await addTransaction(selectedAccount.id, type, val, desc, cat, date);
                    }}
                    loading={loading}
                />
            )}
        </div>
    );
}

function BankSelection({ accounts, onSelect, onCreate }: { accounts: BankAccountWithBalance[], onSelect: (a: BankAccountWithBalance) => void, onCreate: any }) {
    const [isOpen, setIsOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newInitial, setNewInitial] = useState("0");

    const handleCreate = async () => {
        await onCreate(newName, Number(newInitial));
        setIsOpen(false);
        setNewName("");
        setNewInitial("0");
    };

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Contas Bancárias</h2>
                    <p className="text-zinc-500">Gerencie seus saldos e extratos.</p>
                </div>
                <Button onClick={() => setIsOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Nova Conta
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map(acc => (
                    <Card key={acc.id} className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-indigo-500" onClick={() => onSelect(acc)}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {acc.name}
                            </CardTitle>
                            <Building2 className="h-4 w-4 text-zinc-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.calculated_balance)}
                            </div>
                            <p className="text-xs text-zinc-500">Saldo Atual</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nova Conta Bancária</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Nome do Banco/Conta</Label>
                            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Nubank, Caixa..." />
                        </div>
                        <div className="grid gap-2">
                            <Label>Saldo Inicial (R$)</Label>
                            <Input type="number" value={newInitial} onChange={e => setNewInitial(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreate}>Criar Conta</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function BankStatement({ account, onBack, fetchStatement, onAddTransaction, loading }: {
    account: BankAccountWithBalance,
    onBack: () => void,
    fetchStatement: any,
    onAddTransaction: (type: 'income' | 'expense', val: number, desc: string, cat: string, date: string) => Promise<void>,
    loading?: boolean
}) {
    const navigate = useNavigate();
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [movements, setMovements] = useState<FinancialMovement[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Batch Visualization State
    const [selectedBatch, setSelectedBatch] = useState<any>(null);
    const [isBatchOpen, setIsBatchOpen] = useState(false);

    // Expanded Days State (for mobile grouping)
    const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

    // Manual Entry State
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("Tarifa Bancária");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const load = async () => {
        try {
            const start = new Date(year, month, 1).toISOString();
            const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
            const data = await fetchStatement(account.id, start, end);

            // Enrich with Sales Data (Client Name + Products)
            const saleIds = data?.map((m: any) => m.related_sale_id).filter(Boolean) || [];

            let enrichedData = data || [];

            if (saleIds.length > 0) {
                const { data: sales } = await supabase
                    .from('sales')
                    .select('id, client_id, clients(name), sale_items(quantity, products(name))')
                    .in('id', saleIds);

                if (sales) {
                    enrichedData = enrichedData.map((m: any) => {
                        if (m.related_sale_id) {
                            const sale = sales.find((s: any) => s.id === m.related_sale_id);
                            if (sale) {
                                const clientName = (sale.clients as any)?.name || 'Consumidor Final';
                                const itemsSummary = (sale.sale_items as any[])?.map((i: any) => {
                                    const prodName = i.products?.name || 'Item';
                                    return `${i.quantity}x ${prodName}`;
                                }).join(', ');

                                const desc = `${clientName} - ${itemsSummary || 'Sem itens'}`;
                                return {
                                    ...m,
                                    description: desc.length > 60 ? desc.substring(0, 60) + '...' : desc
                                };
                            }
                        }
                        return m;
                    });
                }
            }

            setMovements(enrichedData);

            // Auto expand today
            const todayKey = new Date().toISOString().split('T')[0];
            setExpandedDays(prev => ({ ...prev, [todayKey]: true }));

        } catch (err) {
            console.error("Error loading statement:", err);
            // Optionally toast error
        }
    };

    useEffect(() => { load(); }, [month, year, account.id]);

    const handleSave = async () => {
        if (!amount || !description) return;
        await onAddTransaction(type, Number(amount), description, category, date);
        setIsAddOpen(false);
        load();
        // Reset form
        setDescription(""); setAmount(""); setCategory("Tarifa Bancária");
    };

    // Safety helper for dates
    const safeDate = (dateStr: string | null | undefined): Date => {
        try {
            if (!dateStr) return new Date();
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return new Date();
            return d;
        } catch {
            return new Date();
        }
    };

    const periodLabel = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // --- GROUPING LOGIC ---
    // 1. Group by Batch first (same as before)
    // 2. Then Group the results by Date

    const { dailyGroups, sortedDailyKeys } = (() => {
        try {
            const batchGrouped: any[] = [];
            const purchaseOrderGroups: Record<string, any> = {};
            const salesDateGroups: Record<string, any> = {};

            // Sort by date desc first
            const sortedRaw = [...movements].sort((a, b) => {
                const dA = safeDate(a.payment_date || a.created_at).getTime();
                const dB = safeDate(b.payment_date || b.created_at).getTime();
                return dB - dA;
            });

            sortedRaw.forEach((m: any) => {
                // Safety check for m
                if (!m) return;

                // Group Purchases
                if (m.order_id) {
                    if (!purchaseOrderGroups[m.order_id]) {
                        const group = {
                            ...m,
                            isGroup: true,
                            groupType: 'purchase',
                            items: [m],
                            totalAmount: Number(m.amount) || 0,
                            description: `Lote: ${m.order_nickname || 'Compra #' + (m.order_id?.toString().slice(0, 4) || '???')}`
                        };
                        purchaseOrderGroups[m.order_id] = group;
                        batchGrouped.push(group);
                    } else {
                        purchaseOrderGroups[m.order_id].items.push(m);
                        purchaseOrderGroups[m.order_id].totalAmount += (Number(m.amount) || 0);
                    }
                    return;
                }

                // Group Sales PDV
                if (m.related_sale_id && m.description?.startsWith('Venda PDV')) {
                    const d = safeDate(m.payment_date || m.created_at);
                    const dateKey = d.toISOString().split('T')[0];

                    if (!salesDateGroups[dateKey]) {
                        const group = {
                            ...m,
                            id: `sales-group-${dateKey}`,
                            isGroup: true,
                            groupType: 'sales',
                            items: [m],
                            totalAmount: Number(m.amount) || 0,
                            description: `Lote: Vendas PDV (${d.toLocaleDateString('pt-BR')})`,
                            payment_date: m.payment_date || m.created_at
                        };
                        salesDateGroups[dateKey] = group;
                        batchGrouped.push(group);
                    } else {
                        salesDateGroups[dateKey].items.push(m);
                        salesDateGroups[dateKey].totalAmount += (Number(m.amount) || 0);
                    }
                    return;
                }

                batchGrouped.push(m);
            });

            // Now Group by Day
            const dailyGroups: Record<string, any[]> = {};
            batchGrouped.forEach(item => {
                const dateVal = safeDate(item.payment_date || item.created_at);
                const dateKey = dateVal.toISOString().split('T')[0]; // YYYY-MM-DD
                if (!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
                dailyGroups[dateKey].push(item);
            });

            const sortedDailyKeys = Object.keys(dailyGroups).sort((a, b) => b.localeCompare(a)); // Newest date first

            return { dailyGroups, sortedDailyKeys };
        } catch (err) {
            console.error("Group Logic Crash:", err);
            return { dailyGroups: {}, sortedDailyKeys: [] };
        }
    })();

    const toggleDay = (dateKey: string) => {
        setExpandedDays(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
    };

    return (
        <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold line-clamp-1">{account.name}</h2>
                        <p className="text-zinc-500 text-sm">
                            Saldo: <span className="font-semibold text-zinc-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.calculated_balance)}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row gap-3 justify-between items-center bg-white p-3 md:p-4 rounded-lg border shadow-sm sticky top-0 md:relative z-10">
                <div className="flex w-full md:w-auto justify-between items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => {
                        if (month === 0) { setMonth(11); setYear(y => y - 1); } else { setMonth(m => m - 1); }
                    }}><ChevronLeft className="h-4 w-4" /></Button>

                    <div className="flex items-center gap-2 font-medium capitalize text-sm md:text-base">
                        <CalendarIcon className="h-4 w-4 text-zinc-400" /> {periodLabel}
                    </div>

                    <Button variant="outline" size="icon" onClick={() => {
                        if (month === 11) { setMonth(0); setYear(y => y + 1); } else { setMonth(m => m + 1); }
                    }}> <div className="rotate-180"><ChevronLeft className="h-4 w-4" /></div> </Button>
                </div>

                <Button className="w-full md:w-auto" onClick={() => setIsAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Novo Lançamento
                </Button>
            </div>

            {/* Content List */}
            <Card className="border-none shadow-none bg-transparent">
                <CardContent className="p-0 space-y-4">



                    {sortedDailyKeys.length === 0 ? (
                        <div className="p-10 text-center text-zinc-500 bg-white rounded-lg border border-dashed">
                            Nenhum lançamento neste período.
                        </div>
                    ) : (
                        (() => {
                            // Pre-calculate balances (Backwards from current)
                            // Note: This assumes we are viewing the latest period or that calculated_balance is the anchor.
                            // For accurate historical balances, we would need the balance at the end of the queried period.
                            let runningBalance = account.calculated_balance;

                            // If we are NOT in the current month/year, this runningBalance starts at 'Today', 
                            // so the displayed balances will be offset by any transactions between 'Now' and 'Selected Month'.
                            // However, for the daily cash flow check (usually current), this is effective.

                            return sortedDailyKeys.map(dateKey => {
                                const items = dailyGroups[dateKey];
                                const isExpanded = expandedDays[dateKey] ?? false;

                                // Day Totals
                                const dayTotal = items.reduce((acc: number, m: any) => {
                                    const val = m.isGroup ? m.totalAmount : Number(m.amount);
                                    return acc + val;
                                }, 0);

                                const closingBalance = runningBalance;
                                runningBalance -= dayTotal; // Decrement for the next (older) day

                                return (
                                    <div key={dateKey} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                        {/* Date Header */}
                                        <div
                                            className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-zinc-50/80 cursor-pointer hover:bg-zinc-100 transition-colors gap-2"
                                            onClick={() => toggleDay(dateKey)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronLeft className="h-4 w-4 text-zinc-400 rotate-180" />}
                                                <span className="font-semibold text-zinc-700 capitalize text-sm md:text-base">
                                                    {new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                                                </span>
                                                <span className="text-xs text-zinc-400 font-normal">({items.length} mov)</span>
                                            </div>

                                            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto pl-6 md:pl-0">
                                                <div className="flex flex-col md:items-end">
                                                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Movimentado</span>
                                                    <span className={`text-sm font-bold ${dayTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {dayTotal > 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dayTotal)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col md:items-end border-l pl-4">
                                                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Saldo do Dia</span>
                                                    <span className="text-sm font-bold text-zinc-800">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(closingBalance)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Items List */}
                                        {isExpanded && (
                                            <div className="divide-y divide-zinc-100">
                                                {items.map((m: any, idx: number) => {
                                                    const isGroup = m.isGroup;
                                                    const amountVal = isGroup ? m.totalAmount : Number(m.amount);
                                                    const description = isGroup ? (m.order_nickname || m.description) : m.description;

                                                    return (
                                                        <div key={idx} className="p-3 md:p-4 flex justify-between items-start hover:bg-zinc-50 transition-colors">
                                                            <div className="flex flex-col gap-1 overflow-hidden">
                                                                <div className="font-medium text-zinc-800 text-sm md:text-base line-clamp-1">
                                                                    {description === 'Sem Nome' ? `Lote #${m.order_id?.slice(0, 5)}` : description}
                                                                </div>
                                                                <div className="text-xs text-zinc-500">
                                                                    {isGroup && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">{m.items.length} itens</span>
                                                                            <span
                                                                                className="text-blue-600 font-semibold cursor-pointer hover:underline"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedBatch(m);
                                                                                    setIsBatchOpen(true);
                                                                                }}
                                                                            >
                                                                                Ver detalhes
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    {!isGroup && (
                                                                        <span className="capitalize">{m.category || 'Geral'}</span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-col items-end shrink-0 pl-2">
                                                                <span className={`font-bold text-sm md:text-base ${(m.type === 'expense' || (isGroup && m.groupType === 'purchase')) ? 'text-red-600' : 'text-green-600'
                                                                    }`}>
                                                                    {(m.type === 'expense' || (isGroup && m.groupType === 'purchase')) ? '- ' : '+ '}
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(amountVal))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        })()
                    )}
                </CardContent>
            </Card>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novo Lançamento Manual</DialogTitle>
                    </DialogHeader>
                    {/* ... Same Add Form ... */}
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Tipo</Label>
                                <Select value={type} onValueChange={(val: any) => setType(val)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="expense">Despesa (Saída)</SelectItem>
                                        <SelectItem value="income">Receita (Entrada)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Data</Label>
                                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Categoria</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Tarifa Bancária">Tarifa Bancária</SelectItem>
                                    <SelectItem value="Juros">Juros</SelectItem>
                                    <SelectItem value="Rendimento">Rendimento</SelectItem>
                                    <SelectItem value="IOF">IOF / Impostos</SelectItem>
                                    <SelectItem value="Ajuste">Ajuste de Saldo</SelectItem>
                                    <SelectItem value="Outros">Outros</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Descrição</Label>
                            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes do lançamento..." />
                        </div>

                        <div className="grid gap-2">
                            <Label>Valor (R$)</Label>
                            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSave}>Salvar Lançamento</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isBatchOpen} onOpenChange={setIsBatchOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle>Detalhes do Lote</DialogTitle>
                    </DialogHeader>
                    {selectedBatch && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded">
                                <span className="font-bold">{selectedBatch.description === 'Sem Nome' ? `Lote #${selectedBatch.order_id?.slice(0, 5)}` : selectedBatch.description}</span>
                                <span className="font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedBatch.totalAmount)}</span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50">
                                    <tr>
                                        <th className="p-2 text-left">Data</th>
                                        <th className="p-2 text-left">Descrição</th>
                                        <th className="p-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedBatch.items.map((item: any, idx: number) => (
                                        <tr key={idx} className="border-b">
                                            <td className="p-2">{new Date(item.payment_date || item.created_at).toLocaleDateString('pt-BR')}</td>
                                            <td className="p-2">{item.description}</td>
                                            <td className="p-2 text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.amount))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
