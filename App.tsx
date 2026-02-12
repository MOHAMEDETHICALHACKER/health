
import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  HealthRecord, 
  ChatMessage, 
  MedicalProblem, 
  NotificationSettings, 
  VisitingHours, 
  GovernmentScheme, 
  AuditLog, 
  Medication, 
  Reminder,
  Insurance
} from './types';
import { ICONS, APP_NAME } from './constants';
import Layout from './components/Layout';
import RecordCard from './components/RecordCard';
import { analyzeHealthRecord, findApplicableSchemes } from './services/geminiService';
import { dbService } from './services/dbService';

const SESSION_KEY = 'health_shield_active_session';

type ModalType = 'problem' | 'add_insurance' | 'doctor_auth' | 'surgery' | 'medication' | 'reminder' | null;
type SettingsTab = 'personal' | 'notifications' | 'security';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<HealthRecord | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginMethod, setLoginMethod] = useState<'healthid' | 'phone'>('healthid');
  const [roleMode, setRoleMode] = useState<'patient' | 'doctor'>('patient');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsTab>('personal');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState<ModalType>(null);
  const [recordFilter, setRecordFilter] = useState<'present' | 'past'>('present');
  const [authError, setAuthError] = useState('');
  
  const [loginId, setLoginId] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Search States
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<HealthRecord[]>([]);
  const [searchedPatient, setSearchedPatient] = useState<HealthRecord | null>(null);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [authorizedPatientId, setAuthorizedPatientId] = useState<string | null>(null);
  const [accessOtpInput, setAccessOtpInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchInitiated, setSearchInitiated] = useState(false);

  // Edit States
  const [editProblem, setEditProblem] = useState<MedicalProblem | null>(null);
  const [editMedication, setEditMedication] = useState<Medication | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [editInsurance, setEditInsurance] = useState<Insurance | null>(null);

  // AI & Schemes States
  const [isAnalyzingRecord, setIsAnalyzingRecord] = useState<string | null>(null);
  const [isSearchingSchemes, setIsSearchingSchemes] = useState(false);
  const [generalSchemes, setGeneralSchemes] = useState<GovernmentScheme[]>([]);
  const [schemeSearchQuery, setSchemeSearchQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const activeDisplayUser = searchedPatient || currentUser;
  
  const [regForm, setRegForm] = useState<UserProfile>({
    name: '', age: 0, dob: '', gender: 'Male', phone: '', aadhaar: '',
    healthId: '', bloodGroup: 'O+', role: 'patient',
    notificationSettings: { email: true, sms: true, push: true, sound: true },
    visitingHours: { start: '09:00', end: '17:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }
  });

  useEffect(() => {
    const init = async () => {
      await dbService.init();
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        const record = await dbService.getRecord(savedSession);
        if (record) {
          setCurrentUser(record);
          setIsAuth(true);
          setRoleMode(record.profile.role);
          loadGeneralSchemes(record.profile.age);
        }
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const loadGeneralSchemes = async (age: number) => {
    setIsSearchingSchemes(true);
    const schemes = await findApplicableSchemes(null, age);
    setGeneralSchemes(schemes);
    setIsSearchingSchemes(false);
  };

  const handleSchemeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schemeSearchQuery.trim()) return;
    setIsSearchingSchemes(true);
    const results = await findApplicableSchemes({ condition: schemeSearchQuery } as any, currentUser?.profile.age || 30);
    setGeneralSchemes(results);
    setIsSearchingSchemes(false);
  };

  const createAuditLog = (action: AuditLog['action'], resource: string, details: string): AuditLog => ({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase(),
    doctorId: currentUser?.profile.healthId || 'SYSTEM',
    doctorName: currentUser?.profile.name || 'System Operator',
    action,
    resource,
    details,
    timestamp: Date.now()
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);

    let record: HealthRecord | null = null;
    if (loginMethod === 'healthid') {
      record = await dbService.getRecord(loginId);
      if (!record || record.profile.role !== roleMode) {
        setAuthError("Invalid Health ID or Role mismatch.");
        setIsSubmitting(false);
        return;
      }
    } else {
      if (!isVerifyingOtp) {
        record = await dbService.getRecordByPhone(phoneInput);
        if (record && record.profile.role === roleMode) {
          setIsVerifyingOtp(true);
          setIsSubmitting(false);
          return;
        } else {
          setAuthError("Phone number not registered.");
          setIsSubmitting(false);
          return;
        }
      } else {
        record = await dbService.getRecordByPhone(phoneInput);
      }
    }

    if (record) {
      setCurrentUser(record);
      setIsAuth(true);
      localStorage.setItem(SESSION_KEY, record.profile.healthId);
      loadGeneralSchemes(record.profile.age);
    }
    setIsSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const prefix = roleMode === 'doctor' ? 'DR' : 'HS';
    const healthId = `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord: HealthRecord = {
      profile: { ...regForm, healthId, role: roleMode },
      problems: [], medications: [], surgeries: [], allergies: [], notes: [],
      familyHistory: [], insurances: [], reminders: [], lastUpdated: Date.now(),
      auditLogs: []
    };
    await dbService.saveRecord(newRecord);
    setCurrentUser(newRecord);
    setIsAuth(true);
    localStorage.setItem(SESSION_KEY, healthId);
    loadGeneralSchemes(newRecord.profile.age);
    setIsSubmitting(false);
  };

  const handleLogout = () => {
    setIsAuth(false);
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
    setActiveTab('dashboard');
    setPatientSearchResults([]);
    setSearchedPatient(null);
    setAuthorizedPatientId(null);
  };

  const handleSearchPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientSearchQuery.trim()) return;
    setIsSearchingPatient(true);
    setSearchInitiated(true);
    const allRecords = await dbService.getAllRecords();
    const results = allRecords.filter(r => 
      r.profile.role === 'patient' && 
      (r.profile.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || 
       (r.profile.healthId && r.profile.healthId.includes(patientSearchQuery.toUpperCase())))
    );
    setPatientSearchResults(results);
    setIsSearchingPatient(false);
  };

  const runSchemeAnalysis = async (problemId: string) => {
    const target = searchedPatient || currentUser;
    if (!target) return;
    const problem = target.problems.find(p => p.id === problemId);
    if (!problem) return;
    setIsAnalyzingRecord(problemId);
    try {
      const schemes = await findApplicableSchemes(problem, target.profile.age);
      const updatedUser = { ...target, problems: target.problems.map(p => p.id === problemId ? { ...p, applicableSchemes: schemes } : p) };
      if (searchedPatient) setSearchedPatient(updatedUser);
      else setCurrentUser(updatedUser);
      await dbService.saveRecord(updatedUser);
    } finally { setIsAnalyzingRecord(null); }
  };

  const handleAskAi = async () => {
    const target = searchedPatient || currentUser;
    if (!userQuery.trim() || !target) return;
    setChatHistory(prev => [...prev, { role: 'user', content: userQuery, timestamp: Date.now() }]);
    setIsAiLoading(true);
    try {
      const response = await analyzeHealthRecord(target, userQuery);
      setChatHistory(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } finally { setIsAiLoading(false); setUserQuery(''); }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const updateNotificationSetting = (key: keyof NotificationSettings) => {
    if (!currentUser) return;
    const settings = currentUser.profile.notificationSettings || { email: true, sms: true, push: true, sound: true };
    const updated = { ...currentUser, profile: { ...currentUser.profile, notificationSettings: { ...settings, [key]: !settings[key] } } };
    setCurrentUser(updated);
    dbService.saveRecord(updated);
  };

  const openEditModal = (type: ModalType, data: any) => {
    if (type === 'problem') setEditProblem(data);
    else if (type === 'medication') setEditMedication(data);
    else if (type === 'reminder') setEditReminder(data);
    else if (type === 'add_insurance') setEditInsurance(data);
    setShowAddModal(type);
  };

  const closeModals = () => {
    setShowAddModal(null);
    setEditProblem(null);
    setEditMedication(null);
    setEditReminder(null);
    setEditInsurance(null);
  };

  const toggleVisitingDay = (day: string) => {
    if (!currentUser) return;
    const currentDays = currentUser.profile.visitingHours?.days || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    
    setCurrentUser({
      ...currentUser,
      profile: {
        ...currentUser.profile,
        visitingHours: {
          ...(currentUser.profile.visitingHours || { start: '09:00', end: '17:00' }),
          days: newDays
        } as VisitingHours
      }
    });
  };

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-200 animate-fade-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center text-3xl text-white mx-auto mb-4 shadow-lg">
              {ICONS.LOCK}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
            <p className="text-slate-500 text-sm mt-1">Secure Medical Records Access</p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
            <button onClick={() => setRoleMode('patient')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${roleMode === 'patient' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Patient</button>
            <button onClick={() => setRoleMode('doctor')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${roleMode === 'doctor' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Doctor</button>
          </div>

          <div className="flex justify-center space-x-6 mb-6 text-sm">
            <button onClick={() => setAuthMode('login')} className={`font-bold pb-1 border-b-2 transition-all ${authMode === 'login' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}>Login</button>
            <button onClick={() => setAuthMode('register')} className={`font-bold pb-1 border-b-2 transition-all ${authMode === 'register' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}>Sign Up</button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                <button type="button" onClick={() => setLoginMethod('healthid')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${loginMethod === 'healthid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Health ID</button>
                <button type="button" onClick={() => setLoginMethod('phone')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${loginMethod === 'phone' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Phone</button>
              </div>

              {loginMethod === 'healthid' ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Health ID</label>
                  <input required placeholder={roleMode === 'doctor' ? "DR-XXXX-XXXX" : "HS-XXXX-XXXX"} className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" value={loginId} onChange={e => setLoginId(e.target.value.toUpperCase())} />
                </div>
              ) : (
                <div className="space-y-4">
                  {!isVerifyingOtp ? (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Phone Number</label>
                      <input required type="tel" placeholder="+91 XXXXX XXXXX" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} />
                    </div>
                  ) : (
                    <div className="space-y-2 text-center animate-fade-in">
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Access Token</label>
                      <input required maxLength={4} className="w-full border-2 border-indigo-200 rounded-lg py-4 text-3xl font-bold tracking-widest text-center text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))} />
                      <p className="text-[10px] text-slate-400">Sent via SMS secure link</p>
                    </div>
                  )}
                </div>
              )}
              {authError && <p className="text-red-500 text-xs font-bold text-center">{authError}</p>}
              <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-all active:scale-95">
                {isSubmitting ? 'Verifying...' : (isVerifyingOtp ? 'Login' : 'Access Portal')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4 animate-fade-in">
              <input required placeholder="Legal Name" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" onChange={e => setRegForm({...regForm, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" placeholder="Age" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" onChange={e => setRegForm({...regForm, age: parseInt(e.target.value)})} />
                <select className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none bg-white cursor-pointer" onChange={e => setRegForm({...regForm, bloodGroup: e.target.value})}>
                  {['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
              <input required type="tel" placeholder="Phone Number" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none" onChange={e => setRegForm({...regForm, phone: e.target.value})} />
              <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">Create Account</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      userName={currentUser?.profile.name || ''} 
      healthId={currentUser?.profile.healthId || ''}
      role={roleMode}
      profilePicture={currentUser?.profile.profilePicture}
      onLogout={handleLogout}
    >
      <div className="space-y-12 animate-fade-in pb-16">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex items-center gap-8">
                <div className="w-28 h-28 rounded-full bg-slate-50 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                   {currentUser?.profile.profilePicture ? (
                     <img src={currentUser.profile.profilePicture} alt="" className="w-full h-full object-cover" />
                   ) : (
                     <i className="fas fa-user text-5xl text-slate-200"></i>
                   )}
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-slate-900">{currentUser?.profile.name}</h3>
                  <div className="flex flex-wrap gap-4 mt-3 items-center">
                    <div className="flex items-center bg-slate-100 rounded-full px-4 py-1.5 border border-slate-200">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{currentUser?.profile.healthId}</span>
                      <button 
                        onClick={() => handleCopyId(currentUser?.profile.healthId || '')}
                        className="ml-3 text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Copy Health ID"
                      >
                        <i className={`fas ${copiedId === currentUser?.profile.healthId ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
                      </button>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full uppercase tracking-wider">{currentUser?.profile.age} Yrs</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <RecordCard title="Clinical Snapshot" icon={ICONS.MEDICAL}>
                  <div className="space-y-4">
                    {currentUser?.problems.slice(0, 3).map(p => (
                      <div key={p.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group">
                        <span className="text-sm font-bold text-slate-800">{p.condition}</span>
                        <div className="flex items-center gap-3">
                           <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${p.severity === 'severe' ? 'text-red-600' : 'text-slate-400'}`}>{p.severity}</span>
                        </div>
                      </div>
                    ))}
                    {!currentUser?.problems.length && <p className="text-xs text-slate-400 italic py-4">No active conditions logged in your vault.</p>}
                  </div>
                </RecordCard>
                <RecordCard title="Matched Govt Benefits" icon={ICONS.SCHEME}>
                     <div className="space-y-4">
                       {generalSchemes.slice(0, 3).map(scheme => (
                         <div key={scheme.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs font-bold text-slate-800 mb-1">{scheme.name}</p>
                            <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">{scheme.coverageAmount || 'Benefits available'}</p>
                         </div>
                       ))}
                       {!generalSchemes.length && <p className="text-xs text-slate-400 italic py-4">No matched benefits yet.</p>}
                       <button onClick={() => setActiveTab('schemes')} className="text-[10px] font-black uppercase text-indigo-600 hover:underline">View All Matched Schemes</button>
                     </div>
                </RecordCard>
              </div>
            </div>
            <div className="lg:col-span-4">
               <RecordCard title="Shield AI Intelligence" icon={ICONS.AI} className="h-full">
                  <div className="space-y-6">
                    <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                       <p className="text-xs font-bold text-indigo-900 leading-relaxed mb-4">Shield AI analyzes your clinical ledger and matches you with real-time government welfare benefits.</p>
                       <div className="flex items-center gap-3 text-[10px] font-black uppercase text-indigo-400 tracking-widest">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                          Neural Core Active
                       </div>
                    </div>
                    <button onClick={() => setActiveTab('shield')} className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95">
                       Open Analysis Console
                    </button>
                  </div>
               </RecordCard>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <div className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-12 opacity-10"><i className="fas fa-user-shield text-[10rem]"></i></div>
               <h3 className="text-4xl font-black tracking-tighter mb-4 uppercase">Security Audit Ledger</h3>
               <p className="text-slate-400 text-lg font-medium opacity-80">Transparent record of all medical professionals who have interacted with your clinical data vault.</p>
            </div>
            
            <div className="space-y-6">
               {(currentUser?.auditLogs || []).length > 0 ? (
                 [...(currentUser?.auditLogs || [])].sort((a,b) => b.timestamp - a.timestamp).map(log => (
                   <div key={log.id} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-6">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${log.action === 'VIEW' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                            <i className={`fas ${log.action === 'VIEW' ? 'fa-eye' : 'fa-edit'}`}></i>
                         </div>
                         <div>
                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{log.doctorName} <span className="text-slate-400 font-mono text-[10px] ml-2">({log.doctorId})</span></p>
                            <p className="text-xs text-slate-500 font-medium">{log.details}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.timestamp).toLocaleDateString()}</p>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString()}</p>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <p className="text-slate-300 font-black uppercase tracking-widest text-xs">No audit events generated yet</p>
                 </div>
               )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 animate-fade-in">
            <aside className="w-full md:w-64 space-y-2">
              <button 
                onClick={() => setSettingsSubTab('personal')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsSubTab === 'personal' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                <i className="fas fa-user-circle"></i>
                <span>Personal Info</span>
              </button>
              <button 
                onClick={() => setSettingsSubTab('notifications')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsSubTab === 'notifications' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                <i className="fas fa-bell"></i>
                <span>Notifications</span>
              </button>
              <button 
                onClick={() => setSettingsSubTab('security')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsSubTab === 'security' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                <i className="fas fa-shield-alt"></i>
                <span>Account Security</span>
              </button>
              <div className="pt-6 border-t border-slate-100 mt-4">
                <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 bg-white border border-red-100 hover:bg-red-50 transition-all">
                  <i className="fas fa-sign-out-alt"></i>
                  <span>Sign Out</span>
                </button>
              </div>
            </aside>

            <div className="flex-grow">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                {settingsSubTab === 'personal' && (
                  <div className="p-10 md:p-14 space-y-10 animate-fade-in">
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-50">
                      <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-200 overflow-hidden group relative">
                        {currentUser?.profile.profilePicture ? (
                          <img src={currentUser.profile.profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl"><i className="fas fa-user"></i></div>
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <i className="fas fa-camera"></i>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (file && currentUser) {
                               const reader = new FileReader();
                               reader.onloadend = () => {
                                 const updated = { ...currentUser, profile: { ...currentUser.profile, profilePicture: reader.result as string } };
                                 setCurrentUser(updated);
                                 dbService.saveRecord(updated);
                               };
                               reader.readAsDataURL(file);
                             }
                          }} />
                        </label>
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Profile Configuration</h3>
                        <p className="text-sm text-slate-400 font-medium">Manage your personal clinical identifiers.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Display Name</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.name} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, name: e.target.value}} : null)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Phone Identifier</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.phone} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, phone: e.target.value}} : null)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Birth Record</label>
                        <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.dob} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, dob: e.target.value}} : null)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Gender identity</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.gender} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, gender: e.target.value}} : null)}>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Non-binary">Non-binary</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>

                      {/* Doctor Specific Fields */}
                      {currentUser?.profile.role === 'doctor' && (
                        <>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Medical Specialization</label>
                            <input placeholder="e.g. Cardiologist" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.specialization || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, specialization: e.target.value}} : null)} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Medical License Number</label>
                            <input placeholder="e.g. LIC-12345-ABC" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.licenseNumber || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, licenseNumber: e.target.value}} : null)} />
                          </div>
                          <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-50">
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Practice Schedule (Visiting Hours)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-2">Start Time</label>
                                <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.visitingHours?.start || '09:00'} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, visitingHours: {...(prev.profile.visitingHours || {days: [], end: '17:00'}), start: e.target.value} as VisitingHours}} : null)} />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-2">End Time</label>
                                <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" value={currentUser?.profile.visitingHours?.end || '17:00'} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, visitingHours: {...(prev.profile.visitingHours || {days: [], start: '09:00'}), end: e.target.value} as VisitingHours}} : null)} />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-2">Operating Days</label>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                    <button
                                      key={day}
                                      onClick={() => toggleVisitingDay(day)}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        currentUser?.profile.visitingHours?.days.includes(day)
                                          ? 'bg-indigo-600 text-white shadow-md'
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      }`}
                                    >
                                      {day}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="pt-6 border-t border-slate-50 flex justify-end">
                      <button onClick={async () => {
                        if (currentUser) {
                          setIsSubmitting(true);
                          await dbService.saveRecord(currentUser);
                          setIsSubmitting(false);
                          alert("Profile synced with local Health Node.");
                        }
                      }} className="px-10 py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
                        {isSubmitting ? 'Syncing...' : 'Confirm Sync'}
                      </button>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'notifications' && (
                  <div className="p-10 md:p-14 space-y-10 animate-fade-in">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Communication Protocols</h3>
                      <p className="text-sm text-slate-400 font-medium">Define your preferences for clinical alerts.</p>
                    </div>
                    <div className="space-y-2">
                      {[
                        { id: 'email', label: 'Electronic Mail', desc: 'Medical reports and security access warnings.', icon: 'fa-envelope' },
                        { id: 'sms', label: 'Short Message Service', desc: 'Critical medication reminders and emergency alerts.', icon: 'fa-comment' },
                        { id: 'push', label: 'Direct Push', desc: 'Real-time dashboard updates and benefit matches.', icon: 'fa-mobile' }
                      ].map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-6 hover:bg-slate-50 transition-colors rounded-2xl group border border-transparent hover:border-slate-100">
                          <div className="flex items-center gap-6">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg ${currentUser?.profile.notificationSettings?.[item.id as keyof NotificationSettings] ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                              <i className={`fas ${item.icon}`}></i>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{item.label}</p>
                              <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => updateNotificationSetting(item.id as keyof NotificationSettings)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${currentUser?.profile.notificationSettings?.[item.id as keyof NotificationSettings] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentUser?.profile.notificationSettings?.[item.id as keyof NotificationSettings] ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {settingsSubTab === 'security' && (
                  <div className="p-10 md:p-14 space-y-10 animate-fade-in">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Account Security</h3>
                      <p className="text-sm text-slate-400 font-medium">Manage your vault access and unique identifiers.</p>
                    </div>
                    <div className="space-y-6">
                      <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100">
                            <i className="fas fa-fingerprint text-xl"></i>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Authenticated Health ID</p>
                            <p className="text-lg font-mono font-bold text-slate-900">{currentUser?.profile.healthId}</p>
                          </div>
                        </div>
                        <button onClick={() => handleCopyId(currentUser?.profile.healthId || '')} className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                          {copiedId === currentUser?.profile.healthId ? 'Node Copied' : 'Copy Node ID'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-white border border-slate-100 rounded-2xl">
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Verification Tier</p>
                           <div className="flex items-center gap-3">
                              <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">Level 3: Secure</span>
                           </div>
                        </div>
                        <div className="p-6 bg-white border border-slate-100 rounded-2xl">
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Cryptographic Node</p>
                           <p className="text-xs font-bold text-slate-700">Encrypted Local Index</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto border border-slate-200 shadow-inner">
                <button onClick={() => setRecordFilter('present')} className={`flex-1 md:flex-none px-10 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${recordFilter === 'present' ? 'bg-white text-indigo-700 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Active Vault</button>
                <button onClick={() => setRecordFilter('past')} className={`flex-1 md:flex-none px-10 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${recordFilter === 'past' ? 'bg-white text-indigo-700 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Historical Log</button>
              </div>
              <div className="flex flex-wrap gap-4 justify-center md:justify-end">
                 <button onClick={() => setShowAddModal('problem')} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-[9px] hover:bg-slate-800 transition-all shadow-md">Archive Condition</button>
                 <button onClick={() => setShowAddModal('medication')} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest text-[9px] hover:bg-indigo-700 transition-all shadow-md">Log Medication</button>
                 <button onClick={() => setShowAddModal('reminder')} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-[9px] hover:bg-emerald-700 transition-all shadow-md">Set Reminder</button>
                 <button onClick={() => setShowAddModal('add_insurance')} className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold uppercase tracking-widest text-[9px] hover:bg-amber-700 transition-all shadow-md">Log Insurance</button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <RecordCard title="Medical Ledger" icon={ICONS.MEDICAL} isLoading={!!isAnalyzingRecord} loadingMessage="Querying Central Welfare Database...">
                <div className="space-y-6">
                  {activeDisplayUser?.problems.filter(p => recordFilter === 'present' ? p.status === 'present' : p.status !== 'present').map(p => (
                    <div key={p.id} className="p-8 border border-slate-100 rounded-3xl bg-slate-50/50 hover:bg-white hover:shadow-2xl transition-all relative overflow-hidden group">
                       <div className="flex justify-between items-start mb-6">
                         <h4 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-tight">{p.condition}</h4>
                         <div className="flex items-center gap-3">
                           <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${p.severity === 'severe' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.severity}</span>
                           <button onClick={() => openEditModal('problem', p)} className="text-slate-400 hover:text-indigo-600 transition-all text-sm">
                             <i className="fas fa-edit"></i>
                           </button>
                         </div>
                       </div>
                       <div className="flex items-center gap-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
                        <span>Onset: {new Date(p.onsetDate).toLocaleDateString()}</span>
                        <button onClick={() => runSchemeAnalysis(p.id)} className="ml-auto text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                          <i className="fas fa-search-dollar"></i> Map Govt Benefits
                        </button>
                       </div>
                    </div>
                  ))}
                  {(!activeDisplayUser || activeDisplayUser.problems.filter(p => recordFilter === 'present' ? p.status === 'present' : p.status !== 'present').length === 0) && (
                    <div className="text-center py-20 text-slate-300 font-bold text-xs uppercase italic">No records in this category.</div>
                  )}
                </div>
              </RecordCard>

              <RecordCard title="Medication Vault" icon={ICONS.MEDS}>
                <div className="space-y-6">
                   {activeDisplayUser?.medications.filter(m => recordFilter === 'present' ? m.status === 'active' : m.status !== 'active').map(m => (
                     <div key={m.id} className="p-8 border border-slate-100 rounded-3xl bg-white shadow-sm hover:shadow-xl transition-all group">
                        <div className="flex justify-between items-center mb-6">
                           <h4 className="text-xl font-bold text-slate-900 uppercase tracking-tighter leading-none">{m.name}</h4>
                           <div className="flex items-center gap-3">
                              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${m.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>{m.status}</span>
                              <button onClick={() => openEditModal('medication', m)} className="text-slate-300 hover:text-indigo-600 transition-all text-xs">
                                <i className="fas fa-edit"></i>
                              </button>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                           <div><span className="text-[9px] font-black uppercase text-slate-300 block mb-1">Dosage</span><p className="text-sm font-bold text-slate-700">{m.dosage}</p></div>
                           <div><span className="text-[9px] font-black uppercase text-slate-300 block mb-1">Frequency</span><p className="text-sm font-bold text-slate-700">{m.frequency}</p></div>
                        </div>
                     </div>
                   ))}
                   {(!activeDisplayUser || activeDisplayUser.medications.filter(m => recordFilter === 'present' ? m.status === 'active' : m.status !== 'active').length === 0) && (
                    <div className="text-center py-20 text-slate-300 font-bold text-xs uppercase italic">No medications logged.</div>
                  )}
                </div>
              </RecordCard>
            </div>
          </div>
        )}

        {activeTab === 'schemes' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
            <div className="bg-gradient-to-br from-indigo-700 to-slate-900 text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden">
               <div className="relative z-10 max-w-2xl">
                 <h3 className="text-4xl font-black tracking-tighter mb-4 uppercase">Govt Welfare Portal</h3>
                 <p className="text-indigo-100 text-lg font-medium opacity-80 mb-8">AI-powered mapping of your medical profile to central and state healthcare benefits.</p>
                 <form onSubmit={handleSchemeSearch} className="relative group">
                   <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500"></i>
                   <input className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl pl-14 pr-6 py-4 text-white placeholder:text-white/40 outline-none focus:bg-white focus:text-slate-900 transition-all" placeholder="Search schemes (e.g., Cancer care, Dialysis)..." value={schemeSearchQuery} onChange={(e) => setSchemeSearchQuery(e.target.value)} />
                   <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2 bg-white text-indigo-700 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-indigo-50 transition-all">Execute</button>
                 </form>
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
               {generalSchemes.map(scheme => (
                 <div key={scheme.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all relative group flex flex-col">
                   <h5 className="text-lg font-black text-slate-900 leading-tight mb-4 uppercase tracking-tight">{scheme.name}</h5>
                   <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-6 flex-grow">
                      <p className="text-xs font-bold text-indigo-900 leading-relaxed line-clamp-3">{scheme.benefits}</p>
                   </div>
                   <div className="space-y-2 mt-auto">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Coverage</p>
                      <p className="text-xs font-bold text-slate-700">{scheme.coverageAmount || 'N/A'}</p>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'shield' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-16rem)] bg-white rounded-[4rem] shadow-3xl border border-slate-100 overflow-hidden flex flex-col animate-fade-in">
            <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-2xl shadow-xl">{ICONS.AI}</div>
                <div><h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Shield Intelligence Console</h3><p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">Neural Analysis Active</p></div>
              </div>
            </div>
            <div className="flex-grow overflow-y-auto p-10 space-y-8 custom-scrollbar">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-8 rounded-[3rem] shadow-xl ${m.role === 'user' ? 'bg-slate-950 text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                    <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed opacity-90">{m.content}</p>
                  </div>
                </div>
              ))}
              {isAiLoading && <div className="p-6 bg-white border border-slate-100 rounded-3xl w-fit shadow-xl flex items-center gap-4"><div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce"></div></div>}
            </div>
            <div className="p-10 border-t border-slate-100 bg-white">
              <div className="bg-slate-100 rounded-full p-2.5 flex items-center border border-slate-200/50 shadow-inner">
                <input className="flex-grow bg-transparent outline-none px-8 py-4 text-sm font-bold placeholder:text-slate-300" placeholder="Query clinical history or welfare pathways..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAskAi()} />
                <button onClick={handleAskAi} disabled={isAiLoading} className="w-16 h-16 bg-slate-950 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-indigo-600 transition-all"><i className="fas fa-paper-plane text-xl"></i></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && roleMode === 'doctor' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
            {authorizedPatientId ? (
              <div className="space-y-10">
                <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-10 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-emerald-600 shrink-0"><i className="fas fa-unlock-alt text-2xl"></i></div>
                    <div>
                      <h4 className="text-3xl font-black text-emerald-900 tracking-tight leading-none mb-2">{searchedPatient?.profile.name}</h4>
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest opacity-80">{searchedPatient?.profile.healthId}</p>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-100 rounded text-emerald-700">Live Secure Tunnel</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setSearchedPatient(null); setAuthorizedPatientId(null); }} className="bg-white border-2 border-emerald-200 text-emerald-700 px-10 py-4 rounded-full font-black uppercase text-xs tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Close Secure Tunnel</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <RecordCard title="Medical Ledger" icon={ICONS.MEDICAL}>
                    <div className="space-y-6">
                      {searchedPatient?.problems.map(p => (
                        <div key={p.id} className="p-8 border border-slate-100 rounded-3xl bg-white shadow-sm hover:shadow-lg transition-all">
                           <div className="flex justify-between items-start mb-6">
                             <h4 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-tight">{p.condition}</h4>
                             <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${p.severity === 'severe' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.severity}</span>
                           </div>
                           <div className="flex items-center gap-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
                             <span>Onset: {new Date(p.onsetDate).toLocaleDateString()}</span>
                             <span className="ml-auto">{p.status}</span>
                           </div>
                        </div>
                      ))}
                      {!searchedPatient?.problems.length && <div className="text-center py-10 italic text-slate-300">No medical problems recorded.</div>}
                    </div>
                  </RecordCard>

                  <RecordCard title="Medication Vault" icon={ICONS.MEDS}>
                    <div className="space-y-6">
                       {searchedPatient?.medications.map(m => (
                         <div key={m.id} className="p-8 border border-slate-100 rounded-3xl bg-white shadow-sm hover:shadow-lg transition-all">
                            <h4 className="text-xl font-bold text-slate-900 uppercase mb-4">{m.name}</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                               <div><p className="text-[10px] uppercase font-black text-slate-400">Dosage</p><p className="font-bold">{m.dosage}</p></div>
                               <div><p className="text-[10px] uppercase font-black text-slate-400">Frequency</p><p className="font-bold">{m.frequency}</p></div>
                            </div>
                         </div>
                       ))}
                       {!searchedPatient?.medications.length && <div className="text-center py-10 italic text-slate-300">No active medications.</div>}
                    </div>
                  </RecordCard>

                  {searchedPatient?.insurances && searchedPatient.insurances.length > 0 && (
                    <RecordCard title="Insurance Portfolio" icon={ICONS.CREDIT_CARD} className="lg:col-span-2">
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {searchedPatient.insurances.map(ins => (
                            <div key={ins.id} className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
                               <p className="text-[10px] font-black uppercase text-indigo-600 mb-2">{ins.provider}</p>
                               <p className="text-lg font-bold text-slate-900 mb-1">{ins.policyNumber}</p>
                               <p className="text-xs font-medium text-slate-500">Coverage: {ins.coverageAmount}</p>
                            </div>
                         ))}
                       </div>
                    </RecordCard>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-12 shadow-2xl border border-slate-100 text-center">
                <h3 className="text-4xl font-black text-slate-900 mb-8 uppercase tracking-tighter leading-none">Global Patient Index</h3>
                <form onSubmit={handleSearchPatient} className="max-w-3xl mx-auto relative group">
                  <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-full pl-16 pr-8 py-6 text-xl font-bold placeholder:text-slate-300 focus:border-indigo-500 focus:bg-white outline-none transition-all shadow-inner" placeholder="Query Name or Health ID..." value={patientSearchQuery} onChange={e => setPatientSearchQuery(e.target.value)} />
                  <button type="submit" disabled={isSearchingPatient} className="absolute right-3 top-1/2 -translate-y-1/2 px-10 py-4 bg-slate-950 text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-indigo-600 transition-all">Execute</button>
                </form>
                
                {isSearchingPatient && <div className="mt-12 text-slate-400 font-bold uppercase tracking-widest animate-pulse">Searching Vaults...</div>}

                {searchInitiated && !isSearchingPatient && patientSearchResults.length === 0 && (
                   <div className="mt-16 py-10">
                      <i className="fas fa-search-minus text-5xl text-slate-200 mb-6"></i>
                      <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No clinical matches found for "{patientSearchQuery}"</p>
                   </div>
                )}

                {patientSearchResults.length > 0 && (
                  <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-left animate-slide-in">
                    {patientSearchResults.map(patient => (
                      <div key={patient.profile.healthId} className="bg-white border border-slate-100 rounded-3xl p-8 hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col items-center text-center">
                        <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 overflow-hidden">
                          {patient.profile.profilePicture ? <img src={patient.profile.profilePicture} className="w-full h-full object-cover" /> : <i className="fas fa-user-ninja text-2xl text-slate-200"></i>}
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 mb-1">{patient.profile.name}</h4>
                        <p className="text-[11px] font-mono text-slate-400 uppercase tracking-widest mb-8">{patient.profile.healthId}</p>
                        <button onClick={() => { setSearchedPatient(patient); setShowAddModal('doctor_auth'); }} className="w-full py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-600 hover:bg-indigo-600 hover:text-white transition-all">Request Token Access</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals with enhanced transitions */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 animate-backdrop-fade bg-slate-950/40 backdrop-blur-xl">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 md:p-20 relative border border-slate-100 shadow-4xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-pop">
            <button onClick={closeModals} className="absolute top-10 right-10 w-12 h-12 rounded-full bg-slate-50 text-slate-300 hover:text-slate-900 transition-all text-2xl flex items-center justify-center">&times;</button>
            
            {showAddModal === 'problem' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-16 uppercase leading-none">{editProblem ? 'Update' : 'Archive'} Condition Node</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const pId = editProblem ? editProblem.id : Date.now().toString();
                  const condition = formData.get('condition') as string;
                  const severity = formData.get('severity') as any;
                  const status = formData.get('status') as any;
                  
                  const newProb: MedicalProblem = {
                    id: pId,
                    condition,
                    severity,
                    status: status || (editProblem ? editProblem.status : 'present'),
                    onsetDate: editProblem ? editProblem.onsetDate : new Date().toISOString()
                  };

                  let updatedProblems = target.problems;
                  if (editProblem) {
                    updatedProblems = updatedProblems.map(p => p.id === editProblem.id ? newProb : p);
                  } else {
                    updatedProblems = [newProb, ...target.problems];
                  }

                  let updated = { ...target, problems: updatedProblems };
                  
                  if (roleMode === 'doctor') {
                    const auditLog = createAuditLog(editProblem ? 'UPDATE' : 'CREATE', `Condition: ${condition}`, `Medical professional ${editProblem ? 'updated' : 'added'} a clinical diagnosis.`);
                    updated = { ...updated, auditLogs: [auditLog, ...(updated.auditLogs || [])] };
                  }

                  if (searchedPatient) setSearchedPatient(updated);
                  else setCurrentUser(updated);
                  
                  await dbService.saveRecord(updated);
                  closeModals();
                  if (!editProblem) runSchemeAnalysis(pId);
                }} className="space-y-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Clinical Diagnosis</label>
                    <input required name="condition" defaultValue={editProblem?.condition} placeholder="e.g. Type 2 Diabetes Mellitus" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-8 py-5 text-xl font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Clinical Severity</label>
                      <select name="severity" defaultValue={editProblem?.severity || 'mild'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-8 py-5 text-xl font-bold outline-none appearance-none cursor-pointer focus:border-indigo-500">
                        <option value="mild">Level 1: Routine</option>
                        <option value="moderate">Level 2: Active</option>
                        <option value="severe">Level 3: Critical</option>
                      </select>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Condition Status</label>
                      <select name="status" defaultValue={editProblem?.status || 'present'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-8 py-5 text-xl font-bold outline-none appearance-none cursor-pointer focus:border-indigo-500">
                        <option value="present">Active</option>
                        <option value="past">Historical</option>
                        <option value="recovered">Recovered</option>
                      </select>
                    </div>
                  </div>
                  <button className="w-full py-7 bg-slate-950 text-white rounded-full font-black uppercase tracking-[0.4em] text-xs shadow-3xl hover:bg-indigo-600 transition-all mt-8">{editProblem ? 'Update Vault' : 'Commit to Vault'}</button>
                </form>
              </>
            )}

            {showAddModal === 'add_insurance' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-12 uppercase leading-none">{editInsurance ? 'Update' : 'New'} Insurance Policy</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const insId = editInsurance ? editInsurance.id : `INS-${Date.now()}`;
                  
                  const newIns: Insurance = {
                    id: insId,
                    provider: formData.get('provider') as string,
                    policyNumber: formData.get('policyNumber') as string,
                    coverageAmount: formData.get('coverageAmount') as string,
                    expiryDate: formData.get('expiryDate') as string,
                    policyType: formData.get('policyType') as any,
                    contactPhone: formData.get('contactPhone') as string || '',
                    status: (new Date(formData.get('expiryDate') as string) > new Date()) ? 'active' : 'expired'
                  };

                  let updatedInsurances = target.insurances || [];
                  if (editInsurance) {
                    updatedInsurances = updatedInsurances.map(i => i.id === editInsurance.id ? newIns : i);
                  } else {
                    updatedInsurances = [newIns, ...updatedInsurances];
                  }

                  let updated = { ...target, insurances: updatedInsurances };
                  
                  if (roleMode === 'doctor') {
                    const auditLog = createAuditLog(editInsurance ? 'UPDATE' : 'CREATE', `Insurance: ${newIns.provider}`, `Medical professional ${editInsurance ? 'updated' : 'added'} an insurance policy record.`);
                    updated = { ...updated, auditLogs: [auditLog, ...(updated.auditLogs || [])] };
                  }

                  if (searchedPatient) setSearchedPatient(updated);
                  else setCurrentUser(updated);
                  
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Provider / Company</label>
                      <input required name="provider" defaultValue={editInsurance?.provider} placeholder="e.g. Star Health Insurance" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Policy Number</label>
                      <input required name="policyNumber" defaultValue={editInsurance?.policyNumber} placeholder="e.g. POL12345678" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Coverage Amount</label>
                      <input required name="coverageAmount" defaultValue={editInsurance?.coverageAmount} placeholder="e.g. ₹5,00,000" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Expiry Date</label>
                      <input required type="date" name="expiryDate" defaultValue={editInsurance?.expiryDate ? editInsurance.expiryDate.split('T')[0] : ''} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                  <button className="w-full py-6 bg-slate-950 text-white rounded-full font-black uppercase tracking-[0.4em] text-xs shadow-3xl hover:bg-indigo-600 transition-all mt-6">{editInsurance ? 'Update Policy' : 'Log Policy Details'}</button>
                </form>
              </>
            )}

            {showAddModal === 'reminder' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-12 uppercase leading-none">{editReminder ? 'Update' : 'New'} Clinical Reminder</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const rId = editReminder ? editReminder.id : `REM-${Date.now()}`;
                  
                  const newRem: Reminder = {
                    id: rId,
                    title: formData.get('title') as string,
                    description: formData.get('description') as string,
                    date: formData.get('date') as string,
                    time: formData.get('time') as string,
                    type: formData.get('type') as any,
                    status: editReminder ? editReminder.status : 'pending'
                  };

                  let updatedReminders = target.reminders || [];
                  if (editReminder) {
                    updatedReminders = updatedReminders.map(r => r.id === editReminder.id ? newRem : r);
                  } else {
                    updatedReminders = [newRem, ...updatedReminders];
                  }

                  let updated = { ...target, reminders: updatedReminders };
                  
                  if (roleMode === 'doctor') {
                    const auditLog = createAuditLog(editReminder ? 'UPDATE' : 'CREATE', `Reminder: ${newRem.title}`, `Medical professional ${editReminder ? 'updated' : 'added'} a health reminder.`);
                    updated = { ...updated, auditLogs: [auditLog, ...(updated.auditLogs || [])] };
                  }

                  if (searchedPatient) setSearchedPatient(updated);
                  else setCurrentUser(updated);
                  
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Reminder Title</label>
                    <input required name="title" defaultValue={editReminder?.title} placeholder="e.g. Morning Insulin" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Category</label>
                      <select name="type" defaultValue={editReminder?.type || 'custom'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none appearance-none cursor-pointer focus:border-indigo-500">
                        <option value="appointment">Appointment</option>
                        <option value="refill">Refill</option>
                        <option value="followup">Follow-up</option>
                        <option value="personal">Personal</option>
                        <option value="medication">Medication</option>
                        <option value="lifestyle">Lifestyle</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Due Date</label>
                      <input required type="date" name="date" defaultValue={editReminder?.date} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Due Time</label>
                      <input type="time" name="time" defaultValue={editReminder?.time} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Short Description</label>
                      <input name="description" defaultValue={editReminder?.description} placeholder="Optional details..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <button className="w-full py-6 bg-slate-950 text-white rounded-full font-black uppercase tracking-[0.4em] text-xs shadow-3xl hover:bg-indigo-600 transition-all mt-6">{editReminder ? 'Update Reminder' : 'Set Clinical Alert'}</button>
                </form>
              </>
            )}

            {showAddModal === 'doctor_auth' && (
              <div className="text-center">
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8 leading-none">Authorization Token</h3>
                <p className="text-slate-500 text-sm mb-12 leading-relaxed px-12">Enter the 4-digit cryptographic token generated by the patient's terminal to initialize access.</p>
                <div className="relative mb-16">
                  <input autoFocus type="text" maxLength={4} className="w-full border-2 border-indigo-100 rounded-3xl py-12 text-7xl font-black tracking-[0.5em] text-center text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner" value={accessOtpInput} onChange={(e) => setAccessOtpInput(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button 
                  onClick={async () => {
                    if (accessOtpInput.length === 4 && searchedPatient) {
                      const auditLog = createAuditLog('VIEW', 'Complete Medical Vault', `Doctor initialized secure session via token verification.`);
                      const updatedPatient = { ...searchedPatient, auditLogs: [auditLog, ...(searchedPatient.auditLogs || [])] };
                      await dbService.saveRecord(updatedPatient);
                      setSearchedPatient(updatedPatient);
                      setAuthorizedPatientId(searchedPatient.profile.healthId);
                      setShowAddModal(null);
                      setAccessOtpInput('');
                    }
                  }} 
                  className="w-full bg-indigo-600 text-white py-6 rounded-full font-black uppercase tracking-[0.3em] text-xs shadow-3xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all"
                >
                  Verify & Establish Link
                </button>
                <button onClick={() => setShowAddModal(null)} className="mt-8 text-[10px] text-slate-300 font-black uppercase tracking-widest hover:text-slate-600 transition-colors">Abort Procedure</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
