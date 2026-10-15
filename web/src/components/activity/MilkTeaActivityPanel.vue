<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import api from '@/api'
import { isWithinActivityWindowMs, MILK_TEA_ACTIVITY_WINDOW } from '@/constants/activity-windows'
import { useAccountStore } from '@/stores/account'
import MilkTeaCraftDialog from './MilkTeaCraftDialog.vue'
import MilkTeaShopDialogs from './MilkTeaShopDialogs.vue'

const emit = defineEmits<{ back: [] }>()
const accounts = useAccountStore()
const host = ref<HTMLElement | null>(null)
let sizeObserver: ResizeObserver | undefined
let fitFrame: number | undefined
function scheduleFitGame() {
  if (fitFrame !== undefined)
    return
  fitFrame = requestAnimationFrame(() => {
    fitFrame = undefined
    fitGame()
  })
}
function fitGame() {
  if (!host.value)
    return
  // 手机端 .milk-host 自身就是固定定位的滚动容器（整屏面板），需把它也纳入可滚动祖先的查找
  let viewport: HTMLElement | null = host.value
  while (viewport && !/auto|scroll/.test(getComputedStyle(viewport).overflowY))
    viewport = viewport.parentElement
  if (!viewport)
    return
  // 手机端面板固定定位在顶栏下方，需实测顶部导航栏底边（顶栏不随滚动移动，fixed 定位下可直接用），
  // 交由媒体查询里的 --milk-top 使用，保证顶栏高度保留、面板从导航栏下方开始
  const layoutHeader = viewport.closest('main')?.querySelector<HTMLElement>(':scope > header')
  const headerBottom = layoutHeader ? Math.round(Math.max(0, layoutHeader.getBoundingClientRect().bottom)) : 0
  if (host.value.style.getPropertyValue('--milk-top') !== `${headerBottom}px`)
    host.value.style.setProperty('--milk-top', `${headerBottom}px`)
  const bounds = viewport.getBoundingClientRect()
  const padding = Number.parseFloat(getComputedStyle(viewport).paddingBottom) || 0
  const top = host.value.getBoundingClientRect().top + viewport.scrollTop
  const notices = Array.from(host.value.querySelectorAll<HTMLElement>('.milk-message, .milk-error'))
    .reduce((height, notice) => height + notice.getBoundingClientRect().height, 0)
  const height = Math.max(0, bounds.top + viewport.clientHeight - padding - top - notices)
  const unit = `${(Math.floor(Math.min(620, host.value.clientWidth, height * 900 / 1600)) / 100).toFixed(3)}px`
  if (host.value.style.getPropertyValue('--milk-u') !== unit)
    host.value.style.setProperty('--milk-u', unit)
}

