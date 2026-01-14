
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BankAccount } from "@/types";

interface BatchPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (date: string, bankAccountId: string | null) => void;
    totalAmount: number;
    count: number;
    type: 'pay' | 'receive';
    accounts: BankAccount[];
    loading?: boolean;
}

export function BatchPaymentDialog({
    open,
    onOpenChange,
    onConfirm,
    totalAmount,
    count,
    type,
    accounts,
    loading = false
}: BatchPaymentDialogProps) {
    const [date, setDate] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>('');

    useEffect(() => {
        if (open) {
            setDate(new Date().toISOString().split('T')[0]);
            setSelectedAccount('');
        }
    }, [open]);

    const handleConfirm = () => {
        onConfirm(date, selectedAccount || null);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{type === 'pay' ? 'Baixa em Lote' : 'Recebimento em Lote'}</DialogTitle>
                    <DialogDescription>
                        Confirma a baixa de <strong>{count}</strong> itens totalizando <strong>R$ {totalAmount.toFixed(2)}</strong>?
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="batch-date" className="text-right">
                            Data
                        </Label>
                        <Input
                            id="batch-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="batch-account" className="text-right">
                            Conta
                        </Label>
                        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Selecione a conta (Opcional)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">-- Sem conta específica --</SelectItem>
                                {accounts.map((acc) => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm} disabled={loading} className={type === 'pay' ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}>
                        {loading ? 'Processando...' : 'Confirmar Baixa'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
