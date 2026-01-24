import { useState, useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Gift, History, Ticket, Trophy, Target, Search, Trash2, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import confetti from "canvas-confetti";

import { useUserRole } from "@/hooks/useUserRole";
import { AlertTriangle } from "lucide-react";

export default function Raffle() {
    const { toast } = useToast();
    const [raffles, setRaffles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { roles } = useUserRole();
    const isAdmin = roles.includes('admin') || roles.includes('super_admin');

    // New/Edit Raffle State
    const [isNewRaffleOpen, setIsNewRaffleOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [step, setStep] = useState(1); // 1: Config, 2: Prizes, 3: Review
    const [newRaffle, setNewRaffle] = useState({
        name: "",
        start_date: "",
        end_date: "",
        ticket_value: 50
    });

    // Prize Selection State
    const [products, setProducts] = useState<any[]>([]);
    const [selectedPrizes, setSelectedPrizes] = useState<any[]>([]); // { product_id, quantity, name, cost }
    const [searchTerm, setSearchTerm] = useState("");

    // Draw Animation State
    const [isDrawOpen, setIsDrawOpen] = useState(false);
    const [activeDrawRaffle, setActiveDrawRaffle] = useState<any>(null);
    const [drawCandidates, setDrawCandidates] = useState<any[]>([]); // { client_name, ticket_number }
    const [winningTicket, setWinningTicket] = useState<any>(null);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        fetchRaffles();
    }, []);

    async function fetchRaffles() {
        setLoading(true);
        const { data, error } = await supabase
            .from("raffles")
            .select("*, winner:clients(name), prizes:raffle_prizes(product_id, quantity, unit_cost, products(name))")
            .order("created_at", { ascending: false });

        if (error) console.error(error);
        else setRaffles(data || []);
        setLoading(false);
    }

    async function fetchProducts() {
        // Fetch finished goods from products table
        const { data, error } = await supabase
            .from("products")
            .select("*, product_stocks(quantity, average_cost)")
            .eq('type', 'finished');

        // Map to flat structure and filter
        if (data) {
            const valid = data
                .map((product: any) => {
                    // Calculate Weighted Average Cost from Stock
                    const stocks = product.product_stocks || [];
                    const totalStockQty = stocks.reduce((acc: number, s: any) => acc + (Number(s.quantity) || 0), 0) || 0;
                    const totalStockValue = stocks.reduce((acc: number, s: any) => acc + ((Number(s.quantity) || 0) * (Number(s.average_cost) || 0)), 0) || 0;

                    const weightedAvgCost = totalStockQty > 0 ? (totalStockValue / totalStockQty) : (product.cost || 0);

                    return {
                        id: product.id,
                        name: product.name,
                        stock: totalStockQty,
                        cost: weightedAvgCost
                    };
                })
                .filter(p => p.stock > 0);
            setProducts(valid);
        }
    }

    const handleAddPrize = (product: any) => {
        if (selectedPrizes.find(p => p.id === product.id)) return;
        setSelectedPrizes([...selectedPrizes, { ...product, quantity: 1 }]);
    };

    const handleRemovePrize = (id: string) => {
        setSelectedPrizes(selectedPrizes.filter(p => p.id !== id));
    };

    const handleCreateOrUpdateRaffle = async () => {
        if (selectedPrizes.length === 0) return toast({ variant: "destructive", title: "Adicione pelo menos um prêmio!" });

        const totalCost = selectedPrizes.reduce((acc, curr) => acc + (curr.cost * curr.quantity), 0);

        try {
            let raffleId = editingId;

            if (editingId) {
                // UPDATE
                const { error: updateError } = await supabase
                    .from("raffles")
                    .update({
                        name: newRaffle.name,
                        start_date: newRaffle.start_date,
                        end_date: newRaffle.end_date,
                        ticket_value: newRaffle.ticket_value,
                        total_cost: totalCost
                    })
                    .eq('id', editingId);

                if (updateError) throw updateError;

                // Replace prizes
                await supabase.from("raffle_prizes").delete().eq("raffle_id", editingId);
            } else {
                // CREATE
                const { data: raffleData, error: insertError } = await supabase
                    .from("raffles")
                    .insert([{
                        name: newRaffle.name,
                        start_date: newRaffle.start_date,
                        end_date: newRaffle.end_date,
                        ticket_value: newRaffle.ticket_value,
                        total_cost: totalCost,
                        status: 'open'
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                raffleId = raffleData.id;
            }

            // Insert Prizes (Common)
            const prizesPayload = selectedPrizes.map(p => ({
                raffle_id: raffleId,
                product_id: p.id,
                quantity: p.quantity,
                unit_cost: p.cost
            }));

            const { error: prizesError } = await supabase.from("raffle_prizes").insert(prizesPayload);
            if (prizesError) throw prizesError;

            toast({ title: editingId ? "Sorteio Atualizado!" : "Sorteio Criado!", description: "Operação realizada com sucesso." });

            // Reset
            setIsNewRaffleOpen(false);
            setEditingId(null);
            setStep(1);
            setNewRaffle({ name: "", start_date: "", end_date: "", ticket_value: 50 });
            setSelectedPrizes([]);
            fetchRaffles();

        } catch (e: any) {
            toast({ variant: "destructive", title: "Erro", description: e.message });
        }
    };

    const handleEditRaffle = (raffle: any) => {
        setEditingId(raffle.id);
        const formatDateTime = (dateStr: string) => {
            if (!dateStr) return "";
            const d = new Date(dateStr);
            // Adjust to local ISO string for input[type="datetime-local"]
            const pad = (n: number) => n < 10 ? '0' + n : n;
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        setNewRaffle({
            name: raffle.name,
            start_date: formatDateTime(raffle.start_date),
            end_date: formatDateTime(raffle.end_date),
            ticket_value: raffle.ticket_value
        });

        // Map prizes back to selection format
        const formattedPrizes = (raffle.prizes || []).map((p: any) => ({
            id: p.product_id, // Important: Use product_id
            name: p.products?.name || 'Produto',
            cost: p.unit_cost,
            quantity: p.quantity
        }));
        setSelectedPrizes(formattedPrizes);

        setStep(1);
        setIsNewRaffleOpen(true);
        fetchProducts(); // Ensure products are loaded for step 2
    };

    const handleDeleteRaffle = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este sorteio? Essa ação não pode ser desfeita.")) return;
        try {
            const { error } = await supabase.from("raffles").delete().eq('id', id);
            if (error) throw error;
            toast({ title: "Sorteio Excluído" });
            fetchRaffles();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        }
    };

    // --- DRAW LOGIC ---

    const prepareDraw = async (raffle: any) => {
        setActiveDrawRaffle(raffle);
        // Fetch sales and calculate tickets
        const { data: sales } = await supabase
            .from("sales")
            .select("total, clients(id, name)")
            .gte("created_at", raffle.start_date)
            .lte("created_at", raffle.end_date)
            .eq("status", "completed");

        if (!sales || sales.length === 0) {
            toast({ variant: "destructive", title: "Nenhuma venda no período!" });
            return;
        }

        // Aggregate by client
        const clientTotals: Record<string, { name: string, total: number }> = {};
        sales.forEach((s: any) => {
            const clientId = s.clients?.id || 'anonymous';
            const clientName = s.clients?.name || 'Consumidor Final';
            if (clientId === 'anonymous') return; // Skip anonymous

            if (!clientTotals[clientId]) clientTotals[clientId] = { name: clientName, total: 0 };
            clientTotals[clientId].total += Number(s.total);
        });

        // Generate tickets
        const tickets: any[] = [];
        let ticketCounter = 1;

        Object.entries(clientTotals).forEach(([clientId, data]) => {
            const count = Math.floor(data.total / raffle.ticket_value);
            for (let i = 0; i < count; i++) {
                tickets.push({
                    ticket_number: ticketCounter++,
                    client_id: clientId,
                    client_name: data.name
                });
            }
        });

        if (tickets.length === 0) {
            toast({ variant: "destructive", title: "Nenhum cliente atingiu a meta para ganhar cupom." });
            return;
        }

        setDrawCandidates(tickets);
        setWinningTicket(null);
        setIsDrawOpen(true);
    };

    const executeDraw = async () => {
        if (drawCandidates.length === 0) return;
        setIsAnimating(true);

        // Simple animation logic
        let duration = 3000;
        let interval = 100;

        const timer = setInterval(() => {
            const random = Math.floor(Math.random() * drawCandidates.length);
            setWinningTicket(drawCandidates[random]);
            interval += 50; // Slow down
        }, 100);

        setTimeout(async () => {
            clearInterval(timer);
            // Construct final winner
            const finalIndex = Math.floor(Math.random() * drawCandidates.length);
            const winner = drawCandidates[finalIndex];
            setWinningTicket(winner);
            setIsAnimating(false);
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

            // Commit Winner & Deduct Stock
            await commitWinner(winner);

        }, duration);
    };

    const commitWinner = async (winner: any) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Update Raffle Winner
            await supabase.from("raffles").update({
                winner_client_id: winner.client_id,
                winner_ticket_number: winner.ticket_number,
                status: 'completed'
            }).eq('id', activeDrawRaffle.id);

            // 2. Deduct Stock using new RPC
            if (user) {
                const { error } = await supabase.rpc('finalize_raffle_stock', {
                    p_raffle_id: activeDrawRaffle.id,
                    p_user_id: user.id
                });
                if (error) throw error;
            }

            toast({ title: "Sorteio Finalizado!", description: "Estoque baixado com sucesso." });
            fetchRaffles();

        } catch (e: any) {
            console.error(e);
            toast({ variant: "destructive", title: "Erro ao salvar ganhador", description: e.message });
        }
    };

    const handleRevert = async (raffleId: string) => {
        if (!confirm("Tem certeza que deseja estornar este sorteio? O estoque será devolvido e o ganhador removido.")) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase.rpc('revert_raffle_stock', {
                p_raffle_id: raffleId,
                p_user_id: user.id
            });

            if (error) throw error;

            toast({ title: "Sorteio estornado", description: "O estoque foi devolvido com sucesso." });
            fetchRaffles();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Erro ao estornar", description: e.message });
        }
    };

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Sorteador</h2>
                    <p className="text-zinc-500">Engaje clientes com sorteios baseados em compras.</p>
                </div>
                <Button onClick={() => { setIsNewRaffleOpen(true); setEditingId(null); setNewRaffle({ name: "", start_date: "", end_date: "", ticket_value: 50 }); setSelectedPrizes([]); setStep(1); fetchProducts(); }} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="mr-2 h-4 w-4" /> Novo Sorteio
                </Button>
            </div>

            <Tabs defaultValue="active" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="active">Abertos / Novos</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="space-y-4">
                    {raffles.filter(r => r.status !== 'completed').length === 0 ? (
                        <div className="text-center py-12 text-zinc-400">Nenhum sorteio em andamento.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {raffles.filter(r => r.status !== 'completed').map(raffle => (
                                <Card key={raffle.id} className="border-purple-100 shadow-sm relative overflow-visible group">
                                    <div className="absolute top-2 right-2 flex gap-1 z-20">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-purple-600 hover:bg-white/80" onClick={() => handleEditRaffle(raffle)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-white/80" onClick={() => handleDeleteRaffle(raffle.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                                        <Gift className="h-24 w-24 text-purple-600" />
                                    </div>
                                    <CardHeader>
                                        <CardTitle className="pr-16 truncate" title={raffle.name}>{raffle.name}</CardTitle>
                                        <CardDescription>
                                            De {new Date(raffle.start_date).toLocaleDateString()} até {new Date(raffle.end_date).toLocaleDateString()}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500">Valor do Cupom:</span>
                                                <span className="font-bold">R$ {Number(raffle.ticket_value).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500">Prêmios:</span>
                                                <span className="font-medium text-right text-xs max-w-[50%] truncate">
                                                    {raffle.prizes?.map((p: any) => `${p.quantity}x ${p.products?.name}`).join(', ')}
                                                </span>
                                            </div>
                                        </div>
                                        <Button className="w-full bg-zinc-900" onClick={() => prepareDraw(raffle)}>
                                            <Trophy className="mr-2 h-4 w-4 text-yellow-500" /> Realizar Sorteio
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Data Sorteio</TableHead>
                                    <TableHead>Ganhador (Ticket)</TableHead>
                                    <TableHead>Prêmios</TableHead>
                                    <TableHead>Custo Gerencial</TableHead>
                                    <TableHead>Status</TableHead>
                                    {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {raffles.filter(r => r.status === 'completed').length === 0 ? (
                                    <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">Nenhum histórico.</TableCell></TableRow>
                                ) : (
                                    raffles.filter(r => r.status === 'completed').map(raffle => (
                                        <TableRow key={raffle.id}>
                                            <TableCell className="font-medium">{raffle.name}</TableCell>
                                            <TableCell>{new Date(raffle.updated_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-bold text-green-600">
                                                {raffle.winner?.name} <span className="text-xs text-zinc-400 font-normal">(#{raffle.winner_ticket_number})</span>
                                            </TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate" title={raffle.prizes?.map((p: any) => p.products?.name).join(', ')}>
                                                {raffle.prizes?.map((p: any) => `${p.quantity}x ${p.products?.name}`).join(', ')}
                                            </TableCell>
                                            <TableCell>R$ {Number(raffle.total_cost).toFixed(2)}</TableCell>
                                            <TableCell><Badge variant="outline" className="bg-green-50 text-green-700">Concluído</Badge></TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="sm" onClick={() => handleRevert(raffle.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                        <AlertTriangle className="h-4 w-4 mr-1" /> Estornar
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* NEW RAFFLE WIZARD */}
            <Dialog open={isNewRaffleOpen} onOpenChange={setIsNewRaffleOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Editar Sorteio" : "Novo Sorteio"} - Passo {step}/2</DialogTitle>
                        <DialogDescription>{step === 1 ? 'Configurações Básicas' : 'Escolha os Prêmios do Estoque'}</DialogDescription>
                    </DialogHeader>

                    {step === 1 && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nome do Sorteio</label>
                                <Input value={newRaffle.name} onChange={e => setNewRaffle({ ...newRaffle, name: e.target.value })} placeholder="Ex: Páscoa Premiada" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Início das Vendas</label>
                                    <Input type="datetime-local" value={newRaffle.start_date} onChange={e => setNewRaffle({ ...newRaffle, start_date: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Fim das Vendas</label>
                                    <Input type="datetime-local" value={newRaffle.end_date} onChange={e => setNewRaffle({ ...newRaffle, end_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Valor para 1 Cupom (R$)</label>
                                <Input type="number" value={newRaffle.ticket_value} onChange={e => setNewRaffle({ ...newRaffle, ticket_value: Number(e.target.value) })} />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 py-4 h-[400px] flex flex-col">
                            <div className="flex gap-2">
                                <Search className="text-zinc-400 absolute ml-2 mt-2.5 h-4 w-4" />
                                <Input
                                    placeholder="Buscar produto pronto..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
                                {/* Product List */}
                                <div className="border rounded-md overflow-auto p-2 space-y-2">
                                    <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">Disponíveis no Estoque</p>
                                    {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(product => (
                                        <div key={product.id} className="flex justify-between items-center p-2 border rounded hover:bg-zinc-50 cursor-pointer" onClick={() => handleAddPrize(product)}>
                                            <div className="text-sm truncate max-w-[120px]" title={product.name}>{product.name}</div>
                                            <Badge variant="secondary" className="text-[10px]">{product.stock} un</Badge>
                                        </div>
                                    ))}
                                </div>

                                {/* Selected List */}
                                <div className="border rounded-md overflow-auto p-2 space-y-2 bg-purple-50/30 border-purple-100">
                                    <p className="text-xs font-semibold text-purple-600 uppercase mb-2">Prêmios Selecionados</p>
                                    {selectedPrizes.length === 0 ? <p className="text-xs text-zinc-400 italic">Nenhum selecionado.</p> : (
                                        selectedPrizes.map(p => (
                                            <div key={p.id} className="flex justify-between items-center p-2 bg-white border rounded shadow-sm">
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium">{p.name}</div>
                                                    <div className="text-[10px] text-zinc-500">Custo Est.: R$ {p.cost.toFixed(2)}</div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        type="number"
                                                        className="h-6 w-12 px-1 text-center text-xs"
                                                        value={p.quantity}
                                                        onChange={e => {
                                                            const val = Math.max(1, Number(e.target.value));
                                                            setSelectedPrizes(selectedPrizes.map(sp => sp.id === p.id ? { ...sp, quantity: val } : sp));
                                                        }}
                                                    />
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => handleRemovePrize(p.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="text-right text-xs text-zinc-500">
                                Total Custo Gerencial: <b>R$ {selectedPrizes.reduce((acc, curr) => acc + (curr.cost * curr.quantity), 0).toFixed(2)}</b>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {step === 2 && <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>}
                        {step === 1 ? (
                            <Button onClick={() => {
                                if (!newRaffle.name || !newRaffle.start_date || !newRaffle.end_date) return toast({ title: "Preencha tudo!" });
                                setStep(2);
                            }}>Próximo</Button>
                        ) : (
                            <Button onClick={handleCreateOrUpdateRaffle} className="bg-purple-600 hover:bg-purple-700 text-white">
                                {editingId ? "Salvar Alterações" : "Criar Sorteio"}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DRAW DIALOG */}

            <Dialog open={isDrawOpen} onOpenChange={setIsDrawOpen}>
                <DialogContent className="sm:max-w-md text-center">
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl font-bold text-purple-700">
                            {winningTicket ? "TEMOS UM GANHADOR!" : "Participantes do Sorteio"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 flex flex-col items-center justify-center space-y-4">
                        {winningTicket ? (
                            <>
                                <div className={`text-6xl font-black transition-all duration-100 ${isAnimating ? 'blur-sm scale-90 opacity-70' : 'scale-110 text-purple-600'}`}>
                                    {winningTicket?.ticket_number || "---"}
                                </div>
                                <div className="text-xl font-medium text-zinc-700 h-8">
                                    {winningTicket?.client_name || "Embaralhando..."}
                                </div>
                            </>
                        ) : (
                            <div className="w-full max-h-[300px] overflow-y-auto border rounded-md p-2 bg-zinc-50 space-y-1">
                                {drawCandidates.map((ticket: any) => (
                                    <div key={ticket.ticket_number} className="flex justify-between items-center text-sm p-2 bg-white rounded shadow-sm border">
                                        <span className="font-bold text-purple-600">#{ticket.ticket_number}</span>
                                        <span className="text-zinc-700 truncate max-w-[200px]">{ticket.client_name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="text-sm text-zinc-400">Total de Cupons: {drawCandidates.length}</div>
                    </div>

                    <DialogFooter className="sm:justify-center">
                        {!winningTicket && !isAnimating && (
                            <Button size="lg" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all" onClick={executeDraw}>
                                <Target className="mr-2 h-6 w-6 animate-pulse" /> SORTEAR AGORA
                            </Button>
                        )}
                        {(winningTicket || (!winningTicket && !isAnimating)) && (
                            <Button variant="outline" onClick={() => setIsDrawOpen(false)}>{winningTicket ? "Fechar" : "Cancelar"}</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
