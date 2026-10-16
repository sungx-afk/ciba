Pod::Spec.new do |s|
  s.name           = 'CibaWechat'
  s.version        = '1.0.0'
  s.summary        = 'WeChat OpenSDK login for CibaEnglish'
  s.homepage       = 'https://cibaen.com'
  s.license        = 'MIT'
  s.author         = 'CibaEnglish'
  s.platforms      = { :ios => '13.0' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }

  s.dependency 'ExpoModulesCore'

  # 官方 XCFramework 版 SDK。必须为 2.0.4 及以上：
  # 老 SDK 内部使用系统已废弃的 openURL 接口，iOS 18+ / Xcode 16 打包会偶发拉不起微信。
  #
  # 这里锁定到 2.0.9 而非用 '>= 2.0.4'：
  # 1) SDK 各版本的 Swift API 有差异（如 sendReq 更名为 send），浮动解析会让原生代码的
  #    编译结果不可预期，必须固定；
  # 2) 该 pod 不是从 CocoaPods CDN 下载的，而是 curl 腾讯服务器 dldir1.qq.com 上的 zip，
  #    每次远端发布新版本都可能换 URL，锁版本可避免解析到下载源异常的版本。
  s.dependency 'WechatOpenSDK-XCFramework', '2.0.9'

  # podspec 位于 ios/ 目录内，与 Swift 源文件同级，
  # 路径必须相对 podspec 自身位置；写成 'ios/**' 会指向 ios/ios/** 从而匹配不到任何文件，
  # 导致 pod 虽安装成功却没有 Swift module，编译时报 Unable to find module dependency: 'CibaWechat'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.preserve_paths = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
