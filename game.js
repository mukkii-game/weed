const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const $ = (s) => document.querySelector(s);
let W = 0, H = 0, dpr = 1, running = false, last = 0, time = 0;
let score = 0, distance = 0, health = 100, spawnClock = 0, shake = 0;
let weeds = [], pieces = [], sparks = [], slashes = [], bubbles = [];
let pointer = null;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function reset() {
  score = distance = time = spawnClock = shake = 0; health = 100;
  weeds = []; pieces = []; sparks = []; slashes = []; bubbles = [];
  for (let i = 0; i < 14; i++) bubbles.push({x:rand(0,W), y:rand(0,H), r:rand(1,5), s:rand(8,30)});
  running = true; last = performance.now();
  $('#start-panel').classList.add('hidden'); $('#result-panel').classList.add('hidden');
  requestAnimationFrame(loop);
}

function spawnWeed() {
  const lane = rand(20, W - 20);
  const points = [];
  const height = rand(H * .28, H * .48);
  for (let i = 0; i <= 8; i++) points.push({x: lane + rand(-12,12), y: H + 30 - i * height / 8});
  weeds.push({points, width:rand(12,22), phase:rand(0,7), speed:rand(55,90) + distance*.08, cut:false, danger:false});
}

function player() { return {x:W/2, y:H*.35}; }

function cut(x1, y1, x2, y2, speed) {
  if (!running || speed < .25 || Math.abs(x2-x1) < 28) return;
  const dir = Math.sign(x2-x1); const py = clamp((y1+y2)/2, H*.16, H*.78);
  slashes.push({x:dir>0?-50:W+50, y:py, dir, life:1, speed:Math.min(2.2,speed)});
  let hits = 0;
  for (const weed of weeds) {
    if (weed.cut) continue;
    let hitIndex = -1;
    for (let i=1;i<weed.points.length;i++) {
      const a=weed.points[i-1], b=weed.points[i];
      if ((a.y-py)*(b.y-py)<=0) { const ix=a.x+(b.x-a.x)*(py-a.y)/(b.y-a.y); if (ix>-30&&ix<W+30) hitIndex=i; }
    }
    if (hitIndex>=0) {
      weed.cut=true; hits++;
      const p=weed.points[hitIndex];
      pieces.push({points:weed.points.slice(hitIndex-1), vx:dir*rand(100,230), vy:rand(-190,-70), spin:rand(-3,3), life:1, width:weed.width});
      weed.points=weed.points.slice(0,hitIndex); 
      for(let j=0;j<9;j++) sparks.push({x:p.x,y:p.y,vx:dir*rand(70,280),vy:rand(-150,150),life:1});
    }
  }
  if (hits) {
    const gain = hits*100 + Math.max(0,hits-1)*hits*75; score += gain; shake=Math.min(13,3+hits*2);
    $('#combo').textContent = hits >= 2 ? `${hits}本まとめ斬り！ +${gain}` : '+100';
    setTimeout(()=>$('#combo').textContent='',550);
    if (navigator.vibrate) navigator.vibrate(hits>=3?[20,20,35]:18);
  }
}

