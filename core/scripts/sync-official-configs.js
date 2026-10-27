#!/usr/bin/env node
/**
 * 从 QQ 农场官方 CDN 强制刷新关键配置表到 core/src/gameConfig/
 *
 * 用法：
 *   node scripts/sync-official-configs.js              # 只刷新核心表（Plant / ItemInfo / MutantEffect）
 *   node scripts/sync-official-configs.js --all         # 刷新全部可映射表
 *   node scripts/sync-official-configs.js --dry-run     # 只对比，不写文件
 *   node scripts/sync-official-configs.js --skip <表>   # 跳过指定表
 *
 * 自动发现 Windows / macOS QQ 容器的 miniapp_src，
 * 复用 find-cdn-resource 的 CDN URL 构造与远程拉取逻辑。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const localConfigDir = path.join(coreRoot, 'src', 'gameConfig');

const { findLatestSource } = require('../src/services/activity-update-scanner');
const {
    assetUrl,
    bundleConfigUrl,
    buildTableIndex,
    findSettingsFile,
    parseConfigRows,
    remoteBundleNames,
    tableNameFromAssetPath,
} = require('../src/services/cdn-resource-finder');

// 官方表名 → 本地文件名映射
const TABLE_TO_LOCAL_FILE = {
    'Plant':         'Plant.json',
    'ItemInfo':      'ItemInfo.json',
    'MutantEffect':  'MutantEffect.json',
    'RoleLevel':     'RoleLevel.json',
    'SolarTerms':    'SolarTerms.json',
    'Goods':         'Goods.json',
    'TechTreeLine':  'TechTreeLine.json',
    'Task':          'Task.json',
    'Achieve':       'Achieve.json',
    'Warehouse':     'Warehouse.json',
    'SkinCfg':       'SkinCfg.json',
};

// 默认核心表
const DEFAULT_TABLES = ['Plant', 'ItemInfo', 'MutantEffect', 'RoleLevel'];

function parseArgs(argv) {
    const args = { all: false, dryRun: false, skip: [] };
    for (let i = 0; i < argv.length; i++) {
        const v = argv[i];
        if (v === '--help' || v === '-h') args.help = true;
        else if (v === '--all') args.all = true;
        else if (v === '--dry-run') args.dryRun = true;
        else if (v === '--skip') args.skip.push(...String(argv[++i] || '').split(',').filter(Boolean));
        else throw new Error(`未知参数：${v}`);
    }
    return args;
}

function usage() {
    return [
        '从 QQ 农场官方 CDN 强制刷新关键配置表到本地',
        '',
        '用法：',
        '  node scripts/sync-official-configs.js [--all] [--dry-run] [--skip TableA,TableB]',
        '',
        '核心表（默认）：Plant, ItemInfo, MutantEffect, RoleLevel',
        '全部可同步表：' + Object.keys(TABLE_TO_LOCAL_FILE).join(', '),
    ].join('\n');
}

function defaultSource() {
    const candidates = [
        path.join(os.homedir(), 'Library/Containers/com.tencent.qqexminiprogram/Data/Library',
            'Application Support/QQEX/miniapp/temps/miniapp_src'),
        path.join(process.env.APPDATA || '', 'QQEX', 'miniapp', 'temps', 'miniapp_src'),
    ].filter(Boolean);
    for (const root of candidates) {
        if (!fs.existsSync(root)) continue;
        const { latest } = findLatestSource(root);
        if (latest) return latest.directory;
    }
    throw new Error('未找到 QQ 农场 miniapp_src 源码目录（Windows 或 macOS 至少一个有）');
}

async function fetchAllTables(settings, refresh = true) {
    const cacheRoot = path.join(os.tmpdir(), 'qq-farm-bot-cdn-resource-cache');
    const tables = [];
    for (const bundle of remoteBundleNames(settings)) {
        let config;
        try {
            const configFile = path.join(cacheRoot, 'bundles', `${bundle}.json`);
            if (!refresh && fs.existsSync(configFile)) {
                config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            } else {
                const resp = await fetch(bundleConfigUrl(settings, bundle), { redirect: 'follow', signal: AbortSignal.timeout(30000) });
                if (!resp.ok) throw new Error(`${resp.status}`);
                fs.mkdirSync(path.dirname(configFile), { recursive: true });
                fs.writeFileSync(configFile, Buffer.from(await resp.arrayBuffer()));
                config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            }
        } catch (e) {
            process.stderr.write(`[跳过 bundle] ${bundle}: ${e.message}\n`);
            continue;
        }
        for (const [indexText, value] of Object.entries(config.paths || {})) {
            const assetPath = value?.[0];
            if (!String(assetPath || '').startsWith('config/')) continue;
            const url = assetUrl(settings, bundle, config, Number(indexText), 'import');
            if (!url) continue;
            const safeName = String(assetPath).replace(/[^\w.-]/g, '_');
            const tableFile = path.join(cacheRoot, 'tables', `${bundle}_${safeName}.json`);
            try {
                let serialized;
                if (!refresh && fs.existsSync(tableFile)) {
                    serialized = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
                } else {
                    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
                    if (!resp.ok) continue;
                    fs.mkdirSync(path.dirname(tableFile), { recursive: true });
                    fs.writeFileSync(tableFile, Buffer.from(await resp.arrayBuffer()));
                    serialized = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
                }
                const rows = parseConfigRows(serialized);
                if (rows) tables.push({ name: tableNameFromAssetPath(assetPath), bundle, rows });
            } catch (error) {
                process.stderr.write(`[跳过] ${bundle}/${assetPath}: ${error.message}\n`);
            }
        }
    }
    return tables;
}

function normalizeTable(n) { return String(n || '').toLowerCase().replace(/[_\s-]/g, ''); }

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); return; }

    const source = defaultSource();
    const settingsFile = findSettingsFile(source);
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

    process.stderr.write(`源码目录: ${source}\nCDN: ${settings.assets.server}\nbundleVers: ${JSON.stringify(settings.assets.bundleVers)}\n\n`);

    // 强制刷新
    process.stderr.write('从官方 CDN 拉取全部配置表（--refresh）...\n');
    const allTables = await fetchAllTables(settings, true);
    const index = buildTableIndex(allTables);

    const wantTableNames = args.all
        ? Object.keys(TABLE_TO_LOCAL_FILE)
        : DEFAULT_TABLES.filter(n => !args.skip.includes(n));
    const skipNormalized = new Set(args.skip.map(normalizeTable));

    let totalUpdated = 0, totalSkipped = 0, totalMissing = 0, totalAppended = 0;

    // 本地可能包含 EventPlants / CDN native 推断等补充字段（grow_phases、size、spine），
    // 因此官方 CDN 的行只能做"追加式合并"：本地已有 id 的行保留不动，
    // 只有官方新增的行才追加到本地文件末尾。
    for (const tableName of Object.keys(TABLE_TO_LOCAL_FILE)) {
        if (!wantTableNames.includes(tableName)) continue;
        if (skipNormalized.has(normalizeTable(tableName))) { totalSkipped++; continue; }

        const norm = normalizeTable(tableName);
        const entries = Object.entries(index.byTable || {})
            .filter(([n]) => normalizeTable(n) === norm)
            .flatMap(([, v]) => v);
        if (!entries.length) { process.stderr.write(`[未找到] ${tableName}\n`); totalMissing++; continue; }

        const rows = [...new Map(entries.map(e => [e.row?.id ?? JSON.stringify(e.row), e.row])).values()];
        rows.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));

        const localFile = path.join(localConfigDir, TABLE_TO_LOCAL_FILE[tableName]);
        let localRows = [];
        if (fs.existsSync(localFile)) {
            try { localRows = JSON.parse(fs.readFileSync(localFile, 'utf8').replace(/^\uFEFF/, '')); } catch {}
        }

        const localIds = new Set(localRows.map(r => r?.id).filter(id => id != null));
        const appendRows = rows.filter(r => r?.id != null && !localIds.has(r.id));

        if (!appendRows.length) {
            process.stderr.write(`[同步] ${tableName} → ${TABLE_TO_LOCAL_FILE[tableName]} (官方 ${rows.length}，本地 ${localRows.length}，无新增)\n`);
            totalSkipped++;
            continue;
        }

        if (args.dryRun) {
            process.stderr.write(`[dry-run] ${tableName} → ${TABLE_TO_LOCAL_FILE[tableName]}: 追加 ${appendRows.length} 行 (官方 ${rows.length}，本地 ${localRows.length})\n`);
            totalSkipped++;
            continue;
        }

        const merged = [...localRows, ...appendRows];
        merged.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
        fs.writeFileSync(localFile, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        process.stderr.write(`[已追加] ${tableName} → ${TABLE_TO_LOCAL_FILE[tableName]}: +${appendRows.length} 行 (官方 ${rows.length}，本地 ${localRows.length}，合计 ${merged.length})\n`);
        totalAppended += appendRows.length;
        totalUpdated++;
    }

    process.stderr.write(`\n完成：追加 ${totalAppended} 行到 ${totalUpdated} 张表，跳过 ${totalSkipped}，未找到 ${totalMissing}\n`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
