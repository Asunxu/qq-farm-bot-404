<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import api from '@/api'
import AnnouncementPopup from '@/components/AnnouncementPopup.vue'
import NavMenuButton from '@/components/game/NavMenuButton.vue'
import MysteryMerchantBanner from '@/components/shop/MysteryMerchantBanner.vue'
import Sidebar from '@/components/Sidebar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import TopAccountMenu from '@/components/TopAccountMenu.vue'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'
import { useUserStore } from '@/stores/user'

const appStore = useAppStore()
const router = useRouter()

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const userStore = useUserStore()
const { currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)

// 原侧边栏的系统保活逻辑：ping、账号轮询、实时状态连接
const wsErrorNotifiedAt = ref<Record<string, number>>({})

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    if (res.data?.ok) {
      const accountRef = currentAccount.value?.id || currentAccount.value?.uin
      if (accountRef)
        statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    // 网络异常时静默，等待下轮重试
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef)
    await statusStore.fetchStatus(String(accountRef))
}

onMounted(() => {
  appStore.fetchLoginPageConfig()
  accountStore.fetchAccounts()
  checkConnection()
  userStore.fetchUserInfo()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return
  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return

  wsErrorNotifiedAt.value[accId] = errAt
  router.push('/settings')
}, { deep: true })
</script>

<template>
  <div class="dashboard-layout w-screen flex overflow-hidden" style="height: 100dvh;">
    <!-- Dashboard Background Image（PC / 移动端分别在 style.css 内切换） -->
    <div class="dashboard-bg" />

    <!-- PC 端常驻侧边栏（移动端默认隐藏，不影响左上角按钮） -->
    <Sidebar />

    <main class="relative h-full min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
      <!-- 顶栏：左侧导航菜单按钮（仅移动端），右侧主题 / 账号 -->
      <header class="relative z-30 flex shrink-0 items-center justify-between gap-4 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-5">
        <NavMenuButton class="lg:hidden" />

        <div class="ml-auto flex items-center gap-4">
          <ThemeToggle />

          <TopAccountMenu />
        </div>
      </header>

      <!-- Main Content Area -->
      <div class="custom-scrollbar min-h-0 flex flex-1 flex-col overflow-y-auto p-3 pb-6 sm:p-4 sm:pb-6 md:p-6 md:pb-8 lg:p-7 lg:pt-4 lg:pb-8">
        <MysteryMerchantBanner />
        <RouterView v-slot="{ Component, route }">
          <Transition name="slide-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <AnnouncementPopup />
  </div>
</template>

<style scoped>
/* Dashboard Layout */
.dashboard-layout {
  position: relative;
}

/* 顶栏圆形图标按钮（主题 / 活动）：与首页毛玻璃框同一套视觉，圆角保持圆形 */
header :deep(.icon-btn) {
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.32);
  box-shadow: 0 10px 30px rgba(31, 38, 80, 0.1);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

header :deep(.icon-btn:hover) {
  background: rgba(255, 255, 255, 0.55);
}

/* Slide Fade Transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.25);
}

.custom-scrollbar {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
</style>
