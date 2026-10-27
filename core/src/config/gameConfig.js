const fs = require('node:fs');
const path = require('node:path');
const { filterInvalidPlants, isInvalidPlant, isInvalidSeedId } = require('./invalidPlants');
const { getResourcePath } = require('./runtime-paths');

// 等级经验配置
let roleLevelConfig = null;
let levelExpTable = null;

// 植物配置
let plantConfig = null;
const plantMap = new Map();          // plantId → plant
const seedToPlant = new Map();       // seedId → plant
const fruitToPlant = new Map();      // fruitId → plant

// 物品配置
let itemInfoConfig = null;
const itemInfoMap = new Map();       // itemId → itemInfo
const seedItemMap = new Map();       // seedItemId → itemInfo
const seedImageMap = new Map();      // seedId/itemId → imageUrl
const seedAssetImageMap = new Map(); // assetName → imageUrl
const plantPhaseImageMap = new Map();// assetName → { phase: imageUrl }
let plantPhaseManifestPath = '';
let plantPhaseManifestMtimeMs = -1;
const skinDetailImageMap = new Map();// itemId → skinDetailImageUrl
// 外部素材提供者：插件安装的目录，约定结构：
//   <dir>/catalog/EventPlants.json            活动植物增量
//   <dir>/catalog/ItemInfo.json               物品增量（可选）
//   <dir>/assets/seed_images_named/*.png      种子图标
//   <dir>/assets/plant_images/<Crop_x>/N.png  植物阶段图
//   <dir>/assets/plant_images/manifest.json   阶段图清单（可选，provider 自维护 URL）
// <urlPrefix> 决定生成的前端访问前缀，宿主默认 "/game-config"。
const externalGameConfigProviders = [];

const staticItemInfoMap = new Map([
    [6001, { id: 6001, name: '烟花·玉兔望月', type: 23, can_use: 1 }],
    [204010, { id: 204010, name: '玉兔邀月' }],
    [90042, { id: 90042, name: '稚萌熊熊' }],
    [1040, { id: 1040, name: '爱心值' }],
    [2158, { id: 2158, name: '小红花做好事头像框' }],
    [101604, { id: 101604, name: '公益小红花结算礼包' }],
    [1027, { id: 1027, name: '雷电徽章' }],
    [4002, { id: 4002, name: '闪电感应' }],
    [4003, { id: 4003, name: '闪电感应' }],
    [5001, { id: 5001, name: '天气采集瓶' }],
    [5002, { id: 5002, name: '雷雨召唤瓶' }],
    [5005, { id: 5005, name: '青蛙使坏瓶' }],
    [5006, { id: 5006, name: '乌云使坏瓶' }],
    [2159, { id: 2159, name: '雨落成诗头像框' }],
    [100003, { id: 100003, name: '化肥礼包' }],
]);
const staticItemImageMap = new Map([
    // 所有背包/图鉴物品图标统一由 material-plugin 提供，路径为 /game-config/seed_images_named/。
    // 之前分散在各活动插件 assetPrefix 下的图标已全部迁入，避免插件路由未注册导致 404。
    // 文件名按官方 bundle 中的原始 asset_name 命名（Crop_XXX_Seed.png / icon_xxx.png）。

    // 奶茶活动面板小屋装饰（背包显示的物品）
    [210041, '/game-config/seed_images_named/icon_wuding05.png'],
    [210042, '/game-config/seed_images_named/icon_men05.png'],
    [210043, '/game-config/seed_images_named/icon_chuang05.png'],
    [210044, '/game-config/seed_images_named/icon_qiangmian05.png'],
    [210045, '/game-config/seed_images_named/icon_diban05.png'],
    [210046, '/game-config/seed_images_named/icon_zhuoyi05.png'],
    [210047, '/game-config/seed_images_named/icon_zhuangshi05.png'],
    [210048, '/game-config/seed_images_named/icon_zhuangshi06.png'],

    // 奶茶活动道具
    [1041, '/game-config/seed_images_named/icon_s4_ticket.png'],
    [1042, '/game-config/seed_images_named/icon_s4_boost.png'],

    // 化肥系列（官方 icon_res: gui/texture/icon/icon_feterlize*）
    [80002, '/game-config/seed_images_named/icon_feterlize2.png'],
    [80003, '/game-config/seed_images_named/icon_feterlize3.png'],
    [80004, '/game-config/seed_images_named/icon_feterlize4.png'],
    [80013, '/game-config/seed_images_named/icon_feterlize7.png'],
    [80014, '/game-config/seed_images_named/icon_feterlize8.png'],

    // 点券
    [1002, '/game-config/seed_images_named/star.png'],

    // 烟花（官方 icon_res: gui/texture/icon/icon_use_firework_1）
    [6001, '/game-config/seed_images_named/icon_use_firework_1.png'],

    // 皮肤
    [204010, '/game-config/seed_images_named/icon_skin_tower_5.png'],
    [90042, '/game-config/seed_images_named/Item_dogSkin_31_5.png'],

    // 公益小红花结算礼包
    [101604, '/game-config/seed_images_named/pack_redFlower.png'],

    // 节气活动（雨落成诗：官方 icon_res 前缀 gui/texture/icon/icon_weatherBottle*）
    [5001, '/game-config/seed_images_named/icon_weatherBottle_1.png'],
    [5002, '/game-config/seed_images_named/icon_weatherBottle_2.png'],
    [5005, '/game-config/seed_images_named/icon_weatherBottle_5.png'],
    [5006, '/game-config/seed_images_named/icon_weatherBottle_6.png'],
    [1027, '/game-config/seed_images_named/icon_weatherBottle_lightningBadge.png'],
    [4002, '/game-config/seed_images_named/icon_weatherBottle_lightningMutant.png'],
    [4003, '/game-config/seed_images_named/icon_weatherBottle_lightningMutant.png'],

    // 雨落成诗头像框
    [2159, '/game-config/seed_images_named/img_avatar_weatherBottle.png'],

    // 星砂（二周年道具，官方 icon_res: gui/texture/icon/icon_S2_stardust）
    [1023, '/game-config/seed_images_named/icon_S2_stardust.png'],

    // 鹊羽 / 鹊羽灵露（七夕道具，官方 icon_res: gui/texture/icon/icon_qixi_feather / icon_qixi_water）
    [1024, '/game-config/seed_images_named/icon_qixi_feather.png'],
    [301103, '/game-config/seed_images_named/icon_qixi_water.png'],

    // 注：月下美人种子(26030/Crop_6030) 和 山丹丹种子(20435/Crop_435) 的种子图本地本来就缺失，
    // Plant 表里 seed_id=26030 甚至找不到对应行。图鉴能显示是因为走 plant_images/ 果实阶段图，
    // 不依赖种子图。这两个种子图需从官方 CDN plant bundle 补下（文件名为 Crop_XXX_Seed.png 或 1.png），
    // 补完后 seedImageMap hash 扫描会自动命中，不需要 static 条目。
]);

