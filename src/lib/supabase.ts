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
  archived?: boolean | null;
  is_archived?: boolean | null;
};

type CustomerMutationResult = {
  data: CustomerRecord | null;
  error: unknown | null;
  affectedRows: number;
};

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const formatSupabaseError = (error: unknown): string => {
  if (!error) {
    return 'Unknown error';
  }

  const supabaseError = error as SupabaseErrorLike;
  const message = supabaseError.message ?? 'Unknown error';
  const details = supabaseError.details ? ` Details: ${supabaseError.details}` : '';
  const hint = supabaseError.hint ? ` Hint: ${supabaseError.hint}` : '';
  const code = supabaseError.code ? ` (code: ${supabaseError.code})` : '';

  return `${message}${code}${details}${hint}`;
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

  const rows = (data ?? []) as Array<CustomerRecord & { id?: string | null }>;
  const validRows = rows.filter((row): row is CustomerRecord => typeof row.id === 'string' && row.id.length > 0);

  if (rows.length > 0) {
    const sampleKeys = Object.keys(rows[0] ?? {});
    console.log('Customer column check (sample row keys):', sampleKeys);
    console.log('Customer field mapping used by app:', {
      id: 'id',
      name: 'full_name',
      phone: 'mobile|phone',
      favoriteService: 'preferred_service',
      lastVisit: 'last_visit',
      note: 'notes',
      archived: 'archived|is_archived',
    });
  }

  if (validRows.length !== rows.length) {
    console.warn('Some customer rows were missing an id and were skipped.', {
      totalRows: rows.length,
      validRows: validRows.length,
    });
  }

  console.log('Loaded customers from Supabase with ids:', validRows.map((row) => row.id));

  return validRows;
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
): Promise<CustomerMutationResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot update customer: Supabase environment variables are missing.');
    console.error(error);
    return { data: null, error, affectedRows: 0 };
  }

  const { data, error, count } = await supabase
    .from('customers')
    .update(payload, { count: 'exact' })
    .eq('id', customerId)
    .select();

  if (error) {
    console.error('Unable to update customer in Supabase:', formatSupabaseError(error));
    return { data: null, error, affectedRows: 0 };
  }

  const rows = (data ?? []) as CustomerRecord[];
  const affectedRows = count ?? rows.length;
  return { data: rows[0] ?? null, error: null, affectedRows };
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

export async function deleteCustomerInSupabase(customerId: string): Promise<{ error: unknown | null; affectedRows: number }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot delete customer: Supabase environment variables are missing.');
    console.error(error);
    return { error, affectedRows: 0 };
  }

  const { data, error, count } = await supabase
    .from('customers')
    .delete({ count: 'exact' })
    .eq('id', customerId)
    .select('id');

  if (error) {
    console.error('Unable to delete customer in Supabase:', formatSupabaseError(error));
    return { error, affectedRows: 0 };
  }

  return { error: null, affectedRows: count ?? (data ?? []).length };
}

export async function setCustomerArchivedStateInSupabase(
  customerId: string,
  isArchived: boolean,
): Promise<CustomerMutationResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Cannot archive customer: Supabase environment variables are missing.');
    console.error(error);
    return { data: null, error, affectedRows: 0 };
  }

  const byArchived = await supabase
    .from('customers')
    .update({ archived: isArchived }, { count: 'exact' })
    .eq('id', customerId)
    .select('id');

  if (!byArchived.error) {
    const rows = (byArchived.data ?? []) as CustomerRecord[];
    return {
      data: rows[0] ?? null,
      error: null,
      affectedRows: byArchived.count ?? rows.length,
    };
  }

  const archivedMessage = (byArchived.error as { message?: string } | null)?.message ?? '';
  const missingArchivedColumn = archivedMessage.includes('archived');

  if (!missingArchivedColumn) {
    console.error('Unable to update archived state in Supabase:', formatSupabaseError(byArchived.error));
    return { data: null, error: byArchived.error, affectedRows: 0 };
  }

  const byIsArchived = await supabase
    .from('customers')
    .update({ is_archived: isArchived }, { count: 'exact' })
    .eq('id', customerId)
    .select('id');

  if (!byIsArchived.error) {
    const rows = (byIsArchived.data ?? []) as CustomerRecord[];
    return {
      data: rows[0] ?? null,
      error: null,
      affectedRows: byIsArchived.count ?? rows.length,
    };
  }

  console.error('Unable to update archive state in Supabase:', formatSupabaseError(byIsArchived.error));
  return { data: null, error: byIsArchived.error, affectedRows: 0 };
}
