import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Shield, Pencil } from "lucide-react";
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

const AVAILABLE_ROLES = [
    { id: 'admin', label: 'Administrador' },
    { id: 'manager', label: 'Gerente' },
    { id: 'sales', label: 'Vendedor' },
    { id: 'stock', label: 'Estoquista' },
    { id: 'client', label: 'Cliente' },
];

export default function AdminUsers() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // Novo Usuário State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPass, setNewUserPass] = useState("");
    const [newUserRoles, setNewUserRoles] = useState<string[]>(["sales"]);
    const [newUserName, setNewUserName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Editar Roles State
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [editingRoles, setEditingRoles] = useState<string[]>([]);
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
            // Normalizar roles
            const normalizedUsers = (data || []).map((u: any) => {
                let roles = u.roles;
                if (!roles || !Array.isArray(roles)) {
                    roles = u.role ? [u.role] : [];
                }
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
                    .update({
                        roles: newUserRoles,
                        role: newUserRoles[0], // Compatibilidade
                        status: 'active',
                        full_name: newUserName
                    })
                    .eq('id', authData.user.id);

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
        setIsEditRoleOpen(true);
    }

    async function saveRoles() {
        if (!editingUser) return;

        const { error } = await supabase
            .from('profiles')
            .update({
                roles: editingRoles,
                role: editingRoles.length > 0 ? editingRoles[0] : null // Compatibilidade
            })
            .eq('id', editingUser.id);

        if (error) {
            toast({ variant: 'destructive', title: 'Erro ao salvar permissões' });
        } else {
            toast({ title: 'Permissões atualizadas' });
            setIsEditRoleOpen(false);
            fetchUsers();
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>ID (Ref)</TableHead>
                            <TableHead>Funções (Roles)</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                        ) : users.map(u => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{u.full_name || 'Sem nome'}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">{u.id.substring(0, 8)}...</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {(u.roles || []).map(r => (
                                            <Badge key={r} variant="outline" className="text-xs">
                                                {AVAILABLE_ROLES.find(ar => ar.id === r)?.label || r}
                                            </Badge>
                                        ))}
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => openEditRoles(u)}>
                                            <Pencil className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className={u.status === 'active' ? 'bg-green-600' : ''}>
                                        {u.status || 'active'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" title="Em breve: Bloquear">
                                        <Shield className="h-4 w-4 text-zinc-400" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
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
                                    <div key={role.id} className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`new-${role.id}`}
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={newUserRoles.includes(role.id)}
                                            onChange={() => toggleRole(role.id, newUserRoles, setNewUserRoles)}
                                        />
                                        <label htmlFor={`new-${role.id}`} className="text-sm font-medium cursor-pointer">
                                            {role.label}
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
                        <DialogTitle>Editar Funções</DialogTitle>
                        <DialogDescription>Selecione as funções para {editingUser?.full_name}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="flex flex-col gap-2 border p-3 rounded-md">
                            {AVAILABLE_ROLES.map(role => (
                                <div key={role.id} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`edit-${role.id}`}
                                        className="h-4 w-4 rounded border-gray-300"
                                        checked={editingRoles.includes(role.id)}
                                        onChange={() => toggleRole(role.id, editingRoles, setEditingRoles)}
                                    />
                                    <label htmlFor={`edit-${role.id}`} className="text-sm font-medium cursor-pointer">
                                        {role.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={saveRoles}>Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