// 变异效果配置
let mutantEffectConfig = null;
const mutantEffectMap = new Map();       // mutantId → mutantEffect
const mutantEffectByIconMap = new Map(); // icon → mutantEffect

/** 加载所有游戏配置文件 */
function loadConfigs() {
    const basePath = getResourcePath('gameConfig');

    // 1. 加载等级经验表
    try {
        const roleLevelPath = path.join(basePath, 'RoleLevel.json');
        if (fs.existsSync(roleLevelPath)) {
            roleLevelConfig = JSON.parse(fs.readFileSync(roleLevelPath, 'utf8'));
            levelExpTable = [];
            for (const entry of roleLevelConfig) {
                levelExpTable[entry.level] = entry.exp;
            }
            console.warn(`[配置] 已加载等级经验表 (${  roleLevelConfig.length  } 级)`);
        }
    } catch (err) {
        console.warn('[配置] 加载 RoleLevel.json 失败:', err.message);
    }

    // 2. 加载植物配置
    try {
        const plantPath = path.join(basePath, 'Plant.json');
        if (fs.existsSync(plantPath)) {
            plantConfig = filterInvalidPlants(JSON.parse(fs.readFileSync(plantPath, 'utf8')));
            plantMap.clear();
            seedToPlant.clear();
            fruitToPlant.clear();
            for (const plant of plantConfig) {
                plantMap.set(plant.id, plant);
                if (plant.seed_id) seedToPlant.set(plant.seed_id, plant);
                if (plant.fruit && plant.fruit.id) fruitToPlant.set(plant.fruit.id, plant);
            }
            console.warn(`[配置] 已加载植物配置 (${  plantConfig.length  } 种)`);
        }

        // 活动植物通常早于全量静态配置发布，使用轻量增量表补齐植物、
        // 种子和果实三者的关系，避免土地与图鉴显示裸 ID。
        const eventPlantPath = path.join(basePath, 'EventPlants.json');
        const mergedEventPlants = [];
        if (fs.existsSync(eventPlantPath)) {
            mergedEventPlants.push(...JSON.parse(fs.readFileSync(eventPlantPath, 'utf8')));
        }
        // 外部 provider（素材插件）追加的活动植物增量。插件优先级低于宿主，
        // 宿主 basePath 里已存在的 EventPlants.json 条目优先。
        for (const provider of externalGameConfigProviders) {
            const p = path.join(provider.dir, 'catalog', 'EventPlants.json');
            if (fs.existsSync(p)) {
                try { mergedEventPlants.push(...JSON.parse(fs.readFileSync(p, 'utf8'))); } catch {}
            }
        }
        if (mergedEventPlants.length) {
            // EventPlants 可能包含官方 Plant.json 没有的补充字段：
            //   size / grow_phases / all_state_spine / mutant_effect_plant / planting_priority / seasons
            // 官方 Plant 更新后可能已经收录同一 seed_id 的条目，但这些补充字段仍在 EventPlants 里。
            // 因此不是整行跳过，而是做字段级补全：宿主已有条目时，把 EventPlants 有但宿主缺的
            // 额外字段 merge 进去；宿主没有条目时才创建新条目。
            const supplementFields = ['size', 'grow_phases', 'all_state_spine', 'mutant_effect_plant', 'planting_priority', 'seasons'];
            for (const entry of mergedEventPlants) {
                if (isInvalidPlant(entry)) continue;
                const plantId = Number(entry.id);
                const seedId = Number(entry.seed_id) || 0;
                const existing = plantMap.get(plantId) || (seedId > 0 ? seedToPlant.get(seedId) : null);
                if (existing) {
                    // 宿主已有：只补 EventPlants 有而宿主缺的字段
                    let merged = false;
                    for (const f of supplementFields) {
                        if (entry[f] != null && entry[f] !== ''
                            && (existing[f] == null || existing[f] === '')) {
                            existing[f] = entry[f];
                            merged = true;
                        }
                    }
                    // size 特殊处理：如果 EventPlants 声明更大的 size（如 2x2），以 EventPlants 为准
                    if (entry.size != null && Number(entry.size) > Number(existing.size || 1)) {
                        existing.size = Number(entry.size);
                        merged = true;
                    }
                    if (merged) {
                        // 同步更新反向索引（existing 就是 plantMap/seedToPlant/fruitToPlant 里的引用，
                        // 直接修改字段不需要重新 set）
                    }
                    continue;
                }
                const plant = {
                    ...entry,
                    id: plantId,
                    name: entry.name,
                    asset_name: entry.asset_name,
                    seed_id: seedId || null,
                    fruit: {
                        id: Number(entry.fruit_id),
                        count: Number(entry.fruit_count) || 0,
                    },
                    size: Math.max(1, Number(entry.size) || 1),
                    seasons: Number(entry.seasons) || 1,
                    grow_phases: entry.grow_phases || '',
                    exp: Number(entry.exp) || 0,
                    planting_priority: Math.max(0, Number(entry.planting_priority) || 0),
                };
                plantMap.set(plant.id, plant);
                if (plant.seed_id) seedToPlant.set(plant.seed_id, plant);
                if (plant.fruit.id) fruitToPlant.set(plant.fruit.id, plant);
            }
            plantConfig = [...plantMap.values()];
            console.warn(`[配置] 已合并活动植物配置 (${  mergedEventPlants.length  } 种)`);
        }
    } catch (err) {
        console.warn('[配置] 加载 Plant.json 失败:', err.message);
    }

    // 3. 加载物品配置
    try {
        const itemInfoPath = path.join(basePath, 'ItemInfo.json');
        if (fs.existsSync(itemInfoPath)) {
            itemInfoConfig = JSON.parse(fs.readFileSync(itemInfoPath, 'utf8'));
            itemInfoMap.clear();
            seedItemMap.clear();
            for (const item of itemInfoConfig) {
                const itemId = Number(item && item.id) || 0;
                if (itemId <= 0 || isInvalidSeedId(itemId)) continue;
                itemInfoMap.set(itemId, item);
                // type === 5 表示种子物品
                if (Number(item.type) === 5) {
                    seedItemMap.set(itemId, item);
                }
            }
            console.warn(`[配置] 已加载物品配置 (${  itemInfoConfig.length  } 项)`);
        }

        const eventPlantPath = path.join(basePath, 'EventPlants.json');
        const mergedEventPlants2 = [];
        if (fs.existsSync(eventPlantPath)) {
            mergedEventPlants2.push(...JSON.parse(fs.readFileSync(eventPlantPath, 'utf8')));
        }
        for (const provider of externalGameConfigProviders) {
            const p = path.join(provider.dir, 'catalog', 'EventPlants.json');
            if (fs.existsSync(p)) {
                try { mergedEventPlants2.push(...JSON.parse(fs.readFileSync(p, 'utf8'))); } catch {}
            }
        }
        if (mergedEventPlants2.length) {
            for (const entry of mergedEventPlants2) {
                if (isInvalidPlant(entry)) continue;
                const seedId = Number(entry.seed_id);
                const plant = seedToPlant.get(seedId);
                const fruitId = Number(plant && plant.fruit && plant.fruit.id) || Number(entry.fruit_id);
                const name = plant && plant.name || entry.name;
                const assetName = plant && plant.asset_name || entry.asset_name;
                const baseItem = {
                    asset_name: assetName,
                    level: Number(entry.level) || Number(plant && plant.land_level_need) || 1,
                    rarity: Math.max(3, Number(entry.rarity) || 0),
                    rarity_color: entry.rarity_color || 'EEC55A',
                };
                const existingSeedItem = itemInfoMap.get(seedId);
                if (seedId > 0 && (!existingSeedItem || plant)) {
                    const seedItem = {
                        ...baseItem,
                        ...(existingSeedItem || {}),
                        id: seedId,
                        type: 5,
                        name: `${name}种子`,
                        asset_name: assetName,
                        rarity: Math.max(1, Number(existingSeedItem && existingSeedItem.rarity) || 3),
                        interaction_type: 'plant',
                        max_count: 9999,
                        max_own: 9999,
                        desc: `种植后，可以收获一定数量的${name}。`,
                        effectDesc: name,
                    };
                    itemInfoMap.set(seedId, seedItem);
                    seedItemMap.set(seedId, seedItem);
                }
                const existingFruitItem = itemInfoMap.get(fruitId);
                if (!existingFruitItem || plant) {
                    itemInfoMap.set(fruitId, {
                        ...baseItem,
                        ...(existingFruitItem || {}),
                        id: fruitId,
                        type: 4,
                        name,
                        asset_name: assetName,
                        rarity: Math.max(1, Number(existingFruitItem && existingFruitItem.rarity) || 3),
                        max_count: 99999,
                        max_own: 999990,
                        layer: Number(entry.layer) || 0,
                    });
                }
            }
            itemInfoConfig = Array.from(itemInfoMap.values());
        }
    } catch (err) {
        console.warn('[配置] 加载 ItemInfo.json 失败:', err.message);
    }

    // 4. 加载种子图片映射
    try {
        seedImageMap.clear();
        seedAssetImageMap.clear();
        const crypto = require('crypto');
        function fileHash(filepath) {
            const buf = fs.readFileSync(filepath);
            return crypto.createHash('sha256').update(buf).digest('hex');
        }
        function extractIdsFromFilename(filename) {
            // 从文件名提取所有数字 token 作为候选 ID（支持多 ID 同图复用）
            const nums = String(filename || '').match(/\d+/g);
            return nums ? nums.map(n => Number(n)).filter(n => n > 0) : [];
        }
        function indexSeedImageDir(dir, urlPrefix) {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            // Pass 1: hash all files, build hash → [{ filename, idsInName, assetMatch }]
            const hashGroups = new Map();
            for (const filename of files) {
                const ext = path.extname(filename).toLowerCase();
                if (!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)) continue;
                const filepath = path.join(dir, filename);
                let hash;
                try { hash = fileHash(filepath); } catch { continue; }
                const idsInName = extractIdsFromFilename(filename);
                const name = String(filename);
                const assetMatch = name.match(/(Crop_\d+)_Seed\.(?:png|jpg|jpeg|webp|gif)$/i);
                if (!hashGroups.has(hash)) hashGroups.set(hash, []);
                hashGroups.get(hash).push({ filename, idsInName, assetName: assetMatch ? assetMatch[1] : null });
            }
            // Pass 2: for each hash group, pick one "canonical" file and register
            // every ID appearing in any sibling filename to the same URL.
            for (const [hash, group] of hashGroups) {
                // Prefer pure numeric filename (clean), else longest named variant.
                group.sort((a, b) => {
                    const aPure = /^\d+\.(?:png|jpg|jpeg|webp|gif)$/i.test(a.filename) ? 0 : 1;
                    const bPure = /^\d+\.(?:png|jpg|jpeg|webp|gif)$/i.test(b.filename) ? 0 : 1;
                    if (aPure !== bPure) return aPure - bPure;
                    return b.filename.length - a.filename.length;
                });
                const canonical = group[0];
                const imageUrl = `${urlPrefix}/seed_images_named/${  encodeURIComponent(canonical.filename)}`;
                // Register ALL ids found in ANY file of this group → same URL
                const seenIds = new Set();
                for (const entry of group) {
                    for (const id of entry.idsInName) {
                        if (!seenIds.has(id) && id > 0 && !seedImageMap.has(id)) {
                            seedImageMap.set(id, imageUrl);
                        }
                        seenIds.add(id);
                    }
                    if (entry.assetName && !seedAssetImageMap.has(entry.assetName)) {
                        seedAssetImageMap.set(entry.assetName, imageUrl);
                    }
                }
            }
        }
        indexSeedImageDir(path.join(basePath, 'seed_images_named'), '/game-config');
        for (const provider of externalGameConfigProviders) {
            indexSeedImageDir(path.join(provider.dir, 'assets', 'seed_images_named'), provider.urlPrefix || '/game-config');
        }
        console.warn(`[配置] 已加载种子图片映射 (${  seedImageMap.size  } 项)`);
    } catch (err) {
        console.warn('[配置] 加载 seed_images_named 失败:', err.message);
    }

    // 5. 加载从官方 plant Bundle 导出的阶段图片
    plantPhaseManifestPath = path.join(basePath, 'plant_images', 'manifest.json');
    plantPhaseManifestMtimeMs = -1;
    loadPlantPhaseManifest(true);

    // 6. 加载装扮道具图片映射
    try {
        function indexSkinDir(dir, urlPrefix) {
            if (!fs.existsSync(dir)) return;
            const skinFiles = fs.readdirSync(dir);
            for (const skinFile of skinFiles) {
                const skinName = String(skinFile || '');
                const skinMatch = skinName.match(/^(\d+)_img_(?:skin|nangua)_.*\.(?:png|jpg|jpeg|webp|gif)$/i);
                if (skinMatch) {
                    const skinId = Number(skinMatch[1]) || 0;
                    if (skinId > 0 && !skinDetailImageMap.has(skinId)) {
                        skinDetailImageMap.set(skinId, `${urlPrefix}/seed_images_named/skinDetail/${  encodeURIComponent(skinFile)}`);
                    }
                }
            }
        }
        skinDetailImageMap.clear();
        indexSkinDir(path.join(basePath, 'seed_images_named', 'skinDetail'), '/game-config');
        for (const provider of externalGameConfigProviders) {
            indexSkinDir(path.join(provider.dir, 'assets', 'seed_images_named', 'skinDetail'), provider.urlPrefix || '/game-config');
        }
        console.warn(`[配置] 已加载装扮道具图片映射 (${  skinDetailImageMap.size  } 项)`);
    } catch (err) {
        console.warn('[配置] 加载 skinDetail 失败:', err.message);
    }

    // 6. 加载变异效果配置
    try {
        const mutantPath = path.join(basePath, 'MutantEffect.json');
        if (fs.existsSync(mutantPath)) {
            mutantEffectConfig = JSON.parse(fs.readFileSync(mutantPath, 'utf8'));
            mutantEffectMap.clear();
            mutantEffectByIconMap.clear();
            for (const mutant of mutantEffectConfig) {
                const mutantId = Number(mutant && mutant.id) || 0;
                if (mutantId <= 0) continue;
                mutantEffectMap.set(mutantId, mutant);
                if (mutant.icon) mutantEffectByIconMap.set(mutant.icon, mutant);
            }
            console.warn(`[配置] 已加载变异效果配置 (${  mutantEffectConfig.length  } 种)`);
        }
    } catch (err) {
        console.warn('[配置] 加载 MutantEffect.json 失败:', err.message);
    }
}

