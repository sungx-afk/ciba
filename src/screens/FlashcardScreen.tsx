import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { Word } from '../types';
import { Colors, getCategoryColor } from '../theme/colors';
import { pronounceWord } from '../utils/speech';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';

interface FlashcardScreenProps {
  route: any;
  navigation: any;
}

export const FlashcardScreen: React.FC<FlashcardScreenProps> = ({ route, navigation }) => {
  const { category, subCategory, singleWordId, onlyDue, filter, wordIds, title } =
    route.params || {};
  const { state, stats, recordReview, toggleBookmark, words, todayWords, packWords } =
    useProgress();

  // 构建当前复习/学习单词队列
  const rawQueue: Word[] = useMemo(() => {
    // 今日学习单词 / 子卡组单词列表 (learn-by-menu 拉取的卡片)
    if (wordIds && wordIds.length) {
      const pool = new Map<number, Word>();
      for (const w of todayWords) pool.set(w.id, w);
      for (const w of packWords) {
        if (!pool.has(w.id)) pool.set(w.id, w);
      }
      for (const w of words) {
        if (!pool.has(w.id)) pool.set(w.id, w);
      }
      const ids: number[] = Array.isArray(wordIds) ? wordIds : [];
      const queue: Word[] = [];
      for (const id of ids) {
        const w = pool.get(id);
        if (w) queue.push(w);
      }
      return queue;
    }

    if (singleWordId) {
      const single =
        words.find((w) => w.id === singleWordId) ||
        todayWords.find((w) => w.id === singleWordId) ||
        packWords.find((w) => w.id === singleWordId);
      return single ? [single] : [];
    }

    const now = Date.now();

    return words.filter((w) => {
      if (category && w.cat !== category) return false;
      if (subCategory && w.sub !== subCategory) return false;

      const p = state.progressMap[w.id];

      if (onlyDue) {
        return p && p.nextReviewTime > 0 && p.nextReviewTime <= now;
      }

      if (filter === 'mastered') {
        return p?.status === 'mastered';
      }
      if (filter === 'unlearned') {
        return p?.status !== 'mastered';
      }
      if (filter === 'bookmarked') {
        return p?.isBookmarked;
      }

      return true;
    });
  }, [
    category,
    subCategory,
    singleWordId,
    onlyDue,
    filter,
    state.progressMap,
    words,
    todayWords,
    packWords,
    wordIds,
  ]);

  /**
   * 排序: 未记住(未掌握)的单词优先，已记住(已掌握)的单词放到最后。
   * 使用稳定排序，保证同组内维持原有顺序。
   */
  const orderedQueue: Word[] = useMemo(() => {
    const isMastered = (w: Word) => (state.progressMap[w.id]?.status === 'mastered' ? 1 : 0);
    return rawQueue
      .map((w, index) => ({ w, index, mastered: isMastered(w) }))
      .sort((a, b) => a.mastered - b.mastered || a.index - b.index)
      .map((item) => item.w);
  }, [rawQueue, state.progressMap]);

  /**
   * 会话队列: 进入页面时按「未记住优先」排定顺序后锁定，
   * 避免学习中评分导致队列重排、索引错乱或已学单词再次出现。
   */
  const lockedOrderRef = useRef<number[] | null>(null);
  const studyQueue: Word[] = useMemo(() => {
    if (!orderedQueue.length) return orderedQueue;
    if (!lockedOrderRef.current) {
      lockedOrderRef.current = orderedQueue.map((w) => w.id);
    }
    const byId = new Map(orderedQueue.map((w) => [w.id, w]));
    const list: Word[] = [];
    for (const id of lockedOrderRef.current) {
      const w = byId.get(id);
      if (w) list.push(w);
    }
    return list;
  }, [orderedQueue]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [learnedInSessionCount, setLearnedInSessionCount] = useState(0);
  // 底部操作栏高度，用于定位右下角浮动「已记住」按钮
  const [bottomBarHeight, setBottomBarHeight] = useState(84);

  const currentWord = studyQueue[currentIndex];
  const progressInfo = currentWord ? state.progressMap[currentWord.id] : undefined;
  const isBookmarked = progressInfo?.isBookmarked || false;

  // 切换到新词时，按设置自动发音
  useEffect(() => {
    if (currentWord && state.autoPronounce && !sessionCompleted) {
      pronounceWord(currentWord.word, {
        accent: state.accent,
        rate: state.speechRate,
      });
    }
  }, [currentIndex, sessionCompleted]);

  // 处理评分（remembered = 已记住，上报 type=4）
  const handleGrade = async (grade: 'again' | 'hard' | 'good' | 'easy' | 'remembered') => {
    if (!currentWord) return;

    await recordReview(currentWord.id, grade);
    setLearnedInSessionCount((prev) => prev + 1);

    if (currentIndex + 1 < studyQueue.length) {
      setShowAnswer(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  const handleManualPronounce = () => {
    if (currentWord) {
      pronounceWord(currentWord.word, {
        accent: state.accent,
        rate: state.speechRate,
      });
    }
  };

  if (!studyQueue.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="闪卡背词" onBack={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={64} color={Colors.success} />
          <Text style={styles.emptyTitle}>暂无待学习的单词</Text>
          <Text style={styles.emptySubtitle}>太棒了！当前分类下的单词已全部复习完毕</Text>
          <TouchableOpacity
            style={styles.returnBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.returnBtnText}>返回上一页</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 学习完成界面
  if (sessionCompleted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="学习成果" onBack={() => navigation.goBack()} />
        <View style={styles.completeWrap}>
          <View style={styles.trophyCircle}>
            <Ionicons name="trophy" size={56} color={Colors.gold} />
          </View>
          <Text style={styles.completeTitle}>恭喜完成本次学习！</Text>
          <Text style={styles.completeSubtitle}>
            本次共学习复习了 <Text style={styles.highlightText}>{learnedInSessionCount}</Text> 个单词
          </Text>

          <View style={styles.statsSummaryCard}>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>{state.streakDays}</Text>
              <Text style={styles.statLbl}>连续天数</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statVal}>{state.todayLearnedIds.length}</Text>
              <Text style={styles.statLbl}>今日已学</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statVal}>{stats.masteredCount}</Text>
              <Text style={styles.statLbl}>总掌握词</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>完成并返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const catColor = getCategoryColor(currentWord.cat);
  const queueProgress = (currentIndex + 1) / studyQueue.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      {/* 顶部导航与进度 */}
      <Header
        title={title || category || '背单词'}
        subtitle={`${currentIndex + 1} / ${studyQueue.length}`}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: isBookmarked ? 'bookmark' : 'bookmark-outline',
          onPress: () => toggleBookmark(currentWord.id),
        }}
      />

      <View style={styles.progressBarWrap}>
        <ProgressBar progress={queueProgress} height={4} color={Colors.primary} />
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
      >
        {/* 闪卡卡片主体 */}
        <TouchableOpacity
          style={styles.cardBox}
          activeOpacity={0.95}
          onPress={() => setShowAnswer(!showAnswer)}
        >
          {/* 标签栏 */}
          <View style={styles.cardHeaderRow}>
            <View style={[styles.catTag, { backgroundColor: catColor + '18' }]}>
              <View style={[styles.catDot, { backgroundColor: catColor }]} />
              <Text style={[styles.catText, { color: catColor }]} numberOfLines={1}>
                {currentWord.cat}
              </Text>
            </View>
            {currentWord.sub ? (
              <View style={styles.subTag}>
                <Text style={styles.subText} numberOfLines={1} ellipsizeMode="tail">
                  {currentWord.sub}
                </Text>
              </View>
            ) : null}

            {progressInfo?.status === 'mastered' ? (
              <View style={styles.statusTag}>
                <Text style={styles.statusText}>已掌握</Text>
              </View>
            ) : null}
          </View>

          {/* 核心单词大字 */}
          <View style={styles.wordCenter}>
            <Text style={styles.mainWordText}>{currentWord.word}</Text>
            <TouchableOpacity
              style={styles.soundButton}
              onPress={handleManualPronounce}
              activeOpacity={0.7}
            >
              <Ionicons name="volume-high" size={24} color={Colors.primary} />
              <Text style={styles.soundHint}>点击发音</Text>
            </TouchableOpacity>
          </View>

          {/* 翻转查看释义按钮或答案展开区 */}
          {!showAnswer ? (
            <View style={styles.tapToReveal}>
              <Ionicons name="eye-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.tapToRevealText}>点击卡片查看中文释义与助记</Text>
            </View>
          ) : (
            <View style={styles.answerSection}>
              <View style={styles.dividerLine} />

              {/* 中文释义 */}
              <View style={styles.meaningBox}>
                <Text style={styles.meaningLabel}>中文释义</Text>
                <Text style={styles.meaningContent}>{currentWord.meaning}</Text>
              </View>

              {/* 词根/助记/例句 */}
              {currentWord.note ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>助记与例句</Text>
                  <Text style={styles.noteContent}>{currentWord.note}</Text>
                </View>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 右下角浮动「已记住」按钮 (上报 type=4) */}
      <TouchableOpacity
        style={[styles.rememberFab, { bottom: bottomBarHeight + 16 }]}
        onPress={() => handleGrade('remembered')}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.rememberFabIcon}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
        </View>
        <Text style={styles.rememberFabText}>已记住</Text>
      </TouchableOpacity>

      {/* 底部记忆反馈按钮 */}
      <View
        style={styles.bottomBar}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setBottomBarHeight(h);
        }}
      >
        <View style={styles.gradeRow}>
        <TouchableOpacity
          style={[styles.gradeBtn, styles.gradeAgain]}
          onPress={() => handleGrade('again')}
          activeOpacity={0.8}
        >
          <Text style={[styles.gradeBtnTitle, { color: Colors.pinwheelRed }]}>重来</Text>
          <Text style={styles.gradeBtnSub}>&lt;10分钟</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gradeBtn, styles.gradeHard]}
          onPress={() => handleGrade('hard')}
          activeOpacity={0.8}
        >
          <Text style={[styles.gradeBtnTitle, { color: Colors.primary }]}>困难</Text>
          <Text style={styles.gradeBtnSub}>1天</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gradeBtn, styles.gradeGood]}
          onPress={() => handleGrade('good')}
          activeOpacity={0.8}
        >
          <Text style={[styles.gradeBtnTitle, { color: Colors.pinwheelBlue }]}>一般</Text>
          <Text style={styles.gradeBtnSub}>3天</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gradeBtn, styles.gradeEasy]}
          onPress={() => handleGrade('easy')}
          activeOpacity={0.8}
        >
          <Text style={[styles.gradeBtnTitle, { color: Colors.success }]}>容易</Text>
          <Text style={styles.gradeBtnSub}>7天</Text>
        </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressBarWrap: {
    width: '100%',
  },
  contentScroll: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    paddingBottom: 88,
    flexGrow: 1,
    justifyContent: 'center',
  },
  cardBox: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    minHeight: 380,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
    justifyContent: 'space-between',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
  },
  catTag: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  catText: {
    fontSize: 12,
    fontWeight: '700',
  },
  subTag: {
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: Colors.divider,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  subText: {
    flexShrink: 1,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statusTag: {
    marginLeft: 'auto',
    flexShrink: 0,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.success,
  },
  wordCenter: {
    alignItems: 'center',
    marginVertical: 30,
  },
  mainWordText: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  soundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  soundHint: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  tapToReveal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  tapToRevealText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  answerSection: {
    marginTop: 10,
  },
  dividerLine: {
    height: 1,
    backgroundColor: Colors.divider,
    marginBottom: 16,
  },
  meaningBox: {
    marginBottom: 16,
  },
  meaningLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  meaningContent: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  noteBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  noteContent: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  // 右下角浮动「已记住」(type=4)
  rememberFab: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 8,
    paddingRight: 18,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 7,
  },
  rememberFabIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  rememberFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gradeAgain: {
    backgroundColor: Colors.pinwheelRed + '12',
    borderColor: Colors.pinwheelRed + '30',
  },
  gradeHard: {
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary + '30',
  },
  gradeGood: {
    backgroundColor: Colors.pinwheelBlue + '12',
    borderColor: Colors.pinwheelBlue + '30',
  },
  gradeEasy: {
    backgroundColor: Colors.success + '12',
    borderColor: Colors.success + '30',
  },
  gradeBtnTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  gradeBtnSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  returnBtn: {
    marginTop: 24,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  returnBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  completeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  trophyCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.gold + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  completeSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  highlightText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  statsSummaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginVertical: 24,
    width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statCol: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLbl: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.divider,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
