// Batch download missing icons from official CDN
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MAT_ASSETS = path.join(ROOT, 'plugins', 'material-plugin', 'assets', 'seed_images_named');
const findScript = path.join(ROOT, 'scripts', 'find-cdn-resource.js');
const NODE = 'C:\\Users\\asin\\.workbuddy\\binaries\\node\\versions\\22.22.2-3\\node.exe';

// From migration output, the MISSING ones, derive CDN search paths
const missing = [
    // itemId, icon name (from CDN icon_res or activity name)
    { id: 6001, name: 'firework', search: 'firework' },
    { id: 26030, name: 'moon-beauty-seed', search: 'moon_beauty' },
    { id: 80002, name: 'fertilizer-4h', search: 'fertilizer' },
    { id: 80003, name: 'fertilizer-8h', search: 'fertilizer' },
    { id: 80004, name: 'fertilizer-12h', search: 'fertilizer' },
    { id: 80013, name: 'organic-fertilizer-8h', search: 'organic_fertilizer' },
    { id: 80014, name: 'organic-fertilizer-12h', search: 'organic_fertilizer' },
    { id: 1002, name: 'coupon', search: 'coupon' },
    { id: 20435, name: 'lily-seed', search: 'lily' },
    { id: 204010, name: 'moon-rabbit-skin', search: 'moon_rabbit' },
    { id: 90042, name: 'cute-bear-skin', search: 'cute_bear' },
    { id: 101604, name: 'settlement-pack', search: 'settlement' },
    { id: 1023, name: 'star-token', search: 'star_token' },
    { id: 1024, name: 'qixi-feather', search: 'qixi' },
    { id: 301103, name: 'qixi-dew', search: 'qixi' },
    { id: 5001, name: 'weather-collection-bottle', search: 'weather' },
    { id: 5002, name: 'rainstorm-summon-bottle', search: 'rainstorm' },
    { id: 5005, name: 'frog-prank-bottle', search: 'frog' },
    { id: 5006, name: 'cloud-prank-bottle', search: 'cloud' },
    { id: 1027, name: 'lightning-badge', search: 'lightning' },
    { id: 4002, name: 'lightning-sense', search: 'lightning' },
    { id: 4003, name: 'lightning-sense', search: 'lightning' },
    { id: 2159, name: 'avatar-frame', search: 'avatar_frame' },
];

// First: query ItemInfo table for each ID to get icon_res from official config
const { getItemById } = require('./src/config/gameConfig');
console.log('=== ItemInfo icon_res lookup ===');
for (const m of missing) {
    const info = getItemById(m.id);
    const iconRes = info?.icon_res || '';
    console.log(`  id=${m.id} name=${info?.name || '(unknown)'} icon_res=${iconRes}`);
}
