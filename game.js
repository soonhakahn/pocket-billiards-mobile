const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const visualizerCanvas = document.getElementById("visualizerCanvas");
const vctx = visualizerCanvas.getContext("2d");

const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const musicButton = document.getElementById("musicButton");
const fxButton = document.getElementById("fxButton");

const ballsLeftEl = document.getElementById("ballsLeft");
const shotsTakenEl = document.getElementById("shotsTaken");
const gameStateEl = document.getElementById("gameState");
const messageLineEl = document.getElementById("messageLine");

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(value) {
    this.x *= value;
    this.y *= value;
    return this;
  }

  scaled(value) {
    return new Vec2(this.x * value, this.y * value);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  static sub(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y);
  }
}

class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.fxGain = null;
    this.analyser = null;
    this.musicEnabled = true;
    this.fxEnabled = true;
    this.started = false;
    this.nextBeatTime = 0;
    this.beatDuration = 60 / 96;
    this.musicLookAhead = 0.18;
    this.visualData = new Uint8Array(48);
    this.lastMusicPulse = 0;
    this.resumePromise = null;
  }

  async unlock() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioCtx();
      this.master = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.fxGain = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.master.gain.value = 0.9;
      this.musicGain.gain.value = 0.22;
      this.fxGain.gain.value = 0.75;
      this.analyser.fftSize = 256;
      this.visualData = new Uint8Array(this.analyser.frequencyBinCount);
      this.musicGain.connect(this.analyser);
      this.fxGain.connect(this.analyser);
      this.analyser.connect(this.master);
      this.master.connect(this.context.destination);
    }

    if (this.context.state !== "running") {
      this.resumePromise = this.context.resume();
      await this.resumePromise;
    }

    if (!this.started) {
      this.nextBeatTime = this.context.currentTime + 0.08;
      this.started = true;
    }
  }

  setMusicEnabled(value) {
    this.musicEnabled = value;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(value ? 0.22 : 0.0001, this.context.currentTime, 0.08);
    }
  }

  setFxEnabled(value) {
    this.fxEnabled = value;
    if (this.fxGain) {
      this.fxGain.gain.setTargetAtTime(value ? 0.75 : 0.0001, this.context.currentTime, 0.04);
    }
  }

  scheduleMusic() {
    if (!this.started || !this.musicEnabled || !this.context) {
      return;
    }

    const now = this.context.currentTime;

    while (this.nextBeatTime < now + this.musicLookAhead) {
      const beatIndex = Math.floor(this.nextBeatTime / this.beatDuration) % 16;
      const rootPattern = [110, 110, 110, 123.47, 146.83, 123.47, 110, 98];
      const accentPattern = [220, 246.94, 261.63, 293.66, 261.63, 246.94, 220, 196];

      this.playBassNote(rootPattern[beatIndex % rootPattern.length], this.nextBeatTime, 0.22);

      if (beatIndex % 2 === 0) {
        this.playPad(accentPattern[beatIndex % accentPattern.length], this.nextBeatTime, 0.36);
      }

      if (beatIndex % 4 === 2) {
        this.playBell(accentPattern[(beatIndex + 3) % accentPattern.length] * 2, this.nextBeatTime + 0.05, 0.12);
      }

      this.lastMusicPulse = 0.4 + (beatIndex % 4 === 0 ? 0.7 : 0.24);
      this.nextBeatTime += this.beatDuration;
    }
  }

  playBassNote(freq, time, duration) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.985, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.24, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  playPad(freq, time, duration) {
    const oscA = this.context.createOscillator();
    const oscB = this.context.createOscillator();
    const gain = this.context.createGain();
    oscA.type = "sine";
    oscB.type = "triangle";
    oscA.frequency.setValueAtTime(freq, time);
    oscB.frequency.setValueAtTime(freq * 1.5, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(this.musicGain);
    oscA.start(time);
    oscB.start(time);
    oscA.stop(time + duration + 0.08);
    oscB.stop(time + duration + 0.08);
  }

  playBell(freq, time, duration) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  playCollision(intensity = 0.5) {
    if (!this.context || !this.fxEnabled) {
      return;
    }

    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140 + intensity * 120, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12 * intensity, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.fxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playRail(intensity = 0.5) {
    if (!this.context || !this.fxEnabled) {
      return;
    }

    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(90 + intensity * 70, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.08 * intensity, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.fxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  playPocket() {
    if (!this.context || !this.fxEnabled) {
      return;
    }

    const now = this.context.currentTime;
    [392, 523.25, 659.25].forEach((freq, index) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.04);
      gain.gain.setValueAtTime(0.0001, now + index * 0.04);
      gain.gain.linearRampToValueAtTime(0.08, now + index * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.04 + 0.18);
      osc.connect(gain);
      gain.connect(this.fxGain);
      osc.start(now + index * 0.04);
      osc.stop(now + index * 0.04 + 0.2);
    });
  }

  playScratch() {
    if (!this.context || !this.fxEnabled) {
      return;
    }

    const now = this.context.currentTime;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.18, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 360;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.fxGain);
    source.start(now);
  }

  playWin() {
    if (!this.context || !this.fxEnabled) {
      return;
    }

    const now = this.context.currentTime;
    [261.63, 329.63, 392, 523.25].forEach((freq, index) => {
      this.playBell(freq, now + index * 0.08, 0.28);
    });
  }

  updateVisualizer() {
    if (!this.analyser) {
      return { average: 0, pulse: 0 };
    }

    this.analyser.getByteFrequencyData(this.visualData);
    let sum = 0;
    const sliceCount = Math.min(48, this.visualData.length);
    for (let i = 0; i < sliceCount; i += 1) {
      sum += this.visualData[i];
    }

    this.lastMusicPulse *= 0.93;
    return {
      average: sliceCount > 0 ? sum / sliceCount / 255 : 0,
      pulse: this.lastMusicPulse
    };
  }
}

