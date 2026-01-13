
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

interface ManageCategoriesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    newCategoryName: string;
    onNewCategoryNameChange: (name: string) => void;
    newCategoryType: string;
    onNewCategoryTypeChange: (type: string) => void;
    onAddCategory: () => void;
    availableCategories: any[];
    onDeleteCategory: (name: string) => void;
}

export function ManageCategoriesDialog({
    isOpen,
    onOpenChange,
    newCategoryName,
    onNewCategoryNameChange,
    newCategoryType,
    onNewCategoryTypeChange,
    onAddCategory,
    availableCategories,
    onDeleteCategory
}: ManageCategoriesDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Gerenciar Categorias</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-3 p-3 bg-zinc-50 rounded border">
                        <Label>Adicionar Nova</Label>
                        <Input
                            placeholder="Nome da Categoria"
                            value={newCategoryName}
                            onChange={e => onNewCategoryNameChange(e.target.value)}
                        />
                        <div className="flex gap-4">
                            <label className="flex items-center space-x-2">
                                <input type="radio" checked={newCategoryType === 'stock'} onChange={() => onNewCategoryTypeChange('stock')} className="text-blue-600" />
                                <span className="text-sm">Estoque</span>
                            </label>
                            <label className="flex items-center space-x-2">
                                <input type="radio" checked={newCategoryType === 'expense'} onChange={() => onNewCategoryTypeChange('expense')} className="text-blue-600" />
                                <span className="text-sm">Despesa</span>
                            </label>
                        </div>
                        <Button onClick={onAddCategory} disabled={!newCategoryName} className="w-full">
                            <Plus className="h-4 w-4 mr-2" /> Adicionar Categoria
                        </Button>
                    </div>

                    <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                        <Label className="text-xs text-muted-foreground px-2">Categorias Existentes</Label>
                        {availableCategories.map(c => (
                            <div key={c.name} className="flex justify-between items-center bg-white border p-2 rounded text-sm">
                                <div className="flex flex-col">
                                    <span>{c.name}</span>
                                    <span className={`text-[10px] ${c.type === 'expense' ? 'text-purple-600' : 'text-blue-600'}`}>
                                        {c.type === 'expense' ? 'Despesa' : 'Estoque'}
                                    </span>
                                </div>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => onDeleteCategory(c.name)}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
