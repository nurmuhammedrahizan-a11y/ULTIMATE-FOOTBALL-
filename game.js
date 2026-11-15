(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 560;
  const ui = {
    home: document.getElementById('home-score'), away: document.getElementById('away-score'),
    clock: document.getElementById('match-clock'), start: document.getElementById('start-screen'),
    pause: document.getElementById('pause-screen'), end: document.getElementById('end-screen'),
    toast: document.getElementById('toast'), result: document.getElementById('result-title'),
    copy: document.getElementById('result-copy'), sound: document.getElementById('sound-button')
  };
  const keys = new Set();
  let state = 'ready', last = 0, remaining = 120, homeScore = 0, awayScore = 0;
  let toastTimer, audioCtx = null, soundOn = true, touch = null;
  const field = { left: 36, right: W - 36, top: 34, bottom: H - 34, goalTop: H / 2 - 76, goalBottom: H / 2 + 76 };
  const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 10, lastTouch: 'home' };
  const makePlayer = (x, y, team, role) => ({ x, y, vx: 0, vy: 0, r: 17, team, role, kick: 0, facing: team === 'home' ? 1 : -1 });
  const home = [makePlayer(315, 280, 'home', 'striker'), makePlayer(205, 190, 'home', 'wing'), makePlayer(205, 370, 'home', 'wing')];
  const away = [makePlayer(685, 280, 'away', 'striker'), makePlayer(795, 190, 'away', 'wing'), makePlayer(795, 370, 'away', 'wing')];
  const players = [...home, ...away];
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }
  function showToast(text) {
    ui.toast.textContent = text; ui.toast.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1200);
  }
  function playTone(freq = 440, duration = .1, type = 'sine') {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) { /* Audio is optional. */ }
  }
  function startMatch() {
    if (state === 'playing') return;
    resetMatch(); state = 'playing'; ui.start.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.end.classList.add('hidden');
    showToast('МАТЧ БАСТАЛДЫ!'); last = performance.now();
  }
  function resetMatch() {
    homeScore = 0; awayScore = 0; remaining = 120; updateScore(); resetPositions();
  }
  function resetPositions() {
    const initial = [[315,280],[205,190],[205,370],[685,280],[795,190],[795,370]];
    players.forEach((p,i) => { p.x=initial[i][0];p.y=initial[i][1];p.vx=0;p.vy=0;p.kick=0;p.facing=p.team==='home'?1:-1; });
    ball.x=W/2;ball.y=H/2;ball.vx=0;ball.vy=0;
  }
  function updateScore() {
    ui.home.textContent = homeScore; ui.away.textContent = awayScore;
    const sec = Math.ceil(remaining); ui.clock.textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  }
  function movePlayer(p, dx, dy, speed, dt) {
    const len = Math.hypot(dx,dy); if (len>0) { dx/=len;dy/=len;p.facing=dx || p.facing; }
    p.vx=dx*speed;p.vy=dy*speed;p.x+=p.vx*dt;p.y+=p.vy*dt;
    p.x=Math.max(field.left+p.r,Math.min(field.right-p.r,p.x));p.y=Math.max(field.top+p.r,Math.min(field.bottom-p.r,p.y));
  }
  function update(dt) {
    if (state !== 'playing') return;
    remaining=Math.max(0,remaining-dt); updateScore();
    const controlled=home[0];
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if (touch) { dx=touch.dx;dy=touch.dy; }
    movePlayer(controlled,dx,dy,(keys.has('shift')?250:190),dt);
    // Teammates make simple, useful runs toward the ball and offer passing lanes.
    home.slice(1).forEach((p,i) => {
      const targetX=ball.x+(i===0?-90:-135), targetY=ball.y+(i===0?-75:75);
      const chase=home[0].x-ball.x>100 && Math.hypot(p.x-ball.x,p.y-ball.y)<200;
      const tx=chase?ball.x:Math.max(100,Math.min(390,targetX)), ty=chase?ball.y:Math.max(95,Math.min(465,targetY));
      movePlayer(p,tx-p.x,ty-p.y,chase?145:95,dt);
    });
    away.forEach((p,i) => {
      let tx,ty;
      if (i===0) { tx=ball.x+18;ty=ball.y; }
      else { const defend=ball.x<650;tx=defend?Math.max(650,ball.x+75):ball.x+60;ty=ball.y+(i===1?-105:105); }
      movePlayer(p,tx-p.x,ty-p.y,i===0?142:91,dt);
    });
    // Keep players from occupying the same space.
    for (let i=0;i<players.length;i++) for (let j=i+1;j<players.length;j++) {
      const a=players[i],b=players[j],ddx=b.x-a.x,ddy=b.y-a.y,d=Math.hypot(ddx,ddy),min=a.r+b.r;
      if(d>0&&d<min){const push=(min-d)/2,nx=ddx/d,ny=ddy/d;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
    }
    // Ball pickup, dribbling and collisions.
    for(const p of players){
      const bx=ball.x-p.x,by=ball.y-p.y,d=Math.hypot(bx,by),reach=p.r+ball.r+3;
      if(d<reach){
        if(d>0){const nx=bx/d,ny=by/d;ball.x=p.x+nx*reach;ball.y=p.y+ny*reach;}
        if(Math.hypot(ball.vx,ball.vy)<205){ball.vx=p.vx*.48+(p.team==='home'?25:-25);ball.vy=p.vy*.48;ball.lastTouch=p.team;}
      }
    }
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;const friction=Math.pow(.985,dt*60);ball.vx*=friction;ball.vy*=friction;
    if(ball.y<field.top+ball.r){ball.y=field.top+ball.r;ball.vy=Math.abs(ball.vy)*.72;playTone(190,.04);}
    if(ball.y>field.bottom-ball.r){ball.y=field.bottom-ball.r;ball.vy=-Math.abs(ball.vy)*.72;playTone(190,.04);}
    if(ball.x<field.left+ball.r){
      if(ball.y>field.goalTop&&ball.y<field.goalBottom){awayScore++;scoreGoal('away');}
      else{ball.x=field.left+ball.r;ball.vx=Math.abs(ball.vx)*.72;}
    }
    if(ball.x>field.right-ball.r){
      if(ball.y>field.goalTop&&ball.y<field.goalBottom){homeScore++;scoreGoal('home');}
      else{ball.x=field.right-ball.r;ball.vx=-Math.abs(ball.vx)*.72;}
    }
    if(keys.has(' ')||keys.has('space')) shoot(controlled);
    players.forEach(p=>p.kick=Math.max(0,p.kick-dt));
    if(remaining<=0){state='ended';ui.end.classList.remove('hidden');ui.result.textContent=homeScore>awayScore?'ЖЕҢІС!':homeScore<awayScore?'КЕЛЕСІ ЖОЛЫ БОЛАР!':'ТЕҢ ОЙЫН!';ui.copy.textContent=`UNITED ${homeScore} : ${awayScore} RIVALS — тағы бір матч?`;playTone(330,.35);}
  }
  function shoot(p) {
    if(p.kick>0)return;
    const d=Math.hypot(ball.x-p.x,ball.y-p.y);
    if(d>p.r+ball.r+30)return;
    p.kick=.42;ball.lastTouch=p.team;
    let aimX=p.team==='home'?field.right+50:field.left-50, aimY=H/2+(Math.random()-.5)*95;
    // Aim toward the opponent goal; use movement direction to add skill and control.
    const dirX=p.team==='home'?1:-1;let vx=dirX*450+(p.vx||0)*.35,vy=(aimY-ball.y)*1.7+(p.vy||0)*.35;
    const mag=Math.hypot(vx,vy);ball.vx=vx/mag*480;ball.vy=vy/mag*480;
    ball.x=p.x+dirX*(p.r+ball.r+4);ball.y=p.y;playTone(260,.12,'triangle');
  }
  function scoreGoal(team) {
    updateScore();playTone(520,.18,'triangle');setTimeout(()=>playTone(700,.28,'triangle'),120);
    showToast(team==='home'?'ГООООЛ! UNITED!':'ГОЛ! RIVALS!');resetPositions();
  }
  function draw() {
    if(!ctx)return;
    ctx.clearRect(0,0,W,H);
    // Turf and alternating mowing stripes.
    ctx.fillStyle='#16804a';ctx.fillRect(0,0,W,H);
    for(let i=0;i<10;i++){ctx.fillStyle=i%2?'rgba(0,0,0,.035)':'rgba(255,255,255,.025)';ctx.fillRect(i*W/10,0,W/10,H);}
    // Goals behind the field lines.
    ctx.fillStyle='rgba(5,20,13,.4)';ctx.fillRect(0,field.goalTop,field.left,field.goalBottom-field.goalTop);ctx.fillRect(field.right,field.goalTop,W-field.right,field.goalBottom-field.goalTop);
    ctx.strokeStyle='rgba(238,255,243,.78)';ctx.lineWidth=3;ctx.strokeRect(field.left,field.top,field.right-field.left,field.bottom-field.top);
    ctx.beginPath();ctx.moveTo(W/2,field.top);ctx.lineTo(W/2,field.bottom);ctx.stroke();
    ctx.beginPath();ctx.arc(W/2,H/2,74,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(238,255,243,.8)';ctx.beginPath();ctx.arc(W/2,H/2,4,0,Math.PI*2);ctx.fill();
    const boxH=210,boxW=125;ctx.strokeRect(field.left, H/2-boxH/2, boxW, boxH);ctx.strokeRect(field.right-boxW,H/2-boxH/2,boxW,boxH);
    ctx.strokeRect(field.left,H/2-98,48,196);ctx.strokeRect(field.right-48,H/2-98,48,196);
    ctx.beginPath();ctx.arc(field.left+90,H/2,3,0,Math.PI*2);ctx.arc(field.right-90,H/2,3,0,Math.PI*2);ctx.fill();
    // Nets and posts.
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(field.left,field.goalTop);ctx.lineTo(8,field.goalTop);ctx.lineTo(8,field.goalBottom);ctx.lineTo(field.left,field.goalBottom);ctx.moveTo(field.right,field.goalTop);ctx.lineTo(W-8,field.goalTop);ctx.lineTo(W-8,field.goalBottom);ctx.lineTo(field.right,field.goalBottom);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=1;for(let y=field.goalTop+12;y<field.goalBottom;y+=13){ctx.beginPath();ctx.moveTo(5,y);ctx.lineTo(field.left,y);ctx.moveTo(field.right,y);ctx.lineTo(W-5,y);ctx.stroke();}
    // Shadowed players.
    for(const p of players){
      ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(p.x+2,p.y+9,p.r*.95,p.r*.55,0,0,Math.PI*2);ctx.fill();
      const isHome=p.team==='home';ctx.fillStyle=isHome?'#236cff':'#f04c43';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=isHome?'#91b6ff':'#ffb1a9';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.role==='striker'?'9':p.team==='home'?'7':'4',p.x,p.y);
      if(p===home[0]){ctx.strokeStyle='#e3ff70';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,p.r+5,0,Math.PI*2);ctx.stroke();}
    }
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(ball.x+2,ball.y+5,ball.r*1.1,ball.r*.7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#25302a';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#222';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⬟',ball.x,ball.y);
  }
  function frame(now){const dt=Math.min((now-last)/1000,.04);last=now;update(dt);draw();requestAnimationFrame(frame);}
  function setPause(){if(state==='playing'){state='paused';ui.pause.classList.remove('hidden');}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden');last=performance.now();}}
  document.getElementById('start-button').addEventListener('click',startMatch);
  document.getElementById('resume-button').addEventListener('click',setPause);
  document.getElementById('play-again-button').addEventListener('click',startMatch);
  document.getElementById('restart-button').addEventListener('click',startMatch);
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?'♫':'♪';ui.sound.setAttribute('aria-label',soundOn?'Дыбысты өшіру':'Дыбысты қосу');if(soundOn)playTone(500,.08);});
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
    keys.add(key);if(key==='enter'&&(state==='ready'||state==='ended'))startMatch();if(key==='p')setPause();
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();if(state==='playing')setPause();});
  // Touch controls: drag to move; tap the right half to kick.
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;if(x>W*.68){shoot(home[0]);return;}touch={x,y,dx:0,dy:0};});
  canvas.addEventListener('pointermove',e=>{if(!touch)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;let dx=x-touch.x,dy=y-touch.y,d=Math.hypot(dx,dy),limit=70;if(d>limit){dx=dx/d*limit;dy=dy/d*limit;}touch.dx=dx/limit;touch.dy=dy/limit;});
  const clearTouch=()=>{touch=null;};canvas.addEventListener('pointerup',clearTouch);canvas.addEventListener('pointercancel',clearTouch);
  window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
})();
