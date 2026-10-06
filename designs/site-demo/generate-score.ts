/**
 * 生成站点操作演示的纯音乐配乐。
 * 音色只使用原声乐器模型：尼龙弦吉他（Karplus-Strong 拨弦）、
 * 钢琴泛音模型、大提琴/弦乐 Pad；不使用鼓机、噪声打击乐或电子音色。
 * 运行：bun designs/site-demo/generate-score.ts <seconds> <output.wav>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const duration = Number(process.argv[2] ?? 24.8);
const outputPath = resolve(process.argv[3] ?? "assets/site-demo-score.wav");
const sampleRate = 48000;
if (!Number.isFinite(duration) || duration < 6 || duration > 180) {
  throw new Error("配乐时长需在 6 到 180 秒之间");
}

const sampleCount = Math.floor(duration * sampleRate);
const left = new Float64Array(sampleCount);
const right = new Float64Array(sampleCount);

let randomSeed = 0x4f6e6461;
const random = () => {
  randomSeed = (randomSeed * 1664525 + 1013904223) % 4294967296;
  return randomSeed / 4294967296;
};
const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function writeSamples(start: number, samples: Float32Array, level: number, pan = 0) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  // pan=-1 全左，pan=1 全右；0.7071 是等功率声像中心。
  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let index = first; index < Math.min(sampleCount, first + samples.length); index += 1) {
    const value = samples[index - first] * level;
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

/** 尼龙弦吉他：Karplus-Strong 物理拨弦模型，激发脉冲后只依赖弦延迟线。 */
function addGuitar(start: number, note: number, level: number, pan: number, noteDuration = 3.2) {
  const frequency = midi(note);
  const samples = new Float32Array(Math.floor(noteDuration * sampleRate));
  const period = Math.max(4, Math.round(sampleRate / frequency));
  const string = new Float32Array(period);
  let lowpassed = 0;
  for (let index = 0; index < period; index += 1) {
    const noise = random() * 2 - 1;
    lowpassed = lowpassed * 0.42 + noise * 0.58;
    string[index] = lowpassed;
  }

  const damping = 0.9975 - Math.min(0.012, (note - 40) * 0.00012);
  for (let index = 0; index < samples.length; index += 1) {
    const phase = index % period;
    const next = (phase + 1) % period;
    const current = string[phase];
    string[phase] = (current + string[next]) * 0.5 * damping;
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.006);
    const body = Math.exp(-time / 2.55) * (1 - Math.exp(-time / 0.018));
    samples[index] = current * attack * (0.82 + body * 0.18);
  }
  writeSamples(start, samples, level, pan);
}

/** 钢琴：低阶非整数泛音加自然衰减，避免方波/锯齿波式电子听感。 */
function addPiano(start: number, note: number, level: number, pan: number, noteDuration = 3.6) {
  const frequency = midi(note);
  const samples = new Float32Array(Math.floor(noteDuration * sampleRate));
  const partials = [1, 2, 3.005, 4.012, 5.025, 6.04];
  const levels = [1, 0.38, 0.2, 0.1, 0.062, 0.036];
  const decays = [2.8, 1.55, 1.05, 0.72, 0.52, 0.36];
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.004);
    const release = time > noteDuration - 0.55
      ? Math.max(0, (noteDuration - time) / 0.55)
      : 1;
    let value = 0;
    for (let partial = 0; partial < partials.length; partial += 1) {
      const partialFrequency = frequency * partials[partial];
      const phase = 2 * Math.PI * partialFrequency * time;
      const beating = 1 + 0.0035 * Math.sin(2 * Math.PI * 0.82 * time + partial);
      value += Math.sin(phase) * levels[partial] * Math.exp(-time / decays[partial]) * beating;
    }
    samples[index] = value * attack * release;
  }
  writeSamples(start, samples, level, pan);
}

/** 弦乐 Pad：慢attack、微失谐和正弦泛音，模拟大提琴长音而非合成器铺底。 */
function addStrings(start: number, notes: number[], level: number, noteDuration: number) {
  const samples = new Float32Array(Math.floor((noteDuration + 0.35) * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.58);
    const release = time > noteDuration - 0.72
      ? Math.max(0, (noteDuration - time) / 0.72)
      : 1;
    let value = 0;
    notes.forEach((note, noteIndex) => {
      const frequency = midi(note) * (1 + (noteIndex % 2 === 0 ? 0.0012 : -0.0011));
      const vibrato = 1 + 0.0016 * Math.sin(2 * Math.PI * 4.1 * time + noteIndex * 1.3);
      const phase = 2 * Math.PI * frequency * vibrato * time;
      value += Math.sin(phase)
        + Math.sin(phase * 2) * 0.14
        + Math.sin(phase * 3) * 0.035;
    });
    samples[index] = (value / (notes.length * 1.18)) * attack * release;
  }
  writeSamples(start, samples, level, notes.length > 1 ? 0 : 0);
}

