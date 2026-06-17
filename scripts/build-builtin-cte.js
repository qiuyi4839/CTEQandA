const fs = require('fs');

const sources = [
  {
    file: 'C:/Users/Administrator/Downloads/问答合集.txt',
    type: 'confirmed',
    label: '已确定内容',
  },
  {
    file: 'C:/Users/Administrator/Downloads/可能发生.txt',
    type: 'possible',
    label: '可能发生',
  },
];

function splitBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let header = '';
  let current = [];

  for (const line of lines) {
    if (line.startsWith('###')) {
      header = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (current.length) blocks.push(current.join('\n').trim());
      current = [line.replace(/^[-*]\s+/, '').trim()];
      continue;
    }

    if (/^\s{2,}[-*]\s+/.test(line)) {
      if (current.length) current.push(line.replace(/^\s+[-*]\s+/, '  - ').trimEnd());
      continue;
    }

    if (line.trim() && current.length) {
      current.push(line.trimEnd());
    }
  }

  if (current.length) blocks.push(current.join('\n').trim());
  return { header, blocks };
}

function cleanTitle(block) {
  let first = block.split('\n')[0].trim();
  first = first.replace(/[。.]$/, '');
  if (first.length > 34) first = `${first.slice(0, 34)}...`;
  return first || '未命名条目';
}

function keywordsFor(block, title, type) {
  const set = new Set();

  const raw = title
    .replace(/\{\{user\}\}/g, '用户')
    .replace(/[，。,.!！?？:：()（）/]/g, ' ');

  const aboutMatch = raw.match(/关于(.+?)(排序|情况|水平|衣着|歌曲|队服|做饭|酒量|体型|表现|事情)?$/);
  if (aboutMatch?.[1]) set.add(aboutMatch[1].trim());

  for (const part of raw.split(/\s+/)) {
    const keyword = part.trim();
    if (keyword.length >= 3 && keyword.length <= 18 && !/^(如果|关于|以下是|可能发生|已确定内容|用户)$/.test(keyword)) {
      set.add(keyword);
    }
  }

  return Array.from(set).slice(0, 12);
}

function triggerModeFor(block, title, type) {
  if (type === 'possible') return 'strict';

  const text = `${title}\n${block}`;
  if (/(性格|背景|家庭|关系|经历|人设|排序|水平|能力|职业|作息|打法|体型|队服|睡眠|衣着|喜欢听|胆子|酒量|做饭|抽烟|冠军|MBTI)/.test(text)) {
    return 'normal';
  }

  if (/(小时候|曾经|成为朋友|母亲|父亲|弟弟|哥哥|CTE像真正的家|手伤|退役)/.test(text)) {
    return 'broad';
  }

  return 'strict';
}

const entries = [];

for (const source of sources) {
  const text = fs.readFileSync(source.file, 'utf8');
  const { header, blocks } = splitBlocks(text);

  blocks.forEach((block, index) => {
    const title = cleanTitle(block);
    entries.push({
      id: `cte_${source.type}_${String(index + 1).padStart(3, '0')}`,
      enabled: true,
      sourceType: source.type,
      triggerMode: triggerModeFor(block, title, source.type),
      title,
      keywords: keywordsFor(block, title, source.type),
      content: block,
      note: `来自${source.label}: ${header}`,
    });
  });
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(
  'data/builtin-cte.js',
  `export const BUILTIN_CTE_ENTRIES = ${JSON.stringify(entries, null, 2)};\n`,
  'utf8',
);

console.log(`wrote ${entries.length} entries`);
