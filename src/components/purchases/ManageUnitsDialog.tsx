
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";

interface ManageUnitsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    newUnitName: string;
    onNewUnitNameChange: (name: string) => void;
    onAddUnit: () => void;
    availableUnits: string[];
    onDeleteUnit: (unit: string) => void;
}

export function ManageUnitsDialog({
    isOpen,
    onOpenChange,
    newUnitName,
    onNewUnitNameChange,
    onAddUnit,
    availableUnits,
    onDeleteUnit
}: ManageUnitsDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Gerenciar Unidades</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nova Unidade (Ex: barra)"
                            value={newUnitName}
                            onChange={e => onNewUnitNameChange(e.target.value.toLowerCase())}
                        />
                        <Button onClick={onAddUnit}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
                        {availableUnits.map(u => (
                            <div key={u} className="flex justify-between items-center bg-zinc-50 p-2 rounded text-sm">
                                <span>{u}</span>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => onDeleteUnit(u)}>
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
