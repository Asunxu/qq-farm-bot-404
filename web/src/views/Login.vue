<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import AnnouncementPopup from '@/components/AnnouncementPopup.vue'
import LoginModals from '@/components/login/LoginModals.vue'
import PasswordStrengthMeter from '@/components/login/PasswordStrengthMeter.vue'
import UpdateLogModal from '@/components/login/UpdateLogModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { getPasswordStrength } from '@/composables/usePasswordStrength'
import { useAppStore } from '@/stores/app'
import { formatTimeDuration, useUserStore } from '@/stores/user'

const USERNAME_RE = /^\w+$/

const userStore = useUserStore()
const appStore = useAppStore()
const route = useRoute()
const gameVersion = ref('')
const loginLinks = computed(() => appStore.loginPageConfig)
const showUpdateLog = ref(false)
const logoLoadFailed = ref(false)

const isLogin = ref(true)
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)
const showPasswordStrength = ref(false)
const lockoutRemaining = ref(0)
const rateLimitRemaining = ref(0)
const routeUsername = computed(() => String(route.query.username || '').trim())

const rememberedUsername = useStorage('login_remembered_username', '')
const rememberAccount = ref(!!rememberedUsername.value)

const cardClaimEnabled = ref(true)
const cardClaimStock = ref(0)
const cardClaimLoading = ref(false)
const showClaimModal = ref(false)
const claimModalContent = ref({
  success: true,
  title: '',
  message: '',
  cardCode: '',
  days: 0,
})

const showResetVerifyModal = ref(false)
const showResetPasswordModal = ref(false)
const resetUsername = ref('')
const resetCardCode = ref('')
const resetNewPassword = ref('')
const resetConfirmPassword = ref('')
const resetError = ref('')
const resetLoading = ref(false)
const resetPasswordTouched = ref(false)

const showRenewalModal = ref(false)
const renewalUsername = ref('')
const renewalCardCode = ref('')
const renewalError = ref('')
const renewalSuccess = ref('')
const renewalLoading = ref(false)

const passwordStrength = computed(() => {
  return getPasswordStrength(password.value)
})

const resetPasswordStrength = computed(() => {
  return getPasswordStrength(resetNewPassword.value)
})

const usernameValid = computed(() => {
  const name = username.value
  if (!name)
    return { valid: false, message: '' }
  if (name.length < 3)
    return { valid: false, message: '用户名至少3位' }
  if (name.length > 32)
    return { valid: false, message: '用户名最多32位' }
  if (!USERNAME_RE.test(name))
    return { valid: false, message: '只能包含字母、数字、下划线' }
  return { valid: true, message: '' }
})

watch(password, () => {
  if (!isLogin.value && password.value) {
    showPasswordStrength.value = true
  }
})

watch(routeUsername, (value) => {
  if (value && !username.value.trim()) {
    username.value = value
  }
}, { immediate: true })

watch(() => loginLinks.value.logoUrl, () => {
  logoLoadFailed.value = false
})

function validateForm(): boolean {
  if (!username.value) {
    error.value = '请输入用户名'
    return false
  }

  if (!usernameValid.value.valid) {
    error.value = usernameValid.value.message
    return false
  }

  if (!password.value) {
    error.value = '请输入密码'
    return false
  }

  if (!isLogin.value) {
    if (password.value.length < 6) {
      error.value = '密码长度至少6位'
      return false
    }

    if (!passwordStrength.value.valid) {
      error.value = '密码强度不足：需包含大写字母、小写字母、数字、特殊符号中的至少两种'
      return false
    }

    if (!cardCode.value) {
      error.value = '请输入卡密'
      return false
    }
  }

  return true
}

