#!/usr/bin/env node
/**
 * 把 core/src/gameConfig/ 下的活动植物增量 + 种子/阶段图片打包成一个素材插件目录。
 * 生成的目录默认放到 core/plugins/material-plugin/，宿主启动时 bootstrapBuiltins()
 * 会自动扫描 plugins/<id>/manifest.json 并复制安装到 data/plugins/installed/<id>/<version>/。
 *
 * 后续更新只需：拉 CDN 新配置 → 重新打包（覆盖 material-plugin/）→ 重启。
 * 也可以管理面板上传升级（支持 zip 形式）。
 *
 * 用法：
 *   node scripts/pack-material-plugin.js                           → 默认 plugins/material-plugin/
 *   node scripts/pack-material-plugin.js --version 1.0.1           → 改 manifest 版本号
 *   node scripts/pack-material-plugin.js --out dist/my-plugin-dir  → 自定义输出目录
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const coreRoot = path.resolve(__dirname, '..');
const baseGameConfig = path.join(coreRoot, 'src', 'gameConfig');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
    const result = {
        id: 'material-plugin',
        name: 'QQ农场基础素材包',
        version: '1.0.0',
        out: null,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const value = argv[i];
        if (value === '--id') result.id = argv[++i];
        else if (value === '--name') result.name = argv[++i];
        else if (value === '--version') result.version = argv[++i];
        else if (value === '--out') result.out = path.resolve(argv[++i]);
        else if (value === '-h' || value === '--help') {
            console.log(`素材插件打包工具（目录形式）

用法：
  node scripts/pack-material-plugin.js [--id <slug>] [--name <显示名>] [--version x.y.z] [--out <目录>]

默认：
  --id material-plugin
  --name QQ农场基础素材包
  --version 1.0.0
  --out core/plugins/material-plugin/
`);
            process.exit(0);
        }
    }
    if (!result.out) result.out = path.join(coreRoot, 'plugins', result.id);
    return result;
}

function collectDir(root, sub, assetsList, prefixInDir) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    function walk(current, relative) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            const rel = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(full, rel);
            else {
                const destRel = `${prefixInDir}/${rel.replace(/\\/g, '/')}`;
                assetsList.push({ disk: full, dest: destRel, sha256: sha256(full) });
                count += 1;
            }
        }
    }
    walk(dir, '');
    return count;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(baseGameConfig)) {
        console.error(`gameConfig 目录不存在：${baseGameConfig}`);
        process.exit(1);
    }

    // 收集要打包的文件与 sha256
    const assets = [];

    const plantImagesCount = collectDir(baseGameConfig, 'plant_images', assets, 'assets/plant_images');
    const seedImagesCount = collectDir(baseGameConfig, 'seed_images_named', assets, 'assets/seed_images_named');
    const effectImagesCount = collectDir(baseGameConfig, 'effect_images', assets, 'assets/effect_images');

    const eventPlantsPath = path.join(baseGameConfig, 'EventPlants.json');
    const eventPlantsCount = fs.existsSync(eventPlantsPath)
        ? JSON.parse(fs.readFileSync(eventPlantsPath, 'utf8').replace(/^\uFEFF/, '')).length
        : 0;

    console.log(`[素材插件] catalog/EventPlants.json: ${eventPlantsCount} 条`);
    console.log(`[素材插件] assets/plant_images/: ${plantImagesCount} 个文件`);
    console.log(`[素材插件] assets/seed_images_named/: ${seedImagesCount} 个文件`);
    console.log(`[素材插件] assets/effect_images/: ${effectImagesCount} 个文件`);
    console.log(`[素材插件] 总计素材文件: ${assets.length}`);

    // 生成 manifest.json
    const manifest = {
        id: args.id,
        name: args.name,
        version: args.version,
        apiVersion: 1,
        description: `自动打包自 core/src/gameConfig 的基础素材包，提供活动植物增量表与种子/阶段图，宿主自动合并`,
        activityIds: [],
        windows: [
            { key: 'permanent', startTime: 0, endTime: 0 },
        ],
        automation: [],
        gameConfig: {
            provides: true,
            urlPrefix: '/game-config',
        },
        card: {
            icon: 'i-carbon-image',
            image: '',
            updatedMs: Date.now(),
        },
    };

    // 生成 backend/index.js stub（素材插件不需要活动面板和 worker）
    const backendStub = `// 素材插件 backend stub：不提供活动面板、自动化或协议服务；
// 只靠 manifest.gameConfig.provides=true 让宿主自动把 assets/ 与 catalog/ 合并进核心配置。
module.exports = {
    apiVersion: 1,
    admin: {
        register() {},
        unregister() {},
    },
    worker: {
        register() {},
        unregister() {},
    },
};
`;

    // 生成 assets-map.json（素材 sha256 清单）
    const assetsMap = assets.map(item => ({
        file: item.dest.startsWith('assets/') ? item.dest.slice('assets/'.length) : item.dest,
        sha256: item.sha256,
        size: fs.statSync(item.disk).size,
    }));

    // 清空输出目录并重建
    const outDir = args.out;
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    // 写 manifest
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // 写 backend/index.js
    fs.mkdirSync(path.join(outDir, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'backend', 'index.js'), backendStub, 'utf8');

    // 写 catalog/EventPlants.json
    if (fs.existsSync(eventPlantsPath)) {
        fs.mkdirSync(path.join(outDir, 'catalog'), { recursive: true });
        fs.copyFileSync(eventPlantsPath, path.join(outDir, 'catalog', 'EventPlants.json'));
    }

    // 复制 assets + 写 assets-map.json
    fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
    for (const item of assets) {
        const destFull = path.join(outDir, item.dest);
        fs.mkdirSync(path.dirname(destFull), { recursive: true });
        fs.copyFileSync(item.disk, destFull);
    }
    fs.writeFileSync(
        path.join(outDir, 'assets', 'assets-map.json'),
        JSON.stringify(assetsMap, null, 2),
        'utf8',
    );

    // 统计输出
    let totalBytes = 0;
    let totalFiles = 0;
    function walkSize(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walkSize(full);
            else { totalBytes += entry.size ?? fs.statSync(full).size; totalFiles += 1; }
        }
    }
    walkSize(outDir);
    console.log(`[素材插件] 已生成目录：${outDir} (${totalFiles} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
}

try { main(); } catch (err) { console.error('[素材插件] 打包失败：', err.message || err); process.exit(1); }
