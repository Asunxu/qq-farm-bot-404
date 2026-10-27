const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { getItemById, getItemImageById, getPlantByFruitId } = require('../src/config/gameConfig');
const sources = require('../src/gameConfig/seed_images_named/illustrated-fruit-sources.json');
const { readAsset } = require('./_asset-resolver');

function assertImageReadable(url) {
  assert.match(url, /^\/game-config\/seed_images_named\/\d+[^/]*\.png$/);
  const bytes = readAsset(url);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
}

test('missing illustrated fruits resolve official names and intact local images', () => {
  const expected = new Map([
    [1046030, '黄金·月下美人'], [40435, '山丹丹'], [46030, '月下美人'],
    [1040516, '黄金·狗尾草'], [1041072, '黄金·寒兰'],
    [1041625, '黄金·枸杞'],
    [1045995, '黄金·芦苇'],
    [204008, '比熊棉花糖'], [204009, '黄金·比熊棉花糖'],
    [1049004, '黄金·泡泡棉花糖'], [41072, '寒兰'], [41625, '枸杞'],
    [41435, '森野柿子'], [49005, '森野黄金芽'], [42254, '天山红枫'],
    [1040021, '黄金·森野可可豆'], [1040525, '黄金·森野甜莓'],
    [1040526, '黄金·森野白桃'], [1040527, '黄金·森野甜橙'],
    [1040528, '黄金·森野红柚'], [1040165, '黄金·茱萸'],
    [1040435, '黄金·山丹丹'], [1040529, '黄金·森野芭乐'],
    [204011, '金露云酪'], [204012, '黄金·金露云酪'],
    [1049005, '黄金·森野黄金芽'],
  ]);
  for (const [id, name] of expected) {
    assert.equal(getItemById(id)?.name, name);
    assertImageReadable(getItemImageById(id));
  }
  for (const source of sources.items) {
    const bytes = readAsset(path.join('seed_images_named', source.file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.match(source.url, /^https:\/\/cdn-resource\.nqf\.qq\.com\//);
  }
});

test('orchid and goji fruits retain single-grid plant and seed relationships', () => {
  for (const [fruit, seed, name] of [[41072, 21072, '寒兰'], [41625, 21625, '枸杞']]) {
    const plant = getPlantByFruitId(fruit);
    assert.equal(plant?.seed_id, seed);
    assert.equal(plant?.size, 1);
    assert.equal(plant?.fruit.count, 48);
    assert.equal(getItemById(seed)?.name, `${name}种子`);
    assertImageReadable(getItemImageById(seed));
  }
});
