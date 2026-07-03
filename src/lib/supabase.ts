import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug: Log exact configuration
const keyLoaded = !!(supabaseUrl && supabaseAnonKey);
const keyPreview = supabaseAnonKey ? supabaseAnonKey.substring(0, 20) : 'UNDEFINED';
console.log('🔑 Supabase Configuration:');
console.log('   URL:', supabaseUrl);
console.log('   Key (first 20 chars):', keyPreview);
console.log('   Key loaded:', keyLoaded ? 'yes' : 'no');
if (!keyLoaded) {
  console.error('⚠️ Supabase configuration incomplete:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl,
    keyFirst20: keyPreview,
  });
}

export type CustomerRecord = {
  id: string;
  full_name?: string | null;
  mobile?: string | null;
  phone?: string | null;
  email?: string | null;
  preferred_service?: string | null;
  last_visit?: string | null;
  notes?: string | null;
};

export type CustomerInsert = {
  full_name: string;
  mobile?: string | null;
  email?: string | null;
  preferred_service?: string | null;
  last_visit?: string | null;
  notes?: string | null;
};

export type CustomerUpdate = {
  full_name?: string;
  mobile?: string | null;
  email?: string | null;
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
  console.error('Supabase environment variables are not set. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to Supabase.');
  throw new Error('Cannot initialize Supabase: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getCustomersFromSupabase(): Promise<CustomerRecord[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Cannot load customers: Supabase environment variables are missing.');
    return [];
  }

  const { data, error } = await supabase.from('customers').select('*').order('full_name');

  if (error) {
    console.error('Unable to load customers from Supabase:', error);
    return [];
  }

  return (data ?? []) as CustomerRecord[];
}

export async function createCustomerInSupabase(payload: CustomerInsert): Promise<{ data: CustomerRecord | null; error: unknown | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot save customer: Supabase environment variables are missing.');
    console.error(error);
    return { data: null, error };
  }

  const { data, error } = await supabase.from('customers').insert(payload).select().single();

  if (error) {
    console.error('Unable to save customer to Supabase:', error);
    return { data: null, error };
  }

  return { data: data as CustomerRecord | null, error: null };
}

export async function updateCustomerInSupabase(
  customerId: string,
  payload: CustomerUpdate,
): Promise<{ data: CustomerRecord | null; error: unknown | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot update customer: Supabase environment variables are missing.');
    console.error(error);
    return { data: null, error };
  }

  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    console.error('Unable to update customer in Supabase:', error);
    return { data: null, error };
  }

  return { data: data as CustomerRecord | null, error: null };
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
