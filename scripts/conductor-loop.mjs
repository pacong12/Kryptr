#!/usr/bin/env node
import { execSync, execFileSync } from 'child_process';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const POLL_MS = 12_000;
const READ_LINES = 25;
const LOG_KEY = 'kryptr:log';
const UNREAD_KEY = 'kryptr:conductor:unread';
const AGENTS = [
  'vault',
  'face',
  'deck',
  'ops',
  'web3',
  'reviewer',
  'contracts',
  'qa',
  'redteam',
  'docs',
];

const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);
const chan = (n) => `kryptr:msg:${n}`;

function fmt(raw) {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const t = new Date(msg.ts).toISOString().slice(11, 19);
    const to = msg.to === 'all' ? '#kryptr' : `@${msg.to}`;
    return `[${t}] <${msg.from}> ${to}: ${msg.body}`;
  } catch {
    return raw;
  }
}

async function irc(from, to, body) {
  const msg = JSON.stringify({ ts: Date.now(), from, to, body });
  await pub.lpush(LOG_KEY, msg);
  await pub.ltrim(LOG_KEY, 0, 999);
  await pub.publish(chan(to), msg);
  if (to !== 'all') await pub.publish(chan('all'), msg);
  console.log(fmt(msg));
}

function herdrList() {
  try {
    const out = execSync('herdr agent list', {
      encoding: 'utf8',
      timeout: 5000,
    });
    return JSON.parse(out).result.agents;
  } catch {
    return [];
  }
}

function herdrRead(name) {
  try {
    const out = execSync(`herdr agent read ${name} --lines ${READ_LINES}`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    return out
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/[─│╭╰╮╯┤├█▶⠦⠼⠹⠇⠏]/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) => l && !l.startsWith('π') && !l.startsWith('◫') && l.length > 3,
      )
      .slice(-6)
      .join(' | ');
  } catch {
    return '(no output)';
  }
}

function promptConductor(message) {
  try {
    execFileSync('herdr', ['agent', 'prompt', 'conductor', message], {
      encoding: 'utf8',
      timeout: 10000,
    });
    console.log('[conductor-loop] auto-prompted conductor');
  } catch (e) {
    console.error('[conductor-loop] failed to prompt conductor:', e.message);
  }
}

function promptTargetAgent(agentName, message) {
  try {
    execFileSync('herdr', ['agent', 'prompt', agentName, message], {
      encoding: 'utf8',
      timeout: 10000,
    });
    console.log(
      `[conductor-loop] auto-prompted @${agentName} for incoming tektok`,
    );
  } catch (e) {
    console.error(
      `[conductor-loop] failed to prompt @${agentName}:`,
      e.message,
    );
  }
}

const prevState = {};
let conductorBusy = false;

async function poll() {
  const agents = herdrList();
  for (const a of agents) {
    const name = a.name;
    const status = a.agent_status;
    if (!name) continue;

    if (name === 'conductor') {
      conductorBusy = status === 'working';
      prevState[name] = status;
      continue;
    }

    if (!AGENTS.includes(name)) continue;
    const prev = prevState[name];

    if (prev === 'working' && (status === 'idle' || status === 'done')) {
      const summary = herdrRead(name);
      const broadcastMsg = `🔔 ${name} SELESAI. Summary: ${summary}`;
      await irc('conductor-loop', 'all', broadcastMsg);
      await irc(
        'conductor-loop',
        'conductor',
        `SELESAI: ${name} sudah idle. Ambil action.`,
      );

      const prompt = `[NOTIFIKASI SEGERA] Agent **${name}** selesai & status idle.
Summary output ${name}: ${summary}
Tindakan wajib:
1. Cek commit/status: git -C /home/muting/kryptr-wt/${name} status --short
2. Jika ada branch/commit siap: push branch lalu buat PR
3. Jika PR siap merge dan GA checks hijau: review + squash merge
4. Broadcast: node /home/muting/kryptr/scripts/agent-irc.mjs send conductor all "action taken for ${name}"`;

      promptConductor(prompt);
    }
    prevState[name] = status;
  }
}

const allChannels = ['conductor', 'all', ...AGENTS].map(chan);
await sub.subscribe(...allChannels);

sub.on('message', (_, raw) => {
  try {
    const msg = JSON.parse(raw);
    if (msg.from === 'conductor-loop') return;
    console.log('[IRC] ' + fmt(raw));

    if (
      msg.to &&
      AGENTS.includes(msg.to) &&
      msg.to !== 'conductor' &&
      msg.to !== msg.from
    ) {
      const promptText = `[PESAN DARI @${msg.from}]: "${msg.body}"\nInstruksi: Balas via IRC ke @${msg.from} setelah diperbaiki!`;
      promptTargetAgent(msg.to, promptText);
    }
  } catch {}
});

setInterval(poll, POLL_MS);
console.log('[conductor-loop] running...');
