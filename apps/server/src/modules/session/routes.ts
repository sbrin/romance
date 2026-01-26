import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ANALYTICS_EVENT,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SESSION_START_STATUS,
  type AnalyticsEvent,
} from '@romance/shared';
import type { SocketHub } from '../../core/socket';
import type { SessionService } from './service';

type Dependencies = {
  socketHub: SocketHub;
  sessionService: SessionService;
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

export const registerSessionRoutes = (
  fastify: FastifyInstance,
  deps: Dependencies
) => {
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
