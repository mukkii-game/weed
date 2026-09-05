const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let W=0,H=0,dpr=1,running=false,last=0,started=0,chars=[],knots=[],bubbles=[],fibers=[],scraps=[],impacts=[];
let pointer=null,awareness=0,shake=0,message='',messageLife=0,freed=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);
const sprite=new Image(),tintedSprites=[];
const bgm=new Audio('assets/pyoko-dance.mp3?v=1');bgm.loop=true;bgm.volume=.34;let soundOn=true;
const sfx={
  reverse:new Audio('assets/se/01_reverse_spin_limit.mp3'),
  collision:new Audio('assets/se/02_wakame_tangle_collision.mp3'),
  snap:new Audio('assets/se/03_wakame_snap_satisfying.mp3'),
  swim:new Audio('assets/se/04_character_swim_escape.mp3'),
  caught:new Audio('assets/se/05_caught_by_mermaid.mp3')
},sfxVolume={reverse:.74,collision:.62,snap:.78,swim:.58,caught:.78},sfxGap={reverse:420,collision:210,snap:100,swim:180,caught:500},lastSfx={};
Object.values(sfx).forEach(a=>{a.preload='auto';});
function playSfx(name){if(!soundOn||!sfx[name])return;const now=performance.now();if(now-(lastSfx[name]||0)<sfxGap[name])return;lastSfx[name]=now;const a=sfx[name];a.pause();a.currentTime=0;a.volume=sfxVolume[name];a.play().catch(()=>{});}
sprite.src='assets/sea-friend-sprites.webp?v=1';
sprite.onload=()=>{
  ['#f0afbd','#f0d27d','#9ed8e6','#f0dfb8','#b5d19a'].forEach((color,i)=>{const c=document.createElement('canvas');c.width=sprite.width;c.height=sprite.height;const x=c.getContext('2d');x.drawImage(sprite,0,0);x.globalCompositeOperation='source-atop';x.globalAlpha=.25;x.fillStyle=color;x.fillRect(0,0,c.width,c.height);tintedSprites[i]=c;});
};

function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();

function reset(){
  const colors=['#f1c5d0','#f5df9d','#abdff0','#efe0bd','#c7dcb6'];
  const heightPattern=[.40,.51,.46,.55,.43];
  const spacing=Math.min(66,W*.16);
  chars=colors.map((color,i)=>{
    const home=W/2+(i-2)*spacing,homeY=H*heightPattern[i];
    return {x:home,y:homeY,vx:0,vy:0,a:0,av:0,yaw:i%2?Math.PI:0,yawV:0,torsion:0,twistReach:.12,impactBend:0,contactBend:0,contactT:.75,pump:0,r:Math.min(24,W*.057),color,
      home,hp:100,free:false,escaped:false,flash:0,face:0,lastDir:0,lastFlick:0,
      homeY,depth:i*.01,anchor:home,escapeDir:i<2?-1:1};
  });
  knots=[];for(let a=0;a<chars.length;a++)for(let b=a+1;b<chars.length;b++)knots.push({a,b,value:0,heat:0,lock:0,cooldown:0,over:b,wrapPhase:0,tA:.7,tB:.7,x:(chars[a].home+chars[b].home)/2,y:H*.38});
  awareness=shake=freed=0;fibers=[];scraps=[];impacts=[];message='動かす子に触ってフリック';messageLife=2.5;
  bubbles=Array.from({length:18},()=>({x:rand(0,W),y:rand(0,H),r:rand(1,5),s:rand(9,30)}));
  running=true;last=started=performance.now();$('#start-panel').classList.add('hidden');$('#result-panel').classList.add('hidden');
  if(soundOn){bgm.currentTime=0;bgm.play().catch(()=>{});}requestAnimationFrame(loop);
}

