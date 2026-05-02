// ══════════════════════════════════════════════════
//  VOID BREACH — Full Game Engine
// ══════════════════════════════════════════════════
 
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
 
// ── State ──
let state = 'start';
let score = 0, wave = 1, kills = 0, maxCombo = 0;
let comboCount = 0, comboTimer = 0;
let frameId;
 
// ── Input ──
const keys = {};
let mouseX = W/2, mouseY = H/2;
let shooting = false;
 
// ── Player ──
let player;
// ── Entities ──
let bullets = [], enemies = [], enemyBullets = [], particles = [], powerups = [];
let boss = null;
let stars = [];
 
// ── Timing ──
let lastTime = 0, delta = 0;
let spawnTimer = 0, spawnInterval = 120;
let waveTimer = 0, waveEnemies = 0, waveTotal = 10;
let bossPhase = false;
let screenShake = {x:0,y:0,dur:0,mag:0};
 
// ── Weapons ──
const WEAPONS = [
  { name:'PLASMA CANNON',  color:'#00f5ff', speed:14, damage:25, spread:0, burst:1, cooldown:8  },
  { name:'SCATTER BURST',  color:'#ff6b00', speed:12, damage:15, spread:0.18, burst:3, cooldown:15 },
  { name:'VOID LANCE',     color:'#bf00ff', speed:18, damage:60, spread:0, burst:1, cooldown:20 },
];
let currentWeapon = 0;
let shootCooldown = 0;
 
// ──────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────
function initGame() {
  score = 0; wave = 1; kills = 0; maxCombo = 0;
  comboCount = 0; comboTimer = 0;
  bullets = []; enemies = []; enemyBullets = []; particles = []; powerups = [];
  boss = null; bossPhase = false;
  spawnTimer = 0; spawnInterval = 120;
  waveTimer = 0; waveEnemies = 0; waveTotal = 10;
  currentWeapon = 0; shootCooldown = 0;
  screenShake = {x:0,y:0,dur:0,mag:0};
 
  // Stars
  stars = Array.from({length:180}, () => ({
    x: Math.random()*W, y: Math.random()*H,
    r: Math.random()*1.4+0.2,
    sp: Math.random()*0.6+0.15,
    a: Math.random()
  }));
 
  // Player
  player = {
    x: W/2, y: H-100,
    w: 28, h: 36,
    hp: 100, maxHp: 100,
    shield: 100, maxShield: 100,
    shieldRegen: 0.08,
    speed: 5,
    invincible: 0,
    trail: [],
    thruster: 0
  };
 
  updateHUD();
  setWeapon(0);
}
 
// ──────────────────────────────────────────
//  PARTICLE SYSTEM
// ──────────────────────────────────────────
function spawnParticles(x, y, color, count, speed, life, size) {
  for(let i=0;i<count;i++) {
    const a = Math.random()*Math.PI*2;
    const s = (Math.random()*0.6+0.4)*speed;
    particles.push({
      x, y,
      vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      color, life: life*(0.7+Math.random()*0.6),
      maxLife: life, size: size*(0.5+Math.random()*0.8),
      type: Math.random()>0.5?'circle':'rect',
      rot: Math.random()*Math.PI*2,
      rotV: (Math.random()-0.5)*0.3
    });
  }
}
 
function spawnExplosion(x, y, scale=1) {
  spawnParticles(x, y, '#ff6b00', 12*scale, 5*scale, 45, 4*scale);
  spawnParticles(x, y, '#ffcc00', 8*scale, 3*scale, 35, 3*scale);
  spawnParticles(x, y, '#ff006e', 6*scale, 7*scale, 30, 2.5*scale);
  spawnParticles(x, y, '#ffffff', 5*scale, 9*scale, 20, 2*scale);
  shakeScreen(6*scale, 15*scale);
}
 
function spawnRiftParticles(x, y) {
  spawnParticles(x, y, '#bf00ff', 20, 6, 60, 3);
  spawnParticles(x, y, '#00f5ff', 10, 4, 40, 2);
}
 
