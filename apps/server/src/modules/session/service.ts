import { randomUUID } from 'crypto';
import { SESSION_STATE, type SessionState } from '@romance/shared';
import { ensureUser, type Session, type Store, type UserState } from '../../core/store';

export type SessionService = {
  createSession: (userIds: [string, string], state: SessionState) => Session;
  confirmStart: (deviceId: string, sessionId: string) => SessionStartResult;
};

export type SessionStartResult = {
  status: 'WAITING' | 'STARTED';
  startedNow: boolean;
  session: Session;
  users: [UserState, UserState];
};

export const createSessionService = (store: Store): SessionService => ({
  createSession: (userIds, state) => {
    const session: Session = {
      id: randomUUID(),
      userIds,
      state,
      createdAt: new Date().toISOString(),
      startedUserIds: [],
      lastVideoByRole: {},
    };
    store.sessions.set(session.id, session);
    return session;
  },
  confirmStart: (deviceId, sessionId) => {
    const session = store.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (!session.userIds.includes(deviceId)) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (
      session.state !== SESSION_STATE.PARTNER_FOUND &&
      session.state !== SESSION_STATE.WAITING_FOR_START &&
      session.state !== SESSION_STATE.ACTIVE
    ) {
      throw new Error('SESSION_NOT_READY');
    }

    if (!session.startedUserIds.includes(deviceId)) {
      session.startedUserIds.push(deviceId);
    }

    const [firstId, secondId] = session.userIds;
    const firstUser = ensureUser(store, firstId);
    const secondUser = ensureUser(store, secondId);

    if (session.state === SESSION_STATE.ACTIVE) {
      return {
        status: 'STARTED',
        startedNow: false,
        session,
        users: [firstUser, secondUser],
      };
    }

    if (session.startedUserIds.length >= 2) {
      session.state = SESSION_STATE.ACTIVE;
      firstUser.status = SESSION_STATE.ACTIVE;
      secondUser.status = SESSION_STATE.ACTIVE;
      return {
        status: 'STARTED',
        startedNow: true,
        session,
        users: [firstUser, secondUser],
      };
    }

    session.state = SESSION_STATE.WAITING_FOR_START;
    const currentUser = deviceId === firstId ? firstUser : secondUser;
    currentUser.status = SESSION_STATE.WAITING_FOR_START;
    return {
      status: 'WAITING',
      startedNow: false,
      session,
      users: [firstUser, secondUser],
    };
  },
});
