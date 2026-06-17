import { BUILTIN_CTE_ENTRIES } from './data/builtin-cte.js';

const EXTENSION_NAME = '变量知识库';
const STORAGE_KEY = 'st_variable_lorebook_state_v1';
const SETTINGS_VERSION = 2;
const SOURCE_TYPE_LABELS = {
  confirmed: '已确定内容',
  possible: '可能发生',
};
const STOP_KEYWORDS = new Set(['cte', '如果', '可能发生', '已确定内容', '{{user}}', 'user', '用户']);
const SCENE_TRIGGER_KEYWORDS = new Set([
  '结婚',
  '失联',
  '哭了',
  '不回消息',
  '打游戏',
  '沉迷游戏',
  '24小时不回消息',
  '打电竞',
  '磕cp',
  '磕他们cp',
  '磕他们之间的cp',
  '情趣玩具',
  '年龄颠倒',
  '作弊',
  '小纸条',
  '不爱惜自己',
  '厨房杀手',
]);
const CHARACTER_TRIGGER_NAMES = [
  '魏月华',
  '桑洛凡',
  '魏星泽',
  '秦述',
  '鹿言',
  '谌绪',
  '谌朔',
  '亓谢',
  '周锦宁',
  '司洛',
  '孟明赫',
  '陈野',
  '苏青黛',
];
const TRIGGER_MODE_LABELS = {
  broad: '宽泛',
  normal: '普通',
  strict: '严格',
};

const DEFAULT_STATE = {
  settings: {
    version: SETTINGS_VERSION,
    enabled: true,
    scanMessages: 6,
    maxMatches: 4,
    minScore: 1,
    maxInjectedChars: 3000,
    matchTitle: true,
    includeMatchedTitles: false,
    scanUserOnly: true,
  },
  variables: [
    { key: '当前世界观', value: '默认世界观' },
  ],
  entries: [
    {
      id: 'love_worthiness_rank',
      enabled: true,
      sourceType: 'confirmed',
      triggerMode: 'normal',
      title: '恋爱配得感排序',
      keywords: ['恋爱配得感', '配得感', '感情自信', '恋爱排序'],
      content: '关于恋爱配得感排序:\n最高: 亓谢/周锦宁.\n靠前: 魏月华/桑洛凡.\n中间: 鹿言/魏星泽.\n偏低: 谌绪/秦述.\n最低: 司洛/孟明赫.',
      note: '示例条目，可删除或改写。',
    },
    ...BUILTIN_CTE_ENTRIES,
  ],
};

let state = structuredClone(DEFAULT_STATE);
let lastMatches = [];

function getLocalForage() {
  return SillyTavern?.libs?.localforage;
}

async function loadState() {
  const localforage = getLocalForage();
  if (!localforage) return;

  const saved = await localforage.getItem(STORAGE_KEY);
  state = mergeState(saved);
  const changed = mergeBuiltinEntries();
  if (changed) await saveState();
}

async function saveState() {
  const localforage = getLocalForage();
  if (!localforage) return;

  await localforage.setItem(STORAGE_KEY, state);
}

function mergeState(saved) {
  if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_STATE);

  const settings = { ...DEFAULT_STATE.settings, ...(saved.settings || {}) };
  if ((saved.settings?.version || 1) < 2) {
    settings.includeMatchedTitles = false;
    settings.version = SETTINGS_VERSION;
  }

  return {
    settings,
    variables: Array.isArray(saved.variables) ? saved.variables : structuredClone(DEFAULT_STATE.variables),
    entries: normalizeEntries(Array.isArray(saved.entries) ? saved.entries : structuredClone(DEFAULT_STATE.entries)),
  };
}

