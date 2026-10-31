/**
 * 六爻纳甲装卦引擎。
 *
 * 算法取自开源项目 najia（https://github.com/bopo/najia，MIT License，
 * PyPI v2.0.1）经「衍易排盘」项目的 JS 移植版（app-src/engine/liuyao.js）
 * 原样移植：仅将 ES Module 导出改为 window.LiuYao 全局挂载，算法零改动：
 *   - 纳甲配干支 get_najia
 *   - 寻世诀 set_shi_yao：「天同二世天变五，地同四世地变初，本宫六世三世异，人同游魂人变归」
 *   - 认宫诀 palace：「一二三六外卦宫，四五游魂内变更，归魂内卦是本宫」
 *   - 六亲 get_qin6、六神 get_god6、伏神 _hidden、变卦 _transform、六冲六合 get_type
 *
 * 与 najia Python 原实现保持一致（曾以 najia 原版生成的 288 例基准数据
 * 做过全字段回归对照：世应、纳甲、六亲、六神、伏神、卦宫、六冲六合、
 * 游魂归魂全部一致）。
 * 增补：卦身（月卦身，阳世从子数、阴世从午数）、世身（世爻地支定爻）。
 * 历法层依赖 vendor/lunar.min.js（6tail/lunar-javascript，MIT），由调用方
 * 生成 dateInfo = {gz:{year,month,day,hour}, xkong, yueJian} 传入 compile()。
 */
