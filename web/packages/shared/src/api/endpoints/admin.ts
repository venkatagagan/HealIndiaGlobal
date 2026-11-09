import { api } from '../client';
import type {
  AccommodationProviderIn,
  AccommodationProviderOut,
  AdminEnquiryListParams,
  AdminReportListParams,
  AdminReportOut,
  AdminAgentListParams,
  AdminAgentOut,
  AdminAgentUpdateIn,
  AdminDashboard,
  AdminFacets,
  AdminHospitalDetail,
  AdminHospitalListParams,
  AdminHospitalUpdateIn,
  AdminUserListParams,
  AgentStatus,
  AdminUserOut,
  AdminUserUpdateIn,
  AuditLogListParams,
  AuditLogOut,
  CasesReport,
  CasesReportParams,
  CostBenchmarkIn,
  CostBenchmarkOut,
  CulturalTipIn,
  CulturalTipOut,
  DashboardOverview,
  DashboardPeriod,
  EnquiryOut,
  EnquiryUpdateIn,
  ExportParams,
  FxRateIn,
  FxRateOut,
  HospitalProfileOut,
  HospitalStatus,
  Page,
  PlatformSettingOut,
  ProcedureIn,
  ProcedureOut,
  ReasonIn,
  ReportResolveIn,
  RevenueReport,
  RevenueReportParams,
  ServiceProviderIn,
  ServiceProviderOut,
  SpecialtyIn,
  SpecialtyOut,
  StaffCreateIn,
  StaffMemberOut,
  StatusCounts,
  UserRole,
  Uuid,
} from '../types';
import { seg } from './_util';

export interface CrudEndpoints<Out, In> {
  list: (params?: object) => Promise<Out[]>;
  get: (id: Uuid) => Promise<Out>;
  create: (body: In) => Promise<Out>;
  update: (id: Uuid, body: Partial<In>) => Promise<Out>;
  delete: (id: Uuid) => Promise<void>;
}

/** Generic CRUD for /admin/<resource> catalog endpoints (list returns a plain array). */
function crud<Out, In>(base: string): CrudEndpoints<Out, In> {
  return {
    list: (params) => api.get<Out[]>(base, params),
    get: (id) => api.get<Out>(`${base}/${seg(id)}`),
    create: (body) => api.post<Out>(base, body),
    update: (id, body) => api.patch<Out>(`${base}/${seg(id)}`, body),
    delete: (id) => api.delete(`${base}/${seg(id)}`),
  };
}

