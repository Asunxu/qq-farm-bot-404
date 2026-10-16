import { defineConfig, presetAttributify, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
  shortcuts: {
    'i-carbon-list-blocked': 'i-fas-ban',
    'i-carbon-user-offline': 'i-fas-user-slash',
    'i-carbon-leaf': 'i-fas-leaf',
    'i-carbon-crown': 'i-fas-crown',
    'i-carbon-circle': 'i-fas-circle',
    'i-fas-circle-notch-function': 'i-fas-circle-notch',
    'i-fas-circle-notch-string': 'i-fas-circle-notch',
    'i-fas-circle-notch-return': 'i-fas-circle-notch',
    'i-carbon-circle-dash-function': 'i-carbon-circle-dash',
    'i-carbon-circle-dash-string': 'i-carbon-circle-dash',
    'i-carbon-circle-dash-return': 'i-carbon-circle-dash',
  },
  // 字体已本地化（web/public/fonts + style.css 的 @font-face），
  // 不再使用 presetWebFonts 在构建期访问 Google Fonts。
  theme: {
    fontFamily: {
      sans: "'DM Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      mono: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      safelist: [
        'i-fas-ban',
        'i-fas-user-slash',
        'i-fas-leaf',
        'i-fas-crown',
        'i-fas-circle',
        'i-fas-circle-notch',
      ],
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
        fas: () => import('@iconify-json/fa-solid/icons.json').then(i => i.default),
        // 别名：代码里有 menu.ts / Pet.vue / Activity.vue 使用 i-fa-solid-paw 这类写法，
        // 只注册 fas 前缀时这些类不会生成任何 CSS，图标会静默消失。
        'fa-solid': () => import('@iconify-json/fa-solid/icons.json').then(i => i.default),
        fab: () => import('@iconify-json/fa-brands/icons.json').then(i => i.default),
        'svg-spinners': () => import('@iconify-json/svg-spinners/icons.json').then(i => i.default),
      },
    }),
  ],
})
