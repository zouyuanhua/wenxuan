/*
 * 六爻均以数组下标 0 为初爻（最下方）、5 为上爻（最上方）。
 * 卦序、上下卦与通称核对自《周易》原文及其索引：
 * https://zh.wikisource.org/wiki/周易
 * 八卦取象核对自《易传·说卦》：
 * https://zh.wikisource.org/zh-hans/周易/說卦
 * 三枚钱币的阴阳与动静完全采用本页面用户给定的规则。
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YaoGua = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // A trigram's bottom, middle, top lines are bits 0, 1, 2; yang = 1.
  var TRIGRAMS = [
    { name: "坤", nature: "地" },
    { name: "震", nature: "雷" },
    { name: "坎", nature: "水" },
    { name: "兑", nature: "泽" },
    { name: "艮", nature: "山" },
    { name: "离", nature: "火" },
    { name: "巽", nature: "风" },
    { name: "乾", nature: "天" }
  ];

  // King Wen order: [name, upper trigram, lower trigram].
  var KING_WEN = [
    ["乾", 7, 7], ["坤", 0, 0], ["屯", 2, 1], ["蒙", 4, 2],
    ["需", 2, 7], ["讼", 7, 2], ["师", 0, 2], ["比", 2, 0],
    ["小畜", 6, 7], ["履", 7, 3], ["泰", 0, 7], ["否", 7, 0],
    ["同人", 7, 5], ["大有", 5, 7], ["谦", 0, 4], ["豫", 1, 0],
    ["随", 3, 1], ["蛊", 4, 6], ["临", 0, 3], ["观", 6, 0],
    ["噬嗑", 5, 1], ["贲", 4, 5], ["剥", 4, 0], ["复", 0, 1],
    ["无妄", 7, 1], ["大畜", 4, 7], ["颐", 4, 1], ["大过", 3, 6],
    ["坎", 2, 2], ["离", 5, 5], ["咸", 3, 4], ["恒", 1, 6],
    ["遁", 7, 4], ["大壮", 1, 7], ["晋", 5, 0], ["明夷", 0, 5],
    ["家人", 6, 5], ["睽", 5, 3], ["蹇", 2, 4], ["解", 1, 2],
    ["损", 4, 3], ["益", 6, 1], ["夬", 3, 7], ["姤", 7, 6],
    ["萃", 3, 0], ["升", 0, 6], ["困", 3, 2], ["井", 2, 6],
    ["革", 3, 5], ["鼎", 5, 6], ["震", 1, 1], ["艮", 4, 4],
    ["渐", 6, 4], ["归妹", 1, 3], ["丰", 1, 5], ["旅", 5, 4],
    ["巽", 6, 6], ["兑", 3, 3], ["涣", 6, 2], ["节", 2, 3],
    ["中孚", 6, 3], ["小过", 1, 4], ["既济", 2, 5], ["未济", 5, 2]
  ];
  var BY_BITS = Object.create(null);
  KING_WEN.forEach(function (entry, index) {
    BY_BITS[entry[2] | (entry[1] << 3)] = { number: index + 1, entry: entry };
  });

  function classifyCoins(coins) {
    if (!Array.isArray(coins) || coins.length !== 3) {
      throw new TypeError("每爻必须恰好包含三枚钱币。");
    }
    var backCount = 0;
    for (var i = 0; i < 3; i += 1) {
      if (coins[i] !== "back" && coins[i] !== "front") {
        throw new TypeError("钱币面只能是 back 或 front。");
      }
      if (coins[i] === "back") backCount += 1;
    }
    var moving = backCount === 0 || backCount === 3;
    var yang = backCount === 1 || backCount === 3;
    return {
      coins: coins.slice(),
      name: moving ? (yang ? "老阳" : "老阴") : (yang ? "少阳" : "少阴"),
      yang: yang,
      moving: moving,
      marker: moving ? (yang ? "○" : "×") : "",
      backCount: backCount
    };
  }

  function createBitSource(randomBit, count) {
    var bytes;
    var cursor = 0;
    if (randomBit === undefined) {
      if (!root.crypto || typeof root.crypto.getRandomValues !== "function") {
        throw new Error("当前浏览器不支持安全随机数，请使用较新的浏览器。");
      }
      bytes = new Uint8Array(count);
      root.crypto.getRandomValues(bytes);
      // Each byte's low bit is unbiased, with no floating-point conversion.
      randomBit = function () { return bytes[cursor++] & 1; };
    } else if (typeof randomBit !== "function") {
      throw new TypeError("randomBit 必须是返回 0 或 1 的函数。");
    }
    return randomBit;
  }

  function readLine(randomBit) {
    var coins = [];
    for (var coin = 0; coin < 3; coin += 1) {
      var bit = randomBit();
      if (bit !== 0 && bit !== 1) throw new TypeError("随机位必须是 0 或 1。");
      coins.push(bit === 1 ? "back" : "front");
    }
    return classifyCoins(coins);
  }

  function castLine(randomBit) {
    return readLine(createBitSource(randomBit, 3));
  }

  function castHexagram(randomBit) {
    randomBit = createBitSource(randomBit, 18);
    var lines = [];
    for (var row = 0; row < 6; row += 1) {
      lines.push(readLine(randomBit));
    }
    return lines;
  }

  function validateLines(lines) {
    if (!Array.isArray(lines) || lines.length !== 6) {
      throw new TypeError("一卦必须恰好包含六爻，并按自下而上的顺序排列。");
    }
    for (var i = 0; i < 6; i += 1) {
      if (!lines[i] || typeof lines[i].yang !== "boolean") {
        throw new TypeError("每爻必须用布尔值 yang 表示阴阳。");
      }
    }
  }

  function describeHexagram(lines) {
    validateLines(lines);
    var bits = 0;
    for (var i = 0; i < 6; i += 1) if (lines[i].yang) bits |= (1 << i);
    var match = BY_BITS[bits];
    var upper = TRIGRAMS[match.entry[1]];
    var lower = TRIGRAMS[match.entry[2]];
    return {
      number: match.number,
      name: match.entry[0],
      fullName: match.entry[1] === match.entry[2]
        ? upper.name + "为" + upper.nature
        : upper.nature + lower.nature + match.entry[0],
      symbol: String.fromCharCode(0x4DC0 + match.number - 1),
      upper: { name: upper.name, nature: upper.nature },
      lower: { name: lower.name, nature: lower.nature }
    };
  }

  function changeLines(lines) {
    validateLines(lines);
    return lines.map(function (line) {
      // Coin/name/moving metadata describes the original cast. Only yang changes.
      var changed = Object.assign({}, line, { yang: line.moving ? !line.yang : line.yang });
      if (Array.isArray(line.coins)) changed.coins = line.coins.slice();
      return changed;
    });
  }

  return Object.freeze({
    classifyCoins: classifyCoins,
    castLine: castLine,
    castHexagram: castHexagram,
    describeHexagram: describeHexagram,
    changeLines: changeLines
  });
});
