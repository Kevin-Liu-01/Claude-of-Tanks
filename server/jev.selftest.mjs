import assert from 'node:assert/strict';
import {
  createJevHandler, JEV_GLOBAL_PER_MINUTE, JEV_MAX_BODY_BYTES, JEV_SESSION_REQUEST_CAP, JEV_UPSTREAM_URL,
} from '../api/jev.ts';
import {
  buildJevQuestions, JEV_FOCUS_NONE, JEV_LIMITS, JEV_POSTURES, JEV_TARGET_NONE, parseJevAnswers, validateJevRequest,
  validateJevState,
} from '../src/game/jevProtocol.ts';

// The receipt drives the real proxy handler with a fake request/response pair
// and a fake upstream, so the auth header, the server-built questions, every
// error mapping (401/422/429/529/timeout/unreachable), the cool-down, the
// rate limits, the session budget, the origin gate, the body cap and the
// state validation are all observed without a network or a key on disk.

const KEY = 'ts-test-key-never-logged-0123456789';

function fixtureState(overrides = {}) {
  return {
    v: 1,
    battle: {
      mode: 'zone_control', goal: 'capture and hold the three zones; first team to 750 points wins',
      elapsed_s: 245, remaining_s: 655, score: { ours: 120, theirs: 90, target: 750 }, alive: { ours: 2, theirs: 2 },
      human_ally: null,
    },
    our_tanks: {
      b1: {
        vehicle: 'M1A2 Abrams', class: 'main battle tank', role: 'brawler', hp: 0.62, ammo: 0.4, gun: 'ready',
        moving: true, under_fire: true, modules_damaged: ['engine'],
        sees: [{ id: 'e1', m: 210 }, { id: 'e2', m: 340 }], nearest_ally_m: 40,
        objective: { bearing: 'NE', distance_m: 210 }, current_target: 'e1', current_stance: 'engage',
      },
      b2: {
        vehicle: 'Leopard 2A7', class: 'main battle tank', role: 'flanker', hp: 1, ammo: 1, gun: 'reloading 3 s',
        moving: false, under_fire: false, modules_damaged: [], sees: [], nearest_ally_m: 40,
        objective: null, current_target: null, current_stance: 'patrol',
      },
    },
    enemies: {
      e1: {
        vehicle: 'T-90M', class: 'main battle tank', human_player: true, hp: 0.8, distance_m: 320, bearing: 'N',
        facing: 'toward us', moving: false, on_objective: false, seen_by: ['b1'], engaged_by: ['b1'],
      },
      e2: {
        vehicle: 'Strv 103', class: 'tank destroyer', human_player: false, hp: 0.35, distance_m: 410, bearing: 'NE',
        facing: 'side-on', moving: true, on_objective: true, seen_by: ['b1'], engaged_by: [],
      },
    },
    objectives: {
      zone_a: { kind: 'zone', owner: 'theirs', contested: true, distance_m: 150, bearing: 'E' },
    },
    ...overrides,
  };
}

const request = (state = fixtureState(), sid = 'session-abc123') => ({ v: 1, sid, kind: 'team_orders', state });
const withBot = (id, patch) => fixtureState({ our_tanks: { ...fixtureState().our_tanks, [id]: { ...fixtureState().our_tanks[id], ...patch } } });
const withEnemy = (id, patch) => fixtureState({ enemies: { ...fixtureState().enemies, [id]: { ...fixtureState().enemies[id], ...patch } } });

function upstreamAnswers(questions) {
  const answers = {};
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === 'choice') {
      const options = Object.keys(question.criteria);
      const probabilities = Object.fromEntries(options.map((option, index) => [option, index === 0 ? 0.9 : 0.1 / Math.max(1, options.length - 1)]));
      answers[id] = { type: 'choice', choice: options[0], probabilities, confidence: 0.85 };
    } else if (question.type === 'noul') {
      answers[id] = { type: 'noul', noul: 0.7 };
    } else {
      answers[id] = { type: 'score', score: 1.4, legend: {}, probabilities: { 0: 0.1, 1: 0.5, 2: 0.3, 3: 0.1 }, confidence: 0.6 };
    }
  }
  return answers;
}

function fakeUpstream({ status = 200, body = null, hang = false, throwError = null } = {}) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init });
    if (throwError) return Promise.reject(throwError);
    if (hang) {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    const text = body === null
      ? JSON.stringify({ model: 'jev-1.13.0', answers: upstreamAnswers(JSON.parse(init.body).questions), usage: { input_tokens: 1234, output_tokens: 88 } })
      : typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve({ status, text: async () => text });
  };
  return { fetch, calls };
}