function mergeBuiltinEntries() {
  let changed = false;
  const builtinsById = new Map(BUILTIN_CTE_ENTRIES.map((entry) => [entry.id, entry]));

  state.entries = state.entries.map((entry) => {
    const builtin = builtinsById.get(entry.id);
    if (!builtin) return entry;

    changed = true;
    return {
      ...entry,
      sourceType: builtin.sourceType,
      triggerMode: builtin.triggerMode || defaultTriggerModeForEntry(builtin),
      title: builtin.title,
      keywords: structuredClone(builtin.keywords),
      content: builtin.content,
      note: builtin.note,
    };
  });

  const existingIds = new Set(state.entries.map((entry) => entry.id));
  const existingContents = new Set(state.entries.map((entry) => normalizeText(entry.content)));
  const missing = BUILTIN_CTE_ENTRIES.filter((entry) => {
    return !existingIds.has(entry.id) && !existingContents.has(normalizeText(entry.content));
  });
  if (!missing.length) return changed;

  state.entries = [...state.entries, ...structuredClone(missing)];
  changed = true;
  return true;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function getRecentChatText(chat) {
  const count = Math.max(1, Number(state.settings.scanMessages) || 1);
  const scanSource = state.settings.scanUserOnly ? chat.filter((message) => Boolean(message?.is_user)) : chat;
  return scanSource
    .slice(-count)
    .map((message) => {
      const name = message?.name ? `${message.name}: ` : '';
      return `${name}${message?.mes || ''}`;
    })
    .join('\n');
}

function parseRegexKeyword(keyword) {
  const match = String(keyword).match(/^\/(.+)\/([a-z]*)$/i);
  if (!match) return null;

  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

function keywordScore(normalizedKeyword) {
  const baseScore = Math.max(1, Math.min(4, Math.ceil(normalizedKeyword.length / 4)));
  if (SCENE_TRIGGER_KEYWORDS.has(normalizedKeyword)) return 3;
  return isCharacterKeyword(normalizedKeyword) ? Math.max(2, baseScore) : baseScore;
}

function isCharacterKeyword(normalizedKeyword) {
  return normalizedKeyword.length >= 3
    && CHARACTER_TRIGGER_NAMES.some((name) => normalizedKeyword.includes(normalizeText(name)));
}

function scoreEntry(entry, sourceText) {
  if (!entry?.enabled) return 0;

  const rawSource = String(sourceText || '');
  const normalizedSource = normalizeText(rawSource);
  const keywords = Array.isArray(entry.keywords) ? entry.keywords.filter(Boolean) : [];
  let score = 0;
  let matchedKeywords = 0;
  let hasStrongMatch = false;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword || STOP_KEYWORDS.has(normalizedKeyword)) continue;

    const regex = parseRegexKeyword(keyword);
    if (regex) {
      regex.lastIndex = 0;
      if (regex.test(rawSource)) {
        score += 3;
        matchedKeywords += 1;
        hasStrongMatch = true;
      }
      continue;
    }

    if (normalizedKeyword && normalizedSource.includes(normalizedKeyword)) {
      score += keywordScore(normalizedKeyword);
      matchedKeywords += 1;
      if (normalizedKeyword.length >= 4 || isCharacterKeyword(normalizedKeyword)) hasStrongMatch = true;
    }
  }

  if (state.settings.matchTitle) {
    const title = normalizeText(entry.title);
    if (title && normalizedSource.includes(title)) {
      score += 2;
      hasStrongMatch = true;
    }
  }

  if (!passesTriggerMode(entry, score, matchedKeywords, hasStrongMatch)) return 0;
  return score;
}

function passesTriggerMode(entry, score, matchedKeywords, hasStrongMatch) {
  const mode = entry.triggerMode || defaultTriggerModeForEntry(entry);
  if (mode === 'broad') return score >= 1;
  if (mode === 'strict') return score >= 3 && hasStrongMatch && (matchedKeywords >= 1 || state.settings.matchTitle);
  return score >= 2 || hasStrongMatch;
}

function defaultTriggerModeForEntry(entry) {
  if (entry.sourceType === 'possible') return 'strict';
  return 'normal';
}

function getMatchedEntries(chat) {
  if (!state.settings.enabled) return [];

  const sourceText = getRecentChatText(chat);
  const minScore = Number(state.settings.minScore) || 1;
  const maxMatches = Math.max(1, Number(state.settings.maxMatches) || 1);
  const seenContents = new Set();

  return state.entries
    .map((entry) => ({ entry, score: scoreEntry(entry, sourceText) }))
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score || String(a.entry.title).localeCompare(String(b.entry.title)))
    .filter((result) => {
      const key = normalizeText(result.entry.content);
      if (seenContents.has(key)) return false;
      seenContents.add(key);
      return true;
    })
    .slice(0, maxMatches);
}

function variableMap() {
  return new Map(
    state.variables
      .filter((item) => item?.key)
      .map((item) => [String(item.key).trim(), String(item.value ?? '')]),
  );
}

