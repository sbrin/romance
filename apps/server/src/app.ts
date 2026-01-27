import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import path from 'node:path';
import { existsSync } from 'node:fs';
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
});

const store = createStore();
const socketHub = createSocketHub(io, store);
const sessionService = createSessionService(store);
const dialogService = createDialogService({ logger: fastify.log });

const resolveAssetsRoot = () => {
  const candidates = [
    path.resolve(process.cwd(), 'assets/s1'),
    path.resolve(process.cwd(), '../../assets/s1'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('ASSETS_DIRECTORY_NOT_FOUND');
  }
  return found;
};

fastify.register(fastifyStatic, {
  root: resolveAssetsRoot(),
  prefix: '/videos/',
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
