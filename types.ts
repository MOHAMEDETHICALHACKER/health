
export interface GovernmentScheme {
  id: string;
  name: string;
  benefits: string;
  eligibility: string;
  officialLink?: string;
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
  isPremium?: boolean;
  subscriptionPlan?: 'standard' | 'pro' | 'family';
  subscriptionExpiry?: string;
}

export interface MedicalProblem {
  id: string;
  condition: string;
  status: 'past' | 'present' | 'recovered';
  onsetDate: string;
  endDate?: string;
  severity: 'mild' | 'moderate' | 'severe';
  treatment?: string;
  notes?: string;
  applicableSchemes?: GovernmentScheme[];
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
  surgeon?: string;
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

export interface Interaction {
  id: string;
  query: string;
  response: string;
  timestamp: number;
}

export interface HealthRecord {
  profile: UserProfile;
  problems: MedicalProblem[];
  medications: Medication[];
  surgeries: Surgery[];
  allergies: Allergy[];
  notes: TreatmentNote[];
  interactions?: Interaction[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
