
export interface VisitingHours {
  start: string; // HH:mm
  end: string;   // HH:mm
  days: string[]; // ['Mon', 'Tue', ...]
}

export interface NotificationSettings {
  email: boolean;
  sms: boolean;
  push: boolean;
  sound: boolean;
}

export interface GovernmentScheme {
  id: string;
  name: string;
  benefits: string;
  eligibility: string;
  coverageAmount?: string;
  matchReason?: string;
  officialLink?: string;
  officialSources?: { title: string; uri: string }[];
  requiredDocuments?: string[];
  applicationSteps?: string[];
}

export interface Insurance {
  id: string;
  provider: string;
  policyNumber: string;
  coverageAmount: string;
  expiryDate: string;
  policyType: 'Individual' | 'Family Floater' | 'Critical Illness';
  contactPhone: string;
  status: 'active' | 'expired';
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  time?: string; // HH:mm
  date?: string; // YYYY-MM-DD
  type: 'appointment' | 'refill' | 'followup' | 'personal' | 'custom' | 'medication' | 'lifestyle';
  status: 'pending' | 'completed';
}

export interface AuditLog {
  id: string;
  doctorId: string;
  doctorName: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE';
  resource: string;
  details: string;
  timestamp: number;
}

export interface UserProfile {
  name: string;
  age: number;
  dob: string;
  gender: string;
  phone: string;
  aadhaar: string;
  healthId: string;
  bloodGroup: string;
  role: 'patient' | 'doctor';
  profilePicture?: string; // Base64 encoded string
  specialization?: string;
  licenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  isPremium?: boolean;
  subscriptionPlan?: 'standard' | 'pro' | 'family';
  subscriptionExpiry?: string;
  visitingHours?: VisitingHours;
  notificationSettings?: NotificationSettings;
}

export interface MedicalProblem {
  id: string;
  condition: string;
  status: 'past' | 'present' | 'recovered';
  isChronic?: boolean;
  onsetDate: string;
  endDate?: string;
  severity: 'mild' | 'moderate' | 'severe';
  treatment?: string;
  notes?: string;
  applicableSchemes?: GovernmentScheme[];
  treatmentProvider?: string;
  prescriptionDetails?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  duration: string;
  frequency: string;
  startDate: string;
  instructions?: string;
  prescribedBy?: string;
  status: 'active' | 'discontinued';
}

export interface Surgery {
  id: string;
  type: string;
  date: string;
  hospital: string;
  surgeon: string;
  outcome?: string;
}

export interface Allergy {
  id: string;
  substance: string;
  severity: 'low' | 'moderate' | 'high';
  reaction?: string;
  firstObserved?: string;
}

export interface TreatmentNote {
  id: string;
  doctorName: string;
  date: string;
  note: string;
  clinicName?: string;
  category?: 'Consultation' | 'Follow-up' | 'Emergency' | 'Surgery';
}

export interface FamilyHistory {
  id: string;
  relation: string;
  condition: string;
  notableNotes?: string;
}

export interface Interaction {
  id: string;
  query: string;
  response: string;
  timestamp: number;
}

export interface DoctorAccessLog {
  patientHealthId: string;
  patientName: string;
  timestamp: number;
}

export interface HealthRecord {
  profile: UserProfile;
  problems: MedicalProblem[];
  medications: Medication[];
  surgeries: Surgery[];
  allergies: Allergy[];
  notes: TreatmentNote[];
  familyHistory: FamilyHistory[];
  insurances?: Insurance[];
  reminders?: Reminder[];
  interactions?: Interaction[];
  accessHistory?: DoctorAccessLog[];
  auditLogs?: AuditLog[];
  lastUpdated?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
