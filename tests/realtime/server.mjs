/**
 * Minimal stand-in for Supabase: PostgREST-style REST endpoints plus a Phoenix
 * Realtime websocket (vsn 1.0.0, JSON frames). Enough fidelity to run the real
 * @supabase/supabase-js client against it.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const MATCH_ID = '11111111-2222-3333-4444-555555555555';
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const freshMatch = () => ({
  id: MATCH_ID,
  white_player_id: null,
  black_player_id: null,
  white_player_name: 'Alice',
  black_player_name: null,
  room_name: 'probe room',
  current_fen: INITIAL_FEN,
  status: 'waiting',
  winner_id: null,
  white_player_synth_type: 'Synth',
  black_player_synth_type: 'Synth',
  started_at: null,
  finished_at: null,
  audio_file_url: null,
  created_at: new Date().toISOString(),
});

export function createFakeSupabase({ port, bundles, apikeyToDevice, log, activationMs = 0 }) {
  const db = {
    match: freshMatch(),
    moves: [],
    chatMessages: [],
  };

  /** socket -> Map<topic, { joinRef, bindings: Array<{id, filter}> }> */
  const joins = new Map();
  let nextBindingId = 1;

  const columnsFor = (table) => {
    const sample = table === 'moves' ? db.moves[db.moves.length - 1] : db.match;
    return Object.keys(sample ?? {}).map((name) => ({ name, type: 'text' }));
  };

  /** Device labels that should miss the next `moves` INSERT, emulating a deaf window. */
  const dropInsertFor = new Set();

  function pushChange(table, type, record) {
    const message = { schema: 'public', table, type, record, columns: columnsFor(table), commit_timestamp: new Date().toISOString(), errors: null };
    const delivered = [];
    for (const [socket, topics] of joins) {
      for (const [topic, join] of topics) {
        if (!join.active) {
          log(socket.__deviceName, `MISSED ${table}/${type} (subscription not active yet)`);
          continue;
        }
        if (table === 'moves' && dropInsertFor.delete(socket.__deviceName)) {
          log(socket.__deviceName, `MISSED ${table}/${type} (simulated deaf window during resubscribe)`);
          continue;
        }
        const ids = join.bindings
          .filter((b) => b.filter.table === table && (b.filter.event === '*' || b.filter.event === type))
          .map((b) => b.id);
        if (ids.length === 0) continue;
        socket.send(JSON.stringify({ topic, event: 'postgres_changes', payload: { ids, data: message }, ref: null }));
        delivered.push(socket.__deviceName);
        log('server', `WS_PUSH ${table}/${type} -> ${socket.__deviceName} (ids ${ids.join(',')})`);
      }
    }
    log('server', `CHANGE ${table}/${type} delivered to [${delivered.join(', ') || 'nobody'}]`);
  }

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        ...headers,
      });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') return send(200, {});

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><html><head><title>harness</title></head><body></body></html>');
    }
    const bundleMatch = url.pathname.match(/^\/bundle-(.+)\.js$/);
    if (bundleMatch) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end(bundles[bundleMatch[1]]);
    }

    const wantsSingleObject = (req.headers.accept ?? '').includes('vnd.pgrst.object+json');

    if (url.pathname === '/rest/v1/matches') {
      if (req.method === 'GET') return send(200, wantsSingleObject ? db.match : [db.match]);
      if (req.method === 'POST') {
        return readBody(req).then((body) => {
          const row = Array.isArray(body) ? body[0] : body;
          db.match = { ...freshMatch(), ...row, id: MATCH_ID };
          db.moves = [];
          db.chatMessages = [];
          log('server', `DB_INSERT_MATCH ${JSON.stringify(row)}`);
          return send(201, wantsSingleObject ? db.match : [db.match]);
        });
      }
      if (req.method === 'PATCH') {
        return readBody(req).then((patch) => {
          Object.assign(db.match, patch);
          log('server', `DB_PATCH_MATCH ${JSON.stringify(patch)}`);
          pushChange('matches', 'UPDATE', db.match);
          return send(200, [db.match]);
        });
      }
    }

    if (url.pathname === '/rest/v1/moves') {
      if (req.method === 'GET') return send(200, db.moves);
      if (req.method === 'POST') {
        return readBody(req).then((row) => {
          const stored = { ...row, id: `move-${db.moves.length + 1}`, player_id: null, captured_piece: null, timestamp: new Date().toISOString(), created_at: new Date().toISOString() };
          db.moves.push(stored);
          log('server', `DB_INSERT_MOVE ${stored.move_from}-${stored.move_to} move_number=${stored.move_number} by=${stored.player_name}`);
          pushChange('moves', 'INSERT', stored);
          return send(201, []);
        });
      }
      if (req.method === 'DELETE') {
        db.moves = [];
        return send(200, []);
      }
    }

    if (url.pathname === '/rest/v1/chat_messages') {
      if (req.method === 'GET') return send(200, db.chatMessages);
      if (req.method === 'POST') {
        return readBody(req).then((body) => {
          const row = Array.isArray(body) ? body[0] : body;
          const stored = { ...row, id: `msg-${db.chatMessages.length + 1}`, created_at: new Date().toISOString() };
          db.chatMessages.push(stored);
          pushChange('chat_messages', 'INSERT', stored);
          return send(201, []);
        });
      }
    }

    return send(404, { message: `no handler for ${req.method} ${url.pathname}` });
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/realtime/v1/websocket' });

  // The production bundle carries one anon key for everyone, so sockets that
  // don't map to a device are labelled in the order they connect.
  const fallbackLabels = Object.values(apikeyToDevice);
  let unknownSockets = 0;

  wss.on('connection', (socket, req) => {
    const apikey = new URL(req.url, 'http://localhost').searchParams.get('apikey') ?? '';
    const deviceName = apikeyToDevice[apikey] ?? fallbackLabels[unknownSockets++] ?? `unknown(${apikey})`;
    socket.__deviceName = deviceName;
    joins.set(socket, new Map());
    log(deviceName, 'WS_CONNECTED');

    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const { topic, event, payload, ref, join_ref: joinRef } = msg;
      const reply = (status, response = {}) =>
        socket.send(JSON.stringify({ topic, event: 'phx_reply', ref, join_ref: joinRef, payload: { status, response } }));

      if (event === 'heartbeat') return reply('ok');
      if (event === 'access_token') return reply('ok');

      if (event === 'phx_join') {
        const requested = payload?.config?.postgres_changes ?? [];
        const bindings = requested.map((filter) => ({ id: nextBindingId++, filter }));
        const topics = joins.get(socket);
        if (topics.has(topic)) log(deviceName, `WS_DUPLICATE_JOIN ${topic} (phoenix kills the previous channel for this topic)`);
        const join = { joinRef, bindings, active: activationMs === 0 };
        topics.set(topic, join);
        log(deviceName, `WS_JOIN ref=${ref} ids=[${bindings.map((b) => b.id).join(',')}]`);
        if (activationMs > 0) {
          setTimeout(() => {
            if (joins.get(socket)?.get(topic) === join) {
              join.active = true;
              log(deviceName, `SUBSCRIPTION_ACTIVE ids=[${bindings.map((b) => b.id).join(',')}]`);
            }
          }, activationMs);
        }
        return reply('ok', { postgres_changes: bindings.map((b) => ({ id: b.id, ...b.filter })) });
      }

      if (event === 'phx_leave') {
        joins.get(socket)?.delete(topic);
        log(deviceName, `WS_LEAVE ${topic} ref=${ref}`);
        return reply('ok');
      }

      log(deviceName, `WS_UNHANDLED ${event} on ${topic}`);
    });

    socket.on('close', () => {
      joins.delete(socket);
      log(deviceName, 'WS_DISCONNECTED');
    });
  });

  return {
    db,
    matchId: MATCH_ID,
    listen: () =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, '127.0.0.1', resolve);
      }),
    close: () => new Promise((resolve) => httpServer.close(resolve)),
    dropNextMoveInsertFor: (deviceName) => dropInsertFor.add(deviceName),
    hasActiveSubscription: (deviceName) => {
      for (const [socket, topics] of joins) {
        if (socket.__deviceName !== deviceName) continue;
        if ([...topics.values()].some((join) => join.active)) return true;
      }
      return false;
    },
    joinedTopicCount: (deviceName) => {
      for (const [socket, topics] of joins) if (socket.__deviceName === deviceName) return topics.size;
      return 0;
    },
    applyJoin: ({ blackPlayerName, blackSynth }) => {
      Object.assign(db.match, {
        black_player_name: blackPlayerName,
        black_player_synth_type: blackSynth,
        status: 'active',
        started_at: new Date().toISOString(),
      });
      pushChange('matches', 'UPDATE', db.match);
    },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}
