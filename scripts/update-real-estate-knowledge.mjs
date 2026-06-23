import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const knowledgePath = path.join(dataDir, 'real-estate-knowledge.json');
const sourcesPath = path.join(dataDir, 'real-estate-sources.json');
const now = new Date().toISOString();

const sourceTargets = [
  { category: 'purchase_restriction', name: '上海市房屋管理局', url: 'https://fgj.sh.gov.cn/' },
  { category: 'purchase_restriction', name: '上海市人民政府', url: 'https://www.shanghai.gov.cn/' },
  { category: 'loan_policy', name: '上海市人民政府', url: 'https://www.shanghai.gov.cn/' },
  { category: 'tax_policy', name: '上海市人民政府', url: 'https://www.shanghai.gov.cn/' },
  { category: 'tax_policy', name: '上海市房屋管理局', url: 'https://fgj.sh.gov.cn/' },
  { category: 'market_trend', name: '上海市房屋管理局', url: 'https://fgj.sh.gov.cn/' },
  { category: 'market_trend', name: '上海市人民政府', url: 'https://www.shanghai.gov.cn/' },
  { category: 'land_auction', name: '上海市规划和自然资源局', url: 'https://ghzyj.sh.gov.cn/' },
  { category: 'third_fourth_generation_housing', name: '上海市规划和自然资源局', url: 'https://ghzyj.sh.gov.cn/' },
  { category: 'third_fourth_generation_housing', name: '上海市房屋管理局', url: 'https://fgj.sh.gov.cn/' }
];

function sha256(text) {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchSource(target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: { 'user-agent': 'property-filter-knowledge-updater/1.0' }
    });
    const html = await response.text();
    const text = stripHtml(html);
    return {
      ...target,
      ok: response.ok,
      status: response.status,
      title: `${target.name} ${target.category}`,
      contentSample: text,
      contentHash: sha256(`${response.status}|${text}`)
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: 'error',
      title: `${target.name} ${target.category}`,
      contentSample: String(error.message || error).slice(0, 500),
      contentHash: sha256(`error|${error.message || error}`)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function defaultKnowledge() {
  return {
    version: 'github-actions-seed',
    updatedAt: now,
    scope: '上海房地产通用知识库。暂不包含小区对口学区和停车情况。',
    disclaimer: '政策、利率、税费和市场数据会变化，正式交易前应以政府部门、交易中心、银行、公积金中心和税务部门最新口径为准。',
    categories: []
  };
}

await mkdir(dataDir, { recursive: true });
const knowledge = await readJson(knowledgePath, defaultKnowledge());
const sourceState = await readJson(sourcesPath, { updatedAt: now, sources: [] });
const existing = new Map((sourceState.sources || []).map((item) => [`${item.category}|${item.url}`, item]));
const fetched = await Promise.all(sourceTargets.map(fetchSource));
let changedCount = 0;
const sources = fetched.map((item) => {
  const key = `${item.category}|${item.url}`;
  const previous = existing.get(key);
  const changed = !previous || previous.contentHash !== item.contentHash;
  if (changed) changedCount += 1;
  return {
    id: previous?.id || sha256(key).slice(0, 16),
    category: item.category,
    title: item.title,
    url: item.url,
    contentHash: item.contentHash,
    firstSeenAt: previous?.firstSeenAt || now,
    lastSeenAt: now,
    status: item.ok ? 'checked' : 'fetch_failed',
    httpStatus: item.status,
    changed,
    contentSample: item.contentSample
  };
});

knowledge.updatedAt = now;
knowledge.lastAutoUpdate = {
  updatedAt: now,
  sourceCount: sources.length,
  changedSourceCount: changedCount,
  note: changedCount
    ? `检测到 ${changedCount} 个参考来源内容变化，已刷新来源指纹。知识条目需结合人工或后续脚本精编。`
    : '参考来源未检测到实质变化。'
};

await writeFile(knowledgePath, `${JSON.stringify(knowledge, null, 2)}\n`, 'utf8');
await writeFile(sourcesPath, `${JSON.stringify({ updatedAt: now, changedSourceCount: changedCount, sources }, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ updatedAt: now, changedSourceCount: changedCount, sourceCount: sources.length }, null, 2));
