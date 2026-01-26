import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'socket.io';
import { SOCKET_EVENT } from '@romance/shared';
import { createStore } from './store';
import { createSocketHub } from './socket';

type EmittedEvent = { event: string; payload: unknown };

type SentEvent = { to: string; event: string; payload: unknown };

class FakeSocket {
  public id: string;
  public handshake: { auth: unknown };
  public emitted: EmittedEvent[] = [];
  public disconnected = false;
  private disconnectHandler?: () => void;

  constructor(id: string, auth: unknown) {
    this.id = id;
    this.handshake = { auth };
  }

  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }

  disconnect() {
    this.disconnected = true;
  }

  on(event: string, handler: () => void) {
    if (event === 'disconnect') {
      this.disconnectHandler = handler;
    }
  }

  triggerDisconnect() {
    if (this.disconnectHandler) this.disconnectHandler();
  }
}

class FakeServer {
  private handlers: Record<string, Array<(socket: FakeSocket) => void>> = {};
  public sent: SentEvent[] = [];

  on(event: string, handler: (socket: FakeSocket) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  to(targetId: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.sent.push({ to: targetId, event, payload });
      },
    };
  }

  triggerConnection(socket: FakeSocket) {
    const handlers = this.handlers.connection ?? [];
    for (const handler of handlers) {
      handler(socket);
    }
  }
}

test('socket auth rejects invalid deviceId', () => {
  const store = createStore();
  const io = new FakeServer();
  createSocketHub(io as unknown as Server, store);

  const socket = new FakeSocket('socket-1', { deviceId: 'short' });
  io.triggerConnection(socket);

  assert.equal(socket.emitted.length, 1);
  assert.equal(socket.emitted[0].event, 'error');
  assert.equal(socket.emitted[0].payload, 'INVALID_AUTH');
  assert.equal(socket.disconnected, true);
});

test('socket auth stores socketId and clears on disconnect', () => {
  const store = createStore();
  const io = new FakeServer();
  createSocketHub(io as unknown as Server, store);

  const socket = new FakeSocket('socket-2', { deviceId: 'device-1234' });
  io.triggerConnection(socket);

  const user = store.users.get('device-1234');
  assert.equal(user?.socketId, 'socket-2');

  socket.triggerDisconnect();
  assert.equal(user?.socketId, undefined);
});

test('emitPartnerFound sends partner_found event to connected socket', () => {
  const store = createStore();
  const io = new FakeServer();
  const socketHub = createSocketHub(io as unknown as Server, store);

  const socket = new FakeSocket('socket-3', { deviceId: 'device-5678' });
  io.triggerConnection(socket);

  const sent = socketHub.emitPartnerFound('device-5678', { sessionId: 'session-1234' });
  assert.equal(sent, true);
  assert.equal(io.sent.length, 1);
  assert.equal(io.sent[0].to, 'socket-3');
  assert.equal(io.sent[0].event, SOCKET_EVENT.PARTNER_FOUND);

  const rejected = socketHub.emitPartnerFound('device-5678', { sessionId: 'short' });
  assert.equal(rejected, false);
});

test('emitPartnerCancelled sends partner_cancelled event to connected socket', () => {
  const store = createStore();
  const io = new FakeServer();
  const socketHub = createSocketHub(io as unknown as Server, store);

  const socket = new FakeSocket('socket-4', { deviceId: 'device-9999' });
  io.triggerConnection(socket);

  const sent = socketHub.emitPartnerCancelled('device-9999', { sessionId: 'session-9999' });
  assert.equal(sent, true);
  assert.equal(io.sent.length, 1);
  assert.equal(io.sent[0].to, 'socket-4');
  assert.equal(io.sent[0].event, SOCKET_EVENT.PARTNER_CANCELLED);

  const rejected = socketHub.emitPartnerCancelled('device-9999', { sessionId: 'short' });
  assert.equal(rejected, false);
});