// ──────────────────────────────────────────
//  SCREEN SHAKE
// ──────────────────────────────────────────
function shakeScreen(mag, dur) {
  if(mag > screenShake.mag) { screenShake.mag = mag; screenShake.dur = dur; }
}
 
// ──────────────────────────────────────────
//  ENEMIES
// ──────────────────────────────────────────
const ENEMY_TYPES = [
  // Grunt — basic shooter
  { name:'grunt', w:24,h:22, hp:40, speed:1.8, score:100,
    color:'#ff006e', glowColor:'rgba(255,0,110,0.4)',
    shootRate:0, shootSpeed:0, shootDmg:0,
    moveType:'straight', reward:'none' },
  // Zigzag
  { name:'zigzag', w:22,h:20, hp:30, speed:2.5, score:150,
    color:'#ff6b00', glowColor:'rgba(255,107,0,0.4)',
    shootRate:0, shootSpeed:0, shootDmg:0,
    moveType:'zigzag', reward:'none' },
  // Shooter
  { name:'shooter', w:26,h:26, hp:60, speed:1.2, score:200,
    color:'#bf00ff', glowColor:'rgba(191,0,255,0.4)',
    shootRate:80, shootSpeed:4, shootDmg:12,
    moveType:'hover', reward:'shield' },
  // Tank
  { name:'tank', w:34,h:30, hp:180, speed:0.7, score:400,
    color:'#00ff88', glowColor:'rgba(0,255,136,0.4)',
    shootRate:60, shootSpeed:3.5, shootDmg:18,
    moveType:'straight', reward:'weapon' },
];
 
function spawnEnemy() {
  const waveScale = 1 + (wave-1)*0.15;
  // unlock types by wave
  const available = ENEMY_TYPES.filter((_,i) => i < Math.min(4, 1 + Math.floor(wave/2)));
  const tmpl = available[Math.floor(Math.random()*available.length)];
  const e = {
    ...tmpl,
    x: Math.random()*(W-60)+30,
    y: -40,
    hp: tmpl.hp * waveScale,
    maxHp: tmpl.hp * waveScale,
    shootTimer: Math.floor(Math.random()*tmpl.shootRate),
    zigDir: 1, zigTimer: 0,
    hoverY: 80 + Math.random()*120,
    reached: false,
    flashTimer: 0
  };
  enemies.push(e);
  waveEnemies++;
}
 
function spawnBoss() {
  spawnRiftParticles(W/2, 0);
  const scale = 1 + wave*0.2;
  boss = {
    x: W/2, y: -80,
    w: 80, h:70,
    hp: 1200*scale, maxHp: 1200*scale,
    speed: 1.4,
    targetX: W/2, targetY: 120,
    phase: 1,
    shootTimer: 0,
    moveTimer: 0,
    angle: 0,
    flashTimer: 0,
    color:'#ff006e'
  };
  bossPhase = true;
  document.getElementById('boss-bar-container').style.display = 'flex';
  document.getElementById('boss-label').textContent = `⚠ VOID HARBINGER MK.${wave} ⚠`;
}
 
// ──────────────────────────────────────────
//  BULLETS
// ──────────────────────────────────────────
function fireBullet() {
  if(shootCooldown > 0) return;
  const w = WEAPONS[currentWeapon];
  shootCooldown = w.cooldown;
  const half = (w.burst-1)/2;
  for(let i=0;i<w.burst;i++) {
    const spread = w.spread*(i-half);
    bullets.push({
      x: player.x, y: player.y - player.h/2,
      vx: Math.sin(spread)*w.speed,
      vy: -Math.cos(spread)*w.speed,
      damage: w.damage,
      color: w.color,
      life: 80, r: currentWeapon===2?4:3,
      weapon: currentWeapon
    });
  }
  // Muzzle flash
  spawnParticles(player.x, player.y-player.h/2, w.color, 4, 3, 12, 2);
}
 
