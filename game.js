const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let W=0,H=0,dpr=1,running=false,last=0,started=0,chars=[],knots=[],bubbles=[],fibers=[];
let pointer=null,awareness=0,shake=0,message='',messageLife=0,freed=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);

function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();

function reset(){
  const colors=['#f1c5d0','#f5df9d','#abdff0','#efe0bd','#c7dcb6'];
  chars=colors.map((color,i)=>({
    x:W*(i+1)/6,y:H*.47,vx:0,vy:0,a:0,av:0,yaw:i%2?Math.PI:0,yawV:0,r:Math.min(25,W*.058),color,
    home:W*(i+1)/6,hp:100,free:false,flash:0,face:0,lastDir:0,lastFlick:0,
    anchors:[W*(i+1)/6-15,W*(i+1)/6+15]
  }));
  knots=Array.from({length:4},(_,i)=>({a:i,b:i+1,value:0,heat:0,x:W*(i+1.5)/6,y:H*.38}));
  awareness=shake=freed=0;fibers=[];message='動かす子に触ってフリック';messageLife=2.5;
  bubbles=Array.from({length:18},()=>({x:rand(0,W),y:rand(0,H),r:rand(1,5),s:rand(9,30)}));
  running=true;last=started=performance.now();$('#start-panel').classList.add('hidden');$('#result-panel').classList.add('hidden');requestAnimationFrame(loop);
}

function say(s,t=.7){message=s;messageLife=t;}
function nearest(x,y){let best=null,dist=70;chars.forEach((c,i)=>{if(c.free)return;const d=Math.hypot(c.x-x,c.y-y);if(d<dist){dist=d;best=i;}});return best;}
canvas.addEventListener('pointerdown',e=>{const i=nearest(e.clientX,e.clientY);if(i!==null){pointer={i,x:e.clientX,y:e.clientY,t:performance.now()};canvas.setPointerCapture(e.pointerId);chars[i].face=1;}});
canvas.addEventListener('pointerup',e=>{
  if(!pointer)return;const c=chars[pointer.i],dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,dt=Math.max(30,performance.now()-pointer.t),speed=Math.hypot(dx,dy)/dt;
  if(Math.hypot(dx,dy)<18){c.vx+=(pointer.i%2?1:-1)*3.2;c.av+=(pointer.i%2?1:-1)*.11;say('ジタバタ！');}
  else{
    const dir=Math.sign(dx);c.vx+=clamp(dx*.028,-11,11);c.vy+=clamp(dy*.018,-7,7);c.av+=clamp(dx*.0012,-.42,.42);c.yawV+=clamp(dx*.002,-.7,.7);
    if(dir&&c.lastDir&&dir!==c.lastDir&&performance.now()-c.lastFlick<950){
      knots.filter(k=>k.a===pointer.i||k.b===pointer.i).forEach(k=>{if(k.value>15){k.value=clamp(k.value+8,0,100);k.heat=clamp(k.heat+7,0,100);}});say('逆回転！ ギュルルッ！',.7);
    }
    if(dir){c.lastDir=dir;c.lastFlick=performance.now();}awareness+=Math.max(0,speed-.8)*1.2;
  }
  pointer=null;
});

function entangle(k,dt){
  const a=chars[k.a],b=chars[k.b];if(a.free||b.free)return;
  const dist=Math.hypot(a.x-b.x,a.y-b.y),rel=Math.hypot(a.vx-b.vx,a.vy-b.vy);
  if(dist<a.r+b.r+34&&rel>1.2){
    const gain=rel*dt*3.2;k.value=clamp(k.value+gain,0,100);k.x=(a.x+b.x)/2;k.y=(a.y+b.y)/2-35;
    if(gain>.45){say(k.value>65?'ぐるぐる！ いま引き離せ！':'ワカメが絡んだ！');a.flash=b.flash=1;}
  }
  const apart=(b.x-a.x)*(b.vx-a.vx)>0?Math.abs(b.vx-a.vx):0;
  if(k.value>18&&apart>1.5){
    const friction=apart*(k.value/100)*dt*5.2;k.heat=clamp(k.heat+friction,0,100);a.hp-=friction*.62;b.hp-=friction*.62;
    for(let n=0;n<Math.ceil(friction);n++)fibers.push({x:k.x+rand(-10,10),y:k.y+rand(-8,8),vx:rand(-40,40),vy:rand(-60,10),life:1});
    if(friction>.55){shake=Math.min(9,shake+1);say('ギギギ… 摩擦！',.35);}
  } else k.heat=Math.max(0,k.heat-dt*5);
}

