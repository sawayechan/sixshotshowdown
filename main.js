import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { World, Body, Sphere, Plane, Vec3, Material, ContactMaterial } from "https://esm.sh/cannon-es@0.20.0";

const MAX_ROUNDS = 3;
const FIXED_STEP = 1 / 60;
const BALL_RADIUS = 0.45;
const HOLE_DEPTH_FACTOR = 0.66;
const CPU_THINK_MS = 2200;
const BALL_START = new Vec3(0, 2.25, 24.5);
const STATS_KEY = "six_shot_showdown_stats";
const LANE_HALF_WIDTH = 70;
const LANE_START_Z = 44;
const LANE_END_Z = -79;

const SCORE_ROWS = [
  { score: 1, z: -26.0, count: 1, radius: 0.92 },
  { score: 2, z: -32.0, count: 2, radius: 0.9 },
  { score: 3, z: -38.0, count: 3, radius: 0.88 },
  { score: 4, z: -44.0, count: 4, radius: 0.86 },
  { score: 5, z: -50.0, count: 5, radius: 0.84 },
  { score: 6, z: -56.0, count: 6, radius: 0.82 },
];

const HOLES = buildHoles(SCORE_ROWS);
const HOLES_BY_SCORE = new Map();
for (const hole of HOLES) {
  if (!HOLES_BY_SCORE.has(hole.score)) HOLES_BY_SCORE.set(hole.score, []);
  HOLES_BY_SCORE.get(hole.score).push(hole);
}

const CPU_WEIGHTS = [24, 24, 20, 16, 10, 6];

const state = {
  mode: "MENU",
  round: 1,
  turn: "player",
  playerTotal: 0,
  cpuTotal: 0,
  playerShots: [],
  cpuShots: [],
  cpuSixTargets: 0,
  throwInProgress: false,
  throwOwner: null,
  scoredThisThrow: null,
  scoredHole: null,
  carrySourceScore: null,
  carryTargetScore: null,
  sinkProgress: -1,
  settleTimer: 0,
  throwElapsed: 0,
  message: "Tap Start Match",
  keyboardAim: 0,
  keyboardPower: 0.62,
  drag: {
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
  },
  stats: loadStats(),
};

const app = document.getElementById("app");
const messageEl = document.getElementById("message");
const roundLabelEl = document.getElementById("roundLabel");
const playerTotalEl = document.getElementById("playerTotal");
const cpuTotalEl = document.getElementById("cpuTotal");
const playerCardEl = document.getElementById("playerCard");
const cpuCardEl = document.getElementById("cpuCard");
const menuEl = document.getElementById("menu");
const splashEl = document.getElementById("splash");
const startBtn = document.getElementById("startBtn");
const resultLine = document.getElementById("resultLine");
const statsLine = document.getElementById("statsLine");
const cloudSprites = [];
const treeSprites = [];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = makeSkyGradientTexture();
scene.fog = new THREE.Fog(0x24384f, 48, 220);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 140);
camera.position.set(0, 17.2, 47);
camera.lookAt(0, 0, -34);

const ambient = new THREE.HemisphereLight(0xe6d7b9, 0x3a2b20, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.18);
dirLight.position.set(6, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -13;
dirLight.shadow.camera.right = 13;
dirLight.shadow.camera.top = 13;
dirLight.shadow.camera.bottom = -13;
scene.add(dirLight);

const laneFillLight = new THREE.DirectionalLight(0xe8d9ba, 0.74);
laneFillLight.position.set(0, 16, -58);
laneFillLight.target.position.set(0, 0, -46);
scene.add(laneFillLight);
scene.add(laneFillLight.target);

const endGlow = new THREE.PointLight(0xe1c8a3, 0.66, 110, 2);
endGlow.position.set(0, 4.2, -62);
scene.add(endGlow);

const world = new World({ gravity: new Vec3(0, -9.82, 0) });
world.allowSleep = true;

const groundMat = new Material("ground");
const ballMat = new Material("ball");
world.addContactMaterial(
  new ContactMaterial(groundMat, ballMat, {
    restitution: 0.22,
    friction: 0.56,
  })
);

const groundGeo = new THREE.PlaneGeometry(LANE_HALF_WIDTH * 2, 190, 1, 1);
const groundMatVisual = new THREE.MeshStandardMaterial({ color: 0x6f543e, roughness: 0.95, metalness: 0.0 });
const groundMesh = new THREE.Mesh(groundGeo, groundMatVisual);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.set(0, 0, -15);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const laneGuideMat = new THREE.LineBasicMaterial({ color: 0x7f9eb8, transparent: true, opacity: 0.45 });
for (let i = -1; i <= 1; i++) {
  const pts = [new THREE.Vector3(i * 2.7, 0.01, LANE_START_Z), new THREE.Vector3(i * 2.7, 0.01, LANE_END_Z)];
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), laneGuideMat));
}

