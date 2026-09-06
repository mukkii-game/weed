'use strict';
// Input supplies the energy. Recoil spends it; unattended ropes never lose health.
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,TAU=Math.PI*2;
const ROUND_SECONDS=30,TEAM_HP=650,ESCAPE_SECONDS=2.4;
const palette=['#edb4ca','#f2d790','#b8dfe9','#eed4bc','#b8dba9'];
const sprite=new Image(),tints=[];
sprite.onload=()=>palette.forEach(color=>{const c=document.createElement('canvas');c.width=sprite.width;c.height=sprite.height;const x=c.getContext('2d');x.drawImage(sprite,0,0);x.globalCompositeOperation='source-atop';x.globalAlpha=.22;x.fillStyle=color;x.fillRect(0,0,c.width,c.height);tints.push(c);});
const SPRITE_FRAMES=7;
sprite.src='assets/sea-friend-sprites.png?v=2';

let teamHp=TEAM_HP,damagePulse=0,escapeTime=0,lastDrag=-10;
let W=390,H=780,mode='title',chars=[],links=[],particles=[],words=[],impacts=[],pointer=null,pointers=[];
let elapsed=0,clock=0,last=0,lastInput=-10,caught=0,shake=0,flash=0,combo=0,comboTime=0,multiTapAt=-Infinity,stats={},endWin=false;
let soundOn=true,musicMode=1,audio=null,beat=0,nextBeat=0,hidden=false;
const oldBgm=new Audio('assets/maou-orchestra24.mp3?v=1');oldBgm.loop=true;oldBgm.volume=.22;
function resize(){const ow=W,oh=H;W=innerWidth;H=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=W*d;canvas.height=H*d;ctx.setTransform(d,0,0,d,0,0);if(chars.length)chars.forEach(c=>{c.x*=W/ow;c.y*=H/oh;c.home*=W/ow;c.anchor*=W/ow;c.homeY*=H/oh;c.r=Math.min(28,W*.066);});pointer=null;pointers=[];}
addEventListener('resize',resize);resize();

// A small original marimba / bubble score, with a separate volume envelope per note.
function unlockAudio(){if(!audio){const A=window.AudioContext||window.webkitAudioContext;if(A)audio=new A();}if(audio?.state==='suspended')audio.resume().catch(()=>{});}
function tone(f,t=.12,vol=.06,type='sine',delay=0,end=f){if(!soundOn||!audio||hidden||audio.state!=='running')return;const now=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+t);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.009);g.gain.exponentialRampToValueAtTime(.0001,now+t);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+t+.025);}
const waterFiles=['underwater-1','underwater-2','underwater-3'];
const cheerVoices=Array.from({length:5},()=>{const a=new Audio('assets/se/yahhoo.mp3');a.preload='auto';return a;});
let cheerTimers=[],lastPowerSound=-Infinity;
const sePool=Object.fromEntries([...waterFiles,'yahhoo'].map(file=>[file,Array.from({length:file==='yahhoo'?1:2},()=>{
  const a=new Audio('assets/se/'+file+'.mp3');a.preload='auto';return a;
})]));
let seIndex=0,seLastWater=-Infinity;
function stopSE(){cheerTimers.forEach(id=>{if(typeof clearTimeout==='function')clearTimeout(id);});cheerTimers=[];cheerVoices.forEach(a=>{a.pause();a.currentTime=0;});Object.values(sePool).flat().forEach(a=>{a.pause();a.currentTime=0;});}
function se(kind,c,strength=.4){
  if(!soundOn||hidden)return;
  if(kind==='win'){
    stopSE();
    cheerVoices.forEach((a,i)=>{const fire=()=>{a.currentTime=0;a.volume=.52-i*.035;a.playbackRate=.94+i*.03;a.play().catch(()=>{});};cheerTimers.push(typeof setTimeout==='function'?setTimeout(fire,i*48):(fire(),0));});
    return;
  }
  if(mode==='escaping'||mode==='result')return;
  const now=performance.now();
  if(kind==='power'){
    if(now-lastPowerSound<280)return;
    lastPowerSound=seLastWater=now;
    const a=sePool['underwater-3'][1];a.pause();a.currentTime=0;a.volume=.82;a.playbackRate=.76;a.play().catch(()=>{});
    tone(145,.22,.14,'sine',0,48);tone(620,.12,.05,'sine',.025,210);return;
  }
  if(now-seLastWater<140)return;
  const active=waterFiles.flatMap(file=>sePool[file]).filter(a=>!a.paused&&!a.ended).length;
  if(active>=4)return;
  const file=waterFiles[seIndex%waterFiles.length],a=sePool[file].find(a=>a.paused||a.ended);
  if(!a)return;
  seIndex++;seLastWater=now;a.currentTime=0;a.volume=clamp(.2+strength*.38,.2,.65);
  a.playbackRate=1;a.play().catch(()=>{});
}
function music(){}
function syncMusic(){oldBgm.pause();if(soundOn&&mode==='play'&&!hidden)oldBgm.play().catch(()=>{});}

