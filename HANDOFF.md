# dsh-reply-forge 交接文档

> 面向接手本工作的另一个团队（或另一个 AI）。本文按时间线复原已发生的事、失败根因、当前真实状态、以及建议的下一步。
>
> 关键原则：**本文所有结论都经过实测验证，标注了证据来源。没有证据的地方明确写"未验证"。**

---

## 1. 一句话现状

插件代码已完成并验证通过（5/5 测试），但**当前处于关闭状态**：`package.json` 的 `dependencies` 里有 `@local/dsh-reply-forge`，`dsh.profile.bundles` 里没有它，且 `cordis.patch.yml` 里有 `- id: dsh-reply-forge / disabled: true`。

`node_modules` 已恢复到 122 个目录，dsh 环境恢复正常。

---

## 2. 时间线：做了什么，哪里失败

### 阶段 A：需求理解与契约探测（成功）

用只读方式摸清了 dsh 桌面端的插件机制，**没有写任何文件**：

| 事实 | 来源 |
|---|---|
| profile 根在 `C:\Users\Administrator\.dsh\profiles\desktop` | `$env:DSH_PROFILE_DIR` |
| 插件契约 = npm 包 + `cordis.patch.yml` 插入条目 + Node half + client half | 实测 gal-view 与 dsh-free-design-preset 两个已安装插件 |
| client half 加载契约为 `window.__ModuleLoader__.load({id, factory: (require) => module.exports})` | `gal-view/scripts/build-client.mjs` |
| `dsh.client.platform` 必须是 string 且 `=== "web"`，`inject` 必须是 string 数组 | 内核 `app.asar/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js` 的 `parseDshClient()` |
| 宿主 UI 使用构建期哈希 CSS 类名（如 `.Kwoi6G_body`），写死即失效 | 实测 `@linxin666/dsh-web-all/lib/client.js`，2.9MB 产物 |
| 会话锚点是官方槽位属性 `data-slot="main.conversation"`（新版）/ `data-slot="conversation"`（alpha.1 及更早） | `dsh-better-sidebar/src/client/center-column.ts` |

### 阶段 B：插件实现（成功）

源码在 `E:\文档\dsh-reply-forge`，零依赖、无 JSX、自研构建器（环境无 esbuild）。

模块划分（相对 `E:\文档\dsh-reply-forge`）：
- `.dsh-plugin/index.mjs` — Node half，空实现
- `.dsh-plugin/client/index.mjs` — 主控：DOM 注入、接管、编辑器、生命周期
- `.dsh-plugin/client/picker.mjs` — 消息块拾取（结构特征定位，非类名）
- `.dsh-plugin/client/classify.mjs` — 块分类器（方案2核心）
- `.dsh-plugin/client/markdown.mjs` — 零依赖 Markdown 渲染器，纯 DOM 构造，无 innerHTML
- `.dsh-plugin/client/store.mjs` — localStorage 持久化
- `.dsh-plugin/client/styles.mjs` — 样式（`rf-*` 前缀）
- `scripts/build-client.mjs` — 自研 ESM→CJS 内联器
- `tests/run.mjs` + `tests/dom-stub.mjs` — DOM 桩回归测试

### 阶段 C：安装失败（根因）

**第一次崩溃的根因：改完 `package.json` 没有跑 `pnpm install`。**

`pnpm-lock.yaml` 里没有 `@local/dsh-reply-forge`（实测 `lock.includes('reply-forge') === false`），而对照的 `dsh-free-design-preset` 在 lockfile 里有记录。宿主启动时按 lockfile 解析 bundle 列表，遇到未登记的包即失败。

排障时排除了两个错误方向，这里记录以免接手者重走弯路：
- `E:\game\DeepSeekHarness\debug.log` 那 725 行全是 Electron crashpad 的 `TransactNamedPipe: 有更多数据可用 (0xEA)`，实测过滤后 **non-noise = 0 行**，与本故障无关。
- `.dsh-market/log.ndjson` 没有该插件的任何记录，说明市场插件链路根本没参与。

### 阶段 D：二次损伤（我犯的错）

为修 lockfile，**在 dsh 仍在运行时**执行了 `pnpm install`。pnpm 需要清空 `node_modules`，遇文件占用报 `ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR ... 拒绝访问 (os error 5)` 后中断，留下残缺状态：

- `node_modules` 从基线 **128 个目录掉到 48 个**，丢失 74 项
- `.pnpm` 真实存储目录被删
- `@local` 目录被删 —— 连带 `dsh-free-design-preset` 与 `dsh-preset-novel-mode` 的链接一起没了

