
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            toast({
                variant: "destructive",
                title: "Erro ao entrar",
                description: error.message,
            });
            setLoading(false);
            return;
        }

        if (data.user) {
            // Check if user is super_admin
            const { data: profile } = await supabase
                .from('profiles')
                .select('roles')
                .eq('id', data.user.id)
                .single();

            if (profile?.roles?.includes('super_admin')) {
                navigate("/admin");
            } else {
                await supabase.auth.signOut();
                toast({
                    variant: "destructive",
                    title: "Acesso Negado",
                    description: "Esta área é restrita para administradores do sistema.",
                });
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
            <Card className="w-full max-w-md border-slate-700 bg-slate-800 text-slate-100">
                <CardHeader className="space-y-1 flex flex-col items-center">
                    <div className="h-20 w-20 bg-purple-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-900/50">
                        <ShieldCheck className="h-10 w-10 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-center">Acesso Gestão</CardTitle>
                    <CardDescription className="text-center text-slate-400">
                        Painel Administrativo SaaS
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <form onSubmit={handleLogin} className="grid gap-4">
                        <div className="grid gap-2">
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@kbsweet.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-purple-600"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Input
                                id="password"
                                type="password"
                                placeholder="Senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-purple-600"
                            />
                        </div>
                        <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold" type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Acessar Painel
                        </Button>
                    </form>
                    <div className="text-center mt-4">
                        <Button variant="link" className="text-slate-400 hover:text-white" onClick={() => navigate("/login")}>
                            Voltar para Login Clientes
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
