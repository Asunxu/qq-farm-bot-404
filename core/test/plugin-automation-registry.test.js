const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// store 在模块加载时读取注册表文件；先切到临时数据目录再 require
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-plugin-registry-'));
process.env.FARM_DATA_DIR = dataDir;

const store = require('../src/models/store');
const { _test } = store;
const { applyPluginAutomationRegistry, normalizePluginAutomationValue, getInactiveActivityAutomationKeys } = _test;

const WINDOWS = {
    activity: { startTime: 1792029600, endTime: 1794844799 },
    business: { startTime: 1792029600, endTime: 1794671998 },
};

function demoPlugin({ enabled = true } = {}) {
    return {
        id: 'demo-act',
        enabled,
        manifest: {
            id: 'demo-act',
            windows: WINDOWS,
            automation: [
                { key: 'demo_act_toggle', label: '演示开关', type: 'boolean', default: false, window: 'activity' },
                { key: 'demo_act_level', label: '演示档位', type: 'select', default: 1, window: 'business', options: [{ value: 1, label: '一档' }, { value: 2, label: '二档' }] },
            ],
        },
    };
}

test('registered plugin automation keys become allowed with defaults', () => {
    applyPluginAutomationRegistry([demoPlugin()]);
    assert.equal(store.getAutomation('__registry_probe__').demo_act_toggle, false);
    assert.equal(store.getAutomation('__registry_probe__').demo_act_level, 1);
    // 未注册的 key 依旧被丢弃
    assert.equal(store.getAutomation('__registry_probe__').demo_act_unknown, undefined);
});

test('unregistering a plugin removes its keys from the allowed set', () => {
    applyPluginAutomationRegistry([demoPlugin()]);
    applyPluginAutomationRegistry([]);
    const automation = store.getAutomation('__registry_probe2__');
    assert.equal(automation.demo_act_toggle, undefined);
    assert.equal(automation.demo_act_level, undefined);
});

test('config patches normalize plugin keys by manifest type and options', () => {
    applyPluginAutomationRegistry([demoPlugin()]);
    const accountId = '__plugin_registry_test__';
    const options = { persist: false, accountId };
    const saved = store.applyConfigSnapshot({ automation: { demo_act_toggle: 'yes', demo_act_level: '2' } }, options).automation;
    assert.equal(saved.demo_act_toggle, false); // boolean 类型只认 true
    assert.equal(saved.demo_act_level, 2); // select 命中选项
    const invalid = store.applyConfigSnapshot({ automation: { demo_act_level: 99 } }, options).automation;
    assert.equal(invalid.demo_act_level, 1); // select 越界回默认值
});

test('expired plugin windows force-disable automation keys at read time', () => {
    applyPluginAutomationRegistry([demoPlugin()]);
    // 营业窗口结束但活动窗口未结束时：仅营业期开关失效
    const businessEnded = getInactiveActivityAutomationKeys(WINDOWS.business.endTime + 10);
    assert.equal(businessEnded.has('demo_act_level'), true);
    assert.equal(businessEnded.has('demo_act_toggle'), false);
    // 活动窗口结束后：全部失效
    const allEnded = getInactiveActivityAutomationKeys(WINDOWS.activity.endTime + 10);
    assert.equal(allEnded.has('demo_act_toggle'), true);
    assert.equal(allEnded.has('demo_act_level'), true);
    const inside = getInactiveActivityAutomationKeys(WINDOWS.activity.startTime + 10);
    assert.equal(inside.has('demo_act_toggle'), false);
    assert.equal(inside.has('demo_act_level'), false);
    // 禁用的插件不参与注册表
    applyPluginAutomationRegistry([demoPlugin({ enabled: false })]);
    assert.equal(getInactiveActivityAutomationKeys(WINDOWS.activity.startTime + 10).has('demo_act_toggle'), false);
});
