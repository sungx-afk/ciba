import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { Word } from '../types';
import { Header } from '../components/Header';
import { RichText } from '../components/RichText';
import { ConfirmDialog, DialogPayload } from '../components/ConfirmDialog';
import { pronounceWord } from '../utils/speech';
import { showToast } from '../utils/toast';
import { playRememberedSound } from '../utils/effectSound';
import {
  fetchBookmarkedWordsByTypes,
  getCachedBookmarkPackId,
  BOOKMARK_LEARNING_TYPES,
  BOOKMARK_MASTERED_TYPES,
} from '../services/bookmarkApi';
import { AUTH_EXPIRED_RESULT } from '../services/api';
import {
  checkVipGate,
  clearVipGateCache,
  FREE_MASTERED_LIMIT,
  VipGateResult,
} from '../services/vipGate';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
/** 底部「已记住」区域高度 */
const BOTTOM_PANEL_HEIGHT = Math.min(190, Math.max(130, Math.round(SCREEN_HEIGHT * 0.26)));
/** 底部标签高度，也是飞行动画的终点尺寸 */
const TAG_HEIGHT = 28;
/** 飞行动画时长 */
const FLY_DURATION = 560;

interface BookmarksScreenProps {
  navigation: any;
}

/** 某个元素在窗口中的位置（measureInWindow 的结果） */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 被 VIP 拦截、待开通会员后继续执行的「标记记住」 */
type PendingMark =
  | { type: 'single'; word: Word; from: Rect }
  | { type: 'all'; words: Word[] };

/** 一个正在飞往底部区域的单词标签 */
interface FlyItem {
  id: number;
  label: string;
  from: Rect;
  to: { x: number; y: number };
  /** 飞行层所在容器的窗口原点，用于把窗口坐标换算成相对坐标 */
  origin: { x: number; y: number };
  tagWidth: number;
  progress: Animated.Value;
}

/** note 首行可能是音标（如「美 /ɡleɪd/  英 /ɡleɪd/」或「[ɡleɪd]」） */
function extractPhonetic(note: string): string {
  if (!note) return '';
  const first = note.split('\n')[0].trim();
  if (/^(美|英)?\s*(\/|\[)/.test(first) || /^\/[^/]{1,30}\//.test(first)) return first;
  return '';
}

/** 去掉音标行后的助记/例句 */
function noteWithoutPhonetic(note: string, phonetic: string): string {
  if (!note) return '';
  const flat = note.replace(/\n/g, ' ').trim();
  if (!phonetic) return flat;
  return flat.slice(phonetic.length).trim();
}

/** 测量元素在窗口中的位置 */
function measureInWindow(ref: React.RefObject<any>): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!ref.current) {
      resolve(null);
      return;
    }
    ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
      if (width === 0 && height === 0) resolve(null);
      else resolve({ x, y, width, height });
    });
  });
}

/** 飞行中的标签：从卡片位置缩放移动到底部区域，同时卡片样式渐变为标签样式 */
const FlyTag: React.FC<{ item: FlyItem }> = ({ item }) => {
  const p = item.progress;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flyTag,
        {
          left: p.interpolate({
            inputRange: [0, 1],
            outputRange: [item.from.x - item.origin.x, item.to.x - item.origin.x],
          }),
          top: p.interpolate({
            inputRange: [0, 1],
            outputRange: [item.from.y - item.origin.y, item.to.y - item.origin.y],
          }),
          width: p.interpolate({ inputRange: [0, 1], outputRange: [item.from.width, item.tagWidth] }),
          height: p.interpolate({
            inputRange: [0, 1],
            outputRange: [item.from.height, TAG_HEIGHT],
          }),
          borderRadius: p.interpolate({ inputRange: [0, 1], outputRange: [14, 10] }),
          paddingHorizontal: p.interpolate({ inputRange: [0, 1], outputRange: [14, 10] }),
          backgroundColor: p.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [
              'rgba(255,255,255,1)',
              'rgba(107,181,162,0.12)',
              'rgba(107,181,162,0.12)',
            ],
          }),
          borderColor: p.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [
              'rgba(212,229,235,1)',
              'rgba(107,181,162,0.35)',
              'rgba(107,181,162,0.35)',
            ],
          }),
          opacity: p.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
        },
      ]}
    >
      <Animated.View
        style={{ opacity: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] }) }}
      >
        <Ionicons name="checkmark" size={12} color={Colors.success} />
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontWeight: '700',
          fontSize: p.interpolate({ inputRange: [0, 1], outputRange: [19, 13] }),
          color: p.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: ['rgb(30,58,76)', 'rgb(107,181,162)', 'rgb(107,181,162)'],
          }),
        }}
      >
        {item.label}
      </Animated.Text>
    </Animated.View>
  );
};

