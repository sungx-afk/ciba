# 糍粑英语 · CibaEnglish

按意群分类记忆 TOEFL 词汇的 iPhone 应用（UIKit + Storyboard，无 SwiftUI）。

## 项目结构

```
CibaEnglish.xcodeproj          ← Xcode 工程（由 project.yml 生成，xcodegen generate）
project.yml                  ← XcodeGen 工程描述
tools/
  export_words.py            ← xlsx → words.json 转换器（含数据校验）
  make_icon.py               ← AppIcon / LaunchLogo 生成（python3 tools/make_icon.py）
  pinwheel.png               ← 品牌风车（原 logo 抠底透明版，唯一的图形素材）
CibaEnglish/
  Storyboards/
    Main.storyboard          ← 启动即 TabBar(分类/生词本/我) + 3 个导航容器
    LaunchScreen.storyboard  ← 启动页（米白 + 风车 + 糍粑英语）
  Data/words.json            ← 4 123 词数据库（词义/意群/记忆法/例句）
  App/                       ← AppDelegate / SceneDelegate / AppConfig / 扩展
  Models/                    ← Word、进度(WordProgress)、调度(间隔算法)、分类模型
  Services/                  ← 词库加载、进度持久化、学习引擎、发音、提醒、会员(IAP)、评分
  Views/                     ← 设计系统 Theme + 通用控件 + 单元格
  Controllers/
    Root/                    ← 分类 / 生词本 / 我（三个 Tab）
    Flow/                    ← 选词库 → 意群 → 词表 → 详情 → 闪卡学习 → 结果
    Secondary/               ← 个人资料 / 会员中心 / 学习设置 / 学习提醒 / 反馈 / 关于 / 协议
  Resources/                 ← Assets(图标/强调色) + 隐私政策/用户协议 HTML
CibaEnglishTests/              ← 35 个单元测试（数据 / 调度 / 引擎 / 进度持久化）
CibaEnglishUITests/            ← UI 冒烟 + 截图巡览测试
DesignPreview/               ← 关键页面渲染截图（跑测试自动生成）
```

## 打开与构建

```bash
xcodegen generate            # 需要 XcodeGen（brew install xcodegen）
open CibaEnglish.xcodeproj     # Xcode 16+，iOS 16.0+，iPhone 竖屏
```

命令行验证：

```bash
xcodebuild -project CibaEnglish.xcodeproj -scheme CibaEnglish \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath build test
```

## 功能一览

1. 词库：内置《TOEFL》4 123 词（34 个大类 / 180+ 意群，与 xlsx 一一对应）。其他词库卡片展示为“敬请期待”，不发布空数据。
2. 分类：顶部「今日学习」卡（进度环 / 已学·目标 / 待复习 / 连续天数）；大类列表带识别色圆点与进度条（已掌握 x / 总数），可切 未记住/已记住/全部；大类下再按意群细分，可搜单词/释义。
3. 学习：闪卡先看词、点击显示释义/词根/例句，然后按 稍后重来 · 1天(困难) · 3天(一般) · 7天(容易) 选择间隔，数据即时写入本地。
4. 复习调度：已掌握单词到期自动进入“今日复习”；生词本（书签收藏）；连续天数统计；本地每日提醒（默认 20:00，本地通知）。
5. 发音：英/美两种口音（AVSpeechSynthesizer），可调语速、自动朗读开关。
6. 我 / 设置：本地个人资料（昵称+头像色）、会员中心（StoreKit 2，含恢复购买；未配置商品时按 `plannedPlans` 照常展示价目而非报错）、每日目标、学习设置、导出学习记录 CSV、清空学习记录、反馈（应用内邮件）、评分、隐私政策/用户协议（内置 HTML）。
7. 数据私密：全部学习数据只存本机 Library/progress.json，无账号、无广告、无第三方 SDK。
8. 会员页：先讲权益再报价，三档并列、已折算「每月多少钱」、年付带原价划线与「省 35%」角标。

## 上架前必改（占位配置）

集中在 [CibaEnglish/App/AppConfig.swift](file:///Users/gpro/Documents/english-learn/deepseek/CibaEnglish/CibaEnglish/App/AppConfig.swift)：

| 项 | 现值 | 说明 |
|---|---|---|
| PRODUCT_BUNDLE_IDENTIFIER | com.cibaenglish.app | project.yml 中改为你的 Bundle ID |
| supportEmail | support@cibaenglish.example | 反馈收件邮箱 |
| appStoreAppID | 1234567890 | 建好 App Store Connect 记录后替换 |
| membershipProductIDs | .monthly / .quarterly / .yearly | 三档订阅；未配置时会员页自动退回 `plannedPlans` 展示 |
| plannedPlans | ¥10 / ¥25 / ¥78 | 占位价目表与「省 35%」角标，须与 App Store Connect 保持一致 |
| Signing & Team | CODE_SIGNING_ALLOWED=NO | 真机/上架需在 Xcode 选择你的 Team |

另：项目默认 `CODE_SIGN_STYLE: Automatic` + `CODE_SIGNING_ALLOWED: NO`（便于无证书构建）；上架前在 Xcode 中关闭该覆盖并选择签名 Team。词汇释义整理自公开学习资料，上架前请自行确认数据授权合规。

## 设计说明

配色全部取自 logo 的四叶风车，集中定义在
[Views/Components/Theme.swift](CibaEnglish/Views/Components/Theme.swift)，改一处即全局生效。

| 角色 | 色值 | 用在哪 |
|---|---|---|
| 主色 | `#E8890F` 琥珀 | 按钮、开关、进度环、选中态 |
| 背景 | `#FDFAF4` 米白 | 所有页面底色 |
| 分类色 | `#F4C225` / `#7CAE1C` / `#588CFC` / `#F95452` | 分类圆点与进度条（风车四叶） |
| 会员色 | `#342A1C` 深褐 + `#E9A81B` 金 | 只出现在会员卡与会员中心 |
| 强调 | `#F95452` 红 | 连续天数、「省 35%」角标 |

几条自己给自己定的规矩：

- **金色只给会员**。主色是暖橙，如果会员页也用橙色，付费页就和普通页面长得一样；深褐＋金是全 App 唯一一处深色，让它一眼是另一档东西。
- **分类色只画点和进度条，不写字**。风车的绿和黄在正文字号下对比度不够。
- **分类颜色由名称推导**（`Theme.categoryColor(for:)`），刻意没用 `hashValue`——Swift 每次进程都会换种子，那样分类每次启动都换色。
- 分类色只是识别用的记号，不带含义；深浅一致，不构成排序。

其余：故事板只负责骨架（启动屏 + 主导航），页面全部 Auto Layout 代码构建；
`python3 tools/export_words.py` 可重新生成 words.json（带完整性校验）；
`python3 tools/make_icon.py` 可重新生成图标与启动页 logo。
