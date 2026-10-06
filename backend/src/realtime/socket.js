const WebSocket = require('ws');
const { verifyToken } = require('../utils/jwt');

let wss = null;
const clients = new Map();

const getClientKey = ({ userId = null, sessionId = null }) => {
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return null;
};

const initRealtime = (httpServer) => {
  wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let clientKey = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('session_id');

      if (token) {
        const decoded = verifyToken(token);
        const userId = decoded.sub;
        const roleName = decoded.role_name || 'Visitor';
        clientKey = getClientKey({ userId });
        const existing = clients.get(clientKey) || { roleName, sockets: new Set() };
        existing.roleName = roleName;
        existing.sockets.add(ws);
        clients.set(clientKey, existing);

        ws.send(JSON.stringify({
          type: 'connected',
          message: `Connected as ${roleName}`,
          user_id: userId,
          timestamp: new Date().toISOString(),
        }));

        console.log(`âœ… WebSocket connected: user ${userId} (${roleName})`);
      } else if (sessionId) {
        clientKey = getClientKey({ sessionId });
        const existing = clients.get(clientKey) || { roleName: 'Visitor', sockets: new Set() };
        existing.roleName = 'Visitor';
        existing.sockets.add(ws);
        clients.set(clientKey, existing);

        ws.send(JSON.stringify({
          type: 'connected',
          message: 'Connected as visitor session',
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        }));

        console.log(`âœ… WebSocket connected: visitor session ${sessionId}`);
      } else {
        ws.close(1008, 'Unauthorized: No token or sessionId provided');
        return;
      }

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`ðŸ“¨ WebSocket message from ${clientKey}:`, message.type);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        if (!clientKey) return;

        const clientConnections = clients.get(clientKey);
        if (clientConnections) {
          clientConnections.sockets.delete(ws);
          if (clientConnections.sockets.size === 0) {
            clients.delete(clientKey);
          }
        }
      });

      ws.on('error', (error) => {
        console.error(`âŒ WebSocket error for ${clientKey || 'unauthenticated client'}:`, error);
      });
    } catch (error) {
      console.error('âŒ WebSocket connection error:', error);
      ws.close(1008, 'Unauthorized: Invalid token');
    }
  });

  console.log('ðŸ”Œ WebSocket server initialized at /ws');
  return wss;
};

const broadcast = (eventType, payload) => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  let count = 0;
  clients.forEach(({ sockets }) => {
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        count += 1;
      }
    });
  });

  console.log(`ðŸ“¡ Broadcast '${eventType}' to ${count} client(s)`);
};

const sendToUser = (userId, eventType, payload) => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const key = getClientKey({ userId });
  const userConnections = clients.get(key);
  if (!userConnections || userConnections.sockets.size === 0) {
    console.warn(`User ${userId} not connected`);
    return;
  }

  const message = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  userConnections.sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  console.log(`ðŸ’¬ Sent '${eventType}' to user ${userId}`);
};

const sendToSession = (sessionId, eventType, payload) => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const key = getClientKey({ sessionId });
  const sessionConnections = clients.get(key);
  if (!sessionConnections || sessionConnections.sockets.size === 0) {
    console.warn(`Session ${sessionId} not connected`);
    return;
  }

  const message = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  sessionConnections.sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  console.log(`ðŸ’¬ Sent '${eventType}' to session ${sessionId}`);
};

const broadcastToRole = (roleName, eventType, payload) => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  let count = 0;
  clients.forEach(({ roleName: connectedRole, sockets }) => {
    if (connectedRole !== roleName) return;

    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        count += 1;
      }
    });
  });

  console.log(`ðŸ“¡ Broadcast '${eventType}' to ${count} ${roleName} client(s)`);
};

const getStats = () => {
  let totalConnections = 0;
  clients.forEach(({ sockets }) => {
    totalConnections += sockets.size;
  });

  return {
    total_users: clients.size,
    total_connections: totalConnections,
  };
};

const closeAll = () => {
  if (!wss) return;

  clients.forEach(({ sockets }) => {
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });
  });

  clients.clear();
};

module.exports = {
  initRealtime,
  broadcast,
  sendToUser,
  sendToSession,
  broadcastToRole,
  getStats,
  closeAll,
};