/** 获取等级经验表 */
function getLevelExpTable() {
    return levelExpTable;
}

/**
 * 获取升级所需经验进度
 * @returns {{current: number, needed: number}}
 */
function getLevelExpProgress(level, exp) {
    const result = { current: 0, needed: 0 };
    if (!levelExpTable || level <= 0) return result;

    const currentLevelExp = levelExpTable[level] || 0;
    const nextLevelExp = levelExpTable[level + 1] || currentLevelExp + 1;
    const progress = Math.max(0, exp - currentLevelExp);
    const totalNeeded = nextLevelExp - currentLevelExp;

    return { current: progress, needed: totalNeeded };
}

/** 根据植物ID获取植物 */
function getPlantById(plantId) {
    return plantMap.get(plantId);
}

/** 根据种子ID获取植物 */
function getPlantBySeedId(seedId) {
    return seedToPlant.get(seedId);
}

/** 根据植物ID获取植物名 */
function getPlantName(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? plant.name : `植物${  plantId}`;
}

/** 根据种子ID获取植物名 */
function getPlantNameBySeedId(seedId) {
    const plant = seedToPlant.get(seedId);
    return plant ? plant.name : `种子${  seedId}`;
}

/**
 * 获取植物生长总时间（秒）
 * @param {number} plantId - 植物ID
 * @returns {number} 总生长秒数
 */
