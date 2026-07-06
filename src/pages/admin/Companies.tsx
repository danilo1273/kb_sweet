
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { createClient } from "@supabase/supabase-js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Ban, CheckCircle, Search, Users, Copy, UserPlus, Pencil, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Company, Profile } from "../../types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanType = "free" | "pro" | "enterprise" | "plan_i" | "plan_ii";
type StatusType = "active" | "suspended" | "trial";

// ─── Helper ───────────────────────────────────────────────────────────────────
function planLabel(plan: string) {
    const map: Record<string, string> = {
        free: "Free",
        pro: "Pro",
        enterprise: "Enterprise",
        plan_i: "Plano I",
        plan_ii: "Plano II",
    };
    return map[plan] ?? plan;
}

function statusBadgeClass(status: string) {
    if (status === "active") return "bg-green-100 text-green-700 hover:bg-green-200";
    if (status === "trial") return "bg-blue-100 text-blue-700 hover:bg-blue-200";
    return "bg-red-100 text-red-700 hover:bg-red-200";
}

function statusLabel(status: string) {
    if (status === "active") return "Ativo";
    if (status === "trial") return "Trial";
    return "Suspenso";
}

// ─── Company Form fields (shared for Create & Edit) ───────────────────────────
interface CompanyFormState {
    name: string;
    document: string;
    email: string;
    phone: string;
    address: string;
    plan: PlanType;
    status: StatusType;
    maxUsers: number;
    trialEndsAt: string;
    notes: string;
    primaryColor: string;
    logoUrl: string;
}

const defaultForm = (): CompanyFormState => ({
    name: "",
    document: "",
    email: "",
    phone: "",
    address: "",
    plan: "free",
    status: "active",
    maxUsers: 5,
    trialEndsAt: "",
    notes: "",
    primaryColor: "#8B5CF6",
    logoUrl: "",
});

