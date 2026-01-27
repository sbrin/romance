import test from 'node:test'
import assert from 'node:assert/strict'
import { USER_ROLE } from '@romance/shared'
import { syncRoleSelection } from './roleSync'
import { postJson } from './http'

type PostJson = typeof postJson

test('syncRoleSelection returns true when role is posted', async () => {
  let called = false
  const post: PostJson = async (url, body, schema) => {
    called = true
    assert.equal(url, '/role')
    assert.deepEqual(body, {
      deviceId: 'device-12345678',
      role: USER_ROLE.MALE,
    })
    return schema.parse({ status: 'OK' })
  }

  const result = await syncRoleSelection('device-12345678', USER_ROLE.MALE, post)

  assert.equal(result, true)
  assert.equal(called, true)
})

test('syncRoleSelection returns false on invalid device id', async () => {
  let called = false
  const post: PostJson = async (url, body, schema) => {
    called = true
    return schema.parse({ status: 'OK' })
  }

  const result = await syncRoleSelection('bad', USER_ROLE.FEMALE, post)

  assert.equal(result, false)
  assert.equal(called, false)
})

test('syncRoleSelection returns false when post fails', async () => {
  const post: PostJson = async () => {
    throw new Error('fail')
  }

  const result = await syncRoleSelection('device-12345678', USER_ROLE.MALE, post)

  assert.equal(result, false)
})
