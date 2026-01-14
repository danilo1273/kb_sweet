import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Save, Check, Ban, Loader2 } from "lucide-react";
import { usePurchases } from "@/hooks/usePurchases";
import { useToast } from "@/components/ui/use-toast";
import { ItemDraft } from "@/types";

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
    onDeleteOrder: (id: string) => void;
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
    onDeleteOrder
}: ManageOrderDialogProps) {
    const { toast } = useToast();
    const { addRequestToOrder, deleteRequestFromOrder, updateOrderHeader, fetchOrders, approveRequest } = usePurchases();

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
        }
    }

    async function handleDeleteItem(itemId: string, status: string) {
        if (status === 'approved' || status === 'edit_approved') {
            if (!confirm("Este item já foi aprovado. Excluir irá reverter o estoque e financeiro. Continuar?")) return;
        } else {
            if (!confirm("Excluir item?")) return;
        }

        const success = await deleteRequestFromOrder(itemId, status);
        if (success) fetchOrders();
    }

    // Effect to sync header state when order opens/changes
    // React.useEffect(() => {
    //     if (order) {
    //         setHeaderNickname(order.nickname);
    //         setHeaderSupplier(order.supplier_id);
    //     }
    // }, [order]);
    // This is tricky if user is typing. Let's do it onOpenChange?
    // Or just use 'key' on the dialog to reset state?
    // The parent controls 'order', so if we save and refetch, 'order' changes.
    // So useEffect is okay if 'order' object reference changes.

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isReadOnly ? 'Visualizar Lote / Pedido' : 'Gerenciar Lote / Pedido'}</DialogTitle>
                </DialogHeader>

                {order && (
                    <div className="py-4 space-y-6">
                        <div className="grid grid-cols-2 gap-4 border-b pb-4">
                            <div className="space-y-2">
                                <Label>Fornecedor</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={headerSupplier}
                                        onValueChange={setHeaderSupplier}
                                        disabled={isReadOnly}
                                    >
                                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">Fornecedor (campo obrigatório)</SelectItem>
                                            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {!isReadOnly && (
                                        <Button variant="outline" size="icon" onClick={onNewSupplier} title="Novo Fornecedor">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Apelido</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={headerNickname}
                                        onChange={e => setHeaderNickname(e.target.value)}
                                        readOnly={isReadOnly}
                                        className={isReadOnly ? "bg-zinc-100" : ""}
                                    />
                                    {!isReadOnly && (
                                        <Button onClick={handleSaveHeader} disabled={isSavingHeader} size="icon" variant="ghost">
                                            {isSavingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="font-semibold text-sm text-zinc-700">Itens neste Lote ({order.requests?.length || 0})</h4>
                            <div className="rounded bg-white overflow-hidden max-h-[300px] overflow-y-auto">
                                {/* Mobile View: Cards */}
                                <div className="md:hidden space-y-2 p-1">
                                    {order.requests?.map((item: any) => (
                                        <div key={item.id} className="p-3 border rounded-md shadow-sm bg-white space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div className="font-medium text-sm w-[60%]">{item.item_name}</div>
                                                <div className="text-right font-bold text-sm w-[40%]">{formatCurrency(Number(item.cost))}</div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-zinc-500">
                                                <span>{item.quantity} {item.unit}</span>
                                                {item.financial_status === 'paid' ?
                                                    <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Pago</Badge>
                                                    : <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>
                                                }
                                            </div>
                                            {!isReadOnly && (
                                                <div className="flex justify-end gap-2 pt-2 border-t mt-1">
                                                    {item.status === 'pending' && (
                                                        <>
                                                            <Button variant="ghost" size="sm" onClick={() => approveRequest(item, true)} className="h-8 w-8 p-0 text-green-600 bg-green-50">
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => approveRequest(item, false)} className="h-8 w-8 p-0 text-red-600 bg-red-50">
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
                                        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qtd</TableHead><TableHead>Custo</TableHead><TableHead>Status</TableHead>{!isReadOnly && <TableHead className="text-right">Ação</TableHead>}</TableRow></TableHeader>
                                        <TableBody>
                                            {order.requests?.map((item: any) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.item_name}</TableCell>
                                                    <TableCell>{item.quantity} {item.unit}</TableCell>
                                                    <TableCell>{formatCurrency(Number(item.cost))}</TableCell>
                                                    <TableCell>
                                                        {item.financial_status === 'paid' ? <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Pago</Badge> : <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>}
                                                    </TableCell>
                                                    {!isReadOnly && (
                                                        <TableCell className="text-right flex justify-end gap-1">
                                                            {item.status === 'pending' && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" onClick={() => approveRequest(item, true)} className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" title="Aprovar">
                                                                        <Check className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" onClick={() => approveRequest(item, false)} className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Rejeitar">
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
                        </div>



                        {!isReadOnly && (
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
                                                    if (!ing) return <SelectItem value="un">un</SelectItem>;
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
                                    <div className="col-span-1 md:col-span-2">
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
                )}


                <DialogFooter className="sm:justify-between">
                    {order && !isReadOnly && (
                        <div className="flex gap-2">
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    const hasPaid = order.requests?.some((r: any) => r.financial_status === 'paid');
                                    if (hasPaid) {
                                        alert("Não é possível excluir este pedido pois existem itens com pagamentos lançados no financeiro (status 'Pago'). É necessário estornar antes.");
                                        return;
                                    }
                                    if (confirm("Tem certeza que deseja EXCLUIR este LOTE inteiro? Todos os itens serão removidos.")) {
                                        onDeleteOrder(order.id);
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir Lote
                            </Button>
                        </div>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                </DialogFooter>
            </DialogContent >
        </Dialog >
    );
}