function getPlantGrowTime(plantId) {
    const plant = plantMap.get(plantId);
    if (!plant || !plant.grow_phases) return 0;

    const phases = plant.grow_phases.split(';').filter(Boolean);
    let totalSeconds = 0;
    for (const phase of phases) {
        const match = phase.match(/:(\d+)/);
        if (match) {
            totalSeconds += Number.parseInt(match[1]);
        }
    }
    return totalSeconds;
}

/**
 * 解析官方 Plant.grow_phases。官方客户端把每项转换成内部 phase_id；
 * 服务端响应的 phase 与该内部 ID 匹配，常规阶段按一基顺序排列。
 */
function getPlantGrowPhases(plantId) {
    const plant = plantMap.get(Number(plantId) || 0);
    if (!plant || !plant.grow_phases) return [];

    return String(plant.grow_phases)
        .split(';')
        .filter(Boolean)
        .map((value, index) => {
            const separator = value.lastIndexOf(':');
            const name = separator >= 0 ? value.slice(0, separator) : value;
            const duration = separator >= 0 ? Number(value.slice(separator + 1)) || 0 : 0;
            return { index, name, duration };
        });
}

/**
 * 格式化生长时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间字符串
 */
function formatGrowTime(seconds) {
    if (seconds < 60) return `${seconds  }秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)  }分钟`;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours  }小时${  minutes  }分` : `${hours  }小时`;
}

/** 获取植物种植经验 */
function getPlantExp(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? plant.exp : 0;
}

/**
 * 获取种子收获信息
 * @param {number} seedId - 种子ID
 * @returns {{expPerSeason: number, seasons: number, incomePerSeason: number}}
 */
function getSeedHarvestInfo(seedId) {
    const plant = seedToPlant.get(seedId);
    if (!plant) {
        return { expPerSeason: 0, seasons: 1, incomePerSeason: 0 };
    }

    const expPerSeason = plant.exp || 0;
    const seasons = plant.seasons || 1;
    const fruitCount = (plant.fruit && plant.fruit.count) || 0;

    // 通过种子ID的末位匹配果实价格
    const seedIdStr = String(seedId);
    const suffix = seedIdStr.slice(-4);
    let fruitUnitPrice = 0;

    for (const [itemId, itemInfo] of itemInfoMap) {
        // type === 4 表示果实类型物品
        if (Number(itemInfo.type) === 4) {
            const itemIdStr = String(itemId);
            if (itemIdStr.endsWith(suffix)) {
                fruitUnitPrice = Number(itemInfo.price) || 0;
                break;
            }
        }
    }

    const incomePerSeason = fruitUnitPrice * fruitCount;
    return { expPerSeason, seasons, incomePerSeason };
}

/** 根据果实ID获取果实名 */
function getFruitName(fruitId) {
    const plant = fruitToPlant.get(fruitId);
    return plant ? plant.name : `果实${  fruitId}`;
}

/** 根据果实ID获取植物 */
function getPlantByFruitId(fruitId) {
    return fruitToPlant.get(fruitId);
}

/** 获取所有种子列表 */
function getAllSeeds() {
    return Array.from(seedToPlant.values()).map(plant => ({
        seedId: plant.seed_id,
        name: plant.name,
        requiredLevel: getSeedLevel(plant.seed_id) || Number(plant.land_level_need) || 0,
        price: getSeedPrice(plant.seed_id),
        image: getSeedImageBySeedId(plant.seed_id)
    }));
}

/** 内部函数：根据ID映射种子图片 */
function getMappedSeedImage(id) {
    const numericId = Number(id) || 0;
    if (numericId <= 0) return '';

    // 先查种子图片映射
    const directImage = seedImageMap.get(numericId);
    if (directImage) return directImage;

    // 再通过物品的 asset_name 查找
    const itemInfo = itemInfoMap.get(numericId);
    const assetName = itemInfo && itemInfo.asset_name ? String(itemInfo.asset_name).trim() : '';
    if (!assetName) return '';

    return seedAssetImageMap.get(assetName) || '';
}

/** 根据种子ID获取图片 */
function getSeedImageBySeedId(seedId) {
    return getMappedSeedImage(seedId);
}

/**
 * 重新加载官方植物阶段图片清单。导出工具更新 manifest 后无需重启服务。
 * 同时合并外部素材 provider（插件）的 manifest 条目。
 */
function loadPlantPhaseManifest(force = false) {
    if (!plantPhaseManifestPath && externalGameConfigProviders.length === 0) return;
    const nextMap = new Map();
    let needsLoad = force;
    function mergeManifestFile(path, urlPrefix) {
        if (!fs.existsSync(path)) return;
        try {
            const stat = fs.statSync(path);
            if (!force && stat.mtimeMs <= (plantPhaseManifestMtimeMs || 0)) return;
            needsLoad = true;
            const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
            for (const [assetName, phases] of Object.entries(manifest)) {
                if (!assetName) continue;
                const cleaned = {};
                for (const [phaseKey, imagePath] of Object.entries(phases || {})) {
                    // provider manifest 里可能写 "plant_images/Crop_1/1.png"，
                    // 也可能直接写完整 URL。两种都处理。
                    let url = String(imagePath || '');
                    if (!/^https?:\/\//.test(url) && !url.startsWith(urlPrefix)) {
                        url = `${urlPrefix}/${url.replace(/^\//, '')}`;
                    }
                    cleaned[phaseKey] = url;
                }
                // 宿主 basePath 的 asset 优先，provider 的只补充缺失
                if (!nextMap.has(assetName)) nextMap.set(assetName, cleaned);
                else {
                    const existing = nextMap.get(assetName);
                    for (const [pk, pv] of Object.entries(cleaned)) {
                        if (!existing[pk]) existing[pk] = pv;
                    }
                }
            }
        } catch (err) {
            console.warn(`[配置] 加载 plant_images manifest ${path} 失败: ${err.message}`);
        }
    }
    // 宿主 manifest 优先合并
    mergeManifestFile(plantPhaseManifestPath, '/game-config');
    for (const provider of externalGameConfigProviders) {
        mergeManifestFile(path.join(provider.dir, 'assets', 'plant_images', 'manifest.json'), provider.urlPrefix || '/game-config');
    }
    if (!needsLoad) return;
    plantPhaseImageMap.clear();
    for (const [assetName, phases] of nextMap) plantPhaseImageMap.set(assetName, phases);
    try { plantPhaseManifestMtimeMs = fs.existsSync(plantPhaseManifestPath) ? fs.statSync(plantPhaseManifestPath).mtimeMs : Date.now(); } catch { plantPhaseManifestMtimeMs = Date.now(); }
    console.warn(`[配置] 已加载植物阶段图片映射 (${  plantPhaseImageMap.size  } 种)`);
}