// 和声进行：C — F — Am — G — F — C/G — Fmaj7 — C，明亮但不抢界面。
const chords = [
  { guitar: [48, 55, 60, 64], strings: [48, 55], melody: [76, 79, 81, 79] },
  { guitar: [53, 60, 65, 69], strings: [53, 60], melody: [77, 81, 84, 81] },
  { guitar: [45, 52, 60, 64], strings: [45, 52], melody: [76, 81, 84, 81] },
  { guitar: [43, 50, 59, 62], strings: [43, 50], melody: [74, 79, 83, 79] },
  { guitar: [41, 48, 57, 65], strings: [41, 48], melody: [77, 81, 84, 81] },
  { guitar: [43, 55, 60, 64], strings: [43, 55], melody: [76, 79, 84, 79] },
  { guitar: [41, 53, 60, 64], strings: [41, 53], melody: [77, 81, 84, 81] },
  { guitar: [48, 55, 60, 64], strings: [48, 55], melody: [76, 79, 84, 79] },
];

const chordDuration = duration / chords.length;
const guitarPattern = [0, 1, 2, 3, 2, 1, 3, 2];
const melodyRhythm = [0, 0.62, 1.28, 1.86];

chords.forEach((chord, chordIndex) => {
  const start = chordIndex * chordDuration;
  addStrings(start, chord.strings, 0.30, chordDuration);

  guitarPattern.forEach((stringIndex, step) => {
    const note = chord.guitar[stringIndex];
    const time = start + (step * chordDuration) / guitarPattern.length;
    const pan = step % 2 === 0 ? -0.32 : 0.30;
    const level = 0.30 - (step % 4) * 0.014 + (random() - 0.5) * 0.012;
    addGuitar(time, note, clamp(level, 0.2, 0.36), pan, Math.min(3.1, chordDuration * 1.22));
  });

  chord.melody.forEach((note, step) => {
    const time = start + melodyRhythm[step] * (chordDuration / 2.45);
    addPiano(time, note, 0.17 + (step === 0 ? 0.018 : 0), step % 2 === 0 ? 0.08 : -0.06, Math.min(3.6, duration - time));
  });

  // 每小节只补一次低音，保持干净，不做鼓点推进。
  addGuitar(start, chord.guitar[0] - 12, 0.20, -0.05, Math.min(3.0, chordDuration));
});

// 简易房间反射：三条衰减 slap delay + 低通，不引入合成混响音色。
function addRoomReflections(channel: Float64Array) {
  const delays = [
    { time: 0.023, gain: 0.10, state: 0 },
    { time: 0.034, gain: 0.062, state: 0 },
    { time: 0.051, gain: 0.038, state: 0 },
  ].map((item) => ({ ...item, samples: new Float64Array(Math.floor(item.time * sampleRate)) }));
  for (let index = 0; index < channel.length; index += 1) {
    let wet = 0;
    delays.forEach((delay) => {
      const delayed = delay.samples[0];
      delay.state = delay.state * 0.42 + delayed * 0.58;
      wet += delay.state * delay.gain;
      delay.samples.copyWithin(0, 1);
      delay.samples[delay.samples.length - 1] = channel[index];
    });
    channel[index] += wet;
  }
}
addRoomReflections(left);
addRoomReflections(right);

// 淡入淡出、软限幅和峰值归一化，保证手机扬声器不过载。
const fade = Math.min(1.15, duration * 0.06);
for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const gain = Math.min(1, time / fade) * Math.min(1, Math.max(0, (duration - time) / Math.max(0.8, fade * 0.72)));
  left[index] *= gain;
  right[index] *= gain;
}
let peak = 0;
for (let index = 0; index < sampleCount; index += 1) {
  peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
}
const normalize = peak > 0 ? 0.902 / peak : 1;
for (let index = 0; index < sampleCount; index += 1) {
  left[index] = Math.tanh(left[index] * normalize * 1.015) * 0.986;
  right[index] = Math.tanh(right[index] * normalize * 1.015) * 0.986;
}

// 写出 24-bit / 48 kHz 立体声 WAV，交给 ffmpeg 做 AAC 转码。
const bytesPerSample = 3;
const dataSize = sampleCount * 2 * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0, "ascii");
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8, "ascii");
buffer.write("fmt ", 12, "ascii");
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(2, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2 * bytesPerSample, 28);
buffer.writeUInt16LE(2 * bytesPerSample, 32);
buffer.writeUInt16LE(24, 34);
buffer.write("data", 36, "ascii");
buffer.writeUInt32LE(dataSize, 40);
for (let index = 0; index < sampleCount; index += 1) {
  const offset = 44 + index * 6;
  const leftSample = Math.round(clamp(left[index], -1, 1) * 8388607);
  const rightSample = Math.round(clamp(right[index], -1, 1) * 8388607);
  buffer.writeIntLE(leftSample, offset, 3);
  buffer.writeIntLE(rightSample, offset + 3, 3);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buffer);
console.log(`${outputPath} (${duration.toFixed(3)}s, 48kHz/24bit)`);
