# 刃 · BLADE

从桌面上的 `blade-game.html` 拆分出的静态 Canvas 游戏项目。

## 目录

```text
blade-game-project/
  index.html
  package.json
  src/
    main.js
    styles.css
    core/
      audio.js
      dom.js
      math.js
    content/
      achievements.js
      bosses.js
      characters.js
      enemies.js
      meta-upgrades.js
      mutations.js
      perks.js
    systems/
      combat/
        weaponRuntime.js
      progression/
        missionSystem.js
      storage/
        storageAdapter.js
      spawnFactory.js
      wavePlanner.js
  tests/
  tools/
    dev-server.mjs
```

## 运行

直接打开 `index.html` 可以运行。建议使用本地服务器启动，避免浏览器对 `file://` 的存储策略差异影响存档：

```bash
npm run dev
```

默认会从 `http://127.0.0.1:5173` 启动；如果端口被占用，脚本会自动尝试后续端口。

## 测试

```bash
npm test
```

## 拆分说明

- `index.html`：页面结构和 ES module 入口
- `src/styles.css`：原 HTML 内联样式
- `src/main.js`：游戏编排、主循环、战斗结算和渲染入口
- `src/core/`：通用工具、DOM helper、音效系统
- `src/content/characters.js`：可选角色配置
- `src/content/enemies.js`：小怪类型、分数、半径、速度、生命等配置
- `src/content/bosses.js`：Boss 类型、出场顺序、半径、颜色和血量曲线
- `src/content/perks.js`：局内强化卡
- `src/content/meta-upgrades.js`：永久强化
- `src/content/mutations.js`：每日挑战变异
- `src/content/achievements.js`：成就配置
- `src/systems/spawnFactory.js`：小怪、猎杀者、Boss 的实体创建工厂
- `src/systems/wavePlanner.js`：关卡/波次生成规则
- `src/systems/combat/weaponRuntime.js`：不同角色武器的命中弧、突进、震波和视觉类型
- `src/systems/storage/storageAdapter.js`：存储适配器；部署域名有 `window.storage` 时优先使用，否则回退到浏览器本地 `localStorage`
- `src/systems/progression/missionSystem.js`：每日修行目标、晶核奖励和武器熟练度
- `src/systems/progression/bossCodex.js`：Boss 遭遇/击败记录和弱点提示
- `src/systems/progression/revengeSystem.js`：宿敌墓碑选择与复仇奖励
- `src/systems/progression/dossier.js`：任务档案文案生成
- `tools/dev-server.mjs`：无第三方依赖的本地静态服务器
- `tests/`：Node 内置测试，覆盖存储、武器 runtime 和修行奖励

## 扩展入口

- 新增小怪：先在 `src/content/enemies.js` 加类型配置，再在 `src/systems/wavePlanner.js` 决定第几波加入刷怪池；如果需要特殊 AI，再在 `src/main.js` 的敌人更新段按 `type` 补行为。
- 新增 Boss：先在 `src/content/bosses.js` 加 Boss 配置并更新 `BOSS_ORDER`；如果有新技能状态，在 `src/main.js` 的 Boss 更新/绘制段按 `kind` 补逻辑。
- 调整关卡节奏：改 `src/systems/wavePlanner.js`，那里集中控制普通波和 Boss 波的刷怪预算、刷怪池和时间轴。
- 新增角色/强化/每日变异：分别改 `src/content/characters.js`、`src/content/perks.js`、`src/content/mutations.js`。
- 新增武器攻击方式：在 `src/systems/combat/weaponRuntime.js` 增加 `weaponId` 分支，再在 `drawSlash` 中补视觉样式。
- 调整留存目标：改 `src/systems/progression/missionSystem.js` 的任务条件和奖励。

## 当前留存系统

- 武器熟练度：完成每日修行会给当前角色武器 XP，并逐步解锁招式名。
- 每日修行：菜单中固定显示 3 个短目标，结算时给额外晶核。
- Boss 图鉴：遭遇/击败 Boss 会记录情报，击败或多次遭遇后显示弱点提示。
- 宿敌复仇：菜单档案会读取最近死亡墓碑，局内斩碑可拿宿敌奖励。
- 目标链：完成三项每日修行后开放“夜袭核心”，从 Boss 波开始挑战。
- 任务档案：菜单用档案文案包装当前角色、武器、变异、宿敌和夜袭状态。
