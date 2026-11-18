import type { Uuid } from '@hig/shared/api';

/** Absolute URLs of the patient portal (mounted at /app). */
export const PORTAL_BASE = '/app';

export const paths = {
  dashboard: PORTAL_BASE,
  newScreening: (specialty?: string) =>
    `${PORTAL_BASE}/screening/new${specialty ? `?specialty=${encodeURIComponent(specialty)}` : ''}`,
  screeningStep: (id: Uuid, step: number) => `${PORTAL_BASE}/screening/${id}/step/${step}`,
  screeningProcessing: (id: Uuid) => `${PORTAL_BASE}/screening/${id}/processing`,
  screeningResults: (id: Uuid) => `${PORTAL_BASE}/screening/${id}/results`,
  screeningCompare: (id: Uuid, matchIds: Uuid[]) =>
    `${PORTAL_BASE}/screening/${id}/compare?m=${matchIds.map(encodeURIComponent).join(',')}`,
  screenings: `${PORTAL_BASE}/screenings`,
  cases: `${PORTAL_BASE}/cases`,
  newCase: (params: { doctor?: Uuid; hospital?: string; procedure?: Uuid }) => {
    const search = new URLSearchParams();
    if (params.doctor) search.set('doctor', params.doctor);
    if (params.hospital) search.set('hospital', params.hospital);
    if (params.procedure) search.set('procedure', params.procedure);
    const qs = search.toString();
    return `${PORTAL_BASE}/cases/new${qs ? `?${qs}` : ''}`;
  },
  case: (id: Uuid) => `${PORTAL_BASE}/cases/${id}`,
  book: (caseId: Uuid) => `${PORTAL_BASE}/cases/${caseId}/book`,
  bookings: `${PORTAL_BASE}/bookings`,
  payments: `${PORTAL_BASE}/payments`,
  booking: (id: Uuid) => `${PORTAL_BASE}/bookings/${id}`,
  pay: (bookingId: Uuid, installmentId?: Uuid) =>
    `${PORTAL_BASE}/bookings/${bookingId}/pay${installmentId ? `?installment=${encodeURIComponent(installmentId)}` : ''}`,
  payResult: (bookingId: Uuid, orderId: Uuid) =>
    `${PORTAL_BASE}/bookings/${bookingId}/pay/result?order=${encodeURIComponent(orderId)}`,
  tripIndex: `${PORTAL_BASE}/trip`,
  trip: (bookingId: Uuid) => `${PORTAL_BASE}/trip/${bookingId}`,
  documents: `${PORTAL_BASE}/documents`,
  messages: `${PORTAL_BASE}/messages`,
  conversation: (id: Uuid) => `${PORTAL_BASE}/messages/${id}`,
  notifications: `${PORTAL_BASE}/notifications`,
  profile: `${PORTAL_BASE}/profile`,
  saved: `${PORTAL_BASE}/saved`,
  /** in-app route that forwards to the website door (PLAN 3.1): `${VITE_PUBLIC_LOGIN_URL}?next=<url>` */
  login: (next?: string) => `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`,
  hospital: (slug: string) => `${PORTAL_BASE}/hospitals/${encodeURIComponent(slug)}`,
  doctor: (id: Uuid) => `${PORTAL_BASE}/doctors/${encodeURIComponent(id)}`,
  procedure: (slug: string) => `${PORTAL_BASE}/procedures/${encodeURIComponent(slug)}`,
  browse: (params: { tab?: 'hospitals' | 'doctors'; q?: string; procedure?: string; specialty?: string } = {}) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    const qs = search.toString();
    return `${PORTAL_BASE}/browse${qs ? `?${qs}` : ''}`;
  },
  /** quick quote: up to 3 hospitals (`hospitals` = ids) */
  quickQuote: (params: { hospitals?: Uuid[]; procedure?: string; screening?: Uuid; specialty?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.hospitals?.length) search.set('h', params.hospitals.join(','));
    if (params.procedure) search.set('procedure', params.procedure);
    if (params.screening) search.set('screening', params.screening);
    if (params.specialty) search.set('specialty', params.specialty);
    const qs = search.toString();
    return `${PORTAL_BASE}/quotes/new${qs ? `?${qs}` : ''}`;
  },
  quoteGroup: (groupId: Uuid) => `${PORTAL_BASE}/quotes/${encodeURIComponent(groupId)}`,
  visaGuide: (params: { nationality?: string; booking?: Uuid } = {}) => {
    const search = new URLSearchParams();
    if (params.nationality) search.set('nationality', params.nationality);
    if (params.booking) search.set('booking', params.booking);
    const qs = search.toString();
    return `${PORTAL_BASE}/visa-guide${qs ? `?${qs}` : ''}`;
  },
  reviews: `${PORTAL_BASE}/reviews`,
  writeReview: (bookingId: Uuid) => `${PORTAL_BASE}/reviews/new?booking=${encodeURIComponent(bookingId)}`,
  editReview: (reviewId: Uuid) => `${PORTAL_BASE}/reviews/${encodeURIComponent(reviewId)}/edit`,
  aftercare: `${PORTAL_BASE}/aftercare`,
  referrals: `${PORTAL_BASE}/referrals`,
  freeCall: (screeningId?: Uuid) =>
    `${PORTAL_BASE}/free-call${screeningId ? `?screening=${encodeURIComponent(screeningId)}` : ''}`,
  freeCallStatus: `${PORTAL_BASE}/free-call/status`,
};
