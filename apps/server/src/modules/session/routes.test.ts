import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  SESSION_START_STATUS,
  USER_ROLE,
  QUEUE_JOIN_STATUS,
} from '@romance/shared';
import { createStore } from '../../core/store';
import type { SocketHub } from '../../core/socket';
import { registerSearchingRoutes } from '../searching';
import { registerSessionRoutes } from './routes';
import { createSessionService } from './service';

const buildApp = () => {
  const fastify = Fastify({ logger: false });
  const store = createStore();
  const sessionService = createSessionService(store);
  const started: Array<{ deviceId: string; sessionId: string }> = [];
  const socketHub: SocketHub = {
    emitPartnerFound: () => true,
    emitPartnerCancelled: () => true,
    emitSessionStarted: (deviceId, payload) => {
      started.push({ deviceId, sessionId: payload.sessionId });
      return true;
    },
  };

  registerSearchingRoutes(fastify, { store, socketHub, sessionService });
  registerSessionRoutes(fastify, { socketHub, sessionService });
  return { fastify, started };
};

const createMatch = async (fastify: FastifyInstance) => {
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
  return body.sessionId as string;
};

test('POST /session/start validates body', async () => {
  const { fastify } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-a' },
  });

  assert.equal(response.statusCode, 400);
  await fastify.close();
});

test('POST /session/start returns 404 for unknown session', async () => {
  const { fastify } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-a', sessionId: 'session-missing' },
  });

  assert.equal(response.statusCode, 404);
  await fastify.close();
});

test('POST /session/start returns waiting until both confirm', async () => {
  const { fastify, started } = buildApp();
  const sessionId = await createMatch(fastify);

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-m', sessionId },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_START_STATUS.WAITING);
  assert.equal(started.length, 0);
  await fastify.close();
});

test('POST /session/start emits session_started when both confirm', async () => {
  const { fastify, started } = buildApp();
  const sessionId = await createMatch(fastify);

  await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-m', sessionId },
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-f', sessionId },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_START_STATUS.STARTED);
  assert.equal(started.length, 2);
  assert.ok(started.find((item) => item.deviceId === 'device-m'));
  assert.ok(started.find((item) => item.deviceId === 'device-f'));
  await fastify.close();
});
