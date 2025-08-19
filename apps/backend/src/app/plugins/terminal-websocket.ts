import { FastifyPluginAsync } from 'fastify';
import * as pty from 'node-pty';
import { WebSocket } from 'ws';

interface ExtendedWebSocket extends WebSocket {
  ptyProcess?: pty.IPty;
}

const terminalWebsocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(import('@fastify/websocket'));

  fastify.get('/terminal', { websocket: true }, (connection, req) => {
    const socket = connection as ExtendedWebSocket;
    fastify.log.info('Terminal client connected');

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env as any,
    });

    socket.ptyProcess = ptyProcess;

    ptyProcess.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProcess.onExit(() => {
      fastify.log.info('PTY process exited');
      socket.close();
    });

    socket.on('message', (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());

        if (message.event === 'input' && socket.ptyProcess) {
          socket.ptyProcess.write(message.data);
        } else if (message.event === 'resize' && socket.ptyProcess) {
          const { cols, rows } = message.data;
          socket.ptyProcess.resize(cols, rows);
        }
      } catch (error) {
        fastify.log.error('Failed to parse message:', error);
      }
    });

    socket.on('close', () => {
      fastify.log.info('Terminal client disconnected');

      if (socket.ptyProcess) {
        socket.ptyProcess.kill();
        socket.ptyProcess = undefined;
      }
    });

    socket.send(JSON.stringify({ type: 'connected' }));
  });
};

export default terminalWebsocketPlugin;
