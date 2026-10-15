<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MilkTeaRewardIcon from './MilkTeaRewardIcon.vue'

const props = defineProps<{ kind: string, state: any, records: any, busy: boolean, error: string }>()
const emit = defineEmits<{ close: [], action: [action: string] }>()
const preview = ref(false)
const notice = ref('')
watch(() => props.kind, () => {
  preview.value = false
  notice.value = ''
})
const img = (name: string) => `/activity/milk-tea/${name}.png`
const current = computed(() => props.state.levels?.find((level: any) => level.level === Number(props.state.shop?.level)))
const next = computed(() => props.state.levels?.find((level: any) => level.level === Number(props.state.shop?.level) + 1))
const progress = computed(() => Math.min(100, Number(props.state.shop?.total_revenue || 0) / Math.max(1, Number(props.state.shop?.next_level_revenue || 1)) * 100))
const titles: Record<string, string> = { upgrade: '店铺升级', sales: '营业记录', rank: '排行榜' }
const title = computed(() => preview.value ? '等级预览' : titles[props.kind])
const score = computed(() => Number(props.state.share?.current_score || 0))
const milestones = computed(() => props.state.share?.milestones || [])
const shareProgress = computed(() => Math.min(100, score.value / Math.max(1, ...milestones.value.map((tier: any) => Number(tier.threshold))) * 100))
const remaining = computed(() => {
  const seconds = Math.max(0, Number(props.state.endTime) - Number(props.state.serverTime))
  return `${Math.floor(seconds / 86400)}天${Math.floor(seconds % 86400 / 3600)}时`
})
function short(value: string | number) {
  const n = Number(value)
  return n >= 10000 ? `${Number((n / 10000).toFixed(1))}万` : String(value ?? 0)
}
function time(sec: string | number, dateOnly = false) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(dateOnly ? { year: 'numeric', month: '2-digit', day: '2-digit' } as const : { hour: '2-digit', minute: '2-digit', hour12: false } as const) }).format(new Date(Number(sec) * 1000))
}
function effects(level: any, previous?: any) {
  if (!level)
    return []
  const list = [{ name: '热卖值', icon: 'img_s4TeaUpLv_itemBg0', text: `${level.base_popularity}杯/小时` }]
  if (!previous || level.employee_slot_count !== previous.employee_slot_count)
    list.push({ name: '招员工', icon: 'img_s4TeaUpLv_itemBg1', text: `员工雇佣位${level.employee_slot_count}个` })
  const recipes = (level.recipe_names || []).filter((name: string) => !(previous?.recipe_names || []).includes(name))
  if (recipes.length)
    list.push({ name: '新配方', icon: 'img_s4TeaUpLv_itemBg2', text: `解锁${recipes.join('、')}` })
  if (level.shop_item_string)
    list.push({ name: '商品解锁', icon: 'img_s4TeaUpLv_itemBg3', text: `解锁${level.shop_item_string}` })
  if (previous && level.advanced_price_percent !== previous.advanced_price_percent)
    list.push({ name: '售价提升', icon: 'img_s4TeaUpLv_itemBg4', text: `特殊奶茶售价+${level.advanced_price_percent / 100}%` })
  return list
}
const salesDate = computed(() => {
  const day = String(props.records?.day || '')
  if (/^\d{8}$/.test(day))
    return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`
  return props.records?.day ? time(props.records.day, true) : ''
})
const avatar = (value: string) => /^https?:\/\//.test(value || '') ? value : ''
function nativeOnly() {
  notice.value = '请在 QQ 游戏内使用此功能'
}
</script>

<template>
  <div class="dialog-shade" @click.self="emit('close')">
    <section class="shop-dialog" :class="[{ notebook: !preview && ['upgrade', 'sales'].includes(kind), orange: preview || kind === 'rank' }, kind]" role="dialog" aria-modal="true" :aria-label="title || (kind === 'share' ? '快乐不独享' : '成长基金')">
      <button class="dialog-close" :class="{ round: preview || kind === 'rank' || kind === 'share' }" aria-label="关闭" @click="preview ? preview = false : emit('close')">
        <img :src="img(kind === 'share' ? 'btn_s4HappyShare_close' : preview || kind === 'rank' ? 'img_s4Open_close' : 'img_s4_closeBtn')" alt="">
      </button>
      <h2 v-if="title" class="dialog-title">
        {{ title }}
      </h2>
      <p v-if="error" class="dialog-error" role="alert">
        {{ error }}
      </p>
      <template v-if="kind === 'upgrade' && !preview">
        <button class="level-preview" @click="preview = true">
          <img :src="img('img_s4TeaUpLv_btnPre')" alt="等级预览">
        </button>
        <div class="upgrade-house">
          <img :src="img('img_s4TeaUpLv_house')" alt=""><strong>{{ state.shop.level }}级 <img :src="img('img_s4TeaUpLv_arrow')" alt="到"> {{ next ? `${next.level}级` : '满级' }}</strong>
        </div>
        <div class="revenue-progress">
          <div><b>营业额:</b><b>{{ short(state.shop.total_revenue) }}/{{ short(state.shop.next_level_revenue) }}</b></div><div class="progress-track">
            <i :style="{ width: `${progress}%` }" />
          </div>
        </div>
        <div class="upgrade-effects">
          <h3 class="section-line">
            升级效果
          </h3><div v-for="effect in effects(next, current)" :key="effect.name" class="effect-row">
            <b class="effect-label" :style="{ backgroundImage: `url(${img(effect.icon)})` }">{{ effect.name }}</b><span v-if="effect.name === '热卖值'">{{ current?.base_popularity }}杯/小时 <em>➜ {{ effect.text }}</em></span><span v-else>{{ effect.text }}</span>
          </div><p v-if="!next">
            店铺已满级
          </p>
        </div>
        <div class="upgrade-rewards">
          <h3 class="section-line">
            升级奖励
          </h3><div class="rewards upgrade-reward-list scroll-area">
            <MilkTeaRewardIcon v-for="item in next?.rewards || []" :key="item.id" :item="item" named />
          </div>
        </div>
        <button class="paint-button upgrade-submit" :disabled="busy || !state.summary.can_upgrade" @click="emit('action', 'upgrade')">
          立即升级
        </button>
      </template>
      <div v-else-if="preview" class="preview-scroll scroll-area">
        <article v-for="(level, index) in state.levels" :key="level.level" class="level-card" :class="{ current: level.level === Number(state.shop.level) }">
          <h3><small v-if="level.level === Number(state.shop.level) + 1">下一级</small>{{ level.level }}级</h3><b class="revenue-required">营业额需：{{ level.revenue_required }}</b>
          <div class="level-effects">
            <div v-for="effect in effects(level, state.levels[Number(index) - 1])" :key="effect.name">
              <b class="effect-label" :style="{ backgroundImage: `url(${img(effect.icon)})` }">{{ effect.name }}</b><p>{{ effect.text }}</p>
            </div>
          </div>
          <h4 class="section-line">
            等级奖励
          </h4><div class="rewards">
            <MilkTeaRewardIcon v-for="item in level.rewards" :key="item.id" :item="item" />
          </div>
        </article>
      </div>
      <div v-else-if="kind === 'sales'" class="sales-scroll scroll-area">
        <p v-if="!records" class="empty">
          {{ busy ? '加载中…' : error ? '营业记录读取失败' : '暂无营业记录' }}
        </p>
        <template v-else>
          <h3 class="sales-date">
            {{ salesDate }}
          </h3><div class="sales-drinks">
            <div v-for="drink in records.drinks || []" :key="drink.recipe_id">
              <img :src="drink.image" :alt="drink.name"><span><b>{{ drink.name }}</b><em>{{ drink.cups }}杯</em></span>
            </div>
          </div>
          <section class="sales-income">
            <h3>营业收益</h3><div class="rewards">
              <MilkTeaRewardIcon v-for="item in records.rewards || []" :key="item.id" :item="{ ...item, count: short(item.count) }" />
            </div><p v-if="!records.rewards?.length">
              暂无收益
            </p>
          </section>
          <h3 class="section-line">
            雇员记录
          </h3><p v-if="!records.hires?.length" class="empty">
            暂无雇员记录
          </p>
          <article v-for="hire in records.hires || []" :key="hire.shift_id" class="hire-record">
            <time>{{ time(hire.hire_at) }}</time><header><img v-if="avatar(hire.friend?.avatar)" :src="avatar(hire.friend.avatar)" alt=""><span v-else class="avatar-fallback">{{ hire.friend?.name?.slice(0, 1) }}</span><small>{{ hire.talent_name }}</small><b>{{ hire.friend?.name }}</b></header><dl><div><dt>工作时长</dt><dd>{{ Number(hire.duration_sec) / 3600 }}小时</dd></div><div><dt>支付工资</dt><dd><img :src="img('img_s4TeaUI_rewardpng')" alt="奶茶券"> +{{ hire.wages?.final_wage || 0 }}</dd></div><div><dt>互动收益</dt><dd>{{ hire.interact ? hire.interact.success ? '互动成功' : '互动未成功' : '无互动' }}</dd></div></dl>
          </article>
        </template>
      </div>
      <div v-else-if="kind === 'rank'" class="rank-paper">
        <header><span>排名</span><span>玩家</span></header><div class="rank-scroll scroll-area">
          <p v-if="!records?.ranks?.length" class="empty">
            {{ busy ? '加载中…' : error ? '排行榜读取失败' : '暂无排行' }}
          </p><article v-for="rank in records?.ranks || []" :key="rank.owner.gid" class="rank-row">
            <b class="rank-number" :class="`place-${rank.rank}`">{{ rank.rank }}</b><div class="rank-avatar">
              <img v-if="avatar(rank.owner.avatar)" :src="avatar(rank.owner.avatar)" alt=""><span v-else>{{ rank.owner.name?.slice(0, 1) }}</span><b>{{ rank.owner.level }}</b>
            </div><div class="rank-player">
              <strong>{{ rank.owner.name }}</strong><p>▰ {{ rank.shop_name }}</p><p>营业额：<em>{{ rank.total_revenue }}</em></p>
            </div><button v-if="rank.can_show_off" class="native-button" @click="nativeOnly">
              炫耀
            </button>
          </article>
        </div>
      </div>
      <template v-else-if="kind === 'share' && state.share">
        <img class="share-title" :src="img('img_s4HappyShare_title')" alt="快乐不独享"><img class="share-subtitle" :src="img('img_happyShare_subTitle_bg')" alt="点好友快乐包链接，攒快乐值领人气装饰"><p class="share-time">
          ◷ 剩余：{{ remaining }}
        </p><button class="share-log" @click="nativeOnly">
          <img :src="img('btn_s4HappyShare_log')" alt="领取日志">
        </button><img class="popular-decoration" :src="img('img_happyShare_good_bg')" alt="人气装饰">
        <div class="share-score">
          我的快乐值：<strong>☀ {{ score }}</strong>
        </div><div class="share-milestones">
          <div v-for="tier in milestones" :key="tier.tier_id" class="milestone">
            <div class="milestone-rewards">
              <MilkTeaRewardIcon v-for="item in tier.rewards" :key="item.id" :item="item" />
            </div><img v-if="Number(tier.state) !== 2" class="tier-state" :src="img(Number(tier.state) === 3 ? 'icon_s4_upLvReward_got' : 'icon_s4_upLvReward_lock')" :alt="Number(tier.state) === 3 ? '已领取' : '未达成'"><b>{{ tier.threshold }}</b>
          </div><div class="share-progress">
            <i :style="{ width: `${shareProgress}%` }" />
          </div>
        </div>
        <p class="share-pool">
          快乐包已被领{{ state.share?.my_pool?.claimed_count || 0 }}/{{ state.share?.my_pool?.claim_limit ?? '—' }}
        </p><div class="share-buttons">
          <button @click="nativeOnly">
            分享快乐
          </button><button :disabled="busy || state.share?.daily?.daily_reward_claimed" @click="emit('action', 'shareDaily')">
            {{ state.share?.daily?.daily_reward_claimed ? '今日已领取' : '每日领取' }}
          </button>
        </div><button v-if="milestones.some((tier: any) => Number(tier.state) === 2)" class="milestone-claim" :disabled="busy" @click="emit('action', 'shareRewards')">
          领取快乐值奖励
        </button>
      </template>
      <template v-else-if="kind === 'fund' && state.fund">
        <img class="fund-banner" :src="img('img_S4_upLvReward_banner')" alt="解锁基金且店铺等级达标后可领取奖励"><div class="fund-tiers scroll-area">
          <article v-for="tier in state.fund?.tiers || []" :key="tier.tier_id" :class="{ reached: Number(state.shop?.level) >= Number(tier.conditions?.[0]?.target_value || tier.tier_id) }">
            <b class="fund-level">{{ tier.conditions?.[0]?.target_value || tier.tier_id }}<small>等级</small></b><div class="fund-reward-row">
              <div class="rewards" :style="{ '--reward-columns': Math.min(4, tier.reward.length) }">
                <MilkTeaRewardIcon v-for="item in tier.reward" :key="item.id" :item="item" />
              </div><img v-if="!state.fund?.unlocked || Number(tier.state) !== 2" :src="img(Number(tier.state) === 3 ? 'icon_s4_upLvReward_got' : 'icon_s4_upLvReward_lock')" :alt="Number(tier.state) === 3 ? '已领取' : '未解锁'"><button v-else class="native-button" :disabled="busy" @click="emit('action', 'fundRewards')">
                领取
              </button>
            </div>
          </article>
        </div>
        <button v-if="state.fund?.unlocked" class="paint-button fund-submit" :disabled="busy || !state.fund?.tiers?.some((tier: any) => Number(tier.state) === 2)" @click="emit('action', 'fundRewards')">
          {{ state.fund?.tiers?.some((tier: any) => Number(tier.state) === 2) ? '领取奖励' : '暂无可领取奖励' }}
        </button><button v-else class="paint-button fund-submit" disabled title="不支持钻石购买">
          未购买 · 💎 {{ state.fund?.unlock_cost?.find((item: any) => String(item.id) === '1004')?.count ?? '—' }}
        </button>
      </template>
      <p v-else class="empty">
        暂无活动数据
      </p>
      <p v-if="notice" class="native-notice" role="status">
        {{ notice }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.dialog-shade {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: #1b130dba;
}
.shop-dialog {
  position: absolute;
  left: 6.5%;
  top: 12.5%;
  width: 87%;
  height: 81%;
  color: #595345;
  font-weight: 700;
  font-size: calc(3 * var(--milk-u));
  line-height: 1.3;
}
.notebook {
  background: url('/activity/milk-tea/img_s4_popBg1.png') center / 100% 100% no-repeat;
}
.dialog-close {
  position: absolute;
  right: 3%;
  top: 0;
  width: 13%;
  height: 12%;
  padding: 0;
  z-index: 5;
}
.dialog-close img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.dialog-close.round {
  top: -2%;
  right: -1.5%;
  height: 9%;
}
.dialog-title {
  position: absolute;
  top: 8.5%;
  left: 15%;
  width: 64%;
  margin: 0;
  text-align: center;
  font-size: calc(5.6 * var(--milk-u));
  line-height: 1.2;
  background: url('/activity/milk-tea/img_s4_titleBg.png') center / 100% 100% no-repeat;
}
.dialog-error {
  position: absolute;
  top: 14%;
  left: 7%;
  right: 7%;
  z-index: 6;
  margin: 0;
  background: #fff0e4;
  color: #a33f27;
  font-size: calc(2.5 * var(--milk-u));
}
.scroll-area {
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #b9865c transparent;
  min-height: 0;
}
.section-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(2 * var(--milk-u));
  margin: calc(2 * var(--milk-u)) 0;
  font-size: calc(3.4 * var(--milk-u));
  line-height: 1.2;
}
.section-line::before,
.section-line::after {
  content: '';
  flex: 1;
  border-top: calc(0.4 * var(--milk-u)) dashed #8d846c;
}
.level-preview {
  position: absolute;
  right: 4%;
  top: 14%;
  width: 14%;
  height: 9%;
  padding: 0;
}
.level-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.upgrade-house {
  position: absolute;
  top: 14%;
  left: 32%;
  width: 36%;
  height: 17%;
  text-align: center;
}
.upgrade-house > img {
  width: 100%;
  height: 90%;
  object-fit: contain;
}
.upgrade-house strong {
  position: absolute;
  bottom: calc(-1 * var(--milk-u));
  left: -5%;
  width: 110%;
  font-size: calc(5.2 * var(--milk-u));
  line-height: 1.1;
  color: #815a46;
  text-shadow: calc(0.3 * var(--milk-u)) 0 #f5e4c8;
  white-space: nowrap;
}
.upgrade-house strong img {
  display: inline-block;
  vertical-align: middle;
  width: calc(5 * var(--milk-u));
  height: calc(4 * var(--milk-u));
  object-fit: contain;
}
.revenue-progress {
  position: absolute;
  top: 33%;
  left: 8%;
  right: 8%;
}
.revenue-progress > div:first-child {
  display: flex;
  justify-content: space-between;
  font-size: calc(4 * var(--milk-u));
}
.progress-track {
  height: calc(2 * var(--milk-u));
  margin-top: calc(2 * var(--milk-u));
  border-radius: calc(2 * var(--milk-u));
  background: #92735e;
  overflow: hidden;
}
.progress-track i {
  display: block;
  min-width: 0;
  height: 100%;
  border-radius: inherit;
  background: #ffcf58;
}
.upgrade-effects {
  position: absolute;
  top: 42%;
  left: 8%;
  right: 8%;
  bottom: 35%;
  overflow-y: auto;
}
.effect-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(2 * var(--milk-u));
  margin: calc(2 * var(--milk-u)) 0;
  font-size: calc(3 * var(--milk-u));
}
.effect-label {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-height: calc(6 * var(--milk-u));
  width: calc(24 * var(--milk-u));
  padding-left: calc(5 * var(--milk-u));
  box-sizing: border-box;
  color: #fff7df;
  font-size: calc(3 * var(--milk-u));
  background-size: 100% 100%;
  background-repeat: no-repeat;
  line-height: 1.1;
}
em {
  color: #db7436;
  font-style: normal;
}
.upgrade-rewards {
  position: absolute;
  top: 65%;
  left: 8%;
  right: 8%;
  bottom: 18%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.upgrade-rewards .section-line {
  flex-shrink: 0;
  margin: calc(1 * var(--milk-u)) 0;
}
.upgrade-reward-list {
  flex: 1;
  flex-wrap: wrap;
  align-content: start;
  padding: 0 calc(0.5 * var(--milk-u)) calc(0.5 * var(--milk-u));
}
.upgrade-rewards .upgrade-reward-list > * {
  width: calc(12 * var(--milk-u));
}
.upgrade-reward-list :deep(.reward-name) {
  display: -webkit-box;
  height: calc(6.24 * var(--milk-u));
  margin-bottom: calc(0.5 * var(--milk-u));
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: calc(2.4 * var(--milk-u));
}
.upgrade-reward-list :deep(.reward-frame) {
  box-sizing: border-box;
}
.rewards {
  display: flex;
  justify-content: center;
  align-items: start;
  gap: calc(2 * var(--milk-u));
}
.rewards > * {
  width: calc(10 * var(--milk-u));
  flex-shrink: 0;
}
.paint-button {
  padding: 0;
  border: 0;
  background: url('/activity/milk-tea/img_s4_btn0.png') center / 100% 100% no-repeat;
  font-weight: 900;
  font-size: calc(5.5 * var(--milk-u));
  color: #776448;
}
.paint-button:disabled {
  background-image: url('/activity/milk-tea/img_s4_btn3.png');
  opacity: 1;
  color: #777063;
}
.upgrade-submit {
  position: absolute;
  top: 84%;
  left: 23%;
  width: 54%;
  height: 10%;
}
.orange {
  top: 15%;
  height: 76%;
  width: 83%;
  left: 8.5%;
  border: calc(0.4 * var(--milk-u)) solid #e5ae83;
  border-bottom: calc(1 * var(--milk-u)) solid #a5552c;
  border-radius: calc(5 * var(--milk-u));
  background: linear-gradient(15deg, #cd8651, #c48c70);
  box-shadow: 0 calc(1 * var(--milk-u)) calc(0.4 * var(--milk-u)) #563019;
}
.orange .dialog-title {
  top: 2%;
  left: 10%;
  width: 80%;
  background: none;
  color: #fff2d8;
  font-size: calc(4.7 * var(--milk-u));
}
.preview-scroll {
  position: absolute;
  top: 8.5%;
  left: 3%;
  right: 3%;
  bottom: 2.5%;
  background: #faeac8;
  border-radius: calc(3 * var(--milk-u));
  padding: calc(1.5 * var(--milk-u));
}
.level-card {
  background: url('/activity/milk-tea/img_s4TeaUpLv_preBg0.png') center / 100% 100% no-repeat;
  border-radius: calc(3 * var(--milk-u));
  padding: 0 calc(2 * var(--milk-u)) calc(3 * var(--milk-u));
  margin-bottom: calc(2 * var(--milk-u));
  min-height: calc(42 * var(--milk-u));
  text-align: center;
}
.level-card.current {
  background-image: url('/activity/milk-tea/img_s4TeaUpLv_preBg1.png');
}
.level-card h3 {
  height: calc(9 * var(--milk-u));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(1 * var(--milk-u));
  font-size: calc(4.4 * var(--milk-u));
  margin: 0 0 calc(1 * var(--milk-u));
}
.level-card h3 small {
  font-size: calc(3 * var(--milk-u));
  padding: calc(0.3 * var(--milk-u)) calc(2 * var(--milk-u));
  border-radius: calc(3 * var(--milk-u));
  color: #fff1d3;
  background: #ac7f5b;
}
.revenue-required {
  display: block;
  font-size: calc(3.2 * var(--milk-u));
  margin-bottom: calc(2 * var(--milk-u));
}
.level-effects {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(1 * var(--milk-u));
}
.level-effects > div {
  width: 31%;
  border-radius: calc(1.5 * var(--milk-u));
  background: #ccb18a55;
}
.level-effects .effect-label {
  width: 100%;
  min-height: calc(6 * var(--milk-u));
  font-size: calc(2.8 * var(--milk-u));
}
.level-effects p {
  font-size: calc(2.8 * var(--milk-u));
  line-height: 1.2;
  margin: calc(0.6 * var(--milk-u));
  overflow-wrap: anywhere;
}
.level-card .section-line {
  font-size: calc(2.8 * var(--milk-u));
  margin: calc(3 * var(--milk-u)) 0;
}
.level-card .section-line::before,
.level-card .section-line::after {
  border-top: calc(0.2 * var(--milk-u)) solid #d7b582;
}
.sales-scroll {
  position: absolute;
  top: 16%;
  left: 8%;
  right: 8%;
  bottom: 7%;
}
.sales-date {
  text-align: center;
  font-size: calc(4.6 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4TeaSellRecord_lineBg.png') center / 70% 100% no-repeat;
  margin: 0;
}
.sales-drinks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(2 * var(--milk-u));
  margin: calc(7 * var(--milk-u)) 0;
}
.sales-drinks > div {
  display: flex;
  align-items: center;
  min-width: 0;
}
.sales-drinks img {
  width: calc(14 * var(--milk-u));
  height: calc(14 * var(--milk-u));
  object-fit: contain;
  background: url('/activity/milk-tea/img_s4TeaSellRecord_itemBg.png') center / contain no-repeat;
}
.sales-drinks span {
  display: flex;
  flex-direction: column;
  font-size: calc(3 * var(--milk-u));
}
.sales-income {
  background: #c2a77c33;
  border-radius: calc(2 * var(--milk-u));
  padding: 0 calc(2 * var(--milk-u)) calc(3 * var(--milk-u));
  text-align: center;
}
.sales-income h3 {
  color: #b49b66;
  font-size: calc(3.4 * var(--milk-u));
  margin: 0 0 calc(1 * var(--milk-u));
}
.sales-income .rewards {
  flex-wrap: wrap;
}
.sales-scroll > .section-line {
  margin: calc(4 * var(--milk-u)) 0;
}
.hire-record {
  position: relative;
  margin: calc(6 * var(--milk-u)) 0 calc(2 * var(--milk-u));
  border-radius: calc(3 * var(--milk-u));
  background: #d9c5a3aa;
}
.hire-record time {
  position: absolute;
  right: calc(2 * var(--milk-u));
  top: calc(-4 * var(--milk-u));
  font-size: calc(2.7 * var(--milk-u));
  color: #b69a5c;
}
.hire-record header {
  display: flex;
  align-items: center;
  gap: calc(1 * var(--milk-u));
  background: #c8ae87aa;
  border-radius: calc(3 * var(--milk-u)) calc(3 * var(--milk-u)) 0 0;
  padding: 0 calc(2 * var(--milk-u));
}
.hire-record header > img,
.avatar-fallback {
  width: calc(8 * var(--milk-u));
  height: calc(8 * var(--milk-u));
  border-radius: 50%;
  object-fit: cover;
  background: #b48761;
  display: grid;
  place-items: center;
}
.hire-record small {
  color: #a36639;
  background: #ffdf83;
  border-radius: calc(2 * var(--milk-u));
  padding: calc(0.3 * var(--milk-u)) calc(1 * var(--milk-u));
  font-size: calc(2.3 * var(--milk-u));
}
.hire-record dl {
  margin: 0;
  padding: calc(1 * var(--milk-u)) calc(4 * var(--milk-u));
}
.hire-record dl div {
  display: flex;
  justify-content: space-between;
  gap: calc(2 * var(--milk-u));
  line-height: 1.7;
}
.hire-record dt {
  display: flex;
  flex: 1;
  align-items: center;
  gap: calc(1 * var(--milk-u));
}
.hire-record dt::after {
  content: '';
  flex: 1;
  border-top: calc(0.25 * var(--milk-u)) dotted #97815e;
}
.hire-record dd {
  margin: 0;
  display: flex;
  align-items: center;
}
.hire-record dd img {
  width: calc(4 * var(--milk-u));
  height: calc(3 * var(--milk-u));
  object-fit: contain;
}
.rank-paper {
  position: absolute;
  top: 8%;
  left: 3%;
  right: 3%;
  bottom: 2%;
  border: calc(0.8 * var(--milk-u)) solid #fff0ce;
  border-radius: calc(3 * var(--milk-u));
  background: #faebcd;
  overflow: hidden;
  color: #874c30;
}
.rank-paper > header {
  display: grid;
  grid-template-columns: 25% 75%;
  padding: calc(2 * var(--milk-u)) calc(3 * var(--milk-u));
  background: #ffdfb1;
  font-size: calc(3.5 * var(--milk-u));
}
.rank-scroll {
  height: calc(100% - calc(9 * var(--milk-u)));
  padding: 0 calc(1.5 * var(--milk-u));
}
.rank-row {
  display: flex;
  align-items: center;
  gap: calc(1.5 * var(--milk-u));
  min-height: calc(20 * var(--milk-u));
  border-bottom: calc(0.4 * var(--milk-u)) dotted #d5b289;
}
.rank-number {
  width: calc(7 * var(--milk-u));
  text-align: center;
  font-size: calc(3.2 * var(--milk-u));
  flex-shrink: 0;
}
.place-1,
.place-2,
.place-3 {
  border-radius: 50%;
  border: calc(0.4 * var(--milk-u)) solid #dbab4c;
  background: #ffdc47;
  line-height: calc(5 * var(--milk-u));
  width: calc(5 * var(--milk-u));
  margin-inline: calc(1 * var(--milk-u));
}
.place-2 {
  background: #b9d9e4;
  border-color: #9cb9c8;
}
.place-3 {
  background: #d88c59;
  border-color: #b56940;
}
.rank-avatar {
  position: relative;
  width: calc(10 * var(--milk-u));
  height: calc(10 * var(--milk-u));
  flex-shrink: 0;
  border-radius: 50%;
  background: #ccb18c;
}
.rank-avatar > img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.rank-avatar > span {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: calc(4 * var(--milk-u));
}
.rank-avatar > b {
  position: absolute;
  bottom: calc(-1 * var(--milk-u));
  right: calc(-0.5 * var(--milk-u));
  background: #ffc93f;
  border-radius: calc(1 * var(--milk-u));
  font-size: calc(2.5 * var(--milk-u));
  color: #fff;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #6a482a;
}
.rank-player {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.rank-player strong {
  font-size: calc(3.3 * var(--milk-u));
}
.rank-player p {
  font-size: calc(2.8 * var(--milk-u));
  color: #bb805d;
  margin: calc(0.5 * var(--milk-u)) 0;
}
.rank-player em {
  color: #f49b17;
}
.native-button {
  background: #f8c52e;
  border-radius: calc(4 * var(--milk-u));
  box-shadow:
    inset 0 0 0 calc(0.6 * var(--milk-u)) #ffdb53,
    0 calc(0.4 * var(--milk-u)) #b98c25;
  color: #fff5cb;
  font-weight: 800;
  font-size: calc(3 * var(--milk-u));
  padding: calc(1 * var(--milk-u)) calc(2 * var(--milk-u));
  flex-shrink: 0;
}
.empty {
  text-align: center;
  margin: calc(5 * var(--milk-u)) 0;
  font-size: calc(3 * var(--milk-u));
}
.share {
  left: 6%;
  width: 88%;
  top: 13%;
  height: 78%;
  background: url('/activity/milk-tea/img_s4HappyShare_bg.png') center / 100% 100% no-repeat;
}
.share .dialog-close {
  right: -4%;
  top: -4%;
  width: 14%;
}
.share-title {
  position: absolute;
  left: 10%;
  top: -7%;
  width: 80%;
  height: 10%;
  object-fit: contain;
}
.share-subtitle {
  position: absolute;
  top: 1%;
  left: 9%;
  width: 82%;
  height: 4%;
  object-fit: contain;
}
.share-time {
  position: absolute;
  top: 5%;
  width: 100%;
  margin: 0;
  color: #fff8df;
  text-align: center;
  font-size: calc(3.1 * var(--milk-u));
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #8b5b32;
}
.share-log {
  position: absolute;
  right: 2%;
  top: 12%;
  width: 16%;
  height: 10%;
  padding: 0;
}
.share-log img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.popular-decoration {
  position: absolute;
  top: 32%;
  right: 4%;
  width: 24%;
}
.share-score {
  position: absolute;
  top: 57%;
  left: 17%;
  width: 66%;
  text-align: center;
  font-size: calc(3.8 * var(--milk-u));
  color: #855131;
}
.share-score strong {
  color: #ffdf00;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #7a461e;
  margin-left: calc(2 * var(--milk-u));
}
.share-milestones {
  position: absolute;
  top: 65%;
  left: 14%;
  right: 10%;
  height: 17%;
  display: flex;
  justify-content: space-between;
}
.milestone {
  position: relative;
  width: 18%;
}
.milestone-rewards > * {
  width: 100%;
}
.tier-state {
  position: absolute;
  top: calc(-1 * var(--milk-u));
  right: calc(-0.5 * var(--milk-u));
  width: calc(3 * var(--milk-u));
  height: calc(4 * var(--milk-u));
  object-fit: contain;
}
.milestone > b {
  position: absolute;
  bottom: 0;
  width: 100%;
  text-align: center;
  font-size: calc(3.3 * var(--milk-u));
}
.share-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(4 * var(--milk-u));
  height: calc(3 * var(--milk-u));
  border: calc(0.4 * var(--milk-u)) solid #8a693c;
  border-radius: calc(1 * var(--milk-u));
  background: #e1d5aa;
}
.share-progress i {
  display: block;
  height: 100%;
  background: #e5a63d;
  border-radius: inherit;
}
.share-pool {
  position: absolute;
  top: 83%;
  left: 9%;
  margin: 0;
  background: #fff8dc;
  padding: calc(0.4 * var(--milk-u)) calc(2 * var(--milk-u));
  border-radius: calc(3 * var(--milk-u));
  color: #8d6934;
  font-size: calc(3 * var(--milk-u));
}
.share-buttons {
  position: absolute;
  top: 88%;
  left: 6%;
  right: 6%;
  height: 8%;
  display: flex;
  gap: 6%;
}
.share-buttons button {
  width: 47%;
  background: url('/activity/milk-tea/btn_s4HappyShare_share.png') center / 100% 100% no-repeat;
  color: #fff;
  font-size: calc(4.3 * var(--milk-u));
  font-weight: 800;
  text-shadow: calc(0.2 * var(--milk-u)) calc(0.2 * var(--milk-u)) #9a6b36;
}
.share-buttons button:disabled {
  background-image: url('/activity/milk-tea/btn_s4HappyShare_gray.png');
  opacity: 1;
}
.milestone-claim {
  position: absolute;
  right: 8%;
  top: 83%;
  font-size: calc(2.8 * var(--milk-u));
  background: #f6c33b;
  border-radius: calc(2 * var(--milk-u));
  padding: calc(0.5 * var(--milk-u)) calc(1 * var(--milk-u));
}
.fund {
  top: 12%;
  height: 83%;
  background: url('/activity/milk-tea/img_S4_upLvReward_bg.png') center / 100% 100% no-repeat;
}
.fund-banner {
  position: absolute;
  top: 13.5%;
  left: 6.5%;
  width: 87%;
  height: 23%;
  object-fit: fill;
}
.fund-tiers {
  position: absolute;
  top: 39%;
  left: 6%;
  right: 6%;
  bottom: 15%;
}
.fund-tiers article {
  position: relative;
  min-height: calc(15 * var(--milk-u));
  padding-left: calc(12 * var(--milk-u));
  margin-bottom: calc(1.5 * var(--milk-u));
}
.fund-level {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: calc(9 * var(--milk-u));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: url('/activity/milk-tea/img_s4_upLvReward_lv_bg_2.png') center / contain no-repeat;
  color: #986648;
  font-size: calc(4 * var(--milk-u));
}
.fund-level small {
  font-size: calc(2.5 * var(--milk-u));
}
.reached .fund-level {
  background-image: url('/activity/milk-tea/img_s4_upLvReward_lv_bg_1.png');
}
.fund-reward-row {
  min-height: calc(14 * var(--milk-u));
  padding: calc(1 * var(--milk-u)) calc(3 * var(--milk-u)) calc(1 * var(--milk-u)) calc(2 * var(--milk-u));
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: url('/activity/milk-tea/img_S4_upLvReward_item_bg_2.png') center / 100% 100% no-repeat;
}
.reached .fund-reward-row {
  background-image: url('/activity/milk-tea/img_S4_upLvReward_item_bg_1.png');
}
.fund-reward-row > img {
  width: calc(6 * var(--milk-u));
  height: calc(8 * var(--milk-u));
  object-fit: contain;
}
.fund-reward-row .rewards {
  display: grid;
  grid-template-columns: repeat(var(--reward-columns, 3), minmax(0, 1fr));
  gap: calc(1 * var(--milk-u));
  flex: 1;
  min-width: 0;
  margin-right: calc(2 * var(--milk-u));
}
.fund-reward-row .rewards > * {
  width: 100%;
  max-width: calc(11 * var(--milk-u));
}
.fund-submit {
  position: absolute;
  bottom: 5.5%;
  left: 28%;
  width: 44%;
  height: 8%;
  font-size: calc(4.5 * var(--milk-u));
}
.native-notice {
  position: absolute;
  bottom: 2%;
  left: 10%;
  right: 10%;
  background: #fff2d9;
  color: #805437;
  border: calc(0.2 * var(--milk-u)) solid #b68c60;
  padding: calc(1 * var(--milk-u));
  border-radius: calc(1 * var(--milk-u));
  text-align: center;
  font-size: calc(2.8 * var(--milk-u));
  z-index: 7;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
}
</style>