const centerStripGeo = new THREE.PlaneGeometry(20, 170);
const centerStripMat = new THREE.MeshStandardMaterial({
  color: 0x5e4633,
  roughness: 0.92,
  metalness: 0.0,
  transparent: true,
  opacity: 0.4,
});
const centerStrip = new THREE.Mesh(centerStripGeo, centerStripMat);
centerStrip.rotation.x = -Math.PI / 2;
centerStrip.position.set(0, 0.004, -16);
centerStrip.receiveShadow = true;
scene.add(centerStrip);

const cloudTexture = makeCloudTexture();
const treeTexture = makeTreeTexture();

const groundBody = new Body({ mass: 0, shape: new Plane(), material: groundMat });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const holeMeshes = [];
for (const hole of HOLES) {
  const ringGeo = new THREE.CylinderGeometry(hole.radius, hole.radius, 0.16, 36, 1, true);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 1,
    metalness: 0.0,
    emissive: 0x000000,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(hole.x, -0.01, hole.z);
  ring.receiveShadow = true;
  scene.add(ring);

  const innerGeo = new THREE.CircleGeometry(hole.radius * 0.82, 24);
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 1,
    metalness: 0,
    emissive: 0x000000,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(hole.x, -0.06, hole.z);
  inner.receiveShadow = true;
  scene.add(inner);

  holeMeshes.push(ring);

}

const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
const ballVisualMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.35, metalness: 0.06 });
const ballMesh = new THREE.Mesh(ballGeo, ballVisualMat);
ballMesh.castShadow = true;
ballMesh.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
scene.add(ballMesh);

const ballBody = new Body({
  mass: 1.22,
  shape: new Sphere(BALL_RADIUS),
  material: ballMat,
  position: new Vec3(BALL_START.x, BALL_START.y, BALL_START.z),
  linearDamping: 0.5,
  angularDamping: 0.46,
});
ballBody.sleepSpeedLimit = 0.16;
ballBody.sleepTimeLimit = 0.35;
world.addBody(ballBody);

let rafId = 0;
let lastNow = performance.now();

startBtn.addEventListener("click", startMatch);
setupInput();
refreshStatsText();
updateHud();
updateMessage(state.message);
showSplashThenHide();

window.addEventListener("resize", resize);
resize();

function loop(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  stepGame(dt);
  render();
  rafId = requestAnimationFrame(loop);
}
rafId = requestAnimationFrame(loop);

function showSplashThenHide() {
  if (!splashEl) return;
  setTimeout(() => {
    splashEl.classList.add("hidden");
  }, 2400);
}