/**
 * 根据植物ID和当前阶段获取官方植物图片
 * @returns {string} 可公开访问的阶段图片URL，未导出时为空字符串
 */
function getPlantImageByPhase(plantId, phase) {
    loadPlantPhaseManifest();
    // 客户端的种子阶段共用 plant Bundle 中 model/v4/zhongzi，不使用各作物的发芽图。
    if (Number(phase) === 1) {
        const commonImages = plantPhaseImageMap.get('__common');
        return commonImages && commonImages.seed || '';
    }
    const plant = plantMap.get(Number(plantId) || 0);
    if (!plant) return '';
    const seedId = Number(plant.seed_id) || 0;
    const itemInfo = itemInfoMap.get(seedId);
    const assetName = String(
        plant.asset_name
        || (itemInfo && itemInfo.asset_name)
        || (seedId > 20000 ? `Crop_${seedId - 20000}` : `Plant_${plant.id}`)
    ).trim();
    if (!assetName) return '';
    const phases = plantPhaseImageMap.get(assetName);
    if (!phases) return '';
    const numericPhase = Number(phase) || 1;
    return phases[String(numericPhase)] || '';
}

/**
 * 根据当前变异组合解析客户端应展示的植物 ID。
 * mutant_effect_plant 格式示例：5:1120112:1;5_6:1129001:1。
 * 多效果组合优先于单效果，避免黄金+活动变异退化成普通黄金作物。
 */
