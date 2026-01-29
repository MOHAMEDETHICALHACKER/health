
import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, HealthRecord, ChatMessage, Interaction, MedicalProblem, Medication, Surgery, Allergy, TreatmentNote, FamilyHistory } from './types';
import { ICONS, APP_NAME } from './constants';
import Layout from './components/Layout';
import RecordCard from './components/RecordCard';
import { analyzeHealthRecord } from './services/geminiService';
import { dbService } from './services/dbService';

const SESSION_KEY = 'health_shield_active_session';
const LAST_HID_KEY = 'health_shield_last_hid';

type ModalType = 'problem' | 'note' | 'medication' | 'surgery' | 'allergy' | 'family' | null;

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
  const [problemFilter, setProblemFilter] = useState<'