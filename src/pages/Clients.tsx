
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Search, Loader2, Edit, Trash2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Client {
    id: string;
    name: string;
    phone: string;
    document: string;
    email: string;
}

export default function Clients() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();

    // Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentClient, setCurrentClient] = useState<Partial<Client>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchClients();
    }, []);

    async function fetchClients() {
        setLoading(true);
        const { data, error } = await supabase
            .from('clients')
            .select('*, financial_movements(amount, status, type)')
            .order('name');
        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar clientes" });
        } else {
            setClients(data || []);
        }
        setLoading(false);
    }

    async function handleSave() {
        if (!currentClient.name) return toast({ title: "Nome obrigatório" });
        setIsSaving(true);

        try {
            if (currentClient.id) {
                const { error } = await supabase.from('clients').update(currentClient).eq('id', currentClient.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('clients').insert([currentClient]);
                if (error) throw error;
            }
            toast({ title: "Cliente salvo com sucesso!" });
            setIsDialogOpen(false);
            fetchClients();
            setCurrentClient({});
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir este cliente?")) return;
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) toast({ variant: 'destructive', title: "Erro ao excluir" });
        else {
            toast({ title: "Cliente removido" });
            fetchClients();
        }
    }

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm)
    );

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
                    <p className="text-zinc-500">Gerencie sua base de clientes.</p>
                </div>
                <Button onClick={() => { setCurrentClient({}); setIsDialogOpen(true); }} className="bg-zinc-900 text-white">
                    <Plus className="mr-2 h-4 w-4" /> Novo Cliente
                </Button>
            </div>

            <div className="relative max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nome ou telefone..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 bg-white"
                />
            </div>

            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-3 mb-4">
                {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : filteredClients.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</div>
                ) : (
                    filteredClients.map(client => {
                        const movements = (client as any).financial_movements || [];
                        const totalBought = movements
                            .filter((m: any) => m.type === 'income')
                            .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

                        const totalPending = movements
                            .filter((m: any) => m.type === 'income' && m.status === 'pending')
                            .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

                        return (
                            <div key={client.id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                                            <User className="h-4 w-4 text-zinc-500" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-zinc-900">{client.name}</div>
                                            <div className="text-xs text-zinc-500">{client.phone || '-'}</div>
                                        </div>
                                    </div>
                                    {totalPending > 0 ? (
                                        <div className="text-right">
                                            <span className="text-[10px] text-red-600 block">Pendente</span>
                                            <Badge variant="destructive" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200">R$ {totalPending.toFixed(2)}</Badge>
                                        </div>
                                    ) : (
                                        <Badge variant="secondary" className="bg-green-50 text-green-700">Em dia</Badge>
                                    )}
                                </div>
                                <div className="flex justify-between items-center bg-zinc-50 p-2 rounded text-sm">
                                    <span className="text-zinc-500">Total Comprado</span>
                                    <span className="font-bold">R$ {totalBought.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t">
                                    <Button variant="outline" size="sm" onClick={() => { setCurrentClient(client); setIsDialogOpen(true); }} className="h-8 text-xs">
                                        <Edit className="h-3 w-3 mr-1" /> Editar
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="hidden md:block bg-white rounded-lg border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Total Comprado</TableHead>
                            <TableHead>Em Aberto</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredClients.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                        ) : (
                            filteredClients.map(client => {
                                const movements = (client as any).financial_movements || [];
                                const totalBought = movements
                                    .filter((m: any) => m.type === 'income') // Only sales/income
                                    .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

                                const totalPending = movements
                                    .filter((m: any) => m.type === 'income' && m.status === 'pending')
                                    .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

                                return (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-zinc-500" />
                                            </div>
                                            {client.name}
                                        </TableCell>
                                        <TableCell>{client.phone || '-'}</TableCell>
                                        <TableCell>{client.email || '-'}</TableCell>
                                        <TableCell>
                                            <span className="font-bold text-zinc-700">R$ {totalBought.toFixed(2)}</span>
                                        </TableCell>
                                        <TableCell>
                                            {totalPending > 0 ? (
                                                <span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md">
                                                    R$ {totalPending.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-md">Em dia</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="ghost" size="icon" onClick={() => { setCurrentClient(client); setIsDialogOpen(true); }}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>

                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{currentClient.id ? 'Editar' : 'Novo'} Cliente</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome Completo</Label>
                            <Input value={currentClient.name || ''} onChange={e => setCurrentClient({ ...currentClient, name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Telefone</Label>
                                <Input value={currentClient.phone || ''} onChange={e => setCurrentClient({ ...currentClient, phone: e.target.value })} placeholder="(00) 00000-0000" />
                            </div>
                            <div className="space-y-2">
                                <Label>CPF/CNPJ</Label>
                                <Input value={currentClient.document || ''} onChange={e => setCurrentClient({ ...currentClient, document: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={currentClient.email || ''} onChange={e => setCurrentClient({ ...currentClient, email: e.target.value })} type="email" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
