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

export const SESSION_RESUME_STATUS = {
  ACTIVE: 'ACTIVE',
  FOUND: 'FOUND',
  WAITING: 'WAITING',
  QUEUED: 'QUEUED',
  NONE: 'NONE',
} as const;
export const SESSION_RESUME_STATUSES = [
  SESSION_RESUME_STATUS.ACTIVE,
  SESSION_RESUME_STATUS.FOUND,
  SESSION_RESUME_STATUS.WAITING,
  SESSION_RESUME_STATUS.QUEUED,
  SESSION_RESUME_STATUS.NONE,
] as const;
export const SessionResumeStatusSchema = z.enum(SESSION_RESUME_STATUSES);
export type SessionResumeStatus = z.infer<typeof SessionResumeStatusSchema>;

export const SOCKET_EVENT = {
  PARTNER_FOUND: 'partner_found',
  PARTNER_CANCELLED: 'partner_cancelled',
  SESSION_STARTED: 'session_started',
  SESSION_STEP: 'session_step',
  SESSION_ENDED: 'session_ended',
} as const;
export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];

export const ANALYTICS_EVENT = {
  SELECTED_GENDER: 'selected_gender',
  QUEUED: 'queued',
  PARTNER_FOUND: 'partner_found',
  START_PRESSED: 'start_pressed',
  SESSION_STARTED: 'session_started',
  STEP_SHOWN: 'step_shown',
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
  ANALYTICS_EVENT.STEP_SHOWN,
  ANALYTICS_EVENT.CHOICE_MADE,
  ANALYTICS_EVENT.TIMEOUT_WARN,
  ANALYTICS_EVENT.TIMEOUT_END,
  ANALYTICS_EVENT.DISCONNECT,
  ANALYTICS_EVENT.SESSION_END,
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const SESSION_END_REASON = {
  COMPLETED: 'completed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
} as const;
export const SESSION_END_REASONS = [
  SESSION_END_REASON.COMPLETED,
  SESSION_END_REASON.TIMEOUT,
  SESSION_END_REASON.CANCELLED,
] as const;
export const SessionEndReasonSchema = z.enum(SESSION_END_REASONS);
export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

export const DeviceIdSchema = z.string().min(8);
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const SessionIdSchema = z.string().min(8);
export type SessionId = z.infer<typeof SessionIdSchema>;

export const StepIdSchema = z.string().min(8);
export type StepId = z.infer<typeof StepIdSchema>;

export const ScenarioActorNameSchema = z.enum(['He', 'She']);
export type ScenarioActorName = z.infer<typeof ScenarioActorNameSchema>;

export const ScenarioActorSchema = z
  .object({
    name: ScenarioActorNameSchema,
    avatarPath: z.string().optional(),
  })
  .passthrough();
export type ScenarioActor = z.infer<typeof ScenarioActorSchema>;

export const ScenarioVideoByRoleSchema = z
  .object({
    male: z.string().min(1).optional(),
    female: z.string().min(1).optional(),
  })
  .partial();
export type ScenarioVideoByRole = z.infer<typeof ScenarioVideoByRoleSchema>;

export const ScenarioChoicesSchema = z.record(StepIdSchema, z.string());
export type ScenarioChoices = z.infer<typeof ScenarioChoicesSchema>;

export const ScenarioNodeSchema = z
  .object({
    id: StepIdSchema,
    actor: ScenarioActorSchema,
    text: z.string(),
    prev: z.array(StepIdSchema),
    choices: ScenarioChoicesSchema.optional(),
    videoByRole: ScenarioVideoByRoleSchema.optional(),
  })
  .passthrough();
export type ScenarioNode = z.infer<typeof ScenarioNodeSchema>;

export const SessionActorSchema = z.object({
  name: ScenarioActorNameSchema,
  avatarPath: z.string().optional(),
});
export type SessionActor = z.infer<typeof SessionActorSchema>;

export const SessionStepChoiceSchema = z.object({
  id: StepIdSchema,
  text: z.string(),
});
export type SessionStepChoice = z.infer<typeof SessionStepChoiceSchema>;

export const SessionStepEventSchema = z.object({
  sessionId: SessionIdSchema,
  stepId: StepIdSchema,
  actor: SessionActorSchema,
  bubbleText: z.string(),
  choices: z.array(SessionStepChoiceSchema),
  videoUrl: z.string().min(1),
  turnDeviceId: DeviceIdSchema,
  preloadVideoUrls: z.array(z.string()).optional(),
});
export type SessionStepEvent = z.infer<typeof SessionStepEventSchema>;

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

export const SESSION_ANSWER_STATUS = {
  OK: 'OK',
  NOOP: 'NOOP',
} as const;
export const SESSION_ANSWER_STATUSES = [
  SESSION_ANSWER_STATUS.OK,
  SESSION_ANSWER_STATUS.NOOP,
] as const;
export const SessionAnswerStatusSchema = z.enum(SESSION_ANSWER_STATUSES);
export type SessionAnswerStatus = z.infer<typeof SessionAnswerStatusSchema>;

export const SessionAnswerRequestSchema = z.object({
  deviceId: DeviceIdSchema,
  sessionId: SessionIdSchema,
  choiceId: StepIdSchema,
});
export type SessionAnswerRequest = z.infer<typeof SessionAnswerRequestSchema>;

export const SessionAnswerResponseSchema = z.object({
  status: SessionAnswerStatusSchema,
});
export type SessionAnswerResponse = z.infer<typeof SessionAnswerResponseSchema>;

export const SESSION_END_STATUS = {
  OK: 'OK',
  NOOP: 'NOOP',
} as const;
export const SESSION_END_STATUSES = [
  SESSION_END_STATUS.OK,
  SESSION_END_STATUS.NOOP,
] as const;
export const SessionEndStatusSchema = z.enum(SESSION_END_STATUSES);
export type SessionEndStatus = z.infer<typeof SessionEndStatusSchema>;

export const SessionEndRequestSchema = z.object({
  deviceId: DeviceIdSchema,
  sessionId: SessionIdSchema,
});
export type SessionEndRequest = z.infer<typeof SessionEndRequestSchema>;

export const SessionEndResponseSchema = z.object({
  status: SessionEndStatusSchema,
});
export type SessionEndResponse = z.infer<typeof SessionEndResponseSchema>;

export const SessionResumeRequestSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type SessionResumeRequest = z.infer<typeof SessionResumeRequestSchema>;

export const SessionResumeResponseSchema = z
  .object({
    status: SessionResumeStatusSchema,
    sessionId: SessionIdSchema.optional(),
    step: SessionStepEventSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === SESSION_RESUME_STATUS.ACTIVE) {
      if (!value.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sessionId is required for active resume',
        });
      }
      if (!value.step) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'step is required for active resume',
        });
      }
    }
    if (
      value.status === SESSION_RESUME_STATUS.FOUND ||
      value.status === SESSION_RESUME_STATUS.WAITING
    ) {
      if (!value.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sessionId is required for matched resume',
        });
      }
    }
  });
export type SessionResumeResponse = z.infer<typeof SessionResumeResponseSchema>;

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

export const SessionEndedEventSchema = z.object({
  sessionId: SessionIdSchema,
  reason: SessionEndReasonSchema,
});
export type SessionEndedEvent = z.infer<typeof SessionEndedEventSchema>;

export const SocketAuthSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type SocketAuth = z.infer<typeof SocketAuthSchema>;
