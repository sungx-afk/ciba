import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress, categoryList, allWords } from '../storage/progressStore';
import { Colors, getCategoryColor } from '../theme/colors';
import { ProgressBar } from '../components/ProgressBar';

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { stats, state } = useProgress();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // 计算某个大类的已掌握词数
  const getCategoryMasteredCount = (catName: string): number => {
    let count = 0;
    for (const id in state.progressMap) {
      const p = state.progressMap[id];
      if (p.status === 'mastered') {
        const w = allWords.find(item => item.id === Number(id));
        if (w && w.cat === catName) {
          count++;
        }
      }
    }
    return count;
  };

  const todayGoalProgress = Math.min(1, stats.todayLearnedCount / (stats.dailyGoal || 20));

  const handleStartStudy = (category?: string, subCategory?: string) => {
    navigation.navigate('Flashcard', { category, subCategory });
  };

  const handleOpenWordList = (category: string, subCategory?: string) => {
    navigation.navigate('WordList', { category, subCategory });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      {/* 顶部标题栏 */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../assets/pinwheel.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brandTitle}>糍粑英语</Text>
            <Text style={styles.brandSubtitle}>TOEFL 意群词汇记忆</Text>
          </View>
        </View>

        {/* 连续打卡徽章 */}
        <View style={styles.streakBadge}>
          <Ionicons name="flame" size={16} color={Colors.pinwheelRed} />
          <Text style={styles.streakText}>{stats.streakDays} 天</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 今日学习看板卡片 */}
        <View style={styles.dashboardCard}>
          <View style={styles.dashHeader}>
            <View>
              <Text style={styles.dashTitle}>今日学习</Text>
              <Text style={styles.dashSubtitle}>
                已学 {stats.todayLearnedCount} / 目标 {stats.dailyGoal} 词
              </Text>
            </View>
            <View style={styles.dashGoalPercent}>
              <Text style={styles.dashPercentText}>
                {Math.round(todayGoalProgress * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.dashProgressTrack}>
            <ProgressBar progress={todayGoalProgress} height={8} color={Colors.primary} />
          </View>

          <View style={styles.dashMetricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricNumber}>{stats.dueTodayCount}</Text>
              <Text style={styles.metricLabel}>待复习</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricNumber}>{stats.masteredCount}</Text>
              <Text style={styles.metricLabel}>已掌握</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricNumber}>{stats.totalWords}</Text>
              <Text style={styles.metricLabel}>词库总数</Text>
            </View>
          </View>

          {/* 快捷学习操作按钮 */}
          <View style={styles.dashActionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.primaryBtn]}
              onPress={() => handleStartStudy()}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>开始背词</Text>
            </TouchableOpacity>

            {stats.dueTodayCount > 0 ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.reviewBtn]}
                onPress={() => navigation.navigate('Flashcard', { onlyDue: true })}
                activeOpacity={0.8}
              >
                <Ionicons name="repeat" size={18} color={Colors.primary} />
                <Text style={styles.reviewBtnText}>复习待办 ({stats.dueTodayCount})</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* 词库大类列表 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>分类意群（{categoryList.length} 大类）</Text>
          <Text style={styles.sectionHint}>按学科意群记忆更高效</Text>
        </View>

        {categoryList.map((category) => {
          const isExpanded = expandedCategory === category.name;
          const catColor = getCategoryColor(category.name);
          const masteredCount = getCategoryMasteredCount(category.name);
          const progress = category.wordCount > 0 ? masteredCount / category.wordCount : 0;

          return (
            <View key={category.name} style={styles.categoryCard}>
              <TouchableOpacity
                style={styles.categoryHeaderRow}
                onPress={() => setExpandedCategory(isExpanded ? null : category.name)}
                activeOpacity={0.7}
              >
                <View style={styles.catTitleLeft}>
                  <View style={[styles.catColorDot, { backgroundColor: catColor }]} />
                  <Text style={styles.catName}>{category.name}</Text>
                  <Text style={styles.catWordCount}>（{category.wordCount} 词）</Text>
                </View>

                <View style={styles.catHeaderRight}>
                  <Text style={styles.catProgressRatio}>
                    {masteredCount}/{category.wordCount}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* 大类进度条 */}
              <View style={styles.catProgressBarWrap}>
                <ProgressBar progress={progress} height={4} color={catColor} />
              </View>

              {/* 展开后的意群与操作 */}
              {isExpanded ? (
                <View style={styles.expandedContent}>
                  <View style={styles.subCatGrid}>
                    {category.subCategories.map((sub) => (
                      <TouchableOpacity
                        key={sub.name}
                        style={styles.subCatChip}
                        onPress={() => handleOpenWordList(category.name, sub.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.subCatName}>{sub.name || '核心意群'}</Text>
                        <Text style={styles.subCatCount}>{sub.wordCount}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.categoryActions}>
                    <TouchableOpacity
                      style={styles.catActionOutlineBtn}
                      onPress={() => handleOpenWordList(category.name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="list-outline" size={16} color={Colors.textPrimary} />
                      <Text style={styles.catActionOutlineText}>查看全部单词</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.catActionPrimaryBtn, { backgroundColor: catColor }]}
                      onPress={() => handleStartStudy(category.name)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={16} color="#FFFFFF" />
                      <Text style={styles.catActionPrimaryText}>学习此分类</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 38,
    height: 38,
    marginRight: 10,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.pinwheelRed + '15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.pinwheelRed,
    marginLeft: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  dashboardCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    margin: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  dashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dashSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dashGoalPercent: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dashPercentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  dashProgressTrack: {
    marginTop: 14,
  },
  dashMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.divider,
  },
  dashActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewBtn: {
    backgroundColor: Colors.primaryLight,
  },
  reviewBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  catName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  catWordCount: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  catHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catProgressRatio: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  catProgressBarWrap: {
    marginTop: 10,
  },
  expandedContent: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  subCatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.divider,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  subCatName: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  subCatCount: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  catActionOutlineBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  catActionOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  catActionPrimaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  catActionPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