window.render_game_to_text = () => {
  const payload = {
    note: "Coordinates: x left(-)/right(+), y up(+), z near(+)/far(-)",
    mode: state.mode,
    round: state.round,
    turn: state.turn,
    throwsDone: { player: state.playerShots.length, cpu: state.cpuShots.length },
    totals: { player: state.playerTotal, cpu: state.cpuTotal },
    currentBall: {
      x: round2(ballBody.position.x),
      y: round2(ballBody.position.y),
      z: round2(ballBody.position.z),
      vx: round2(ballBody.velocity.x),
      vy: round2(ballBody.velocity.y),
      vz: round2(ballBody.velocity.z),
      inThrow: state.throwInProgress,
      owner: state.throwOwner,
    },
    playerControl: {
      keyboardAim: round2(state.keyboardAim),
      keyboardPower: round2(state.keyboardPower),
      dragActive: state.drag.active,
      dragDx: round2(state.drag.x - state.drag.startX),
      dragDy: round2(state.drag.y - state.drag.startY),
    },
    carry: {
      source: state.carrySourceScore,
      target: state.carryTargetScore,
    },
    holes: HOLES.map((h) => ({ score: h.score, x: h.x, z: h.z, r: h.radius })),
    stats: state.stats,
    message: state.message,
  };
  return JSON.stringify(payload, null, 2);
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (FIXED_STEP * 1000)));
  for (let i = 0; i < steps; i++) {
    stepGame(FIXED_STEP);
  }
  render();
};

function stepGame(dt) {
  const holdPreview = state.mode === "IN_MATCH" && state.turn === "player" && !state.throwInProgress;
  if (holdPreview) {
    ballBody.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    ballBody.quaternion.set(0, 0, 0, 1);
  }

  world.step(FIXED_STEP, dt, 3);
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);

  if (state.throwInProgress) {
    state.throwElapsed += dt;
    if (ballBody.position.z < LANE_END_Z - 40) {
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
      state.settleTimer = 999;
    }

    if (state.scoredHole) {
      state.sinkProgress += dt;
      const seatedY = BALL_RADIUS - BALL_RADIUS * HOLE_DEPTH_FACTOR;
      const y = seatedY - state.sinkProgress * 1.2;
      ballBody.position.set(state.scoredHole.x, Math.max(seatedY - 0.48, y), state.scoredHole.z);
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
      const scale = Math.max(0.01, 1 - state.sinkProgress * 3.6);
      ballMesh.scale.set(scale, scale, scale);
      if (state.sinkProgress > 0.31) {
        ballMesh.visible = false;
        state.settleTimer = 999;
      }
    } else if (!state.scoredThisThrow) {
      const detected = detectHoleScore(ballBody.position);
      if (detected) {
        const speed = ballBody.velocity.length();
        const forwardSpeed = -ballBody.velocity.z;
        const canCarry =
          !state.carryTargetScore &&
          detected.score < SCORE_ROWS.length &&
          speed > 5.1 &&
          forwardSpeed > 4.2;
        if (canCarry) {
          state.carrySourceScore = detected.score;
          state.carryTargetScore = detected.score + 1;
          ballBody.position.set(detected.x, BALL_RADIUS * 0.76, detected.z + 0.15);
          ballBody.velocity.set(
            ballBody.velocity.x * 0.35,
            Math.max(1.05, speed * 0.14),
            -Math.max(3.1, forwardSpeed * 0.52)
          );
          ballBody.angularVelocity.set(0, 0, 0);
        } else {
          lockScoreInHole(detected);
        }
      }

      if (state.carryTargetScore) {
        const targetRow = SCORE_ROWS[state.carryTargetScore - 1];
        if (ballBody.position.z <= targetRow.z - 1.25) {
          lockScoreInHole(closestHoleInRow(state.carryTargetScore, ballBody.position.x));
        } else if (ballBody.velocity.length() < 0.5 && ballBody.position.z > targetRow.z + 1.3) {
          lockScoreInHole(closestHoleInRow(state.carrySourceScore, ballBody.position.x));
        }
      }
    }

    const speed = ballBody.velocity.length();
    if (!state.scoredHole && speed > 0.24) {
      startRollingSound();
      updateRollingSound(speed);
    } else {
      stopRollingSound();
    }

    if (speed < 0.23) {
      state.settleTimer += dt;
    } else {
      state.settleTimer = 0;
    }

    if (state.settleTimer > 0.5) {
      resolveThrow();
    }
  } else {
    stopRollingSound();
  }
}

