import { z } from 'zod';

export const USER_ROLE = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
} as const;
export const USER_ROLES = [USER_ROLE.MALE, USER_ROLE.FEMALE] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const SESSION_STATE = {
  WAITING_FOR_PARTNER: 'WAITING_FOR_PARTNER',
  PARTNER_FOUND: 'PARTNER_FOUND',
  WAITING_FOR_START: 'WAITING_FOR_START',
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
} as const;
export const SESSION_STATES = [
  SESSION_STATE.WAITING_FOR_PARTNER,
  SESSION_STATE.PARTNER_FOUND,
  SESSION_STATE.WAITING_FOR_START,
  SESSION_STATE.ACTIVE,
  SESSION_STATE.FINISHED,
] as const;
export const SessionStateSchema = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const QUEUE_JOIN_STATUS = {
  QUEUED: 'QUEUED',
  PARTNER_FOUND: 'PARTNER_FOUND',
} as const;
export const QUEUE_JOIN_STATUSES = [
  QUEUE_JOIN_STATUS.QUEUED,
  QUEUE_JOIN_STATUS.PARTNER_FOUND,
] as const;
export const QueueJoinStatusSchema = z.enum(QUEUE_JOIN_STATUSES);
export type QueueJoinStatus = z.infer<typeof QueueJoinStatusSchema>;

export const ROLE_SELECT_STATUS = {
  OK: 'OK',
} as const;

export const QUEUE_CANCEL_STATUS = {
  OK: 'OK',
} as const;

export const SESSION_START_STATUS = {
  WAITING: 'WAITING',
  STARTED: 'STARTED',
} as const;
export const SESSION_START_STATUSES = [
  SESSION_START_STATUS.WAITING,
  SESSION_START_STATUS.STARTED,
] as const;
export const SessionStartStatusSchema = z.enum(SESSION_START_STATUSES);
export type SessionStartStatus = z.infer<typeof SessionStartStatusSchema>;

export const SOCKET_EVENT = {
  PARTNER_FOUND: 'partner_found',
  PARTNER_CANCELLED: 'partner_cancelled',
  SESSION_STARTED: 'session_started',
} as const;
export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];

export const ANALYTICS_EVENT = {
  SELECTED_GENDER: 'selected_gender',
  QUEUED: 'queued',
  PARTNER_FOUND: 'partner_found',
  START_PRESSED: 'start_pressed',
  SESSION_STARTED: 'session_started',
  CHOICE_MADE: 'choice_made',
  TIMEOUT_WARN: 'timeout_warn',
  TIMEOUT_END: 'timeout_end',
  DISCONNECT: 'disconnect',
  SESSION_END: 'session_end',
} as const;
export const ANALYTICS_EVENTS = [
  ANALYTICS_EVENT.SELECTED_GENDER,
  ANALYTICS_EVENT.QUEUED,
  ANALYTICS_EVENT.PARTNER_FOUND,
  ANALYTICS_EVENT.START_PRESSED,
  ANALYTICS_EVENT.SESSION_STARTED,
  ANALYTICS_EVENT.CHOICE_MADE,
  ANALYTICS_EVENT.TIMEOUT_WARN,
  ANALYTICS_EVENT.TIMEOUT_END,
  ANALYTICS_EVENT.DISCONNECT,
  ANALYTICS_EVENT.SESSION_END,
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const DeviceIdSchema = z.string().min(8);
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const SessionIdSchema = z.string().min(8);
export type SessionId = z.infer<typeof SessionIdSchema>;

export const RoleSelectRequestSchema = z.object({
  deviceId: DeviceIdSchema,
  role: UserRoleSchema,
});
export type RoleSelectRequest = z.infer<typeof RoleSelectRequestSchema>;

export const RoleSelectResponseSchema = z.object({
  status: z.literal(ROLE_SELECT_STATUS.OK),
});
export type RoleSelectResponse = z.infer<typeof RoleSelectResponseSchema>;

export const QueueJoinRequestSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type QueueJoinRequest = z.infer<typeof QueueJoinRequestSchema>;

export const QueueJoinResponseSchema = z.object({
  status: QueueJoinStatusSchema,
  sessionId: SessionIdSchema.optional(),
});
export type QueueJoinResponse = z.infer<typeof QueueJoinResponseSchema>;

export const QueueCancelRequestSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type QueueCancelRequest = z.infer<typeof QueueCancelRequestSchema>;

export const QueueCancelResponseSchema = z.object({
  status: z.literal(QUEUE_CANCEL_STATUS.OK),
});
export type QueueCancelResponse = z.infer<typeof QueueCancelResponseSchema>;

export const SessionStartRequestSchema = z.object({
  deviceId: DeviceIdSchema,
  sessionId: SessionIdSchema,
});
export type SessionStartRequest = z.infer<typeof SessionStartRequestSchema>;

export const SessionStartResponseSchema = z.object({
  status: SessionStartStatusSchema,
});
export type SessionStartResponse = z.infer<typeof SessionStartResponseSchema>;

export const PartnerFoundEventSchema = z.object({
  sessionId: SessionIdSchema,
});
export type PartnerFoundEvent = z.infer<typeof PartnerFoundEventSchema>;

export const PartnerCancelledEventSchema = z.object({
  sessionId: SessionIdSchema,
});
export type PartnerCancelledEvent = z.infer<typeof PartnerCancelledEventSchema>;

export const SessionStartedEventSchema = z.object({
  sessionId: SessionIdSchema,
});
export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;

export const SocketAuthSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type SocketAuth = z.infer<typeof SocketAuthSchema>;
