// Keyboard and mouse: WASD or arrows to move, the mouse to aim, hold click or Space to shoot.
// Edge-triggered actions (confirm, nova, restart, mute, pause) are consumed once per press.

import { FIELD, fitField } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_NOVA = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_PAUSE = 16;

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2 - 120, down: false };
  let queued = 0;
  let rightDown = false;

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const fit = fitField(rect.width, rect.height);
    return {
      x: (clientX - rect.left - fit.offsetX) / fit.scale,
      y: (clientY - rect.top - fit.offsetY) / fit.scale,
    };
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') {
      queued |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyE') {
      queued |= ACTION_NOVA;
    } else if (event.code === 'KeyR') {
      queued |= ACTION_RESTART;
    } else if (event.code === 'KeyM') {
      queued |= ACTION_MUTE;
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      queued |= ACTION_PAUSE;
    }
    if (MOVE_KEYS[event.code] || event.code === 'Space') event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
  }

  function onMouseDown(event) {
    const point = toField(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    if (event.button === 0) {
      mouse.down = true;
      queued |= ACTION_CONFIRM;
    } else if (event.button === 2) {
      rightDown = true;
      queued |= ACTION_NOVA;
    }
    event.preventDefault();
  }

  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
    else if (event.button === 2) rightDown = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
    rightDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onBlur);

  return {
    /** Normalised movement direction from the held keys. */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const move = MOVE_KEYS[code];
        if (move) {
          x += move[0];
          y += move[1];
        }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** Where the mouse aims, in field coordinates. */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** True while the player holds fire (left mouse or Space). */
    firing() {
      return mouse.down || keys.has('Space');
    },
    /** True while the player holds the Nova trigger (E or right mouse). */
    novaHeld() {
      return rightDown || keys.has('KeyE');
    },
    /** The actions pressed since the last call, then cleared. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
