// IKONIQ « Le Relais » — musique 25 s, 120 BPM, ré mineur.
// Synchro (secondes) : 0 intro battement de cœur · 3.0 le relais démarre ·
// 9.5 coupure sèche (« HEIN ? ») · 14.7 whoosh · 15.0 reprise IKONIQ ·
// 19.0 musique étouffée (« l'ambiance ») · 23.0 stop (« IKONIQ, j'écoute ») · 24.0 coup final.
'use strict';
const fs = require('fs');
const path = require('path');

const SR = 44100;
const DUR = 25.0;
const N = Math.round(SR * DUR);
const BEAT = 0.5;          // 120 BPM
const S16 = BEAT / 4;      // double croche

const L = new Float32Array(N), R = new Float32Array(N);       // bus musique
const SL = new Float32Array(N), SRv = new Float32Array(N);    // envoi reverb

// PRNG déterministe
let seed = 0x1c0417;
function rnd() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mix(buf, time, gain = 1, pan = 0, send = 0) {
  const start = Math.round(time * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < buf.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= N) break;
    L[j] += buf[i] * gl; R[j] += buf[i] * gr;
    if (send) { SL[j] += buf[i] * gl * send; SRv[j] += buf[i] * gr * send; }
  }
}

// ---------- filtres ----------
function onePoleLP(buf, fc) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] = y; }
  return buf;
}
function onePoleHP(buf, fc) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] = buf[i] - y; }
  return buf;
}
// SVF Chamberlin, cutoff éventuellement variable (fonction de i)
function svf(buf, fcFn, Q = 0.8, mode = 'lp') {
  let low = 0, band = 0;
  const q = 1 / Q;
  for (let i = 0; i < buf.length; i++) {
    const fc = Math.min(typeof fcFn === 'function' ? fcFn(i) : fcFn, SR / 6.5);
    const f = 2 * Math.sin(Math.PI * fc / SR);
    low += f * band;
    const high = buf[i] - low - q * band;
    band += f * high;
    buf[i] = mode === 'lp' ? low : mode === 'bp' ? band : high;
  }
  return buf;
}

// ---------- oscillateurs ----------
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function sawVoice(freq, len, detuneCents = [0]) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  for (const c of detuneCents) {
    const f = freq * Math.pow(2, c / 1200);
    const dt = f / SR;
    let ph = rnd();
    for (let i = 0; i < n; i++) {
      out[i] += (2 * ph - 1 - polyblep(ph, dt)) / detuneCents.length;
      ph += dt; if (ph >= 1) ph -= 1;
    }
  }
  return out;
}

