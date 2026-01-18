
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, ShoppingBag, Zap } from "lucide-react";
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
        projectedSalesValue: 0,
        totalFinishedStock: 0
    });

    const [financialData, setFinancialData] = useState<any[]>([]);
    const [salesTrend, setSalesTrend] = useState<any[]>([]);
    const [lowStockItems, setLowStockItems] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [buyerPerformance, setBuyerPerformance] = useState<any[]>([]);
    const [productionPerformance, setProductionPerformance] = useState<any[]>([]); // New State

    useEffect(() => {
        async function loadDashboardData() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Remove userName setting

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
                    purchasesRes,
                    productionStatsRes
                ] = await Promise.all([
                    supabase.from('ingredients').select('*'),
                    supabase.from('products').select('*'),
                    supabase.from('financial_movements').select('*').gte('due_date', sixMonthsAgo.toISOString()),
                    supabase.from('production_orders').select('id, status').eq('status', 'open'),
                    // Fetch Sales with Items and Product Cost for Margin Calculation
                    supabase.from('sales').select(`
                        id, total, created_at, user_id, 
                        sale_items (
                            quantity, 
                            unit_price, 
                            product_id,
                            products (name, cost)
                        )
                    `),
                    // Fetch Purchases for Buyer Stats
                    supabase.from('purchase_orders').select(`
                        id, created_by, created_at,
                        purchase_requests (cost, status)
                    `).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
                    // Fetch Production Stats (Closed this month)
                    supabase.from('production_orders').select(`
                        id, quantity, user_id, status, closed_at,
                        products (cost, name, unit, type)
                    `).eq('status', 'closed').gte('closed_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
                ]);

                // --- 1b. Manual Join for Profiles (Sales + Purchases) ---
                const rawSales = salesRes.data || [];
                const rawPurchases = purchasesRes.data || [];

                const userIds = Array.from(new Set([
                    ...rawSales.map((s: any) => s.user_id),
                    ...rawPurchases.map((p: any) => p.created_by)
                ].filter(Boolean)));

                let profilesMap: Record<string, any> = {};
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
                    profiles?.forEach((p: any) => {
                        profilesMap[p.id] = p;
                    });
                }

                // Attach profiles to sales
                const salesData = rawSales.map((s: any) => ({
                    ...s,
                    profiles: profilesMap[s.user_id] || { full_name: 'Desconhecido' }
                }));

                // Attach profiles to purchases & Process Buyer Stats
                const buyerStats: Record<string, number> = {};
                rawPurchases.forEach((order: any) => {
                    const buyerName = profilesMap[order.created_by]?.full_name?.split(' ')[0] || 'Desconhecido';
                    // Sum approved/pending requests (exclude rejected)
                    const orderTotal = order.purchase_requests?.reduce((acc: number, r: any) => {
                        if (r.status !== 'rejected') return acc + (Number(r.cost) || 0);
                        return acc;
                    }, 0) || 0;

                    if (orderTotal > 0) {
                        buyerStats[buyerName] = (buyerStats[buyerName] || 0) + orderTotal;
                    }
                });

                const buyerPerformanceData = Object.entries(buyerStats)
                    .map(([name, total]) => ({ name, total }))
                    .sort((a, b) => b.total - a.total);

                setBuyerPerformance(buyerPerformanceData);

                // Process Production Stats
                const rawProduction = productionStatsRes.data || [];
                const prodStats: Record<string, { count: number, val: number, items: Record<string, { qty: number, unit: string }> }> = {};

                rawProduction.forEach((order: any) => {
                    // FILTER: Only FINISHED products
                    if (order.products?.type !== 'finished') return;

                    const userName = profilesMap[order.user_id]?.full_name?.split(' ')[0] || profilesMap[order.user_id]?.full_name || 'Desconhecido';
                    const qty = Number(order.quantity) || 0;
                    const cost = Number(order.products?.cost) || 0;
                    const totalVal = qty * cost; // Approximated value (Cost based)
                    const prodName = order.products?.name || 'Item Desconhecido';
                    const unit = order.products?.unit || 'un';

                    if (!prodStats[userName]) prodStats[userName] = { count: 0, val: 0, items: {} };
                    prodStats[userName].count += 1;
                    prodStats[userName].val += totalVal;

                    if (!prodStats[userName].items[prodName]) {
                        prodStats[userName].items[prodName] = { qty: 0, unit };
                    }
                    prodStats[userName].items[prodName].qty += qty;
                });

                const productionPerformanceData = Object.entries(prodStats)
                    .map(([name, stats]) => ({
                        name,
                        ...stats,
                        itemsList: Object.entries(stats.items)
                            .map(([pName, details]) => ({ name: pName, ...details }))
                            .sort((a, b) => b.qty - a.qty)
                    }))
                    .sort((a, b) => b.val - a.val);
                setProductionPerformance(productionPerformanceData);

                // --- 2. Calculate KPI Metrics ---

                // Stock Value
                const totalStockValue = (ingredientsRes.data?.reduce((acc, ing) => {
                    return acc + ((Number(ing.stock_danilo) || 0) * (Number(ing.cost_danilo) || 0)) +
                        ((Number(ing.stock_adriel) || 0) * (Number(ing.cost_adriel) || 0));
                }, 0) || 0) + (productsRes.data?.reduce((acc, prod) => {
                    return acc + ((Number(prod.stock_quantity) || 0) * (Number(prod.cost) || 0));
                }, 0) || 0);

                // Finished Products Stats
                const finishedProducts = productsRes.data || [];
                const totalFinishedStock = finishedProducts.reduce((acc, p) => acc + (Number(p.stock_quantity) || 0), 0);
                const projectedSalesValue = finishedProducts.reduce((acc, p) => acc + ((Number(p.stock_quantity) || 0) * (Number(p.price) || 0)), 0);

                // Pending Financials
                const { data: allPending } = await supabase.from('financial_movements').select('amount, type, status').eq('status', 'pending');
                const pendingPayments = allPending?.filter(m => m.type === 'expense').reduce((acc, m) => acc + Number(m.amount), 0) || 0;
                const pendingReceivables = allPending?.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0) || 0;

                // Current Month Stats
                const now = new Date();
                const currentMonthMovements = financialRes.data?.filter(m => {
                    // Start of Fix: Prioritize payment_date for Cash Flow view
                    const refDate = m.status === 'paid' ? m.payment_date : m.due_date;
                    const d = new Date(refDate || m.created_at);
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }) || [];

                const monthlyPurchases = currentMonthMovements.filter(m => m.type === 'expense' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);
                const monthlySalesIncome = currentMonthMovements.filter(m => m.type === 'income' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);

                // Sales Data Processing
                // Sales Data Processing


                // Volume
                const currentMonthSales = salesData.filter(s => {
                    const d = new Date(s.created_at);
                    const isSameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    return isSameMonth;
                });
                const monthlySalesTotal = currentMonthSales.reduce((acc, s) => acc + Number(s.total), 0);

                // Net Profit (Sales Margin Estimate) - More accurate than just cash flow if desired, but let's stick to Cash Flow for the "Net Profit" card for now
                const netProfit = monthlySalesIncome - monthlyPurchases;

                // Avg Ticket
                const avgTicket = currentMonthSales.length > 0 ? (monthlySalesTotal / currentMonthSales.length) : 0;


                // --- 3. Chart & Widget Data Preparation ---

                // A. Financial Trend
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

                // B. Sales by Seller (Margin)
                const sellerStats: Record<string, { revenue: number, cost: number, count: number }> = {};

                salesData.forEach((sale: any) => {
                    // Extract Seller Name safely
                    const sellerName = sale.profiles?.full_name?.split(' ')[0] || 'Desconhecido';

                    if (!sellerStats[sellerName]) {
                        sellerStats[sellerName] = { revenue: 0, cost: 0, count: 0 };
                    }

                    sellerStats[sellerName].count += 1;
                    sellerStats[sellerName].revenue += Number(sale.total);

                    // Calculate Cost for this Sale
                    let saleCost = 0;
                    if (sale.sale_items && Array.isArray(sale.sale_items)) {
                        sale.sale_items.forEach((item: any) => {
                            const productCost = Number(item.products?.cost) || 0;
                            const quantity = Number(item.quantity) || 0;
                            saleCost += (productCost * quantity);
                        });
                    }
                    sellerStats[sellerName].cost += saleCost;
                });

                const sellerPerformanceData = Object.entries(sellerStats).map(([name, stats]) => ({
                    name,
                    revenue: stats.revenue,
                    cost: stats.cost,
                    margin: stats.revenue - stats.cost,
                    marginPercent: stats.revenue > 0 ? ((stats.revenue - stats.cost) / stats.revenue) * 100 : 0,
                    count: stats.count
                })).sort((a, b) => b.revenue - a.revenue);


                // D. Sales Volume Trend
                const dailySales: Record<string, number> = {};
                salesData.forEach((s: any) => {
                    const day = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    dailySales[day] = (dailySales[day] || 0) + 1;
                });
                const salesTrendData = Object.entries(dailySales)
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => {
                        const [da, ma] = a.date.split('/');
                        const [db, mb] = b.date.split('/');
                        return new Date(now.getFullYear(), Number(ma) - 1, Number(da)).getTime() - new Date(now.getFullYear(), Number(mb) - 1, Number(db)).getTime();
                    })
                    .slice(-14);


                // E. Low Stock (Fixing NaN)
                const lowStock = [
                    ...(ingredientsRes.data || []).map(i => ({
                        ...i,
                        isProduct: false,
                        currentStock: Number(i.stock_danilo) // Explicitly cast
                    })),
                    ...(productsRes.data || []).map(p => ({
                        ...p,
                        isProduct: true,
                        currentStock: Number(p.stock_quantity)
                    }))
                ].filter(item => {
                    return !isNaN(item.currentStock) && item.currentStock <= 0;
                }).slice(0, 5);

                setStats({
                    totalStockValue,
                    pendingPayments,
                    pendingReceivables,
                    activeOrders: productionRes.data?.length || 0,
                    monthlyPurchases,
                    monthlySales: monthlySalesTotal,
                    netProfit: monthlySalesIncome,
                    avgTicket,
                    projectedSalesValue,
                    totalFinishedStock
                });

                setFinancialData(chartData);
                setSalesTrend(salesTrendData);
                setLowStockItems(lowStock);

                // Store Seller Performance in 'notifications' state temporarily
                setNotifications(sellerPerformanceData);

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
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-purple-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">Estoque Acabado</CardTitle>
                                <Package className="h-4 w-4 text-purple-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-purple-600">
                                    R$ {stats.projectedSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500">{stats.totalFinishedStock} un. prontas para venda</p>
                            </CardContent>
                        </Card>
                    </motion.div>
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

                    {/* NEW: Total Expense Paid (Month) */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-rose-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-zinc-500">Pago (Mês)</CardTitle>
                                <TrendingDown className="h-4 w-4 text-rose-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-rose-600">
                                    R$ {stats.monthlyPurchases.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-zinc-500">Saídas confirmadas</p>
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
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">
                                    R$ {Math.abs(stats.pendingPayments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                            formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, '']}
                                        />
                                        <Bar dataKey="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* NEW: Seller Performance Widget (Replaces Top Products placement for better visibility, or Stacked?) */}
                    {/* Let's put Seller Performance here instead of Top Products, or split this column */}
                    <Card className="col-span-3 shadow-sm flex flex-col">
                        <CardHeader>
                            <CardTitle>Performance por Vendedor</CardTitle>
                            <CardDescription>Vendas e Margem (30 dias)</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            <div className="space-y-4">
                                {(notifications as any[]).length === 0 ? (
                                    <div className="text-center text-zinc-400 py-10">Sem vendas recentes</div>
                                ) : (
                                    (notifications as any[]).map((seller, i) => (
                                        <div key={i} className="flex flex-col gap-1 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-zinc-800">{seller.name}</span>
                                                <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-100">
                                                    {seller.count} vendas
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between items-center mt-1 text-sm">
                                                <span className="text-zinc-500">Vendido:</span>
                                                <span className="font-medium">R$ {seller.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-zinc-500">Custo:</span>
                                                <span className="text-red-400">R$ {seller.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="mt-2 pt-2 border-t flex justify-between items-center">
                                                <span className="text-xs font-bold text-green-700 uppercase">Margem</span>
                                                <div className="text-right">
                                                    <span className="font-bold text-green-600 text-lg">
                                                        {seller.marginPercent.toFixed(1)}%
                                                    </span>
                                                    <span className="ml-2 text-xs text-green-500">
                                                        (R$ {seller.margin.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})
                                                    </span>
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

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
                                                {Number(item.currentStock).toFixed(1)} {item.unit || 'un'}
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

                    {/* Purchases by Buyer Widget */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-blue-900">Compras (Mês)</CardTitle>
                                <ShoppingBag className="h-4 w-4 text-blue-500" />
                            </div>
                            <CardDescription>Por Comprador</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 mt-2">
                                {buyerPerformance.length === 0 ? (
                                    <div className="text-sm text-zinc-400 text-center py-4">Sem compras no mês</div>
                                ) : (
                                    buyerPerformance.map((buyer: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                                    {buyer.name.charAt(0)}
                                                </div>
                                                <span className="font-medium text-zinc-700 text-sm">{buyer.name}</span>
                                            </div>
                                            <span className="font-bold text-zinc-900 text-sm">
                                                R$ {buyer.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sales Volume Mini-Chart */}
                    <Card className="shadow-sm">
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

                    {/* Production Summary Widget */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-amber-900">Produção (Mês)</CardTitle>
                                <Zap className="h-4 w-4 text-amber-500" />
                            </div>
                            <CardDescription>Valor Produzido</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 mt-2">
                                {productionPerformance.length === 0 ? (
                                    <div className="text-sm text-zinc-400 text-center py-4">Sem produção no mês</div>
                                ) : (
                                    productionPerformance.map((user: any, i: number) => (
                                        <div key={i} className="flex flex-col gap-2 p-2 bg-amber-50/50 rounded-md border border-amber-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-zinc-700 text-sm">{user.name}</span>
                                                        <span className="text-[10px] text-zinc-500">{user.count} produções</span>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-zinc-900 text-sm">
                                                    R$ {user.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            {/* Product Detailed List */}
                                            {user.itemsList && user.itemsList.length > 0 && (
                                                <div className="pl-8 text-xs text-zinc-500 space-y-1">
                                                    {user.itemsList.slice(0, 5).map((item: any, idx: number) => (
                                                        <div key={idx} className="flex justify-between border-b last:border-0 border-amber-100 pb-1 last:pb-0">
                                                            <span>{item.qty} {item.unit} x {item.name}</span>
                                                        </div>
                                                    ))}
                                                    {user.itemsList.length > 5 && (
                                                        <div className="text-[10px] text-zinc-400 italic">
                                                            + {user.itemsList.length - 5} outros itens...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </motion.div>
        </div>
    );
}
