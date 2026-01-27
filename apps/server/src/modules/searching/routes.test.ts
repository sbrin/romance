import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { QUEUE_JOIN_STATUS, USER_ROLE } from '@romance/shared';
import { createStore } from '../../core/store';
import { registerSearchingRoutes } from './routes';
import { createSessionService } from '../session/service';
import type { SocketHub } from '../../core/socket';

const buildApp = () => {
  const fastify = Fastify({ logger: false });
  const store = createStore();
  const sessionService = createSessionService(store);
  const emitted: Array<{ deviceId: string; sessionId: string }> = [];
  const cancelled: Array<{ deviceId: string; sessionId: string }> = [];
  const socketHub: SocketHub = {
    emitPartnerFound: (deviceId, payload) => {
      emitted.push({ deviceId, sessionId: payload.sessionId });
      return true;
    },
    emitPartnerCancelled: (deviceId, payload) => {
      cancelled.push({ deviceId, sessionId: payload.sessionId });
      return true;
    },
    emitSessionStarted: (deviceId, payload) => {
      void deviceId;
      void payload;
      return true;
    },
    emitSessionStep: (deviceId, payload) => {
      void deviceId;
      void payload;
      return true;
    },
  };

  registerSearchingRoutes(fastify, { store, socketHub, sessionService });
  return { fastify, store, emitted, cancelled };
};

test('POST /role validates body', async () => {
  const { fastify } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { role: USER_ROLE.MALE },
  });

  assert.equal(response.statusCode, 400);
  await fastify.close();
});

test('POST /role stores user role', async () => {
  const { fastify, store } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-a', role: USER_ROLE.FEMALE },
  });

  assert.equal(response.statusCode, 200);
  const user = store.users.get('device-a');
  assert.equal(user?.role, USER_ROLE.FEMALE);
  await fastify.close();
});

test('POST /queue/join requires role', async () => {
  const { fastify } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-a' },
  });

  assert.equal(response.statusCode, 409);
  await fastify.close();
});

test('POST /queue/join returns queued when no partner', async () => {
  const { fastify } = buildApp();
  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-m', role: USER_ROLE.MALE },
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, QUEUE_JOIN_STATUS.QUEUED);
  await fastify.close();
});

test('POST /queue/join searches and emits event', async () => {
  const { fastify, emitted } = buildApp();
  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-m', role: USER_ROLE.MALE },
  });
  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-f', role: USER_ROLE.FEMALE },
  });

  const first = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-m' },
  });
  assert.equal(first.json().status, QUEUE_JOIN_STATUS.QUEUED);

  const second = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-f' },
  });

  const body = second.json();
  assert.equal(body.status, QUEUE_JOIN_STATUS.PARTNER_FOUND);
  assert.ok(body.sessionId);
  assert.equal(emitted.length, 2);
  await fastify.close();
});

test('POST /queue/cancel emits partner_cancelled after match', async () => {
  const { fastify, cancelled } = buildApp();
  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-m', role: USER_ROLE.MALE },
  });
  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-f', role: USER_ROLE.FEMALE },
  });

  const first = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-m' },
  });
  assert.equal(first.json().status, QUEUE_JOIN_STATUS.QUEUED);

  const second = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-f' },
  });
  const body = second.json();
  assert.equal(body.status, QUEUE_JOIN_STATUS.PARTNER_FOUND);
  assert.ok(body.sessionId);

  const cancelResponse = await fastify.inject({
    method: 'POST',
    url: '/queue/cancel',
    payload: { deviceId: 'device-m' },
  });
  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].deviceId, 'device-f');
  assert.equal(cancelled[0].sessionId, body.sessionId);
  await fastify.close();
});