function say(s,t=.7){message=s;messageLife=t;}
function nearest(x,y){let best=null,dist=70;chars.forEach((c,i)=>{if(c.free)return;const d=Math.hypot(c.x-x,c.y-y);if(d<dist){dist=d;best=i;}});return best;}
canvas.addEventListener('pointerdown',e=>{const i=nearest(e.clientX,e.clientY);if(i!==null){pointer={i,x:e.clientX,y:e.clientY,t:performance.now()};canvas.setPointerCapture(e.pointerId);chars[i].face=1;}});
canvas.addEventListener('pointerup',e=>{
  if(!pointer)return;const c=chars[pointer.i],dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,dt=Math.max(30,performance.now()-pointer.t),speed=Math.hypot(dx,dy)/dt;
  if(Math.hypot(dx,dy)<18){c.vx+=(pointer.i%2?1:-1)*3.2;c.av+=(pointer.i%2?1:-1)*.11;say('ジタバタ！');}
  else{
    const dir=Math.sign(dx);c.vx+=clamp(dx*.025,-9,9);c.vy+=clamp(dy*.018,-7,7);c.av+=clamp(dx*.0007,-.20,.20);c.yawV+=clamp(dx*.0004,-.055,.055);c.torsion=clamp(c.torsion+dx*.105,-140,140);
    if(Math.abs(dy)>Math.abs(dx)*.55){
      const force=clamp(Math.abs(dy)*.09,3,14);c.pump=clamp(c.pump+force*3,0,100);
      knots.filter(k=>k.a===pointer.i||k.b===pointer.i).forEach(k=>{if(k.value>12){k.value=clamp(k.value+force*.65,0,100);k.heat=clamp(k.heat+force*.8,0,100);const other=chars[k.a===pointer.i?k.b:k.a];c.hp-=force*.08;other.hp-=force*.05;}});say(dy<0?'縦に引っぱる！':'上から圧縮！',.65);
    }
    if(dir&&c.lastDir&&dir!==c.lastDir&&performance.now()-c.lastFlick<950){
      let reversed=false;knots.filter(k=>k.a===pointer.i||k.b===pointer.i).forEach(k=>{if(k.value>10){k.value=clamp(k.value+9,0,100);k.heat=clamp(k.heat+12,0,100);const other=chars[k.a===pointer.i?k.b:k.a];c.hp-=2.4;other.hp-=1.6;reversed=true;}});c.torsion*=.76;if(reversed)playSfx('reverse');say('逆回転！ ギュルルッ！',.7);
    }
    if(dir){c.lastDir=dir;c.lastFlick=performance.now();}awareness+=Math.max(0,speed-.8)*1.2;
  }
  pointer=null;
});