**丢失清单（按用户可感知影响排序）**：
- 关键：`@linxin666/dsh-web-all`（web UI 主体）、`dsh-better-sidebar`、`dsh-context`、`dsh-cost-meter`、`dsh-muv-engine`、`dsh-muv-table`、`dsh-our-free-model`、`@deepseek-ai/*`
- 侥幸还在：`gal-view`、`dsh-tavern`、`dshmarket`、`dsh-purge`、`dsh-whale-widget`、`dsh-preset-novel-mode`
- 纯依赖库 60+：d3 全家桶、mermaid、katex、lodash-es、rxjs、zod、cytoscape、xterm 等

**为什么能恢复**：`package.json` 与 `pnpm-lock.yaml` 两个清单文件完好无损——丢的是包体，不是清单。

### 阶段 E：补救（已由你执行成功）

期间我先做了两件事：
1. 写了 `scripts/disable.mjs` + `关闭插件.bat`（一键关闭，全部带备份）
2. 写了 `scripts/reinstall.mjs` + `重装插件.bat`（退 dsh 后一键重装）

**实际执行记录**：`package.json` 与 `cordis.patch.yml` 存在 6 组 `bak-reinstall-2026-10-14T19-*` 备份（19:24、19:40、19:42、19:44、19:51），说明重装脚本被多次运行，最终 node_modules 恢复到 122 个目录。

**离线可行性核查结论**（接手者别再查一遍）：
- `AppData\Local\pnpm\store\v3` **是空的，0 个文件** —— 全局内容寻址 store 无内容
- `AppData\Local\pnpm-cache` 有 **1.3GB**（`v11` tarball 缓存）
- 所以 `--offline` 大概率失败，`--prefer-offline` 可能部分命中，**联网运行成功率最高**

---

## 3. 当前真实状态（实测）

> 快照时间：2026-10-15 13:45（阶段 I 后更新）

```
node_modules 目录数:        121
.lockfile 已登记 reply-forge: 是
dependencies 含 reply-forge: 是
bundles 含 reply-forge:      是   ← 已重新注册（stage3 见 §9）
cordis.patch.yml disabled 条目: 已移除
client.js 已编入 classify.mjs: 是（含本轮新增代码；注册 id 错位已修，见 §11.1）
按钮覆盖防线：                 已放宽（分类器过拟合修复，见 §13）——真值侧 504/512
回归测试:                     10/10 通过（另会话只读层 11/11，见 §11.4）
桌面 UI 状态：                 插件生效、伪造流程可用；按钮覆盖修复待用户重启确认（§13）
```

插件已启用；启动失败根因（client 注册 id 与包名错位）已定位并修复，等待重启 DSH 桌面端验证（§11.1）。

---

## 4. 修复脚本（已交付）

| 文件 | 用途 |
|---|---|
| `scripts/disable.mjs` + `关闭插件.bat` | 一键关闭：移 dependency、移 bundle、清 patch disabled 条目、删 junction，全带备份 |
| `scripts/reinstall.mjs` + `重装插件.bat` | 一键重装：检测 dsh 是否在跑、备份、重建 junction、`pnpm install --offline` → 失败退 `--prefer-offline`、7 项验证 |

**`reinstall.mjs` 里修掉的两个 bug（接手者注意保留）**：
1. **pnpm 路径含空格**。pnpm 在 `C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\...\node\pnpm.cmd`，直接 `spawnSync(pnpm, args, {shell:true})` 会被空格切断。正确写法是 `spawnSync('cmd', ['/c', '"' + pnpm + '" ' + args.join(' ') + ' --dir "' + PROFILE + '"'])`。
2. **`await import` 不能用在非 async 顶层**。原脚本在 CJS 风格的顶层流里用了 `await import('node:fs')`，改为文件头统一 `import { mkdirSync } from 'node:fs'`。

---

## 5. 架构决策：方案1 vs 方案2

用户提出两个方案，最终选择**两者都要：先方案2保底，再探方案1**。

### 方案2：只允许编辑自然语言部分 —— 已落地

`client/classify.mjs` 按内容特征判定，命中任一条件即**整块拒绝接管**（不提供编辑入口）：

- 文字痕迹：`tool-call` / `调用工具` / `工具结果` / `写入文件` / `exit code` / `批准` 等中英双语标记
- 结构性元素：`<pre>` `<code>` `<table>` `<button>` `<input>` `<select>` `<textarea>` `<iframe>`
- 形态：Windows/Unix 绝对路径、命令行旗标 `--foo`、裸 JSON、`$ ` shell 提示符

**为什么整块拒绝而非局部编辑**：助手消息的一个「块」在会话记录里是原子单元，改动其中一段会让记录与渲染错位。宁可不接管，也不错改。

接入点：`picker.mjs` 的 `pickAssistantBlocks(root, classify)` 与 `index.mjs` 的两处调用（扫描路径 + `Alt+Shift+E` 快捷键路径）。

