import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import path from 'node:path';
import { ASSETS_DIR, SCENARIOS } from './constants';
import { createStore } from './core/store';
import { createSocketHub } from './core/socket';
import { registerSearchingRoutes } from './modules/searching';
import { registerSessionRoutes } from './modules/session';
import { createDialogService } from './modules/dialog';
import { createSessionService } from './modules/session/service';

const fastify = Fastify({ logger: true });
fastify.register(cors, {
  origin: true,
});
const io = new Server(fastify.server, {
  cors: {
    origin: '*',
  },
  pingInterval: 5000,
  pingTimeout: 5000,
});


const store = createStore();
const socketHub = createSocketHub(io, store, fastify.log);
const sessionService = createSessionService(store);
const dialogService = createDialogService({ logger: fastify.log });

fastify.register(fastifyStatic, {
  root: path.join(ASSETS_DIR, SCENARIOS[0]),
  prefix: '/videos/',
  maxAge: '1h',
});

fastify.get('/ping', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

registerSearchingRoutes(fastify, {
  store,
  socketHub,
  sessionService,
});
registerSessionRoutes(fastify, {
  store,
  socketHub,
  sessionService,
  dialogService,
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log('Server is running on port', port);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