async function handleSubmit() {
  if (!validateForm())
    return

  loading.value = true
  error.value = ''
  success.value = ''

  try {
    if (isLogin.value) {
      const result = await userStore.login(username.value, password.value)
      if (result.ok) {
        rememberedUsername.value = rememberAccount.value ? username.value : ''
        if (result.data?.mustChangePassword) {
          success.value = '登录成功！请修改默认密码以确保账户安全'
        }
        setTimeout(() => {
          window.location.href = '/'
        }, 500)
      }
      else {
        if (result.errorType === 'rate_limit') {
          error.value = result.error || '请求过于频繁，请稍后重试'
          if (result.remainingMs) {
            rateLimitRemaining.value = Math.ceil(result.remainingMs / 1000)
          }
        }
        else if (result.errorType === 'locked') {
          error.value = result.error || '账户已被锁定'
          if (result.remainingMs) {
            lockoutRemaining.value = Math.ceil(result.remainingMs / 1000 / 60)
          }
        }
        else {
          error.value = result.error || '登录失败'
        }
      }
    }
    else {
      const result = await userStore.register(username.value, password.value, cardCode.value)
      if (result.ok) {
        success.value = '注册成功，请登录'
        isLogin.value = true
        cardCode.value = ''
        password.value = ''
      }
      else {
        error.value = result.error || '注册失败'
      }
    }
  }
  catch (e: any) {
    const data = e.response?.data
    if (data?.errorType === 'rate_limit') {
      error.value = data.error || '请求过于频繁'
      if (data.remainingMs) {
        rateLimitRemaining.value = Math.ceil(data.remainingMs / 1000)
      }
    }
    else if (data?.errorType === 'locked') {
      error.value = data.error || '账户已被锁定'
      if (data.remainingMs) {
        lockoutRemaining.value = Math.ceil(data.remainingMs / 1000 / 60)
      }
    }
    else {
      error.value = data?.error || e.message || '操作异常'
    }
  }
  finally {
    loading.value = false
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value
  error.value = ''
  success.value = ''
  showPasswordStrength.value = false
  lockoutRemaining.value = 0
  rateLimitRemaining.value = 0
  // 切到注册时清空浏览器自动填充的登录账号
  if (!isLogin.value) {
    username.value = ''
    password.value = ''
    cardCode.value = ''
    checkCardClaimStatus()
  }
}

function openRenewal() {
  renewalUsername.value = username.value.trim()
  renewalCardCode.value = ''
  renewalError.value = ''
  renewalSuccess.value = ''
  showRenewalModal.value = true
}

function closeRenewalModal() {
  if (renewalLoading.value)
    return
  showRenewalModal.value = false
  renewalError.value = ''
  renewalSuccess.value = ''
}

async function submitRenewal() {
  if (!renewalUsername.value.trim()) {
    renewalError.value = '请输入用户名'
    return
  }
  if (!renewalCardCode.value.trim()) {
    renewalError.value = '请输入卡密'
    return
  }

  renewalLoading.value = true
  renewalError.value = ''
  renewalSuccess.value = ''
  try {
    const { data } = await api.post('/api/public/renew', {
      username: renewalUsername.value.trim(),
      cardCode: renewalCardCode.value.trim(),
    })
    if (!data.ok) {
      renewalError.value = data.error || '续费失败'
      return
    }

    const cardType = data.data?.cardType
    const card = data.data?.card
    renewalSuccess.value = cardType === 'quota'
      ? '续费成功，账号额度已更新'
      : `续费成功，有效期已更新${card?.expiresAt ? `至 ${new Date(card.expiresAt).toLocaleString('zh-CN')}` : ''}`
    username.value = renewalUsername.value.trim()
  }
  catch (e: any) {
    renewalError.value = e?.response?.data?.error || e?.message || '续费失败'
  }
  finally {
    renewalLoading.value = false
  }
}

function openResetVerifyModal() {
  resetUsername.value = username.value.trim()
  resetCardCode.value = ''
  resetNewPassword.value = ''
  resetConfirmPassword.value = ''
  resetError.value = ''
  resetPasswordTouched.value = false
  showResetVerifyModal.value = true
}

function closeResetVerifyModal() {
  if (resetLoading.value)
    return
  showResetVerifyModal.value = false
  resetError.value = ''
}

function closeResetPasswordModal() {
  showResetPasswordModal.value = false
  resetNewPassword.value = ''
  resetConfirmPassword.value = ''
  resetError.value = ''
  resetPasswordTouched.value = false
}

async function verifyResetPassword() {
  if (!resetUsername.value.trim()) {
    resetError.value = '请输入用户名'
    return
  }
  if (!resetCardCode.value.trim()) {
    resetError.value = '请输入注册时使用的卡密'
    return
  }

  resetLoading.value = true
  resetError.value = ''
  try {
    const result = await userStore.verifyResetPassword(resetUsername.value.trim(), resetCardCode.value.trim())
    if (!result.ok) {
      resetError.value = result.error || '验证失败'
      return
    }
    showResetVerifyModal.value = false
    showResetPasswordModal.value = true
  }
  catch (e: any) {
    resetError.value = e?.response?.data?.error || e?.message || '验证失败'
  }
  finally {
    resetLoading.value = false
  }
}

async function submitResetPassword() {
  resetPasswordTouched.value = true
  if (!resetNewPassword.value) {
    resetError.value = '请输入新密码'
    return
  }
  if (resetNewPassword.value.length < 6) {
    resetError.value = '密码长度至少6位'
    return
  }
  if (!resetPasswordStrength.value.valid) {
    resetError.value = '密码强度不足：需包含大写字母、小写字母、数字、特殊符号中的至少两种'
    return
  }
  if (resetNewPassword.value !== resetConfirmPassword.value) {
    resetError.value = '两次输入的密码不一致'
    return
  }

  resetLoading.value = true
  resetError.value = ''
  try {
    const result = await userStore.resetPassword(
      resetUsername.value.trim(),
      resetCardCode.value.trim(),
      resetNewPassword.value,
    )
    if (!result.ok) {
      resetError.value = result.error || '重置失败'
      return
    }
    showResetPasswordModal.value = false
    username.value = resetUsername.value.trim()
    password.value = ''
    isLogin.value = true
    success.value = '密码重置成功，请使用新密码登录'
    resetNewPassword.value = ''
    resetConfirmPassword.value = ''
  }
  catch (e: any) {
    resetError.value = e?.response?.data?.error || e?.message || '重置失败'
  }
  finally {
    resetLoading.value = false
  }
}

async function checkCardClaimStatus() {
  try {
    const res = await api.get('/api/card-claim/status')
    if (res.data?.ok) {
      // 接口明确返回 enabled 时才关闭按钮，避免接口异常导致按钮消失
      cardClaimEnabled.value = res.data.enabled !== false
      cardClaimStock.value = Number(res.data.availableTimeCards) || 0
    }
  }
  catch (e) {
    console.error('检查卡密领取状态失败:', e)
    // 接口失败时仍展示按钮，领取时再报错，避免注册页完全没入口
    cardClaimEnabled.value = true
  }
}

async function claimFreeCard() {
  if (cardClaimLoading.value)
    return

  cardClaimLoading.value = true
  error.value = ''

  try {
    const res = await api.post('/api/card-claim/claim')

    if (res.data.ok) {
      cardCode.value = res.data.cardCode
      claimModalContent.value = {
        success: true,
        title: '领取成功',
        message: `成功领取 ${formatTimeDuration(res.data)}卡密！`,
        cardCode: res.data.cardCode,
        days: res.data.days,
      }
      showClaimModal.value = true
    }
    else {
      claimModalContent.value = {
        success: false,
        title: '领取失败',
        message: res.data.error || '领取失败，请稍后重试',
        cardCode: '',
        days: 0,
      }
      showClaimModal.value = true
    }
  }
  catch (e: any) {
    const data = e.response?.data
    claimModalContent.value = {
      success: false,
      title: '领取失败',
      message: data?.error || e.message || '领取失败',
      cardCode: '',
      days: 0,
    }
    showClaimModal.value = true
  }
  finally {
    cardClaimLoading.value = false
  }
}

function closeClaimModal() {
  showClaimModal.value = false
}

onMounted(() => {
  // 预加载登录页与首页背景图，避免登录成功跳转后背景短暂空白
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  const bgList = isMobile
    ? ['/backgrounds/mobile-login-bg.jpg', '/backgrounds/mobile-dashboard-bg.jpg']
    : ['/backgrounds/pc-login-bg.jpg', '/backgrounds/pc-dashboard-bg.jpg']
  for (const src of bgList) {
    const img = new Image()
    img.src = src
  }

  // 优先用 URL 里带的用户名，其次用「记住账号」保存的用户名
  if (!username.value && rememberedUsername.value) {
    username.value = rememberedUsername.value
  }
  checkCardClaimStatus()
  fetchGameVersion()
  appStore.fetchLoginPageConfig()
})

async function fetchGameVersion() {
  try {
    const res = await api.get('/api/game-version')
    if (res.data.ok) {
      gameVersion.value = res.data.clientVersion
    }
  }
  catch (e) {
    console.error('获取游戏版本失败:', e)
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 背景图 -->
    <div class="login-bg" aria-hidden="true" />

    <!-- 顶部品牌栏 -->
    <div class="top-brand-bar">
      <div class="brand-block">
        <div class="brand-title">
          <span class="brand-leaf i-fas-leaf" />
          <span class="brand-text">{{ loginLinks.title || 'QQ农场' }}</span>
        </div>
        <div class="brand-tagline">
          种下希望 收获快乐
        </div>
      </div>
      <div class="register-top">
        <span>{{ isLogin ? '还没有账号？' : '已经有账号？' }}</span>
        <a href="javascript:void(0)" @click="toggleMode">{{ isLogin ? '立即注册 >' : '立即登录 >' }}</a>
      </div>
    </div>

    <!-- 登录面板 -->
    <main class="login-panel">
      <div class="panel-header">
        <div class="panel-logo">
          <img
            v-if="loginLinks.logoUrl && !logoLoadFailed"
            :src="loginLinks.logoUrl"
            :alt="`${loginLinks.title || 'QQ农场'}图标`"
            class="panel-logo-img"
            @error="logoLoadFailed = true"
          >
          <div v-else class="i-fas-leaf text-xl text-white" />
        </div>
        <div class="panel-brand">
          {{ loginLinks.title || 'QQ农场' }}
        </div>
      </div>

      <div class="welcome">
        <h1>{{ isLogin ? '欢迎回来' : '创建账号' }}</h1>
        <p>
          {{ isLogin
            ? (loginLinks.loginSubtitle || '登录后开启你的农场之旅')
            : (loginLinks.registerSubtitle || '注册后开启你的农场之旅') }}
        </p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="field">
          <div class="field-icon">
            <div class="field-icon-svg i-carbon-user" />
          </div>
          <BaseInput
            id="username"
            v-model="username"
            placeholder="请输入账号"
            :autocomplete="isLogin ? 'username' : 'new-username'"
            :name="isLogin ? 'username' : 'register-username'"
            class="field-input"
            required
          />
        </div>
        <p v-if="username && !usernameValid.valid" class="form-hint error">
          {{ usernameValid.message }}
        </p>

        <div class="field">
          <div class="field-icon">
            <div class="field-icon-svg i-carbon-locked" />
          </div>
          <BaseInput
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            :autocomplete="isLogin ? 'current-password' : 'new-password'"
            :name="isLogin ? 'password' : 'register-password'"
            class="field-input"
            required
          />
        </div>
        <PasswordStrengthMeter
          v-if="showPasswordStrength && password"
          :strength="passwordStrength"
          compact
        />

        <template v-if="!isLogin">
          <div class="field">
            <div class="field-icon">
              <div class="field-icon-svg i-carbon-ticket" />
            </div>
            <BaseInput
              id="cardCode"
              v-model="cardCode"
              placeholder="请输入卡密"
              autocomplete="off"
              name="card-code"
              class="field-input"
              required
            />
          </div>
          <div v-if="cardClaimEnabled" class="claim-row">
            <button
              type="button"
              class="claim-card-btn"
              :disabled="cardClaimLoading"
              @click="claimFreeCard"
            >
              <span v-if="cardClaimLoading" class="i-svg-spinners-90-ring-with-bg" />
              <span v-else>免费领取卡密</span>
            </button>
            <p v-if="cardClaimStock === 0" class="claim-stock-tip">
              当前无可用时间卡密，请联系管理员补充库存
            </p>
          </div>
          <div v-else class="claim-stock-tip disabled">
            管理员未开启免费领卡，请使用已有卡密注册
          </div>
        </template>

        <div v-if="isLogin" class="options">
          <label class="remember">
            <input v-model="rememberAccount" type="checkbox" class="remember-box">
            <span>记住账号</span>
          </label>
          <a class="forgot" href="javascript:void(0)" @click="openResetVerifyModal">忘记密码?</a>
        </div>

        <div v-if="error" class="message error-message">
          <span class="message-icon i-carbon-warning" />
          <div class="message-content">
            {{ error }}
            <span v-if="lockoutRemaining > 0" class="lockout-timer">
              ({{ lockoutRemaining }} 分钟后解锁)
            </span>
            <span v-if="rateLimitRemaining > 0" class="lockout-timer">
              ({{ rateLimitRemaining }} 秒后可重试)
            </span>
          </div>
        </div>
        <div v-if="success" class="message success-message">
          <span class="message-icon i-carbon-checkmark-filled" />
          {{ success }}
        </div>

        <button
          type="submit"
          class="login-btn"
          :disabled="loading"
        >
          <div v-if="loading" class="i-svg-spinners-ring-resize mr-2 text-base" />
          <div v-else class="i-carbon-login mr-2 text-base" />
          {{ isLogin ? '登录' : '注册' }}
        </button>
      </form>

      <div class="divider">
        <span>快捷入口</span>
      </div>

      <div class="alt-row">
        <button class="alt-btn" type="button" @click="openRenewal">
          <div class="alt-circle alt-renew">
            <div class="i-carbon-renew text-xl text-emerald-500" />
          </div>
          <span class="alt-text">账号续费</span>
        </button>
        <button class="alt-btn" type="button" @click="showUpdateLog = true">
          <div class="alt-circle alt-log">
            <div class="i-carbon-document text-xl text-amber-500" />
          </div>
          <span class="alt-text">更新日志</span>
        </button>
        <a
          v-if="loginLinks.purchaseUrl"
          class="alt-btn"
          :href="loginLinks.purchaseUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="alt-circle alt-buy">
            <div class="i-carbon-shopping-cart text-xl text-sky-500" />
          </div>
          <span class="alt-text">购买卡密</span>
        </a>
        <a
          v-if="loginLinks.qqGroupUrl"
          class="alt-btn"
          :href="loginLinks.qqGroupUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="alt-circle alt-qq-group">
            <div class="i-carbon-group text-xl text-sky-500" />
          </div>
          <span class="alt-text">加入QQ群</span>
        </a>
      </div>

      <div class="footer">
        <span>{{ isLogin ? '还没有账号？' : '已经有账号？' }}</span>
        <a href="javascript:void(0)" @click="toggleMode">{{ isLogin ? '立即注册 >' : '立即登录 >' }}</a>
      </div>

      <div v-if="gameVersion" class="game-version">
        当前游戏版本：{{ gameVersion }}
      </div>
    </main>

    <LoginModals
      v-model:show-claim-modal="showClaimModal"
      v-model:show-reset-verify-modal="showResetVerifyModal"
      v-model:show-reset-password-modal="showResetPasswordModal"
      v-model:show-renewal-modal="showRenewalModal"
      v-model:reset-username="resetUsername"
      v-model:reset-card-code="resetCardCode"
      v-model:reset-new-password="resetNewPassword"
      v-model:reset-confirm-password="resetConfirmPassword"
      v-model:reset-password-touched="resetPasswordTouched"
      v-model:renewal-username="renewalUsername"
      v-model:renewal-card-code="renewalCardCode"
      :claim-modal-content="claimModalContent"
      :reset-error="resetError"
      :reset-loading="resetLoading"
      :reset-password-strength="resetPasswordStrength"
      :renewal-error="renewalError"
      :renewal-success="renewalSuccess"
      :renewal-loading="renewalLoading"
      @close-claim="closeClaimModal"
      @close-reset-verify="closeResetVerifyModal"
      @close-reset-password="closeResetPasswordModal"
      @close-renewal="closeRenewalModal"
      @verify-reset-password="verifyResetPassword"
      @submit-reset-password="submitResetPassword"
      @submit-renewal="submitRenewal"
    />

    <UpdateLogModal :show="showUpdateLog" @close="showUpdateLog = false" />
    <AnnouncementPopup />
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* 背景 */
.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('/backgrounds/pc-login-bg.jpg') center/cover no-repeat;
}

/* 移动端背景 */
@media (max-width: 768px) {
  .login-bg {
    background: url('/backgrounds/mobile-login-bg.jpg') center/cover no-repeat;
  }
}

/* 顶部品牌栏（移动端默认显示，桌面端在下方媒体查询里定位） */
.top-brand-bar {
  display: none;
  position: relative;
  z-index: 10;
}

/* 登录面板 */
.login-panel {
  position: relative;
  z-index: 10;
  width: 380px;
  max-width: calc(100% - 80px);
  margin-right: 6%;
  padding: 40px 36px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(31, 110, 140, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.panel-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d26a 0%, #0099ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: 0 0 auto;
  box-shadow: 0 4px 12px rgba(0, 210, 106, 0.3);
}

.panel-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.panel-brand {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  letter-spacing: 0.02em;
  overflow-wrap: anywhere;
}

/* 欢迎语 */
.welcome {
  text-align: center;
  margin-bottom: 24px;
}

.welcome h1 {
  font-size: 28px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 8px;
  letter-spacing: 0.03em;
}

.welcome p {
  font-size: 13px;
  color: #7f8c8d;
  overflow-wrap: anywhere;
}

/* 表单 */
.login-form {
  width: 100%;
}

/* 输入框：白色胶囊 */
.field {
  position: relative;
  display: flex;
  align-items: center;
  height: 54px;
  margin-bottom: 14px;
}

.field-icon {
  position: absolute;
  left: 20px;
  z-index: 5;
  display: flex;
  pointer-events: none;
}

.field-icon-svg {
  font-size: 20px;
  color: #334155;
}

/* 调整 BaseInput 自带眼睛按钮的位置与大小，对齐设计稿 */
.field-input :deep(button) {
  right: 20px;
  display: flex;
}

.field-input :deep(.i-carbon-view),
.field-input :deep(.i-carbon-view-off) {
  width: 20px;
  height: 20px;
}

.field-input {
  width: 100%;
}

.field-input :deep(input) {
  width: 100% !important;
  height: 54px !important;
  padding-left: 50px !important;
  padding-right: 50px !important;
  border: none !important;
  border-radius: 999px !important;
  background: #fff !important;
  box-shadow: 0 2px 10px rgba(31, 110, 140, 0.08) !important;
  font-size: 15px !important;
  color: #2c3e50 !important;
  transition: box-shadow 0.3s ease !important;
}

.field-input :deep(input::placeholder) {
  color: #9ca3af !important;
}

.field-input :deep(input:focus) {
  outline: none !important;
  box-shadow:
    0 0 0 2px rgba(34, 197, 94, 0.45),
    0 2px 10px rgba(31, 110, 140, 0.08) !important;
}

.field-input :deep(input:-webkit-autofill) {
  -webkit-text-fill-color: #2c3e50 !important;
}

/* 用户名校验提示 */
.form-hint {
  font-size: 12px;
  color: #64748b;
  margin: -8px 0 12px 20px;
}

.form-hint.error {
  color: #ef5350;
}

/* 免费领卡 */
.claim-row {
  width: 100%;
  margin-bottom: 14px;
}

.claim-card-btn {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed #34d399;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.12);
  color: #059669;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.claim-card-btn:hover {
  background: rgba(52, 211, 153, 0.2);
}

.claim-card-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.claim-stock-tip {
  margin: 8px 0 0;
  font-size: 11px;
  color: #d97706;
  text-align: center;
}

.claim-stock-tip.disabled {
  margin-bottom: 14px;
  font-size: 12px;
  color: #9ca3af;
}

/* 记住账号 / 忘记密码 */
.options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  font-size: 14px;
}

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: #4b5563;
}

.remember-box {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  accent-color: #10b981;
  cursor: pointer;
}

.forgot {
  color: #4b5563;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.forgot:hover {
  opacity: 0.7;
}

/* 提示信息 */
.message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
  margin-bottom: 14px;
}

