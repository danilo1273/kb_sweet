
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { User, Loader2, Upload, LogOut, Send } from "lucide-react";

export default function Profile() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string[]>([]);
    const [companyId, setCompanyId] = useState<string | null>(null);

    // Telegram Connection State
    const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
    const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error("Usuário não autenticado");
            setEmail(user.email || "");

            // Fetch profile including company_id, roles, and telegram fields
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('full_name, avatar_url, roles, company_id, telegram_chat_id, telegram_link_code')
                .eq('id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (profile) {
                setFullName(profile.full_name || "");
                setAvatarUrl(profile.avatar_url);
                setUserRole(profile.roles || []);
                setCompanyId(profile.company_id);
                setTelegramChatId(profile.telegram_chat_id || null);
                setTelegramLinkCode(profile.telegram_link_code || null);

                // If user belongs to a company, fetch company details
                if (profile.company_id) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('logo_url')
                        .eq('id', profile.company_id)
                        .single();

                    if (company) {
                        setCompanyLogoUrl(company.logo_url);
                    }
                }
            }
        } catch (error: any) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao carregar perfil", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    async function updateProfile() {
        try {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const updates = {
                id: user.id,
                full_name: fullName,
                avatar_url: avatarUrl,
                updated_at: new Date(),
            };

            const { error } = await supabase.from('profiles').upsert(updates);

            if (error) throw error;

            toast({
                title: "✅ Perfil atualizado com sucesso!",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "❌ Erro ao atualizar perfil. Tente novamente mais tarde.",
                description: error.message,
            });
        } finally {
            setUpdating(false);
        }
    }

    async function generateTelegramCode() {
        try {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const code = Math.floor(100000 + Math.random() * 900000).toString();

            const { error } = await supabase
                .from('profiles')
                .update({ telegram_link_code: code })
                .eq('id', user.id);

            if (error) throw error;

            setTelegramLinkCode(code);
            toast({ title: "Código gerado com sucesso!" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao gerar código", description: error.message });
        } finally {
            setUpdating(false);
        }
    }

    async function unlinkTelegram() {
        try {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const { error } = await supabase
                .from('profiles')
                .update({ telegram_chat_id: null, telegram_link_code: null })
                .eq('id', user.id);

            if (error) throw error;

            setTelegramChatId(null);
            setTelegramLinkCode(null);
            toast({ title: "Telegram desvinculado com sucesso!" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao desvincular", description: error.message });
        } finally {
            setUpdating(false);
        }
    }

    async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            setUpdating(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('Você deve selecionar uma imagem.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            setAvatarUrl(data.publicUrl);

            // Auto-save logic could be added here or rely on "Salvar Alterações"

        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro no upload", description: error.message });
        } finally {
            setUpdating(false);
        }
    }

    async function uploadCompanyLogo(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            if (!companyId) throw new Error("Usuário não vinculado a uma empresa.");
            setUpdating(true);

            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('Você deve selecionar uma imagem.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `company_${companyId}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to 'company-logos' bucket
            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('company-logos').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            // Update Company Record
            const { error: dbError } = await supabase
                .from('companies')
                .update({ logo_url: publicUrl })
                .eq('id', companyId);

            if (dbError) throw dbError;

            setCompanyLogoUrl(publicUrl);
            toast({ title: "Logo da empresa atualizado!" });

        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro no upload do logo", description: error.message });
        } finally {
            setUpdating(false);
        }
    }

    return (
        <div className="flex-1 p-8 min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold tracking-tight">Configurações de Conta</h2>
                <Button variant="destructive" onClick={() => supabase.auth.signOut()} className="gap-2">
                    <LogOut className="h-4 w-4" /> Sair do Sistema
                </Button>
            </div>

            <Tabs defaultValue="account" className="w-full max-w-2xl">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="account">Seu Perfil</TabsTrigger>
                    <TabsTrigger value="company">Empresa</TabsTrigger>
                </TabsList>

                <TabsContent value="account">
                    <Card className="bg-white shadow-sm rounded-xl">
                        <CardHeader>
                            <CardTitle>Perfil</CardTitle>
                            <CardDescription>Gerencie suas informações pessoais.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center gap-6">
                                <Avatar className="h-24 w-24">
                                    <AvatarImage src={avatarUrl || ""} />
                                    <AvatarFallback className="text-2xl"><User /></AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="avatar-upload" className="cursor-pointer">
                                        <div className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-4 py-2 rounded-md font-medium text-sm transition-colors border border-zinc-200">
                                            <Upload className="h-4 w-4" /> Alterar Foto
                                        </div>
                                        <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={updating} />
                                    </label>
                                    <p className="text-xs text-muted-foreground">JPG, GIF ou PNG. Max 1MB.</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Nome Completo</label>
                                    <Input placeholder="Nome Completo" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={updating} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Email</label>
                                    <Input placeholder="Email" type="email" value={email} disabled={true} />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={updateProfile} disabled={updating} className="bg-zinc-900 text-white font-medium hover:bg-zinc-800">
                                {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Alterações
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card className="bg-white shadow-sm rounded-xl mt-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Send className="h-5 w-5 text-sky-500" /> Conexão com o Telegram
                            </CardTitle>
                            <CardDescription>
                                Vincule seu bot do Telegram para registrar vendas, compras e lançamentos financeiros pelo chat.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {telegramChatId ? (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold">✓ Telegram Vinculado!</p>
                                        <p className="text-xs text-emerald-600 mt-1">ID do Chat: {telegramChatId}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={unlinkTelegram} disabled={updating} className="border-emerald-200 text-emerald-800 hover:bg-emerald-100">
                                        Desvincular
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-700">
                                        <p className="font-medium">Como vincular seu Telegram:</p>
                                        <ol className="list-decimal list-inside space-y-1 mt-2 text-xs text-zinc-600">
                                            <li>Inicie uma conversa com seu Bot no Telegram.</li>
                                            <li>Clique em <strong>Gerar Código</strong> abaixo.</li>
                                            <li>Envie o comando no chat do Bot: <code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-900 font-mono">/vincular [código]</code></li>
                                        </ol>
                                    </div>

                                    {telegramLinkCode ? (
                                        <div className="flex flex-col items-center justify-center p-4 bg-sky-50 border border-sky-100 rounded-lg">
                                            <p className="text-xs text-sky-600 font-medium">Seu código de vinculação:</p>
                                            <p className="text-3xl font-bold tracking-widest text-sky-900 mt-2 font-mono">{telegramLinkCode}</p>
                                            <p className="text-[10px] text-sky-500 mt-2">Envie no Telegram: <code className="bg-sky-100 px-1 py-0.5 rounded font-mono text-sky-700">/vincular {telegramLinkCode}</code></p>
                                        </div>
                                    ) : (
                                        <Button onClick={generateTelegramCode} disabled={updating} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium">
                                            {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar Código de Vinculação
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="company">
                    <Card>
                        <CardHeader>
                            <CardTitle>Dados da Empresa</CardTitle>
                            <CardDescription>Personalize a identidade da sua confeitaria.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {companyId ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-6">
                                        <div className="h-24 w-auto min-w-[96px] border rounded-lg flex items-center justify-center bg-zinc-50 p-2">
                                            {companyLogoUrl ? (
                                                <img src={companyLogoUrl} alt="Logo Empresa" className="max-h-full max-w-full object-contain" />
                                            ) : (
                                                <span className="text-xs text-zinc-400 text-center">Sem Logo</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label htmlFor="company-logo-upload" className="cursor-pointer">
                                                <div className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-2 rounded-md font-medium text-sm transition-colors border border-purple-200">
                                                    <Upload className="h-4 w-4" /> Upload Logo
                                                </div>
                                                <input id="company-logo-upload" type="file" accept="image/*" className="hidden" onChange={uploadCompanyLogo} disabled={updating} />
                                            </label>
                                            <p className="text-xs text-muted-foreground">Este logo aparecerá no topo do menu lateral.</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-zinc-500">
                                    <p>Você não está vinculado a nenhuma empresa.</p>
                                    <p className="text-sm">Entre em contato com o suporte.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function PasswordForm() {
    const [newPass, setNewPass] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    async function handleUpdatePass() {
        if (newPass.length < 6) return toast({ variant: 'destructive', title: 'Senha muito curta (min 6)' });
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) {
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
        } else {
            toast({ title: 'Senha atualizada com sucesso!' });
            setNewPass("");
        }
        setLoading(false);
    }

    return (
        <div className="space-y-4 max-w-sm">
            <div className="space-y-2">
                <label className="text-sm font-medium">Nova Senha</label>
                <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} />
            </div>
            <Button onClick={handleUpdatePass} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atualizar Senha
            </Button>
        </div>
    );
}
