import { USER_ROLE, type SessionState, type UserRole } from '@romance/shared';

export type UserState = {
  deviceId: string;
  role?: UserRole;
  status?: SessionState;
  socketId?: string;
  sessionId?: string;
};

export type Session = {
  id: string;
  userIds: [string, string];
  state: SessionState;
  createdAt: string;
};

export type Store = {
  users: Map<string, UserState>;
  sessions: Map<string, Session>;
  queue: Record<UserRole, string[]>;
};

export const createStore = (): Store => ({
  users: new Map(),
  sessions: new Map(),
  queue: {
    [USER_ROLE.MALE]: [],
    [USER_ROLE.FEMALE]: [],
  },
});

export const ensureUser = (store: Store, deviceId: string): UserState => {
  const existing = store.users.get(deviceId);
  if (existing) return existing;
  const created: UserState = { deviceId };
  store.users.set(deviceId, created);
  return created;
};
