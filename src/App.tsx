
import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { Toaster } from '@/components/ui/toaster';
import Login from '@/pages/Login';
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

const AdminUsers = lazy(() => import('@/pages/AdminUsers'));
const AdminRegisters = lazy(() => import('@/pages/AdminRegisters'));
const Clients = lazy(() => import('@/pages/Clients'));
const Sales = lazy(() => import('@/pages/Sales'));
const POS = lazy(() => import('@/pages/POS'));

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

                <Route element={<ProtectedLayout session={session} />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/profile" element={<Profile />} />

                    <Route path="/clients" element={<Clients />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/pos" element={<POS />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/financial" element={<Financial />} />
                    <Route path="/financial" element={<Financial />} />
                    <Route path="/purchases" element={<Purchases />} />
                    <Route path="/production" element={<Production />} />
                    <Route path="/admin" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <AdminUsers />
                        </Suspense>
                    } />
                    <Route path="/admin/registers" element={
                        <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}>
                            <AdminRegisters />
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
