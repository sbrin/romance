import { RoleSelectRequestSchema, RoleSelectResponseSchema, type UserRole } from '@romance/shared'
import { postJson } from './http'

type PostJson = typeof postJson

export const syncRoleSelection = async (
  deviceId: string,
  role: UserRole,
  post: PostJson = postJson
): Promise<boolean> => {
  try {
    const request = RoleSelectRequestSchema.parse({ deviceId, role })
    await post('/role', request, RoleSelectResponseSchema)
    return true
  } catch {
    return false
  }
}
