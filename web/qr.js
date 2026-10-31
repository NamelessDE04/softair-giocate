/* Generatore QR Code (modalità byte, UTF-8) — nessuna dipendenza esterna.
   Uso: var m = QR.encode("testo", "M");  -> { size, get(x,y) } */
(function (root) {
  'use strict';

  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, ecl) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var root = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  function encode(text, ecl) {
    ecl = ecl || 'M';
    var bytes = utf8(text);
    var ver, cap;
    for (ver = 1; ver <= 40; ver++) {
      cap = dataCodewords(ver, ecl) * 8;
      var ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error('Testo troppo lungo per un QR');
    var ccb = ver <= 9 ? 8 : 16;

    // --- bit stream
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, ccb);
    bytes.forEach(function (b) { push(b, 8); });
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    // --- ECC + interleave
    var nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - rawCw % nb;
    var shortLen = Math.floor(rawCw / nb);
    var div = rsDivisor(eccLen);
    var blocks = [], k = 0;
    for (var b = 0; b < nb; b++) {
      var dl = shortLen - eccLen + (b < nShort ? 0 : 1);
      var dat = data.slice(k, k + dl);
      k += dl;
      var ecc = rsRemainder(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var final = [];
    for (var c = 0; c < blocks[0].length; c++) {
      for (var bb = 0; bb < blocks.length; bb++) {
        if (c !== shortLen - eccLen || bb >= nShort) final.push(blocks[bb][c]);
      }
    }

    // --- matrix
    var size = ver * 4 + 17;
    var mod = [], fn = [];
    for (var y = 0; y < size; y++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    function setF(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    for (var t = 0; t < size; t++) { setF(6, t, t % 2 === 0); setF(t, 6, t % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    var align = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2;
      var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      align = [6];
      for (var p = size - 7; align.length < na; p -= step) align.splice(1, 0, p);
    }
    for (var ai = 0; ai < align.length; ai++) for (var aj = 0; aj < align.length; aj++) {
      var last = align.length - 1;
      if ((ai === 0 && aj === 0) || (ai === 0 && aj === last) || (ai === last && aj === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        setF(align[ai] + dx2, align[aj] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }

    function formatBits(mask) {
      var d = (FORMAT_BITS[ecl] << 3) | mask, rem = d;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bitsF = ((d << 10) | rem) ^ 0x5412;
      function g(i) { return ((bitsF >>> i) & 1) !== 0; }
      for (var a = 0; a <= 5; a++) setF(8, a, g(a));
      setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
      for (var a2 = 9; a2 < 15; a2++) setF(14 - a2, 8, g(a2));
      for (var a3 = 0; a3 < 8; a3++) setF(size - 1 - a3, 8, g(a3));
      for (var a4 = 8; a4 < 15; a4++) setF(8, size - 15 + a4, g(a4));
      setF(8, size - 8, true);
    }
    formatBits(0);

    if (ver >= 7) {
      var rv = ver;
      for (var q = 0; q < 12; q++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var vb = (ver << 12) | rv;
      for (var vi = 0; vi < 18; vi++) {
        var bit = ((vb >>> vi) & 1) !== 0, va = size - 11 + vi % 3, vbb = Math.floor(vi / 3);
        setF(va, vbb, bit); setF(vbb, va, bit);
      }
    }

    // codewords
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var jj = 0; jj < 2; jj++) {
        var x = right - jj, up = ((right + 1) & 2) === 0, yy2 = up ? size - 1 - vert : vert;
        if (!fn[yy2][x] && idx < final.length * 8) {
          mod[yy2][x] = ((final[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
          idx++;
        }
      }
    }

    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
        if (!fn[y][x] && maskFn(m, x, y)) mod[y][x] = !mod[y][x];
    }
    function penalty() {
      var pen = 0, dark = 0;
      function lineScore(get) {
        var s = 0;
        for (var a = 0; a < size; a++) {
          var run = 1;
          for (var b = 1; b < size; b++) {
            if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
            else run = 1;
          }
          for (var b2 = 0; b2 + 10 < size; b2++) {
            var pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], ok1 = true, ok2 = true;
            for (var z = 0; z < 11; z++) {
              var v = get(a, b2 + z) ? 1 : 0;
              if (v !== pat[z]) ok1 = false;
              if (v !== pat[10 - z]) ok2 = false;
            }
            if (ok1) s += 40;
            if (ok2) s += 40;
          }
        }
        return s;
      }
      pen += lineScore(function (r, c) { return mod[r][c]; });
      pen += lineScore(function (c, r) { return mod[r][c]; });
      for (var y = 0; y < size - 1; y++) for (var x = 0; x < size - 1; x++) {
        var cc = mod[y][x];
        if (cc === mod[y][x + 1] && cc === mod[y + 1][x] && cc === mod[y + 1][x + 1]) pen += 3;
      }
      for (var y2 = 0; y2 < size; y2++) for (var x2 = 0; x2 < size; x2++) if (mod[y2][x2]) dark++;
      var total = size * size;
      pen += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return pen;
    }
    var best = 0, bestPen = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var pp = penalty();
      if (pp < bestPen) { bestPen = pp; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);

    return {
      size: size,
      version: ver,
      get: function (x, y) { return x >= 0 && x < size && y >= 0 && y < size && mod[y][x]; }
    };
  }

  root.QR = { encode: encode };
  if (typeof module !== 'undefined') module.exports = root.QR;
})(typeof window !== 'undefined' ? window : globalThis);
