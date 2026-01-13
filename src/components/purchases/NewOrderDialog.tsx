import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { Ingredient, Supplier, ItemDraft } from "@/types";

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
    const [nickname, setNickname] = useState("");
    const [supplierId, setSupplierId] = useState<string>("default");
    const [orderItems, setOrderItems] = useState<ItemDraft[]>([]);
    const [draftItem, setDraftItem] = useState<ItemDraft>({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo' });
    const [isSaving, setIsSaving] = useState(false);

    const handleAddItem = () => {
        if (!draftItem.item_name && !draftItem.ingredient_id) return;
        let finalName = draftItem.item_name;
        if (draftItem.ingredient_id && !finalName) {
            const ing = ingredients.find(i => i.id === draftItem.ingredient_id);
            finalName = ing?.name || 'Unknown';
        }
        setOrderItems([...orderItems, { ...draftItem, item_name: finalName }]);
        setDraftItem({ item_name: '', quantity: 0, unit: 'un', cost: 0, destination: 'danilo', ingredient_id: undefined });
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...orderItems];
        newItems.splice(index, 1);
        setOrderItems(newItems);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const success = await onCreate(nickname, supplierId, orderItems);
        setIsSaving(false);
        if (success) {
            // Reset form
            setNickname("");
            setOrderItems([]);
            setSupplierId("default");
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                                        <SelectItem value="default">Vários Fornecedores</SelectItem>
                                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" size="icon" onClick={onNewSupplier}><Plus className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </div>

                    <div className="border rounded-md p-3 bg-zinc-50 space-y-3">
                        <h4 className="font-semibold text-sm">Adicionar Item</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Produto</Label>
                                <div className="flex gap-1">
                                    <Select value={draftItem.ingredient_id || 'custom'} onValueChange={(val) => {
                                        if (val === 'custom') setDraftItem({ ...draftItem, ingredient_id: undefined, item_name: '' });
                                        else {
                                            const i = ingredients.find(x => x.id === val);
                                            setDraftItem({ ...draftItem, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                                        }
                                    }}>
                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="custom">Manual...</SelectItem>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onNewProduct}><Plus className="h-3 w-3" /></Button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Qtd</Label>
                                <Input className="h-8" type="number" value={draftItem.quantity || ''} onChange={e => setDraftItem({ ...draftItem, quantity: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Custo Total R$</Label>
                                <Input className="h-8" type="number" value={draftItem.cost || ''} onChange={e => setDraftItem({ ...draftItem, cost: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-1 flex items-end">
                                <Button onClick={handleAddItem} className="h-8 w-full" variant="secondary"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[200px] overflow-auto border bg-white rounded">
                        <Table>
                            <TableBody>
                                {orderItems.map((i, x) => (
                                    <TableRow key={x}>
                                        <TableCell className="py-2">{i.item_name}</TableCell>
                                        <TableCell className="py-2 text-right">{i.quantity} {i.unit}</TableCell>
                                        <TableCell className="py-2 text-right">R$ {Number(i.cost).toFixed(2)}</TableCell>
                                        <TableCell className="py-2 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(x)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
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