function resolveThrow() {
  if (!state.throwInProgress) return;
  stopRollingSound();

  const score = state.scoredThisThrow ?? inferStoppedScore(ballBody.position);
  if (score === 0) {
    playSound("miss");
  }

  if (state.throwOwner === "player") {
    state.playerShots.push(score);
    state.playerTotal += score;
    updateMessage(score > 0 ? `You scored ${score}. CPU turn...` : "Missed. CPU turn...");
    state.throwInProgress = false;
    updateHud();
    setTimeout(() => {
      if (state.mode !== "IN_MATCH") return;
      updateMessage("CPU throws...");
      cpuThrow();
    }, CPU_THINK_MS);
    return;
  }

  state.cpuShots.push(score);
  state.cpuTotal += score;
  updateHud();

  state.throwInProgress = false;

  if (state.round >= MAX_ROUNDS) {
    finishMatch();
    return;
  }

  state.round += 1;
  state.turn = "player";
  spawnBall();
  state.mode = "IN_MATCH";
  updateMessage(`Round ${state.round}: your throw.`);
  updateHud();
}

function startMatch() {
  state.round = 1;
  state.turn = "player";
  state.mode = "IN_MATCH";
  state.playerTotal = 0;
  state.cpuTotal = 0;
  state.playerShots = [];
  state.cpuShots = [];
  state.cpuSixTargets = 0;
  state.throwInProgress = false;
  state.throwOwner = null;
  state.scoredThisThrow = null;
  state.scoredHole = null;
  state.carrySourceScore = null;
  state.carryTargetScore = null;
  state.sinkProgress = -1;
  state.settleTimer = 0;
  state.throwElapsed = 0;
  state.keyboardAim = 0;
  state.keyboardPower = 0.62;
  resetDrag();
  refreshClouds();
  refreshTrees();
  spawnBall();
  menuEl.classList.add("hidden");
  resultLine.textContent = "";
  updateMessage("Round 1: drag upward to throw.");
  updateHud();
}

function cpuThrow() {
  if (state.mode !== "IN_MATCH" || state.throwInProgress) return;
  state.turn = "cpu";
  spawnBall();
  updateHud();

  const target = pickCpuTargetHole();
  if (target.score === 6) {
    state.cpuSixTargets += 1;
  }
  const scoreGap = state.playerTotal - state.cpuTotal;
  const isBehind = scoreGap > 0;
  const aggressiveChance = isBehind ? Math.min(0.95, 0.65 + scoreGap * 0.1) : 0.28;
  const aggressive = Math.random() < aggressiveChance;
  const desired = computeCpuImpulse(target, aggressive, scoreGap);
  applyThrowImpulse("cpu", desired);
}

function pickWeightedHole() {
  const totalWeight = CPU_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < CPU_WEIGHTS.length; i++) {
    r -= CPU_WEIGHTS[i];
    if (r <= 0) {
      const score = i + 1;
      const options = HOLES_BY_SCORE.get(score) || [];
      return options[Math.floor(Math.random() * options.length)] || HOLES[0];
    }
  }
  return HOLES[0];
}

function pickCpuTargetHole() {
  const throwsDone = state.cpuShots.length;
  const throwsRemaining = 3 - throwsDone;
  const needSix = Math.max(0, 2 - state.cpuSixTargets);

  if (needSix > 0 && needSix >= throwsRemaining) {
    const sixHoles = HOLES_BY_SCORE.get(6) || [];
    return sixHoles[Math.floor(Math.random() * sixHoles.length)] || HOLES[0];
  }

  if (needSix > 0 && Math.random() < 0.78) {
    const sixHoles = HOLES_BY_SCORE.get(6) || [];
    return sixHoles[Math.floor(Math.random() * sixHoles.length)] || HOLES[0];
  }

  return pickWeightedHole();
}

