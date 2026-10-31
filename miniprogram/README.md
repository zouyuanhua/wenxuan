# 问玄小程序(微信原生)

基于周易卦象的 AI 问事小程序,与仓库 `src/`(H5/Web 版)同一套后端协议与术数逻辑。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss   # 全局入口与主题
├── pages/ask/                     # 问事台(FR-01:分类/子项/疏文/焚化转场)
├── pages/cast/                    # 摇卦 → 卦象 → 解卦 → 追问循环(FR-02~05)
├── utils/hexagram.js              # 摇卦引擎(与 engine/yaogua.py 同源同规则)
├── utils/ask-data.js              # 问事分类/子项模板/签语/节气文案
└── utils/api.js                   # 后端 API 封装(BASE_URL 在此配置)
```

## 本地运行

1. 微信开发者工具 → 导入项目 → 选择 `miniprogram/` 目录(AppID 可用测试号)
2. 启动后端(仓库 `src/` 下,二选一):
   ```bash
   python dev_server.py                        # 零依赖预览(解读为演示数据)
   # 或
   pip install -r requirements.txt && python -m uvicorn app:app --port 2468
   ```
3. 开发者工具 → 详情 → 本地设置 → 勾选**「不校验合法域名」**
4. 后端地址在 `utils/api.js` 的 `BASE_URL` 处修改(默认 `http://127.0.0.1:2468`)

## 发布前必办

- [ ] `utils/api.js` 的 `BASE_URL` 改为已备案 HTTPS 域名
- [ ] 小程序管理后台 → 开发管理 → 服务器域名,配置 request 合法域名
- [ ] 类目与资质:玄学/占卜类目审核严格,建议以「传统文化/国学文化」类目申报,页面保留免责声明
- [ ] 移除/替换演示数据入口(dev_server 仅限本地预览)

## 已知边界(P0)

- 音效:小程序不支持 Web Audio,已用震动反馈替代;如需音效可后续接入 `wx.createInnerAudioContext` + 音频资源
- 随机源:`Math.random`(每枚硬币独立 50/50);如需更强随机可接入服务端摇卦接口
- 历史记录:NFR-01 持久化尚未实现(与 Web 版一致)
