
import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  HealthRecord, 
  ChatMessage, 
  MedicalProblem, 
  NotificationSettings,
  VisitingHours, 
  GovernmentScheme, 
  Medication, 
  Reminder,
  HospitalRecommendation,
  Surgery,
  Allergy,
  FamilyHistory,
  TreatmentNote,
  Insurance,
  AuditLog
} from './types';
import { ICONS, APP_NAME } from './constants';
import Layout from './components/Layout';
import RecordCard from './components/RecordCard';
import { analyzeHealthRecord, findApplicableSchemes, findBestHospitals } from './services/geminiService';
import { dbService } from './services/dbService';

const SESSION_KEY = 'health_shield_active_session';

type ModalType = 'problem' | 'add_insurance' | 'doctor_auth' | 'surgery' | 'medication' | 'reminder' | 'hospital_results' | 'sql_guide' | 'allergy' | 'family_history' | 'note' | null;
type SettingsTab = 'personal' | 'professional' | 'notifications' | 'security';
type RecordsTab = 'conditions' | 'medications' | 'surgeries' | 'allergies' | 'family' | 'notes' | 'insurance' | 'reminders';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<HealthRecord | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginMethod, setLoginMethod] = useState<'healthid' | 'phone'>('healthid');
  const [roleMode, setRoleMode] = useState<'patient' | 'doctor'>('patient');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [recordsSubTab, setRecordsSubTab] = useState<RecordsTab>('conditions');
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit States
  const [editProblem, setEditProblem] = useState<MedicalProblem | null>(null);
  const [editMedication, setEditMedication] = useState<Medication | null>(null);
  const [editSurgery, setEditSurgery] = useState<Surgery | null>(null);
  const [editAllergy, setEditAllergy] = useState<Allergy | null>(null);
  const [editFamilyHistory, setEditFamilyHistory] = useState<FamilyHistory | null>(null);
  const [editNote, setEditNote] = useState<TreatmentNote | null>(null);
  const [editInsurance, setEditInsurance] = useState<Insurance | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);

  // AI & Schemes States
  const [isSearchingSchemes, setIsSearchingSchemes] = useState(false);
  const [generalSchemes, setGeneralSchemes] = useState<GovernmentScheme[]>([]);
  const [schemeSearchQuery, setSchemeSearchQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBiometricVerifying, setIsBiometricVerifying] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  // Hospital Results State
  const [isSearchingHospitals, setIsSearchingHospitals] = useState(false);
  const [hospitalSearchQuery, setHospitalSearchQuery] = useState('');
  const [selectedHospitalResults, setSelectedHospitalResults] = useState<HospitalRecommendation[]>([]);

  const activeDisplayUser = searchedPatient || currentUser;
  
  const [regForm, setRegForm] = useState<UserProfile>({
    name: '', age: 0, dob: '', gender: 'Male', phone: '', aadhaar: '',
    healthId: '', bloodGroup: 'O+', role: 'patient',
    specialization: '', licenseNumber: '', clinicName: '',
    notificationSettings: { email: true, sms: true, push: true, sound: true },
    visitingHours: { start: '09:00', end: '17:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }
  });

  useEffect(() => {
    const init = async () => {
      await dbService.init();
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        const record = await dbService.getRecord(savedSession);
        if (record && record.profile) {
          setCurrentUser(record);
          setIsAuth(true);
          setRoleMode(record.profile.role || 'patient');
          loadGeneralSchemes(record.profile.age);
        } else {
          localStorage.removeItem(SESSION_KEY);
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
    const results = await findApplicableSchemes({ condition: schemeSearchQuery } as any, currentUser?.profile?.age || 30);
    setGeneralSchemes(results);
    setIsSearchingSchemes(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);

    let record: HealthRecord | null;
    if (loginMethod === 'healthid') {
      record = await dbService.getRecord(loginId);
      if (!record || !record.profile || record.profile.role !== roleMode) {
        setAuthError(`Invalid ${roleMode === 'doctor' ? 'DR' : 'HS'} ID or Role mismatch.`);
        setIsSubmitting(false);
        return;
      }
    } else {
      if (!isVerifyingOtp) {
        const existingRecord = await dbService.getRecordByPhone(phoneInput);
        if (existingRecord && existingRecord.profile && existingRecord.profile.role === roleMode) {
          setIsVerifyingOtp(true);
          setIsSubmitting(false);
          return;
        } else {
          setAuthError("Phone number not registered or role mismatch.");
          setIsSubmitting(false);
          return;
        }
      } else {
        record = await dbService.getRecordByPhone(phoneInput);
      }
    }

    if (record && record.profile) {
      setCurrentUser(record);
      setIsAuth(true);
      localStorage.setItem(SESSION_KEY, record.profile.healthId);
      setRoleMode(record.profile.role || 'patient');
      loadGeneralSchemes(record.profile.age);
    }
    setIsSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError('');

    const prefix = roleMode === 'doctor' ? 'DR' : 'HS';
    const healthId = `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newRecord: HealthRecord = {
      profile: { ...regForm, healthId, role: roleMode },
      problems: [], medications: [], surgeries: [], allergies: [], notes: [],
      familyHistory: [], insurances: [], reminders: [], lastUpdated: Date.now(),
      auditLogs: []
    };

    try {
      await dbService.saveRecord(newRecord);
      setCurrentUser(newRecord);
      setIsAuth(true);
      setRoleMode(roleMode);
      localStorage.setItem(SESSION_KEY, healthId);
      loadGeneralSchemes(newRecord.profile.age);
    } catch (err: any) {
      setAuthError(`Registration failed: ${err.message || 'Storage Error'}`);
    } finally {
      setIsSubmitting(false);
    }
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
    const allRecords = await dbService.getAllRecords();
    const results = allRecords.filter(r => 
      r.profile && 
      r.profile.role === 'patient' && 
      (r.profile.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || 
       (r.profile.healthId && r.profile.healthId.includes(patientSearchQuery.toUpperCase())))
    );
    setPatientSearchResults(results);
    setIsSearchingPatient(false);
  };

  const handleAccessPatient = async (patient: HealthRecord) => {
    if (!currentUser || !patient.profile) return;
    
    const auditLog: AuditLog = {
      id: Date.now().toString(),
      doctorId: currentUser.profile.healthId,
      doctorName: currentUser.profile.name,
      action: 'VIEW',
      resource: 'Full Medical Record',
      details: `Accessed via Patient Index search`,
      timestamp: Date.now()
    };

    const updatedPatient = {
      ...patient,
      auditLogs: [auditLog, ...(patient.auditLogs || [])]
    };

    setSearchedPatient(updatedPatient);
    setAuthorizedPatientId(patient.profile.healthId);
    await dbService.saveRecord(updatedPatient);
  };

  const runSchemeAnalysis = async (problemId: string) => {
    const target = searchedPatient || currentUser;
    if (!target || !target.profile) return;
    const problem = target.problems.find(p => p.id === problemId);
    if (!problem) return;
    try {
      const schemes = await findApplicableSchemes(problem, target.profile.age);
      const updatedUser = { ...target, problems: target.problems.map(p => p.id === problemId ? { ...p, applicableSchemes: schemes } : p) };
      if (searchedPatient) setSearchedPatient(updatedUser);
      else setCurrentUser(updatedUser);
      await dbService.saveRecord(updatedUser);
    } catch (e) {
      console.error("Analysis failed", e);
    }
  };

  const handleSearchHospitals = async (condition: string) => {
    setIsSearchingHospitals(true);
    setHospitalSearchQuery(condition);
    try {
      const results = await findBestHospitals(condition);
      setSelectedHospitalResults(results);
      setActiveTab('specialists');
    } catch (err) {
      console.error("Hospital search failed", err);
    } finally {
      setIsSearchingHospitals(false);
    }
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

  const openEditModal = (type: ModalType, data: any) => {
    if (type === 'problem') setEditProblem(data);
    if (type === 'medication') setEditMedication(data);
    if (type === 'surgery') setEditSurgery(data);
    if (type === 'allergy') setEditAllergy(data);
    if (type === 'family_history') setEditFamilyHistory(data);
    if (type === 'note') setEditNote(data);
    if (type === 'add_insurance') setEditInsurance(data);
    if (type === 'reminder') setEditReminder(data);
    setShowAddModal(type);
  };

  const closeModals = () => {
    setShowAddModal(null);
    setEditProblem(null);
    setEditMedication(null);
    setEditSurgery(null);
    setEditAllergy(null);
    setEditFamilyHistory(null);
    setEditNote(null);
    setEditInsurance(null);
    setEditReminder(null);
  };

  const toggleVisitingDay = (day: string) => {
    if (!currentUser || !currentUser.profile) return;
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

  const updateNotificationSetting = (key: keyof NotificationSettings) => {
    if (!currentUser || !currentUser.profile) return;
    const settings = currentUser.profile.notificationSettings || { email: true, sms: true, push: true, sound: true };
    const updated = { 
      ...currentUser, 
      profile: { 
        ...currentUser.profile, 
        notificationSettings: { ...settings, [key]: !settings[key] } 
      } 
    };
    setCurrentUser(updated);
    dbService.saveRecord(updated);
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'records' && currentUser?.profile?.biometricEnabled) {
      setPendingTab(tab);
      setIsBiometricVerifying(true);
    } else {
      setActiveTab(tab);
    }
  };

  const verifyBiometric = () => {
    // Simulate biometric scan
    setTimeout(() => {
      setIsBiometricVerifying(false);
      if (pendingTab) {
        setActiveTab(pendingTab);
        setPendingTab(null);
      }
    }, 1500);
  };

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 md:p-6">
        <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-slate-200 animate-fade-in">
          <div className="text-center mb-6 md:mb-10">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl md:text-4xl text-white mx-auto mb-4 md:mb-6 shadow-xl">
              {ICONS.LOCK}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">{APP_NAME}</h1>
            <p className="text-slate-500 text-[10px] md:text-sm mt-2 font-medium uppercase tracking-widest">Next-Generation Clinical Vault</p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 md:mb-8 border border-slate-200 shadow-inner">
            <button 
              onClick={() => { setRoleMode('patient'); setAuthError(''); }} 
              className={`flex-1 py-2.5 md:py-3 text-[10px] md:text-xs font-black uppercase rounded-xl transition-all tracking-widest ${roleMode === 'patient' ? 'bg-white text-indigo-700 shadow-lg' : 'text-slate-400'}`}
            >
              Patient Path
            </button>
            <button 
              onClick={() => { setRoleMode('doctor'); setAuthError(''); }} 
              className={`flex-1 py-2.5 md:py-3 text-[10px] md:text-xs font-black uppercase rounded-xl transition-all tracking-widest ${roleMode === 'doctor' ? 'bg-white text-indigo-700 shadow-lg' : 'text-slate-400'}`}
            >
              Medical Pro
            </button>
          </div>

          <div className="flex justify-center space-x-6 md:space-x-10 mb-6 md:mb-10 text-[10px] md:text-sm">
            <button onClick={() => setAuthMode('login')} className={`font-black pb-2 border-b-2 uppercase tracking-widest ${authMode === 'login' ? 'text-indigo-600 border-indigo-600' : 'text-slate-300 border-transparent'}`}>Access Vault</button>
            <button onClick={() => setAuthMode('register')} className={`font-black pb-2 border-b-2 uppercase tracking-widest ${authMode === 'register' ? 'text-indigo-600 border-indigo-600' : 'text-slate-300 border-transparent'}`}>Create Identity</button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-6">
                <button type="button" onClick={() => setLoginMethod('healthid')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg tracking-widest ${loginMethod === 'healthid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>Node ID</button>
                <button type="button" onClick={() => setLoginMethod('phone')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg tracking-widest ${loginMethod === 'phone' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>Biometric SMS</button>
              </div>

              {loginMethod === 'healthid' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Identifier</label>
                  <input 
                    required 
                    placeholder={roleMode === 'doctor' ? "DR-XXXX-XXXX" : "HS-XXXX-XXXX"} 
                    className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-6 py-4 outline-none font-bold text-slate-800" 
                    value={loginId} 
                    onChange={e => setLoginId(e.target.value.toUpperCase())} 
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  {!isVerifyingOtp ? (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Identifier</label>
                      <input required type="tel" placeholder="+91 XXXXX XXXXX" className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-6 py-4 outline-none font-bold" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} />
                    </div>
                  ) : (
                    <div className="space-y-4 text-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Establishing Secure Link...</label>
                      <input required maxLength={4} className="w-full border-4 border-indigo-100 bg-indigo-50 rounded-3xl py-6 text-5xl font-black tracking-[0.5em] text-center text-indigo-700 outline-none shadow-inner" value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))} />
                    </div>
                  )}
                </div>
              )}
              {authError && <p className="text-red-500 text-xs font-black text-center uppercase">{authError}</p>}
              <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-[0.3em] text-xs">
                {isSubmitting ? 'Verifying Node...' : (isVerifyingOtp ? 'Initialize' : 'Access Tunnel')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-6 animate-fade-in">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Legal Name</label>
                <input required placeholder="Dr. Jane Smith / John Doe" className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-6 py-4 outline-none font-bold" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Age</label>
                   <input required type="number" className="w-full border-2 border-slate-100 bg-slate-50 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 outline-none font-bold" value={regForm.age || ''} onChange={e => setRegForm({...regForm, age: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gender</label>
                   <select required className="w-full border-2 border-slate-100 bg-slate-50 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 outline-none font-bold bg-white" value={regForm.gender} onChange={e => setRegForm({...regForm, gender: e.target.value})}>
                     <option value="Male">Male</option>
                     <option value="Female">Female</option>
                     <option value="Other">Other</option>
                   </select>
                </div>
              </div>
              {roleMode === 'doctor' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Specialization</label>
                      <input required placeholder="e.g. Cardiologist" className="w-full border-2 border-white bg-white rounded-2xl px-5 py-3 outline-none font-bold text-sm" value={regForm.specialization} onChange={e => setRegForm({...regForm, specialization: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Medical License #</label>
                      <input required placeholder="NMC-123456" className="w-full border-2 border-white bg-white rounded-2xl px-5 py-3 outline-none font-bold text-sm" value={regForm.licenseNumber} onChange={e => setRegForm({...regForm, licenseNumber: e.target.value})} />
                   </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Blood Group</label>
                   <select className="w-full border-2 border-slate-100 bg-slate-50 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 outline-none font-bold bg-white" value={regForm.bloodGroup} onChange={e => setRegForm({...regForm, bloodGroup: e.target.value})}>
                     {['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Phone</label>
                   <input required type="tel" className="w-full border-2 border-slate-100 bg-slate-50 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 outline-none font-bold" value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} />
                </div>
              </div>
              {authError && <p className="text-red-500 text-xs font-black text-center uppercase">{authError}</p>}
              <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-[0.3em] text-xs">
                {isSubmitting ? 'Provisioning...' : 'Initialize Identity'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={handleTabChange} 
      userName={currentUser?.profile?.name || ''} 
      healthId={currentUser?.profile?.healthId || ''}
      role={roleMode}
      profilePicture={currentUser?.profile?.profilePicture}
      onLogout={handleLogout}
    >
      <div className="space-y-12 animate-fade-in pb-16">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <div className="lg:col-span-8 space-y-6 md:space-y-8">
              <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-6 md:gap-10">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-3xl bg-slate-50 border-4 border-white shadow-xl flex items-center justify-center overflow-hidden shrink-0 group relative">
                   {currentUser?.profile?.profilePicture ? (
                     <img src={currentUser.profile.profilePicture} alt="" className="w-full h-full object-cover" />
                   ) : (
                     <i className="fas fa-user-shield text-4xl md:text-5xl text-slate-200"></i>
                   )}
                </div>
                <div className="text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row items-center gap-2 md:gap-3 mb-2">
                    <h3 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter">{currentUser?.profile?.name || 'Authorized User'}</h3>
                    {dbService.isUsingLocalVault() && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[8px] md:text-[9px] font-black uppercase rounded-lg border border-amber-200 flex items-center gap-1">
                        <i className="fas fa-offline"></i> Local
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 md:gap-4 items-center">
                    <div className="flex items-center bg-slate-100 rounded-full px-4 md:px-5 py-1.5 md:py-2 border border-slate-200">
                      <span className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-[0.1em] md:tracking-[0.2em]">{currentUser?.profile?.healthId || 'N/A'}</span>
                      <button onClick={() => handleCopyId(currentUser?.profile?.healthId || '')} className="ml-3 md:ml-4 text-slate-400 hover:text-indigo-600">
                        <i className={`fas ${copiedId === currentUser?.profile?.healthId ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
                      </button>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-black text-slate-400 bg-slate-100 px-4 md:px-5 py-1.5 md:py-2 rounded-full uppercase tracking-widest">{currentUser?.profile?.age || 0} Yrs</span>
                    <span className="text-[9px] md:text-[10px] font-black text-slate-400 bg-slate-100 px-4 md:px-5 py-1.5 md:py-2 rounded-full uppercase tracking-widest">{currentUser?.profile?.gender || 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <RecordCard title="Clinical Snapshot" icon={ICONS.MEDICAL}>
                  <div className="space-y-4">
                    {currentUser?.problems?.slice(0, 3).map(p => (
                      <div key={p.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group">
                        <span className="text-sm font-bold text-slate-800">{p.condition}</span>
                        <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${p.severity === 'severe' ? 'bg-red-50 text-red-600' : 'bg-slate-200 text-slate-500'}`}>{p.severity}</span>
                      </div>
                    ))}
                    {(!currentUser?.problems || currentUser.problems.length === 0) && <p className="text-xs text-slate-400 italic py-6 text-center">Your clinical ledger is currently clear.</p>}
                  </div>
                </RecordCard>
                <RecordCard title="Active Meds" icon={ICONS.MEDS}>
                  <div className="space-y-4">
                    {currentUser?.medications?.filter(m => m.status === 'active').slice(0, 3).map(m => (
                      <div key={m.id} className="p-5 bg-emerald-50/30 rounded-2xl border border-emerald-100/50 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{m.name}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.dosage} • {m.frequency}</p>
                        </div>
                        <i className="fas fa-pills text-emerald-400"></i>
                      </div>
                    ))}
                    {(!currentUser?.medications || currentUser.medications.length === 0) && <p className="text-xs text-slate-400 italic py-6 text-center">No active medications.</p>}
                  </div>
                </RecordCard>
                <RecordCard title="Vigilance" icon={<i className="fas fa-clock"></i>}>
                  <div className="space-y-4">
                    {currentUser?.reminders?.filter(r => r.status === 'pending').slice(0, 3).map(r => (
                      <div key={r.id} className="p-5 bg-amber-50/30 rounded-2xl border border-amber-100/50 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{r.title}</p>
                          <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">{r.date} • {r.time}</p>
                        </div>
                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                      </div>
                    ))}
                    {(!currentUser?.reminders || currentUser.reminders.length === 0) && <p className="text-xs text-slate-400 italic py-6 text-center">No pending reminders.</p>}
                  </div>
                </RecordCard>
                <RecordCard title="Welfare Benefits" icon={ICONS.SCHEME}>
                     <div className="space-y-4">
                       {generalSchemes.slice(0, 3).map(scheme => (
                         <div key={scheme.id} className="p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                            <p className="text-[10px] font-black text-indigo-700 mb-1 uppercase tracking-widest">{scheme.name}</p>
                            <p className="text-xs font-bold text-slate-600 leading-tight line-clamp-2">{scheme.benefits}</p>
                         </div>
                       ))}
                       <button onClick={() => setActiveTab('schemes')} className="w-full py-3 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-all">Explore All Pathways</button>
                     </div>
                </RecordCard>
              </div>
            </div>
            <div className="lg:col-span-4">
               <RecordCard title="Intelligence Core" icon={ICONS.AI} className="h-full">
                  <div className="space-y-8 flex flex-col h-full justify-between pb-4">
                    <div className="p-8 bg-slate-950 rounded-[2rem] border border-white/10 shadow-2xl">
                       <p className="text-xs font-bold text-indigo-300 leading-relaxed mb-6 opacity-80">Shield AI cross-references your clinical history with real-time Indian Government gazettes to map eligibility for 200+ welfare schemes.</p>
                       <div className="flex items-center gap-4 text-[9px] font-black uppercase text-white tracking-[0.3em]">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          Neural Sync Active
                       </div>
                    </div>
                    <button onClick={() => setActiveTab('shield')} className="w-full py-6 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-indigo-700 transition-all">
                       Initialize Chat Analysis
                    </button>
                  </div>
               </RecordCard>
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-10 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
              {/* Sub-navigation */}
              <aside className="w-full lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 shrink-0 no-scrollbar">
                {[
                  { id: 'conditions', label: 'Conditions', icon: ICONS.MEDICAL },
                  { id: 'medications', label: 'Meds', icon: ICONS.MEDS },
                  { id: 'surgeries', label: 'Surgeries', icon: ICONS.SURGERY },
                  { id: 'allergies', label: 'Allergies', icon: ICONS.ALLERGY },
                  { id: 'family', label: 'Family', icon: ICONS.FAMILY },
                  { id: 'notes', label: 'Notes', icon: ICONS.NOTE },
                  { id: 'insurance', label: 'Insurance', icon: ICONS.CREDIT_CARD },
                  { id: 'reminders', label: 'Reminders', icon: <i className="fas fa-clock"></i> },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setRecordsSubTab(item.id as RecordsTab)}
                    className={`flex-shrink-0 lg:w-full flex items-center space-x-3 md:space-x-4 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase transition-all ${
                      recordsSubTab === item.id
                        ? 'bg-indigo-600 text-white shadow-xl'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
                    }`}
                  >
                    <span className="text-base md:text-lg">{item.icon}</span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                ))}
              </aside>

              {/* Content Area */}
              <div className="flex-grow space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {recordsSubTab.charAt(0).toUpperCase() + recordsSubTab.slice(1)}
                  </h3>
                  <div className="flex gap-4">
                    {recordsSubTab === 'conditions' && (
                      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                        <button onClick={() => setRecordFilter('present')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${recordFilter === 'present' ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-400'}`}>Current</button>
                        <button onClick={() => setRecordFilter('past')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${recordFilter === 'past' ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-400'}`}>History</button>
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        const modalMap: Record<RecordsTab, ModalType> = {
                          conditions: 'problem',
                          medications: 'medication',
                          surgeries: 'surgery',
                          allergies: 'allergy',
                          family: 'family_history',
                          notes: 'note',
                          insurance: 'add_insurance',
                          reminders: 'reminder'
                        };
                        setShowAddModal(modalMap[recordsSubTab]);
                      }} 
                      className="px-8 py-3.5 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[9px] shadow-xl hover:bg-indigo-600 transition-all"
                    >
                      Add {recordsSubTab.slice(0, -1)}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {recordsSubTab === 'conditions' && (
                    <RecordCard title="Diagnostic Ledger" icon={ICONS.MEDICAL}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeDisplayUser?.problems?.filter(p => recordFilter === 'present' ? p.status === 'present' : p.status !== 'present').map(p => (
                          <div key={p.id} className="p-8 border border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-white transition-all relative group">
                            <div className="flex justify-between items-start mb-6">
                              <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">{p.condition}</h4>
                              <div className="flex items-center gap-4">
                                <span className={`text-[9px] font-black uppercase px-4 py-1.5 rounded-full ${p.severity === 'severe' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.severity}</span>
                                <button onClick={() => openEditModal('problem', p)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                              </div>
                            </div>
                            <div className="flex gap-4">
                              <button onClick={() => runSchemeAnalysis(p.id)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all">Identify Benefits</button>
                              <button onClick={() => handleSearchHospitals(p.condition)} className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 transition-all">Locate Experts</button>
                            </div>
                          </div>
                        ))}
                        {(!activeDisplayUser?.problems || activeDisplayUser.problems.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center col-span-full">No conditions recorded.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'medications' && (
                    <RecordCard title="Prescription Vault" icon={ICONS.MEDS}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeDisplayUser?.medications?.map(m => (
                          <div key={m.id} className="p-8 border border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-white transition-all relative group">
                            <div className="flex justify-between items-start mb-4">
                              <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{m.name}</h4>
                              <button onClick={() => openEditModal('medication', m)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                            </div>
                            <div className="space-y-2 mb-6">
                              <p className="text-sm font-bold text-slate-600"><i className="fas fa-prescription mr-2 text-indigo-400"></i>{m.dosage} - {m.frequency}</p>
                              <p className="text-xs text-slate-400 font-medium"><i className="fas fa-calendar-alt mr-2"></i>{m.duration}</p>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                              <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${m.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{m.status}</span>
                              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Since {m.startDate}</span>
                            </div>
                          </div>
                        ))}
                        {(!activeDisplayUser?.medications || activeDisplayUser.medications.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center col-span-full">No active prescriptions.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'surgeries' && (
                    <RecordCard title="Surgical History" icon={ICONS.SURGERY}>
                      <div className="space-y-6">
                        {activeDisplayUser?.surgeries?.map(s => (
                          <div key={s.id} className="p-8 border border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-white transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                              <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{s.type}</h4>
                              <p className="text-xs font-bold text-slate-500 mt-1">{s.hospital} • {s.surgeon}</p>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-sm font-black text-indigo-600">{s.date}</p>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.outcome || 'Success'}</p>
                              </div>
                              <button onClick={() => openEditModal('surgery', s)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                            </div>
                          </div>
                        ))}
                        {(!activeDisplayUser?.surgeries || activeDisplayUser.surgeries.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center">No surgical records found.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'allergies' && (
                    <RecordCard title="Allergy Profile" icon={ICONS.ALLERGY}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {activeDisplayUser?.allergies?.map(a => (
                          <div key={a.id} className="p-8 border border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-white transition-all text-center relative group">
                            <button onClick={() => openEditModal('allergy', a)} className="absolute top-6 right-6 text-slate-200 group-hover:text-indigo-600"><i className="fas fa-edit"></i></button>
                            <div className={`w-12 h-12 rounded-2xl mx-auto mb-6 flex items-center justify-center text-xl ${a.severity === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                              <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{a.substance}</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">{a.severity} Severity</p>
                            <p className="text-xs font-bold text-slate-600 leading-tight">{a.reaction}</p>
                          </div>
                        ))}
                        {(!activeDisplayUser?.allergies || activeDisplayUser.allergies.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center col-span-full">No allergies recorded.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'family' && (
                    <RecordCard title="Genetic Lineage" icon={ICONS.FAMILY}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeDisplayUser?.familyHistory?.map(f => (
                          <div key={f.id} className="p-8 border border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-white transition-all flex justify-between items-center">
                            <div>
                              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{f.relation}</p>
                              <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{f.condition}</h4>
                            </div>
                            <button onClick={() => openEditModal('family_history', f)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                          </div>
                        ))}
                        {(!activeDisplayUser?.familyHistory || activeDisplayUser.familyHistory.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center col-span-full">No family history recorded.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'notes' && (
                    <RecordCard title="Clinical Notes" icon={ICONS.NOTE}>
                      <div className="space-y-6">
                        {activeDisplayUser?.notes?.map(n => (
                          <div key={n.id} className="p-10 border border-slate-100 rounded-[2.5rem] bg-slate-50/50 hover:bg-white transition-all">
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600"><i className="fas fa-user-md"></i></div>
                                <div>
                                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{n.doctorName}</h4>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{n.category || 'Consultation'} • {n.date}</p>
                                </div>
                              </div>
                              <button onClick={() => openEditModal('note', n)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                            </div>
                            <p className="text-sm font-bold text-slate-600 leading-relaxed bg-white p-6 rounded-2xl border border-slate-100">{n.note}</p>
                          </div>
                        ))}
                        {(!activeDisplayUser?.notes || activeDisplayUser.notes.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center">No clinical notes recorded.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'insurance' && (
                    <RecordCard title="Policy Coverage" icon={ICONS.CREDIT_CARD}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {activeDisplayUser?.insurances?.map(i => (
                          <div key={i.id} className="p-10 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-indigo-600/40 transition-all"></div>
                            <div className="relative z-10">
                              <div className="flex justify-between items-start mb-10">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">{i.provider}</p>
                                  <h4 className="text-2xl font-black uppercase tracking-tighter">{i.policyType}</h4>
                                </div>
                                <button onClick={() => openEditModal('add_insurance', i)} className="text-white/30 hover:text-white transition-all"><i className="fas fa-edit"></i></button>
                              </div>
                              <div className="space-y-6">
                                <div className="flex justify-between items-end">
                                  <div>
                                    <p className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Policy Number</p>
                                    <p className="text-base font-black tracking-widest">{i.policyNumber}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Coverage</p>
                                    <p className="text-xl font-black text-emerald-400">₹{i.coverageAmount}</p>
                                  </div>
                                </div>
                                <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                                  <span className={`text-[9px] font-black uppercase px-4 py-1.5 rounded-full ${i.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{i.status}</span>
                                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Expires {i.expiryDate}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(!activeDisplayUser?.insurances || activeDisplayUser.insurances.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center col-span-full">No insurance policies recorded.</p>}
                      </div>
                    </RecordCard>
                  )}

                  {recordsSubTab === 'reminders' && (
                    <RecordCard title="Vigilance Reminders" icon={<i className="fas fa-clock"></i>}>
                      <div className="space-y-4">
                        {activeDisplayUser?.reminders?.map(r => (
                          <div key={r.id} className="p-6 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white transition-all flex items-center gap-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${r.type === 'appointment' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                              <i className={`fas ${r.type === 'appointment' ? 'fa-calendar-check' : 'fa-pills'}`}></i>
                            </div>
                            <div className="flex-grow">
                              <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">{r.title}</h4>
                              <p className="text-xs font-bold text-slate-400">{r.date} at {r.time}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${r.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{r.status}</span>
                              <button onClick={() => openEditModal('reminder', r)} className="text-slate-300 hover:text-indigo-600 transition-all"><i className="fas fa-edit"></i></button>
                            </div>
                          </div>
                        ))}
                        {(!activeDisplayUser?.reminders || activeDisplayUser.reminders.length === 0) && <p className="text-xs text-slate-400 italic py-12 text-center">No active reminders.</p>}
                      </div>
                    </RecordCard>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schemes' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
            <div className="bg-indigo-600 rounded-[3rem] p-16 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <h3 className="text-4xl font-black mb-6 uppercase">Welfare Pathways</h3>
              <form onSubmit={handleSchemeSearch} className="relative max-w-2xl">
                <input className="w-full bg-white/10 border border-white/20 rounded-3xl pl-16 pr-8 py-6 text-xl font-bold text-white outline-none focus:bg-white focus:text-slate-900 transition-all shadow-2xl" placeholder="Search by condition or name..." value={schemeSearchQuery} onChange={(e) => setSchemeSearchQuery(e.target.value)} />
                <button type="submit" disabled={isSearchingSchemes} className="absolute right-4 top-1/2 -translate-y-1/2 px-10 py-3.5 bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs shadow-xl">{isSearchingSchemes ? 'Searching...' : 'Search'}</button>
              </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {generalSchemes.map(scheme => (
                <div key={scheme.id} className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
                  <div className="flex justify-between items-start mb-8">
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">{scheme.name}</h4>
                    <span className="px-4 py-2 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-xl">Govt Scheme</span>
                  </div>
                  <div className="space-y-6 flex-grow">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Benefits</p>
                      <p className="text-sm font-bold text-slate-600 leading-relaxed">{scheme.benefits}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Eligibility</p>
                      <p className="text-sm font-bold text-slate-600 leading-relaxed">{scheme.eligibility}</p>
                    </div>
                    {scheme.coverageAmount && (
                      <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Coverage Amount</p>
                        <p className="text-2xl font-black text-emerald-700">{scheme.coverageAmount}</p>
                      </div>
                    )}
                  </div>
                  <button className="w-full mt-10 py-5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Apply via Portal</button>
                </div>
              ))}
              {generalSchemes.length === 0 && !isSearchingSchemes && <p className="text-center py-20 text-slate-400 font-bold col-span-full">No matching schemes found. Try a broader search.</p>}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="max-w-5xl mx-auto space-y-6 md:space-y-10 animate-fade-in">
            <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 border border-slate-100 shadow-sm">
              <div className="flex flex-col sm:flex-row items-center justify-between mb-8 md:mb-12 gap-4">
                <div className="text-center sm:text-left">
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase">Vault Access Logs</h3>
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Real-time monitoring of clinical record access</p>
                </div>
                <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl md:text-2xl shadow-inner"><i className="fas fa-user-shield"></i></div>
              </div>
              <div className="space-y-4">
                {currentUser?.auditLogs?.length ? currentUser.auditLogs.map(log => (
                  <div key={log.id} className="p-5 md:p-8 bg-slate-50 rounded-2xl md:rounded-[2rem] border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 group hover:bg-white transition-all">
                    <div className="flex items-center gap-4 md:gap-6">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${log.action === 'VIEW' ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                        <i className={`fas ${log.action === 'VIEW' ? 'fa-eye' : 'fa-edit'}`}></i>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base md:text-lg font-black text-slate-900 uppercase tracking-tight truncate">{log.doctorName}</h4>
                        <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{log.resource} • {log.details}</p>
                      </div>
                    </div>
                    <div className="text-left md:text-right w-full md:w-auto">
                      <p className="text-xs md:text-sm font-black text-slate-900">{new Date(log.timestamp).toLocaleString()}</p>
                      <span className={`text-[8px] md:text-[9px] font-black uppercase px-2 md:px-3 py-1 rounded-lg ${log.action === 'VIEW' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>{log.action}</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 md:py-20">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 text-3xl md:text-4xl mx-auto mb-4 md:mb-6"><i className="fas fa-history"></i></div>
                    <p className="text-xs md:text-sm text-slate-400 font-bold italic">No access logs recorded in your vault history.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6 md:gap-8 animate-fade-in">
            <aside className="w-full lg:w-72 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 shrink-0 no-scrollbar">
              <button onClick={() => setSettingsSubTab('personal')} className={`flex-shrink-0 lg:w-full flex items-center space-x-3 md:space-x-4 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase transition-all ${settingsSubTab === 'personal' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}><i className="fas fa-user-circle"></i><span className="whitespace-nowrap">Identity</span></button>
              {roleMode === 'doctor' && (
                <button onClick={() => setSettingsSubTab('professional')} className={`flex-shrink-0 lg:w-full flex items-center space-x-3 md:space-x-4 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase transition-all ${settingsSubTab === 'professional' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}><i className="fas fa-user-md"></i><span className="whitespace-nowrap">Professional</span></button>
              )}
              <button onClick={() => setSettingsSubTab('notifications')} className={`flex-shrink-0 lg:w-full flex items-center space-x-3 md:space-x-4 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase transition-all ${settingsSubTab === 'notifications' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}><i className="fas fa-bell"></i><span className="whitespace-nowrap">Alerts</span></button>
              <button onClick={() => setSettingsSubTab('security')} className={`flex-shrink-0 lg:w-full flex items-center space-x-3 md:space-x-4 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase transition-all ${settingsSubTab === 'security' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}><i className="fas fa-shield-alt"></i><span className="whitespace-nowrap">Security</span></button>
            </aside>
            <div className="flex-grow">
              <div className="bg-white rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px] md:min-h-[600px]">
                {settingsSubTab === 'personal' && (
                  <div className="p-6 md:p-16 space-y-8 md:space-y-12 animate-fade-in">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10 pb-8 md:pb-10 border-b border-slate-50">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-slate-50 border-2 border-slate-200 overflow-hidden flex items-center justify-center text-slate-200 text-3xl md:text-4xl">
                        {currentUser?.profile?.profilePicture ? <img src={currentUser.profile.profilePicture} className="w-full h-full object-cover" /> : <i className="fas fa-user"></i>}
                      </div>
                      <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase leading-none text-center sm:text-left">Identity Records</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-12 gap-y-6 md:gap-y-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400">Legal Display Name</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black outline-none focus:border-indigo-500" value={currentUser?.profile?.name || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, name: e.target.value}} : null)} />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400">Birth Record</label>
                        <input type="date" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black outline-none focus:border-indigo-500" value={currentUser?.profile?.dob || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, dob: e.target.value}} : null)} />
                      </div>
                    </div>
                    <div className="pt-6 md:pt-10 flex justify-center md:justify-end">
                      <button onClick={async () => { if (currentUser) { setIsSubmitting(true); await dbService.saveRecord(currentUser); setIsSubmitting(false); } }} className="w-full md:w-auto px-8 md:px-12 py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-[10px] uppercase shadow-2xl hover:bg-indigo-700 transition-all">Authorize Vault Update</button>
                    </div>
                  </div>
                )}
                {settingsSubTab === 'professional' && roleMode === 'doctor' && (
                  <div className="p-6 md:p-16 space-y-8 md:space-y-12 animate-fade-in">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10 pb-8 md:pb-10 border-b border-slate-50">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center text-indigo-600 text-3xl md:text-4xl"><i className="fas fa-stethoscope"></i></div>
                      <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase leading-none text-center sm:text-left">Credentials</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-12 gap-y-6 md:gap-y-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400">Specialization</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black" value={currentUser?.profile?.specialization || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, specialization: e.target.value}} : null)} />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400">Clinic Name</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black" value={currentUser?.profile?.clinicName || ''} onChange={e => setCurrentUser(prev => prev ? {...prev, profile: {...prev.profile, clinicName: e.target.value}} : null)} />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase text-slate-400">Visiting Days</label>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                         {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                           <button key={day} onClick={() => toggleVisitingDay(day)} className={`px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase transition-all ${currentUser?.profile?.visitingHours?.days?.includes(day) ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border-2 border-slate-100 text-slate-400'}`}>{day}</button>
                         ))}
                      </div>
                    </div>
                    <div className="pt-6 md:pt-10 flex justify-center md:justify-end">
                      <button onClick={async () => { if (currentUser) { setIsSubmitting(true); await dbService.saveRecord(currentUser); setIsSubmitting(false); } }} className="w-full md:w-auto px-8 md:px-12 py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-[10px] uppercase shadow-2xl hover:bg-indigo-700 transition-all">Authorize Practice Update</button>
                    </div>
                  </div>
                )}
                {settingsSubTab === 'notifications' && (
                  <div className="p-6 md:p-16 space-y-8 md:space-y-12 animate-fade-in">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10 pb-8 md:pb-10 border-b border-slate-50">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-amber-50 border-2 border-amber-100 flex items-center justify-center text-amber-600 text-3xl md:text-4xl"><i className="fas fa-bell"></i></div>
                      <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase leading-none text-center sm:text-left">Alert Preferences</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                      {[
                        { key: 'email', label: 'Email Notifications', icon: 'fa-envelope' },
                        { key: 'sms', label: 'SMS Alerts', icon: 'fa-comment-alt' },
                        { key: 'push', label: 'Push Notifications', icon: 'fa-mobile-alt' },
                        { key: 'sound', label: 'Critical Sound Alerts', icon: 'fa-volume-up' }
                      ].map(item => (
                        <div key={item.key} className="p-5 md:p-8 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all">
                          <div className="flex items-center gap-4 md:gap-6">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm transition-colors">
                              <i className={`fas ${item.icon}`}></i>
                            </div>
                            <span className="font-black text-slate-700 uppercase text-[10px] md:text-xs">{item.label}</span>
                          </div>
                          <button 
                            onClick={() => updateNotificationSetting(item.key as keyof NotificationSettings)}
                            className={`w-12 md:w-14 h-7 md:h-8 rounded-full relative transition-all ${currentUser?.profile?.notificationSettings?.[item.key as keyof NotificationSettings] !== false ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 md:top-1 w-6 h-6 bg-white rounded-full transition-all ${currentUser?.profile?.notificationSettings?.[item.key as keyof NotificationSettings] !== false ? 'right-0.5 md:right-1' : 'left-0.5 md:left-1'}`}></div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {settingsSubTab === 'security' && (
                  <div className="p-6 md:p-16 space-y-8 md:space-y-12 animate-fade-in">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10 pb-8 md:pb-10 border-b border-slate-50">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center text-emerald-600 text-3xl md:text-4xl"><i className="fas fa-shield-alt"></i></div>
                      <h3 className="text-2xl md:text-3xl font-black text-slate-900 uppercase leading-none text-center sm:text-left">Vault Security</h3>
                    </div>
                    <div className="space-y-6 md:space-y-8">
                      <div className="p-6 md:p-10 bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Digital Health Identity</p>
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-xl md:text-3xl font-black tracking-tighter truncate">{currentUser?.profile?.healthId}</h4>
                          <button onClick={() => handleCopyId(currentUser?.profile?.healthId || '')} className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all shrink-0">
                            <i className={`fas ${copiedId === currentUser?.profile?.healthId ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                        <div className="p-6 md:p-8 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                              <i className="fas fa-fingerprint"></i>
                            </div>
                            <span className="font-black text-slate-700 uppercase text-[10px] md:text-xs">FaceID / Fingerprint</span>
                          </div>
                          <button 
                            onClick={() => {
                              if (currentUser) {
                                const updated = { ...currentUser, profile: { ...currentUser.profile, biometricEnabled: !currentUser.profile.biometricEnabled } };
                                setCurrentUser(updated);
                                dbService.saveRecord(updated);
                              }
                            }}
                            className={`w-12 h-7 rounded-full relative transition-all ${currentUser?.profile?.biometricEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${currentUser?.profile?.biometricEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                          </button>
                        </div>
                        <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Vault Encryption</p>
                          <p className="text-sm font-bold text-slate-600 mb-6">Your data is encrypted with AES-256 military-grade protocol.</p>
                          <span className="px-4 py-2 bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase rounded-lg">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'specialists' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
            <div className="bg-gradient-to-br from-emerald-600 to-slate-900 text-white p-16 rounded-[3rem] shadow-2xl relative overflow-hidden">
               <h3 className="text-4xl font-black mb-4 uppercase">Expertise Index</h3>
               <form onSubmit={(e) => { e.preventDefault(); handleSearchHospitals(hospitalSearchQuery); }} className="relative">
                 <input className="w-full bg-white/10 border border-white/20 rounded-3xl pl-16 pr-8 py-6 text-xl font-bold text-white outline-none focus:bg-white focus:text-slate-900 transition-all shadow-2xl" placeholder="Query specialty (e.g. Oncology)..." value={hospitalSearchQuery} onChange={(e) => setHospitalSearchQuery(e.target.value)} />
                 <button type="submit" disabled={isSearchingHospitals} className="absolute right-4 top-1/2 -translate-y-1/2 px-10 py-3.5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl">{isSearchingHospitals ? 'Locating...' : 'Search'}</button>
               </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {selectedHospitalResults.map(h => (
                <div key={h.id} className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
                  <h5 className="text-2xl font-black text-slate-900 leading-none">{h.name}</h5>
                  <p className="text-[10px] font-black text-slate-400 mt-3 uppercase">{h.location}</p>
                  <div className="p-6 bg-slate-50 rounded-3xl my-8 flex-grow">
                     <p className="text-sm font-bold text-slate-700 leading-relaxed mb-6">{h.specialty}</p>
                     <div className="flex flex-wrap gap-2">{h.highlights?.map((tag, i) => (<span key={i} className="px-4 py-2 bg-white text-[9px] font-black uppercase text-indigo-400 rounded-xl">{tag}</span>))}</div>
                  </div>
                  {h.officialLinks?.[0] && <a href={h.officialLinks[0].uri} target="_blank" className="w-full py-4 bg-slate-950 text-white text-[10px] font-black uppercase text-center rounded-2xl">Official Link</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'shield' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-16rem)] bg-white rounded-[3rem] shadow-3xl border border-slate-100 overflow-hidden flex flex-col relative animate-fade-in">
            <div className="p-10 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white text-3xl shadow-xl">{ICONS.AI}</div>
                <h3 className="text-2xl font-black text-slate-900 uppercase">Shield AI Console</h3>
              </div>
            </div>
            <div className="flex-grow overflow-y-auto p-12 space-y-10 bg-slate-50/30">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-10 rounded-[2.5rem] ${m.role === 'user' ? 'bg-slate-950 text-white' : 'bg-white border border-slate-100 text-slate-800'}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
              {isAiLoading && <div className="p-8 bg-white border border-slate-100 rounded-3xl w-fit shadow-xl">Thinking...</div>}
            </div>
            <div className="p-10 border-t border-slate-100 bg-white">
              <div className="bg-slate-100 rounded-[2rem] p-3 flex items-center border border-slate-200/50">
                <input className="flex-grow bg-transparent outline-none px-10 py-5 text-base font-black" placeholder="Ask about clinical history..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAskAi()} />
                <button onClick={handleAskAi} disabled={isAiLoading} className="w-20 h-20 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl"><i className="fas fa-paper-plane text-2xl"></i></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && roleMode === 'doctor' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
            {authorizedPatientId ? (
              <div className="space-y-10">
                <div className="bg-emerald-600 rounded-[3rem] p-12 flex items-center justify-between text-white shadow-2xl">
                  <div>
                    <h4 className="text-4xl font-black mb-3 uppercase">{searchedPatient?.profile?.name}</h4>
                    <p className="text-xs font-black uppercase opacity-80">{searchedPatient?.profile?.healthId}</p>
                  </div>
                  <button onClick={() => { setSearchedPatient(null); setAuthorizedPatientId(null); }} className="bg-white text-emerald-700 px-12 py-5 rounded-[2rem] font-black uppercase text-[10px]">Disconnect Vault</button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[4rem] p-20 shadow-2xl border border-slate-100 text-center">
                <h3 className="text-5xl font-black text-slate-900 mb-12 uppercase">Patient Index</h3>
                <form onSubmit={handleSearchPatient} className="max-w-3xl mx-auto relative group">
                  <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] pl-10 pr-10 py-8 text-2xl font-black focus:bg-white outline-none" placeholder="Enter ID or Name..." value={patientSearchQuery} onChange={e => setPatientSearchQuery(e.target.value)} />
                  <button type="submit" disabled={isSearchingPatient} className="absolute right-4 top-1/2 -translate-y-1/2 px-12 py-5 bg-slate-950 text-white rounded-[2rem] font-black uppercase tracking-[0.4em] text-[10px]">{isSearchingPatient ? 'Searching...' : 'Search'}</button>
                </form>
                <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-10">
                   {patientSearchResults.map(p => (
                     <div key={p.profile?.healthId} className="bg-slate-50 p-8 rounded-[2.5rem] flex items-center justify-between group hover:bg-indigo-600 hover:text-white transition-all cursor-pointer shadow-sm" onClick={() => handleAccessPatient(p)}>
                        <div className="text-left">
                           <p className="font-black uppercase text-lg">{p.profile?.name}</p>
                           <p className="text-[10px] font-black uppercase opacity-50">{p.profile?.healthId}</p>
                        </div>
                        <i className="fas fa-chevron-right"></i>
                     </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Biometric Verification Modal */}
      {isBiometricVerifying && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 text-center shadow-2xl border border-white/20">
            <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center text-5xl text-white mx-auto mb-8 shadow-2xl animate-pulse">
              <i className="fas fa-fingerprint"></i>
            </div>
            <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-4">Biometric Required</h3>
            <p className="text-slate-500 font-bold mb-10">Please verify your identity using FaceID or Fingerprint to access clinical records.</p>
            <button 
              onClick={verifyBiometric}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-800 transition-all"
            >
              Scan Biometrics
            </button>
            <button 
              onClick={() => { setIsBiometricVerifying(false); setPendingTab(null); }}
              className="mt-6 text-[10px] font-black uppercase text-slate-400 hover:text-red-500 transition-colors"
            >
              Cancel Access
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/40 backdrop-blur-xl animate-backdrop-fade">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 relative border border-slate-100 shadow-4xl animate-modal-pop">
            <button onClick={closeModals} className="absolute top-10 right-10 w-12 h-12 rounded-full bg-slate-50 text-slate-300 hover:text-slate-900 transition-all text-2xl">&times;</button>
            {showAddModal === 'problem' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">{editProblem ? 'Modify' : 'Archive'} Diagnosis</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const pId = editProblem ? editProblem.id : Date.now().toString();
                  const newProb: MedicalProblem = {
                    id: pId, condition: formData.get('condition') as string, severity: formData.get('severity') as any,
                    status: (formData.get('status') as any) || 'present', onsetDate: editProblem ? editProblem.onsetDate : new Date().toISOString()
                  };
                  let updatedProblems = target.problems || [];
                  if (editProblem) updatedProblems = updatedProblems.map(p => p.id === editProblem.id ? newProb : p);
                  else updatedProblems = [newProb, ...updatedProblems];
                  const updated = { ...target, problems: updatedProblems };
                  if (searchedPatient) setSearchedPatient(updated);
                  else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                  if (!editProblem) runSchemeAnalysis(pId);
                }} className="space-y-12">
                  <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase">Diagnostic Name</label><input required name="condition" defaultValue={editProblem?.condition} placeholder="e.g. Chronic Kidney Disease" className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-10 py-6 text-xl font-black outline-none focus:border-indigo-500" /></div>
                  <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase">Severity</label><select name="severity" defaultValue={editProblem?.severity || 'mild'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-10 py-6 text-xl font-black"><option value="mild">Routine</option><option value="moderate">Serious</option><option value="severe">Critical</option></select></div>
                  <button className="w-full py-8 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase text-[10px] shadow-3xl hover:bg-indigo-600 transition-all">Commit to Clinical Ledger</button>
                </form>
              </>
            )}

            {showAddModal === 'medication' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">{editMedication ? 'Adjust' : 'Prescribe'} Medication</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newMed: Medication = {
                    id: editMedication ? editMedication.id : Date.now().toString(),
                    name: formData.get('name') as string,
                    dosage: formData.get('dosage') as string,
                    frequency: formData.get('frequency') as string,
                    duration: formData.get('duration') as string,
                    startDate: formData.get('startDate') as string,
                    status: 'active'
                  };
                  const updated = { ...target, medications: editMedication ? target.medications.map(m => m.id === editMedication.id ? newMed : m) : [newMed, ...target.medications] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Medication Name</label><input required name="name" defaultValue={editMedication?.name} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Dosage</label><input required name="dosage" defaultValue={editMedication?.dosage} placeholder="500mg" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Frequency</label><input required name="frequency" defaultValue={editMedication?.frequency} placeholder="Twice daily" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Duration</label><input required name="duration" defaultValue={editMedication?.duration} placeholder="14 days" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Start Date</label><input required type="date" name="startDate" defaultValue={editMedication?.startDate || new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <button className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Update Prescription</button>
                </form>
              </>
            )}

            {showAddModal === 'surgery' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Surgical Record</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newSurg: Surgery = {
                    id: editSurgery ? editSurgery.id : Date.now().toString(),
                    type: formData.get('type') as string,
                    date: formData.get('date') as string,
                    hospital: formData.get('hospital') as string,
                    surgeon: formData.get('surgeon') as string
                  };
                  const updated = { ...target, surgeries: editSurgery ? target.surgeries.map(s => s.id === editSurgery.id ? newSurg : s) : [newSurg, ...target.surgeries] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Procedure Type</label><input required name="type" defaultValue={editSurgery?.type} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Hospital/Facility</label><input required name="hospital" defaultValue={editSurgery?.hospital} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Surgeon</label><input required name="surgeon" defaultValue={editSurgery?.surgeon} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Date</label><input required type="date" name="date" defaultValue={editSurgery?.date} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <button className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Archive Procedure</button>
                </form>
              </>
            )}

            {showAddModal === 'allergy' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Allergy Alert</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newAllergy: Allergy = {
                    id: editAllergy ? editAllergy.id : Date.now().toString(),
                    substance: formData.get('substance') as string,
                    severity: formData.get('severity') as any,
                    reaction: formData.get('reaction') as string
                  };
                  const updated = { ...target, allergies: editAllergy ? target.allergies.map(a => a.id === editAllergy.id ? newAllergy : a) : [newAllergy, ...target.allergies] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Substance/Trigger</label><input required name="substance" defaultValue={editAllergy?.substance} placeholder="e.g. Penicillin" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Severity</label><select name="severity" defaultValue={editAllergy?.severity || 'low'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High/Anaphylactic</option></select></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Typical Reaction</label><textarea name="reaction" defaultValue={editAllergy?.reaction} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold h-32" /></div>
                  <button className="w-full py-6 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Flag Allergy</button>
                </form>
              </>
            )}

            {showAddModal === 'family_history' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Genetic History</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newFam: FamilyHistory = {
                    id: editFamilyHistory ? editFamilyHistory.id : Date.now().toString(),
                    relation: formData.get('relation') as string,
                    condition: formData.get('condition') as string
                  };
                  const updated = { ...target, familyHistory: editFamilyHistory ? target.familyHistory.map(f => f.id === editFamilyHistory.id ? newFam : f) : [newFam, ...target.familyHistory] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Relative Relation</label><input required name="relation" defaultValue={editFamilyHistory?.relation} placeholder="e.g. Father" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Condition</label><input required name="condition" defaultValue={editFamilyHistory?.condition} placeholder="e.g. Diabetes Type 2" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <button className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Save Genetic Record</button>
                </form>
              </>
            )}

            {showAddModal === 'note' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Clinical Note</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newNote: TreatmentNote = {
                    id: editNote ? editNote.id : Date.now().toString(),
                    doctorName: formData.get('doctorName') as string,
                    date: formData.get('date') as string,
                    note: formData.get('note') as string,
                    category: formData.get('category') as any
                  };
                  const updated = { ...target, notes: editNote ? target.notes.map(n => n.id === editNote.id ? newNote : n) : [newNote, ...target.notes] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Doctor Name</label><input required name="doctorName" defaultValue={editNote?.doctorName || (roleMode === 'doctor' ? currentUser?.profile?.name : '')} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Date</label><input required type="date" name="date" defaultValue={editNote?.date || new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Category</label><select name="category" defaultValue={editNote?.category || 'Consultation'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold"><option value="Consultation">Consultation</option><option value="Follow-up">Follow-up</option><option value="Emergency">Emergency</option><option value="Surgery">Surgery</option></select></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Clinical Findings</label><textarea required name="note" defaultValue={editNote?.note} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold h-48" /></div>
                  <button className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Authorize Note</button>
                </form>
              </>
            )}

            {showAddModal === 'add_insurance' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Insurance Policy</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newIns: Insurance = {
                    id: editInsurance ? editInsurance.id : Date.now().toString(),
                    provider: formData.get('provider') as string,
                    policyNumber: formData.get('policyNumber') as string,
                    coverageAmount: formData.get('coverageAmount') as string,
                    expiryDate: formData.get('expiryDate') as string,
                    policyType: formData.get('policyType') as any,
                    contactPhone: formData.get('contactPhone') as string,
                    status: 'active'
                  };
                  const updated = { ...target, insurances: editInsurance ? (target.insurances || []).map(i => i.id === editInsurance.id ? newIns : i) : [newIns, ...(target.insurances || [])] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-6">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Insurance Provider</label><input required name="provider" defaultValue={editInsurance?.provider} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Policy Number</label><input required name="policyNumber" defaultValue={editInsurance?.policyNumber} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Coverage Amount (₹)</label><input required name="coverageAmount" defaultValue={editInsurance?.coverageAmount} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Policy Type</label><select name="policyType" defaultValue={editInsurance?.policyType || 'Individual'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold"><option value="Individual">Individual</option><option value="Family Floater">Family Floater</option><option value="Critical Illness">Critical Illness</option></select></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Expiry Date</label><input required type="date" name="expiryDate" defaultValue={editInsurance?.expiryDate} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <button className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Secure Policy</button>
                </form>
              </>
            )}

            {showAddModal === 'reminder' && (
              <>
                <h3 className="text-3xl font-black text-slate-900 mb-16 uppercase">Health Reminder</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const target = searchedPatient || currentUser;
                  if (!target) return;
                  const formData = new FormData(e.currentTarget);
                  const newRem: Reminder = {
                    id: editReminder ? editReminder.id : Date.now().toString(),
                    title: formData.get('title') as string,
                    description: formData.get('description') as string,
                    date: formData.get('date') as string,
                    time: formData.get('time') as string,
                    type: formData.get('type') as any,
                    status: 'pending'
                  };
                  const updated = { ...target, reminders: editReminder ? (target.reminders || []).map(r => r.id === editReminder.id ? newRem : r) : [newRem, ...(target.reminders || [])] };
                  if (searchedPatient) setSearchedPatient(updated); else setCurrentUser(updated);
                  await dbService.saveRecord(updated);
                  closeModals();
                }} className="space-y-6">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Reminder Title</label><input required name="title" defaultValue={editReminder?.title} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Date</label><input required type="date" name="date" defaultValue={editReminder?.date} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Time</label><input required type="time" name="time" defaultValue={editReminder?.time} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold" /></div>
                  </div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Type</label><select name="type" defaultValue={editReminder?.type || 'appointment'} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold"><option value="appointment">Appointment</option><option value="medication">Medication</option><option value="followup">Follow-up</option><option value="lifestyle">Lifestyle</option></select></div>
                  <button className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Set Reminder</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
