// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_HIT, EVENT_KILL, EVENT_NOVA, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT, EVENT_WAVE,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { audio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, audio.muted);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  /** A Nova pressed between frames, kept until the next step spends it. */
  let novaQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Playing. ${LIVES} lives.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_KILL) audio.explosion(false);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_WAVE) audio.wave();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_NOVA) novaQueued = true;
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_PLAY)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 240, firing: false, nova: false }, true);
      return;
    }
    const aim = input.aim();
    const move = input.direction();
    const events = world.step(STEP, {
      moveX: move.x,
      moveY: move.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      nova: input.novaHeld() || novaQueued,
    }, false);
    novaQueued = false;
    playEvents(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.muted);
  }

  // Leaving the tab pauses a running game rather than letting wisps close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Starfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
