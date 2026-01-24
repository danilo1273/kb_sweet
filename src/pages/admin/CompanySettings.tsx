import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Company, Profile, StockLocation } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Edit, Upload } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function CompanySettings() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [company, setCompany] = useState<Company | null>(null);
    const [locations, setLocations] = useState<StockLocation[]>([]);
    const [users, setUsers] = useState<Profile[]>([]);

    // Edit Company State
    const [companyName, setCompanyName] = useState("");
    const [companyLogo, setCompanyLogo] = useState("");
    const [uploading, setUploading] = useState(false);

    // Stock Location State
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
    const [newLocationName, setNewLocationName] = useState("");

    useEffect(() => {
        fetchData();
    }, []);

    async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }

        try {
            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${company?.id}-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage
                .from('company-logos')
                .getPublicUrl(filePath);

            setCompanyLogo(data.publicUrl);
            toast({ title: "Imagem carregada", description: "Clique em Salvar Alterações para confirmar." });
        } catch (error: any) {
            toast({
                title: "Erro no upload",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setUploading(false);
        }
    }

    async function fetchData() {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
            if (!profile?.company_id) return;

            // Fetch Company
            const { data: companyData, error: companyError } = await supabase
                .from('companies')
                .select('*')
                .eq('id', profile.company_id)
                .single();

            if (companyError) throw companyError;
            setCompany(companyData);
            setCompanyName(companyData.name);
            setCompanyLogo(companyData.logo_url || "");

            // Fetch Stock Locations
            const { data: locationData, error: locationError } = await supabase
                .from('stock_locations')
                .select('*')
                .order('created_at', { ascending: true });

            if (locationError) throw locationError;
            setLocations(locationData || []);

            // Fetch Users
            const { data: userData, error: userError } = await supabase
                .from('profiles')
                .select('*')
                .eq('company_id', profile.company_id);

            if (userError) throw userError;
            setUsers(userData || []);

        } catch (error: any) {
            console.error("Error fetching data:", error);
            toast({
                title: "Erro ao carregar dados",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateCompany() {
        if (!company) return;
        try {
            const { error } = await supabase
                .from('companies')
                .update({ name: companyName, logo_url: companyLogo })
                .eq('id', company.id);

            if (error) throw error;

            toast({ title: "Sucesso", description: "Dados da empresa atualizados." });
            setCompany({ ...company, name: companyName, logo_url: companyLogo || undefined });
        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    }

    async function handleSaveLocation() {
        if (!company) return;
        try {
            if (editingLocation) {
                const { error } = await supabase
                    .from('stock_locations')
                    .update({ name: newLocationName })
                    .eq('id', editingLocation.id);
                if (error) throw error;
                toast({ title: "Sucesso", description: "Local atualizado." });
            } else {
                // Generate slug
                const slug = newLocationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

                const { error } = await supabase
                    .from('stock_locations')
                    .insert({
                        company_id: company.id,
                        name: newLocationName,
                        slug: slug,
                        is_default: false
                    });
                if (error) throw error;
                toast({ title: "Sucesso", description: "Local criado com sucesso." });
            }

            setIsLocationDialogOpen(false);
            setEditingLocation(null);
            setNewLocationName("");
            fetchData();
        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    }

    async function handleDeleteLocation(id: string) {
        if (!confirm("Tem certeza? Isso pode afetar produtos que usem este estoque.")) return;
        try {
            const { error } = await supabase.from('stock_locations').delete().eq('id', id);
            if (error) throw error;
            toast({ title: "Sucesso", description: "Local excluído." });
            fetchData();
        } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
    }

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Configurações da Empresa</h1>

            <Tabs defaultValue="company" className="w-full">
                <TabsList>
                    <TabsTrigger value="company">Dados da Empresa</TabsTrigger>
                    <TabsTrigger value="stock">Locais de Estoque</TabsTrigger>
                    <TabsTrigger value="users">Usuários</TabsTrigger>
                </TabsList>

                {/* ABA 1: DADOS DA EMPRESA */}
                <TabsContent value="company">
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações Básicas</CardTitle>
                            <CardDescription>Gerencie o nome e logo da sua empresa.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome da Empresa</Label>
                                <Input
                                    id="name"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="logo">Logo da Empresa</Label>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <div className="relative">
                                            <Input
                                                id="logo"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                                disabled={uploading}
                                                className="cursor-pointer"
                                            />
                                            {uploading && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                                    <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-zinc-500 mt-1">Recomendado: PNG ou JPG, fundo transparente.</p>
                                    </div>
                                    {companyLogo ? (
                                        <div className="h-16 w-16 border rounded flex items-center justify-center p-1 bg-zinc-50 relative group">
                                            <img src={companyLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                                        </div>
                                    ) : (
                                        <div className="h-16 w-16 border border-dashed rounded flex items-center justify-center text-zinc-300">
                                            <Upload className="h-6 w-6" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <Button onClick={handleUpdateCompany} className="mt-4">Salvar Alterações</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ABA 2: ESTOQUES */}
                <TabsContent value="stock">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Locais de Estoque</CardTitle>
                                <CardDescription>Defina onde seus produtos são armazenados (Lojas, Depósitos, etc).</CardDescription>
                            </div>
                            <Button size="sm" onClick={() => {
                                setEditingLocation(null);
                                setNewLocationName("");
                                setIsLocationDialogOpen(true);
                            }}>
                                <Plus className="mr-2 h-4 w-4" /> Novo Local
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Identificador (Slug)</TableHead>
                                        <TableHead>Padrão</TableHead>
                                        <TableHead className="w-[100px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locations.map((loc) => (
                                        <TableRow key={loc.id}>
                                            <TableCell className="font-medium">{loc.name}</TableCell>
                                            <TableCell className="text-zinc-500">{loc.slug}</TableCell>
                                            <TableCell>{loc.is_default ? "Sim" : "Não"}</TableCell>
                                            <TableCell className="flex gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    setEditingLocation(loc);
                                                    setNewLocationName(loc.name);
                                                    setIsLocationDialogOpen(true);
                                                }}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                {!loc.is_default && (
                                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteLocation(loc.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingLocation ? "Editar Local" : "Novo Local de Estoque"}</DialogTitle>
                                <DialogDescription>
                                    Dê um nome para este local de estoque.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-4">
                                <Label htmlFor="loc-name">Nome do Local</Label>
                                <Input
                                    id="loc-name"
                                    value={newLocationName}
                                    onChange={(e) => setNewLocationName(e.target.value)}
                                    placeholder="Ex: Depósito Central"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsLocationDialogOpen(false)}>Cancelar</Button>
                                <Button onClick={handleSaveLocation}>Salvar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* ABA 3: USUÁRIOS (READ ONLY) */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usuários da Empresa</CardTitle>
                            <CardDescription>Lista de usuários que têm acesso a esta conta. A gestão de usuários é feita pelo Admin Geral.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Função (Role)</TableHead>
                                        <TableHead>Acessos</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.full_name || "Sem nome"}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                    {user.role}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1 flex-wrap">
                                                    {user.roles && user.roles.map(r => (
                                                        <span key={r} className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/10">
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
