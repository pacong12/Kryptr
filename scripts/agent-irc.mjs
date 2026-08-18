#!/usr/bin/env node
/**
 * agent-irc.mjs — Redis-backed IRC for Kryptr agents
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const LOG_KEY   = 'kryptr:log';
const AGENTS    = ['conductor', 'vault', 'face', 'deck', 'ops', 'web3', 'reviewer', 'contracts', 'qa', 'redteam', 'operator'];

const [,, cmd, ...args] = process.argv;
const chan = (name) => `kryptr:msg:${name}`;

function fmt(raw) {
  const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const t   = new Date(msg.ts).toISOString().slice(11, 19);
  const to  = msg.to === 'all' ? '#kryptr' : `@${msg.to}`;
  return `[${t}] <${msg.from}> ${to}: ${msg.body}`;
}

if (cmd === 'send') {
  const [from, to, ...rest] = args;
  if (!from || !to || !rest.length) {
    console.error('usage: send <from> <to|all> <message>'); process.exit(1);
  }
  const r   = new Redis(REDIS_URL);
  const msg = JSON.stringify({ ts: Date.now(), from, to, body: rest.join(' ') });
  await r.lpush(LOG_KEY, msg);
  await r.ltrim(LOG_KEY, 0, 999);
  await r.publish(chan(to), msg);
  if (to !== 'all') await r.publish(chan('all'), msg);
  console.log(fmt(msg));
  await r.quit();
} else if (cmd === 'listen') {
  const [agent] = args;
  if (!agent) { console.error('usage: listen <agent>'); process.exit(1); }
  const sub = new Redis(REDIS_URL);
  console.log(`[irc] ${agent} listening on ${chan(agent)} + ${chan('all')}`);
  await sub.subscribe(chan(agent), chan('all'));
  sub.on('message', (_, raw) => { try { console.log(fmt(raw)); } catch { console.log(raw); } });
  process.on('SIGINT', () => sub.quit().then(() => process.exit(0)));
} else if (cmd === 'log') {
  const limit = parseInt(args[0] ?? '40');
  const r     = new Redis(REDIS_URL);
  const rows  = await r.lrange(LOG_KEY, 0, limit - 1);
  rows.reverse().forEach(raw => { try { console.log(fmt(raw)); } catch { console.log(raw); } });
  await r.quit();
} else if (cmd === 'tail') {
  const sub      = new Redis(REDIS_URL);
  const channels = ['all', ...AGENTS].map(chan);
  console.log(`[irc] tailing all channels`);
  await sub.subscribe(...channels);
  const seen = new Set();
  sub.on('message', (_, raw) => {
    if (seen.has(raw)) return; seen.add(raw);
    try { console.log(fmt(raw)); } catch { console.log(raw); }
  });
  process.on('SIGINT', () => sub.quit().then(() => process.exit(0)));
} else {
  console.log(`usage:
  node scripts/agent-irc.mjs send <from> <to|all> <message>
  node scripts/agent-irc.mjs listen <agent>
  node scripts/agent-irc.mjs log [limit]
  node scripts/agent-irc.mjs tail`);
}