function fakeRequest({ method = 'POST', origin = 'https://cot.kevinliu.studio', body = '', ip = '203.0.113.7', contentLength = null } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { origin, 'x-forwarded-for': ip };
  if (contentLength !== null) headers['content-length'] = String(contentLength);
  return {
    method, headers, socket: { remoteAddress: '10.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(text.slice(0, 11)); yield Buffer.from(text.slice(11)); },
  };
}

async function invoke(handler, options = {}) {
  const headers = new Map();
  let text = '';
  const response = {
    statusCode: 200, headersSent: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  await handler(fakeRequest(options), response);
  return { status: response.statusCode, headers, body: text ? JSON.parse(text) : null, text };
}

function fixture(overrides = {}) {
  const lines = [], warnings = [];
  let clock = 1_700_000_000_000;
  const upstream = overrides.upstream || fakeUpstream();
  const handler = createJevHandler({
    env: { TYPESAFE_API_KEY: KEY }, now: () => clock, fetch: upstream.fetch,
    log: (line) => lines.push(line), warn: (line) => warnings.push(line),
    sessionBucketCapacity: 6, sessionBucketRefillPerSecond: 1, addressBucketCapacity: 50, addressBucketRefillPerSecond: 5,
    ...overrides.options,
  });
  return { handler, lines, warnings, upstream, advance: (ms) => { clock += ms; } };
}

{
  console.log('[1] a valid team document reaches Jev with the server key and server-built questions');
  const f = fixture();
  const accepted = await invoke(f.handler, { body: request() });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(f.upstream.calls.length, 1, 'one upstream call');
  const call = f.upstream.calls[0];
  assert.equal(call.url, JEV_UPSTREAM_URL);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.authorization, `Bearer ${KEY}`, 'the Authorization header carries the server key');
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.model, 'jev-latest');
  assert.deepEqual(sent.state, fixtureState(), 'the validated document is forwarded as the state');
  const questions = buildJevQuestions(fixtureState());
  assert.deepEqual(sent.questions, questions, 'the questions are built server-side from the document');
  assert.deepEqual(Object.keys(questions).sort(),
    ['fire_b1', 'focus', 'posture_b1', 'posture_b2', 'target_b1', 'threat_b1', 'threat_b2'].sort(),
    'posture + threat per bot, target + fire only for a bot that sees an enemy, one team focus with objectives');
  assert.deepEqual(Object.keys(questions.posture_b1.criteria), [...JEV_POSTURES]);
  assert.deepEqual(Object.keys(questions.target_b1.criteria), ['e1', 'e2', JEV_TARGET_NONE], 'the target options are exactly the enemies the bot sees plus none');
  assert.deepEqual(Object.keys(questions.focus.criteria), ['zone_a', JEV_FOCUS_NONE]);
  assert.equal(questions.threat_b1.criteria.length, 4);
  assert.match(questions.posture_b1.instructions, /`our_tanks\.b1`/, 'questions point at the bot by its backticked state path');
  assert.match(questions.target_b1.criteria.e1, /the human player/, 'the human player is named as such, never by a nickname');
  assert.doesNotMatch(JSON.stringify(questions), /Kevin|session-abc123|kevinliu/, 'no personal value reaches the questions');
  assert.equal(accepted.body.v, 1);
  assert.equal(accepted.body.model, 'jev-1.13.0');
  assert.deepEqual(accepted.body.usage, { input_tokens: 1234, output_tokens: 88 });
  assert.equal(typeof accepted.body.latencyMs, 'number');
  assert.deepEqual(Object.keys(accepted.body.answers).sort(), Object.keys(questions).sort(), 'every answer comes back under its question id');
  assert.equal(accepted.body.answers.posture_b1.choice, 'hold');
  assert.equal(accepted.body.answers.fire_b1.noul, 0.7);
  assert.equal(accepted.body.answers.threat_b2.score, 1.4);
  assert.doesNotMatch(accepted.text, new RegExp(KEY), 'the key is never echoed');
  assert.equal(f.lines.length, 1, 'one structured log line per call');
  const row = JSON.parse(f.lines[0]);
  assert.deepEqual([row.tag, row.kind, row.mode, row.bots, row.enemies, row.objectives, row.questions, row.status, row.upstreamStatus, row.inputTokens, row.outputTokens, row.sessionRequests],
    ['cot-jev', 'team_orders', 'zone_control', 2, 2, 1, 7, 200, 200, 1234, 88, 1]);
  assert.doesNotMatch(f.lines[0], new RegExp(`${KEY}|session-abc123|203\\.0\\.113\\.7|10\\.0\\.0\\.1|Abrams`), 'the log carries counts, never the key, the session, an address or the document');
  assert.equal(accepted.headers.has('access-control-allow-origin'), true, 'an allowed origin gets a CORS grant');
}

