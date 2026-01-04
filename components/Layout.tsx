
import React, { useState } from 'react';
import { View } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onNavigate: (view: View) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', icon: 'home', label: 'Visão Geral', color: 'text-primary' },
    { id: 'inventory', icon: 'inventory_2', label: 'Estoque', color: 'text-amber-400' },
    { id: 'sales', icon: 'shopping_cart', label: 'Vendas', color: 'text-blue-400' },
    { id: 'recipes', icon: 'cookie', label: 'Receitas', color: 'text-pink-400' },
    { id: 'receivables', icon: 'account_balance_wallet', label: 'Contas a Receber', color: 'text-emerald-400' },
    { id: 'requests', icon: 'shopping_bag', label: 'Solicitações', color: 'text-purple-400' },
    { id: 'seller-summary', icon: 'person_search', label: 'Resumo Vendedor', color: 'text-indigo-400' },
  ];

  const handleLogout = () => {
    onNavigate('login');
  };

  return (
    <div className="flex h-screen w-full relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-full bg-zinc-800 text-white shrink-0 shadow-2xl z-20">
        <div className="flex items-center h-20 px-6 border-b border-zinc-700/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">cake</span>
            <h1 className="text-2xl font-bold text-primary tracking-tight">KB Sweet</h1>
          </div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as View)}
              className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all group ${
                currentView === item.id ? 'bg-primary/20 text-primary' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === item.id ? '' : `group-hover:${item.color}`} transition-colors`}>
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-zinc-700/50 space-y-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
              AB
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-white">Ana Beatriz</p>
              <p className="text-xs text-zinc-400">Gerente</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center w-full gap-3 px-4 py-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            <span className="text-sm font-bold">Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 h-full overflow-y-auto bg-background-light dark:bg-background-dark relative w-full">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white capitalize">
              {navItems.find(i => i.id === currentView)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="h-9 w-9 rounded-full bg-slate-200 overflow-hidden border border-slate-300" onClick={handleLogout}>
            <img src="https://picsum.photos/100/100?random=1" alt="Profile" className="h-full w-full object-cover" />
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <aside 
              className="w-64 h-full bg-zinc-800 text-white p-4 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8 pr-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">cake</span>
                  <span className="text-primary font-bold text-xl">KB Sweet</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <nav className="flex-1 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id as View); setIsMobileMenuOpen(false); }}
                    className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all ${
                      currentView === item.id ? 'bg-primary/20 text-primary' : 'text-zinc-400'
                    }`}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="pt-4 mt-auto border-t border-zinc-700/50">
                <button 
                  onClick={handleLogout}
                  className="flex items-center w-full gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                >
                  <span className="material-symbols-outlined">logout</span>
                  <span className="font-bold">Sair</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {children}
      </main>
    </div>
  );
};

export default Layout;
