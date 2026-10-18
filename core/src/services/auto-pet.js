const { createModuleLogger } = require('./logger');
const logger = createModuleLogger('pet');

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12小时检测一次
const lastCheckMap = new Map(); // accountId -> timestamp

// 狗粮 ID：1天(90004)、3天(90005)、5天(90006)，优先喂时长短的
const FOOD_PRIORITY = [90004, 90005, 90006];
const DOG_FOOD_GOODS_ID = 1006; // 商城狗粮礼包

async function checkAndAutoPet(accountId) {
  if (!accountId) return;
  const now = Date.now();
  const lastCheck = lastCheckMap.get(accountId) || 0;
  if (now - lastCheck < CHECK_INTERVAL_MS) {
    return;
  }
  lastCheckMap.set(accountId, now);

  try {
    const store = require('../models/store');
    const autoCfg = store.getAutomation(accountId) || {};
    const autoBuyFood = autoCfg.auto_buy_dog_food === true;
    const autoFeedDog = autoCfg.auto_feed_dog === true;

    if (!autoBuyFood && !autoFeedDog) return;

    const pets = require('./pets');
    const overview = await pets.getPetOverview();
    if (!overview || !overview.deployedId) {
      logger.info('宠物未派出守护，跳过自动喂食/买粮检查');
      return;
    }

    const remainingSec = Number(overview.foodSeconds) || 0;
    const remainingHours = Math.floor(remainingSec / 3600);

    // 自动喂食：守护时长不足24小时
    if (autoFeedDog && remainingSec < 24 * 3600) {
      const foods = Array.isArray(overview.foods) ? overview.foods : [];
      const availableFood = FOOD_PRIORITY
        .map(id => foods.find(f => f.id === id && f.count > 0))
        .find(Boolean);

      if (availableFood) {
        await pets.feedDog(availableFood.id, 1);
        logger.info(`守护剩余不足24小时(当前${remainingHours}小时)，已自动喂食【${availableFood.name}】x1`);
      } else if (autoBuyFood) {
        // 背包没粮，触发自动买粮
        const mall = require('./mall');
        try {
          await mall.purchaseMallGoods(DOG_FOOD_GOODS_ID, 1);
          logger.info('背包狗粮已耗尽，已自动在商城购买【狗粮礼包】');
          // 重新拉取背包再喂食
          const nextOverview = await pets.getPetOverview();
          const nextFoods = Array.isArray(nextOverview.foods) ? nextOverview.foods : [];
          const nextAvailable = FOOD_PRIORITY
            .map(id => nextFoods.find(f => f.id === id && f.count > 0))
            .find(Boolean);
          if (nextAvailable) {
            await pets.feedDog(nextAvailable.id, 1);
            logger.info(`已自动喂食新购【${nextAvailable.name}】x1`);
          }
        } catch (mallErr) {
          logger.warn(`自动买狗粮失败: ${mallErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.warn(`12小时宠物守护巡查异常: ${err.message}`);
  }
}

module.exports = {
  checkAndAutoPet,
  resetPetPacing: (id) => lastCheckMap.delete(id)
};
