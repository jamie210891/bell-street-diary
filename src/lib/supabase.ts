import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type CustomerRecord = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  preferred_service?: string | null;
  last_visit?: string | null;
  notes?: string | null;
};

export type AppointmentPayload = {
  customer_id?: string | null;
  appointment_date: string;
  appointment_time: string;
  service: string;
  duration: string;
  notes?: string;
  whatsapp_reminder?: boolean;
  sms_reminder?: boolean;
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to Supabase.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');

export async function getCustomersFromSupabase(): Promise<CustomerRecord[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const { data, error } = await supabase.from('customers').select('*').order('full_name');

  if (error) {
    console.warn('Unable to load customers from Supabase:', error.message);
    return [];
  }

  return (data ?? []) as CustomerRecord[];
}

export async function createCustomerInSupabase(payload: Omit<CustomerRecord, 'id'>) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const { data, error } = await supabase.from('customers').insert(payload).select().single();

  if (error) {
    console.warn('Unable to save customer to Supabase:', error.message);
    return null;
  }

  return data as CustomerRecord | null;
}

export async function createAppointmentInSupabase(payload: AppointmentPayload) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const { data, error } = await supabase.from('appointments').insert(payload).select().single();

  if (error) {
    console.warn('Unable to save appointment to Supabase:', error.message);
    return null;
  }

  return data;
}
