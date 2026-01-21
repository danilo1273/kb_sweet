
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

interface QuickProductDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    newProduct: any;
    onNewProductChange: (product: any) => void;
    availableCategories: any[];
    availableUnits: string[];
    onManageCategories: () => void;
    onManageUnits: () => void;
    onSave: () => void;
}

export function QuickProductDialog({
    isOpen,
    onOpenChange,
    newProduct,
    onNewProductChange,
    availableCategories,
    availableUnits,
    onManageCategories,
    onManageUnits,
    onSave
}: QuickProductDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="overflow-visible">
                <DialogHeader><DialogTitle>Cadastrar Novo Produto</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Nome do Produto</Label>
                        <Input value={newProduct.name || ''} onChange={e => onNewProductChange({ ...newProduct, name: e.target.value })} placeholder="Ex: Fita de Cetim" />
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo de Produto</Label>
                        <div className="flex gap-4">
                            <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                                <input
                                    type="radio"
                                    name="productType"
                                    value="stock"
                                    checked={newProduct.type === 'stock' || !newProduct.type}
                                    onChange={() => onNewProductChange({ ...newProduct, type: 'stock' })}
                                    className="text-blue-600"
                                />
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">Estoque</span>
                                    <span className="text-[10px] text-zinc-500">Controla quantidade e custos.</span>
                                </div>
                            </label>
                            <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                                <input
                                    type="radio"
                                    name="productType"
                                    value="expense"
                                    checked={newProduct.type === 'expense'}
                                    onChange={() => onNewProductChange({ ...newProduct, type: 'expense', unit_weight: 1, unit_type: '' })}
                                    className="text-blue-600"
                                />
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">Despesa</span>
                                    <span className="text-[10px] text-zinc-500">Apenas registro financeiro.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <div className="flex gap-2">
                                <Select
                                    value={newProduct.category}
                                    onValueChange={(val) => onNewProductChange({ ...newProduct, category: val })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCategories
                                            .filter(c => c.type === (newProduct.type || 'stock'))
                                            .map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)
                                        }
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={onManageCategories}
                                    title="Nova Categoria"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Unidade Principal</Label>
                            <div className="flex gap-2">
                                <Select
                                    value={newProduct.unit}
                                    onValueChange={(val) => onNewProductChange({ ...newProduct, unit: val })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableUnits.map(u => <SelectItem key={u} value={u}>{u.toUpperCase()}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={onManageUnits}
                                    title="Nova Unidade"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {(!newProduct.type || newProduct.type === 'stock') && (
                        <div className="border rounded-md p-3 bg-zinc-50 space-y-3">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="new-prod-conversion"
                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                    checked={!!newProduct.unit_type}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            onNewProductChange({ ...newProduct, unit_weight: 0, unit_type: 'g' });
                                        } else {
                                            onNewProductChange({ ...newProduct, unit_weight: 1, unit_type: '' });
                                        }
                                    }}
                                />
                                <Label htmlFor="new-prod-conversion" className="text-sm font-medium cursor-pointer">
                                    Habilitar conversão secundária (Receita)
                                </Label>
                            </div>

                            {(!!newProduct.unit_type) && (
                                <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="col-span-1 space-y-1">
                                        <Label className="text-[10px]">Unid. Secundária</Label>
                                        <Input
                                            list="new-prod-sec-units"
                                            value={newProduct.unit_type || ''}
                                            onChange={(e) => onNewProductChange({ ...newProduct, unit_type: e.target.value })}
                                            className="h-8 text-xs"
                                            placeholder="g, ml..."
                                        />
                                        <datalist id="new-prod-sec-units">
                                            <option value="g" />
                                            <option value="ml" />
                                            <option value="fatias" />
                                            <option value="un" />
                                        </datalist>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-[10px]">Fator de Conversão</Label>
                                        <Input
                                            type="number"
                                            value={newProduct.unit_weight || ''}
                                            onChange={(e) => onNewProductChange({ ...newProduct, unit_weight: Number(e.target.value) })}
                                            className="h-8 text-xs"
                                            placeholder="Ex: 395"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-[11px] text-zinc-500 bg-white p-2 border rounded text-center italic">
                                            "1 <strong>{newProduct.unit || '...'}</strong> equivale a <strong>{newProduct.unit_weight || '?'} {newProduct.unit_type || '...'}</strong>"
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onSave} disabled={!newProduct.name}>Criar Produto</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
