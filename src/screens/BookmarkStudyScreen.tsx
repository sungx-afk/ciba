import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useProgress } from '../storage/progressStore';
import { useAuth } from '../context/AuthContext';
import { Word } from '../types';
import { Colors, getCategoryColor } from '../theme/colors';
import { pronounceWord } from '../utils/speech';
import { showToast } from '../utils/toast';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog, DialogPayload } from '../components/ConfirmDialog';
import {
  fetchBookmarkedWords,
  BOOKMARK_PAGE_SIZE,
  reportBookmarkReview,
  BOOKMARK_REVIEW_TYPE,
  BookmarkGrade,
} from '../services/bookmarkApi';
import { AUTH_EXPIRED_RESULT } from '../services/api';
import { playRememberedSound } from '../utils/effectSound';
import { checkVipGate, clearVipGateCache } from '../services/vipGate';

/**
 * 生词本复习页（与「分类卡组背词页」相互独立）
 * - 从生词本列表点击第 N 个单词进入，队列从该词开始，可连续复习到列表末尾
 * - 列表每次只取 BOOKMARK_PAGE_SIZE(20) 个，剩余不足 PREFETCH_THRESHOLD 张时
 *   自动预取下一页，用户一直往后翻也不会断档
 * - 底部四个档位直接对应服务端 type：困难 0 / 一般 1 / 容易 3 / 已记住 4，
 *   只上报给生词本卡组，不走分类卡组的 SRS 记忆算法
 */

/** 队列剩余多少张卡片时开始预取下一页 */
const PREFETCH_THRESHOLD = 3;

interface BookmarkStudyScreenProps {
  route: any;
  navigation: any;
}

/** 按 id 去重合并，保留先出现的顺序（同 id 用新数据覆盖） */
function mergeWords(prev: Word[], next: Word[]): Word[] {
  if (!next.length) return prev;
  const map = new Map<number, Word>();
  prev.forEach((w) => map.set(w.id, w));
  next.forEach((w) => map.set(w.id, w));
  return Array.from(map.values());
}

