import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  SessionEndedEventSchema,
  SESSION_ANSWER_STATUS,
  SESSION_END_REASON,
  SESSION_END_STATUS,
  SessionStepEventSchema,
  SESSION_RESUME_STATUS,
  SESSION_START_STATUS,
  USER_ROLE,
  QUEUE_JOIN_STATUS,
} from '@romance/shared';
import { createStore } from '../../core/store';
import type { SocketHub } from '../../core/socket';
import { registerSearchingRoutes } from '../searching';
import type { DialogService } from '../dialog';
import type { InternalNode } from '../dialog/service';
import { registerSessionRoutes } from './routes';
import { createSessionService } from './service';

const buildApp = () => {
  const fastify = Fastify({ logger: false });
  const store = createStore();
  const sessionService = createSessionService(store);
  const started: Array<{ deviceId: string; sessionId: string }> = [];
  const steps: Array<{ deviceId: string; payload: unknown }> = [];
  const ended: Array<{ deviceId: string; payload: unknown }> = [];
  const rootStep: InternalNode = {
    id: 'step-12345678',
    actor: { name: 'He' },
    choices: [{ text: 'Да', nextStepId: 'step-abcdef12' }],
    videoByRole: { male: 'm1', female: 'f1' },
    isTerminal: false,
  };
  const nextStep: InternalNode = {
    id: 'step-abcdef12',
    actor: { name: 'She' },
    choices: [],
    videoByRole: { male: 'm2', female: 'f2' },
    isTerminal: true,
  };
  const stepsById = new Map<string, InternalNode>([
    [rootStep.id, rootStep],
    [nextStep.id, nextStep],
  ]);
  const dialogService: DialogService = {
    rootStepId: rootStep.id,
    getStep: (stepId) => {
      const step = stepsById.get(stepId);
      if (!step) {
        throw new Error('STEP_NOT_FOUND');
      }
      return step;
    },
    createSessionStepEvent: ({
      sessionId,
      stepId,
      role,
      turnDeviceId,
      previousVideoUrl,
      bubbleText,
    }) => {
      const step = stepsById.get(stepId) ?? rootStep;
      const videoId =
        role === USER_ROLE.MALE ? step.videoByRole.male : step.videoByRole.female;
      const videoUrl = videoId ? `${videoId}.mp4` : previousVideoUrl ?? 'fallback.mp4';
      const payload = SessionStepEventSchema.parse({
        sessionId,
        stepId,
        actor: { name: step.actor.name },
        bubbleText: bubbleText ?? '',
        choices: step.choices.map((c, i) => ({ id: String(i), text: c.text })),
        videoUrl,
        turnDeviceId,
      });
      return { payload, videoUrl };
    },
    resolveChoiceToNextStep: (stepId, choiceIndex) => {
      const step = stepsById.get(stepId);
      if (!step) throw new Error('STEP_NOT_FOUND');
      if (choiceIndex < 0 || choiceIndex >= step.choices.length) {
        throw new Error('INVALID_CHOICE');
      }
      return {
        nextStepId: step.choices[choiceIndex].nextStepId,
        choiceText: step.choices[choiceIndex].text,
      };
    },
    computePreloadVideoUrls: () => [],
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
    emitSessionEnded: (deviceId, payload) => {
      ended.push({ deviceId, payload });
      return true;
    },
  };

  registerSearchingRoutes(fastify, { store, socketHub, sessionService });
  registerSessionRoutes(fastify, { store, socketHub, sessionService, dialogService });
  return { fastify, started, steps, ended };
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

test('POST /session/step/answer returns NOOP when not your turn', async () => {
  const { fastify, steps } = buildApp();
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

  const before = steps.length;
  const response = await fastify.inject({
    method: 'POST',
    url: '/session/step/answer',
    payload: { deviceId: 'device-f', sessionId, choiceId: '0' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_ANSWER_STATUS.NOOP);
  assert.equal(steps.length, before);
  await fastify.close();
});

test('POST /session/step/answer advances step and emits next step', async () => {
  const { fastify, steps, ended } = buildApp();
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
    url: '/session/step/answer',
    payload: { deviceId: 'device-m', sessionId, choiceId: '0' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_ANSWER_STATUS.OK);
  assert.equal(steps.length, 4);
  const payloads = steps.slice(-2).map((item) => item.payload);
  assert.ok(payloads.every((payload) => SessionStepEventSchema.safeParse(payload).success));
  assert.equal((payloads[0] as { stepId: string }).stepId, 'step-abcdef12');
  assert.equal(ended.length, 2);
  assert.ok(
    ended.every((item) => SessionEndedEventSchema.safeParse(item.payload).success)
  );
  await fastify.close();
});

test('POST /session/step/answer returns 409 for invalid choice', async () => {
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
    url: '/session/step/answer',
    payload: { deviceId: 'device-m', sessionId, choiceId: '99' },
  });

  assert.equal(response.statusCode, 409);
  await fastify.close();
});

test('POST /session/end ends session and returns OK', async () => {
  const { fastify, ended } = buildApp();
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
    url: '/session/end',
    payload: { deviceId: 'device-m', sessionId },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_END_STATUS.OK);
  assert.equal(ended.length, 2);
  assert.ok(
    ended.every((item) => {
      const parsed = SessionEndedEventSchema.safeParse(item.payload);
      return parsed.success && parsed.data.reason === SESSION_END_REASON.CANCELLED;
    })
  );
  await fastify.close();
});

test('POST /session/end returns NOOP for finished session', async () => {
  const { fastify, ended } = buildApp();
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
  await fastify.inject({
    method: 'POST',
    url: '/session/end',
    payload: { deviceId: 'device-m', sessionId },
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/session/end',
    payload: { deviceId: 'device-m', sessionId },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, SESSION_END_STATUS.NOOP);
  assert.equal(ended.length, 2);
  await fastify.close();
});
