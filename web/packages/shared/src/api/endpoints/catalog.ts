import { api } from '../client';
import type {
  AccommodationProviderOut,
  AvailabilityDay,
  AvailabilityParams,
  CostComparison,
  CostComparisonParams,
  CulturalTipOut,
  DoctorCard,
  DoctorDetail,
  DoctorListParams,
  FxRateOut,
  Helplines,
  HospitalCard,
  HospitalDetail,
  HospitalListParams,
  Page,
  ProcedureListParams,
  ProcedureOut,
  SearchResults,
  ServiceKind,
  ServiceProviderOut,
  SpecialtyOut,
  SymptomLibraryItem,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.4 - public catalog (no auth required). */
export const catalogApi = {
  listSpecialties: () => api.get<SpecialtyOut[]>('/specialties'),
  getSpecialty: (slug: string) => api.get<SpecialtyOut>(`/specialties/${seg(slug)}`),

  listProcedures: (params?: ProcedureListParams) => api.get<ProcedureOut[]>('/procedures', params),
  getProcedure: (slug: string) => api.get<ProcedureOut>(`/procedures/${seg(slug)}`),

  /** only status=active hospitals */
  listHospitals: (params?: HospitalListParams) => api.get<Page<HospitalCard>>('/hospitals', params),
  getHospital: (slugOrId: string) => api.get<HospitalDetail>(`/hospitals/${seg(slugOrId)}`),
  hospitalAvailability: (hospitalId: Uuid, params?: AvailabilityParams & { doctor_id?: Uuid }) =>
    api.get<AvailabilityDay[]>(`/hospitals/${seg(hospitalId)}/availability`, params),

  listDoctors: (params?: DoctorListParams) => api.get<Page<DoctorCard>>('/doctors', params),
  getDoctor: (id: Uuid) => api.get<DoctorDetail>(`/doctors/${seg(id)}`),
  doctorAvailability: (doctorId: Uuid, params?: AvailabilityParams) =>
    api.get<AvailabilityDay[]>(`/doctors/${seg(doctorId)}/availability`, params),

  /** India prices converted to `currency` */
  costComparison: (params: CostComparisonParams) => api.get<CostComparison>('/cost-comparison', params),
  /** up to 5 of each kind */
  search: (q: string) => api.get<SearchResults>('/search', { q }),

  culturalTips: () => api.get<CulturalTipOut[]>('/content/cultural-tips'),
  helplines: () => api.get<Helplines>('/content/helplines'),
  fxRates: () => api.get<FxRateOut[]>('/content/fx-rates'),
  symptoms: (params?: { specialty?: string; body_area?: string }) =>
    api.get<SymptomLibraryItem[]>('/content/symptoms', params),

  accommodations: (params?: { city?: string; hospital_id?: Uuid }) =>
    api.get<AccommodationProviderOut[]>('/accommodations', params),
  serviceProviders: (params?: { kind?: ServiceKind; city?: string; language?: string }) =>
    api.get<ServiceProviderOut[]>('/service-providers', params),
};
