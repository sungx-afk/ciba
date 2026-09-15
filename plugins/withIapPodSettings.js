const { withPodfile } = require('expo/config-plugins');

const MARKER = 'iap-pod-swift-concurrency-fix';
const ANCHOR = 'post_install do |installer|';

/**
 * 给内购相关的 pod 放宽 Swift 并发检查。
 *
 * 背景：expo-iap 的 Apple 依赖 openiap 在 Xcode 15.3+ 下编译失败：
 *   OpenIapStore.swift:61:17: error: reference to captured var 'self' in concurrently-executing code
 * 这是并发检查把弱引用的 self 捕获判为错误，属于三方库代码改不了源码，
 * 因此只对 openiap / ExpoIap 两个 pod 设 SWIFT_STRICT_CONCURRENCY=minimal。
 *
 * 注意：CocoaPods 不允许出现多个 post_install 块
 * （Specifying multiple `post_install` hooks is unsupported），
 * 所以这里是把代码插进 Expo/RN 已经生成的那个 post_install 里。
 */
module.exports = function withIapPodSettings(config) {
  return withPodfile(config, (conf) => {
    const contents = conf.modResults.contents;
    if (contents.includes(MARKER)) return conf;

    const hook = `
  # ${MARKER}
  installer.pods_project.targets.each do |target|
    next unless ['openiap', 'ExpoIap'].include?(target.name)
    target.build_configurations.each do |build_configuration|
      build_configuration.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
    end
  end
`;

    const at = contents.indexOf(ANCHOR);
    if (at >= 0) {
      const insertAt = at + ANCHOR.length;
      conf.modResults.contents =
        contents.slice(0, insertAt) + hook + contents.slice(insertAt);
    } else {
      conf.modResults.contents = `${contents}\n${ANCHOR}\n${hook}\nend\n`;
    }
    return conf;
  });
};
