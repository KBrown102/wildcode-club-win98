/**
 * game.js —— 《引光 · 一镜明》纯逻辑核心（零依赖、UMD：浏览器与 Node 双可用）
 * ============================================================================
 * 玩法：光束迷宫。光源朝固定方向射出光束，玩家在空格放置/旋转镜面（'/' 或 '\'），
 * 把光束引导到沉睡的目标，目标被点亮即过关。零失败零惩罚：随时重置/拾回/提示。
 * 视觉约定：HIROSTOPTIME 暗场留白 × 朱柿 #C4553B 唯一暖点（目标被点亮时），
 * 光束本身为冷调（青白）。
 *
 * 本文件不含任何 DOM / window 引用（除 UMD 包装），可在 Node 直接 require 跑冒烟。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define(factory);
  else root.GameModule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // —— 方向向量与镜面反射表 ——
  // '/' : 右→上、上→右、左→下、下→左
  // '\\': 右→下、下→右、左→上、上→左
  var DIR = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  var REFLECT = {
    '/': { U: 'R', R: 'U', D: 'L', L: 'D' },
    '\\': { U: 'L', L: 'U', D: 'R', R: 'D' }
  };

  function key(c, r) { return c + ',' + r; }

  // —— 光束追踪：给定 movable（玩家镜面 Map）返回路径与是否点亮 ——
  function beamPath(level, movable) {
    var cols = level.cols, rows = level.rows;
    var wall = {};
    level.walls.forEach(function (w) { wall[key(w.c, w.r)] = 1; });
    var fixed = {};
    level.fixed.forEach(function (f) { fixed[key(f.c, f.r)] = f.o; });

    var c = level.source.c, r = level.source.r, dir = level.source.dir;
    var path = [{ c: c, r: r }];
    var visited = {};
    var lit = false, ended = 'exit', guard = 0;
    while (guard++ < 4000) {
      var nc = c + DIR[dir][0], nr = r + DIR[dir][1];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) { ended = 'exit'; break; }
      if (level.target.c === nc && level.target.r === nr) {
        path.push({ c: nc, r: nr }); lit = true; ended = 'target'; break;
      }
      if (wall[key(nc, nr)]) { path.push({ c: nc, r: nr }); ended = 'wall'; break; }
      var o = movable[key(nc, nr)] || fixed[key(nc, nr)];
      if (o) {
        dir = REFLECT[o][dir];
        path.push({ c: nc, r: nr });
        c = nc; r = nr;
        var vk = c + ',' + r + ',' + dir;
        if (visited[vk]) { ended = 'loop'; break; }
        visited[vk] = 1;
        continue;
      }
      path.push({ c: nc, r: nr });
      c = nc; r = nr;
      var vk2 = c + ',' + r + ',' + dir;
      if (visited[vk2]) { ended = 'loop'; break; }
      visited[vk2] = 1;
    }
    return { path: path, lit: lit, ended: ended };
  }

  // —— 求解器：DFS 沿光束单路径搜索，返回最少镜面方案 ——
  // 返回 { ok, placements:[{c,r,o}], used } 或 { ok:false }
  function solve(level, maxBudget) {
    var cols = level.cols, rows = level.rows;
    var tc = level.target.c, tr = level.target.r;
    var wall = {};
    level.walls.forEach(function (w) { wall[key(w.c, w.r)] = 1; });
    var fixed = {};
    level.fixed.forEach(function (f) { fixed[key(f.c, f.r)] = f.o; });
    var cap = { n: 0 };

    function rec(c, r, dir, budget, placedMap, list, visited) {
      if (cap.n > 300000) return null;
      cap.n++;
      var nk = c + ',' + r + ',' + dir;
      if (visited[nk]) return null;
      visited[nk] = 1;
      var nc = c + DIR[dir][0], nr = r + DIR[dir][1];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) { delete visited[nk]; return null; }
      if (tc === nc && tr === nr) { delete visited[nk]; return list.slice(); }
      if (wall[key(nc, nr)]) { delete visited[nk]; return null; }
      var o = placedMap[key(nc, nr)] || fixed[key(nc, nr)];
      if (o) {
        var nd = REFLECT[o][dir];
        var res = rec(nc, nr, nd, budget, placedMap, list, visited);
        delete visited[nk]; return res;
      }
      // 空格：① 直行（不放置）
      var resS = rec(nc, nr, dir, budget, placedMap, list, visited);
      if (resS) { delete visited[nk]; return resS; }
      // ② 放置 '/'
      if (budget > 0) {
        var pm1 = Object.assign({}, placedMap); pm1[key(nc, nr)] = '/';
        var resA = rec(nc, nr, REFLECT['/'][dir], budget - 1, pm1, list.concat([{ c: nc, r: nr, o: '/' }]), visited);
        if (resA) { delete visited[nk]; return resA; }
        // ③ 放置 '\\'
        var pm2 = Object.assign({}, placedMap); pm2[key(nc, nr)] = '\\';
        var resB = rec(nc, nr, REFLECT['\\'][dir], budget - 1, pm2, list.concat([{ c: nc, r: nr, o: '\\' }]), visited);
        if (resB) { delete visited[nk]; return resB; }
      }
      delete visited[nk]; return null;
    }

    for (var b = 0; b <= maxBudget; b++) {
      var sol = rec(level.source.c, level.source.r, level.source.dir, b, {}, [], {});
      if (sol) return { ok: true, placements: sol, used: sol.length };
    }
    return { ok: false };
  }

  // —— 关卡数据 ——
  // 坐标系：(c=列, r=行)，(0,0) 左上。dir ∈ U/D/L/R。
  function L(o) { return o; }
  var LEVELS = [
    // 1 · 单镜入门：横射，落点下方有目标，转一次
    L({ cols: 7, rows: 7, source: { c: 0, r: 1, dir: 'R' }, target: { c: 5, r: 5 },
        walls: [], fixed: [], budget: 4 }),
    // 2 · 双镜 Z 形
    L({ cols: 7, rows: 7, source: { c: 0, r: 0, dir: 'R' }, target: { c: 0, r: 6 },
        walls: [], fixed: [], budget: 5 }),
    // 3 · 引入固定镜（石镜），借力一次（仍需玩家放 1 面）
    L({ cols: 7, rows: 7, source: { c: 0, r: 6, dir: 'R' }, target: { c: 0, r: 0 },
        walls: [], fixed: [{ c: 6, r: 6, o: '/' }], budget: 5 }),
    // 4 · 墙的阻挡，需绕行
    L({ cols: 8, rows: 7, source: { c: 0, r: 0, dir: 'R' }, target: { c: 7, r: 6 },
        walls: [{ c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 4, r: 3 }],
        fixed: [], budget: 6 }),
    // 5 · 三镜回环
    L({ cols: 8, rows: 8, source: { c: 0, r: 0, dir: 'D' }, target: { c: 7, r: 7 },
        walls: [], fixed: [], budget: 6 }),
    // 6 · 石镜借力 + 墙构成的角落（仍需玩家放 1 面）
    L({ cols: 8, rows: 8, source: { c: 0, r: 7, dir: 'R' }, target: { c: 0, r: 0 },
        walls: [{ c: 3, r: 3 }, { c: 4, r: 3 }, { c: 3, r: 4 }, { c: 4, r: 4 }],
        fixed: [{ c: 7, r: 7, o: '/' }], budget: 6 }),
    // 7 · 墙挡中路，需上绕（3 镜 S 形）
    L({ cols: 9, rows: 7, source: { c: 0, r: 3, dir: 'R' }, target: { c: 8, r: 3 },
        walls: [{ c: 4, r: 2 }, { c: 4, r: 3 }, { c: 5, r: 2 }, { c: 5, r: 3 }],
        fixed: [], budget: 6 }),
    // 8 · 四镜大回折
    L({ cols: 9, rows: 9, source: { c: 0, r: 0, dir: 'R' }, target: { c: 0, r: 8 },
        walls: [], fixed: [{ c: 8, r: 0, o: '\\' }], budget: 7 }),
    // 9 · 交错石镜阵
    L({ cols: 9, rows: 9, source: { c: 0, r: 4, dir: 'R' }, target: { c: 8, r: 4 },
        walls: [{ c: 4, r: 1 }, { c: 4, r: 2 }, { c: 4, r: 6 }, { c: 4, r: 7 }],
        fixed: [{ c: 2, r: 4, o: '\\' }, { c: 6, r: 4, o: '/' }], budget: 6 }),
    // 10 · 螺旋向导
    L({ cols: 9, rows: 9, source: { c: 0, r: 0, dir: 'D' }, target: { c: 8, r: 8 },
        walls: [{ c: 2, r: 2 }, { c: 3, r: 2 }, { c: 4, r: 2 }, { c: 5, r: 2 }, { c: 6, r: 2 },
                { c: 2, r: 6 }, { c: 3, r: 6 }, { c: 4, r: 6 }, { c: 5, r: 6 }, { c: 6, r: 6 }],
        fixed: [], budget: 8 }),
    // 11 · 镜与墙的密室
    L({ cols: 10, rows: 9, source: { c: 0, r: 0, dir: 'R' }, target: { c: 9, r: 8 },
        walls: [{ c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 4, r: 3 },
                { c: 5, r: 5 }, { c: 5, r: 6 }, { c: 5, r: 7 }, { c: 5, r: 8 }],
        fixed: [{ c: 9, r: 0, o: '\\' }, { c: 0, r: 8, o: '/' }], budget: 8 }),
    // 12 · 终章：光之庭
    L({ cols: 10, rows: 10, source: { c: 0, r: 5, dir: 'R' }, target: { c: 9, r: 5 },
        walls: [{ c: 3, r: 2 }, { c: 3, r: 3 }, { c: 3, r: 7 }, { c: 3, r: 8 },
                { c: 6, r: 2 }, { c: 6, r: 3 }, { c: 6, r: 7 }, { c: 6, r: 8 }],
        fixed: [{ c: 1, r: 5, o: '\\' }, { c: 8, r: 5, o: '/' }, { c: 5, r: 0, o: '\\' }], budget: 9 })
  ];

  // —— 游戏状态 ——
  function Game(levels) {
    this.levels = levels || LEVELS;
    this.index = 0;
    this.best = {};      // 由 UI 注入（localStorage）
    this.movable = {};   // "c,r" -> '/' | '\\'
    this.removeMode = false;
    this.won = false;
    this.hintUsed = 0;
    this.par = 0;
    this.level = null;
    this.beam = null;
    this.load(0);
  }
  Game.prototype.load = function (i) {
    this.index = Math.max(0, Math.min(this.levels.length - 1, i | 0));
    this.level = this.levels[this.index];
    this.movable = {};
    this.removeMode = false;
    this.won = false;
    this.hintUsed = 0;
    var s = solve(this.level, this.level.budget);
    this.par = s.ok ? s.used : 99;
    this.beam = beamPath(this.level, this.movable);
    return this;
  };
  Game.prototype.isOccupied = function (c, r) {
    var k = key(c, r);
    if (this.level.source.c === c && this.level.source.r === r) return true;
    if (this.level.target.c === c && this.level.target.r === r) return true;
    for (var i = 0; i < this.level.walls.length; i++)
      if (this.level.walls[i].c === c && this.level.walls[i].r === r) return true;
    return false;
  };
  Game.prototype.isFixed = function (c, r) {
    for (var i = 0; i < this.level.fixed.length; i++)
      if (this.level.fixed[i].c === c && this.level.fixed[i].r === r) return true;
    return false;
  };
  Game.prototype.place = function (c, r) {
    if (this.won) return false;
    if (this.isOccupied(c, r) || this.isFixed(c, r)) return false;
    var k = key(c, r);
    if (this.movable[k]) return false;
    if (Object.keys(this.movable).length >= this.level.budget) return false;
    this.movable[k] = '/';
    this.beam = beamPath(this.level, this.movable);
    this._checkWin();
    return true;
  };
  Game.prototype.rotate = function (c, r) {
    if (this.won) return false;
    var k = key(c, r);
    if (!this.movable[k]) return false;
    this.movable[k] = this.movable[k] === '/' ? '\\' : '/';
    this.beam = beamPath(this.level, this.movable);
    this._checkWin();
    return true;
  };
  Game.prototype.remove = function (c, r) {
    var k = key(c, r);
    if (!this.movable[k]) return false;
    delete this.movable[k];
    this.won = false;
    this.beam = beamPath(this.level, this.movable);
    return true;
  };
  Game.prototype.toggleRemove = function () { this.removeMode = !this.removeMode; return this.removeMode; };
  Game.prototype.reset = function () {
    this.movable = {}; this.won = false; this.removeMode = false;
    this.beam = beamPath(this.level, this.movable);
    return this;
  };
  Game.prototype._checkWin = function () {
    this.won = !!this.beam.lit;
    if (this.won) {
      var s = this.stars();
      var prev = this.best[this.index];
      if (!prev || s > prev) this.best[this.index] = s;
    }
  };
  Game.prototype.usedCount = function () { return Object.keys(this.movable).length; };
  Game.prototype.stars = function () {
    var u = this.usedCount();
    if (u <= this.par) return 3;
    if (u <= this.par + 1) return 2;
    return 1;
  };
  // 提示：取最优方案里第一个未正确放置的镜面，直接转正（安全垫）
  Game.prototype.hint = function () {
    if (this.won) return null;
    if (this.hintUsed >= 3) return null;
    var s = solve(this.level, this.level.budget);
    if (!s.ok) return null;
    for (var i = 0; i < s.placements.length; i++) {
      var p = s.placements[i], k = key(p.c, p.r);
      if (this.movable[k] !== p.o) {
        this.movable[k] = p.o;
        this.hintUsed++;
        this.beam = beamPath(this.level, this.movable);
        this._checkWin();
        return { c: p.c, r: p.r, o: p.o };
      }
    }
    return null;
  };
  // 自动求解（探针/截图用）：清空后按最优方案放置
  Game.prototype.autosolve = function () {
    var s = solve(this.level, this.level.budget);
    if (!s.ok) return false;
    this.movable = {};
    for (var i = 0; i < s.placements.length; i++) {
      var p = s.placements[i];
      this.movable[key(p.c, p.r)] = p.o;
    }
    this.beam = beamPath(this.level, this.movable);
    this._checkWin();
    return this.won;
  };

  return {
    DIR: DIR, REFLECT: REFLECT, beamPath: beamPath, solve: solve,
    LEVELS: LEVELS, Game: Game, key: key
  };
});
