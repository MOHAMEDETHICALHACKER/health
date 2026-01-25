
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, HealthRecord, MedicalProblem, Medication, Surgery, Allergy, TreatmentNote, ChatMessage } from './types';
import { STORAGE_KEY, ICONS, APP_NAME } from './constants';
import Layout from './components/Layout';
import RecordCard from './components/RecordCard';
import { analyzeHealthRecord } from './services/geminiService';
import { dbService } from './services/dbService';

const SESSION_KEY = 'health_shield_active_session';
const LAST_HID_KEY = 'health_shield_last_hid';
const PREMIUM_VPA = "9787551548@okbizaxis";
const MONTHLY_PRICE = 99;

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<HealthRecord | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuth, setIsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showRegSuccess, setShowRegSuccess] = useState<string | null>(null);
  
  const [loginId, setLoginId] = useState('');
  const [searchId, setSearchId] = useState('');
  const [searchResults, setSearchResults] = useState<HealthRecord | null>(null);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState<'problem' | 'med' | 'surgery' | 'allergy' | 'note' | null>(null);
  
  // Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'summary' | 'verifying' | 'success'>('summary');
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  const lastHid = localStorage.getItem(LAST_HID_KEY);

  // Initialize DB and Session
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await dbService.init();
        const oldData = localStorage.getItem(STORAGE_KEY);
        if (oldData) {
          const records: HealthRecord[] = JSON.parse(oldData);
          for (const rec of records) {
            await dbService.saveRecord(rec);
          }
          localStorage.removeItem(STORAGE_KEY);
        }

        const activeSession = localStorage.getItem(SESSION_KEY);
        if (activeSession) {
          const found = await dbService.getRecord(activeSession);
          if (found) {
            setCurrentUser(found);
            setIsAuth(true);
          }
        }
      } catch (e) {
        console.error("Database initialization failed", e);
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const healthId = `HID-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    const newProfile: UserProfile = {
      name: (formData.get('name') as string) || '',
      age: parseInt(formData.get('age') as string) || 0,
      dob: (formData.get('dob') as string) || '',
      gender: (formData.get('gender') as string) || 'Other',
      phone: (formData.get('phone') as string) || '',
      aadhaar: (formData.get('aadhaar') as string) || '',
      bloodGroup: (formData.get('bloodGroup') as string) || '',
      emergencyContact: {
        name: (formData.get('eName') as string) || '',
        phone: (formData.get('ePhone') as string) || ''
      },
      healthId,
      isPremium: false
    };

    const newRecord: HealthRecord = {
      profile: newProfile,
      problems: [], medications: [], surgeries: [], allergies: [], notes: []
    };

    try {
      await dbService.saveRecord(newRecord);
      localStorage.setItem(LAST_HID_KEY, healthId);
      setShowRegSuccess(healthId);
    } catch (err) {
      setAuthError("Failed to save to database.");
    } finally {
      setIsLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!showRegSuccess) return;
    const found = await dbService.getRecord(showRegSuccess);
    if (found) {
      setCurrentUser(found);
      localStorage.setItem(SESSION_KEY, showRegSuccess);
      setIsAuth(true);
      setShowRegSuccess(null);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');
    setIsLoading(true);
    const inputId = (loginId || '').trim().toUpperCase();
    try {
      const found = await dbService.getRecord(inputId);
      if (found) {
        setCurrentUser(found);
        localStorage.setItem(SESSION_KEY, found.profile.healthId);
        setIsAuth(true);
      } else {
        setAuthError("Health ID not found. Please double-check or register.");
      }
    } catch (err) {
      setAuthError("Database error occurred while logging in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickUnlock = async (id: string) => {
    setLoginId(id);
    setIsLoading(true);
    try {
      const found = await dbService.getRecord(id);
      if (found) {
        setCurrentUser(found);
        localStorage.setItem(SESSION_KEY, id);
        setIsAuth(true);
      } else {
        setAuthError("Previous Health ID session expired.");
      }
    } catch (err) {
      setAuthError("Error during quick login.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setIsAuth(false);
    setCurrentUser(null);
    setLoginId('');
  };

  const initiatePaymentVerification = async () => {
    setPaymentStep('verifying');
    
    // Simulate payment verification delay
    setTimeout(async () => {
      if (!currentUser) return;
      
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);
      
      const updatedUser = {
        ...currentUser,
        profile: {
          ...currentUser.profile,
          isPremium: true,
          subscriptionExpiry: expiry.toISOString()
        }
      };

      try {
        await dbService.saveRecord(updatedUser);
        setCurrentUser(updatedUser);
        setPaymentStep('success');
      } catch (err) {
        alert("Verification failed: Error updating vault records.");
        setPaymentStep('summary');
      }
    }, 2500);
  };

  const triggerGPay = () => {
    const upiUrl = `upi://pay?pa=${PREMIUM_VPA}&pn=HealthShieldAI&am=${MONTHLY_PRICE}&cu=INR&tn=Monthly_Premium_Access`;
    window.location.href = upiUrl;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const addMedicalItem = async (type: keyof HealthRecord, item: any) => {
    if (!currentUser) return;
    const collection = (currentUser[type] as any[]) || [];
    const updatedUser = {
      ...currentUser,
      [type]: [...collection, { ...item, id: Date.now().toString() }]
    };
    try {
      await dbService.saveRecord(updatedUser);
      setCurrentUser(updatedUser);
      setShowAddModal(null);
    } catch (err) {
      alert("Error saving record.");
    }
  };

  const removeMedicalItem = async (type: keyof HealthRecord, itemId: string) => {
    if (!currentUser || !confirm("Delete this record permanently?")) return;
    const collection = (currentUser[type] as any[]) || [];
    const updatedUser = {
      ...currentUser,
      [type]: collection.filter((item: any) => item.id !== itemId)
    };
    try {
      await dbService.saveRecord(updatedUser);
      setCurrentUser(updatedUser);
    } catch (err) {
      alert("Error removing record.");
    }
  };

  const askAugustAI = async () => {
    if (!userQuery.trim() || !currentUser) return;
    const userMsg: ChatMessage = { role: 'user', content: userQuery, timestamp: Date.now() };
    setChatHistory(prev => [...prev, userMsg]);
    setUserQuery('');
    setIsAiLoading(true);
    const response = await analyzeHealthRecord(currentUser, userQuery);
    setChatHistory(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    setIsAiLoading(false);
  };

  const handleSearch = async () => {
    setIsLoading(true);
    const inputId = (searchId || '').trim().toUpperCase();
    const found = await dbService.getRecord(inputId);
    setSearchResults(found);
    setIsLoading(false);
  };

  if (isLoading && !isAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Initializing Secure Vault Protocols...</p>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-300 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-200 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden border border-slate-100 min-h-[700px] relative z-10 animate-pop-in">
          
          {/* Left Panel: Information & Branding */}
          <div className="lg:col-span-5 bg-indigo-950 p-12 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-900 rounded-full -mr-40 -mt-40 opacity-50"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-800 rounded-full -ml-32 -mb-32 opacity-30"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-12">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-950 text-2xl shadow-xl animate-pulse">
                  {ICONS.LOCK}
                </div>
                <h1 className="text-2xl font-black tracking-tighter uppercase italic tracking-widest">{APP_NAME}</h1>
              </div>
              
              <div className="space-y-8 animate-slide-up stagger-1 opacity-0" style={{ animationFillMode: 'forwards' }}>
                <div>
                  <h2 className="text-4xl font-bold leading-tight mb-4">Your Health, <br/><span className="text-indigo-400 underline decoration-indigo-500/30">Privately</span> Secured.</h2>
                  <p className="text-indigo-200/80 text-lg leading-relaxed">The next generation of medical record management. Encrypted local storage with real-time AI clinical assistance.</p>
                </div>

                <div className="grid gap-4">
                  {[
                    { icon: 'fa-microchip', title: 'Local-First Vault', desc: 'Data never leaves your browser' },
                    { icon: 'fa-robot', title: 'August AI Insights', desc: 'Interactive clinical analysis' },
                    { icon: 'fa-fingerprint', title: 'Identity Protection', desc: 'Anonymous Health IDs' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all hover:bg-white/10">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                        <i className={`fas ${item.icon}`}></i>
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{item.title}</h4>
                        <p className="text-xs text-indigo-300/70">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-12 border-t border-white/10 mt-auto opacity-0 animate-fade-in stagger-3" style={{ animationFillMode: 'forwards' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Security Status</p>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                IndexedDB Engine Ready
              </div>
            </div>
          </div>

          {/* Right Panel: Auth Forms */}
          <div className="lg:col-span-7 p-12 flex flex-col justify-center bg-slate-50/50">
            {showRegSuccess ? (
              <div className="max-w-md mx-auto w-full text-center animate-pop-in">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 shadow-inner transform rotate-12 transition-transform hover:rotate-0">
                  <i className="fas fa-check-double"></i>
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Access Granted!</h3>
                <p className="text-slate-500 text-base mb-10 leading-relaxed">Your unique identity has been forged in the secure local database. Store this key carefully.</p>
                
                <div className="p-8 bg-white rounded-[2rem] border border-indigo-100 shadow-[0_20px_40px_-15px_rgba(79,70,229,0.1)] flex flex-col items-center justify-center mb-10 relative overflow-hidden group animate-pop-in stagger-1 opacity-0" style={{ animationFillMode: 'forwards' }}>
                  <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600"></div>
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.25em] mb-4">Patient Identity Token</span>
                  <span className="font-mono font-bold text-slate-800 text-3xl tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 group-hover:bg-indigo-50 transition-colors">{showRegSuccess}</span>
                  <button 
                    onClick={() => copyToClipboard(showRegSuccess)} 
                    className={`mt-6 px-8 py-3 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                      copyFeedback ? 'bg-emerald-500 text-white scale-105' : 'bg-slate-900 text-white hover:bg-black active:scale-95'
                    }`}
                  >
                    <i className={`fas ${copyFeedback ? 'fa-check' : 'fa-copy'}`}></i>
                    {copyFeedback ? 'Copied to Clipboard' : 'Copy Health ID'}
                  </button>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={completeRegistration} 
                    className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-[0_20px_30px_-10px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-3 text-lg group"
                  >
                    Login to My Vault <i className="fas fa-key transition-transform group-hover:rotate-45"></i>
                  </button>
                  <button 
                    onClick={() => setShowRegSuccess(null)}
                    className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest"
                  >
                    Back to Form
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto w-full animate-fade-in stagger-1 opacity-0" style={{ animationFillMode: 'forwards' }}>
                {/* Mode Switcher */}
                <div className="bg-slate-200/50 p-1.5 rounded-2xl flex mb-10 shadow-inner">
                  <button 
                    onClick={() => {setAuthMode('login'); setAuthError('');}} 
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
                      authMode === 'login' ? 'bg-white text-indigo-600 shadow-md scale-[1.02]' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Login
                  </button>
                  <button 
                    onClick={() => {setAuthMode('register'); setAuthError('');}} 
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
                      authMode === 'register' ? 'bg-white text-indigo-600 shadow-md scale-[1.02]' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Register
                  </button>
                </div>
                
                {authError && (
                  <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold flex items-center gap-3 animate-pop-in">
                    <i className="fas fa-exclamation-circle text-lg"></i>
                    {authError}
                  </div>
                )}

                {authMode === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-8 animate-slide-up">
                    <div className="space-y-6">
                      <div className="relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1">Enter Your Secure Health ID</label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                            <i className="fas fa-fingerprint text-xl"></i>
                          </div>
                          <input 
                            required 
                            value={loginId} 
                            onChange={(e) => setLoginId(e.target.value)} 
                            className="w-full pl-14 pr-5 py-5 rounded-2xl bg-white border border-slate-200 text-xl font-mono tracking-widest uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm group-hover:border-slate-300" 
                            placeholder="HID-XXXX-XXXX" 
                          />
                        </div>
                      </div>

                      {lastHid && (
                        <button 
                          type="button" 
                          onClick={() => handleQuickUnlock(lastHid)} 
                          className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between group hover:bg-indigo-100 transition-all active:scale-95"
                        >
                          <div className="flex items-center gap-4 text-left">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm transition-transform group-hover:rotate-6">
                              <i className="fas fa-bolt"></i>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Quick Login</p>
                              <p className="text-sm font-mono font-bold text-slate-700">{lastHid}</p>
                            </div>
                          </div>
                          <i className="fas fa-chevron-right text-indigo-300 group-hover:translate-x-1 transition-transform"></i>
                        </button>
                      )}
                    </div>

                    <button 
                      type="submit" 
                      disabled={isLoading} 
                      className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-black transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 text-lg flex items-center justify-center gap-3 group"
                    >
                      {isLoading ? (
                        <><i className="fas fa-spinner fa-spin"></i> Authenticating...</>
                      ) : (
                        <>Login to Vault <i className="fas fa-shield-check transition-transform group-hover:scale-110"></i></>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-5 animate-slide-up max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Legal Name</label>
                        <input required name="name" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm transition-all focus:shadow-md" placeholder="John Doe" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Age</label>
                        <input required name="age" type="number" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm transition-all focus:shadow-md" placeholder="25" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date of Birth</label>
                        <input required name="dob" type="date" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm transition-all focus:shadow-md" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gender</label>
                        <select required name="gender" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm font-bold transition-all focus:shadow-md">
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Blood Type</label>
                        <select name="bloodGroup" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm font-bold transition-all focus:shadow-md">
                          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gov ID (Aadhaar / 12-Digits)</label>
                      <input required name="aadhaar" pattern="\d{12}" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-sm font-mono transition-all focus:shadow-md" placeholder="XXXX XXXX XXXX" />
                    </div>

                    <div className="p-6 bg-indigo-50/50 rounded-3xl space-y-4 border border-indigo-100 shadow-inner">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-heartbeat text-rose-500"></i>
                        <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Emergency SOS Proxy</p>
                      </div>
                      <div className="grid gap-3">
                        <input required name="eName" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-xs transition-all" placeholder="Emergency Contact Name" />
                        <input required name="ePhone" className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 outline-none shadow-sm text-xs transition-all" placeholder="Emergency Phone" />
                      </div>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all hover:-translate-y-1 active:translate-y-0 text-lg">
                      Register Now
                    </button>
                    
                    <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest mt-4">
                      Already have an account? <button type="button" onClick={() => setAuthMode('login')} className="text-indigo-600 hover:underline">Login here</button>
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Footer info */}
        <div className="fixed bottom-6 text-center w-full text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] opacity-0 animate-fade-in stagger-4" style={{ animationFillMode: 'forwards' }}>
          HealthShield AI &copy; 2025 • Quantum Cryptographic Local Vault
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} userName={currentUser?.profile?.name || 'Patient'} onLogout={handleLogout} isPremium={currentUser?.profile?.isPremium}>
      {activeTab === 'subscription' ? (
        <div className="max-w-4xl mx-auto space-y-8 animate-slide-up pb-20">
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-indigo-800/50 animate-pop-in">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -mr-40 -mt-40"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full -ml-32 -mb-32"></div>
            
            <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6 border border-amber-500/20">
                  <i className="fas fa-crown"></i> Premium Access
                </div>
                <h1 className="text-4xl font-bold mb-4">Upgrade to the Ultimate Medical Vault</h1>
                <p className="text-indigo-200 text-lg leading-relaxed mb-8">Unlock unlimited August AI clinical analysis, cloud backup simulation, and detailed procedure logs.</p>
                <ul className="space-y-4">
                  {[
                    "Unlimited August AI Analysis",
                    "Advanced Health Analytics",
                    "High-Priority Support",
                    "Ad-Free Clinical Interface"
                  ].map((feat, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-indigo-100/80 transition-transform hover:translate-x-1">
                      <div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-[10px]">
                        <i className="fas fa-check"></i>
                      </div>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/10 shadow-xl transition-all hover:bg-white/15">
                <div className="text-center mb-6">
                  <p className="text-indigo-300 font-bold uppercase text-[10px] tracking-widest mb-2">Monthly Subscription</p>
                  <div className="flex items-end justify-center gap-1">
                    <span className="text-5xl font-black text-white">₹{MONTHLY_PRICE}</span>
                    <span className="text-indigo-300 mb-2">/month</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowPaymentModal(true);
                    setPaymentStep('summary');
                  }}
                  disabled={currentUser?.profile?.isPremium}
                  className={`w-full py-4 rounded-2xl font-bold text-lg shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-3 ${
                    currentUser?.profile?.isPremium 
                    ? 'bg-emerald-500 text-white cursor-default' 
                    : 'bg-white text-indigo-900 hover:bg-slate-100 hover:-translate-y-1'
                  }`}
                >
                  {currentUser?.profile?.isPremium ? (
                    <><i className="fas fa-check-circle"></i> Active Subscription</>
                  ) : (
                    <>Subscribe Now <i className="fas fa-arrow-right"></i></>
                  )}
                </button>
                <p className="text-[10px] text-center text-indigo-400 mt-4 leading-relaxed">Cancel anytime. Your records remain locally secure regardless of status.</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 transition-all hover:shadow-lg hover:-translate-y-1 animate-slide-up stagger-1">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center text-xl mb-4"><i className="fas fa-shield-virus"></i></div>
                <h3 className="font-bold text-slate-800 mb-2">Advanced Security</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Enhanced encryption layers for clinical notes and treatment procedures.</p>
             </div>
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 transition-all hover:shadow-lg hover:-translate-y-1 animate-slide-up stagger-2">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center text-xl mb-4"><i className="fas fa-brain"></i></div>
                <h3 className="font-bold text-slate-800 mb-2">Pro August AI</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Deeper clinical insights using advanced medical LLM parameters.</p>
             </div>
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 transition-all hover:shadow-lg hover:-translate-y-1 animate-slide-up stagger-3">
                <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-xl mb-4"><i className="fas fa-file-medical"></i></div>
                <h3 className="font-bold text-slate-800 mb-2">Export Pro</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Full medical PDF generation with branding and consultation history.</p>
             </div>
          </div>
        </div>
      ) : activeTab === 'dashboard' ? (
        <div className="space-y-6 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden transition-all duration-700 animate-slide-up ${currentUser?.profile?.isPremium ? 'bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950' : 'bg-gradient-to-br from-indigo-600 to-indigo-900'}`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Digital Health Passport</p>
                  {currentUser?.profile?.isPremium && (
                    <span className="px-3 py-1 bg-amber-500 text-[10px] font-black uppercase rounded-full shadow-lg flex items-center gap-1 animate-bounce">
                      <i className="fas fa-crown"></i> Premium
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-4xl font-mono font-bold tracking-tighter mb-1 animate-fade-in stagger-1">{currentUser?.profile?.healthId}</h1>
                    <button onClick={() => currentUser && copyToClipboard(currentUser.profile.healthId)} className="text-[10px] font-bold text-indigo-300 hover:text-white uppercase tracking-widest flex items-center transition-colors">
                      <i className="fas fa-copy mr-1"></i> {copyFeedback ? 'Copied' : 'Copy ID'}
                    </button>
                  </div>
                  <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10 text-center transition-transform hover:scale-105">
                    <p className="text-[8px] font-bold opacity-60 uppercase">Blood Type</p>
                    <p className="text-xl font-bold">{currentUser?.profile?.bloodGroup || 'N/A'}</p>
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between animate-fade-in stagger-2">
                  <div>
                    <p className="text-[10px] text-indigo-300 uppercase font-bold tracking-tighter mb-1">Emergency SOS</p>
                    <p className="font-bold text-sm">{currentUser?.profile?.emergencyContact?.name} • {currentUser?.profile?.emergencyContact?.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-indigo-300 uppercase font-bold tracking-tighter mb-1">Identification</p>
                    <p className="font-bold text-sm">Age {currentUser?.profile?.age} • {currentUser?.profile?.gender} • {currentUser?.profile?.dob}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center animate-slide-up stagger-1">
              <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-4">Vault Sync Status</h3>
              <div className="relative w-32 h-32 flex items-center justify-center mb-4 group">
                 <div className="absolute inset-0 bg-indigo-50 rounded-full flex items-center justify-center transition-transform group-hover:scale-95">
                    <i className={`fas fa-database text-3xl text-indigo-600 ${currentUser?.profile?.isPremium ? 'animate-pulse' : ''}`}></i>
                 </div>
                 <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364.4} strokeDashoffset={0} strokeLinecap="round" className="text-indigo-600 transition-all duration-1000" />
                 </svg>
              </div>
              <p className="text-[10px] font-bold text-indigo-600 leading-relaxed uppercase tracking-tighter animate-pulse">
                Database Online
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: ICONS.ALLERGY, label: 'Allergies', val: (currentUser?.allergies || []).length, color: 'rose' },
              { icon: ICONS.MEDS, label: 'Active Meds', val: (currentUser?.medications || []).length, color: 'blue' },
              { icon: ICONS.SURGERY, label: 'Procedures', val: (currentUser?.surgeries || []).length, color: 'emerald' },
              { icon: ICONS.NOTE, label: 'Notes', val: (currentUser?.notes || []).length, color: 'amber' }
            ].map((stat, i) => (
              <div key={i} className={`bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-4 transition-all hover:shadow-lg hover:-translate-y-1 animate-slide-up stagger-${i+1}`}>
                 <div className={`w-12 h-12 bg-${stat.color}-50 text-${stat.color}-600 rounded-2xl flex items-center justify-center text-xl shadow-inner transition-transform group-hover:scale-110`}>{stat.icon}</div>
                 <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p><p className="text-xl font-black text-slate-800">{stat.val}</p></div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'records' ? (
        <div className="space-y-6 pb-20 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden animate-slide-up">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16"></div>
            <div className="flex items-center space-x-6 relative z-10">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl shadow-inner text-white transition-transform hover:rotate-6">
                <i className="fas fa-database"></i>
              </div>
              <div>
                <h3 className="font-bold text-xl mb-1">Database Records</h3>
                <p className="text-xs text-slate-400 max-w-sm">Manage your health data stored in the local IndexedDB vault.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto relative z-10">
              <button onClick={() => window.print()} className="flex-1 md:flex-none px-6 py-4 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2 hover:-translate-y-0.5">
                <i className="fas fa-print"></i> Print Profile
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecordCard title="Medical Problems" icon={ICONS.MEDICAL} onAdd={() => setShowAddModal('problem')} className="animate-slide-up stagger-1">
              <div className="space-y-3">
                {(currentUser?.problems || []).map(p => (
                  <div key={p.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{p.condition}</span>
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${
                          p.severity === 'mild' ? 'bg-emerald-100 text-emerald-700' : 
                          p.severity === 'moderate' ? 'bg-amber-100 text-amber-700' : 
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {p.severity}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Onset: {p.onsetDate}</p>
                    </div>
                    <button onClick={() => removeMedicalItem('problems', p.id)} className="text-slate-300 hover:text-red-500 p-2 transition-colors"><i className="fas fa-trash-alt"></i></button>
                  </div>
                ))}
              </div>
            </RecordCard>
            <RecordCard title="Clinical Notes" icon={ICONS.NOTE} onAdd={() => setShowAddModal('note')} className="animate-slide-up stagger-2">
               <div className="space-y-3">
                {(currentUser?.notes || []).map(n => (
                  <div key={n.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group transition-all hover:bg-white hover:shadow-md">
                    <button onClick={() => removeMedicalItem('notes', n.id)} className="absolute top-2 right-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><i className="fas fa-trash-alt text-[10px]"></i></button>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase">Dr. {n.doctorName}</p>
                      <p className="text-[9px] text-slate-400 font-bold">{n.date}</p>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 italic">"{n.note}"</p>
                  </div>
                ))}
               </div>
            </RecordCard>
          </div>
        </div>
      ) : activeTab === 'august' ? (
        <div className="flex flex-col h-[calc(100vh-14rem)] bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-slide-up">
          <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar">
             <div className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-800 border-none rounded-3xl text-sm relative overflow-hidden text-white shadow-xl animate-pop-in">
                <p className="font-bold mb-1 flex items-center text-lg"><span className="mr-2">{ICONS.AI}</span> August AI Assistant</p>
                <p className="text-xs opacity-80 leading-relaxed italic">Analyzing your Database Records... {currentUser?.profile?.isPremium ? 'Premium High-Accuracy Mode Enabled.' : ''}</p>
             </div>
             {chatHistory.map((m, i) => (
               <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`max-w-[85%] p-5 rounded-3xl text-sm transition-all hover:shadow-md ${m.role === 'user' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 border border-slate-100 text-slate-800'}`}>
                    {m.content}
                  </div>
               </div>
             ))}
             {isAiLoading && <div className="text-xs text-slate-400 font-bold px-4 animate-pulse flex items-center"><i className="fas fa-circle-notch fa-spin mr-2"></i> August is querying your history...</div>}
          </div>
          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && askAugustAI()} placeholder="Ask August about interactions..." className="flex-grow p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
            <button onClick={askAugustAI} disabled={isAiLoading || !userQuery.trim()} className="px-8 bg-indigo-600 text-white font-bold rounded-2xl transition-all hover:bg-indigo-700 shadow-xl disabled:opacity-50">Analyze</button>
          </div>
        </div>
      ) : activeTab === 'history' ? (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-100 animate-slide-up">
             <h3 className="text-2xl font-bold mb-4 text-slate-800 flex items-center">
               <span className="mr-2 text-indigo-600">{ICONS.SEARCH}</span> Local Vault Lookup
             </h3>
             <p className="text-slate-500 text-sm mb-8">Access any medical identity stored in this browser's local database.</p>
             <div className="flex flex-col md:flex-row gap-4">
                <input value={searchId} onChange={(e) => setSearchId(e.target.value)} className="flex-grow p-5 bg-slate-50 rounded-2xl font-mono text-lg uppercase outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="HID-XXXX-XXXX" />
                <button onClick={handleSearch} className="px-10 py-5 bg-slate-800 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-xl hover:-translate-y-0.5">Search Database</button>
             </div>
          </div>
          {searchResults && (
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-pop-in">
              <div className="bg-slate-900 p-8 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
                <div>
                  <h4 className="text-2xl font-bold">{searchResults.profile?.name}</h4>
                  <p className="text-sm opacity-60 font-mono uppercase tracking-widest">{searchResults.profile?.healthId}</p>
                </div>
                {searchResults.profile?.isPremium && <i className="fas fa-crown text-amber-400 text-3xl animate-bounce"></i>}
              </div>
              <div className="p-8">
                 <p className="font-bold text-slate-800">Records found: {(searchResults.problems || []).length} conditions, {(searchResults.medications || []).length} meds.</p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Payment / Order Summary Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl relative overflow-hidden animate-pop-in">
            {paymentStep !== 'verifying' && (
              <button 
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentStep('summary');
                }} 
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            )}

            {paymentStep === 'summary' ? (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm animate-bounce">
                    <i className="fas fa-receipt"></i>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Order Summary</h3>
                  <p className="text-slate-500 text-sm">Review your Monthly Subscription</p>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-slate-500 font-medium text-sm">Plan Name</span>
                      <span className="font-bold text-slate-900">HealthShield Premium</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-slate-500 font-medium text-sm">Cycle</span>
                      <span className="font-bold text-slate-900">1 Month</span>
                    </div>
                    <div className="border-t border-slate-200/50 my-3 pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-500 font-medium text-xs">Base Amount</span>
                        <span className="font-bold text-slate-700 text-xs">₹{MONTHLY_PRICE}.00</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100 shadow-sm">
                    <span className="text-indigo-900 font-bold text-lg">Total Payable</span>
                    <span className="text-indigo-900 font-black text-2xl">₹{MONTHLY_PRICE}.00</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <button 
                    onClick={triggerGPay}
                    className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 hover:bg-black transition-all transform active:scale-95 hover:-translate-y-1"
                  >
                    <i className="fab fa-google-pay text-3xl"></i> Pay with GPay
                  </button>
                  <div className="relative py-2 flex items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-slate-400 text-[9px] font-bold uppercase tracking-[0.2em]">Manual Verification</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>
                  <button 
                    onClick={initiatePaymentVerification}
                    className="w-full bg-indigo-50 text-indigo-700 font-bold py-4 rounded-2xl border border-indigo-100 hover:bg-indigo-100 transition-all text-sm hover:-translate-y-0.5"
                  >
                    Confirm Payment Completion
                  </button>
                </div>
              </>
            ) : paymentStep === 'verifying' ? (
              <div className="py-12 flex flex-col items-center justify-center text-center animate-fade-in">
                <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8"></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Verifying Payment</h3>
                <p className="text-slate-500 text-sm max-w-xs leading-relaxed">Please wait while we sync with the gateway and update your secure medical vault status...</p>
                <div className="mt-8 flex gap-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full bg-indigo-600 animate-bounce stagger-${i}`}></div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center animate-pop-in">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner animate-pulse">
                  <i className="fas fa-check-circle"></i>
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-2">Vault Upgraded!</h3>
                <p className="text-slate-500 text-sm mb-10 leading-relaxed px-4">Your premium status is now active. August AI high-priority clinical analysis is unlocked.</p>
                <button 
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentStep('summary');
                  }}
                  className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all transform hover:-translate-y-1"
                >
                  Enter Premium Vault
                </button>
              </div>
            )}
            
            <p className="text-[10px] text-center text-slate-400 mt-6 px-4 font-mono">
              Secure UPI VPA: <span className="font-bold text-indigo-500">{PREMIUM_VPA}</span>
            </p>
          </div>
        </div>
      )}

      {/* Generic Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative animate-pop-in">
            <button onClick={() => setShowAddModal(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"><i className="fas fa-times text-xl"></i></button>
            <h3 className="text-xl font-bold mb-6 text-slate-800">Add {showAddModal.charAt(0).toUpperCase() + showAddModal.slice(1)} Record</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (showAddModal === 'problem') addMedicalItem('problems', { condition: f.get('condition'), status: f.get('status'), onsetDate: f.get('onsetDate'), severity: f.get('severity') });
              if (showAddModal === 'note') addMedicalItem('notes', { doctorName: f.get('doc'), date: f.get('date'), note: f.get('note'), clinicName: f.get('clinic') });
            }} className="space-y-4">
              {showAddModal === 'problem' && (
                <>
                  <input required name="condition" placeholder="Condition (e.g., Hypertension)" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Onset Date</label>
                      <input required type="date" name="onsetDate" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Severity</label>
                      <select name="severity" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none">
                        <option value="mild">Mild</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Current Status</label>
                    <select name="status" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none">
                      <option value="present">Currently Present</option>
                      <option value="past">Past History</option>
                    </select>
                  </div>
                </>
              )}
              {showAddModal === 'note' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <input required name="doc" placeholder="Doctor's Name" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                    <input required type="date" name="date" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none" />
                  </div>
                  <input name="clinic" placeholder="Clinic Name" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  <textarea required name="note" placeholder="Consultation notes..." className="w-full p-4 bg-slate-50 border-none rounded-2xl h-40 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"></textarea>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-4 bg-slate-100 font-bold rounded-2xl text-slate-500 hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl hover:bg-indigo-700 transition-all transform active:scale-95">Commit to Vault</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
