import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useProgress } from '../storage/progressStore';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, isLoggedIn, logout } = useAuth();
  const { state, stats, updateSettings, resetProgress, exportProgressData } = useProgress();

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
    Alert.alert('退出登录', '确定要退出当前账号吗？您的本地词库数据仍将保留。', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出登录',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="我的 / 设置" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 用户概览卡片 */}
        <TouchableOpacity
          style={styles.userCard}
          onPress={() => {
            if (!isLoggedIn) {
              navigation.navigate('Login');
            } else {
              Alert.alert(
                '账户信息',
                `用户：${user?.nickname || '糍粑学员'}\n手机：${user?.mobile || '未绑定'}\n邮箱：${user?.email || '未绑定'}`
              );
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.avatarCircle}>
            <Ionicons
              name={isLoggedIn ? 'person' : 'person-outline'}
              size={30}
              color={isLoggedIn ? Colors.primary : Colors.textMuted}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {isLoggedIn ? (user?.nickname || user?.mobile || user?.email || '糍粑学者') : '点击登录 / 注册'}
            </Text>
            <Text style={styles.userSub}>
              {isLoggedIn
                ? (user?.vip ? '👑 鱼骨尊享会员' : '已登录 · 云端学习记录实时同步')
                : '登录后开启跨设备词库同步与生词本云备份'}
            </Text>
          </View>
          <View style={styles.userActionRight}>
            {!isLoggedIn ? (
              <View style={styles.loginBadge}>
                <Text style={styles.loginBadgeText}>去登录</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            )}
          </View>
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

        {/* 账户安全 */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>账户与安全</Text>

          {isLoggedIn ? (
            <>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('ChangePassword')}
                activeOpacity={0.7}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="key-outline" size={20} color={Colors.primary} />
                  <Text style={styles.actionLabel}>修改登录密码</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, styles.borderTop]}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
                  <Text style={[styles.actionLabel, { color: Colors.textSecondary }]}>
                    退出登录
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <Ionicons name="log-in-outline" size={20} color={Colors.primary} />
                <Text style={[styles.actionLabel, { color: Colors.primary, fontWeight: '600' }]}>
                  登录 / 注册糍粑账号
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* 数据与存储 */}
        <View style={styles.sectionCard}>
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
        </View>

        {/* 关于 */}
        <View style={styles.aboutFooter}>
          <Text style={styles.aboutText}>糍粑英语 · CibaEnglish v1.0.0</Text>
          <Text style={styles.aboutSub}>科学意群背词 · 词根词缀互联 · 云端多端同步</Text>
        </View>
      </ScrollView>
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
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  userSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  userActionRight: {
    marginLeft: 8,
  },
  loginBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F6D9B6',
  },
  loginBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
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
