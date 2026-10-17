const { getAllLands, fertilizeBatch, NORMAL_FERTILIZER_ID, ORGANIC_FERTILIZER_ID } = require('./farm-api');
const { buildLandsDetailFromReply } = require('./farm-land-analyzer');
const { toNum, getServerTimeSec, log } = require('../utils/utils');
const { recordOperation } = require('./stats');

let pending = false;

/**
 * 官方一键施肥：一条请求提交所有可施肥地块，每个地块只施一次。
 * 仅发送一次；超时和部分成功均不自动重试，避免重复推进阶段或重复消耗化肥。
 * @param {string} fertilizerType - 'normal' | 'organic'
 */
async function fertilizeAllOwnLands(fertilizerType) {
  if (fertilizerType !== 'normal' && fertilizerType !== 'organic') {
    throw new Error('化肥类型必须是 normal 或 organic');
  }
  if (pending) throw new Error('一键施肥正在进行，请稍后再试');
  pending = true;
  try {
    // 执行时重新读取，不能使用面板里可能已成熟或被重新种植的快照。
    const snapshot = await getAllLands();
    if (!Array.isArray(snapshot && snapshot.lands)) throw new Error('无法读取最新土地，请刷新后重试');
    const nowSec = getServerTimeSec();
    const detail = buildLandsDetailFromReply(snapshot, nowSec);
    const targets = [...new Set(detail.lands
      .filter(land => land.unlocked && !land.occupiedByMaster && land.status === 'growing'
        && land.matureInSec > 0 && toNum(land.id) > 0)
      .map(land => toNum(land.id)))];
    const result = {
      fertilizerType,
      requestedCount: targets.length,
      successCount: 0,
      skippedCount: 0,
      fertilizerConsumedSec: 0,
      fertilizerRemainingSec: null
    };
    if (!targets.length) return result;

    const fertilizerId = fertilizerType === 'organic' ? ORGANIC_FERTILIZER_ID : NORMAL_FERTILIZER_ID;
    const reply = await fertilizeBatch(targets, fertilizerId);
    const updates = Array.isArray(reply && reply.land) ? reply.land : [];
    const targetSet = new Set(targets);
    const succeeded = new Set(updates.map(land => toNum(land.id)).filter(id => targetSet.has(id)));
    const drops = Array.isArray(reply && reply.land_op_drops) ? reply.land_op_drops : [];
    const consumed = drops.flatMap(drop => drop.costs || [])
      .filter(item => toNum(item.id) === fertilizerId)
      .reduce((sum, item) => sum + toNum(item.count), 0);
    result.successCount = succeeded.size;
    result.skippedCount = targets.length - succeeded.size;
    result.fertilizerConsumedSec = drops.length ? consumed : null;
    result.fertilizerRemainingSec = reply && reply.fertilizer ? toNum(reply.fertilizer.count) : null;
    if (succeeded.size) recordOperation('fertilize', succeeded.size);
    log('施肥', `一键施肥：${fertilizerType === 'organic' ? '有机化肥' : '普通化肥'}已施 ${succeeded.size}/${targets.length} 株作物`, {
      module: 'farm', event: '一键施肥', result: succeeded.size ? 'ok' : 'skip',
      type: fertilizerType, count: succeeded.size, consumedSec: result.fertilizerConsumedSec
    });
    return result;
  }
  finally {
    pending = false;
  }
}

module.exports = { fertilizeAllOwnLands };
