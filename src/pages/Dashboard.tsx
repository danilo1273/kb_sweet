
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, DollarSign } from "lucide-react";

import { motion } from "framer-motion";

export default function Dashboard() {
    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalStockValue: 0,
        pendingPayments: 0,
        activeOrders: 0,
        monthlyPurchases: 0
    });

    useEffect(() => {
        async function loadDashboardData() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .single();
                setUserName(profile?.full_name || user.email);

                // Fetch Metrics
                const [ingredientsRes, financialRes, ordersRes] = await Promise.all([
                    supabase.from('ingredients').select('stock_danilo, stock_adriel, cost, unit_weight'),
                    supabase.from('financial_movements').select('amount, status, type'),
                    supabase.from('production_orders').select('id', { count: 'exact' }).eq('status', 'open')
                ]);

                // Calculate Stock Value
                const totalStockValue = ingredientsRes.data?.reduce((acc, ing) => {
                    const totalQty = (Number(ing.stock_danilo) || 0) + (Number(ing.stock_adriel) || 0);
                    return acc + (totalQty * (Number(ing.cost) || 0) / (Number(ing.unit_weight) || 1));
                }, 0) || 0;

                // Calculate Pending Payments (Expenses ONLY)
                const pendingPayments = financialRes.data?.reduce((acc, mov) => {
                    if (mov.status === 'pending' && mov.type === 'expense') return acc + Math.abs(Number(mov.amount));
                    return acc;
                }, 0) || 0;

                const monthlyPurchases = financialRes.data?.reduce((acc, mov) => {
                    if (mov.status === 'paid' && mov.type === 'expense') return acc + Math.abs(Number(mov.amount));
                    return acc;
                }, 0) || 0;

                setStats({
                    totalStockValue,
                    pendingPayments,
                    activeOrders: ordersRes.count || 0,
                    monthlyPurchases
                });
            }
            setLoading(false);
        }
        loadDashboardData();
    }, []);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h2>
                    <p className="text-zinc-500">Visão geral do seu negócio.</p>
                </div>
            </div>

            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
            ) : (
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                >
                    <motion.div variants={item}>
                        <Card className="bg-gradient-to-r from-orange-400 to-rose-400 border-none text-white shadow-lg overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <Package className="h-32 w-32" />
                            </div>
                            <CardHeader>
                                <CardTitle className="text-2xl font-bold">
                                    Olá, {userName?.split(' ')[0] || "Confeiteiro"}!
                                </CardTitle>
                                <p className="text-orange-50 font-medium">O que vamos produzir hoje?</p>
                            </CardHeader>
                        </Card>
                    </motion.div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <motion.div variants={item}>
                            <Card className="bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow border-zinc-200 dark:border-zinc-800 h-full">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium text-zinc-500">Valor em Estoque</CardTitle>
                                    <Package className="h-4 w-4 text-orange-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">R$ {stats.totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <p className="text-xs text-zinc-500">Total Danilo + Adriel</p>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div variants={item}>
                            <Card className="bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow border-zinc-200 dark:border-zinc-800 h-full">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium text-zinc-500">Contas a Pagar</CardTitle>
                                    <DollarSign className="h-4 w-4 text-red-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-red-600">R$ {stats.pendingPayments.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <p className="text-xs text-zinc-500">Aguardando baixa financeira</p>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div variants={item}>
                            <Card className="bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow border-zinc-200 dark:border-zinc-800 h-full">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium text-zinc-500">Ordens em Aberto</CardTitle>
                                    <Activity className="h-4 w-4 text-blue-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stats.activeOrders} OPs</div>
                                    <p className="text-xs text-zinc-500">Em processo de execução</p>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div variants={item}>
                            <Card className="bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow border-zinc-200 dark:border-zinc-800 h-full">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium text-zinc-500">Compras (Total Pago)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-green-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600">R$ {stats.monthlyPurchases.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <p className="text-xs text-zinc-500">Total histórico de baixas</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