const state = ref<any>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const tab = ref<'shop' | 'exchange' | 'work'>('shop')
const filter = ref('全部')
const modal = ref('')
const purchaseCount = ref(1)
const selectedGoods = computed(() => state.value?.goods?.find((good: any) => `goods:${good.id}` === modal.value))
const purchaseMax = computed(() => Math.max(0, Number(selectedGoods.value?.maxPurchasable || 0)))
const validPurchase = computed(() => Number.isSafeInteger(purchaseCount.value) && purchaseCount.value >= 1 && purchaseCount.value <= purchaseMax.value)
watch(modal, () => {
  purchaseCount.value = 1
})
watch(purchaseMax, (maximum) => {
  if (purchaseCount.value > maximum)
    purchaseCount.value = Math.max(1, maximum)
})
function clampPurchase() {
  purchaseCount.value = Math.min(Math.max(1, purchaseMax.value), Math.max(1, Math.floor(Number(purchaseCount.value) || 1)))
}
function totalCost(cost: any) {
  return (BigInt(cost.count || 0) * BigInt(Number.isSafeInteger(purchaseCount.value) && purchaseCount.value >= 1 ? purchaseCount.value : 0)).toString()
}
const records = ref<any>(null)
const shopName = ref('奶茶冲鸭')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval>
let generation = 0
const img = (name: string) => `/activity/milk-tea/${name}.png`
const currencyIcon = (item: any) => ({ 1001: '/game-config/resource-icons/gold.png', 1004: '/game-config/resource-icons/diamond.png', 1041: img('icon_s4_ticket') } as Record<string, string>)[String(item.id ?? item.itemId)] || item.image || ''
const money = (id: string) => state.value?.balances?.find((x: any) => String(x.itemId ?? x.id) === id)?.count || '0'
const goods = computed(() => (state.value?.goods || []).filter((g: any) => filter.value === '全部' || (filter.value === '种子' ? g.category_tag === 'seed' : g.category_tag !== 'seed')))
const recipes = computed(() => (state.value?.recipes || []).filter((x: any) => x.unlocked).sort((a: any, b: any) => Number(a.recipe_id) - Number(b.recipe_id)))
const shelfRecipes = computed(() => [...recipes.value].sort((a: any, b: any) => Number(b.stock_cups === '-1') - Number(a.stock_cups === '-1') || Number(b.recipe_id) - Number(a.recipe_id)))
const remaining = computed(() => {
  const seconds = Math.max(0, (Number(state.value?.endTime || 0) * 1000 - now.value) / 1000)
  return `${Math.floor(seconds / 86400)}天${Math.floor(seconds % 86400 / 3600)}时`
})
const date = (sec: number) => new Date(sec * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const duration = (sec: number) => `${Math.floor(Math.max(0, sec) / 3600).toString().padStart(2, '0')}:${Math.floor(Math.max(0, sec) % 3600 / 60).toString().padStart(2, '0')}`
async function refresh() {
  if (loading.value || busy.value || !accounts.currentAccountId || !isWithinActivityWindowMs(MILK_TEA_ACTIVITY_WINDOW))
    return
  const token = generation
  const accountId = accounts.currentAccountId
  loading.value = true
  try {
    const { data } = await api.get('/api/activity/milk-tea', { headers: { 'x-account-id': accountId }, timeout: 100000 })
    if (token !== generation)
      return
    if (!data.ok || !data.activity)
      throw new Error(data.error || '活动数据读取失败')
    state.value = data.activity
    error.value = ''
  }
  catch (e: any) {
    if (token === generation)
      error.value = e.response?.data?.error || e.message
  }
  finally {
    if (token === generation)
      loading.value = false
  }
}
async function act(action: string, params: any = {}) {
  if (busy.value || loading.value || !accounts.currentAccountId)
    return
  const token = generation
  busy.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/activity/milk-tea/operate', { accountId: accounts.currentAccountId, action, params }, { headers: { 'x-account-id': accounts.currentAccountId }, timeout: 190000 })
    if (token !== generation)
      return
    if (!data.ok)
      throw new Error(data.error || '操作失败')
    state.value = data.activity
    if (!['shareDaily', 'shareRewards', 'fundRewards', 'upgrade'].includes(action))
      modal.value = ''
  }
  catch (e: any) {
    if (token === generation) {
      const message = e.response?.data?.error || e.message
      error.value = action === 'buy' && (e.code === 'ECONNABORTED' || /timeout/i.test(message || ''))
        ? '兑换结果暂未确认，请等待数据刷新后核对库存和限购，勿重复提交'
        : message
    }
  }
  finally {
    if (token === generation)
      busy.value = false
  }
}
async function open(kind: string) {
  if (busy.value)
    return
  modal.value = kind
  error.value = ''
  records.value = null
  if (!['sales', 'rank', 'hireList'].includes(kind))
    return
  busy.value = true
  const token = generation
  try {
    const { data } = await api.post('/api/activity/milk-tea/records', { accountId: accounts.currentAccountId, kind }, { headers: { 'x-account-id': accounts.currentAccountId }, timeout: 100000 })
    if (!data.ok)
      throw new Error(data.error || '记录读取失败')
    if (token === generation && modal.value === kind)
      records.value = data
  }
  catch (e: any) {
    if (token === generation)
      error.value = e.response?.data?.error || e.message
  }
  finally {
    if (token === generation)
      busy.value = false
  }
}
function visible() {
  if (!document.hidden)
    void refresh()
}
watch(() => accounts.currentAccountId, () => {
  generation++
  state.value = null
  loading.value = false
  busy.value = false
  modal.value = ''
  void refresh()
})
onMounted(() => {
  sizeObserver = new ResizeObserver(scheduleFitGame)
  let ancestor: HTMLElement | null = host.value
  while (ancestor) {
    sizeObserver.observe(ancestor)
    ancestor = ancestor.parentElement
  }
  window.addEventListener('resize', scheduleFitGame)
  fitGame()
  void refresh()
  document.addEventListener('visibilitychange', visible)
  timer = setInterval(() => {
    now.value = Date.now()
    if (!isWithinActivityWindowMs(MILK_TEA_ACTIVITY_WINDOW)) {
      clearInterval(timer)
      emit('back')
      return
    }
    if (!document.hidden)
      void refresh()
  }, 15000)
})
onUnmounted(() => {
  generation++
  sizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleFitGame)
  if (fitFrame !== undefined)
    cancelAnimationFrame(fitFrame)
  clearInterval(timer)
  document.removeEventListener('visibilitychange', visible)
})
</script>

