<script setup lang="ts">
import { reactive, ref, useId, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const userStore = useUserStore()
const toastStore = useToastStore()

const form = reactive({
  old: '',
  new: '',
  confirm: '',
})
const saving = ref(false)
const errorMessage = ref('')

function close() {
  if (saving.value)
    return
  emit('close')
}

watch(() => props.show, (visible) => {
  if (visible) {
    form.old = ''
    form.new = ''
    form.confirm = ''
    errorMessage.value = ''
  }
})

async function submit() {
  errorMessage.value = ''
  if (!form.old || !form.new || !form.confirm) {
    errorMessage.value = '请填写完整'
    return
  }
  if (form.new !== form.confirm) {
    errorMessage.value = '两次输入的新密码不一致'
    return
  }
  if (form.new.length < 4) {
    errorMessage.value = '密码长度至少 4 位'
    return
  }

  saving.value = true
  try {
    const res = await userStore.changePassword(form.old, form.new)
    if (res.ok) {
      toastStore.success('密码修改成功，请重新登录')
      emit('close')
      setTimeout(() => {
        userStore.logout()
        window.location.href = '/login'
      }, 1500)
    }
    else {
      errorMessage.value = res.error || '修改失败'
    }
  }
  catch (e: any) {
    errorMessage.value = e.response?.data?.error || e.message || '修改失败'
  }
  finally {
    saving.value = false
  }
}

const modalSurface = ref<HTMLElement | null>(null)
const modalId = useId()
useModalFocus(() => props.show, modalSurface, close)
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" @click.self="close">
    <div ref="modalSurface" role="dialog" aria-modal="true" :aria-labelledby="`${modalId}-title`" tabindex="-1" class="max-h-[90vh] max-w-md w-full overflow-hidden rounded-lg shadow-xl" :style="{ background: 'var(--theme-bg)' }">
      <div class="flex items-center justify-between border-b p-4" :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 10%, transparent)' }">
        <h3 :id="`${modalId}-title`" class="text-lg font-semibold" :style="{ color: 'var(--theme-text)' }">
          修改密码
        </h3>
        <BaseButton variant="ghost" aria-label="关闭弹窗" class="!p-1" @click="close">
          <div class="i-carbon-close text-xl" :style="{ color: 'var(--theme-text)' }" />
        </BaseButton>
      </div>

      <form class="space-y-4 p-4" @submit.prevent="submit">
        <div v-if="errorMessage" class="rounded p-3 text-sm" :style="{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }">
          {{ errorMessage }}
        </div>

        <BaseInput
          v-model="form.old"
          label="当前密码"
          type="password"
          placeholder="请输入当前密码"
        />
        <BaseInput
          v-model="form.new"
          label="新密码"
          type="password"
          placeholder="至少 4 位"
        />
        <BaseInput
          v-model="form.confirm"
          label="确认新密码"
          type="password"
          placeholder="再次输入新密码"
        />

        <div class="text-xs opacity-60" :style="{ color: 'var(--theme-text)' }">
          修改成功后需要使用新密码重新登录
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <BaseButton variant="outline" @click="close">
            取消
          </BaseButton>
          <BaseButton variant="primary" :loading="saving" @click="submit">
            确认修改
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