### 方案1：会话版本树分支 —— 不建议做

已探明三条硬约束，超出 bundle 插件能力边界：

1. **会话存储格式不透明**：`session.v4.jsonl.zstd` 是 zstd 压缩的 JSONL，且版本混用（v3 / v4 并存，还有 `.pre-repair-backup`）。实测在内核全树（`app.asar`）搜索无任何 zstd 解码器，插件侧无法读写。
2. **分支与重放要改宿主会话状态机**，bundle 插件的 `apply()` 契约拿不到这个层级。
3. **与私有格式强耦合**，dsh 一升级就崩 —— 与本次事故同类风险。

**建议**：版本树应作为 feature 向 dsh 上游提，而非插件层硬改。

---

## 6. 建议的下一步（按优先级）

1. **决定插件去留**。若要启用：把 `@local/dsh-reply-forge` 加回 `dsh.profile.bundles`，并删掉 `cordis.patch.yml` 里的 `- id: dsh-reply-forge / disabled: true`。**重启前确认 dsh 完全退出。**
2. **若再启用，先跑 `node scripts/build-client.mjs`** 让产物与源码一致，再跑 `node tests/run.mjs` 确认 5/5。
3. **补一个 gap**：当前 `savePrefs` / `loadPrefs` 的 `enabled` 字段写了但**没有被任何代码路径消费**（`apply()` 里不读它）。这是死代码，要么接上要么删掉——接手时别被它误导。
4. **残留风险**：消息身份靠文本指纹（宿主不提供稳定消息 id）。同一会话内两条正文完全相同的消息，覆盖会串。实测极少见，但值得在 UI 上给个提示。

---

## 7. 备份索引

