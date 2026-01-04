
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { User } from "@supabase/supabase-js";
import { Activity, Package, DollarSign } from "lucide-react";

export default function Dashboard() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function getUser() {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setLoading(false);
        }
        getUser();
    }, []);

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h2>
            </div>

            {loading ? (
                <Skeleton className="h-20 w-full mb-4" />
            ) : (
                <Card className="bg-white border-zinc-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold text-zinc-800">
                            Bem-vindo, {user?.email || "Confeiteiro"}!
                        </CardTitle>
                    </CardHeader>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-white shadow-md rounded-lg p-4">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Projetos</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12</div>
                        <p className="text-xs text-muted-foreground">+2 desde o último mês</p>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-md rounded-lg p-4">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Vendas Mensais</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">R$ 2.450,00</div>
                        <p className="text-xs text-muted-foreground">+10% em relação ao mês anterior</p>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-md rounded-lg p-4">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Última Atividade</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Há 2h</div>
                        <p className="text-xs text-muted-foreground">Atualização de estoque</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
