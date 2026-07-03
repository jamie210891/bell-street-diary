import { type FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Search, Sparkles, X } from 'lucide-react';
import {
  createAppointmentInSupabase,
  createCustomerInSupabase,
  getCustomersFromSupabase,
  type CustomerRecord,
} from './lib/supabase';

type Customer = {
  id: string;
  name: string;
  phone: string;
  favoriteService: string;
  lastVisit: string;
  note: string;
};

type Appointment = {
  id: string;
  date: string;
  time: string;
  duration: string;
  name: string;
  service: string;
  accent: string;
  customerId?: string;
  whatsappReminder?: boolean;
  smsReminder?: boolean;
  reminderSent?: boolean;
};

const actionItems = [
  {
    title: '2 confirmations waiting',
    detail: 'Client replies still pending',
    icon: Clock3,
  },
  {
    title: '1 reminder due today',
    detail: 'Send a friendly follow-up',
    icon: AlertCircle,
  },
  {
    title: '1 no-show charge open',
    detail: 'Review the outstanding balance',
    icon: AlertCircle,
  },
];

const initialAppointments: Appointment[] = [
  {
    id: 'appt-1',
    date: '2026-07-03',
    time: '09:30',
    duration: '45 mins',
    name: 'Jordan Lee',
    service: 'Classic Cut',
    accent: 'bg-white',
    whatsappReminder: true,
    smsReminder: false,
    reminderSent: false,
  },
  {
    id: 'appt-2',
    date: '2026-07-03',
    time: '11:00',
    duration: '30 mins',
    name: 'Mina Patel',
    service: 'Beard Shape',
    accent: 'bg-white',
    whatsappReminder: false,
    smsReminder: false,
    reminderSent: true,
  },
];

const mapCustomerRecord = (customer: CustomerRecord): Customer => ({
  id: customer.id,
  name: customer.full_name ?? 'Unknown customer',
  phone: customer.phone ?? 'No phone provided',
  favoriteService: customer.preferred_service ?? 'Classic Cut',
  lastVisit: customer.last_visit ?? 'Not booked yet',
  note: customer.notes ?? 'No notes yet',
});

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const currentDate = new Date().toISOString().slice(0, 10);

const sortAppointments = (list: Appointment[]) =>
  [...list].sort((left, right) => timeToMinutes(left.time) - timeToMinutes(right.time));

const DIARY_START_MINUTES = 9 * 60;
const DIARY_END_MINUTES = 18 * 60;
const DIARY_INTERVAL = 15;
const SLOT_HEIGHT = 64;

const diaryTimeSlots = Array.from(
  { length: (DIARY_END_MINUTES - DIARY_START_MINUTES) / DIARY_INTERVAL },
  (_, index) => DIARY_START_MINUTES + index * DIARY_INTERVAL,
);

const formatTimeLabel = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const getDurationMinutes = (duration: string) => parseInt(duration, 10) || DIARY_INTERVAL;

// Suggestion helpers for Intelligent Booking
const getLastServiceForCustomer = (appointments: Appointment[], customerId?: string) => {
  if (!customerId) return null;
  const his = appointments.filter((a) => a.customerId === customerId && (a as any).service).slice().reverse();
  return his.length ? his[0].service : null;
};

const durationOptions = Array.from({ length: 18 }, (_, index) => (index + 1) * 5);

