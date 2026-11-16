// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
/** The play scene runs until the sky is busy (at least this many wisps up, a few seconds in),
 * so the frame shows the fight, not a breather between waves; the cap is a backstop. */
const PLAY_MIN_SECONDS = 8;
const PLAY_MAX_SECONDS = 30;
const PLAY_MIN_ENEMIES = 4;
/** The end scene plays properly first, so the game over carries a real score, then gives up. */
const END_ACTIVE_SECONDS = 15;
const END_LIMIT_SECONDS = 600;

/** The nearest live enemy, or null. */
function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

/** The nearest shard, or null. */
function nearestShard(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const shard of state.shards) {
    const distance = Math.hypot(shard.x - state.player.x, shard.y - state.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = shard;
    }
  }
  return best;
}

/**
 * The play pilot: chase shards, keep a fighting distance from the nearest wisp, shoot it, and
 * let the Nova go when it is charged and the sky is full.
 */
function playPilot(state) {
  const player = state.player;
  const enemy = nearestEnemy(state);
  const shard = nearestShard(state);
  let moveX = 0;
  let moveY = 0;
  if (shard !== null && Math.hypot(shard.x - player.x, shard.y - player.y) < 340) {
    const dx = shard.x - player.x;
    const dy = shard.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    moveX = dx / length;
    moveY = dy / length;
  } else if (enemy !== null) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    // Too close: back off. Too far: close in. In between: strafe sideways.
    const radial = distance < 170 ? 1 : distance > 320 ? -1 : 0;
    const strafe = radial === 0 ? 1 : 0.3;
    moveX = (dx / distance) * radial + (-dy / distance) * strafe;
    moveY = (dy / distance) * radial + (dx / distance) * strafe;
    const length = Math.hypot(moveX, moveY) || 1;
    moveX /= length;
    moveY /= length;
  } else {
    // Nothing to do: drift back to the middle of the field.
    const dx = FIELD.width / 2 - player.x;
    const dy = FIELD.height / 2 - player.y;
    const length = Math.hypot(dx, dy);
    if (length > 40) {
      moveX = dx / length;
      moveY = dy / length;
    }
  }
  return {
    moveX,
    moveY,
    aimX: enemy === null ? player.x : enemy.x,
    aimY: enemy === null ? player.y - 120 : enemy.y,
    firing: enemy !== null,
    nova: state.novaCharge >= 8 && state.enemies.length >= 4,
  };
}

/** The end pilot: it never shoots and barely moves, so the wisps catch it, as a new player is. */
function endPilot(state) {
  const player = state.player;
  const dx = FIELD.width / 2 - player.x;
  const dy = FIELD.height / 2 - player.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    moveX: length > 60 ? (dx / length) * 0.3 : 0,
    moveY: length > 60 ? (dy / length) * 0.3 : 0,
    aimX: player.x,
    aimY: player.y - 120,
    firing: false,
    nova: false,
  };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 240, firing: false, nova: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let index = 0; index < PLAY_MAX_SECONDS / STEP; index += 1) {
      if (world.step(STEP, playPilot(world.state), false) & EVENT_OVER) break;
      const state = world.state;
      if (state.time >= PLAY_MIN_SECONDS && state.enemies.length >= PLAY_MIN_ENEMIES) break;
    }
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // End: fight for a while, then stop shooting and drift, until the wisps take the ship.
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    const pilot = world.state.time < END_ACTIVE_SECONDS ? playPilot : endPilot;
    if (world.step(STEP, pilot(world.state), false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
