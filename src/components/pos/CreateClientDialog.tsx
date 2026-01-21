import { useState } from "react";
import { supabase } from "@/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface CreateClientDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onClientCreated: (client: any) => void;
}

export function CreateClientDialog({ isOpen, onOpenChange, onClientCreated }: CreateClientDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [document, setDocument] = useState("");
    const [email, setEmail] = useState("");

    const handleSave = async () => {
        if (!name.trim()) {
            toast({ variant: "destructive", title: "Nome obrigatório", description: "Por favor, informe o nome do cliente." });
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('clients')
                .insert([{
                    name: name.trim(),
                    phone: phone.trim() || null,
                    document: document.trim() || null,
                    email: email.trim() || null
                }])
                .select()
                .single();

            if (error) throw error;

            toast({ title: "Cliente cadastrado!" });
            onClientCreated(data);
            handleClose();

        } catch (e: any) {
            toast({ variant: "destructive", title: "Erro ao cadastrar", description: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setName("");
        setPhone("");
        setDocument("");
        setEmail("");
        onOpenChange(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Novo Cliente Rápido</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Nome Completo *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Maria Silva" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
                        </div>
                        <div className="space-y-2">
                            <Label>CPF/CNPJ</Label>
                            <Input value={document} onChange={e => setDocument(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Cadastrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
