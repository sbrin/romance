import { randomUUID } from 'crypto';
import type { SessionState } from '@romance/shared';
import type { Session, Store } from '../../core/store';

export type SessionService = {
  createSession: (userIds: [string, string], state: SessionState) => Session;
};

export const createSessionService = (store: Store): SessionService => ({
  createSession: (userIds, state) => {
    const session: Session = {
      id: randomUUID(),
      userIds,
      state,
      createdAt: new Date().toISOString(),
    };
    store.sessions.set(session.id, session);
    return session;
  },
});