<template>
  <div ref="host" class="milk-host">
    <p v-if="!accounts.currentAccountId" class="milk-message">
      请先选择账号
    </p>
    <p v-else-if="!state && loading" class="milk-message">
      正在加载活动数据…
    </p>
    <p v-else-if="!state && !error" class="milk-message">
      暂无活动数据
    </p>
    <p v-if="error" class="milk-error" role="alert">
      {{ error }}
    </p>
    <div v-if="state" class="milk-game" :class="tab" :style="{ backgroundImage: `url(${img(tab === 'shop' ? 'img_s4_mainBg1' : 'img_s4Main_bg')})` }">
      <header class="milk-header">
        <button class="back image-button" @click="emit('back')">
          <img :src="img('img_s4Main_closeBtn')" alt="返回">
        </button>
        <img class="logo" :src="img('img_s4Main_logo')" alt="奶茶热销中">
        <div class="countdown">
          <span class="countdown-time"><svg viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M12 2h8M16 2v4M25 7l2-2" stroke="currentColor" stroke-width="3" stroke-linecap="round" /><circle cx="16" cy="21" r="13" stroke="currentColor" stroke-width="3" /><path d="M16 12v9l5 3" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ remaining }}</span><button aria-label="活动规则" @click="open('rules')">
            ?
          </button>
        </div>
        <div class="balances">
          <div v-if="tab === 'exchange'">
            <img :src="currencyIcon({ id: '1001' })" alt="金币">{{ money('1001') }}
          </div><div><img :src="img('img_s4TeaUI_rewardpng')" alt="奶茶券">{{ money('1041') }}</div><div v-if="tab === 'exchange'">
            <img :src="currencyIcon({ id: '1004' })" alt="钻石">{{ money('1004') }}
          </div>
        </div>
      </header>
      <main v-if="tab === 'shop' && state.shop" class="shop-scene">
        <div class="shop-sign">
          <div class="shop-level">
            <b>{{ state.shop.level }}</b><span>店铺等级</span>
          </div><div>
            <strong>{{ state.summary.shop_name || '奶茶小铺' }}</strong><button class="edit image-button" @click="open('rename')">
              <img :src="img('img_s4TeaUI_editBtn')" alt="修改店名">
            </button><p>营业额： <img class="revenue-ticket" :src="img('img_s4TeaUI_rewardpng')" alt="奶茶券"> {{ state.shop.total_revenue }}</p>
          </div><button class="upgrade image-button" @click="open('upgrade')">
            <img :src="img('img_s4TeaUI_myShop')" alt="店铺升级"><span>店铺升级</span>
          </button>
        </div>
        <div class="drink-shelf">
          <div v-for="recipe in shelfRecipes" :key="recipe.recipe_id" class="drink">
            <img :src="recipe.config?.image || img('img_s4TeaUI_tea')" :alt="recipe.recipe_name"><span>{{ recipe.stock_cups === '-1' ? '不限量' : recipe.stock_cups }}</span>
          </div><div v-for="i in Math.max(0, 6 - shelfRecipes.length)" :key="`locked-${i}`" class="drink locked">
            <span class="locked-cup"><img :src="img('img_s4_v2_lock')" alt="未解锁"></span>
          </div>
        </div>
        <div class="selling">
          {{ state.phase === 'settling' ? '结算期' : `正在热卖：每小时${state.shop.effective_cups_per_hour}杯` }}
        </div>
        <button class="cashier image-button" :disabled="busy || !state.shop.pending_rewards.some((x: any) => Number(x.count) > 0)" @click="act('cashier')">
          <div class="cashier-orb">
            <img :src="img('img_s4TeaUI_rewardpng')" alt="奶茶券"><b>{{ state.shop.pending_rewards.find((x: any) => String(x.id) === '1041')?.count || '0' }}</b>
          </div><span>领取收益</span>
        </button>
        <div class="employees">
          <div v-for="slot in state.shop.slots" :key="slot.slot_index" class="employee">
            <strong>{{ slot.employee.name }}</strong><span>{{ slot.talent_name }}</span><div class="hamster" :style="{ backgroundImage: `url(${img('hamster-idle')})` }" /><b>{{ duration(Number(slot.end_at) - now / 1000) }}后下班</b>
          </div><button v-if="!state.shop.slots.length" class="employ" @click="open('hireList')">
            雇佣员工
          </button><div v-if="Number(state.shop.level) < 3" class="employee locked-worker">
            <img :src="img('img_s4TeaUI_cangshu_empty')" alt=""><span><img :src="img('img_s4_v2_lock')" alt="未解锁"><br>店铺3级解锁</span>
          </div>
        </div>
        <aside class="shop-actions">
          <button class="image-button" @click="open('sales')">
            <img :src="img('img_s4TeaUI_recordBtn')" alt="营业记录"><span>营业记录</span>
          </button><button class="image-button" @click="open('rank')">
            <img :src="img('img_s4TeaUI_rankBtn')" alt="排行榜"><span>排行榜</span>
          </button><button class="image-button" @click="open('share')">
            <img :src="img('img_s4TeaUI_shareBtn')" alt="快乐不独享"><span>快乐不独享</span>
          </button><button class="image-button" @click="open('fund')">
            <img :src="img('img_s4TeaUI_rewardBtn')" alt="成长基金"><span>成长基金</span>
          </button>
        </aside>
        <button v-if="!Number(state.summary.shop_open_at)" class="make gold-button" :disabled="busy" @click="open('create')">
          开店营业
        </button>
        <button v-else class="make gold-button" :disabled="busy || state.phase !== 'business'" @click="open('craft')">
          <span class="make-cup" aria-hidden="true" />制作奶茶
        </button>
      </main>
      <main v-else-if="tab === 'shop'" class="shop-scene">
        <button class="make gold-button" :disabled="busy" @click="open('create')">
          开店营业
        </button>
      </main>
      <main v-else-if="tab === 'exchange'" class="paper exchange-paper" :style="{ backgroundImage: `url(${img('img_s4_commonBg')})` }">
        <div class="shop-filters">
          <button v-for="name in ['全部', '种子', '装扮']" :key="name" :class="{ selected: filter === name }" @click="filter = name">
            {{ name }}
          </button>
        </div>
        <div class="goods-grid">
          <button v-for="g in goods" :key="g.id" class="goods" :class="{ unavailable: !g.unlocked || !g.remaining }" :style="{ backgroundImage: `url(${img(Number(g.background_type) >= 2 ? 'img_s4Shop_itemBg3' : 'img_s4Shop_itemBg1')})` }" @click="open(`goods:${g.id}`)">
            <strong>{{ g.name }}</strong><img :src="g.items[0]?.image || g.items[0]?.imageUrl || img('img_exchange_item1')" :alt="g.name"><span v-if="!g.unlocked" class="goods-lock">🔒<br>店铺{{ g.cond_hints.find((x: any) => !x.satisfied)?.target }}级解锁</span><small>{{ ({ 1: '每日', 2: '每周', 4: '永久' } as any)[g.restriction_type] || '' }}限购{{ g.remaining }}/{{ g.purchase_limit }}</small><b v-if="!g.remaining">已售罄</b><b v-else class="goods-costs"><span v-for="cost in g.costs" :key="cost.id"><img v-if="currencyIcon(cost)" :src="currencyIcon(cost)" :alt="cost.name"><span v-else>{{ cost.name }}</span>{{ cost.count }}</span></b>
          </button>
        </div>
      </main>
      <main v-else class="paper work-paper" :style="{ backgroundImage: `url(${img('img_s4_commonBg')})` }">
        <div class="work-scene">
          <img :src="img('img_S4MyJob_bg_3')" alt=""><div class="work-sign" :style="{ backgroundImage: `url(${img('img_S4MyJob_bg_4')})` }">
            {{ state.work.my_shift ? '工作中' : '空闲中' }}
          </div>
        </div>
        <template v-if="state.work.my_shift">
          <h3>{{ state.work.my_shift.shop_name }}</h3><p>{{ state.work.my_shift.talent_name }} · {{ duration(Number(state.work.my_shift.end_at) - now / 1000) }}后下班</p><div class="interactions">
            <button v-for="interaction in state.interactions" :key="interaction.interaction_id" class="gold-button" :disabled="busy || state.work.interact_done || state.phase !== 'business'" @click="act('interact', { interactionType: interaction.interaction_id })">
              {{ interaction.name }}
            </button>
          </div>
        </template>
        <button v-else class="gold-button invite" @click="open('invite')">
          ➤ 邀请好友雇佣我
        </button>
        <h3 class="record-title">
          兼职记录
        </h3><div v-if="!state.work.slips.length" class="empty-work">
          <img :src="img('img_s4_null1')" alt=""><p>暂无工作记录</p>
        </div><div v-for="slip in state.work.slips" :key="slip.shift_id" class="work-record">
          <strong>{{ slip.shop_name }}</strong><p>{{ date(Number(slip.begin_at)) }} — {{ date(Number(slip.end_at)) }}</p>
        </div><button v-if="state.summary.has_unclaimed_wage" class="gold-button" :disabled="busy" @click="act('wages')">
          领取工资
        </button>
      </main>
      <nav class="milk-tabs" :style="{ backgroundImage: `url(${img('img_s4Main_bottomBg')})` }">
        <button v-for="(t, i) in (['shop', 'exchange', 'work'] as const)" :key="t" :class="{ active: tab === t }" @click="tab = t">
          <img :src="img(`img_s4Main_${tab === t ? 'tabSelect' : 'tab'}${[0, 2, 3][i]}`)" :alt="['我的店铺', '兑换商店', '我的工作'][i]">
        </button>
      </nav>
      <MilkTeaShopDialogs v-if="['upgrade', 'sales', 'rank', 'share', 'fund'].includes(modal)" :kind="modal" :state="state" :records="records" :busy="busy" :error="error" @close="modal = ''" @action="act" />
      <MilkTeaCraftDialog v-else-if="modal === 'craft'" :state="state" :busy="busy" :loading="loading" :error="error" @close="modal = ''" @craft="act('craft', $event)" />
      <div v-else-if="modal" class="modal-mask" @click.self="modal = ''">
        <section class="milk-modal">
          <button class="modal-close" @click="modal = ''">
            ×
          </button>
          <template v-if="modal === 'create' || modal === 'rename'">
            <h2>{{ modal === 'create' ? '开店营业' : '修改店名' }}</h2><input v-model="shopName" maxlength="8" aria-label="店名"><button class="gold-button" :disabled="busy" @click="act(modal, { shopName })">
              确认
            </button>
          </template>

          <template v-else-if="modal.startsWith('goods:')">
            <template v-for="g in state.goods.filter((x: any) => `goods:${x.id}` === modal)" :key="g.id">
              <h2>兑换</h2>
              <div class="purchase-product">
                <img v-if="g.items[0]?.image" :src="g.items[0].image" :alt="g.name">
                <div><strong>{{ g.name }}</strong><p>{{ g.desc }}</p></div>
              </div>
              <div class="purchase-controls">
                <button aria-label="减少兑换数量" :disabled="busy || purchaseCount <= 1 || !purchaseMax" @click="purchaseCount = Math.max(1, Number(purchaseCount) - 1)">
                  −
                </button>
                <input v-model.number="purchaseCount" type="number" min="1" :max="Math.max(1, purchaseMax)" step="1" aria-label="兑换数量" :disabled="busy || !purchaseMax" @change="clampPurchase">
                <button aria-label="增加兑换数量" :disabled="busy || purchaseCount >= purchaseMax || !purchaseMax" @click="purchaseCount = Math.min(purchaseMax, Number(purchaseCount) + 1)">
                  ＋
                </button>
                <button :disabled="busy || !purchaseMax" @click="purchaseCount = purchaseMax">
                  最大
                </button>
              </div>
              <input v-model.number="purchaseCount" class="purchase-range" type="range" min="1" :max="Math.max(1, purchaseMax)" step="1" aria-label="滑动选择兑换数量" :disabled="busy || purchaseMax <= 1">
              <p class="purchase-limit">
                {{ ({ 1: '每日', 2: '每周', 4: '永久' } as any)[g.restriction_type] || '' }}剩余限购 {{ g.remaining }} · 当前最多可兑换 {{ purchaseMax }}
              </p>
              <div class="purchase-costs">
                <span v-for="cost in g.costs" :key="cost.id"><img v-if="currencyIcon(cost)" :src="currencyIcon(cost)" :alt="cost.name"><span v-else>{{ cost.name }}</span>{{ totalCost(cost) }}</span>
              </div>
              <button class="gold-button" :disabled="busy || loading || !validPurchase || !g.unlocked || g.paid" @click="act('buy', { goodsId: g.id, count: purchaseCount })">
                {{ g.paid ? '不支持钻石购买' : `兑换 ×${validPurchase ? purchaseCount : 0}` }}
              </button>
            </template>
          </template>
          <template v-else-if="modal === 'hireList'">
            <h2>雇佣员工</h2><p v-if="!records">
              {{ busy ? '加载中…' : '暂无可雇佣员工' }}
            </p><button v-for="worker in [...(records?.friends || []), ...(records?.robots || [])]" :key="worker.friend.gid" class="recipe-row" :disabled="busy || Number(worker.state) !== 0" @click="act('hire', { targetGid: worker.friend.gid, durationId: 1, slotIndex: 0 })">
              {{ worker.friend.name }} · {{ worker.talent_name }} · 4小时 🎟{{ records.wage_total }}
            </button>
          </template>

          <template v-else-if="modal === 'rules'">
            <h2>活动说明</h2><p>营业期结束：{{ date(state.settleTime) }}</p><p>结算期结束：{{ date(state.endTime) }}</p><img :src="img('img_S4_rule1')" alt="活动规则" style="width:100%">
          </template>

          <template v-else>
            <h2>{{ ({ invite: '邀请好友雇佣我', share: '快乐不独享', fund: '成长基金' } as any)[modal] }}</h2><p>{{ modal === 'fund' ? '付费基金暂不支持在网页购买' : '此功能需要 QQ 原生分享' }}</p>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.milk-host {
  max-width: 620px;
  margin: auto;
  /* 画布内尺寸统一以 --milk-u（画布宽度的 1/100）为基准，不依赖容器查询单位，兼容不支持 cqw 的旧版 iOS Safari */
  --milk-u: calc(min(620px, 100vw) / 100);
}
/* 手机端：奶茶面板脱离页面内嵌布局，从顶部导航栏下沿开始铺满剩余视口，
   既让游戏画布贴近顶部（官方游戏就是全屏），又完整保留 App 顶部导航栏；
   顶栏高度由 fitGame 实测写入 --milk-top，避免硬编码在系统缩放/字号变化时错位。
   桌面端保持原有的内嵌卡片布局不变 */
