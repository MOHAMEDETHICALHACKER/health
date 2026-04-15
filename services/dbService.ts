
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { HealthRecord } from "../types";

const DEFAULT_SUPABASE_URL = "https://pllpexiicivnquzfkbtf.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbHBleGlpY2l2bnF1emZrYnRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzY5MzMsImV4cCI6MjA4NjYxMjkzM30.4vo3zesG_adIz4T4JDoVr3ek69RaAwOW57C3DM-Z5gc";

const getSupabaseConfig = () => {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_ANON_KEY;

  console.log("HealthShield: Initializing with URL:", url);

  // Handle cases where env vars might be "undefined" string or empty
  if (!url || url === "undefined" || url === "") url = DEFAULT_SUPABASE_URL;
  if (!key || key === "undefined" || key === "") key = DEFAULT_SUPABASE_KEY;

  // Final sanity check for URL validity to prevent "Invalid URL" crash
  try {
    new URL(url);
  } catch {
    console.warn("HealthShield: Invalid SUPABASE_URL provided, falling back to default.");
    url = DEFAULT_SUPABASE_URL;
  }

  return { url, key };
};

const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = getSupabaseConfig();
const LOCAL_STORAGE_KEY = 'health_shield_local_vault';

export class HealthDB {
  private supabase: SupabaseClient;
  private useFallback: boolean = false;
  private connectionError: string | null = null;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /**
   * Checks Supabase connectivity. Sets useFallback to true if 'records' table is missing.
   */
  async init(): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('records').select('id').limit(1);
      if (error) {
        // Handle network errors or paused projects
        if (error.message?.includes("fetch") || error.message?.includes("NetworkError") || error.message?.includes("Failed to fetch")) {
          console.warn("HealthShield: Supabase connection failed. Switching to Local Vault.");
          this.useFallback = true;
          this.connectionError = "Supabase infrastructure is currently unreachable.";
          return true;
        }

        // Table doesn't exist or permissions issue
        if (error.code === '42P01' || error.message?.includes("Could not find the table")) {
          console.warn("HealthShield: 'records' table missing. Using Local Vault fallback.");
          this.useFallback = true;
          this.connectionError = "Table 'records' not found in your Supabase project.";
        } else {
          console.error("Supabase API Error:", error.message);
          this.useFallback = true;
          this.connectionError = error.message;
        }
      }
      return true;
    } catch (e: any) {
      console.warn("HealthShield: Supabase connection failed (Exception). Switching to Local Vault.");
      this.useFallback = true;
      this.connectionError = e.message || "Failed to connect to Supabase infrastructure.";
      return true;
    }
  }

  isUsingLocalVault(): boolean {
    return this.useFallback;
  }

  getConnectionError(): string | null {
    return this.connectionError;
  }

  private getLocalRecords(): Record<string, HealthRecord> {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  private saveLocalRecords(records: Record<string, HealthRecord>) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  }

  async saveRecord(record: HealthRecord): Promise<void> {
    if (!record.profile) return;
    const healthId = record.profile.healthId.toUpperCase().trim();
    const recordWithMeta = { ...record, lastUpdated: Date.now() };

    if (!this.useFallback) {
      const { error } = await this.supabase
        .from('records')
        .upsert({
          id: healthId,
          phone: record.profile.phone.trim(),
          name: record.profile.name.trim(),
          data: recordWithMeta
        }, { onConflict: 'id' });

      if (error) {
        console.error("Supabase Save failed, attempting local fallback:", error.message);
      } else {
        return;
      }
    }

    // Fallback logic
    const records = this.getLocalRecords();
    records[healthId] = recordWithMeta;
    this.saveLocalRecords(records);
  }

  async getRecord(healthId: string): Promise<HealthRecord | null> {
    const cleanId = healthId.toUpperCase().trim();
    if (!this.useFallback) {
      const { data, error } = await this.supabase
        .from('records')
        .select('data')
        .eq('id', cleanId)
        .maybeSingle();
      
      if (!error && data) {
        const record = data.data as HealthRecord;
        if (record && record.profile) return record;
      }
    }

    const records = this.getLocalRecords();
    const localRecord = records[cleanId] || null;
    return (localRecord && localRecord.profile) ? localRecord : null;
  }

  async getRecordByPhone(phone: string): Promise<HealthRecord | null> {
    const cleanPhone = phone.trim();
    if (!this.useFallback) {
      const { data, error } = await this.supabase
        .from('records')
        .select('data')
        .eq('phone', cleanPhone)
        .maybeSingle();
      
      if (!error && data) {
        const record = data.data as HealthRecord;
        if (record && record.profile) return record;
      }
    }

    const records = this.getLocalRecords();
    return Object.values(records).find(r => r.profile && r.profile.phone === cleanPhone) || null;
  }

  async getAllRecords(): Promise<HealthRecord[]> {
    let cloudRecords: HealthRecord[] = [];
    if (!this.useFallback) {
      const { data, error } = await this.supabase.from('records').select('data');
      if (!error && data) cloudRecords = data.map(r => r.data as HealthRecord).filter(r => r && r.profile);
    }

    const localRecords = Object.values(this.getLocalRecords()).filter(r => r && r.profile);
    // Merge and de-duplicate by healthId
    const map = new Map<string, HealthRecord>();
    [...cloudRecords, ...localRecords].forEach(r => {
      if (r && r.profile) map.set(r.profile.healthId, r);
    });
    return Array.from(map.values());
  }
}

export const dbService = new HealthDB();
