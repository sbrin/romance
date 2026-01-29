import type { Server } from 'socket.io';
import {
  PartnerCancelledEventSchema,
  PartnerFoundEventSchema,
  SessionEndedEventSchema,
  SessionStepEventSchema,
  SessionStartedEventSchema,
  SocketAuthSchema,
  SOCKET_EVENT,
} from '@romance/shared';
import { ensureUser, type Store } from './store';
import { cancelSearch } from '../modules/searching/service';

export type SocketHub = {
  emitPartnerFound: (deviceId: string, payload: { sessionId: string }) => boolean;
  emitPartnerCancelled: (deviceId: string, payload: { sessionId: string }) => boolean;
  emitSessionStarted: (deviceId: string, payload: { sessionId: string }) => boolean;
  emitSessionStep: (deviceId: string, payload: unknown) => boolean;
  emitSessionEnded: (deviceId: string, payload: unknown) => boolean;
};

export type SocketLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
};

export const createSocketHub = (io: Server, store: Store, logger: SocketLogger): SocketHub => {
  const hub: SocketHub = {
    emitPartnerFound: (deviceId, payload) => {
      const parsed = PartnerFoundEventSchema.safeParse(payload);
      if (!parsed.success) return false;
      const user = store.users.get(deviceId);
      if (!user?.socketId) return false;
      io.to(user.socketId).emit(SOCKET_EVENT.PARTNER_FOUND, parsed.data);
      return true;
    },
    emitPartnerCancelled: (deviceId, payload) => {
      const parsed = PartnerCancelledEventSchema.safeParse(payload);
      if (!parsed.success) return false;
      const user = store.users.get(deviceId);
      if (!user?.socketId) return false;
      io.to(user.socketId).emit(SOCKET_EVENT.PARTNER_CANCELLED, parsed.data);
      return true;
    },
    emitSessionStarted: (deviceId, payload) => {
      const parsed = SessionStartedEventSchema.safeParse(payload);
      if (!parsed.success) return false;
      const user = store.users.get(deviceId);
      if (!user?.socketId) return false;
      io.to(user.socketId).emit(SOCKET_EVENT.SESSION_STARTED, parsed.data);
      return true;
    },
    emitSessionStep: (deviceId, payload) => {
      const parsed = SessionStepEventSchema.safeParse(payload);
      if (!parsed.success) return false;
      const user = store.users.get(deviceId);
      if (!user?.socketId) return false;
      io.to(user.socketId).emit(SOCKET_EVENT.SESSION_STEP, parsed.data);
      return true;
    },
    emitSessionEnded: (deviceId, payload) => {
      const parsed = SessionEndedEventSchema.safeParse(payload);
      if (!parsed.success) return false;
      const user = store.users.get(deviceId);
      if (!user?.socketId) return false;
      io.to(user.socketId).emit(SOCKET_EVENT.SESSION_ENDED, parsed.data);
      return true;
    },
  };

  io.on('connection', (socket) => {
    const auth = SocketAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      socket.emit('error', 'INVALID_AUTH');
      socket.disconnect(true);
      return;
    }

    const { deviceId } = auth.data;
    const user = ensureUser(store, deviceId);
    user.socketId = socket.id;

    socket.on('disconnect', () => {
      const current = store.users.get(deviceId);
      if (current?.socketId !== socket.id) {
        return;
      }

      current.socketId = undefined;

      const result = cancelSearch(store, deviceId);

      if (result.partnerId || result.sessionId) {
        logger.info(
          {
            event: 'socket_disconnect_cleanup',
            deviceId,
            sessionId: result.sessionId,
            partnerId: result.partnerId,
          },
          'User disconnected, cleaned up queue/session'
        );
      }

      if (result.partnerId && result.sessionId) {
        hub.emitPartnerCancelled(result.partnerId, {
          sessionId: result.sessionId,
        });
      }
    });
  });

  return hub;
};