@media (max-width: 768px) {
  .milk-host {
    position: fixed;
    top: var(--milk-top, 0px);
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    max-width: none;
    margin: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: #eecf91;
  }
}
.milk-message,
.milk-error {
  padding: 18px;
  text-align: center;
}
.milk-error {
  color: #b42318;
  background: #fff1e8;
}
.milk-game {
  position: relative;
  width: calc(var(--milk-u) * 100);
  height: calc(var(--milk-u) * 1600 / 9);
  margin-inline: auto;
  background-size: 100% 100%;
  overflow: hidden;
  color: #835535;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  /* 关掉 iOS 文本自动放大，避免窄画布上文字被放大后互相重叠 */
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
.milk-game.exchange,
.milk-game.work {
  background-size: 100% auto;
  background-repeat: no-repeat;
  background-color: #eecf91;
}
.milk-game button {
  cursor: pointer;
  font: inherit;
  color: inherit;
  border: 0;
  background-color: transparent;
}
.milk-game button:disabled {
  cursor: default;
  opacity: 0.5;
}
.image-button img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.image-button {
  padding: 0;
}
.milk-header {
  position: absolute;
  inset: 0 0 auto;
  height: 20%;
  z-index: 2;
}
.back {
  position: absolute;
  left: 3%;
  top: 2%;
  width: 9%;
}
.logo {
  position: absolute;
  top: 2%;
  left: 14%;
  width: 34%;
}
.countdown {
  position: absolute;
  top: 25%;
  left: 11%;
  display: flex;
  align-items: center;
  gap: calc(2 * var(--milk-u));
  color: #fff;
  font-weight: 800;
  font-size: calc(3.2 * var(--milk-u));
}
.countdown-time {
  display: flex;
  align-items: center;
  gap: calc(0.7 * var(--milk-u));
  padding: calc(0.55 * var(--milk-u)) calc(1.8 * var(--milk-u));
  border-radius: calc(10 * var(--milk-u));
  background: #62462ba6;
  line-height: 1.2;
  white-space: nowrap;
}
.countdown-time svg {
  width: calc(3 * var(--milk-u));
  height: calc(3.4 * var(--milk-u));
  flex-shrink: 0;
}
.countdown button {
  display: grid;
  place-items: center;
  padding: 0;
  background: #fff7dfed !important;
  border-radius: 50%;
  color: #99724e !important;
  width: calc(2.9 * var(--milk-u));
  height: calc(2.9 * var(--milk-u));
  box-shadow: 0 0 0 calc(0.33 * var(--milk-u)) #fff7df55;
  font-size: calc(2.5 * var(--milk-u));
  font-weight: 900;
  line-height: 1;
}
.balances {
  position: absolute;
  right: 4%;
  top: 2%;
  width: 20%;
  font-size: calc(3.2 * var(--milk-u));
  font-weight: 900;
}
.balances > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff9e8dd;
  border-radius: calc(3.33 * var(--milk-u));
  margin-bottom: 8%;
  padding: 0 5%;
}
.balances img {
  width: 34%;
}
/* Positions use the full 900 × 1600 game canvas, matching the official portrait view. */
.milk-game.shop {
  background-size: 128% auto;
  background-position: center center;
  background-repeat: no-repeat;
}
.shop-scene {
  position: absolute;
  inset: 0;
}
.shop-sign {
  position: absolute;
  top: 8%;
  left: 5%;
  width: 90%;
  height: 8.2%;
  box-sizing: border-box;
  padding: calc(1.4 * var(--milk-u)) calc(3 * var(--milk-u));
  display: grid;
  grid-template-columns: 19% 60% 21%;
  align-items: center;
  color: #fff8de;
  text-align: center;
  font-size: calc(2.8 * var(--milk-u));
  line-height: 1.2;
  z-index: 3;
}
/* 木板背景由独立图层承载：只改这里的 top 即可单独下移木牌，文字与按钮位置不受影响。
   图片源含吊杆与透明上边，按原来的 background-size/position 缩放后整体下移。 */
