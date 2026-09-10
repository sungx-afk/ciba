# 糍粑英语 · CibaEnglish

按意群分类记忆 TOEFL 词汇的跨平台移动端应用。基于 **React Native + Expo + EAS** 构建。

- **4,123 托福核心高频词**：包含意群分类、词根助记、释义与真题例句。
- **艾宾浩斯间隔复习算法 (SRS)**：智能调度记忆曲线，按 稍后重来 · 1天(困难) · 3天(一般) · 7天(容易) 动态推算下次复习时间。
- **沉浸式闪卡**：卡片翻转、音标朗读（英音/美音）、生词本标记。
- **纯本地数据私密存储**：无账号、无广告、纯离线运行。
- **免本地 Xcode**：支持浏览器 Web 端直接开发预览，支持通过 EAS (Expo Application Services) 云端一键打出 iOS (.ipa) 与 Android (.apk)。

---

## 项目结构

```
ciba/
├── src/
│   ├── assets/              # Logo、风车图标、App 图标
│   ├── data/
│   │   └── words.json       # 4,123 词托福词库完整数据库
│   ├── types/
│   │   └── index.ts         # 单词、进度模型、统计类型定义
│   ├── theme/
│   │   └── colors.ts        # 糍粑设计系统（琥珀橙、米白底、风车四色分类）
│   ├── storage/
│   │   └── progressStore.tsx# AsyncStorage 持久化与艾宾浩斯复习调度算法
│   ├── navigation/
│   │   └── RootNavigator.tsx# 底部 3 大 Tab + 页面路由栈
│   ├── screens/
│   │   ├── HomeScreen.tsx   # 今日学习看板 + 34 个大类意群列表
│   │   ├── WordListScreen.tsx # 意群单词列表 + 即时中英文搜索筛选
│   │   ├── FlashcardScreen.tsx# 核心闪卡背词界面（翻转、发音、4档打分）
│   │   ├── BookmarksScreen.tsx# 生词本
│   │   └── ProfileScreen.tsx  # 学习统计、目标设置、发音偏好、数据导出
│   └── components/
│       ├── WordCard.tsx     # 单词卡片组件
│       ├── Header.tsx       # 统一样式原生导航头
│       └── ProgressBar.tsx  # 细致圆角进度条
├── app.json                 # Expo 应用元数据（Bundle ID、图标、权限等）
├── eas.json                 # EAS 云端打包 Profile 配置
├── package.json             # 依赖管理
└── tsconfig.json            # TypeScript 配置文件
```

---

## 本地快速开发与预览

> 本机只需要 Node.js (推荐 v18 或 v20)，**无需安装任何 Xcode**！

```bash
# 1. 启动 Web 调试（在浏览器直接体验 App 全部功能）
npm run web

# 2. 或者启动 Expo 开发服务器（可通过 Expo Go App 扫码在真机运行）
npm start
```

---

## 云端全自动打包 (EAS Build)

借助 Expo 官方的 EAS (Expo Application Services)，你可以在**无需本地 Mac、无需本地 Xcode** 的情况下，由 Expo 云端服务器自动构建打包：

### 1. 安装与登录 EAS CLI

```bash
npm install -g eas-cli
eas login
```

### 2. 云端构建

- **iOS 构建**（生成用于测试侧载或模拟器的 `.ipa`）：
  ```bash
  eas build --platform ios --profile preview
  ```
- **Android 构建**（生成可直接安装的 `.apk`）：
  ```bash
  eas build --platform android --profile preview
  ```
- **双端同时构建**：
  ```bash
  eas build --platform all --profile preview
  ```

构建完成后，EAS 会直接在终端提供下载链接，点击即可下载安装包。
