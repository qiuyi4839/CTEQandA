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

const names = [
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
  'CTE',
  '耶耶',
  '{{user}}',
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

  for (const name of names) {
    if (block.includes(name)) set.add(name);
  }

  const raw = title
    .replace(/\{\{user\}\}/g, '用户')
    .replace(/[，。,.!！?？:：()（）/]/g, ' ');

  for (const part of raw.split(/\s+/)) {
    const keyword = part.trim();
    if (keyword.length >= 2 && keyword.length <= 12 && !/^(如果|关于|以下是)$/.test(keyword)) {
      set.add(keyword);
    }
  }

  if (type === 'possible') {
    set.add('如果');
    set.add('可能发生');
  }

  return Array.from(set).slice(0, 12);
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
