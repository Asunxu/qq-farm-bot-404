<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ state: any, busy: boolean, loading: boolean, error: string }>()
const emit = defineEmits<{ close: [], craft: [params: { fruitUids: string[] }] }>()
const img = (name: string) => `/activity/milk-tea/${name}.png`
const selected = ref<string[]>([])
const recipes = computed(() => (props.state.recipes || []).filter((r: any) => r.is_advanced).sort((a: any, b: any) => Number(b.unlocked) - Number(a.unlocked) || Number(a.recipe_id) - Number(b.recipe_id)))
const fruits = (r: any) => r.unlocked ? (r.fruits || []).filter((f: any) => /^\d+$/.test(String(f.uid)) && BigInt(f.uid) > 0n && BigInt(f.count || 0) > 0n) : []
const available = computed<string[]>(() => [...new Set<string>(recipes.value.flatMap((r: any) => fruits(r).map((f: any) => String(f.uid))))])
const allSelected = computed(() => available.value.length > 0 && available.value.every(uid => selected.value.includes(uid)))
const blocked = computed(() => props.busy || props.loading || props.state.phase !== 'business')
watch(available, (uids) => {
  selected.value = selected.value.filter(uid => uids.includes(uid))
}, { immediate: true })
function toggle(uid: string) {
  if (!blocked.value)
    selected.value = selected.value.includes(uid) ? selected.value.filter(x => x !== uid) : [...selected.value, uid]
}
function hasSelection(r: any) {
  return fruits(r).some((f: any) => selected.value.includes(String(f.uid)))
}
function unlockLevel(r: any) {
  return props.state.levels?.find((l: any) => l.recipe_names?.includes(r.recipe_name))?.level
}
</script>

