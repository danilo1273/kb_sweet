import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Shield, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@supabase/supabase-js";

// Tipos
interface Profile {
    id: string;
    full_name: string;
    role?: string; // Legacy
    roles?: string[]; // New Multi-Role
    status: string;
    email?: string;
}

// Mapeamento de Roles para Labels amigáveis
const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador (Geral)',
    buyer: 'Compras (Lançar)',
    seller: 'Vendas (Vendedor)',
    approver: 'Aprovador (Estoque/Compras)',
    financial: 'Financeiro (Contas)',
    sales: 'Vendas (Vendedor)' // Legacy alias
};

const AVAILABLE_ROLES = ['admin', 'buyer', 'seller', 'approver', 'financial'];

export default function AdminUsers() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Novo Usuário State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPass, setNewUserPass] = useState("");
    const [newUserRoles, setNewUserRoles] = useState<string[]>(["seller"]);
    const [newUserName, setNewUserName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Editar Roles State
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [editingRoles, setEditingRoles] = useState<string[]>([]);
    const [editingName, setEditingName] = useState("");
    const [editingEmail, setEditingEmail] = useState("");
    const [editingPassword, setEditingPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    async function fetchUsers() {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*');

        if (error) {
            toast({ variant: 'destructive', title: 'Erro ao listar usuários', description: error.message });
        } else {
            // Normalizar roles e migrar 'sales' -> 'seller'
            const normalizedUsers = (data || []).map((u: any) => {
                let roles = u.roles || [];
                if (!Array.isArray(roles) || roles.length === 0) {
                    roles = u.role ? [u.role] : [];
                }
                // Normalize legacy 'sales' to 'seller'
                roles = roles.map((r: string) => r === 'sales' ? 'seller' : r);
                // Remove duplicates
                roles = Array.from(new Set(roles));

                return { ...u, roles };
            });
            setUsers(normalizedUsers);
        }
        setLoading(false);
    }

    async function handleCreateUser() {
        if (newUserRoles.length === 0) {
            return toast({ variant: 'destructive', title: 'Selecione pelo menos uma função' });
        }
        setIsCreating(true);
        try {
            const supabaseAdmin = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
                email: newUserEmail,
                password: newUserPass,
                options: {
                    data: {
                        full_name: newUserName,
                    }
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert([{
                        id: authData.user.id,
                        roles: newUserRoles,
                        role: newUserRoles[0], // Compatibilidade
                        status: 'active',
                        full_name: newUserName,
                        email: newUserEmail // Garantir email no perfil se a coluna existir
                    }])
                    .select();

                if (profileError) console.warn("Profile update warning:", profileError);
            }

            toast({ title: "Usuário criado com sucesso!" });
            setIsCreateOpen(false);
            setNewUserEmail("");
            setNewUserPass("");
            setNewUserName("");
            setNewUserRoles(["sales"]);
            fetchUsers();

        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao criar", description: error.message });
        } finally {
            setIsCreating(false);
        }
    }

    function openEditRoles(user: Profile) {
        setEditingUser(user);
        setEditingRoles(user.roles || []);
        setEditingName(user.full_name || "");
        setEditingEmail(user.email || "");
        setEditingPassword("");
        setIsEditRoleOpen(true);
    }

    async function handleSaveRoles() {
        if (!editingUser) return;
        setIsSaving(true);
        try {
            // 1. Atualizar Roles e Nome no Perfil
            const updates: any = {
                roles: editingRoles,
                role: editingRoles.length > 0 ? editingRoles[0] : null, // legacy compat
                full_name: editingName
            };

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', editingUser.id);

            if (error) throw error;

            // 2. Atualizar Senha (Se fornecida) via RPC
            if (editingPassword && editingPassword.trim() !== "") {
                const { error: rpcError } = await supabase.rpc('admin_update_password', {
                    target_user_id: editingUser.id,
                    new_password: editingPassword
                });
                if (rpcError) throw rpcError;
                toast({ title: "Senha atualizada com sucesso!" });
            }

            toast({ title: "Usuário atualizado com sucesso!" });
            setIsEditRoleOpen(false);
            fetchUsers();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDeleteUser() {
        if (!editingUser) return;
        if (!confirm("TEM CERTEZA? Esta ação não pode ser desfeita e apagará todo o histórico deste usuário.")) return;

        setIsSaving(true);
        try {
            // Tenta via RPC (Hard Delete completo)
            const { error } = await supabase.rpc('admin_delete_user', {
                target_user_id: editingUser.id
            });
            if (error) throw error;

            toast({ title: "Usuário excluído permanentemente." });
            setIsEditRoleOpen(false);
            fetchUsers();
        } catch (error: any) {
            console.warn("RPC falhou, tentando soft delete via profile", error);
            const { error: profileError } = await supabase.from('profiles').delete().eq('id', editingUser.id);
            if (profileError) {
                toast({ variant: "destructive", title: "Erro ao excluir", description: profileError.message });
            } else {
                toast({ title: "Perfil excluído (Soft Delete)." });
                setIsEditRoleOpen(false);
                fetchUsers();
            }
        } finally {
            setIsSaving(false);
        }
    }

    function toggleRole(roleId: string, currentRoles: string[], setter: (r: string[]) => void) {
        if (currentRoles.includes(roleId)) {
            setter(currentRoles.filter(r => r !== roleId));
        } else {
            setter([...currentRoles, roleId]);
        }
    }

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Gestão de Usuários</h2>
                    <p className="text-zinc-500">Gerencie acesso e permissões da equipe (Checklist).</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="bg-zinc-900">
                    <Plus className="mr-2 h-4 w-4" /> Novo Usuário
                </Button>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>ID (Ref)</TableHead>
                                <TableHead>Funções (Roles)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                            ) : users.map(u => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span>{u.full_name || 'Sem nome'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{u.email || '-'}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{u.id.substring(0, 8)}...</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {(u.roles || [])
                                                .filter(r => r !== 'pending' || (u.roles || []).length === 1) // Esconde 'pending' se tiver outros cargos
                                                .map(r => (
                                                    <Badge key={r} variant="outline" className="text-xs">
                                                        {ROLE_LABELS[r] || r}
                                                    </Badge>
                                                ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className={u.status === 'active' ? 'bg-green-600' : ''}>
                                            {u.status || 'active'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => openEditRoles(u)} title="Editar Usuário">
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" title="Em breve: Bloquear">
                                                <Shield className="h-4 w-4 text-zinc-400" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2 p-2 bg-zinc-50">
                    {loading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : users.map(u => (
                        <div key={u.id} className="bg-white p-3 rounded border shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-zinc-900">{u.full_name || 'Sem nome'}</div>
                                    <div className="text-xs text-zinc-500">{u.email || '-'}</div>
                                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{u.id.substring(0, 8)}</div>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRoles(u)}>
                                        <Pencil className="h-4 w-4 text-zinc-500" />
                                    </Button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 items-center justify-between border-t pt-2">
                                <div className="flex flex-wrap gap-1">
                                    {(u.roles || [])
                                        .filter(r => r !== 'pending' || (u.roles || []).length === 1)
                                        .map(r => (
                                            <Badge key={r} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-100">
                                                {ROLE_LABELS[r] || r}
                                            </Badge>
                                        ))}
                                </div>

                                <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className={u.status === 'active' ? 'bg-green-600' : ''}>
                                    {u.status || 'active'}
                                </Badge>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Criar Usuário Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Criar Novo Usuário</DialogTitle>
                        <DialogDescription>Múltiplas funções podem ser selecionadas.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Nome</Label>
                            <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Email</Label>
                            <Input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} type="email" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Senha</Label>
                            <Input value={newUserPass} onChange={e => setNewUserPass(e.target.value)} type="password" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Funções</Label>
                            <div className="flex flex-col gap-2 border p-3 rounded-md">
                                {AVAILABLE_ROLES.map(role => (
                                    <div key={role} className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`new-${role}`}
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={newUserRoles.includes(role)}
                                            onChange={() => toggleRole(role, newUserRoles, setNewUserRoles)}
                                        />
                                        <label htmlFor={`new-${role}`} className="text-sm font-medium cursor-pointer">
                                            {ROLE_LABELS[role] || role}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateUser} disabled={isCreating}>
                            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editar Roles Dialog */}
            <Dialog open={isEditRoleOpen} onOpenChange={setIsEditRoleOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Usuário</DialogTitle>
                        <DialogDescription>Gerencie dados, senha e permissões de {editingUser?.full_name}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="grid gap-2">
                            <Label>Nome Completo</Label>
                            <Input value={editingName} onChange={e => setEditingName(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Email (Login)</Label>
                            <Input value={editingEmail} onChange={e => setEditingEmail(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Email (Login)</Label>
                            <Input value={editingEmail} onChange={e => setEditingEmail(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Alterar Senha (Opcional)</Label>
                            <Input
                                type="password"
                                placeholder="Digite para alterar a senha..."
                                value={editingPassword}
                                onChange={e => setEditingPassword(e.target.value)}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>Funções</Label>
                            <div className="flex flex-col gap-2 border p-3 rounded-md">
                                {AVAILABLE_ROLES.map(role => (
                                    <div key={role} className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`edit-${role}`}
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={editingRoles.includes(role)}
                                            onChange={() => toggleRole(role, editingRoles, setEditingRoles)}
                                        />
                                        <label htmlFor={`edit-${role}`} className="text-sm font-medium cursor-pointer">
                                            {ROLE_LABELS[role] || role}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t">
                            <Button variant="destructive" onClick={handleDeleteUser} className="w-full gap-2" disabled={isSaving}>
                                <Trash2 className="h-4 w-4" /> Excluir Usuário
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveRoles} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