function getMutantDisplayPlantId(plantId, mutantIds) {
    const numericPlantId = Number(plantId) || 0;
    if (!Array.isArray(mutantIds) || mutantIds.length === 0) return numericPlantId;
    const activeIds = new Set(mutantIds.map(id => Number(id) || 0).filter(id => id > 0));
    let currentPlantId = numericPlantId;
    const visited = new Set([currentPlantId]);

    // 部分组合通过两段映射完成，例如普通作物 -> 黄金作物 -> 黄金活动变异作物。
    for (let depth = 0; depth < 4; depth += 1) {
        const plant = plantMap.get(currentPlantId);
        const mapping = String(plant && plant.mutant_effect_plant || '').trim();
        if (!mapping) break;
        let bestMatch = null;
        for (const entry of mapping.split(';')) {
            const [effectKey, targetIdText] = entry.split(':');
            const effectIds = String(effectKey || '')
                .split('_')
                .map(id => Number(id) || 0)
                .filter(id => id > 0);
            const targetId = Number(targetIdText) || 0;
            if (!targetId || effectIds.length === 0 || !effectIds.every(id => activeIds.has(id))) continue;
            if (!bestMatch || effectIds.length > bestMatch.effectCount) {
                bestMatch = { effectCount: effectIds.length, targetId };
            }
        }
        if (!bestMatch || visited.has(bestMatch.targetId)) break;
        currentPlantId = bestMatch.targetId;
        visited.add(currentPlantId);
    }
    return currentPlantId;
}

