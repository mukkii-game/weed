const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let W=0,H=0,dpr=1,running=false,last=0,started=0,chars=[],knots=[],bubbles=[],fibers=[],scraps=[];
let pointer=null,awareness=0,shake=0,message='',messageLife=0,freed=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);
const sprite=new Image(),tintedSprites=[];
sprite.src='assets/sea-friend-sprites.webp?v=1';
sprite.onload=()=>{
  ['#f0afbd','#f0d27d','#9ed8e6','#f0dfb8','#b5d19a'].forEach((color,i)=>{const c=document.createElement('canvas');c.width=sprite.width;c.height=sprite.height;const x=c.getContext('2d');x.drawImage(sprite,0,0);x.globalCompositeOperation='source-atop';x.globalAlpha=.25;x.fillStyle=color;x.fillRect(0,0,c.width,c.height);tintedSprites[i]=c;});
};

function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();

function reset(){
  const colors=['#f1c5d0','#f5df9d','#abdff0','#efe0bd','#c7dcb6'];
  const spacing=Math.min(66,W*.16);
  chars=colors.map((color,i)=>{
    const home=W/2+(i-2)*spacing;
    return {x:home,y:H*.47,vx:0,vy:0,a:0,av:0,yaw:i%2?Math.PI:0,yawV:0,torsion:0,pump:0,r:Math.min(24,W*.057),color,
      home,hp:100,free:false,escaped:false,flash:0,face:0,lastDir:0,lastFlick:0,
      anchor:home,escapeDir:i<2?-1:1};
  });
  knots=Array.from({length:4},(_,i)=>({a:i,b:i+1,value:0,heat:0,x:(chars[i].home+chars[i+1].home)/2,y:H*.38}));
  awareness=shake=freed=0;fibers=[];scraps=[];message='動かす子に触ってフリック';messageLife=2.5;
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
    const dir=Math.sign(dx);c.vx+=clamp(dx*.025,-9,9);c.vy+=clamp(dy*.018,-7,7);c.av+=clamp(dx*.0007,-.20,.20);c.yawV+=clamp(dx*.0004,-.055,.055);
    if(Math.abs(dy)>Math.abs(dx)*.55){
      const force=clamp(Math.abs(dy)*.09,3,14);c.pump=clamp(c.pump+force*3,0,100);
      knots.filter(k=>k.a===pointer.i||k.b===pointer.i).forEach(k=>{if(k.value>12){k.value=clamp(k.value+force*.65,0,100);k.heat=clamp(k.heat+force*.8,0,100);const other=chars[k.a===pointer.i?k.b:k.a];c.hp-=force*.08;other.hp-=force*.05;}});say(dy<0?'縦に引っぱる！':'上から圧縮！',.65);
    }
    if(dir&&c.lastDir&&dir!==c.lastDir&&performance.now()-c.lastFlick<950){
      knots.filter(k=>k.a===pointer.i||k.b===pointer.i).forEach(k=>{if(k.value>10){k.value=clamp(k.value+9,0,100);k.heat=clamp(k.heat+12,0,100);const other=chars[k.a===pointer.i?k.b:k.a];c.hp-=2.4;other.hp-=1.6;}});c.torsion*=.76;say('逆回転！ ギュルルッ！',.7);
    }
    if(dir){c.lastDir=dir;c.lastFlick=performance.now();}awareness+=Math.max(0,speed-.8)*1.2;
  }
  pointer=null;
});