function computeCpuImpulse(hole, aggressive = false, scoreGap = 0) {
  const dz = Math.abs(hole.z - BALL_START.z);
  const gapBoost = Math.max(0, scoreGap) * (aggressive ? 0.24 : 0.14);
  const sixBoost = hole.score === 6 ? 0.38 : 0;
  const powerBase = (aggressive ? 5.7 : 4.95) + dz * (aggressive ? 0.154 : 0.145) + gapBoost + sixBoost;
  const lateral = (hole.x - BALL_START.x) * (aggressive ? 1.08 : 1.02);
  const jitterX = (Math.random() - 0.5) * (aggressive ? 0.22 : 0.36);
  const jitterZ = (Math.random() - 0.5) * (aggressive ? 0.24 : 0.42);
  const upward = (aggressive ? 0.46 : 0.38) + Math.random() * (aggressive ? 0.36 : 0.46);
  return new Vec3(lateral + jitterX, upward, -(powerBase + jitterZ));
}

function detectHoleScore(pos) {
  if (pos.y > 1.35) return null;
  for (const hole of HOLES) {
    const dx = pos.x - hole.x;
    const dz = pos.z - hole.z;
    if (dx * dx + dz * dz <= (hole.radius * 0.86) ** 2) {
      return hole;
    }
  }
  return null;
}

function inferStoppedScore(pos) {
  let best = null;
  for (const hole of HOLES) {
    const dx = pos.x - hole.x;
    const dz = pos.z - hole.z;
    const d2 = dx * dx + dz * dz;
    const cutoff = (hole.radius * 0.95) ** 2;
    if (d2 > cutoff) continue;
    if (!best || d2 < best.d2) {
      best = { d2, score: hole.score };
    }
  }
  return best ? best.score : 0;
}

function spawnBall() {
  stopRollingSound();
  ballBody.wakeUp();
  ballBody.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.quaternion.set(0, 0, 0, 1);
  state.throwInProgress = false;
  state.throwOwner = null;
  state.scoredThisThrow = null;
  state.scoredHole = null;
  state.carrySourceScore = null;
  state.carryTargetScore = null;
  state.sinkProgress = -1;
  state.throwElapsed = 0;
  state.settleTimer = 0;
  ballMesh.visible = true;
  ballMesh.scale.set(1, 1, 1);
}

function applyThrowImpulse(owner, impulse) {
  spawnBall();
  state.throwInProgress = true;
  state.throwOwner = owner;
  state.scoredThisThrow = null;
  state.scoredHole = null;
  state.carrySourceScore = null;
  state.carryTargetScore = null;
  state.sinkProgress = -1;
  state.settleTimer = 0;
  state.throwElapsed = 0;
  ballBody.applyImpulse(impulse, ballBody.position);
  playSound("throw");
}

function finishMatch() {
  state.mode = "MENU";
  menuEl.classList.remove("hidden");

  let verdict = "draw";
  if (state.playerTotal > state.cpuTotal) {
    verdict = "win";
    playSound("win");
    state.stats.winsTotal += 1;
    state.stats.winStreak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.winStreak);
    state.stats.totalPoints += 10 + 2 * state.stats.winStreak;
  } else if (state.playerTotal < state.cpuTotal) {
    verdict = "lose";
    playSound("lose");
    state.stats.lossesTotal += 1;
    state.stats.winStreak = 0;
  } else {
    playSound("draw");
  }

  saveStats();

  if (verdict === "win") {
    resultLine.innerHTML = `<strong class="good">You win ${state.playerTotal} - ${state.cpuTotal}</strong>`;
  } else if (verdict === "lose") {
    resultLine.innerHTML = `<strong class="bad">CPU wins ${state.cpuTotal} - ${state.playerTotal}</strong>`;
  } else {
    resultLine.innerHTML = `<strong>Draw ${state.playerTotal} - ${state.cpuTotal}</strong>`;
  }

  refreshStatsText();
  updateMessage("Match complete. Tap Start Match for a rematch.");
}

function updateHud() {
  playerTotalEl.textContent = String(state.playerTotal);
  cpuTotalEl.textContent = String(state.cpuTotal);
  roundLabelEl.textContent = `Round ${Math.min(state.round, MAX_ROUNDS)}`;
  updateTurnVisuals();
}