.shop-sign::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 35%;
  height: 100%;
  background: url('/activity/milk-tea/img_s4TeaUI_titleBg.png') center 72% / 100% 156% no-repeat;
  pointer-events: none;
  z-index: -1;
}
.shop-sign > div,
.shop-sign > button {
  min-width: 0;
}
.shop-sign strong {
  font-size: calc(3.7 * var(--milk-u));
  line-height: 1.3;
}
.shop-sign p {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(0.7 * var(--milk-u));
  margin: calc(0.5 * var(--milk-u)) 0 0;
  font-weight: 800;
}
.revenue-ticket {
  width: calc(4.5 * var(--milk-u));
  height: calc(3.2 * var(--milk-u));
  object-fit: contain;
}
.shop-level {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  line-height: 1.1;
}
.shop-level b {
  width: calc(10 * var(--milk-u));
  height: calc(6.5 * var(--milk-u));
  line-height: calc(6.5 * var(--milk-u));
  font-size: calc(4 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4TeaUI_hotBg.png') center / contain no-repeat;
}
.edit {
  width: calc(5 * var(--milk-u));
  height: calc(5 * var(--milk-u));
  vertical-align: middle;
  margin-left: calc(1 * var(--milk-u));
}
.upgrade {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-weight: 800 !important;
  line-height: 1.1;
}
.upgrade img {
  width: calc(7 * var(--milk-u));
  height: calc(7 * var(--milk-u));
}
.drink-shelf {
  position: absolute;
  top: 24.5%;
  left: 9%;
  right: 9%;
  height: 8.2%;
  display: flex;
  gap: calc(0.8 * var(--milk-u));
  overflow: hidden;
}
.drink {
  position: relative;
  flex: 0 0 17.2%;
  min-width: 0;
  box-sizing: border-box;
  background: linear-gradient(150deg, #fff0c9 75%, #ba9473 75%);
  border: calc(0.45 * var(--milk-u)) solid #d2a157;
  border-radius: 0 0 calc(1.5 * var(--milk-u)) calc(1.5 * var(--milk-u));
}
.drink > img {
  width: 100%;
  height: 86%;
  object-fit: contain;
}
.drink > span {
  position: absolute;
  bottom: 0;
  right: 5%;
  font-size: calc(2.8 * var(--milk-u));
  line-height: 1.1;
  color: #fff0d5;
  font-weight: 900;
  text-shadow: calc(0.15 * var(--milk-u)) calc(0.15 * var(--milk-u)) #916d50;
}
.drink.locked {
  display: grid;
  place-items: start center;
  background: #fff0c9;
}
.drink .locked-cup {
  position: relative;
  right: auto;
  bottom: auto;
  width: 65%;
  height: 70%;
  display: grid;
  place-items: center;
  background: #998261;
  clip-path: polygon(0 0, 100% 0, 82% 100%, 18% 100%);
}
.locked-cup img {
  width: 30%;
  height: 35%;
  object-fit: contain;
}
.selling {
  position: absolute;
  top: 33.2%;
  left: 20%;
  right: 20%;
  font-size: calc(2.9 * var(--milk-u));
  line-height: 1.3;
  text-align: center;
  font-weight: 900;
  color: #fff4d9;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #976744;
}
.cashier {
  position: absolute;
  top: 41.1%;
  left: 6%;
  width: 16%;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: calc(3 * var(--milk-u));
}
.cashier-orb {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: url('/activity/milk-tea/img_s4TeaUI_bubble.png') center / 130% 130% no-repeat;
}
.cashier-orb > img {
  position: absolute;
  left: 15%;
  top: 15%;
  width: 70%;
  height: 60%;
  object-fit: contain;
}
.cashier-orb > b {
  position: absolute;
  right: 15%;
  bottom: 12%;
  max-width: 80%;
  font-size: calc(2.8 * var(--milk-u));
  color: #fff4d9;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #915932;
  line-height: 1;
}
.cashier > span {
  width: 100%;
  margin-top: calc(-0.5 * var(--milk-u));
  text-align: center;
  white-space: nowrap;
  background: url('/activity/milk-tea/img_s4TeaUI_bubbleBg.png') center / 100% 100% no-repeat;
  font-weight: 800;
  line-height: 1.6;
}
.employees {
  position: absolute;
  top: 38.7%;
  left: 25%;
  right: 17%;
  height: 23.8%;
  display: flex;
  align-items: end;
  gap: 5%;
}
.employee {
  position: relative;
  width: 50%;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  font-size: calc(3 * var(--milk-u));
  color: #fff8e4;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #694429;
}
.employee > strong {
  flex-shrink: 0;
  font-size: calc(3.4 * var(--milk-u));
  line-height: 1.4;
}
.employee > span {
  flex-shrink: 0;
  background: #a07853;
  padding: 0 calc(1.2 * var(--milk-u));
  border: calc(0.2 * var(--milk-u)) solid #d4b38f;
  border-radius: calc(2 * var(--milk-u));
  font-size: calc(2.5 * var(--milk-u));
  line-height: 1.4;
}
.employee > b {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: #4b4741;
  border: calc(0.7 * var(--milk-u)) solid #d6a264;
  border-radius: calc(1.5 * var(--milk-u));
  padding: calc(0.3 * var(--milk-u)) calc(1 * var(--milk-u));
  white-space: nowrap;
  line-height: 1.3;
}
.hamster {
  width: 100%;
  min-height: 0;
  flex: 1;
  margin-bottom: calc(4 * var(--milk-u));
  background-size: contain;
  background-position: center bottom;
  transform: scaleX(-1);
  background-repeat: no-repeat;
}
.locked-worker {
  overflow: hidden;
}
.locked-worker > img {
  position: absolute;
  bottom: calc(3 * var(--milk-u));
  width: 100%;
  height: 76%;
  object-fit: contain;
  object-position: center bottom;
}
.locked-worker > span {
  position: absolute;
  bottom: 24%;
  padding: 0;
  width: 100%;
  text-align: center;
  background: none;
  border: 0;
  color: #f4ba6a;
  font-weight: 800;
  font-size: calc(2.8 * var(--milk-u));
  white-space: nowrap;
}
.locked-worker span img {
  display: inline-block;
  width: calc(5.5 * var(--milk-u));
  height: calc(7 * var(--milk-u));
  margin-bottom: calc(2 * var(--milk-u));
}
.shop-actions {
  position: absolute;
  top: 28.4%;
  right: 1%;
  width: 15%;
  display: flex;
  flex-direction: column;
  gap: calc(2.2 * var(--milk-u));
  z-index: 4;
}
.shop-actions button {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: calc(2.9 * var(--milk-u));
  font-weight: 800;
  line-height: 1.1;
  color: #fff;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #684833;
  white-space: nowrap;
}
.shop-actions img {
  height: calc(11 * var(--milk-u));
}
.gold-button {
  background: #ffd062 !important;
  border: calc(0.44 * var(--milk-u)) solid #7b4b32 !important;
  border-radius: calc(2.44 * var(--milk-u));
  padding: calc(0.89 * var(--milk-u)) calc(2 * var(--milk-u)) !important;
  font-weight: 900 !important;
  box-shadow: inset 0 0 0 calc(0.33 * var(--milk-u)) #ffe5a0;
  color: #7a4b29 !important;
}
.make.gold-button {
  position: absolute;
  top: 69.7%;
  left: 33%;
  width: 41%;
  height: 8.2%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(1 * var(--milk-u));
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0;
  box-shadow: none;
  font-size: calc(5 * var(--milk-u)) !important;
  background: url('/activity/milk-tea/img_s4_btn0.png') center / 100% 100% no-repeat !important;
}
.make-cup {
  width: calc(5 * var(--milk-u));
  height: calc(6 * var(--milk-u));
  background: #80502d;
  clip-path: polygon(10% 15%, 68% 15%, 85% 0, 95% 4%, 80% 22%, 90% 28%, 73% 100%, 25% 100%);
}
.employ {
  align-self: center;
  background: #ffdc84 !important;
  border-radius: calc(1.5 * var(--milk-u));
  padding: calc(1.5 * var(--milk-u)) !important;
}
.paper {
  position: absolute;
  top: 21%;
  left: 0;
  right: 0;
  bottom: 9%;
  background-size: 100% 100%;
  padding: 8% 10% 6%;
  overflow: auto;
}
.exchange-paper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.exchange-paper .shop-filters {
  flex-shrink: 0;
}
.exchange-paper .goods-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  overscroll-behavior-y: contain;
}
.shop-filters {
  display: flex;
  border: calc(0.33 * var(--milk-u)) solid #dca74b;
  border-radius: calc(4.44 * var(--milk-u));
  background: #ffdc85;
  margin: 0 0 4%;
  padding: 1%;
}
.shop-filters button {
  flex: 1;
  font-size: calc(3.5 * var(--milk-u));
  font-weight: 900;
  border-radius: calc(3.33 * var(--milk-u));
  padding: 2% 0;
}
.shop-filters .selected {
  background: #9c6b44;
  color: #fff;
}
.goods-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(3 * var(--milk-u)) calc(2 * var(--milk-u));
}
.goods {
  position: relative;
  aspect-ratio: 240/320;
  /* 旧版 iOS Safari 不会把 aspect-ratio 计入 grid 隐式行高，行高会塌缩成内容高度的一半，
     导致第二行商品盖住第一行；这里补一个等价的 min-height 兜底：
     卡宽 = (画布 80% - 2 个 2u 间距) / 3 = 228 设计px，高 = 228 × 320 / 240 = 304 设计px ≈ 33.8u */
  min-height: calc(33.8 * var(--milk-u));
  background-size: 100% 100%;
  padding: 6% 5% 8% !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}
