
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LineChart,
    Line
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
    const navigate = useNavigate();
    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalStockValue: 0,
        pendingPayments: 0,
        pendingReceivables: 0,
        activeOrders: 0,
        monthlyPurchases: 0,
        monthlySales: 0,
        netProfit: 0,
        avgTicket: 0,
    });

    const [financialData, setFinancialData] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [salesTrend, setSalesTrend] = useState<any[]>([]);
    const [lowStockItems, setLowStockItems] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        async function loadDashboardData() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
                setUserName(profile?.full_name || user.email);

                // --- 1. Fetch Raw Data ---
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // Go back 5 months + current
                sixMonthsAgo.setDate(1); // Start of that month

                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const [
                    ingredientsRes,
                    productsRes,
                    financialRes,
                    productionRes,
                    salesRes,
                    saleItemsRes
                ] = await Promise.all([
                    supabase.from('ingredients').select('*'),
                    supabase.from('products').select('*'),
                    supabase.from('financial_movements').select('*').gte('due_date', sixMonthsAgo.toISOString()),
                    supabase.from('production_orders').select('id, status').eq('status', 'open'),
                    supabase.from('sales').select('id, total, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
                    supabase.from('sale_items').select('product_id, quantity, unit_price, products(name)').gte('created_at', thirtyDaysAgo.toISOString()) // Approximate join
                ]);

                // --- 2. Calculate KPI Metrics ---

                // --- 2. Calculate KPI Metrics ---

                // Stock Value
                const totalStockValue = (ingredientsRes.data?.reduce((acc, ing) => {
                    return acc + ((Number(ing.stock_danilo) || 0) * (Number(ing.cost_danilo) || 0)) +
                        ((Number(ing.stock_adriel) || 0) * (Number(ing.cost_adriel) || 0));
                }, 0) || 0) + (productsRes.data?.reduce((acc, prod) => {
                    // Assuming products separate stock if schema supports, or simplified
                    return acc + ((Number(prod.stock_quantity) || 0) * (Number(prod.cost) || 0));
                }, 0) || 0);

                // Pending Financials (All time pending)
                const { data: allPending } = await supabase.from('financial_movements').select('amount, type, status').eq('status', 'pending');
                const pendingPayments = allPending?.filter(m => m.type === 'expense').reduce((acc, m) => acc + Number(m.amount), 0) || 0;
                const pendingReceivables = allPending?.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0) || 0;

                // Current Month Stats
                const now = new Date();
                const currentMonthMovements = financialRes.data?.filter(m => {
                    const d = new Date(m.due_date || m.payment_date); // Use effective date
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }) || [];

                const monthlyPurchases = currentMonthMovements.filter(m => m.type === 'expense' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);
                const monthlySalesIncome = currentMonthMovements.filter(m => m.type === 'income' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);

                // Sales Volume (Total sold invoices)
                const currentMonthSales = salesRes.data?.filter(s => {
                    const d = new Date(s.created_at);
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }) || [];
                const monthlySalesTotal = currentMonthSales.reduce((acc, s) => acc + Number(s.total), 0);

                // Net Profit (Estimated simplistically: Paid Income - Paid Expense)
                const netProfit = monthlySalesIncome - monthlyPurchases;

                // Avg Ticket (Current Month)
                const avgTicket = currentMonthSales.length > 0 ? (monthlySalesTotal / currentMonthSales.length) : 0;


                // --- 3. Chart Data Preparation ---

                // A. Financial Trend (Last 6 Months)
                const months = [];
                for (let i = 0; i < 6; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.unshift(d);
                }

                const chartData = months.map(date => {
                    const monthKey = date.toLocaleString('pt-BR', { month: 'short' });
                    const mData = financialRes.data?.filter(m => {
                        const d = new Date(m.due_date || m.payment_date);
                        return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear() && m.status === 'paid';
                    });

                    const expense = mData?.filter(m => m.type === 'expense').reduce((acc, m) => acc + Number(m.amount), 0) || 0;
                    const income = mData?.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0) || 0;

                    return { name: monthKey, Receita: income, Despesa: expense };
                });

                // B. Top Products (by Revenue in last 30 days)
                // sale_items doesn't always have date directly, usually linked to sales.
                // For simplicity, we fetched sale_items created_at if available or join manually.
                // Let's assume fetching valid recent sale items succeeded.
                const productPerf: Record<string, number> = {};
                saleItemsRes.data?.forEach((item: any) => {
                    const name = item.products?.name || 'Item';
                    const rev = (item.quantity || 0) * (item.unit_price || 0);
                    productPerf[name] = (productPerf[name] || 0) + rev;
                });

                const topProdData = Object.entries(productPerf)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5);

                // C. Sales Volume Trend (Last 30 Days)
                const dailySales: Record<string, number> = {};
                salesRes.data?.forEach(s => {
                    const day = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    dailySales[day] = (dailySales[day] || 0) + 1;
                });

                const salesTrendData = Object.entries(dailySales)
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => { // Proper Date Sort
                        const [da, ma] = a.date.split('/');
                        const [db, mb] = b.date.split('/');
                        return new Date(2025, Number(ma) - 1, Number(da)).getTime() - new Date(2025, Number(mb) - 1, Number(db)).getTime();
                    })
                    .slice(-14); // Last 14 active days


                // --- 4. Alerts & Notifications ---

                // Low Stock
                const lowStock = [
                    ...(ingredientsRes.data || []).map(i => ({ ...i, isProduct: false })),
                    ...(productsRes.data || []).map(p => ({ ...p, isProduct: true }))
                ].filter(item => {
                    const qty = Number(item.stock_danilo || item.stock_quantity || 0);
                    // Let's grab those with 0 or very low
                    return qty <= 0; // Simple "Out of stock" check for now
                }).slice(0, 5); // Metrics

                // Upcoming Bills (Next 3 days)
                const upcomingBills = allPending?.filter(m => m.type === 'expense' && m.status === 'pending') || [];

                setStats({
                    totalStockValue,
                    pendingPayments,
                    pendingReceivables,
                    activeOrders: productionRes.data?.length || 0,
                    monthlyPurchases,
                    monthlySales: monthlySalesTotal, // Now strictly Sales Volume
                    netProfit: monthlySalesIncome,   // Using netProfit slot for 'Received' temporarily or adding new field logic
                    avgTicket
                });

                setFinancialData(chartData);
                setTopProducts(topProdData);
                setSalesTrend(salesTrendData);
                setLowStockItems(lowStock);

            }
            setLoading(false);
        }
        loadDashboardData();
    }, []);

    const container = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariant = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    if (loading) return <div className="p-8 space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>;

    return (
        <div className="flex-1 p-4 md:p-8 space-y-8 bg-zinc-50 dark:bg-zinc-950 min-h-screen overflow-x-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h2>
                    <p className="text-zinc-500">Visão geral e performance do negócio.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/production')}>Nova Produção</Button>
                    <Button onClick={() => navigate('/pos')}>Nova Venda</Button>
                </div>
            </div>

            <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">

                {/* 1. KEY METRICS ROW */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">Vendas (Mês)</CardTitle>
                                <ShoppingBag className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    R$ {stats.monthlySales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500">Total vendido (Faturado)</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">Recebido (Mês)</CardTitle>
                                <DollarSign className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">
                                    R$ {stats.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500">Entradas confirmadas</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">A Receber (Pend)</CardTitle>
                                <Activity className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">
                                    R$ {stats.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500 cursor-pointer hover:underline" onClick={() => navigate('/financial')}>
                                    Ver a receber &rarr;
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-red-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">A Pagar (Total)</CardTitle>
                                <TrendingDown className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">
                                    R$ {stats.pendingPayments.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500 cursor-pointer hover:underline" onClick={() => navigate('/financial')}>
                                    Ver contas pendentes &rarr;
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* 2. CHARTS ROW */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                    {/* Financial Chart (Big) */}
                    <Card className="col-span-4 shadow-sm">
                        <CardHeader>
                            <CardTitle>Fluxo de Caixa</CardTitle>
                            <CardDescription>Receitas vs Despesas (Últimos 6 meses)</CardDescription>
                        </CardHeader>
                        <CardContent className="pl-2">
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={financialData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="name" stroke="#9CA3AF" tickLine={false} axisLine={false} />
                                        <YAxis stroke="#9CA3AF" tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                                        <Tooltip
                                            cursor={{ fill: '#F3F4F6' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(value: number) => [`R$ ${value.toFixed(2)}`, '']}
                                        />
                                        <Bar dataKey="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top Products (Side) */}
                    <Card className="col-span-3 shadow-sm">
                        <CardHeader>
                            <CardTitle>Top 5 Produtos</CardTitle>
                            <CardDescription>Por faturamento (30 dias)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {topProducts.length === 0 ? (
                                    <div className="text-center text-zinc-400 py-10">Sem dados de vendas recentes</div>
                                ) : (
                                    topProducts.map((prod, i) => (
                                        <div key={i} className="flex items-center">
                                            <div className="w-full space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-zinc-700 truncate max-w-[180px]">{prod.name}</span>
                                                    <span className="text-sm font-bold text-zinc-900">R$ {prod.value.toFixed(0)}</span>
                                                </div>
                                                <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full"
                                                        style={{ width: `${(prod.value / topProducts[0].value) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 3. ALERTS & LISTS ROW */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                    {/* Low Stock Alert */}
                    <Card className="shadow-sm border-red-100">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-red-700">Estoque Crítico</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </div>
                            <CardDescription>Itens zerados ou acabando</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 mt-2">
                                {lowStockItems.length === 0 ? (
                                    <div className="text-sm text-green-600 flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> Estoque saudável!</div>
                                ) : (
                                    lowStockItems.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm p-2 bg-red-50 rounded-md">
                                            <span className="font-medium text-red-900 truncate max-w-[150px]">{item.name}</span>
                                            <Badge variant="destructive" className="h-5 text-[10px]">
                                                {Number(item.stock_danilo || item.stock_quantity).toFixed(1)} {item.unit || 'un'}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                                {lowStockItems.length > 0 && (
                                    <Button variant="link" className="text-red-500 p-0 h-auto text-xs mt-2" onClick={() => navigate('/inventory')}>
                                        Ver inventário completo &rarr;
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sales Volume Mini-Chart */}
                    <Card className="md:col-span-2 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold">Volume de Vendas</CardTitle>
                            <CardDescription>Vendas por dia (últimas 2 semanas)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[150px] w-full mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={salesTrend}>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </motion.div>
        </div>
    );
}
