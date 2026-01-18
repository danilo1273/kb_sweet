import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Settings } from "lucide-react";
import { PixKeyManagerDialog, PixKey } from "@/components/settings/PixKeyManagerDialog";
import { supabase } from "@/supabaseClient";

export interface ChargeItem {
    id: string;
    description: string;
    amount: number;
    date: string;
    originalDescription?: string; // Original text for fallback or tooltip
}

interface WhatsAppChargeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        clientName: string;
        phone: string;
        pixKey?: string; // Optional pre-filled pix key
        items?: ChargeItem[]; // New supported format
        // Legacy fallback
        amount?: number;
        itemsDescription?: string;
        dueDate?: string;
    };
}

export function WhatsAppChargeDialog({ isOpen, onClose, data }: WhatsAppChargeDialogProps) {
    const { toast } = useToast();
    const [message, setMessage] = useState("");
    const [pixKey, setPixKey] = useState("");
    const [customPhone, setCustomPhone] = useState("");

    // Selection State
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

    // Pix Keys State
    const [availableKeys, setAvailableKeys] = useState<PixKey[]>([]);
    const [isManagerOpen, setIsManagerOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchKeys();
        }
    }, [isOpen]);

    const fetchKeys = async () => {
        const { data } = await supabase.from('pix_keys').select('*').order('is_default', { ascending: false });
        if (data) {
            setAvailableKeys(data as PixKey[]);
            // If data.pixKey is provided, use it. Else use default.
            if (data && data.length > 0) {
                const defaultKey = data.find((k: any) => k.is_default);
                // If prop provided key matches one in list, fine. If not, use prop or default.
                // Actually logic: If prop provided, use it (custom). BUT user wants to select.
                // Strategy: If prop provided, set it. If empty, set default.
                // Since we normally pass empty string from parents unless stored, we can default to DB default.
                if (!propsData.pixKey && defaultKey) {
                    setPixKey(defaultKey.key);
                }
            }
        }
    };

    const handleKeyChange = (val: string) => {
        setPixKey(val);
    };

    const propsData = data; // Alias for closure access if needed logic refactor

    useEffect(() => {
        if (isOpen) {
            setCustomPhone(data.phone || "");
            setPixKey(data.pixKey || "");

            // Initialize selection (Select All by default)
            if (data.items && data.items.length > 0) {
                setSelectedItemIds(data.items.map(i => i.id));
            } else {
                setSelectedItemIds([]);
            }
        }
    }, [isOpen, data]);

    // Re-generate message when selection or pix key changes
    useEffect(() => {
        if (!isOpen) return;

        const greeting = getGreeting();
        let totalVal = 0;
        let itemsListText = "";

        if (data.items && data.items.length > 0) {
            // Use selected items
            const selected = data.items.filter(i => selectedItemIds.includes(i.id));
            totalVal = selected.reduce((acc, curr) => acc + curr.amount, 0);

            if (selected.length > 0) {
                itemsListText = selected.map(i => {
                    const dateStr = new Date(i.date).toLocaleDateString();
                    const valStr = i.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    return `- ${dateStr} - ${i.description} (${valStr})`;
                }).join('\n');
            }
        } else {
            // Legacy / Single simple item
            totalVal = data.amount || 0;
            itemsListText = data.itemsDescription ? `- ${data.itemsDescription}` : "";
        }

        const valueFormatted = totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Build Message
        let msg = `${greeting} *${data.clientName}*! Tudo bem?\n\n`;
        msg += `Aqui é da *KB Sweet*. Passando para lembrar sobre os débitos pendentes:\n\n`;

        if (itemsListText) {
            msg += `*Resumo do Pedido:*\n${itemsListText}\n\n`;
        }

        msg += `*Valor Total: ${valueFormatted}*\n`;

        // Add Due Date only if simple mode and provided (complex mode dates are in items)
        if (!data.items?.length && data.dueDate) {
            msg += `*Vencimento:* ${new Date(data.dueDate).toLocaleDateString()}\n`;
        }

        msg += `\nSeguem os dados para PIX:\n`;
        msg += `*Chave Pix:* ${pixKey || "[INSERIR CHAVE]"}\n\n`;
        msg += `Qualquer dúvida estou à disposição! Muito obrigado(a)!`;

        setMessage(msg);

    }, [isOpen, data, pixKey, selectedItemIds]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Bom dia";
        if (hour < 18) return "Boa tarde";
        return "Boa noite";
    };

    const handleSend = () => {
        const phone = customPhone.replace(/\D/g, '');

        if (!phone) {
            toast({ variant: 'destructive', title: "Telefone inválido", description: "Informe o número do cliente." });
            return;
        }

        let finalMessage = message;
        if (pixKey && finalMessage.includes("[INSERIR CHAVE]")) {
            finalMessage = finalMessage.replace("[INSERIR CHAVE]", pixKey);
        }

        let targetPhone = phone;
        if (targetPhone.length <= 11) targetPhone = '55' + targetPhone;

        const encodedMsg = encodeURIComponent(finalMessage);
        const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodedMsg}`;
        window.open(whatsappUrl, '_blank');
        onClose();
    };

    const toggleItem = (id: string) => {
        setSelectedItemIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (!data.items) return;
        if (selectedItemIds.length === data.items.length) {
            setSelectedItemIds([]);
        } else {
            setSelectedItemIds(data.items.map(i => i.id));
        }
    };

    const currentTotal = data.items
        ? data.items.filter(i => selectedItemIds.includes(i.id)).reduce((acc, c) => acc + c.amount, 0)
        : (data.amount || 0);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-green-600" />
                        Enviar Cobrança
                    </DialogTitle>
                    <DialogDescription>
                        Selecione os itens e personalize a mensagem.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-2 space-y-4 pr-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input
                                value={customPhone}
                                onChange={(e) => setCustomPhone(e.target.value)}
                                placeholder="DD99999999"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Chave Pix</Label>
                            <div className="flex gap-2">
                                <Select value={pixKey} onValueChange={handleKeyChange}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Selecione ou digite..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">Digitar Manualmente</SelectItem>
                                        {availableKeys.map(k => (
                                            <SelectItem key={k.id} value={k.key}>
                                                {k.description} ({k.key})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    title="Gerenciar Chaves"
                                    onClick={() => setIsManagerOpen(true)}
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </div>
                            {(!availableKeys.find(k => k.key === pixKey) || pixKey === '') && (
                                <Input
                                    placeholder="Digite a chave pix manual..."
                                    value={pixKey === 'manual' ? '' : pixKey}
                                    onChange={e => setPixKey(e.target.value)}
                                    className="text-sm font-mono mt-1"
                                />
                            )}
                        </div>
                    </div>

                    <PixKeyManagerDialog
                        isOpen={isManagerOpen}
                        onClose={() => setIsManagerOpen(false)}
                        onKeysChange={() => {
                            fetchKeys();
                        }}
                    />

                    {/* ITEM SELECTION LIST */}
                    {data.items && data.items.length > 0 && (
                        <div className="border rounded-md p-3 space-y-2 bg-zinc-50">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <Label className="font-bold text-zinc-700">Itens Pendentes</Label>
                                <Button variant="link" size="sm" onClick={toggleAll} className="h-auto p-0 text-xs">
                                    {selectedItemIds.length === data.items.length ? "Desmarcar Todos" : "Marcar Todos"}
                                </Button>
                            </div>
                            <ScrollArea className="h-[120px]">
                                <div className="space-y-2 pr-2">
                                    {data.items.map(item => (
                                        <div key={item.id} className="flex items-start space-x-2">
                                            <Checkbox
                                                id={`item-${item.id}`}
                                                checked={selectedItemIds.includes(item.id)}
                                                onCheckedChange={() => toggleItem(item.id)}
                                            />
                                            <div className="grid gap-1.5 leading-none">
                                                <label
                                                    htmlFor={`item-${item.id}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                >
                                                    {item.description}
                                                    <span className="ml-2 font-bold text-zinc-700">
                                                        {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </span>
                                                </label>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {new Date(item.date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                            <div className="pt-2 border-t text-right font-bold text-green-700">
                                Total Selecionado: {currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Prévia da Mensagem</Label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="h-[150px] font-mono text-xs"
                        />
                    </div>
                </div>

                <DialogFooter className="shrink-0 gap-2 sm:justify-between">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSend} className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Enviar WhatsApp
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