class Ball {
  constructor({ x, y, radius, color, number, cue = false }) {
    this.position = new Vec2(x, y);
    this.velocity = new Vec2();
    this.radius = radius;
    this.color = color;
    this.number = number;
    this.isCue = cue;
    this.active = true;
    this.inPocketAnimation = 0;
  }
}

const state = {
  running: false,
  message: "흰 공을 당겨 첫 샷을 만들어보세요.",
  shotsTaken: 0,
  ballsPocketed: 0,
  scratchPenalty: 0,
  pendingCueRespawn: false,
  cueBallReady: true,
  win: false,
  pointer: {
    active: false,
    start: new Vec2(),
    current: new Vec2(),
    cueBallWorld: new Vec2()
  },
  world: {
    width: 1000,
    height: 560,
    margin: 70,
    rail: 26,
    pocketRadius: 34,
    ballRadius: 16,
    maxPower: 880,
    friction: 0.991,
    restitution: 0.985,
    railRestitution: 0.94,
    stopThreshold: 4
  },
  layout: {
    width: 0,
    height: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1
  },
  balls: [],
  cueBall: null,
  pockets: []
};

const audio = new AudioManager();

function makePocketLayout() {
  const { width, height, margin } = state.world;
  return [
    new Vec2(margin, margin),
    new Vec2(width / 2, margin - 4),
    new Vec2(width - margin, margin),
    new Vec2(margin, height - margin),
    new Vec2(width / 2, height - margin + 4),
    new Vec2(width - margin, height - margin)
  ];
}

function rackBalls() {
  const { width, height, ballRadius } = state.world;
  const colors = ["#f2d47f", "#4468f0", "#d6483b", "#7d3cd9", "#f28c28", "#3cc779", "#c93182", "#1f1f24"];
  const balls = [];
  const cueBall = new Ball({
    x: width * 0.25,
    y: height * 0.5,
    radius: ballRadius,
    color: "#f6f4ee",
    number: 0,
    cue: true
  });
  balls.push(cueBall);
  state.cueBall = cueBall;

  const startX = width * 0.68;
  const startY = height * 0.5;
  let index = 0;
  for (let row = 0; row < 4; row += 1) {
    for (let slot = 0; slot <= row; slot += 1) {
      if (index >= colors.length) {
        break;
      }
      const x = startX + row * ballRadius * 1.85;
      const y = startY - row * ballRadius + slot * ballRadius * 2.05;
      balls.push(new Ball({
        x,
        y,
        radius: ballRadius,
        color: colors[index],
        number: index + 1
      }));
      index += 1;
    }
  }

  state.balls = balls;
}

