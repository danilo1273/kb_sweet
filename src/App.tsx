import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { Toaster } from '@/components/ui/toaster';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Profile from '@/pages/Profile';
import Inventory from '@/pages/Inventory';
import Recipes from '@/pages/Recipes';
import Financial from '@/pages/Financial';
import Purchases from '@/pages/Purchases';
import Production from '@/pages/Production';
import { Sidebar } from '@/components/Sidebar';
import { UserProfileHeader } from '@/components/UserProfileHeader';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import AdminLayout from '@/layouts/AdminLayout';
import AdminCompanies from '@/pages/admin/Companies';
import AdminLogin from '@/pages/admin/AdminLogin';
import ErrorBoundary from '@/components/ErrorBoundary';

const CompanySettings = lazy(() => import('@/pages/admin/CompanySettings'));
const AdminRegisters = lazy(() => import('@/pages/AdminRegisters'));
const Clients = lazy(() => import('@/pages/Clients'));
const Sales = lazy(() => import('@/pages/Sales'));
const POS = lazy(() => import('@/pages/POS'));
const Banking = lazy(() => import('@/pages/Banking'));
const StockHistory = lazy(() => import('@/pages/StockHistory'));
const AuditLogs = lazy(() => import('@/pages/AuditLogs'));
const Raffle = lazy(() => import('@/pages/Raffle'));
const Marketing = lazy(() => import('@/pages/Marketing'));

function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return <div className="h-screen w-full flex items-center justify-center bg-zinc-50"><Loader2 className="animate-spin h-8 w-8 text-zinc-400" /></div>;
    }

    return (
        <>
            <Routes>
                <Route path="/login" element={!session ? <Login /> : <Navigate to="/dashboard" />} />
                <Route path="/register" element={!session ? <Register /> : <Navigate to="/dashboard" />} />

                {/* SaaS Admin Portal */}
                <Route path="/admin" element={
                    <ErrorBoundary>
                        <AdminLayout />
                    </ErrorBoundary>
                }>
                    <Route index element={<AdminCompanies />} />
                </Route>
                <Route path="/admin/login" element={!session ? <AdminLogin /> : <Navigate to="/admin" />} />

                <Route element={<ProtectedLayout session={session} />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/profile" element={<Profile />} />

                    <Route path="/clients" element={<Clients />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/pos" element={<POS />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/stock-history" element={<StockHistory />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/financial" element={<Financial />} />
                    <Route path="/banking" element={<Banking />} />
                    <Route path="/purchases" element={<Purchases />} />
                    <Route path="/production" element={<Production />} />
                    <Route path="/raffle" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <Raffle />
                        </Suspense>
                    } />
                    <Route path="/marketing" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <Marketing />
                        </Suspense>
                    } />
                    {/* Old Admin Routes - Commented out to avoid conflict with new SaaS Admin
                    <Route path="/admin/users" element={...} />
                    */}
                    <Route path="/admin/registers" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <AdminRegisters />
                        </Suspense>
                    } />
                    <Route path="/admin/settings" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <CompanySettings />
                        </Suspense>
                    } />
                    <Route path="/audit" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <AuditLogs />
                        </Suspense>
                    } />

                    <Route path="/" element={<Navigate to="/dashboard" />} />
                </Route>
            </Routes>
            <Toaster />
        </>
    );
}

function ProtectedLayout({ session }: { session: Session | null }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (!session) {
        return <Navigate to="/login" />;
    }

    return (
        <div className="flex h-screen bg-zinc-50 w-full overflow-hidden">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="flex flex-1 flex-col overflow-hidden">
                <UserProfileHeader onMenuClick={() => setSidebarOpen(true)} />

                <main className="flex-1 overflow-y-auto w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default App;
