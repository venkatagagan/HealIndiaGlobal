import { api } from '../client';
import type { ReportCreateIn, ReportOut } from '../types';

/**
 * CG-16 - content reports. Any signed-in user can report a chat message, an AI screening result, an AI document
 * analysis or a review. Re-reporting a target while the earlier report is still open returns that report (201).
 * 404 when the target does not exist or is not visible to the user; 429 `rate_limited`.
 */
export const reportsApi = {
  createReport: (body: ReportCreateIn) => api.post<ReportOut>('/reports', body),
};
