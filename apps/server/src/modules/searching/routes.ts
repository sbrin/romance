import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ANALYTICS_EVENT,
  QueueCancelRequestSchema,
  QueueCancelResponseSchema,
  QueueJoinRequestSchema,
  QueueJoinResponseSchema,
  QUEUE_CANCEL_STATUS,
  QUEUE_JOIN_STATUS,
  RoleSelectRequestSchema,
  ROLE_SELECT_STATUS,
  type AnalyticsEvent,
} from '@romance/shared';
import type { Store } from '../../core/store';
import type { SocketHub } from '../../core/socket';
import type { SessionService } from '../session/service';
import { ensureUser } from '../../core/store';
import { cancelSearch, joinQueueAndSearch } from './service';

type Dependencies = {
  store: Store;
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

export const registerSearchingRoutes = (
  fastify: FastifyInstance,
  deps: Dependencies
) => {
  fastify.post(
    '/role',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = RoleSelectRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId, role } = parsed.data;
      const user = ensureUser(deps.store, deviceId);

      if (user.role && user.role !== role) {
        const result = cancelSearch(deps.store, deviceId);
        if (result.partnerId && result.sessionId) {
          deps.socketHub.emitPartnerCancelled(result.partnerId, {
            sessionId: result.sessionId,
          });
        }
      }

      user.role = role;

      logEvent(request, ANALYTICS_EVENT.SELECTED_GENDER, { deviceId, role });

      return reply.send({ status: ROLE_SELECT_STATUS.OK });
    }
  );

  fastify.post(
    '/queue/join',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = QueueJoinRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId } = parsed.data;
      try {
        const result = joinQueueAndSearch(
          deps.store,
          deviceId,
          deps.sessionService
        );

        if (result.status === QUEUE_JOIN_STATUS.PARTNER_FOUND) {
          const payload = { sessionId: result.session.id };
          deps.socketHub.emitPartnerFound(result.users[0].deviceId, payload);
          deps.socketHub.emitPartnerFound(result.users[1].deviceId, payload);

          logEvent(request, ANALYTICS_EVENT.PARTNER_FOUND, {
            deviceId: result.users[0].deviceId,
            sessionId: result.session.id,
          });
          logEvent(request, ANALYTICS_EVENT.PARTNER_FOUND, {
            deviceId: result.users[1].deviceId,
            sessionId: result.session.id,
          });
        } else {
          logEvent(request, ANALYTICS_EVENT.QUEUED, { deviceId });
        }

        const response = QueueJoinResponseSchema.parse({
          status: result.status,
          sessionId:
            result.status === QUEUE_JOIN_STATUS.PARTNER_FOUND
              ? result.session.id
              : undefined,
        });

        return reply.send(response);
      } catch (error) {
        if (error instanceof Error && error.message === 'ROLE_REQUIRED') {
          return sendError(reply, 409, 'ROLE_REQUIRED');
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/queue/cancel',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = QueueCancelRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'INVALID_BODY');
      }

      const { deviceId } = parsed.data;
      const user = ensureUser(deps.store, deviceId);
      const previousSessionId = user.sessionId ?? null;
      const previousStatus = user.status ?? null;
      const result = cancelSearch(deps.store, deviceId);

      if (result.partnerId && result.sessionId) {
        deps.socketHub.emitPartnerCancelled(result.partnerId, {
          sessionId: result.sessionId,
        });
      }

      logEvent(request, ANALYTICS_EVENT.DISCONNECT, {
        deviceId,
        sessionId: result.sessionId ?? previousSessionId,
        status: previousStatus,
      });

      const response = QueueCancelResponseSchema.parse({
        status: QUEUE_CANCEL_STATUS.OK,
      });
      return reply.send(response);
    }
  );
};