<template>
  <div class="craft-shade" @click.self="!busy && emit('close')">
    <section class="craft-book" role="dialog" aria-modal="true" aria-labelledby="craft-title">
      <button class="craft-close" aria-label="关闭奶茶工坊" :disabled="busy" @click="emit('close')">
        <img :src="img('img_s4_closeBtn')" alt="">
      </button>
      <h2 id="craft-title">
        奶茶工坊
      </h2>
      <p v-if="error" class="craft-error" role="alert">
        {{ error }}
      </p>
      <div class="recipe-list">
        <article v-for="r in recipes" :key="r.recipe_id" class="recipe-card" :class="{ locked: !r.unlocked }">
          <img class="recipe-name" :src="img(`img_s4TeaMaker_name${r.recipe_id}`)" :alt="r.recipe_name">
          <div class="recipe-summary">
            <div class="drink-picture">
              <img :src="r.config?.image || img(`icon_s4_milktea_${r.recipe_id}`)" :alt="r.recipe_name"><img v-if="!r.unlocked" class="lock" :src="img('img_s4_v2_lock')" alt="未解锁">
            </div>
            <div class="recipe-price">
              <span>售出单价</span><b><img :src="img('img_s4TeaUI_rewardpng')" alt="奶茶券">{{ r.token_price }}</b><b><span class="coin" aria-label="金币">金币</span>{{ r.coin_price }}</b>
            </div>
            <div class="recipe-estimate">
              <span>预计制作</span><strong>{{ hasSelection(r) ? '待结算' : '0' }}<small v-if="!hasSelection(r)">杯</small></strong>
            </div>
          </div>
          <div v-if="!r.unlocked" class="recipe-empty">
            {{ unlockLevel(r) ? `店铺达到${unlockLevel(r)}级即可解锁` : '暂未解锁' }}
          </div>
          <div v-else-if="!fruits(r).length" class="recipe-empty">
            暂无材料，收获果实后再来制作吧
          </div>
          <div v-else class="fruit-list">
            <button v-for="f in fruits(r)" :key="f.uid" class="fruit-choice" :class="{ selected: selected.includes(String(f.uid)) }" :aria-pressed="selected.includes(String(f.uid))" :aria-label="`${f.name}，${f.count}个`" :disabled="blocked" @click="toggle(String(f.uid))">
              <img v-if="f.image" :src="f.image" :alt="f.name"><span v-else>{{ f.name }}</span><b>×{{ f.count }}</b>
            </button>
          </div>
        </article>
        <p v-if="!recipes.length" class="recipe-empty">
          暂无配方数据
        </p>
      </div>
      <footer class="craft-footer">
        <span>已选：{{ selected.length }}</span>
        <button class="craft-confirm" :disabled="blocked || !selected.length" @click="emit('craft', { fruitUids: [...selected] })">
          {{ busy ? '制作中…' : '确认制作' }}
        </button>
        <label class="select-all"><input type="checkbox" :checked="allSelected" :disabled="blocked || !available.length" @change="selected = allSelected ? [] : [...available]"><span>全选</span></label>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.craft-shade {
  position: absolute;
  inset: 0;
  z-index: 12;
  background: #21180fc4;
  overflow: hidden;
}
.craft-book {
  /* Definite bounds keep the list from sizing the grid and pushing the footer off-screen. */
  position: absolute;
  inset: 13% 6% 6%;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  padding: calc(11 * var(--milk-u)) calc(5 * var(--milk-u)) calc(5 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4_popBg1.png') center / 100% 100% no-repeat;
  color: #966747;
  font-weight: 800;
  display: flex;
  flex-direction: column;
}
.craft-close {
  position: absolute;
  top: 0;
  right: 3%;
  width: 13%;
  padding: 0;
  z-index: 2;
}
.craft-close img {
  width: 100%;
}
h2 {
  flex: none;
  margin: 0 12% calc(4 * var(--milk-u));
  text-align: center;
  font-size: calc(5.5 * var(--milk-u));
  color: #635d49;
  line-height: 1.5;
  background: url('/activity/milk-tea/img_s4_titleBg.png') center / 100% 100% no-repeat;
}
.recipe-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: calc(1.5 * var(--milk-u)) 0 calc(3 * var(--milk-u));
  scrollbar-width: thin;
  scrollbar-color: #c3a47b transparent;
  mask-image: linear-gradient(#000 96%, transparent);
}
.recipe-card {
  position: relative;
  min-height: calc(38 * var(--milk-u));
  margin-bottom: calc(2.6 * var(--milk-u));
  padding: calc(3 * var(--milk-u)) calc(1.8 * var(--milk-u)) calc(1.5 * var(--milk-u));
  box-sizing: border-box;
  background: url('/activity/milk-tea/img_s4TeaMaker_bg4.png') center / 100% 100% no-repeat;
}
.recipe-name {
  position: absolute;
  top: calc(-2 * var(--milk-u));
  left: calc(2 * var(--milk-u));
  width: calc(21 * var(--milk-u));
  height: calc(6.4 * var(--milk-u));
  object-fit: contain;
  z-index: 1;
}
.recipe-summary {
  display: grid;
  grid-template-columns: 32% 36% 32%;
  align-items: center;
  min-height: calc(17 * var(--milk-u));
}
.drink-picture {
  position: relative;
  height: calc(17 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4TeaMaker_shadow.png') center bottom / 65% auto no-repeat;
}
.drink-picture > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.locked .drink-picture > img:first-child {
  filter: brightness(0.35) sepia(1);
}
.drink-picture > .lock {
  position: absolute;
  width: calc(4 * var(--milk-u));
  height: calc(5 * var(--milk-u));
  left: 40%;
  top: 40%;
}
.recipe-price,
.recipe-estimate {
  display: flex;
  flex-direction: column;
  gap: calc(0.8 * var(--milk-u));
  font-size: calc(2.9 * var(--milk-u));
  min-width: 0;
}
.recipe-price b {
  display: flex;
  align-items: center;
  gap: calc(0.7 * var(--milk-u));
  color: #805438;
  overflow-wrap: anywhere;
}
.recipe-price img {
  width: calc(4 * var(--milk-u));
  height: calc(3.4 * var(--milk-u));
  object-fit: contain;
}
.coin {
  display: inline-grid;
  place-items: center;
  width: calc(3.4 * var(--milk-u));
  height: calc(3.4 * var(--milk-u));
  border-radius: 50%;
  background: #ffc52e;
  border: calc(0.3 * var(--milk-u)) solid #efa01c;
  color: #b87616;
  font-size: calc(1.1 * var(--milk-u));
}
.recipe-estimate {
  text-align: center;
  align-self: start;
  padding-top: calc(2 * var(--milk-u));
}
.recipe-estimate strong {
  margin-top: calc(1 * var(--milk-u));
  color: #89472d;
  font-size: calc(4.5 * var(--milk-u));
}
.recipe-estimate small {
  font-size: calc(3 * var(--milk-u));
  margin-left: calc(0.4 * var(--milk-u));
}
.recipe-empty {
  display: grid;
  place-items: center;
  min-height: calc(14.5 * var(--milk-u));
  margin: 0;
  color: #b39a62;
  font-size: calc(2.8 * var(--milk-u));
  text-align: center;
}
.fruit-list {
  display: flex;
  gap: calc(1.5 * var(--milk-u));
  flex-wrap: wrap;
  min-height: calc(14.5 * var(--milk-u));
  padding: calc(1 * var(--milk-u));
}
.fruit-choice {
  position: relative;
  width: calc(12 * var(--milk-u));
  height: calc(12 * var(--milk-u));
  padding: calc(1 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4TeaMaker_itemBg.png') center / 100% 100% no-repeat;
  font-size: calc(2 * var(--milk-u));
}
.fruit-choice.selected::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url('/activity/milk-tea/img_s4TeaMaker_selected.png') center / 100% 100% no-repeat;
  pointer-events: none;
}
.fruit-choice img {
  width: 100%;
  height: 85%;
  object-fit: contain;
}
.fruit-choice b {
  position: absolute;
  bottom: calc(0.8 * var(--milk-u));
  right: calc(1 * var(--milk-u));
  color: #805438;
}
.craft-footer {
  flex: 0 0 auto;
  min-width: 0;
  display: grid;
  grid-template-columns: 23% 50% 27%;
  align-items: center;
  padding: calc(2 * var(--milk-u)) 0 calc(3 * var(--milk-u));
  font-size: calc(3.6 * var(--milk-u));
  color: #a36545;
}
.craft-confirm {
  height: calc(12 * var(--milk-u));
  padding: 0;
  font-weight: 900;
  font-size: calc(4.4 * var(--milk-u));
  background: url('/activity/milk-tea/img_s4_btn0.png') center / 100% 100% no-repeat;
  color: #665e4c;
}
.craft-confirm:disabled {
  background-image: url('/activity/milk-tea/img_s4_btn3.png');
  opacity: 1;
}
.select-all {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: calc(1 * var(--milk-u));
  cursor: pointer;
}
.select-all input {
  appearance: none;
  width: calc(4.5 * var(--milk-u));
  height: calc(4.5 * var(--milk-u));
  margin: 0;
  border: calc(0.3 * var(--milk-u)) solid #bc885d;
  border-radius: calc(0.5 * var(--milk-u));
  background: #a76c49;
}
.select-all input:checked {
  background: #a76c49 url('/activity/milk-tea/img_s4TeaMaker_selected.png') center / cover;
}
.craft-error {
  flex: 0 0 auto;
  max-height: calc(9 * var(--milk-u));
  overflow: auto;
  margin: calc(-2 * var(--milk-u)) 0 calc(1 * var(--milk-u));
  font-size: calc(2.5 * var(--milk-u));
  color: #ac3528;
}
</style>