(function () {
  'use strict';

const GANS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHIS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const XING5 = ['木', '火', '土', '金', '水'];
// 地支五行索引（→ XING5）
const ZHI5 = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
// 天干五行索引（→ XING5）
const GAN5 = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
// 八宫卦五行索引（乾兑离震巽坎艮坤 → XING5）
const GUA5 = [3, 3, 1, 0, 0, 4, 2, 2];
// 八卦三爻码（爻序同 najia：'111' 乾、'110' 兑、'101' 离、'100' 震、'011' 巽、'010' 坎、'001' 艮、'000' 坤）
const YAOS = ['111', '110', '101', '100', '011', '010', '001', '000'];
const GUAS = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
// 纳甲表：[内卦'干+三支', 外卦'干+三支']，按 乾兑离震巽坎艮坤
const NAJIA = [
  ['甲子寅辰', '壬午申戌'], // 乾金甲子外壬午
  ['丁巳卯丑', '丁亥酉未'], // 兑
  ['己卯丑亥', '己酉未巳'], // 离
  ['庚子寅辰', '庚午申戌'], // 震
  ['辛丑亥酉', '辛未巳卯'], // 巽
  ['戊寅辰午', '戊申戌子'], // 坎
  ['丙辰午申', '丙戌子寅'], // 艮
  ['乙未巳卯', '癸丑亥酉'], // 坤
];
const GUA64 = {
  '111111': '乾为天', '011111': '天风姤', '001111': '天山遁', '000111': '天地否', '000011': '风地观', '000001': '山地剥',
  '000101': '火地晋', '111101': '火天大有', '110110': '兑为泽', '010110': '泽水困', '000110': '泽地萃', '001110': '泽山咸',
  '001010': '水山蹇', '001000': '地山谦', '001100': '雷山小过', '110100': '雷泽归妹', '101101': '离为火', '001101': '火山旅',
  '011101': '火风鼎', '010101': '火水未济', '010001': '山水蒙', '010011': '风水涣', '010111': '天水讼', '101111': '天火同人',
  '100100': '震为雷', '000100': '雷地豫', '010100': '雷水解', '011100': '雷风恒', '011000': '地风升', '011010': '水风井',
  '011110': '泽风大过', '100110': '泽雷随', '011011': '巽为风', '111011': '风天小畜', '101011': '风火家人', '100011': '风雷益',
  '100111': '天雷无妄', '100101': '火雷噬嗑', '100001': '山雷颐', '011001': '山风蛊', '010010': '坎为水', '110010': '水泽节',
  '100010': '水雷屯', '101010': '水火既济', '101110': '泽火革', '101100': '雷火丰', '101000': '地火明夷', '010000': '地水师',
  '001001': '艮为山', '101001': '山火贲', '111001': '山天大畜', '110001': '山泽损', '110101': '火泽睽', '110111': '天泽履',
  '110011': '风泽中孚', '001011': '风山渐', '000000': '坤为地', '100000': '地雷复', '110000': '地泽临', '111000': '地天泰',
  '111100': '雷天大壮', '111110': '泽天夬', '111010': '水天需', '000010': '水地比',
};
const QING6 = ['兄弟', '父母', '官鬼', '妻财', '子孙'];
const SHEN6 = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
// 日干起六神：甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武
const GOD6_START = [0, 0, 1, 1, 2, 3, 4, 4, 5, 5];

/** 干支 → '干支+支五行'，如 '甲子' → '甲子水' */
function gz5x(gz) {
  return gz + XING5[ZHI5[ZHIS.indexOf(gz[1])]];
}

/** 纳甲配干支：mark 六位二进制（index 0=初爻）→ 六爻干支数组（index 0=初爻） */
function getNajia(mark) {
  const nei = mark.slice(0, 3);
  const wai = mark.slice(3);
  const ni = YAOS.indexOf(nei);
  const wi = YAOS.indexOf(wai);
  if (ni < 0 || wi < 0) throw new Error(`非法卦码: ${mark}`);
  const ngz = NAJIA[ni][0].split('').slice(1).map((z) => NAJIA[ni][0][0] + z);
  const wgz = NAJIA[wi][1].split('').slice(1).map((z) => NAJIA[wi][1][0] + z);
  return [...ngz, ...wgz];
}

/**
 * 寻世诀定世应。
 * @returns {[number, number]} [世爻位(1-6), 应爻位(1-6)]
 */
function setShiYao(mark) {
  const nei = mark.slice(0, 3);
  const wai = mark.slice(3);
  const shiy = (shi) => [shi, shi > 3 ? shi - 3 : shi + 3];

  // 天同二世天变五
  if (wai[2] === nei[2]) {
    if (wai[1] !== nei[1] && wai[0] !== nei[0]) return shiy(2);
  } else if (wai[1] === nei[1] && wai[0] === nei[0]) {
    return shiy(5);
  }
  // 人同游魂人变归
  if (wai[1] === nei[1]) {
    if (wai[0] !== nei[0] && wai[2] !== nei[2]) return shiy(4); // 游魂
  } else if (wai[0] === nei[0] && wai[2] === nei[2]) {
    return shiy(3); // 归魂
  }
  // 地同四世地变初
  if (wai[0] === nei[0]) {
    if (wai[1] !== nei[1] && wai[2] !== nei[2]) return shiy(4);
  } else if (wai[1] === nei[1] && wai[2] === nei[2]) {
    return shiy(1);
  }
  // 本宫六世
  if (wai === nei) return shiy(6);
  // 三世异
  return shiy(3);
}

/** 认宫诀：mark + 世爻 → 八宫索引(0-7) */
function palace(mark, shi) {
  const nei = mark.slice(0, 3);
  const wai = mark.slice(3);
  const hun = soulOf(mark);

  if (hun === '归魂') return YAOS.indexOf(nei); // 归魂内卦是本宫
  if ([1, 2, 3, 6].includes(shi)) return YAOS.indexOf(wai); // 一二三六外卦宫
  if ([4, 5].includes(shi) || hun === '游魂') {
    // 四五游魂内变更
    const flipped = nei.split('').map((c) => (c === '1' ? '0' : '1')).join('');
    return YAOS.indexOf(flipped);
  }
  throw new Error(`认宫失败: ${mark} shi=${shi}`);
}

/** 游魂 / 归魂判定，否则返回 '' */
function soulOf(mark) {
  const nei = mark.slice(0, 3);
  const wai = mark.slice(3);
  if (wai[1] === nei[1]) {
    if (wai[0] !== nei[0] && wai[2] !== nei[2]) return '游魂';
  } else if (wai[0] === nei[0] && wai[2] === nei[2]) {
    return '归魂';
  }
  return '';
}

/** 六冲卦判定 */
function isChong(mark) {
  const nei = mark.slice(0, 3);
  const wai = mark.slice(3);
  if (wai === nei) return true; // 八纯卦
  return [nei, wai].every((x) => ['100', '111'].includes(x)); // 无妄 / 大壮
}

/** 六合卦判定（按卦名含六合卦名单） */
function isHe(mark) {
  const name = GUA64[mark] || '';
  return ['否', '困', '旅', '豫', '节', '贲', '复', '泰'].some((x) => name.includes(x));
}

/** 卦类型：游魂/归魂/六冲/六合（与 najia get_type 一致：游魂归魂优先，其次六冲，再六合） */
function getType(mark) {
  const soul = soulOf(mark);
  if (soul) return soul;
  if (isChong(mark)) return '六冲';
  if (isHe(mark)) return '六合';
  return '';
}

/** 六亲：宫五行 w1 对爻支五行 w2 的生克关系 */
function getQin6(w1, w2) {
  const a = XING5.indexOf(w1);
  const b = XING5.indexOf(w2);
  const d = ((a - b) % 5 + 5) % 5;
  return QING6[d];
}

/** 六神：按日干起，第 i 爻(index 0=初爻)六神 */
function getGod6(dayGz) {
  const start = GOD6_START[GANS.indexOf(dayGz[0])];
  return Array.from({ length: 6 }, (_, i) => SHEN6[(start + i) % 6]);
}

/**
 * 月卦身：阳世从子起初爻顺数至月支，阴世从午起。
 * @returns {{yao: number, zhi: string}|null} yao 为 1-based 爻位
 */
function guaShen(mark, yueJian) {
  const shi = setShiYao(mark)[0];
  const shiYaoYang = mark[shi - 1] === '1';
  const start = shiYaoYang ? ZHIS.indexOf('子') : ZHIS.indexOf('午');
  const target = ZHIS.indexOf(yueJian);
  const steps = ((target - start) % 12 + 12) % 12;
  const yao = (steps % 6) + 1;
  return { yao, zhi: yueJian };
}

/** 世身：世爻地支定爻（子午居初、丑未居二、寅申居三、卯酉居四、辰戌居五、巳亥居上） */
function shiShen(mark) {
  const shi = setShiYao(mark)[0];
  const zhi = getNajia(mark)[shi - 1][1];
  return (ZHIS.indexOf(zhi) % 6) + 1;
}

/** 伏神：本卦六亲不全时，从本宫首卦借取 */
function hidden(mark, gong, qin6) {
  if (new Set(qin6).size >= 5) return null;
  const gongMark = YAOS[gong] + YAOS[gong];
  const gongGz = getNajia(gongMark);
  const gongWuxing = XING5[GUA5[gong]];
  const hQin6 = gongGz.map((gz) => getQin6(gongWuxing, XING5[ZHI5[ZHIS.indexOf(gz[1])]]));
  const hQinx = gongGz.map(gz5x);
  const missing = new Set(hQin6.filter((x) => !qin6.includes(x)));
  const seat = [];
  hQin6.forEach((q, i) => {
    if (missing.has(q)) seat.push(i);
  });
  return {
    name: GUA64[gongMark] || '',
    mark: gongMark,
    qin6: hQin6,
    qinx: hQinx,
    seat,
  };
}

/** 变卦：动爻变后的卦。params: 1阳静 2阴静 3阳动 4阴动 */
function transformOf(params, gong) {
  if (!params.includes(3) && !params.includes(4)) return null;
  const bmark = params.map((v) => ([1, 4].includes(v) ? '1' : '0')).join('');
  const bShiy = setShiYao(bmark);
  const gongWuxing = XING5[GUA5[gong]];
  const qin6 = getNajia(bmark).map((gz) => getQin6(gongWuxing, XING5[ZHI5[ZHIS.indexOf(gz[1])]]));
  return {
    name: GUA64[bmark] || '',
    mark: bmark,
    // 变卦六亲仍以本卦卦宫五行论（najia 行为一致）
    qin6,
    qinx: getNajia(bmark).map(gz5x),
    gong: GUAS[palace(bmark, bShiy[0])],
  };
}

/**
 * 六爻装卦主入口。
 * @param {number[]} params 六爻，index 0=初爻；1=少阳 2=少阴 3=老阳(动) 4=老阴(动)
 * @param {object} dateInfo {gz:{year,month,day,hour}, xkong, yueJian}（由 lunar 库计算）
 * @returns {object} 装卦结果
 */
function compile(params, dateInfo) {
  if (!Array.isArray(params) || params.length !== 6) throw new Error('需 6 个爻位');
  if (params.some((p) => !Number.isInteger(p) || p < 1 || p > 4)) throw new Error('爻位取值须为 1/2/3/4');

  const mark = params.map((p) => String(p % 2)).join('');
  const shiy = setShiYao(mark);
  const gong = palace(mark, shiy[0]);
  const gongName = GUAS[gong];
  const gongWuxing = XING5[GUA5[gong]];

  const gzArr = getNajia(mark);
  const qinx = gzArr.map(gz5x);
  const qin6 = gzArr.map((gz) => getQin6(gongWuxing, XING5[ZHI5[ZHIS.indexOf(gz[1])]]));

  const god6 = getGod6(dateInfo.gz.day);
  const dong = params.map((p, i) => (p > 2 ? i : -1)).filter((i) => i >= 0);

  return {
    params,
    mark,
    name: GUA64[mark] || '',
    type: getType(mark),
    gong: gongName,
    gongWuxing,
    shiy,
    qinx,
    qin6,
    god6,
    dong,
    shen: guaShen(mark, dateInfo.yueJian),
    shiShen: shiShen(mark),
    hide: hidden(mark, gong, qin6),
    bian: transformOf(params, gong),
    date: dateInfo,
  };
}

window.LiuYao = Object.freeze({
  compile, getNajia, setShiYao, palace, soulOf, getType, getQin6, getGod6,
  guaShen, shiShen, hidden, transformOf,
  GUA64, GUAS, YAOS, GANS, ZHIS, XING5,
});
})();