/** 获取变异作物阶段图，缺少专属导出图时回退到原作物。 */
function getMutantPlantImageByPhase(plantId, mutantIds, phase) {
    const displayPlantId = getMutantDisplayPlantId(plantId, mutantIds);
    return getPlantImageByPhase(displayPlantId, phase) || getPlantImageByPhase(plantId, phase);
}

/** 根据物品ID获取图片 */
function getItemImageById(itemId) {
    const numericId = Number(itemId) || 0;
    if (numericId <= 0) return '';

    const staticImage = staticItemImageMap.get(numericId);
    if (staticImage) return staticImage;

    const tryGetImage = (targetId) => {
        const img = seedImageMap.get(targetId);
        if (img) return img;
        const info = itemInfoMap.get(targetId);
        const assetName = info && info.asset_name ? String(info.asset_name) : '';
        if (assetName) {
            const assetImg = seedAssetImageMap.get(assetName);
            if (assetImg) return assetImg;
        }
        return '';
    };

    // 1. 先直接查找
    let image = tryGetImage(numericId);
    if (image) return image;

    // 2. 尝试通过果实ID找到植物，再用种子ID查找
    const plant = getPlantByFruitId(numericId);
    if (plant && plant.seed_id) {
        image = tryGetImage(plant.seed_id);
        if (image) return image;
    }

    // 3. 查找装扮道具图片映射
    const skinImg = skinDetailImageMap.get(numericId);
    if (skinImg) return skinImg;

    return '';
}

/** 根据物品ID获取物品信息 */
function getItemById(itemId) {
    const numericId = Number(itemId) || 0;
    const staticInfo = staticItemInfoMap.get(numericId);
    const itemInfo = itemInfoMap.get(numericId);
    if (!staticInfo) return itemInfo;
    return {
        ...(itemInfo || {}),
        ...staticInfo,
    };
}

/** 判断是否是种子物品 */
function isSeedItem(itemId) {
    return seedItemMap.has(Number(itemId) || 0);
}

/** 获取种子价格 */
function getSeedPrice(seedId) {
    const item = seedItemMap.get(Number(seedId) || 0);
    return item ? Number(item.price) || 0 : 0;
}

/** 获取种子所需等级 */
function getSeedLevel(seedId) {
    const item = seedItemMap.get(Number(seedId) || 0);
    return item ? Number(item.level) || 0 : 0;
}

/** 获取果实单价 */
function getFruitPrice(fruitId) {
    const item = itemInfoMap.get(Number(fruitId) || 0);
    return item ? Number(item.price) || 0 : 0;
}

/** 根据种子ID获取果实层级 */
function getFruitLayerBySeedId(seedId) {
    const numericSeedId = Number(seedId) || 0;
    const plant = seedToPlant.get(numericSeedId);
    if (!plant) {
        console.warn(`[getFruitLayerBySeedId] 未找到种子ID ${  numericSeedId  } 对应的植物`);
        return 0;
    }
    if (!plant.fruit || !plant.fruit.id) {
        console.warn(`[getFruitLayerBySeedId] 种子ID ${  numericSeedId  } 的植物没有果实信息`);
        return 0;
    }

    const fruitId = Number(plant.fruit.id) || 0;
    const fruitItem = itemInfoMap.get(fruitId);
    if (!fruitItem) {
        console.warn(`[getFruitLayerBySeedId] 未找到果实ID ${  fruitId  } 的物品信息`);
        return 0;
    }

    return Number(fruitItem.layer) || 0;
}

