/**
 * 生成 Tassello 宣发配乐：原创纯音乐，无歌词。
 * 结构与画面对齐：品牌入場 → 双入口 → 插件演示 → 桌面演示 → 收束。
 * 运行：bun designs/tassello-intro-canvas/generate-score.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sampleRate = 48000;
const bpm = 120;
const beat = 60 / bpm;
const bar = beat * 4;
const duration = 24.8;
const sampleCount = Math.floor(sampleRate * duration);
const left = new Float64Array(sampleCount);
const right = new Float64Array(sampleCount);

// 固定伪随机数，保证每次导出的配乐完全一致。
let randomSeed = 0x7453110;
const random = () => {
  randomSeed = (randomSeed * 1664525 + 1013904223) % 4294967296;
  return randomSeed / 4294967296;
};

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function writeSamples(start: number, samples: number[], level: number, pan = 0) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let index = first; index < Math.min(sampleCount, first + samples.length); index++) {
    const value = samples[index - first] * level;
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function createBuffer(durationSeconds: number) {
  return new Array(Math.ceil(durationSeconds * sampleRate)).fill(0);
}

// 常规音符包络：attack / decay / sustain / release。
function envelope(time: number, noteDuration: number, attack: number, decay: number, sustain: number, release: number) {
  if (time < attack) return time / attack;
  if (time < attack + decay) return 1 - (1 - sustain) * ((time - attack) / decay);
  if (time < noteDuration - release) return sustain;
  if (time < noteDuration) return sustain * (1 - (time - noteDuration + release) / release);
  return 0;
}

// 柔和合成 Pad：两个微失谐振荡器，抑制高频毛刺。
function addPad(start: number, noteDuration: number, frequency: number, level: number, pan: number) {
  const samples = createBuffer(noteDuration + 0.2);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const gain = envelope(time, noteDuration, 0.62, 0.28, 0.82, 0.45);
    const phase = 2 * Math.PI * frequency * time;
    const detune = 2 * Math.PI * frequency * 1.004 * time;
    samples[index] = gain * (
      Math.sin(phase) * 0.52 +
      Math.sin(detune) * 0.38 +
      Math.sin(phase * 2) * 0.09 +
      Math.sin(phase * 3) * 0.03
    );
  }
  writeSamples(start, samples, level, pan);
}

// 清亮 Bell：FM 音色，用于品牌点和场景收束。
function addBell(start: number, frequency: number, level: number, pan = 0, noteDuration = 2.4) {
  const samples = createBuffer(noteDuration);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const carrier = 2 * Math.PI * frequency * time;
    const modulation = 2.1 * Math.exp(-time / 0.23) * Math.sin(2 * Math.PI * frequency * 2.01 * time);
    samples[index] = Math.sin(carrier + modulation) * Math.exp(-time / 0.72);
  }
  writeSamples(start, samples, level, pan);
}

// 序列pluck：轻快的科技感 arp，不抢主体。
function addPluck(start: number, frequency: number, level: number, pan: number, noteDuration = 0.24) {
  const samples = createBuffer(noteDuration);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const phase = 2 * Math.PI * frequency * time;
    const gain = Math.exp(-time / 0.075);
    samples[index] = gain * (
      Math.sin(phase) +
      Math.sin(phase * 2) * 0.24 +
      Math.sin(phase * 3) * 0.08
    );
  }
  writeSamples(start, samples, level, pan);
}

// 低频鼓点：clean kick，保持宣传片的推进感。
function addKick(start: number, level: number) {
  const noteDuration = 0.24;
  const samples = createBuffer(noteDuration);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const frequency = 42 + 78 * Math.exp(-time / 0.022);
    samples[index] = Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time / 0.075);
  }
  writeSamples(start, samples, level, 0);
}

// 短 noise hit：hat / clap / transition 均基于确定性噪声。
function addNoiseHit(start: number, level: number, pan: number, noteDuration: number, tail: number, bursts = 1) {
  const samples = createBuffer(noteDuration);
  let previous = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    let gain = Math.exp(-time / tail);
    if (bursts > 1) {
      const burstTime = noteDuration / bursts;
      gain *= 0.42 + 0.58 * Math.exp(-((time % burstTime) / 0.008));
    }
    const white = random() * 2 - 1;
    // 一阶高通，避免噪声变得浑浊。
    const value = white - previous;
    previous = white;
    samples[index] = value * gain;
  }
  writeSamples(start, samples, level, pan);
}

// 低频 impact：场景切换时提供轻微“落定”感。
function addImpact(start: number, level: number) {
  const noteDuration = 1.15;
  const samples = createBuffer(noteDuration);
  let previous = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const frequency = 34 + 40 * Math.exp(-time / 0.055);
    const tone = Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time / 0.28);
    const white = random() * 2 - 1;
    const noise = (white - previous) * Math.exp(-time / 0.035) * 0.28;
    previous = white;
    samples[index] = tone + noise;
  }
  writeSamples(start, samples, level, 0);
}

// 上升 riser：构建段向主段推进，随后立即进入落点。
function addRiser(start: number, noteDuration: number, level: number) {
  const samples = createBuffer(noteDuration);
  let previous = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const progress = clamp(time / noteDuration);
    const white = random() * 2 - 1;
    const value = white - previous;
    previous = white;
    const sweep = Math.sin(2 * Math.PI * (220 + progress * progress * 1500) * time);
    samples[index] = (value * 0.72 + sweep * 0.28) * Math.pow(progress, 2.2);
  }
  writeSamples(start, samples, level, 0);
}

// 和声进行：Am9 → Fmaj9 → Cmaj9 → Gadd9，现代、明亮且不抢台词。
const chords = [
  [45, 60, 64, 67, 71],
  [41, 57, 60, 64, 67],
  [48, 52, 55, 59, 62],
  [43, 59, 62, 64, 69],
];

// Pad：覆盖主体情绪。
for (let barIndex = 0; barIndex * bar < duration - 0.35; barIndex++) {
  const chord = chords[barIndex % chords.length];
  chord.forEach((note, noteIndex) => {
    addPad(
      barIndex * bar,
      Math.min(bar + 0.25, duration - barIndex * bar),
      midi(note + (noteIndex === 0 ? 0 : 0)),
      0.086 - noteIndex * 0.008,
      (noteIndex / chord.length - 0.5) * 0.7
    );
  });
}

// 低音：建立推进力。
for (let barIndex = 0; barIndex * bar < duration - 0.35; barIndex++) {
  const chord = chords[barIndex % chords.length];
  const root = midi(chord[0] - 12);
  const start = barIndex * bar;
  const remaining = duration - start;
  const samples = createBuffer(1.65);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const phase = 2 * Math.PI * root * time;
    samples[index] = envelope(time, 1.5, 0.008, 0.1, 0.72, 0.22) * (
      Math.sin(phase) * 0.88 + Math.sin(phase * 2) * 0.08
    );
  }
  writeSamples(start, samples, 0.16, 0);
  if (remaining > 2.15) {
    const fifth = createBuffer(0.32);
    for (let index = 0; index < fifth.length; index++) {
      const time = index / sampleRate;
      fifth[index] = Math.sin(2 * Math.PI * root * 1.5 * time) * Math.exp(-time / 0.1) * 0.78;
    }
    writeSamples(start + beat * 2.5, fifth, 0.11, 0);
  }
}

// 品牌入場：安静、清晰。
[[81, 0.70], [88, 1.12], [93, 1.52]].forEach(([note, time]) => {
  addBell(time, midi(note), 0.085, -0.18, 2.6);
});

// 插件与桌面演示：加入 arp。
for (let step = 0; step < 170; step++) {
  const start = 6.9 + step * beat * 0.25;
  if (start > 26.8) break;
  const chord = chords[Math.floor(start / bar) % chords.length];
  const pattern = [0, 2, 1, 3, 2, 4, 1, 3];
  const note = chord[pattern[step % pattern.length]] + 12;
  addPluck(start, midi(note), 0.10 + (step % 8 === 0 ? 0.015 : 0), ((step % 8) / 7 - 0.5) * 0.68);
}

// 鼓组：8 秒后进入四四拍；clap 在 2/4 拍提供节奏定位。
for (let time = 7.8; time < 23.2; time += beat) addKick(time, 0.50);
for (let time = 8.05; time < 23.0; time += beat) addNoiseHit(time, 0.030, 0.24, 0.08, 0.016);
for (let time = 9.5; time < 22.6; time += bar) {
  addNoiseHit(time + beat, 0.042, -0.08, 0.18, 0.035, 3);
  addNoiseHit(time + beat * 3, 0.042, 0.08, 0.18, 0.035, 3);
}

// 场景落点与推进。
[[3.0, 0.14], [6.8, 0.16], [12.9, 0.17], [20.7, 0.20]].forEach(([time, level]) => addImpact(time, level));
addRiser(5.2, 1.55, 0.045);
addRiser(11.3, 1.55, 0.05);
addRiser(19.1, 1.55, 0.055);

// 收束动机：正式落版时明确结束感。
[[76, 20.75], [81, 21.15], [88, 21.55], [93, 22.15]].forEach(([note, time]) => {
  addBell(time, midi(note), 0.075, 0.12, 3.1);
});

// 后处理：去直流、柔化高频、轻微 sidechain、软限幅与淡出。
{
  const highpassCoefficient = Math.exp((-2 * Math.PI * 24) / sampleRate);
  const lowpassCoefficient = 0.82;
  let highpassPreviousInput = 0;
  let highpassPreviousOutput = 0;
  let lowpassPrevious = 0;

  for (let index = 0; index < sampleCount; index++) {
    const time = index / sampleRate;
    for (const channel of [left, right]) {
      const input = channel[index];
      const highpassed = highpassCoefficient * (highpassPreviousOutput + input - highpassPreviousInput);
      highpassPreviousInput = input;
      highpassPreviousOutput = highpassed;
      lowpassPrevious += lowpassCoefficient * (highpassed - lowpassPrevious);
      channel[index] = lowpassPrevious;
    }

    // Kick 后轻微 ducking，让节奏更透气。
    if (time > 7.8 && time < 23.2) {
      const pulsePhase = ((time - 7.8) % beat) / 0.06;
      const duck = 1 - 0.13 * Math.exp(-pulsePhase);
      left[index] *= duck;
      right[index] *= duck;
    }

    // 软限幅，保持模拟感并避免削波。
    left[index] = Math.tanh(left[index] * 1.14) * 0.92;
    right[index] = Math.tanh(right[index] * 1.14) * 0.92;
  }

  // 归一化到安全的发布响度，再叠加淡入/淡出。
  let peak = 0;
  for (let index = 0; index < sampleCount; index++) {
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }
  const normalize = peak > 0 ? 0.925 / peak : 1;
  const fadeOutStart = duration - 1.75;
  for (let index = 0; index < sampleCount; index++) {
    const time = index / sampleRate;
    const gain = normalize * Math.min(1, time / 0.38) * clamp((duration - time) / 1.75);
    left[index] *= gain;
    right[index] *= gain;
  }
}

// 写出 48kHz / 24-bit / stereo WAV。
function writeWav(path: string) {
  const bytesPerSample = 3;
  const dataBytes = sampleCount * 2 * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2 * bytesPerSample, 28);
  buffer.writeUInt16LE(2 * bytesPerSample, 32);
  buffer.writeUInt16LE(24, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let index = 0; index < sampleCount; index++) {
    for (const channel of [left, right]) {
      const value = Math.round(clamp(channel[index], -1, 1) * 8388607);
      buffer.writeUInt8(value & 0xff, offset);
      buffer.writeUInt8((value >> 8) & 0xff, offset + 1);
      buffer.writeUInt8((value >> 16) & 0xff, offset + 2);
      offset += 3;
    }
  }
  writeFileSync(path, buffer);
}

const outputPath = resolve(import.meta.dir, "export", "promo-score-48k24b.wav");
mkdirSync(dirname(outputPath), { recursive: true });
writeWav(outputPath);
console.log(`已生成配乐：${outputPath}`);
