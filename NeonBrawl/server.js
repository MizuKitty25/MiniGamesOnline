const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const MAX_PLAYERS = 4;
let nextId = 0;
const clients = new Map(); // id -> ws
let hostId = null;

function j(data) { return JSON.stringify(data); }

function broadcast(msg, excludeId = -1) {
  const s = typeof msg === 'string' ? msg : j(msg);
  for (const [id, ws] of clients) {
    if (id !== excludeId && ws.readyState === 1) ws.send(s);
  }
}

wss.on('connection', ws => {
  if (clients.size >= MAX_PLAYERS) { ws.close(1008, 'Room full'); return; }

  const id = nextId++;
  clients.set(id, ws);
  if (hostId === null) hostId = id;

  ws.send(j({ type: 'JOINED', id, hostId, count: clients.size }));
  broadcast({ type: 'PLAYER_JOIN', id, count: clients.size }, id);
  console.log(`[+] P${id} joined (${clients.size}/${MAX_PLAYERS})`);

  ws.on('message', raw => {
    try {
      const str = raw.toString();
      const msg = JSON.parse(str);
      if (msg.type === 'FIRE') {
        // Route non-host fire events to host only
        const hws = clients.get(hostId);
        if (hws && hws.readyState === 1) hws.send(str);
      } else if (msg.type === 'HURT') {
        // Host routing damage to a specific player
        const tws = clients.get(msg.targetId);
        if (tws && tws.readyState === 1) tws.send(str);
      } else {
        broadcast(str, id);
      }
    } catch (e) { /* ignore malformed */ }
  });

  ws.on('close', () => {
    clients.delete(id);
    if (id === hostId) {
      if (clients.size > 0) {
        hostId = clients.keys().next().value;
        clients.get(hostId).send(j({ type: 'BECOME_HOST' }));
        broadcast({ type: 'HOST_CHANGE', hostId });
      } else {
        hostId = null;
        nextId = 0; // fresh room when empty
      }
    }
    broadcast({ type: 'PLAYER_LEAVE', id });
    console.log(`[-] P${id} left (${clients.size}/${MAX_PLAYERS})`);
  });
});

console.log(`NeonBrawl server running on ws://localhost:${PORT}`);
console.log('Start with: node server.js');