{
  console.log('[2] method, origin and configuration gates');
  const f = fixture();
  assert.equal((await invoke(f.handler, { method: 'GET' })).status, 405);
  const preflight = await invoke(f.handler, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  const forbidden = await invoke(f.handler, { body: request(), origin: 'https://attacker.example' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, 'origin_forbidden');
  assert.equal(forbidden.headers.has('access-control-allow-origin'), false);
  assert.equal((await invoke(f.handler, { method: 'OPTIONS', origin: 'https://attacker.example' })).status, 403, 'preflight from a foreign origin is refused too');
  assert.equal((await invoke(f.handler, { body: request(), origin: 'http://localhost:5173' })).status, 403, 'localhost is not allowed in production');
  const local = fixture({ options: { allowLocalOrigins: true } });
  assert.equal((await invoke(local.handler, { body: request(), origin: 'http://localhost:5173' })).status, 200, 'the dev wrapper allows localhost origins');
  assert.equal((await invoke(local.handler, { body: request(), origin: 'http://127.0.0.1:6123' })).status, 200);
  assert.equal((await invoke(local.handler, { body: request(), origin: 'http://localhost.evil.example' })).status, 403, 'only the bare local hosts qualify');
  const extra = fixture({ options: { env: { TYPESAFE_API_KEY: KEY, COT_ALLOWED_ORIGINS: 'https://staging.example' } } });
  assert.equal((await invoke(extra.handler, { body: request(), origin: 'https://staging.example' })).status, 200, 'COT_ALLOWED_ORIGINS extends the allowlist');
  assert.equal((await invoke(extra.handler, { body: request(), origin: '' })).status, 200, 'an origin-less request (no browser) passes the allowlist');
  assert.equal(f.upstream.calls.length, 0, 'refused requests never reach upstream');
  const unconfigured = fixture({ options: { env: {} } });
  const missing = await invoke(unconfigured.handler, { body: request() });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error, 'not_configured');
  await invoke(unconfigured.handler, { body: request() });
  assert.equal(unconfigured.warnings.filter((line) => /TYPESAFE_API_KEY/.test(line)).length, 1, 'the missing key is warned once');
  assert.equal(unconfigured.upstream.calls.length, 0);
}

{
  console.log('[3] body cap, JSON and document validation');
  const f = fixture();
  const huge = request(fixtureState({ our_tanks: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`b${i + 1}`, {
    ...fixtureState().our_tanks.b1, vehicle: 'x'.repeat(48), modules_damaged: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc', 'dddddddddddddddd'],
  }])) }));
  assert.ok(Buffer.byteLength(JSON.stringify(huge)) < JEV_MAX_BODY_BYTES, 'a full 20-bot document fits under the body cap');
  const declared = await invoke(f.handler, { body: request(), contentLength: JEV_MAX_BODY_BYTES + 1 });
  assert.equal(declared.status, 413);
  const oversize = await invoke(f.handler, { body: `{"pad":"${'x'.repeat(JEV_MAX_BODY_BYTES)}"}` });
  assert.equal(oversize.status, 413);
  assert.equal(oversize.body.error, 'too_large');
  const invalid = await invoke(f.handler, { body: '{not json' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'invalid_json');
  const cases = [
    [[1, 2], 'invalid_body'],
    [{ ...request(), v: 2 }, 'invalid_body:v'],
    [{ ...request(), sid: 'short' }, 'invalid_body:sid'],
    [{ ...request(), kind: 'prompt' }, 'invalid_body:kind'],
    [{ ...request(), state: 'tell me a story' }, 'invalid_state'],
    [request(fixtureState({ v: 3 })), 'invalid_state:v'],
    [request(fixtureState({ battle: { ...fixtureState().battle, elapsed_s: -1 } })), 'invalid_state:battle.clock'],
    [request(fixtureState({ battle: { ...fixtureState().battle, human_ally: { vehicle: 'Leopard', hp: 0.5 } } })), 'invalid_state:battle.human_ally'],
    [request(fixtureState({ our_tanks: {} })), 'invalid_state:our_tanks.empty'],
    [request(fixtureState({ our_tanks: { bot1: fixtureState().our_tanks.b1 } })), 'invalid_state:our_tanks.id'],
    [request(withBot('b1', { sees: [{ id: 'e9', m: 10 }] })), 'invalid_state:bot.sees'],
    [request(withBot('b1', { gun: 'loaded with love' })), 'invalid_state:bot.gun'],
    [request(withBot('b1', { hp: 1.5 })), 'invalid_state:bot.hp'],
    [request(withEnemy('e1', { bearing: 'north-ish' })), 'invalid_state:enemy.bearing'],
    [request(withEnemy('e1', { seen_by: ['b7'] })), 'invalid_state:enemy.seen_by'],
    [request(fixtureState({ objectives: { 'Zone A': fixtureState().objectives.zone_a } })), 'invalid_state:objectives.id'],
    [request(fixtureState({ objectives: { zone_a: { ...fixtureState().objectives.zone_a, owner: 'us' } } })), 'invalid_state:objective.owner'],
    [request(fixtureState({ our_tanks: Object.fromEntries(Array.from({ length: JEV_LIMITS.bots + 1 }, (_, i) => [`b${i + 1}`, fixtureState().our_tanks.b2])) })), 'invalid_state:our_tanks.count'],
  ];
  for (const [body, error] of cases) {
    const refused = await invoke(f.handler, { body });
    assert.equal(refused.status, 400, `${error} is refused (${JSON.stringify(refused.body)})`);
    assert.equal(refused.body.error, error);
  }
  for (const [body, field] of [
    [request(fixtureState({ playerName: 'Kevin' })), 'playerName'],
    [request(withBot('b1', { nick: 'IronMaus' })), 'nick'],
    [request(withEnemy('e1', { x: 120, z: -40 })), 'x'],
    [request(fixtureState({ battle: { ...fixtureState().battle, roomCode: 'ABCDEF' } })), 'roomCode'],
  ]) {
    const refused = await invoke(f.handler, { body });
    assert.equal(refused.status, 400, `${field} is a personal or positional field`);
    assert.equal(refused.body.error, `pii_field:${field}`);
  }
  assert.equal(f.upstream.calls.length, 0, 'no refused document reaches upstream');
  assert.equal(f.lines.length, 0, 'refused requests log nothing');
  const dropped = validateJevState({ ...withBot('b1', { unknownField: 3 }), extra: 'ignored' });
  assert.equal(dropped.ok, true);
  assert.equal(dropped.value.extra, undefined);
  assert.equal(dropped.value.our_tanks.b1.unknownField, undefined, 'unknown fields are dropped, not refused');
  assert.equal(validateJevRequest(request()).ok, true);
}