.message-icon {
  flex: 0 0 auto;
  font-size: 15px;
  margin-top: 1px;
}

.message-content {
  min-width: 0;
}

.lockout-timer {
  display: block;
  font-size: 12px;
  opacity: 0.8;
  margin-top: 2px;
}

.error-message {
  background: #fef2f2;
  color: #c62828;
  border: 1px solid #fecaca;
}

.success-message {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* 登录按钮：绿→蓝渐变胶囊 */
.login-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399 0%, #22c55e 45%, #3b82f6 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.5),
    0 6px 18px rgba(16, 185, 129, 0.35);
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.5),
    0 8px 22px rgba(16, 185, 129, 0.4);
}

.login-btn:active {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 分隔线 */
.divider {
  width: 100%;
  display: flex;
  align-items: center;
  margin: 24px 0 20px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8e8e8;
}

.divider span {
  padding: 0 16px;
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* 快捷入口 */
.alt-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px 24px;
  margin-bottom: 24px;
}

.alt-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.2s;
}

.alt-btn:hover {
  transform: translateY(-2px);
}

.alt-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 12px rgba(31, 110, 140, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.alt-text {
  font-size: 12px;
  color: #7f8c8d;
}

/* 底部注册入口 */
.footer {
  text-align: center;
  font-size: 14px;
}

.footer span {
  color: #7f8c8d;
}

.footer a {
  color: #3498db;
  text-decoration: none;
  font-weight: 500;
}

.footer a:hover {
  opacity: 0.7;
}

.game-version {
  margin-top: 10px;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}

/* 移动端 */
@media (max-width: 768px) {
  .login-page {
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    min-height: 100dvh;
    overflow-y: auto;
  }

  /* 顶部：左上 Logo，右上注册入口 */
  .top-brand-bar {
    display: flex;
    width: 100%;
    align-items: flex-start;
    justify-content: space-between;
    padding: 52px 24px 0;
  }

  .brand-block {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-leaf {
    font-size: 30px;
    color: #fff;
    filter: drop-shadow(0 3px 5px rgba(23, 78, 122, 0.35));
  }

  .brand-text {
    font-size: 36px;
    font-weight: 900;
    font-style: italic;
    color: #fff;
    letter-spacing: 2px;
    text-shadow:
      0 3px 0 rgba(30, 84, 132, 0.65),
      0 6px 14px rgba(30, 84, 132, 0.55),
      0 10px 26px rgba(30, 84, 132, 0.45);
  }

  .brand-tagline {
    margin-top: 2px;
    padding-left: 42px;
    font-size: 15px;
    font-weight: 600;
    font-style: italic;
    color: rgba(255, 255, 255, 0.98);
    letter-spacing: 0.22em;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.6),
      0 4px 12px rgba(30, 84, 132, 0.5);
  }

  .register-top {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-top: 10px;
    font-size: 13px;
    line-height: 1.5;
    text-align: right;
    color: rgba(255, 255, 255, 0.95);
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.55),
      0 3px 10px rgba(30, 84, 132, 0.5);
  }

  .register-top a {
    color: #fff;
    font-weight: 600;
    font-size: 15px;
    text-decoration: none;
  }

  /* 登录卡：白色磨砂大圆角，内容拉伸 */
  .login-panel {
    width: calc(100% - 32px);
    max-width: 420px;
    margin: 26px 0 36px;
    padding: 28px 24px 30px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 14px 40px rgba(31, 110, 140, 0.18);
    align-items: stretch;
  }

  .panel-header {
    display: none;
  }

  .welcome {
    text-align: left;
    margin-bottom: 20px;
  }

  .welcome h1 {
    font-size: 26px;
    color: #1f2937;
    margin-bottom: 6px;
  }

  .welcome p {
    font-size: 14px;
    color: #6b7280;
  }

  .footer {
    display: none;
  }
}

/* 桌面端：顶部品牌栏绝对定位 */
@media (min-width: 769px) {
  .top-brand-bar {
    display: flex;
    position: absolute;
    top: 30px;
    left: 40px;
    right: 40px;
    z-index: 10;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0;
  }

  .brand-block {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-leaf {
    font-size: 24px;
    color: #fff;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
  }

  .brand-text {
    font-size: 28px;
    font-weight: 900;
    font-style: italic;
    color: #fff;
    letter-spacing: 2px;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.6),
      0 5px 14px rgba(30, 84, 132, 0.5),
      0 10px 24px rgba(30, 84, 132, 0.4);
  }

  .brand-tagline {
    margin-top: 2px;
    padding-left: 34px;
    font-size: 13px;
    font-weight: 600;
    font-style: italic;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.2em;
    text-shadow:
      0 2px 0 rgba(30, 84, 132, 0.55),
      0 4px 12px rgba(30, 84, 132, 0.5);
  }

  .register-top {
    padding-top: 8px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .register-top a {
    color: #fff;
    font-weight: 500;
    text-decoration: none;
  }
}
</style>
