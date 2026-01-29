
import React from 'react';
import { ICONS, APP_NAME } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  userName: string;
  isPremium?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onLogout, userName, isPremium }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: ICONS.DASHBOARD },
    { id: 'records', label: 'Medical Records', icon: ICONS.MEDICAL },
    { id: 'schemes', label: 'Govt Schemes', icon: ICONS.SCHEME },
    { id: 'shield', label: 'Shield AI', icon: ICONS.AI },
    { id: 'history', label: 'Search History', icon: ICONS.SEARCH },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar for Desktop */}
      <aside className="w-full md:w-64 bg-indigo-950 text-white flex-shrink-0 md:min-h-screen shadow-2xl z-40">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-indigo-950 text-xl shadow-lg transform transition-transform hover:rotate-12">
            {ICONS.LOCK}
          </div>
          <h1 className="text-xl font-bold tracking-tight">{APP_NAME}</h1>
        </div>

        <div className="px-4 py-2 mb-6">
          <div className="bg-indigo-900/50 border border-white/5 rounded-2xl p-4 flex items-center space-x-3 relative overflow-hidden group transition-all hover:bg-indigo-900/80">
            {isPremium && (
              <div className="absolute top-0 right-0 p-1">
                <i className="fas fa-crown text-amber-400 text-[10px] animate-bounce"></i>
              </div>
            )}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-transform group-hover:scale-110 ${isPremium ? 'bg-amber-500 text-white' : 'bg-indigo-400'}`}>
              {isPremium ? <i className="fas fa-crown"></i> : ICONS.USER}
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">
                {isPremium ? 'Premium Patient' : 'Standard Access'}
              </p>
              <p className="font-semibold truncate">{userName}</p>
            </div>
          </div>
        </div>

        <nav className="flex-grow px-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 group relative ${
                activeTab === item.id
                  ? 'bg-white text-indigo-950 shadow-lg translate-x-1'
                  : 'text-indigo-100 hover:bg-indigo-900/50 hover:translate-x-1'
              }`}
            >
              <span className={`text-lg transition-transform group-hover:scale-110 ${activeTab === item.id ? 'text-indigo-600' : ''}`}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
              {activeTab === item.id && (
                <div className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-500/10 hover:bg-red-500 text-red-100 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 group"
          >
            <span className="transition-transform group-hover:-translate-x-1">{ICONS.LOGOUT}</span>
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
          <h2 className="text-lg font-semibold text-slate-800 capitalize">
            {navItems.find(n => n.id === activeTab)?.label}
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              Vault Encryption Active
            </div>
          </div>
        </header>

        <div className="p-6 flex-grow overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 flex items-center justify-around py-3 px-1 z-30 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center px-4 py-1 rounded-xl transition-all duration-300 flex-shrink-0 min-w-[64px] ${
              activeTab === item.id ? 'text-indigo-600 scale-110' : 'text-slate-400 opacity-60'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[8px] mt-1 font-bold uppercase tracking-tighter">{item.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Layout;
