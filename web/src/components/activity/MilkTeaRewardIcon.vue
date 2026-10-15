<script setup lang="ts">
defineProps<{ item: any, named?: boolean }>()
</script>

<template>
  <div class="tea-reward" :title="`${item.name || ''} ×${item.count}`">
    <span v-if="named" class="reward-name">{{ item.name }}</span>
    <div class="reward-frame" :class="`rarity-${item.rarity || 0}`">
      <img v-if="item.image" :src="item.image" :alt="item.name || ''">
      <span v-else class="reward-fallback">{{ item.name || '奖励' }}</span>
      <b>{{ item.count }}</b>
    </div>
  </div>
</template>

<style scoped>
.tea-reward {
  min-width: 0;
  text-align: center;
}
.reward-name {
  display: block;
  font-size: calc(2.7 * var(--milk-u));
  font-weight: 800;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.reward-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: calc(0.6 * var(--milk-u)) solid #fff6dd;
  border-radius: calc(2 * var(--milk-u));
  background: #f6d477;
  box-shadow: 0 calc(0.3 * var(--milk-u)) calc(0.3 * var(--milk-u)) #9c7b4a55;
}
.rarity-1 {
  background: #96ddee;
}
.rarity-2 {
  background: #d4a0f6;
}
.reward-frame img {
  width: 90%;
  height: 90%;
  object-fit: contain;
  margin: 5%;
}
.reward-frame b {
  position: absolute;
  right: calc(0.4 * var(--milk-u));
  bottom: 0;
  font-size: calc(2.6 * var(--milk-u));
  line-height: 1.1;
  color: #68482f;
  text-shadow: 0 0 calc(0.4 * var(--milk-u)) #fff;
}
.reward-fallback {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-size: calc(2.3 * var(--milk-u));
}
</style>