.goods strong {
  font-size: calc(2.8 * var(--milk-u));
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.goods > img {
  width: 85%;
  height: 52%;
  object-fit: contain;
}
.goods small {
  font-size: calc(2.3 * var(--milk-u));
  font-weight: 700;
}
.goods > b {
  font-size: calc(2.6 * var(--milk-u));
  color: #f35e46;
  overflow-wrap: anywhere;
}
.goods-costs,
.goods-costs > span {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(0.6 * var(--milk-u));
}
.goods-costs {
  flex-wrap: wrap;
}
.goods-costs img {
  width: calc(4.5 * var(--milk-u));
  height: calc(4.5 * var(--milk-u));
  object-fit: contain;
}
.goods.unavailable {
  filter: saturate(0.45);
  opacity: 0.65;
}
.goods-lock {
  position: absolute;
  top: 35%;
  text-align: center;
  font-size: calc(2.8 * var(--milk-u));
  font-weight: 900;
}
.work-paper {
  text-align: center;
}
.work-scene {
  position: relative;
  height: 38%;
  margin-top: 3%;
}
.work-scene > img {
  width: 90%;
  height: 100%;
  object-fit: contain;
}
.work-sign {
  position: absolute;
  right: -3%;
  top: 0;
  width: 40%;
  height: 23%;
  background-size: 100% 100%;
  font-weight: 900;
  font-size: calc(3 * var(--milk-u));
  padding-top: 5%;
  transform: rotate(10deg);
  color: #ead3a9;
}
.invite {
  font-size: calc(3.5 * var(--milk-u)) !important;
}
.record-title {
  display: flex;
  align-items: center;
  gap: calc(1.33 * var(--milk-u));
  font-size: calc(3.5 * var(--milk-u));
}
.record-title:before,
.record-title:after {
  content: '';
  flex: 1;
  border-top: calc(0.33 * var(--milk-u)) dashed #936647;
}
.empty-work {
  margin-top: 15%;
  font-size: calc(3.3 * var(--milk-u));
  font-weight: 900;
  color: #9b9170;
}
.empty-work img {
  width: 24%;
}
.work-record {
  border-bottom: calc(0.11 * var(--milk-u)) dashed #a97d53;
  font-size: calc(2.7 * var(--milk-u));
  padding: calc(1.11 * var(--milk-u));
}
.interactions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(0.89 * var(--milk-u));
}
.milk-tabs {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 10%;
  background-size: 100% 100%;
  display: flex;
  justify-content: space-around;
  z-index: 4;
}
.milk-tabs > button {
  position: relative;
  width: 23%;
  height: 100%;
  padding: 0;
}
.milk-tabs img {
  position: relative;
  height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.milk-tabs .tab-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.modal-mask {
  position: absolute;
  inset: 0;
  background: #39261899;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5%;
}
.milk-modal {
  position: relative;
  max-height: 86%;
  width: 100%;
  overflow: auto;
  background: #fff3d1;
  border: calc(0.67 * var(--milk-u)) solid #a77446;
  border-radius: calc(2.22 * var(--milk-u));
  padding: 6%;
  text-align: center;
  font-size: calc(3 * var(--milk-u));
}
.milk-modal h2 {
  font-size: calc(4 * var(--milk-u));
}
.modal-close {
  position: absolute;
  right: 3%;
  top: 0;
  font-size: calc(6 * var(--milk-u)) !important;
}
.milk-modal input {
  width: 100%;
  padding: calc(1.33 * var(--milk-u));
  margin-bottom: calc(2.22 * var(--milk-u));
  background: #fff9e8;
  border: calc(0.22 * var(--milk-u)) solid #c6a06b;
  border-radius: calc(1.11 * var(--milk-u));
}
.purchase-product {
  display: flex;
  align-items: center;
  gap: calc(3 * var(--milk-u));
  text-align: left;
}
.purchase-product > img {
  width: calc(16 * var(--milk-u));
  height: calc(16 * var(--milk-u));
  object-fit: contain;
}
.purchase-product > div {
  flex: 1;
  min-width: 0;
}
.purchase-product strong {
  font-size: calc(4 * var(--milk-u));
}
.purchase-product p {
  font-size: calc(2.8 * var(--milk-u));
  line-height: 1.5;
}
.purchase-controls {
  display: flex;
  align-items: center;
  gap: calc(2 * var(--milk-u));
  margin-top: calc(3 * var(--milk-u));
}
.purchase-controls button {
  min-width: calc(8 * var(--milk-u));
  min-height: calc(8 * var(--milk-u));
  border-radius: calc(1 * var(--milk-u));
  background: #eac58b;
  font-weight: 800;
}
.purchase-controls input {
  min-width: 0;
  flex: 1;
  width: 0;
  text-align: center;
  font-size: calc(4 * var(--milk-u));
  margin: 0;
  padding: calc(1 * var(--milk-u));
}
.milk-modal .purchase-range {
  padding: 0;
  border: 0;
  width: 100%;
  margin: calc(3 * var(--milk-u)) 0 0;
  accent-color: #9bc536;
}
.purchase-limit {
  font-size: calc(2.6 * var(--milk-u));
  line-height: 1.5;
}
.purchase-costs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(2 * var(--milk-u));
  margin: calc(2 * var(--milk-u)) 0 calc(3 * var(--milk-u));
  font-size: calc(3 * var(--milk-u));
  font-weight: 800;
}
.purchase-costs span {
  display: flex;
  align-items: center;
  gap: calc(1 * var(--milk-u));
}
.purchase-costs img {
  width: calc(4 * var(--milk-u));
  height: calc(4 * var(--milk-u));
  object-fit: contain;
}
</style>
