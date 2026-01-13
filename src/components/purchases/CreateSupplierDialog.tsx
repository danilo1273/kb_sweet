
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateSupplierDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    supplierName: string;
    onSupplierNameChange: (name: string) => void;
    onSave: () => void;
}

export function CreateSupplierDialog({
    isOpen,
    onOpenChange,
    supplierName,
    onSupplierNameChange,
    onSave
}: CreateSupplierDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Novo Fornecedor</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <Label>Nome do Fornecedor</Label>
                    <Input value={supplierName} onChange={(e) => onSupplierNameChange(e.target.value)} placeholder="Digite o nome..." />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onSave} disabled={!supplierName.trim()}>Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
