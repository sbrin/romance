import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { createStore } from './core/store';
import { createSocketHub } from './core/socket';
import { registerSearchingRoutes } from './modules/searching';
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

fastify.get('/ping', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

registerSearchingRoutes(fastify, {
  store,
  socketHub,
  sessionService,
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
