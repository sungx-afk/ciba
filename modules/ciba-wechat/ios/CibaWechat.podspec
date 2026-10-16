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
  s.dependency 'WechatOpenSDK-XCFramework', '>= 2.0.4'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.preserve_paths = 'ios/**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
