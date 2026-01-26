import { z } from 'zod';

export const UserRoleSchema = z.enum(['MALE', 'FEMALE']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const SessionStateSchema = z.enum([
  'WAITING_FOR_PARTNER',
  'MATCHED',
  'WAITING_FOR_START',
  'ACTIVE',
  'FINISHED'
]);
export type SessionState = z.infer<typeof SessionStateSchema>;