全部位于 `C:\Users\Administrator\.dsh\profiles\desktop\`：

| 备份 | 含义 |
|---|---|
| `package.json.bak-reply-forge` | **最初的原始状态**（未加插件前），1271B，最干净的回滚点 |
| `package.json.bak-preinstall-20261015-032215` | 首次 pnpm install 前，1369B（已含插件 dependency） |
| `package.json.bak-reinstall-2026-10-14T19-*` | 6 次重装的中间快照 |
| `package.json.bak-enableall-20261015-040143` | bundles 只剩 2 项的极简配置，**不是**正常状态，别直接用它还原 |
| `cordis.patch.yml.bak-disable-reply-forge` | 我加入 disabled 前的干净 patch，1166B |
| `cordis.patch.yml.bak-1792007613767` | 你手动加的 disable 备份，1165B |
| `package.json.bak-enable-2026-10-14T23-38-33-470Z` | 阶段F启用前快照（bundles 未含插件） |
| `cordis.patch.yml.bak-enable-2026-10-14T23-38-33-515Z` | 阶段F启用前快照（含 disabled 条目） |

**最安全的回滚点**：`package.json.bak-reply-forge` + `cordis.patch.yml.bak-disable-reply-forge`。用前先备份当前文件。

---

## 8. 调试备忘

- **debug.log 全是噪音**：`TransactNamedPipe (0xEA)` 是 crashpad pad 已知无害输出。判断真故障要过滤：`lines.filter(l => l.trim() && !/TransactNamedPipe|crashpad/i.test(l))`
- **插件的运行时证据在哪**：插件不带日志文件，`window.__dshReplyForge` 挂在浏览器 window 上，`clearAll()` 可清当前会话覆盖。浏览器控制台可看。
- **验证 lockfile 是否登记**：`readFileSync(PROFILE+'/pnpm-lock.yaml','utf8').includes('reply-forge')`
- **验证 junction**：`Get-Item <path>` 看 `LinkType -eq 'Junction'`；`mklink /J` 不需要管理员权限，`New-Item -ItemType SymbolicLink` 需要。

---

## 9. 阶段 F：二次接手与启用（2026-10-15）

接手人读了本文后的实际动作，全部有据可查：

### F1. 可行性论证结论

可行，且地基已浇完。证据：契约与 gal-view / dsh-free-design-preset 同构且实测在役；源码 5/5 测试通过、`build-client --check` 新鲜；**启用只需改两个启动时读取的静态配置，不需要 pnpm install** —— 上次事故的唯一根因（运行时 pnpm 清空 node_modules）被完全绕开。

### F2. 补掉 §6 留的两个 gap

1. **`enabled` 死代码已接上**（原 §6.3）：`scan()` 以 `prefs.enabled === false` 早退；控制台 `__dshReplyForge.setEnabled(false/true)` 现在实时生效——停用立即拆除已注入 UI（新函数 `stripInjectedUI()`，teardown 也复用它），启用触发一次补扫。
2. **指纹重名警示已加**（原 §6.4）：`scan()` 先统计本轮消息块的指纹重数再接管，`takeBlock` 把重数写进 `dupCount` WeakMap；编辑器打开时重数 >1 的块顶部渲染琥珀色警示（`.rf-warn`），明示「改动会同时作用于全部 N 条」。

### F3. 新增一键启用链路

- `scripts/enable.mjs` + `启用插件.bat`：备份两个配置 → bundles 追加 → 移除 disabled 条目 → 验证 junction/lockfile/client.js。**刻意不跑 pnpm install**（理由见 F1）。幂等，重跑为无操作。
- 已知边界：脚本内 `tasklist` 进程检测用 UTF-16LE + UTF-8 双解码，且任何失败都静默跳过不中断启用；在沙箱类环境里 spawn 被禁（EBUSY）时检测自动降级——bat 入口自带 tasklist 检查不受影响。

### F4. 启用执行记录

```
package.json bundles 追加 @local/dsh-reply-forge  → 备份 .bak-enable-2026-10-14T23-38-33-470Z
cordis.patch.yml 移除 1 条 disabled 条目          → 备份 .bak-enable-2026-10-14T23-38-33-515Z
验证：junction / lockfile / client.js 三项全 OK
```

启用后 profile 的 15 个 bundle 与 5 个 patch 条目均未受影响。**待用户重启 DSH 生效。**

### F5. 测试扩容

`tests/run.mjs` 从 5 项增至 **7 项**，新增：

- 偏好 `enabled=false` 时不接管，`setEnabled(true)` 恢复接管，`setEnabled(false)` 拆除 UI；
- 同会话两条正文相同的消息：双双接管、编辑器出现含重数的警示。

### F6. bat 脚本编码三坑（本轮发现并修复）

`关闭插件.bat` 与 `启用插件.bat` 曾带两个绝症，现象与根因：

| 现象 | 根因 |
|---|---|
| 中文乱码 | 文件是 UTF-8，中文系统 cmd 按 GBK 解析；`chcp 65001` 因 cmd 预读机制来不及生效 |
| `'ho'`、`'NAME'`、`'ist'` 不是命令 | 文件是 LF 换行，cmd 只认 CRLF，每行行首字符被吞 |

**修复配方**（与已修好的 `重装插件.bat` 完全一致，已实测三项自检）：GBK 编码 + 全量 CRLF 换行 + `chcp 936`。今后本仓库新建/编辑 `.bat` 必须遵守此配方；`.mjs` 由 node 直接执行，按 UTF-8 读、不经 cmd 解析，不受影响。

---

## 10. 战略评估：「推理签名校验与前缀绑定」能否绕过（2026-10-15 实测重写）

> 本节推翻 §5 中"方案1 不建议做"的两条论据。旧结论基于"会话文件无法读写"的前提，实测证明该前提不成立。

### 10.1 约束的本质：正面伪造 = 密码学上不可能

带推理能力的模型（Anthropic thinking、以及部分 OpenAI 兼容后端的 reasoning）在返回 assistant 消息时给推理块附 `thinkingSignature`。该签名由**服务端密钥**计算，密码学绑定推理内容（前缀绑定：内容即签名所覆盖的前缀，改一字即废）。

**结论：没有任何客户端技术能伪造合法签名。** 这不叫"难"，叫"不可能"——绕过必须换战场。

### 10.2 换战场：dsh 自己的请求层内置了「降级通道」（决定性证据）

宿主请求组装层 `pi-ai`（`@earendil-works/pi-ai/dist/api/anthropic-messages.js` 序列化器，行 1014-1048）的逻辑：

```
thinking 块无签名或签名为空 → 不发 thinking 块，直接降级为纯 text 块发送
                            （allowEmptySignature=false 分支）
