import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useBanking } from "@/hooks/useBanking"; // Assuming hooks are shared or we can clean import
import { Building2, Calendar } from "lucide-react";

interface PaymentConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (bankAccountId: string, date: string) => Promise<void>;
    amount?: number;
    type: 'income' | 'expense';
    count?: number; // If > 1, it's a bulk action
}

export function PaymentConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    amount,
    type,
    count = 1
}: PaymentConfirmationDialogProps) {
    const { accounts, fetchAccounts } = useBanking();
    const [selectedAccount, setSelectedAccount] = useState<string>("");
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchAccounts();
            setDate(new Date().toISOString().split('T')[0]);
            // setSelectedAccount(""); // Don't reset if we want persistent experience, or reset if we want clean state. 
            // Request: "Pre-filled". Let's reset but then immediately fill from accounts if available logic is added.
            // Actually, better to reset but allow effect below to fill it.
            setSelectedAccount("");
        }
    }, [isOpen]);

    // Auto-select first account when accounts load
    useEffect(() => {
        if (isOpen && accounts.length > 0 && !selectedAccount) {
            setSelectedAccount(accounts[0].id);
        }
    }, [accounts, isOpen, selectedAccount]);

    const handleConfirm = async () => {
        if (!selectedAccount || !date) return;
        setIsLoading(true);
        try {
            await onConfirm(selectedAccount, date);
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    const isBulk = count > 1;
    const title = isBulk
        ? `Confirmar ${type === 'expense' ? 'Pagamento' : 'Recebimento'} em Lote`
        : `Confirmar ${type === 'expense' ? 'Pagamento' : 'Recebimento'}`;

    const description = isBulk
        ? `Você está prestes a baixar ${count} lançamentos. Selecione a conta bancária e a data para registrar essa movimentação.`
        : `Confirme os dados para registrar a baixa deste lançamento no valor de ${amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="bank-account">Conta Bancária</Label>
                        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger id="bank-account">
                                <SelectValue placeholder="Selecione a conta..." />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map((acc) => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 opacity-50" />
                                            <span>{acc.name}</span>
                                            <span className="text-zinc-400 text-xs">
                                                ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.calculated_balance)})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="date">Data do Pagamento</Label>
                        <div className="relative">
                            <Input
                                id="date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedAccount || isLoading}
                        className={type === 'expense' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                    >
                        {isLoading ? 'Processando...' : 'Confirmar Baixa'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
