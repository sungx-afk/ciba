import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useProgress } from '../storage/progressStore';
import { useAuth } from '../context/AuthContext';
import { packLibrary } from '../services/packLibrary';
import { Word } from '../types';
import { Colors, getCategoryColor } from '../theme/colors';
import { pronounceWord } from '../utils/speech';
import { showToast } from '../utils/toast';
import { getWordExtras } from '../utils/wordExtras';
import { playRememberedSound } from '../utils/effectSound';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
import { RichText } from '../components/RichText';
import { SectionBadge } from '../components/SectionBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { checkVipGate, clearVipGateCache } from '../services/vipGate';

/** 今日学习单词一次拉取的数量（与首页保持一致） */
const TODAY_WORD_LIMIT = 50;
/** learn-by-menu 的卡片状态过滤：0 未学 / 1、2、3 学习中（已记住 4 不再出现） */
const TODAY_WORD_TYPES = [0, 1, 2, 3];

/** 同一父卡组下的兄弟卡组（用于「继续学习下一个卡组」） */
interface SiblingPack {
  id: number;
  name: string;
}

interface FlashcardScreenProps {
  route: any;
  navigation: any;
}

export const FlashcardScreen: React.FC<FlashcardScreenProps> = ({ route, navigation }) => {
  const {
    category,
    subCategory,
    singleWordId,
    onlyDue,
    filter,
    wordIds,
    startWordId,
    queueWords,
    title,
    packCat,
    packId,
    packQueue,
    packIndex,
    hasMorePacks: hasMorePacksParam,
  } = route.params || {};
  const {
    state,
    stats,
    recordReview,
    toggleBookmark,
    words,
    todayWords,
    packWords,
    loadTodayWords,
    currentTopPack,
  } = useProgress();
  // 会员状态与注册时间都来自用户信息
  const { user, refreshUserInfo } = useAuth();

  /** 顶层卡组名: 继续学习下一个卡组时，作为新单词的 cat 标记 */
  const topPackName = packCat || currentTopPack?.name || '';

  /** 路由直接带过来的兄弟卡组列表（首页「开始背词」） */
  const paramQueue: SiblingPack[] = Array.isArray(packQueue) ? packQueue : [];
  /** 兄弟卡组列表: 用于「继续学习下一个卡组」 */
  const [siblingPacks, setSiblingPacks] = useState<SiblingPack[]>(paramQueue);
  /** 当前学习的是第几个兄弟卡组 */
  const [packCursor, setPackCursor] = useState<number>(
    typeof packIndex === 'number' && paramQueue.length ? packIndex : -1
  );
  /** 当前卡组名（继续学习下一个卡组时会更新） */
  const [sessionTitle, setSessionTitle] = useState<string | undefined>(title);
  /**
   * 直接使用的单词队列（最高优先级）:
   * 1. 首页「复习待办」等入口通过 queueWords 传入
   * 2. 「继续学习下一个卡组」时由下一个卡组拉取
   */
  const [queueOverride, setQueueOverride] = useState<Word[] | null>(
    Array.isArray(queueWords) && queueWords.length ? queueWords : null
  );
  const [switchingPack, setSwitchingPack] = useState(false);

  /**
   * 路由没带兄弟卡组（如从「单词列表」进入）时，按 packId 反查父卡组下的兄弟列表，
   * 以便学完后也能继续学习下一个卡组。失败则静默降级为不显示该按钮。
   */
  useEffect(() => {
    if (paramQueue.length || !packId) return;
    const currentPackId = Number(packId);
    if (!currentPackId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await packLibrary.fetchPackDetail(currentPackId);
        const parentId = detail?.parent_id;
        if (!parentId) return;
        const { packs } = await packLibrary.fetchSubPacks(parentId, { start: 0, limit: 200 });
        if (cancelled || !packs.length) return;
        const index = packs.findIndex((p) => Number(p.id) === currentPackId);
        setSiblingPacks(packs.map((p) => ({ id: p.id, name: p.name })));
        setPackCursor(index);
      } catch {
        // 拿不到兄弟卡组就不提供「继续学习下一个卡组」
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramQueue.length, packId]);

  // 构建当前复习/学习单词队列
  const rawQueue: Word[] = useMemo(() => {
    // 在成果页「继续学习下一个卡组」时，队列已由下一个卡组直接给出
    if (queueOverride && queueOverride.length) return queueOverride;

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

      return true;
    });
  }, [
    queueOverride,
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
    // 与单词列表页一致：服务端 type=4 也算已记住，避免两处判断不一致
    const isMastered = (w: Word) =>
      w.type === 4 || state.progressMap[w.id]?.status === 'mastered' ? 1 : 0;
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

  /** 初始位置：列表页点的是哪个单词，就从这个单词开始背 */
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = startWordId ? studyQueue.findIndex((w) => w.id === startWordId) : -1;
    return idx > 0 ? idx : 0;
  });
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [learnedInSessionCount, setLearnedInSessionCount] = useState(0);
  // 正在上报本次评分，避免连点导致跳过多张卡片
  const [grading, setGrading] = useState(false);
  /** 被会员限制拦截下来的评分，开通会员后自动继续 */
  const pendingGradeRef = useRef<'hard' | 'remembered' | null>(null);
  /** 需要升级会员时的提示文案（非空即弹窗） */
  const [vipGateMessage, setVipGateMessage] = useState<string | null>(null);

  const currentWord = studyQueue[currentIndex];
  const progressInfo = currentWord ? state.progressMap[currentWord.id] : undefined;
  const isBookmarked = progressInfo?.isBookmarked || false;

  /** 单词深度解析：音标 / 词义辨析 / 巧记联想 / 场景例句 */
  const extras = useMemo(
    () =>
      currentWord
        ? getWordExtras(currentWord)
        : { phonetic: '', wordDifference: '', memoryMethod: '', sentences: [] },
    [currentWord]
  );

  /** 词包级「分类词汇辨析」：取自卡组详情 summary */
  const [packSummary, setPackSummary] = useState('');
  useEffect(() => {
    const targetId = Number(packId || currentWord?.packageId || 0);
    if (!targetId) {
      setPackSummary('');
      return;
    }
    // 已加载过的顶层卡组就不再单独请求
    if (Number((currentTopPack as any)?.id) === targetId) {
      setPackSummary(String((currentTopPack as any)?.summary || ''));
      return;
    }
    let cancelled = false;
    packLibrary
      .fetchPackDetail(targetId)
      .then((pack) => {
        if (!cancelled) setPackSummary(String((pack as any)?.summary || ''));
      })
      .catch(() => {
        if (!cancelled) setPackSummary('');
      });
    return () => {
      cancelled = true;
    };
  }, [packId, currentWord?.packageId, currentTopPack]);

  /** 加入/取消生词本：加入会调服务端 /anki/movie2card，失败时不改本地状态 */
  const handleToggleBookmark = async (wordId: number, wordName?: string) => {
    const wasBookmarked = !!state.progressMap[wordId]?.isBookmarked;
    try {
      await toggleBookmark(wordId, wordName);
      if (!wasBookmarked) showToast('已加入生词本');
    } catch (e: any) {
      Alert.alert('加入生词本失败', e?.message || '请检查网络后重试');
    }
  };

  // 切换到新词时，按设置自动发音
  useEffect(() => {
    if (currentWord && state.autoPronounce && !sessionCompleted) {
      pronounceWord(currentWord.word, {
        accent: state.accent,
        rate: state.speechRate,
      });
    }
  }, [currentIndex, sessionCompleted]);

  /**
   * 处理评分并翻到下一张卡片
   * - hard        -> 服务端 type=1，间隔 1 天（「明天复习」）
   * - remembered  -> 服务端 type=4，直接标记为已记住
   */
  const handleGrade = async (grade: 'hard' | 'remembered') => {
    if (!currentWord || grading) return;
    setGrading(true);
    try {
      // 非会员达到免费额度时先拦截，引导升级会员后再继续
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

      await recordReview(currentWord.id, grade);
      if (grade === 'remembered') playRememberedSound();
      setLearnedInSessionCount((prev) => prev + 1);

      if (currentIndex + 1 < studyQueue.length) {
        setShowAnswer(false);
        setCurrentIndex((prev) => prev + 1);
      } else {
        setSessionCompleted(true);
      }
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '学习结果上报失败，请重试');
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
   * 已开通会员就自动继续刚才被拦截的「明天复习 / 已记住」。
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
        showToast('会员已开通，继续学习');
        handleGradeRef.current(pending);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, stats.masteredCount])
  );

  const handleManualPronounce = () => {
    if (currentWord) {
      pronounceWord(currentWord.word, {
        accent: state.accent,
        rate: state.speechRate,
      });
    }
  };

  /** 是否由首页带着兄弟卡组列表进入（只有这种场景才提供「继续学习下一个卡组」） */
  const hasPackContext = siblingPacks.length > 0 && packCursor >= 0;
  const nextPack: SiblingPack | undefined = hasPackContext
    ? siblingPacks[packCursor + 1]
    : undefined;
  /** 列表还有未加载的兄弟卡组（分页），此时最后一个不等于真的没有了 */
  const hasMorePacks = hasPackContext && !!hasMorePacksParam;

  /**
   * 继续学习下一个卡组:
   * 依次向后查找第一个「今日有单词」的子卡组，直接切换队列继续学习。
   */
  const handleContinueNextPack = async () => {
    if (switchingPack || !hasPackContext) return;
    setSwitchingPack(true);
    try {
      let cursor = packCursor + 1;
      let target: { pack: SiblingPack; words: Word[] } | null = null;

      while (cursor < siblingPacks.length) {
        const pack = siblingPacks[cursor];
        const list = await loadTodayWords(pack.id, {
          start: 0,
          limit: TODAY_WORD_LIMIT,
          types: TODAY_WORD_TYPES,
          cat: topPackName,
          sub: pack.name || '',
        });
        if (list.length) {
          target = { pack, words: list };
          break;
        }
        cursor += 1;
      }

      if (!target) {
        setPackCursor(siblingPacks.length); // 标记已到末尾，按钮转为提示
        Alert.alert('太棒了', '后面的卡组今日都没有待学习的单词');
        return;
      }

      // 重置会话: 解锁排序、换队列、回到第一张卡片
      lockedOrderRef.current = null;
      setQueueOverride(target.words);
      setPackCursor(cursor);
      setSessionTitle(target.pack.name);
      setCurrentIndex(0);
      setShowAnswer(false);
      setLearnedInSessionCount(0);
      setSessionCompleted(false);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '获取下一个卡组失败');
    } finally {
      setSwitchingPack(false);
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

          {/* 有下一个子卡组: 直接继续学习；已到末尾: 只给提示 */}
          {nextPack ? (
            <TouchableOpacity
              style={[styles.continueBtn, switchingPack && styles.continueBtnDisabled]}
              onPress={handleContinueNextPack}
              activeOpacity={0.85}
              disabled={switchingPack}
            >
              {switchingPack ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
              )}
              <View style={styles.continueBtnTextWrap}>
                <Text style={styles.continueBtnText}>继续学习下一个卡组</Text>
                <Text style={styles.continueBtnSub} numberOfLines={1} ellipsizeMode="tail">
                  {nextPack.name}
                </Text>
              </View>
            </TouchableOpacity>
          ) : hasPackContext ? (
            <View style={styles.packEndHint}>
              <Ionicons
                name={hasMorePacks ? 'ellipsis-horizontal-circle-outline' : 'flag-outline'}
                size={15}
                color={Colors.textMuted}
              />
              <Text style={styles.packEndHintText}>
                {hasMorePacks
                  ? '本页卡组已学完，返回列表可继续学习更多卡组'
                  : '已经是最后一个卡组啦，全部完成！'}
              </Text>
            </View>
          ) : null}

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
        title={sessionTitle || category || '背单词'}
        subtitle={`${currentIndex + 1} / ${studyQueue.length}`}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: isBookmarked ? 'bookmark' : 'bookmark-outline',
          onPress: () => handleToggleBookmark(currentWord.id, currentWord.word),
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
            {extras.phonetic ? (
              <Text style={styles.wordPhonetic}>{extras.phonetic}</Text>
            ) : null}
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
              <Text style={styles.tapToRevealText}>点击卡片查看释义、辨析与巧记</Text>
            </View>
          ) : (
            <View style={styles.answerSection}>
              <View style={styles.dividerLine} />

              {/* 1. 核心中文释义 */}
              {currentWord.meaning ? (
                <View style={styles.bentoSection}>
                  <SectionBadge icon="pricetag-outline" label="核心释义" color={Colors.primary} />
                  <RichText text={currentWord.meaning} style={styles.textMeaning} />
                </View>
              ) : null}

              {/* 2. 词义辨析 / 用法区别 */}
              {extras.wordDifference ? (
                <View style={styles.bentoSection}>
                  <SectionBadge icon="git-compare-outline" label="词义辨析" color={Colors.dark} />
                  <RichText
                    text={extras.wordDifference}
                    style={styles.textContent}
                    boldStyle={styles.boldStrong}
                  />
                </View>
              ) : null}

              {/* 3. 巧记联想 / 记忆技巧 */}
              {extras.memoryMethod ? (
                <View style={styles.bentoSection}>
                  <SectionBadge icon="bulb-outline" label="巧记联想" color={Colors.accent} />
                  <View style={styles.memoryInner}>
                    <RichText
                      text={extras.memoryMethod}
                      style={styles.textContent}
                      boldStyle={styles.boldStrong}
                    />
                  </View>
                </View>
              ) : null}

              {/* 4. 双语场景例句 */}
              {extras.sentences.length ? (
                <View style={styles.bentoSection}>
                  <SectionBadge
                    icon="chatbubble-ellipses-outline"
                    label="场景例句"
                    color={Colors.secondary}
                  />
                  <View style={styles.sentencesList}>
                    {extras.sentences.map((s, idx) => (
                      <View key={idx} style={styles.sentenceItem}>
                        {s.english ? (
                          <RichText
                            text={s.english}
                            style={styles.enSentence}
                            boldStyle={styles.boldStrong}
                          />
                        ) : null}
                        {s.chinese ? (
                          <RichText text={s.chinese} style={styles.cnSentence} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* 5. 词包全局分类词汇辨析 */}
              {packSummary ? (
                <View style={styles.bentoSection}>
                  <SectionBadge
                    icon="library-outline"
                    label="分类词汇辨析"
                    color={Colors.pinwheelBlue}
                  />
                  <View style={styles.summaryInner}>
                    <RichText
                      text={packSummary}
                      style={styles.textContent}
                      boldStyle={styles.boldStrong}
                    />
                  </View>
                </View>
              ) : null}

              {/* 兜底：没有任何结构化信息时仍显示原始 note */}
              {!extras.wordDifference &&
              !extras.memoryMethod &&
              !extras.sentences.length &&
              currentWord.note ? (
                <View style={styles.bentoSection}>
                  <SectionBadge
                    icon="bulb-outline"
                    label="助记与例句"
                    color={Colors.textSecondary}
                  />
                  <RichText text={currentWord.note} style={styles.textContent} />
                </View>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 底部操作栏: 返回 / 明天复习(type=1) / 已记住(type=4) */}
      <View style={styles.bottomBar}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.backAction]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            <Text style={[styles.actionBtnText, styles.backActionText]}>返回</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.tomorrowAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('hard')}
            activeOpacity={0.85}
            disabled={grading}
          >
            <Ionicons name="time-outline" size={18} color={Colors.primary} />
            <Text style={[styles.actionBtnText, styles.tomorrowActionText]}>明天复习</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.rememberAction, grading && styles.actionBtnDisabled]}
            onPress={() => handleGrade('remembered')}
            activeOpacity={0.85}
            disabled={grading}
          >
            {grading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            )}
            <Text style={[styles.actionBtnText, styles.rememberActionText]}>已记住</Text>
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
  // 解析内容较多时不能居中，否则顶部会被裁切且无法滚动，改为从顶部排布
  scrollInner: {
    padding: 16,
    paddingBottom: 88,
    flexGrow: 1,
    justifyContent: 'flex-start',
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
  wordPhonetic: {
    fontSize: 15,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 6,
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
    marginBottom: 12,
  },
  // 解析分区：白底圆角卡片 + 彩色小标题，参照 ciba-pc 单词研读
  bentoSection: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  textMeaning: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  textContent: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  /** <b> 提升为加粗标题行时的强调色 */
  boldStrong: {
    color: Colors.textPrimary,
  },
  memoryInner: {
    backgroundColor: Colors.accent + '14',
    borderWidth: 1,
    borderColor: Colors.accent + '40',
    borderRadius: 8,
    padding: 10,
  },
  sentencesList: {
    gap: 8,
  },
  sentenceItem: {
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  enSentence: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 19,
  },
  cnSentence: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 3,
  },
  summaryInner: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    borderRadius: 8,
    padding: 10,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  // 底部三个操作按钮: 返回 / 明天复习(type=1) / 已记住(type=4)
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  backAction: {
    flex: 0.85,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
  },
  backActionText: {
    color: Colors.textSecondary,
  },
  tomorrowAction: {
    flex: 1.32,
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary + '30',
  },
  tomorrowActionText: {
    color: Colors.primary,
  },
  rememberAction: {
    flex: 1.32,
    backgroundColor: Colors.success,
    borderColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
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
  // 继续学习下一个卡组
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.success,
    marginBottom: 12,
  },
  continueBtnDisabled: {
    opacity: 0.7,
  },
  continueBtnTextWrap: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  continueBtnSub: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
  },
  packEndHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  packEndHintText: {
    flexShrink: 1,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