thinking 块带签名           → 原样回传，服务端校验
```

**限定结论：**在 `anthropic-messages` 后端、且 `allowEmptySignature === false` 的分支里，缺失签名的 thinking 会被转换为普通 text；这只能证明序列化器的行为，**不能证明实际 provider 接受、更不能证明任意历史消息/前缀都能写回后继续生成**。不应把它描述为已验证的签名绕过。优先仅编辑最终回复的 text 块，保持 thinking、签名及工具调用原样不动；仍需验证续聊行为。

### 10.3 写回的物理通道：会话文件可读可写（推翻旧结论）

旧结论（§5.1）：会话是 zstd JSONL、内核全树搜不到解码器 → 插件无法读写。**实测推翻**：

| 实测事实 | 证据 |
|---|---|
| 会话文件 = 多帧 zstd JSONL，每条记录独立一帧 | 解压 1.4MB 会话：315 个 `28 B5 2F FD` magic 帧头 |
| node:zlib 内置 zstd（Node 22.15+），宿主 Node 24.18.1 自带 | `zstdCompress/zstdDecompress in node:zlib === true` |
| 一次性解码只吐第一帧 ≠ 没有解码器 | 官方包 `dsh-session-persistence-jsonl/lib/index.js` 的 `PublicZstdFrameDecoder`（纯公共 API 多帧适配器）+ 帧结构扫描器，可直接仿写 |

**多帧可读只证明物理上能解析；不能据此推断在线写回安全。** 文件是宿主持有的日志/状态机，还可能有索引、版本、内存缓存与恢复流程；不能在宿主运行时直接原子替换来赌兼容。

### 10.4 三条可行路径（按推荐度排序）

**路径 B（推荐）：伪造降级 + 受控回写**
1. 探针实验：确认当前 provider（workbuddy/step-5-preview）走哪个 pi-ai 后端、会话里是否真有 `thinkingSignature`；测试「改 text 块」与「改 thinking + 剥签名」后供应商是否接受。
2. Node half 增「会话外科」模块：仿 `PublicZstdFrameDecoder` 实现 read / rewrite-entry / write（写前 `.forge-backup` 备份 + 临时文件 rename 原子写）。
3. 写入纪律：仅在用户显式动作时执行；宿主有 repair 机制兜底（`.pre-repair-backup` 文件证明宿主容忍并修复损坏会话）。
4. 伪造语义：text 块直接替换（无约束）；thinking 块不动或剥签名降级；工具调用块不动（方案2 分类器已在位）。
5. UI 两档：「仅本机伪造」（现状，零风险）与「伪造并写回（模型也会相信）」（明示降级副作用）。

**路径 C（最干净，依赖宿主服务）：会话重构**
编辑点截断，把「历史 + 伪造内容」经 dsh-api-session-controller 的 sessions 服务建新会话——不带任何签名历史，约束天然不存在。前提：该服务暴露创建/导入会话的方法，需验证。

**路径 A（保底，已完成）：纯渲染层伪造**
当前插件。模型不知情，零约束触碰。与 B/C 不互斥，作为写回失败时的降级。

### 10.5 唯一真正的风险：写回与宿主状态机的竞态

宿主运行时持有会话文件并追加写入、内存里有会话副本。插件写文件后若宿主继续追加 → torn frame / 覆盖插件修改。缓解：用户显式触发 + 原子写 + 备份 + 宿主 repair 兜底；最优解是走路径 C 让宿主自己写。

### 10.6 待验证清单（下一步探针）

- [x] ~~workbuddy/step-5-preview 实际后端与是否产出签名~~（已结案：52 个会话实测，reasoning 块无任何签名字段，见 §11.3）
- [ ] 「改 text 块」后供应商是否接受（预期：接受，无约束）
- [ ] 「thinking 剥签名降级」后供应商是否接受（预期：接受，pi-ai 注释明示该行为为兼容供应商设计）
- [ ] dsh-api-session-controller 是否暴露受控写回 API（决定路径 C 可行性）

---

## 11. 阶段 G：地基收尾与真实会话 schema 实测（2026-10-15）

### 11.1 启动失败根因：已定位并修复

**症状**：插件启用后 dsh 无法启动（profile 组合层 `loadProfileDirectory` 对 bundle 解析失败只 skip 不致命，故障在 client 模块注册环节冒泡）。

**根因**：`scripts/build-client.mjs` 把 client 产物注册 id 硬编码为 `'dsh-reply-forge'`，而 package.json 的 name 是 `'@local/dsh-reply-forge'`。内核 `dsh-client-modules/lib/index.js` 的 arrive() 硬校验「模块 id 必须等于 package name」，scoped 包名被简写即报 "loaded without registering"。

**修复**：构建器改为从 package.json 读 name（`PLUGIN_ID = pkg.name`）；契约测试先复现（红）后修复（绿）。这与 §9 的 disabled 条目是两个独立故障，勿混淆。

### 11.2 只读层落地（.dsh-plugin/server/session-log.mjs）

路径 B 的第一步只做读：zstd 多帧正规扫描（Frame_Header_Descriptor 校验，防压缩数据内假 magic 误切帧）、三层布局定位（项目目录/会话目录/文件）、会话 id 双形态（裸 uuid 与 `session-` 前缀并存）、取最高世代 session.vN。配套 `/api/reply-forge/session/record` 只读路由（Node half 经 `inject:['webServer']` 注册，模式仿 dsh-tavern）。

### 11.3 真实会话 schema 实测（52 个会话文件全量解析，标志性产出）

| 事实 | 数据 |
|---|---|
| 可解析会话文件 | 52/52（新模块一次通过，无跳过） |
| 事件类型 | 36 种；**助手正文只在 `assistant/message`**（1214 条） |
| 块类型 | text 2011 / tool-call 1573 / reasoning 696 / tool-result 178 / tool-addition 103 / tool-removal 8 |
| **text 块归属陷阱** | 2011 个 text 块里 **1395 个在 `tool/result` 事件**、67 个在 `system/message`，只有 549 个在 `assistant/message`。`assistantTextBlocks` 只认 `assistant/message` 的收窄策略被真实数据验证正确，已固化为回归测试 |
| 块字段 | text 与 reasoning 的 keys 统一是 `{type,text}`；**reasoning 无 `signature`/`thinkingSignature` 字段（696/696）** |
| 事件壳 | `{type,seq,time,data,surfaceOp}`；message = `{role,content,source,id}`，source = `{kind:'model',provider,model}` |
| 签名结论 | 本机 provider（lobsterai/deepseek-flash、workbuddy/step-5-preview）**不产出签名** → §10.6 第 1 项结案 |

### 11.4 测试现状

- `tests/session-log.test.mjs`：11 项。fixture 已对齐真实 schema（`tool-call`/`reasoning` 命名、`surfaceOp`/`source`/`id` 字段）；新增两条真实数据回归：tool/result 陷阱、reasoning 无签名 key set。
- `tests/run.mjs`：7 项（契约 + 渲染 + 覆盖持久化 + 实时开关 + 指纹重名警示）。

### 11.5 下一步（路径 B 主线）

1. （用户侧）重启 dsh 验证启动失败已修复；异常则 `关闭插件.bat` 回滚。
2. 受控写回 API 调研：`dsh-api-session-controller` 暴露的 create/fork 等能支撑到什么程度（§10.6 第 4 项），决定走路径 B（文件手术）还是路径 C（宿主重构）。
3. 「改 text 块后续聊」对照探针（§10.6 第 2/3 项）——需在真实 provider 上实测一次。

---

## 12. 阶段 H：「启用但界面无变化」排查与拾取器重写（2026-10-15）

### 12.1 现象与结论

用户重启 dsh：**插件在设置里显示启用、宿主一切正常，但会话里没有任何编辑入口**。

排查链（逐层排除）：
1. **profile/bundle 层**：`cordis.patch.yml` 被启动流程规范化为 `id: dsh-reply-forge / disabled: false`，启用状态为真。
2. **宿主组合层**：在 Node 里用内核 `ClientModuleRegistry` 对真实 profile 复现扫描——图里有 `@local/dsh-reply-forge` 行，bundle 路由 200 返回 27312 字节（我们的 client.js 原文）。**宿主侧完全健康。**
3. **浏览器执行层**：无头 Edge + CDP 加载真实页面——`window.__dshReplyForge` 是 object、样式已注入、锚点 `[data-slot="main.conversation"]` 存在。**apply() 确实跑起来了。**
4. **最终根因——拾取器（picker）在真实 UI 里颗粒无收**：
   - 旧主路径按 `[class*="_body"]` 找正文容器。真实 UI 里 `wSkVaW_body` 是**整个对话滚动区**（内含全部消息、工具栏按钮）；
   - 「最外层过滤」把真正的消息容器（`hWmORq_body`）全部判为内层删掉，只剩下巨型滚动容器；
   - 巨型容器又被方案2 分类器的结构性检查（内含 button/pre）拒绝 → **一条都没接管**；
   - 而兜底路径被 `out.length === 0` 的门槛堵死（毒药先塞了东西），永远走不到。

**不是加载问题、不是启用问题，是 DOM 结构假设过时。**

### 12.2 真实 UI 结构（Edge + CDP 生产 DOM 实测）

```
[data-slot="main.conversation"]            ← 锚点（旧选择器仍有效）
└ .wSkVaW_root（对话外壳）
  └ .wSkVaW_body → .wSkVaW_scrollBody     ← _body 类是布局壳，不是正文
    └ [data-slot="conversation.session"] → viewArea
      └ [data-slot="conversation.view"]
        └ .EvIC1a_root → .EvIC1a_scroll → .EvIC1a_column
          └ div.EvIC1a_flowItem（每条消息一个）
            └ div[data-slot="conversation.chat.node"]   ← 官方 slot，消息单元
              ├ 用户消息：.Sixlwa_userRow → .Sixlwa_bubble（span 文本，无块级子元素）
              ├ 系统/上下文注入：.XrJvXW_root → title/source 行（span）
              ├ 错误行：.Sixlwa_turnErrorRow（span+code）
              ├ 用量行：.TS9iAW_root（按钮+span）
              └ 助手消息：.hWmORq_root → .hWmORq_body
                ├ div → .lcKema_root（思考块：可折叠行，子元素 span/svg）
                └ div._markdown_xxx（正文：直接子元素全是 p/ul/ol/pre…）