/** 根据果实ID获取果实层级 */
function getFruitLayerByFruitId(fruitId) {
    const numericFruitId = Number(fruitId) || 0;
    const fruitItem = itemInfoMap.get(numericFruitId);
    if (!fruitItem) return 0;
    return Number(fruitItem.layer) || 0;
}

/** 获取所有植物列表 */
function getAllPlants() {
    return Array.from(plantMap.values());
}

/** 根据变异效果ID获取变异效果 */
function getMutantEffectById(mutantId) {
    return mutantEffectMap.get(Number(mutantId) || 0);
}

/** 根据图标获取变异效果 */
function getMutantEffectByIcon(icon) {
    return mutantEffectByIconMap.get(String(icon || ''));
}

/** 获取所有变异效果 */
function getAllMutantEffects() {
    return mutantEffectConfig || [];
}

/** 根据多个变异效果ID批量获取 */
function getMutantEffectsByIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids
        .map(id => mutantEffectMap.get(Number(id) || 0))
        .filter(effect => effect !== undefined);
}

/**
 * 自举扫描仓库内置插件目录，自动注册 gameConfig.provides=true 的素材插件。
 * 这样 gameConfig 独立加载（测试、开发模式）时也能拿到素材，不依赖 host.js 激活。
 * host.js 激活时会再用 data/plugins/installed/ 下的版本注册一次——同内容不同目录，
 * merge 是 first-wins 所以不会出错。
 */
function autoRegisterBuiltinGameConfigProviders() {
    const pluginsDir = path.resolve(__dirname, '../../plugins');
    if (!fs.existsSync(pluginsDir)) return;
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'builtin') continue;
        const manifestPath = path.join(pluginsDir, entry.name, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        let manifest;
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { continue; }
        if (manifest?.gameConfig?.provides !== true) continue;
        const providerDir = path.join(pluginsDir, entry.name);
        const urlPrefix = manifest.gameConfig.urlPrefix || '/game-config';
        // 避免重复注册
        if (!externalGameConfigProviders.some(p => p.dir === providerDir)) {
            externalGameConfigProviders.push({ dir: providerDir, urlPrefix });
        }
    }
}

// 启动时加载配置
autoRegisterBuiltinGameConfigProviders();
loadConfigs();

/**
 * 注册一个外部素材提供者（素材插件安装目录）。
 * 目录约定：<dir>/catalog/EventPlants.json、<dir>/assets/seed_images_named/、
 * <dir>/assets/plant_images/manifest.json 等。宿主目录优先，provider 只补充缺失。
 *
 * @param {string} dir       - provider 安装目录绝对路径
 * @param {string} [urlPrefix] - 前端访问前缀，默认 "/game-config"
 */
function registerExternalGameConfigProvider(dir, urlPrefix) {
    const idx = externalGameConfigProviders.findIndex(p => p.dir === dir);
    const normalized = { dir, urlPrefix: urlPrefix || '/game-config' };
    if (idx >= 0) externalGameConfigProviders[idx] = normalized;
    else externalGameConfigProviders.push(normalized);
    loadConfigs();
}

/** 卸载 provider：从列表移除并重新加载 */
function unregisterExternalGameConfigProvider(dir) {
    const before = externalGameConfigProviders.length;
    for (let i = before - 1; i >= 0; i -= 1) {
        if (externalGameConfigProviders[i].dir === dir) externalGameConfigProviders.splice(i, 1);
    }
    if (externalGameConfigProviders.length !== before) loadConfigs();
}

/**
 * 供 admin.js 等动态读取当前已注册 provider 列表（只读副本）。
 * admin 静态路由在运行时遍历它们做素材回退。
 */
function getExternalGameConfigProviders() {
    return externalGameConfigProviders.slice();
}

module.exports = {
    registerExternalGameConfigProvider,
    unregisterExternalGameConfigProvider,
    getExternalGameConfigProviders,
    loadConfigs,
    getAllPlants,
    getAllSeeds,
    getLevelExpTable,
    getLevelExpProgress,
    getPlantById,
    getPlantBySeedId,
    getPlantName,
    getPlantNameBySeedId,
    getPlantGrowTime,
    getPlantGrowPhases,
    getPlantExp,
    formatGrowTime,
    getSeedHarvestInfo,
    getFruitName,
    getPlantByFruitId,
    getItemById,
    getItemImageById,
    isSeedItem,
    getSeedPrice,
    getFruitPrice,
    getFruitLayerBySeedId,
    getFruitLayerByFruitId,
    getSeedImageBySeedId,
    getPlantImageByPhase,
    getMutantDisplayPlantId,
    getMutantPlantImageByPhase,
    getSeedLevel,
    getMutantEffectById,
    getMutantEffectByIcon,
    getAllMutantEffects,
    getMutantEffectsByIds
};
