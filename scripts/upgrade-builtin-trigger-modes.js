const fs = require('fs');

const file = 'data/builtin-cte.js';
const source = fs.readFileSync(file, 'utf8');
const json = source
  .replace(/^export const BUILTIN_CTE_ENTRIES = /, '')
  .replace(/;\s*$/, '');
const entries = JSON.parse(json);
const characterNames = [
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
const topicTerms = [
  '恋爱配得感',
  '配得感',
  '吵架',
  '肯定',
  '夸奖',
  '流泪',
  '关怀',
  '温柔',
  '恶劣',
  '关系',
  '喜欢',
  '拒绝',
  '心动',
  '银行卡',
  '相处',
  '酒吧',
  '艺术',
  '生病',
  '安全',
  '操心',
  '纯情',
  '过敏',
  '许愿',
  '底线',
  'MVP',
  'FMVP',
  '酒量',
  '做饭',
  '打架',
  '胆子',
  '衣品',
  '衣服',
  '穿搭',
  '阳光男大',
  '简单朴素',
  '睡眠',
  '睡衣',
  '队服',
  '唱歌',
  '歌曲',
  '听歌',
  '宠物',
  '耶耶',
  '手机游戏',
  '游戏',
  '外卖',
  '奶茶',
  '马卡龙',
  '红包',
  '麻将',
  '驾照',
  '护肤',
  '抽烟',
  '豆汁',
  '染发',
  '聚会',
  '生活品质',
  '柏拉图',
  '力气',
  '营业',
  '放狠话',
  '微博',
  '旅游',
  'CP',
  '钉',
  '喝多',
  '喝醉',
  '迟到',
  '没钱',
  '借钱',
  '睡太晚',
  '生物钟',
  '黑咖啡',
  '枸杞',
  'cp',
  '朋友',
  '年龄颠倒',
  '树枝',
  '搭讪',
  '亲密关系',
  '研究员',
  '黑化',
  'Dirty Talk',
  'MVP',
  '怀孕',
  '小动物',
  '昵称',
  '冠军',
  '手伤',
  '退役',
  '打法',
  'LOL',
  'MBTI',
  '体型',
  '家庭',
  '父亲',
  '母亲',
  '弟弟',
  '哥哥',
  '家',
  '初代CTE',
  '小动物',
  '性爱',
  '做爱',
  '自慰',
  '口交',
  '乳交',
  '性欲',
  '奶子',
  '精液',
  '情趣内衣',
  '情趣玩具',
  '内裤',
  '丝袜',
  '结婚',
  '哭',
  '失联',
  '受伤',
  '厨房杀手',
  '取外号',
  '一百万',
  '纹身',
];
const broadGenericTopics = new Set([
  '肯定',
  '夸奖',
  '流泪',
  '关怀',
  '相处',
  '衣服',
  '关系',
  '旅游',
  '冠军',
  '护肤',
  '过敏',
  '许愿',
  '朋友',
  '父亲',
  '母亲',
  '弟弟',
  '哥哥',
]);
const groupAliasTopics = new Set([
  '酒量',
  '做饭',
  '抽烟',
  '冠军',
  'MBTI',
  '体型',
  '队服',
  '睡眠',
  '睡衣',
  '歌曲',
  '打架',
  '胆子',
]);

function uniqueKeywords(items) {
  const result = [];
  const seen = new Set();

  for (const item of items) {
    const keyword = String(item || '')
      .replace(/\{\{user\}\}/g, '用户')
      .replace(/[，。,.!！?？:：()（）【】\[\]"“”]/g, '')
      .trim();

    if (!keyword || keyword.length < 2 || keyword.length > 12) continue;
    if (/^(如果|关于|以下是|可能发生|已确定内容|用户|CTE)$/.test(keyword)) continue;
    if (keyword.length > 8 && /[的是会在和]/.test(keyword)) continue;
    if (seen.has(keyword)) continue;

    seen.add(keyword);
    result.push(keyword);
    if (result.length >= 10) break;
  }

  return result;
}

function keywordsFor(entry) {
  const text = `${entry.title}\n${entry.content}`;
  const mode = triggerModeFor(entry);
  const names = characterNames.filter((name) => text.includes(name));
  const topics = topicTerms.filter((term) => text.includes(term));
  const keywords = [];

  const about = text.match(/关于(.{2,12}?)(排序|情况|水平|衣着|歌曲|队服|做饭|酒量|体型|表现|事情)?[:：\n]/);
  if (about?.[1]) keywords.push(about[1], `${about[1]}${about[2] || ''}`);

  for (const topic of topics) {
    if (mode !== 'broad' || !broadGenericTopics.has(topic)) {
      keywords.push(topic);
    }
    if (mode === 'normal' && entry.sourceType === 'confirmed' && groupAliasTopics.has(topic)) {
      keywords.push(`CTE${topic}`, `成员${topic}`);
    }
    if (/(排序|水平|情况|表现)$/.test(entry.title) || /排序/.test(text)) {
      keywords.push(`${topic}排序`);
    }
  }

  for (const name of names.slice(0, 3)) {
    for (const topic of topics.slice(0, 3)) {
      keywords.push(`${name}${topic}`);
    }
  }

  const compactTitle = entry.title
    .replace(/\.\.\.$/, '')
    .replace(/^如果/, '')
    .replace(/^关于/, '')
    .trim();
  keywords.push(compactTitle);

  return uniqueKeywords(keywords);
}

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
  entry.keywords = keywordsFor(entry);
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
