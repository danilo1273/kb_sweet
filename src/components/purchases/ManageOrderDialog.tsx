import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Save, Check, Ban, Loader2, PackageSearch, ScrollText } from "lucide-react";
import { usePurchases } from "@/hooks/usePurchases";
import { useToast } from "@/components/ui/use-toast";
import { ItemDraft } from "@/types";
import { StockConsultationDialog } from "@/components/pos/StockConsultationDialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ManageOrderDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isReadOnly?: boolean;
    order: any; // PurchaseOrder
    suppliers: any[];
    ingredients: any[];
    onNewSupplier: () => void;
    onNewProduct: () => void;
    formatCurrency: (val: number) => string;
    formatStatus: (status: string) => string;
    onEditItem: (item: any) => void;
    currentUserId: string;
    currentUserRoles: string[];
    onDeleteOrder: (id: string, reason: string, userId: string) => void;
    onOrderUpdated?: () => void;
}

export function ManageOrderDialog({
    isOpen,
    onOpenChange,
    isReadOnly = false,
    order,
    suppliers,
    ingredients,
    onNewSupplier,
    onNewProduct,
    formatCurrency,
    formatStatus,
    onEditItem,
    currentUserId,
    currentUserRoles,
    onDeleteOrder,
    onOrderUpdated
}: ManageOrderDialogProps) {
    const { toast } = useToast();
    const { addRequestToOrder, deleteRequestFromOrder, updateOrderHeader, fetchOrders, approveRequest, batchApproveRequests, updateOrderStatus, reprocessOrderToPending } = usePurchases();

    // Consultation Dialog
    const [isConsultOpen, setIsConsultOpen] = useState(false);

    // LOCK LOGIC
    const hasItems = order?.requests?.length > 0;
    const allItemsApproved = hasItems && order?.requests?.every((r: any) => r.status === 'approved');
    const isEditApproved = order?.status === 'edit_approved';
    const isEditRequested = order?.status === 'edit_requested';

    // Locked se: (Todos Aprovados E não está Edit Approved) OU (Está explicitamente Edit Requested)
    const isLocked = (allItemsApproved && !isEditApproved) || isEditRequested;

    // Se estiver locked, campos de edição ficam desabilitados
    const disableEditing = isReadOnly || isLocked;

    // Show Edit/Add controls only if not read only, not locked, 
    // AND user is either admin or the creator of the order
    const showEditControls = !isReadOnly && !isLocked && (currentUserRoles?.includes('admin') || currentUserId === order?.created_by);

    // Local state for header editing
    const [headerNickname, setHeaderNickname] = useState(order?.nickname || '');
    const [headerSupplier, setHeaderSupplier] = useState(order?.supplier_id || '');
    const [isSavingHeader, setIsSavingHeader] = useState(false);

    // Local state for new item draft
    const [newItemDraft, setNewItemDraft] = useState<ItemDraft>({
        ingredient_id: undefined,
        item_name: '',
        quantity: 0,
        unit: 'un',
        cost: 0,
        destination: 'danilo'
    });
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Sync local header state when order changes
    useEffect(() => {
        if (order) {
            setHeaderNickname(order.nickname || '');
            setHeaderSupplier(order.supplier_id || '');
        }
    }, [order]);

    async function handleSaveHeader() {
        if (!order) return;
        setIsSavingHeader(true);
        const success = await updateOrderHeader(order.id, { nickname: headerNickname, supplier_id: headerSupplier || null });
        setIsSavingHeader(false);
        if (success) {
            toast({ title: "Cabeçalho atualizado" });
            fetchOrders();
            onOrderUpdated?.();
        }
    }

    async function handleAddItem() {
        if (!order) return;
        if (!newItemDraft.item_name && !newItemDraft.ingredient_id) return toast({ variant: 'destructive', title: "Nome ou produto obrigatório" });
        if (newItemDraft.quantity <= 0) return toast({ variant: 'destructive', title: "Quantidade inválida" });

        setIsAddingItem(true);

        // Final name logic
        let finalName = newItemDraft.item_name;
        if (newItemDraft.ingredient_id && !finalName) {
            const ing = ingredients.find(i => i.id === newItemDraft.ingredient_id);
            finalName = ing?.name || 'Unknown';
        }

        const itemPayload = { ...newItemDraft, item_name: finalName };

        const success = await addRequestToOrder(order.id, itemPayload, currentUserId, currentUserId);

        setIsAddingItem(false);
        if (success) {
            setNewItemDraft({ ingredient_id: undefined, item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });
            fetchOrders();
            onOrderUpdated?.();
        }
    }

    async function handleDeleteItem(itemId: string, status: string) {
        if (status === 'approved' || status === 'edit_approved') {
            if (!confirm("Este item já foi aprovado. Excluir irá reverter o estoque e financeiro. Continuar?")) return;
        } else {
            if (!confirm("Excluir item?")) return;
        }

        const success = await deleteRequestFromOrder(itemId, status);
        if (success) {
            fetchOrders();
            onOrderUpdated?.();
        }
    }

    const canApprove = currentUserRoles?.includes('approver');
    const isAdmin = currentUserRoles?.includes('admin');

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex flex-row justify-between items-center pr-8">
                    <DialogTitle className="flex items-center gap-2">
                        <ScrollText className="h-5 w-5 text-indigo-600" />
                        Gerenciar Lote: {order?.nickname || "Sem Nome"}
                    </DialogTitle>
                    <Button variant="outline" size="sm" onClick={() => setIsConsultOpen(true)} className="gap-2">
                        <PackageSearch className="h-4 w-4" /> Ver Estoque
                    </Button>
                </DialogHeader>

                {order && (
                    <ScrollArea className="flex-1 pr-4">
                        <div className="py-4 space-y-6">
                            {isReadOnly ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4 bg-slate-50 p-3 rounded-lg">
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Fornecedor</Label>
                                        <div className="font-medium text-sm">{suppliers.find(s => s.id === order.supplier_id)?.name || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Status do Lote</Label>
                                        <div className="mt-1"><Badge>{formatStatus(order.status)}</Badge></div>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Data Criação</Label>
                                        <div className="font-medium text-sm">{new Date(order.created_at).toLocaleDateString()}</div>
                                    </div>
                                    {order.approver_name && (
                                        <div>
                                            <Label className="text-muted-foreground text-xs">Aprovado por</Label>
                                            <div className="font-medium text-sm text-green-700">{order.approver_name}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4 border-b pb-4">
                                    <div className="space-y-2">
                                        <Label>Fornecedor</Label>
                                        <div className="flex gap-2">
                                            <Select
                                                value={headerSupplier}
                                                onValueChange={(val) => setHeaderSupplier(val)}
                                                disabled={isLocked}
                                            >
                                                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                                <SelectContent>
                                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            {!isLocked && (
                                                <Button size="icon" variant="outline" onClick={onNewSupplier} className="shrink-0 h-9 w-9">
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Apelido do Lote</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={headerNickname}
                                                onChange={e => setHeaderNickname(e.target.value)}
                                                placeholder="Ex: Refil Semanal"
                                                className="h-9"
                                                disabled={isLocked}
                                            />
                                            {!isLocked && (
                                                <Button onClick={handleSaveHeader} disabled={isSavingHeader} size="sm" className="h-9">
                                                    {isSavingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                    Conteúdo do Lote
                                    <Badge variant="secondary" className="text-[10px]">{order.requests?.length || 0} itens</Badge>
                                </h4>

                                {/* Mobile View: List */}
                                <div className="md:hidden space-y-3">
                                    {order.requests?.map((item: any) => (
                                        <div key={item.id} className="bg-zinc-50 p-3 rounded-lg border text-sm space-y-2">
                                            <div className="flex justify-between font-medium text-zinc-900">
                                                <span>{item.item_name}</span>
                                                <span>{formatCurrency(Number(item.cost))}</span>
                                            </div>
                                            <div className="flex justify-between text-zinc-500 text-xs">
                                                <span>{item.quantity} {item.unit}</span>
                                                {item.financial_status === 'paid'
                                                    ? <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Pago</Badge>
                                                    : <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>
                                                }
                                            </div>
                                            {showEditControls && (
                                                <div className="flex justify-end gap-2 pt-2 border-t mt-1">
                                                    {item.status === 'pending' && canApprove && (
                                                        <>
                                                            <Button variant="ghost" size="sm" onClick={async () => { await approveRequest(item, true, currentUserId); onOrderUpdated?.(); }} className="h-8 w-8 p-0 text-green-600 bg-green-50">
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={async () => { await approveRequest(item, false, currentUserId); onOrderUpdated?.(); }} className="h-8 w-8 p-0 text-red-600 bg-red-50">
                                                                <Ban className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    {item.financial_status !== 'paid' && (
                                                        <>
                                                            <Button variant="ghost" size="sm" onClick={() => onEditItem(item)} className="h-8 w-8 p-0 text-blue-500 bg-blue-50">
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id, item.status)} className="h-8 w-8 p-0 text-red-400 bg-red-50">
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Qtd</TableHead>
                                                <TableHead>Custo</TableHead>
                                                <TableHead>Status</TableHead>
                                                {showEditControls && <TableHead className="text-right">Ação</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {order.requests?.map((item: any) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.item_name}</TableCell>
                                                    <TableCell>{item.quantity} {item.unit}</TableCell>
                                                    <TableCell>{formatCurrency(Number(item.cost))}</TableCell>
                                                    <TableCell>
                                                        {item.financial_status === 'paid' ? <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Pago</Badge> : <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>}
                                                    </TableCell>
                                                    {showEditControls && (
                                                        <TableCell className="text-right flex justify-end gap-1">
                                                            {item.status === 'pending' && canApprove && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" onClick={async () => { await approveRequest(item, true, currentUserId); onOrderUpdated?.(); }} className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" title="Aprovar">
                                                                        <Check className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" onClick={async () => { await approveRequest(item, false, currentUserId); onOrderUpdated?.(); }} className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Rejeitar">
                                                                        <Ban className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                            {item.financial_status !== 'paid' && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" onClick={() => onEditItem(item)} className="h-6 w-6 p-0 text-blue-500">
                                                                        <Pencil className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id, item.status)} className="h-6 w-6 p-0 text-red-400">
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {showEditControls && (
                                <div className="pt-4 border-t space-y-3">
                                    <h4 className="font-semibold text-sm text-zinc-700">Adicionar Novo Item ao Lote</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end bg-zinc-50 p-3 rounded border">
                                        <div className="col-span-2 md:col-span-3">
                                            <Label className="text-[10px]">Produto</Label>
                                            <div className="flex items-center gap-1">
                                                <Select
                                                    value={newItemDraft.ingredient_id || 'custom'}
                                                    onValueChange={(val) => {
                                                        if (val === 'custom') setNewItemDraft({ ...newItemDraft, ingredient_id: undefined, item_name: '' });
                                                        else {
                                                            const i = ingredients.find(x => x.id === val);
                                                            setNewItemDraft({ ...newItemDraft, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="custom">Item (obrigatório)</SelectItem>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onNewProduct}><Plus className="h-3 w-3" /></Button>
                                            </div>
                                        </div>
                                        <div className="col-span-1 md:col-span-2">
                                            <Label className="text-[10px]">Unid. Selecionada</Label>
                                            <Select
                                                value={newItemDraft.unit || 'un'}
                                                onValueChange={(val) => setNewItemDraft({ ...newItemDraft, unit: val })}
                                            >
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {(() => {
                                                        const ing = ingredients.find(i => i.id === newItemDraft.ingredient_id);
                                                        if (!ing) return null;
                                                        return (
                                                            <>
                                                                <SelectItem value={ing.unit}>Estoque ({ing.unit})</SelectItem>
                                                                {ing.purchase_unit && ing.purchase_unit !== ing.unit && <SelectItem value={ing.purchase_unit}>Compra ({ing.purchase_unit})</SelectItem>}
                                                            </>
                                                        );
                                                    })()}
                                                    {!ingredients.find(i => i.id === newItemDraft.ingredient_id) && ["un", "kg", "g", "l", "ml", "cx"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-1 md:col-span-1">
                                            <Label className="text-[10px]">Destino</Label>
                                            <Select value={newItemDraft.destination} onValueChange={(val: any) => setNewItemDraft({ ...newItemDraft, destination: val })}>
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="danilo">Danilo</SelectItem>
                                                    <SelectItem value="adriel">Adriel</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2 md:col-span-2">
                                            <Label className="text-[10px]">Obs/Marca</Label>
                                            <Input className="h-8" value={newItemDraft.item_name} onChange={e => setNewItemDraft({ ...newItemDraft, item_name: e.target.value })} />
                                        </div>
                                        <div className="col-span-1 md:col-span-1">
                                            <Label className="text-[10px]">Qtd</Label>
                                            <Input className="h-8" type="number" value={newItemDraft.quantity || ''} onChange={e => setNewItemDraft({ ...newItemDraft, quantity: Number(e.target.value) })} />
                                        </div>
                                        <div className="col-span-1 md:col-span-2">
                                            <Label className="text-[10px]">Total (R$)</Label>
                                            <Input className="h-8" type="number" value={newItemDraft.cost || ''} onChange={e => setNewItemDraft({ ...newItemDraft, cost: Number(e.target.value) })} />
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <Button onClick={handleAddItem} disabled={isAddingItem} size="sm" className="h-8 w-full md:w-8 px-2 md:p-0" title="Adicionar ao lote">
                                                {isAddingItem ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <Plus className="h-4 w-4 mx-auto" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}

                <DialogFooter className="sm:justify-between gap-2 flex-wrap border-t p-4">
                    <div className="flex gap-2 order-2 sm:order-1">
                        {order && order.requests?.some((r: any) => r.status === 'pending') && !isReadOnly && canApprove && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        if (confirm("Aprovar TODOS os itens pendentes?")) {
                                            await batchApproveRequests(order.requests, true, currentUserId);
                                            onOrderUpdated?.();
                                            onOpenChange(false);
                                        }
                                    }}
                                    className="text-green-600 border-green-200 hover:bg-green-50"
                                >
                                    <Check className="mr-2 h-4 w-4" /> Aprovar Todos
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        if (confirm("Reprovar TODOS os itens pendentes?")) {
                                            await batchApproveRequests(order.requests, false, currentUserId);
                                            onOrderUpdated?.();
                                            onOpenChange(false);
                                        }
                                    }}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    <Ban className="mr-2 h-4 w-4" /> Reprovar Todos
                                </Button>
                            </>
                        )}

                        {/* Creator Action: Finish Editing when Edit Approved */}
                        {isEditApproved && (order.created_by === currentUserId || isAdmin) && (
                            <Button
                                variant="default"
                                onClick={async () => {
                                    if (confirm("Finalizar edição? O pedido voltará para o ciclo de aprovação.")) {
                                        await reprocessOrderToPending(order.id);
                                        onOrderUpdated?.();
                                        onOpenChange(false);
                                    }
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Save className="mr-2 h-4 w-4" /> Finalizar Edição
                            </Button>
                        )}

                        {/* Approver Actions for Edit Request */}
                        {isEditRequested && canApprove && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        await updateOrderStatus(order.id, 'edit_approved');
                                        onOrderUpdated?.();
                                    }}
                                    className="text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Check className="mr-2 h-4 w-4" /> Permitir Edição
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        await updateOrderStatus(order.id, 'approved'); // Revert to approved (locked)
                                        onOrderUpdated?.();
                                    }}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    <Ban className="mr-2 h-4 w-4" /> Negar
                                </Button>
                            </>
                        )}

                        {/* Edit Request Flow for Creator or Admin */}
                        {isLocked && !isEditRequested && (order.created_by === currentUserId || isAdmin) && (
                            <Button
                                variant="outline"
                                className="border-indigo-200 text-indigo-700 bg-indigo-50"
                                onClick={async () => {
                                    if (confirm("Solicitar edição deste pedido? Ele voltará para análise.")) {
                                        await updateOrderStatus(order.id, 'edit_requested');
                                        onOrderUpdated?.();
                                    }
                                }}
                            >
                                <Pencil className="mr-2 h-4 w-4" /> Solicitar Edição
                            </Button>
                        )}

                    </div>

                    <div className="flex gap-2 order-1 sm:order-2">
                        {order && !isReadOnly && !isLocked && (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    const hasPaid = order.requests?.some((r: any) => r.financial_status === 'paid');
                                    if (hasPaid) {
                                        alert("Não é possível excluir este pedido pois existem itens com pagamentos lançados no financeiro (status 'Pago'). É necessário estornar antes.");
                                        return;
                                    }
                                    if (confirm("Tem certeza que deseja EXCLUIR este LOTE inteiro? Todos os itens serão removidos.")) {
                                        const reason = prompt("Digite o motivo da exclusão:");
                                        if (reason) onDeleteOrder(order.id, reason, currentUserId);
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir Lote
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                    </div>
                </DialogFooter>
                <StockConsultationDialog
                    isOpen={isConsultOpen}
                    onOpenChange={setIsConsultOpen}
                />
            </DialogContent>
        </Dialog>
    );
}
