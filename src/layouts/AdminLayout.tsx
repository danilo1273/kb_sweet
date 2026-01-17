
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { LogOut, UserCircle } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";

export default function AdminLayout() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");

    useEffect(() => {
        checkAdmin();
    }, []);

    async function checkAdmin() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigate("/login");
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('roles')
            .eq('id', user.id)
            .single();

        if (!profile?.roles?.includes('super_admin')) {
            // Not admin, send back to regular dashboards
            navigate("/");
        }
        setEmail(user.email || "");
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        navigate("/login");
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Admin Header */}
            <header className="bg-slate-900 text-white p-4 shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <img src="/logo-kb.png" alt="Admin" className="h-8 w-auto mr-2 object-contain" />
                        KB Gestão <span className="text-purple-400 font-light">Admin</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <UserCircle className="h-4 w-4" /> {email}
                        </div>
                        <Button variant="destructive" size="sm" onClick={handleLogout}>
                            <LogOut className="h-4 w-4 mr-2" /> Sair
                        </Button>
                    </div>
                </div>
            </header>

            {/* Admin Content */}
            <main className="flex-1 container mx-auto p-4 md:p-8">
                <Outlet />
            </main>
            <Toaster />
        </div>
    );
}