function applyVariables(content) {
  const vars = variableMap();
  return String(content || '').replace(/\{\{\s*(?:var:)?([^{}]+?)\s*\}\}/g, (full, key) => {
    const trimmed = String(key).trim();
    return vars.has(trimmed) ? vars.get(trimmed) : full;
  });
}

function buildInjection(matches) {
  if (!matches.length) return '';

  const confirmed = matches.filter(({ entry }) => (entry.sourceType || 'confirmed') === 'confirmed');
  const possible = matches.filter(({ entry }) => entry.sourceType === 'possible');
  const sections = [];

  const confirmedBody = formatMatchedEntries(confirmed);
  if (confirmedBody) {
    sections.push([
      '【已确定内容】',
      '这些是已经确定的设定，可作为事实使用。',
      confirmedBody,
    ].join('\n'));
  }

  const possibleBody = formatMatchedEntries(possible);
  if (possibleBody) {
    sections.push([
      '【可能发生】',
      '这些是条件成立时可能发生的情境，不代表已经发生。只有当前剧情或用户输入符合条件时才可参考，不能当作既定事实。',
      possibleBody,
    ].join('\n'));
  }

  const body = sections.join('\n\n');
  const maxChars = Math.max(200, Number(state.settings.maxInjectedChars) || 3000);
  const clipped = body.length > maxChars ? `${body.slice(0, maxChars)}\n[变量知识库: 内容已按长度上限截断]` : body;

  return [
    '[变量知识库命中内容]',
    '以下是本轮聊天触发的设定资料。注意区分“已确定内容”和“可能发生”，不要把可能发生当成已经发生。',
    clipped,
  ].join('\n');
}

