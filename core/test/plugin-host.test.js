const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// registry 通过 getDataFile 动态读取 FARM_DATA_DIR，测试先切到临时目录
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-plugins-'));
process.env.FARM_DATA_DIR = dataDir;

const { validateManifest, PLUGIN_API_VERSION } = require('../src/plugins/manifest');
const { extractPluginZip, safeRelativePath } = require('../src/plugins/zip');
const { createPluginHost } = require('../src/plugins/host');

const fixturesDir = path.join(__dirname, 'fixtures');

/** 手工构造单条目 stored zip（用于携带 adm-zip 写入时会规范化掉的恶意条目名） */
function buildZipWithRawEntryName(entryName, content) {
    const header = Buffer.alloc(30);
    header.write('PK\x03\x04', 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // method: stored
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x21, 12); // date
    header.writeUInt32LE(0xD202EF8D, 14); // crc32("x")
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    const name = Buffer.from(entryName, 'utf8');
    header.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([header, name, content]);

    const central = Buffer.alloc(46);
    central.write('PK\x01\x02', 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(0xD202EF8D, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42); // local header offset
    const centralEntry = Buffer.concat([central, name]);

    const eocd = Buffer.alloc(22);
    eocd.write('PK\x05\x06', 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(centralEntry.length, 12);
    eocd.writeUInt32LE(local.length, 16);
    return Buffer.concat([local, centralEntry, eocd]);
}

function buildFakeApp() {
    // 最小 Express 4 模拟：_router.stack + app[method] 追加路由层
    const layers = [];
    const app = {
        _router: { stack: layers },
    };
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        app[method] = (routePath, ...handlers) => {
            layers.push({ route: { path: routePath }, method, handlers });
        };
    }
    return app;
}

function buildFakeProvider() {
    const sent = [];
    return {
        sent,
        callWorker: async (accountId, method, ...args) => ({ accountId, method, args }),
        sendToWorkers: message => sent.push(message),
        broadcastConfigToWorkers: accountId => sent.push({ type: 'config_sync', accountId }),
    };
}

function buildHost({ app = buildFakeApp(), provider = buildFakeProvider() } = {}) {
    const logs = [];
    const host = createPluginHost({
        app,
        provider,
        requireAdminRole: (req, res, next) => next && next(),
        getAuthorizedAccountId: () => 'acc-1',
        requireConnectedAccount: () => true,
        getAccountIdFromRequest: () => 'acc-1',
        canAccessAccount: () => true,
        sendProviderError: (res, error) => { throw error; },
        log: (tag, msg) => logs.push([tag, msg]),
    });
    return { host, app, provider, logs };
}

/** 构造一个最小可安装的插件 zip（基于奶茶插件 backend 的临时副本） */
function buildPluginZip({ id = 'demo-act', version = '1.0.0', manifestOverrides = {}, files = {} } = {}) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const manifest = {
        id,
        name: '演示活动',
        version,
        apiVersion: PLUGIN_API_VERSION,
        description: '测试插件',
        activityIds: [2099990100],
        windows: [{ key: 'activity', startTime: 1792029600, endTime: 1794844799 }],
        automation: [
            { key: 'demo_act_toggle', label: '演示开关', type: 'boolean', default: false, window: 'activity' },
            { key: 'demo_act_level', label: '演示档位', type: 'select', default: 1, window: 'activity', options: [{ value: 1, label: '一档' }, { value: 2, label: '二档' }] },
        ],
        frontend: { entry: 'frontend/plugin.mjs', css: 'frontend/plugin.css', assetPrefix: '/activity/demo-act' },
        card: { icon: 'i-carbon-calendar', image: '', updatedMs: 1792029600000 },
        ...manifestOverrides,
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    zip.addFile('backend/index.js', Buffer.from(`
            module.exports = {
                apiVersion: 1,
                admin: { register(ctx) { ctx.route('get', '/api/activity/demo-act', (req, res) => res.json({ ok: true })); } },
                worker: { register(ctx) { ctx.registerApiMethod('getDemo', () => 'demo'); } },
            };
        `));
    zip.addFile('frontend/plugin.mjs', Buffer.from('export function mount() { return { unmount() {} } }'));
    zip.addFile('frontend/plugin.css', Buffer.from('.demo {}'));
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return zip.toBuffer();
}

test('manifest validation rejects malformed manifests', () => {
    assert.match(validateManifest(null).error, /JSON 对象/);
    assert.match(validateManifest({ apiVersion: 999 }).error, /apiVersion/);
    assert.match(validateManifest({ apiVersion: 1, id: 'BAD ID', name: 'x', version: '1.0.0', windows: [{ key: 'a', startTime: 1, endTime: 2 }] }).error, /id 非法/);
    assert.match(validateManifest({ apiVersion: 1, id: 'ok', name: 'x', version: '1.0', windows: [{ key: 'a', startTime: 1, endTime: 2 }] }).error, /版本号/);
    assert.match(validateManifest({ apiVersion: 1, id: 'ok', name: 'x', version: '1.0.0', windows: [] }).error, /时间窗/);
    assert.match(validateManifest({
        apiVersion: 1, id: 'ok', name: 'x', version: '1.0.0',
        windows: [{ key: 'a', startTime: 10, endTime: 5 }],
    }).error, /endTime 不得早于/);
    assert.match(validateManifest({
        apiVersion: 1, id: 'ok', name: 'x', version: '1.0.0',
        windows: [{ key: 'a', startTime: 1, endTime: 2 }],
        automation: [{ key: 'kk', type: 'select' }],
    }).error, /options/);
    const ok = validateManifest({
        apiVersion: 1, id: 'ok', name: 'x', version: '1.0.0',
        windows: [{ key: 'a', startTime: 1, endTime: 2 }],
        frontend: { entry: 'frontend/plugin.mjs' },
        automation: [{ key: 'kk', type: 'select', default: 2, options: [{ value: 1, label: '一' }, { value: 2, label: '二' }] }],
    });
    assert.equal(ok.error, undefined);
    assert.equal(ok.manifest.automation[0].default, 2);
});

test('zip extraction rejects traversal, absolute paths and missing manifest', () => {
    assert.throws(() => safeRelativePath('../evil.js'), /穿越/);
    assert.throws(() => safeRelativePath('/abs.js'), /绝对路径/);
    assert.throws(() => safeRelativePath('C:\\windows\\evil.js'), /绝对路径/);
    assert.equal(safeRelativePath('a/b/c.js'), 'a/b/c.js');

    const AdmZip = require('adm-zip');
    const evil = new AdmZip();
    evil.addFile('../evil.js', Buffer.from('x'));
    assert.throws(() => extractPluginZip(evil.toBuffer(), path.join(dataDir, 'zip-test-1')), /穿越|manifest/);

    // adm-zip 写入时会把 ../ 规范化掉，这里手工构造携带字面 ../ 条目名的 zip，
    // 覆盖“真实恶意包在读取路径上被 safeRelativePath 拦截”的行为。
    const craftedTraversalZip = buildZipWithRawEntryName('../evil.js', Buffer.from('x'));
    assert.throws(() => extractPluginZip(craftedTraversalZip, path.join(dataDir, 'zip-test-1b')), /穿越/);

    const noManifest = new AdmZip();
    noManifest.addFile('backend/index.js', Buffer.from('x'));
    assert.throws(() => extractPluginZip(noManifest.toBuffer(), path.join(dataDir, 'zip-test-2')), /manifest/);

    assert.throws(() => extractPluginZip(Buffer.from('not a zip'), path.join(dataDir, 'zip-test-3')), /无法读取/);
});

test('install activates routes and worker load broadcast; disable/enable toggles', async () => {
    const { host, app, provider, logs } = buildHost();
    const zip = buildPluginZip();
    const entry = host.install(zip, { activate: true });
    assert.equal(entry.id, 'demo-act');
    assert.equal(entry.version, '1.0.0');
    assert.equal(entry.enabled, true);
    // 路由已注册
    const route = app._router.stack.find(layer => layer.route?.path === '/api/activity/demo-act');
    assert.ok(route, 'plugin route registered');
    // worker 广播已发
    const load = provider.sent.find(msg => msg.type === 'plugin_load');
    assert.ok(load, 'plugin_load broadcast');
    assert.equal(load.plugin.id, 'demo-act');
    assert.ok(logs.some(([tag, msg]) => msg.includes('demo-act')));

    host.disable('demo-act');
    assert.ok(!app._router.stack.some(layer => layer.route?.path === '/api/activity/demo-act'), 'route removed on disable');
    assert.ok(provider.sent.some(msg => msg.type === 'plugin_unload'), 'unload broadcast');
    assert.equal(host.isActive('demo-act'), false);

    host.enable('demo-act');
    assert.ok(app._router.stack.some(layer => layer.route?.path === '/api/activity/demo-act'), 'route re-registered on enable');
    assert.equal(host.isActive('demo-act'), true);
});

test('upgrade keeps rollback history and uninstall force-disables automation keys', () => {
    const { host, provider } = buildHost();
    host.install(buildPluginZip({ version: '1.0.0' }), { activate: true });
    const upgraded = host.install(buildPluginZip({ version: '1.1.0' }), { activate: true });
    assert.equal(upgraded.version, '1.1.0');
    assert.equal(upgraded.history[0].version, '1.0.0');
    assert.ok(fs.existsSync(upgraded.history[0].dir), 'previous version kept for rollback');

    const rolled = host.rollback('demo-act');
    assert.equal(rolled.version, '1.0.0');
    assert.equal(rolled.history[0].version, '1.1.0');

    // 模拟账号配置里开关已开启 → 卸载必须强制关闭
    const store = require('../src/models/store');
    const accountId = '__plugin_uninstall_test__';
    store.applyConfigSnapshot({ automation: { demo_act_toggle: true } }, { persist: false, accountId });
    const removed = host.uninstall('demo-act');
    assert.deepEqual(removed.keys.includes('demo_act_toggle'), true);
    const changed = store.forceDisableAutomationKeys(removed.keys);
    assert.ok(changed.includes(accountId));
    assert.equal(store.getAutomation(accountId).demo_act_toggle, false);
    assert.ok(!fs.existsSync(require('../src/plugins/registry').getPluginInstallDir('demo-act')), 'install dir removed');
});

test('install rejects packages with invalid manifest or missing entries', () => {
    const { host } = buildHost();
    assert.throws(() => host.install(buildPluginZip({ manifestOverrides: { apiVersion: 999 } })), /apiVersion/);
    assert.throws(() => host.install(buildPluginZip({ files: {} , manifestOverrides: { frontend: { entry: 'frontend/missing.mjs', css: '', assetPrefix: '' } } })), /前端文件/);
});

test('runtime-uploaded routes are inserted before the SPA fallback layer', () => {
    const app = buildFakeApp();
    // 模拟已存在的 SPA fallback '*'
    app.get('*', (req, res) => res.send('spa'));
    const { host } = buildHost({ app });
    host.install(buildPluginZip(), { activate: true });
    const stackPaths = app._router.stack.map(layer => layer.route?.path);
    const fallbackIndex = stackPaths.indexOf('*');
    const pluginIndex = stackPaths.indexOf('/api/activity/demo-act');
    assert.ok(pluginIndex >= 0, 'plugin route present');
    assert.ok(pluginIndex < fallbackIndex, 'plugin route before SPA fallback');
});

test('prebuilt milk tea plugin zip installs through the full host pipeline', () => {
    const { host, app } = buildHost();
    const pluginManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/milk-tea/manifest.json'), 'utf8'));
    const zipPath = path.join(fixturesDir, 'milk-tea-plugin.zip');
    if (!fs.existsSync(zipPath)) {
        // zip 由 core/plugins/milk-tea 生成；缺失时生成供本测试使用
        const { execFileSync } = require('node:child_process');
        execFileSync(process.execPath, [path.join(__dirname, '../plugins/milk-tea/pack.js')], { cwd: path.join(__dirname, '../plugins/milk-tea'), stdio: 'pipe' });
        fs.mkdirSync(fixturesDir, { recursive: true });
        fs.copyFileSync(path.join(__dirname, '../plugins/milk-tea/dist', `milk-tea-${pluginManifest.version}.zip`), zipPath);
    }
    const entry = host.install(fs.readFileSync(zipPath), { activate: true });
    assert.equal(entry.id, 'milk-tea');
    assert.equal(entry.version, pluginManifest.version);
    assert.ok(app._router.stack.some(layer => layer.route?.path === '/api/activity/milk-tea'), 'milk tea route registered by plugin');
    // 素材映射校验已通过（全部文件存在且 sha256 匹配）
    assert.equal(entry.manifest.automation.length, pluginManifest.automation.length);
    assert.ok(entry.manifest.automation.some(spec => spec.key === 'mall_coupon_gift_buy'), '点券礼包开关由插件声明');
    host.uninstall('milk-tea');
});
