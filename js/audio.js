/* ============================================================
   NEON SWARM — procedural audio engine
   ------------------------------------------------------------
   Every sound in this game is synthesized at runtime with the
   Web Audio API. There are zero audio files. SFX are tiny synth
   patches; the soundtrack is a generative synthwave loop built
   from a bass, an arpeggio, a pad and a drum machine, scheduled
   with a look-ahead clock.

   Exposes: window.Sound
   ============================================================ */
(function () {
  'use strict';

  let ac = null;            // AudioContext
  let master, sfxBus, musBus, comp;
  let started = false;
  let muted = false;
  let musicOn = true;
  let intensity = 0;        // 0..1, raised as the game heats up

  /* ---- lifecycle ---- */
  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }

    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 28;
    comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.25;

    master = ac.createGain(); master.gain.value = 0.9;
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.85;
    musBus = ac.createGain(); musBus.gain.value = 0.0; // faded in when music starts

    sfxBus.connect(comp); musBus.connect(comp);
    comp.connect(master); master.connect(ac.destination);
    return true;
  }

  // Must be called from a user gesture (click / key / touch).
  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume();
    started = true;
  }

  /* ---- low-level helpers ---- */
  function now() { return ac.currentTime; }

  // A short ADSR-ish envelope on a gain node.
  function env(g, t, a, d, s, sus, rel, peak) {
    const G = g.gain;
    G.cancelScheduledValues(t);
    G.setValueAtTime(0.0001, t);
    G.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    G.exponentialRampToValueAtTime(Math.max(peak * s, 0.0002), t + a + d);
    G.setValueAtTime(Math.max(peak * s, 0.0002), t + a + d + sus);
    G.exponentialRampToValueAtTime(0.0001, t + a + d + sus + rel);
  }

  // White-noise buffer (cached).
  let _noise = null;
  function noiseBuf() {
    if (_noise) return _noise;
    const n = ac.sampleRate * 1.0;
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    _noise = b;
    return b;
  }

  function osc(type, freq, dest, t) {
    const o = ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    return o;
  }

  /* ============================================================
     SFX — each returns nothing, fires-and-forgets
     ============================================================ */
  function blip(opts) {
    if (!started || muted || !ac) return;
    const t = now();
    const {
      type = 'square', f0 = 440, f1 = f0, dur = 0.12,
      vol = 0.3, a = 0.005, d = 0.04, s = 0.4, rel = 0.06,
      bus = sfxBus, detune = 0
    } = opts;
    const g = ac.createGain();
    const o = osc(type, f0, g, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.connect(bus);
    env(g, t, a, d, s, Math.max(dur - a - d, 0), rel, vol);
    o.start(t); o.stop(t + dur + rel + 0.02);
  }

  function noiseHit(opts) {
    if (!started || muted || !ac) return;
    const t = now();
    const { dur = 0.18, vol = 0.4, f = 1800, q = 1, type = 'lowpass', bus = sfxBus } = opts;
    const src = ac.createBufferSource(); src.buffer = noiseBuf();
    const flt = ac.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = ac.createGain();
    src.connect(flt); flt.connect(g); g.connect(bus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Throttle for very frequent sounds (shooting) so they don't pile up.
  const last = {};
  function throttled(key, ms) {
    const t = performance.now();
    if (last[key] && t - last[key] < ms) return false;
    last[key] = t; return true;
  }

  const SFX = {
    shoot() {
      if (!throttled('shoot', 55)) return;
      blip({ type: 'triangle', f0: 880, f1: 420, dur: 0.08, vol: 0.10, d: 0.02, s: 0.2, rel: 0.04 });
    },
    laser() {
      if (!throttled('laser', 90)) return;
      blip({ type: 'sawtooth', f0: 1200, f1: 300, dur: 0.14, vol: 0.10, d: 0.03, s: 0.25, rel: 0.05 });
    },
    zap() {
      if (!throttled('zap', 60)) return;
      blip({ type: 'square', f0: 2200, f1: 600, dur: 0.10, vol: 0.10, d: 0.02, s: 0.2, rel: 0.05 });
      noiseHit({ dur: 0.08, vol: 0.10, f: 4000, type: 'highpass' });
    },
    hit() {
      if (!throttled('hit', 40)) return;
      noiseHit({ dur: 0.06, vol: 0.10, f: 2600, q: 0.7, type: 'bandpass' });
    },
    explode() {
      noiseHit({ dur: 0.4, vol: 0.5, f: 900, q: 0.6 });
      blip({ type: 'sine', f0: 160, f1: 40, dur: 0.4, vol: 0.4, d: 0.1, s: 0.3, rel: 0.2 });
    },
    bigExplode() {
      noiseHit({ dur: 0.8, vol: 0.6, f: 600, q: 0.5 });
      blip({ type: 'sine', f0: 120, f1: 28, dur: 0.8, vol: 0.55, d: 0.15, s: 0.4, rel: 0.4 });
      blip({ type: 'sawtooth', f0: 80, f1: 20, dur: 0.7, vol: 0.25, d: 0.1, s: 0.3, rel: 0.3 });
    },
    nova() {
      blip({ type: 'sine', f0: 300, f1: 900, dur: 0.3, vol: 0.25, a: 0.01, d: 0.05, s: 0.5, rel: 0.15 });
      noiseHit({ dur: 0.25, vol: 0.18, f: 1200, type: 'highpass' });
    },
    pickup() {
      if (!throttled('pickup', 30)) return;
      blip({ type: 'triangle', f0: 700, f1: 1300, dur: 0.08, vol: 0.12, d: 0.02, s: 0.5, rel: 0.05 });
    },
    coin() {
      blip({ type: 'square', f0: 988, dur: 0.06, vol: 0.18, d: 0.01, s: 0.6, rel: 0.05 });
      setTimeout(() => blip({ type: 'square', f0: 1319, dur: 0.12, vol: 0.18, d: 0.02, s: 0.5, rel: 0.08 }), 55);
    },
    levelup() {
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => setTimeout(() =>
        blip({ type: 'triangle', f0: f, dur: 0.18, vol: 0.22, d: 0.04, s: 0.6, rel: 0.12 }), i * 70));
    },
    hurt() {
      blip({ type: 'sawtooth', f0: 320, f1: 90, dur: 0.22, vol: 0.32, d: 0.05, s: 0.4, rel: 0.12 });
      noiseHit({ dur: 0.12, vol: 0.2, f: 800, type: 'lowpass' });
    },
    dash() {
      blip({ type: 'sine', f0: 200, f1: 700, dur: 0.16, vol: 0.18, a: 0.005, d: 0.03, s: 0.4, rel: 0.08 });
      noiseHit({ dur: 0.16, vol: 0.12, f: 3000, type: 'highpass' });
    },
    select() { blip({ type: 'square', f0: 660, f1: 880, dur: 0.07, vol: 0.16, d: 0.02, s: 0.5, rel: 0.05 }); },
    hover() { blip({ type: 'sine', f0: 520, dur: 0.04, vol: 0.06, d: 0.01, s: 0.4, rel: 0.03 }); },
    boss() {
      blip({ type: 'sawtooth', f0: 80, f1: 55, dur: 1.2, vol: 0.4, a: 0.02, d: 0.2, s: 0.6, rel: 0.5 });
      blip({ type: 'square', f0: 110, f1: 82, dur: 1.0, vol: 0.18, a: 0.02, d: 0.2, s: 0.5, rel: 0.4 });
    },
    gameover() {
      const seq = [440, 392, 349, 262];
      seq.forEach((f, i) => setTimeout(() =>
        blip({ type: 'sawtooth', f0: f, f1: f * 0.98, dur: 0.5, vol: 0.28, d: 0.1, s: 0.5, rel: 0.3 }), i * 180));
    }
  };

  /* ============================================================
     MUSIC — generative synthwave, look-ahead scheduler
     ============================================================ */
  // A minor-ish progression (semitone offsets from A2=110Hz root sets).
  // Each chord: [root, third, fifth, octave] as MIDI-ish note numbers.
  const A = 9; // A
  const PROG = [
    // i  - VI - III - VII  (Am - F - C - G) feel, in octaves chosen per voice
    { root: 33, notes: [33, 36, 40, 45] }, // Am
    { root: 29, notes: [29, 33, 36, 41] }, // F
    { root: 36, notes: [36, 40, 43, 48] }, // C
    { root: 31, notes: [31, 35, 38, 43] }, // G
  ];
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  let schedTimer = null;
  let step16 = 0;
  let nextTime = 0;
  let bpm = 112;
  const STEPS = 64;               // 4 bars of 16th notes
  function spb() { return 60 / bpm; }        // sec per beat
  function sp16() { return spb() / 4; }       // sec per 16th

  function pluck(freq, t, dur, vol, type) {
    const g = ac.createGain();
    const o = osc(type || 'sawtooth', freq, g, t);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(2600 + 2000 * intensity, t + 0.02);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    o.disconnect(); o.connect(f); f.connect(g); g.connect(musBus);
    env(g, t, 0.005, 0.06, 0.3, dur * 0.5, dur * 0.5, vol);
    o.start(t); o.stop(t + dur + 0.1);
  }

  function bass(freq, t, dur, vol) {
    const g = ac.createGain();
    const o = osc('sawtooth', freq, g, t);
    const o2 = osc('square', freq * 0.5, g, t);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 400 + 500 * intensity; f.Q.value = 6;
    o.disconnect(); o2.disconnect();
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musBus);
    env(g, t, 0.006, 0.05, 0.7, dur * 0.6, dur * 0.4, vol);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  function pad(chord, t, dur, vol) {
    chord.notes.forEach((n, i) => {
      const g = ac.createGain();
      const o = osc('sawtooth', midi(n + 12), g, t);
      o.detune.value = (i - 1.5) * 8;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1200 + 800 * intensity;
      o.disconnect(); o.connect(f); f.connect(g); g.connect(musBus);
      env(g, t, 0.25, 0.2, 0.7, dur * 0.5, dur * 0.5, vol);
      o.start(t); o.stop(t + dur + 0.3);
    });
  }

  function kick(t, vol) {
    const g = ac.createGain();
    const o = osc('sine', 150, g, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.connect(musBus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  }
  function snare(t, vol) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf();
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    const g = ac.createGain();
    src.connect(f); f.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.start(t); src.stop(t + 0.18);
  }
  function hat(t, vol) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf();
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ac.createGain();
    src.connect(f); f.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.start(t); src.stop(t + 0.06);
  }

  // Arp pattern indices into chord.notes, per 16th in a bar.
  const ARP = [0, 2, 1, 3, 2, 3, 1, 2, 0, 2, 1, 3, 2, 1, 3, 2];

  function scheduleStep(i, t) {
    const bar = Math.floor(i / 16) % PROG.length;
    const inBar = i % 16;
    const chord = PROG[bar];

    // Bass on the beat + a touch of syncopation when intense.
    if (inBar % 4 === 0) bass(midi(chord.root - 12), t, sp16() * 3.5, 0.22);
    else if (intensity > 0.4 && inBar % 4 === 2) bass(midi(chord.root - 12), t, sp16() * 1.2, 0.12);

    // Pad once per bar.
    if (inBar === 0) pad(chord, t, spb() * 4, 0.05 + 0.03 * intensity);

    // Arp — denser with intensity.
    const arpGate = intensity > 0.25 || inBar % 2 === 0;
    if (arpGate) {
      const note = chord.notes[ARP[inBar % ARP.length]];
      pluck(midi(note + 12), t, sp16() * 1.6, 0.07 + 0.05 * intensity, intensity > 0.6 ? 'square' : 'sawtooth');
    }

    // Drums.
    if (inBar === 0 || inBar === 8 || (intensity > 0.3 && inBar === 6)) kick(t, 0.6);
    if (inBar === 4 || inBar === 12) snare(t, 0.3 + 0.1 * intensity);
    if (inBar % 2 === 0) hat(t, 0.06 + 0.05 * intensity);
    if (intensity > 0.5 && inBar % 2 === 1) hat(t, 0.04);
  }

  function tick() {
    if (!ac) return;
    while (nextTime < now() + 0.18) {
      scheduleStep(step16, nextTime);
      nextTime += sp16();
      step16 = (step16 + 1) % STEPS;
    }
  }

  function startMusic() {
    if (!started || !ac || !musicOn) return;
    if (schedTimer) return;
    step16 = 0;
    nextTime = now() + 0.08;
    musBus.gain.cancelScheduledValues(now());
    musBus.gain.setValueAtTime(0.0001, now());
    musBus.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.5, now() + 1.5);
    schedTimer = setInterval(tick, 40);
  }
  function stopMusic() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (ac && musBus) {
      musBus.gain.cancelScheduledValues(now());
      musBus.gain.setValueAtTime(musBus.gain.value, now());
      musBus.gain.exponentialRampToValueAtTime(0.0001, now() + 0.4);
    }
  }

  /* ---- controls ---- */
  function setMuted(m) {
    muted = m;
    if (!ac) return;
    master.gain.setTargetAtTime(m ? 0.0001 : 0.9, now(), 0.02);
  }
  function toggleMute() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }
  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }
  function setMusicTempo(b) { bpm = b; }

  window.Sound = {
    unlock, sfx: SFX, startMusic, stopMusic,
    setMuted, toggleMute, isMuted, setIntensity, setMusicTempo,
    get ready() { return started; }
  };
})();
