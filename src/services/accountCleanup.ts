import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 注销账号时清空本机数据。
 *
 * 与 AuthContext.logout() / progressStore.logout() 的差别：
 * - 那两个只清内存，磁盘上的 scoped key 还留着，重新登录后旧数据会回流
 * - 本函数直接把磁盘上的数据也删除，注销必须彻底
 *
 * 清理范围：
 * - 4 个登录态 / 用户信息 key（@ciba_auth_token / @ciba_token / @ciba_user_info 两份）
 * - 当前账号作用域下的学习进度、当前词库、顶层卡组记忆（按 #userId 后缀）
 * - 兜底清理旧版未分账号时遗留的全局 key
 */
export async function clearLocalAccountData(
  accountId: string | number | null | undefined,
): Promise<void> {
  const id = accountId != null && accountId !== '' ? String(accountId) : '';
  const ACCOUNT_KEYS = [
    '@ciba_auth_token',
    '@ciba_token',
    '@ciba_user_info',
  ];
  const scopedKeys = [
    id ? `@ciba_progress_v1#${id}` : '@ciba_progress_v1',
    id ? `@ciba_current_pack#${id}` : '@ciba_current_pack',
    id ? `@ciba_selected_top_pack#${id}` : '@ciba_selected_top_pack',
  ];
  const legacyKeys = [
    '@ciba_progress_v1',
    '@ciba_current_pack',
    '@ciba_selected_top_pack',
  ];

  const allKeys = await AsyncStorage.getAllKeys();
  const targets = Array.from(
    new Set([...ACCOUNT_KEYS, ...scopedKeys, ...legacyKeys]),
  ).filter((k) => allKeys.includes(k));
  if (targets.length) {
    await AsyncStorage.multiRemove(targets);
  }
}