function updateMessage(text) {
  state.message = text;
  messageEl.textContent = text;
  updateTurnVisuals();
}

function refreshStatsText() {
  statsLine.textContent = `W ${state.stats.winsTotal} • L ${state.stats.lossesTotal} • Streak ${state.stats.winStreak} • Best ${state.stats.bestStreak} • Points ${state.stats.totalPoints}`;
}

function currentTurnOwner() {
  if (state.mode !== "IN_MATCH") return "neutral";
  if (state.throwInProgress && state.throwOwner) return state.throwOwner;
  return state.turn || "neutral";
}

function updateTurnVisuals() {
  const owner = currentTurnOwner();
  messageEl.classList.remove("player-turn", "cpu-turn", "neutral-turn");
  playerCardEl.classList.remove("active");
  cpuCardEl.classList.remove("active");
  if (owner === "player") {
    messageEl.classList.add("player-turn");
    playerCardEl.classList.add("active");
  } else if (owner === "cpu") {
    messageEl.classList.add("cpu-turn");
    cpuCardEl.classList.add("active");
  } else {
    messageEl.classList.add("neutral-turn");
  }
}

function setupInput() {
  const canvas = renderer.domElement;

  canvas.addEventListener("pointerdown", (ev) => {
    if (state.mode !== "IN_MATCH" || state.turn !== "player" || state.throwInProgress) return;
    state.drag.active = true;
    state.drag.pointerId = ev.pointerId;
    state.drag.startX = ev.clientX;
    state.drag.startY = ev.clientY;
    state.drag.x = ev.clientX;
    state.drag.y = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!state.drag.active || ev.pointerId !== state.drag.pointerId) return;
    state.drag.x = ev.clientX;
    state.drag.y = ev.clientY;
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!state.drag.active || ev.pointerId !== state.drag.pointerId) return;
    const dx = ev.clientX - state.drag.startX;
    const dy = state.drag.startY - ev.clientY;
    resetDrag();

    if (state.mode !== "IN_MATCH" || state.turn !== "player" || state.throwInProgress) return;

    const power = THREE.MathUtils.clamp(dy / 180, 0, 1.12);
    if (power < 0.08) {
      updateMessage("Flick upward harder.");
      return;
    }

    const side = THREE.MathUtils.clamp(dx / 180, -0.8, 0.8);
    const impulse = new Vec3(side * 4.05, 0.3 + power * 1.08, -(3.7 + power * 7.8));
    applyThrowImpulse("player", impulse);
    state.turn = "cpu";
    updateHud();
    updateMessage("Ball in motion...");
  });

  canvas.addEventListener("pointercancel", resetDrag);

  window.addEventListener("keydown", (ev) => {
    if (ev.code === "KeyF") {
      toggleFullscreen();
      return;
    }

    if (state.mode !== "IN_MATCH" || state.turn !== "player" || state.throwInProgress) return;

    if (ev.code === "ArrowLeft") {
      state.keyboardAim = THREE.MathUtils.clamp(state.keyboardAim - 0.07, -0.9, 0.9);
      updateMessage(`Aim ${state.keyboardAim.toFixed(2)}, power ${state.keyboardPower.toFixed(2)}`);
    } else if (ev.code === "ArrowRight") {
      state.keyboardAim = THREE.MathUtils.clamp(state.keyboardAim + 0.07, -0.9, 0.9);
      updateMessage(`Aim ${state.keyboardAim.toFixed(2)}, power ${state.keyboardPower.toFixed(2)}`);
    } else if (ev.code === "ArrowUp") {
      state.keyboardPower = THREE.MathUtils.clamp(state.keyboardPower + 0.06, 0.2, 1.15);
      updateMessage(`Aim ${state.keyboardAim.toFixed(2)}, power ${state.keyboardPower.toFixed(2)}`);
    } else if (ev.code === "ArrowDown") {
      state.keyboardPower = THREE.MathUtils.clamp(state.keyboardPower - 0.06, 0.2, 1.15);
      updateMessage(`Aim ${state.keyboardAim.toFixed(2)}, power ${state.keyboardPower.toFixed(2)}`);
    } else if (ev.code === "Space") {
      const impulse = new Vec3(
        state.keyboardAim * 3.7,
        0.34 + state.keyboardPower * 1.02,
        -(3.8 + state.keyboardPower * 7.45)
      );
      applyThrowImpulse("player", impulse);
      state.turn = "cpu";
      updateHud();
      updateMessage("Ball in motion...");
    }
  });

  document.addEventListener("fullscreenchange", resize);
}

