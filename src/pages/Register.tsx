
import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const companyId = searchParams.get('company_id');

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    company_id: companyId, // Pass company_id to metadata so trigger can picking it up if configured, or we handle post-signup
                },
            },
        });

        if (error) {
            toast({
                variant: "destructive",
                title: "Erro ao criar conta",
                description: error.message,
            });
            setLoading(false);
        } else {
            // If the trigger doesn't exist to copy metadata to profile, we might need to do it manually here.
            // However, inserting into 'profiles' usually happens via Trigger on auth.users.
            // If the Trigger is naive, it might miss the metadata. 
            // Let's assume we might need to update the profile manually to be safe.
            // But we can't easily update profile if not logged in. 
            // 'signUp' might Auto-Sign-In. If 'autoConfirm' is on.
            // If email confirmation is required, we can't do anything yet.

            toast({
                title: "Conta criada!",
                description: "Verifique seu e-mail ou faça login.",
            });

            navigate("/login");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 flex flex-col items-center">
                    <img src="/logo-kb.png" alt="KB Sweet" className="h-16 w-auto object-contain mb-4" />
                    <CardTitle className="text-2xl font-bold">Crie sua conta</CardTitle>
                    <CardDescription className="text-center">
                        {companyId ? "Cadastre-se para acessar a empresa convidada" : "Cadastre-se para acessar o sistema"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <form onSubmit={handleRegister} className="grid gap-4">
                        <div className="grid gap-2">
                            <Input
                                id="name"
                                type="text"
                                placeholder="Nome Completo"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Input
                                id="email"
                                type="email"
                                placeholder="nome@exemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
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
                            />
                        </div>
                        <Button className="w-full bg-purple-600 hover:bg-purple-700" type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar Conta
                        </Button>
                    </form>

                </CardContent>
                <CardFooter className="flex justify-center">
                    <p className="text-sm text-zinc-500">
                        Já tem conta? <Link to="/login" className="text-blue-600 hover:underline">Entrar</Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