function release(c){
  if(c.free)return;c.free=true;freed++;c.vy=5;c.av*=1.6;shake=14;say(freed===chars.length?'全員ほどけた！':'ひとり脱出！',1.1);
  for(let n=0;n<25;n++)fibers.push({x:c.x+rand(-25,25),y:c.y+rand(-25,25),vx:rand(-130,130),vy:rand(-150,50),life:1});
  if(navigator.vibrate)navigator.vibrate([35,25,55]);
}

function update(dt){
  awareness+=dt*2.15;messageLife-=dt;shake*=.85;
  bubbles.forEach(b=>{b.y-=b.s*dt;if(b.y<-8){b.y=H+8;b.x=rand(0,W)}});
  chars.forEach(c=>{
    c.flash=Math.max(0,c.flash-dt*2.5);c.face=Math.max(0,c.face-dt);
    if(c.free){c.vy+=14*dt;c.x+=c.vx;c.y+=c.vy;c.a+=c.av;return;}
    const localWrap=knots.filter(k=>k.a===chars.indexOf(c)||k.b===chars.indexOf(c)).reduce((s,k)=>s+k.value,0);
    const cluster=W/2, tangledPull=(cluster-c.x)*localWrap*.000006;
    const pull=(c.home-c.x)*.0024+tangledPull;c.vx=(c.vx+pull)*Math.pow(.78,dt);c.vy=(c.vy+(H*.47-c.y)*.0014)*Math.pow(.7,dt);
    c.x+=c.vx;c.y+=c.vy;c.av=(c.av+c.vx*.002)*Math.pow(.82,dt);c.a+=c.av;c.yawV*=Math.pow(.72,dt);c.yaw+=c.yawV;
    c.x=clamp(c.x,c.r,W-c.r);c.y=clamp(c.y,H*.25,H*.66);
  });
  knots.forEach(k=>entangle(k,dt));
  chars.forEach(c=>{if(c.hp<=0)release(c)});
  fibers.forEach(f=>{f.life-=dt*1.5;f.vy+=80*dt;f.x+=f.vx*dt;f.y+=f.vy*dt});fibers=fibers.filter(f=>f.life>0);
  if(freed===chars.length&&chars.every(c=>c.y>H+60))finish(true);
  if(awareness>=100)finish(false);
}