```

### 12.3 修复（picker.mjs 重写拾取策略）

新策略（已在真实 UI 验证 + 回归测试固化）：
1. **主路径**：`[data-slot="conversation.chat.node"]`（宿主官方槽位）→ 节点子树内找 **markdown 容器**：直接子元素里块级标签（p/pre/ul/ol/blockquote/h1-h6/table）占一半以上；
2. 节点内取最外层容器（嵌套 markdown 由外层代管）；
3. 方案2 分类器照旧过滤（含代码块/表格的回复不提供编辑入口）；
4. **兜底**：无 chat.node 槽位时走 `p.parentElement`（旧兜底，被毒药堵死的问题随 `_body` 主路径一起删除）；
5. **删除 `[class*="_body"]` 主路径**——它是回归的根因。

### 12.4 验证结果

- 无头 web 模式 + 真实会话：**两条助手回复被精确接管**（`data-rf-taken: 2`，操作条「伪造回复」×2），思考块/用户气泡/系统节点/滚动壳全部正确排除；
- 点击按钮 → 编辑器打开、预填原文（219 字符）、按钮组齐全；
- 测试 8/8 + 11/11 全绿（新增「真实 UI 结构」回归用例，钉死 chat.node 槽位策略与 _body 毒药回归）；
- 桌面版与 web 版跑同一前端产物（`index-BKQ_L1z6.js`），修复对桌面生效。

### 12.5 新工具：scripts/web-diag.mjs

无头拉起「base + web-app + 本插件」的精简 web host（默认 3080 端口，打印带 token 的 URL），用于复现本章全部排查步骤。dev checkout 的 app-boot 版本旧、会被 `dsh-preset-novel-mode` 的数组形式 patch 卡住，故脚本绕开 CLI 直接调 `boot()`（详见脚本头注释）。

### 12.6 遗留事项

- 桌面版需用户重启确认（web 模式已验证等价路径）。
- 工具结果节点（tool/result）在本 UI 里如何渲染尚未实测（你好会话无工具调用）——分类器的 ACTION_TEXT 关键词表是当前唯一防线，遇到误放行/误拒时再按真实 DOM 修正。

## 13. 阶段 I：「只有部分消息有按钮」定位与防线放宽（2026-10-15）

### 13.1 现象

用户重启 dsh：插件正常生效、伪造回复流程可用，但**只有部分消息有「伪造回复」按钮**。要查清楚：什么样的消息没有、为什么。

### 13.2 定位方法（UI 复证受阻 → 真值侧兜底）

- **UI 侧复证链全部受阻**（过程记录，避免下次重踩）：
  1. slim web host（base+web-app+reply-forge）启动正常，但默认模型 `workbuddy` provider（用户层 patch `agent-default-model` 指定）在本环境不可用 → 界面停在 onboarding hero，侧边栏 `sidebar.workspaces` 为空，会话列表不渲染；
  2. `#/session/<id>` hash 路由打不开会话（2026-10-15 白天的观察：首次 hash 加载显示 hero）。服务端 `session/list` RPC 却正常返回全部 34 个会话——**纯 UI 阻塞，与插件无关**；
  3. 完整 profile boot 失败：本地 preset 插件（free-design/novel-mode）缺依赖 `@deepseek-ai/dsh-agent-preset`；
  4. provider 侧侦察（`llm/listProviders`）：仅 `deepseek-official` 已声明，`workbuddy` 不在列表——它由桌面 GUI 启动环境注入，沙箱 host 复刻不了。
