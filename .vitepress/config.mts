import { defineConfig } from 'vitepress'

// The FabricPvZ organisation, the only external site this documentation links to.
const GITHUB_ORG = 'https://github.com/FabricPvZ'

// One chapter list per language, in the order of the outline: they are the sidebar, the nav's
// "guide" dropdown and the prev/next links all at once, so a chapter cannot be half-added.
// The two lists must stay in step: every Chinese page has an English one at /en/ + the same path.
const zhChapters: [string, string][] = [
  ['/guide/index', '开始'],
  ['/guide/structure', '项目结构'],
  ['/guide/mixin', '实验 Mixin'],
  ['/guide/content', '植物与僵尸'],
  ['/guide/resources', '资源与美术'],
  ['/guide/events', '事件与生命周期'],
  ['/guide/content-mod', '实例精读：pvz-content-mod'],
  ['/guide/build', '构建、测试与发布'],
  ['/guide/reference', 'API 速查']
]

const enChapters: [string, string][] = [
  ['/en/guide/index', 'Getting started'],
  ['/en/guide/structure', 'Project structure'],
  ['/en/guide/mixin', 'Mixin experiments'],
  ['/en/guide/content', 'Plants and zombies'],
  ['/en/guide/resources', 'Resources and art'],
  ['/en/guide/events', 'Events and lifecycle'],
  ['/en/guide/content-mod', 'Walkthrough: pvz-content-mod'],
  ['/en/guide/build', 'Building, testing, publishing'],
  ['/en/guide/reference', 'API reference']
]

const items = (chapters: [string, string][]) => chapters.map(([link, text]) => ({ text, link }))

const zhSidebarItems = [{ text: '模组开发', items: items(zhChapters) }]
const enSidebarItems = [{ text: 'Mod development', items: items(enChapters) }]

export default defineConfig({
  // The site root is this directory (docs/); pages are plain Markdown files next to this config.
  srcDir: '.',
  // Pages are emitted as `<path>.html`, which is what a plain static server serves. That is also why
  // every `link:` below is written with the `.html` suffix by hand: frontmatter and nav/sidebar links
  // are not rewritten, only Markdown links inside a page are.
  cleanUrls: false,

  // The site exists once per language: the root locale is Simplified Chinese (the default) and `en/`
  // is English. Both locales carry the same chapters under the same file names, so a page and its
  // translation differ only by the `en/` prefix - which is what makes the language switcher land on
  // the reader's page instead of the other language's home page.
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: '植物大战僵尸移植 · 模组开发',
      description:
        '面向模组作者的文档:从零写一个模组、用 Mixin 改写游戏、用 fabric-api 加植物/僵尸与改资源,并以 pvz-content-mod 为实例精读',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '模组开发', items: items(zhChapters) },
          { text: 'API 速查', link: '/guide/reference.html' },
          { text: 'GitHub', link: GITHUB_ORG }
        ],
        sidebar: {
          '/guide/': zhSidebarItems,
          // The home page and anything outside the guide: the same chapter list, so no page is a dead end.
          '/': [{ text: '模组开发', items: items(zhChapters) }]
        },
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '目录',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        externalLinkIcon: true
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: 'PvZ-Portable · Mod Development',
      description:
        'For mod authors: write a mod from scratch, rewrite the game with Mixin, add plants, zombies and resources through fabric-api, and read pvz-content-mod end to end',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Mod development', items: items(enChapters) },
          { text: 'API reference', link: '/en/guide/reference.html' },
          { text: 'GitHub', link: GITHUB_ORG }
        ],
        sidebar: {
          '/en/guide/': enSidebarItems,
          '/en/': [{ text: 'Mod development', items: items(enChapters) }]
        },
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        returnToTopLabel: 'Return to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        langMenuLabel: 'Change language',
        externalLinkIcon: true
      }
    }
  },

  // Shared by both locales: the organisation link, the navbar search (VitePress' own local provider,
  // which needs no service) and its two sets of labels.
  // `lastUpdated` is deliberately not enabled: the workspace root is not a git repository, so VitePress
  // has no per-file history to read and the label would never appear.
  themeConfig: {
    socialLinks: [{ icon: 'github', link: GITHUB_ORG }],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '清除查询',
                backButtonTitle: '返回',
                noResultsText: '没有找到结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc'
                }
              }
            }
          },
          en: {
            translations: {
              button: { buttonText: 'Search', buttonAriaLabel: 'Search the documentation' }
            }
          }
        }
      }
    }
  }
})
