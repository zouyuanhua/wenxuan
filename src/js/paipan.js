/**
 * 六爻排盘展示层：由摇卦结果（coins）计算纳甲排盘，并按常规版式渲染排盘表。
 *
 * 依赖（均为纯前端确定性计算，离线可用）：
 *   - window.YaoGua  src/js/hexagram.js         钱币 → 爻（阴阳/动静）
 *   - window.LiuYao  src/js/liuyao.js           纳甲装卦引擎（najia 算法）
 *   - window.Solar   src/js/vendor/lunar.min.js 起卦日干支/旬空/月建
 *
 * 对外接口：
 *   window.PaiPan.renderFromCoins(coinsLines)  coinsLines=[['back'|'front']×3]×6
 *   window.PaiPan.clear()                      移除排盘面板（重新摇卦时调用）
 *
 * 排盘面板插入「卦变说明」与「AI 解读」之间；六爻未摇满或依赖缺失时静默不动。
 */
(function () {
  'use strict';

  // 起卦时间取本地系统当前时间，即摇卦完成的时刻。历法不可用时降级为
  // 不带日期要素的排盘（装卦核心不依赖历法，仅缺干支/旬空/月建信息）。
  function dateInfo() {
    const Solar = window.Solar;
    const lunarObj = Solar && typeof Solar.fromYmdHms === 'function'
      ? Solar.fromYmdHms(new Date().getFullYear(), new Date().getMonth() + 1,
          new Date().getDate(), new Date().getHours(), new Date().getMinutes(), 0).getLunar()
      : null;
    if (!lunarObj || typeof lunarObj.getBaZi !== 'function') return null;
    const gz = lunarObj.getBaZi();
    return {
      gz: { year: gz[0], month: gz[1], day: gz[2], hour: gz[3] },
      xkong: lunarObj.getDayXunKong(),
      yueJian: lunarObj.getMonthZhi()
    };
  }

  // classifyCoins 结果 → najia params（1少阳 2少阴 3老阳 4老阴，下标 0=初爻）
  function toParams(lines) {
    return lines.map(line => (line.yang ? (line.moving ? 3 : 1) : (line.moving ? 4 : 2)));
  }

  // info 可选：外部传入 dateInfo（便于确定性测试）；缺省取当前时间（即摇卦时刻）。
  function build(lines, info) {
    const engine = window.LiuYao;
    if (!engine || typeof engine.compile !== 'function') return null;
    const dateInfoUsed = info || dateInfo();
    if (!dateInfoUsed) return null;
    try {
      const r = engine.compile(toParams(lines), dateInfoUsed);
      return {
        params: r.params,
        name: r.name, type: r.type, gong: r.gong, gongWuxing: r.gongWuxing,
        shiy: r.shiy, qinx: r.qinx, qin6: r.qin6, god6: r.god6, dong: r.dong,
        shen: r.shen, shiShen: r.shiShen,
        hide: r.hide ? { name: r.hide.name, qin6: r.hide.qin6, qinx: r.hide.qinx, seat: r.hide.seat } : null,
        bian: r.bian ? {
          name: r.bian.name, mark: r.bian.mark, type: engine.getType(r.bian.mark),
          qin6: r.bian.qin6, qinx: r.bian.qinx, shiy: engine.setShiYao(r.bian.mark)
        } : null,
        date: r.date
      };
    } catch (error) {
      console.warn('问玄：排盘计算失败，本次不展示排盘。', error);
      return null;
    }
  }

  // ===== 渲染：六神 | 主卦(六亲+干支+爻符+世应) | 变卦同构 =====
  function ppSpan(className, text) {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }

  function ppYaoCell(isMain, qin, gz, yang, mark, flag, hideText) {
    const cell = document.createElement('td');
    cell.className = isMain ? 'pp-cell-main' : 'pp-cell-bian';
    const row = document.createElement('div');
    row.className = 'pp-line-row';
    row.append(
      ppSpan('pp-qin', qin),
      ppSpan('pp-gz', gz),
      ppSpan('pp-yao' + (yang ? '' : ' is-yin'), '')
    );
    if (mark) row.appendChild(ppSpan('pp-mark', mark));
    if (flag) row.appendChild(ppSpan('pp-flag', flag));
    cell.appendChild(row);
    if (hideText) {
      const h = document.createElement('div');
      h.className = 'pp-hide';
      h.textContent = '伏 ' + hideText;
      cell.appendChild(h);
    }
    return cell;
  }

  function renderPanel(paipan, lines) {
    const anchor = document.getElementById('change-explanation');
    if (!anchor || !paipan) return;
    clear();

    const panel = document.createElement('section');
    panel.className = 'paipan-panel';
    panel.id = 'paipan-panel';

    const head = document.createElement('div');
    head.className = 'paipan-head';
    const title = document.createElement('h3');
    title.textContent = '六爻排盘';
    const gz = paipan.date.gz;
    const info = document.createElement('div');
    info.className = 'pp-info';
    const gzLine = document.createElement('div');
    gzLine.append(ppSpan('pp-info-label', '干支'),
      document.createTextNode(gz.year + '年 · ' + gz.month + '月 · ' + gz.day + '日 · ' + gz.hour));
    const mdLine = document.createElement('div');
    mdLine.append(ppSpan('pp-info-label', '月日'),
      document.createTextNode('月建 ' + paipan.date.yueJian + ' · 日辰 ' + (gz.day[1] || '') +
        ' · 旬空 ' + paipan.date.xkong + ' · ' + paipan.gong + '宫' + paipan.gongWuxing));
    info.append(gzLine, mdLine);
    const POS = ['初', '二', '三', '四', '五', '上'];
    if (paipan.dong.length) {
      const segs = paipan.dong.map(i => {
        const stem = POS[i] + '爻' + paipan.qin6[i] + paipan.qinx[i] +
          (paipan.dong.length === 1 ? '独发' : '');
        return paipan.bian ? stem + '化' + paipan.bian.qin6[i] + paipan.bian.qinx[i] : stem;
      });
      const moveLine = document.createElement('div');
      moveLine.className = 'pp-moving-line';
      moveLine.append(ppSpan('pp-info-label', '动爻'), document.createTextNode(segs.join('、')));
      info.appendChild(moveLine);
    } else {
      const quiet = document.createElement('div');
      quiet.append(ppSpan('pp-info-label', '动爻'), document.createTextNode('六爻安静，以本卦断之'));
      info.appendChild(quiet);
    }
    head.append(title, info);

    const scroll = document.createElement('div');
    scroll.className = 'paipan-scroll';
    const table = document.createElement('table');
    table.className = 'paipan-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const thGod = document.createElement('th');
    thGod.className = 'pp-th-god';
    thGod.textContent = '六神';
    const thMain = document.createElement('th');
    thMain.append(document.createTextNode(paipan.name), ppSpan('pp-type', paipan.type ? '(' + paipan.type + ')' : ''));
    headRow.append(thGod, thMain);
    if (paipan.bian) {
      const thBian = document.createElement('th');
      thBian.append(document.createTextNode(paipan.bian.name), ppSpan('pp-type', paipan.bian.type ? '(' + paipan.bian.type + ')' : ''));
      headRow.appendChild(thBian);
    }
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    const MOVE_MARK = { 3: '○', 4: '×' };
    for (let i = 5; i >= 0; i--) {
      const tr = document.createElement('tr');
      tr.className = 'paipan-row' + (lines[i].moving ? ' is-moving' : '');
      const god = document.createElement('td');
      god.className = 'pp-god';
      god.textContent = paipan.god6[i];
      tr.appendChild(god);
      const hideHere = paipan.hide && paipan.hide.seat.indexOf(i) >= 0
        ? paipan.hide.qin6[i] + paipan.hide.qinx[i]
        : null;
      let flag = null;
      if (paipan.shiy[0] === i + 1) flag = '世';
      else if (paipan.shiy[1] === i + 1) flag = '应';
      tr.appendChild(ppYaoCell(true, paipan.qin6[i], paipan.qinx[i], lines[i].yang,
        MOVE_MARK[paipan.params[i]] || null, flag, hideHere));
      if (paipan.bian) {
        let bFlag = null;
        if (paipan.bian.shiy[0] === i + 1) bFlag = '世';
        else if (paipan.bian.shiy[1] === i + 1) bFlag = '应';
        tr.appendChild(ppYaoCell(false, paipan.bian.qin6[i], paipan.bian.qinx[i],
          paipan.bian.mark[i] === '1', null, bFlag, null));
      } else {
        tr.lastChild.colSpan = 2;
      }
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    scroll.appendChild(table);

    const note = document.createElement('p');
    note.className = 'paipan-note';
    const notes = [];
    if (paipan.hide) notes.push('伏神借自本宫首卦「' + paipan.hide.name + '」');
    if (paipan.shen) notes.push('卦身居第' + paipan.shen.yao + '爻(' + paipan.shen.zhi + ')');
    if (paipan.shiShen) notes.push('世身居第' + paipan.shiShen + '爻');
    if (notes.length) note.textContent = notes.join('；') + '。○老阳动 · ×老阴动';

    panel.append(head, scroll);
    if (notes.length) panel.appendChild(note);
    anchor.insertAdjacentElement('afterend', panel);
  }

  function clear() {
    const old = document.getElementById('paipan-panel');
    if (old) old.remove();
  }

  // 纯数据接口：摇满六爻时算一次，页面展示与解卦请求共用同一份。
  // 排盘含起卦时刻的干支、旬空、月建与六神起法，重复计算会因时间推进而漂移。
  function buildFromCoins(coinsLines) {
    const engine = window.YaoGua;
    if (!engine || typeof engine.classifyCoins !== 'function') return null;
    if (!Array.isArray(coinsLines) || coinsLines.length !== 6) return null;
    let lines;
    try {
      lines = coinsLines.map(coins => engine.classifyCoins(coins));
    } catch (error) {
      return null;
    }
    return build(lines);
  }

  function renderFromCoins(coinsLines) {
    const engine = window.YaoGua;
    const paipan = buildFromCoins(coinsLines);
    if (!paipan || !engine || typeof engine.classifyCoins !== 'function') return;
    renderPanel(paipan, coinsLines.map(coins => engine.classifyCoins(coins)));
  }

  window.PaiPan = Object.freeze({
    renderFromCoins: renderFromCoins,
    buildFromCoins: buildFromCoins,
    clear: clear
  });
})();
