import {
  QUEUE_JOIN_STATUS,
  SESSION_STATE,
  USER_ROLE,
  type UserRole,
} from '@romance/shared';
import { ensureUser, type Store, type UserState, type Session } from '../../core/store';
import type { SessionService } from '../session/service';

const oppositeRole = (role: UserRole): UserRole =>
  role === USER_ROLE.MALE ? USER_ROLE.FEMALE : USER_ROLE.MALE;

const removeFromQueue = (queue: string[], deviceId: string) => {
  const index = queue.indexOf(deviceId);
  if (index >= 0) queue.splice(index, 1);
};

export type SearchResult =
  | { status: typeof QUEUE_JOIN_STATUS.QUEUED }
  | {
      status: typeof QUEUE_JOIN_STATUS.PARTNER_FOUND;
      session: Session;
      users: [UserState, UserState];
    };

export type CancelResult = {
  status: 'CANCELLED';
  partnerId?: string;
  sessionId?: string;
};

export const joinQueueAndSearch = (
  store: Store,
  deviceId: string,
  sessionService: SessionService
): SearchResult => {
  const user = ensureUser(store, deviceId);
  if (!user.role) {
    throw new Error('ROLE_REQUIRED');
  }

  if (user.sessionId) {
    const existing = store.sessions.get(user.sessionId);
    if (existing) {
      const userA = ensureUser(store, existing.userIds[0]);
      const userB = ensureUser(store, existing.userIds[1]);
      return {
        status: QUEUE_JOIN_STATUS.PARTNER_FOUND,
        session: existing,
        users: [userA, userB],
      };
    }
  }

  const ownQueue = store.queue[user.role];
  if (!ownQueue.includes(deviceId)) {
    ownQueue.push(deviceId);
  }

  user.status = SESSION_STATE.WAITING_FOR_PARTNER;

  const partnerQueue = store.queue[oppositeRole(user.role)];
  if (partnerQueue.length === 0) {
    return { status: QUEUE_JOIN_STATUS.QUEUED };
  }

  const partnerId = partnerQueue.shift();
  if (!partnerId) {
    return { status: QUEUE_JOIN_STATUS.QUEUED };
  }

  removeFromQueue(ownQueue, deviceId);

  const session = sessionService.createSession(
    [deviceId, partnerId],
    SESSION_STATE.PARTNER_FOUND
  );

  const userA = ensureUser(store, deviceId);
  const userB = ensureUser(store, partnerId);
  userA.sessionId = session.id;
  userB.sessionId = session.id;
  userA.status = SESSION_STATE.PARTNER_FOUND;
  userB.status = SESSION_STATE.PARTNER_FOUND;

  return { status: QUEUE_JOIN_STATUS.PARTNER_FOUND, session, users: [userA, userB] };
};

export const cancelSearch = (store: Store, deviceId: string): CancelResult => {
  const user = ensureUser(store, deviceId);

  if (user.role) {
    removeFromQueue(store.queue[user.role], deviceId);
  }

  let partnerId: string | undefined;
  let sessionId: string | undefined;

  if (user.sessionId) {
    const session = store.sessions.get(user.sessionId);
    if (
      session &&
      (session.state === SESSION_STATE.PARTNER_FOUND ||
        session.state === SESSION_STATE.WAITING_FOR_START)
    ) {
      const [first, second] = session.userIds;
      if (first === deviceId || second === deviceId) {
        sessionId = session.id;
        partnerId = first === deviceId ? second : first;
        for (const memberId of session.userIds) {
          const member = ensureUser(store, memberId);
          member.sessionId = undefined;
          member.status = undefined;
        }
        store.sessions.delete(session.id);
      }
    }

    user.sessionId = undefined;
  }

  user.status = undefined;

  return { status: 'CANCELLED', partnerId, sessionId };
};
