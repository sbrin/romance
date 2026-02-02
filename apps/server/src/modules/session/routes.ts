import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ANALYTICS_EVENT,
  SessionAnswerRequestSchema,
  SessionAnswerResponseSchema,
  SessionEndRequestSchema,
  SessionEndResponseSchema,
  SESSION_ANSWER_STATUS,
  SESSION_END_REASON,
  SESSION_END_STATUS,
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
  const finalizeSession = (
    request: FastifyRequest,
    sessionId: string,
    reason: (typeof SESSION_END_REASON)[keyof typeof SESSION_END_REASON]
  ) => {
    const session = deps.store.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.state = SESSION_STATE.FINISHED;
    session.currentStepId = undefined;
    session.turnDeviceId = undefined;
    session.lastVideoByRole = {};

    for (const memberId of session.userIds) {
      const member = ensureUser(deps.store, memberId);
      member.sessionId = undefined;
      member.status = SESSION_STATE.FINISHED;
      deps.socketHub.emitSessionEnded(member.deviceId, {
        sessionId: session.id,
        reason,
      });
      logEvent(request, ANALYTICS_EVENT.SESSION_END, {
        deviceId: member.deviceId,
        sessionId: session.id,
        reason,
      });
    }
  };

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
      const shouldPreload = user.deviceId !== session.turnDeviceId;
      const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
        sessionId: session.id,
        stepId,
        role: user.role,
        turnDeviceId: session.turnDeviceId,
        previousVideoUrl,
        shouldPreload,
        bubbleText: session.lastBubbleText ?? '',
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
            const shouldPreload = user.deviceId !== result.session.turnDeviceId;
            const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
              sessionId: result.session.id,
              stepId,
              role: user.role,
              turnDeviceId: result.session.turnDeviceId,
              previousVideoUrl,
              shouldPreload,
              bubbleText: '',
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

  fastify.post(
    '/session/step/answer',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SessionAnswerRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId, sessionId, choiceId } = parsed.data;
      const session = deps.store.sessions.get(sessionId);
      if (!session || !session.userIds.includes(deviceId)) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND');
      }

      if (session.state !== SESSION_STATE.ACTIVE) {
        return sendError(reply, 409, 'SESSION_NOT_ACTIVE');
      }

      if (session.turnDeviceId && session.turnDeviceId !== deviceId) {
        const response = SessionAnswerResponseSchema.parse({
          status: SESSION_ANSWER_STATUS.NOOP,
        });
        return reply.send(response);
      }

      const user = ensureUser(deps.store, deviceId);
      if (!user.role) {
        return sendError(reply, 409, 'ROLE_REQUIRED');
      }

      const currentStepId = session.currentStepId ?? deps.dialogService.rootStepId;
      if (!session.currentStepId) {
        session.currentStepId = currentStepId;
      }

      const choiceIndex = parseInt(choiceId, 10);
      if (isNaN(choiceIndex)) {
        return sendError(reply, 409, 'INVALID_CHOICE');
      }

      let resolved: { nextStepId: string; choiceText: string };
      try {
        resolved = deps.dialogService.resolveChoiceToNextStep(currentStepId, choiceIndex);
      } catch {
        return sendError(reply, 409, 'INVALID_CHOICE');
      }

      logEvent(request, ANALYTICS_EVENT.CHOICE_MADE, {
        deviceId,
        sessionId,
        stepId: currentStepId,
        choiceId,
      });

      const { nextStepId, choiceText } = resolved;
      const nextStep = deps.dialogService.getStep(nextStepId);
      const turnRole = mapActorToRole(nextStep.actor.name);
      const [firstId, secondId] = session.userIds;
      const firstUser = ensureUser(deps.store, firstId);
      const secondUser = ensureUser(deps.store, secondId);
      const turnUser = [firstUser, secondUser].find((member) => member.role === turnRole);
      if (!turnUser) {
        throw new Error('TURN_DEVICE_NOT_FOUND');
      }

      session.currentStepId = nextStepId;
      session.turnDeviceId = turnUser.deviceId;
      session.lastBubbleText = choiceText;

      for (const member of [firstUser, secondUser]) {
        if (!member.role) {
          throw new Error('ROLE_REQUIRED');
        }
        const previousVideoUrl = session.lastVideoByRole[member.role] ?? null;
        const shouldPreload = member.deviceId !== session.turnDeviceId;
        const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
          sessionId: session.id,
          stepId: nextStepId,
          role: member.role,
          turnDeviceId: session.turnDeviceId,
          previousVideoUrl,
          shouldPreload,
          bubbleText: choiceText,
        });
        session.lastVideoByRole[member.role] = videoUrl;
        deps.socketHub.emitSessionStep(member.deviceId, payload);
        logEvent(request, ANALYTICS_EVENT.STEP_SHOWN, {
          deviceId: member.deviceId,
          sessionId: session.id,
          stepId: nextStepId,
          turnDeviceId: session.turnDeviceId,
        });
      }

      if (nextStep.isTerminal) {
        finalizeSession(request, session.id, SESSION_END_REASON.COMPLETED);
      }

      const response = SessionAnswerResponseSchema.parse({
        status: SESSION_ANSWER_STATUS.OK,
      });
      return reply.send(response);
    }
  );

  fastify.post(
    '/session/end',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SessionEndRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId, sessionId } = parsed.data;
      const session = deps.store.sessions.get(sessionId);
      if (!session || !session.userIds.includes(deviceId)) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND');
      }

      if (session.state === SESSION_STATE.FINISHED) {
        const response = SessionEndResponseSchema.parse({
          status: SESSION_END_STATUS.NOOP,
        });
        return reply.send(response);
      }

      finalizeSession(request, session.id, SESSION_END_REASON.CANCELLED);

      const response = SessionEndResponseSchema.parse({
        status: SESSION_END_STATUS.OK,
      });
      return reply.send(response);
    }
  );
};
