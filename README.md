const canvasWrap = document.getElementById('game-root');
const ui = {
  home: document.getElementById('home-score'),
  away: document.getElementById('away-score'),
  clock: document.getElementById('match-clock'),
  start: document.getElementById('start-screen'),
  pause: document.getElementById('pause-screen'),
  end: document.getElementById('end-screen'),
  toast: document.getElementById('toast'),
  result: document.getElementById('result-title'),
  copy: document.getElementById('result-copy'),
  sound: document.getElementById('sound-button')
};

const keys = new Set();
let state = 'ready';
let lastTime = 0;
let remaining = 120;
let homeScore = 0;
let awayScore = 0;
let soundOn = true;
let toastTimer = null;
let audioCtx = null;
let touchMove = null;

const FIELD = {
  width: 16,
  depth: 9,
  goalDepth: 1.4,
  goalHeight: 2.6,
  left: -8,
  right: 8,
  top: -4.5,
  bottom: 4.5,
  center: 0
};

const config = {
  playerRadius: 0.45,
  ballRadius: 0.22,
  maxSpeed: 5.8,
  sprintSpeed: 7.5,
  friction: 0.985,
  touchTurn: 0.7
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1f12);
scene.fog = new THREE.Fog(0x0a1f12, 15, 35);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 8.5, 12.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasWrap.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xe9fff3, 0x1b3123, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(10, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

const fieldGroup = new THREE.Group();
scene.add(fieldGroup);

const fieldMat = new THREE.MeshStandardMaterial({ color: 0x1ea75b, roughness: 0.9, metalness: 0.1 });
const fieldGround = new THREE.Mesh(new THREE.BoxGeometry(FIELD.width + 1.5, 0.25, FIELD.depth + 1.5), fieldMat);
fieldGround.position.y = -0.2;
fieldGround.receiveShadow = true;
fieldGroup.add(fieldGround);

const pitch = new THREE.Mesh(new THREE.BoxGeometry(FIELD.width, 0.12, FIELD.depth), new THREE.MeshStandardMaterial({ color: 0x18a45a, roughness: 0.8 }));
pitch.position.y = 0.05;
pitch.receiveShadow = true;
fieldGroup.add(pitch);

const lineMat = new THREE.LineBasicMaterial({ color: 0xf2fff7, transparent: true, opacity: 0.8 });
const goalLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(FIELD.left, 0.08, FIELD.top),
  new THREE.Vector3(FIELD.right, 0.08, FIELD.top),
  new THREE.Vector3(FIELD.right, 0.08, FIELD.bottom),
  new THREE.Vector3(FIELD.left, 0.08, FIELD.bottom),
  new THREE.Vector3(FIELD.left, 0.08, FIELD.top)
]);
fieldGroup.add(new THREE.Line(goalLineGeo, lineMat));

const centerLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.08, FIELD.top),
    new THREE.Vector3(0, 0.08, FIELD.bottom)
  ]), lineMat
);
fieldGroup.add(centerLine);

const centerCircle = new THREE.Mesh(
  new THREE.RingGeometry(1.3, 1.45, 64),
  new THREE.MeshBasicMaterial({ color: 0xf7fff8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
);
centerCircle.rotation.x = -Math.PI / 2;
centerCircle.position.y = 0.09;
fieldGroup.add(centerCircle);

const penaltyBoxLeft = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(FIELD.left, 0.08, -2.2), new THREE.Vector3(FIELD.left + 2.2, 0.08, -2.2),
  new THREE.Vector3(FIELD.left + 2.2, 0.08, 2.2), new THREE.Vector3(FIELD.left, 0.08, 2.2)
]), lineMat);
fieldGroup.add(penaltyBoxLeft);

const penaltyBoxRight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(FIELD.right, 0.08, -2.2), new THREE.Vector3(FIELD.right - 2.2, 0.08, -2.2),
  new THREE.Vector3(FIELD.right - 2.2, 0.08, 2.2), new THREE.Vector3(FIELD.right, 0.08, 2.2)
]), lineMat);
fieldGroup.add(penaltyBoxRight);

const goalLeft = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalDepth + 0.2, 2.8, 2.8), new THREE.MeshStandardMaterial({ color: 0xbfe9ce, transparent: true, opacity: 0.18 }));
goalLeft.position.set(FIELD.left - 0.6, 1.4, 0);
fieldGroup.add(goalLeft);

const goalRight = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalDepth + 0.2, 2.8, 2.8), new THREE.MeshStandardMaterial({ color: 0xbfe9ce, transparent: true, opacity: 0.18 }));
goalRight.position.set(FIELD.right + 0.6, 1.4, 0);
fieldGroup.add(goalRight);

