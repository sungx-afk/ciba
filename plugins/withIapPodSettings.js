const { withPodfile } = require('expo/config-plugins');

const MARKER = '# iap-pod-swift-concurrency-fix';

/**
 * 给内购相关的 pod 放宽 Swift 并发检查。
 *
 * 背景：expo-iap 的 Apple 依赖 openiap 在 Xcode 15.3+ 下会编译失败：
 *   OpenIapStore.swift:61:17: error: reference to captured var 'self' in concurrently-executing code
 * 这是严格并发检查（SWIFT_STRICT_CONCURRENCY=complete）把弱引用的 self 捕获判为错误，
 * 属于三方库代码，改不了源码，因此只把 openiap / ExpoIap 这两个 target 降到 minimal，
 * 工程里其它 pod 的设置保持不变。
 */
module.exports = function withIapPodSettings(config) {
  return withPodfile(config, (conf) => {
    if (conf.modResults.contents.includes(MARKER)) return conf;

    conf.modResults.contents += `
${MARKER}
post_install do |installer|
  installer.pods_project.targets.each do |target|
    next unless ['openiap', 'ExpoIap'].include?(target.name)
    target.build_configurations.each do |build_configuration|
      build_configuration.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
    end
  end
end
`;
    return conf;
  });
};
