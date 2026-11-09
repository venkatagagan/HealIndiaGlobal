import { api } from '../client';
import type {
  AvailabilityDay,
  AvailabilityParams,
  AvailabilitySlotIn,
  DoctorAdminOut,
  DoctorIn,
  HospitalDashboard,
  HospitalMemberInviteIn,
  HospitalMemberOut,
  HospitalMemberUpdateIn,
  HospitalProcedureIn,
  HospitalProcedureOut,
  HospitalProfileIn,
  HospitalProfileOut,
  HospitalSpecialtiesIn,
  PackageIn,
  PackageOut,
  ReviewOut,
  Uuid,
} from '../types';
import { seg } from './_util';

/**
 * PLAN 8.5 - /hospital-portal (hospital members). The active hospital is selected with the
 * `X-Hospital-Id` header - configure it once via `configureApiClient({ extraHeaders })`.
 * Cases/quotes/bookings for hospitals use casesApi / bookingsApi (scoped server-side).
 */
export const hospitalPortalApi = {
  getProfile: () => api.get<HospitalProfileOut>('/hospital-portal/profile'),
  updateProfile: (body: HospitalProfileIn) => api.put<HospitalProfileOut>('/hospital-portal/profile', body),
  submitForReview: () => api.post<HospitalProfileOut>('/hospital-portal/submit-for-review', {}),
  dashboard: () => api.get<HospitalDashboard>('/hospital-portal/dashboard'),

  listMembers: () => api.get<HospitalMemberOut[]>('/hospital-portal/members'),
  inviteMember: (body: HospitalMemberInviteIn) => api.post<HospitalMemberOut>('/hospital-portal/members', body),
  updateMember: (id: Uuid, body: HospitalMemberUpdateIn) =>
    api.put<HospitalMemberOut>(`/hospital-portal/members/${seg(id)}`, body),
  removeMember: (id: Uuid) => api.delete(`/hospital-portal/members/${seg(id)}`),

  listDoctors: () => api.get<DoctorAdminOut[]>('/hospital-portal/doctors'),
  getDoctor: (id: Uuid) => api.get<DoctorAdminOut>(`/hospital-portal/doctors/${seg(id)}`),
  createDoctor: (body: DoctorIn) => api.post<DoctorAdminOut>('/hospital-portal/doctors', body),
  updateDoctor: (id: Uuid, body: Partial<DoctorIn>) =>
    api.put<DoctorAdminOut>(`/hospital-portal/doctors/${seg(id)}`, body),
  deleteDoctor: (id: Uuid) => api.delete(`/hospital-portal/doctors/${seg(id)}`),
  getDoctorAvailability: (id: Uuid, params?: AvailabilityParams) =>
    api.get<AvailabilityDay[]>(`/hospital-portal/doctors/${seg(id)}/availability`, params),
  /** body: [{date, slot_kind, capacity}] */
  setDoctorAvailability: (id: Uuid, slots: AvailabilitySlotIn[]) =>
    api.put<AvailabilityDay[]>(`/hospital-portal/doctors/${seg(id)}/availability`, slots),

  listProcedures: () => api.get<HospitalProcedureOut[]>('/hospital-portal/procedures'),
  getProcedure: (id: Uuid) => api.get<HospitalProcedureOut>(`/hospital-portal/procedures/${seg(id)}`),
  createProcedure: (body: HospitalProcedureIn) =>
    api.post<HospitalProcedureOut>('/hospital-portal/procedures', body),
  updateProcedure: (id: Uuid, body: Partial<HospitalProcedureIn>) =>
    api.put<HospitalProcedureOut>(`/hospital-portal/procedures/${seg(id)}`, body),
  deleteProcedure: (id: Uuid) => api.delete(`/hospital-portal/procedures/${seg(id)}`),

  listPackages: (procedureId: Uuid) =>
    api.get<PackageOut[]>(`/hospital-portal/procedures/${seg(procedureId)}/packages`),
  createPackage: (procedureId: Uuid, body: PackageIn) =>
    api.post<PackageOut>(`/hospital-portal/procedures/${seg(procedureId)}/packages`, body),
  updatePackage: (procedureId: Uuid, packageId: Uuid, body: Partial<PackageIn>) =>
    api.put<PackageOut>(`/hospital-portal/procedures/${seg(procedureId)}/packages/${seg(packageId)}`, body),
  deletePackage: (procedureId: Uuid, packageId: Uuid) =>
    api.delete(`/hospital-portal/procedures/${seg(procedureId)}/packages/${seg(packageId)}`),

  setSpecialties: (body: HospitalSpecialtiesIn) =>
    api.put<HospitalProfileOut>('/hospital-portal/specialties', body),
  listReviews: () => api.get<ReviewOut[]>('/hospital-portal/reviews'),
};
