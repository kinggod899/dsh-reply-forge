// 全部样式收敛在 rf- 前缀下，且选择器一律以宿主容器为作用域起点，
// 不写全局元素选择器，避免命中其它插件或宿主的节点。

export const CSS = `
.rf-btn{
  display:inline-flex;align-items:center;gap:4px;
  height:22px;padding:0 8px;border-radius:6px;
  border:1px solid color-mix(in srgb, currentColor 22%, transparent);
  background:transparent;color:inherit;
  font:inherit;font-size:12px;line-height:1;
  cursor:pointer;opacity:.55;
  transition:opacity .12s, background-color .12s;
  white-space:nowrap;user-select:none;
}
.rf-btn:hover{opacity:1;background:color-mix(in srgb, currentColor 8%, transparent)}
.rf-btn:focus-visible{outline:2px solid color-mix(in srgb, currentColor 60%, transparent);outline-offset:1px}
.rf-btn[data-active]{opacity:1;border-color:color-mix(in srgb, #e0a34a 60%, transparent);color:#e0a34a}

/* 悬浮操作条：绝对定位于消息容器内部，不参与文档流，不改动宿主布局 */
.rf-bar{
  position:absolute;top:2px;right:6px;z-index:5;
  display:inline-flex;gap:4px;align-items:center;
  opacity:0;pointer-events:none;
  transition:opacity .14s;
}
.rf-host:hover > .rf-bar,
.rf-host:focus-within > .rf-bar,
.rf-bar:focus-within{opacity:1;pointer-events:auto}

/* 消息容器需要定位上下文：只在被接管的容器上加，宿主其余节点不受影响 */
.rf-host{position:relative}
.rf-host[data-rf-edited]{box-shadow:inset 2px 0 0 color-mix(in srgb, #e0a34a 70%, transparent)}

.rf-editor{
  display:flex;flex-direction:column;gap:8px;
  margin:6px 0;padding:10px;border-radius:10px;
  border:1px solid color-mix(in srgb, currentColor 18%, transparent);
  background:color-mix(in srgb, currentColor 4%, transparent);
}
.rf-editor textarea{
  width:100%;min-height:120px;resize:vertical;
  padding:8px 10px;border-radius:8px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
  color:inherit;font:inherit;font-size:13px;line-height:1.6;
}
.rf-editor textarea:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:1px}
.rf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rf-spacer{flex:1 1 auto}
.rf-hint{font-size:11px;opacity:.55}
.rf-warn{font-size:11px;color:#e0a34a}
.rf-primary{
  border-color:color-mix(in srgb, #4f8cff 55%, transparent);
  background:color-mix(in srgb, #4f8cff 14%, transparent);
  color:inherit;opacity:1;
}
.rf-danger{opacity:.9}
.rf-danger:hover{border-color:color-mix(in srgb, #d9534f 60%, transparent);color:#d9534f}

/* 会话级操作：挂在会话头部槽位，尺寸贴合宿主工具栏 */
.rf-session{
  display:inline-flex;align-items:center;gap:6px;
  font-size:12px;opacity:.7;padding:0 2px;
}
`
