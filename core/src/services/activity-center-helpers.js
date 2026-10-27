/**
 * 活动中心共享辅助函数
 *
 * 从上游 activity-center.ts 移植，供萌宠成长日记（S3）等活动 service 复用。
 * 这些函数原本内联在上游 TypeScript 聚合模块中，本地按 JS 单模块拆出以便注入。
 */
const LongModule = require('long');
const { getItemById, getItemImageById } = require('../config/gameConfig');

const MAX_SIGNED_INT64 = 9223372036854775807n;

// ==================== 裸 protobuf 字段读取 ====================
// 用于解析未注册到 proto Root 的官方协议（如节令小札 V1 的手工编码消息）。
// 从 activity.js 迁入：供宿主 activity service 与活动插件（ctx.helpers）共用。

function toNumSafe(val) {
    if (val === null || val === undefined) return 0;
    if (LongModule.isLong && LongModule.isLong(val)) return val.toNumber();
    if (typeof val === 'object' && 'low' in val && 'high' in val) {
        if (typeof val.toNumber === 'function') return val.toNumber();
        return (val.low >>> 0) + (val.high * 0x100000000);
    }
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
}

function readProtoFields(rawBytes) {
    const protobuf = require('protobufjs');
    const buf = Buffer.from(rawBytes || []);
    const reader = protobuf.Reader.create(buf);
    const entries = [];
    while (reader.pos < reader.len) {
        let tag = 0;
        try {
            tag = reader.uint32();
        } catch {
            break;
        }
        const field = tag >>> 3;
        const wire = tag & 0x7;
        try {
            if (wire === 0) {
                entries.push({ field, wire, value: toNumSafe(reader.uint64()) });
            } else if (wire === 2) {
                entries.push({ field, wire, value: Buffer.from(reader.bytes()) });
            } else if (wire === 5) {
                entries.push({ field, wire, value: reader.uint32() });
            } else if (wire === 1) {
                entries.push({ field, wire, value: reader.fixed64() });
            } else {
                reader.skipType(wire);
            }
        } catch {
            break;
        }
    }
    return entries;
}

function getProtoNumber(entries, field, fallback = 0) {
    const hit = (entries || []).find(entry => entry.field === field && entry.wire === 0);
    return hit ? toNumSafe(hit.value) : fallback;
}

function getProtoBytes(entries, field) {
    const hit = (entries || []).find(entry => entry.field === field && entry.wire === 2);
    return hit ? Buffer.from(hit.value || []) : null;
}

function getProtoBytesAll(entries, field) {
    return (entries || [])
        .filter(entry => entry.field === field && entry.wire === 2)
        .map(entry => Buffer.from(entry.value || []));
}

function getProtoString(entries, field, fallback = '') {
    const bytes = getProtoBytes(entries, field);
    if (!bytes || bytes.length === 0) return fallback;
    try {
        return bytes.toString('utf8');
    } catch {
        return fallback;
    }
}

/** 解析 corepb.Item 结构的裸字节为统一物品展示对象 */
function parseActivityItemMessage(rawBytes) {
    const entries = readProtoFields(rawBytes);
    const itemId = getProtoNumber(entries, 1);
    const count = Math.max(0, getProtoNumber(entries, 2) || 1);
    if (itemId <= 0) return null;
    const info = getItemById(itemId);
    const name = (info && info.name) || `物品${itemId}`;
    return {
        itemId,
        itemCount: count,
        count,
        itemName: name,
        name,
        image: getItemImageById(itemId) || '',
    };
}

class ActivityBusinessError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'ActivityBusinessError';
        this.code = code;
    }
}

function businessError(code, message) {
    return new ActivityBusinessError(code, message);
}

/** 校验并归一化 int64 正整数（用于 gid / goodsId 等外部入参） */
function positiveDecimal(value, code, fieldName) {
    let normalized = '';
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
        normalized = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
        normalized = String(value);
    }
    if (!normalized || normalized.length > 19 || BigInt(normalized) > MAX_SIGNED_INT64) {
        throw businessError(code, `${fieldName} 必须是 int64 范围内的正十进制整数`);
    }
    return normalized;
}

function int64String(value) {
    if (value == null) return '0';
    if (LongModule.isLong && LongModule.isLong(value)) return value.toString();
    if (typeof value === 'string') return /^-?\d+$/.test(value) ? value : '0';
    return Number.isSafeInteger(value) ? String(value) : '0';
}

function int64Number(value) {
    const parsed = Number(int64String(value));
    return Number.isSafeInteger(parsed) ? parsed : 0;
}

function bytesToText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const buffer = Buffer.from(value);
    const utf8 = buffer.toString('utf8');
    if (!utf8.includes('�')) return utf8;
    try {
        return new TextDecoder('gb18030').decode(buffer);
    } catch {
        return utf8;
    }
}

function plainText(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function findStrings(value, output) {
    if (typeof value === 'string') {
        const text = plainText(value);
        if (text) output.push(text);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(entry => findStrings(entry, output));
        return;
    }
    if (value && typeof value === 'object') {
        Object.values(value).forEach(entry => findStrings(entry, output));
    }
}

/** 解析活动规则文本（官方以 JSON+HTML 混合格式下发） */
function textContent(value) {
    const text = bytesToText(value).trim();
    if (!text) return { title: '', paragraphs: [] };
    try {
        const parsed = JSON.parse(text);
        const tips = parsed && typeof parsed === 'object' ? parsed.tips : null;
        const rawParagraphs = tips && Array.isArray(tips.txt) ? tips.txt : [];
        const paragraphs = rawParagraphs
            .filter(entry => typeof entry === 'string')
            .map(plainText)
            .filter(Boolean);
        if (paragraphs.length) {
            return { title: typeof tips?.title === 'string' ? plainText(tips.title) : '', paragraphs };
        }
        const allText = [];
        findStrings(parsed, allText);
        return { title: '', paragraphs: Array.from(new Set(allText)) };
    } catch {
        return { title: '', paragraphs: [plainText(text)].filter(Boolean) };
    }
}

/** 归一化物品，名称/图标优先取统一物品配置，避免页面出现“未知物品” */
function itemDto(item) {
    const rawId = item?.item_id ?? item?.itemId ?? item?.id;
    const id = int64String(rawId);
    const numericId = int64Number(rawId);
    const metadata = numericId > 0 ? getItemById(numericId) : undefined;
    return {
        id,
        count: int64String(item?.count),
        name: metadata?.name || bytesToText(item?.name),
        image: numericId > 0 ? getItemImageById(numericId) : '',
        rarity: Number(metadata?.rarity) || 0,
    };
}

let mutationTail = Promise.resolve();

/** 串行化写操作，避免同账号并发操作互相踩踏 */
function serializeMutation(operation) {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
}

module.exports = {
    ActivityBusinessError,
    MAX_SIGNED_INT64,
    businessError,
    positiveDecimal,
    int64String,
    int64Number,
    bytesToText,
    plainText,
    textContent,
    itemDto,
    serializeMutation,
    readProtoFields,
    getProtoNumber,
    getProtoBytes,
    getProtoBytesAll,
    getProtoString,
    parseActivityItemMessage,
};