/** PLAN 8.13 - /admin (staff). Cases/bookings/payments lists for staff use casesApi/bookingsApi/paymentsApi. */
export const adminApi = {
  dashboard: () => api.get<AdminDashboard>('/admin/dashboard'),
  dashboardOverview: (params?: { period?: DashboardPeriod }) =>
    api.get<DashboardOverview>('/admin/dashboard/overview', params),

  // users
  listUsers: (params?: AdminUserListParams) => api.get<Page<AdminUserOut>>('/admin/users', params),
  /** users per role for the same filters as listUsers (role ignored) */
  userRoleCounts: (params?: Omit<AdminUserListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<StatusCounts<UserRole>>('/admin/users/role-counts', params),
  /** distinct values for list filters (cities, countries, accreditations, audit actions ...) */
  facets: () => api.get<AdminFacets>('/admin/facets'),
  getUser: (id: Uuid) => api.get<AdminUserOut>(`/admin/users/${seg(id)}`),
  /** AD; role changes audited; cannot demote the last super_admin */
  updateUser: (id: Uuid, body: AdminUserUpdateIn) => api.patch<AdminUserOut>(`/admin/users/${seg(id)}`, body),
  /** AD: create a staff user */
  createStaff: (body: StaffCreateIn) => api.post<AdminUserOut>('/admin/users', body),
  /** pick coordinators etc. */
  listStaff: (params?: { role?: UserRole }) => api.get<StaffMemberOut[]>('/admin/staff', params),

  // hospitals
  listHospitals: (params?: AdminHospitalListParams) =>
    api.get<Page<HospitalProfileOut>>('/admin/hospitals', params),
  hospitalStatusCounts: (params?: Omit<AdminHospitalListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<StatusCounts<HospitalStatus>>('/admin/hospitals/status-counts', params),
  getHospital: (id: Uuid) => api.get<AdminHospitalDetail>(`/admin/hospitals/${seg(id)}`),
  approveHospital: (id: Uuid) => api.post<HospitalProfileOut>(`/admin/hospitals/${seg(id)}/approve`, {}),
  rejectHospital: (id: Uuid, body: ReasonIn) =>
    api.post<HospitalProfileOut>(`/admin/hospitals/${seg(id)}/reject`, body),
  suspendHospital: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<HospitalProfileOut>(`/admin/hospitals/${seg(id)}/suspend`, body),
  updateHospital: (id: Uuid, body: AdminHospitalUpdateIn) =>
    api.patch<HospitalProfileOut>(`/admin/hospitals/${seg(id)}`, body),

  // agents
  listAgents: (params?: AdminAgentListParams) => api.get<Page<AdminAgentOut>>('/admin/agents', params),
  agentStatusCounts: (params?: Omit<AdminAgentListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<StatusCounts<AgentStatus>>('/admin/agents/status-counts', params),
  getAgent: (id: Uuid) => api.get<AdminAgentOut>(`/admin/agents/${seg(id)}`),
  approveAgent: (id: Uuid) => api.post<AdminAgentOut>(`/admin/agents/${seg(id)}/approve`, {}),
  rejectAgent: (id: Uuid, body: ReasonIn) => api.post<AdminAgentOut>(`/admin/agents/${seg(id)}/reject`, body),
  suspendAgent: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<AdminAgentOut>(`/admin/agents/${seg(id)}/suspend`, body),
  updateAgent: (id: Uuid, body: AdminAgentUpdateIn) =>
    api.patch<AdminAgentOut>(`/admin/agents/${seg(id)}`, body),

  // catalog & content CRUD (AD)
  specialties: crud<SpecialtyOut, SpecialtyIn>('/admin/specialties'),
  procedures: crud<ProcedureOut, ProcedureIn>('/admin/procedures'),
  costBenchmarks: crud<CostBenchmarkOut, CostBenchmarkIn>('/admin/cost-benchmarks'),
  culturalTips: crud<CulturalTipOut, CulturalTipIn>('/admin/cultural-tips'),
  accommodationProviders: crud<AccommodationProviderOut, AccommodationProviderIn>('/admin/accommodation-providers'),
  serviceProviders: crud<ServiceProviderOut, ServiceProviderIn>('/admin/service-providers'),
  fxRates: crud<FxRateOut, FxRateIn>('/admin/fx-rates'),

  // settings (AD; finance keys F)
  listSettings: () => api.get<PlatformSettingOut[]>('/admin/settings'),
  updateSetting: (key: string, value: unknown) =>
    api.put<PlatformSettingOut>(`/admin/settings/${seg(key)}`, { value }),

  // audit & reports
  auditLogs: (params?: AuditLogListParams) => api.get<Page<AuditLogOut>>('/admin/audit-logs', params),
  revenueReport: (params?: RevenueReportParams) => api.get<RevenueReport>('/admin/reports/revenue', params),
  casesReport: (params?: CasesReportParams) => api.get<CasesReport>('/admin/reports/cases', params),
  /** CSV stream download (saves the file) */
  exportCsv: (params: ExportParams) =>
    api.downloadAndSave('/admin/reports/export', `${params.type}-export.csv`, params),

  // moderation queue (CG-16; roles admin, support, super_admin)
  listContentReports: (params?: AdminReportListParams) => api.get<Page<AdminReportOut>>('/admin/reports', params),
  getContentReport: (id: Uuid) => api.get<AdminReportOut>(`/admin/reports/${seg(id)}`),
  /** 400 `invalid_action` (hide_message on a non-message, suspend with no non-staff author); 409 `already_resolved` */
  resolveContentReport: (id: Uuid, body: ReportResolveIn) =>
    api.post<AdminReportOut>(`/admin/reports/${seg(id)}/resolve`, body),

  // website enquiries from the public contact form (roles admin, support, super_admin)
  listEnquiries: (params?: AdminEnquiryListParams) => api.get<Page<EnquiryOut>>('/admin/enquiries', params),
  updateEnquiry: (id: Uuid, body: EnquiryUpdateIn) => api.patch<EnquiryOut>(`/admin/enquiries/${seg(id)}`, body),
};
