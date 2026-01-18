
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanking, BankAccountWithBalance } from '@/hooks/useBanking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Building2, ChevronLeft, Calendar as CalendarIcon, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
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
                        // Refresh logic handled inside component usually or trigger refetch
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

    // Manual Entry State
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("Tarifa Bancária");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const load = async () => {
        const start = new Date(year, month, 1).toISOString();
        const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
        const data = await fetchStatement(account.id, start, end);

        // Calculate Running Balance? 
        // Note: Ideally we need the balance at start of month.
        // For simplified MVP, we might just show transactions. 
        // Or we calculate backwards from current balance? 
        // Or we assume `account.calculated_balance` is TODAY.
        // It's tricky to show historical running balance without a snapshot system.
        // Let's just list transactions for now.
        setMovements(data || []);
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

    const periodLabel = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const groupedMovements = (() => {
        const grouped: any[] = [];
        const orderGroups: Record<string, any> = {};

        movements.forEach((m: any) => {
            if (m.order_id) {
                if (!orderGroups[m.order_id]) {
                    const group = {
                        ...m,
                        isGroup: true,
                        items: [m],
                        totalAmount: Number(m.amount)
                    };
                    orderGroups[m.order_id] = group;
                    grouped.push(group);
                } else {
                    orderGroups[m.order_id].items.push(m);
                    orderGroups[m.order_id].totalAmount += Number(m.amount);
                }
            } else {
                grouped.push(m);
            }
        });
        return grouped;
    })();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={onBack}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold">{account.name}</h2>
                    <p className="text-zinc-500">Saldo Atual: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.calculated_balance)}</p>
                </div>
            </div>

            <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                        if (month === 0) { setMonth(11); setYear(y => y - 1); } else { setMonth(m => m - 1); }
                    }}>Previous</Button>
                    <div className="flex items-center gap-2 font-medium w-40 justify-center capitalize">
                        <CalendarIcon className="h-4 w-4" /> {periodLabel}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                        if (month === 11) { setMonth(0); setYear(y => y + 1); } else { setMonth(m => m + 1); }
                    }}>Next</Button>
                </div>

                <Button onClick={() => setIsAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Novo Lançamento
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                            <table className="w-full caption-bottom text-sm text-left">
                                <thead className="[&_tr]:border-b">
                                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[100px]">Data</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Descrição</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Valor</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[50px]">Tipo</th>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                    {groupedMovements.length === 0 ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-zinc-500">Nenhum lançamento neste período.</td></tr>
                                    ) : (
                                        groupedMovements.map((m: any) => {
                                            const isGroup = m.isGroup;
                                            const dateStr = new Date(m.payment_date || m.created_at).toLocaleDateString('pt-BR');
                                            const amountVal = isGroup ? m.totalAmount : Number(m.amount);
                                            const key = isGroup ? 'group-' + m.order_id : m.id;

                                            return isGroup ? (
                                                <tr key={key} className="border-b transition-colors hover:bg-muted/50 bg-slate-50/50">
                                                    <td className="p-4 align-middle font-medium">{dateStr}</td>
                                                    <td className="p-4 align-middle">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-700">Lote: {m.order_nickname || 'Sem Nome'}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-xs text-blue-600 hover:text-blue-800"
                                                                onClick={() => navigate(`/purchases?openOrder=${m.order_id}`)}
                                                            >
                                                                (Abrir Visualização)
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-slate-500 pl-1">
                                                            {m.items.length} itens agrupados
                                                        </div>
                                                    </td>
                                                    <td className="p-4 align-middle text-right font-bold text-red-600">
                                                        - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amountVal)}
                                                    </td>
                                                    <td className="p-4 align-middle">
                                                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={key} className="border-b transition-colors hover:bg-muted/50">
                                                    <td className="p-4 align-middle">{dateStr}</td>
                                                    <td className="p-4 align-middle">{m.description}</td>
                                                    <td className={`p-4 align-middle text-right font-medium ${m.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {m.type === 'expense' ? '- ' : '+ '}
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(m.amount))}
                                                    </td>
                                                    <td className="p-4 align-middle">
                                                        {m.type === 'income' ? <ArrowUpCircle className="h-4 w-4 text-green-500" /> : <ArrowDownCircle className="h-4 w-4 text-red-500" />}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-0 divide-y">
                            {groupedMovements.length === 0 ? (
                                <div className="p-8 text-center text-zinc-500 text-sm">Nenhum lançamento neste período.</div>
                            ) : (
                                groupedMovements.map((m: any) => {
                                    const isGroup = m.isGroup;
                                    const key = isGroup ? 'group-m-' + m.order_id : m.id;
                                    const amountVal = isGroup ? m.totalAmount : Number(m.amount);

                                    return (
                                        <div key={key} className={`p-4 flex justify-between items-center ${isGroup ? 'bg-slate-50' : 'bg-white'}`}>
                                            <div className="flex flex-col gap-1">
                                                <div className="font-medium text-zinc-900 line-clamp-1">
                                                    {isGroup ? `Lote: ${m.order_nickname || 'Sem Nome'}` : m.description}
                                                </div>
                                                <div className="text-xs text-zinc-500 flex flex-col gap-0.5">
                                                    <span className="capitalize">{new Date(m.payment_date || m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                                                    {isGroup && (
                                                        <div className="flex items-center gap-1">
                                                            <span>{m.items.length} itens</span>
                                                            <span className="text-blue-600 font-bold" onClick={() => navigate(`/purchases?openOrder=${m.order_id}`)}>(Ver)</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className={`font-bold flex items-center gap-1 ${m.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {(m.type === 'expense' || isGroup) ? '- ' : '+ '}
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amountVal)}
                                                </div>
                                                {m.type === 'income' && !isGroup ? <ArrowUpCircle className="h-3 w-3 text-green-500" /> : <ArrowDownCircle className="h-3 w-3 text-red-500" />}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novo Lançamento Manual</DialogTitle>
                    </DialogHeader>
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
        </div>
    );
}
