
import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, HealthRecord, ChatMessage, Interaction, MedicalProblem, Medication, Surgery, Allergy, TreatmentNote, GovernmentScheme } from './types';
import { ICONS, APP_NAME } from './constants';
import Layout from './components/Layout';
import RecordCard from './components/RecordCard';
import { analyzeHealthRecord } from './services/geminiService';
import { dbService } from './services/dbService';

const SESSION_KEY = 'health_shield_active_session';
const LAST_HID_KEY = 'health_shield_last_hid';

type ModalType = 'problem' | 'note' | 'medication' | 'surgery' | 'allergy' | null;

const UNIVERSAL_SCHEMES = [
  { id: 'pmjay', name: 'Ayushman Bharat (PM-JAY)', benefits: 'Cashless cover of up to ₹5 lakh per family per year for secondary and tertiary care hospitalization.', eligibility: 'Identified through SECC data or RSBY cards.' },
  { id: 'cghs', name: 'Central Govt Health Scheme', benefits: 'Comprehensive medical care facilities for Central Government employees, pensioners, and their dependents.', eligibility: 'Central government employees and pensioners.' },
  { id: 'state-ma', name: 'State Specific (MA / Aarogyasri)', benefits: 'Varies by state (e.g. up to ₹2.5-5 Lakhs cover for specific surgical procedures).', eligibility: 'Low-income households as defined by state ration cards.' }
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<HealthRecord | null>(null);
  const [allPatients, setAllPatients] = useState<HealthRecord[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuth, setIsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showRegSuccess, setShowRegSuccess] = useState<string | null>(null);
  
  const [loginId, setLoginId] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState<ModalType>(null);

  // Deletion Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: keyof HealthRecord, itemId: string, label: string } | null>(null);

  const [schemeRecommendations, setSchemeRecommendations] = useState<string | null>(null);
  const [isScanningSchemes, setIsScanningSchemes] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await dbService.init();
        const activeSession = localStorage.getItem(SESSION_KEY);
        if (activeSession) {
          const found = await dbService.getRecord(activeSession);
          if (found) {
            setCurrentUser(found);
            setIsAuth(true);
          }
        }
        const records = await dbService.getAllRecords();
        setAllPatients(records);
      } catch (e) {
        console.error("Database initialization failed", e);
      } finally {
        setTimeout(() => setIsLoading(false), 1200);
      }
    };
    bootstrap();
  }, [isAuth]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');
    setIsScanning(true);
    
    const formData = new FormData(e.currentTarget);
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const healthId = `HID-${randomCode}`;
    
    const newProfile: UserProfile = {
      name: (formData.get('name') as string) || '',
      age: parseInt(formData.get('age') as string) || 0,
      dob: (formData.get('dob') as string) || '',
      gender: (formData.get('gender') as string) || 'Other',
      phone: (formData.get('phone') as string) || '',
      aadhaar: (formData.get('aadhaar') as string) || '',
      bloodGroup: (formData.get('bloodGroup') as string) || '',
      healthId,
      isPremium: false,
      subscriptionPlan: 'standard'
    };

    const newRecord: HealthRecord = {
      profile: newProfile,
      problems: [], medications: [], surgeries: [], allergies: [], notes: [], interactions: []
    };

    try {
      await new Promise(r => setTimeout(r, 2000));
      await dbService.saveRecord(newRecord);
      localStorage.setItem(LAST_HID_KEY, healthId);
      setShowRegSuccess(healthId);
    } catch (err) {
      setAuthError("Vault initialization failed.");
    } finally {
      setIsScanning(false);
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
    setIsScanning(true);
    const inputId = (loginId || '').trim().toUpperCase();
    
    try {
      await new Promise(r => setTimeout(r, 1500));
      const found = await dbService.getRecord(inputId);
      if (found) {
        setCurrentUser(found);
        localStorage.setItem(SESSION_KEY, found.profile.healthId);
        setIsAuth(true);
      } else {
        setAuthError("Identity key not recognized. Access denied.");
      }
    } catch (err) {
      setAuthError("Vault synchronization error.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setIsAuth(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  const addMedicalItem = async (type: keyof HealthRecord, item: any) => {
    if (!currentUser) return;
    const collection = (currentUser[type] as any[]) || [];
    const updatedUser = { ...currentUser, [type]: [...collection, { ...item, id: Date.now().toString() }] };
    await dbService.saveRecord(updatedUser);
    setCurrentUser(updatedUser);
    setShowAddModal(null);
  };

  const initiateDeletion = (type: keyof HealthRecord, itemId: string, label: string) => {
    setDeleteTarget({ type, itemId, label });
    setShowDeleteConfirm(true);
  };

  const executeDeletion = async () => {
    if (!currentUser || !deleteTarget) return;
    const { type, itemId } = deleteTarget;
    const collection = (currentUser[type] as any[]) || [];
    const updatedUser = { ...currentUser, [type]: collection.filter((item: any) => item.id !== itemId) };
    await dbService.saveRecord(updatedUser);
    setCurrentUser(updatedUser);
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const askShieldAI = async (customQuery?: string) => {
    const queryToUse = customQuery || userQuery;
    if (!queryToUse.trim() || !currentUser) return;
    
    if (!customQuery) {
        const userMsg: ChatMessage = { role: 'user', content: queryToUse, timestamp: Date.now() };
        setChatHistory(prev => [...prev, userMsg]);
        setUserQuery('');
    }
    
    setIsAiLoading(true);
    
    try {
      const response = await analyzeHealthRecord(currentUser, queryToUse);
      const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: Date.now() };
      setChatHistory(prev => [...prev, aiMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const scanForSchemes = async () => {
    if (!currentUser) return;
    setIsScanningSchemes(true);
    try {
      const prompt = "Please analyze my medical history and suggest specific Indian Government Healthcare schemes (like PM-JAY, state-specific ones) that I am most likely eligible for. Provide a summarized list of coverage and next steps.";
      const response = await analyzeHealthRecord(currentUser, prompt);
      setSchemeRecommendations(response);
    } catch (err) {
      console.error("Scheme scan failed", err);
    } finally {
      setIsScanningSchemes(false);
    }
  };

  const filteredSearchResults = useMemo(() => {
    if (!currentUser || !globalSearchTerm.trim()) return null;
    const term = globalSearchTerm.toLowerCase();
    return {
      problems: (currentUser.problems || []).filter(p => p.condition.toLowerCase().includes(term)),
      medications: (currentUser.medications || []).filter(m => m.name.toLowerCase().includes(term))
    };
  }, [currentUser, globalSearchTerm]);

  if (isLoading && !isAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-indigo-300 font-bold uppercase tracking-widest text-xs">Initializing Vault...</p>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 lg:p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-[20%] left-[10%] w-96 h-96 bg-indigo-600 rounded-full blur-[150px] animate-pulse"></div>
          <div className="absolute bottom-[20%] right-[10%] w-96 h-96 bg-emerald-600 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white/5 backdrop-blur-2xl rounded-[3.5rem] overflow-hidden border border-white/10 shadow-2xl relative z-10">
          <div className="lg:col-span-5 bg-indigo-950 p-12 text-white flex flex-col justify-between relative border-r border-white/5">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-16">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-white text-2xl">{ICONS.LOCK}</div>
                <h1 className="text-2xl font-black uppercase tracking-tighter italic">{APP_NAME}</h1>
              </div>
              <h2 className="text-6xl font-black leading-tight tracking-tighter">Your <span className="text-indigo-400">Vault</span>,<br/>Your <span className="text-indigo-400">Rules</span>.</h2>
              <p className="text-lg text-indigo-200/70 mt-8 font-medium max-w-sm">Clinical history stored strictly on your local device. Decrypt with your unique ID.</p>
            </div>
          </div>
          <div className="lg:col-span-7 bg-slate-50 p-12 lg:p-20 flex flex-col justify-center relative">
            {isScanning && (
              <div className="absolute inset-0 z-50 bg-slate-50/80 backdrop-blur-md flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-black text-slate-800 uppercase tracking-widest text-xs">Authenticating Vault...</p>
              </div>
            )}
            {showRegSuccess ? (
              <div className="max-w-md mx-auto w-full text-center animate-pop-in">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center text-5xl mx-auto mb-8 shadow-xl"><i className="fas fa-id-badge"></i></div>
                <h3 className="text-4xl font-black text-slate-800 tracking-tight mb-4">Vault Created</h3>
                <div className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-indigo-200 mb-10">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Identity Health ID</p>
                  <p className="text-5xl font-mono font-black text-indigo-600 tracking-widest">{showRegSuccess}</p>
                </div>
                <button onClick={completeRegistration} className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] shadow-2xl hover:bg-indigo-600 transition-all uppercase tracking-widest text-lg">Unlock My Vault</button>
              </div>
            ) : (
              <div className="max-w-md mx-auto w-full">
                <div className="relative bg-slate-200 p-1.5 rounded-[2.2rem] flex mb-16 shadow-inner">
                   <button onClick={() => setAuthMode('login')} className={`relative z-10 flex-1 py-4 text-[11px] font-black uppercase tracking-widest rounded-[1.8rem] transition-all ${authMode === 'login' ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-500'}`}>Existing User</button>
                   <button onClick={() => setAuthMode('register')} className={`relative z-10 flex-1 py-4 text-[11px] font-black uppercase tracking-widest rounded-[1.8rem] transition-all ${authMode === 'register' ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-500'}`}>New Patient</button>
                </div>
                {authMode === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-10 animate-slide-in">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity Access Key</label>
                      <input required value={loginId} onChange={(e) => setLoginId(e.target.value.toUpperCase())} placeholder="HID-XXXXXX" className="w-full px-8 py-6 rounded-[2.2rem] bg-white border border-slate-200 text-2xl font-mono uppercase focus:border-indigo-500 outline-none transition-all shadow-sm" />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2.2rem] text-lg hover:bg-indigo-700 shadow-xl transition-all">Secure Login <i className="fas fa-unlock ml-2"></i></button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-6 animate-slide-in max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
                      <input required name="name" placeholder="Full Legal Name" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm font-medium" />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <input required name="age" type="number" placeholder="Age" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm" />
                        <select required name="gender" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm font-bold uppercase">
                          <option value="">Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <select required name="bloodGroup" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm font-bold uppercase">
                          <option value="">Blood Group</option>
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                        </select>
                        <input required name="phone" placeholder="Contact Phone" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm" />
                      </div>

                      <input required name="aadhaar" pattern="[0-9]{12}" placeholder="Aadhaar (12 Digits)" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm" />
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date of Birth</label>
                        <input required name="dob" type="date" className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 outline-none text-sm" />
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 text-white font-black py-6 rounded-[2.5rem] shadow-xl hover:bg-emerald-700 transition-all uppercase tracking-widest">Initialize Vault</button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} userName={currentUser?.profile?.name || 'Patient'} onLogout={handleLogout} isPremium={currentUser?.profile?.isPremium}>
      {activeTab === 'dashboard' ? (
        <div className="space-y-6 animate-pop-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden ${currentUser?.profile?.isPremium ? 'bg-slate-900' : 'bg-indigo-600'}`}>
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-8">Clinical Identity Passport</p>
                <h1 className="text-5xl font-mono font-black mb-12 tracking-wider">{currentUser?.profile?.healthId}</h1>
                <div className="grid grid-cols-3 gap-8">
                  <div><p className="text-[9px] uppercase font-bold opacity-60">Blood Group</p><p className="font-black text-2xl">{currentUser?.profile?.bloodGroup}</p></div>
                  <div><p className="text-[9px] uppercase font-bold opacity-60">Age / Gender</p><p className="font-black text-2xl">{currentUser?.profile?.age} / {currentUser?.profile?.gender.charAt(0)}</p></div>
                  <div><p className="text-[9px] uppercase font-bold opacity-60">Vault Status</p><p className="font-black text-sm uppercase tracking-widest text-emerald-400">Encrypted</p></div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mb-4">{ICONS.SHIELD_CHECK}</div>
              <p className="font-black text-emerald-600 italic">AES-256 Active</p>
              <p className="text-[10px] text-slate-400 mt-2">Data is isolated on your device.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Conditions', val: (currentUser?.problems || []).length, icon: ICONS.MEDICAL },
              { label: 'Medications', val: (currentUser?.medications || []).length, icon: ICONS.MEDS },
              { label: 'Surgeries', val: (currentUser?.surgeries || []).length, icon: ICONS.SURGERY },
              { label: 'Allergies', val: (currentUser?.allergies || []).length, icon: ICONS.ALLERGY },
            ].map((s, i) => (
              <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6 group hover:border-indigo-100 hover:shadow-lg transition-all">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all">{s.icon}</div>
                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p><p className="text-2xl font-black text-slate-800">{s.val}</p></div>
              </div>
            ))}
          </div>
          {/* AI Navigator Section */}
          <div className="bg-indigo-50 rounded-[2.5rem] p-10 border border-indigo-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 text-indigo-100 text-9xl -rotate-12 transition-transform group-hover:rotate-0">
               {ICONS.AI}
            </div>
            <div className="relative z-10">
              <h3 className="text-xl font-black text-indigo-900 mb-4 flex items-center gap-3">
                <i className="fas fa-robot"></i> Shield AI Health Navigator
              </h3>
              <p className="text-sm text-indigo-800/80 font-medium max-w-2xl leading-relaxed">
                Shield AI analyzes your medical history to suggest eligibility for financial aid schemes like PM-JAY and monitor potential medication risks.
              </p>
              <button 
                onClick={() => { setActiveTab('shield'); askShieldAI("What government health schemes am I eligible for based on my medical history?"); }}
                className="mt-8 px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-900/10 hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs"
              >
                Scan My Records with Shield AI
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'records' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-32 animate-pop-in">
          <RecordCard title="Clinical Conditions" icon={ICONS.MEDICAL} onAdd={() => setShowAddModal('problem')}>
            <div className="space-y-6">
              {(currentUser?.problems || []).length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-sm">No conditions recorded in this vault.</div>
              )}
              {(currentUser?.problems || []).map(p => (
                <div key={p.id} className={`p-6 rounded-[2rem] border-2 transition-all hover:scale-[1.02] flex flex-col gap-4 group relative ${
                  p.severity === 'severe' ? 'bg-rose-50/60 border-rose-100' : 
                  p.severity === 'moderate' ? 'bg-amber-50/60 border-amber-100' : 'bg-emerald-50/60 border-emerald-100'
                }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-white shadow-sm border ${
                        p.severity === 'severe' ? 'text-rose-600 border-rose-200' : 
                        p.severity === 'moderate' ? 'text-amber-600 border-amber-200' : 'text-emerald-600 border-emerald-200'
                      }`}>
                        <i className={`fas ${p.status === 'present' ? 'fa-virus-covid' : p.status === 'past' ? 'fa-history' : 'fa-circle-check'}`}></i>
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-lg tracking-tight">{p.condition}</h4>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-white border ${
                          p.status === 'present' ? 'text-rose-500 border-rose-200' : 
                          p.status === 'past' ? 'text-slate-500 border-slate-200' : 'text-emerald-500 border-emerald-200'
                        }`}>{p.status}</span>
                      </div>
                    </div>
                    <button onClick={() => initiateDeletion('problems', p.id, p.condition)} className="text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 p-2"><i className="fas fa-trash-alt"></i></button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/80 p-4 rounded-2xl border border-white/50 flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Severity Level</span>
                      <p className={`text-sm font-black uppercase tracking-wide ${
                        p.severity === 'severe' ? 'text-rose-600' : 
                        p.severity === 'moderate' ? 'text-amber-600' : 'text-emerald-600'
                      }`}>{p.severity}</p>
                    </div>
                    <div className="bg-white/80 p-4 rounded-2xl border border-white/50 flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Onset Date</span>
                      <p className="text-sm font-black text-slate-700">{p.onsetDate}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setActiveTab('shield'); askShieldAI(`Search for Indian Government Health Schemes applicable for ${p.condition} for a ${currentUser?.profile.age} year old ${currentUser?.profile.gender}.`); }}
                    className="mt-2 text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-2"
                  >
                    <i className="fas fa-search-plus"></i> Scan Schemes for this condition
                  </button>
                </div>
              ))}
            </div>
          </RecordCard>
          <RecordCard title="Pharmacy Vault" icon={ICONS.MEDS} onAdd={() => setShowAddModal('medication')}>
             <div className="space-y-6">
              {(currentUser?.medications || []).length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-sm">No active prescriptions logged.</div>
              )}
              {(currentUser?.medications || []).map(m => (
                <div key={m.id} className="p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col gap-5 relative group hover:border-indigo-100 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl shadow-inner border border-indigo-100/50">
                        <i className="fas fa-capsules"></i>
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-lg tracking-tight">{m.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Intake</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => initiateDeletion('medications', m.id, m.name)} className="text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 p-2"><i className="fas fa-trash-alt"></i></button>
                  </div>
                  
                  <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Dosage Schedule</span>
                      <p className="text-sm font-black text-slate-700">{m.dosage} • {m.frequency}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </RecordCard>
          
          <RecordCard title="Treatment Notes" icon={ICONS.NOTE} onAdd={() => setShowAddModal('note')}>
            <div className="space-y-6">
              {(currentUser?.notes || []).length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-sm">No clinical notes available in this vault.</div>
              )}
              {(currentUser?.notes || []).map(n => (
                <div key={n.id} className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4 group relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-slate-800 tracking-tight">Dr. {n.doctorName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{n.category || 'Consultation'}</span>
                        <span className="text-[9px] font-medium text-slate-400">• {n.date}</span>
                      </div>
                    </div>
                    <button onClick={() => initiateDeletion('notes', n.id, `Note from Dr. ${n.doctorName}`)} className="text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 p-2"><i className="fas fa-trash-alt"></i></button>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-600 leading-relaxed italic">"{n.note}"</p>
                    {n.clinicName && (
                      <p className="mt-3 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <i className="fas fa-hospital text-[8px]"></i> {n.clinicName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </RecordCard>

          <RecordCard title="Surgical History" icon={ICONS.SURGERY} onAdd={() => setShowAddModal('surgery')}>
            <div className="space-y-6">
              {(currentUser?.surgeries || []).length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-sm">No surgical records found.</div>
              )}
              {(currentUser?.surgeries || []).map(s => (
                <div key={s.id} className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4 group relative">
                  <div className="flex justify-between items-start">
                    <h4 className="font-black text-slate-800">{s.type}</h4>
                    <button onClick={() => initiateDeletion('surgeries', s.id, s.type)} className="text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 p-2"><i className="fas fa-trash-alt"></i></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[10px] font-bold text-slate-500 uppercase">
                    <div>Facility: {s.hospital}</div>
                    <div>Date: {s.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </RecordCard>
        </div>
      ) : activeTab === 'schemes' ? (
        <div className="space-y-8 pb-32 animate-pop-in">
          <div className="bg-amber-50 rounded-[3rem] p-10 border border-amber-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 text-amber-100 text-9xl -rotate-12">
               {ICONS.SCHEME}
            </div>
            <div className="relative z-10">
              <h3 className="text-2xl font-black text-amber-900 mb-4 tracking-tight flex items-center gap-4">
                Smart Eligibility Scanner
                <span className="text-[10px] bg-amber-600 text-white px-3 py-1 rounded-full uppercase tracking-widest">AI Powered</span>
              </h3>
              <p className="text-amber-800/80 font-medium max-w-2xl leading-relaxed mb-10">
                Shield AI can cross-reference your clinical conditions with 50+ central and state-level healthcare aid schemes to find the best support for you.
              </p>
              
              {!schemeRecommendations ? (
                <button 
                  onClick={scanForSchemes}
                  disabled={isScanningSchemes}
                  className="px-10 py-5 bg-amber-600 text-white font-black rounded-3xl shadow-2xl hover:bg-amber-700 transition-all uppercase tracking-[0.2em] text-xs disabled:opacity-50"
                >
                  {isScanningSchemes ? 'Analyzing Vault Data...' : 'Scan My Eligibility'}
                </button>
              ) : (
                <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] p-8 border border-amber-200 shadow-xl animate-pop-in">
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-[0.3em]">AI Recommendations</p>
                    <button onClick={() => setSchemeRecommendations(null)} className="text-amber-800 opacity-40 hover:opacity-100"><i className="fas fa-redo"></i></button>
                  </div>
                  <div className="text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                    {schemeRecommendations}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {UNIVERSAL_SCHEMES.map(s => (
              <div key={s.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group flex flex-col">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner transition-transform group-hover:scale-110">
                  <i className="fas fa-landmark-dome"></i>
                </div>
                <h4 className="font-black text-lg text-slate-800 mb-4 leading-tight">{s.name}</h4>
                <div className="space-y-4 mb-8 flex-grow">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Benefits</span>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{s.benefits}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Eligibility</span>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{s.eligibility}</p>
                  </div>
                </div>
                <button className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-600">Explore Official Portal</button>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'shield' ? (
        <div className="h-[calc(100vh-14rem)] flex flex-col bg-white rounded-[3rem] p-8 shadow-sm border border-slate-100 overflow-hidden animate-pop-in">
           <div className="flex items-center gap-4 pb-6 border-b border-slate-50">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-2xl shadow-xl">{ICONS.AI}</div>
                <div>
                    <h3 className="font-black text-xl tracking-tight">Shield AI Analyst</h3>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Clinical Analysis Enabled</p>
                </div>
           </div>
           <div className="flex-grow overflow-y-auto space-y-6 my-6 pr-4 custom-scrollbar">
             {chatHistory.length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                 <i className="fas fa-brain text-6xl text-indigo-200 mb-6 animate-pulse"></i>
                 <p className="font-black text-slate-800">Hello! I'm Shield AI.</p>
                 <p className="text-xs text-slate-500 mt-2">Ask me about your condition aid or medication safety.</p>
               </div>
             )}
             {chatHistory.map((m, i) => (
               <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-in`}>
                 <div className={`max-w-[85%] p-6 rounded-[2rem] text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-100 text-slate-800 border border-slate-200/50'}`}>
                   {m.content}
                 </div>
               </div>
             ))}
             {isAiLoading && <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3 ml-2"><i className="fas fa-dna fa-spin text-lg"></i> Analyzing Secure Records...</div>}
           </div>
           <div className="flex gap-3 bg-slate-50 p-3 rounded-[2rem] border border-slate-200">
             <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && askShieldAI()} placeholder="Ask Shield about your health..." className="flex-grow px-6 py-4 bg-transparent outline-none font-medium" />
             <button onClick={() => askShieldAI()} disabled={!userQuery.trim() || isAiLoading} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl shadow-lg flex items-center justify-center transition-all disabled:opacity-30"><i className="fas fa-paper-plane"></i></button>
           </div>
        </div>
      ) : activeTab === 'history' ? (
        <div className="space-y-8 pb-32 animate-pop-in">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3">Vault Search</h3>
            <input value={globalSearchTerm} onChange={(e) => setGlobalSearchTerm(e.target.value)} className="w-full p-6 rounded-3xl bg-slate-50 border border-slate-100 outline-none" placeholder="Search across all clinical records..." />
            {filteredSearchResults && (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSearchResults.problems.map(p => <div key={p.id} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 font-bold">{p.condition}</div>)}
                {filteredSearchResults.medications.map(m => <div key={m.id} className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 font-bold">{m.name}</div>)}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Confirmation Modal for Deletion */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-pop-in border border-slate-200">
             <div className="text-center">
                <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-inner">
                   <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2 tracking-tight">Confirm Deletion</h3>
                <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                  Are you sure you want to permanently remove <span className="font-bold text-slate-800">"{deleteTarget?.label}"</span> from your secure vault? This cannot be undone.
                </p>
                <div className="flex flex-col gap-3">
                   <button 
                     onClick={executeDeletion}
                     className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl shadow-xl hover:bg-rose-700 transition-all uppercase tracking-widest text-[10px]"
                   >
                     Delete Permanently
                   </button>
                   <button 
                     onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
                     className="w-full py-5 bg-slate-100 text-slate-500 font-black rounded-3xl hover:bg-slate-200 transition-all uppercase tracking-widest text-[10px]"
                   >
                     Keep Record
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Add Record Modals */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-10 shadow-2xl animate-pop-in max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="flex items-center gap-4 mb-10">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                    {showAddModal === 'problem' ? ICONS.MEDICAL : 
                     showAddModal === 'medication' ? ICONS.MEDS : 
                     showAddModal === 'allergy' ? ICONS.ALLERGY : 
                     showAddModal === 'note' ? ICONS.NOTE : ICONS.SURGERY}
                </div>
                <div><h3 className="text-2xl font-black tracking-tight capitalize">New {showAddModal === 'note' ? 'Treatment Note' : showAddModal}</h3></div>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (showAddModal === 'problem') {
                addMedicalItem('problems', { 
                  condition: f.get('condition'), 
                  severity: f.get('severity'), 
                  onsetDate: f.get('date'), 
                  status: f.get('status') 
                });
              }
              if (showAddModal === 'medication') addMedicalItem('medications', { name: f.get('name'), dosage: f.get('dosage'), frequency: f.get('freq'), startDate: f.get('date'), status: 'active' });
              if (showAddModal === 'allergy') addMedicalItem('allergies', { substance: f.get('substance'), severity: f.get('severity'), reaction: f.get('reaction'), status: 'active' });
              if (showAddModal === 'surgery') addMedicalItem('surgeries', { type: f.get('type'), date: f.get('date'), hospital: f.get('hospital'), surgeon: f.get('surgeon') });
              if (showAddModal === 'note') {
                addMedicalItem('notes', { 
                  doctorName: f.get('doctorName'), 
                  date: f.get('date'), 
                  clinicName: f.get('clinicName'), 
                  note: f.get('note'),
                  category: f.get('category')
                });
              }
            }} className="space-y-6">
              {showAddModal === 'problem' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Condition Name</label>
                    <input required name="condition" placeholder="e.g. Type 2 Diabetes" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 font-bold transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Onset Date</label>
                      <input required type="date" name="date" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-500 transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Current Status</label>
                      <select name="status" required className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold uppercase text-[10px] tracking-widest focus:border-indigo-500 transition-all">
                        <option value="present">Present</option>
                        <option value="past">Past</option>
                        <option value="recovered">Recovered</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Severity Level</label>
                    <select name="severity" required className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold uppercase text-[10px] tracking-widest focus:border-indigo-500 transition-all">
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                  </div>
                </>
              )}
              {showAddModal === 'note' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Doctor Name</label>
                      <input required name="doctorName" placeholder="Dr. Name" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                      <input required type="date" name="date" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Clinic / Hospital</label>
                      <input name="clinicName" placeholder="Facility Name" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Note Category</label>
                      <select name="category" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold uppercase text-[10px] tracking-widest focus:border-indigo-500">
                        <option value="Consultation">Consultation</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Emergency">Emergency</option>
                        <option value="Surgery">Surgery</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Treatment Note</label>
                    <textarea required name="note" rows={4} placeholder="Summarize the doctor's findings or prescribed treatment..." className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium focus:border-indigo-500 resize-none"></textarea>
                  </div>
                </>
              )}
              {showAddModal === 'medication' && (
                <>
                  <input required name="name" placeholder="Medication Name" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <input required name="dosage" placeholder="Dosage (e.g. 500mg)" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                    <input required name="freq" placeholder="Freq (e.g. Daily)" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                  </div>
                  <input required type="date" name="date" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                </>
              )}
              {showAddModal === 'allergy' && (
                <>
                  <input required name="substance" placeholder="Allergen (e.g. Peanuts)" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <select name="severity" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold uppercase text-[10px] tracking-widest">
                      <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
                    </select>
                    <input name="reaction" placeholder="Reaction (e.g. Skin Rash)" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                  </div>
                </>
              )}
              {showAddModal === 'surgery' && (
                <>
                  <input required name="type" placeholder="Procedure (e.g. Appendectomy)" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <input required type="date" name="date" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                    <input name="surgeon" placeholder="Lead Surgeon" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                  </div>
                  <input required name="hospital" placeholder="Hospital Facility" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
                </>
              )}
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-5 bg-slate-100 rounded-3xl font-black uppercase text-[10px] text-slate-500 transition-colors hover:bg-slate-200">Discard</button>
                <button type="submit" className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl uppercase text-[10px] tracking-widest transition-all hover:bg-indigo-700 hover:shadow-indigo-200">Commit to Vault</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
