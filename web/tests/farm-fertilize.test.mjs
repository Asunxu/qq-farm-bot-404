import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// This repository runs its tests with Node's built-in runner.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPinia, disposePinia, setActivePinia } = require('pinia')
const ts = require('typescript')
const { reactive } = require('vue')

// Run the real store with Vue/Pinia; only external I/O and browser storage are replaced.
function harness(t, api) {
  const pinia = createPinia()
  setActivePinia(pinia)
  t.after(() => disposePinia(pinia))
  const account = reactive({ currentAccountId: 'a' })
  const imports = {
    '@/api': { __esModule: true, default: api },
    '@/stores/account': { useAccountStore: () => account },
  }
  const source = readFileSync(new URL('../src/stores/farm.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  // Execute the real transpiled store with test I/O, without adding a browser or bundler dependency.
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(id => imports[id] || require(id), module, module.exports)
  const useStore = module.exports.useFarmStore
  return { store: useStore(pinia), account }
}

test('bulk fertilizer applies authoritative partial results, refreshes lands and blocks duplicate requests', async (t) => {
  const posts = []
  const { store } = harness(t, {
    post: (url, body, options) => new Promise(resolve => posts.push({ url, body, options, resolve })),
    get: async () => ({ data: { ok: true, data: { lands: [{ id: 1, status: 'growing', matureInSec: 100 }] } } }),
  })
  store.lands = [{ id: 1, status: 'growing', matureInSec: 900 }]
  const pending = store.fertilizeAll('a', 'organic')
  assert.equal(await store.fertilizeAll('a', 'organic'), null)
  assert.equal(posts.length, 1)
  assert.equal(posts[0].url, '/api/land/fertilize-all')
  assert.deepEqual(posts[0].body, { fertilizerType: 'organic' })
  assert.equal(posts[0].options.headers['x-account-id'], 'a')
  posts[0].resolve({ data: { ok: true, data: { successCount: 1, skippedCount: 2, fertilizerRemainingSec: 500 } } })
  const result = await pending
  assert.equal(result.successCount, 1)
  assert.equal(result.skippedCount, 2)
  assert.equal(store.lands[0].matureInSec, 100)
  assert.equal(store.fertilizeAllLoading, false)
  assert.equal(store.fertilizeAllError, '')
})

test('bulk fertilizer marks non-ok replies as failures without touching lands', async (t) => {
  const { store } = harness(t, {
    post: async () => ({ data: { ok: false, error: '化肥不足' } }),
    get: async () => { throw new Error('lands must not be refetched on failure') },
  })
  store.lands = [{ id: 1, status: 'growing', matureInSec: 800 }]
  const result = await store.fertilizeAll('a', 'normal')
  assert.equal(result, null)
  assert.equal(store.fertilizeAllError, '化肥不足')
  assert.equal(store.fertilizeAllLoading, false)
  assert.equal(store.lands[0].matureInSec, 800)
})

test('bulk fertilizer turns network errors into a user-facing message and always clears loading', async (t) => {
  const { store } = harness(t, {
    post: async () => { throw new Error('network down') },
    get: async () => ({ data: { ok: true, data: { lands: [] } } }),
  })
  const result = await store.fertilizeAll('a', 'normal')
  assert.equal(result, null)
  assert.match(store.fertilizeAllError, /network down/)
  assert.equal(store.fertilizeAllLoading, false)
})

test('bulk fertilizer without an account id sends no request', async (t) => {
  let posted = false
  const { store } = harness(t, {
    post: async () => { posted = true },
    get: async () => ({ data: { ok: true, data: { lands: [] } } }),
  })
  assert.equal(await store.fertilizeAll('', 'normal'), null)
  assert.equal(posted, false)
  assert.equal(store.fertilizeAllLoading, false)
})