function makeHoleLabel(num) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(4,20,34,0.72)";
  ctx.beginPath();
  ctx.arc(64, 64, 43, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,196,90,0.85)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#fff3cc";
  ctx.font = "700 56px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), 64, 67);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  return new THREE.Sprite(mat);
}

function makeCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const blobs = [
    [66, 70, 34],
    [98, 56, 44],
    [140, 66, 38],
    [178, 74, 30],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeSkyGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#8fbbe0");
  g.addColorStop(0.58, "#5f83aa");
  g.addColorStop(0.82, "#2f4662");
  g.addColorStop(1, "#0d1827");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function refreshClouds() {
  for (const s of cloudSprites) {
    scene.remove(s);
    s.material.dispose();
  }
  cloudSprites.length = 0;

  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.72 + Math.random() * 0.16,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      THREE.MathUtils.randFloatSpread(34),
      THREE.MathUtils.randFloat(30, 38),
      THREE.MathUtils.randFloat(-70, -20)
    );
    const w = THREE.MathUtils.randFloat(8, 18);
    const h = w * THREE.MathUtils.randFloat(0.28, 0.48);
    sprite.scale.set(w, h, 1);
    scene.add(sprite);
    cloudSprites.push(sprite);
  }
}

function makeTreeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(58,33,18,0.95)";
  ctx.fillRect(86, 60, 20, 180);

  const blobs = [
    [96, 98, 56],
    [66, 114, 44],
    [126, 116, 42],
    [96, 70, 42],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 5, x, y, r);
    g.addColorStop(0, "rgba(64,112,54,0.95)");
    g.addColorStop(1, "rgba(30,64,28,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function refreshTrees() {
  for (const s of treeSprites) {
    scene.remove(s);
    s.material.dispose();
  }
  treeSprites.length = 0;

  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: treeTexture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    const z = THREE.MathUtils.randFloat(-78, -68);
    const depthT = THREE.MathUtils.clamp((Math.abs(z) - 68) / 10, 0, 1);
    const h = THREE.MathUtils.randFloat(4.6, 7.8) * (0.86 + depthT * 0.28);
    const w = h * THREE.MathUtils.randFloat(0.46, 0.6);
    const y = 0.95 + depthT * 0.62;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * THREE.MathUtils.randFloat(8, 18);
    sprite.position.set(
      x,
      y,
      z
    );
    sprite.scale.set(w, h, 1);
    scene.add(sprite);
    treeSprites.push(sprite);
  }
}