function ropeContact(a,b){
  const pa=ropePath(a),pb=ropePath(b);let best=null,bestD=24;
  for(let i=12;i<pa.length;i+=3)for(let j=12;j<pb.length;j+=3){
    const d=Math.hypot(pa[i].x-pb[j].x,pa[i].y-pb[j].y);
    if(d<bestD){bestD=d;best={x:(pa[i].x+pb[j].x)/2,y:(pa[i].y+pb[j].y)/2,tA:i/(pa.length-1),tB:j/(pb.length-1)};}
  }
  return best;
}
function entangle(k,dt){
  const a=chars[k.a],b=chars[k.b];if(a.free||b.free)return;
  k.cooldown=Math.max(0,k.cooldown-dt);const dx=b.x-a.x,dy=b.y-a.y,dist=Math.max(1,Math.hypot(dx,dy)),rel=Math.hypot(a.vx-b.vx,a.vy-b.vy),contact=ropeContact(a,b),bodyHit=dist<a.r+b.r+22;
  if((contact||bodyHit)&&rel>.75){
    const gain=rel*dt*(contact?4.5:3.2);k.value=clamp(k.value+gain,0,100);
    if(contact){k.x=contact.x;k.y=contact.y;k.tA=contact.tA;k.tB=contact.tB;}else{k.x=(a.x+b.x)/2;k.y=(a.y+b.y)/2-35;k.tA=k.tB=.88;}
    k.lock=clamp(k.lock+dt*(.35+rel*.16),0,1);k.wrapPhase+=rel*dt*.38;
    if(k.cooldown<=0&&rel>2){
      const nx=dx/dist,ny=dy/dist,impulse=clamp(rel*.32,.7,2.5),spin=Math.sign(b.vx-a.vx)||1;
      a.vx-=nx*impulse;a.vy-=ny*impulse*.35;b.vx+=nx*impulse;b.vy+=ny*impulse*.35;
      a.av-=spin*.055;b.av+=spin*.055;a.yawV-=spin*.025;b.yawV+=spin*.025;
      a.torsion=clamp(a.torsion-spin*5,-140,140);b.torsion=clamp(b.torsion+spin*5,-140,140);
      const bend=clamp(rel*2.4,7,22);a.contactT=k.tA;b.contactT=k.tB;a.contactBend=-spin*bend;b.contactBend=spin*bend;
      a.impactBend=-spin*bend*.45;b.impactBend=spin*bend*.45;k.over=k.over===k.a?k.b:k.a;
      impacts.push({x:k.x,y:k.y,r:7,life:1,spin});k.cooldown=.34;shake=Math.min(7,shake+2.2);
      playSfx('collision');
      say(k.value>65?'ぐるぐる！ いま引き離せ！':'ぶつかった！ くるんっ！',.55);a.flash=b.flash=1;
      if(navigator.vibrate)navigator.vibrate(18);
    }
  }else k.lock=Math.max(0,k.lock-dt*.16);
  if(k.lock>.18){
    const spin=Math.sin(k.wrapPhase)*k.lock,orbit=.0009*k.lock;
    a.vx+=dy*orbit*spin;a.vy-=dx*orbit*spin;b.vx-=dy*orbit*spin;b.vy+=dx*orbit*spin;
    const pull=clamp((dist-92)*.00014,-.012,.022)*k.lock;a.vx+=dx*pull;b.vx-=dx*pull;a.vy+=dy*pull;b.vy-=dy*pull;
  }
  const apart=(b.x-a.x)*(b.vx-a.vx)>0?Math.abs(b.vx-a.vx):0;
  if(k.value>14&&apart>1.2){
    const friction=apart*(k.value/100)*dt*6.4;k.heat=clamp(k.heat+friction,0,100);a.hp-=friction*.72;b.hp-=friction*.72;
    chars.forEach(c=>{if(!c.free&&c!==a&&c!==b)c.hp-=friction*.10;});
    if(friction>.55){shake=Math.min(9,shake+1);say('ギギギ… 摩擦！',.35);}
  } else k.heat=Math.max(0,k.heat-dt*5);
}

function release(c){
  if(c.free)return;c.free=true;freed++;c.vy=-2;c.vx=c.escapeDir*2.2;c.av*=1.6;shake=14;say(freed===chars.length?'全員ほどけた！':'ひとり脱出！',1.1);
  playSfx('snap');setTimeout(()=>playSfx('swim'),170);
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
    const pull=(c.home-c.x)*.0024+tangledPull;c.vx=(c.vx+pull)*Math.pow(.78,dt);c.vy=(c.vy+(c.homeY-c.y)*.0014)*Math.pow(.7,dt);
    c.x+=c.vx;c.y+=c.vy;c.av=(c.av+c.vx*.002)*Math.pow(.82,dt);c.a+=c.av;
    c.torsion=clamp(c.torsion+c.yawV*.55,-100,100);if(Math.abs(c.torsion)>68)c.yawV-=Math.sign(c.torsion)*.0045;
    const reachTarget=.14+.86*clamp(Math.abs(c.torsion)/105,0,1),reachSpeed=reachTarget>c.twistReach ? .42 : .10;
    c.twistReach+=(reachTarget-c.twistReach)*dt*reachSpeed;c.impactBend*=Math.pow(.045,dt);c.contactBend*=Math.pow(.09,dt);
    c.yawV*=Math.pow(.12,dt);c.yaw+=c.yawV;c.pump=Math.max(0,c.pump-dt*8);
    c.hp-=(Math.abs(c.torsion)*.0018+Math.abs(c.vx)*.010+Math.abs(c.vy)*.012+Math.abs(c.yawV)*.11+c.pump*.0015)*dt;
    c.x=clamp(c.x,c.r,W-c.r);c.y=clamp(c.y,H*.25,H*.66);
  });
  knots.forEach(k=>entangle(k,dt));
  const active=chars.filter(c=>!c.free),engaged=knots.filter(k=>k.value>1),avgKnot=engaged.length?engaged.reduce((s,k)=>s+k.value,0)/engaged.length:0;
  if(active.length>=3&&avgKnot>35){const span=Math.max(...active.map(c=>c.x))-Math.min(...active.map(c=>c.x));if(span<W*.55){const groupWear=active.reduce((s,c)=>s+Math.abs(c.vx)+Math.abs(c.yawV)*5,0)*dt*.018;active.forEach(c=>c.hp-=groupWear);}}
  chars.forEach(c=>{if(c.hp<=0)release(c)});
  fibers.forEach(f=>{f.life-=dt*1.5;f.vy+=80*dt;f.x+=f.vx*dt;f.y+=f.vy*dt});fibers=fibers.filter(f=>f.life>0);
  scraps.forEach(s=>{s.life-=dt*.45;s.vy+=85*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.a+=s.av*dt});scraps=scraps.filter(s=>s.life>0);
  impacts.forEach(p=>{p.life-=dt*2.4;p.r+=dt*42});impacts=impacts.filter(p=>p.life>0);
  if(freed===chars.length&&chars.every(c=>c.escaped))finish(true);
  if(awareness>=100)finish(false);
}

