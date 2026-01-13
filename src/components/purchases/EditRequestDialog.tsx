
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditRequestDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    reason: string;
    onReasonChange: (reason: string) => void;
    onSubmit: () => void;
}

export function EditRequestDialog({
    isOpen,
    onOpenChange,
    reason,
    onReasonChange,
    onSubmit
}: EditRequestDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Solicitar Edição</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <Label>Motivo da alteração</Label>
                    <Textarea
                        placeholder="Descreva por que este item precisa ser alterado..."
                        value={reason}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onReasonChange(e.target.value)}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onSubmit} disabled={!reason.trim()}>Enviar Solicitação</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