// ---------- instruments ----------
function kick(len = 0.45, punch = 1) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 44 + (140 - 44) * Math.exp(-t * 28);
    ph += 2 * Math.PI * f / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 7.5);
    if (i < SR * 0.004) out[i] += noise() * 0.35 * punch * (1 - i / (SR * 0.004));
  }
  return out;
}
function clap() {
  const n = Math.round(0.35 * SR);
  const out = new Float32Array(n);
  const bursts = [0, 0.011, 0.022];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = 0;
    for (const b of bursts) if (t >= b) e = Math.max(e, Math.exp(-(t - b) * (b === 0.022 ? 16 : 90)));
    out[i] = noise() * e;
  }
  svf(out, 1400, 1.2, 'bp');
  // corps de caisse claire
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = out[i] * 1.6 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30) * 0.45; }
  return out;
}
function hat(open = false) {
  const len = open ? 0.28 : 0.05;
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise() * Math.exp(-(i / SR) * (open ? 14 : 70));
  onePoleHP(out, 7000); onePoleHP(out, 7000);
  return out;
}
function tom(f0 = 105, f1 = 62, len = 0.7) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 9);
    ph += 2 * Math.PI * f / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 5.5) + (i < SR * 0.02 ? noise() * 0.5 * (1 - i / (SR * 0.02)) : 0);
  }
  return onePoleLP(out, 2200);
}
function impact(len = 2.2) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  let ph = 0;
  const nz = new Float32Array(n);
  for (let i = 0; i < n; i++) nz[i] = noise() * Math.exp(-(i / SR) * 5);
  onePoleLP(nz, 900);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 30 + (85 - 30) * Math.exp(-t * 3);
    ph += 2 * Math.PI * f / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 2.2) * 1.1 + nz[i] * 1.4;
  }
  return out;
}
function crash(len = 2.0) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise() * Math.exp(-(i / SR) * 2.6);
  onePoleHP(out, 4500);
  return out;
}
function riser(len, fStart = 300, fEnd = 6000) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise();
  svf(out, (i) => fStart * Math.pow(fEnd / fStart, i / n), 2.2, 'bp');
  for (let i = 0; i < n; i++) { const x = i / n; out[i] *= Math.pow(x, 2.2) * 1.8; }
  return out;
}
function bassNote(midi, len, cutoff = 520) {
  const out = sawVoice(mtof(midi), len, [-4, 4]);
  const sub = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) sub[i] = Math.sin(2 * Math.PI * mtof(midi) * i / SR);
  svf(out, (i) => cutoff * (1 + 3 * Math.exp(-i / SR * 18)), 1.1, 'lp');
  const a = SR * 0.004, rel = SR * 0.03;
  for (let i = 0; i < out.length; i++) {
    const env = Math.min(1, i / a) * Math.min(1, (out.length - i) / rel);
    out[i] = (out[i] * 0.8 + sub[i] * 0.55) * env;
  }
  return out;
}
function stringNote(midi, len, cutoff) {
  const out = sawVoice(mtof(midi), len, [-9, 0, 8]);
  svf(out, cutoff, 1.0, 'lp');
  const a = SR * 0.006;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] *= Math.min(1, i / a) * Math.exp(-t * 11);
  }
  return out;
}
function brass(midis, len = 0.9, bright = 1) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  for (const m of midis) {
    const v = sawVoice(mtof(m), len, [-7, 7]);
    for (let i = 0; i < n; i++) out[i] += v[i] / midis.length;
  }
  svf(out, (i) => 350 + 3800 * bright * Math.exp(-i / SR * 6), 1.3, 'lp');
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] *= Math.min(1, t / 0.012) * (0.35 + 0.65 * Math.exp(-t * 4)) * Math.min(1, (n - i) / (SR * 0.08));
  }
  return out;
}
function drone(midi, len) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  const f = mtof(midi);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t)) * Math.min(1, t / 0.8) * Math.min(1, (len - t) / 0.2);
  }
  return out;
}

// ---------- harmonie ----------
const CH = {
  Dm: { root: 38, tones: [62, 65, 69], arp: [69, 74, 77, 74] },
  Bb: { root: 34, tones: [58, 62, 65], arp: [70, 74, 77, 74] },
  F:  { root: 41, tones: [60, 65, 69], arp: [69, 72, 77, 72] },
  C:  { root: 36, tones: [60, 64, 67], arp: [67, 72, 76, 72] },
};

function bassLine(chord, t0, t1, cutoff, gain) {
  const pattern = [0, 0, 12, 0, 0, 12, 0, 7]; // en croches
  let k = 0;
  for (let t = t0; t < t1 - 1e-6; t += BEAT / 2, k++) {
    mix(bassNote(CH[chord].root + pattern[k % 8], BEAT / 2 * 0.85, cutoff), t, gain, 0);
  }
}
function ostinato(chord, t0, t1, cutoffFn, gain) {
  let k = 0;
  for (let t = t0; t < t1 - 1e-6; t += S16, k++) {
    const m = CH[chord].arp[k % 4];
    mix(stringNote(m, S16 * 1.6, cutoffFn(t)), t, gain * (k % 4 === 0 ? 1 : 0.78), (k % 2 ? 0.35 : -0.35), 0.18);
  }
}
function drums(t0, t1, { kickG = 1, clapG = 0.55, hatG = 0.16, toms = false, tomG = 0.6 }) {
  for (let t = t0; t < t1 - 1e-6; t += S16) {
    const pos = Math.round((t - t0) / S16) % 16; // position dans la mesure (2 s)
    if (pos % 4 === 0) mix(kick(), t, kickG);
    if (pos === 4 || pos === 12) mix(clap(), t, clapG, 0.05, 0.35);
    if (hatG) mix(hat(pos === 14), t, hatG * (pos % 2 ? 1 : 0.55), 0.3);
    if (toms && [0, 3, 6, 10, 11, 14].includes(pos)) mix(tom(pos >= 10 ? 125 : 100, pos >= 10 ? 75 : 60), t, tomG, pos % 2 ? -0.4 : 0.4, 0.2);
  }
}

// ================== ARRANGEMENT ==================

