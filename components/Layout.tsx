
import React, { useState } from 'react';
import { ICONS, APP_NAME } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  userName: string;
  healthId: string;
  role: 'patient' | 'doctor';
  profilePicture?: string;
  isPremium?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onLogout, userName, healthId, role, profilePicture }) => {
  const [copied, setCopied] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: ICONS.DASHBOARD },
    { id: 'records', label: 'Medical Records', icon: ICONS.MEDICAL },
    { id: 'schemes', label: 'Govt Schemes', icon: ICONS.SCHEME },
    { id: 'shield', label: 'Shield AI Chat', icon: ICONS.AI },
  ];

  if (role === 'doctor') {
    navItems.push({ id: 'search', label: 'Patient Index', icon: ICONS.SEARCH });
  } else {
    navItems.push({ id: 'audit', label: 'Security Audit', icon: <i className="fas fa-user-shield"></i> });
  }

  navItems.push({ id: 'settings', label: 'Settings', icon: <i className="fas fa-user-cog"></i> });

  const handleCopy = () => {
    navigator.clipboard.writeText(healthId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 md:min-h-screen flex flex-col">
        <div className="p-6 flex items-center space-x-3 border-b border-slate-100">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xl shadow-md">
            {ICONS.LOCK}
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">{APP_NAME}</span>
        </div>

        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center overflow-hidden">
              {profilePicture ? (
                <img src={profilePicture} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <i className="fas fa-user text-indigo-400"></i>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
              <button onClick={handleCopy} className="text-[10px] text-slate-400 flex items-center gap-1 hover:text-indigo-600 transition-colors">
                <span className="truncate">{healthId}</span>
                <i className={`fas ${copied ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
              </button>
            </div>
          </div>
        </div>

        <nav className="flex-grow p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
          >
            <span>{ICONS.LOGOUT}</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">
            {navItems.find(n => n.id === activeTab)?.label}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
              Secure Session Active
            </div>
          </div>
        </header>

        <div className="p-8 flex-grow overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
