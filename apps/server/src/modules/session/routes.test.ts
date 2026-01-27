import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  SessionStepEventSchema,
  SESSION_RESUME_STATUS,
  SESSION_START_STATUS,
  USER_ROLE,
  QUEUE_JOIN_STATUS,
  ScenarioNodeSchema,
} from '@romance/shared';
import { createStore } from '../../core/store';
import type { SocketHub } from '../../core/socket';
import { registerSearchingRoutes } from '../searching';
import type { DialogService } from '../dialog';
import { registerSessionRoutes } from './routes';
import { createSessionService } from './service';

const buildApp = () => {
  const fastify = Fastify({ logger: false });
  const store = createStore();
  const sessionService = createSessionService(store);
  const started: Array<{ deviceId: string; sessionId: string }> = [];
  const steps: Array<{ deviceId: string; payload: unknown }> = [];
  const rootStep = ScenarioNodeSchema.parse({
    id: 'step-12345678',
    actor: { name: 'He' },
    text: 'Привет',
    prev: [],
    choices: { 'step-abcdef12': 'Да' },
    videoByRole: { male: 'm1', female: 'f1' },
  });
  const dialogService: DialogService = {
    rootStepId: rootStep.id,
    getStep: () => rootStep,
    createSessionStepEvent: ({
      sessionId,
      stepId,
      role,
      turnDeviceId,
      previousVideoUrl,
    }) => {
      const videoUrl =
        role === USER_ROLE.MALE ? 'm1.mp4' : previousVideoUrl ?? 'f1.mp4';
      const payload = SessionStepEventSchema.parse({
        sessionId,
        stepId,
        actor: { name: rootStep.actor.name },
        bubbleText: rootStep.text,
        choices: [{ id: 'step-abcdef12', text: 'Да' }],
        videoUrl,
        turnDeviceId,
      });
      return { payload, videoUrl };
    },
  };
  const socketHub: SocketHub = {
    emitPartnerFound: () => true,
    emitPartnerCancelled: () => true,
    emitSessionStarted: (deviceId, payload) => {
      started.push({ deviceId, sessionId: payload.sessionId });
      return true;
    },
    emitSessionStep: (deviceId, payload) => {
      steps.push({ deviceId, payload });
      return true;
    },
  };

  registerSearchingRoutes(fastify, { store, socketHub, sessionService });
  registerSessionRoutes(fastify, { store, socketHub, sessionService, dialogService });
  return { fastify, started, steps };
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
  const { fastify, started, steps } = buildApp();
  const sessionId = await createMatch(fastify);

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-m', sessionId },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_START_STATUS.WAITING);
  assert.equal(started.length, 0);
  assert.equal(steps.length, 0);
  await fastify.close();
});

test('POST /session/start emits session_started when both confirm', async () => {
  const { fastify, started, steps } = buildApp();
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
  assert.equal(steps.length, 2);
  assert.ok(started.find((item) => item.deviceId === 'device-m'));
  assert.ok(started.find((item) => item.deviceId === 'device-f'));
  assert.ok(steps.find((item) => item.deviceId === 'device-m'));
  assert.ok(steps.find((item) => item.deviceId === 'device-f'));
  await fastify.close();
});

test('POST /session/resume returns none when no active session', async () => {
  const { fastify } = buildApp();
  const response = await fastify.inject({
    method: 'POST',
    url: '/session/resume',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_RESUME_STATUS.NONE);
  await fastify.close();
});

test('POST /session/resume returns queued when user is waiting for partner', async () => {
  const { fastify } = buildApp();

  await fastify.inject({
    method: 'POST',
    url: '/role',
    payload: { deviceId: 'device-m', role: USER_ROLE.MALE },
  });

  const queued = await fastify.inject({
    method: 'POST',
    url: '/queue/join',
    payload: { deviceId: 'device-m' },
  });
  assert.equal(queued.json().status, QUEUE_JOIN_STATUS.QUEUED);

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/resume',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_RESUME_STATUS.QUEUED);
  await fastify.close();
});

test('POST /session/resume returns active step for active session', async () => {
  const { fastify } = buildApp();
  const sessionId = await createMatch(fastify);

  await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-m', sessionId },
  });
  await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-f', sessionId },
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/resume',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, SESSION_RESUME_STATUS.ACTIVE);
  assert.equal(body.sessionId, sessionId);
  assert.ok(SessionStepEventSchema.safeParse(body.step).success);
  await fastify.close();
});

test('POST /session/resume returns found when partner found and not started', async () => {
  const { fastify } = buildApp();
  const sessionId = await createMatch(fastify);

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/resume',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, SESSION_RESUME_STATUS.FOUND);
  assert.equal(body.sessionId, sessionId);
  await fastify.close();
});

test('POST /session/resume returns waiting for user that already started', async () => {
  const { fastify } = buildApp();
  const sessionId = await createMatch(fastify);

  await fastify.inject({
    method: 'POST',
    url: '/session/start',
    payload: { deviceId: 'device-m', sessionId },
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/resume',
    payload: { deviceId: 'device-m' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, SESSION_RESUME_STATUS.WAITING);
  assert.equal(body.sessionId, sessionId);
  await fastify.close();
});
