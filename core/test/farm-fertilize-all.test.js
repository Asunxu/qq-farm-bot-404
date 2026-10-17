const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// 通过 vm 加载真实的 fertilize-all.js，仅替换它的四个依赖模块。
function harness(options = {}) {
  const calls = { reads: 0, batches: [], stats: [] };
  const snapshot = options.lands || [
    { id: 1, unlocked: true, status: 'growing', matureInSec: 60 },
    { id: 2, unlocked: true, status: 'growing', matureInSec: 60, leftInorcFertTimes: 0 },
    { id: 3, unlocked: true, status: 'harvestable', matureInSec: 0 },
    { id: 4, unlocked: true, status: 'growing', matureInSec: 60, occupiedByMaster: true },
    { id: 5, unlocked: false, status: 'growing', matureInSec: 60 },
  ];
  const imports = {
    './farm-api': {
      NORMAL_FERTILIZER_ID: 1011,
      ORGANIC_FERTILIZER_ID: 1012,
      getAllLands: async () => {
        calls.reads++;
        if (options.readError) throw options.readError;
        return { lands: snapshot };
      },
      fertilizeBatch: async (ids, id) => {
        calls.batches.push({ ids, id });
        if (options.send) return options.send();
        return {
          land: [{ ...snapshot[0], matureInSec: 30 }],
          fertilizer: { id, count: 500 },
          land_op_drops: [{ land_id: 1, costs: [{ id, count: 30 }, { id: 1001, count: 99 }] }],
        };
      },
    },
    // 默认 analyzer 桩：夹具本身就是详情形状，原样透传
    './farm-land-analyzer': options.analysis || {
      buildLandsDetailFromReply: reply => ({ lands: reply.lands, summary: {} }),
    },
    '../utils/utils': {
      toNum: v => Number(v) || 0,
      getServerTimeSec: () => options.now || 1000,
      log() {},
    },
    './stats': { recordOperation: (...args) => calls.stats.push(args) },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/fertilize-all.js'), 'utf8'), {
    exports: module.exports,
    module,
    require: name => {
      assert.ok(name in imports, name);
      return imports[name];
    },
  });
  return { run: module.exports.fertilizeAllOwnLands, calls };
}

test('bulk fertilizer counts actual successes, excludes inactive/slave lands and sums fertilizer costs only', async () => {
  const { run, calls } = harness();
  const result = await run('normal');
  assert.equal(JSON.stringify(calls.batches), JSON.stringify([{ ids: [1, 2], id: 1011 }]));
  assert.equal(result.requestedCount, 2);
  assert.equal(result.successCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.fertilizerConsumedSec, 30);
  assert.equal(result.fertilizerRemainingSec, 500);
  assert.deepEqual(calls.stats, [['fertilize', 1]]);
});

test('bulk organic fertilization sends once with the organic fertilizer id', async () => {
  const { run, calls } = harness();
  await run('organic');
  assert.equal(JSON.stringify(calls.batches), JSON.stringify([{ ids: [1, 2], id: 1012 }]));
});

test('three 2x2 crops and twelve single crops target fifteen roots and never send slave tile ids', async () => {
  const analysis = require('../src/services/farm-land-analyzer');
  const { PlantPhase } = require('../src/config/config');
  const now = Math.floor(Date.now() / 1000);
  const groups = { 6: [2, 7, 3], 17: [13, 18, 14], 19: [15, 20, 16] };
  const slaves = new Map(Object.entries(groups).flatMap(([id, ids]) => ids.map(slave => [slave, Number(id)])));
  const lands = Array.from({ length: 24 }, (_, index) => {
    const id = index + 1;
    return {
      id,
      unlocked: true,
      master_land_id: slaves.get(id) || 0,
      slave_land_ids: groups[id] || [],
      ...(slaves.has(id) ? {} : {
        plant: {
          id: groups[id] ? 1029005 : 1020525,
          phases: [
            { phase: PlantPhase.GERMINATION, begin_time: now - 60 },
            { phase: PlantPhase.MATURE, begin_time: now + 7200 },
          ],
        },
      }),
    };
  });
  const roots = lands.filter(land => !slaves.has(land.id));
  const { run, calls } = harness({ lands, now, analysis, send: async () => ({ land: roots }) });
  const result = await run('organic');
  assert.equal(result.requestedCount, 15);
  assert.equal(result.successCount, 15);
  assert.equal(calls.batches[0].ids.length, 15);
  assert.equal(calls.batches[0].ids.some(id => slaves.has(id)), false);
});

test('empty or unavailable fresh snapshot never spends fertilizer', async () => {
  const empty = harness({ lands: [] });
  assert.equal((await empty.run('normal')).requestedCount, 0);
  assert.equal(empty.calls.batches.length, 0);
  const failed = harness({ readError: new Error('offline') });
  await assert.rejects(failed.run('normal'), /offline/);
  assert.equal(failed.calls.batches.length, 0);
  await assert.rejects(empty.run('diamond'), /化肥类型/);
});

test('duplicate bulk actions are rejected and an ambiguous timeout is never retried', async () => {
  let rejectSend;
  const { run, calls } = harness({
    send: () => new Promise((_, reject) => { rejectSend = reject; }),
  });
  const first = run('normal');
  await Promise.resolve();
  await assert.rejects(run('organic'), /正在进行/);
  rejectSend(new Error('timeout'));
  await assert.rejects(first, /timeout/);
  assert.equal(calls.batches.length, 1);
  assert.equal(calls.stats.length, 0);
});