function setup(){const heights=[.42,.55,.46,.59,.40],space=Math.min(82,W*.175);chars=palette.map((color,id)=>{const home=W/2+(id-2)*space,hp=TEAM_HP;return {id,color,home,anchor:home,homeY:H*heights[id],x:home,y:H*heights[id],vx:0,vy:0,kickX:0,kickY:0,flowVx:0,r:Math.min(28,W*.066),hp,maxHp:hp,charge:0,hold:0,twist:0,reach:.12,yaw:id*.4,spin:0,tilt:0,stretch:0,pop:0,recoil:0,cool:0,active:0,lastDir:id%2?1:-1,free:false,escape:0,trail:0};});links=[];for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)links.push({a,b,power:0,visualPower:0,cool:0,bodyCool:0,tA:.6,tB:.6,x:0,y:0,phase:0,turns:1.4,span:.17,spinDir:1});particles=[];words=[];impacts=[];pointer=null;pointers=[];teamHp=TEAM_HP;damagePulse=0;escapeTime=0;lastDrag=lastInput=-10;lastPowerSound=-Infinity;multiTapAt=-Infinity;endWin=false;elapsed=0;caught=0;combo=0;comboTime=0;shake=flash=0;stats={taps:0,drags:0,flicks:0,recoils:0,tangles:0,bonks:0};}
function start(){unlockAudio();stopSE();seIndex=0;seLastWater=lastPowerSound=-Infinity;setup();mode='play';$('#start-panel').classList.add('hidden');$('#result-panel').classList.add('hidden');$('#hud').classList.remove('hidden');oldBgm.currentTime=0;nextBeat=audio?.currentTime||0;beat=0;syncMusic();label('つつく！ のばす！ はなす！',W/2,H*.76,'#ffecaa',2);}
function label(){}
function burst(x,y,n=8,color='#c6ffed'){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=30+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-30,r:2+Math.random()*4,life:.5+Math.random()*.7,color});}if(particles.length>180)particles.splice(0,particles.length-180);}
function remaining(){return chars.filter(c=>!c.free);}
function twistLevel(c){return clamp(Math.abs(c.twist)/(100/12),0,1);}
function pushMotion(c,x,y){c.kickX=clamp(c.kickX+x,-260,260);c.kickY=clamp(c.kickY+y,-220,220);}
function contactFeedback(a,b,k,hitPower){
  const charged=Math.max(twistLevel(a),twistLevel(b));
  if(charged<.82||clock-lastDrag>.65)return false;
  const strength=clamp(hitPower/24,0,1);
  impacts.push({x:k.x,y:k.y,age:0,strength});
  if(impacts.length>8)impacts.shift();
  burst(k.x,k.y,Math.round(16+strength*12),'#ecffd1');
  se('power',a,strength);shake=Math.max(shake,1.5+strength*2);return true;
}
function contactPower(a,b){
  const qa=clamp(Math.abs(a.twist)/(100/12),0,1),qb=clamp(Math.abs(b.twist)/(100/12),0,1);
  const team=chars.reduce((sum,c)=>sum+clamp(Math.abs(c.twist)/(100/12),0,1),0)/chars.length;
  return (.35+3*(qa+qb)+7*qa*qb)*(1+.8*team);
}
function damageTeam(n){
  if(mode!=='play'||clock-lastDrag>.65||n<=0)return;
  teamHp=Math.max(0,teamHp-n);chars.forEach(c=>{c.hp=teamHp;});
  damagePulse=Math.min(.32,damagePulse+n*.012);
  if(teamHp===0)releaseAll();
}
function energize(c,power,dir,kind){if(c.free)return;lastInput=clock;const edge=c.id===0||c.id===4?1.15:1,tap=kind==='tap';c.active=1.5;if(tap){c.lastDir=dir||c.lastDir;c.hold=3;}if(tap)c.charge=clamp(c.charge+power*edge,0,100);c.spin=clamp(c.spin+(dir||c.lastDir)*(tap?13:kind==='flick'?4:1.2),-29,29);c.pop=.24;if(!c.free&&c.charge>=100&&c.cool<=0)recoil(c);}
function recoil(c){c.charge=100;c.hold=3;c.cool=3;c.recoil=.25;c.spin*=.22;c.pop=.24;stats.recoils++;shake=2;se('recoil',c,.75);burst(c.x,c.y-c.r,8);}
function releaseAll(){
  if(mode!=='play')return;
  mode='escaping';endWin=true;escapeTime=0;pointer=null;pointers=[];teamHp=0;
  chars.forEach(c=>{
    c.free=true;c.hp=0;c.escape=0;c.vy=-H*.52;c.vx=55;c.spin=0;c.yaw=1.2;c.tilt=-.2;
    burst(c.x,c.y-c.r,18,'#fff2a6');
  });
  links.forEach(k=>{k.power=0;});stats.rescued=chars.length;
  shake=8;flash=.18;oldBgm.pause();se('win');
  if(navigator.vibrate)navigator.vibrate([30,40,50]);
}
function pick(x,y){let best=null,dist=62;chars.forEach(c=>{const d=Math.hypot(c.x-x,c.y-y);if(!c.free&&d<dist){dist=d;best=c;}});return best;}
// Safari may reserve edge swipes even when CSS touch-action is none.
// Cancel native touch gestures only on the playing canvas; keep UI buttons native.
function guardGameTouch(e){if(mode==='play'&&e.cancelable)e.preventDefault();}
canvas.addEventListener('touchstart',guardGameTouch,{passive:false});
canvas.addEventListener('touchmove',guardGameTouch,{passive:false});
canvas.addEventListener('pointerdown',e=>{if(mode!=='play')return;unlockAudio();const c=pick(e.clientX,e.clientY);if(!c)return;const p={id:e.pointerId,c,sx:e.clientX,sy:e.clientY,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:0,bank:0,time:clock,mx:0,my:0,mt:clock,offsetX:c.x-e.clientX,offsetY:c.y-e.clientY};pointers.push(p);if(!pointer)pointer=p;if(pointers.length>=2){lastDrag=lastInput=clock;pointers.forEach(q=>{q.c.active=1.8;pushMotion(q.c,q.c.lastDir*14,-9);});if(clock-multiTapAt>.18){multiTapAt=clock;damageTeam(2.1);burst(c.x,c.y,6,'#e5ffd0');}}canvas.setPointerCapture(e.pointerId);c.pop=.3;});
canvas.addEventListener('pointermove',e=>{const p=pointers.find(q=>q.id===e.pointerId);if(!p)return;const x=clamp(e.clientX,10,W-10),y=clamp(e.clientY,H*.18,H*.8),dx=x-p.x,dy=y-p.y,dt=Math.max(.016,clock-p.mt);p.mx=clamp(dx/dt,-1100,1100);p.my=clamp(dy/dt,-1100,1100);p.mt=clock;p.x=x;p.y=y;p.moved+=Math.hypot(dx,dy);p.bank+=Math.hypot(dx,dy);if(p.moved>12&&!p.c.free){lastDrag=lastInput=clock;p.c.active=1.5;if(p.bank>16){const energy=Math.min(12,p.bank*.17);p.bank=0;energize(p.c,energy,Math.sign(dx)||p.c.lastDir,'drag');stats.drags++;if(Math.random()<.3)burst(p.c.x,p.c.y,2);if(clock-(p.soundAt||0)>.16){se('stretch',p.c);p.soundAt=clock;}}}});
function pointerEnd(e,cancel=false){const p=pointers.find(q=>q.id===e.pointerId);if(!p)return;pointers=pointers.filter(q=>q!==p);if(pointer===p)pointer=pointers[0]||null;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(cancel||p.c.free||mode!=='play')return;const c=p.c;if(p.moved<14&&Math.hypot(e.clientX-p.sx,e.clientY-p.sy)<18){stats.taps++;c.vy-=90;c.vx+=c.lastDir*32;energize(c,24,c.lastDir,'tap');se('tap',c);burst(c.x,c.y+c.r,5);label('くるるっ',c.x,c.y-48,c.color,.6);}else{lastDrag=lastInput=clock;stats.flicks++;const dx=p.x-p.sx,dy=p.y-p.sy,len=Math.hypot(dx,dy),fresh=clock-p.mt<.15;const edge=c.id===0||c.id===4?1.25:1;c.vx=clamp((fresh?p.mx*.38:0)+(c.home-c.x)*2,-540,540)*edge;c.vy=clamp((fresh?p.my*.38:0)+(c.homeY-c.y)*2,-520,520);energize(c,clamp(len*.13,10,32),Math.sign(dx)||c.lastDir,'flick');c.stretch=.35;burst(c.x,c.y,9);se('tap',c);label(len>W*.25?'びよーーん！':'びゅんっ！',c.x,c.y-48);}}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>pointerEnd(e,true));canvas.addEventListener('lostpointercapture',e=>pointerEnd(e,true));

