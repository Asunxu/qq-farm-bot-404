const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 节令小札已迁移为活动插件（core/plugins/solar-terms）；本文件验证：
// 1) V1 裸协议领取语义保留（宿主副本供千星游记快照，插件自带 runner 副本）；
// 2) 常驻插件自动化不被窗口失效关闭；
// 3) 插件后端注册的 api 方法与自动化 key 完整。

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-solar-terms-'));
process.env.FARM_DATA_DIR = dataDir;

const { isSolarTermClaimable } = require('../src/services/activity');
const store = require('../src/models/store');
const pluginRoot = path.join(__dirname, '../plugins/solar-terms');
const pluginManifest = require('../src/plugins/manifest').validateManifest(
    require(path.join(pluginRoot, 'manifest.json')),
).manifest;
const hostHelpers = require('../src/services/activity-center-helpers');

test('solar rewards require the individual server window and claimable status', () => {
  const term = { status: 2, startTime: 100, endTime: 200 };
  for (const now of [99, 201]) assert.equal(isSolarTermClaimable(term, now), false);
  for (const now of [100, 150, 200]) assert.equal(isSolarTermClaimable(term, now), true);
  for (const status of [0, 1, 3, 5]) assert.equal(isSolarTermClaimable({ ...term, status }, 150), false);
  for (const invalid of [{ startTime: 0 }, { endTime: 99 }, { endTime: NaN }]) assert.equal(isSolarTermClaimable({ ...term, ...invalid }, 150), false);
});

test('permanent plugin automation keys survive window sweeping at any date', () => {
  // 插件注册后 star_solar_* 归属常驻窗口（0/0），任何日期都不被强制关闭
  store._test.applyPluginAutomationRegistry([{ id: pluginManifest.id, enabled: true, manifest: pluginManifest }]);
  try {
    for (const now of [1792029600, 1800000000, 1900000000]) {
      const automation = { star_solar_claim: true, star_solar_quiz_claim: true, star_passport_claim: true };
      store._test.disableHiddenActivityAutomation(automation, now);
      assert.equal(automation.star_solar_claim, true);
      assert.equal(automation.star_solar_quiz_claim, true);
      assert.equal(automation.star_passport_claim, false);
    }
  } finally {
    store._test.applyPluginAutomationRegistry([]);
  }
});

test('solar automation moved out of the host worker into the plugin runner', () => {
  const worker = fs.readFileSync(require.resolve('../src/core/worker'), 'utf8');
  assert.doesNotMatch(worker, /if \(claimSolarTerms\) \{/);
  assert.doesNotMatch(worker, /autoClaimSolarTermsQuiz/);
  const pluginEntry = fs.readFileSync(path.join(pluginRoot, 'backend/index.js'), 'utf8');
  assert.match(pluginEntry, /star_solar_claim/);
  assert.match(pluginEntry, /star_solar_quiz_claim/);
});

test('plugin worker entry registers V2 api methods, automation runner and legacy claim access', async () => {
  const plugin = require(path.join(pluginRoot, 'backend/index.js'));
  const registered = { api: new Map(), automations: [], reserves: [] };
  plugin.worker.register({
    manifest: pluginManifest, pluginId: pluginManifest.id, version: pluginManifest.version,
    log: () => {},
    requireModule: name => require(name),
    isConnected: () => true,
    sendMsgAsync: async () => { throw new Error('offline'); },
    getUserState: () => ({}), getBag: async () => ({}), getBagItems: () => [],
    getServerTimeSec: () => 1792030000,
    itemDto: x => x,
    helpers: hostHelpers,
    registerApiMethod: (name, handler) => registered.api.set(name, handler),
    registerAutomation: spec => registered.automations.push(spec),
    registerFruitReserve: fn => registered.reserves.push(fn),
    dataFile: () => '.',
  });
  assert.deepEqual([...registered.api.keys()].sort(), ['answerSolarTerm', 'getSolarTermsV2Info']);
  const keys = registered.automations[0].keys;
  assert.ok(keys.includes('star_solar_claim') && keys.includes('star_solar_quiz_claim'));
  // api 方法确实执行到服务层（sendMsgAsync 桩抛 offline 即证明调用链打通）
  await assert.rejects(registered.api.get('getSolarTermsV2Info')(), /offline/);
  plugin.worker.unregister();
});

test('independent solar claim still served by the host V1 implementation for helu snapshot', () => {
  const worker = fs.readFileSync(require.resolve('../src/core/worker'), 'utf8');
  assert.match(worker, /case 'claimSolarTermsReward':/);
  assert.match(worker, /case 'getSolarTermsInfo':/);
});
