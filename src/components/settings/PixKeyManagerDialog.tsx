import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Star, Copy, Check } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface PixKey {
    id: string;
    key: string;
    key_type: 'cpf' | 'cnp' | 'email' | 'phone' | 'random';
    description: string;
    is_default: boolean;
}

interface PixKeyManagerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onKeysChange?: () => void;
}

export function PixKeyManagerDialog({ isOpen, onClose, onKeysChange }: PixKeyManagerDialogProps) {
    const [keys, setKeys] = useState<PixKey[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const { toast } = useToast();

    // New Key State
    const [newKey, setNewKey] = useState("");
    const [newKeyType, setNewKeyType] = useState<PixKey['key_type']>("email");
    const [newKeyDesc, setNewKeyDesc] = useState("");

    useEffect(() => {
        if (isOpen) {
            fetchKeys();
            setIsAdding(false);
            resetForm();
        }
    }, [isOpen]);

    const fetchKeys = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('pix_keys')
            .select('*')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error(error);
            // Don't toast on 404/empty just yet if table doesn't exist, but it should exist.
            // toast({ variant: "destructive", title: "Erro ao carregar chaves" });
        } else {
            setKeys((data as PixKey[]) || []);
        }
        setLoading(false);
    };

    const resetForm = () => {
        setNewKey("");
        setNewKeyType("email");
        setNewKeyDesc("");
    };

    const handleAddKey = async () => {
        if (!newKey || !newKeyDesc) {
            toast({ variant: "destructive", title: "Preencha todos os campos" });
            return;
        }

        const { error } = await supabase.from('pix_keys').insert({
            key: newKey,
            key_type: newKeyType,
            description: newKeyDesc,
            is_default: keys.length === 0 // First key is default
        });

        if (error) {
            toast({ variant: "destructive", title: "Erro ao adicionar chave" });
        } else {
            toast({ title: "Chave adicionada!" });
            setIsAdding(false);
            resetForm();
            fetchKeys();
            if (onKeysChange) onKeysChange();
        }
    };

    const handleDeleteKey = async (id: string) => {
        const { error } = await supabase.from('pix_keys').delete().eq('id', id);
        if (error) {
            toast({ variant: "destructive", title: "Erro ao remover chave" });
        } else {
            toast({ title: "Chave removida" });
            fetchKeys();
            if (onKeysChange) onKeysChange();
        }
    };

    const handleSetDefault = async (id: string) => {
        // First set all to false
        await supabase.from('pix_keys').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to update all? No, RLS policy "all" usually allows. 
        // Better: 
        // But supabase simple update might not support "update all".
        // Instead, we can do it in two steps or just update the new default and rely on UI/Logic to handle "last true wins" or ensure others are false.
        // Or call an RPC. For simplicity:

        // 1. Set current default back to false (if likely only 1)
        const currentDefault = keys.find(k => k.is_default);
        if (currentDefault) {
            await supabase.from('pix_keys').update({ is_default: false }).eq('id', currentDefault.id);
        }

        // 2. Set new default
        const { error } = await supabase.from('pix_keys').update({ is_default: true }).eq('id', id);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao definir padrão" });
        } else {
            toast({ title: "Chave padrão atualizada" });
            fetchKeys();
            if (onKeysChange) onKeysChange();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Gerenciar Chaves Pix</DialogTitle>
                    <DialogDescription>
                        Adicione ou remova chaves Pix para serem usadas nas cobranças.
                    </DialogDescription>
                </DialogHeader>

                {!isAdding ? (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setIsAdding(true)} className="gap-2">
                                <Plus className="h-4 w-4" /> Nova Chave
                            </Button>
                        </div>

                        <ScrollArea className="h-[300px] border rounded-md p-2">
                            {keys.length === 0 ? (
                                <div className="text-center text-zinc-500 py-8">
                                    Nenhuma chave cadastrada.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {keys.map(key => (
                                        <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-zinc-800">{key.description}</span>
                                                    {key.is_default && <Badge variant="secondary" className="text-[10px] h-5">Padrão</Badge>}
                                                </div>
                                                <div className="text-sm text-zinc-500 font-mono">{key.key}</div>
                                                <div className="text-xs text-zinc-400 capitalize">{key.key_type}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-8 w-8 ${key.is_default ? 'text-yellow-500' : 'text-zinc-300 hover:text-yellow-500'}`}
                                                    onClick={() => handleSetDefault(key.id)}
                                                    disabled={key.is_default}
                                                    title="Definir como Padrão"
                                                >
                                                    <Star className={`h-4 w-4 ${key.is_default ? 'fill-current' : ''}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => handleDeleteKey(key.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in slide-in-from-right-10">
                        <div className="grid gap-4 py-2">
                            <div className="grid gap-2">
                                <Label htmlFor="desc">Descrição (ex: Nubank)</Label>
                                <Input id="desc" value={newKeyDesc} onChange={e => setNewKeyDesc(e.target.value)} placeholder="Minha conta principal" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-1 grid gap-2">
                                    <Label>Tipo</Label>
                                    <Select value={newKeyType} onValueChange={(v: any) => setNewKeyType(v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cpf">CPF</SelectItem>
                                            <SelectItem value="email">E-mail</SelectItem>
                                            <SelectItem value="phone">Telefone</SelectItem>
                                            <SelectItem value="cnp">CNPJ</SelectItem>
                                            <SelectItem value="random">Aleatória</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-2 grid gap-2">
                                    <Label htmlFor="key">Chave Pix</Label>
                                    <Input id="key" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Digite a chave..." />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
                            <Button onClick={handleAddKey}>Salvar Chave</Button>
                        </div>
                    </div>
                )}

                {!isAdding && (
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Fechar</Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