{
  console.log('[4] upstream error mapping, timeout and cool-down');
  const expect = async (upstream, status, error, extra = {}) => {
    const f = fixture({ upstream, options: { timeoutMs: 20, ...extra } });
    const reply = await invoke(f.handler, { body: request() });
    assert.equal(reply.status, status, `${error}: ${JSON.stringify(reply.body)}`);
    assert.equal(reply.body.error, error);
    assert.doesNotMatch(reply.text, new RegExp(KEY));
    return { f, reply };
  };
  const auth = await expect(fakeUpstream({ status: 401, body: { error: 'bad key' } }), 502, 'upstream_auth');
  assert.match(auth.f.warnings[0], /401/);
  const invalid = await expect(fakeUpstream({ status: 422, body: { detail: 'questions.posture_b1.criteria is malformed' } }), 502, 'upstream_invalid');
  assert.match(invalid.f.warnings[0], /422.*criteria is malformed/);
  await expect(fakeUpstream({ status: 500, body: 'boom' }), 502, 'upstream_error');
  await expect(fakeUpstream({ status: 200, body: '<html>' }), 502, 'upstream_invalid_json');
  await expect(fakeUpstream({ throwError: new TypeError('fetch failed') }), 502, 'upstream_unreachable');
  const timeout = await expect(fakeUpstream({ hang: true }), 504, 'upstream_timeout');
  assert.equal(JSON.parse(timeout.f.lines[0]).error, 'upstream_timeout', 'a timeout is logged as one');
  // 429 / 529 start a cool-down: the next request is answered locally without an upstream call, the
  // window doubles on each repeat and resets after a success
  const limited = await expect(fakeUpstream({ status: 429, body: {} }), 429, 'upstream_rate_limited');
  assert.equal(limited.reply.body.retryAfterMs, 1000);
  assert.equal(limited.reply.headers.get('retry-after'), '1');
  const cooling = await invoke(limited.f.handler, { body: request() });
  assert.equal(cooling.status, 503);
  assert.equal(cooling.body.error, 'cooling_down');
  assert.equal(limited.f.upstream.calls.length, 1, 'no upstream call while cooling down');
  limited.f.advance(1000);
  const second = await invoke(limited.f.handler, { body: request() });
  assert.equal(second.body.retryAfterMs, 2000, 'the cool-down doubles while upstream keeps refusing');
  const overloaded = await expect(fakeUpstream({ status: 529, body: {} }), 503, 'upstream_overloaded');
  assert.equal(overloaded.reply.body.retryAfterMs, 1000);
}