function createPlayer(team, x, z, number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  const bodyColor = team === 'home' ? 0x2563eb : 0xe74b49;
  const shortColor = team === 'home' ? 0xbadaff : 0xffc5c5;
  const skinColor = 0xd8a478;
  const darkColor = 0x1f2328;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.2 }));
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);

  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.48, 12), new THREE.MeshStandardMaterial({ color: shortColor, roughness: 0.8 }));
  shorts.position.y = 0.52;
  shorts.castShadow = true;
  group.add(shorts);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), new THREE.MeshStandardMaterial({ color: skinColor, roughness: 1 }));
  head.position.y = 2.08;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a211d }));
  hair.position.set(0, 2.25, -0.04);
  hair.scale.set(1.1, 0.8, 1.1);
  group.add(hair);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.58, 3, 8), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 }));
  leftArm.position.set(-0.5, 1.25, 0);
  leftArm.rotation.z = Math.PI / 2.5;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.5;
  rightArm.rotation.z = -Math.PI / 2.5;
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 3, 10), new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.9 }));
  leftLeg.position.set(-0.16, 0.15, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.16;
  group.add(rightLeg);

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.42), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
  leftShoe.position.set(-0.16, -0.43, 0.12);
  leftShoe.castShadow = true;
  group.add(leftShoe);

  const rightShoe = leftShoe.clone();
  rightShoe.position.x = 0.16;
  group.add(rightShoe);

  const jerseyNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xfafafa, side: THREE.DoubleSide })
  );
  jerseyNumber.position.set(0, 1.15, 0.42);
  group.add(jerseyNumber);

  const label = document.createElement('canvas');
  label.width = 128; label.height = 128;
  const ctx = label.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 88px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 76);
  const labelTex = new THREE.CanvasTexture(label);
  jerseyNumber.material.map = labelTex;
  jerseyNumber.material.transparent = true;

  return {
    team,
    group,
    body: torso,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    leftShoe,
    rightShoe,
    x,
    z,
    vx: 0,
    vz: 0,
    radius: 0.55,
    kick: 0,
    angle: team === 'home' ? 0 : Math.PI,
    stride: 0,
    number
  };
}

const home = [createPlayer('home', -4, 0, 9), createPlayer('home', -3.5, 2.7, 7), createPlayer('home', -3.5, -2.7, 11)];
const away = [createPlayer('away', 4, 0, 9), createPlayer('away', 3.7, 2.8, 5), createPlayer('away', 3.7, -2.8, 6)];
const players = [...home, ...away];

const ball = {
  mesh: new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 28, 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 })
  ),
  x: 0,
  y: 0.25,
  z: 0,
  vx: 0,
  vz: 0,
  radius: 0.24,
  lastTouch: 'home'
};
ball.mesh.position.set(ball.x, ball.y, ball.z);
ball.mesh.castShadow = true;
ball.mesh.receiveShadow = true;
scene.add(ball.mesh);

function updateScore() {
  ui.home.textContent = String(homeScore);
  ui.away.textContent = String(awayScore);
  const totalSeconds = Math.ceil(remaining);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  ui.clock.textContent = `${minutes}:${seconds}`;
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1200);
}

function playTone(freq = 440, duration = 0.1, type = 'sine') {
  if (!soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) {
    // Audio is optional. Ignore if unsupported.
  }
}

function resetPositions() {
  const homeInit = [
    { x: -4, z: 0 },
    { x: -3.4, z: 2.8 },
    { x: -3.4, z: -2.8 }
  ];
  const awayInit = [
    { x: 4, z: 0 },
    { x: 3.4, z: 2.8 },
    { x: 3.4, z: -2.8 }
  ];

  for (let i = 0; i < home.length; i++) {
    const p = home[i];
    p.x = homeInit[i].x; p.z = homeInit[i].z; p.vx = 0; p.vz = 0; p.kick = 0; p.angle = 0; p.stride = 0;
    p.group.position.set(p.x, 0, p.z);
  }

  for (let i = 0; i < away.length; i++) {
    const p = away[i];
    p.x = awayInit[i].x; p.z = awayInit[i].z; p.vx = 0; p.vz = 0; p.kick = 0; p.angle = Math.PI; p.stride = 0;
    p.group.position.set(p.x, 0, p.z);
  }

  ball.x = 0; ball.z = 0; ball.vx = 0; ball.vz = 0;
  ball.mesh.position.set(ball.x, ball.y, ball.z);
  ball.lastTouch = 'home';
}

function resetMatch() {
  homeScore = 0;
  awayScore = 0;
  remaining = 120;
  updateScore();
  resetPositions();
}

function startMatch() {
  if (state === 'playing') return;
  resetMatch();
  state = 'playing';
  ui.start.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.end.classList.add('hidden');
  showToast('MATCH START');
  lastTime = performance.now();
}