function ropePath(c){
  const pts=[],length=c.y-c.r*.55+12;
  for(let i=0;i<=64;i++){
    const t=i/64;
    let x=mix(c.anchor,c.x,t)+Math.sin(Math.PI*t)*(Math.sin(clock*1.7+t*7+c.id)*5-c.vx*.035);
    const y=-12+length*t;let z=0;
    links.forEach(k=>{
      if(k.visualPower<.02||(k.a!==c.id&&k.b!==c.id)||chars[k.a].free||chars[k.b].free)return;
      const kt=k.a===c.id?k.tA:k.tB,side=(k.a===c.id?1:-1)*k.spinDir,s=(t-kt)/k.span;
      if(Math.abs(s)>=1)return;
      const envelope=Math.cos(s*Math.PI/2)**2*k.visualPower;
      const angle=k.phase*.12+s*Math.PI*k.turns;
      // A broad S-shaped crossing keeps each strip readable, even in a crowd.
      // Keep height monotonic: folding it back made jagged green clumps.
      x=mix(x,k.x,envelope*.5)+side*Math.sin(angle)*14*envelope;
      z+=side*Math.cos(angle)*envelope;
    });
    pts.push({x,y,z,t});
  }
  return pts;
}
function interact(dt){const paths=chars.map(c=>c.free?null:ropePath(c));links.forEach(k=>{k.cool=Math.max(0,k.cool-dt);k.bodyCool=Math.max(0,k.bodyCool-dt);k.power=Math.max(0,k.power-dt*.22);k.phase+=dt*(3+k.power*5)*k.spinDir;k.visualPower=mix(k.visualPower,k.power,1-Math.exp(-dt*9));const a=chars[k.a],b=chars[k.b];if(a.free||b.free||mode!=='play')return;const relative=Math.hypot(a.vx-b.vx,a.vy-b.vy);if((a.active>0||b.active>0)&&relative>35&&k.cool===0){let best=23,hit=null;for(let i=10;i<65;i+=3)for(let j=10;j<65;j+=3){const p=paths[k.a][i],q=paths[k.b][j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<best){best=d;hit={p,q};}}if(hit){k.tA=clamp(hit.p.t,.34,.76);k.tB=clamp(hit.q.t,.34,.76);const pa=paths[k.a][Math.round(k.tA*64)],pb=paths[k.b][Math.round(k.tB*64)];k.x=(pa.x+pb.x)/2;k.y=(pa.y+pb.y)/2;k.power=1;k.cool=.9;stats.tangles++;combo=comboTime>0?combo+1:1;comboTime=2.1;const stored=clamp((Math.abs(a.twist)+Math.abs(b.twist))/ (100/12),0,2),dir=a.x>b.x?1:-1;k.spinDir=dir;k.turns=clamp(.65+stored*.22+relative/1600,.65,1.35);k.span=clamp(.17+stored*.025,.17,.21);pushMotion(a,dir*(45+stored*20),-28);pushMotion(b,-dir*(45+stored*20),22);a.spin=mix(a.spin,dir*14,.45);b.spin=mix(b.spin,-dir*14,.45);const hitPower=contactPower(a,b);a.charge*=.96;b.charge*=.96;a.active=b.active=1;damageTeam(hitPower);const loud=contactFeedback(a,b,k,hitPower);if(mode!=='play')return;burst(k.x,k.y,Math.round(5+stored*9),'#d9fff4');label(stored>1?'こすれて効いた！':combo>1?`こすれ ${combo}連鎖！`:'キュッ！',k.x,k.y-18,'#e0fff4');if(!loud)se('tangle',a,stored/2);shake=Math.max(shake,.5+stored);}}
if(k.power>.15){const dx=b.x-a.x,dy=b.y-a.y,tug=dt*k.power*1.35,orbit=dt*k.power*.55*k.spinDir;a.vx+=dx*tug-dy*orbit;b.vx-=dx*tug+dy*orbit;a.vy+=dy*tug*.35+dx*orbit;b.vy-=dy*tug*.35+dx*orbit;const rub=relative*k.power*dt*.0007*contactPower(a,b);if(rub>.01)damageTeam(rub);if(mode!=='play')return;}
// Body contact only gives a soft bounce. Damage is attached to the ribbons.
const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),gap=a.r+b.r;if(d<gap&&d>1){const push=(gap-d)*dt*13,nx=dx/d,ny=dy/d;a.vx-=nx*push;b.vx+=nx*push;a.vy-=ny*push;b.vy+=ny*push;if(relative>45&&k.bodyCool<=0){k.bodyCool=.48;stats.bonks++;pushMotion(a,-nx*38,-ny*28-15);pushMotion(b,nx*38,ny*28-15);a.pop=b.pop=.28;a.spin=mix(a.spin,-ny*5,.45);b.spin=mix(b.spin,ny*5,.45);burst((a.x+b.x)/2,(a.y+b.y)/2,10,'#fff2ca');label('ぽよん！',(a.x+b.x)/2,(a.y+b.y)/2-30,'#fff1b0',.65);se('bonk',a);shake=Math.max(shake,.7);}}});}
function beginCaught(){if(mode!=='play')return;mode='caught';caught=0;pointer=null;pointers=[];oldBgm.pause();se('caught');shake=5;label('みつかった……！',W*.58,H*.42,'#ffe6cb',1.2);}
function update(dt){clock+=dt;damagePulse=Math.max(0,damagePulse-dt);impacts.forEach(e=>e.age+=dt);impacts=impacts.filter(e=>e.age<.65);shake*=Math.exp(-dt*12);flash=Math.max(0,flash-dt);comboTime-=dt;particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*2);p.vy-=45*dt;});particles=particles.filter(p=>p.life>0);words.forEach(w=>{w.life-=dt;w.y-=dt*17;});words=words.filter(w=>w.life>0);
const countdown=$('#countdown');if(countdown?.classList?.toggle)countdown.classList.toggle('urgent',Math.ceil(Math.max(0,ROUND_SECONDS-elapsed))<=10&&mode==='play');
if(mode==='title'){chars.forEach(c=>{c.y=c.homeY+Math.sin(clock*1.4+c.id)*9;c.yaw+=dt*.5;});return;}
chars.forEach(c=>{if(c.free){if(mode!=='escaping')return;c.escape+=dt;const targetX=W*.65+(c.id-2)*c.r*1.4;c.vx=mix(c.vx,(targetX-c.x)*2,1-Math.exp(-dt*3));c.x+=c.vx*dt;c.y+=c.vy*dt;c.yaw=1.2+Math.sin(c.escape*12+c.id)*.13;c.tilt=-.2+Math.sin(c.escape*12+c.id)*.1;c.trail-=dt;if(c.trail<0){burst(c.x,c.y+c.r,2);c.trail=.13;}return;}if(mode!=='play')return;c.active=Math.max(0,c.active-dt);c.cool=Math.max(0,c.cool-dt);c.recoil=Math.max(0,c.recoil-dt);c.pop*=Math.exp(-dt*9);c.stretch*=Math.exp(-dt*7);const held=pointer?.c===c&&pointer.moved>12;
if(held){const tx=clamp(pointer.x+pointer.offsetX,c.r,W-c.r),ty=clamp(pointer.y+pointer.offsetY,H*.2,H*.8);c.vx=mix(c.vx,(tx-c.x)*15,1-Math.exp(-dt*14));c.vy=mix(c.vy,(ty-c.y)*15,1-Math.exp(-dt*14));}else{c.vx+=((c.home-c.x)*3.4)*dt;c.vy+=((c.homeY-c.y)*6.5)*dt;c.vx*=Math.exp(-dt*1.4);c.vy*=Math.exp(-dt*1.8);}c.vx+=c.kickX*dt;c.vy+=c.kickY*dt;c.kickX*=Math.exp(-dt*12);c.kickY*=Math.exp(-dt*12);c.x=clamp(c.x+c.vx*dt,c.r,W-c.r);c.y=clamp(c.y+c.vy*dt,H*.2,H*.8);const beforeCharge=c.charge;c.hold=Math.max(0,(c.hold||0)-dt);if(c.hold===0&&c.active<=0)c.charge=Math.max(0,c.charge-dt*6);c.spin*=Math.exp(-dt*(c.charge>=99?9:2.6));c.yaw+=c.spin*dt+c.lastDir*(c.charge-beforeCharge)*.035;c.twist=mix(c.twist,c.lastDir*(c.charge/12),1-Math.exp(-dt*3));c.reach=mix(c.reach,.18+.82*c.charge/100,1-Math.exp(-dt*3));c.tilt=mix(c.tilt,clamp(c.vx*.002,-.7,.7),1-Math.exp(-dt*8));if(c.charge>=100&&c.cool<=0)recoil(c);});
if(mode==='play'){
  // Count this frame before contact so a release records the actual clear time.
  elapsed=Math.min(ROUND_SECONDS,elapsed+dt);
  if(clock-lastInput<1.6)interact(dt);
  else links.forEach(k=>{k.power=Math.max(0,k.power-dt*.6);k.cool=Math.max(0,k.cool-dt);k.bodyCool=Math.max(0,k.bodyCool-dt);});
  if(mode==='play'&&elapsed>=ROUND_SECONDS)beginCaught();music();
}else if(mode==='escaping'){escapeTime+=dt;if(escapeTime>=ESCAPE_SECONDS)finish(true);}
else if(mode==='caught'){caught+=dt;const tx=W*.60,ty=H*.36;remaining().forEach((c,i)=>{const pull=dt*(.35+caught*1.7);c.x+=((tx+(i-2)*5)-c.x)*pull;c.y+=(ty-c.y)*pull;c.yaw+=dt*(5+caught*8);c.pop=.18+Math.sin(clock*18)*.08;});shake=Math.max(shake,caught*4);if(caught>1.6)finish(false);}}

