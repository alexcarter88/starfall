// The painter: a neon starfield, glowing wisps and ship, the HUD and the screens. It reads the
// world's state and draws it onto the canvas, scaled to the window with the shared letterbox.

import { FIELD, FONT, PALETTE, WISP } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The backdrop stars, fixed by seed so the title never flickers between visits. */
function makeStars() {
  const random = createRandom(20261116);
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    stars.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      radius: 0.6 + random() * 1.6,
      phase: random() * Math.PI * 2,
      speed: 0.4 + random() * 1.2,
    });
  }
  return stars;
}

const STARS = makeStars();
const NEBULAE = [
  { x: 220, y: 160, radius: 260, colour: '27,16,64' },
  { x: 1050, y: 560, radius: 300, colour: '10,42,61' },
  { x: 980, y: 120, radius: 200, colour: '48,16,64' },
  { x: 180, y: 600, radius: 220, colour: '10,42,61' },
];

function circle(context, x, y, radius) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawShip(context, x, y, angle, colour, core) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.shadowColor = colour;
  context.shadowBlur = 18;
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(18, 0);
  context.lineTo(-12, -11);
  context.lineTo(-6, 0);
  context.lineTo(-12, 11);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = core;
  context.beginPath();
  context.moveTo(10, 0);
  context.lineTo(-6, -5);
  context.lineTo(-2, 0);
  context.lineTo(-6, 5);
  context.closePath();
  context.fill();
  context.restore();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');

  function resize() {
    const width = canvas.clientWidth * window.devicePixelRatio;
    const height = canvas.clientHeight * window.devicePixelRatio;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawBackdrop(time) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const nebula of NEBULAE) {
      const gradient = context.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
      gradient.addColorStop(0, `rgba(${nebula.colour},0.55)`);
      gradient.addColorStop(1, `rgba(${nebula.colour},0)`);
      context.fillStyle = gradient;
      context.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2);
    }
    for (const star of STARS) {
      const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));
      context.globalAlpha = alpha;
      context.fillStyle = '#dfe9ff';
      circle(context, star.x, star.y, star.radius);
    }
    context.globalAlpha = 1;
  }

  function drawWisp(enemy, time) {
    const spec = WISP[enemy.type];
    const pulse = 1 + 0.12 * Math.sin(time * 5 + enemy.seed);
    const radius = enemy.radius * pulse;
    // The trailing wisp: a fading tail behind its drift.
    const tail = 26;
    const gradient = context.createLinearGradient(
      enemy.x, enemy.y,
      enemy.x - Math.cos(enemy.angle) * tail,
      enemy.y - Math.sin(enemy.angle) * tail,
    );
    gradient.addColorStop(0, spec.colour);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = 0.5;
    context.strokeStyle = gradient;
    context.lineWidth = radius * 0.9;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(enemy.x, enemy.y);
    context.lineTo(enemy.x - Math.cos(enemy.angle) * tail, enemy.y - Math.sin(enemy.angle) * tail);
    context.stroke();
    context.globalAlpha = 1;
    // The glowing body, bright core, and (for a brute) its hit points as a ring.
    context.shadowColor = spec.colour;
    context.shadowBlur = 22;
    context.fillStyle = spec.colour;
    circle(context, enemy.x, enemy.y, radius);
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(255,255,255,0.85)';
    circle(context, enemy.x, enemy.y, radius * 0.38);
    if (enemy.type === 'darter' && enemy.state === 'aim') {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(enemy.x, enemy.y, radius + 6, 0, Math.PI * 2);
      context.stroke();
    }
    if (enemy.maxHp > 1) {
      context.strokeStyle = 'rgba(255,255,255,0.65)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(enemy.x, enemy.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * enemy.hp) / enemy.maxHp);
      context.stroke();
    }
  }

  function drawHud(state, muted) {
    context.textBaseline = 'alphabetic';
    // Score, top left.
    context.fillStyle = PALETTE.text;
    context.font = `700 30px ${FONT}`;
    context.textAlign = 'left';
    context.fillText(`SCORE ${state.score}`, 24, 44);
    context.fillStyle = PALETTE.muted;
    context.font = `500 16px ${FONT}`;
    context.fillText(`WAVE ${state.wave}`, 24, 70);
    // Lives, top right: one little ship per life.
    context.textAlign = 'right';
    context.fillStyle = PALETTE.text;
    context.font = `700 20px ${FONT}`;
    context.fillText('LIVES', FIELD.width - 24, 40);
    for (let i = 0; i < state.lives; i += 1) {
      drawShip(context, FIELD.width - 40 - i * 34, 62, -Math.PI / 2, PALETTE.player, PALETTE.playerCore);
    }
    // Nova charge, bottom centre.
    const barWidth = 260;
    const barX = (FIELD.width - barWidth) / 2;
    const barY = FIELD.height - 34;
    const full = state.novaCharge >= 8;
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(barX, barY, barWidth, 12);
    context.fillStyle = full ? PALETTE.nova : PALETTE.shard;
    context.shadowColor = full ? PALETTE.nova : PALETTE.shard;
    context.shadowBlur = full ? 14 : 0;
    context.fillRect(barX, barY, (barWidth * state.novaCharge) / 8, 12);
    context.shadowBlur = 0;
    context.fillStyle = full ? PALETTE.nova : PALETTE.muted;
    context.font = `700 15px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(full ? 'NOVA READY — press E' : `NOVA ${state.novaCharge}/8`, FIELD.width / 2, barY - 8);
    // Mute, bottom right.
    context.fillStyle = PALETTE.muted;
    context.font = `500 14px ${FONT}`;
    context.textAlign = 'right';
    context.fillText(muted ? 'M — sound off' : 'M — mute', FIELD.width - 24, FIELD.height - 18);
  }

  function drawTitle(state, best) {
    context.fillStyle = 'rgba(7,10,24,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textAlign = 'center';
    context.shadowColor = '#5df2ff';
    context.shadowBlur = 32;
    context.fillStyle = '#bff6ff';
    context.font = `800 92px ${FONT}`;
    context.fillText('STARFALL', FIELD.width / 2, 250);
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.text;
    context.font = `500 24px ${FONT}`;
    context.fillText('Blast the void wisps. Gather star shards. Unleash the Nova.', FIELD.width / 2, 306);
    context.fillStyle = PALETTE.muted;
    context.font = `500 19px ${FONT}`;
    context.fillText('WASD / arrows — fly      Mouse — aim      Hold click / Space — shoot', FIELD.width / 2, 372);
    context.fillText('E / right-click — Nova when charged      R — restart      P — pause', FIELD.width / 2, 402);
    context.fillStyle = PALETTE.shard;
    context.font = `700 26px ${FONT}`;
    context.fillText('Click or press Space to begin', FIELD.width / 2, 478);
    if (best > 0) {
      context.fillStyle = PALETTE.muted;
      context.font = `500 18px ${FONT}`;
      context.fillText(`Best score: ${best}`, FIELD.width / 2, 520);
    }
  }

  function drawPaused() {
    context.fillStyle = 'rgba(7,10,24,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textAlign = 'center';
    context.fillStyle = PALETTE.text;
    context.font = `800 56px ${FONT}`;
    context.fillText('PAUSED', FIELD.width / 2, 350);
    context.fillStyle = PALETTE.muted;
    context.font = `500 20px ${FONT}`;
    context.fillText('Press P or Space to keep playing', FIELD.width / 2, 396);
  }

  function drawOver(state, best) {
    context.fillStyle = 'rgba(7,10,24,0.68)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textAlign = 'center';
    context.shadowColor = '#ff5d73';
    context.shadowBlur = 28;
    context.fillStyle = '#ffb3bd';
    context.font = `800 72px ${FONT}`;
    context.fillText('THE VOID TAKES YOU', FIELD.width / 2, 280);
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.text;
    context.font = `700 34px ${FONT}`;
    context.fillText(`Final score: ${state.score}`, FIELD.width / 2, 350);
    context.fillStyle = state.score >= best && state.score > 0 ? PALETTE.shard : PALETTE.muted;
    context.font = `500 22px ${FONT}`;
    context.fillText(state.score >= best && state.score > 0 ? 'A new best!' : `Best: ${best}`, FIELD.width / 2, 390);
    context.fillStyle = PALETTE.muted;
    context.font = `500 19px ${FONT}`;
    context.fillText(`You fell on wave ${state.wave} after ${state.kills} wisps destroyed.`, FIELD.width / 2, 428);
    context.fillStyle = PALETTE.shard;
    context.font = `700 24px ${FONT}`;
    context.fillText('Press R or click to fly again', FIELD.width / 2, 492);
  }

  function draw(state, screen, best, muted) {
    resize();
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const offsetX = (canvas.width - FIELD.width * scale) / 2;
    const offsetY = (canvas.height - FIELD.height * scale) / 2;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#04060f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // The shake: a random offset that fades with the world's shake.
    const shakeX = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    context.setTransform(scale, 0, 0, scale, offsetX + shakeX * scale, offsetY + shakeY * scale);

    drawBackdrop(state.time);

    // Shards.
    for (const shard of state.shards) {
      const twinkle = 0.7 + 0.3 * Math.sin(state.time * 6 + shard.x);
      context.globalAlpha = twinkle;
      context.shadowColor = PALETTE.shard;
      context.shadowBlur = 14;
      context.fillStyle = PALETTE.shard;
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(state.time * 1.5);
      context.fillRect(-shard.radius * 0.6, -shard.radius * 0.6, shard.radius * 1.2, shard.radius * 1.2);
      context.restore();
      context.shadowBlur = 0;
      context.fillStyle = PALETTE.shardCore;
      circle(context, shard.x, shard.y, shard.radius * 0.32);
      context.globalAlpha = 1;
    }

    // Enemies.
    for (const enemy of state.enemies) drawWisp(enemy, state.time);

    // Bullets.
    for (const bullet of state.bullets) {
      context.shadowColor = PALETTE.bullet;
      context.shadowBlur = 12;
      context.fillStyle = PALETTE.bullet;
      circle(context, bullet.x, bullet.y, bullet.radius);
    }
    context.shadowBlur = 0;

    // The player ship, blinking while invulnerable, with an engine trail.
    if (screen !== SCREEN_OVER || !state.over) {
      const player = state.player;
      const blink = player.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0;
      if (!blink) {
        const trail = 22;
        const gradient = context.createLinearGradient(
          player.x, player.y,
          player.x - Math.cos(player.angle) * trail,
          player.y - Math.sin(player.angle) * trail,
        );
        gradient.addColorStop(0, 'rgba(93,242,255,0.7)');
        gradient.addColorStop(1, 'rgba(93,242,255,0)');
        context.strokeStyle = gradient;
        context.lineWidth = 5;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(player.x - Math.cos(player.angle) * 10, player.y - Math.sin(player.angle) * 10);
        context.lineTo(player.x - Math.cos(player.angle) * trail, player.y - Math.sin(player.angle) * trail);
        context.stroke();
        drawShip(context, player.x, player.y, player.angle, PALETTE.player, PALETTE.playerCore);
      }
    }

    // Particles.
    for (const particle of state.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.colour;
      circle(context, particle.x, particle.y, particle.radius);
    }
    context.globalAlpha = 1;

    // Nova rings.
    for (const ring of state.rings) {
      context.globalAlpha = Math.max(0, ring.life / 0.7);
      context.strokeStyle = ring.colour;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;

    // Score popups.
    context.textAlign = 'center';
    for (const popupItem of state.popups) {
      context.globalAlpha = Math.max(0, popupItem.life);
      context.fillStyle = popupItem.colour;
      context.font = `700 18px ${FONT}`;
      context.fillText(popupItem.text, popupItem.x, popupItem.y);
    }
    context.globalAlpha = 1;

    // The Nova flash.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255,233,168,${state.flash * 0.45})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    // The wave banner.
    if (state.bannerTimer > 0 && state.banner !== '') {
      context.globalAlpha = Math.min(1, state.bannerTimer);
      context.textAlign = 'center';
      context.shadowColor = '#5df2ff';
      context.shadowBlur = 24;
      context.fillStyle = '#bff6ff';
      context.font = `800 54px ${FONT}`;
      context.fillText(state.banner, FIELD.width / 2, 300);
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    }

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, muted);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  return { draw };
}