function setPause() {
  if (state === 'playing') {
    state = 'paused';
    ui.pause.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    ui.pause.classList.add('hidden');
    lastTime = performance.now();
  }
}

function movePlayer(player, dx, dz, speed, dt) {
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    player.vx = (dx / length) * speed;
    player.vz = (dz / length) * speed;
    player.angle = Math.atan2(player.vz, player.vx);
  } else {
    player.vx *= 0.8;
    player.vz *= 0.8;
  }

  player.x += player.vx * dt;
  player.z += player.vz * dt;
  player.group.position.set(player.x, 0, player.z);
  player.group.rotation.y = player.angle;

  player.x = Math.min(FIELD.right - player.radius, Math.max(FIELD.left + player.radius, player.x));
  player.z = Math.min(FIELD.bottom - player.radius, Math.max(FIELD.top + player.radius, player.z));
  player.group.position.set(player.x, 0, player.z);
  player.stride += Math.hypot(player.vx, player.vz) * dt * 1.8;

  const swing = Math.sin(player.stride) * 0.45;
  player.leftLeg.rotation.x = swing;
  player.rightLeg.rotation.x = -swing;
  player.leftArm.rotation.x = -swing * 0.8;
  player.rightArm.rotation.x = swing * 0.8;
}

function shoot(player) {
  if (player.kick > 0) return;
  const dx = ball.x - player.x;
  const dz = ball.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.95) return;

  player.kick = 0.45;
  ball.lastTouch = player.team;

  const targetX = player.team === 'home' ? FIELD.right + 0.5 : FIELD.left - 0.5;
  const targetZ = (Math.random() - 0.5) * 3.5;
  const dirX = targetX - player.x;
  const dirZ = targetZ - player.z;
  const magnitude = Math.hypot(dirX, dirZ) || 1;
  const speed = 9.2;
  ball.vx = (dirX / magnitude) * speed + player.vx * 0.22;
  ball.vz = (dirZ / magnitude) * speed + player.vz * 0.22;
  ball.x = player.x + (dirX / magnitude) * 0.8;
  ball.z = player.z + (dirZ / magnitude) * 0.8;
  playTone(260, 0.12, 'triangle');
}

function scoreGoal(team) {
  if (team === 'home') homeScore += 1; else awayScore += 1;
  updateScore();
  playTone(520, 0.2, 'triangle');
  setTimeout(() => playTone(700, 0.28, 'triangle'), 120);
  showToast(team === 'home' ? 'GOAL! UNITED!' : 'GOAL! RIVALS!');
  resetPositions();
}

