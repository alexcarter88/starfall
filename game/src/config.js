// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 340,
  /** Seconds between shots while firing. */
  fireInterval: 0.14,
  /** Seconds of mercy after a hit. */
  invulnerable: 2,
};

export const BULLET = {
  radius: 4,
  speed: 780,
  damage: 1,
  /** Seconds a bullet lives before it fades. */
  life: 0.9,
};

/** The four void wisps. hp is how many hits one takes; score is what it pays; shard is the
 * chance it drops a star shard; speed is its drift toward the player. */
export const WISP = {
  ember: { radius: 12, hp: 1, speed: 120, score: 10, shard: 0.5, colour: '#ff7a59' },
  wisp: { radius: 18, hp: 2, speed: 78, score: 25, shard: 0.8, colour: '#c26bff' },
  brute: { radius: 28, hp: 4, speed: 46, score: 50, shard: 1, colour: '#ff4d6d' },
  darter: { radius: 10, hp: 1, speed: 70, score: 15, shard: 0.5, colour: '#ffcf4d' },
};

export const LIVES = 3;

/** How many shards a full Nova takes. */
export const NOVA_SHARDS = 8;
/** A Nova pays half of each cleared enemy's score. */
export const NOVA_SCORE_SHARE = 0.5;

export const SHARD = {
  radius: 9,
  /** Seconds a shard lasts before it winks out. */
  life: 9,
  /** Inside this distance a shard is pulled toward the player. */
  magnet: 130,
  magnetSpeed: 320,
};

export const WAVE = {
  /** First wave's enemy count; each later wave adds perWave. */
  firstCount: 7,
  perWave: 4,
  /** Seconds between spawns at wave 1; each wave multiplies it by scale, down to min. */
  interval: 1.1,
  intervalScale: 0.9,
  minInterval: 0.35,
  /** Speed multiplier per wave, capped. */
  speedPerWave: 0.07,
  speedMax: 1.8,
  /** Seconds of calm between waves. */
  breather: 1.6,
};

/** How many bullets, enemies, shards and particles can exist at once; the pools are fixed. */
export const POOL = { bullets: 96, enemies: 48, shards: 40, particles: 320, popups: 24 };

export const PALETTE = {
  backdrop: '#070a18',
  nebulaA: '#1b1040',
  nebulaB: '#0a2a3d',
  player: '#5df2ff',
  playerCore: '#e8feff',
  bullet: '#aef7ff',
  shard: '#ffd94d',
  shardCore: '#fff6c9',
  nova: '#ffe9a8',
  panel: '#12172b',
  text: '#eef1f5',
  muted: '#8b93a3',
  danger: '#ff5d73',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'starfall.best';

/**
 * The letterbox that fits the 1280x720 field into a window of the given size: the scale and the
 * offset of the field's top-left corner, in window pixels. The renderer and the input share it,
 * so a click always lands where the eye sees it.
 */
export function fitField(windowWidth, windowHeight) {
  const scale = Math.min(windowWidth / FIELD.width, windowHeight / FIELD.height);
  return {
    scale,
    offsetX: (windowWidth - FIELD.width * scale) / 2,
    offsetY: (windowHeight - FIELD.height * scale) / 2,
  };
}
