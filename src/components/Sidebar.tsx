import { Link, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    User,
    ShoppingCart,
    Package,
    BookOpen,
    DollarSign,
    ClipboardList,
    LogOut,
    X,
    Factory,
    Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from '@/version';
import { useEffect, useState } from "react";

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const location = useLocation();
    const [roles, setRoles] = useState<string[]>([]);

    useEffect(() => {
        getRoles();
    }, []);

    async function getRoles() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('role, roles').eq('id', user.id).single();
            let userRoles: string[] = [];
            if (data?.roles && Array.isArray(data.roles)) {
                userRoles = data.roles;
            } else if (data?.role) {
                userRoles = [data.role];
            }
            setRoles(userRoles);
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    const allNavItems = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: [] }, // Todos
        { name: "Produção", href: "/production", icon: Factory, roles: ['admin', 'buyer', 'approver'] },
        { name: "Receitas", href: "/recipes", icon: BookOpen, roles: ['admin', 'confeiteiro', 'buyer', 'seller'] },
        { name: "Estoque", href: "/inventory", icon: Package, roles: ['admin', 'buyer', 'approver', 'seller'] },
        { name: "Compras", href: "/purchases", icon: ClipboardList, roles: ['admin', 'buyer', 'approver', 'financial'] },
        { name: "Vendas", href: "/sales", icon: ShoppingCart, roles: ['admin', 'seller'] },
        { name: "Clientes", href: "/clients", icon: User, roles: ['admin', 'seller'] },
        { name: "Financeiro", href: "/financial", icon: DollarSign, roles: ['admin', 'financial'] },
        { name: "Cadastros", href: "/admin/registers", icon: Database, roles: ['admin'] },
        { name: "Usuários", href: "/admin", icon: User, roles: ['admin'] },
        { name: "Perfis", href: "/profile", icon: User, roles: [] }, // Todos
    ];

    const navItems = allNavItems.filter(item => {
        if (item.roles.length === 0) return true;
        // Se o usuário tiver pelo menos uma role permitida
        return item.roles.some(r => roles.includes(r));
    });

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={onClose}
                />
            )}

            <div className={cn(
                "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-zinc-900 text-white shadow-xl transition-transform duration-300 lg:static lg:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex h-24 items-center justify-between border-b border-zinc-800 p-4">
                    <img src="/logo.png" alt="KB Sweet Logo" className="h-16 object-contain" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-400 lg:hidden"
                        onClick={onClose}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                </div>

                <nav className="flex-1 space-y-2 p-4 pt-8 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                onClick={onClose}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-800",
                                    isActive ? "bg-zinc-800 text-primary" : "text-zinc-400"
                                )}
                            >
                                <Icon className="h-5 w-5" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-zinc-800">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-800"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                    </Button>
                    <div className="mt-2 text-center text-xs text-zinc-600">
                        v{APP_VERSION}
                    </div>
                </div>
            </div>
        </>
    );
}
