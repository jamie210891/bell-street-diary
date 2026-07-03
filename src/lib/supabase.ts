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
  is_archived?: boolean | null;
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
    .maybeSingle();

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

export async function customerHasAppointmentsInSupabase(customerId: string): Promise<{ hasAppointments: boolean; error: unknown | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot check customer appointments: Supabase environment variables are missing.');
    console.error(error);
    return { hasAppointments: false, error };
  }

  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId);

  if (error) {
    console.error('Unable to check customer appointments in Supabase:', error);
    return { hasAppointments: false, error };
  }

  return { hasAppointments: (count ?? 0) > 0, error: null };
}

export async function deleteCustomerInSupabase(customerId: string): Promise<{ error: unknown | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot delete customer: Supabase environment variables are missing.');
    console.error(error);
    return { error };
  }

  const { error } = await supabase.from('customers').delete().eq('id', customerId);

  if (error) {
    console.error('Unable to delete customer in Supabase:', error);
    return { error };
  }

  return { error: null };
}

const ARCHIVE_NOTE_PREFIX = '[ARCHIVED] ';

const stripArchivePrefix = (notes: string | null | undefined) => {
  if (!notes) {
    return null;
  }

  return notes.startsWith(ARCHIVE_NOTE_PREFIX) ? notes.slice(ARCHIVE_NOTE_PREFIX.length) : notes;
};

export async function setCustomerArchivedStateInSupabase(
  customerId: string,
  isArchived: boolean,
): Promise<{ data: CustomerRecord | null; error: unknown | null }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot archive customer: Supabase environment variables are missing.');
    console.error(error);
    return { data: null, error };
  }

  const { data, error } = await supabase
    .from('customers')
    .update({ is_archived: isArchived })
    .eq('id', customerId)
    .select()
    .maybeSingle();

  if (!error) {
    return { data: data as CustomerRecord | null, error: null };
  }

  const message = (error as { message?: string } | null)?.message ?? '';
  const missingColumn = message.includes('is_archived');

  if (!missingColumn) {
    console.error('Unable to update archive state in Supabase:', error);
    return { data: null, error };
  }

  const { data: existingCustomer, error: fetchError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (fetchError) {
    console.error('Unable to load customer for archive fallback:', fetchError);
    return { data: null, error: fetchError };
  }

  if (!existingCustomer) {
    return { data: null, error: null };
  }

  const cleanNotes = stripArchivePrefix((existingCustomer as CustomerRecord).notes);
  const fallbackNotes = isArchived ? `${ARCHIVE_NOTE_PREFIX}${cleanNotes ?? ''}`.trimEnd() : cleanNotes;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('customers')
    .update({ notes: fallbackNotes })
    .eq('id', customerId)
    .select()
    .maybeSingle();

  if (fallbackError) {
    console.error('Unable to archive customer via notes fallback:', fallbackError);
    return { data: null, error: fallbackError };
  }

  const archivedRecord = fallbackData
    ? ({ ...(fallbackData as CustomerRecord), is_archived: isArchived } as CustomerRecord)
    : null;

  return {
    data: archivedRecord,
    error: null,
  };
}
