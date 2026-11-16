// The simulation: the player ship, bullets, void wisps, star shards, particles and waves.
// Everything advances in fixed 1/60 s steps from a seeded random, so the same seed and the same
// controls always play the same game. It knows nothing about the screen or the sound: it returns
// an event bitmask each step and the caller plays the sounds.

import {
  BULLET, FIELD, LIVES, NOVA_SCORE_SHARE, NOVA_SHARDS, PLAYER, POOL, SHARD, WAVE, WISP,
} from './config.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_NOVA = 8;
export const EVENT_PICKUP = 16;
export const EVENT_KILL = 32;
export const EVENT_SHOT = 64;

const TWO_PI = Math.PI * 2;

/** The wisp types a wave may hold, with their weights shifting as waves go on. */
function waveMix(wave) {
  const mix = [['ember', 5], ['wisp', 3]];
  if (wave >= 2) mix.push(['darter', 2]);
  if (wave >= 3) mix.push(['brute', 2]);
  if (wave >= 4) mix[0][1] = 3;
  if (wave >= 5) mix.push(['brute', 1]);
  return mix;
}

function buildQueue(random, wave) {
  const count = WAVE.firstCount + (wave - 1) * WAVE.perWave;
  const mix = waveMix(wave);
  const total = mix.reduce((sum, entry) => sum + entry[1], 0);
  const queue = [];
  for (let i = 0; i < count; i += 1) {
    let roll = random() * total;
    let type = 'ember';
    for (const [name, weight] of mix) {
      roll -= weight;
      if (roll <= 0) {
        type = name;
        break;
      }
    }
    queue.push(type);
  }
  // Shuffle so the wave never arrives in type order.
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function spawnEdge(random) {
  const edge = Math.floor(random() * 4);
  const margin = 40;
  if (edge === 0) return { x: range(random, 0, FIELD.width), y: -margin };
  if (edge === 1) return { x: FIELD.width + margin, y: range(random, 0, FIELD.height) };
  if (edge === 2) return { x: range(random, 0, FIELD.width), y: FIELD.height + margin };
  return { x: -margin, y: range(random, 0, FIELD.height) };
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    lives: LIVES,
    wave: 1,
    waveState: 'breather',
    waveTimer: 1,
    spawnQueue: [],
    spawnTimer: 0,
    player: { x: FIELD.width / 2, y: FIELD.height / 2, angle: -Math.PI / 2, radius: PLAYER.radius, fireCooldown: 0, invulnerable: 0 },
    bullets: [],
    enemies: [],
    shards: [],
    particles: [],
    popups: [],
    rings: [],
    novaCharge: 0,
    shake: 0,
    flash: 0,
    banner: '',
    bannerTimer: 0,
    kills: 0,
    over: false,
  };

  function burst(x, y, colour, count, speed) {
    for (let i = 0; i < count && state.particles.length < POOL.particles; i += 1) {
      const angle = random() * TWO_PI;
      const velocity = range(random, speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        radius: range(random, 1.5, 4),
        life: range(random, 0.3, 0.8),
        maxLife: 0.8,
        colour,
      });
    }
  }

  function popup(x, y, text, colour) {
    if (state.popups.length >= POOL.popups) state.popups.shift();
    state.popups.push({ x, y, text, life: 1, colour });
  }

  function addShard(x, y) {
    if (state.shards.length >= POOL.shards) return;
    const angle = random() * TWO_PI;
    state.shards.push({
      x, y,
      vx: Math.cos(angle) * 60,
      vy: Math.sin(angle) * 60,
      radius: SHARD.radius,
      life: SHARD.life,
    });
  }

  function startWave() {
    state.spawnQueue = buildQueue(random, state.wave);
    state.spawnTimer = 0.4;
    state.waveState = 'spawning';
    state.banner = `WAVE ${state.wave}`;
    state.bannerTimer = 1.6;
  }

  function spawnEnemy(type) {
    if (state.enemies.length >= POOL.enemies) return;
    const spec = WISP[type];
    const point = spawnEdge(random);
    const speed = spec.speed * Math.min(1 + (state.wave - 1) * WAVE.speedPerWave, WAVE.speedMax);
    state.enemies.push({
      type,
      x: point.x, y: point.y,
      vx: 0, vy: 0,
      radius: spec.radius,
      hp: spec.hp,
      maxHp: spec.hp,
      speed,
      seed: random() * TWO_PI,
      state: 'chase',
      stateTime: 0,
      angle: 0,
    });
  }

  function killEnemy(index, byNova) {
    const enemy = state.enemies[index];
    const spec = WISP[enemy.type];
    const points = byNova
      ? Math.max(1, Math.round(spec.score * NOVA_SCORE_SHARE))
      : spec.score + (state.wave - 1) * 2;
    state.score += points;
    state.kills += 1;
    popup(enemy.x, enemy.y, `+${points}`, byNova ? '#ffe9a8' : '#eef1f5');
    burst(enemy.x, enemy.y, spec.colour, enemy.type === 'brute' ? 26 : 14, enemy.type === 'brute' ? 260 : 200);
    state.rings.push({ x: enemy.x, y: enemy.y, radius: spec.radius, maxRadius: spec.radius * 3.2, life: 0.35, colour: spec.colour });
    if (random() < spec.shard) addShard(enemy.x, enemy.y);
    state.enemies.splice(index, 1);
  }

  function fireNova() {
    if (state.novaCharge < NOVA_SHARDS || state.enemies.length === 0) return false;
    state.novaCharge = 0;
    state.flash = 1;
    state.shake = 26;
    state.rings.push({ x: state.player.x, y: state.player.y, radius: 20, maxRadius: 700, life: 0.7, colour: '#ffe9a8' });
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) killEnemy(i, true);
    return true;
  }

  function hitPlayer(enemy) {
    state.lives -= 1;
    state.player.invulnerable = PLAYER.invulnerable;
    state.shake = 18;
    state.flash = 0.7;
    burst(state.player.x, state.player.y, '#5df2ff', 24, 260);
    if (state.lives <= 0) {
      state.over = true;
      burst(state.player.x, state.player.y, '#5df2ff', 60, 380);
      burst(state.player.x, state.player.y, '#ff5d73', 40, 300);
    }
    return state.over ? EVENT_OVER : EVENT_HIT;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.lives = LIVES;
    state.wave = 1;
    state.waveState = 'breather';
    state.waveTimer = 1;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.player.x = FIELD.width / 2;
    state.player.y = FIELD.height / 2;
    state.player.angle = -Math.PI / 2;
    state.player.fireCooldown = 0;
    state.player.invulnerable = 0;
    state.bullets.length = 0;
    state.enemies.length = 0;
    state.shards.length = 0;
    state.particles.length = 0;
    state.popups.length = 0;
    state.rings.length = 0;
    state.novaCharge = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = 'STARFALL';
    state.bannerTimer = 1.6;
    state.kills = 0;
    state.over = false;
  }

  /**
   * One fixed step. `control` is { moveX, moveY, aimX, aimY, firing, nova } and `ambient`
   * steps the title backdrop (enemies drift, nothing can hurt the player). Returns an event mask.
   */
  function step(dt, control, ambient) {
    let events = 0;
    state.time += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.2);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);

    const player = state.player;
    if (!ambient && !state.over) {
      // Move.
      player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + control.moveX * PLAYER.speed * dt));
      player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + control.moveY * PLAYER.speed * dt));
      player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
      if (player.invulnerable > 0) player.invulnerable -= dt;
      // Fire.
      player.fireCooldown -= dt;
      if (control.firing && player.fireCooldown <= 0 && state.bullets.length < POOL.bullets) {
        const angle = player.angle;
        state.bullets.push({
          x: player.x + Math.cos(angle) * (player.radius + 6),
          y: player.y + Math.sin(angle) * (player.radius + 6),
          vx: Math.cos(angle) * BULLET.speed,
          vy: Math.sin(angle) * BULLET.speed,
          radius: BULLET.radius,
          life: BULLET.life,
        });
        player.fireCooldown = PLAYER.fireInterval;
        events |= EVENT_SHOT;
      }
      // Nova.
      if (control.nova && fireNova()) events |= EVENT_NOVA;
    }

    // Waves.
    if (!ambient && !state.over) {
      if (state.waveState === 'breather') {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) startWave();
      } else if (state.waveState === 'spawning') {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
          spawnEnemy(state.spawnQueue.shift());
          const interval = Math.max(WAVE.interval * Math.pow(WAVE.intervalScale, state.wave - 1), WAVE.minInterval);
          state.spawnTimer = interval;
        }
        if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
          state.wave += 1;
          const bonus = state.wave * 50;
          state.score += bonus;
          popup(player.x, player.y - 40, `WAVE BONUS +${bonus}`, '#ffd94d');
          state.waveState = 'breather';
          state.waveTimer = WAVE.breather;
          events |= EVENT_WAVE;
        }
      }
    }
    // The title backdrop keeps a few wisps drifting for the eye.
    if (ambient && state.enemies.length < 6) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(pick(random, ['ember', 'wisp']));
        state.spawnTimer = 1.4;
      }
    }

    // Bullets.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
      }
    }

    // Enemies: drift at the player, with a sideways wobble; darters telegraph, then dash.
    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      enemy.angle = Math.atan2(dy, dx);
      enemy.stateTime += dt;
      if (enemy.type === 'darter') {
        if (enemy.state === 'chase' && distance < 280) {
          enemy.state = 'aim';
          enemy.stateTime = 0;
        } else if (enemy.state === 'aim') {
          if (enemy.stateTime > 0.6) {
            enemy.state = 'dash';
            enemy.stateTime = 0;
            enemy.vx = (dx / distance) * enemy.speed * 4.2;
            enemy.vy = (dy / distance) * enemy.speed * 4.2;
          }
        } else if (enemy.state === 'dash') {
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
          if (enemy.stateTime > 0.5) enemy.state = 'chase';
          continue;
        }
      }
      const wobble = Math.sin(state.time * 2.2 + enemy.seed) * 0.45;
      const ax = Math.cos(enemy.angle + wobble);
      const ay = Math.sin(enemy.angle + wobble);
      enemy.x += ax * enemy.speed * dt;
      enemy.y += ay * enemy.speed * dt;
    }

    // Bullets against enemies.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      let spent = false;
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const reach = bullet.radius + enemy.radius;
        if (dx * dx + dy * dy < reach * reach) {
          enemy.hp -= BULLET.damage;
          burst(bullet.x, bullet.y, WISP[enemy.type].colour, 4, 120);
          state.bullets.splice(i, 1);
          spent = true;
          if (enemy.hp <= 0) {
            killEnemy(j, false);
            events |= EVENT_KILL;
          }
          break;
        }
      }
      if (spent) continue;
    }

    // Shards: drift, then magnet to the player and collect.
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const shard = state.shards[i];
      shard.life -= dt;
      if (shard.life <= 0) {
        state.shards.splice(i, 1);
        continue;
      }
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (!ambient && distance < SHARD.magnet) {
        shard.vx += (dx / distance) * SHARD.magnetSpeed * dt * 4;
        shard.vy += (dy / distance) * SHARD.magnetSpeed * dt * 4;
      }
      shard.vx *= 0.98;
      shard.vy *= 0.98;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (!ambient && !state.over && distance < player.radius + shard.radius + 4) {
        state.shards.splice(i, 1);
        if (state.novaCharge < NOVA_SHARDS) state.novaCharge += 1;
        state.score += 5;
        popup(shard.x, shard.y, '+5', '#ffd94d');
        burst(shard.x, shard.y, '#ffd94d', 6, 140);
        events |= EVENT_PICKUP;
      }
    }

    // Enemies against the player.
    if (!ambient && !state.over && player.invulnerable <= 0) {
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const reach = player.radius + enemy.radius - 3;
        if (dx * dx + dy * dy < reach * reach) {
          state.enemies.splice(j, 1);
          burst(enemy.x, enemy.y, WISP[enemy.type].colour, 16, 220);
          events |= hitPlayer(enemy);
          break;
        }
      }
    }

    // Particles, rings and popups.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
    for (let i = state.rings.length - 1; i >= 0; i -= 1) {
      const ring = state.rings[i];
      ring.life -= dt;
      ring.radius += (ring.maxRadius - ring.radius) * dt * 6;
      if (ring.life <= 0) state.rings.splice(i, 1);
    }
    for (let i = state.popups.length - 1; i >= 0; i -= 1) {
      const popupItem = state.popups[i];
      popupItem.life -= dt;
      popupItem.y -= 34 * dt;
      if (popupItem.life <= 0) state.popups.splice(i, 1);
    }

    return events;
  }

  reset();
  return { state, reset, step };
}
