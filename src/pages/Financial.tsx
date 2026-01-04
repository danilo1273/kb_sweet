import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ArrowDownCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FinancialMovement {
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    status: 'pending' | 'paid';
    due_date: string;
    payment_date: string | null;
    created_at: string;
}

export default function Financial() {
    const [movements, setMovements] = useState<FinancialMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        fetchMovements();
    }, []);

    async function fetchMovements() {
        setLoading(true);
        const { data, error } = await supabase
            .from('financial_movements')
            .select('*')
            .order('due_date', { ascending: true }); // Vencimento próximo primeiro

        if (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao carregar', description: error.message });
        } else {
            setMovements(data || []);
        }
        setLoading(false);
    }

    async function markAsPaid(id: string) {
        if (!confirm("Confirmar pagamento/recebimento?")) return;

        const { error } = await supabase
            .from('financial_movements')
            .update({
                status: 'paid',
                payment_date: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        } else {
            toast({ title: "Registro atualizado!" });
            fetchMovements();
        }
    }

    // Totais
    const totalPendingExpense = movements
        .filter(m => m.type === 'expense' && m.status === 'pending')
        .reduce((acc, curr) => acc + curr.amount, 0);

    const totalPaidExpense = movements
        .filter(m => m.type === 'expense' && m.status === 'paid')
        .reduce((acc, curr) => acc + curr.amount, 0);

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Financeiro</h2>
                    <p className="text-zinc-500">Contas a pagar e receber.</p>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">A Pagar (Pendente)</CardTitle>
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">R$ {totalPendingExpense.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pago (Total)</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">R$ {totalPaidExpense.toFixed(2)}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabela */}
            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                        ) : movements.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum lançamento.</TableCell></TableRow>
                        ) : (
                            movements.map(mov => (
                                <TableRow key={mov.id}>
                                    <TableCell>{mov.due_date ? new Date(mov.due_date).toLocaleDateString() : '-'}</TableCell>
                                    <TableCell className="font-medium">{mov.description}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={mov.type === 'expense' ? 'text-red-600 border-red-200' : 'text-green-600 border-green-200'}>
                                            {mov.type === 'expense' ? 'Despesa' : 'Receita'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-bold">R$ {mov.amount.toFixed(2)}</TableCell>
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
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