// ──────────────────────────────────────────
//  COLLISION
// ──────────────────────────────────────────
function circleRect(cx,cy,cr,rx,ry,rw,rh) {
  const nx = Math.max(rx-rw/2, Math.min(cx, rx+rw/2));
  const ny = Math.max(ry-rh/2, Math.min(cy, ry+rh/2));
  return (cx-nx)**2+(cy-ny)**2 < cr*cr;
}
 
// ──────────────────────────────────────────
//  POWER UPS
// ──────────────────────────────────────────
function spawnPowerup(x, y, type) {
  powerups.push({ x, y, type, life:300,
    vy: 1.5, anim:0,
    color: type==='shield'?'#00f5ff' : type==='health'?'#ff006e' : '#ffcc00' });
}
 
// ──────────────────────────────────────────
//  FLOAT TEXT
// ──────────────────────────────────────────
function floatText(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.color = color;
  el.style.left = (x - document.getElementById('game-container').offsetLeft) + 'px';
  el.style.top = (y - document.getElementById('game-container').offsetTop - 20) + 'px';
  document.getElementById('game-container').appendChild(el);
  setTimeout(()=>el.remove(), 900);
}
 
// ──────────────────────────────────────────
//  HUD UPDATES
// ──────────────────────────────────────────
function updateHUD() {
  document.getElementById('health-fill').style.width = (player.hp/player.maxHp*100)+'%';
  document.getElementById('shield-fill').style.width = (player.shield/player.maxShield*100)+'%';
  document.getElementById('score-display').textContent = String(score).padStart(6,'0');
  document.getElementById('wave-display').textContent = `WAVE ${String(wave).padStart(2,'0')}`;
  if(comboCount > 1) {
    document.getElementById('combo-display').textContent = `x${comboCount} COMBO`;
  } else {
    document.getElementById('combo-display').textContent = '';
  }
  if(boss) {
    document.getElementById('boss-bar-fill').style.width = (boss.hp/boss.maxHp*100)+'%';
  }
}
 
function setWeapon(i) {
  currentWeapon = i;
  document.getElementById('weapon-display').textContent = WEAPONS[i].name;
}
 