function ropePath(c,side){
  const ax=c.anchors[side?1:0],attachX=c.x+(side?1:-1)*c.r*.5,attachY=c.y-c.r*.15,n=12,p=[];
  for(let i=0;i<=n;i++){const t=i/n,wave=Math.sin(t*Math.PI)*(Math.sin(performance.now()*.003+i*.8)*5+(c.x-c.home)*-.12);p.push({x:ax+(attachX-ax)*t+wave,y:-10+(attachY+10)*t});}return p;
}
function strokeRope(points,c){
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#07382b';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
  ctx.strokeStyle=c.flash?'#d5ef64':'#349e50';ctx.lineWidth=11;ctx.stroke();ctx.strokeStyle='#73cc72';ctx.lineWidth=2;ctx.stroke();
}
function drawKnot(k){
  if(k.value<4)return;const a=chars[k.a],b=chars[k.b];if(a.free||b.free)return;ctx.save();ctx.translate(k.x,k.y);ctx.rotate(performance.now()*.002);
  const loops=1+Math.floor(k.value/22);for(let i=0;i<loops;i++){ctx.strokeStyle=k.heat>35?'#d9db58':'#267b42';ctx.lineWidth=9;ctx.beginPath();ctx.ellipse(0,0,13+i*3,7+i*2,i*.8,0,Math.PI*2);ctx.stroke();}ctx.restore();
}
function drawChar(c,i){
  const adjacent=knots.filter(k=>k.a===i||k.b===i),wrap=adjacent.reduce((s,k)=>s+k.value,0)/Math.max(1,adjacent.length);
  const front=Math.cos(c.yaw)>=0,depth=.38+.62*Math.abs(Math.cos(c.yaw));
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(clamp(c.vx*.025,-.65,.65));ctx.scale(depth,1);ctx.fillStyle=c.color;ctx.strokeStyle='#304244';ctx.lineWidth=3/depth;
  ctx.beginPath();ctx.arc(0,0,c.r,0,7);ctx.fill();ctx.stroke();
  [-1,1].forEach(s=>{ctx.beginPath();ctx.ellipse(s*(c.r+3),8,7,12,s*.45,0,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(s*13,c.r+3,7,11,s*.1,0,7);ctx.fill();ctx.stroke();});
  ctx.fillStyle='#253638';
  if(front){ctx.beginPath();ctx.arc(-9,-5,3,0,7);ctx.arc(9,-5,3,0,7);ctx.fill();ctx.strokeStyle='#253638';ctx.lineWidth=2/depth;ctx.beginPath();ctx.arc(0,9,6,c.face?Math.PI+.2:.2,c.face?Math.PI*2-.2:Math.PI-.2);ctx.stroke();}
  else{ctx.beginPath();ctx.ellipse(0,c.r-2,8,5,0,0,7);ctx.fill();ctx.strokeStyle='#ffffff88';ctx.lineWidth=3/depth;ctx.beginPath();ctx.arc(0,-3,c.r*.55,.3,Math.PI-.3);ctx.stroke();}
  // 身体を締めるワカメの巻き付き
  ctx.strokeStyle=c.flash?'#dbef6e':'#328d48';ctx.lineWidth=8/depth;const bands=2+Math.floor(wrap/22);for(let n=0;n<bands;n++){const y=-17+n*(34/Math.max(1,bands-1));ctx.beginPath();ctx.ellipse(0,y,c.r+3,6,.12*i+(n%2)*.12,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function drawMermaid(){
  if(awareness<55)return;const p=(awareness-55)/45,size=45+p*95,x=W+35-p*85,y=H*.17;ctx.save();ctx.globalAlpha=.12+p*.48;ctx.translate(x,y);ctx.fillStyle='#071b2b';ctx.beginPath();ctx.arc(0,0,size,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.6,size*.45);ctx.quadraticCurveTo(-size*1.3,size*1.25,-size*.3,size*1.55);ctx.quadraticCurveTo(size*.5,size*1.2,size*.72,size*.45);ctx.fill();ctx.fillStyle='#ffdf72';ctx.beginPath();ctx.arc(-size*.3,-size*.1,4+p*4,0,7);ctx.arc(size*.12,-size*.1,4+p*4,0,7);ctx.fill();ctx.restore();
}
function draw(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#176a7d');g.addColorStop(.62,'#07505e');g.addColorStop(1,'#032b3a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawMermaid();
  ctx.save();ctx.translate(rand(-shake,shake),rand(-shake,shake));ctx.fillStyle='#d6fff244';bubbles.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()});
  chars.forEach(c=>{if(!c.free){strokeRope(ropePath(c,0),c);strokeRope(ropePath(c,1),c)}});knots.forEach(drawKnot);chars.forEach(drawChar);
  fibers.forEach(f=>{ctx.globalAlpha=f.life;ctx.fillStyle='#bce369';ctx.fillRect(f.x,f.y,rand(2,5),rand(4,10))});ctx.globalAlpha=1;ctx.restore();
  if(messageLife>0){ctx.globalAlpha=clamp(messageLife*2,0,1);ctx.fillStyle='#fffbd1';ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.fillText(message,W/2,H*.72);ctx.globalAlpha=1;}
  // 人魚に見つかるまで
  ctx.fillStyle='#0019';ctx.fillRect(18,H-34,W-36,11);ctx.fillStyle=awareness>70?'#fa706c':'#edcf5c';ctx.fillRect(18,H-34,(W-36)*clamp(awareness,0,100)/100,11);
  ctx.fillStyle='#fff';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText('人魚の気配',W/2,H-40);
  const avgKnot=knots.reduce((s,k)=>s+k.value,0)/knots.length,avgHeat=knots.reduce((s,k)=>s+k.heat,0)/knots.length;
  $('#score').textContent=Math.floor(avgKnot)+'%';$('#distance').textContent=Math.floor(avgHeat);
}
function loop(now){if(!running)return;const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}
function finish(win){if(!running)return;running=false;const t=(performance.now()-started)/1000;$('#result-score').textContent=t.toFixed(1);$('.eyebrow','#result-panel');$('#result-panel .eyebrow').textContent=win?'全員脱出！':'見つかってしまった…';$('#result-copy').textContent=win?'絡ませてから逆へ引くのが脱出のコツ！':'隣の子へぶつけて絡ませ、すぐ逆方向へ引こう。';$('#result-panel').classList.remove('hidden');}
$('#start-button').onclick=reset;$('#retry-button').onclick=reset;draw();
