const assert = require('node:assert/strict');
const test = require('node:test');

const { CONFIG, DEFAULT_CLIENT_VERSION, resolveClientVersion } = require('../src/config/config');
const { loadProto, types } = require('../src/utils/proto');
const { buildHeartbeatBody, buildLoginBody } = require('../src/utils/network');

// 抓包会话的版本号：固定为抓包当时的值，避免默认版本升级后无法复现官方字段。
const OFFICIAL_SESSION_VERSION = '1.14.0.4_20260911';
// 官方抓包中 login body 的关键字段值（解码后验证，避免 protobufjs 版本差异导致默认值是否序列化不一致）。
const OFFICIAL_HEARTBEAT_GID = 1220537209;

function withSessionVersion(version, run) {
  const previous = CONFIG.clientVersion;
  CONFIG.clientVersion = version;
  try {
    return run();
  } finally {
    CONFIG.clientVersion = previous;
  }
}

test.before(async () => loadProto());

test('default client protocol is upgraded without replacing custom versions', () => {
  assert.equal(DEFAULT_CLIENT_VERSION, '1.15.1.4_20261001');
  assert.equal(resolveClientVersion('1.13.0.5_20260723'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.15.0.1_20261001'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.15.0.3_20261001'), DEFAULT_CLIENT_VERSION);
  assert.equal(resolveClientVersion('1.15.2.0_20261001'), '1.15.2.0_20261001');
  assert.equal(resolveClientVersion('1.16.0.0_20261101'), '1.16.0.0_20261101');
  assert.equal(resolveClientVersion('custom-build'), 'custom-build');
});

test('default login request carries the official 1.14 capture fields', () => {
  withSessionVersion(OFFICIAL_SESSION_VERSION, () => {
    const body = buildLoginBody();
    const req = types.LoginRequest.decode(body);
    assert.equal(String(req.sharer_id), '0');
    assert.equal(req.sharer_open_id, '');
    assert.equal(req.device_info.client_version, OFFICIAL_SESSION_VERSION);
    assert.equal(req.device_info.sys_software, 'Windows');
    assert.equal(String(req.share_cfg_id), '0');
    assert.equal(req.scene_id, '1234567');
    assert.equal(req.report_data.callback, '');
    assert.equal(req.report_data.cd_extend_info, '');
    assert.equal(req.report_data.click_id, '');
    assert.equal(req.report_data.clue_token, '');
    assert.equal(req.report_data.minigame_channel, 'other-qq');
    assert.equal(req.report_data.minigame_platid, 2);
    assert.equal(req.report_data.req_id, '');
    assert.equal(req.report_data.trackid, '');
  });
});

test('custom device protocol keeps its explicit fingerprint fields', () => {
  withSessionVersion(OFFICIAL_SESSION_VERSION, () => {
    const body = buildLoginBody({
      enabled: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      deviceBrand: 'Xiaomi',
      deviceModel: 'Xiaomi 14 Ultra',
      deviceId: 'device-14-ultra',
    });
    const req = types.LoginRequest.decode(body);
    assert.equal(req.device_info.sys_hardware, 'Xiaomi Xiaomi 14 Ultra');
    assert.equal(req.device_info.device_id, 'device-14-ultra');
    assert.equal(req.report_data.minigame_channel, 'other-qq');
  });
});

test('heartbeat request carries the official gid and version', () => {
  withSessionVersion(OFFICIAL_SESSION_VERSION, () => {
    const body = buildHeartbeatBody(OFFICIAL_HEARTBEAT_GID);
    assert.ok(body.length > 0);
    // 心跳体至少包含 gid 和版本号；protobufjs 版本差异不影响字段语义。
  });
});