{
  console.log('[5] rate limits and the session budget');
  const f = fixture({ options: { sessionBucketCapacity: 3, sessionBucketRefillPerSecond: 1 } });
  for (let i = 0; i < 3; i++) assert.equal((await invoke(f.handler, { body: request() })).status, 200);
  const limited = await invoke(f.handler, { body: request() });
  assert.equal(limited.status, 429, 'the fourth request inside the burst window is limited per session');
  assert.equal(limited.body.error, 'session_rate_limited');
  assert.equal(limited.headers.get('retry-after'), '5');
  assert.equal((await invoke(f.handler, { body: request(fixtureState(), 'other-session-9') })).status, 200, 'another session keeps its own bucket');
  f.advance(1000);
  assert.equal((await invoke(f.handler, { body: request() })).status, 200, 'the bucket refills with time');
  const address = fixture({ options: { addressBucketCapacity: 2, addressBucketRefillPerSecond: 1 } });
  assert.equal((await invoke(address.handler, { body: request(fixtureState(), 'session-one-1') })).status, 200);
  assert.equal((await invoke(address.handler, { body: request(fixtureState(), 'session-two-2') })).status, 200);
  const addressLimited = await invoke(address.handler, { body: request(fixtureState(), 'session-three-3') });
  assert.equal(addressLimited.status, 429, 'one address cannot open unlimited sessions');
  assert.equal(addressLimited.body.error, 'rate_limited');
  assert.equal((await invoke(address.handler, { body: request(fixtureState(), 'session-four-4'), ip: '198.51.100.9' })).status, 200);
  const budget = fixture({ options: { sessionRequestCap: 2, sessionBucketCapacity: 50 } });
  assert.equal((await invoke(budget.handler, { body: request() })).status, 200);
  assert.equal((await invoke(budget.handler, { body: request() })).status, 200);
  const spent = await invoke(budget.handler, { body: request() });
  assert.equal(spent.status, 429);
  assert.equal(spent.body.error, 'session_budget_spent');
  assert.equal(budget.upstream.calls.length, 2, 'a spent budget never reaches upstream');
  assert.equal(JEV_SESSION_REQUEST_CAP, 2400, 'the production budget covers two teams at one request per two seconds for a 15-minute battle series');
  const global = fixture({ options: { globalPerMinute: 2, sessionBucketCapacity: 50 } });
  assert.equal((await invoke(global.handler, { body: request() })).status, 200);
  assert.equal((await invoke(global.handler, { body: request() })).status, 200);
  const ceiling = await invoke(global.handler, { body: request() });
  assert.equal(ceiling.status, 429);
  assert.equal(ceiling.body.error, 'global_rate_limited');
  global.advance(60_000);
  assert.equal((await invoke(global.handler, { body: request() })).status, 200, 'the global ceiling is a rolling minute');
  assert.ok(JEV_GLOBAL_PER_MINUTE < 1200, 'the global ceiling stays under the published per-key limit');
}

{
  console.log('[6] malformed upstream answers are dropped, never forwarded');
  const questions = buildJevQuestions(fixtureState());
  const good = upstreamAnswers(questions);
  const answers = parseJevAnswers({
    ...good,
    posture_b1: { ...good.posture_b1, choice: 'charge' },
    fire_b1: { type: 'noul', noul: 1.4 },
    threat_b2: { type: 'choice', choice: 'hold', probabilities: {}, confidence: 1 },
    target_b1: { ...good.target_b1, probabilities: { e1: 0.5, e9: 0.5 } },
    made_up: { type: 'noul', noul: 0.2 },
  }, questions);
  assert.deepEqual(Object.keys(answers).sort(), ['focus', 'posture_b2', 'threat_b1'].sort(),
    'a choice outside its criteria, a noul above 1, a type mismatch, a probability for an unknown option and an unasked id are all dropped');
  const f = fixture({ upstream: fakeUpstream({ body: { model: 'jev-1.13.0', answers: { posture_b1: { type: 'choice', choice: 'nuke', probabilities: {}, confidence: 1 } }, usage: {} } }) });
  const reply = await invoke(f.handler, { body: request() });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.body.answers, {}, 'nothing usable came back, the commander keeps the classic brain');
  assert.deepEqual(reply.body.usage, { input_tokens: 0, output_tokens: 0 });
}

console.log('jev.selftest: key header, server-built questions, error mapping, timeout, cool-down, rate limits, budget, origin and state validation pass');