function resetDrag() {
  state.drag.active = false;
  state.drag.pointerId = -1;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function render() {
  renderer.render(scene, camera);
}

function loadStats() {
  const defaults = {
    winsTotal: 0,
    lossesTotal: 0,
    winStreak: 0,
    bestStreak: 0,
    totalPoints: 0,
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return defaults;
    return {
      winsTotal: toSafeInt(parsed.winsTotal),
      lossesTotal: toSafeInt(parsed.lossesTotal),
      winStreak: toSafeInt(parsed.winStreak),
      bestStreak: toSafeInt(parsed.bestStreak),
      totalPoints: toSafeInt(parsed.totalPoints),
    };
  } catch {
    return defaults;
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
}

function toSafeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildHoles(rows) {
  const holes = [];
  for (const row of rows) {
    const spacing = Math.min(2.26, row.radius * 2.32 + 0.2);
    const startX = -((row.count - 1) * spacing) / 2;
    for (let i = 0; i < row.count; i++) {
      holes.push({
        score: row.score,
        x: startX + i * spacing,
        z: row.z,
        radius: row.radius,
      });
    }
  }
  return holes;
}

function closestHoleInRow(score, xPos) {
  const row = HOLES_BY_SCORE.get(score) || [];
  if (!row.length) return HOLES[0];
  let best = row[0];
  let bestDx = Math.abs(row[0].x - xPos);
  for (let i = 1; i < row.length; i++) {
    const dx = Math.abs(row[i].x - xPos);
    if (dx < bestDx) {
      best = row[i];
      bestDx = dx;
    }
  }
  return best;
}

function lockScoreInHole(hole) {
  state.scoredThisThrow = hole.score;
  state.scoredHole = hole;
  state.carrySourceScore = null;
  state.carryTargetScore = null;
  state.sinkProgress = 0;
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.position.set(hole.x, BALL_RADIUS * 0.76, hole.z);
  state.settleTimer = 0;
  playSound("hole");
}

function toggleFullscreen() {
  const elem = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    elem.requestFullscreen?.().catch(() => {});
  }
}

let audioCtx = null;
let rollingNoise = null;
let rollingGain = null;
let rollingFilter = null;
function playSound(kind) {
  const map = {
    throw: { f: 210, type: "triangle", dur: 0.08, gain: 0.12 },
    hole: { f: 620, type: "sine", dur: 0.18, gain: 0.16 },
    miss: { f: 160, type: "sawtooth", dur: 0.14, gain: 0.1 },
    win: { f: 780, type: "triangle", dur: 0.24, gain: 0.18 },
    lose: { f: 120, type: "square", dur: 0.24, gain: 0.12 },
    draw: { f: 330, type: "sine", dur: 0.2, gain: 0.12 },
  };
  const s = map[kind];
  if (!s) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = s.type;
  osc.frequency.value = s.f;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(s.gain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + s.dur + 0.03);
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function startRollingSound() {
  if (rollingNoise) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.55;
  }
  rollingNoise = ctx.createBufferSource();
  rollingNoise.buffer = buffer;
  rollingNoise.loop = true;

  rollingFilter = ctx.createBiquadFilter();
  rollingFilter.type = "lowpass";
  rollingFilter.frequency.value = 140;

  rollingGain = ctx.createGain();
  rollingGain.gain.value = 0.0001;
  rollingNoise.connect(rollingFilter);
  rollingFilter.connect(rollingGain);
  rollingGain.connect(ctx.destination);
  rollingNoise.start();
}

function updateRollingSound(speed) {
  if (!audioCtx || !rollingNoise || !rollingGain || !rollingFilter) return;
  const t = audioCtx.currentTime;
  const targetGain = Math.min(0.055, Math.max(0.004, (speed - 0.15) * 0.0065));
  const targetCutoff = Math.min(420, 120 + speed * 26);
  rollingGain.gain.cancelScheduledValues(t);
  rollingGain.gain.setTargetAtTime(targetGain, t, 0.03);
  rollingFilter.frequency.cancelScheduledValues(t);
  rollingFilter.frequency.setTargetAtTime(targetCutoff, t, 0.04);
}

function stopRollingSound() {
  if (!audioCtx || !rollingNoise || !rollingGain) return;
  const t = audioCtx.currentTime;
  rollingGain.gain.cancelScheduledValues(t);
  rollingGain.gain.setTargetAtTime(0.0001, t, 0.04);
  const noise = rollingNoise;
  const gain = rollingGain;
  const filter = rollingFilter;
  rollingNoise = null;
  rollingGain = null;
  rollingFilter = null;
  noise.stop(t + 0.08);
  setTimeout(() => {
    try {
      noise.disconnect();
      if (filter) filter.disconnect();
      gain.disconnect();
    } catch {}
  }, 120);
}

appendProgress("Implemented initial playable prototype with scene, physics, turns, CPU logic, score resolve, result flow, sounds, and localStorage stats.");

function appendProgress(line) {
  // no-op in browser; progress is tracked on disk by agent.
  void line;
}
