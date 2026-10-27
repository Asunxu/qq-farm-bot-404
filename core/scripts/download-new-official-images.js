/**
 * 扫描本地 Plant / ItemInfo，从官方 CDN 下载缺失的种子图、阶段图、变异效果图。
 *
 * 用法：
 *   node scripts/download-new-official-images.js         # 扫描缺的并下载
 *   node scripts/download-new-official-images.js --dry-run   # 只列出缺哪些，不下载
 *
 * 依赖：核心配置已在 core/src/gameConfig/，settings.json 从 Windows/macOS QQ 容器自动发现。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const localDir = path.join(coreRoot, 'src', 'gameConfig');

const { findLatestSource } = require('../src/services/activity-update-scanner');
const {
    assetCandidates,
    buildTableIndex,
    cacheKey,
    findSettingsFile,
    parseConfigRows,
    remoteBundleNames,
    resolveAssetPath,
    tableNameFromAssetPath,
} = require('../src/services/cdn-resource-finder');

function parseArgs(argv) {
    const a = { dryRun: false, force: false, refresh: false };
    for (const v of argv) {
        if (v === '--dry-run') a.dryRun = true;
        else if (v === '--force') a.force = true;
        else if (v === '--refresh') a.refresh = true;
        else if (v === '--help' || v === '-h') a.help = true;
    }
    return a;
}

function defaultSource() {
    for (const root of [
        path.join(process.env.APPDATA || '', 'QQEX', 'miniapp', 'temps', 'miniapp_src'),
        path.join(os.homedir(), 'Library/Containers/com.tencent.qqexminiprogram/Data/Library',
            'Application Support/QQEX/miniapp/temps/miniapp_src'),
    ].filter(Boolean)) {
        if (!fs.existsSync(root)) continue;
        const { latest } = findLatestSource(root);
        if (latest) return latest.directory;
    }
    throw new Error('未找到 QQ 农场 miniapp_src');
}

async function download(url, target, force = false) {
    if (!force && fs.existsSync(target) && fs.statSync(target).size > 200) return 'exists';
    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!resp.ok) return `fail-${resp.status}`;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 500) return 'too-small';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, target);
    return 'downloaded';
}

function imageBytesOk(p) {
    try {
        const b = fs.readFileSync(p);
        return b.length >= 8 && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    } catch { return false; }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('node scripts/download-new-official-images.js [--dry-run] [--force] [--refresh]');
        console.log('  --force   强制覆盖已存在的图片（用服务器版本替换本地）');
        console.log('  --refresh 强制刷新 CDN bundle 配置缓存');
        console.log('  --dry-run 只打印将要下载的 URL，不实际下载');
        return;
    }

    const source = defaultSource();
    const settingsFile = findSettingsFile(source);
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const cacheRoot = path.join(os.tmpdir(), 'qq-farm-bot-cdn-resource-cache');
    const versionRoot = path.join(cacheRoot, cacheKey(settings), 'bundles');

    console.log('源码:', source);
    console.log('CDN:', settings.assets.server);
    console.log('缓存:', versionRoot);
    console.log('模式:', args.force ? 'FORCE (覆盖已存在)' : 'normal (只补缺失)');
    console.log();

    // --refresh 时清掉旧 bundle 缓存
    if (args.refresh && fs.existsSync(versionRoot)) {
        fs.rmSync(versionRoot, { recursive: true, force: true });
        console.log('已清除 bundle 配置缓存，将重新拉取');
    }

    // 加载 CDN bundle configs（force/refresh 时先拉一遍确保最新）
    const configs = new Map();
    for (const bundle of remoteBundleNames(settings)) {
        let cfgFile = path.join(versionRoot, `${bundle}.json`);
        if (!fs.existsSync(cfgFile)) {
            // 从 CDN 拉 bundle 配置
            try {
                const { bundleConfigUrl } = require('../src/services/cdn-resource-finder');
                const url = bundleConfigUrl(settings, bundle);
                const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
                if (!resp.ok) { console.warn(`  [跳过 bundle] ${bundle}: ${resp.status}`); continue; }
                const buf = Buffer.from(await resp.arrayBuffer());
                fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
                fs.writeFileSync(cfgFile, buf);
            } catch (e) {
                console.warn(`  [跳过 bundle] ${bundle}: ${e.message}`);
                continue;
            }
        }
        configs.set(bundle, JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
    }
    console.log(`已加载 ${configs.size} 个 bundle 配置\n`);

    const plantLocal = JSON.parse(fs.readFileSync(path.join(localDir, 'Plant.json'), 'utf8').replace(/^\uFEFF/, ''));
    const itemLocal = JSON.parse(fs.readFileSync(path.join(localDir, 'ItemInfo.json'), 'utf8').replace(/^\uFEFF/, ''));
    const mutantLocal = JSON.parse(fs.readFileSync(path.join(localDir, 'MutantEffect.json'), 'utf8').replace(/^\uFEFF/, ''));
    const eventPlants = JSON.parse(fs.readFileSync(path.join(localDir, 'EventPlants.json'), 'utf8').replace(/^\uFEFF/, ''));
    // EventPlants 里的 item 补进去
    const allItems = [...itemLocal];
    const seenIds = new Set(allItems.map(i => i.id));
    for (const ep of eventPlants) {
        if (ep.seed_id && !seenIds.has(ep.seed_id)) {
            allItems.push({ id: ep.seed_id, name: `${ep.name}种子`, type: 5, asset_name: ep.asset_name });
            seenIds.add(ep.seed_id);
        }
    }

    // === 1. 植物阶段图 ===
    console.log('--- 植物阶段图 ---');
    const plantImgDir = path.join(localDir, 'plant_images');
    let phaseDownloaded = 0, phaseSkip = 0, phaseNoRes = 0, phaseFail = 0, phaseOverwritten = 0;
    const phaseTargets = [];

    for (const plant of plantLocal) {
        const an = plant.asset_name;
        if (!an) continue;
        if (!/^Crop_\d+$/.test(an)) continue; // 只要 Crop_N 这种普通作物
        const cropDir = path.join(plantImgDir, an);
        if (!fs.existsSync(cropDir)) { fs.mkdirSync(cropDir, { recursive: true }); }
        for (let phase = 1; phase <= 6; phase++) {
            const target = path.join(cropDir, `${phase}.png`);
            if (!args.force && imageBytesOk(target)) { phaseSkip++; continue; }
            phaseTargets.push({ assetName: an, plantName: plant.name, phase, target, exists: fs.existsSync(target) });
        }
    }
    console.log(`需要处理的 phase 文件: ${phaseTargets.length} (已有: ${phaseSkip}, 本次 force=${args.force})`);

    // 批量解析 + 下载
    for (const t of phaseTargets) {
        let resolved = null;
        for (const pc of [
            `model/v4/${t.assetName}_${t.phase}/spriteFrame`,
            `model/v4/${t.assetName}/spriteFrame`,
        ]) {
            const r = resolveAssetPath(settings, configs, pc);
            if (r?.imageUrl) { resolved = r; break; }
        }
        if (!resolved) { phaseNoRes++; continue; }
        if (args.dryRun) { console.log(`  [dry] ${t.assetName}/${t.phase}.png → ${resolved.imageUrl}`); continue; }
        const status = await download(resolved.imageUrl, t.target, args.force);
        if (status === 'downloaded') {
            if (t.exists) phaseOverwritten++;
            else phaseDownloaded++;
        } else if (status !== 'exists') {
            phaseFail++;
            console.log(`  ✗ ${t.assetName}/${t.phase}: ${status}`);
        }
    }

    // === 2. 种子/物品图（统一命名格式）===
    // 命名规则：type=5 种子 → {itemId}_{name}种子.png；其他 item → {itemId}_{name}.png
    console.log('\n--- 种子/物品图 ---');
    const seedDir = path.join(localDir, 'seed_images_named');
    let seedDownloaded = 0, seedNoRes = 0, seedFail = 0, seedOverwritten = 0;
    const seedTargets = [];

    for (const item of allItems) {
        const id = item.id;
        if (!item.asset_name && !item.icon && !item.icon_res) continue;
        if (!args.force) {
            // 已经有任意一种有效命名 → 跳过
            const existing = fs.readdirSync(seedDir).find(f => {
                const m1 = f.match(/^(\d+)_/);
                if (m1 && +m1[1] === id) return true;
                const m2 = f.match(/^(\d+)\./);
                if (m2 && +m2[1] === id) return true;
                return false;
            });
            if (existing && imageBytesOk(path.join(seedDir, existing))) continue;
        }
        seedTargets.push({ itemId: id, name: item.name, assetName: item.asset_name, item });
    }
    console.log(`需要处理的物品图: ${seedTargets.length}`);

    for (const t of seedTargets) {
        const candidates = assetCandidates(t.item);
        let resolved = null;
        for (const c of candidates) {
            const r = resolveAssetPath(settings, configs, c);
            if (r?.imageUrl) { resolved = r; break; }
        }
        if (!resolved) { seedNoRes++; continue; }
        // 统一命名: type=5 加"种子"后缀，其他不加
        const nameStr = String(t.name || '').replace(/[^\w\u4e00-\u9fff]/g, '');
        const typeNum = Number(t.item.type);
        const suffix = typeNum === 5 ? '种子' : '';
        const safeName = `${t.itemId}_${nameStr}${suffix}.png`;
        const target = path.join(seedDir, safeName);
        const existed = fs.existsSync(target);
        if (args.dryRun) { console.log(`  [dry] seed ${t.itemId} ${t.name} → ${resolved.imageUrl}`); continue; }
        const status = await download(resolved.imageUrl, target, args.force);
        if (status === 'downloaded') {
            if (existed) seedOverwritten++;
            else seedDownloaded++;
        } else if (status !== 'exists') {
            seedFail++;
            console.log(`  ✗ seed ${t.itemId}: ${status}`);
        }
    }

    // === 3. MutantEffect 图标 ===
    console.log('\n--- 变异效果图 ---');
    const effDir = path.join(localDir, 'effect_images', 'mutant');
    let mutDownloaded = 0, mutNoRes = 0, mutOverwritten = 0;
    const mutTargets = [];
    for (const m of mutantLocal) {
        const safe = `${m.id}_${String(m.name).replace(/[^\w]/g, '')}.png`;
        const target = path.join(effDir, safe);
        if (!args.force && imageBytesOk(target)) continue;
        mutTargets.push({ eff: m, target, safe, exists: fs.existsSync(target) });
    }
    console.log(`需要处理的变异图: ${mutTargets.length}`);
    for (const t of mutTargets) {
        const candidates = assetCandidates(t.eff);
        let resolved = null;
        for (const c of candidates) {
            const r = resolveAssetPath(settings, configs, c);
            if (r?.imageUrl) { resolved = r; break; }
        }
        if (!resolved) { mutNoRes++; continue; }
        if (args.dryRun) { console.log(`  [dry] ${t.safe} → ${resolved.imageUrl}`); continue; }
        const status = await download(resolved.imageUrl, t.target, args.force);
        if (status === 'downloaded') {
            if (t.exists) mutOverwritten++;
            else mutDownloaded++;
        }
    }

    console.log(`\n=== 总结 ===`);
    console.log(`阶段图: 新增${phaseDownloaded} 覆盖${phaseOverwritten} 跳过${phaseSkip} 无路径${phaseNoRes} 失败${phaseFail}`);
    console.log(`种子图: 新增${seedDownloaded} 覆盖${seedOverwritten} 无路径${seedNoRes} 失败${seedFail}`);
    console.log(`变异图: 新增${mutDownloaded} 覆盖${mutOverwritten} 无路径${mutNoRes}`);
    if (args.dryRun) console.log('(dry-run: 未实际下载)');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
