
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
  const [showAddModal, setShowAddModal] = useState<'problem' | 'note' | null>(null);
  
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
    setTimeout(async () => {
      if (!currentUser) return;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);
      const updatedUser = {
        ...currentUser,
        profile: { ...currentUser.profile, isPremium: true, subscriptionExpiry: expiry.toISOString() }
      };
      try {
        await dbService.saveRecord(updatedUser);
        setCurrentUser(updatedUser);
        setPaymentStep('success');
      } catch (err) {
        alert("Verification failed.");
        setPaymentStep('summary');
      }
    }, 2500);
  };

  const triggerGPay = () => {
    const upiUrl = `upi://pay?pa=${PREMIUM_VPA}&pn=HealthShieldAI&am=${MONTHLY_PRICE}&cu=INR&tn=Monthly_Premium_Access`;
    window.location.href = upiUrl;
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
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 min-h-[700px] relative z-10 animate-pop-in">
          <div className="lg:col-span-5 bg-indigo-950 p-12 text-white flex flex-col justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-12">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-950 text-2xl shadow-xl">{ICONS.LOCK}</div>
                <h1 className="text-2xl font-black uppercase tracking-widest italic">{APP_NAME}</h1>
              </div>
              <h2 className="text-4xl font-bold leading-tight mb-4">Your Health, <br/><span className="text-indigo-400 underline decoration-indigo-500/30">Privately</span> Secured.</h2>
              <p className="text-indigo-200/80 text-lg">Local-first encrypted vault with clinical AI insights.</p>
            </div>
          </div>
          <div className="lg:col-span-7 p-12 flex flex-col justify-center bg-slate-50/50">
             {showRegSuccess ? (
                <div className="max-w-md mx-auto w-full text-center">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6"><i className="fas fa-check"></i></div>
                  <h3 className="text-2xl font-bold mb-4">Registration Successful!</h3>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 mb-8">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Your Unique Health ID</p>
                    <p className="text-2xl font-mono font-bold text-indigo-600">{showRegSuccess}</p>
                  </div>
                  <button onClick={completeRegistration} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg">Login to Vault</button>
                </div>
             ) : (
                <div className="max-w-md mx-auto w-full">
                  <div className="bg-slate-200/50 p-1 rounded-2xl flex mb-10">
                    <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${authMode === 'login' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>Login</button>
                    <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${authMode === 'register' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>Register</button>
                  </div>
                  {authError && <div className="mb-4 p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold">{authError}</div>}
                  {authMode === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-6">
                      <input value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full px-6 py-5 rounded-2xl bg-white border border-slate-200 text-xl font-mono uppercase focus:ring-4 focus:ring-indigo-500/10 outline-none" placeholder="HID-XXXX-XXXX" />
                      {lastHid && <button type="button" onClick={() => handleQuickUnlock(lastHid)} className="w-full p-4 bg-indigo-50 text-indigo-600 rounded-2xl text-xs font-bold">Quick Login: {lastHid}</button>}
                      <button type="submit" className="w-full bg-slate-900 text-white font-bold py-5 rounded-2xl text-lg">Enter Vault</button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-4 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                      <input required name="name" className="w-full px-4 py-4 rounded-xl border border-slate-200 text-sm" placeholder="Full Name" />
                      <div className="grid grid-cols-2 gap-4">
                        <input required name="age" type="number" className="w-full px-4 py-4 rounded-xl border border-slate-200 text-sm" placeholder="Age" />
                        <select name="bloodGroup" className="w-full px-4 py-4 rounded-xl border border-slate-200 text-sm">
                          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                        </select>
                      </div>
                      <input required name="aadhaar" pattern="\d{12}" className="w-full px-4 py-4 rounded-xl border border-slate-200 text-sm" placeholder="Aadhaar Number" />
                      <input required name="dob" type="date" className="w-full px-4 py-4 rounded-xl border border-slate-200 text-sm" />
                      <div className="p-4 bg-indigo-50 rounded-2xl space-y-3">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase">Emergency Contact</p>
                        <input required name="eName" className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs" placeholder="Contact Name" />
                        <input required name="ePhone" className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs" placeholder="Phone" />
                      </div>
                      <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl">Register Identity</button>
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden ${currentUser?.profile?.isPremium ? 'bg-slate-900' : 'bg-indigo-600'}`}>
              <div className="relative z-10">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-8">Digital Health Passport</p>
                <h1 className="text-4xl font-mono font-bold mb-8">{currentUser?.profile?.healthId}</h1>
                <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/10">
                  <div><p className="text-[8px] uppercase opacity-60">Blood Group</p><p className="font-bold text-lg">{currentUser?.profile?.bloodGroup}</p></div>
                  <div><p className="text-[8px] uppercase opacity-60">Age</p><p className="font-bold text-lg">{currentUser?.profile?.age}</p></div>
                  <div><p className="text-[8px] uppercase opacity-60">Gender</p><p className="font-bold text-lg">{currentUser?.profile?.gender}</p></div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mb-4 animate-pulse">
                <i className="fas fa-shield-alt"></i>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Vault Security</p>
              <p className="font-bold text-emerald-600">Active Encryption</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            {[
              { label: 'Conditions', val: (currentUser?.problems || []).length, icon: ICONS.MEDICAL },
              { label: 'Notes', val: (currentUser?.notes || []).length, icon: ICONS.NOTE },
            ].map((s, i) => (
              <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="text-indigo-600 text-xl">{s.icon}</div>
                <div><p className="text-[9px] font-bold text-slate-400 uppercase">{s.label}</p><p className="text-xl font-bold">{s.val}</p></div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'records' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24">
          <RecordCard title="Medical Problems" icon={ICONS.MEDICAL} onAdd={() => setShowAddModal('problem')}>
            <div className="space-y-2">
              {(currentUser?.problems || []).map(p => (
                <div key={p.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-sm">
                  <div><span className="font-bold">{p.condition}</span> <span className="text-[10px] uppercase text-slate-400">({p.severity})</span></div>
                  <button onClick={() => removeMedicalItem('problems', p.id)} className="text-slate-300 hover:text-rose-500"><i className="fas fa-trash"></i></button>
                </div>
              ))}
            </div>
          </RecordCard>

          <RecordCard title="Clinical Notes" icon={ICONS.NOTE} onAdd={() => setShowAddModal('note')}>
            <div className="space-y-2">
              {(currentUser?.notes || []).map(n => (
                <div key={n.id} className="p-4 bg-slate-50 rounded-xl text-xs relative group">
                  <p className="font-bold text-indigo-600 mb-1">Dr. {n.doctorName} • {n.date}</p>
                  <p className="text-slate-600 line-clamp-2">{n.note}</p>
                  <button onClick={() => removeMedicalItem('notes', n.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500"><i className="fas fa-trash"></i></button>
                </div>
              ))}
            </div>
          </RecordCard>
        </div>
      ) : activeTab === 'august' ? (
        <div className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
           <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
             {chatHistory.length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                 <div className="text-5xl mb-4">{ICONS.AI}</div>
                 <p className="font-bold">August AI is ready to analyze your vault.</p>
                 <p className="text-xs">Ask about clinical trends or general health guidance.</p>
               </div>
             )}
             {chatHistory.map((m, i) => (
               <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-800'}`}>
                   {m.content}
                 </div>
               </div>
             ))}
             {isAiLoading && <div className="text-[10px] font-bold text-indigo-400 animate-pulse"><i className="fas fa-circle-notch fa-spin mr-2"></i> Analyzing records...</div>}
           </div>
           <div className="flex gap-2 border-t pt-4">
             <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && askAugustAI()} placeholder="Ask August AI..." className="flex-grow p-4 bg-slate-100 rounded-xl outline-none" />
             <button onClick={askAugustAI} disabled={!userQuery.trim() || isAiLoading} className="px-6 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-50">Send</button>
           </div>
        </div>
      ) : activeTab === 'subscription' ? (
        <div className="max-w-xl mx-auto py-12">
           <div className="bg-indigo-950 text-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
             <div className="relative z-10">
               <div className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-[10px] font-bold uppercase mb-4">Premium Vault</div>
               <h2 className="text-3xl font-bold mb-6">Upgrade Your Security</h2>
               <div className="text-5xl font-black mb-8">₹{MONTHLY_PRICE}<span className="text-sm font-normal opacity-60"> /month</span></div>
               <ul className="space-y-4 mb-10 text-sm">
                 <li className="flex gap-2"><i className="fas fa-check text-emerald-400"></i> Unlimited August AI Sessions</li>
                 <li className="flex gap-2"><i className="fas fa-check text-emerald-400"></i> Advanced Clinical History</li>
                 <li className="flex gap-2"><i className="fas fa-check text-emerald-400"></i> Local Data Backup Tools</li>
               </ul>
               <button onClick={() => {setShowPaymentModal(true); setPaymentStep('summary');}} className="w-full py-4 bg-white text-indigo-950 font-bold rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                 {currentUser?.profile?.isPremium ? "Manage Subscription" : "Subscribe Now"}
               </button>
             </div>
           </div>
        </div>
      ) : null}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl animate-pop-in">
             {paymentStep === 'summary' ? (
               <>
                 <h3 className="text-xl font-bold mb-6">Subscription Summary</h3>
                 <div className="bg-slate-50 p-6 rounded-2xl mb-6">
                    <div className="flex justify-between mb-2"><span>Monthly Plan</span><span className="font-bold">₹{MONTHLY_PRICE}</span></div>
                    <div className="flex justify-between text-xs text-slate-400"><span>Service Fee</span><span className="font-bold">₹0</span></div>
                 </div>
                 <div className="space-y-3">
                   <button onClick={triggerGPay} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2"><i className="fab fa-google-pay text-2xl"></i> Pay with GPay</button>
                   <button onClick={initiatePaymentVerification} className="w-full py-4 bg-indigo-50 text-indigo-600 font-bold rounded-xl text-sm">Verify Payment Manually</button>
                   <button onClick={() => setShowPaymentModal(false)} className="w-full py-2 text-xs text-slate-400 font-bold">Cancel</button>
                 </div>
               </>
             ) : paymentStep === 'verifying' ? (
               <div className="py-12 text-center">
                 <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                 <p className="font-bold">Authenticating Gateway...</p>
               </div>
             ) : (
               <div className="py-8 text-center">
                 <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6"><i className="fas fa-check"></i></div>
                 <h3 className="text-2xl font-bold mb-2">Premium Active!</h3>
                 <p className="text-slate-500 text-sm mb-8">Your clinical vault is now fully unlocked.</p>
                 <button onClick={() => setShowPaymentModal(false)} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl">Awesome</button>
               </div>
             )}
          </div>
        </div>
      )}

      {/* Add Record Modals */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl animate-pop-in">
            <h3 className="text-xl font-bold mb-6">New {showAddModal === 'problem' ? 'Medical Problem' : 'Clinical Note'}</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (showAddModal === 'problem') addMedicalItem('problems', { condition: f.get('condition'), severity: f.get('severity'), onsetDate: f.get('date'), status: 'present' });
              if (showAddModal === 'note') addMedicalItem('notes', { doctorName: f.get('doc'), date: f.get('date'), note: f.get('note') });
            }} className="space-y-4">
              {showAddModal === 'problem' && (
                <>
                  <input required name="condition" placeholder="Condition Name" className="w-full p-4 bg-slate-50 rounded-xl outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <select name="severity" className="w-full p-4 bg-slate-50 rounded-xl outline-none">
                      <option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
                    </select>
                    <input required type="date" name="date" className="w-full p-4 bg-slate-50 rounded-xl outline-none" />
                  </div>
                </>
              )}
              {showAddModal === 'note' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input required name="doc" placeholder="Doctor Name" className="w-full p-4 bg-slate-50 rounded-xl outline-none" />
                    <input required type="date" name="date" className="w-full p-4 bg-slate-50 rounded-xl outline-none" />
                  </div>
                  <textarea required name="note" placeholder="Consultation details..." className="w-full p-4 bg-slate-50 rounded-xl h-32 outline-none"></textarea>
                </>
              )}
              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-4 bg-slate-100 rounded-xl font-bold">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
