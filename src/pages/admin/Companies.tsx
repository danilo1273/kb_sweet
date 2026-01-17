
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { createClient } from "@supabase/supabase-js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Ban, CheckCircle, Search, Users, Copy, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Company, Profile } from "../../types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminCompanies() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const { toast } = useToast();

    // Create Company State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPlan, setNewPlan] = useState<"basic" | "pro" | "enterprise">("basic");
    const [newStatus, setNewStatus] = useState<"active" | "suspended">("active");

    // Users Management State
    const [isUsersOpen, setIsUsersOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [companyUsers, setCompanyUsers] = useState<Profile[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [inviteLink, setInviteLink] = useState("");

    // Manual User Creation State
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPass, setNewUserPass] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [creatingUser, setCreatingUser] = useState(false);

    useEffect(() => {
        fetchCompanies();
    }, []);

    async function fetchCompanies() {
        setLoading(true);
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        } else {
            setCompanies(data || []);
        }
        setLoading(false);
    }

    const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        const { error } = await supabase.from('companies').update({ status: newStatus }).eq('id', id);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        } else {
            toast({ title: `Empresa ${newStatus === 'active' ? 'ativada' : 'suspensa'}!` });
            fetchCompanies();
        }
    };

    const handleCreateCompany = async () => {
        if (!newName) {
            toast({ variant: "destructive", title: "Erro", description: "Nome é obrigatório" });
            return;
        }

        setCreateLoading(true);
        const { data, error } = await supabase.from('companies').insert({
            name: newName,
            plan: newPlan,
            status: newStatus
        }).select();

        if (error) {
            toast({ variant: "destructive", title: "Erro ao criar", description: error.message });
        } else {
            toast({ title: "Empresa criada com sucesso!" });
            setNewName("");
            setNewPlan("basic");
            setIsCreateOpen(false);
            fetchCompanies();
        }
        setCreateLoading(false);
    };

    // User Management Functions
    const handleOpenUsers = (company: Company) => {
        setSelectedCompany(company);
        setIsUsersOpen(true);
        const link = `${window.location.origin}/register?company_id=${company.id}`;
        setInviteLink(link);
        fetchCompanyUsers(company.id);
        // Reset form
        setNewUserEmail("");
        setNewUserPass("");
        setNewUserName("");
    };

    const fetchCompanyUsers = async (companyId: string) => {
        setUsersLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('company_id', companyId);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao buscar usuários", description: error.message });
        } else {
            setCompanyUsers(data || []);
        }
        setUsersLoading(false);
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink);
        toast({ title: "Link copiado!", description: "Envie este link para o novo usuário." });
    };

    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPass || !newUserName || !selectedCompany) {
            toast({ variant: "destructive", title: "Preencha todos os campos" });
            return;
        }

        setCreatingUser(true);
        try {
            // Use temporary client to avoid signing out admin
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false } }
            );

            const { data, error } = await tempClient.auth.signUp({
                email: newUserEmail,
                password: newUserPass,
                options: {
                    data: {
                        full_name: newUserName,
                        company_id: selectedCompany.id
                    }
                }
            });

            if (error) throw error;
            if (!data.user) throw new Error("Erro ao criar usuário.");

            // Manually ensure profile is updated (just in case trigger lags or user is not created fully)
            // Admin has permission to update any profile
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    company_id: selectedCompany.id,
                    full_name: newUserName,
                    // roles: ['user'] // Optional default role
                })
                .eq('id', data.user.id);

            if (profileError) {
                console.error("Profile update error:", profileError);
                // Don't throw, usually trigger handles it.
            }

            toast({ title: "Usuário criado com sucesso!" });
            setNewUserEmail("");
            setNewUserPass("");
            setNewUserName("");
            fetchCompanyUsers(selectedCompany.id);

        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao criar usuário", description: error.message });
        } finally {
            setCreatingUser(false);
        }
    };

    // Role Management State
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [selectedUserForRole, setSelectedUserForRole] = useState<Profile | null>(null);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

    // Available roles definition
    const AVAILABLE_ROLES = [
        { id: 'admin', label: 'Admin (Acesso Total da Empresa)' },
        { id: 'financial', label: 'Financeiro' },
        { id: 'confeiteiro', label: 'Confeiteiro' },
        { id: 'seller', label: 'Vendedor' },
        { id: 'buyer', label: 'Comprador' },
        { id: 'approver', label: 'Aprovador' },
    ];

    const handleOpenRoleDialog = (user: Profile) => {
        setSelectedUserForRole(user);
        setSelectedRoles(user.roles || (user.role ? [user.role] : []));
        setIsRoleDialogOpen(true);
    };

    const handleToggleRole = (roleId: string) => {
        setSelectedRoles(prev =>
            prev.includes(roleId)
                ? prev.filter(r => r !== roleId)
                : [...prev, roleId]
        );
    };

    const handleSaveRoles = async () => {
        if (!selectedUserForRole) return;

        setUsersLoading(true);
        const { error } = await supabase
            .from('profiles')
            .update({ roles: selectedRoles })
            .eq('id', selectedUserForRole.id);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao atualizar funções", description: error.message });
        } else {
            toast({ title: "Funções atualizadas com sucesso!" });
            fetchCompanyUsers(selectedUserForRole.company_id || "");
            setIsRoleDialogOpen(false);
        }
        setUsersLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Empresas</h1>
                    <p className="text-slate-500">Gerencie todos os assinantes do SaaS.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-purple-600 hover:bg-purple-700">
                            <Plus className="mr-2 h-4 w-4" /> Nova Empresa
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nova Empresa SaaS</DialogTitle>
                            <DialogDescription>
                                Cadastre um novo tenant para a plataforma.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    Nome
                                </Label>
                                <Input
                                    id="name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="col-span-3"
                                    placeholder="Ex: Confeitaria XYZ"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="plan" className="text-right">
                                    Plano
                                </Label>
                                <Select value={newPlan} onValueChange={(v: any) => setNewPlan(v)}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Selecione um plano" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="basic">Básico</SelectItem>
                                        <SelectItem value="pro">Profissional</SelectItem>
                                        <SelectItem value="enterprise">Enterprise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="status" className="text-right">
                                    Status
                                </Label>
                                <Select value={newStatus} onValueChange={(v: any) => setNewStatus(v)}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Status inicial" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Ativo</SelectItem>
                                        <SelectItem value="suspended">Suspenso</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreateCompany} disabled={createLoading} className="bg-purple-600 hover:bg-purple-700">
                                {createLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Criar Empresa
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Users Management Dialog */}
            <Dialog open={isUsersOpen} onOpenChange={setIsUsersOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Usuários: {selectedCompany?.name}</DialogTitle>
                        <DialogDescription>
                            Visualize, convide ou cadastre novos usuários para esta empresa.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="list" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="list">Listagem</TabsTrigger>
                            <TabsTrigger value="create">Cadastrar Novo</TabsTrigger>
                        </TabsList>

                        <TabsContent value="list" className="space-y-4 pt-4">
                            {/* Invite Link Section */}
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 flex flex-col gap-3">
                                <div>
                                    <h4 className="font-semibold text-purple-900 text-sm">Link de Convite (Cadastro Automático)</h4>
                                </div>
                                <div className="flex gap-2">
                                    <Input value={inviteLink} readOnly className="bg-white border-purple-200 text-sm" />
                                    <Button variant="secondary" size="icon" onClick={copyInviteLink} className="shrink-0">
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Users List */}
                            <div>
                                <h3 className="font-medium mb-3 text-sm">Usuários Cadastrados</h3>
                                {usersLoading ? (
                                    <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-purple-600" /></div>
                                ) : (
                                    <div className="border rounded-md overflow-hidden max-h-60 overflow-y-auto">
                                        <Table>
                                            <TableHeader className="bg-slate-50 sticky top-0">
                                                <TableRow>
                                                    <TableHead>Nome</TableHead>
                                                    <TableHead>Email</TableHead>
                                                    <TableHead>Funções</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {companyUsers.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center py-6 text-slate-500 text-sm">
                                                            Nenhum usuário encontrado nesta empresa.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {companyUsers.map(user => (
                                                    <TableRow key={user.id}>
                                                        <TableCell className="font-medium">{user.full_name || 'Sem nome'}</TableCell>
                                                        <TableCell className="text-slate-600">{user.email}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(user.roles && user.roles.length > 0) ? (
                                                                    user.roles.map(r => (
                                                                        <Badge key={r} variant="secondary" className="uppercase text-[10px]">{r}</Badge>
                                                                    ))
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] text-slate-500">Sem função</Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" onClick={() => handleOpenRoleDialog(user)} title="Editar Funções">
                                                                <Users className="h-4 w-4 mr-2" /> Editar
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="create" className="pt-4 space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Novo Usuário</CardTitle>
                                    <CardDescription>
                                        Crie um usuário manualmente. Ele receberá acesso imediato.
                                        A senha é definida por você agora.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Nome Completo</Label>
                                        <Input
                                            placeholder="Ex: Maria Silva"
                                            value={newUserName}
                                            onChange={e => setNewUserName(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            placeholder="maria@empresa.com"
                                            value={newUserEmail}
                                            onChange={e => setNewUserEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Senha</Label>
                                        <Input
                                            type="password"
                                            placeholder="Mínimo 6 caracteres"
                                            value={newUserPass}
                                            onChange={e => setNewUserPass(e.target.value)}
                                        />
                                    </div>
                                    <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={handleCreateUser} disabled={creatingUser}>
                                        {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                        Criar Usuário
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Role Assignment Dialog - Nested */}
            <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Atribuir Funções</DialogTitle>
                        <DialogDescription>
                            Selecione as funções para <b>{selectedUserForRole?.full_name}</b>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-4">
                            {AVAILABLE_ROLES.map((role) => {
                                const isSelected = selectedRoles.includes(role.id);
                                return (
                                    <div
                                        key={role.id}
                                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-purple-50 border-purple-200' : 'hover:bg-slate-50'}`}
                                        onClick={() => handleToggleRole(role.id)}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="font-medium text-sm">{role.label}</div>
                                            <div className="text-xs text-slate-500 first-letter:uppercase">{role.id}</div>
                                        </div>
                                        <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                                            {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <div className="text-xs text-slate-400 self-center">
                            * Múltiplas funções permitidas
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveRoles} className="bg-purple-600 hover:bg-purple-700">Salvar Funções</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                        <CardTitle>Listagem</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar empresa..."
                                className="pl-8"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-purple-600" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Plano</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Criado em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                                            Nenhuma empresa encontrada.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {filtered.map(company => (
                                    <TableRow key={company.id}>
                                        <TableCell className="font-medium">{company.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">{company.plan}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={company.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}>
                                                {company.status === 'active' ? 'Ativo' : 'Suspenso'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{new Date(company.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right flex justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => handleOpenUsers(company)} title="Gerenciar Usuários">
                                                <Users className="h-4 w-4 mr-2" /> Usuários
                                            </Button>

                                            {company.status === 'active' ? (
                                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => toggleStatus(company.id, company.status)} title="Bloquear">
                                                    <Ban className="h-4 w-4" /> Bloquear
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => toggleStatus(company.id, company.status)} title="Ativar">
                                                    <CheckCircle className="h-4 w-4" /> Ativar
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