const parseDurationMinutes = (duration: string) => {
  const match = duration.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

const roundToNearest5 = (minutes: number) => {
  const rounded = Math.round(minutes / 5) * 5;
  return Math.max(5, Math.min(90, rounded));
};

const formatDurationLabel = (minutes: number) => `${minutes} mins`;

const getUsualDurationForCustomer = (appointments: Appointment[], customerId?: string) => {
  if (!customerId) return null;
  const durations = appointments
    .filter((a) => a.customerId === customerId && a.duration)
    .map((a) => parseDurationMinutes(a.duration))
    .filter((minutes) => minutes > 0)
    .map((minutes) => roundToNearest5(minutes));

  if (!durations.length) return null;

  const counts: Record<number, number> = {};
  durations.forEach((minutes) => { counts[minutes] = (counts[minutes] || 0) + 1; });
  const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return formatDurationLabel(Number(mostCommon));
};

const getNextAvailableTime = (appointments: Appointment[], desiredDuration: string) => {
  const durationMinutes = getDurationMinutes(desiredDuration);
  const occupied: Array<[number, number]> = appointments.map((a) => {
    const start = timeToMinutes(a.time);
    const end = start + getDurationMinutes(a.duration);
    return [start, end];
  });

  const now = new Date();
  let candidate = Math.max(DIARY_START_MINUTES, now.getHours() * 60 + now.getMinutes());
  // round up to next DIARY_INTERVAL
  if (candidate % DIARY_INTERVAL !== 0) candidate += DIARY_INTERVAL - (candidate % DIARY_INTERVAL);

  while (candidate + durationMinutes <= DIARY_END_MINUTES) {
    const overlaps = occupied.some(([s, e]) => !(candidate + durationMinutes <= s || candidate >= e));
    if (!overlaps) return formatTimeLabel(candidate);
    candidate += DIARY_INTERVAL;
  }
  return null;
};

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const getReminderMessage = (time: string) => {
  return `Hello! Just a friendly reminder that you have an appointment at The Bell Street Barbers tomorrow at ${time}.\n\nI look forward to seeing you.\n\nKind regards,\nJamie`;
};

function App() {
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerFormName, setCustomerFormName] = useState('');
  const [customerFormPhone, setCustomerFormPhone] = useState('');
  const [customerFormService, setCustomerFormService] = useState('Classic Cut');
  const [customerFormLastVisit, setCustomerFormLastVisit] = useState('');
  const [customerFormNotes, setCustomerFormNotes] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [date, setDate] = useState(currentDate);
  const [time, setTime] = useState('10:30');
  const [service, setService] = useState('Classic Cut');
  const [duration, setDuration] = useState('45 mins');
  const [notes, setNotes] = useState('');
  const [whatsapp, setWhatsapp] = useState(true);
  const [sms, setSms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileNotesDraft, setProfileNotesDraft] = useState('');
  const timelineSectionRef = useRef<HTMLDivElement | null>(null);
  const reminderSectionRef = useRef<HTMLDivElement | null>(null);

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const sortedAppointments = sortAppointments(appointments);
  const pendingReminders = appointments.filter((appointment) =>
    !appointment.reminderSent && (appointment.whatsappReminder || appointment.smsReminder),
  );

  const visibleAppointments = sortedAppointments;
  const scrollToTimeline = () => {
    if (timelineSectionRef.current?.scrollIntoView) {
      timelineSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const scrollToReminders = () => {
    if (reminderSectionRef.current?.scrollIntoView) {
      reminderSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const openAppointmentDetails = (appointmentId: string) => {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (appointment) {
      setActiveAppointment(appointment);
    }
  };
  const appointmentsToday = visibleAppointments.length;
  const firstClient = visibleAppointments[0] ?? null;
  const lastClient = visibleAppointments[visibleAppointments.length - 1] ?? null;
  const nextClient = visibleAppointments.find((appointment) => timeToMinutes(appointment.time) > currentMinutes) ?? null;
  const remindersOutstanding = pendingReminders.length;
  const totalAppointments = appointments.length;

  let freeSlotsToday = 0;
  let longestFreeGap = 0;
  let previousEnd = DIARY_START_MINUTES;

  for (const appointment of visibleAppointments) {
    const start = Math.max(timeToMinutes(appointment.time), DIARY_START_MINUTES);
    const end = Math.min(start + getDurationMinutes(appointment.duration), DIARY_END_MINUTES);

    if (start > previousEnd) {
      freeSlotsToday += 1;
      longestFreeGap = Math.max(longestFreeGap, start - previousEnd);
    }
    previousEnd = Math.max(previousEnd, end);
  }

  if (previousEnd < DIARY_END_MINUTES) {
    freeSlotsToday += 1;
    longestFreeGap = Math.max(longestFreeGap, DIARY_END_MINUTES - previousEnd);
  }

  const appointmentSummary = appointmentsToday
    ? `${appointmentsToday} appointment${appointmentsToday === 1 ? '' : 's'} today`
    : 'No appointments today';
  const reminderSummary = remindersOutstanding
    ? `${remindersOutstanding} reminder${remindersOutstanding === 1 ? '' : 's'} outstanding`
    : 'No reminders outstanding.';
  const freeSlotSummary = `${freeSlotsToday} free slot${freeSlotsToday === 1 ? '' : 's'} today`;

  for (const appointment of visibleAppointments) {
    const start = Math.max(timeToMinutes(appointment.time), DIARY_START_MINUTES);
    const end = Math.min(start + getDurationMinutes(appointment.duration), DIARY_END_MINUTES);

    if (start > previousEnd) {
      freeSlotsToday += 1;
      longestFreeGap = Math.max(longestFreeGap, start - previousEnd);
    }
    previousEnd = Math.max(previousEnd, end);
  }

  if (previousEnd < DIARY_END_MINUTES) {
    freeSlotsToday += 1;
    longestFreeGap = Math.max(longestFreeGap, DIARY_END_MINUTES - previousEnd);
  }

  const formatGapLabel = (minutes: number) => {
    if (minutes === 0) return 'None';
    return formatDuration(minutes);
  };

  const appointmentsTodayText = appointmentsToday ? `${appointmentsToday} appointment${appointmentsToday === 1 ? '' : 's'}` : 'No appointments today';
  const firstClientText = firstClient ? `${firstClient.name} • ${firstClient.time}` : 'No first client';
  const lastClientText = lastClient ? `${lastClient.name} • ${lastClient.time}` : 'No last client';
  const nextClientText = nextClient ? `${nextClient.name} • ${nextClient.time}` : 'No next client';

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  useEffect(() => {
    let isActive = true;

    const loadCustomers = async () => {
      const records = await getCustomersFromSupabase();

      if (!isActive) {
        return;
      }

      setCustomers(records.map(mapCustomerRecord));
    };

    void loadCustomers();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!showSuccess) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShowSuccess(false), 2200);
    return () => window.clearTimeout(timer);
  }, [showSuccess]);

  useEffect(() => {
    const updateNow = () => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    updateNow();
    const interval = window.setInterval(updateNow, 60000);
    return () => window.clearInterval(interval);
  }, []);

  // Appointment details drawer state
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!activeAppointment) return undefined;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveAppointment(null);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeAppointment]);

  const resetBookingForm = () => {
    setSearchTerm('');
    setSelectedCustomer(null);
    setIsCreatingCustomer(false);
    setCustomerFormName('');
    setCustomerFormPhone('');
    setCustomerFormService('Classic Cut');
    setCustomerFormLastVisit('');
    setCustomerFormNotes('');
    setCustomerError(null);
    setDate('2026-07-03');
    setTime('10:30');
    setService('Classic Cut');
    setDuration('45 mins');
    setNotes('');
    setWhatsapp(true);
    setSms(false);
  };

  const handleOpenBooking = () => {
    resetBookingForm();
    setIsBookingOpen(true);
  };

  const handleCloseBooking = () => {
    setIsBookingOpen(false);
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.name);
  };

  const handleCreateNewCustomer = () => {
    setIsCreatingCustomer(true);
    setSelectedCustomer(null);
    setSearchTerm('');
    setCustomerError(null);
  };

  const handleCreateCustomer = async (event: FormEvent) => {
    event.preventDefault();

    if (!customerFormName.trim()) {
      setCustomerError('Please add a customer name.');
      return;
    }

    setIsSavingCustomer(true);
    setCustomerError(null);

    const customerPayload: any = {
      full_name: customerFormName.trim(),
      preferred_service: customerFormService || null,
      notes: customerFormNotes.trim() || null,
    };

    if (customerFormPhone.trim()) {
      customerPayload.mobile = customerFormPhone.trim();
    }

    const { data: savedCustomer, error } = await createCustomerInSupabase(customerPayload);

    if (!savedCustomer) {
      console.error('Customer save failed:', error);
      alert('Customer save failed: ' + ((error as any)?.message ?? 'Unknown error'));
      alert(JSON.stringify(error, null, 2));
      setCustomerError('We could not save that customer right now. Please check your network or PWA version and try again.');
      setIsSavingCustomer(false);
      return;
    }

    const mappedCustomer = mapCustomerRecord(savedCustomer);
    setCustomers((current) => [...current, mappedCustomer]);
    setSelectedCustomer(mappedCustomer);
    setSearchTerm(mappedCustomer.name);
    setIsCreatingCustomer(false);
    setCustomerFormName('');
    setCustomerFormPhone('');
    setCustomerFormService('Classic Cut');
    setCustomerFormLastVisit('');
    setCustomerFormNotes('');
    setIsSavingCustomer(false);
  };

  const openProfile = (customer: Customer) => {
    setProfileCustomer(customer);
    setProfileNotesDraft(customer.note || '');
    setIsEditingProfile(false);
  };

  const closeProfile = () => setProfileCustomer(null);

  const saveProfileEdits = () => {
    if (!profileCustomer) return;
    setCustomers((current) =>
      current.map((c) => (c.id === profileCustomer.id ? { ...c, note: profileNotesDraft } : c)),
    );
    setProfileCustomer((prev) => (prev ? { ...prev, note: profileNotesDraft } : prev));
    setIsEditingProfile(false);
  };

  const handleBookAppointment = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    const appointmentPayload = {
      customer_id: selectedCustomer.id,
      appointment_date: date,
      appointment_time: time,
      service,
      duration,
      notes,
      whatsapp_reminder: whatsapp,
      sms_reminder: sms,
    };

    try {
      await createAppointmentInSupabase(appointmentPayload);
    } catch (error) {
      console.warn('Unable to persist appointment to Supabase. Continuing with local placeholder state.', error);
    }

    const newAppointment: Appointment = {
      id: `appt-${Date.now()}`,
      date,
      time,
      duration,
      name: selectedCustomer.name,
      service,
      accent: 'bg-sky-50',
      customerId: selectedCustomer.id,
      whatsappReminder: whatsapp,
      smsReminder: sms,
      reminderSent: false,
    };

    setAppointments((current) => sortAppointments([...current, newAppointment]));
    setIsBookingOpen(false);
    setShowSuccess(true);
  };

  const handleCloseAppointment = () => setActiveAppointment(null);

  const handleEditFromDetails = () => {
    if (!activeAppointment) return;
    const customer = customers.find((c) => c.id === activeAppointment.customerId);
    if (customer) {
      setSelectedCustomer(customer);
    }
    setDate(activeAppointment.date);
    setTime(activeAppointment.time);
    setDuration(activeAppointment.duration);
    setService(activeAppointment.service);
    setNotes((activeAppointment as Appointment).service ? '' : '');
    setWhatsapp(Boolean(activeAppointment.whatsappReminder));
    setSms(Boolean(activeAppointment.smsReminder));
    setIsBookingOpen(true);
    setActiveAppointment(null);
  };

  const handleMarkReminderSent = (appointmentId: string) => {
    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, reminderSent: true } : appointment,
      ),
    );
  };

  const openWhatsAppReminder = (phone: string, time: string) => {
    const cleaned = cleanPhoneNumber(phone);
    if (!cleaned) return;
    const encoded = encodeURIComponent(getReminderMessage(time));
    window.open(`https://wa.me/${cleaned}?text=${encoded}`, '_blank');
  };

  const openSmsReminder = (phone: string, time: string) => {
    const cleaned = cleanPhoneNumber(phone);
    if (!cleaned) return;
    const encoded = encodeURIComponent(getReminderMessage(time));
    window.location.href = `sms:${cleaned}?body=${encoded}`;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(135deg,_#f8fbff_0%,_#eef4ff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/80 bg-white/80 px-5 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                Bell Street Diary
              </p>
              <h1 className="text-xl font-semibold text-slate-900">Bell Street Barbers</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 text-center">
              <div className="text-[11px] leading-5">{today}</div>
              <div className="mt-1 text-xs font-semibold text-slate-700">{currentTime}</div>
            </div>
            <div className="hidden sm:flex sm:flex-col sm:items-end">
              <div className="text-xs uppercase text-slate-400">Today</div>
              <div className="text-sm font-semibold text-slate-900">{totalAppointments} appointments</div>
            </div>
          </div>
        </header>

        <main className="space-y-6">
          {/* Debug: Supabase key status */}
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
            <span>🔑 Supabase key loaded: {import.meta.env.VITE_SUPABASE_ANON_KEY ? 'yes' : 'no'}</span>
          </div>

          <section className="rounded-[32px] border border-slate-200/70 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-700 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-10">
            <div className="mb-4 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
              <CalendarDays className="mr-2 h-4 w-4" />
              Daily barber diary
            </div>
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Good morning Jamie 👋</h2>
            <p className="mt-3 text-lg font-semibold text-slate-200 sm:text-xl">{today}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-200/90 sm:text-base">
              <span>• {appointmentSummary}</span>
              <span>• {reminderSummary}</span>
              <span>• {freeSlotSummary}</span>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[3fr_1fr]">
            <section ref={timelineSectionRef} className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
                    Today&apos;s diary
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-900">Appointments timeline</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="rounded-2xl bg-slate-50 px-3 py-1">09:00 — 18:00</span>
                  <span className="rounded-2xl bg-slate-50 px-3 py-1">15-min blocks</span>
                </div>
              </div>

              <div className="grid gap-3 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  type="button"
                  onClick={scrollToTimeline}
                  className="group rounded-[28px] border-l-4 border-blue-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-slate-50"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Appointments today</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{appointmentsTodayText}</p>
                </button>
                <button
                  type="button"
                  onClick={() => firstClient && openAppointmentDetails(firstClient.id)}
                  disabled={!firstClient}
                  className="group rounded-[28px] border-l-4 border-blue-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">First client</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{firstClientText}</p>
                </button>
                <button
                  type="button"
                  onClick={() => lastClient && openAppointmentDetails(lastClient.id)}
                  disabled={!lastClient}
                  className="group rounded-[28px] border-l-4 border-blue-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Last client</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{lastClientText}</p>
                </button>
                <div className="rounded-[28px] border-l-4 border-emerald-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Free slots today</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{freeSlotsToday}</p>
                </div>
                <div className="rounded-[28px] border-l-4 border-emerald-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Longest free gap</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{formatGapLabel(longestFreeGap)}</p>
                </div>
                <button
                  type="button"
                  onClick={scrollToReminders}
                  className="group rounded-[28px] border-l-4 border-orange-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:bg-slate-50"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Reminders outstanding</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{remindersOutstanding}</p>
                </button>
                <button
                  type="button"
                  onClick={() => nextClient && openAppointmentDetails(nextClient.id)}
                  disabled={!nextClient}
                  className="group rounded-[28px] border-l-4 border-blue-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Next client</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{nextClientText}</p>
                </button>
              </div>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                <div className="grid grid-cols-[72px_1fr] min-h-[520px] overflow-hidden">
                  <div className="border-r border-slate-200/80 bg-slate-100/80 px-3 py-3 text-xs text-slate-500">
                    <div className="space-y-0">
                      {diaryTimeSlots.map((slot, index) => (
                        <div key={slot} className={`h-16 ${index % 4 === 0 ? 'border-b border-slate-200/70' : 'border-b border-slate-200/30'}`}>
                          <span className="inline-block w-full text-right text-[11px] leading-5 text-slate-500">
                            {index % 4 === 0 ? formatTimeLabel(slot) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative overflow-y-auto p-3">
                    <div className="space-y-0">
                      {diaryTimeSlots.map((slot, index) => (
                        <div
                          key={slot}
                          className={`h-16 ${index % 4 === 0 ? 'border-b border-slate-200/70' : 'border-b border-slate-200/30'} bg-white/0`}
                        />
                      ))}
                    </div>

                    {currentMinutes >= DIARY_START_MINUTES && currentMinutes <= DIARY_END_MINUTES ? (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-20 flex items-center gap-2"
                        style={{
                          top: ((currentMinutes - DIARY_START_MINUTES) / DIARY_INTERVAL) * SLOT_HEIGHT,
                        }}
                      >
                        <div className="ml-3 h-px w-full bg-red-500/80 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]" />
                        <span className="absolute -left-10 inline-flex rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white shadow-sm">
                          Now
                        </span>
                      </div>
                    ) : null}

                    <div className="absolute inset-x-0 top-0">
                      {(() => {
                        let currentStart = DIARY_START_MINUTES;
                        const segments: Array<{
                          id: string;
                          type: 'appointment' | 'free';
                          start: number;
                          end: number;
                          appointment?: Appointment;
                        }> = [];

                        for (const appointment of sortedAppointments) {
                          const start = Math.max(timeToMinutes(appointment.time), DIARY_START_MINUTES);
                          const end = Math.min(start + getDurationMinutes(appointment.duration), DIARY_END_MINUTES);

                          if (start > currentStart) {
                            segments.push({
                              id: `free-${currentStart}`,
                              type: 'free',
                              start: currentStart,
                              end: start,
                            });
                          }

                          if (end > start) {
                            segments.push({
                              id: appointment.id,
                              type: 'appointment',
                              start,
                              end,
                              appointment,
                            });
                            currentStart = end;
                          }
                        }

                        if (currentStart < DIARY_END_MINUTES) {
                          segments.push({
                            id: `free-end-${currentStart}`,
                            type: 'free',
                            start: currentStart,
                            end: DIARY_END_MINUTES,
                          });
                        }

                        return segments.map((segment) => {
                          const top = ((segment.start - DIARY_START_MINUTES) / DIARY_INTERVAL) * SLOT_HEIGHT;
                          const height = Math.max(((segment.end - segment.start) / DIARY_INTERVAL) * SLOT_HEIGHT, SLOT_HEIGHT);
                          const isFree = segment.type === 'free';

                          return (
                            <div
                              key={segment.id}
                              style={{ top, height }}
                              className={`absolute left-3 right-3 rounded-[32px] border px-6 py-4 shadow-md transition-transform duration-200 ease-out ${
                                isFree
                                  ? 'border-emerald-200 bg-emerald-50/90 text-emerald-700'
                                  : 'cursor-pointer border-sky-200 bg-sky-50/95 text-slate-900 hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(14,165,233,0.12)]'
                              }`}
                              onClick={() => !isFree && setActiveAppointment(segment.appointment ?? null)}
                              role={!isFree ? 'button' : undefined}
                              tabIndex={!isFree ? 0 : -1}
                            >
                              {isFree ? (
                                <div className="flex flex-col justify-between h-full gap-2">
                                  <div className="flex items-center justify-between text-sm font-semibold">
                                    <span>Free slot</span>
                                    <span className="text-xs font-medium text-emerald-600">
                                      {formatTimeLabel(segment.start)} – {formatTimeLabel(segment.end)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-emerald-700/90">Open for walk-ins or same-day clients.</p>
                                </div>
                              ) : (
                                <div className="flex h-full flex-col justify-between gap-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sky-700">{segment.appointment?.name}</span>
                                    <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                                      {segment.appointment?.duration}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{segment.appointment?.service}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {formatTimeLabel(segment.start)} – {formatTimeLabel(segment.end)}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section ref={reminderSectionRef} className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
                    Reminder Centre
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">Appointments needing a reminder</h3>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  {pendingReminders.length} reminder{pendingReminders.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-4">
                {pendingReminders.length === 0 ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                    No reminders are due right now. Tap a booking and add WhatsApp or SMS to send a follow-up.
                  </div>
                ) : (
                  pendingReminders.map((appointment) => {
                    const customer = customers.find((c) => c.id === appointment.customerId);
                    const phone = customer?.phone ?? 'No phone';
                    return (
                      <div key={appointment.id} className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm relative">
                        <div className="absolute inset-y-0 left-0 w-1 rounded-l-full bg-orange-200" />
                        <div className="relative space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">{appointment.service}</p>
                              <h4 className="mt-1 text-lg font-semibold text-slate-900">{appointment.name}</h4>
                            </div>
                            <div className="text-sm text-slate-500">
                              <div>{appointment.date}</div>
                              <div className="mt-1 font-semibold text-slate-900">{appointment.time}</div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Phone</p>
                              <p className="mt-2 font-semibold text-slate-900">{phone}</p>
                            </div>
                            <div className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Reminder</p>
                              <p className="mt-2 font-semibold text-slate-900">{appointment.whatsappReminder ? 'WhatsApp' : ''}{appointment.whatsappReminder && appointment.smsReminder ? ' + ' : ''}{appointment.smsReminder ? 'SMS' : ''}</p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => openWhatsAppReminder(phone, appointment.time)}
                              className="rounded-[24px] bg-emerald-600 px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => openSmsReminder(phone, appointment.time)}
                              className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
                            >
                              SMS
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkReminderSent(appointment.id)}
                              className="rounded-[24px] bg-slate-900 px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                            >
                              Mark Reminder Sent
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
                    Action Required
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">Care for today</h3>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  3 items
                </span>
              </div>

              <div className="space-y-3">
                {actionItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className={`mt-0.5 rounded-xl p-2 ${index === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-sm text-slate-500">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      </div>

      <button
        type="button"
        onClick={handleOpenBooking}
        className="fixed bottom-6 right-6 inline-flex items-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-700"
      >
        + New Booking
      </button>

      {showSuccess ? (
        <div className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-lg">
          <CheckCircle2 className="h-4 w-4" />
          Appointment booked
        </div>
      ) : null}

      {isBookingOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <div className="flex w-full max-w-2xl flex-col overflow-y-auto rounded-t-[32px] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.22)] sm:h-full sm:rounded-[32px]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 sm:px-7">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">New booking</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Plan a visit</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseBooking}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 px-5 py-6 sm:px-7">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="customer-search">
                  Customer search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="customer-search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 outline-none ring-0 transition focus:border-blue-500"
                  />
                </div>

                {!selectedCustomer ? (
                  <div className="mt-3 space-y-2">
                    {customers.length === 0 && !isCreatingCustomer ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">No customers yet</p>
                        <p className="mt-1">Create your first customer profile to start booking visits.</p>
                        <button
                          type="button"
                          onClick={handleCreateNewCustomer}
                          className="mt-3 inline-flex rounded-full bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                          Create Customer
                        </button>
                      </div>
                    ) : null}

                    {customers.length > 0 && filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelectCustomer(customer)}
                          className="flex w-full items-start justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-500 hover:shadow-sm"
                        >
                          <div>
                            <p
                              className="font-semibold text-slate-900 cursor-pointer text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                openProfile(customer);
                              }}
                            >
                              {customer.name}
                            </p>
                            <p className="text-sm text-slate-500">{customer.phone}</p>
                          </div>
                          <span className="text-sm text-slate-400">{customer.note}</span>
                        </button>
                      ))
                    ) : null}

                    {customers.length > 0 && filteredCustomers.length === 0 && !isCreatingCustomer ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                        No matches yet.
                      </div>
                    ) : null}

                    {customers.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleCreateNewCustomer}
                        className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        + Create New Customer
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {!selectedCustomer && isCreatingCustomer ? (
                  <form onSubmit={handleCreateCustomer} className="mt-3 space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Name</span>
                        <input
                          type="text"
                          value={customerFormName}
                          onChange={(event) => setCustomerFormName(event.target.value)}
                          placeholder="Full name"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Phone</span>
                        <input
                          type="text"
                          value={customerFormPhone}
                          onChange={(event) => setCustomerFormPhone(event.target.value)}
                          placeholder="Phone number"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Favourite service</span>
                        <select
                          value={customerFormService}
                          onChange={(event) => setCustomerFormService(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        >
                          <option>Classic Cut</option>
                          <option>Beard Shape</option>
                          <option>Premium Hot Towel</option>
                          <option>Skin Fade</option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Last visit</span>
                        <input
                          type="text"
                          value={customerFormLastVisit}
                          onChange={(event) => setCustomerFormLastVisit(event.target.value)}
                          placeholder="e.g. Last Thursday"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-slate-700">
                      <span className="mb-2 block">Notes</span>
                      <textarea
                        value={customerFormNotes}
                        onChange={(event) => setCustomerFormNotes(event.target.value)}
                        rows={3}
                        placeholder="Anything helpful for future visits"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                      />
                    </label>

                    {customerError ? (
                      <p className="text-sm font-medium text-rose-600">{customerError}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={isSavingCustomer}
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isSavingCustomer ? 'Saving…' : 'Save Customer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCustomer(false);
                          setCustomerError(null);
                        }}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              {selectedCustomer ? (
                <form onSubmit={handleBookAppointment} className="space-y-5">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-sm font-semibold text-white">
                        {selectedCustomer.name
                          .split(' ')
                          .slice(0, 2)
                          .map((piece) => piece[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
                        <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                      </div>
                    </div>

                      <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Booking suggestion</p>
                          <h4 className="mt-2 text-sm font-semibold text-slate-900">Suggested booking details</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const suggestedService = getLastServiceForCustomer(appointments, selectedCustomer.id);
                            const suggestedDuration = getUsualDurationForCustomer(appointments, selectedCustomer.id);
                            setService(suggestedService ?? selectedCustomer.favoriteService);
                            setDuration(suggestedDuration ?? duration);
                            setDate(currentDate);
                            const nextTime = getNextAvailableTime(appointments, suggestedDuration ?? duration);
                            if (nextTime) setTime(nextTime);
                          }}
                          className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Use suggestion
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white p-3">
                          <p className="text-xs text-slate-400">Last service</p>
                          <p className="mt-2 font-semibold text-slate-900">{getLastServiceForCustomer(appointments, selectedCustomer.id) ?? 'None yet'}</p>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <p className="text-xs text-slate-400">Preferred duration</p>
                          <p className="mt-2 font-semibold text-slate-900">{getUsualDurationForCustomer(appointments, selectedCustomer.id) ?? '45 mins'}</p>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <p className="text-xs text-slate-400">Last visit</p>
                          <p className="mt-2 font-semibold text-slate-900">{selectedCustomer.lastVisit}</p>
                        </div>
                      </div>
                    </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                          Favourite service
                        </p>
                        <p className="mt-1 font-medium text-slate-900">{selectedCustomer.favoriteService}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                          Last visit
                        </p>
                        <p className="mt-1 font-medium text-slate-900">{selectedCustomer.lastVisit}</p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between rounded-[20px] border border-slate-200 bg-white px-3 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Booking details</p>
                        <p className="text-sm text-slate-500">{selectedCustomer.note}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(null)}
                        className="text-sm font-semibold text-blue-600"
                      >
                        Change
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Date</span>
                        <input
                          type="date"
                          value={date}
                          onChange={(event) => setDate(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Time</span>
                        <input
                          type="time"
                          value={time}
                          onChange={(event) => setTime(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Service</span>
                        <select
                          value={service}
                          onChange={(event) => setService(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        >
                          <option>Classic Cut</option>
                          <option>Beard Shape</option>
                          <option>Premium Hot Towel</option>
                          <option>Skin Fade</option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        <span className="mb-2 block">Duration</span>
                        <select
                          value={duration}
                          onChange={(event) => setDuration(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                        >
                          {durationOptions.map((minutes) => (
                            <option key={minutes} value={`${minutes} mins`}>
                              {minutes} mins
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block text-sm font-medium text-slate-700">
                      <span className="mb-2 block">Notes</span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                        placeholder="Optional notes for the appointment"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700 outline-none transition focus:border-blue-500"
                      />
                    </label>

                    <div className="mt-5 space-y-3">
                      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                        <span>WhatsApp reminder</span>
                        <input
                          type="checkbox"
                          checked={whatsapp}
                          onChange={() => setWhatsapp((value) => !value)}
                          className="h-5 w-5 rounded border-slate-300 text-blue-600"
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                        <span>SMS reminder</span>
                        <input
                          type="checkbox"
                          checked={sms}
                          onChange={() => setSms((value) => !value)}
                          className="h-5 w-5 rounded border-slate-300 text-blue-600"
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-[20px] bg-blue-600 px-4 py-4 text-base font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
                  >
                    Book Appointment
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeAppointment ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={handleCloseAppointment}
          />

          <aside
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-white p-6 shadow-2xl"
            style={{ transitionProperty: 'transform, opacity', transitionDuration: '250ms', transform: 'translateX(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Appointment details</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {(() => {
                    const appt = activeAppointment as Appointment;
                    const customer = customers.find((c) => c.id === appt.customerId) ?? null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (customer) openProfile(customer);
                        }}
                        className="text-left text-2xl font-semibold text-slate-900 hover:underline"
                      >
                        {customer?.name ?? appt.name}
                      </button>
                    );
                  })()}
                </h2>
              </div>
              <button onClick={handleCloseAppointment} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {(() => {
                const appt = activeAppointment as Appointment;
                const customer = customers.find((c) => c.id === appt.customerId) ?? null;
                return (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-700">Customer</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{customer?.name ?? appt.name}</p>
                      <p className="text-sm text-slate-500">{customer?.phone ?? 'No phone'}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-slate-400">Service</p>
                          <p className="font-semibold text-slate-900">{appt.service}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Date</p>
                          <p className="font-semibold text-slate-900">{date}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Time</p>
                          <p className="font-semibold text-slate-900">{appt.time}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Duration</p>
                          <p className="font-semibold text-slate-900">{appt.duration}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs text-slate-400">Notes</p>
                      <p className="mt-1 text-sm text-slate-700">{customer?.note ?? 'No notes'}</p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-slate-400">Previous visits</p>
                        <p className="mt-1 font-semibold text-slate-900">{customer?.lastVisit ?? 'None'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-slate-400">Customer since</p>
                        <p className="mt-1 font-semibold text-slate-900">Not available</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-slate-400">Outstanding</p>
                        <p className="mt-1 font-semibold text-rose-600">£0.00</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          const phone = customers.find((c) => c.id === appt.customerId)?.phone;
                          if (phone) window.location.href = `tel:${phone}`;
                        }}
                        className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-semibold text-white shadow-sm"
                      >
                        📞 Call
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const phone = customers.find((c) => c.id === appt.customerId)?.phone;
                          if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-900 shadow-sm"
                      >
                        💬 WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={handleEditFromDetails}
                        className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm"
                      >
                        ✏️ Edit Booking
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsBookingOpen(true);
                          setSelectedCustomer(customers.find((c) => c.id === appt.customerId) ?? null);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-900 shadow-sm"
                      >
                        📅 Rebook
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </aside>
        </div>
      ) : null}

      {profileCustomer ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={closeProfile} />

          <main
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full max-w-4xl overflow-y-auto bg-white p-6 shadow-2xl sm:rounded-l-[32px]"
            onClick={(e) => e.stopPropagation()}
            style={{ transition: 'transform 250ms ease' }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Customer profile</p>
                <h1 className="mt-1 text-3xl font-semibold text-slate-900">{profileCustomer.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{profileCustomer.phone}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const phone = profileCustomer.phone;
                    if (phone) window.location.href = `tel:${phone}`;
                  }}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  📞 Call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const phone = profileCustomer.phone;
                    if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`);
                  }}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  💬 WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  ✏️ Edit Customer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(profileCustomer);
                    setIsBookingOpen(true);
                    closeProfile();
                  }}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  📅 Book Appointment
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Customer since</p>
                <p className="mt-1 font-semibold text-slate-900">Not available</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">Total visits</p>
                <p className="mt-1 font-semibold text-slate-900">{appointments.filter((a) => a.customerId === profileCustomer.id).length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">Last visit</p>
                <p className="mt-1 font-semibold text-slate-900">{(() => {
                  const his = appointments.filter((a) => a.customerId === profileCustomer.id);
                  const latest = his.find((h) => (h as any).date) || his[his.length - 1];
                  return latest ? ((latest as any).date ?? 'Unknown') : 'No visits yet';
                })()}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">Preferred service</p>
                <p className="mt-1 font-semibold text-slate-900">{profileCustomer.favoriteService}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">Preferred duration</p>
                <p className="mt-1 font-semibold text-slate-900">{getUsualDurationForCustomer(appointments, profileCustomer.id) ?? '45 mins'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">Previous visits</p>
                <p className="mt-1 font-semibold text-slate-900">{appointments.filter((a) => a.customerId === profileCustomer.id).length}</p>
              </div>
            </div>

            <section className="mt-8">
              <h3 className="text-lg font-semibold text-slate-900">Haircut history</h3>
              <div className="mt-4 space-y-3">
                {appointments.filter((a) => a.customerId === profileCustomer.id).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">No previous appointments found.</div>
                ) : (
                  appointments
                    .filter((a) => a.customerId === profileCustomer.id)
                    .map((visit) => (
                      <div key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{visit.service}</p>
                            <p className="mt-1 text-xs text-slate-500">{(visit as any).date ?? date} • {visit.duration}</p>
                            <p className="mt-2 text-sm text-slate-700">{visit.name}</p>
                          </div>
                          <div className="text-sm text-slate-500 text-right">
                            <p>Barber: —</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{(visit as any).notes ?? 'No notes'}</p>
                      </div>
                    ))
                )}
              </div>
            </section>

            <section className="mt-8">
              <h3 className="text-lg font-semibold text-slate-900">Barber notes</h3>
              <div className="mt-3 space-y-3">
                {!isEditingProfile ? (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{profileCustomer.note || 'No notes yet.'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsEditingProfile(true)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Add note</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <textarea value={profileNotesDraft} onChange={(e) => setProfileNotesDraft(e.target.value)} rows={6} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700" />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveProfileEdits} className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
                      <button type="button" onClick={() => { setIsEditingProfile(false); setProfileNotesDraft(profileCustomer.note); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      ) : null}
    </div>
  );
}

export default App;
