const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// worker-host 的 dataFile 走 getDataFile，测试先切临时数据目录
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-worker-host-'));
process.env.FARM_DATA_DIR = dataDir;

const { createWorkerPluginHost } = require('../src/plugins/worker-host');
const pluginManifest = require('../src/plugins/manifest').validateManifest(
    require(path.join(__dirname, '../plugins/milk-tea/manifest.json')),
).manifest;

function buildEntry(dir, id = pluginManifest.id) {
    return { id, version: pluginManifest.version, dir, manifest: { ...pluginManifest, id } };
}

function buildHost() {
    const logs = [];
    const host = createWorkerPluginHost({
        sendMsgAsync: async () => { throw new Error('offline'); },
        getUserState: () => ({}),
        getBag: async () => ({}),
        getBagItems: () => [],
        getServerTimeSec: () => 1792030000,
        log: (tag, msg) => logs.push([tag, msg]),
    });
    return { host, logs };
}

test('loaded plugin exposes registered api methods, automation and fruit reserve', async () => {
    const { host, logs } = buildHost();
    const pluginDir = path.join(__dirname, '../plugins/milk-tea');
    host.load(buildEntry(pluginDir));

    // api 方法注册收集必须生效（曾因 buildContext 未暴露容器导致 api=[] 全部丢失）。
    // getMilkTea 被调用后进入 rpc（sendMsgAsync 为测试桩，抛 offline）——rejects 即证明
    // handler 已注册且执行到了服务层。
    await assert.rejects(host.callApiMethod('getMilkTea', [false]), /offline/);
    assert.ok(host.hasEnabledAutomation({ milk_tea_cashier: true }));
    assert.equal(host.hasEnabledAutomation({ milk_tea_cashier: false }), false);
    assert.ok(host.getAutomationKeys().includes('milk_tea_cashier'));
    assert.equal(host.reserveFruit(40525, { automation: { milk_tea_craft: true }, nowSec: 1792030000 }), true);
    assert.equal(host.reserveFruit(40525, { automation: { milk_tea_craft: false }, nowSec: 1792030000 }), false);
    assert.ok(logs.some(([, msg]) => msg.includes('活动插件 milk-tea@1.1.0 已加载')), '加载成功日志');

    host.dispose();
});

test('unload clears registrations and failed register leaves no broken entry', async () => {
    const { host } = buildHost();
    const pluginDir = path.join(__dirname, '../plugins/milk-tea');
    host.load(buildEntry(pluginDir));
    host.unload(pluginManifest.id);
    const afterUnload = await host.callApiMethod('getMilkTea', []);
    assert.equal(afterUnload.found, false);
    assert.equal(host.list().length, 0);

    // 加载 register 抛错的插件：不残留注册条目
    const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-broken-plugin-'));
    fs.mkdirSync(path.join(brokenDir, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(brokenDir, 'backend', 'index.js'),
        'module.exports = { apiVersion: 1, worker: { register(ctx) { throw new Error("boom"); } } };');
    assert.throws(() => host.load(buildEntry(brokenDir, 'broken')));
    assert.equal(host.list().some(plugin => plugin.id === 'broken'), false);
    host.dispose();
});
