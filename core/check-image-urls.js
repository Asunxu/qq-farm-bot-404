// Check what getItemImageById actually returns
const { getItemImageById, getSeedImageBySeedId, getItemById, getPlantByFruitId, getPlantBySeedId } = require('./src/config/gameConfig');

const testIds = [
  20021, 40021, 1040021,  // 可可豆 seed/fruit/mutant
  20525, 40525,           // 甜莓
  20526, 40526,           // 白桃
  20527, 40527,           // 甜橙
  20528, 40528,           // 红柚
  20529, 40529,           // 芭乐
  2021, 4021,             // 已确认工作的普通种子/果实做对照
  1005,                   // 金豆豆 GUI 道具
  301101,                 // 奶茶券
];

console.log('=== getItemImageById returns ===');
for (const id of testIds) {
  const url = getItemImageById(id);
  const info = getItemById(id);
  const name = info ? info.name : '(unknown)';
  const plant = getPlantBySeedId(id) || getPlantByFruitId(id);
  const asset = plant ? plant.asset_name : '(no plant)';
  console.log(`  id=${id} name=${name} asset=${asset} => ${url || '(EMPTY!)'}`);
}

console.log('\n=== getSeedImageBySeedId returns ===');
for (const id of [20021, 20525, 20526, 20527, 20528, 20529, 2021]) {
  const url = getSeedImageBySeedId(id);
  console.log(`  seedId=${id} => ${url || '(EMPTY!)'}`);
}

console.log('\n=== seedAssetImageMap check ===');
const { seedAssetImageMap } = require('./src/config/gameConfig');
for (const asset of ['Crop_21', 'Crop_525', 'Crop_526', 'Crop_527', 'Crop_528', 'Crop_529', 'Crop_22']) {
  console.log(`  asset=${asset} => ${seedAssetImageMap.get(asset) || '(EMPTY!)'}`);
}