interface WordRowProps {
  word: Word;
  showDetail: boolean;
  accent: 'en-US' | 'en-GB';
  onPress: () => void;
  /** rect 为卡片在窗口中的位置，飞行标签以此为起点 */
  onMastered: (word: Word, rect: Rect) => Promise<void>;
}

/** 未记住的单词卡片：右侧为「标记为已记住」（生词本里的单词无需再加收藏） */
const WordRow: React.FC<WordRowProps> = ({ word, showDetail, accent, onPress, onMastered }) => {
  /** 0 -> 1：卡片淡出，把它「交给」飞行标签 */
  const hide = useRef(new Animated.Value(0)).current;
  /** 对勾按钮的按下反馈 */
  const press = useRef(new Animated.Value(0)).current;
  const cardRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);

  const phonetic = useMemo(() => extractPhonetic(word.note), [word.note]);
  const noteBody = useMemo(() => noteWithoutPhonetic(word.note, phonetic), [word.note, phonetic]);

  const handlePronounce = (e: any) => {
    e?.stopPropagation?.();
    pronounceWord(word.word, { accent });
  };

  const startMastered = async (rect: Rect) => {
    Animated.timing(hide, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    try {
      await onMastered(word, rect);
    } catch {
      // 标记失败：卡片淡回来
      Animated.timing(hide, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const handleMastered = (e: any) => {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);

    Animated.sequence([
      Animated.timing(press, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.spring(press, { toValue: 0, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();

    // 先量出卡片当前位置，再交给父组件播放飞行动画
    const node = cardRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        startMastered({ x, y, width, height });
      });
    } else {
      startMastered({ x: 0, y: 0, width: 0, height: 0 });
    }
  };

  return (
    <Animated.View
      ref={cardRef}
      style={[styles.card, { opacity: hide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <TouchableOpacity style={styles.cardInner} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.cardMainRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {word.word}
            </Text>
            {phonetic ? (
              <Text style={styles.titlePhonetic} numberOfLines={1}>
                {phonetic}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.soundBtn}
              onPress={handlePronounce}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="volume-medium-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <Animated.View
              style={{
                transform: [
                  { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
                ],
              }}
            >
              <TouchableOpacity
                style={[styles.roundBtn, styles.checkBtn]}
                onPress={handleMastered}
                activeOpacity={0.85}
                disabled={busy}
                accessibilityLabel="标记为已记住"
              >
                <Ionicons name="checkmark" size={20} color={Colors.success} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {showDetail ? (
          <View style={styles.detailBox}>
            <Text style={styles.detailAnswer} numberOfLines={2}>
              {word.meaning}
            </Text>
            {noteBody ? <RichText text={noteBody} style={styles.detailNote} /> : null}
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
};

/**
 * 生词本（UI 与「分类卡组单词列表」保持一致）：
 *  - 中部：未记住的单词 —— 服务端 type = 0/1/2/3 的卡片
 *  - 底部：已记住的单词标签 —— 服务端 type = 4 的卡片
 *  两份数据都按 type 从服务端分页取，可能有多页，列表页这里一次循环取完。
 */
export const BookmarksScreen: React.FC<BookmarksScreenProps> = ({ navigation }) => {
  const { state, stats, recordReview, recordReviews, isLoggedIn } = useProgress();
  // 会员状态与注册时间都来自用户信息
  const { user, refreshUserInfo } = useAuth();

  /** 中部：未记住 */
  const [pendingWords, setPendingWords] = useState<Word[]>([]);
  /** 底部：已记住 */
  const [masteredWords, setMasteredWords] = useState<Word[]>([]);
  /** 生词本卡组 id：学习结果要按它上报 */
  const [bookmarkPackId, setBookmarkPackId] = useState(0);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  /** 「全部记住」进行中：批量请求只有一个来回，这里只记录进行中与总数 */
  const [markAll, setMarkAll] = useState({ running: false, total: 0 });
  const [flying, setFlying] = useState<FlyItem[]>([]);
  /** 统一弹窗状态：确认/提示一律走 ConfirmDialog，不再使用系统 Alert */
  const [dialog, setDialog] = useState<DialogPayload | null>(null);
  /** 被会员限制拦截下来的「标记记住」，开通会员后自动继续 */
  const pendingMarkRef = useRef<PendingMark | null>(null);

  const rootRef = useRef<any>(null);
  const bottomRef = useRef<any>(null);
  // 防止并发请求 & 丢弃过期请求的结果
  const loadingRef = useRef(false);
  const reqIdRef = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    const reqId = ++reqIdRef.current;
    if (mode === 'initial') setInitialLoading(true);
    else setRefreshing(true);

    try {
      const [learning, mastered] = await Promise.all([
        fetchBookmarkedWordsByTypes(BOOKMARK_LEARNING_TYPES),
        fetchBookmarkedWordsByTypes(BOOKMARK_MASTERED_TYPES),
      ]);
      if (reqId !== reqIdRef.current) return; // 已发起更新的请求，丢弃这次结果

      setPendingWords(learning);
      setMasteredWords(mastered);
      setBookmarkPackId(getCachedBookmarkPackId());
      setNeedLogin(false);
      setErrorMsg('');
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;

      const msg =
        err?.result === AUTH_EXPIRED_RESULT
          ? '登录后即可同步你的生词本'
          : err?.message || '生词本加载失败，请稍后重试';

      setNeedLogin(err?.result === AUTH_EXPIRED_RESULT);
      setErrorMsg(msg);
      setPendingWords([]);
      setMasteredWords([]);
    } finally {
      loadingRef.current = false;
      if (reqId === reqIdRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // 首次进入 / 登录状态变化时重新拉取
  useEffect(() => {
    load('initial');
  }, [isLoggedIn, load]);

  // 每次重新聚焦（如从其它页面收藏后切回）时静默刷新，首次聚焦跳过
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      if (loadingRef.current) return;
      load('refresh');
    }, [load])
  );

  const handleRefresh = useCallback(() => load('refresh'), [load]);

  const totalCount = pendingWords.length + masteredWords.length;

  /** 会员限制的升级弹窗：一律走 ConfirmDialog */
  const showVipDialog = useCallback(
    (message: string) => {
      setDialog({
        title: '需要升级 VIP 会员',
        message,
        confirmText: '去开通',
        onConfirm: () => {
          setDialog(null);
          // pendingMarkRef 保留，支付成功后返回会自动继续这次标记
          navigation.navigate('Purchase');
        },
        onCancel: () => {
          setDialog(null);
          pendingMarkRef.current = null;
        },
      });
    },
    [navigation]
  );

  /**
   * 非会员免费额度校验（与单词列表页同一套规则）。
   * 返回值：null 表示放行；否则为被限制的结果（含 reason/message）。
   */
  const runVipGate = useCallback(
    async (options?: { silent?: boolean }): Promise<VipGateResult | null> => {
      const { silent = false } = options || {};
      // 会员状态请求失败时不拦截操作，也不把异常抛给调用方
      let gate: VipGateResult;
      try {
        gate = await checkVipGate({
          userVip: (user as any)?.vip,
          masteredCount: stats.masteredCount,
          createDate: (user as any)?.createDate,
        });
      } catch {
        return null;
      }
      if (!gate.blocked) return null;
      if (!silent) showVipDialog(gate.message || '升级 VIP 会员后可继续使用');
      return gate;
    },
    [user, stats.masteredCount, showVipDialog]
  );

  /** 进入复习模式：队列为整个生词本，焦点为点击的那个单词 */
  const openStudy = useCallback(
    (startWordId?: number) => {
      const queue = [...pendingWords, ...masteredWords];
      if (!queue.length) {
        setDialog({ title: '提示', message: '生词本里还没有单词', showCancel: false });
        return;
      }
      const index = startWordId === undefined ? 0 : queue.findIndex((w) => w.id === startWordId);
      navigation.navigate('BookmarkStudy', {
        words: queue,
        startIndex: index < 0 ? 0 : index,
        total: queue.length,
      });
    },
    [navigation, pendingWords, masteredWords]
  );

  /**
   * 标记单个单词为已记住：卡片原地变成标签，从点击位置飞进底部「已记住」区域。
   * 先起飞再上报，点击后无等待感；飞行期间底部暂不渲染该标签，落地后淡入。
   */
  const handleMarkMastered = async (word: Word, from: Rect) => {
    const label = word.word;

    // 非会员达到免费额度时先拦截，引导升级会员后再继续
    if (await runVipGate()) {
      pendingMarkRef.current = { type: 'single', word, from };
      // 抛错走与上报失败相同的回滚：卡片淡回原位
      throw new Error('VIP_GATE');
    }

    // 底部面板贴着屏幕底边，底边位置恒定，落地前用「底边 - 面板高度」推算出落点
    if (from.width > 0 && from.height > 0) {
      const [panel, origin] = await Promise.all([
        measureInWindow(bottomRef),
        measureInWindow(rootRef),
      ]);
      if (panel && origin) {
        const cnCount = (label.match(/[\u4e00-\u9fa5]/g) || []).length;
        const tagWidth = Math.min(
          Math.max(cnCount * 14 + (label.length - cnCount) * 8 + 40, 56),
          Math.max(panel.width - 28, 56)
        );
        const progress = new Animated.Value(0);
        const item: FlyItem = {
          id: word.id,
          label,
          from,
          to: { x: panel.x + 14, y: panel.y + panel.height - BOTTOM_PANEL_HEIGHT + 36 },
          origin,
          tagWidth,
          progress,
        };
        setFlying((prev) => [...prev, item]);

        Animated.timing(progress, {
          toValue: 1,
          duration: FLY_DURATION,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          // 落地：底部区域淡入真正的标签
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setFlying((prev) => prev.filter((f) => f.id !== word.id));
        });
      }
    }

    try {
      // 生词本不属于当前卡组，必须显式带上它自己的卡组 id
      await recordReview(word.id, 'remembered', { packId: bookmarkPackId || undefined });
      playRememberedSound();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPendingWords((prev) => prev.filter((w) => w.id !== word.id));
      setMasteredWords((prev) => [word, ...prev.filter((w) => w.id !== word.id)]);
    } catch (e: any) {
      // 上报失败：撤掉飞行中的标签
      setFlying((prev) => prev.filter((f) => f.id !== word.id));
      setDialog({
        title: '保存失败',
        message: e?.message || '标记已记住失败，请重试',
        showCancel: false,
      });
      throw e;
    }
  };

  /** 全部记住：一次批量请求标记整个列表，成功后统一刷新界面 */
  const runMarkAll = async (targets: Word[]) => {
    if (!targets.length) return;

    // 免费额度只够标记一部分时，先标记够的那部分，剩下的留到开通会员后继续
    let batch = targets;
    let rest: Word[] = [];
    const blocked = await runVipGate({ silent: true });
    if (blocked) {
      const remaining =
        blocked.reason === 'mastered'
          ? Math.max(0, FREE_MASTERED_LIMIT - stats.masteredCount)
          : 0;
      batch = targets.slice(0, remaining);
      rest = targets.slice(remaining);
    }

    if (!batch.length) {
      // 一个都标记不了：提示升级会员，剩下的等开通后自动继续
      pendingMarkRef.current = { type: 'all', words: rest.length ? rest : targets };
      await runVipGate();
      return;
    }

    setMarkAll({ running: true, total: batch.length });

    try {
      await recordReviews(
        batch.map((w) => w.id),
        'remembered',
        { packId: bookmarkPackId || undefined }
      );
      // 单词一次性移到底部「已记住」区域时的布局动画
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMarkAll({ running: false, total: 0 });
      const markedIds = new Set(batch.map((w) => w.id));
      setPendingWords((prev) => prev.filter((w) => !markedIds.has(w.id)));
      setMasteredWords((prev) => [...batch, ...prev.filter((w) => !markedIds.has(w.id))]);
      showToast(`已把 ${batch.length} 个单词标记为已记住`);
    } catch (e: any) {
      setMarkAll({ running: false, total: 0 });
      setDialog({
        title: '标记失败',
        message: e?.message || '批量标记已记住失败，请检查网络后重试',
        showCancel: false,
      });
    }

    if (rest.length) {
      // 免费额度用完了：剩下这些等会员开通后接着标记
      pendingMarkRef.current = { type: 'all', words: rest };
      await runVipGate();
    }
  };

  /** 点击「全部记住」：先用 ConfirmDialog 二次确认，确认后再发起批量请求 */
  const handleMarkAll = () => {
    if (markAll.running) return;
    if (!pendingWords.length) {
      setDialog({
        title: '提示',
        message: '没有未记住的单词了',
        showCancel: false,
      });
      return;
    }
    setDialog({
      title: '全部记住',
      message: `将把生词本里 ${pendingWords.length} 个未记住的单词标记为已记住，是否继续？`,
      onConfirm: () => {
        setDialog(null);
        runMarkAll(pendingWords);
      },
    });
  };

  // 供「从会员页返回」时调用最新的标记方法
  const handleMarkMasteredRef = useRef(handleMarkMastered);
  useEffect(() => {
    handleMarkMasteredRef.current = handleMarkMastered;
  }, [handleMarkMastered]);
  const runMarkAllRef = useRef(runMarkAll);
  useEffect(() => {
    runMarkAllRef.current = runMarkAll;
  }, [runMarkAll]);

  /**
   * 从会员页返回：先刷新用户信息与会员状态，
   * 已开通会员就自动继续刚才被拦截的「单个标记 / 全部记住」。
   */
  useFocusEffect(
    useCallback(() => {
      const pending = pendingMarkRef.current;
      if (!pending) return;
      (async () => {
        clearVipGateCache();
        try {
          await refreshUserInfo?.();
        } catch {
          // 刷新失败不阻断，下面仍会按最新接口结果判断
        }
        // silent 校验：没开通就丢弃待办，否则每次回到页面都会再弹一次升级弹窗
        if (await runVipGate({ silent: true })) {
          pendingMarkRef.current = null;
          return;
        }
        pendingMarkRef.current = null;
        showToast('会员已开通，继续标记');
        if (pending.type === 'single') {
          try {
            await handleMarkMasteredRef.current(pending.word, pending.from);
          } catch {
            // 继续失败时卡片已回滚，不再额外弹窗
          }
        } else {
          await runMarkAllRef.current(pending.words);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, stats.masteredCount])
  );

  /** 正在飞行的单词不从底部标签区渲染，避免和飞行中的标签重复 */
  const flyingIds = useMemo(() => new Set(flying.map((f) => f.id)), [flying]);
  const visibleMastered = useMemo(
    () => masteredWords.filter((w) => !flyingIds.has(w.id)),
    [masteredWords, flyingIds]
  );

  const showEmptyState = !initialLoading && !errorMsg && !needLogin && totalCount === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root} ref={rootRef}>
        <Header
          title="生词本"
          subtitle={
            initialLoading && totalCount === 0
              ? '正在加载...'
              : `共 ${totalCount} 词 · 已记住 ${masteredWords.length}`
          }
          rightAction={{
            icon: 'play-circle',
            onPress: () => openStudy(),
          }}
        />

        {/* 顶部操作条：左侧为列表分组标签，右侧显示/隐藏词义 + 全部记住 */}
        <View style={styles.topBar}>
          <View style={styles.segmentWrap}>
            <View style={[styles.segment, styles.segmentActive]}>
              <Text style={[styles.segmentText, styles.segmentTextActive]}>列表</Text>
            </View>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              style={[styles.ghostBtn, showDetail && styles.ghostBtnActive]}
              onPress={() => setShowDetail((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={showDetail ? 'eye-off-outline' : 'eye-outline'}
                size={15}
                color={showDetail ? Colors.primary : Colors.textTertiary}
              />
              <Text style={[styles.ghostBtnText, showDetail && styles.ghostBtnTextActive]}>
                词义
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, markAll.running && styles.primaryBtnDisabled]}
              onPress={handleMarkAll}
              activeOpacity={0.85}
              disabled={markAll.running}
            >
              {markAll.running ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>标记中 {markAll.total} 词</Text>
                </>
              ) : (
                <Text style={styles.primaryBtnText}>全部记住</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {initialLoading && totalCount === 0 ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>正在加载生词本...</Text>
          </View>
        ) : null}

        {!initialLoading && needLogin ? (
          <View style={styles.centerWrap}>
            <Ionicons name="person-circle-outline" size={64} color={Colors.border} />
            <Text style={styles.emptyTitle}>登录后同步生词本</Text>
            <Text style={styles.emptyDesc}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.8}
            >
              <Text style={styles.loginBtnText}>去登录</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!initialLoading && !needLogin && !!errorMsg ? (
          <View style={styles.centerWrap}>
            <Ionicons name="cloud-offline-outline" size={64} color={Colors.border} />
            <Text style={styles.emptyTitle}>加载失败</Text>
            <Text style={styles.emptyDesc}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => load('initial')}
              activeOpacity={0.8}
            >
              <Text style={styles.loginBtnText}>重新加载</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!initialLoading && !needLogin && !errorMsg ? (
          <>
            {/* 中部：未记住的单词列表 */}
            <View style={styles.middleWrap}>
              <FlatList
                data={pendingWords}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <WordRow
                    word={item}
                    showDetail={showDetail}
                    accent={state.accent}
                    onPress={() => openStudy(item.id)}
                    onMastered={handleMarkMastered}
                  />
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={Colors.primary}
                  />
                }
                ListEmptyComponent={
                  showEmptyState ? (
                    <View style={styles.emptyWrap}>
                      <Ionicons name="bookmark-outline" size={56} color={Colors.border} />
                      <Text style={styles.emptyTitle}>生词本是空的</Text>
                      <Text style={styles.emptyText}>
                        在背词或单词列表里点击书签图标，随时将难记生词收藏到这里
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyWrap}>
                      <Ionicons name="checkmark-done-circle" size={56} color={Colors.success} />
                      <Text style={styles.emptyTitle}>全部记住啦</Text>
                      <Text style={styles.emptyText}>生词本里的单词都已标记为已记住</Text>
                    </View>
                  )
                }
              />
            </View>

            {/* 底部：已记住的单词标签 */}
            <View
              ref={bottomRef}
              style={[
                styles.bottomPanel,
                masteredWords.length ? { height: BOTTOM_PANEL_HEIGHT } : null,
              ]}
            >
              <View style={styles.bottomHeader}>
                <Ionicons name="checkmark-done" size={14} color={Colors.success} />
                <Text style={styles.bottomTitle}>已记住 {masteredWords.length}</Text>
              </View>

              {visibleMastered.length ? (
                <ScrollView
                  style={styles.tagScroll}
                  contentContainerStyle={styles.tagWrap}
                  showsVerticalScrollIndicator={false}
                >
                  {visibleMastered.map((w) => (
                    <TouchableOpacity
                      key={w.id}
                      style={styles.tag}
                      onPress={() => openStudy(w.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark" size={11} color={Colors.success} />
                      <Text style={styles.tagText} numberOfLines={1}>
                        {w.word}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.bottomEmpty}>
                  点单词右侧的对勾，记住的单词会收进这里
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* 飞行动画层 */}
        {flying.map((item) => (
          <FlyTag key={item.id} item={item} />
        ))}
      </View>

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
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  segmentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.divider,
    borderRadius: 14,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  segmentActive: {
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  segmentTextActive: {
    color: Colors.primary,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghostBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary + '40',
  },
  ghostBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  ghostBtnTextActive: {
    color: Colors.primary,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  middleWrap: {
    flex: 1,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginVertical: 6,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardInner: {
    padding: 14,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingRight: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  titlePhonetic: {
    flexShrink: 1,
    marginLeft: 8,
    fontSize: 13,
    color: Colors.primary,
  },
  soundBtn: {
    marginLeft: 8,
    padding: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  checkBtn: {
    backgroundColor: Colors.success + '15',
    borderColor: Colors.success + '55',
  },
  detailBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  detailAnswer: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  detailNote: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  bottomPanel: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  bottomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  bottomTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tagScroll: {
    flex: 1,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: TAG_HEIGHT,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.success + '14',
    borderWidth: 1,
    borderColor: Colors.success + '33',
    maxWidth: '100%',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
    flexShrink: 1,
  },
  bottomEmpty: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  flyTag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  centerText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  loginBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