function entangle(k,dt){
  const a=chars[k.a],b=chars[k.b];if(a.free||b.free)return;
  const dist=Math.hypot(a.x-b.x,a.y-b.y),rel=Math.hypot(a.vx-b.vx,a.vy-b.vy);
  if(dist<a.r+b.r+26&&rel>1.1){
    const gain=rel*dt*3.2;k.value=clamp(k.value+gain,0,100);k.x=(a.x+b.x)/2;k.y=(a.y+b.y)/2-35;
    if(gain>.45){say(k.value>65?'ぐるぐる！ いま引き離せ！':'ワカメが絡んだ！');a.flash=b.flash=1;}
  }
  const apart=(b.x-a.x)*(b.vx-a.vx)>0?Math.abs(b.vx-a.vx):0;
  if(k.value>14&&apart>1.2){
    const friction=apart*(k.value/100)*dt*6.4;k.heat=clamp(k.heat+friction,0,100);a.hp-=friction*.72;b.hp-=friction*.72;
    chars.forEach(c=>{if(!c.free&&c!==a&&c!==b)c.hp-=friction*.10;});
    for(let n=0;n<Math.ceil(friction);n++)fibers.push({x:k.x+rand(-10,10),y:k.y+rand(-8,8),vx:rand(-40,40),vy:rand(-60,10),life:1});
    if(friction>.55){shake=Math.min(9,shake+1);say('ギギギ… 摩擦！',.35);}
  } else k.heat=Math.max(0,k.heat-dt*5);
}

function release(c){
  if(c.free)return;c.free=true;freed++;c.vy=-2;c.vx=c.escapeDir*2.2;c.av*=1.6;shake=14;say(freed===chars.length?'全員ほどけた！':'ひとり脱出！',1.1);
  scraps.push({x:c.x,y:c.y-25,vx:c.escapeDir*45,vy:15,a:0,av:c.escapeDir*2.5,life:1});
  for(let n=0;n<25;n++)fibers.push({x:c.x+rand(-25,25),y:c.y+rand(-25,25),vx:rand(-130,130),vy:rand(-150,50),life:1});
  if(navigator.vibrate)navigator.vibrate([35,25,55]);
}

function update(dt){
  awareness+=dt*1.85;messageLife-=dt;shake*=.85;
  bubbles.forEach(b=>{b.y-=b.s*dt;if(b.y<-8){b.y=H+8;b.x=rand(0,W)}});
  chars.forEach(c=>{
    c.flash=Math.max(0,c.flash-dt*2.5);c.face=Math.max(0,c.face-dt);
    if(c.free){c.vy-=5*dt;c.vx+=c.escapeDir*.025;c.x+=c.vx;c.y+=c.vy;c.a+=c.av;c.yaw+=c.yawV;if(c.y<-70||c.x<-70||c.x>W+70)c.escaped=true;return;}
    const localWrap=knots.filter(k=>k.a===chars.indexOf(c)||k.b===chars.indexOf(c)).reduce((s,k)=>s+k.value,0);
    const cluster=W/2, tangledPull=(cluster-c.x)*localWrap*.000006;
    const pull=(c.home-c.x)*.0024+tangledPull;c.vx=(c.vx+pull)*Math.pow(.78,dt);c.vy=(c.vy+(H*.47-c.y)*.0014)*Math.pow(.7,dt);
    c.x+=c.vx;c.y+=c.vy;c.av=(c.av+c.vx*.002)*Math.pow(.82,dt);c.a+=c.av;
    c.torsion=clamp(c.torsion+c.yawV*.55,-100,100);if(Math.abs(c.torsion)>68)c.yawV-=Math.sign(c.torsion)*.0045;
    c.yawV*=Math.pow(.12,dt);c.yaw+=c.yawV;c.pump=Math.max(0,c.pump-dt*8);
    c.hp-=(Math.abs(c.torsion)*.0018+Math.abs(c.vx)*.010+Math.abs(c.vy)*.012+Math.abs(c.yawV)*.11+c.pump*.0015)*dt;
    c.x=clamp(c.x,c.r,W-c.r);c.y=clamp(c.y,H*.25,H*.66);
  });
  knots.forEach(k=>entangle(k,dt));
  const active=chars.filter(c=>!c.free),avgKnot=knots.reduce((s,k)=>s+k.value,0)/knots.length;
  if(active.length>=3&&avgKnot>35){const span=Math.max(...active.map(c=>c.x))-Math.min(...active.map(c=>c.x));if(span<W*.55){const groupWear=active.reduce((s,c)=>s+Math.abs(c.vx)+Math.abs(c.yawV)*5,0)*dt*.018;active.forEach(c=>c.hp-=groupWear);}}
  chars.forEach(c=>{if(c.hp<=0)release(c)});
  fibers.forEach(f=>{f.life-=dt*1.5;f.vy+=80*dt;f.x+=f.vx*dt;f.y+=f.vy*dt});fibers=fibers.filter(f=>f.life>0);
  scraps.forEach(s=>{s.life-=dt*.45;s.vy+=85*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.a+=s.av*dt});scraps=scraps.filter(s=>s.life>0);
  if(freed===chars.length&&chars.every(c=>c.escaped))finish(true);
  if(awareness>=100)finish(false);
}