function ropePath(c){
  const ax=c.anchor,attachX=c.x,attachY=c.y-c.r*.55,n=84,p=[];
  for(let i=0;i<=n;i++){const t=i/n,impact=c.impactBend*Math.exp(-Math.pow((t-.77)/.115,2)),contact=c.contactBend*Math.exp(-Math.pow((t-c.contactT)/.075,2)),wave=Math.sin(t*Math.PI)*(Math.sin(performance.now()*.003+i*.27)*5+(c.x-c.home)*-.12)+impact+contact;p.push({x:ax+(attachX-ax)*t+wave,y:-10+(attachY+10)*t});}return p;
}
function ribbonSegment(p,q,half1,half2,fill,edge,shine){
  const ang=Math.atan2(q.y-p.y,q.x-p.x),nx=-Math.sin(ang),ny=Math.cos(ang);
  const l1={x:p.x+nx*half1,y:p.y+ny*half1},r1={x:p.x-nx*half1,y:p.y-ny*half1};
  const l2={x:q.x+nx*half2,y:q.y+ny*half2},r2={x:q.x-nx*half2,y:q.y-ny*half2};
  ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(l1.x,l1.y);ctx.lineTo(l2.x,l2.y);ctx.lineTo(r2.x,r2.y);ctx.lineTo(r1.x,r1.y);ctx.closePath();ctx.fill();
  if(Math.max(half1,half2)>4){
    ctx.strokeStyle=shine;ctx.lineWidth=1.25;ctx.globalAlpha=.56;ctx.beginPath();
    ctx.moveTo(p.x+nx*half1*.52,p.y+ny*half1*.52);ctx.lineTo(q.x+nx*half2*.52,q.y+ny*half2*.52);ctx.stroke();ctx.globalAlpha=1;
  }
}
function strokeRope(points,c,id,startT=0,endT=1){
  const baseTurns=1.55,extraTurns=Math.abs(c.torsion)/9.5,twistSign=Math.sign(c.torsion)||(id%2?1:-1),reach=clamp(c.twistReach,.08,1),phaseBase=c.torsion*.035+id*.82,baseHalf=clamp(W*.032,11.5,15.5);
  const phaseAt=t=>{const u=clamp(t/reach,0,1),travel=u*u*(3-2*u);return phaseBase+Math.PI*2*(baseTurns*t+twistSign*extraTurns*travel);};
  const widths=[],phases=[];ctx.save();
  for(let i=0;i<points.length-1;i++){
    const t=startT+(endT-startT)*i/(points.length-1),t2=startT+(endT-startT)*(i+1)/(points.length-1),phase=phaseAt(t),phase2=phaseAt(t2);
    const softEdge=Math.sin(i*.49+id)*1.15,softEdge2=Math.sin((i+1)*.49+id)*1.15;
    const half1=baseHalf*(.17+.83*Math.abs(Math.cos(phase)))+softEdge;
    const half2=baseHalf*(.17+.83*Math.abs(Math.cos(phase2)))+softEdge2;
    widths[i]=half1;widths[i+1]=half2;phases[i]=phase;phases[i+1]=phase2;
    const front=Math.cos((phase+phase2)/2)>0;
    const fill=c.flash?'#70bd78':front?'#4a9345':'#28653d';
    ribbonSegment(points[i],points[i+1],half1,half2,fill,'#173f2c',front?'#a3cf72':'#5c9a58');
  }
  ctx.strokeStyle='#173f2c';ctx.lineWidth=1.8;ctx.lineJoin='round';
  for(const side of [-1,1]){ctx.beginPath();points.forEach((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],ang=Math.atan2(next.y-prev.y,next.x-prev.x),nx=-Math.sin(ang),ny=Math.cos(ang),x=p.x+nx*widths[i]*side,y=p.y+ny*widths[i]*side;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  // 同じ物理的な縁を追いかける線。左右を渡ることで平たい帯の表裏反転が読める。
  ctx.strokeStyle='#173f2c';ctx.lineWidth=2.7;ctx.lineCap='round';ctx.beginPath();
  points.forEach((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],ang=Math.atan2(next.y-prev.y,next.x-prev.x),nx=-Math.sin(ang),ny=Math.cos(ang),offset=baseHalf*Math.cos(phases[i])*.88,x=p.x+nx*offset,y=p.y+ny*offset;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  ctx.strokeStyle='#92c56c';ctx.lineWidth=1;ctx.globalAlpha=.68;ctx.beginPath();
  points.forEach((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],ang=Math.atan2(next.y-prev.y,next.x-prev.x),nx=-Math.sin(ang),ny=Math.cos(ang),offset=-baseHalf*Math.cos(phases[i])*.7,x=p.x+nx*offset,y=p.y+ny*offset;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.globalAlpha=1;
  ctx.restore();
}
function drawChar(c,i){
  const cosine=Math.cos(c.yaw),view=cosine>.38?0:cosine<-.38?2:1,source=tintedSprites[i]||sprite;
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(clamp(c.vx*.025,-.65,.65));if(Math.sin(c.yaw)<0)ctx.scale(-1,1);
  if(sprite.complete&&sprite.naturalWidth){const sw=sprite.width/3,size=c.r*3.15;ctx.drawImage(source,view*sw,0,sw,sprite.height,-size/2,-size/2,size,size);}
  else{ctx.fillStyle=c.color;ctx.strokeStyle='#304244';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,c.r,0,7);ctx.fill();ctx.stroke();}
  ctx.restore();
  if(!c.free){const bw=34,bx=c.x-bw/2,by=c.y+c.r+20;ctx.fillStyle='#001a';ctx.fillRect(bx,by,bw,4);ctx.fillStyle=c.hp<30?'#ff796b':'#9ee86e';ctx.fillRect(bx,by,bw*clamp(c.hp,0,100)/100,4);}
}
function drawImpacts(){
  impacts.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=p.life;ctx.strokeStyle='#b9fff0';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=p.life*.7;ctx.strokeStyle='#78dccc';ctx.beginPath();ctx.arc(0,0,p.r+7,-1.25,.35);ctx.stroke();ctx.beginPath();ctx.arc(0,0,p.r+7,1.9,3.5);ctx.stroke();ctx.restore();});
}
function drawContactOverpasses(){
  knots.forEach(k=>{if(k.lock<.12)return;const id=k.over,c=chars[id];if(c.free)return;const path=ropePath(c),t=id===k.a?k.tA:k.tB,center=Math.round(t*(path.length-1)),from=clamp(center-2,0,path.length-2),to=clamp(center+2,from+1,path.length-1);strokeRope(path.slice(from,to+1),c,id,from/(path.length-1),to/(path.length-1));});
}
function drawMermaid(){
  if(awareness<55)return;const p=(awareness-55)/45,size=45+p*95,x=W+35-p*85,y=H*.17;ctx.save();ctx.globalAlpha=.12+p*.48;ctx.translate(x,y);ctx.fillStyle='#071b2b';ctx.beginPath();ctx.arc(0,0,size,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.6,size*.45);ctx.quadraticCurveTo(-size*1.3,size*1.25,-size*.3,size*1.55);ctx.quadraticCurveTo(size*.5,size*1.2,size*.72,size*.45);ctx.fill();ctx.fillStyle='#ffdf72';ctx.beginPath();ctx.arc(-size*.3,-size*.1,4+p*4,0,7);ctx.arc(size*.12,-size*.1,4+p*4,0,7);ctx.fill();ctx.restore();
}
function draw(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#176a7d');g.addColorStop(.62,'#07505e');g.addColorStop(1,'#032b3a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawMermaid();
  ctx.save();ctx.translate(rand(-shake,shake),rand(-shake,shake));ctx.fillStyle='#d6fff244';bubbles.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()});
  chars.map((c,i)=>({c,i})).filter(o=>!o.c.free).sort((a,b)=>a.c.depth-b.c.depth).forEach(o=>strokeRope(ropePath(o.c),o.c,o.i));drawContactOverpasses();drawImpacts();chars.forEach(drawChar);
  scraps.forEach(s=>{ctx.save();ctx.globalAlpha=s.life;ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.fillStyle='#328d48';ctx.strokeStyle='#173f2c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-11,-38);ctx.quadraticCurveTo(-8,-18,-12,0);ctx.quadraticCurveTo(-7,18,-10,38);ctx.lineTo(10,38);ctx.quadraticCurveTo(7,18,12,0);ctx.quadraticCurveTo(8,-18,11,-38);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();});
  fibers.forEach(f=>{ctx.globalAlpha=f.life;ctx.fillStyle='#bce369';ctx.fillRect(f.x,f.y,rand(2,5),rand(4,10))});ctx.globalAlpha=1;ctx.restore();
  if(messageLife>0){ctx.globalAlpha=clamp(messageLife*2,0,1);ctx.fillStyle='#fffbd1';ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.fillText(message,W/2,H*.72);ctx.globalAlpha=1;}
  // 人魚に見つかるまで
  ctx.fillStyle='#0019';ctx.fillRect(18,H-34,W-36,11);ctx.fillStyle=awareness>70?'#fa706c':'#edcf5c';ctx.fillRect(18,H-34,(W-36)*clamp(awareness,0,100)/100,11);
  ctx.fillStyle='#fff';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText('人魚の気配',W/2,H-40);
  const engaged=knots.filter(k=>k.value>1),avgKnot=engaged.length?engaged.reduce((s,k)=>s+k.value,0)/engaged.length:0,avgHeat=engaged.length?engaged.reduce((s,k)=>s+k.heat,0)/engaged.length:0;
  $('#score').textContent=Math.floor(avgKnot)+'%';$('#distance').textContent=Math.floor(avgHeat);
}
function loop(now){if(!running)return;const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}
function finish(win){if(!running)return;running=false;bgm.pause();if(!win)playSfx('caught');const t=(performance.now()-started)/1000;$('#result-score').textContent=t.toFixed(1);$('.eyebrow','#result-panel');$('#result-panel .eyebrow').textContent=win?'全員脱出！':'見つかってしまった…';$('#result-copy').textContent=win?'絡ませてから逆へ引くのが脱出のコツ！':'隣の子へぶつけて絡ませ、すぐ逆方向へ引こう。';$('#result-panel').classList.remove('hidden');}
$('#sound-button').onclick=()=>{soundOn=!soundOn;$('#sound-button').textContent=soundOn?'🔊':'🔇';$('#sound-button').setAttribute('aria-label',soundOn?'音を消す':'音を出す');if(!soundOn){bgm.pause();Object.values(sfx).forEach(a=>a.pause());}else if(running)bgm.play().catch(()=>{});};
document.addEventListener('visibilitychange',()=>{if(document.hidden)bgm.pause();else if(soundOn&&running)bgm.play().catch(()=>{});});
$('#start-button').onclick=reset;$('#retry-button').onclick=reset;draw();
