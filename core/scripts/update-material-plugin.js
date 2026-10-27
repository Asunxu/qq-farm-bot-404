#!/usr/bin/env node
/**
 * 一站式更新基础素材插件。
 *
 * 组合：
 *   1. （可选）跑 extract-plant-phase-images 刷新阶段图 / Spine 导出 / ASTC 解码；
 *   2. （可选）跑 find-cdn-resource.js 触发 CDN 配置表缓存刷新；
 *   3. 检查 EventPlants.json 等增量表；
 *   4. 打包 core/src/gameConfig → 素材插件 zip；
 *   5. （可选）curl 上传到正在运行的管理员后台 /api/plugins/upload。
 *
 * 用法：
 *   # 最常用：直接把当前 gameConfig 打包（Windows 首选，零前置）
 *   node scripts/update-material-plugin.js
 *   node scripts/update-material-plugin.js --bump-patch --upload --token $TOKEN
 *
 *   # macOS：先跑官方 QQ 缓存导出再打包（--download-missing 会拉 CDN 补缓存里没的）
 *   node scripts/update-material-plugin.js --extract --download-missing --bump-minor
 *   node scripts/update-material-plugin.js --extract --assets Crop_6030,Crop_9003 --bump-patch
 *
 *   # 指定 mac miniapp_src 解包目录做 CDN-only 刷新
 *   node scripts/update-material-plugin.js --source ~/.../1112386029_3_xxx --bump-patch
 *
 *   # 手动指定版本号
 *   node scripts/update-material-plugin.js --version 1.1.0
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const coreRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;

function parseVersion(v) {
    const match = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`版本号不合法：${v}`);
    return match.slice(1, 4).map(Number);
}

function bump(version, which) {
    const [major, minor, patch] = parseVersion(version);
    if (which === 'major') return `${major + 1}.0.0`;
    if (which === 'minor') return `${major}.${minor + 1}.0`;
    if (which === 'patch') return `${major}.${minor}.${patch + 1}`;
    return version;
}

function currentInstalledVersion() {
    // 优先读 registry.json
    const registryCandidates = [
        path.join(coreRoot, 'data', 'plugins', 'registry.json'),
        path.resolve(coreRoot, '..', 'data', 'plugins', 'registry.json'),
    ];
    for (const p of registryCandidates) {
        if (fs.existsSync(p)) {
            try {
                const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
                const found = (reg.plugins || []).find(item => item.id === 'material-plugin' || item.id === 'game-material-plugin');
                if (found) return found.version;
            } catch {}
        }
    }
    // 再查打包脚本默认产物里的 manifest.json
    const zipPath = path.join(coreRoot, 'dist', 'material-plugin', 'manifest.json');
    if (fs.existsSync(zipPath)) {
        try { return JSON.parse(fs.readFileSync(zipPath, 'utf8')).version; } catch {}
    }
    return null;
}

function parseArgs(argv) {
    const args = {
        extract: false,
        cdn: false,
        assets: '',
        source: '',
        downloadMissing: false,
        version: '',
        bump: '',
        upload: false,
        host: 'http://localhost:3007',
        token: '',
        out: '',
        installTool: false,
        package: true,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const v = argv[i];
        if (v === '--extract') args.extract = true;
        else if (v === '--cdn') args.cdn = true;
        else if (v === '--install-tool') args.installTool = true;
        else if (v === '--download-missing') args.downloadMissing = true;
        else if (v === '--assets') args.assets = argv[++i];
        else if (v === '--source') args.source = argv[++i];
        else if (v === '--version') args.version = argv[++i];
        else if (v === '--bump-patch') args.bump = 'patch';
        else if (v === '--bump-minor') args.bump = 'minor';
        else if (v === '--bump-major') args.bump = 'major';
        else if (v === '--no-package') args.package = false;
        else if (v === '--upload') args.upload = true;
        else if (v === '--host') args.host = argv[++i];
        else if (v === '--token') args.token = argv[++i];
        else if (v === '--out') args.out = path.resolve(argv[++i]);
        else if (v === '-h' || v === '--help') {
            console.log(`一站式更新基础素材插件

流程：可选跑 extract-plant-phases 刷新植物阶段图 / CDN 配置缓存刷新 → 打包 gameConfig → 可选上传。

依赖：
  macOS：extract 步骤需要 QQ 容器缓存；--download-missing 用 curl 拉 CDN；--install-tool 首次下载 astcenc。
  Windows：跳过 extract 步骤，直接打包现有 gameConfig。--source 指向已解包 miniapp_src 目录可跑 CDN-only 配置表刷新。

用法：
  node scripts/update-material-plugin.js [flags]

常用组合：
  # Windows 本地直接打包（零前置）
  node scripts/update-material-plugin.js --bump-patch

  # macOS：从 QQ 容器缓存导出全部植物阶段图（跨账号 gamecaches）
  node scripts/update-material-plugin.js --extract --download-missing --install-tool --bump-patch

  # 只刷新指定新作物（活动增量）
  node scripts/update-material-plugin.js --extract --assets Crop_6030,Crop_9003 --bump-patch

  # 手动传 miniapp_src 解包目录做 CDN-only 配置刷新
  node scripts/update-material-plugin.js --cdn --source ~/.../1112386029_3_xxx --bump-minor

  # 指定版本号并上传（需宿主运行 + admin token）
  node scripts/update-material-plugin.js --version 1.2.0 --upload --host http://localhost:3007 --token \$TOKEN
`);
            process.exit(0);
        }
    }
    return args;
}

function runScript(scriptPath, extraArgs) {
    console.log(`\n==> 执行 node ${path.relative(coreRoot, scriptPath)} ${extraArgs.join(' ')}`);
    const result = spawnSync(nodeBin, [scriptPath, ...extraArgs], { cwd: coreRoot, stdio: 'inherit', timeout: 600_000 });
    if (result.error) throw new Error(result.error.message);
    if (result.status !== 0) throw new Error(`脚本退出码 ${result.status}`);
}

function step(name, fn) {
    console.log(`\n▸ ${name}`);
    try {
        fn();
        console.log(`  ✓ ${name} 完成`);
    } catch (err) {
        console.error(`  ✗ ${name} 失败：${err.message}`);
        process.exit(1);
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const gameConfigDir = path.join(coreRoot, 'src', 'gameConfig');
    if (!fs.existsSync(gameConfigDir)) {
        console.error(`gameConfig 目录不存在：${gameConfigDir}`);
        process.exit(1);
    }

    // 决定版本号
    let version = args.version;
    if (!version) {
        const base = currentInstalledVersion() || '1.0.0';
        version = bump(base, args.bump || 'patch');
        console.log(`版本：未指定，当前已安装 ${base} → 自动 ${args.bump || 'patch'} bump → ${version}`);
    } else {
        console.log(`版本：${version}`);
    }

    // Step 1: （可选）刷新 CDN 配置表缓存
    if (args.cdn) {
        const findScript = path.join(coreRoot, 'scripts', 'find-cdn-resource.js');
        const extra = ['--list-tables', '--refresh'];
        if (args.source) extra.push('--source', args.source);
        step('刷新 CDN 配置表缓存', () => runScript(findScript, extra));
    }

    // Step 2: （可选）从官方缓存导出植物阶段图
    if (args.extract) {
        const extractScript = path.join(coreRoot, 'scripts', 'extract-plant-phase-images.js');
        const extra = [];
        if (args.installTool) extra.push('--install-tool');
        if (args.downloadMissing) extra.push('--download-missing');
        if (args.assets) extra.push('--assets', args.assets);
        if (!args.assets) extra.push('--all');
        step('导出植物阶段图 / Spine / ASTC 解码', () => runScript(extractScript, extra));
    } else if (args.extract === false && !args.cdn) {
        console.log('\n▸ 跳过 extract 步骤（使用现有 gameConfig 产物）');
    }

    // Step 3: 校验 EventPlants.json 等增量表是否有效 JSON
    step('校验 gameConfig 增量 JSON', () => {
        for (const rel of ['EventPlants.json', 'MallImageSupplement.json', 'MutantEffect.json']) {
            const full = path.join(gameConfigDir, rel);
            if (!fs.existsSync(full)) continue;
            const text = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
            const data = JSON.parse(text);
            const count = Array.isArray(data) ? data.length : Object.keys(data).length;
            console.log(`  • ${rel}: ${count} 条目`);
        }
    });

    // Step 4: 打包素材插件 zip
    if (args.package) {
        const packScript = path.join(coreRoot, 'scripts', 'pack-material-plugin.js');
        const packArgs = ['--version', version];
        if (args.out) packArgs.push('--out', args.out);
        step('打包素材插件 zip', () => runScript(packScript, packArgs));
    }

    // Step 5: （可选）上传到运行中的宿主
    if (args.upload) {
        if (!args.token) { console.error('upload 需要 --token'); process.exit(1); }
        const host = args.host.replace(/\/$/, '');
        const zipPath = args.out || path.join(coreRoot, 'dist', `material-plugin-${version}.zip`);
        if (!fs.existsSync(zipPath)) { console.error(`找不到 zip 产物：${zipPath}`); process.exit(1); }
        step(`上传到 ${host}`, () => {
            const result = spawnSync('curl', [
                '-sS', '-X', 'POST',
                `${host}/api/plugins/upload`,
                '-H', `x-admin-token: ${args.token}`,
                '-F', `file=@${zipPath}`,
            ], { encoding: 'utf8' });
            if (result.error) throw new Error(result.error.message);
            console.log(result.stdout || '');
            if (result.status !== 0) throw new Error(`curl 退出码 ${result.status}: ${result.stderr || ''}`);
        });
    }

    console.log(`\n✓ 素材插件更新完成。版本 ${version}${args.package ? `，zip 位于 ${path.join(coreRoot, 'dist', `material-plugin-${version}.zip`)}` : ''}`);
    console.log('  下一步：宿主自动合并，无需重启；如需验证刷新活动页看"测星草"等新作物的种子图 / 阶段图是否加载');
}

main();
