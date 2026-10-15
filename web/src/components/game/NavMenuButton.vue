<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { menuRoutes } from '@/router/menu'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

const open = ref(false)

// 原底部悬浮导航栏的全部入口（含「我的」对应的设置页），统一收进左上角菜单
const items = computed(() => menuRoutes
  .filter(item => !item.adminOnly || userStore.isAdmin)
  .map(item => ({
    name: item.name,
    path: item.path ? `/${item.path}` : '/',
    label: item.label,
    icon: item.icon,
  })))

function toggle() {
  open.value = !open.value
}

// 路由切换后自动收起
watch(() => route.fullPath, () => {
  open.value = false
})
</script>

<template>
  <div class="nav-menu">
    <button
      class="nav-menu-btn"
      type="button"
      title="导航菜单"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="i-carbon-menu" />
    </button>

    <template v-if="open">
      <div class="nav-menu-overlay" @click="open = false" />
      <nav class="nav-menu-panel">
        <RouterLink
          v-for="item in items"
          :key="item.name"
          :to="item.path"
          class="nav-menu-item"
          :class="{ active: route.path === item.path }"
        >
          <span class="nav-menu-icon" :class="[item.icon]" />
          <span class="nav-menu-label">{{ item.label }}</span>
        </RouterLink>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.nav-menu {
  position: relative;
}

.nav-menu-btn {
  display: flex;
  height: 44px;
  width: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.32);
  box-shadow: 0 10px 30px rgba(31, 38, 80, 0.1);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  color: #4b5563;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-menu-btn:hover {
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 10px 30px rgba(31, 38, 80, 0.16);
}

/* 点击菜单外区域关闭 */
.nav-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.nav-menu-panel {
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  z-index: 50;
  display: flex;
  width: 208px;
  max-height: min(62dvh, 460px);
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  border-radius: 20px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 12px 32px rgba(31, 38, 80, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.nav-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 14px;
  color: #4b5563;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.nav-menu-item:hover {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.nav-menu-item.active {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  color: #fff;
}

.nav-menu-icon {
  font-size: 17px;
}

.nav-menu-label {
  font-weight: 600;
}
</style>
