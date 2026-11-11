// Smoke test harness for 325-windgap (headless, mocks browser env)
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT FOUND'); process.exit(1); }
const code = m[1];

// ---- mock ctx ----
function gradient(){ return { addColorStop(){} }; }
const ctx = {
  setTransform(){}, clearRect(){}, fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){},
  arc(){}, closePath(){}, fill(){}, stroke(){}, save(){}, restore(){}, translate(){},
  setLineDash(){}, createLinearGradient:gradient, createRadialGradient:gradient,
  fillStyle:'', strokeStyle:'', lineWidth:1, globalAlpha:1
};

function makeEl(){
  return {
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener(){}, removeEventListener(){},
    style:{}, textContent:'',
    getContext(){ return ctx; },
    width:0, height:0
  };
}
const els = {};
function getEl(id){ if(!els[id]) els[id]=makeEl(); return els[id]; }

global.window = {
  innerWidth:1080, innerHeight:1920, devicePixelRatio:3,
  addEventListener(){}, removeEventListener(){},
  AudioContext: function(){ return { state:'running', currentTime:0, destination:{},
    createGain(){ return { gain:{ value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }; },
    createOscillator(){ return { type:'', frequency:{value:0}, connect(){}, start(){}, stop(){} }; },
    resume(){} }; }
};
global.document = {
  getElementById(id){ return getEl(id); },
  querySelector(sel){ return getEl(sel); }
};
const store = {};
global.localStorage = {
  getItem(k){ return k in store ? store[k] : null; },
  setItem(k,v){ store[k]=String(v); }
};
global.requestAnimationFrame = function(){ return 0; }; // no auto-loop
global.cancelAnimationFrame = function(){};
global.setTimeout = global.setTimeout || function(){};

// run the game script
eval(code);

const G = global.window.__GAME;
if (!G) { console.error('FAIL: __GAME not exposed'); process.exit(1); }

let fails = 0;
function ok(cond, msg){ if(cond){ console.log('  PASS', msg); } else { console.log('  FAIL', msg); fails++; } }

// ---- Scenario A: simulate a "play" controller for full round ----
G.start();
let s = G.state();
ok(s && s.running, 'A1 start -> running');
let crashed=false, maxScore=0, hitSeen=false, sawShard=false, sawMote=false;
for (let i=0;i<ROUND_FRAMES()+30;i++){
  // simple controller: hold when below center, release when above
  const st=G.state();
  const orbY = st.orb.y;
  G.setHold(orbY > (132+708)/2 ? true : false);
  try { G.step(1/60); G.render(); } catch(e){ crashed=true; console.log('  CRASH', e.message); break; }
  const st2=G.state();
  if (st2.score>maxScore) maxScore=st2.score;
  if (st2.shards.length>0) sawShard=true;
  if (st2.motes.length>0) sawMote=true;
}
const afterA = G.state();
ok(!crashed, 'A2 no crash over full round');
ok(maxScore>0, 'A3 score accumulates while playing (max='+maxScore.toFixed(0)+')');
ok(sawMote, 'A4 motes spawned');
ok(sawShard, 'A5 shards spawned');
ok(afterA.over===true, 'A6 round ends -> over after timer');
ok(afterA.maxCombo>0, 'A7 combo built up (maxCombo='+afterA.maxCombo+')');

// ---- Scenario B: strict NO-OP (never touch) must score exactly 0 ----
G.start();
let crashedB=false;
for (let i=0;i<ROUND_FRAMES();i++){
  G.setHold(false);
  try { G.step(1/60); } catch(e){ crashedB=true; break; }
}
const noop = G.state();
ok(!crashedB, 'B1 noop no crash');
ok(Math.round(noop.score)===0, 'B2 noop score is EXACTLY 0 (got '+Math.round(noop.score)+')');
ok(noop.maxCombo===0, 'B3 noop combo 0');

// ---- Scenario C: best persists ----
ok(typeof G.getBest()==='number' && G.getBest()>=0, 'C1 best readable');

function ROUND_FRAMES(){ return 75*60; }

console.log(fails===0 ? '\nALL SMOKE TESTS PASSED' : '\n'+fails+' TEST(S) FAILED');
process.exit(fails===0?0:1);
