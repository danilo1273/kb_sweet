
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditItemDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    editingItem: any;
    editedValues: any;
    onEditedValuesChange: (values: any) => void;
    ingredients: any[];
    availableUnits: string[];
    onSave: () => void;
}

export function EditItemDialog({
    isOpen,
    onOpenChange,
    editingItem,
    editedValues,
    onEditedValuesChange,
    ingredients,
    availableUnits,
    onSave
}: EditItemDialogProps) {
    if (!editingItem) return null;

    const selectedIng = ingredients.find(i => i.id === editedValues.ingredient_id);
    const isExpense = selectedIng?.type === 'expense';

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Editar Item</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Nome / Marca</Label>
                        <Label>Item (Estoque)</Label>
                        <Select value={editedValues.ingredient_id || 'custom'} onValueChange={(val) => {
                            if (val !== 'custom') {
                                const i = ingredients.find(x => x.id === val);
                                onEditedValuesChange({ ...editedValues, ingredient_id: val, item_name: i?.name || '', unit: i?.unit || 'un' });
                            }
                        }}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o produto..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="custom" disabled>Selecione um produto da lista</SelectItem>
                                {ingredients.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Unidade</Label>
                            <Select value={editedValues.unit} onValueChange={(v) => onEditedValuesChange({ ...editedValues, unit: v })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableUnits.map(u => (
                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Quantidade</Label>
                            <Input
                                type="number"
                                value={editedValues.quantity || ''}
                                onChange={(e) => {
                                    const qty = Number(e.target.value);
                                    const unitCost = editedValues.unit_cost || (editedValues.cost && editedValues.quantity ? editedValues.cost / editedValues.quantity : 0);
                                    onEditedValuesChange({
                                        ...editedValues,
                                        quantity: qty,
                                        cost: unitCost * qty
                                    });
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Custo Unit. R$</Label>
                            <Input
                                type="number"
                                value={editedValues.unit_cost !== undefined ? editedValues.unit_cost : (editedValues.cost && editedValues.quantity ? (editedValues.cost / editedValues.quantity).toFixed(2) : '')}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const qty = editedValues.quantity || 0;
                                    onEditedValuesChange({
                                        ...editedValues,
                                        unit_cost: val,
                                        cost: val * qty
                                    });
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Custo Total R$</Label>
                            <Input
                                type="number"
                                value={editedValues.cost || ''}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const qty = editedValues.quantity || 0;
                                    onEditedValuesChange({
                                        ...editedValues,
                                        cost: val,
                                        unit_cost: qty > 0 ? val / qty : 0
                                    });
                                }}
                            />
                        </div>
                    </div>
                    {!isExpense && (
                        <div className="space-y-2">
                            <Label>Estoque de Destino (Para onde vai?)</Label>
                            <Select value={editedValues.destination} onValueChange={(v: any) => onEditedValuesChange({ ...editedValues, destination: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="danilo">Danilo</SelectItem>
                                    <SelectItem value="adriel">Adriel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {editingItem.status === 'edit_approved' && (
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                            <strong>Atenção:</strong> Ao salvar, o estoque será revertido e o item voltará para aprovação.
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onSave}>Salvar Alterações</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