// ──────────────────────────────────────────
//  DRAW FUNCTIONS
// ──────────────────────────────────────────
function drawStars() {
  stars.forEach(s => {
    ctx.globalAlpha = 0.3 + s.a*0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
 
function drawGrid() {
  ctx.strokeStyle = 'rgba(0,245,255,0.04)';
  ctx.lineWidth = 0.5;
  for(let x=0;x<W;x+=60) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  }
  for(let y=0;y<H;y+=60) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }
}
 
function drawPlayer() {
  if(player.invincible > 0 && Math.floor(player.invincible/4)%2===0) return;
 
  const {x, y, w, h} = player;
 
  // Thruster trail
  player.trail.forEach((t,i) => {
    const a = (i/player.trail.length)*0.4;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y+h/2, 4, 8*(i/player.trail.length), 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
 
  // Thruster flame
  const flameH = 14 + Math.random()*8;
  const grad = ctx.createLinearGradient(x, y+h/2, x, y+h/2+flameH);
  grad.addColorStop(0,'#00f5ff');
  grad.addColorStop(0.5,'#0066ff');
  grad.addColorStop(1,'rgba(0,0,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x-6,y+h/2);
  ctx.lineTo(x,y+h/2+flameH);
  ctx.lineTo(x+6,y+h/2);
  ctx.closePath();
  ctx.fill();
 
  // Ship glow
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 20;
 
  // Ship body
  ctx.fillStyle = '#0af';
  ctx.beginPath();
  ctx.moveTo(x, y-h/2);
  ctx.lineTo(x+w/2, y+h/2);
  ctx.lineTo(x+w*0.15, y+h*0.3);
  ctx.lineTo(x-w*0.15, y+h*0.3);
  ctx.lineTo(x-w/2, y+h/2);
  ctx.closePath();
  ctx.fill();
 
  // Cockpit
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x, y-h*0.1, 5, 7, 0, 0, Math.PI*2);
  ctx.fill();
 
  // Wings
  ctx.fillStyle = 'rgba(0,170,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(x-w*0.15, y+h*0.1);
  ctx.lineTo(x-w*0.7, y+h*0.5);
  ctx.lineTo(x-w*0.15, y+h*0.35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x+w*0.15, y+h*0.1);
  ctx.lineTo(x+w*0.7, y+h*0.5);
  ctx.lineTo(x+w*0.15, y+h*0.35);
  ctx.closePath();
  ctx.fill();
 
  ctx.shadowBlur = 0;
 
  // Shield ring
  if(player.shield > 0) {
    ctx.strokeStyle = `rgba(0,245,255,${player.shield/player.maxShield*0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI*2);
    ctx.stroke();
  }
}
 
function drawEnemy(e) {
  const flash = e.flashTimer > 0 ? 1 : 0;
  ctx.save();
  ctx.translate(e.x, e.y);
 
  ctx.shadowColor = flash ? '#fff' : e.glowColor;
  ctx.shadowBlur = flash ? 30 : 14;
 
  const col = flash ? '#ffffff' : e.color;
  ctx.fillStyle = col;
 
  // Different shapes per type
  if(e.name==='grunt') {
    ctx.beginPath();
    ctx.moveTo(0,-e.h/2);
    ctx.lineTo(e.w/2,e.h/2);
    ctx.lineTo(-e.w/2,e.h/2);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-5,-2,3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5,-2,3,0,Math.PI*2); ctx.fill();
  } else if(e.name==='zigzag') {
    ctx.beginPath();
    ctx.moveTo(0,-e.h/2);
    ctx.lineTo(e.w/2,0);
    ctx.lineTo(0,e.h/2);
    ctx.lineTo(-e.w/2,0);
    ctx.closePath();
    ctx.fill();
  } else if(e.name==='shooter') {
    ctx.beginPath();
    ctx.arc(0,0,e.w/2,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = flash?'#fff':'rgba(191,0,255,0.6)';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(0,0,e.w/2+5+Math.sin(Date.now()/200)*3,0,Math.PI*2);
    ctx.stroke();
  } else if(e.name==='tank') {
    ctx.beginPath();
    ctx.rect(-e.w/2,-e.h/2,e.w,e.h);
    ctx.fill();
    ctx.strokeStyle=flash?'#fff':'rgba(0,255,136,0.5)';
    ctx.lineWidth=2;
    ctx.strokeRect(-e.w/2,-e.h/2,e.w,e.h);
  }
 
  // HP bar
  if(e.hp < e.maxHp) {
    const bw=e.w+8, bh=3;
    ctx.fillStyle='rgba(255,0,0,0.4)';
    ctx.fillRect(-bw/2,-e.h/2-8,bw,bh);
    ctx.fillStyle='#ff006e';
    ctx.fillRect(-bw/2,-e.h/2-8,bw*(e.hp/e.maxHp),bh);
  }
 
  ctx.shadowBlur=0;
  ctx.restore();
}
 
function drawBoss() {
  if(!boss) return;
  const b=boss;
  ctx.save();
  ctx.translate(b.x, b.y);
  b.angle += 0.02;
 
  const flash = b.flashTimer>0 ? 1 : 0;
  ctx.shadowColor = flash?'#fff':'rgba(255,0,110,0.8)';
  ctx.shadowBlur = flash?40:25;
 
  // Outer ring
  ctx.strokeStyle = flash?'#fff':'rgba(255,0,110,0.6)';
  ctx.lineWidth=2;
  for(let i=0;i<3;i++) {
    ctx.save();
    ctx.rotate(b.angle*(i%2?1:-1));
    ctx.beginPath();
    ctx.arc(0,0,b.w/2+8+i*10,0,Math.PI*2);
    ctx.setLineDash([10+i*5,6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
 
  // Core body
  const col = flash?'#ffffff':'#ff006e';
  ctx.fillStyle=col;
  ctx.beginPath();
  for(let i=0;i<8;i++) {
    const a=b.angle+i*Math.PI/4;
    const r = i%2===0 ? b.w/2 : b.w/3;
    if(i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
    else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
  }
  ctx.closePath();
  ctx.fill();
 
  // Core eye
  ctx.fillStyle='#fff';
  ctx.beginPath();
  ctx.arc(0,0,12,0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#ff006e';
  ctx.beginPath();
  ctx.arc(0,0,8,0,Math.PI*2);
  ctx.fill();
 
  ctx.shadowBlur=0;
  ctx.restore();
}
 
function drawBullets() {
  bullets.forEach(b=>{
    ctx.save();
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = b.color;
    // Void lance: long beam
    if(b.weapon===2) {
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.rotate(Math.atan2(b.vy,b.vx));
      ctx.fillRect(-12,-2,24,4);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.ellipse(b.x,b.y,b.r,b.r*2.5,Math.atan2(b.vy,b.vx)+Math.PI/2,0,Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur=0;
    ctx.restore();
  });
}
 
function drawEnemyBullets() {
  enemyBullets.forEach(b=>{
    ctx.save();
    ctx.shadowColor=b.color||'#ff6b00';
    ctx.shadowBlur=10;
    ctx.fillStyle=b.color||'#ff6b00';
    ctx.beginPath();
    ctx.arc(b.x,b.y,4,0,Math.PI*2);
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();
  });
}
 
function drawParticles() {
  particles.forEach(p=>{
    const t=p.life/p.maxLife;
    ctx.globalAlpha=t*0.9;
    ctx.fillStyle=p.color;
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate(p.rot);
    const s=p.size*t;
    if(p.type==='circle') {
      ctx.beginPath(); ctx.arc(0,0,s,0,Math.PI*2); ctx.fill();
    } else {
      ctx.fillRect(-s/2,-s/2,s,s);
    }
    ctx.restore();
  });
  ctx.globalAlpha=1;
}
 
function drawPowerups() {
  powerups.forEach(p=>{
    p.anim++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor=p.color;
    ctx.shadowBlur=18;
    const pulse=Math.sin(p.anim*0.1)*3;
    ctx.strokeStyle=p.color;
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(0,0,10+pulse,0,Math.PI*2);
    ctx.stroke();
    ctx.fillStyle=p.color;
    // Icon
    ctx.font='bold 12px Orbitron';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(p.type==='shield'?'S':p.type==='health'?'H':'W', 0, 0);
    ctx.shadowBlur=0;
    ctx.restore();
  });
}
 
// ──────────────────────────────────────────
//  UPDATE FUNCTIONS
// ──────────────────────────────────────────
function updatePlayer() {
  if(player.invincible>0) player.invincible--;
 
  // Trail
  player.trail.push({x:player.x, y:player.y});
  if(player.trail.length>12) player.trail.shift();
 
  // Move
  let dx=0, dy=0;
  if(keys['ArrowLeft']||keys['a']||keys['A']) dx=-1;
  if(keys['ArrowRight']||keys['d']||keys['D']) dx=1;
  if(keys['ArrowUp']||keys['w']||keys['W']) dy=-1;
  if(keys['ArrowDown']||keys['s']||keys['S']) dy=1;
 
  if(dx&&dy) { dx*=0.707; dy*=0.707; }
 
  player.x = Math.max(player.w/2, Math.min(W-player.w/2, player.x+dx*player.speed));
  player.y = Math.max(player.h/2, Math.min(H-player.h/2, player.y+dy*player.speed));
 
  // Shield regen
  if(player.shield < player.maxShield) player.shield = Math.min(player.maxShield, player.shield+player.shieldRegen);
 
  // Shoot
  if((keys[' ']||shooting) && shootCooldown<=0) fireBullet();
  if(shootCooldown>0) shootCooldown--;
 
  // Weapon switch
  if(keys['1']) setWeapon(0);
  if(keys['2']) setWeapon(1);
  if(keys['3']) setWeapon(2);
}
 
function updateEnemies() {
  // Spawn
  if(!bossPhase) {
    spawnTimer++;
    if(spawnTimer >= spawnInterval) {
      if(waveEnemies < waveTotal) {
        spawnEnemy();
        spawnTimer = 0;
        spawnInterval = Math.max(30, 120 - wave*8);
      } else if(enemies.length===0 && !boss) {
        // Check if boss wave
        if(wave%3===0) {
          spawnBoss();
        } else {
          nextWave();
        }
      }
    }
  }
 
  enemies.forEach((e,i) => {
    if(e.flashTimer>0) e.flashTimer--;
 
    // Movement
    if(e.moveType==='straight') {
      e.y += e.speed;
    } else if(e.moveType==='zigzag') {
      e.y += e.speed;
      e.zigTimer++;
      if(e.zigTimer>40) { e.zigDir*=-1; e.zigTimer=0; }
      e.x += e.zigDir*e.speed*1.5;
      e.x = Math.max(30,Math.min(W-30,e.x));
    } else if(e.moveType==='hover') {
      if(!e.reached) {
        e.y += e.speed*2;
        if(e.y >= e.hoverY) { e.y=e.hoverY; e.reached=true; }
      } else {
        e.x += Math.sin(Date.now()/800)*1.5;
      }
    }
 
    // Shoot
    if(e.shootRate > 0 && e.reached) {
      e.shootTimer++;
      if(e.shootTimer >= e.shootRate) {
        e.shootTimer=0;
        const dx=player.x-e.x, dy=player.y-e.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        enemyBullets.push({
          x:e.x, y:e.y,
          vx:(dx/dist)*e.shootSpeed,
          vy:(dy/dist)*e.shootSpeed,
          damage:e.shootDmg,
          life:120,
          color: e.color
        });
      }
    }
 
    // Off screen
    if(e.y > H+50) enemies.splice(i,1);
  });
}
 
function updateBoss() {
  if(!boss) return;
  if(boss.flashTimer>0) boss.flashTimer--;
 
  // Move to target
  const dx=boss.targetX-boss.x, dy=boss.targetY-boss.y;
  const dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>5) {
    boss.x+=dx/dist*boss.speed;
    boss.y+=dy/dist*boss.speed;
  } else {
    boss.moveTimer++;
    if(boss.moveTimer>100) {
      boss.moveTimer=0;
      boss.targetX=100+Math.random()*(W-200);
      boss.targetY=60+Math.random()*150;
    }
  }
 
  // Shoot patterns
  boss.shootTimer++;
  const rate = boss.phase===1 ? 30 : 18;
  if(boss.shootTimer>=rate) {
    boss.shootTimer=0;
    if(boss.phase===1) {
      // Aimed shot
      const dx2=player.x-boss.x, dy2=player.y-boss.y;
      const d=Math.sqrt(dx2*dx2+dy2*dy2);
      enemyBullets.push({x:boss.x,y:boss.y,vx:dx2/d*5,vy:dy2/d*5,damage:20,life:150,color:'#ff006e'});
    } else {
      // Spread
      for(let i=0;i<8;i++) {
        const a=i*Math.PI/4+boss.angle;
        enemyBullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*4,vy:Math.sin(a)*4,damage:15,life:150,color:'#ff00aa'});
      }
    }
    // Rift particles
    spawnParticles(boss.x,boss.y,'#bf00ff',3,2,20,2);
  }
 
  // Phase 2
  if(boss.hp < boss.maxHp*0.4 && boss.phase===1) {
    boss.phase=2;
    boss.speed*=1.5;
    shakeScreen(15,30);
    spawnParticles(boss.x,boss.y,'#ff006e',30,8,60,4);
  }
}
 
function updateBullets() {
  bullets.forEach((b,i) => {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.y<-20||b.x<-20||b.x>W+20) { bullets.splice(i,1); return; }
 
    // Hit enemies
    enemies.forEach((e,j) => {
      if(circleRect(b.x,b.y,b.r,e.x,e.y,e.w,e.h)) {
        e.hp -= b.damage;
        e.flashTimer=5;
        bullets.splice(i,1);
        spawnParticles(b.x,b.y,b.color,5,3,20,2);
        if(e.hp<=0) {
          kills++;
          comboCount++;
          comboTimer=120;
          maxCombo=Math.max(maxCombo,comboCount);
          const mul = Math.min(comboCount,8);
          score += e.score*mul;
          if(e.reward==='shield') spawnPowerup(e.x,e.y,'shield');
          if(e.reward==='weapon') spawnPowerup(e.x,e.y,'weapon');
          else if(Math.random()<0.12) spawnPowerup(e.x,e.y,'health');
          spawnExplosion(e.x,e.y,e.name==='tank'?2:1);
          floatText(e.x, e.y, `+${e.score*mul}`, e.score>200?'#ffcc00':'#00f5ff');
          enemies.splice(j,1);
        }
      }
    });
 
    // Hit boss
    if(boss) {
      if(circleRect(b.x,b.y,b.r,boss.x,boss.y,boss.w,boss.h)) {
        boss.hp -= b.damage;
        boss.flashTimer=4;
        bullets.splice(i,1);
        spawnParticles(b.x,b.y,b.color,3,2,15,2);
        if(boss.hp<=0) {
          score += 5000*(wave);
          spawnExplosion(boss.x,boss.y,3);
          spawnRiftParticles(boss.x,boss.y);
          boss=null; bossPhase=false;
          document.getElementById('boss-bar-container').style.display='none';
          nextWave();
        }
      }
    }
  });
}
 
function updateEnemyBullets() {
  enemyBullets.forEach((b,i)=>{
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.y>H+20) { enemyBullets.splice(i,1); return; }
    if(circleRect(b.x,b.y,4,player.x,player.y,player.w,player.h)) {
      enemyBullets.splice(i,1);
      hurtPlayer(b.damage);
    }
  });
}
 
function updatePowerups() {
  powerups.forEach((p,i)=>{
    p.y+=p.vy; p.life--;
    if(p.life<=0||p.y>H+30) { powerups.splice(i,1); return; }
    if(circleRect(player.x,player.y,28,p.x,p.y,24,24)) {
      powerups.splice(i,1);
      if(p.type==='shield') {
        player.shield=Math.min(player.maxShield,player.shield+60);
        floatText(p.x,p.y,'SHIELD +60','#00f5ff');
      } else if(p.type==='health') {
        player.hp=Math.min(player.maxHp,player.hp+30);
        floatText(p.x,p.y,'HULL +30','#ff006e');
      } else {
        const nw=(currentWeapon+1)%WEAPONS.length;
        setWeapon(nw);
        floatText(p.x,p.y,'WEAPON UP','#ffcc00');
      }
    }
  });
}
 
function updateParticles() {
  particles.forEach((p,i)=>{
    p.x+=p.vx; p.y+=p.vy;
    p.vx*=0.96; p.vy*=0.96;
    p.rot+=p.rotV;
    p.life--;
    if(p.life<=0) particles.splice(i,1);
  });
}
 
function updateStars() {
  stars.forEach(s=>{
    s.y+=s.sp;
    if(s.y>H+5) { s.y=-5; s.x=Math.random()*W; }
  });
}
 
function hurtPlayer(dmg) {
  if(player.invincible>0) return;
  if(player.shield>0) {
    const absorbed=Math.min(player.shield,dmg);
    player.shield-=absorbed;
    dmg-=absorbed;
    shakeScreen(4,10);
    // Shield flash
    flashOverlay('rgba(0,245,255,0.12)',100);
  }
  if(dmg>0) {
    player.hp-=dmg;
    player.invincible=45;
    shakeScreen(8,20);
    flashOverlay('rgba(255,0,50,0.2)',150);
    spawnParticles(player.x,player.y,'#ff006e',8,4,25,3);
    if(player.hp<=0) { player.hp=0; gameOver(); }
  }
}
 
function flashOverlay(color,dur) {
  const el=document.getElementById('flash-overlay');
  el.style.background=color;
  el.style.opacity='1';
  setTimeout(()=>{el.style.transition=`opacity ${dur}ms`;el.style.opacity='0';},50);
}
 
function nextWave() {
  wave++;
  waveEnemies=0;
  waveTotal=8+wave*3;
  spawnInterval=Math.max(30,120-wave*8);
  spawnTimer=0;
  comboCount=0;
  flashOverlay('rgba(0,245,255,0.1)',500);
  floatText(W/2,H/2-30,`WAVE ${wave}`,'#00f5ff');
}
 
function updateCombo() {
  if(comboTimer>0) { comboTimer--; if(comboTimer===0) comboCount=0; }
}
 
// ──────────────────────────────────────────
//  MAIN LOOP
// ──────────────────────────────────────────
function gameLoop(ts) {
  delta = Math.min((ts-lastTime)/16.67, 3);
  lastTime=ts;
 
  // Screen shake
  if(screenShake.dur>0) {
    screenShake.x=(Math.random()-0.5)*screenShake.mag;
    screenShake.y=(Math.random()-0.5)*screenShake.mag;
    screenShake.dur--;
    screenShake.mag*=0.88;
  } else { screenShake.x=0; screenShake.y=0; }
 
  ctx.save();
  ctx.translate(screenShake.x, screenShake.y);
 
  // Clear
  ctx.clearRect(-20,-20,W+40,H+40);
  ctx.fillStyle='#000';
  ctx.fillRect(-20,-20,W+40,H+40);
 
  // Background
  drawGrid();
  drawStars();
 
  // Game objects
  drawParticles();
  drawPowerups();
  drawBullets();
  drawEnemyBullets();
  enemies.forEach(drawEnemy);
  drawBoss();
  drawPlayer();
 
  ctx.restore();
 
  // Updates
  updatePlayer();
  updateStars();
  updateEnemies();
  updateBoss();
  updateBullets();
  updateEnemyBullets();
  updatePowerups();
  updateParticles();
  updateCombo();
 
  // HUD
  updateHUD();
 
  if(state==='playing') frameId=requestAnimationFrame(gameLoop);
}
 
// ──────────────────────────────────────────
//  GAME OVER / START
// ──────────────────────────────────────────
function gameOver() {
  state='over';
  cancelAnimationFrame(frameId);
  document.getElementById('final-score').textContent=String(score).padStart(6,'0');
  document.getElementById('stat-wave').textContent=`SURVIVED ${wave-1} WAVE${wave>2?'S':''}`;
  document.getElementById('stat-kills').textContent=`${kills} VOID ENTITIES DESTROYED`;
  document.getElementById('stat-combo').textContent=`MAX COMBO × ${maxCombo}`;
  document.getElementById('gameover-screen').style.display='flex';
}
 
function startGame() {
  document.getElementById('start-screen').style.display='none';
  document.getElementById('gameover-screen').style.display='none';
  initGame();
  state='playing';
  lastTime=performance.now();
  frameId=requestAnimationFrame(gameLoop);
}
 
// ──────────────────────────────────────────
//  EVENT LISTENERS
// ──────────────────────────────────────────
document.addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(e.key===' ') e.preventDefault();
});
document.addEventListener('keyup',e=>{ keys[e.key]=false; });
 
canvas.addEventListener('mousedown',e=>{ shooting=true; e.preventDefault(); });
canvas.addEventListener('mouseup',()=>shooting=false);
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouseX=e.clientX-r.left; mouseY=e.clientY-r.top;
});
 
canvas.addEventListener('touchstart',e=>{ shooting=true; e.preventDefault(); },{passive:false});
canvas.addEventListener('touchend',()=>shooting=false);
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  const t=e.touches[0];
  player.x=t.clientX-r.left;
  player.y=t.clientY-r.top;
},{passive:false});
 
document.getElementById('btn-start').addEventListener('click',startGame);
document.getElementById('btn-restart').addEventListener('click',startGame);
