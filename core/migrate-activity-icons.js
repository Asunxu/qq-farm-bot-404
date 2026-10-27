// Migrate all /activity/* staticItemImageMap icons into material-plugin
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const MAT_ASSETS = path.join(PLUGINS_DIR, 'material-plugin', 'assets', 'seed_images_named');

// Parse staticItemImageMap entries from gameConfig.js
const gameConfigSrc = fs.readFileSync(path.join(ROOT, 'src', 'config', 'gameConfig.js'), 'utf8');
const activityEntries = [];
// Match lines like: [1041, '/activity/milk-tea/icon_s4_ticket.png'],
const re = /\[(\d+),\s*['"](\/activity\/[^'"]+)['"]\]/g;
let m;
while ((m = re.exec(gameConfigSrc)) !== null) {
    activityEntries.push({ itemId: m[1], srcPath: m[2] });
}

console.log(`Found ${activityEntries.length} /activity/* entries in staticItemImageMap`);

// For each entry, find the file across all plugins assets/
const results = [];
for (const entry of activityEntries) {
    // srcPath like /activity/milk-tea/icon_s4_ticket.png
    // The actual file is at plugins/milk-tea/assets/icon_s4_ticket.png
    // We want just the filename part
    const filename = path.basename(entry.srcPath);
    let foundAt = null;
    for (const plugin of fs.readdirSync(PLUGINS_DIR)) {
        const candidate = path.join(PLUGINS_DIR, plugin, 'assets', filename);
        if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
            foundAt = candidate;
            break;
        }
    }
    const dst = path.join(MAT_ASSETS, filename);
    const alreadyThere = fs.existsSync(dst);
    results.push({ ...entry, filename, foundAt, dst, alreadyThere });
}

// Print plan
console.log('\n=== Migration Plan ===');
let ok = 0, miss = 0, dup = 0;
for (const r of results) {
    if (!r.foundAt) {
        console.log(`  MISS: itemId=${r.itemId} srcPath=${r.srcPath}`);
        miss++;
    } else if (r.alreadyThere) {
        const srcSize = fs.statSync(r.foundAt).size;
        const dstSize = fs.statSync(r.dst).size;
        const tag = srcSize === dstSize ? 'SYNCED' : `DIFF(${srcSize}→${dstSize})`;
        console.log(`  ${tag}: itemId=${r.itemId} ${r.filename} (from ${path.basename(path.dirname(path.dirname(r.foundAt)))})`);
        ok++;
        if (srcSize !== dstSize) dup++;
    } else {
        console.log(`  COPY: itemId=${r.itemId} ${r.filename}`);
        ok++;
    }
}
console.log(`\nTotal: ${results.length}, OK/SYNCED: ${ok}, MISSING: ${miss}, SIZE_DIFF: ${dup}`);

// Now execute copy
for (const r of results) {
    if (r.foundAt && (!r.alreadyThere || fs.statSync(r.foundAt).size !== fs.statSync(r.dst).size)) {
        fs.copyFileSync(r.foundAt, r.dst);
    }
}
console.log('\n=== Copy done ===');

// Now output new staticItemImageMap entries pointing to /game-config/
console.log('\n=== New staticItemImageMap entries ===');
for (const r of results) {
    const isPng = r.filename.endsWith('.png') || r.filename.endsWith('.svg');
    const queryIdx = r.filename.indexOf('?');
    const cleanName = queryIdx > 0 ? r.filename.substring(0, queryIdx) : r.filename;
    const newPath = isPng ? `/game-config/seed_images_named/${cleanName}` : r.srcPath;
    if (r.foundAt) {
        console.log(`    [${r.itemId}, '${newPath}'],`);
    } else {
        console.log(`    // MISSING → was ${r.srcPath}`);
    }
}