// ─── Reusable Company Form UI ─────────────────────────────────────────────────
function CompanyFormFields({
    form,
    setForm,
}: {
    form: CompanyFormState;
    setForm: React.Dispatch<React.SetStateAction<CompanyFormState>>;
}) {
    const set = (key: keyof CompanyFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value }));

    return (
        <ScrollArea className="h-[420px] pr-4">
            <div className="space-y-6 py-2">
                {/* ── Dados da Empresa ─────────────────────────── */}
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Dados da Empresa
                    </h4>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>
                                Nome <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                placeholder="Ex: Confeitaria XYZ"
                                value={form.name}
                                onChange={set("name")}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>CNPJ / CPF</Label>
                            <Input
                                placeholder="00.000.000/0000-00"
                                value={form.document}
                                onChange={set("document")}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>E-mail de contato</Label>
                            <Input
                                type="email"
                                placeholder="contato@empresa.com"
                                value={form.email}
                                onChange={set("email")}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Telefone</Label>
                            <Input
                                placeholder="(11) 99999-9999"
                                value={form.phone}
                                onChange={set("phone")}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Endereço</Label>
                            <Input
                                placeholder="Rua, número, cidade – UF"
                                value={form.address}
                                onChange={set("address")}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Plano e Acesso ───────────────────────────── */}
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Plano e Acesso
                    </h4>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Plano</Label>
                            <Select
                                value={form.plan}
                                onValueChange={(v: PlanType) => setForm(prev => ({ ...prev, plan: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um plano" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">Free</SelectItem>
                                    <SelectItem value="pro">Pro</SelectItem>
                                    <SelectItem value="enterprise">Enterprise</SelectItem>
                                    <SelectItem value="plan_i">Plano I (Legado)</SelectItem>
                                    <SelectItem value="plan_ii">Plano II (Legado)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select
                                value={form.status}
                                onValueChange={(v: StatusType) => setForm(prev => ({ ...prev, status: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Status inicial" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Ativo</SelectItem>
                                    <SelectItem value="trial">Trial</SelectItem>
                                    <SelectItem value="suspended">Suspenso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Máx. Usuários</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.maxUsers}
                                onChange={e =>
                                    setForm(prev => ({ ...prev, maxUsers: Number(e.target.value) }))
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Data fim do Trial (opcional)</Label>
                            <Input
                                type="date"
                                value={form.trialEndsAt}
                                onChange={set("trialEndsAt")}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Personalização ───────────────────────────── */}
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Personalização
                    </h4>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Cor Primária</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={form.primaryColor}
                                    onChange={set("primaryColor")}
                                    className="h-9 w-14 rounded border border-slate-200 cursor-pointer"
                                />
                                <Input
                                    value={form.primaryColor}
                                    onChange={set("primaryColor")}
                                    placeholder="#8B5CF6"
                                    className="flex-1"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>URL da Logo</Label>
                            <Input
                                type="url"
                                placeholder="https://exemplo.com/logo.png"
                                value={form.logoUrl}
                                onChange={set("logoUrl")}
                            />
                            {form.logoUrl && (
                                <img
                                    src={form.logoUrl}
                                    alt="Preview da logo"
                                    className="h-10 w-10 rounded-full object-cover border border-slate-200 mt-1"
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Observações ──────────────────────────────── */}
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Observações
                    </h4>
                    <Textarea
                        placeholder="Notas internas sobre este cliente..."
                        rows={3}
                        value={form.notes}
                        onChange={set("notes")}
                    />
                </div>
            </div>
        </ScrollArea>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminCompanies() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const { toast } = useToast();

    // Create Company Dialog
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [createForm, setCreateForm] = useState<CompanyFormState>(defaultForm());

    // Edit Company Dialog
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [editForm, setEditForm] = useState<CompanyFormState>(defaultForm());

    // Users Management Dialog
    const [isUsersOpen, setIsUsersOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [companyUsers, setCompanyUsers] = useState<Profile[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [inviteLink, setInviteLink] = useState("");

    // Manual User Creation
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPass, setNewUserPass] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [creatingUser, setCreatingUser] = useState(false);

    // Role Management
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [selectedUserForRole, setSelectedUserForRole] = useState<Profile | null>(null);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

    const AVAILABLE_ROLES = [
        { id: "admin", label: "Admin (Acesso Total da Empresa)" },
        { id: "financial", label: "Financeiro" },
        { id: "confeiteiro", label: "Confeiteiro" },
        { id: "seller", label: "Vendedor" },
        { id: "buyer", label: "Comprador" },
        { id: "approver", label: "Aprovador" },
    ];

    useEffect(() => {
        fetchCompanies();
    }, []);

    async function fetchCompanies() {
        setLoading(true);
        const { data, error } = await supabase
            .from("companies")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            toast({ variant: "destructive", title: "Erro", description: error.message });
        } else {
            setCompanies(data || []);
        }
        setLoading(false);
    }

    const filtered = companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const toggleStatus = async (id: string, currentStatus: string) => {
        const next = currentStatus === "active" ? "suspended" : "active";
        const { error } = await supabase.from("companies").update({ status: next }).eq("id", id);
        if (error) {
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        } else {
            toast({ title: `Empresa ${next === "active" ? "ativada" : "suspensa"}!` });
            fetchCompanies();
        }
    };

    // ── Create Company ────────────────────────────────────────────────────────
    const handleCreateCompany = async () => {
        if (!createForm.name.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Nome é obrigatório." });
            return;
        }

        setCreateLoading(true);

        const payload: Record<string, unknown> = {
            name: createForm.name.trim(),
            plan: createForm.plan,
            status: createForm.status,
            max_users: createForm.maxUsers,
        };
        if (createForm.document) payload.document = createForm.document;
        if (createForm.email) payload.email = createForm.email;
        if (createForm.phone) payload.phone = createForm.phone;
        if (createForm.address) payload.address = createForm.address;
        if (createForm.trialEndsAt) payload.trial_ends_at = createForm.trialEndsAt;
        if (createForm.notes) payload.notes = createForm.notes;
        if (createForm.primaryColor) payload.primary_color = createForm.primaryColor;
        if (createForm.logoUrl) payload.logo_url = createForm.logoUrl;

        const { data, error } = await supabase.from("companies").insert(payload).select();

        if (error) {
            toast({ variant: "destructive", title: "Erro ao criar empresa", description: error.message });
            setCreateLoading(false);
            return;
        }

        // Criar armazém padrão para a nova empresa
        if (data && data[0]?.id) {
            const { error: stockError } = await supabase.from("stock_locations").insert({
                company_id: data[0].id,
                name: "Estoque Principal",
                slug: "estoque-principal",
                is_default: true,
            });
            if (stockError) {
                // Não bloqueia o fluxo, apenas avisa
                console.error("Erro ao criar estoque principal:", stockError);
                toast({
                    variant: "destructive",
                    title: "Aviso",
                    description: "Empresa criada, mas não foi possível criar o Estoque Principal automaticamente.",
                });
            }
        }

        toast({ title: "Empresa criada com sucesso! 🎉" });
        setCreateForm(defaultForm());
        setIsCreateOpen(false);
        fetchCompanies();
        setCreateLoading(false);
    };

    // ── Open Edit Dialog ──────────────────────────────────────────────────────
    const handleOpenEdit = (company: Company) => {
        setEditingCompany(company);
        setEditForm({
            name: company.name ?? "",
            document: (company as any).document ?? "",
            email: (company as any).email ?? "",
            phone: (company as any).phone ?? "",
            address: (company as any).address ?? "",
            plan: (company.plan as PlanType) ?? "free",
            status: (company.status as StatusType) ?? "active",
            maxUsers: (company as any).max_users ?? 5,
            trialEndsAt: (company as any).trial_ends_at
                ? (company as any).trial_ends_at.slice(0, 10)
                : "",
            notes: (company as any).notes ?? "",
            primaryColor: (company as any).primary_color ?? "#8B5CF6",
            logoUrl: (company as any).logo_url ?? "",
        });
        setIsEditOpen(true);
    };

    // ── Save Edit ─────────────────────────────────────────────────────────────
    const handleSaveEdit = async () => {
        if (!editingCompany || !editForm.name.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Nome é obrigatório." });
            return;
        }

        setEditLoading(true);

        const payload: Record<string, unknown> = {
            name: editForm.name.trim(),
            plan: editForm.plan,
            status: editForm.status,
            max_users: editForm.maxUsers,
            document: editForm.document || null,
            email: editForm.email || null,
            phone: editForm.phone || null,
            address: editForm.address || null,
            trial_ends_at: editForm.trialEndsAt || null,
            notes: editForm.notes || null,
            primary_color: editForm.primaryColor || null,
            logo_url: editForm.logoUrl || null,
        };

        const { error } = await supabase
            .from("companies")
            .update(payload)
            .eq("id", editingCompany.id);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
        } else {
            toast({ title: "Empresa atualizada com sucesso!" });
            setIsEditOpen(false);
            setEditingCompany(null);
            fetchCompanies();
        }
        setEditLoading(false);
    };

    // ── Users Management ──────────────────────────────────────────────────────
    const handleOpenUsers = (company: Company) => {
        setSelectedCompany(company);
        setIsUsersOpen(true);
        const link = `${window.location.origin}/register?company_id=${company.id}`;
        setInviteLink(link);
        fetchCompanyUsers(company.id);
        setNewUserEmail("");
        setNewUserPass("");
        setNewUserName("");
    };

    const fetchCompanyUsers = async (companyId: string) => {
        setUsersLoading(true);
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("company_id", companyId);

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
                        company_id: selectedCompany.id,
                    },
                },
            });

            if (error) throw error;
            if (!data.user) throw new Error("Erro ao criar usuário.");

            const { error: profileError } = await supabase
                .from("profiles")
                .update({
                    company_id: selectedCompany.id,
                    full_name: newUserName,
                })
                .eq("id", data.user.id);

            if (profileError) {
                console.error("Profile update error:", profileError);
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

    // ── Role Management ───────────────────────────────────────────────────────
    const handleOpenRoleDialog = (user: Profile) => {
        setSelectedUserForRole(user);
        setSelectedRoles(user.roles || (user.role ? [user.role] : []));
        setIsRoleDialogOpen(true);
    };

    const handleToggleRole = (roleId: string) => {
        setSelectedRoles(prev =>
            prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
        );
    };

    const handleSaveRoles = async () => {
        if (!selectedUserForRole) return;

        setUsersLoading(true);
        const { error } = await supabase
            .from("profiles")
            .update({ roles: selectedRoles })
            .eq("id", selectedUserForRole.id);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao atualizar funções", description: error.message });
        } else {
            toast({ title: "Funções atualizadas com sucesso!" });
            fetchCompanyUsers(selectedUserForRole.company_id || "");
            setIsRoleDialogOpen(false);
        }
        setUsersLoading(false);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Empresas</h1>
                    <p className="text-slate-500">Gerencie todos os assinantes do SaaS.</p>
                </div>

                {/* ── Create Company Dialog ─────────────────────── */}
                <Dialog
                    open={isCreateOpen}
                    onOpenChange={open => {
                        setIsCreateOpen(open);
                        if (!open) setCreateForm(defaultForm());
                    }}
                >
                    <DialogTrigger asChild>
                        <Button className="bg-purple-600 hover:bg-purple-700">
                            <Plus className="mr-2 h-4 w-4" /> Nova Empresa
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Nova Empresa SaaS</DialogTitle>
                            <DialogDescription>
                                Cadastre um novo tenant. Um Estoque Principal será criado automaticamente.
                            </DialogDescription>
                        </DialogHeader>
                        <CompanyFormFields form={createForm} setForm={setCreateForm} />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleCreateCompany}
                                disabled={createLoading}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {createLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Criar Empresa
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* ── Edit Company Dialog ───────────────────────────── */}
            <Dialog
                open={isEditOpen}
                onOpenChange={open => {
                    setIsEditOpen(open);
                    if (!open) setEditingCompany(null);
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Editar Empresa</DialogTitle>
                        <DialogDescription>
                            Atualize os dados de <b>{editingCompany?.name}</b>.
                        </DialogDescription>
                    </DialogHeader>
                    <CompanyFormFields form={editForm} setForm={setEditForm} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveEdit}
                            disabled={editLoading}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {editLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Users Management Dialog ───────────────────────── */}
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
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 flex flex-col gap-3">
                                <div>
                                    <h4 className="font-semibold text-purple-900 text-sm">
                                        Link de Convite (Cadastro Automático)
                                    </h4>
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        value={inviteLink}
                                        readOnly
                                        className="bg-white border-purple-200 text-sm"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        onClick={copyInviteLink}
                                        className="shrink-0"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-medium mb-3 text-sm">Usuários Cadastrados</h3>
                                {usersLoading ? (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="animate-spin h-6 w-6 text-purple-600" />
                                    </div>
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
                                                        <TableCell
                                                            colSpan={4}
                                                            className="text-center py-6 text-slate-500 text-sm"
                                                        >
                                                            Nenhum usuário encontrado nesta empresa.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {companyUsers.map(user => (
                                                    <TableRow key={user.id}>
                                                        <TableCell className="font-medium">
                                                            {user.full_name || "Sem nome"}
                                                        </TableCell>
                                                        <TableCell className="text-slate-600">
                                                            {user.email}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {user.roles && user.roles.length > 0 ? (
                                                                    user.roles.map(r => (
                                                                        <Badge
                                                                            key={r}
                                                                            variant="secondary"
                                                                            className="uppercase text-[10px]"
                                                                        >
                                                                            {r}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="text-[10px] text-slate-500"
                                                                    >
                                                                        Sem função
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleOpenRoleDialog(user)}
                                                                title="Editar Funções"
                                                            >
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
                                        Crie um usuário manualmente. Ele receberá acesso imediato. A senha é
                                        definida por você agora.
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
                                    <Button
                                        className="w-full bg-purple-600 hover:bg-purple-700"
                                        onClick={handleCreateUser}
                                        disabled={creatingUser}
                                    >
                                        {creatingUser ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <UserPlus className="mr-2 h-4 w-4" />
                                        )}
                                        Criar Usuário
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* ── Role Assignment Dialog ────────────────────────── */}
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
                            {AVAILABLE_ROLES.map(role => {
                                const isSelected = selectedRoles.includes(role.id);
                                return (
                                    <div
                                        key={role.id}
                                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                            isSelected
                                                ? "bg-purple-50 border-purple-200"
                                                : "hover:bg-slate-50"
                                        }`}
                                        onClick={() => handleToggleRole(role.id)}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="font-medium text-sm">{role.label}</div>
                                            <div className="text-xs text-slate-500 first-letter:uppercase">
                                                {role.id}
                                            </div>
                                        </div>
                                        <div
                                            className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                                                isSelected
                                                    ? "bg-purple-600 border-purple-600"
                                                    : "border-slate-300"
                                            }`}
                                        >
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
                            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSaveRoles}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                Salvar Funções
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Companies Table ───────────────────────────────── */}
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
                        <div className="flex justify-center p-8">
                            <Loader2 className="animate-spin h-8 w-8 text-purple-600" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">Logo</TableHead>
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
                                        <TableCell
                                            colSpan={6}
                                            className="text-center text-slate-500 py-8"
                                        >
                                            Nenhuma empresa encontrada.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {filtered.map(company => (
                                    <TableRow key={company.id}>
                                        {/* Logo column */}
                                        <TableCell>
                                            {(company as any).logo_url ? (
                                                <img
                                                    src={(company as any).logo_url}
                                                    alt={company.name}
                                                    className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                                />
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                                                    <Building2 className="h-4 w-4 text-purple-500" />
                                                </div>
                                            )}
                                        </TableCell>

                                        <TableCell className="font-medium">{company.name}</TableCell>

                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">
                                                {planLabel(company.plan)}
                                            </Badge>
                                        </TableCell>

                                        <TableCell>
                                            <Badge className={statusBadgeClass(company.status)}>
                                                {statusLabel(company.status)}
                                            </Badge>
                                        </TableCell>

                                        <TableCell>
                                            {new Date(company.created_at).toLocaleDateString()}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(company)}
                                                    title="Editar Empresa"
                                                >
                                                    <Pencil className="h-4 w-4 mr-1" /> Editar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenUsers(company)}
                                                    title="Gerenciar Usuários"
                                                >
                                                    <Users className="h-4 w-4 mr-1" /> Usuários
                                                </Button>
                                                {company.status === "active" ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-red-500 hover:text-red-700"
                                                        onClick={() => toggleStatus(company.id, company.status)}
                                                        title="Bloquear"
                                                    >
                                                        <Ban className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-green-600 hover:text-green-700"
                                                        onClick={() => toggleStatus(company.id, company.status)}
                                                        title="Ativar"
                                                    >
                                                        <CheckCircle className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
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