function ropePath(c){
  const ax=c.anchor,attachX=c.x,attachY=c.y-c.r*.55,n=28,p=[];
  for(let i=0;i<=n;i++){const t=i/n,wave=Math.sin(t*Math.PI)*(Math.sin(performance.now()*.003+i*.8)*5+(c.x-c.home)*-.12);p.push({x:ax+(attachX-ax)*t+wave,y:-10+(attachY+10)*t});}return p;
}
function strokeRope(points,c,id){
  const turns=1.6+Math.abs(c.torsion)/22,phaseBase=c.torsion*.06+id*.75;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#103d2c';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
  ctx.strokeStyle=c.flash?'#dceb68':'#4f9d50';ctx.lineWidth=14;ctx.stroke();
  ctx.strokeStyle='#8ac56c';ctx.lineWidth=3;ctx.beginPath();points.forEach((p,i)=>{const q=points[Math.min(i+1,points.length-1)],ang=Math.atan2(q.y-p.y,q.x-p.x),nx=-Math.sin(ang),ny=Math.cos(ang),t=i/(points.length-1),offset=Math.sin(phaseBase+t*Math.PI*2*turns)*5;(i?ctx.lineTo(p.x+nx*offset,p.y+ny*offset):ctx.moveTo(p.x+nx*offset,p.y+ny*offset));});ctx.stroke();
  for(let i=2;i<points.length-2;i+=4){const p=points[i],q=points[i+1],ang=Math.atan2(q.y-p.y,q.x-p.x),nx=-Math.sin(ang),ny=Math.cos(ang),t=i/(points.length-1),flip=Math.cos(phaseBase+t*Math.PI*2*turns);ctx.strokeStyle=flip>0?'#a7d980':'#245f37';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-nx*6,p.y-ny*6);ctx.lineTo(p.x+nx*6,p.y+ny*6);ctx.stroke();}
  ctx.restore();
}
function drawKnot(k){
  if(k.value<4)return;const a=chars[k.a],b=chars[k.b];if(a.free||b.free)return;
  const steps=22,turns=.8+k.value/24,radius=4+k.value*.055,length=30+k.value*.32,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2-length*.85;
  for(let i=0;i<steps;i++){
    const segs=[];for(let strand=0;strand<2;strand++){const phase=strand*Math.PI,t=i/steps,t2=(i+1)/steps,ang=t*Math.PI*2*turns+phase,ang2=t2*Math.PI*2*turns+phase;segs.push({z:(Math.cos(ang)+Math.cos(ang2))/2,x1:cx+Math.sin(ang)*radius,y1:cy+t*length,x2:cx+Math.sin(ang2)*radius,y2:cy+t2*length,strand});}
    segs.sort((u,v)=>u.z-v.z).forEach(s=>{const front=(s.z+1)/2;ctx.strokeStyle=s.strand?(k.heat>35?'#d6d85a':'#397f42'):(k.heat>35?'#e4e978':'#62ad58');ctx.lineWidth=6+front*4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();});
  }
}
function drawChar(c,i){
  const cosine=Math.cos(c.yaw),view=cosine>.38?0:cosine<-.38?2:1,source=tintedSprites[i]||sprite;
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(clamp(c.vx*.025,-.65,.65));if(Math.sin(c.yaw)<0)ctx.scale(-1,1);
  if(sprite.complete&&sprite.naturalWidth){const sw=sprite.width/3,size=c.r*3.15;ctx.drawImage(source,view*sw,0,sw,sprite.height,-size/2,-size/2,size,size);}
  else{ctx.fillStyle=c.color;ctx.strokeStyle='#304244';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,c.r,0,7);ctx.fill();ctx.stroke();}
  ctx.restore();
  if(!c.free){const bw=34,bx=c.x-bw/2,by=c.y+c.r+20;ctx.fillStyle='#001a';ctx.fillRect(bx,by,bw,4);ctx.fillStyle=c.hp<30?'#ff796b':'#9ee86e';ctx.fillRect(bx,by,bw*clamp(c.hp,0,100)/100,4);}
}
function drawMermaid(){
  if(awareness<55)return;const p=(awareness-55)/45,size=45+p*95,x=W+35-p*85,y=H*.17;ctx.save();ctx.globalAlpha=.12+p*.48;ctx.translate(x,y);ctx.fillStyle='#071b2b';ctx.beginPath();ctx.arc(0,0,size,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.6,size*.45);ctx.quadraticCurveTo(-size*1.3,size*1.25,-size*.3,size*1.55);ctx.quadraticCurveTo(size*.5,size*1.2,size*.72,size*.45);ctx.fill();ctx.fillStyle='#ffdf72';ctx.beginPath();ctx.arc(-size*.3,-size*.1,4+p*4,0,7);ctx.arc(size*.12,-size*.1,4+p*4,0,7);ctx.fill();ctx.restore();
}
function draw(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#176a7d');g.addColorStop(.62,'#07505e');g.addColorStop(1,'#032b3a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawMermaid();
  ctx.save();ctx.translate(rand(-shake,shake),rand(-shake,shake));ctx.fillStyle='#d6fff244';bubbles.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()});
  chars.forEach((c,i)=>{if(!c.free)strokeRope(ropePath(c),c,i)});knots.forEach(drawKnot);chars.forEach(drawChar);
  scraps.forEach(s=>{ctx.save();ctx.globalAlpha=s.life;ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.fillStyle='#328d48';ctx.fillRect(-6,-38,12,76);ctx.restore();});
  fibers.forEach(f=>{ctx.globalAlpha=f.life;ctx.fillStyle='#bce369';ctx.fillRect(f.x,f.y,rand(2,5),rand(4,10))});ctx.globalAlpha=1;ctx.restore();
  if(messageLife>0){ctx.globalAlpha=clamp(messageLife*2,0,1);ctx.fillStyle='#fffbd1';ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.fillText(message,W/2,H*.72);ctx.globalAlpha=1;}
  // 人魚に見つかるまで
  ctx.fillStyle='#0019';ctx.fillRect(18,H-34,W-36,11);ctx.fillStyle=awareness>70?'#fa706c':'#edcf5c';ctx.fillRect(18,H-34,(W-36)*clamp(awareness,0,100)/100,11);
  ctx.fillStyle='#fff';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText('人魚の気配',W/2,H-40);
  const avgKnot=knots.length?knots.reduce((s,k)=>s+k.value,0)/knots.length:0,avgHeat=knots.length?knots.reduce((s,k)=>s+k.heat,0)/knots.length:0;
  $('#score').textContent=Math.floor(avgKnot)+'%';$('#distance').textContent=Math.floor(avgHeat);
}
function loop(now){if(!running)return;const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}
function finish(win){if(!running)return;running=false;const t=(performance.now()-started)/1000;$('#result-score').textContent=t.toFixed(1);$('.eyebrow','#result-panel');$('#result-panel .eyebrow').textContent=win?'全員脱出！':'見つかってしまった…';$('#result-copy').textContent=win?'絡ませてから逆へ引くのが脱出のコツ！':'隣の子へぶつけて絡ませ、すぐ逆方向へ引こう。';$('#result-panel').classList.remove('hidden');}
$('#start-button').onclick=reset;$('#retry-button').onclick=reset;draw();
