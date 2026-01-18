
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, DollarSign, TrendingDown, AlertTriangle, ArrowRight, ShoppingBag, Zap, ShoppingCart, Landmark } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [isFinancialUser, setIsFinancialUser] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        async function loadDashboardData() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Fetch logged-in user roles
                const { data: myProfile } = await supabase.from('profiles').select('roles, role').eq('id', user.id).single();
                const myRoles = myProfile?.roles || (myProfile?.role ? [myProfile.role] : []) || [];
                const isFin = myRoles.some((r: string) => ['admin', 'super_admin', 'financial'].includes(r));
                setIsFinancialUser(isFin);

                // Fetch Bank Accounts (Only for authorized users)
                if (isFin) {
                    const { data: banks } = await supabase.from('bank_accounts').select('id, name, balance').order('name');
                    if (banks) setBankAccounts(banks);
                }

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
                    supabase.from('products').select('*, product_stocks(quantity, location_id)'),
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
                // Stock Value (Ingredients)
                const totalIngredientsValue = ingredientsRes.data?.reduce((acc, ing) => {
                    const stockEntries = ing.product_stocks || [];
                    let qty = 0;
                    let cost = 0;
                    if (stockEntries.length > 0) {
                        qty = stockEntries.reduce((sAcc: number, s: any) => sAcc + (Number(s.quantity) || 0), 0);
                        // Using weighted average cost or just first available for simplicity here
                        cost = stockEntries[0]?.average_cost || Number(ing.cost) || 0;
                    } else {
                        qty = (Number(ing.stock_danilo) || 0) + (Number(ing.stock_adriel) || 0);
                        cost = Number(ing.cost_danilo) || Number(ing.cost_adriel) || Number(ing.cost) || 0;
                    }
                    return acc + (qty * cost);
                }, 0) || 0;

                // Finished Goods - Asset Value (Custo)
                const finishedProducts = productsRes.data || [];
                let totalFinishedStockUnits = 0;
                const stockAssetValue = finishedProducts.reduce((acc, p) => {
                    const stockEntries = p.product_stocks || [];
                    let qty = 0;
                    let cost = Number(p.cost) || 0;

                    if (stockEntries.length > 0) {
                        qty = stockEntries.reduce((sAcc: number, s: any) => sAcc + (Number(s.quantity) || 0), 0);
                        // If cost is 0 in product table, try average_cost in stocks
                        if (cost === 0) cost = stockEntries[0]?.average_cost || 0;
                    } else {
                        qty = (Number(p.stock_quantity) || 0);
                    }

                    totalFinishedStockUnits += qty;
                    return acc + (qty * cost);
                }, 0);

                const totalStockValue = totalIngredientsValue + stockAssetValue;

                // Pending Financials
                const { data: allPending } = await supabase.from('financial_movements').select('amount, type, status').eq('status', 'pending');
                const pendingPayments = allPending?.filter(m => m.type === 'expense').reduce((acc, m) => acc + Number(m.amount), 0) || 0;
                const pendingReceivables = allPending?.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0) || 0;

                // Current Month Stats
                const now = new Date();
                const currentMonthMovements = financialRes.data?.filter(m => {
                    const refDate = m.status === 'paid' ? m.payment_date : m.due_date;
                    const d = new Date(refDate || m.created_at);
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }) || [];

                const monthlyPurchases = currentMonthMovements.filter(m => m.type === 'expense' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);
                const monthlySalesIncome = currentMonthMovements.filter(m => m.type === 'income' && m.status === 'paid').reduce((acc, m) => acc + Number(m.amount), 0);

                // Sales Data Processing
                // Volume
                const currentMonthSales = salesData.filter(s => {
                    const d = new Date(s.created_at);
                    const isSameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    return isSameMonth;
                });
                const monthlySalesTotal = currentMonthSales.reduce((acc, s) => acc + Number(s.total), 0);

                // Net Profit
                // const netProfit = monthlySalesIncome - monthlyPurchases; // Unused for now

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
                    projectedSalesValue: stockAssetValue,
                    totalFinishedStock: totalFinishedStockUnits
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
        <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-50 dark:bg-zinc-950 min-h-screen overflow-x-hidden font-sans">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                        Painel de Controle
                    </h2>
                    <p className="text-zinc-500 font-medium">Visão geral e performance do negócio.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => navigate('/production')} className="border-purple-200 text-purple-700 hover:bg-purple-50">
                        <Zap className="mr-2 h-4 w-4" /> Nova Produção
                    </Button>
                    <Button onClick={() => navigate('/pos')} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all">
                        <ShoppingBag className="mr-2 h-4 w-4" /> Nova Venda
                    </Button>
                </div>
            </div>

            <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">

                {/* 1. KEY METRICS ROW - PREMIUM DESIGN */}
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">

                    {/* Estoque Acabado */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-lg shadow-purple-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold uppercase opacity-90 tracking-wider">Estoque Acabado</CardTitle>
                                <Package className="h-4 w-4 text-purple-100 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    R$ {stats.projectedSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-purple-100 opacity-80 mt-1 font-medium">{stats.totalFinishedStock} un. em estoque (Custo)</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Vendas (Mês) */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold uppercase opacity-90 tracking-wider">Vendas (Mês)</CardTitle>
                                <ShoppingBag className="h-4 w-4 text-blue-100 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    R$ {stats.monthlySales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-blue-100 opacity-80 mt-1 font-medium">Total vendido (Faturado)</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Recebido */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold uppercase opacity-90 tracking-wider">Recebido (Mês)</CardTitle>
                                <DollarSign className="h-4 w-4 text-emerald-100 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    R$ {stats.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-emerald-100 opacity-80 mt-1 font-medium">Entradas confirmadas</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Pago */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold uppercase opacity-90 tracking-wider">Pago (Mês)</CardTitle>
                                <TrendingDown className="h-4 w-4 text-rose-100 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    R$ {stats.monthlyPurchases.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-rose-100 opacity-80 mt-1 font-medium">Saídas confirmadas</p>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* A Receber */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold uppercase opacity-90 tracking-wider">A Receber</CardTitle>
                                <Activity className="h-4 w-4 text-amber-100 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    R$ {stats.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <div
                                    className="flex items-center gap-1 mt-1 cursor-pointer hover:bg-white/10 p-0.5 rounded px-1 -ml-1 transition-colors w-fit"
                                    onClick={() => isFinancialUser ? navigate('/financial') : toast({
                                        variant: "destructive",
                                        title: "Acesso Negado",
                                        description: "Você não tem permissão para acessar a rotina financeira."
                                    })}
                                >
                                    <p className="text-xs text-amber-100 opacity-90 font-medium">Ver pendentes</p>
                                    <ArrowRight className="h-3 w-3 text-amber-100" />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* A Pagar */}
                    <motion.div variants={itemVariant}>
                        <Card className="hover:shadow-xl transition-all duration-300 border-none bg-white text-zinc-800 shadow-md border-zinc-200 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-100 rounded-bl-full -mr-8 -mt-8 z-0 group-hover:bg-red-200 transition-colors"></div>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                                <CardTitle className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">A Pagar</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <div className="text-2xl font-bold tracking-tight text-zinc-900">
                                    R$ {Math.abs(stats.pendingPayments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <div
                                    className="flex items-center gap-1 mt-1 cursor-pointer hover:underline decoration-red-300 w-fit"
                                    onClick={() => isFinancialUser ? navigate('/financial') : toast({
                                        variant: "destructive",
                                        title: "Acesso Negado",
                                        description: "Você não tem permissão para acessar a rotina financeira."
                                    })}
                                >
                                    <p className="text-xs text-red-500 font-medium">Ver contas</p>
                                    <ArrowRight className="h-3 w-3 text-red-500" />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* 1.5 BANK ACCOUNTS SECTION */}
                {isFinancialUser && bankAccounts.length > 0 && (
                    <motion.div variants={itemVariant} className="flex flex-wrap gap-4">
                        {bankAccounts.map(acc => (
                            <Card key={acc.id} className="min-w-[200px] flex-1 hover:shadow-md transition-all border-l-4 border-l-blue-500 bg-white shadow-sm">
                                <CardContent className="p-4 py-3 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">{acc.name}</p>
                                        <p className="text-xl font-black text-zinc-800">
                                            R$ {Number(acc.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-blue-50 p-2 rounded-full">
                                        <Landmark className="h-5 w-5 text-blue-500" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </motion.div>
                )}

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
                    <Card className="shadow-sm overflow-hidden border-amber-100 bg-white">
                        <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-amber-600 fill-amber-600" />
                                    Produção do Mês
                                </CardTitle>
                                <Badge variant="outline" className="bg-white/80 text-amber-700 border-amber-200">
                                    Ativo
                                </Badge>
                            </div>
                            <CardDescription className="text-amber-700/70 font-medium">Performance de Fabricação</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-amber-100/50">
                                {productionPerformance.length === 0 ? (
                                    <div className="text-sm text-zinc-400 text-center py-8">Sem produção no mês</div>
                                ) : (
                                    productionPerformance.map((user: any, i: number) => (
                                        <div key={i} className="p-4 hover:bg-amber-50/30 transition-colors">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center text-sm font-bold text-amber-800 border-2 border-white shadow-sm">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-zinc-800 text-sm leading-none">{user.name}</span>
                                                        <span className="text-[11px] text-amber-600 mt-1 font-medium flex items-center gap-1">
                                                            <ShoppingCart className="h-3 w-3" />
                                                            {user.count} ordens finalizadas
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-black text-zinc-900">
                                                        R$ {user.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[9px] text-zinc-400 uppercase tracking-tighter font-bold">Valor Produzido</div>
                                                </div>
                                            </div>
                                            {/* Product Detailed List */}
                                            {user.itemsList && user.itemsList.length > 0 && (
                                                <div className="ml-13 pl-1 text-[11px] space-y-1.5 mt-2 border-l-2 border-amber-100/50">
                                                    {user.itemsList.slice(0, 3).map((item: any, idx: number) => (
                                                        <div key={idx} className="flex justify-between text-zinc-600 px-2 py-0.5 rounded hover:bg-amber-50 group transition-all">
                                                            <span className="group-hover:text-amber-800 transition-colors">{item.name}</span>
                                                            <span className="font-bold text-zinc-800">{item.qty} {item.unit}</span>
                                                        </div>
                                                    ))}
                                                    {user.itemsList.length > 3 && (
                                                        <div className="text-[10px] text-amber-600/70 italic px-2 pt-1 font-medium italic">
                                                            + Ver mais {user.itemsList.length - 3} itens cadastrados
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
