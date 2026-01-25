
export interface UserProfile {
  name: string;
  age: number;
  dob: string;
  gender: string;
  phone: string;
  aadhaar: string;
  healthId: string;
  bloodGroup: string;
  emergencyContact: {
    name: string;
    phone: string;
  };
  isPremium?: boolean;
  subscriptionExpiry?: string;
}

export interface MedicalProblem {
  id: string;
  condition: string;
  status: 'past' | 'present';
  onsetDate: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  duration: string;
  frequency: string;
  prescribedBy?: string;
  sideEffects?: string;
}

export interface Surgery {
  id: string;
  type: string;
  date: string;
  hospital: string;
  surgeon?: string;
}

export interface Allergy {
  id: string;
  substance: string;
  severity: 'low' | 'moderate' | 'high';
  reaction?: string;
}

export interface TreatmentNote {
  id: string;
  doctorName: string;
  date: string;
  note: string;
  clinicName?: string;
}

export interface HealthRecord {
  profile: UserProfile;
  problems: MedicalProblem[];
  medications: Medication[];
  surgeries: Surgery[];
  allergies: Allergy[];
  notes: TreatmentNote[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
