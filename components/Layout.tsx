import React, { useState } from 'react';
import { View } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onNavigate: (view: View) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Alterado o color dos itens para tons quentes e laranjas
  const navItems = [
    { id: 'dashboard', icon: 'home', label: 'Dashboard', color: 'text-orange-500' },
    { id: 'production', icon: 'precision_manufacturing', label: 'Produção', color: 'text-amber-500' },
    { id: 'recipes', icon: 'menu_book', label: 'Receitas', color: 'text-orange-400' },
    { id: 'inventory', icon: 'inventory_2', label: 'Estoque', color: 'text-amber-600' },
    { id: 'purchases', icon: 'shopping_basket', label: 'Compras', color: 'text-orange-300' },
    { id: 'sales', icon: 'shopping_cart', label: 'Vendas', color: 'text-orange-500' },
    { id: 'customers', icon: 'group', label: 'Clientes', color: 'text-amber-400' },
  ];

  const handleLogout = () => {
    onNavigate('login');
  };

  return (
    <div className="flex h-screen w-full relative bg-white">
      {/* Desktop Sidebar - Fundo totalmente preto (bg-neutral-950 ou bg-black) */}
      <aside className="hidden md:flex flex-col w-64 h-full bg-neutral-950 text-white shrink-0 shadow-2xl z-20">
        <div className="flex items-center h-20 px-6 border-b border-neutral-900 bg-white m-4 rounded-xl justify-center shadow-sm">
          {/* Caixa da logo branca com bordas suaves, combinando com o topo do seu print */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-500 text-3xl">cake</span>
            <h1 className="text-xl font-bold text-neutral-900 tracking-tight">KB Sweet</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as View)}
              {/* O item ativo sai do roxo e passa a ser Laranja sólido (bg-orange-600) com texto branco */}
              className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all group ${
                currentView === item.id 
                  ? 'bg-orange-600 text-white font-medium border border-orange-500/20 shadow-lg shadow-orange-600/10' 
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === item.id ? 'text-white' : `group-hover:${item.color}`} transition-colors`}>
                {item.icon}
              </span>
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-neutral-900 space-y-2">
          <button 
            onClick={handleLogout}
            className="flex items-center w-full gap-3 px-4 py-3 text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl transition-all"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            <span className="text-sm font-bold">Sair</span>
          </button>
          <div className="text-center text-[10px] text-neutral-600 pb-2">
            vbeta 1.0.0 2026
          </div>
        </div>
      </aside>

      {/* Main Area - Tela de fundo Branca do painel */}
      <main className="flex-1 h-full overflow-y-auto bg-neutral-50 relative w-full">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur-md border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-neutral-800 hover:bg-neutral-100 rounded-lg"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h2 className="text-lg font-bold text-neutral-800 capitalize">
              {navItems.find(i => i.id === currentView)?.label || 'Dashboard'}
            </h2>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <aside 
              className="w-64 h-full bg-neutral-950 text-white p-4 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8 pr-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-orange-500 text-xl">cake</span>
                  <span className="text-orange-500 font-bold text-xl">KB Sweet</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)}>
                  <span className="material-symbols-outlined text-neutral-400">close</span>
                </button>
              </div>
              <nav className="flex-1 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id as View); setIsMobileMenuOpen(false); }}
                    className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all ${
                      currentView === item.id ? 'bg-orange-600 text-white' : 'text-neutral-400'
                    }`}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {children}
      </main>
    </div>
  );
};

export default Layout;
