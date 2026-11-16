// Every sound is synthesized with WebAudio: no audio files, nothing fetched. The context is
// created lazily on the first sound (browsers block audio before a gesture), and every call is
// guarded so a missing context never breaks the game.

function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function resume() {
    if (context !== null && context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  /** A short oscillator blip that slides from `from` Hz to `to` Hz over `seconds`. */
  function blip({ from, to, seconds, type = 'square', volume = 0.5, delay = 0 }) {
    if (!ensure() || muted) return;
    resume();
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise, for explosions. */
  function noise({ seconds, volume = 0.6, frequency = 1200, delay = 0 }) {
    if (!ensure() || muted) return;
    resume();
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    /** Unlock audio from a user gesture (click or key). */
    unlock() {
      if (ensure()) resume();
    },
    shoot() {
      blip({ from: 880, to: 220, seconds: 0.07, type: 'square', volume: 0.16 });
    },
    explosion(big) {
      noise({ seconds: big ? 0.5 : 0.25, volume: big ? 0.6 : 0.35, frequency: big ? 700 : 1400 });
      blip({ from: 160, to: 40, seconds: big ? 0.4 : 0.2, type: 'sine', volume: 0.4 });
    },
    pickup() {
      blip({ from: 1320, to: 1760, seconds: 0.09, type: 'sine', volume: 0.25 });
    },
    nova() {
      blip({ from: 220, to: 1760, seconds: 0.5, type: 'sawtooth', volume: 0.3 });
      noise({ seconds: 0.6, volume: 0.4, frequency: 2400 });
    },
    hit() {
      blip({ from: 300, to: 60, seconds: 0.3, type: 'sawtooth', volume: 0.5 });
      noise({ seconds: 0.3, volume: 0.4, frequency: 900 });
    },
    wave() {
      blip({ from: 523, to: 523, seconds: 0.1, type: 'sine', volume: 0.25 });
      blip({ from: 784, to: 784, seconds: 0.14, type: 'sine', volume: 0.25, delay: 0.1 });
    },
    gameOver() {
      blip({ from: 392, to: 392, seconds: 0.22, type: 'triangle', volume: 0.4 });
      blip({ from: 311, to: 311, seconds: 0.22, type: 'triangle', volume: 0.4, delay: 0.22 });
      blip({ from: 233, to: 116, seconds: 0.5, type: 'triangle', volume: 0.4, delay: 0.44 });
    },
  };
}

export const audio = createAudio();