function resetGame() {
  state.shotsTaken = 0;
  state.ballsPocketed = 0;
  state.scratchPenalty = 0;
  state.pendingCueRespawn = false;
  state.win = false;
  state.cueBallReady = true;
  state.message = "흰 공을 당겨 샷을 날려보세요.";
  state.pointer.active = false;
  state.pockets = makePocketLayout();
  rackBalls();
  updateHud();
}

function updateHud() {
  const activeObjects = state.balls.filter((ball) => ball.active && !ball.isCue).length;
  ballsLeftEl.textContent = String(activeObjects);
  shotsTakenEl.textContent = String(state.shotsTaken);
  gameStateEl.textContent = state.win ? "클리어" : anyBallMoving() ? "진행 중" : "조준 가능";
  messageLineEl.textContent = state.message;
}

function anyBallMoving() {
  return state.balls.some((ball) => ball.active && ball.velocity.lengthSq() > state.world.stopThreshold * state.world.stopThreshold);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resize() {
  const stage = canvas.parentElement;
  const bounds = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  [canvas, visualizerCanvas].forEach((target) => {
    target.width = Math.floor(bounds.width * dpr);
    target.height = Math.floor(bounds.height * dpr);
    target.style.width = `${bounds.width}px`;
    target.style.height = `${bounds.height}px`;
  });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.layout.width = bounds.width;
  state.layout.height = bounds.height;
  state.layout.dpr = dpr;

  const scaleX = bounds.width / state.world.width;
  const scaleY = bounds.height / state.world.height;
  state.layout.scale = Math.min(scaleX, scaleY) * 0.96;
  state.layout.offsetX = (bounds.width - state.world.width * state.layout.scale) / 2;
  state.layout.offsetY = (bounds.height - state.world.height * state.layout.scale) / 2;
}

function worldToScreen(point) {
  return {
    x: state.layout.offsetX + point.x * state.layout.scale,
    y: state.layout.offsetY + point.y * state.layout.scale
  };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return new Vec2(
    (clientX - rect.left - state.layout.offsetX) / state.layout.scale,
    (clientY - rect.top - state.layout.offsetY) / state.layout.scale
  );
}

function handlePointerDown(event) {
  if (!state.running || state.win || anyBallMoving() || !state.cueBall.active) {
    return;
  }

  event.preventDefault();
  const point = screenToWorld(event.clientX, event.clientY);
  const delta = Vec2.sub(point, state.cueBall.position);
  const hitRadius = state.world.ballRadius * 2.3;
  if (delta.length() > hitRadius) {
    return;
  }

  state.pointer.active = true;
  state.pointer.start.copy(point);
  state.pointer.current.copy(point);
  state.pointer.cueBallWorld.copy(state.cueBall.position);
}

function handlePointerMove(event) {
  if (!state.pointer.active) {
    return;
  }

  event.preventDefault();
  state.pointer.current.copy(screenToWorld(event.clientX, event.clientY));
}

function handlePointerUp(event) {
  if (!state.pointer.active) {
    return;
  }

  event.preventDefault();
  state.pointer.current.copy(screenToWorld(event.clientX, event.clientY));
  const pullVector = Vec2.sub(state.pointer.cueBallWorld, state.pointer.current);
  const power = clamp(pullVector.length() * 6.2, 0, state.world.maxPower);
  state.pointer.active = false;
  if (power < 65) {
    state.message = "조금 더 당겨서 힘을 실어보세요.";
    updateHud();
    return;
  }

  const direction = pullVector.clone().normalize();
  state.cueBall.velocity = direction.scale(power);
  state.shotsTaken += 1;
  state.message = "좋아요. 공이 멈추면 다음 샷을 준비할 수 있습니다.";
  audio.playCollision(clamp(power / state.world.maxPower, 0.2, 1));
  updateHud();
}

function updatePhysics(dt) {
  const { margin, width, height, friction, railRestitution, restitution, pocketRadius, rail } = state.world;
  const innerLeft = margin + rail;
  const innerRight = width - margin - rail;
  const innerTop = margin + rail;
  const innerBottom = height - margin - rail;

  for (const ball of state.balls) {
    if (!ball.active) {
      continue;
    }

    ball.position.add(ball.velocity.clone().scale(dt));
    ball.velocity.scale(Math.pow(friction, dt * 60));
    if (ball.velocity.length() < state.world.stopThreshold) {
      ball.velocity.set(0, 0);
    }

    for (const pocket of state.pockets) {
      const toPocket = Vec2.sub(ball.position, pocket);
      if (toPocket.length() < pocketRadius - ball.radius * 0.3) {
        pocketBall(ball);
        break;
      }
    }

    if (!ball.active) {
      continue;
    }

    if (ball.position.x - ball.radius < innerLeft) {
      ball.position.x = innerLeft + ball.radius;
      ball.velocity.x = Math.abs(ball.velocity.x) * railRestitution;
      audio.playRail(clamp(Math.abs(ball.velocity.x) / 600, 0.25, 1));
    } else if (ball.position.x + ball.radius > innerRight) {
      ball.position.x = innerRight - ball.radius;
      ball.velocity.x = -Math.abs(ball.velocity.x) * railRestitution;
      audio.playRail(clamp(Math.abs(ball.velocity.x) / 600, 0.25, 1));
    }

    if (ball.position.y - ball.radius < innerTop) {
      ball.position.y = innerTop + ball.radius;
      ball.velocity.y = Math.abs(ball.velocity.y) * railRestitution;
      audio.playRail(clamp(Math.abs(ball.velocity.y) / 600, 0.25, 1));
    } else if (ball.position.y + ball.radius > innerBottom) {
      ball.position.y = innerBottom - ball.radius;
      ball.velocity.y = -Math.abs(ball.velocity.y) * railRestitution;
      audio.playRail(clamp(Math.abs(ball.velocity.y) / 600, 0.25, 1));
    }
  }

  for (let i = 0; i < state.balls.length; i += 1) {
    const a = state.balls[i];
    if (!a.active) {
      continue;
    }
    for (let j = i + 1; j < state.balls.length; j += 1) {
      const b = state.balls[j];
      if (!b.active) {
        continue;
      }
      resolveCollision(a, b, restitution);
    }
  }
}

function resolveCollision(a, b, restitution) {
  const delta = Vec2.sub(b.position, a.position);
  const distance = delta.length();
  const minDistance = a.radius + b.radius;
  if (distance === 0 || distance >= minDistance) {
    return;
  }

  const normal = delta.scale(1 / distance);
  const overlap = minDistance - distance;
  const separation = overlap / 2;
  a.position.add(normal.clone().scale(-separation));
  b.position.add(normal.clone().scale(separation));

  const relativeVelocity = Vec2.sub(b.velocity, a.velocity);
  const speedAlongNormal = relativeVelocity.dot(normal);
  if (speedAlongNormal > 0) {
    return;
  }

  const impulseMagnitude = -(1 + restitution) * speedAlongNormal / 2;
  const impulse = normal.clone().scale(impulseMagnitude);
  a.velocity.add(impulse.clone().scale(-1));
  b.velocity.add(impulse);

  const intensity = clamp(Math.abs(impulseMagnitude) / 320, 0.18, 1);
  audio.playCollision(intensity);
}

function pocketBall(ball) {
  ball.active = false;
  ball.velocity.set(0, 0);
  audio.playPocket();

  if (ball.isCue) {
    state.scratchPenalty += 1;
    state.pendingCueRespawn = true;
    state.message = "스크래치. 흰 공을 다시 배치합니다.";
    audio.playScratch();
  } else {
    state.ballsPocketed += 1;
    state.message = `좋아요. ${ball.number}번 공을 넣었습니다.`;
  }

  if (state.balls.filter((item) => item.active && !item.isCue).length === 0) {
    state.win = true;
    state.message = `클리어. ${state.shotsTaken}번 만에 테이블 정리 완료.`;
    audio.playWin();
  }

  updateHud();
}

function respawnCueBall() {
  if (state.cueBall.active || state.win) {
    return;
  }

  const spawn = new Vec2(state.world.width * 0.25, state.world.height * 0.5);
  const blocked = state.balls.some((ball) => {
    if (!ball.active || ball.isCue) {
      return false;
    }
    return Vec2.sub(ball.position, spawn).length() < state.world.ballRadius * 3;
  });

  state.cueBall.active = true;
  state.cueBall.position.copy(blocked ? new Vec2(state.world.width * 0.2, state.world.height * 0.5) : spawn);
  state.cueBall.velocity.set(0, 0);
  state.pendingCueRespawn = false;
  state.message = "흰 공이 다시 놓였습니다. 다음 샷을 준비하세요.";
  updateHud();
}

function renderTable(reactivity) {
  ctx.clearRect(0, 0, state.layout.width, state.layout.height);

  const scale = state.layout.scale;
  const { width, height, margin, rail } = state.world;
  const left = state.layout.offsetX;
  const top = state.layout.offsetY;
  const tableW = width * scale;
  const tableH = height * scale;

  ctx.save();
  ctx.translate(left, top);
  ctx.scale(scale, scale);

  const woodGradient = ctx.createLinearGradient(0, 0, width, height);
  woodGradient.addColorStop(0, "#4f2d13");
  woodGradient.addColorStop(0.5, "#6b3f1e");
  woodGradient.addColorStop(1, "#40200d");
  ctx.fillStyle = woodGradient;
  roundRect(ctx, 0, 0, width, height, 36);
  ctx.fill();

  const feltGlow = 0.18 + reactivity.average * 0.18 + reactivity.pulse * 0.08;
  const feltGradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 40, width * 0.5, height * 0.5, width * 0.6);
  feltGradient.addColorStop(0, `rgba(44, 127, 72, ${0.95 + feltGlow})`);
  feltGradient.addColorStop(1, "rgba(10, 50, 30, 0.98)");
  ctx.fillStyle = feltGradient;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 30);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(235, 247, 236, 0.88)";
  roundRect(ctx, margin + rail, margin + rail, width - (margin + rail) * 2, height - (margin + rail) * 2, 14);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width * 0.28, height * 0.5, 70, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(235, 247, 236, 0.62)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.23, margin + rail);
  ctx.lineTo(width * 0.23, height - margin - rail);
  ctx.stroke();

  state.pockets.forEach((pocket) => {
    ctx.beginPath();
    ctx.fillStyle = "#08100b";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.arc(pocket.x, pocket.y, state.world.pocketRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  ctx.restore();
}

function renderBalls() {
  for (const ball of state.balls) {
    if (!ball.active) {
      continue;
    }

    const screen = worldToScreen(ball.position);
    const radius = ball.radius * state.layout.scale;

    ctx.save();
    ctx.translate(screen.x, screen.y);

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.ellipse(0, radius * 0.42, radius * 0.92, radius * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.15, 0, 0, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.18, ball.isCue ? "#fffefa" : ball.color);
    gradient.addColorStop(1, ball.isCue ? "#d9d5cb" : shadeColor(ball.color, -24));
    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    if (!ball.isCue) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(248, 250, 245, 0.92)";
      ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#102014";
      ctx.font = `${Math.max(10, radius * 0.9)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ball.number), 0, 1);
    }

    ctx.restore();
  }
}

function renderCueGuide() {
  if (!state.pointer.active || anyBallMoving() || !state.cueBall.active) {
    return;
  }

  const cue = state.cueBall.position;
  const pull = Vec2.sub(cue, state.pointer.current);
  const distance = clamp(pull.length(), 0, 150);
  if (distance < 4) {
    return;
  }

  const dir = pull.clone().normalize();
  const cueScreen = worldToScreen(cue);
  const target = cue.clone().add(dir.clone().scale(170));
  const targetScreen = worldToScreen(target);
  const powerRatio = clamp(distance / 150, 0, 1);

  ctx.save();
  ctx.strokeStyle = `rgba(240, 195, 125, ${0.55 + powerRatio * 0.4})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(cueScreen.x, cueScreen.y);
  ctx.lineTo(targetScreen.x, targetScreen.y);
  ctx.stroke();

  const cueBack = cue.clone().add(dir.clone().scale(-40 - powerRatio * 95));
  const cueBackScreen = worldToScreen(cueBack);
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(201, 158, 91, 0.92)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cueBackScreen.x, cueBackScreen.y);
  ctx.lineTo(cueScreen.x - dir.x * state.world.ballRadius * state.layout.scale * 0.9, cueScreen.y - dir.y * state.world.ballRadius * state.layout.scale * 0.9);
  ctx.stroke();

  const meterX = state.layout.width - 28;
  const meterY = state.layout.height * 0.22;
  const meterHeight = state.layout.height * 0.42;
  roundRect(ctx, meterX, meterY, 10, meterHeight, 8);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  const fillHeight = meterHeight * powerRatio;
  roundRect(ctx, meterX, meterY + meterHeight - fillHeight, 10, fillHeight, 8);
  ctx.fillStyle = "rgba(240, 195, 125, 0.92)";
  ctx.fill();
  ctx.restore();
}

function renderVisualizer(reactivity) {
  vctx.clearRect(0, 0, state.layout.width, state.layout.height);
  const bars = 36;
  const bottom = state.layout.height;
  const barWidth = state.layout.width / bars;
  const waveform = audio.visualData;

  for (let i = 0; i < bars; i += 1) {
    const value = waveform[i] || 0;
    const normalized = value / 255;
    const height = normalized * state.layout.height * 0.3 + reactivity.pulse * 12;
    const x = i * barWidth;
    const gradient = vctx.createLinearGradient(0, bottom - height, 0, bottom);
    gradient.addColorStop(0, "rgba(240, 195, 125, 0.48)");
    gradient.addColorStop(1, "rgba(37, 126, 80, 0.05)");
    vctx.fillStyle = gradient;
    vctx.fillRect(x + 2, bottom - height, Math.max(3, barWidth - 6), height);
  }

  const halo = vctx.createRadialGradient(
    state.layout.width * 0.5,
    state.layout.height * 0.48,
    30,
    state.layout.width * 0.5,
    state.layout.height * 0.5,
    state.layout.width * 0.35
  );
  halo.addColorStop(0, `rgba(217, 165, 93, ${0.08 + reactivity.average * 0.18 + reactivity.pulse * 0.08})`);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  vctx.fillStyle = halo;
  vctx.fillRect(0, 0, state.layout.width, state.layout.height);
}

function draw() {
  const reactivity = audio.updateVisualizer();
  renderVisualizer(reactivity);
  renderTable(reactivity);
  renderBalls();
  renderCueGuide();
}

function shadeColor(hex, percent) {
  const numeric = hex.replace("#", "");
  const number = parseInt(numeric, 16);
  const amount = Math.round(2.55 * percent);
  const r = clamp((number >> 16) + amount, 0, 255);
  const g = clamp(((number >> 8) & 0x00ff) + amount, 0, 255);
  const b = clamp((number & 0x0000ff) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

let previousTime = 0;
let accumulator = 0;
const fixedStep = 1 / 120;

function frame(time) {
  if (!previousTime) {
    previousTime = time;
  }

  const delta = Math.min(0.032, (time - previousTime) / 1000);
  previousTime = time;
  accumulator += delta;

  if (state.running) {
    audio.scheduleMusic();
    while (accumulator >= fixedStep) {
      updatePhysics(fixedStep);
      accumulator -= fixedStep;
    }

    if (state.pendingCueRespawn && !anyBallMoving()) {
      respawnCueBall();
    }

    if (!anyBallMoving() && state.message.includes("공이 멈추면")) {
      state.message = state.win ? state.message : "다음 샷을 조준할 차례입니다.";
      updateHud();
    }
  }

  draw();
  requestAnimationFrame(frame);
}

async function startGame() {
  await audio.unlock();
  state.running = true;
  startOverlay.classList.add("hidden");
  state.message = "사운드가 활성화됐습니다. 흰 공을 당겨 첫 샷을 시작하세요.";
  updateHud();
}

function initButtons() {
  restartButton.addEventListener("click", () => {
    resetGame();
  });

  musicButton.addEventListener("click", async () => {
    await audio.unlock();
    audio.setMusicEnabled(!audio.musicEnabled);
    musicButton.textContent = audio.musicEnabled ? "음악 켜짐" : "음악 꺼짐";
  });

  fxButton.addEventListener("click", async () => {
    await audio.unlock();
    audio.setFxEnabled(!audio.fxEnabled);
    fxButton.textContent = audio.fxEnabled ? "효과음 켜짐" : "효과음 꺼짐";
  });
}

function bindInput() {
  const options = { passive: false };
  canvas.addEventListener("pointerdown", handlePointerDown, options);
  window.addEventListener("pointermove", handlePointerMove, options);
  window.addEventListener("pointerup", handlePointerUp, options);
  window.addEventListener("pointercancel", handlePointerUp, options);
  document.body.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
}

startButton.addEventListener("click", startGame);
startOverlay.addEventListener("click", (event) => {
  if (event.target === startOverlay) {
    startGame();
  }
});

window.addEventListener("resize", resize);

resetGame();
resize();
initButtons();
bindInput();
requestAnimationFrame(frame);