function formatMatchedEntries(matches) {
  return matches
    .map(({ entry }) => {
      const sourceType = entry.sourceType || 'confirmed';
      const label = SOURCE_TYPE_LABELS[sourceType] || SOURCE_TYPE_LABELS.confirmed;
      const title = shouldShowEntryTitle(entry) ? `【${label} / ${entry.title || '未命名条目'}】\n` : '';
      return `${title}${applyVariables(entry.content)}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

function shouldShowEntryTitle(entry) {
  if (!state.settings.includeMatchedTitles) return false;

  const title = normalizeEntryTitleForCompare(entry.title);
  const firstLine = normalizeEntryTitleForCompare(String(entry.content || '').split(/\r?\n/)[0]);
  const firstLineWithoutPrefix = firstLine.replace(/^关于/, '');

  return Boolean(title)
    && title !== firstLine
    && title !== firstLineWithoutPrefix
    && !firstLine.includes(title)
    && !firstLineWithoutPrefix.includes(title);
}

function normalizeEntryTitleForCompare(value) {
  return normalizeText(value)
    .replace(/[：:。.]$/g, '')
    .replace(/\.\.\.$/, '')
    .trim();
}

function insertSystemNote(chat, content) {
  if (!content || !Array.isArray(chat)) return;

  const note = {
    is_user: false,
    is_system: true,
    name: EXTENSION_NAME,
    send_date: Date.now(),
    mes: content,
    extra: {
      type: 'variable_lorebook_injection',
      ephemeral: true,
    },
  };

  const lastUserIndex = chat.map((message) => Boolean(message?.is_user)).lastIndexOf(true);
  const insertAt = lastUserIndex >= 0 ? lastUserIndex : Math.max(0, chat.length - 1);
  chat.splice(insertAt, 0, note);
}

globalThis.variableLorebookInterceptor = async function variableLorebookInterceptor(chat, contextSize, abort, type) {
  if (type === 'quiet') return;
  await loadState();

  const matches = getMatchedEntries(chat);
  lastMatches = matches.map(({ entry, score }) => ({ id: entry.id, title: entry.title, score }));
  const injection = buildInjection(matches);
  insertSystemNote(chat, injection);
  renderLastMatches();
};

export async function onActivate() {
  await loadState();
  registerMacro();
  mountSettings();
}

export async function onClean() {
  const localforage = getLocalForage();
  if (localforage) await localforage.removeItem(STORAGE_KEY);
}

function registerMacro() {
  const context = SillyTavern?.getContext?.();
  const macros = context?.macros;
  if (!macros?.register) return;

  try {
    macros.register('varkb', {
      description: '按标题读取变量知识库条目，例如 {{varkb::恋爱配得感排序}}',
      handler: ({ args, unnamedArgs }) => {
        const title = String(unnamedArgs?.[0] || args?.[0] || '').trim();
        const entry = state.entries.find((item) => item.enabled && item.title === title);
        return entry ? applyVariables(entry.content) : '';
      },
    });
  } catch {
    // Macro may already be registered after hot reload.
  }
}

function mountSettings() {
  const root = document.querySelector('#extensions_settings2');
  if (!root || document.querySelector('#variable-lorebook-root')) return;

  const container = document.createElement('div');
  container.id = 'variable-lorebook-root';
  container.className = 'variable-lorebook';
  root.appendChild(container);
  renderSettings();
}

function renderSettings() {
  const root = document.querySelector('#variable-lorebook-root');
  if (!root) return;

  root.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>变量知识库</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="vkb-toolbar">
          <label class="checkbox_label"><input id="vkb-enabled" type="checkbox" ${state.settings.enabled ? 'checked' : ''}>启用自动提取</label>
          <button id="vkb-add-entry" class="menu_button">新增条目</button>
          <button id="vkb-import" class="menu_button">导入</button>
          <button id="vkb-export" class="menu_button">导出</button>
          <input id="vkb-import-file" type="file" accept=".json,.txt,.md" hidden>
        </div>
        <div class="vkb-grid">
          <label>扫描最近消息数<input id="vkb-scan" type="number" min="1" max="50" value="${escapeAttr(state.settings.scanMessages)}"></label>
          <label>最多注入条目<input id="vkb-max" type="number" min="1" max="20" value="${escapeAttr(state.settings.maxMatches)}"></label>
          <label>最低命中分<input id="vkb-min-score" type="number" min="1" max="20" value="${escapeAttr(state.settings.minScore)}"></label>
          <label>注入字数上限<input id="vkb-max-chars" type="number" min="200" max="20000" step="100" value="${escapeAttr(state.settings.maxInjectedChars)}"></label>
        </div>
        <div class="vkb-toolbar">
          <label class="checkbox_label"><input id="vkb-match-title" type="checkbox" ${state.settings.matchTitle ? 'checked' : ''}>标题也参与匹配</label>
          <label class="checkbox_label"><input id="vkb-include-titles" type="checkbox" ${state.settings.includeMatchedTitles ? 'checked' : ''}>注入时包含标题</label>
          <label class="checkbox_label"><input id="vkb-scan-user-only" type="checkbox" ${state.settings.scanUserOnly ? 'checked' : ''}>只扫描用户消息</label>
        </div>
        <div class="vkb-section">
          <div class="vkb-section-title">变量</div>
          <div id="vkb-variables"></div>
          <button id="vkb-add-variable" class="menu_button">新增变量</button>
        </div>
        <div class="vkb-section">
          <div class="vkb-section-title">最近命中</div>
          <div id="vkb-last-matches" class="vkb-muted">暂无</div>
        </div>
        <div class="vkb-section">
          <input id="vkb-search" class="text_pole" placeholder="搜索标题、关键词或内容">
          <div id="vkb-entries"></div>
        </div>
      </div>
    </div>
  `;

  bindSettingsEvents();
  renderVariables();
  renderEntries();
  renderLastMatches();
}

function bindSettingsEvents() {
  bindSetting('#vkb-enabled', 'enabled', 'checked');
  bindSetting('#vkb-scan', 'scanMessages', 'value', Number);
  bindSetting('#vkb-max', 'maxMatches', 'value', Number);
  bindSetting('#vkb-min-score', 'minScore', 'value', Number);
  bindSetting('#vkb-max-chars', 'maxInjectedChars', 'value', Number);
  bindSetting('#vkb-match-title', 'matchTitle', 'checked');
  bindSetting('#vkb-include-titles', 'includeMatchedTitles', 'checked');
  bindSetting('#vkb-scan-user-only', 'scanUserOnly', 'checked');

  document.querySelector('#vkb-add-entry')?.addEventListener('click', async () => {
    state.entries.unshift({
      id: uid(),
      enabled: true,
      sourceType: 'confirmed',
      title: '新条目',
      keywords: [],
      content: '',
      note: '',
    });
    await saveState();
    renderEntries();
  });

  document.querySelector('#vkb-add-variable')?.addEventListener('click', async () => {
    state.variables.push({ key: '新变量', value: '' });
    await saveState();
    renderVariables();
  });

  document.querySelector('#vkb-import')?.addEventListener('click', () => {
    document.querySelector('#vkb-import-file')?.click();
  });

  document.querySelector('#vkb-import-file')?.addEventListener('change', handleImport);
  document.querySelector('#vkb-export')?.addEventListener('click', handleExport);
  document.querySelector('#vkb-search')?.addEventListener('input', renderEntries);
}

function bindSetting(selector, key, property, transform = (value) => value) {
  document.querySelector(selector)?.addEventListener('change', async (event) => {
    state.settings[key] = transform(event.target[property]);
    await saveState();
  });
}

function renderVariables() {
  const root = document.querySelector('#vkb-variables');
  if (!root) return;

  root.innerHTML = state.variables.map((item, index) => `
    <div class="vkb-variable-row" data-index="${index}">
      <input class="text_pole vkb-var-key" value="${escapeAttr(item.key)}" placeholder="变量名">
      <input class="text_pole vkb-var-value" value="${escapeAttr(item.value)}" placeholder="变量值">
      <button class="menu_button vkb-delete-variable">删除</button>
    </div>
  `).join('');

  root.querySelectorAll('.vkb-variable-row').forEach((row) => {
    const index = Number(row.dataset.index);
    row.querySelector('.vkb-var-key')?.addEventListener('change', async (event) => {
      state.variables[index].key = event.target.value.trim();
      await saveState();
    });
    row.querySelector('.vkb-var-value')?.addEventListener('change', async (event) => {
      state.variables[index].value = event.target.value;
      await saveState();
    });
    row.querySelector('.vkb-delete-variable')?.addEventListener('click', async () => {
      state.variables.splice(index, 1);
      await saveState();
      renderVariables();
    });
  });
}

function renderEntries() {
  const root = document.querySelector('#vkb-entries');
  if (!root) return;

  const query = normalizeText(document.querySelector('#vkb-search')?.value || '');
  const entries = state.entries.filter((entry) => {
    if (!query) return true;
    return normalizeText(`${entry.title} ${entry.keywords?.join(' ')} ${entry.content} ${entry.note}`).includes(query);
  });

  root.innerHTML = entries.map((entry) => `
    <details class="vkb-entry" data-id="${escapeAttr(entry.id)}">
      <summary>
        <input class="vkb-entry-enabled" type="checkbox" ${entry.enabled ? 'checked' : ''}>
        <span>${escapeHtml(entry.title || '未命名条目')}</span>
      </summary>
      <label>标题<input class="text_pole vkb-entry-title" value="${escapeAttr(entry.title)}"></label>
      <label>资料类型
        <select class="text_pole vkb-entry-source-type">
          <option value="confirmed" ${(entry.sourceType || 'confirmed') === 'confirmed' ? 'selected' : ''}>已确定内容</option>
          <option value="possible" ${entry.sourceType === 'possible' ? 'selected' : ''}>可能发生</option>
        </select>
      </label>
      <label>触发模式
        <select class="text_pole vkb-entry-trigger-mode">
          <option value="broad" ${(entry.triggerMode || defaultTriggerModeForEntry(entry)) === 'broad' ? 'selected' : ''}>宽泛：人设/背景，可较容易触发</option>
          <option value="normal" ${(entry.triggerMode || defaultTriggerModeForEntry(entry)) === 'normal' ? 'selected' : ''}>普通：需要明确相关词</option>
          <option value="strict" ${(entry.triggerMode || defaultTriggerModeForEntry(entry)) === 'strict' ? 'selected' : ''}>严格：细节/假设，减少误触发</option>
        </select>
      </label>
      <label>关键词，用逗号分隔；正则可写成 /表达式/i<input class="text_pole vkb-entry-keywords" value="${escapeAttr((entry.keywords || []).join(', '))}"></label>
      <label>备注<input class="text_pole vkb-entry-note" value="${escapeAttr(entry.note)}"></label>
      <label>内容<textarea class="vkb-entry-content" rows="8">${escapeHtml(entry.content)}</textarea></label>
      <div class="vkb-entry-actions">
        <button class="menu_button vkb-duplicate-entry">复制</button>
        <button class="menu_button danger_button vkb-delete-entry">删除</button>
      </div>
    </details>
  `).join('');

  root.querySelectorAll('.vkb-entry').forEach((node) => bindEntryEvents(node));
}

function bindEntryEvents(node) {
  const entry = state.entries.find((item) => item.id === node.dataset.id);
  if (!entry) return;

  node.querySelector('.vkb-entry-enabled')?.addEventListener('change', async (event) => {
    entry.enabled = event.target.checked;
    await saveState();
  });
  node.querySelector('.vkb-entry-title')?.addEventListener('change', async (event) => {
    entry.title = event.target.value.trim();
    await saveState();
    renderEntries();
  });
  node.querySelector('.vkb-entry-source-type')?.addEventListener('change', async (event) => {
    entry.sourceType = event.target.value === 'possible' ? 'possible' : 'confirmed';
    if (!entry.triggerMode) entry.triggerMode = defaultTriggerModeForEntry(entry);
    await saveState();
  });
  node.querySelector('.vkb-entry-trigger-mode')?.addEventListener('change', async (event) => {
    entry.triggerMode = ['broad', 'normal', 'strict'].includes(event.target.value) ? event.target.value : 'normal';
    await saveState();
  });
  node.querySelector('.vkb-entry-keywords')?.addEventListener('change', async (event) => {
    entry.keywords = event.target.value.split(',').map((item) => item.trim()).filter(Boolean);
    await saveState();
  });
  node.querySelector('.vkb-entry-note')?.addEventListener('change', async (event) => {
    entry.note = event.target.value;
    await saveState();
  });
  node.querySelector('.vkb-entry-content')?.addEventListener('change', async (event) => {
    entry.content = event.target.value;
    await saveState();
  });
  node.querySelector('.vkb-duplicate-entry')?.addEventListener('click', async () => {
    state.entries.unshift({ ...structuredClone(entry), id: uid(), title: `${entry.title} 副本` });
    await saveState();
    renderEntries();
  });
  node.querySelector('.vkb-delete-entry')?.addEventListener('click', async () => {
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    await saveState();
    renderEntries();
  });
}

function renderLastMatches() {
  const root = document.querySelector('#vkb-last-matches');
  if (!root) return;

  root.innerHTML = lastMatches.length
    ? lastMatches.map((match) => `<span class="vkb-pill">${escapeHtml(match.title)} · ${match.score}</span>`).join('')
    : '<span class="vkb-muted">暂无</span>';
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  const imported = parseImport(text, file.name);
  state.variables = mergeVariables(state.variables, imported.variables);
  state.entries = [...imported.entries, ...state.entries];
  await saveState();
  event.target.value = '';
  renderVariables();
  renderEntries();
}

function parseImport(text, filename) {
  if (/\.json$/i.test(filename)) {
    const parsed = JSON.parse(text);
    const importedState = Array.isArray(parsed) ? { entries: parsed } : parsed;
    return {
      variables: normalizeVariables(importedState.variables || []),
      entries: normalizeEntries(importedState.entries || []),
    };
  }

  return {
    variables: [],
    entries: parseTextEntries(text),
  };
}

function normalizeVariables(variables) {
  return variables
    .map((item) => ({
      key: String(item.key || item.name || '').trim(),
      value: String(item.value ?? ''),
    }))
    .filter((item) => item.key);
}

function normalizeEntries(entries) {
  return entries
    .map((item) => ({
      id: item.id || uid(),
      enabled: item.enabled !== false,
      sourceType: item.sourceType === 'possible' ? 'possible' : 'confirmed',
      triggerMode: ['broad', 'normal', 'strict'].includes(item.triggerMode) ? item.triggerMode : defaultTriggerModeForEntry(item),
      title: String(item.title || item.name || '未命名条目').trim(),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : String(item.keywords || '').split(',').map((keyword) => keyword.trim()).filter(Boolean),
      content: String(item.content || item.text || ''),
      note: String(item.note || ''),
    }))
    .filter((item) => item.content);
}

function parseTextEntries(text) {
  return String(text)
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const firstLine = lines[0] || '未命名条目';
      const title = firstLine.replace(/[：:]\s*$/, '').trim();
      return {
        id: uid(),
        enabled: true,
        sourceType: 'confirmed',
        triggerMode: 'normal',
        title,
        keywords: [title],
        content: block,
        note: '从文本导入，请按需补充关键词。',
      };
    });
}

function mergeVariables(current, incoming) {
  const map = new Map(current.map((item) => [item.key, item]));
  for (const item of incoming) map.set(item.key, item);
  return Array.from(map.values());
}

function handleExport() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'variable-lorebook.json';
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