- **RPC 协议备忘**（探查副产品，以后直接复用）：页面内 `POST /api/<ns>/<method>`，body 为
  `{"type":"client-request","rpcId":"<uuid>","method":"<ns>/<method>","payload":{"args":{...}}}`；
  `session/list` 的 args **必须**含 `"_request": {}`，`llm/listProviders` 等则**不能**含。
  封装好的探针：`scripts/diag-rpc.mjs <method>[=<argsJSON>]`。
- **真值侧（本次的主证据）**：`scripts/diag-classify-truth.mjs` 不依赖 UI，对磁盘上
  34 个会话、512 个 `assistant/message` text 块直接跑 classify 纯函数，量化每道门槛。

### 13.3 结论：四道过宽的防线（全部有真实数据支撑）

| 防线 | 拒绝量 | 误伤样例（真实正文） |
|---|---|---|
| `ACTION_TAGS` 含 code/pre/table | **166/421**（文本侧合格者中被 DOM 侧 code 标签拒的占比 ≈40%） | 任何带 `` `npm run dev` `` 内联代码的回复整块没按钮 |
| `MIN_TEXT=24` | 49/512 | 「嗯，还醒着。要测什么，直接说。」（短回复恰恰最常需要伪造） |
| `ACTION_TEXT` 裸子串匹配 | 39/512 | `diff` 命中 "difference/difficult"；`patch` 命中普通技术叙述；`arguments` 命中英文常用词；`拒绝` 命中讨论拒绝的正文 |
| `ACTION_SHAPE` 正则过宽 | 3/512 | `/\s--?[a-z][a-z0-9-]{2,}/` 命中 "结论 - yes 这个方向…"式散文；裸 JSON 正则 `/m` 版命中多行文本里任意一行 `[...]` |