export const BookmarkStudyScreen: React.FC<BookmarkStudyScreenProps> = ({ route, navigation }) => {
  const params = route.params || {};
  const { state, stats } = useProgress();
  // 会员状态与注册时间都来自用户信息
  const { user, refreshUserInfo } = useAuth();

  /** 列表页带过来的已加载生词（服务端第一页起） */
  const initialWords: Word[] = Array.isArray(params.words) ? params.words : [];
  const initialTotal: number = Number(params.total) || initialWords.length;
  /** 列表页当前 tab 的卡片状态过滤，翻页时要沿用，否则会从别的分组里接着取 */
  const initialTypes: number[] | undefined = Array.isArray(params.types)
    ? (params.types as number[])
    : undefined;
  const startIndex: number = Math.max(
    0,
    Math.min(Number(params.startIndex) || 0, Math.max(0, initialWords.length - 1))
  );

  // 会话队列：从点击的那张开始
  const [queue, setQueue] = useState<Word[]>(() =>
    initialWords.length ? initialWords.slice(startIndex) : []
  );
  const [total, setTotal] = useState(Math.max(initialTotal, initialWords.length));
  const [hasMore, setHasMore] = useState(
    initialWords.length === 0 || initialWords.length < Math.max(initialTotal, initialWords.length)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [grading, setGrading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  // 已经复习到最后一张、且下一页拉取失败：停在当前卡片等用户重试
  const [boundaryFailed, setBoundaryFailed] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [learnedInSessionCount, setLearnedInSessionCount] = useState(0);
  /** 被会员限制拦截下来的评分，开通会员后自动继续 */
  const pendingGradeRef = useRef<BookmarkGrade | null>(null);
  /** 需要升级会员时的提示文案（非空即弹窗） */
  const [vipGateMessage, setVipGateMessage] = useState<string | null>(null);
  /** 统一弹窗状态：确认/提示一律走 ConfirmDialog，不再使用系统 Alert */
  const [dialog, setDialog] = useState<DialogPayload | null>(null);

  // 逻辑用的可变引用：避免闭包里拿到过期的 state
  const queueRef = useRef<Word[]>(queue);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  const loadFailedRef = useRef(false);
  /** 下一次要从服务端拉取的偏移量（当前已加载的条数） */
  const nextStartRef = useRef(initialWords.length);

  /** 取下一页生词；返回是否真的往队列里追加了新卡片 */
  const loadMore = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current || !hasMoreRef.current) return false;

    loadingRef.current = true;
    loadFailedRef.current = false;
    setLoadingMore(true);
    setMoreError('');

    try {
      let added = false;

      // 极端情况（本地取消收藏导致偏移漂移）下整页可能都是重复卡片，
      // 顺延 start 再取，避免「明明还有更多却提前结束会话」
      for (let attempt = 0; attempt < 3 && !added; attempt += 1) {
        const start = nextStartRef.current;
        const page = await fetchBookmarkedWords({
          start,
          limit: BOOKMARK_PAGE_SIZE,
          types: initialTypes,
        });

        const before = queueRef.current;
        const merged = mergeWords(before, page.words);
        added = merged.length > before.length;

        queueRef.current = merged;
        setQueue(merged);
        setTotal(page.total);
        nextStartRef.current = start + page.words.length;

        if (page.words.length === 0) {
          hasMoreRef.current = false;
          setHasMore(false);
          break;
        }
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
        if (!page.hasMore) break;
      }

      return added;
    } catch (err: any) {
      loadFailedRef.current = true;
      setMoreError(
        err?.result === AUTH_EXPIRED_RESULT
          ? '登录后即可继续复习生词'
          : err?.message || '加载更多生词失败'
      );
      return false;
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  /**
   * 预取：当前卡片接近已加载末尾时提前拉下一页。
   * 队列为空（如深链进入）时从第一页开始加载。
   */
  useEffect(() => {
    if (sessionCompleted) return;

    if (!queue.length) {
      nextStartRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
      loadMore();
      return;
    }

    if (!hasMoreRef.current || loadingRef.current) return;
    if (currentIndex >= queue.length - PREFETCH_THRESHOLD) {
      loadMore();
    }
  }, [currentIndex, queue.length, sessionCompleted, loadMore]);

  const currentWord = queue[currentIndex];
  const progressInfo = currentWord ? state.progressMap[currentWord.id] : undefined;
  /** 在生词本中的绝对序号（用于「第 N / 总数」展示） */
  const absoluteIndex = startIndex + currentIndex;
  const displayTotal = Math.max(total, queue.length);
  const queueProgress = displayTotal > 0 ? (absoluteIndex + 1) / displayTotal : 0;

  // 切换到新词时按设置自动发音
  useEffect(() => {
    if (currentWord && state.autoPronounce && !sessionCompleted) {
      pronounceWord(currentWord.word, {
        accent: state.accent,
        rate: state.speechRate,
      });
    }
  }, [currentIndex, sessionCompleted]);

  const goNext = () => {
    setShowAnswer(false);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleGrade = async (grade: BookmarkGrade) => {
    if (!currentWord || grading) return;

    setGrading(true);
    setBoundaryFailed(false);
    try {
      // 只有「已记住」受免费额度限制，困难/一般/容易只是复习档位，不做拦截
      if (grade === 'remembered') {
        const gate = await checkVipGate({
          userVip: (user as any)?.vip,
          masteredCount: stats.masteredCount,
          createDate: (user as any)?.createDate,
        });
        if (gate.blocked) {
          pendingGradeRef.current = grade;
          setVipGateMessage(gate.message || '升级 VIP 会员后可继续使用');
          return;
        }
      }

      // 生词本复习独立上报：把档位对应的 type 报给生词本卡组
      await reportBookmarkReview(currentWord.id, BOOKMARK_REVIEW_TYPE[grade]);
      if (grade === 'remembered') playRememberedSound();
      setLearnedInSessionCount((prev) => prev + 1);

      // 队列里还有下一张
      if (currentIndex + 1 < queueRef.current.length) {
        goNext();
        return;
      }

      // 已到最后一张：还有更多就先拉一页再继续
      if (hasMoreRef.current) {
        const grew = await loadMore();
        if (grew) {
          goNext();
          return;
        }
        if (loadFailedRef.current) {
          setBoundaryFailed(true);
          return;
        }
      }

      setSessionCompleted(true);
    } catch (e: any) {
      setDialog({
        title: '保存失败',
        message: e?.message || '学习结果上报失败，请重试',
        showCancel: false,
      });
    } finally {
      setGrading(false);
    }
  };

  // 供「从会员页返回」时调用最新的 handleGrade
  const handleGradeRef = useRef(handleGrade);
  useEffect(() => {
    handleGradeRef.current = handleGrade;
  }, [handleGrade]);

  /**
   * 从会员页返回：先刷新用户信息与会员状态，
   * 已开通会员就自动继续刚才被拦截的「已记住」。
   */
  useFocusEffect(
    useCallback(() => {
      const pending = pendingGradeRef.current;
      if (!pending) return;
      (async () => {
        clearVipGateCache();
        try {
          await refreshUserInfo?.();
        } catch {
          // 刷新失败不阻断，下面仍会按最新接口结果判断
        }
        const gate = await checkVipGate({
          userVip: (user as any)?.vip,
          masteredCount: stats.masteredCount,
          createDate: (user as any)?.createDate,
        });
        if (gate.blocked) {
          // 没开通就丢弃待办：否则每次回到页面都会重复刷新并一直挂着这次操作
          pendingGradeRef.current = null;
          return;
        }
        pendingGradeRef.current = null;
        showToast('会员已开通，继续复习');
        handleGradeRef.current(pending);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, stats.masteredCount])
  );

  /** 拉取失败后重试：如果是因为卡在末尾失败，成功后自动翻到下一页 */
  const handleRetryMore = async () => {
    const wasBoundary = boundaryFailed;
    setBoundaryFailed(false);
    const grew = await loadMore();
    if (grew && wasBoundary && currentIndex + 1 < queueRef.current.length) {
      goNext();
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

  // 队列为空：要么还在拉第一页，要么生词本确实没有内容
  if (!queue.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="生词复习" onBack={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          {loadingMore ? (
            <>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.emptySubtitle}>正在加载生词本...</Text>
            </>
          ) : (
            <>
              <Ionicons name="bookmark-outline" size={64} color={Colors.border} />
              <Text style={styles.emptyTitle}>暂无生词</Text>
              <Text style={styles.emptySubtitle}>
                {moreError || '生词本里还没有单词，先去收藏几个吧'}
              </Text>
              {moreError ? (
                <TouchableOpacity
                  style={styles.returnBtn}
                  onPress={handleRetryMore}
                  activeOpacity={0.8}
                >
                  <Text style={styles.returnBtnText}>重新加载</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // 复习完成
  if (sessionCompleted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="复习成果" onBack={() => navigation.goBack()} />
        <View style={styles.completeWrap}>
          <View style={styles.trophyCircle}>
            <Ionicons name="trophy" size={56} color={Colors.gold} />
          </View>
          <Text style={styles.completeTitle}>生词复习完成！</Text>
          <Text style={styles.completeSubtitle}>
            本次复习了 <Text style={styles.highlightText}>{learnedInSessionCount}</Text> 个生词
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <Header
        title="生词复习"
        subtitle={`${absoluteIndex + 1} / ${displayTotal}`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.progressBarWrap}>
        <ProgressBar progress={queueProgress} height={4} color={Colors.primary} />
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.cardBox}
          activeOpacity={0.95}
          onPress={() => setShowAnswer(!showAnswer)}
        >
          {/* 标签栏：cat / sub 为空时不渲染空胶囊 */}
          {currentWord.cat || currentWord.sub || progressInfo?.status === 'mastered' ? (
            <View style={styles.cardHeaderRow}>
              {currentWord.cat ? (
                <View style={[styles.catTag, { backgroundColor: catColor + '18' }]}>
                  <View style={[styles.catDot, { backgroundColor: catColor }]} />
                  <Text style={[styles.catText, { color: catColor }]} numberOfLines={1}>
                    {currentWord.cat}
                  </Text>
                </View>
              ) : null}
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
          ) : null}

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

          {!showAnswer ? (
            <View style={styles.tapToReveal}>
              <Ionicons name="eye-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.tapToRevealText}>点击卡片查看中文释义与助记</Text>
            </View>
          ) : (
            <View style={styles.answerSection}>
              <View style={styles.dividerLine} />

              <View style={styles.meaningBox}>
                <Text style={styles.meaningLabel}>中文释义</Text>
                <Text style={styles.meaningContent}>{currentWord.meaning}</Text>
              </View>

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

      {/* 分页状态提示：拉取中 / 拉取失败可重试 */}
      {loadingMore ? (
        <View style={styles.moreHintWrap}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.moreHintText}>正在加载更多生词...</Text>
        </View>
      ) : moreError ? (
        <TouchableOpacity style={styles.moreHintWrap} onPress={handleRetryMore} activeOpacity={0.7}>
          <Ionicons name="refresh" size={16} color={Colors.primary} />
          <Text style={styles.moreErrorText}>加载更多失败，点击重试</Text>
        </TouchableOpacity>
      ) : null}

      {/* 底部操作条：返回 + 困难/一般/容易/已记住（各自对应服务端 type） */}
      <View style={styles.bottomBar}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gradeBtn, styles.hardAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('hard')}
            activeOpacity={0.85}
            disabled={grading}
          >
            <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
            <Text style={[styles.gradeBtnText, styles.hardActionText]}>困难</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gradeBtn, styles.normalAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('normal')}
            activeOpacity={0.85}
            disabled={grading}
          >
            <Ionicons name="time-outline" size={15} color={Colors.warning} />
            <Text style={[styles.gradeBtnText, styles.normalActionText]}>一般</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gradeBtn, styles.easyAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('easy')}
            activeOpacity={0.85}
            disabled={grading}
          >
            <Ionicons name="happy-outline" size={15} color={Colors.primary} />
            <Text style={[styles.gradeBtnText, styles.easyActionText]}>容易</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gradeBtn, styles.rememberAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('remembered')}
            activeOpacity={0.85}
            disabled={grading}
          >
            {grading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
            )}
            <Text style={[styles.gradeBtnText, styles.rememberActionText]}>已记住</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ConfirmDialog
        visible={vipGateMessage !== null}
        title="需要升级 VIP 会员"
        message={vipGateMessage || ''}
        onConfirm={() => {
          setVipGateMessage(null);
          // pendingGradeRef 保留，支付成功后返回会自动继续这次操作
          navigation.navigate('Purchase');
        }}
        onCancel={() => {
          setVipGateMessage(null);
          pendingGradeRef.current = null;
        }}
        onClose={() => setVipGateMessage(null)}
      />

      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        confirmText={dialog?.confirmText}
        cancelText={dialog?.cancelText}
        showCancel={dialog?.showCancel}
        onConfirm={dialog?.onConfirm}
        onCancel={dialog?.onCancel}
        onClose={() => setDialog(null)}
      />
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
    paddingBottom: 24,
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
  moreHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  moreHintText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  moreErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  // 返回：icon 按钮，宽度固定，给四个评分按钮留出空间
  backBtn: {
    width: 34,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 44,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  gradeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hardAction: {
    backgroundColor: Colors.danger + '12',
    borderColor: Colors.danger + '30',
  },
  hardActionText: {
    color: Colors.danger,
  },
  normalAction: {
    backgroundColor: Colors.warning + '14',
    borderColor: Colors.warning + '35',
  },
  normalActionText: {
    color: Colors.warning,
  },
  easyAction: {
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary + '30',
  },
  easyActionText: {
    color: Colors.primary,
  },
  rememberAction: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  rememberActionText: {
    color: '#FFFFFF',
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
    marginTop: 12,
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