// A · 0.0–3.0 · le murmure : battement de cœur + tic-tac discret
mix(drone(38, 3.0), 0, 0.10);
for (let b = 0; b < 3; b++) {
  const k1 = onePoleLP(kick(0.35, 0.2), 900), k2 = onePoleLP(kick(0.3, 0.2), 900);
  mix(k1, b, 0.42); mix(k2, b + 0.2, 0.28);
}
for (let t = 0; t < 3.0 - 1e-6; t += BEAT / 2) mix(hat(), t, 0.05, 0.4);
mix(riser(1.0, 250, 5000), 2.0, 0.22, 0, 0.3);

// B · 3.0–9.5 · le relais
mix(impact(1.6), 3.0, 0.75, 0, 0.3);
mix(crash(1.6), 3.0, 0.22, -0.2, 0.2);
const relay = [['Dm', 3.0, 5.0], ['Bb', 5.0, 7.0], ['F', 7.0, 8.0], ['C', 8.0, 9.5]];
for (const [c, a, b] of relay) {
  bassLine(c, a, b, 480, 0.42);
  ostinato(c, a, b, (t) => 900 + 2600 * ((t - 3.0) / 6.5), 0.20);
  mix(brass(CH[c].tones, Math.min(0.9, b - a), 0.7), a, 0.16, 0, 0.35);
}
drums(3.0, 5.0, { toms: false });
drums(5.0, 8.0, { toms: true });
drums(8.0, 9.0, { toms: true, tomG: 0.75 });
// roulement final accéléré
for (let t = 9.0, step = S16; t < 9.5 - 1e-6; t += step, step = Math.max(0.03, step * 0.8)) {
  mix(clap(), t, 0.3 + 0.4 * (t - 9.0) / 0.5, 0, 0.2);
}
mix(riser(1.5, 400, 8000), 8.0, 0.28, 0, 0.2);

// C · 9.5–15.0 · silence total (gag + réplique du patron)
// whoosh court juste avant la reprise
mix(riser(0.3, 800, 9000), 14.7, 0.35);

// D · 15.0–19.0 · IKONIQ au travail, plus gros
mix(impact(2.0), 15.0, 0.95, 0, 0.35);
mix(crash(2.0), 15.0, 0.3, 0.2, 0.25);
const drop = [['Dm', 15.0, 16.0], ['Bb', 16.0, 17.0], ['F', 17.0, 18.0], ['C', 18.0, 19.0]];
for (const [c, a, b] of drop) {
  bassLine(c, a, b, 650, 0.46);
  ostinato(c, a, b, () => 3600, 0.22);
  mix(brass(CH[c].tones.concat([CH[c].tones[0] + 12]), 0.8, 1), a, 0.22, 0, 0.4);
}
drums(15.0, 19.0, { toms: true, tomG: 0.7, hatG: 0.2 });

// E · 19.0–23.0 · la musique « à travers le mur » (filtrée au bus maître)
const muffled = [['Dm', 19.0, 20.0], ['Bb', 20.0, 21.0], ['F', 21.0, 22.0], ['C', 22.0, 23.0]];
for (const [c, a, b] of muffled) {
  bassLine(c, a, b, 650, 0.46);
  ostinato(c, a, b, () => 3600, 0.2);
  mix(brass(CH[c].tones, 0.8, 1), a, 0.18, 0, 0.3);
}
drums(19.0, 23.0, { toms: false, hatG: 0.18 });

// F · 23.0 stop · 24.0 coup final
mix(impact(1.6), 24.0, 1.0, 0, 0.45);
mix(crash(1.2), 24.0, 0.3, 0, 0.3);
mix(brass([50, 57, 62, 65, 69], 1.0, 1.2), 24.0, 0.34, 0, 0.5);
mix(tom(90, 50, 1.0), 24.0, 0.8);
mix(bassNote(26, 0.9, 300), 24.0, 0.5);

// ================== REVERB (Freeverb simplifié) ==================
function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  const out = new Float32Array(N);
  const fb = 0.8, damp = 0.3;
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.12;
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = x + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i];
      const v = s + y * 0.5;
      a.buf[a.i] = v;
      s = y - v * 0.5;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[n] = s;
  }
  return out;
}
const wetL = reverb(SL, 0), wetR = reverb(SRv, 23);
for (let n = 0; n < N; n++) { L[n] += wetL[n] * 0.9; R[n] += wetR[n] * 0.9; }

