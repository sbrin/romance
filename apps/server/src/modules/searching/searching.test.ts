import test from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE_JOIN_STATUS, SESSION_STATE, USER_ROLE } from '@romance/shared';
import { createStore, ensureUser } from '../../core/store';
import { createSessionService } from '../session/service';
import { cancelSearch, joinQueueAndSearch } from './service';

test('joinQueueAndSearch requires role', () => {
  const store = createStore();
  const sessionService = createSessionService(store);

  assert.throws(
    () => joinQueueAndSearch(store, 'device-a', sessionService),
    /ROLE_REQUIRED/
  );
});

test('joinQueueAndSearch queues when no partner', () => {
  const store = createStore();
  const sessionService = createSessionService(store);
  const user = ensureUser(store, 'device-a');
  user.role = USER_ROLE.MALE;

  const result = joinQueueAndSearch(store, 'device-a', sessionService);

  assert.equal(result.status, QUEUE_JOIN_STATUS.QUEUED);
  assert.equal(store.queue.MALE.length, 1);
  assert.equal(store.queue.FEMALE.length, 0);
});

test('joinQueueAndSearch searches when partner exists', () => {
  const store = createStore();
  const sessionService = createSessionService(store);
  const male = ensureUser(store, 'device-m');
  male.role = USER_ROLE.MALE;
  const female = ensureUser(store, 'device-f');
  female.role = USER_ROLE.FEMALE;

  const first = joinQueueAndSearch(store, 'device-m', sessionService);
  assert.equal(first.status, QUEUE_JOIN_STATUS.QUEUED);

  const second = joinQueueAndSearch(store, 'device-f', sessionService);
  assert.equal(second.status, QUEUE_JOIN_STATUS.PARTNER_FOUND);
  assert.ok(second.session.id);
  assert.equal(second.session.state, SESSION_STATE.PARTNER_FOUND);
  assert.equal(store.queue.MALE.length, 0);
  assert.equal(store.queue.FEMALE.length, 0);
  assert.equal(male.sessionId, second.session.id);
  assert.equal(female.sessionId, second.session.id);
  assert.equal(male.status, SESSION_STATE.PARTNER_FOUND);
  assert.equal(female.status, SESSION_STATE.PARTNER_FOUND);
});

test('cancelSearch clears partner_found session and removes users', () => {
  const store = createStore();
  const sessionService = createSessionService(store);
  const male = ensureUser(store, 'device-m');
  male.role = USER_ROLE.MALE;
  const female = ensureUser(store, 'device-f');
  female.role = USER_ROLE.FEMALE;

  joinQueueAndSearch(store, 'device-m', sessionService);
  const result = joinQueueAndSearch(store, 'device-f', sessionService);
  assert.equal(result.status, QUEUE_JOIN_STATUS.PARTNER_FOUND);
  assert.ok(result.session.id);

  const cancelled = cancelSearch(store, 'device-m');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.partnerId, 'device-f');
  assert.equal(cancelled.sessionId, result.session.id);
  assert.equal(store.sessions.has(result.session.id), false);
  assert.equal(male.sessionId, undefined);
  assert.equal(female.sessionId, undefined);
  assert.equal(male.status, undefined);
  assert.equal(female.status, undefined);
});

test('cancelSearch clears active session and removes users', () => {
  const store = createStore();
  const sessionService = createSessionService(store);
  const male = ensureUser(store, 'device-m');
  male.role = USER_ROLE.MALE;
  const female = ensureUser(store, 'device-f');
  female.role = USER_ROLE.FEMALE;

  joinQueueAndSearch(store, 'device-m', sessionService);
  const result = joinQueueAndSearch(store, 'device-f', sessionService);
  assert.equal(result.status, QUEUE_JOIN_STATUS.PARTNER_FOUND);
  result.session.state = SESSION_STATE.ACTIVE;

  const cancelled = cancelSearch(store, 'device-m');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.partnerId, 'device-f');
  assert.equal(cancelled.sessionId, result.session.id);
  assert.equal(store.sessions.has(result.session.id), false);
  assert.equal(male.sessionId, undefined);
  assert.equal(female.sessionId, undefined);
  assert.equal(male.status, undefined);
  assert.equal(female.status, undefined);
});
