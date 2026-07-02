import { type FormEvent, useEffect, useState } from 'react';
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
  time: string;
  duration: string;
  name: string;
  service: string;
  accent: string;
  customerId?: string;
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
  { id: 'appt-1', time: '09:30', duration: '45 mins', name: 'Jordan Lee', service: 'Classic Cut', accent: 'bg-white' },
  { id: 'appt-2', time: '11:00', duration: '30 mins', name: 'Mina Patel', service: 'Beard Shape', accent: 'bg-white' },
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

const sortAppointments = (list: Appointment[]) =>
  [...list].sort((left, right) => timeToMinutes(left.time) - timeToMinutes(right.time));

const DIARY_START_MINUTES = 9 * 60;
const DIARY_END_MINUTES = 18 * 60;
const DIARY_INTERVAL = 15;
const SLOT_HEIGHT = 56;

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
  const [date, setDate] = useState('2026-07-03');
  const [time, setTime] = useState('10:30');
  const [service, setService] = useState('Classic Cut');
  const [duration, setDuration] = useState('45 mins');
  const [notes, setNotes] = useState('');
  const [whatsapp, setWhatsapp] = useState(true);
  const [sms, setSms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const sortedAppointments = sortAppointments(appointments);

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

    const savedCustomer = await createCustomerInSupabase({
      full_name: customerFormName.trim(),
      phone: customerFormPhone.trim() || null,
      preferred_service: customerFormService || null,
      last_visit: customerFormLastVisit.trim() || null,
      notes: customerFormNotes.trim() || null,
    });

    if (!savedCustomer) {
      setCustomerError('We could not save that customer right now.');
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
      time,
      duration,
      name: selectedCustomer.name,
      service,
      accent: 'bg-sky-50',
      customerId: selectedCustomer.id,
    };

    setAppointments((current) => sortAppointments([...current, newAppointment]));
    setIsBookingOpen(false);
    setShowSuccess(true);
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
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
            {today}
          </div>
        </header>

        <main className="space-y-6">
          <section className="rounded-[32px] border border-slate-200/70 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-700 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-10">
            <div className="mb-4 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
              <CalendarDays className="mr-2 h-4 w-4" />
              Premium booking view
            </div>
            <h2 className="text-3xl font-semibold sm:text-4xl">Good morning Jamie 👋</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">
              A polished daily view for a refined barbershop experience, worthy of a premium membership.
            </p>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.02fr_1.18fr]">
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

            <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
                    Today&apos;s Diary
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">Appointments</h3>
                </div>
                <p className="text-sm text-slate-500">09:00 — 18:00 · 15-minute blocks</p>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                <div className="grid grid-cols-[72px_1fr] min-h-[520px] overflow-hidden">
                  <div className="border-r border-slate-200/80 bg-slate-100/80 px-3 py-3 text-xs text-slate-500">
                    <div className="space-y-0">
                      {diaryTimeSlots.map((slot, index) => (
                        <div key={slot} className={`h-14 ${index % 4 === 0 ? 'border-b border-slate-200/70' : 'border-b border-slate-200/30'}`}>
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
                          className={`h-14 ${index % 4 === 0 ? 'border-b border-slate-200/70' : 'border-b border-slate-200/30'} bg-white/0`}
                        />
                      ))}
                    </div>

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
                              className={`absolute left-3 right-3 rounded-[28px] border px-4 py-3 shadow-sm ${
                                isFree
                                  ? 'border-emerald-200 bg-emerald-50/90 text-emerald-700'
                                  : 'border-sky-200 bg-sky-50/95 text-slate-900'
                              }`}
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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-0 sm:p-4">
          <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto rounded-none border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.22)] sm:rounded-[32px]">
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
                            <p className="font-semibold text-slate-900">{customer.name}</p>
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
                          <option>30 mins</option>
                          <option>45 mins</option>
                          <option>60 mins</option>
                          <option>90 mins</option>
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
    </div>
  );
}

export default App;