canvas.addEventListener('pointerdown', e => { pointer={x:e.clientX,y:e.clientY,t:performance.now()}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', e => { if(!pointer)return; const dt=Math.max(16,performance.now()-pointer.t); cut(pointer.x,pointer.y,e.clientX,e.clientY,Math.abs(e.clientX-pointer.x)/dt); pointer=null; });

function update(dt) {
  time += dt; distance += dt*5; spawnClock -= dt;
  if(spawnClock<=0){ spawnWeed(); spawnClock=Math.max(.16,.48-distance*.0008); }
  for(const b of bubbles){b.y-=b.s*dt;if(b.y<-8){b.y=H+8;b.x=rand(0,W)}}
  const p=player();
  weeds.forEach(w=>{w.phase+=dt*2;w.points.forEach((q,i)=>{q.y-=w.speed*dt;q.x+=Math.sin(w.phase+i*.65)*8*dt});
    if(!w.cut && !w.danger && w.points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<36)){w.danger=true;health-=24;shake=11;if(navigator.vibrate)navigator.vibrate(80);}
  });
  weeds=weeds.filter(w=>w.points.at(-1)?.y>-100);
  pieces.forEach(q=>{q.life-=dt*.8;q.vy+=420*dt;q.points.forEach(p=>{p.x+=q.vx*dt;p.y+=q.vy*dt});}); pieces=pieces.filter(q=>q.life>0);
  sparks.forEach(s=>{s.life-=dt*2;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=.95;s.vy*=.95}); sparks=sparks.filter(s=>s.life>0);
  slashes.forEach(s=>s.life-=dt*3); slashes=slashes.filter(s=>s.life>0);
  shake*=.86;
  if(health<=0) gameOver();
}

function drawWeed(points,width,alpha=1){
  if(points.length<2)return; ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#052f25';ctx.lineWidth=width+5;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
  ctx.strokeStyle='#26a858';ctx.lineWidth=width;ctx.stroke();ctx.strokeStyle='#5ed77c';ctx.lineWidth=3;ctx.stroke();ctx.restore();
}

function drawPlayer(){ const p=player();ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#f4ead0';ctx.strokeStyle='#26383c';ctx.lineWidth=4;
  ctx.beginPath();ctx.ellipse(0,4,31,39,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(-24,-23,10,0,Math.PI*2);ctx.arc(24,-23,10,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#17282d';ctx.beginPath();ctx.arc(-10,-5,3,0,7);ctx.arc(10,-5,3,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-18,-17);ctx.lineTo(18,-17);ctx.stroke();
  ctx.strokeStyle='#fff0a0';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-39,30);ctx.lineTo(35,-34);ctx.stroke();ctx.fillStyle='#e9c84c';ctx.fillRect(29,-42,8,23);ctx.restore(); }

function draw(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#073c4b');g.addColorStop(.55,'#07535a');g.addColorStop(1,'#031c29');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(rand(-shake,shake),rand(-shake,shake));
  ctx.globalAlpha=.35;ctx.fillStyle='#b4fff1';bubbles.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()});ctx.globalAlpha=1;
  pieces.forEach(q=>drawWeed(q.points,q.width,q.life)); weeds.forEach(w=>drawWeed(w.points,w.width)); drawPlayer();
  sparks.forEach(s=>{ctx.globalAlpha=s.life;ctx.fillStyle='#caff7e';ctx.beginPath();ctx.arc(s.x,s.y,rand(2,5),0,7);ctx.fill()});ctx.globalAlpha=1;
  slashes.forEach(s=>{ctx.globalAlpha=s.life;const progress=1-s.life;const cx=s.dir>0?progress*(W+200)-100:W+100-progress*(W+200);ctx.strokeStyle='#fffbd0';ctx.lineWidth=8*s.life+2;ctx.shadowColor='#9dfff3';ctx.shadowBlur=20;ctx.beginPath();ctx.moveTo(cx-s.dir*W*.55,s.y+12);ctx.lineTo(cx,s.y-12);ctx.stroke();});
  ctx.restore();
  ctx.fillStyle='#001b';ctx.fillRect(18,H-35,W-36,10);ctx.fillStyle=health>45?'#72e48a':'#ff6d5f';ctx.fillRect(18,H-35,(W-36)*health/100,10);
  $('#score').textContent=score.toLocaleString();$('#distance').textContent=Math.floor(distance);
}

function loop(now){ if(!running)return;const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop); }
function gameOver(){running=false;$('#result-score').textContent=score.toLocaleString();$('#result-copy').textContent=distance>100?'かなり遠くまで泳いだ！ 次はもっとまとめ斬りを狙おう。':'ワカメは密集した瞬間がチャンス。大きくフリック！';$('#result-panel').classList.remove('hidden');}
$('#start-button').addEventListener('click',reset);$('#retry-button').addEventListener('click',reset);draw();
