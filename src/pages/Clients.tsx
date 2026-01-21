import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Search, Loader2, Edit, Trash2, User, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";
import { WhatsAppChargeDialog, ChargeItem } from "@/components/financial/WhatsAppChargeDialog";
import { cn } from "@/lib/utils";

interface FinancialMovement {
    id: string;
    amount: number;
    status: 'pending' | 'paid';
    type: 'income' | 'expense';
    description: string;
    due_date: string;
    payment_date: string;
    created_at: string;

    related_sale_id?: number; // Corrected column name
}

interface Client {
    id: string;
    name: string;
    phone: string;
    document: string;
    email: string;
    financial_movements: FinancialMovement[];
}

export default function Clients() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { toast } = useToast();

    // Dialogs
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [currentClient, setCurrentClient] = useState<Partial<Client>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // WhatsApp State
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

    const handleOpenWhatsApp = async (client: Client, pendingAmount: number) => {
        if (pendingAmount <= 0) return;

        const pendingMovements = client.financial_movements
            ?.filter(m => m.type === 'income' && m.status === 'pending') || [];

        if (pendingMovements.length === 0) return;

        // Fetch details for these movements
        // We need to know which products were bought for each sale associated with these movements
        const saleIds = pendingMovements.map(m => m.related_sale_id).filter(id => id !== undefined && id !== null) as number[];

        // Dictionary to store sale details if found
        const saleDetailsMap: Record<number, string> = {};

        if (saleIds.length > 0) {
            const { data: salesData } = await supabase
                .from('sales')
                .select('id, sale_items(quantity, products(name))')
                .in('id', saleIds);

            if (salesData) {
                salesData.forEach(sale => {
                    const desc = sale.sale_items?.map((item: any) => {
                        return `${item.products?.name} (x${item.quantity})`;
                    }).join(', ');
                    if (desc) saleDetailsMap[sale.id] = desc;
                });
            }
        }

        const items: ChargeItem[] = pendingMovements.map(m => {
            let desc = m.description;
            // If it's a sale and we have details, append them
            if (m.related_sale_id && saleDetailsMap[m.related_sale_id]) {
                desc = saleDetailsMap[m.related_sale_id];
            }

            return {
                id: m.id,
                description: desc,
                amount: Number(m.amount),
                date: m.created_at, // or due_date
                originalDescription: m.description
            };
        });

        setWhatsAppDialogData({
            clientName: client.name,
            phone: client.phone || '',
            items: items,
        });
        setIsWhatsAppDialogOpen(true);
    };

    useEffect(() => {
        fetchClients();
        checkUserRole();
    }, []);

    async function checkUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email === 'admin@kbsweet.com' || user?.user_metadata?.role === 'admin') { // Simple Admin Check
            setIsAdmin(true);
        }
    }

    async function fetchClients() {
        setLoading(true);
        const { data, error } = await supabase
            .from('clients')
            .select('*, financial_movements(id, amount, status, type, description, due_date, payment_date, created_at, related_sale_id)')
            .order('name');

        if (error) {
            toast({ variant: "destructive", title: "Erro ao carregar clientes" });
        } else {
            // Cast correctly
            setClients((data as any) || []);
        }
        setLoading(false);
    }

    async function handleSave() {
        if (!currentClient.name) return toast({ title: "Nome obrigatório" });
        setIsSaving(true);

        try {
            // Remove nested objects (like financial_movements) before saving
            const { financial_movements, ...clientData } = currentClient as any;

            if (clientData.id) {
                const { error } = await supabase.from('clients').update(clientData).eq('id', clientData.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('clients').insert([clientData]);
                if (error) throw error;
            }
            toast({ title: "Cliente salvo com sucesso!" });
            setIsDialogOpen(false);
            fetchClients();
            setCurrentClient({});
        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: "Erro ao salvar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(client: Client) {
        const hasHistory = client.financial_movements && client.financial_movements.length > 0;

        if (hasHistory) {
            if (!isAdmin) {
                return toast({
                    variant: 'destructive',
                    title: "Exclusão Bloqueada",
                    description: "Este cliente possui histórico financeiro. Apenas administradores podem excluir."
                });
            }

            if (!confirm(`ATENÇÃO: Este cliente possui ${client.financial_movements.length} registros financeiros. A exclusão apagará TUDO. Deseja realmente excluir permanentemente?`)) {
                return;
            }
        } else {
            if (!confirm("Excluir este cliente?")) return;
        }

        const { error } = await supabase.from('clients').delete().eq('id', client.id);
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

    // Helpers for summary
    const getSummary = (movements: FinancialMovement[]) => {
        const income = movements.filter(m => m.type === 'income');
        const totalBought = income.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const pending = income.filter(m => m.status === 'pending').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const paid = income.filter(m => m.status === 'paid').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        return { totalBought, pending, paid };
    };

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
            <div className="md:hidden space-y-4 mb-20">
                {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" /></div>
                ) : filteredClients.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</div>
                ) : (
                    filteredClients.map(client => {
                        const { totalBought, pending } = getSummary(client.financial_movements || []);

                        return (
                            <div key={client.id} className="bg-white p-4 rounded-xl border border-zinc-100 shadow-sm flex flex-col gap-4">
                                {/* Header: Info & Status */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200">
                                            <User className="h-5 w-5 text-zinc-400" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-zinc-900 leading-tight">{client.name}</div>
                                            <div className="text-xs text-zinc-500 mt-0.5">{client.phone || '-'}</div>
                                        </div>
                                    </div>
                                    {pending > 0 ? (
                                        <Badge variant="destructive" className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                            Pendente
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-green-50 text-green-600 hover:bg-green-100 border-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                            Em dia
                                        </Badge>
                                    )}
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                                        <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block mb-1">Total Comprado</span>
                                        <span className="font-bold text-zinc-700 text-sm block">R$ {totalBought.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className={cn("p-3 rounded-lg border", pending > 0 ? "bg-red-50/50 border-red-100" : "bg-zinc-50 border-zinc-100")}>
                                        <span className={cn("text-[10px] font-medium uppercase tracking-wider block mb-1", pending > 0 ? "text-red-400" : "text-zinc-400")}>Em Aberto</span>
                                        <span className={cn("font-bold text-sm block", pending > 0 ? "text-red-600" : "text-zinc-700")}>
                                            {pending > 0 ? `R$ ${pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-2">
                                    {pending > 0 && (
                                        <Button
                                            size="sm"
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium text-xs h-9 shadow-sm" // Increased height to h-9
                                            onClick={() => handleOpenWhatsApp(client, pending)}
                                        >
                                            <MessageCircle className="h-4 w-4 mr-1.5" />
                                            Cobrar WhatsApp
                                        </Button>
                                    )}

                                    <div className="flex gap-1 ml-auto">
                                        <Button variant="ghost" size="icon" onClick={() => { setCurrentClient(client); setIsDetailsOpen(true); }} className="h-9 w-9 text-zinc-500 hover:text-blue-600 hover:bg-blue-50">
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => { setCurrentClient(client); setIsDialogOpen(true); }} className="h-9 w-9 text-zinc-500 hover:text-amber-600 hover:bg-amber-50">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(client)} className="h-9 w-9 text-zinc-400 hover:text-red-600 hover:bg-red-50">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
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
                                const { totalBought, pending } = getSummary(client.financial_movements || []);

                                return (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-zinc-500" />
                                            </div>
                                            {client.name}
                                            {pending > 0 && (
                                                <Button
                                                    size="sm"
                                                    className="h-6 bg-green-600 hover:bg-green-700 text-white text-xs ml-2 px-2"
                                                    onClick={() => handleOpenWhatsApp(client, pending)}
                                                    title="Cobrar via WhatsApp"
                                                >
                                                    <MessageCircle className="h-3 w-3 mr-1" /> Cobrar
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell>{client.phone || '-'}</TableCell>
                                        <TableCell>{client.email || '-'}</TableCell>
                                        <TableCell>
                                            <span className="font-bold text-zinc-700">R$ {totalBought.toFixed(2)}</span>
                                        </TableCell>
                                        <TableCell>
                                            {pending > 0 ? (
                                                <span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md">
                                                    R$ {pending.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-md">Em dia</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="ghost" size="icon" onClick={() => { setCurrentClient(client); setIsDetailsOpen(true); }} title="Detalhes">
                                                <Eye className="h-4 w-4 text-blue-500" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => { setCurrentClient(client); setIsDialogOpen(true); }}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(client)}>
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

            {/* Dialog Editar/Novo */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
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

            {/* Dialog Detalhes */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-2xl bg-zinc-50/95 max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            {currentClient.name}
                        </DialogTitle>
                    </DialogHeader>

                    {currentClient.id && (
                        <ClientDetailsContent client={currentClient as Client} />
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <WhatsAppChargeDialog
                isOpen={isWhatsAppDialogOpen}
                onClose={() => setIsWhatsAppDialogOpen(false)}
                data={whatsAppDialogData}
            />
        </div>
    );
}


function ClientDetailsContent({ client }: { client: Client }) {
    const movements = client.financial_movements || [];
    const income = movements.filter(m => m.type === 'income');

    const pendingMovements = income.filter(m => m.status === 'pending');
    const paidMovements = income.filter(m => m.status === 'paid');

    const totalBought = income.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalPending = pendingMovements.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    const [viewSaleItems, setViewSaleItems] = useState<any[] | null>(null);
    const [viewSaleId, setViewSaleId] = useState<string | null>(null);

    const handleViewSale = async (saleId: number) => {
        if (!saleId) return;
        setViewSaleId(String(saleId));

        const { data } = await supabase
            .from('sale_items')
            .select('*, products(name)')
            .eq('sale_id', saleId);

        if (data) {
            setViewSaleItems(data);
        } else {
            setViewSaleItems([]);
        }
    };

    const closeDetails = () => {
        setViewSaleItems(null);
        setViewSaleId(null);
    };

    if (viewSaleItems) {
        return (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex items-center gap-2 mb-4">
                    <Button variant="ghost" size="sm" onClick={closeDetails} className="-ml-2">
                        ← Voltar
                    </Button>
                    <span className="font-semibold text-sm">Detalhes da Compra #{viewSaleId}</span>
                </div>

                <div className="border rounded-md overflow-hidden bg-white">
                    <Table>
                        <TableHeader className="bg-zinc-50">
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Qtd</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewSaleItems.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="text-center text-zinc-400">Sem itens.</TableCell></TableRow>
                            ) : (
                                viewSaleItems.map((item: any) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium text-sm">{item.products?.name || 'Item'}</TableCell>
                                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                                        <TableCell className="text-right font-bold text-sm">R$ {((Number(item.quantity) * Number(item.unit_price))).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 overflow-hidden flex flex-col flex-1">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 pt-4">
                        <div className="text-xs text-zinc-500 font-medium uppercase">Total Comprado</div>
                        <div className="text-xl font-bold text-zinc-900">R$ {totalBought.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-100">
                    <CardContent className="p-4 pt-4">
                        <div className="text-xs text-red-600 font-medium uppercase">Em Aberto</div>
                        <div className="text-xl font-bold text-red-700">R$ {totalPending.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-100">
                    <CardContent className="p-4 pt-4">
                        <div className="text-xs text-green-600 font-medium uppercase">Pago</div>
                        <div className="text-xl font-bold text-green-700">R$ {(totalBought - totalPending).toFixed(2)}</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="pending" className="flex flex-col flex-1 overflow-hidden">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pending" className="gap-2">
                        <AlertTriangle className="h-3 w-3" /> Pendentes ({pendingMovements.length})
                    </TabsTrigger>
                    <TabsTrigger value="history">Histórico ({paidMovements.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="flex-1 overflow-hidden flex flex-col mt-2">
                    <ScrollArea className="flex-1 border rounded-md bg-white p-2 h-[300px]">
                        {pendingMovements.length === 0 ? (
                            <div className="text-center py-10 text-zinc-400 text-sm">Nenhuma pendência.</div>
                        ) : (
                            <div className="space-y-2">
                                {pendingMovements.map(m => (
                                    <div key={m.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-zinc-50 transition-colors">
                                        <div>
                                            <div className="font-medium text-sm">{m.description}</div>
                                            <div className="text-xs text-zinc-500">Vencimento: {m.due_date ? new Date(m.due_date).toLocaleDateString() : '-'}</div>
                                        </div>
                                        <div className="text-right flex items-center gap-2">
                                            <div className="flex flex-col items-end">
                                                <div className="font-bold text-red-600">R$ {Number(m.amount).toFixed(2)}</div>
                                                <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">Pendente</Badge>
                                            </div>
                                            {m.related_sale_id && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSale(m.related_sale_id!)}>
                                                    <Eye className="h-3 w-3 text-zinc-400" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="history" className="flex-1 overflow-hidden flex flex-col mt-2">
                    <ScrollArea className="flex-1 border rounded-md bg-white p-2 h-[300px]">
                        {paidMovements.length === 0 ? (
                            <div className="text-center py-10 text-zinc-400 text-sm">Nenhum histórico.</div>
                        ) : (
                            <div className="space-y-2">
                                {paidMovements.map(m => (
                                    <div key={m.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-zinc-50 transition-colors">
                                        <div>
                                            <div className="font-medium text-sm">{m.description}</div>
                                            <div className="text-xs text-zinc-500">Pago em: {m.payment_date ? new Date(m.payment_date).toLocaleDateString() : '-'}</div>
                                        </div>
                                        <div className="text-right flex items-center gap-2">
                                            <div className="flex flex-col items-end">
                                                <div className="font-bold text-green-600">R$ {Number(m.amount).toFixed(2)}</div>
                                                <Badge variant="outline" className="text-[10px] text-green-500 border-green-200">Pago</Badge>
                                            </div>
                                            {m.related_sale_id && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSale(m.related_sale_id!)}>
                                                    <Eye className="h-3 w-3 text-zinc-400" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </div>
    );
}