function update(dt) {
  if (state !== 'playing') return;

  remaining = Math.max(0, remaining - dt);
  updateScore();

  const controlled = home[0];

  let dx = 0;
  let dz = 0;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('w') || keys.has('arrowup')) dz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dz += 1;

  if (touchMove) {
    dx = touchMove.x * config.touchTurn;
    dz = touchMove.y * config.touchTurn;
  }

  const speed = keys.has('shift') ? config.sprintSpeed : config.maxSpeed;
  movePlayer(controlled, dx, dz, speed, dt);

  home.slice(1).forEach((player, index) => {
    const runTargetX = ball.x + (index === 0 ? -1.7 : -2.5);
    const runTargetZ = ball.z + (index === 0 ? -2.1 : 2.1);
    const chase = Math.abs(controlled.x - ball.x) > 2.1 && Math.hypot(player.x - ball.x, player.z - ball.z) < 3.9;
    const targetX = chase ? ball.x : Math.max(FIELD.left + 1.4, Math.min(FIELD.right - 1.4, runTargetX));
    const targetZ = chase ? ball.z : Math.max(FIELD.top + 1.3, Math.min(FIELD.bottom - 1.3, runTargetZ));
    movePlayer(player, targetX - player.x, targetZ - player.z, chase ? 3.9 : 3.1, dt);
  });

  away.forEach((player, index) => {
    let targetX = ball.x + 0.8;
    let targetZ = ball.z;
    if (index > 0) {
      targetX = ball.x + 0.9;
      targetZ = ball.z + (index === 1 ? -1.8 : 1.8);
    }
    movePlayer(player, targetX - player.x, targetZ - player.z, index === 0 ? 3.6 : 3.1, dt);
  });

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const minDist = a.radius + b.radius;
      if (dist < minDist) {
        const push = (minDist - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

  players.forEach((player) => {
    player.group.position.set(player.x, 0, player.z);
    player.kick = Math.max(0, player.kick - dt);
  });

  for (const player of players) {
    const dx = ball.x - player.x;
    const dz = ball.z - player.z;
    const dist = Math.hypot(dx, dz);
    const reach = player.radius + ball.radius + 0.12;
    if (dist < reach) {
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      ball.x = player.x + nx * reach;
      ball.z = player.z + nz * reach;
      if (Math.hypot(ball.vx, ball.vz) < 7.5) {
        ball.vx += player.vx * 0.42 + (player.team === 'home' ? 0.6 : -0.6);
        ball.vz += player.vz * 0.42;
        ball.lastTouch = player.team;
      }
    }
  }

  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  ball.vx *= config.friction;
  ball.vz *= config.friction;
  ball.mesh.position.set(ball.x, ball.y, ball.z);

  const wallBounce = 0.66;
  if (ball.z < FIELD.top + ball.radius) {
    ball.z = FIELD.top + ball.radius;
    ball.vz = Math.abs(ball.vz) * wallBounce;
    playTone(180, 0.04);
  }

  if (ball.z > FIELD.bottom - ball.radius) {
    ball.z = FIELD.bottom - ball.radius;
    ball.vz = -Math.abs(ball.vz) * wallBounce;
    playTone(180, 0.04);
  }

  if (ball.x < FIELD.left + ball.radius) {
    if (ball.z > -FIELD.goalHeight / 2 && ball.z < FIELD.goalHeight / 2) {
      awayScore += 1;
      updateScore();
      showToast('GOAL! RIVALS!');
      resetPositions();
    } else {
      ball.x = FIELD.left + ball.radius;
      ball.vx = Math.abs(ball.vx) * 0.8;
    }
  }

  if (ball.x > FIELD.right - ball.radius) {
    if (ball.z > -FIELD.goalHeight / 2 && ball.z < FIELD.goalHeight / 2) {
      homeScore += 1;
      updateScore();
      showToast('GOAL! UNITED!');
      resetPositions();
    } else {
      ball.x = FIELD.right - ball.radius;
      ball.vx = -Math.abs(ball.vx) * 0.8;
    }
  }

  if (keys.has(' ') || keys.has('space')) shoot(controlled);

  if (remaining <= 0) {
    state = 'ended';
    ui.end.classList.remove('hidden');
    if (homeScore > awayScore) {
      ui.result.textContent = 'VICTORY!';
      ui.copy.textContent = `UNITED ${homeScore} : ${awayScore} RIVALS`;
    } else if (awayScore > homeScore) {
      ui.result.textContent = 'Tough day';
      ui.copy.textContent = `UNITED ${homeScore} : ${awayScore} RIVALS`;
    } else {
      ui.result.textContent = 'DRAW';
      ui.copy.textContent = `UNITED ${homeScore} : ${awayScore} RIVALS`;
    }
    playTone(330, 0.35);
  }
}

function animate(now) {
  const dt = Math.min((now - lastTime) / 1000 || 0, 0.033);
  lastTime = now;
  update(dt);

  const cameraTarget = new THREE.Vector3(0, 0.4, 0);
  const focus = home[0].group.position.clone();
  const offset = new THREE.Vector3(focus.x * 0.28, 8.2, 11.5);
  camera.position.lerp(offset, 0.1);
  camera.lookAt(cameraTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  const width = canvasWrap.clientWidth;
  const height = canvasWrap.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', onResize);
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === 'enter' && (state === 'ready' || state === 'ended')) startMatch();
  if (key === 'p') setPause();
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener('blur', () => {
  keys.clear();
  if (state === 'playing') setPause();
});

canvasWrap.addEventListener('pointerdown', (event) => {
  const rect = canvasWrap.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x > 0.68) {
    shoot(home[0]);
    return;
  }
  touchMove = { x: (x - 0.5) * 2, y: (y - 0.5) * 2 };
});

canvasWrap.addEventListener('pointermove', (event) => {
  if (!touchMove) return;
  const rect = canvasWrap.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  touchMove.x = (x - 0.5) * 2;
  touchMove.y = (y - 0.5) * 2;
});

canvasWrap.addEventListener('pointerup', () => { touchMove = null; });
canvasWrap.addEventListener('pointerleave', () => { touchMove = null; });

document.getElementById('start-button').addEventListener('click', startMatch);
document.getElementById('resume-button').addEventListener('click', setPause);
document.getElementById('play-again-button').addEventListener('click', startMatch);
document.getElementById('restart-button').addEventListener('click', startMatch);
ui.sound.addEventListener('click', () => {
  soundOn = !soundOn;
  ui.sound.textContent = soundOn ? '♫' : '♪';
  ui.sound.setAttribute('aria-label', soundOn ? 'Дыбысты өшіру' : 'Дыбысты қосу');
  if (soundOn) playTone(480, 0.08);
});

resetMatch();
updateScore();
onResize();
requestAnimationFrame(animate);
