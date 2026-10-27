/**
 * 测试辅助：根据 gameConfig 返回的 URL 或相对路径，解析真实本地文件位置。
 * 素材优先从 plugins/material-plugin/assets/ 找（插件是唯一样本来源），
 * 兼容 src/gameConfig/ 旧布局（dev 时 pack 脚本可同步副本）。
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const pluginAssetRoot = path.join(repoRoot, 'plugins', 'material-plugin', 'assets');
const baseAssetRoot = path.join(repoRoot, 'src', 'gameConfig');

/**
 * 解析 URL 或相对路径为真实本地文件路径。
 * @param {string} input - 完整 URL（/game-config/...）或素材相对路径（如 plant_images/Crop_1/1.png）
 * @returns {string|null} 绝对路径，找不到返回 null
 */
function resolveAssetPath(input) {
    let relative;
    if (typeof input === 'string' && input.startsWith('/game-config/')) {
        relative = decodeURIComponent(input.slice('/game-config/'.length));
    } else {
        relative = String(input || '');
    }
    relative = relative.replace(/^\//, '').replace(/\\/g, '/');

    // 优先插件目录
    const pluginPath = path.join(pluginAssetRoot, ...relative.split('/'));
    if (fs.existsSync(pluginPath)) return pluginPath;

    // 兼容 basePath（dev 同步副本）
    const basePath = path.join(baseAssetRoot, ...relative.split('/'));
    if (fs.existsSync(basePath)) return basePath;

    return null;
}

/**
 * 检查素材文件是否存在
 */
function assetExists(input) {
    return resolveAssetPath(input) !== null;
}

/**
 * 读取素材文件内容
 */
function readAsset(input) {
    const resolved = resolveAssetPath(input);
    if (!resolved) {
        const err = new Error(`素材文件不存在: ${input}`);
        err.code = 'ENOENT';
        throw err;
    }
    return fs.readFileSync(resolved);
}

module.exports = { resolveAssetPath, assetExists, readAsset };
