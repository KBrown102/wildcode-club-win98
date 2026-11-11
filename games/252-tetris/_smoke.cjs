// 252-tetris 烟测：vm 沙箱桩 DOM/Canvas/Audio，加载 index.html 内联脚本，跑逻辑断言。
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){ console.error('找不到 <script>'); process.exit(1); }
const code=m[1];

const noop=function(){};
const ctxStub=new Proxy({}, { get(t,p){ return (p in t)?t[p]:noop; }, set(){ return true; } });
const fakeCanvas={ style:{}, width:0, height:0, getContext:()=>ctxStub,
  addEventListener:noop, getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}) };
const storage={ _m:{}, getItem(k){ return (k in this._m)?this._m[k]:null; }, setItem(k,v){ this._m[k]=String(v); } };

function AudioCtx(){
  this.currentTime=0;
  this.destination={};
  this.createOscillator=()=>({type:'',frequency:{value:0},connect:noop,start:noop,stop:noop});
  this.createGain=()=>({gain:{value:0,setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop});
}
const windowStub={ innerWidth:480, innerHeight:800, devicePixelRatio:2,
  addEventListener:noop, AudioContext:AudioCtx, webkitAudioContext:AudioCtx };

const sandbox={
  window:windowStub,
  document:{ getElementById:()=>fakeCanvas, addEventListener:noop },
  location:{ hash:"" },
  localStorage:storage,
  requestAnimationFrame:noop,
  setInterval:noop, setTimeout:noop,
  console:console
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, {filename:'game.js'});
const G=sandbox.window.__GAME;

let pass=0, fail=0;
function ok(name,cond){ if(cond){pass++; console.log('  ✓ '+name);} else {fail++; console.log('  ✗ '+name);} }

// 1. 钩子存在
ok('window.__GAME 存在', typeof G==='object');

// 2. 初始为菜单态
ok('初始 phase=menu', G.getState().phase==='menu');

// 3. 启动
G.start();
let s=G.getState();
ok('start 后 phase=play', s.phase==='play');
ok('start 后有当前块', !!s.current);
ok('start 后无已落方块', s.filled===0);
ok('有下一个预览', !!s.next);

// 4. 移动不出界
G.spawnType('I');
for(let i=0;i<30;i++) G.moveLeft();
s=G.getState();
// I 在 x 轴上的最小格偏移为 0（state0: x=0..3）
ok('左移后不越左界 (x>=0)', s.current.x>=0);
for(let i=0;i<30;i++) G.moveRight();
s=G.getState();
ok('右移后不越右界 (x<=6)', s.current.x<=6);

// 5. 旋转 4 次回到原态
G.spawnType('T');
let r0=G.getState().current.rot;
G.rotate(1); G.rotate(1); G.rotate(1); G.rotate(1);
ok('旋转 4 次回到原 rot', G.getState().current.rot===r0);

// 6. 硬降落子
G.start();
let before=G.getState().filled;
G.hardDrop();
s=G.getState();
ok('硬降后落子 4 格', s.filled===before+4);
ok('硬降后仍在 play', s.phase==='play');
ok('硬降后生成新块', !!s.current);

// 7. 真实 lock + 消行计分
G.start();
const R=19;
for(let c=0;c<10;c++) if(c>1) G.setCell(R,c,1);   // 底行除 0,1 列外填满
G.spawnType('O');
G.setCurrent({x:0,y:18});
G.lockCurrent();
s=G.getState();
ok('真实落子触发消行 (lines=1)', s.lines===1);
ok('消行后顶部空', s.board[0].every(v=>v===0));
ok('消行得分 > 0', s.score>0);

// 8. clearLines 逻辑
G.start();
let r=G.forceLineClearTest();
ok('forceLineClearTest 清 1 行', r.cleared===1);
ok('forceLineClearTest 后 lines=1', r.lines===1);
ok('forceLineClearTest 后顶部空', r.topEmpty);

// 9. 重力 tick 下移
G.start();
let y0=G.getState().current.y;
G.tick(900);                 // > 默认 dropInterval(800)
let y1=G.getState().current.y;
ok('重力 tick 使方块下移', y1>y0);

// 10. 暂存 hold（一回合只能一次）
G.start();
let cur=G.getState().current.type;
G.hold();
let h1=G.getState().hold;
ok('hold 后暂存位有值', h1===cur);
G.hold();                    // 二次应无效
ok('一回合内不能二次 hold（暂存不变）', G.getState().hold===h1);

// 11. 7-bag 分布：连续 7 个生成互不相同
G.start();
let types=[];
for(let i=0;i<7;i++){ types.push(G.getState().current.type); G.hardDrop(); }
ok('7-bag：连续 7 块各不相同', new Set(types).size===7);

// 12. 随机自动游玩 60 步无异常、棋盘合法
G.start();
let crashed=false;
try{ for(let i=0;i<60;i++){ G.autoStep(); } }catch(e){ crashed=true; console.log('  ! 异常: '+e.message); }
s=G.getState();
let legal=true;
for(let r2=0;r2<20;r2++) for(let c=0;c<10;c++){ const v=s.board[r2][c]; if(!(v>=0&&v<=7)) legal=false; }
ok('随机自动游玩 60 步不崩溃', !crashed);
ok('棋盘数值合法 (0-7)', legal);
ok('随机游玩后处于 play 或 over', s.phase==='play'||s.phase==='over');

// 13. 顶部封死 → game over + 最佳分持久化
G.start();
for(let i=0;i<3;i++) G.hardDrop();        // 攒点分
let sc=G.getState().score;
G.fillTopRows(3);
G.spawnType('I');                          // 出生即碰撞
s=G.getState();
ok('顶部封死触发 game over', s.phase==='over' && s.over===true);
ok('game over 后最佳分 >= 本局分', s.best>=sc);
ok('最佳分写入 localStorage', storage.getItem('tetris_best')!==null);

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