// Continuous faces avoid antialiasing seams between hundreds of tiny quads.
function ribbonGeometry(c){
  const path=ropePath(c),dense=[];
  for(let i=0;i<path.length-1;i++)for(let j=0;j<4;j++){
    const p=path[i],q=path[i+1],u=j/4;
    dense.push({x:mix(p.x,q.x,u),y:mix(p.y,q.y,u),z:mix(p.z,q.z,u),t:mix(p.t,q.t,u)});
  }
  dense.push(path[path.length-1]);
  const base=Math.min(17,W*.04),stretch=clamp(c.homeY/c.y,.75,1.15);
  const phase=t=>c.twist*TAU*(1-(1-clamp(t/Math.max(.15,c.reach),0,1))**1.35)+t*.7+c.yaw*.12;
  return dense.map((p,i)=>{
    const prev=dense[Math.max(0,i-1)],next=dense[Math.min(dense.length-1,i+1)];
    const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1;
    const nx=dy/len,ny=-dx/len,face=Math.cos(phase(p.t));
    const edge=1+.025*Math.sin(p.t*61+c.id)+.016*Math.sin(p.t*113+c.id*2);
    const width=base*(.12+.88*Math.abs(face))*stretch*edge;
    return {...p,face,lx:p.x-nx*width,ly:p.y-ny*width,rx:p.x+nx*width,ry:p.y+ny*width,
      hx:p.x+nx*width*.55,hy:p.y+ny*width*.55};
  });
}
function ribbonContour(pts){
  ctx.beginPath();ctx.moveTo(pts[0].lx,pts[0].ly);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].lx,pts[i].ly);
  for(let i=pts.length-1;i>=0;i--)ctx.lineTo(pts[i].rx,pts[i].ry);
  ctx.closePath();
}
function twistGlow(c,pts){
  const q=twistLevel(c);if(q<.025)return;
  ctx.save();ribbonContour(pts);ctx.lineJoin='round';
  ctx.strokeStyle='#e7ffb1';ctx.globalAlpha=.08+q*.27;ctx.lineWidth=3+q*8;
  ctx.shadowColor='#caff8c';ctx.shadowBlur=q*18;ctx.stroke();
  if(q>.82){ctx.globalAlpha=(q-.82)/.18*(.18+.06*Math.sin(clock*7));ctx.lineWidth=2.5;ctx.shadowBlur=28;ctx.stroke();}
  ctx.restore();
}
function ribbon(c,pts=ribbonGeometry(c),front=false){
  if(pts.length<2)return;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  // One unbroken silhouette sits underneath both sides of the ribbon.
  ribbonContour(pts);ctx.fillStyle='#386e43';
  if(front){ctx.shadowColor='#062d37aa';ctx.shadowBlur=4;ctx.shadowOffsetY=2;}
  ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  let face=[pts[0]];
  const fillFace=()=>{if(face.length<2)return;ribbonContour(face);ctx.fillStyle=face[Math.floor(face.length/2)].face>=0?'#68a44f':'#295f43';ctx.fill();};
  for(let i=1;i<pts.length;i++){
    const p=pts[i-1],q=pts[i];
    if((p.face>=0)!==(q.face>=0)){
      const u=Math.abs(p.face)/(Math.abs(p.face)+Math.abs(q.face)),edge={};
      for(const key of Object.keys(p))edge[key]=mix(p[key],q[key],u);
      face.push(edge);fillFace();face=[edge];
    }
    face.push(q);
  }
  fillFace();
  for(const side of ['l','r']){
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[side+'x'],p[side+'y']):ctx.moveTo(p[side+'x'],p[side+'y']));
    ctx.strokeStyle=damagePulse>.04?'#d7efb0':'#204f3c';ctx.lineWidth=1.25;ctx.stroke();
  }
  ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.hx,p.hy):ctx.moveTo(p.hx,p.hy));
  ctx.strokeStyle='#b1d37b88';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
}
function ribbons(){
  const ropes=chars.filter(c=>!c.free).map(c=>({c,pts:ribbonGeometry(c)}));
  ropes.forEach(({c,pts})=>twistGlow(c,pts));
  ropes.forEach(({c,pts})=>ribbon(c,pts));
  // The positive depth half of each crossing comes back over its partner.
  ropes.forEach(({c,pts})=>{
    let start=-1;
    for(let i=0;i<=pts.length;i++){
      if(i<pts.length&&pts[i].z>.08){if(start<0)start=Math.max(0,i-1);}
      else if(start>=0){ribbon(c,pts.slice(start,Math.min(pts.length,i+1)),true);start=-1;}
    }
  });
}
function impactEffects(){
  ctx.save();
  for(const e of impacts){
    const p=e.age/.65,r=14+(1-(1-p)**3)*(32+e.strength*25);
    ctx.globalAlpha=(1-p)**2;ctx.strokeStyle='#edffcb';ctx.lineWidth=2+3*(1-p);
    ctx.beginPath();ctx.ellipse(e.x,e.y,r,r*.65,-.25,0,TAU);ctx.stroke();
    ctx.lineWidth=1.5;
    for(let i=0;i<8;i++){const a=i*TAU/8,inner=r*.75,outer=r*(1.05+e.strength*.2);ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*inner,e.y+Math.sin(a)*inner*.65);ctx.lineTo(e.x+Math.cos(a)*outer,e.y+Math.sin(a)*outer*.65);ctx.stroke();}
  }
  ctx.restore();
}
function grabFeedback(){
  const c=pointer?.c;if(!c||c.free||mode!=='play')return;
  ctx.save();ctx.translate(c.x,c.y);ctx.strokeStyle='#eefff2';ctx.lineWidth=2.5;
  const r=c.r*1.62+Math.sin(clock*9)*1.2;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(0,0,r,i*Math.PI/2+.15,i*Math.PI/2+.85);ctx.stroke();}
  ctx.restore();
}
function frictionEffects(){links.forEach(k=>{if(k.power<.16||chars[k.a].free||chars[k.b].free)return;ctx.save();ctx.translate(k.x,k.y);ctx.rotate(k.phase*.08);ctx.globalAlpha=k.power*.7;ctx.strokeStyle='#e4fff5';ctx.lineWidth=2.2;for(const side of [-1,1]){ctx.beginPath();ctx.arc(0,0,18+side*5,-1.05,.3);ctx.stroke();ctx.beginPath();ctx.arc(0,0,18+side*5,2.1,3.45);ctx.stroke();}ctx.globalAlpha=k.power*.35;ctx.beginPath();ctx.ellipse(0,0,31,12,0,0,TAU);ctx.stroke();ctx.restore();});}
function character(c){const cos=Math.cos(c.yaw),sin=Math.sin(c.yaw),view=cos>.78?0:cos>.2?(sin>=0?3:1):cos>-.55?2:cos>-.9?(sin>=0?6:5):4,size=c.r*3.05,squash=c.pop+Math.min(.22,Math.abs(c.vy)*.00035);ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.tilt+Math.sin(c.yaw)*Math.min(.25,Math.abs(c.spin)*.009));ctx.scale((.86+.14*Math.abs(cos))*(1+squash*.4),1-squash*.25);if(view===2&&sin>0)ctx.scale(-1,1);if(sprite.complete&&sprite.naturalWidth){const sw=sprite.width/SPRITE_FRAMES;ctx.drawImage(tints[c.id]||sprite,view*sw,0,sw,sprite.height,-size/2,-size/2,size,size);}else{ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(0,0,c.r,c.r*.92,0,0,TAU);ctx.fill();ctx.fillStyle='#233c44';if(cos>0){for(const x of [-8,8]){ctx.beginPath();ctx.arc(x,-2,2.4,0,TAU);ctx.fill();}ctx.beginPath();ctx.arc(0,4,4,0,Math.PI);ctx.stroke();}}ctx.restore();if(Math.abs(c.spin)>9){ctx.strokeStyle=c.recoil>0?'#ffed9f':'#c8fff1';ctx.lineWidth=2;ctx.globalAlpha=.6;for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(c.x,c.y,c.r*1.6,c.r*.52,-.2,clock*13+i*Math.PI,clock*13+i*Math.PI+1.9);ctx.stroke();}ctx.globalAlpha=1;}
if(mode==='play'&&!c.free){if(c.charge>10){ctx.beginPath();ctx.strokeStyle=c.charge>75?'#ffe5a1':'#c6ffea88';ctx.lineWidth=2;ctx.arc(c.x,c.y,c.r*1.5,-Math.PI/2,-Math.PI/2+TAU*c.charge/100);ctx.stroke();}}}
function sea(){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#248a99');g.addColorStop(.48,'#12657b');g.addColorStop(1,'#10364e');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=.07;ctx.fillStyle='#cbfff0';for(let i=0;i<5;i++){const x=W*(i*.24-.1)+Math.sin(clock*.2+i)*18;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+30,0);ctx.lineTo(x+180,H);ctx.lineTo(x+50,H);ctx.fill();}ctx.restore();for(let i=0;i<32;i++){const x=((i*97.3)%W)+Math.sin(clock*.5+i)*12,y=H-((clock*(9+i%4*5)+i*57)% (H+30)),r=2+i%5;ctx.strokeStyle='#c3fff138';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.fillStyle='#ffffff44';ctx.beginPath();ctx.arc(x-r*.3,y-r*.3,Math.max(.8,r*.18),0,TAU);ctx.fill();}ctx.fillStyle='#163e50';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W+20;x+=20)ctx.lineTo(x,H-27-Math.sin(x*.018)*9);ctx.lineTo(W,H);ctx.fill();}
function mermaid(front=false){
 const threat=mode==='caught'||mode==='escaping'||(mode==='result'&&!endWin)||(mode==='result'&&endWin);
 if((mode!=='play'&&!threat)||elapsed<3||front!==threat)return;
 const p=clamp((elapsed-3)/(ROUND_SECONDS-3),0,1),lunge=mode==='escaping'||(mode==='result'&&endWin)?clamp(escapeTime/1.2,0,1):clamp(caught/1.2,0,1);
 const x=mix(W*.76,W*.5,p),y=mix(H*.17,H*.35,p),radius=mix(14,Math.min(W*.43,H*.33),p*p);
 const r=mix(radius,Math.hypot(W,H)*.85,lunge*lunge);
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=.15+.85*p;ctx.fillStyle='#020e16';
 ctx.beginPath();ctx.moveTo(-r*.20,r*.65);ctx.quadraticCurveTo(-r*.38,r*1.03,0,r*1.08);ctx.lineTo(r*.37,r*1.17);ctx.lineTo(r*.26,r*.92);ctx.lineTo(r*.48,r*.82);ctx.quadraticCurveTo(r*.20,r*.88,r*.18,r*.65);ctx.fill();
 ctx.beginPath();ctx.ellipse(0,0,r,r*.83,0,0,TAU);ctx.fill();
 const pulse=.5+.5*Math.sin(clock*.9),eyePulse=.5+.5*Math.sin(clock*2.1);
 ctx.globalAlpha=.2+.22*pulse+.35*p;ctx.strokeStyle='#b9fff0';ctx.lineWidth=2+3*pulse;ctx.shadowColor='#86ffe1';ctx.shadowBlur=9+18*pulse;ctx.stroke();
 ctx.globalAlpha=.06+.1*pulse;ctx.lineWidth=5+9*pulse;ctx.stroke();
 ctx.globalAlpha=1;ctx.fillStyle='#ffffbb';ctx.shadowColor='#ffff9b';ctx.shadowBlur=16+30*p+18*eyePulse;
 for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*r*.32,-r*.08,r*.08,r*.13,side*.18,0,TAU);ctx.fill();}
 ctx.shadowBlur=0;if(p>.8){ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(0,r*.33,r*.34,r*(.06+lunge*.20),0,0,TAU);ctx.fill();}ctx.restore();
}

