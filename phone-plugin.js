/**
 * ============================================================
 *  小手机 — Roche 异世界通信终端插件 v1.0.0
 *  
 *  功能：
 *  - 悬浮球入口，SVG小手机图标，可拖拽，位置持久化
 *  - 聊天面板：读取线上会话消息，过滤<msg>相关内容
 *  - 实时捕捉线下<msg>标签，注入线上会话
 *  - 三种输入状态：草稿 / Enter发送(仅线上) / 发送键(触发线下)
 *  - 线下发送拦截：拼接小手机待发消息
 *  - CSS预设系统：保存/切换/编辑多套预设
 *  - 双击顶栏切换角色
 *  - 设置面板：启用/关闭、重置位置、预设管理
 *  
 *  消息格式：<msg from="角色名" device="设备名">内容</msg>
 *  数据存储：直接操作 IndexedDB (Roche_db)
 * ============================================================
 */

(function () {
  'use strict';

  // ========== 常量 ==========
  var PLUGIN_ID = 'roche-phone';
  var APP_ID = 'roche-phone-app';
  var DB_NAME = 'Roche_db';
  var MSG_STORE = 'messages';
  var CONV_STORE = 'conversations';
  var DEFAULT_MSG_LIMIT = 75;
  var CAPTURE_INTERVAL = 600; // ms
  var POLL_INTERVAL = 1500;   // 消息刷新间隔

  // <msg> 标签正则
  var MSG_TAG_REGEX = /<msg\s+from="([^"]*)"(?:\s+device="([^"]*)")?\s*>([\s\S]*?)<\/msg>/g;

  // ========== SVG 图标 ==========
  var PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="5" y="2" width="14" height="20" rx="3" ry="3"/>'
    + '<line x1="12" y1="18" x2="12" y2="18.01" stroke-width="2"/>'
    + '</svg>';

  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<line x1="22" y1="2" x2="11" y2="13"/>'
    + '<polygon points="22 2 15 22 11 13 2 9 22 2"/>'
    + '</svg>';

  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
    + '</svg>';

  var SETTINGS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="12" cy="12" r="3"/>'
    + '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    + '</svg>';

  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="6 9 12 15 18 9"/>'
    + '</svg>';

  // ========== 默认 CSS ==========
  var DEFAULT_PHONE_CSS = [
    '.roche-phone-panel {',
    '  --phone-bg: #ffffff;',
    '  --phone-header-bg: rgba(255,255,255,0.95);',
    '  --phone-header-text: #000000;',
    '  --phone-header-sub: #a1a1aa;',
    '  --phone-bubble-sent-bg: #000000;',
    '  --phone-bubble-sent-text: #ffffff;',
    '  --phone-bubble-received-bg: #f4f4f5;',
    '  --phone-bubble-received-text: #18181b;',
    '  --phone-input-bg: #f4f4f5;',
    '  --phone-input-text: #18181b;',
    '  --phone-border: #f4f4f5;',
    '  --phone-accent: #000000;',
    '  --phone-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  --phone-font-size: 14px;',
    '  --phone-bubble-radius: 18px;',
    '  --phone-shadow: 0 12px 40px rgba(0,0,0,0.15);',
    '  --phone-min-width: 280px;',
    '  --phone-min-height: 360px;',
    '  --phone-radius: 24px;',
    '}',
    '',
    '.roche-phone-panel {',
    '  position: fixed;',
    '  z-index: 99999;',
    '  min-width: var(--phone-min-width);',
    '  min-height: var(--phone-min-height);',
    '  background: var(--phone-bg);',
    '  border-radius: var(--phone-radius);',
    '  box-shadow: var(--phone-shadow);',
    '  border: 1px solid var(--phone-border);',
    '  display: flex;',
    '  flex-direction: column;',
    '  overflow: hidden;',
    '  font-family: var(--phone-font-family);',
    '  font-size: var(--phone-font-size);',
    '  transition: opacity 0.2s ease, transform 0.2s ease;',
    '  resize: both;',
    '}',
    '',
    '.roche-phone-panel.is-hidden {',
    '  opacity: 0;',
    '  transform: scale(0.92) translateY(12px);',
    '  pointer-events: none;',
    '}',
    '',
    '/* 顶栏 */',
    '.roche-phone-header {',
    '  display: flex;',
    '  align-items: center;',
    '  padding: 8px 10px;',
    '  background: var(--phone-header-bg);',
    '  backdrop-filter: blur(12px);',
    '  border-bottom: 1px solid var(--phone-border);',
    '  flex-shrink: 0;',
    '  user-select: none;',
    '  gap: 6px;',
    '}',
    '',
    '/* 拖拽区（顶栏空白区） */',
    '.roche-phone-header-drag {',
    '  flex: 1;',
    '  min-width: 20px;',
    '  min-height: 28px;',
    '  cursor: move;',
    '  -webkit-app-region: drag;',
    '}',
    '',
    '/* 缩放按钮组 */',
    '.roche-phone-size-btns {',
    '  display: flex;',
    '  gap: 2px;',
    '  flex-shrink: 0;',
    '}',
    '',
    '.roche-phone-size-btn {',
    '  width: 26px;',
    '  height: 26px;',
    '  border: none;',
    '  background: transparent;',
    '  color: var(--phone-header-sub);',
    '  border-radius: 6px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  transition: background 0.15s, color 0.15s;',
    '  font-size: 14px;',
    '  font-weight: 700;',
    '  line-height: 1;',
    '}',
    '',
    '.roche-phone-size-btn:hover {',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-header-avatar {',
    '  width: 36px;',
    '  height: 36px;',
    '  border-radius: 50%;',
    '  background: #e4e4e7;',
    '  margin-right: 10px;',
    '  flex-shrink: 0;',
    '  background-size: cover;',
    '  background-position: center;',
    '}',
    '',
    '.roche-phone-header-info {',
    '  flex: 1;',
    '  min-width: 0;',
    '  cursor: pointer;',
    '}',
    '',
    '.roche-phone-header-name {',
    '  font-weight: 700;',
    '  font-size: 15px;',
    '  color: var(--phone-header-text);',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
    '',
    '.roche-phone-header-status {',
    '  font-size: 11px;',
    '  color: var(--phone-header-sub);',
    '  letter-spacing: 0.05em;',
    '}',
    '',
    '.roche-phone-header-btn {',
    '  width: 32px;',
    '  height: 32px;',
    '  border: none;',
    '  background: transparent;',
    '  color: var(--phone-header-sub);',
    '  border-radius: 50%;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  transition: background 0.15s, color 0.15s;',
    '  flex-shrink: 0;',
    '}',
    '',
    '.roche-phone-header-btn:hover {',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-header-btn svg {',
    '  width: 18px;',
    '  height: 18px;',
    '}',
    '',
    '/* 消息列表 */',
    '.roche-phone-messages {',
    '  flex: 1;',
    '  overflow-y: auto;',
    '  padding: 12px 14px;',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 6px;',
    '  overscroll-behavior-y: contain;',
    '  scrollbar-width: thin;',
    '  scrollbar-color: rgba(0,0,0,0.12) transparent;',
    '}',
    '',
    '.roche-phone-messages::-webkit-scrollbar { width: 5px; }',
    '.roche-phone-messages::-webkit-scrollbar-track { background: transparent; }',
    '.roche-phone-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 999px; }',
    '',
    '/* 加载更多 */',
    '.roche-phone-load-more {',
    '  text-align: center;',
    '  padding: 8px 0;',
    '}',
    '',
    '.roche-phone-load-more button {',
    '  background: none;',
    '  border: 1px solid var(--phone-border);',
    '  border-radius: 999px;',
    '  padding: 6px 16px;',
    '  font-size: 12px;',
    '  color: var(--phone-header-sub);',
    '  cursor: pointer;',
    '  transition: all 0.15s;',
    '}',
    '',
    '.roche-phone-load-more button:hover {',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '/* 消息气泡 */',
    '.roche-phone-msg {',
    '  display: flex;',
    '  flex-direction: column;',
    '  max-width: 78%;',
    '}',
    '',
    '.roche-phone-msg--sent {',
    '  align-self: flex-end;',
    '  align-items: flex-end;',
    '}',
    '',
    '.roche-phone-msg--received {',
    '  align-self: flex-start;',
    '  align-items: flex-start;',
    '}',
    '',
    '.roche-phone-msg-sender {',
    '  font-size: 11px;',
    '  font-weight: 600;',
    '  color: var(--phone-header-sub);',
    '  margin-bottom: 2px;',
    '  padding: 0 4px;',
    '}',
    '',
    '.roche-phone-msg-bubble {',
    '  padding: 9px 14px;',
    '  border-radius: var(--phone-bubble-radius);',
    '  word-break: break-word;',
    '  white-space: pre-wrap;',
    '  line-height: 1.45;',
    '  font-size: var(--phone-font-size);',
    '}',
    '',
    '.roche-phone-msg--sent .roche-phone-msg-bubble {',
    '  background: var(--phone-bubble-sent-bg);',
    '  color: var(--phone-bubble-sent-text);',
    '  border-bottom-right-radius: 4px;',
    '}',
    '',
    '.roche-phone-msg--received .roche-phone-msg-bubble {',
    '  background: var(--phone-bubble-received-bg);',
    '  color: var(--phone-bubble-received-text);',
    '  border-bottom-left-radius: 4px;',
    '}',
    '',
    '.roche-phone-msg-time {',
    '  font-size: 10px;',
    '  color: var(--phone-header-sub);',
    '  margin-top: 2px;',
    '  padding: 0 4px;',
    '}',
    '',
    '/* 输入区 */',
    '.roche-phone-input-area {',
    '  display: flex;',
    '  align-items: flex-end;',
    '  padding: 10px 12px;',
    '  border-top: 1px solid var(--phone-border);',
    '  background: var(--phone-bg);',
    '  flex-shrink: 0;',
    '  gap: 8px;',
    '}',
    '',
    '.roche-phone-input {',
    '  flex: 1;',
    '  resize: none;',
    '  border: none;',
    '  outline: none;',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-input-text);',
    '  border-radius: 20px;',
    '  padding: 10px 16px;',
    '  font-family: var(--phone-font-family);',
    '  font-size: var(--phone-font-size);',
    '  line-height: 1.4;',
    '  max-height: 100px;',
    '  overflow-y: auto;',
    '}',
    '',
    '.roche-phone-input::placeholder {',
    '  color: var(--phone-header-sub);',
    '}',
    '',
    '.roche-phone-send-btn {',
    '  width: 40px;',
    '  height: 40px;',
    '  border-radius: 50%;',
    '  border: none;',
    '  background: var(--phone-accent);',
    '  color: #ffffff;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  flex-shrink: 0;',
    '  transition: transform 0.15s, opacity 0.15s;',
    '}',
    '',
    '.roche-phone-send-btn:hover {',
    '  transform: scale(1.05);',
    '}',
    '',
    '.roche-phone-send-btn:active {',
    '  transform: scale(0.95);',
    '}',
    '',
    '.roche-phone-send-btn svg {',
    '  width: 18px;',
    '  height: 18px;',
    '}',
    '',
    '/* 悬浮球 */',
    '.roche-phone-ball {',
    '  position: fixed;',
    '  z-index: 99998;',
    '  width: 52px;',
    '  height: 52px;',
    '  border-radius: 50%;',
    '  background: #ffffff;',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  user-select: none;',
    '  touch-action: none;',
    '  transition: transform 0.15s, box-shadow 0.15s;',
    '  border: 1px solid rgba(0,0,0,0.06);',
    '}',
    '',
    '.roche-phone-ball:hover {',
    '  transform: scale(1.08);',
    '  box-shadow: 0 6px 20px rgba(0,0,0,0.18);',
    '}',
    '',
    '.roche-phone-ball:active {',
    '  transform: scale(0.95);',
    '}',
    '',
    '.roche-phone-ball svg {',
    '  width: 24px;',
    '  height: 24px;',
    '  color: #18181b;',
    '}',
    '',
    '.roche-phone-ball-badge {',
    '  position: absolute;',
    '  top: -2px;',
    '  right: -2px;',
    '  min-width: 18px;',
    '  height: 18px;',
    '  border-radius: 999px;',
    '  background: #ef4444;',
    '  color: #fff;',
    '  font-size: 10px;',
    '  font-weight: 700;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 0 5px;',
    '  border: 2px solid #fff;',
    '  pointer-events: none;',
    '}',
    '',
    '.roche-phone-ball-badge.is-empty { display: none; }',
    '',
    '/* 角色选择器 */',
    '.roche-phone-char-picker {',
    '  position: absolute;',
    '  top: 100%;',
    '  left: 0;',
    '  right: 0;',
    '  background: var(--phone-bg);',
    '  border-radius: 0 0 var(--phone-radius) var(--phone-radius);',
    '  box-shadow: 0 8px 24px rgba(0,0,0,0.1);',
    '  border-top: 1px solid var(--phone-border);',
    '  max-height: 240px;',
    '  overflow-y: auto;',
    '  z-index: 10;',
    '}',
    '',
    '.roche-phone-char-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 10px;',
    '  padding: 10px 14px;',
    '  cursor: pointer;',
    '  transition: background 0.15s;',
    '}',
    '',
    '.roche-phone-char-item:hover {',
    '  background: var(--phone-input-bg);',
    '}',
    '',
    '.roche-phone-char-item.is-active {',
    '  background: var(--phone-input-bg);',
    '  font-weight: 700;',
    '}',
    '',
    '.roche-phone-char-item-avatar {',
    '  width: 32px;',
    '  height: 32px;',
    '  border-radius: 50%;',
    '  background: #e4e4e7;',
    '  flex-shrink: 0;',
    '  background-size: cover;',
    '  background-position: center;',
    '}',
    '',
    '.roche-phone-char-item-name {',
    '  font-size: 14px;',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '/* 空状态 */',
    '.roche-phone-empty {',
    '  flex: 1;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  color: var(--phone-header-sub);',
    '  padding: 40px 20px;',
    '  text-align: center;',
    '}',
    '',
    '.roche-phone-empty svg {',
    '  width: 48px;',
    '  height: 48px;',
    '  margin-bottom: 12px;',
    '  opacity: 0.3;',
    '}',
    '',
    '.roche-phone-empty p {',
    '  font-size: 13px;',
    '  line-height: 1.5;',
    '}',
    '',
    '/* 设置面板 */',
    '.roche-phone-settings {',
    '  position: absolute;',
    '  inset: 0;',
    '  background: var(--phone-bg);',
    '  z-index: 20;',
    '  display: flex;',
    '  flex-direction: column;',
    '  overflow: hidden;',
    '}',
    '',
    '.roche-phone-settings-header {',
    '  display: flex;',
    '  align-items: center;',
    '  padding: 12px 14px;',
    '  border-bottom: 1px solid var(--phone-border);',
    '  flex-shrink: 0;',
    '}',
    '',
    '.roche-phone-settings-title {',
    '  flex: 1;',
    '  font-weight: 700;',
    '  font-size: 15px;',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-settings-body {',
    '  flex: 1;',
    '  overflow-y: auto;',
    '  padding: 16px;',
    '}',
    '',
    '.roche-phone-settings-section {',
    '  margin-bottom: 20px;',
    '}',
    '',
    '.roche-phone-settings-label {',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.05em;',
    '  text-transform: uppercase;',
    '  color: var(--phone-header-sub);',
    '  margin-bottom: 8px;',
    '}',
    '',
    '.roche-phone-settings-row {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 10px 0;',
    '  border-bottom: 1px solid var(--phone-border);',
    '}',
    '',
    '.roche-phone-settings-row-label {',
    '  font-size: 14px;',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-settings-btn {',
    '  padding: 8px 16px;',
    '  border-radius: 999px;',
    '  border: 1px solid var(--phone-border);',
    '  background: var(--phone-bg);',
    '  color: var(--phone-header-text);',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  cursor: pointer;',
    '  transition: all 0.15s;',
    '}',
    '',
    '.roche-phone-settings-btn:hover {',
    '  background: var(--phone-input-bg);',
    '}',
    '',
    '.roche-phone-settings-btn--danger {',
    '  border-color: #fecaca;',
    '  color: #ef4444;',
    '}',
    '',
    '.roche-phone-settings-btn--danger:hover {',
    '  background: #fef2f2;',
    '}',
    '',
    '.roche-phone-preset-item {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 8px 12px;',
    '  border-radius: 12px;',
    '  margin-bottom: 4px;',
    '  cursor: pointer;',
    '  transition: background 0.15s;',
    '}',
    '',
    '.roche-phone-preset-item:hover {',
    '  background: var(--phone-input-bg);',
    '}',
    '',
    '.roche-phone-preset-item.is-active {',
    '  background: var(--phone-input-bg);',
    '  font-weight: 700;',
    '}',
    '',
    '.roche-phone-preset-name {',
    '  font-size: 14px;',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-preset-actions {',
    '  display: flex;',
    '  gap: 4px;',
    '}',
    '',
    '.roche-phone-preset-action {',
    '  width: 28px;',
    '  height: 28px;',
    '  border: none;',
    '  background: transparent;',
    '  color: var(--phone-header-sub);',
    '  border-radius: 50%;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-size: 14px;',
    '  transition: all 0.15s;',
    '}',
    '',
    '.roche-phone-preset-action:hover {',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-header-text);',
    '}',
    '',
    '.roche-phone-css-editor {',
    '  width: 100%;',
    '  min-height: 120px;',
    '  border: 1px solid var(--phone-border);',
    '  border-radius: 12px;',
    '  padding: 10px;',
    '  font-family: "SFMono-Regular", Consolas, monospace;',
    '  font-size: 12px;',
    '  line-height: 1.5;',
    '  resize: vertical;',
    '  background: var(--phone-input-bg);',
    '  color: var(--phone-input-text);',
    '  outline: none;',
    '}',
    '',
    '.roche-phone-css-editor:focus {',
    '  border-color: var(--phone-accent);',
    '}',
    ''
  ].join('\n');

  // ========== 全局状态 ==========
  var S = {
    roche: null,
    db: null,
    ball: null,
    panel: null,
    styleEl: null,
    isOpen: false,
    isSettingsOpen: false,
    isCharPickerOpen: false,
    // 当前角色
    currentCharId: null,
    currentConvId: null,
    currentCharName: '',
    currentCharAvatar: '',
    // 角色列表
    chars: [],
    // 消息
    messages: [],
    displayedCount: DEFAULT_MSG_LIMIT,
    hasMore: false,
    // 待提交消息（Enter发送但未触发线下的）
    pendingOnlineMsgs: [],
    // 未读计数
    unreadCount: 0,
    // 位置（left/top 定位，不会移出屏幕）
    ballPos: { left: 20, top: 200 },
    panelPos: { left: 40, top: 60 },
    panelSize: { width: 380, height: 580 },
    // CSS预设
    presets: [],
    activePreset: 'default',
    // 启用状态
    enabled: true,
    // 定时器
    intervals: [],
    observer: null,
    captureTimer: null,
    // 已处理的msg标签（防重复）
    processedMsgIds: {},
    // 上次捕捉的offline消息时间戳
    lastCaptureTimestamp: 0,
    // 拖拽状态
    dragging: false,
    dragOffset: { x: 0, y: 0 }
  };

  // ========== IndexedDB 操作 ==========
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (S.db) { resolve(S.db); return; }
      var req = indexedDB.open(DB_NAME);
      req.onsuccess = function () { S.db = req.result; resolve(S.db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function dbGetAll(storeName) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbAdd(storeName, record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(storeName, 'readwrite').objectStore(storeName).add(record);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbGetByIndex(storeName, indexName, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var index = store.index(indexName);
        var req = index.getAll(value);
        req.onsuccess = function () {
          req.result.sort(function (a, b) { return a.timestamp - b.timestamp; });
          resolve(req.result);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // ========== 工具函数 ==========
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours().toString().padStart(2, '0');
    var m = d.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  }

  function genId() {
    return Date.now() + Math.floor(Math.random() * 10000);
  }

  // ========== 持久化 ==========
  async function loadState() {
    try {
      var pos = await S.roche.storage.get('phone_ballPos');
      if (pos) S.ballPos = pos;

      var panelPos = await S.roche.storage.get('phone_panelPos');
      if (panelPos) S.panelPos = panelPos;

      var panelSize = await S.roche.storage.get('phone_panelSize');
      if (panelSize) S.panelSize = panelSize;

      var enabled = await S.roche.storage.get('phone_enabled');
      if (enabled !== null && enabled !== undefined) S.enabled = enabled;

      var presets = await S.roche.storage.get('phone_presets');
      if (presets && Array.isArray(presets)) S.presets = presets;

      var activePreset = await S.roche.storage.get('phone_activePreset');
      if (activePreset) S.activePreset = activePreset;

      var charId = await S.roche.storage.get('phone_currentCharId');
      if (charId) S.currentCharId = charId;
    } catch (e) {
      console.warn('[小手机] 加载状态失败:', e);
    }
  }

  async function saveState() {
    try {
      await S.roche.storage.set('phone_ballPos', S.ballPos);
      await S.roche.storage.set('phone_panelPos', S.panelPos);
      await S.roche.storage.set('phone_panelSize', S.panelSize);
      await S.roche.storage.set('phone_enabled', S.enabled);
      await S.roche.storage.set('phone_presets', S.presets);
      await S.roche.storage.set('phone_activePreset', S.activePreset);
      if (S.currentCharId) {
        await S.roche.storage.set('phone_currentCharId', S.currentCharId);
      }
    } catch (e) {
      console.warn('[小手机] 保存状态失败:', e);
    }
  }

  // ========== 角色加载 ==========
  async function loadChars() {
    try {
      var chars = await S.roche.character.list();
      S.chars = chars || [];
      // 如果没有当前角色，选第一个
      if (!S.currentCharId && S.chars.length > 0) {
        S.currentCharId = S.chars[0].id;
      }
      // 加载当前角色信息
      await loadCurrentChar();
    } catch (e) {
      console.warn('[小手机] 加载角色列表失败:', e);
    }
  }

  async function loadCurrentChar() {
    if (!S.currentCharId) return;
    try {
      var char = await S.roche.character.get(S.currentCharId);
      if (char) {
        S.currentCharName = char.handle || char.name || '未知';
        S.currentCharAvatar = char.avatar || '';
        S.currentConvId = char.conversationId || '';
      }
    } catch (e) {
      console.warn('[小手机] 加载角色信息失败:', e);
    }
  }

  // ========== 消息读取 ==========
  async function loadMessages() {
    if (!S.currentConvId) return;
    try {
      var allMsgs = await dbGetByIndex(MSG_STORE, 'conversationId', S.currentConvId);
      // 过滤：只显示与手机消息相关的
      // 策略：显示所有消息（因为线上会话本身就是手机消息的映射）
      S.messages = allMsgs || [];
      S.hasMore = S.messages.length > S.displayedCount;
      renderMessages();
    } catch (e) {
      console.warn('[小手机] 加载消息失败:', e);
    }
  }

  // ========== 消息渲染 ==========
  function renderMessages() {
    var container = document.querySelector('.roche-phone-messages');
    if (!container) return;

    var msgs = S.messages;
    var start = Math.max(0, msgs.length - S.displayedCount);
    var visible = msgs.slice(start);

    var html = '';

    // 加载更多按钮
    if (start > 0) {
      html += '<div class="roche-phone-load-more">'
        + '<button onclick="window.__rochePhoneLoadMore()">加载更多 (剩余 ' + start + ' 条)</button>'
        + '</div>';
    }

    for (var i = 0; i < visible.length; i++) {
      var m = visible[i];
      var isSent = m.isMe === true;
      var side = isSent ? 'sent' : 'received';
      var senderName = isSent ? '' : (m.senderHandle || m.senderName || S.currentCharName);
      var text = m.text || '';

      // 清理HTML标签，保留纯文本（小手机里只显示消息文本）
      var cleanText = text
        .replace(/<details[^>]*>[\s\S]*?<\/details>/g, '')
        .replace(/<meow_mind>[\s\S]*?<\/meow_mind>/g, '')
        .replace(/<nexus>[\s\S]*?<\/nexus>/g, '')
        .replace(/<theater>[\s\S]*?<\/theater>/g, '')
        .replace(/<stream>/g, '').replace(/<\/stream>/g, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
        .replace(/<msg[^>]*>/g, '').replace(/<\/msg>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (!cleanText) continue;

      html += '<div class="roche-phone-msg roche-phone-msg--' + side + '">';
      if (!isSent && senderName) {
        html += '<div class="roche-phone-msg-sender">' + escapeHtml(senderName) + '</div>';
      }
      html += '<div class="roche-phone-msg-bubble">' + escapeHtml(cleanText) + '</div>';
      html += '<div class="roche-phone-msg-time">' + formatTime(m.timestamp) + '</div>';
      html += '</div>';
    }

    if (!html || html.indexOf('roche-phone-msg--') === -1) {
      html = '<div class="roche-phone-empty">'
        + PHONE_SVG
        + '<p>暂无消息<br>当角色在线下发送手机消息时，会实时同步到这里</p>'
        + '</div>';
    }

    container.innerHTML = html;

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
  }

  // 全局回调：加载更多
  window.__rochePhoneLoadMore = function () {
    S.displayedCount += 50;
    loadMessages();
  };

  // ========== 消息捕捉：实时监控线下<msg>标签 ==========
  function startCapture() {
    // 方案：轮询 IndexedDB，检查当前offline会话的新消息
    // 同时用 MutationObserver 监控DOM中的<msg>标签
    startDOMCapture();
    startDBPolling();
  }

  function stopCapture() {
    if (S.observer) {
      S.observer.disconnect();
      S.observer = null;
    }
    if (S.captureTimer) {
      clearInterval(S.captureTimer);
      S.captureTimer = null;
    }
  }

  // DOM捕捉：监控聊天区域中的<msg>标签
  function startDOMCapture() {
    var chatArea = document.querySelector('.chat-scroll-area')
      || document.querySelector('main[class*="chat"]')
      || document.querySelector('main');
    if (!chatArea) return;

    S.observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          checkForMsgTags(chatArea);
        }
      }
    });

    S.observer.observe(chatArea, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // 检查DOM中的<msg>标签
  function checkForMsgTags(root) {
    if (!S.currentConvId) return;

    // 查找所有消息气泡
    var bubbles = root.querySelectorAll('.bubble-received, .chat-message--received, [class*="bubble"][class*="received"]');
    for (var i = 0; i < bubbles.length; i++) {
      var bubble = bubbles[i];
      var text = bubble.textContent || bubble.innerText || '';
      if (text.indexOf('<msg') === -1) continue;

      // 用消息的timestamp或位置作为唯一标识，防重复
      var msgKey = 'dom_' + bubble.closest('[id]')?.id || ('dom_' + i + '_' + text.length);
      if (S.processedMsgIds[msgKey]) continue;

      var msgs = parseMsgTags(text);
      if (msgs.length > 0) {
        S.processedMsgIds[msgKey] = true;
        for (var j = 0; j < msgs.length; j++) {
          injectMsgToOnline(msgs[j]);
        }
      }
    }
  }

  // DB轮询：定期检查offline会话的新消息
  function startDBPolling() {
    S.captureTimer = setInterval(function () {
      pollOfflineMessages();
    }, CAPTURE_INTERVAL);
  }

  async function pollOfflineMessages() {
    if (!S.currentConvId) return;
    try {
      // 查找对应的offline会话
      var offlineConvIds = [
        S.currentConvId + '_offline',
        S.currentConvId.replace(/^c_/, 'offline_session_')
      ];

      for (var idx = 0; idx < offlineConvIds.length; idx++) {
        var convId = offlineConvIds[idx];
        var msgs = await dbGetByIndex(MSG_STORE, 'conversationId', convId);
        if (!msgs || msgs.length === 0) continue;

        // 只检查新消息
        var newMsgs = msgs.filter(function (m) {
          return m.timestamp > S.lastCaptureTimestamp && !m.isMe;
        });

        for (var i = 0; i < newMsgs.length; i++) {
          var text = newMsgs[i].text || '';
          var parsed = parseMsgTags(text);
          for (var j = 0; j < parsed.length; j++) {
            var msgKey = 'db_' + newMsgs[i].id + '_' + j;
            if (!S.processedMsgIds[msgKey]) {
              S.processedMsgIds[msgKey] = true;
              injectMsgToOnline(parsed[j]);
            }
          }
        }

        if (newMsgs.length > 0) {
          S.lastCaptureTimestamp = Math.max(S.lastCaptureTimestamp,
            newMsgs[newMsgs.length - 1].timestamp);
        }
      }
    } catch (e) {
      // 静默
    }
  }

  // 解析<msg>标签
  function parseMsgTags(text) {
    var results = [];
    var regex = new RegExp(MSG_TAG_REGEX.source, 'g');
    var match;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: match[1] || '',
        device: match[2] || '',
        content: match[3] || ''
      });
    }
    return results;
  }

  // 注入消息到线上会话
  async function injectMsgToOnline(parsedMsg) {
    if (!S.currentConvId) return;
    var isFromUser = parsedMsg.from === 'user' || parsedMsg.from === '{{user}}';

    var msg = {
      id: genId(),
      isMe: isFromUser,
      text: parsedMsg.content,
      timestamp: Date.now(),
      conversationId: S.currentConvId
    };

    if (!isFromUser) {
      msg.senderId = S.currentCharId || '';
      msg.senderName = parsedMsg.from || S.currentCharName;
    }

    try {
      await dbAdd(MSG_STORE, msg);
      console.log('[小手机] 消息已注入线上:', parsedMsg.from, parsedMsg.content.substring(0, 30));
      // 刷新消息列表
      await loadMessages();
      // 更新未读
      if (!isFromUser && !S.isOpen) {
        S.unreadCount++;
        updateBadge();
      }
    } catch (e) {
      console.warn('[小手机] 注入消息失败:', e);
    }
  }

  // ========== 消息发送 ==========
  // Enter: 仅注入线上，不触发线下
  async function sendOnlineOnly(text) {
    if (!text.trim() || !S.currentConvId) return;

    var msg = {
      id: genId(),
      isMe: true,
      text: text.trim(),
      type: 'text',
      timestamp: Date.now(),
      conversationId: S.currentConvId
    };

    try {
      await dbAdd(MSG_STORE, msg);
      S.pendingOnlineMsgs.push(text.trim());
      console.log('[小手机] 线上消息已发送(未触发线下):', text.substring(0, 30));
      await loadMessages();
    } catch (e) {
      console.warn('[小手机] 发送线上消息失败:', e);
    }
  }

  // 发送键: 注入线上 + 触发线下
  async function sendOnlineAndOffline(text) {
    if (!text.trim()) return;

    // 先注入线上
    await sendOnlineOnly(text);

    // 收集所有待提交消息
    var allPending = S.pendingOnlineMsgs.slice();
    S.pendingOnlineMsgs = [];

    // 拼接为<msg>格式，注入线下输入框并发送
    var offlineText = allPending.map(function (t) {
      return '<msg from="user">' + t + '</msg>';
    }).join('\n');

    injectToOfflineInput(offlineText);
  }

  // 注入到线下输入框并触发发送
  function injectToOfflineInput(text) {
    var input = document.querySelector('.chat-input-textarea')
      || document.querySelector('textarea[placeholder*="Type"]')
      || document.querySelector('textarea');
    if (!input) {
      console.warn('[小手机] 找不到线下输入框');
      return;
    }

    // 获取已有内容
    var existing = input.value || '';

    // 如果已有内容，拼接；否则直接设置
    var combined = existing ? existing + '\n' + text : text;

    // 设置值
    var setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    );
    if (setter) setter.set.call(input, combined);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // 触发发送
    setTimeout(function () {
      var sendBtn = document.querySelector('.chat-input-send-button')
        || document.querySelector('.chat-input-send')
        || document.querySelector('button[class*="send"]');
      if (sendBtn) {
        sendBtn.click();
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
      }
    }, 200);
  }

  // 线下发送拦截：当用户在线下发送时，拼接小手机待发消息
  function interceptOfflineSend() {
    var sendBtn = document.querySelector('.chat-input-send-button')
      || document.querySelector('.chat-input-send')
      || document.querySelector('button[class*="send"]');
    if (!sendBtn) return;

    // 使用capture阶段拦截
    sendBtn.addEventListener('click', function (e) {
      if (S.pendingOnlineMsgs.length === 0) return;

      // 拼接待发消息
      var msgText = S.pendingOnlineMsgs.map(function (t) {
        return '<msg from="user">' + t + '</msg>';
      }).join('\n');

      var input = document.querySelector('.chat-input-textarea')
        || document.querySelector('textarea');
      if (input) {
        var existing = input.value || '';
        var combined = existing ? existing + '\n' + msgText : msgText;
        var setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        );
        if (setter) setter.set.call(input, combined);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      S.pendingOnlineMsgs = [];
    }, true); // capture phase
  }

  // ========== 悬浮球 ==========
  function createFloatingBall() {
    if (document.querySelector('.roche-phone-ball')) return;

    var ball = document.createElement('div');
    ball.className = 'roche-phone-ball';
    ball.innerHTML = PHONE_SVG + '<div class="roche-phone-ball-badge is-empty">0</div>';

    // 设置位置
    applyBallPosition(ball);

    // 点击事件
    ball.addEventListener('click', function (e) {
      if (S.dragging) return;
      togglePanel();
    });

    // 拖拽
    makeDraggable(ball, 'ball');

    document.body.appendChild(ball);
    S.ball = ball;

    if (!S.enabled) ball.style.display = 'none';
  }

  function applyBallPosition(ball) {
    // 确保不超出屏幕
    var maxLeft = window.innerWidth - 60;
    var maxTop = window.innerHeight - 60;
    S.ballPos.left = Math.max(0, Math.min(S.ballPos.left, maxLeft));
    S.ballPos.top = Math.max(0, Math.min(S.ballPos.top, maxTop));
    ball.style.left = S.ballPos.left + 'px';
    ball.style.top = S.ballPos.top + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
  }

  function updateBadge() {
    var badge = document.querySelector('.roche-phone-ball-badge');
    if (!badge) return;
    if (S.unreadCount > 0) {
      badge.textContent = S.unreadCount > 99 ? '99+' : S.unreadCount;
      badge.classList.remove('is-empty');
    } else {
      badge.classList.add('is-empty');
    }
  }

  // ========== 拖拽 ==========
  // type='ball': 拖拽元素自身
  // type='panel': 拖拽元素移动S.panel（用于拖拽区）
  function makeDraggable(el, type) {
    var startX, startY, startLeft, startTop;
    var moved = false;

    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      moved = false;
      S.dragging = false;
      startX = e.clientX;
      startY = e.clientY;

      // 确定拖拽目标
      var target = (type === 'panel' && S.panel) ? S.panel : el;
      var rect = target.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      el.setPointerCapture(e.pointerId);

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          moved = true;
          S.dragging = true;
        }
        var newLeft = startLeft + dx;
        var newTop = startTop + dy;

        // 限制在屏幕内
        var elW = target.offsetWidth;
        var elH = target.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - elW));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - elH));

        target.style.left = newLeft + 'px';
        target.style.top = newTop + 'px';
        target.style.right = 'auto';
        target.style.bottom = 'auto';

        if (type === 'ball') {
          S.ballPos.left = newLeft;
          S.ballPos.top = newTop;
        } else {
          S.panelPos.left = newLeft;
          S.panelPos.top = newTop;
        }
      }

      function onUp() {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        setTimeout(function () { S.dragging = false; }, 50);
        saveState();
      }

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    });
  }

  // ========== 聊天面板 ==========
  function createChatPanel() {
    if (document.querySelector('.roche-phone-panel')) return;

    var panel = document.createElement('div');
    panel.className = 'roche-phone-panel is-hidden';

    // 设置位置
    applyPanelPosition(panel);

    // 构建HTML
    panel.innerHTML = buildPanelHTML();

    document.body.appendChild(panel);
    S.panel = panel;

    // 监听面板尺寸变化（原生resize或按钮缩放）
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var cr = entries[i].contentRect;
          if (cr.width > 0 && cr.height > 0) {
            S.panelSize.width = Math.round(cr.width);
            S.panelSize.height = Math.round(cr.height);
          }
        }
      });
      ro.observe(panel);
      S.intervals.push(ro); // 存起来方便清理
    }

    // 绑定事件
    bindPanelEvents(panel);
  }

  function applyPanelPosition(panel) {
    // 确保不超出屏幕
    var w = S.panelSize.width;
    var h = S.panelSize.height;
    var maxLeft = window.innerWidth - w;
    var maxTop = window.innerHeight - h;
    S.panelPos.left = Math.max(0, Math.min(S.panelPos.left, maxLeft));
    S.panelPos.top = Math.max(0, Math.min(S.panelPos.top, maxTop));
    panel.style.left = S.panelPos.left + 'px';
    panel.style.top = S.panelPos.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = w + 'px';
    panel.style.height = h + 'px';
  }

  function buildPanelHTML() {
    var charName = escapeHtml(S.currentCharName || '选择角色');
    var charAvatar = S.currentCharAvatar
      ? 'background-image:url(' + escapeHtml(S.currentCharAvatar) + ')'
      : '';

    return ''
      // 顶栏：拖拽区 + 角色信息 + 缩放/设置/关闭
      + '<div class="roche-phone-header">'
      + '  <div class="roche-phone-header-drag" id="roche-phone-drag-area"></div>'
      + '  <div class="roche-phone-header-avatar" style="' + charAvatar + '"></div>'
      + '  <div class="roche-phone-header-info" id="roche-phone-char-info">'
      + '    <div class="roche-phone-header-name">' + charName + '</div>'
      + '    <div class="roche-phone-header-status">ONLINE</div>'
      + '  </div>'
      + '  <div class="roche-phone-size-btns">'
      + '    <button class="roche-phone-size-btn" id="roche-phone-shrink-btn" title="缩小">−</button>'
      + '    <button class="roche-phone-size-btn" id="roche-phone-expand-btn" title="放大">+</button>'
      + '  </div>'
      + '  <button class="roche-phone-header-btn" id="roche-phone-settings-btn" title="设置">' + SETTINGS_SVG + '</button>'
      + '  <button class="roche-phone-header-btn" id="roche-phone-close-btn" title="关闭">' + CLOSE_SVG + '</button>'
      + '</div>'
      // 角色选择器（默认隐藏）
      + '<div class="roche-phone-char-picker" id="roche-phone-char-picker" style="display:none"></div>'
      // 消息列表
      + '<div class="roche-phone-messages" id="roche-phone-messages"></div>'
      // 输入区
      + '<div class="roche-phone-input-area">'
      + '  <textarea class="roche-phone-input" id="roche-phone-input" placeholder="输入消息..." rows="1"></textarea>'
      + '  <button class="roche-phone-send-btn" id="roche-phone-send-btn" title="发送并触发线下">' + SEND_SVG + '</button>'
      + '</div>'
      // 设置面板（默认隐藏）
      + '<div class="roche-phone-settings" id="roche-phone-settings" style="display:none"></div>';
  }

  function bindPanelEvents(panel) {
    // 关闭按钮
    var closeBtn = panel.querySelector('#roche-phone-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { togglePanel(); });
    }

    // 设置按钮
    var settingsBtn = panel.querySelector('#roche-phone-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () { toggleSettings(); });
    }

    // 角色信息 - 点击显示选择器
    var charInfo = panel.querySelector('#roche-phone-char-info');
    if (charInfo) {
      charInfo.addEventListener('click', function () { toggleCharPicker(); });
    }

    // 拖拽区 - 绑定到专门的拖拽区域
    var dragArea = panel.querySelector('#roche-phone-drag-area');
    if (dragArea) {
      makeDraggable(dragArea, 'panel');
      dragArea.style.cursor = 'move';
    }

    // 缩放按钮
    var shrinkBtn = panel.querySelector('#roche-phone-shrink-btn');
    if (shrinkBtn) {
      shrinkBtn.addEventListener('click', function () { resizePanel(-60, -80); });
    }

    var expandBtn = panel.querySelector('#roche-phone-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', function () { resizePanel(60, 80); });
    }

    // 输入框
    var input = panel.querySelector('#roche-phone-input');
    if (input) {
      // Enter发送（仅线上）
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var text = input.value.trim();
          if (text) {
            sendOnlineOnly(text);
            input.value = '';
            input.style.height = 'auto';
          }
        }
      });
      // 自动调整高度
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      });
    }

    // 发送按钮（触发线下）
    var sendBtn = panel.querySelector('#roche-phone-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var input = panel.querySelector('#roche-phone-input');
        var text = (input ? input.value : '').trim();
        if (text) {
          sendOnlineAndOffline(text);
          input.value = '';
          input.style.height = 'auto';
        } else if (S.pendingOnlineMsgs.length > 0) {
          // 没有新文本但有待提交消息
          var allPending = S.pendingOnlineMsgs.slice();
          S.pendingOnlineMsgs = [];
          var offlineText = allPending.map(function (t) {
            return '<msg from="user">' + t + '</msg>';
          }).join('\n');
          injectToOfflineInput(offlineText);
        }
      });
    }
  }

  // 缩放面板
  function resizePanel(dw, dh) {
    var minW = 280;
    var minH = 360;
    var maxW = window.innerWidth - S.panelPos.left;
    var maxH = window.innerHeight - S.panelPos.top;

    S.panelSize.width = Math.max(minW, Math.min(S.panelSize.width + dw, maxW));
    S.panelSize.height = Math.max(minH, Math.min(S.panelSize.height + dh, maxH));

    if (S.panel) {
      S.panel.style.width = S.panelSize.width + 'px';
      S.panel.style.height = S.panelSize.height + 'px';
    }
    saveState();
  }

  // 窗口resize时确保不超出屏幕
  function onWindowResize() {
    if (S.ball) applyBallPosition(S.ball);
    if (S.panel) applyPanelPosition(S.panel);
  }

  function togglePanel() {
    S.isOpen = !S.isOpen;
    if (S.panel) {
      if (S.isOpen) {
        S.panel.classList.remove('is-hidden');
        S.unreadCount = 0;
        updateBadge();
        loadMessages();
      } else {
        S.panel.classList.add('is-hidden');
        closeCharPicker();
        closeSettings();
      }
    }
  }

  // ========== 角色选择器 ==========
  function toggleCharPicker() {
    S.isCharPickerOpen = !S.isCharPickerOpen;
    var picker = document.querySelector('#roche-phone-char-picker');
    if (!picker) return;

    if (S.isCharPickerOpen) {
      renderCharPicker(picker);
      picker.style.display = 'block';
    } else {
      picker.style.display = 'none';
    }
  }

  function closeCharPicker() {
    S.isCharPickerOpen = false;
    var picker = document.querySelector('#roche-phone-char-picker');
    if (picker) picker.style.display = 'none';
  }

  function renderCharPicker(container) {
    var html = '';
    for (var i = 0; i < S.chars.length; i++) {
      var c = S.chars[i];
      var name = escapeHtml(c.handle || c.name || '未知');
      var avatar = c.avatar ? 'background-image:url(' + escapeHtml(c.avatar) + ')' : '';
      var active = c.id === S.currentCharId ? ' is-active' : '';
      html += '<div class="roche-phone-char-item' + active + '" data-char-id="' + c.id + '">'
        + '<div class="roche-phone-char-item-avatar" style="' + avatar + '"></div>'
        + '<div class="roche-phone-char-item-name">' + name + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

    // 绑定点击
    var items = container.querySelectorAll('.roche-phone-char-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function () {
        var charId = this.getAttribute('data-char-id');
        switchChar(charId);
      });
    }
  }

  async function switchChar(charId) {
    S.currentCharId = charId;
    await loadCurrentChar();
    updatePanelHeader();
    closeCharPicker();
    S.displayedCount = DEFAULT_MSG_LIMIT;
    S.messages = [];
    S.pendingOnlineMsgs = [];
    S.processedMsgIds = {};
    S.lastCaptureTimestamp = 0;
    await loadMessages();
    await saveState();
  }

  function updatePanelHeader() {
    var nameEl = document.querySelector('.roche-phone-header-name');
    var avatarEl = document.querySelector('.roche-phone-header-avatar');
    if (nameEl) nameEl.textContent = S.currentCharName || '选择角色';
    if (avatarEl) {
      avatarEl.style.backgroundImage = S.currentCharAvatar
        ? 'url(' + S.currentCharAvatar + ')'
        : 'none';
    }
  }

  // ========== 设置面板 ==========
  function toggleSettings() {
    S.isSettingsOpen = !S.isSettingsOpen;
    var settings = document.querySelector('#roche-phone-settings');
    if (!settings) return;

    if (S.isSettingsOpen) {
      renderSettings(settings);
      settings.style.display = 'flex';
    } else {
      settings.style.display = 'none';
    }
  }

  function closeSettings() {
    S.isSettingsOpen = false;
    var settings = document.querySelector('#roche-phone-settings');
    if (settings) settings.style.display = 'none';
  }

  function renderSettings(container) {
    var presetItems = '';
    // 默认预设
    presetItems += '<div class="roche-phone-preset-item' + (S.activePreset === 'default' ? ' is-active' : '') + '" data-preset="default">'
      + '<span class="roche-phone-preset-name">默认</span>'
      + '<div class="roche-phone-preset-actions">'
      + '<button class="roche-phone-preset-action" data-action="apply" data-preset="default" title="应用">✓</button>'
      + '</div></div>';

    for (var i = 0; i < S.presets.length; i++) {
      var p = S.presets[i];
      presetItems += '<div class="roche-phone-preset-item' + (S.activePreset === p.id ? ' is-active' : '') + '" data-preset="' + p.id + '">'
        + '<span class="roche-phone-preset-name">' + escapeHtml(p.name) + '</span>'
        + '<div class="roche-phone-preset-actions">'
        + '<button class="roche-phone-preset-action" data-action="apply" data-preset="' + p.id + '" title="应用">✓</button>'
        + '<button class="roche-phone-preset-action" data-action="edit" data-preset="' + p.id + '" title="编辑">✎</button>'
        + '<button class="roche-phone-preset-action" data-action="delete" data-preset="' + p.id + '" title="删除">✕</button>'
        + '</div></div>';
    }

    container.innerHTML = ''
      + '<div class="roche-phone-settings-header">'
      + '  <button class="roche-phone-header-btn" id="roche-phone-settings-back">' + CHEVRON_SVG + '</button>'
      + '  <div class="roche-phone-settings-title">设置</div>'
      + '</div>'
      + '<div class="roche-phone-settings-body">'
      // 启用/关闭
      + '  <div class="roche-phone-settings-section">'
      + '    <div class="roche-phone-settings-label">悬浮球</div>'
      + '    <div class="roche-phone-settings-row">'
      + '      <span class="roche-phone-settings-row-label">启用悬浮球</span>'
      + '      <button class="roche-phone-settings-btn" id="roche-phone-toggle-enabled">'
      + (S.enabled ? '已启用' : '已关闭')
      + '</button>'
      + '    </div>'
      + '    <div class="roche-phone-settings-row">'
      + '      <span class="roche-phone-settings-row-label">重置位置</span>'
      + '      <button class="roche-phone-settings-btn" id="roche-phone-reset-pos">重置</button>'
      + '    </div>'
      + '  </div>'
      // CSS预设
      + '  <div class="roche-phone-settings-section">'
      + '    <div class="roche-phone-settings-label">样式预设</div>'
      + presetItems
      + '    <div style="margin-top:8px">'
      + '      <button class="roche-phone-settings-btn" id="roche-phone-new-preset">新建预设</button>'
      + '    </div>'
      + '  </div>'
      // CSS编辑器
      + '  <div class="roche-phone-settings-section" id="roche-phone-css-section" style="display:none">'
      + '    <div class="roche-phone-settings-label">CSS 编辑器</div>'
      + '    <textarea class="roche-phone-css-editor" id="roche-phone-css-editor" placeholder="输入自定义CSS..."></textarea>'
      + '    <div style="margin-top:8px;display:flex;gap:8px">'
      + '      <button class="roche-phone-settings-btn" id="roche-phone-save-css">保存</button>'
      + '      <button class="roche-phone-settings-btn" id="roche-phone-preview-css">预览</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    // 绑定事件
    bindSettingsEvents(container);
  }

  function bindSettingsEvents(container) {
    // 返回
    var backBtn = container.querySelector('#roche-phone-settings-back');
    if (backBtn) backBtn.addEventListener('click', function () { toggleSettings(); });

    // 启用/关闭
    var toggleBtn = container.querySelector('#roche-phone-toggle-enabled');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async function () {
        S.enabled = !S.enabled;
        if (S.ball) S.ball.style.display = S.enabled ? '' : 'none';
        if (!S.enabled && S.isOpen) togglePanel();
        toggleBtn.textContent = S.enabled ? '已启用' : '已关闭';
        await saveState();
      });
    }

    // 重置位置
    var resetBtn = container.querySelector('#roche-phone-reset-pos');
    if (resetBtn) {
      resetBtn.addEventListener('click', async function () {
        S.ballPos = { left: 20, top: 200 };
        S.panelPos = { left: 40, top: 60 };
        S.panelSize = { width: 380, height: 580 };
        if (S.ball) applyBallPosition(S.ball);
        if (S.panel) applyPanelPosition(S.panel);
        await saveState();
      });
    }

    // 预设操作
    var presetActions = container.querySelectorAll('.roche-phone-preset-action');
    for (var i = 0; i < presetActions.length; i++) {
      presetActions[i].addEventListener('click', function () {
        var action = this.getAttribute('data-action');
        var presetId = this.getAttribute('data-preset');
        handlePresetAction(action, presetId);
      });
    }

    // 新建预设
    var newBtn = container.querySelector('#roche-phone-new-preset');
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        var name = prompt('预设名称:');
        if (!name) return;
        var id = 'preset_' + Date.now();
        S.presets.push({ id: id, name: name, css: '' });
        S.activePreset = id;
        saveState().then(function () {
          renderSettings(container);
          showCSSEditor(id);
        });
      });
    }

    // CSS编辑器
    var saveCSSBtn = container.querySelector('#roche-phone-save-css');
    if (saveCSSBtn) {
      saveCSSBtn.addEventListener('click', function () {
        var editor = container.querySelector('#roche-phone-css-editor');
        if (!editor) return;
        var css = editor.value;
        // 保存到当前预设
        var preset = findPreset(S.activePreset);
        if (preset) {
          preset.css = css;
          saveState().then(function () {
            applyPresetCSS();
          });
        }
      });
    }

    var previewCSSBtn = container.querySelector('#roche-phone-preview-css');
    if (previewCSSBtn) {
      previewCSSBtn.addEventListener('click', function () {
        var editor = container.querySelector('#roche-phone-css-editor');
        if (!editor) return;
        applyCustomCSS(editor.value);
      });
    }
  }

  function handlePresetAction(action, presetId) {
    if (action === 'apply') {
      S.activePreset = presetId;
      applyPresetCSS();
      saveState();
      renderSettings(document.querySelector('#roche-phone-settings'));
    } else if (action === 'edit') {
      showCSSEditor(presetId);
    } else if (action === 'delete') {
      S.presets = S.presets.filter(function (p) { return p.id !== presetId; });
      if (S.activePreset === presetId) {
        S.activePreset = 'default';
        applyPresetCSS();
      }
      saveState();
      renderSettings(document.querySelector('#roche-phone-settings'));
    }
  }

  function showCSSEditor(presetId) {
    var section = document.querySelector('#roche-phone-css-section');
    var editor = document.querySelector('#roche-phone-css-editor');
    if (!section || !editor) return;

    section.style.display = 'block';
    var preset = findPreset(presetId);
    editor.value = preset ? preset.css : '';
  }

  function findPreset(id) {
    if (id === 'default') return { id: 'default', name: '默认', css: '' };
    for (var i = 0; i < S.presets.length; i++) {
      if (S.presets[i].id === id) return S.presets[i];
    }
    return null;
  }

  // ========== CSS 应用 ==========
  function applyPresetCSS() {
    var customCSS = '';
    var preset = findPreset(S.activePreset);
    if (preset && preset.css) {
      customCSS = preset.css;
    }
    applyCustomCSS(customCSS);
  }

  function applyCustomCSS(customCSS) {
    if (S.styleEl) S.styleEl.remove();
    S.styleEl = document.createElement('style');
    S.styleEl.setAttribute('data-roche-phone', 'true');
    S.styleEl.textContent = DEFAULT_PHONE_CSS + '\n' + (customCSS || '');
    document.head.appendChild(S.styleEl);
  }

  // ========== 消息刷新定时器 ==========
  function startMessagePolling() {
    var timer = setInterval(function () {
      if (S.isOpen && S.currentConvId) {
        loadMessages();
      }
    }, POLL_INTERVAL);
    S.intervals.push(timer);
  }

  // ========== 插件注册 ==========
  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: '小手机',
    version: '1.0.0',
    apps: [
      {
        id: APP_ID,
        name: '小手机',
        icon: 'phone_iphone',
        iconImage: '',
        async mount(container, roche) {
          S.roche = roche;

          // 加载状态
          await loadState();

          // 加载角色
          await loadChars();

          // 注入CSS
          applyPresetCSS();

          // 创建悬浮球
          createFloatingBall();

          // 创建聊天面板
          createChatPanel();

          // 启动消息捕捉
          startCapture();

          // 启动消息刷新
          startMessagePolling();

          // 拦截线下发送
          interceptOfflineSend();

          // 窗口resize时确保不超出屏幕
          window.addEventListener('resize', onWindowResize);

          // App容器显示设置入口
          container.innerHTML = '<div class="roche-plugin-phone-app" style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">'
            + '<h2 style="font-size:20px;font-weight:700;margin-bottom:16px">小手机设置</h2>'
            + '<p style="color:#71717a;font-size:14px;line-height:1.6;margin-bottom:12px">'
            + '小手机插件已在运行。点击屏幕上的悬浮球即可打开聊天界面。'
            + '</p>'
            + '<p style="color:#71717a;font-size:13px;line-height:1.5">'
            + '• 双击顶栏角色名可切换角色<br>'
            + '• Enter 发送仅同步到线上<br>'
            + '• 发送键 同时触发线下回复<br>'
            + '• 悬浮球可拖拽，位置自动保存'
            + '</p>'
            + '</div>';

          console.log('[小手机] 插件已加载 v1.0.0');
        },

        async unmount(container) {
          // 清理定时器
          for (var i = 0; i < S.intervals.length; i++) {
            var item = S.intervals[i];
            if (item && typeof item.disconnect === 'function') {
              item.disconnect(); // ResizeObserver
            } else if (typeof clearInterval === 'function') {
              clearInterval(item);
            }
          }
          S.intervals = [];

          // 停止捕捉
          stopCapture();

          // 移除resize监听
          window.removeEventListener('resize', onWindowResize);

          // 注意：不删除悬浮球和面板（保持存活）
          // 也不删除CSS样式

          container.replaceChildren();
        }
      }
    ]
  });

})();