汇总：**修复前约 250/512（≈49%）的消息可能有按钮；修复后文本侧 504/512**（仅 8 个关键词命中，均为真工具输出文本，拒得合理）。本机会话几乎全是开发向，过半回复带代码/命令痕迹——旧防线在这个用户手里把一半以上的可编辑消息挡在按钮外。

理念修正：分类器的初衷是「别把工具调用块当正文编辑」，但 markdown 容器里的代码片段也只是助手**正文文本**，就地编辑只改本机渲染、没有记录错位风险（真正需要防的 tool/result 块由 picker 的节点/容器策略 + 强关键词兜底）。防线应从「结构猜疑」收缩到「强特征命中」。

### 13.4 修复内容

**`.dsh-plugin/client/classify.mjs`（重写，详见文件头注释）**：
1. `ACTION_TEXT` 删除 `patch`/`diff`/`arguments`（子串误伤机器），保留强特征词；
2. `ACTION_TAGS` 删除 `code`/`pre`/`table`，只剩交互控件 `button/input/select/textarea/iframe`，且**忽略插件自身注入的 UI**（`.rf-bar/.rf-editor`——否则自己的按钮会把已接管块挡在后续扫描外）；
3. 文本痕迹与形态检查前先 `stripCode()` 剥离代码围栏/行内代码（命令示例写进回复正文是常态）；
4. 命令行旗标正则要求**行首**（旧 `\s--?[a-z]` 命中 " - yes" 散文）；裸 JSON 要求**整篇**匹配（去掉 `/m`）。

**`.dsh-plugin/client/picker.mjs`（两处）**：
1. `MIN_TEXT` 24 → 1：短回复是最常伪造对象；容器形状判定（块级子元素占比）本来就排除状态行/工具栏，长度不再承担过滤职责；
2. `consider()` 自愈：已接管节点的操作条被宿主**原地重渲染**抹掉（流式更新）时，清掉 `data-rf-taken` 重新接管——否则按钮会永久消失直到整节点被换新。

**测试（10/10 + 11/11 全过，client.js 已重建、`--check` 新鲜）**：
- 新增：含代码正文必须接管；"different/patched" 英文散文不得误伤；" - yes" 散文不得误伤；短回复必须接管；自身注入按钮不得挡回重复扫描；宿主重渲染抹掉操作条后自愈重接管（MutationObserver 桩改为可触发，`fireMutations()` 辅助函数）；
- 原有「真实 UI 结构」用例（思考/用户/系统/滚动壳排除）保持通过——MIN_TEXT 放宽不破坏形状防线。

### 13.5 未验证项（诚实清单）

- 真机桌面 UI 未复验（环境受阻，见 §13.2）。分类逻辑已用 512 个真实块验证；DOM 形状逻辑与昨日已真实验证的版本一致，本轮只放宽不过收紧；
- 宿主的「复制」按钮若嵌在 markdown 容器内（代码块常见），`button` 关键词仍会拒该块——保守方向（少按钮不错改）。若用户看到「带复制按钮的代码消息仍无按钮」，按真实 DOM 精确排除宿主按钮即可；
- `tool/result` 节点在真实 UI 的渲染形状仍未实测（§12.6 遗留，依旧）。

### 13.6 新工具清单（scripts/）

| 脚本 | 用途 |
|---|---|
| `diag-classify-truth.mjs` | **真值侧**量化：不依赖 UI，对磁盘会话跑分类器，出每道门槛的拒绝数与样例 |
| `diag-rpc.mjs` | 页面上下文 RPC 探针：`node scripts/diag-rpc.mjs "session/list" "llm/listProviders="` |
| `diag-coverage.mjs` | UI 侧逐会话按钮覆盖探针（当前受 onboarding 阻塞，环境修复后可直接跑） |
| `diag-explore.mjs` / `diag-net.mjs` | 页面结构（data-slot 树/可点击项）与网络请求探查，定位「界面被谁挡住」 |
| `web-diag.mjs` | 无头拉起带插件的 web host（§12.5） |
