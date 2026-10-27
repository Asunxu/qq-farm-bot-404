/**
 * 清理 seed_images_named 里同内容重复文件，只删"所有数字 ID 都被同组其他文件覆盖"的冗余。
 *
 * 规则：
 *   - 每个文件提取其文件名中出现的所有数字 token 作为 ID 集合
 *   - 同 hash 组内，一个文件只有当它的所有 ID 都在组内其他文件的 ID 并集中时才可以删
 *   - 选 canonical 文件：覆盖 ID 并集最大的那个
 *   - 已删文件保留在 .removed/ 目录可随时恢复
 *
 * 用法：node scripts/dedupe-seed-images.js [--apply]
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIR = path.join(ROOT, 'plugins', 'material-plugin', 'assets', 'seed_images_named');
const REMOVED_DIR = path.join(ROOT, 'plugins', 'material-plugin', 'assets', 'seed_images_named', '.removed');
const APPLY = process.argv.includes('--apply');

if (!fs.existsSync(SCAN_DIR)) { console.error('目录不存在:', SCAN_DIR); process.exit(1); }

function fileHash(fp) {
  return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
}
function extractIds(fn) {
  const nums = String(fn).match(/\d+/g);
  return nums ? [...new Set(nums.map(n => Number(n)).filter(n => n > 0))] : [];
}

const files = fs.readdirSync(SCAN_DIR);
const hashToFiles = new Map();
let total = 0;
for (const f of files) {
  const fp = path.join(SCAN_DIR, f);
  if (!fs.statSync(fp).isFile()) continue;
  const ext = path.extname(f).toLowerCase();
  if (!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)) continue;
  total++;
  const h = fileHash(fp);
  if (!hashToFiles.has(h)) hashToFiles.set(h, []);
  const ids = extractIds(f);
  hashToFiles.get(h).push({ filename: f, ids: new Set(ids) });
}

// 已从 .removed/ 恢复的话要先手动挪回，不自动处理

console.log('扫描文件:', total, ' 唯一内容:', hashToFiles.size);

// 也把 .removed/ 里的加回来再跑一遍 apply（如果存在）
const removedDir = path.join(SCAN_DIR, '.removed');
if (fs.existsSync(removedDir)) {
  const removed = fs.readdirSync(removedDir);
  for (const f of removed) {
    const src = path.join(removedDir, f);
    const dst = path.join(SCAN_DIR, f);
    if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
      if (APPLY) { fs.renameSync(src, dst); }
      else { console.log('[DRY-RUN] 恢复已删文件: ' + f); }
    }
  }
  if (APPLY) console.log('已从 .removed/ 恢复之前备份的文件');
}

let removedCount = 0;
let removedBytes = 0;
let skippedUnique = 0;

for (const [hash, group] of hashToFiles) {
  if (group.length <= 1) continue;

  // 1. 选 canonical：覆盖 ID 数最多的（tie-break：纯数字优先、最长命名优先）
  group.sort((a, b) => {
    if (b.ids.size !== a.ids.size) return b.ids.size - a.ids.size;
    const aPure = /^\d+\.(?:png|jpg|jpeg|webp|gif)$/i.test(a.filename) ? 0 : 1;
    const bPure = /^\d+\.(?:png|jpg|jpeg|webp|gif)$/i.test(b.filename) ? 0 : 1;
    if (aPure !== bPure) return aPure - bPure;
    return b.filename.length - a.filename.length;
  });
  const canonical = group[0];

  // 2. 算组内整体 ID 并集
  const allIds = new Set();
  for (const g of group) for (const id of g.ids) allIds.add(id);

  // 3. 逐个判断能否删：它的所有 ID 都被 (组内 - 它自己) 的其他文件覆盖 → 可删
  const redundant = [];
  const keep = [canonical];  // canonical 永远留
  for (const g of group.slice(1)) {
    // 其他文件的 ID 并集
    const others = new Set();
    for (const h of group) {
      if (h === g) continue;
      for (const id of h.ids) others.add(id);
    }
    // g 的所有 ID 是否都被 others 覆盖？
    let covered = true;
    for (const id of g.ids) { if (!others.has(id)) { covered = false; break; } }
    if (covered) redundant.push(g);
    else { keep.push(g); skippedUnique++; }
  }

  if (redundant.length === 0) continue;

  console.log('\n组 hash=' + hash.slice(0,8) + '  (' + group.length + '份, ID总数=' + allIds.size + ')');
  console.log('  留: ' + canonical.filename + ' (覆盖 ' + canonical.ids.size + ' 个 ID)');
  for (const k of keep.slice(1)) console.log('  留: ' + k.filename + ' (有独特 ID)');
  for (const r of redundant) {
    const fp = path.join(SCAN_DIR, r.filename);
    const size = fs.statSync(fp).size;
    console.log('  删: ' + r.filename + ' (' + size + 'B)');
    if (APPLY) {
      fs.mkdirSync(REMOVED_DIR, { recursive: true });
      fs.renameSync(fp, path.join(REMOVED_DIR, r.filename));
    }
    removedCount++;
    removedBytes += size;
  }
}

console.log('\n=== 摘要 ===');
console.log(APPLY ? '实际执行:' : 'DRY-RUN (加 --apply 才真删):');
console.log('  将删除: ' + removedCount + ' 份');
console.log('  跳过有独特 ID、必须保留: ' + skippedUnique + ' 份');
console.log('  节省空间: ' + (removedBytes / 1024).toFixed(1) + ' KB');
if (APPLY) console.log('  已删文件备份在: ' + REMOVED_DIR + ' (想恢复可移回)');
