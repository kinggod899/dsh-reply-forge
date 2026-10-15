# dsh-reply-forge

DSH 桌面端插件：就地编辑（伪造）会话里 AI 输出的回复。

## 它做什么

在每条 AI 回复上挂一个「伪造回复」入口，点开即可就地改写正文，保存后
该条消息按你写的内容重新渲染。覆盖存在浏览器 localStorage，刷新、切标签
页后自动恢复；不改动会话落盘文件，不回写模型侧记录。

## 用法

1. 鼠标移到任意一条 AI 回复上，右上角出现「伪造回复」按钮；
2. 点开编辑器改写内容，支持 Markdown（标题、代码块、列表、表格、引用等）；
3. `Ctrl+Enter` 保存，`Esc` 取消；
4. 已改写的消息会多出一个「还原」按钮，点它删除该条覆盖；
5. 快捷键 `Alt+Shift+E` 直接编辑当前视图最后一条 AI 回复。

控制台里 `__dshReplyForge.clearAll()` 可清空当前会话的全部覆盖，
`__dshReplyForge.setEnabled(false/true)` 可实时停用/恢复编辑入口
（停用只拆除本插件注入的 UI，不动已保存的覆盖）。

同一会话内若有两条正文完全相同的消息，它们会共享同一条覆盖，
编辑器顶部会出现琥珀色警示——改动会同时作用于全部相同的消息。

## 安装

一键方式：退出 DSH 桌面端后，双击仓库根目录的「启用插件.bat」
（等价于 `node scripts/enable.mjs`）：备份配置 → 加入 bundles →
解除 disabled → 验证 junction/lockfile/产物，全部可回滚。

手动方式（已写入 `~/.dsh/profiles/desktop`）：

- `package.json` 的 `dependencies` 增加 `"@local/dsh-reply-forge": "link:<本仓库绝对路径>"`；
- `dsh.profile.bundles` 末尾追加该包；
- `node_modules/@local/dsh-reply-forge` 是指向本目录的 junction。

重启 DSH 桌面端生效。

> 启用脚本刻意不跑 `pnpm install`：启用所需的三个前提（lockfile
> 登记、junction、node_modules 完好）都在位，而 pnpm install 在 dsh
> 运行时执行会清空 node_modules —— 这是历史事故的根因。

## 卸载

反向操作即可，profile 的 `package.json` 已备份为
`package.json.bak-reply-forge`：

1. 从 `dependencies` 与 `bundles` 中移除 `@local/dsh-reply-forge`；
2. 删除 `node_modules/@local/dsh-reply-forge`；
3. 重启。覆盖数据留在 localStorage（键前缀 `dsh-reply-forge:`），
   可在浏览器控制台手动清理，不影响宿主任何状态。

## 与其它插件共处

- **不注册任何共享槽位**。UI 全靠 DOM 注入，不占用 `conversation.view`、
  `settings.plugins.tab` 等条目位，不与 gal-view 之类抢标签。
- **只插入一个 patch 条目**（`id: dsh-reply-forge`），且不与既有 bundle
  的任何条目 id 重名。
- **命名隔离**：样式类 `rf-*`、属性 `data-rf-*`、存储键 `dsh-reply-forge:*`。
- **幂等接管**：每个消息节点带 `data-rf-taken`，重复扫描不重复挂件。
- **不阻断宿主**：任何一步异常都就地吞掉并记录，不让会话渲染失败。

## 适配新版桌面端

宿主 UI 使用构建期哈希 CSS 类名（如 `.Kwoi6G_body`），写死类名会在升级后
失效。本插件改为按结构特征定位：

- 锚点用宿主官方槽位属性 `data-slot="main.conversation"`（新版）与
  `data-slot="conversation"`（alpha.1 及更早），两者都是宿主公开契约；
- 在锚点子树内按「内容块集合」识别助手消息，哈希类名只作为辅助特征；
- 锚点尚未挂载时低频重试，挂载后立即扫描一次并挂 MutationObserver。

## 开发

```bash
node scripts/build-client.mjs          # 由 client/ 源码生成 .dsh-plugin/client.js
node scripts/build-client.mjs --check  # 校验产物与源码一致（改源码后必须重跑）
node tests/run.mjs                     # 契约/渲染回归测试（10 项）
node tests/session-log.test.mjs        # 会话只读层测试（11 项，含真实 schema 回归）
node scripts/diag-classify-truth.mjs   # 真值侧量化：对磁盘真实会话跑分类器，
                                       # 输出每道门槛的拒绝数与样例（不依赖 UI）
node scripts/web-diag.mjs              # 无头拉起精简 web host（默认 :3080），
                                       # 用真实浏览器验证插件行为/排查界面问题
node scripts/diag-rpc.mjs "session/list" "llm/listProviders="   # 页面上下文 RPC 探针
```

排查「按钮不出现/只有部分出现」类问题：

1. **先跑真值侧**：`diag-classify-truth.mjs` 直接告诉你分类器会拒掉哪些
   真实消息（文本侧全量化，不需要起浏览器）。UI 侧还要再过 DOM 形状与
   `ACTION_TAGS` 两道，此项只覆盖文本侧；
2. 再起 `web-diag.mjs` + 浏览器 DevTools：`window.__dshReplyForge`（apply
   是否执行）、`[data-rf-taken]` 数量（拾取器命中数）、
   `[data-slot="conversation.chat.node"]` 数量（宿主结构是否变化）；
3. 模型不可用时 web host 会停在 onboarding hero、侧边栏不渲染会话——这是
   沙箱复验的已知阻碍（HANDOFF §13.2），此时以上一条的真值侧结论为准。

产物 `.dsh-plugin/client.js` 由脚本生成，不要手改。构建器是自研的极简
ESM→CJS 内联器（环境无 esbuild），源码因此必须保持零依赖、无 JSX。