// ================== BUS MAÎTRE ==================
// 1) filtre passe-bas automatisé (19–23 s : musique étouffée)
function cutoffAt(t) {
  const lo = 420, hi = 19000, r = 0.08;
  if (t < 19.0 || t >= 23.0) return hi;
  if (t < 19.0 + r) return hi * Math.pow(lo / hi, (t - 19.0) / r);
  return lo;
}
function biquadLP(buf) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  for (let n = 0; n < N; n++) {
    if (n % 32 === 0) {
      const fc = Math.min(cutoffAt(n / SR), SR * 0.45);
      const w = 2 * Math.PI * fc / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.9);
      const a0 = 1 + al;
      b0 = (1 - cs) / 2 / a0; b1 = (1 - cs) / a0; b2 = b0; a1 = -2 * cs / a0; a2 = (1 - al) / a0;
    }
    const x = buf[n];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[n] = y;
  }
}
biquadLP(L); biquadLP(R);
// la musique étouffée est aussi plus basse
for (let n = 0; n < N; n++) {
  const t = n / SR;
  if (t >= 19.0 && t < 23.0) { const g = t < 19.1 ? 1 - 0.45 * (t - 19.0) / 0.1 : 0.55; L[n] *= g; R[n] *= g; }
}

// 2) coupures sèches (gates)
const gates = [[9.5, 14.7], [23.0, 24.0]];
const ramp = 0.006;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  let g = 1;
  for (const [a, b] of gates) {
    if (t >= a && t < b) g = Math.min(g, Math.max(0, 1 - (t - a) / ramp));
    if (t >= b && t < b + ramp) g = Math.min(g, (t - b) / ramp);
  }
  L[n] *= g; R[n] *= g;
}
// 3) fondu final 24.6 → 25.0
for (let n = 0; n < N; n++) {
  const t = n / SR;
  if (t > 24.6) { const g = Math.max(0, (25.0 - t) / 0.4); L[n] *= g * g; R[n] *= g * g; }
}

// 4) normalisation + saturation douce
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const drive = 1.35, pre = 0.95 / peak;
const norm = Math.tanh(drive);
peak = 0;
for (let n = 0; n < N; n++) {
  L[n] = Math.tanh(L[n] * pre * drive) / norm;
  R[n] = Math.tanh(R[n] * pre * drive) / norm;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const out = 0.891 / peak; // -1 dBFS
for (let n = 0; n < N; n++) { L[n] *= out; R[n] *= out; }

// ================== EXPORT ==================
const outDir = process.argv[2] || __dirname;
const base = 'ikoniq-le-relais-musique-25s';

// WAV 16 bits stéréo
const pcmL = new Int16Array(N), pcmR = new Int16Array(N);
for (let n = 0; n < N; n++) {
  pcmL[n] = Math.max(-32768, Math.min(32767, Math.round(L[n] * 32767)));
  pcmR[n] = Math.max(-32768, Math.min(32767, Math.round(R[n] * 32767)));
}
const dataLen = N * 4;
const wav = Buffer.alloc(44 + dataLen);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataLen, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(dataLen, 40);
for (let n = 0; n < N; n++) { wav.writeInt16LE(pcmL[n], 44 + n * 4); wav.writeInt16LE(pcmR[n], 46 + n * 4); }
fs.writeFileSync(path.join(outDir, base + '.wav'), wav);

// MP3 192 kbps
global.MPEGMode = require('lamejs/src/js/MPEGMode.js');
global.Lame = require('lamejs/src/js/Lame.js');
global.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');
const enc = new lamejs.Mp3Encoder(2, SR, 192);
const chunks = [];
for (let i = 0; i < N; i += 1152) {
  const b = enc.encodeBuffer(pcmL.subarray(i, i + 1152), pcmR.subarray(i, i + 1152));
  if (b.length) chunks.push(Buffer.from(b));
}
const end = enc.flush();
if (end.length) chunks.push(Buffer.from(end));
fs.writeFileSync(path.join(outDir, base + '.mp3'), Buffer.concat(chunks));

// Contrôle : niveau RMS par tranche de 0,5 s
const rows = [];
for (let s = 0; s < DUR; s += 0.5) {
  let acc = 0; const a = Math.round(s * SR), b = Math.min(N, Math.round((s + 0.5) * SR));
  for (let n = a; n < b; n++) acc += L[n] * L[n] + R[n] * R[n];
  const rms = Math.sqrt(acc / (2 * (b - a)));
  rows.push(s.toFixed(1).padStart(4) + 's ' + (rms < 1e-5 ? '  silence' : (20 * Math.log10(rms)).toFixed(1).padStart(6) + ' dB ' + '#'.repeat(Math.max(0, Math.round(40 + 20 * Math.log10(rms))))));
}
console.log(rows.join('\n'));
