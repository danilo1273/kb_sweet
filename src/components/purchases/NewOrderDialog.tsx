import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { Ingredient, Supplier, ItemDraft } from "@/types";
import { useToast } from "@/components/ui/use-toast";

interface NewOrderDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    suppliers: Supplier[];
    ingredients: Ingredient[];
    onNewSupplier: () => void;
    onNewProduct: () => void;
    onCreate: (nickname: string, supplierId: string, items: ItemDraft[]) => Promise<boolean | void>;
}

export function NewOrderDialog({
    isOpen,
    onOpenChange,
    suppliers,
    ingredients,
    onNewSupplier,
    onNewProduct,
    onCreate
}: NewOrderDialogProps) {
    const { toast } = useToast();
    const [nickname, setNickname] = useState("");
    const [supplierId, setSupplierId] = useState<string>("default");
    const [orderItems, setOrderItems] = useState<ItemDraft[]>([]);
    const [draftItem, setDraftItem] = useState<ItemDraft>({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });
    const [isSaving, setIsSaving] = useState(false);

    // Editing State
    const [editIndex, setEditIndex] = useState<number>(-1);

    const [unitCost, setUnitCost] = useState<number>(0);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setNickname("");
            setSupplierId("default");
            setOrderItems([]);
            setDraftItem({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo', ingredient_id: undefined });
            setEditIndex(-1);
            setUnitCost(0);
        }
    }, [isOpen]);

    const handleAddItem = () => {
        if (!draftItem.item_name && !draftItem.ingredient_id) return;
        let finalName = draftItem.item_name;
        if (draftItem.ingredient_id && !finalName) {
            const ing = ingredients.find(i => i.id === draftItem.ingredient_id);
            finalName = ing?.name || 'Unknown';
        }

        const payload = { ...draftItem, item_name: finalName };

        if (editIndex >= 0) {
            // Update Existing
            const newItems = [...orderItems];
            newItems[editIndex] = payload;
            setOrderItems(newItems);
            setEditIndex(-1);
            toast({ title: "Item atualizado" });
        } else {
            // Add New
            setOrderItems([...orderItems, payload]);
        }

        // Reset Draft
        setDraftItem({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo', ingredient_id: undefined });
        setUnitCost(0);
    };

    const handleEditItem = (index: number) => {
        const item = orderItems[index];
        setDraftItem({ ...item });
        setEditIndex(index);

        // Calculate unit cost
        if (item.quantity > 0) {
            setUnitCost(Number((item.cost / item.quantity).toFixed(4)));
        } else {
            setUnitCost(0);
        }
    };

    const handleCancelEdit = () => {
        setEditIndex(-1);
        setDraftItem({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo', ingredient_id: undefined });
        setUnitCost(0);
    };

    const handleRemoveItem = (index: number) => {
        if (index === editIndex) handleCancelEdit();
        const newItems = [...orderItems];
        newItems.splice(index, 1);
        setOrderItems(newItems);
    };

    // Calculation Handlers
    const onQtyChange = (val: number) => {
        const total = val * unitCost;
        setDraftItem({ ...draftItem, quantity: val, cost: Number(total.toFixed(2)) });
    };

    const onUnitCostChange = (val: number) => {
        setUnitCost(val);
        const total = draftItem.quantity * val;
        setDraftItem({ ...draftItem, cost: Number(total.toFixed(2)) });
    };

    const onTotalCostChange = (val: number) => {
        setDraftItem({ ...draftItem, cost: val });
        if (draftItem.quantity > 0) {
            setUnitCost(Number((val / draftItem.quantity).toFixed(4)));
        }
    };

    const handleSave = async () => {
        if (supplierId === 'default') {
            toast({
                variant: "destructive",
                title: "Fornecedor Inválido",
                description: "Por favor, escolha um fornecedor para continuar."
            });
            return;
        }
        setIsSaving(true);
        const success = await onCreate(nickname, supplierId, orderItems);
        setIsSaving(false);
        if (success) {
            setNickname("");
            setOrderItems([]);
            setSupplierId("default");
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Novo Pedido de Compra (Lote)</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Apelido do Lote</Label>
                            <Input placeholder="Ex: Compras Semanais" value={nickname} onChange={e => setNickname(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Fornecedor</Label>
                            <div className="flex gap-2">
                                <Select value={supplierId} onValueChange={setSupplierId}>
                                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">Escolha o Fornecedor</SelectItem>
                                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" size="icon" onClick={onNewSupplier}><Plus className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </div>

                    <div className={`border rounded-md p-3 space-y-3 transition-colors ${editIndex >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50'}`}>
                        <div className="flex justify-between items-center">
                            <h4 className={`font-semibold text-sm ${editIndex >= 0 ? 'text-amber-700' : ''}`}>
                                {editIndex >= 0 ? 'Editando Item' : 'Adicionar Item'}
                            </h4>
                            {editIndex >= 0 && (
                                <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="h-6 px-2 text-amber-700 hover:text-amber-800 hover:bg-amber-100">
                                    <X className="h-3 w-3 mr-1" /> Cancelar
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-2 items-end">
                            <div className="space-y-1 col-span-2 md:col-span-3">
                                <Label className="text-xs md:text-[10px]">Produto</Label>
                                <div className="flex gap-1">
                                    <Select value={draftItem.ingredient_id || 'custom'} onValueChange={(val) => {
                                        if (val === 'custom') setDraftItem({ ...draftItem, ingredient_id: undefined, item_name: '' });
                                        else {
                                            const i = ingredients.find(x => x.id === val);
                                            setDraftItem({ ...draftItem, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                        }
                                    }}>
                                        <SelectTrigger className="h-9 md:h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="custom">Escolha o produto</SelectItem>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button size="icon" variant="ghost" className="h-9 w-9 md:h-8 md:w-8" onClick={onNewProduct}><Plus className="h-4 w-4 md:h-3 md:w-3" /></Button>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-1 md:col-span-2">
                                <Label className="text-xs md:text-[10px]">Qtd</Label>
                                <div className="flex items-center gap-1">
                                    <Input className="h-9 md:h-8" type="number" value={draftItem.quantity || ''} onChange={e => onQtyChange(Number(e.target.value))} />
                                    <span className="text-xs text-zinc-500 font-medium w-6">{draftItem.unit}</span>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-1 md:col-span-2">
                                <Label className="text-xs md:text-[10px]">Vlr. Unit R$</Label>
                                <Input className="h-9 md:h-8" type="number" value={unitCost || ''} onChange={e => onUnitCostChange(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1 col-span-1 md:col-span-2">
                                <Label className="text-xs md:text-[10px]">Total R$</Label>
                                <Input className="h-9 md:h-8" type="number" value={draftItem.cost || ''} onChange={e => onTotalCostChange(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1 col-span-1 md:col-span-2">
                                <Label className="text-xs md:text-[10px]">Destino</Label>
                                <Select value={draftItem.destination} onValueChange={(val: any) => setDraftItem({ ...draftItem, destination: val })}>
                                    <SelectTrigger className="h-9 md:h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="danilo">Danilo</SelectItem>
                                        <SelectItem value="adriel">Adriel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1 col-span-2 md:col-span-1 pt-2 md:pt-0">
                                <Button
                                    onClick={handleAddItem}
                                    className={`h-9 md:h-8 w-full ${editIndex >= 0 ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                                    variant={editIndex >= 0 ? 'default' : 'secondary'}
                                    title={editIndex >= 0 ? "Atualizar" : "Adicionar"}
                                >
                                    {editIndex >= 0 ? <span className="flex items-center gap-2"><Save className="h-3 w-3" /> <span className="md:hidden">Salvar Edição</span></span> : <span className="flex items-center gap-2"><Plus className="h-3 w-3" /> <span className="md:hidden">Adicionar Item</span></span>}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[200px] overflow-auto border bg-white rounded">
                        <Table>
                            <TableBody>
                                {orderItems.map((i, x) => (
                                    <TableRow key={x} className={editIndex === x ? 'bg-amber-50' : ''}>
                                        <TableCell className="py-2">{i.item_name}</TableCell>
                                        <TableCell className="py-2 text-right">{i.quantity} {i.unit}</TableCell>
                                        <TableCell className="py-2 text-right">R$ {Number(i.cost / (i.quantity || 1)).toFixed(2)} un</TableCell>
                                        <TableCell className="py-2 text-right font-bold">R$ {Number(i.cost).toFixed(2)}</TableCell>
                                        <TableCell className="py-2 text-right">
                                            <span className="text-[10px] text-zinc-500 uppercase mr-2 border px-1 rounded">{i.destination}</span>
                                        </TableCell>
                                        <TableCell className="py-2 text-right flex justify-end gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => handleEditItem(x)} className="h-6 w-6 p-0 text-blue-500"><Pencil className="h-3 w-3" /></Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(x)} className="h-6 w-6 p-0 text-red-400"><Trash2 className="h-3 w-3" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isSaving || orderItems.length === 0}>Criar Lote de Compra</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
