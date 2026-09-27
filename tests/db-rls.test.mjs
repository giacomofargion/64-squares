import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('/tmp/64squares-tests', { recursive: true });

const envText = readFileSync('/workspace/.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const PREFIX = `autotest-${Date.now()}`;
const created = [];
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function rest(method, path, { body, prefer, extraHeaders } = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers), text, json: text ? safeJson(text) : null };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const { data: createdMatch, error: createError } = await supabase
  .from('matches')
  .insert({
    white_player_name: 'AutotestRlsWhite',
    white_player_synth_type: 'Synth',
    black_player_synth_type: 'Synth',
    room_name: `${PREFIX}-rls`,
    status: 'waiting',
  })
  .select()
  .single();

if (createError) {
  check('anon can INSERT a guest match', false, createError.message);
  writeFileSync('/tmp/64squares-tests/db-rls.json', JSON.stringify({ results, created }, null, 2));
  process.exit(1);
}

created.push({ id: createdMatch.id, room_name: createdMatch.room_name });
check('anon can INSERT a guest match', true, createdMatch.id);

const { data: insertedMove, error: moveError } = await supabase
  .from('moves')
  .insert({
    match_id: createdMatch.id,
    move_san: 'e2-e4',
    move_from: 'e2',
    move_to: 'e4',
    move_number: 1,
    player_name: 'AutotestRlsWhite',
  })
  .select()
  .single();

check('anon can INSERT a guest move', !moveError, moveError ? moveError.message : insertedMove.id);

const { count: beforeCount } = await supabase
  .from('moves')
  .select('*', { count: 'exact', head: true })
  .eq('match_id', createdMatch.id);

check('move is visible via SELECT after insert', beforeCount === 1, `count=${beforeCount}`);

const delJs = await supabase.from('moves').delete().eq('match_id', createdMatch.id);
check(
  'supabase-js delete() returns no error (PostgREST treats 0-row RLS delete as success)',
  delJs.error == null,
  delJs.error ? delJs.error.message : `error=${delJs.error} status=${delJs.status}`
);

const delRaw = await rest('DELETE', `moves?match_id=eq.${createdMatch.id}`, { prefer: 'return=representation' });
check(
  'raw DELETE /moves returns 200/204 even though RLS blocks it',
  delRaw.status === 204 || delRaw.status === 200,
  `HTTP ${delRaw.status} body=${JSON.stringify(delRaw.json)}`
);
check(
  'raw DELETE /moves body is empty (zero rows returned)',
  delRaw.text === '' || delRaw.json == null || (Array.isArray(delRaw.json) && delRaw.json.length === 0),
  `body=${delRaw.text}`
);

const { data: stillThere, count: afterCount } = await supabase
  .from('moves')
  .select('*', { count: 'exact' })
  .eq('match_id', createdMatch.id);

check(
  're-SELECT after DELETE still finds the move (delete was a no-op)',
  afterCount === 1 && stillThere?.[0]?.id === insertedMove.id,
  `count=${afterCount}`
);

const delMatchJs = await supabase.from('matches').delete().eq('id', createdMatch.id);
check('supabase-js delete() on matches also reports no error', delMatchJs.error == null, `error=${delMatchJs.error}`);

const { data: matchStill } = await supabase.from('matches').select('id, room_name').eq('id', createdMatch.id).maybeSingle();
check('re-SELECT after DELETE still finds the match', matchStill?.id === createdMatch.id, JSON.stringify(matchStill));

const { data: chat, error: chatErr } = await supabase
  .from('chat_messages')
  .insert({ match_id: createdMatch.id, user_name: 'AutotestRlsWhite', message: 'rls ping' })
  .select()
  .single();
check('anon can INSERT chat_messages', !chatErr, chatErr ? chatErr.message : chat.id);

const delChat = await rest('DELETE', `chat_messages?match_id=eq.${createdMatch.id}`);
const { count: chatCount } = await supabase
  .from('chat_messages')
  .select('*', { count: 'exact', head: true })
  .eq('match_id', createdMatch.id);
check('DELETE chat_messages is also a silent no-op', chatCount >= 1, `HTTP ${delChat.status} remaining=${chatCount}`);

const { data: probeRooms } = await supabase
  .from('matches')
  .select('id, room_name, created_at, status')
  .like('room_name', 'probe-%')
  .order('created_at', { ascending: false });

check(
  'pre-existing probe- rooms are still in the table (not counted as this run)',
  Array.isArray(probeRooms),
  `${probeRooms?.length ?? 0} probe- rooms`
);

writeFileSync(
  '/tmp/64squares-tests/db-rls.json',
  JSON.stringify({ prefix: PREFIX, created, probeRooms, results, deleteMoveHttp: delRaw, deleteMatchJs: delMatchJs }, null, 2)
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
console.log(`created match ${createdMatch.id} room_name=${createdMatch.room_name}`);
process.exit(failed.length ? 1 : 0);
