const fs = require('fs');

const file = 'data/builtin-cte.js';
const source = fs.readFileSync(file, 'utf8');
const json = source
  .replace(/^export const BUILTIN_CTE_ENTRIES = /, '')
  .replace(/;\s*$/, '');
const entries = JSON.parse(json);

function triggerModeFor(entry) {
  if (entry.sourceType === 'possible') return 'strict';

  const text = `${entry.title}\n${entry.content}`;
  if (/(小时候|曾经|成为朋友|母亲|父亲|弟弟|哥哥|CTE像真正的家|手伤|退役)/.test(text)) {
    return 'broad';
  }

  if (/(性格|背景|家庭|关系|经历|人设|排序|水平|能力|职业|作息|打法|体型|队服|睡眠|衣着|喜欢听|胆子|酒量|做饭|抽烟|冠军|MBTI)/.test(text)) {
    return 'normal';
  }

  return 'strict';
}

for (const entry of entries) {
  entry.triggerMode = triggerModeFor(entry);
}

fs.writeFileSync(
  file,
  `export const BUILTIN_CTE_ENTRIES = ${JSON.stringify(entries, null, 2)};\n`,
  'utf8',
);

const counts = entries.reduce((acc, entry) => {
  acc[entry.triggerMode] = (acc[entry.triggerMode] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify(counts));
