import Fastify from 'fastify';
import { Server } from 'socket.io';
import { UserRoleSchema } from '@romance/shared';

const fastify = Fastify({ logger: true });

const io = new Server(fastify.server, {
  cors: {
    origin: '*',
  },
});

fastify.get('/ping', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('role:select', (role) => {
    const result = UserRoleSchema.safeParse(role);
    if (!result.success) {
      socket.emit('error', 'Invalid role');
      return;
    }
    console.log('Role selected:', result.data);
  });
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
