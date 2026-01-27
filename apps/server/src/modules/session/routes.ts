import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ANALYTICS_EVENT,
  SessionResumeRequestSchema,
  SessionResumeResponseSchema,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SESSION_RESUME_STATUS,
  SESSION_STATE,
  SESSION_START_STATUS,
  USER_ROLE,
  type AnalyticsEvent,
  type ScenarioActorName,
  type UserRole,
} from '@romance/shared';
import type { SocketHub } from '../../core/socket';
import { ensureUser, type Store } from '../../core/store';
import type { DialogService } from '../dialog';
import type { SessionService } from './service';

type Dependencies = {
  store: Store;
  socketHub: SocketHub;
  sessionService: SessionService;
  dialogService: DialogService;
};

const sendError = (reply: FastifyReply, status: number, code: string) => {
  return reply.status(status).send({ error: code });
};

const logEvent = (
  request: FastifyRequest,
  event: AnalyticsEvent,
  payload: Record<string, unknown>
) => {
  request.log.info({ event, ts: new Date().toISOString(), ...payload }, 'analytics');
};

const mapActorToRole = (name: ScenarioActorName): UserRole =>
  name === 'He' ? USER_ROLE.MALE : USER_ROLE.FEMALE;

export const registerSessionRoutes = (
  fastify: FastifyInstance,
  deps: Dependencies
) => {
  fastify.post(
    '/session/resume',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SessionResumeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId } = parsed.data;
      const user = ensureUser(deps.store, deviceId);
      const sessionId = user.sessionId;
      if (!sessionId) {
        if (user.status === SESSION_STATE.WAITING_FOR_PARTNER) {
          if (!user.role) {
            return sendError(reply, 409, 'ROLE_REQUIRED');
          }
          return reply.send(
            SessionResumeResponseSchema.parse({
              status: SESSION_RESUME_STATUS.QUEUED,
            })
          );
        }
        return reply.send(
          SessionResumeResponseSchema.parse({
            status: SESSION_RESUME_STATUS.NONE,
          })
        );
      }

      const session = deps.store.sessions.get(sessionId);
      if (!session || !session.userIds.includes(deviceId)) {
        return reply.send(
          SessionResumeResponseSchema.parse({
            status: SESSION_RESUME_STATUS.NONE,
          })
        );
      }

      if (
        session.state !== SESSION_STATE.ACTIVE &&
        session.state !== SESSION_STATE.PARTNER_FOUND &&
        session.state !== SESSION_STATE.WAITING_FOR_START
      ) {
        return reply.send(
          SessionResumeResponseSchema.parse({
            status: SESSION_RESUME_STATUS.NONE,
          })
        );
      }

      if (!user.role) {
        return sendError(reply, 409, 'ROLE_REQUIRED');
      }

      if (session.state === SESSION_STATE.PARTNER_FOUND) {
        return reply.send(
          SessionResumeResponseSchema.parse({
            status: SESSION_RESUME_STATUS.FOUND,
            sessionId: session.id,
          })
        );
      }

      if (session.state === SESSION_STATE.WAITING_FOR_START) {
        const isWaiting = session.startedUserIds.includes(deviceId);
        return reply.send(
          SessionResumeResponseSchema.parse({
            status: isWaiting ? SESSION_RESUME_STATUS.WAITING : SESSION_RESUME_STATUS.FOUND,
            sessionId: session.id,
          })
        );
      }

      const stepId = session.currentStepId ?? deps.dialogService.rootStepId;
      if (!session.currentStepId) {
        session.currentStepId = stepId;
      }

      const step = deps.dialogService.getStep(stepId);
      const turnRole = mapActorToRole(step.actor.name);
      const [firstId, secondId] = session.userIds;
      const firstUser = ensureUser(deps.store, firstId);
      const secondUser = ensureUser(deps.store, secondId);
      const turnUser = [firstUser, secondUser].find((member) => member.role === turnRole);
      if (!turnUser) {
        throw new Error('TURN_DEVICE_NOT_FOUND');
      }

      session.turnDeviceId = turnUser.deviceId;
      user.status = SESSION_STATE.ACTIVE;

      const previousVideoUrl = session.lastVideoByRole[user.role] ?? null;
      const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
        sessionId: session.id,
        stepId,
        role: user.role,
        turnDeviceId: session.turnDeviceId,
        previousVideoUrl,
      });
      session.lastVideoByRole[user.role] = videoUrl;

      logEvent(request, ANALYTICS_EVENT.STEP_SHOWN, {
        deviceId: user.deviceId,
        sessionId: session.id,
        stepId,
        turnDeviceId: session.turnDeviceId,
      });

      const response = SessionResumeResponseSchema.parse({
        status: SESSION_RESUME_STATUS.ACTIVE,
        sessionId: session.id,
        step: payload,
      });
      return reply.send(response);
    }
  );

  fastify.post(
    '/session/start',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SessionStartRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId, sessionId } = parsed.data;
      logEvent(request, ANALYTICS_EVENT.START_PRESSED, { deviceId, sessionId });

      try {
        const result = deps.sessionService.confirmStart(deviceId, sessionId);

        if (result.status === 'STARTED' && result.startedNow) {
          const payload = { sessionId: result.session.id };
          deps.socketHub.emitSessionStarted(result.users[0].deviceId, payload);
          deps.socketHub.emitSessionStarted(result.users[1].deviceId, payload);

          logEvent(request, ANALYTICS_EVENT.SESSION_STARTED, {
            deviceId: result.users[0].deviceId,
            sessionId: result.session.id,
          });
          logEvent(request, ANALYTICS_EVENT.SESSION_STARTED, {
            deviceId: result.users[1].deviceId,
            sessionId: result.session.id,
          });
        }

        if (result.status === 'STARTED') {
          const stepId = result.session.currentStepId ?? deps.dialogService.rootStepId;
          if (!result.session.currentStepId) {
            result.session.currentStepId = stepId;
          }

          const step = deps.dialogService.getStep(stepId);
          const turnRole = mapActorToRole(step.actor.name);
          const turnUser = result.users.find((user) => user.role === turnRole);
          if (!turnUser) {
            throw new Error('TURN_DEVICE_NOT_FOUND');
          }
          result.session.turnDeviceId = turnUser.deviceId;

          for (const user of result.users) {
            if (!user.role) {
              throw new Error('ROLE_REQUIRED');
            }
            const previousVideoUrl = result.session.lastVideoByRole[user.role] ?? null;
            const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
              sessionId: result.session.id,
              stepId,
              role: user.role,
              turnDeviceId: result.session.turnDeviceId,
              previousVideoUrl,
            });
            result.session.lastVideoByRole[user.role] = videoUrl;
            deps.socketHub.emitSessionStep(user.deviceId, payload);
            logEvent(request, ANALYTICS_EVENT.STEP_SHOWN, {
              deviceId: user.deviceId,
              sessionId: result.session.id,
              stepId,
              turnDeviceId: result.session.turnDeviceId,
            });
          }
        }

        const response = SessionStartResponseSchema.parse({
          status:
            result.status === 'STARTED'
              ? SESSION_START_STATUS.STARTED
              : SESSION_START_STATUS.WAITING,
        });
        return reply.send(response);
      } catch (error) {
        if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
          return sendError(reply, 404, 'SESSION_NOT_FOUND');
        }
        if (error instanceof Error && error.message === 'SESSION_NOT_READY') {
          return sendError(reply, 409, 'SESSION_NOT_READY');
        }
        throw error;
      }
    }
  );
};
