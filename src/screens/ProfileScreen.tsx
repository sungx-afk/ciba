import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

interface ProfileScreenProps {
  navigation: any;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user: authUser, isLoggedIn: authLoggedIn, logout: authLogout } = useAuth();
  const { state, stats, updateSettings, resetProgress, exportProgressData, user: progressUser, isLoggedIn: progressLoggedIn, logout: progressLogout, currentPack, wordSource, currentTopPack, readRememberedTopPack } = useProgress();

  const user = authUser || progressUser;
  const isLoggedIn = authLoggedIn || progressLoggedIn;

  const [logoutVisible, setLogoutVisible] = useState(false);

  // 当前使用的词库: 与首页顶部「我的卡组」共用同一份 currentTopPack
  const [rememberedPackName, setRememberedPackName] = useState<string | null>(null);

  // 还没进过首页时 currentTopPack 为空，先用本地记住的卡组名占位
  useEffect(() => {
    let alive = true;
    (async () => {
      const remembered = await readRememberedTopPack();
      if (alive) setRememberedPackName(remembered?.name || null);
    })();
    return () => {
      alive = false;
    };
  }, [readRememberedTopPack, currentTopPack?.id]);

  const activePackName =
    currentTopPack?.name || rememberedPackName || currentPack?.name || '本地词库 (TOEFL 意群)';

  // 手机号脱敏
  const maskMobile = (m?: string) => {
    if (!m) return '';
    return m.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  };

  const handleGoalChange = (newGoal: number) => {
    updateSettings({ dailyGoal: newGoal });
  };

  const handleAccentChange = (accent: 'en-US' | 'en-GB') => {
    updateSettings({ accent });
  };

  const handleToggleAutoPronounce = (value: boolean) => {
    updateSettings({ autoPronounce: value });
  };

  const handleExport = async () => {
    try {
      const data = exportProgressData();
      await Share.share({
        title: '糍粑英语学习备份',
        message: data,
      });
    } catch (err) {
      console.warn(err);
    }
  };

  const handleReset = () => {
    Alert.alert(
      '清空学习记录',
      '确定要清除所有词汇的学习进度与生词本记录吗？此操作不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定清空',
          style: 'destructive',
          onPress: () => resetProgress(),
        },
      ]
    );
  };

  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    try {
      await authLogout();
    } catch (_) {}
    try {
      await progressLogout();
    } catch (_) {}
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="我的" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 用户概览卡片 */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name={isLoggedIn ? 'person' : 'log-in-outline'} size={32} color={Colors.primary} />
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {isLoggedIn ? user?.nickname || user?.loginName || maskMobile(user?.mobile) || '糍粑学员' : '未登录'}
              </Text>
              {isLoggedIn && (
                <TouchableOpacity
                  style={styles.vipButton}
                  onPress={() => navigation.navigate('Purchase')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="diamond-outline" size={12} color={Colors.primary} />
                  <Text style={styles.vipButtonText}>{user?.vip ? '尊享会员' : '升级会员'}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.userSub}>
              {isLoggedIn
                ? (user?.mobile ? maskMobile(user.mobile) : user?.email || (user?.vip ? '尊享会员用户' : '学员用户'))
                : '登录后可同步词书与多端学习进度'}
            </Text>
          </View>
          {isLoggedIn ? (
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="log-out-outline" size={18} color={Colors.pinwheelRed} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBtnSmall}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.loginBtnSmallText}>登录</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 词库切换 */}
        <TouchableOpacity
          style={[styles.sectionCard, styles.rowCard]}
          onPress={() => navigation.navigate('BookSelect')}
          activeOpacity={0.7}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="library-outline" size={20} color={Colors.primary} />
            <View style={styles.packInfo}>
              <Text style={styles.actionLabel}>切换词库</Text>
              <Text style={styles.settingDesc} numberOfLines={1}>
                当前: {activePackName}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* 学习总览 */}
        <View style={styles.statsCard}>
          <Text style={styles.cardHeaderTitle}>学习统计</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats.streakDays}</Text>
              <Text style={styles.statLbl}>连续打卡(天)</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats.masteredCount}</Text>
              <Text style={styles.statLbl}>已掌握单词</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats.learningCount}</Text>
              <Text style={styles.statLbl}>正在学习</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats.totalWords}</Text>
              <Text style={styles.statLbl}>词库总容量</Text>
            </View>
          </View>
        </View>

        {/* 每日学习目标 */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>每日新词目标</Text>
          <View style={styles.goalRow}>
            {[10, 20, 30, 50].map((goal) => {
              const isSelected = state.dailyGoal === goal;
              return (
                <TouchableOpacity
                  key={goal}
                  style={[styles.goalChip, isSelected && styles.goalChipActive]}
                  onPress={() => handleGoalChange(goal)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.goalChipText, isSelected && styles.goalChipTextActive]}>
                    {goal} 词
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 发音设置 */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>发音与朗读</Text>

          {/* 口音 */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>口音类型</Text>
            <View style={styles.accentToggle}>
              <TouchableOpacity
                style={[styles.accentOption, state.accent === 'en-US' && styles.accentOptionActive]}
                onPress={() => handleAccentChange('en-US')}
              >
                <Text
                  style={[styles.accentText, state.accent === 'en-US' && styles.accentTextActive]}
                >
                  美音 (US)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accentOption, state.accent === 'en-GB' && styles.accentOptionActive]}
                onPress={() => handleAccentChange('en-GB')}
              >
                <Text
                  style={[styles.accentText, state.accent === 'en-GB' && styles.accentTextActive]}
                >
                  英音 (UK)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 自动朗读 */}
          <View style={[styles.settingRow, styles.borderTop]}>
            <View>
              <Text style={styles.settingLabel}>进入新词自动朗读</Text>
              <Text style={styles.settingDesc}>切换卡片时自动播放发音</Text>
            </View>
            <Switch
              value={state.autoPronounce}
              onValueChange={handleToggleAutoPronounce}
              trackColor={{ false: Colors.divider, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 数据与存储 */}
        {/* <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>数据与隐私</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleExport} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionLabel}>导出与备份学习记录</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, styles.borderTop]}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="trash-outline" size={20} color={Colors.pinwheelRed} />
              <Text style={[styles.actionLabel, { color: Colors.pinwheelRed }]}>
                清空全部学习记录
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View> */}

        {/* 关于 */}
        <View style={styles.aboutFooter}>
          <Text style={styles.aboutText}>糍粑英语 · CibaEnglish v1.0.0</Text>
          <Text style={styles.aboutSub}> 纯粹的分类单词记忆工具</Text>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={logoutVisible}
        title="退出登录"
        message="确定要退出登录吗？"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  vipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  vipButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginLeft: 2,
  },
  userSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  logoutBtn: {
    padding: 8,
  },
  loginBtnSmall: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  loginBtnSmallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  statLbl: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  goalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  goalChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.divider,
    alignItems: 'center',
  },
  goalChipActive: {
    backgroundColor: Colors.primary,
  },
  goalChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  goalChipTextActive: {
    color: '#FFFFFF',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  borderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
    marginTop: 8,
    paddingTop: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  settingDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  accentToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.divider,
    borderRadius: 8,
    padding: 3,
  },
  accentOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  accentOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  accentText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  accentTextActive: {
    color: Colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  packInfo: {
    flex: 1,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  aboutFooter: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  aboutText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  aboutSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
});