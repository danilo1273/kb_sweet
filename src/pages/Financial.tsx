
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Search, Loader2, Edit, Trash2, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Receivable {
    id: string;
    client_name: string;
    amount: number;
    due_date: string;
    status: 'pending' | 'paid' | 'overdue';
    invoice_number?: string;
}

export default function Financial() {
    const [receivables, setReceivables] = useState<Receivable[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState<Partial<Receivable>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        const { data, error } = await supabase.from('receivables').select('*').order('due_date');
        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar dados", description: error.message });
        } else {
            setReceivables(data || []);
        }
        setLoading(false);
    }

    const filteredItems = receivables.filter(i =>
        i.client_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    async function handleSave() {
        setIsSaving(true);
        try {
            if (!currentItem.client_name || !currentItem.amount) throw new Error("Campos obrigatórios faltando");

            const payload = {
                client_name: currentItem.client_name,
                amount: Number(currentItem.amount),
                due_date: currentItem.due_date,
                status: currentItem.status || 'pending',
                invoice_number: currentItem.invoice_number
            };

            if (currentItem.id) {
                const { error } = await supabase.from('receivables').update(payload).eq('id', currentItem.id);
                if (error) throw error;
                toast({ title: "Registro atualizado!" });
            } else {
                const { error } = await supabase.from('receivables').insert([payload]);
                if (error) throw error;
                toast({ title: "Registro criado!" });
            }

            setIsDialogOpen(false);
            fetchData();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir registro?")) return;
        const { error } = await supabase.from('receivables').delete().eq('id', id);
        if (error) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        } else {
            toast({ title: "Excluído com sucesso" });
            fetchData();
        }
    }

    async function markAsPaid(item: Receivable) {
        const { error } = await supabase.from('receivables').update({ status: 'paid' }).eq('id', item.id);
        if (error) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        } else {
            toast({ title: "Marcado como Pago!" });
            fetchData();
        }
    }

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Financeiro - Contas a Receber</h2>
                <Button onClick={() => { setCurrentItem({}); setIsDialogOpen(true); }} className="bg-zinc-900 text-white">
                    <Plus className="mr-2 h-4 w-4" /> Novo Recebível
                </Button>
            </div>

            <div className="flex items-center space-x-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 bg-white"
                    />
                </div>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredItems.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                        ) : (
                            filteredItems.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-mono">
                                        {item.due_date ? new Date(item.due_date).toLocaleDateString('pt-BR') : '-'}
                                    </TableCell>
                                    <TableCell className="font-medium">{item.client_name}</TableCell>
                                    <TableCell>R$ {item.amount.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Badge variant={item.status === 'paid' ? 'default' : item.status === 'overdue' ? 'destructive' : 'secondary'} className={item.status === 'paid' ? 'bg-green-600' : ''}>
                                            {item.status === 'paid' ? 'Pago' : item.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {item.status !== 'paid' && (
                                            <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => markAsPaid(item)}>
                                                Pagar
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => { setCurrentItem(item); setIsDialogOpen(true); }}>
                                            <Edit className="h-4 w-4 text-zinc-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{currentItem.id ? 'Editar' : 'Novo'} Lançamento</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="client" className="text-right">Cliente</Label>
                            <Input
                                id="client"
                                value={currentItem.client_name || ''}
                                onChange={(e) => setCurrentItem({ ...currentItem, client_name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="amount" className="text-right">Valor</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                value={currentItem.amount || ''}
                                onChange={(e) => setCurrentItem({ ...currentItem, amount: Number(e.target.value) })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="due_date" className="text-right">Vencimento</Label>
                            <Input
                                id="due_date"
                                type="date"
                                value={currentItem.due_date || ''}
                                onChange={(e) => setCurrentItem({ ...currentItem, due_date: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