function draw(){sea();mermaid();ctx.save();ctx.translate(Math.sin(clock*67)*shake,Math.cos(clock*83)*shake);ribbons();frictionEffects();impactEffects();grabFeedback();chars.forEach(character);particles.forEach(p=>{ctx.globalAlpha=clamp(p.life,0,1);ctx.strokeStyle=p.color;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.stroke();});ctx.globalAlpha=1;words.forEach(w=>{ctx.globalAlpha=clamp(w.life*3,0,1);ctx.textAlign='center';ctx.font='900 17px system-ui';ctx.lineWidth=4;ctx.strokeStyle='#164957';const x=clamp(w.x,85,W-85);ctx.strokeText(w.text,x,w.y);ctx.fillStyle=w.color;ctx.fillText(w.text,x,w.y);});ctx.restore();ctx.globalAlpha=1;mermaid(true);if(flash>0){ctx.fillStyle=`rgba(226,255,210,${flash})`;ctx.fillRect(0,0,W,H);}if(mode==='play'||mode==='caught'||mode==='escaping'){$('#score').textContent=`${Math.floor((1-teamHp/TEAM_HP)*100)}%`;$('#damage-fill').style.transform=`scaleX(${1-teamHp/TEAM_HP})`;$('#distance').textContent=Math.max(0,Math.ceil(ROUND_SECONDS-elapsed));$('#timer-fill').style.transform=`scaleX(${Math.max(0,1-elapsed/ROUND_SECONDS)})`;}}
function finish(win){if(mode!=='play'&&mode!=='caught'&&mode!=='escaping')return;const bitten=mode==='caught';mode='result';endWin=win;pointer=null;pointers=[];oldBgm.pause();if(!win&&!bitten)se('lose');$('#result-panel').classList.remove('hidden');$('#hud').classList.add('hidden');$('#result-score').textContent=win?elapsed.toFixed(1):'時間切れ';$('#result-unit').textContent=win?'秒':'';try{const key='konbu-team30-best-v1',best=Number(localStorage.getItem(key))||Infinity;if(win&&elapsed<best)localStorage.setItem(key,String(elapsed));const value=Math.min(win?elapsed:Infinity,best);$('#best-score').textContent=Number.isFinite(value)?`この端末の最短 ${value.toFixed(1)}秒`:'';}catch{$('#best-score').textContent='';}}
$('#start-button').onclick=start;$('#retry-button').onclick=start;$('#sound-button').onclick=()=>{unlockAudio();soundOn=!soundOn;$('#sound-button').textContent=soundOn?'🔊':'🔇';$('#sound-button').setAttribute('aria-label',soundOn?'音を消す':'音を出す');if(!soundOn)stopSE();syncMusic();};
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;pointer=null;pointers=[];last=performance.now();if(hidden){oldBgm.pause();stopSE();audio?.suspend();}else{if(soundOn)audio?.resume().catch(()=>{});syncMusic();}});
setup();function loop(now){const dt=Math.min(.033,Math.max(0,(now-last)/1000));last=now;if(!hidden){update(dt);draw();}requestAnimationFrame(loop);}requestAnimationFrame(loop);
