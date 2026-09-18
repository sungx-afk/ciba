import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  SafeAreaView,
  StatusBar,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmDialog, DialogPayload } from '../components/ConfirmDialog';
import { useFocusEffect } from '@react-navigation/native';
import { useProgress } from '../storage/progressStore';
import { useAuth } from '../context/AuthContext';
import { packLibrary, RemotePack } from '../services/packLibrary';
import { Word } from '../types';
import { Colors, getCategoryColor } from '../theme/colors';
import { ProgressBar } from '../components/ProgressBar';

/** 分类卡组分页大小 */
const SUB_PAGE_SIZE = 30;
/** 今日学习单词一次拉取的数量（与 web 端一致） */
const TODAY_WORD_LIMIT = 50;
/**
 * 今日学习单词池的卡片状态过滤：0 未学 / 1 学习中 / 2、3 学习中
 * 与服务端 today_card_count 口径一致（新词 + 学习中），已记住(4) 不再出现在今日学习里
 */
const TODAY_WORD_TYPES = [0, 1, 2, 3];
/** 复习待办：已经学过、但还没记住的卡片（1、2、3 为学习中状态） */
const REVIEW_WORD_TYPES = [1, 2, 3];
/** 今日单词折叠时预览条数 */
const TODAY_PREVIEW_COUNT = 5;
/** 分类卡组默认展示的记住状态: 0 未记住 + 1 进行中 */
const LEARNING_REMEMBER_TYPES = [0, 1];
/** 「已记住」tab: remember_type = 2（已记住数量 = 词数） */
const REMEMBERED_REMEMBER_TYPES = [2];
/** 新安装卡组同步分类卡组时的数量上限，达到即视为同步完成，不再继续轮询 */
const SUB_PACK_SYNC_LIMIT = 20;
/**
 * 已确认没有更多数据时，再次触底的探测间隔。
 * 服务端 total 可能滞后，留一个间隔让用户可以触底重试，同时避免连续发请求。
 */
const SUB_PROBE_INTERVAL = 3000;

interface HomeScreenProps {
  navigation: any;
}

/** 合并分页数据并按 id 去重 */
function mergePacks(prev: RemotePack[], next: RemotePack[]): RemotePack[] {
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

/**
 * 分类卡组是否已「全部记住」
 * 服务端 remembered_card_count 不实时更新，叠加本地学习增量后再比较
 */
function isPackFullyRemembered(pack: RemotePack, delta = 0): boolean {
  const total = pack.card_count || 0;
  if (total <= 0) return false; // 空卡组不算已记住
  const remembered = Math.max(0, Math.min(total, (pack.remembered_card_count || 0) + delta));
  return remembered >= total;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const {
    stats,
    isLoggedIn,
    user,
    currentPack,
    todayWords,
    todayWordsTotal,
    todayWordsPackId,
    isLoadingTodayWords,
    loadTodayWords,
    isLoadingPackWords,
    packWordsPackId,
    loadPackWordList,
    installedPack,
    setInstalledPack,
    packMasteredDelta,
    resetPackMasteredDelta,
    dropPackMasteredDelta,
    currentTopPack,
    setCurrentTopPack,
    resetCurrentTopPack,
    readRememberedTopPack,
  } = useProgress();

  // 登录态恢复中（避免未登录提示闪一下）
  const { isLoading: authLoading } = useAuth();

  // 顶部切换: 我的卡组 (/anki/pack.json, parentId = 0)
  const [topPacks, setTopPacks] = useState<RemotePack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  // currentTopPack 由全局 store 持有，其它页面也能读到当前显示的是哪个卡组
  const selectedTop = currentTopPack;
  const setSelectedTop = setCurrentTopPack;

  // 分类卡组列表 (/anki/pack.json?parentId = 父卡组 id)
  const [subPacks, setSubPacks] = useState<RemotePack[]>([]);
  const [subTotal, setSubTotal] = useState(0);
  /**
   * 未记住的卡组（remember_type = 0,1）单独留一份：
   * 今日学习看板、默认选中的分类、背词队列都只认它，
   * 切到「已记住」tab 或点击已记住的卡组都不会影响今日学习的数据。
   */
  const [learningPacks, setLearningPacks] = useState<RemotePack[]>([]);
  /** 分类卡组列表筛选: learning 未记住+进行中 / remembered 已记住 */
  const [subTab, setSubTab] = useState<'learning' | 'remembered'>('learning');
  /** 「已记住」分类卡组的数量，显示在 tab 上 */
  const [rememberedTotal, setRememberedTotal] = useState<number | null>(null);
  /** 「未记住」分类卡组的数量，显示在左侧 tab 上 */
  const [learningTotal, setLearningTotal] = useState<number | null>(null);
  // 当前 subPacks 属于哪个父卡组（避免切换顶部卡组时用旧列表做默认选中）
  const [subPacksParentId, setSubPacksParentId] = useState<number | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<RemotePack | null>(null);
  const [showAllToday, setShowAllToday] = useState(false);
  /** 复习待办: 当前分类卡组下「学过但没记住」的单词（服务端实时返回） */
  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [loadingReview, setLoadingReview] = useState(false);
  // 新安装卡组的子卡组同步中
  const [preparingPack, setPreparingPack] = useState(false);
  const [preparedCount, setPreparedCount] = useState(0);

  // 已提示过前往卡组市场（避免重复跳转）
  const marketPromptedRef = useRef(false);
  // 刚安装的卡组 id（服务端在后台线程复制子卡组，需要轮询等待）
  const justInstalledRef = useRef<number | null>(null);
  // 已按该账号拉取过卡组（登录/切换账号时重新拉取）
  const loadedUserIdRef = useRef<string | null>(null);
  // 上次记住的卡组名（列表加载完成前先占位显示）
  const [lastPackName, setLastPackName] = useState<string | null>(null);
  // 当前卡组的镜像，供异步回调里读取最新值
  const currentTopPackRef = useRef<RemotePack | null>(null);
  useEffect(() => {
    currentTopPackRef.current = currentTopPack;
  }, [currentTopPack]);

  /**
   * 顶层卡组为空时（例如在「切换词库」里把当前卡组删掉了），
   * 回退到当前在线词库，避免首页没有焦点导致子卡组、今日任务与今日单词都是空的。
   */
  useEffect(() => {
    if (currentTopPack || !currentPack) return;
    const matched = topPacks.find((p) => Number(p.id) === Number((currentPack as any).id));
    if (matched) setSelectedTop(matched);
  }, [currentTopPack, currentPack, topPacks, setSelectedTop]);
  // 子卡组加载代次，避免旧请求覆盖新结果
  const subLoadGenRef = useRef(0);
  // 已自动选过默认分类卡组的父卡组 id（用户手动切换后不再覆盖）
  const autoPickedPackRef = useRef<number | null>(null);
  // 复习待办请求代次，避免旧结果覆盖新结果
  const reviewReqRef = useRef(0);
  // 最近一次的状态快照，供「重新聚焦时刷新」在回调里读取最新值
  const homeRefreshRef = useRef<{
    selectedTop: RemotePack | null;
    activeSub: RemotePack | null;
    subPackCount: number;
  }>({ selectedTop: null, activeSub: null, subPackCount: 0 });
  useEffect(() => {
    homeRefreshRef.current = {
      selectedTop,
      activeSub,
      subPackCount: subPacks.length,
    };
  }, [selectedTop, activeSub, subPacks.length]);

  // 当前子卡组列表的镜像：请求下一页时要拿它去重，也是判断是否还有新增的依据
  const subPacksRef = useRef<RemotePack[]>([]);
  useEffect(() => {
    subPacksRef.current = subPacks;
  }, [subPacks]);
  /**
   * 上一次翻页是否已经确认「没有更多」。
   * 服务端的 total 可能滞后于真实数据（新安装的卡组还在后台复制子卡组，
   * 同步轮询到 SUB_PACK_SYNC_LIMIT 就结束了），所以不能只拿 total 当终点，
   * 到底部时还会再翻一次验证；只有真的翻出 0 条新增才把它置 true。
   * 置 true 后仍允许按 PROBE_INTERVAL 节流地重试，服务端补上数据能自动接上。
   */
  const noMoreSubsRef = useRef(false);
  /** 上一次「到底部探测」的时间戳，防止用户反复触底时疯狂发请求 */
  const lastProbeAtRef = useRef(0);

  // 「未记住」分类卡组的镜像：刷新后要拿它和服务端新数据比对，判断本地增量是否被消化
  const learningPacksRef = useRef<RemotePack[]>([]);
  useEffect(() => {
    learningPacksRef.current = learningPacks;
  }, [learningPacks]);

  // 「已掌握数量」本地增量的镜像：loadSubPacks 要读到最新值，又不想让它成为 useCallback 的依赖
  const masteredDeltaRef = useRef(packMasteredDelta);
  useEffect(() => {
    masteredDeltaRef.current = packMasteredDelta;
  }, [packMasteredDelta]);

  /** 还没被服务端数据消化的本地增量: packId -> { delta, base: 学习前服务端已掌握数 } */
  const pendingDeltaRef = useRef<Record<number, { delta: number; base: number }>>({});

  // 当前 tab 的镜像：刷新 tab 数字时避免在闭包里读到旧值
  const subTabRef = useRef(subTab);
  useEffect(() => {
    subTabRef.current = subTab;
  }, [subTab]);

  /** 顶部卡组: 我的卡组 */
  const loadTopPacks = useCallback(async () => {
    setLoadingPacks(true);
    setErrorMsg(null);
    try {
      const { packs } = await packLibrary.fetchMyPacks({ start: 0, limit: 50 });
      setTopPacks(packs);

      // 我的卡组为空: 引导前往卡组市场添加卡组
      if (!packs.length) {
        // 仅清内存，避免服务端偶发返回空列表时误删「上次记住的卡组」
        resetCurrentTopPack();
        setSubPacks([]);
        setSubTotal(0);
        setSubPacksParentId(null);
        if (!marketPromptedRef.current && isLoggedIn) {
          marketPromptedRef.current = true;
          navigation.navigate('Market', { firstSetup: true });
        }
        return;
      }
      marketPromptedRef.current = false;

      // 读取上次记住的卡组 id
      const rememberedInfo = await readRememberedTopPack();
      const rememberedId = rememberedInfo?.id ?? null;

      // ① 本次已选过且仍存在 -> 保持
      const prev = currentTopPackRef.current;
      if (prev && packs.some((p) => Number(p.id) === Number(prev.id))) return;
      // ② 上次记住的卡组；不存在则 ③ currentPack；再退回 ④ 第一个
      // 注意: 服务端 id 可能返回字符串，统一转成数字再比较
      const remembered =
        rememberedId !== null ? packs.find((p) => Number(p.id) === rememberedId) : undefined;
      const saved = currentPack
        ? packs.find((p) => Number(p.id) === Number(currentPack.id))
        : undefined;
      setSelectedTop(remembered || saved || packs[0] || null);
    } catch (e: any) {
      setErrorMsg(e?.message || '加载我的卡组失败');
    } finally {
      setLoadingPacks(false);
    }
  }, [
    currentPack?.id,
    isLoggedIn,
    navigation,
    readRememberedTopPack,
    resetCurrentTopPack,
    setCurrentTopPack,
  ]);

  /**
   * 用服务端最新数据对齐本地「已掌握数量」增量。
   * 服务端 remembered_card_count 是异步汇总的，刚学完拉到的数据常常还是旧值，
   * 所以只有「服务端数字已经把本地学习结果算进去」时才丢掉对应卡组的增量，
   * 否则继续保留本地增量，避免学完之后「已记住 x/y」反而回落。
   * 每个增量在产生时记下当时的服务端数字做基准，多次刷新也不会把判据算偏。
   */
  const reconcileMasteredDelta = useCallback(
    (fresh: RemotePack[]) => {
      const deltas = masteredDeltaRef.current;
      const pending = pendingDeltaRef.current;
      if (!deltas || !Object.keys(deltas).length) {
        if (Object.keys(pending).length) pendingDeltaRef.current = {};
        return;
      }
      // 本次刷新前已知的服务端数字（上一次加载的快照）
      const snapshot = new Map(
        learningPacksRef.current.map((p) => [Number(p.id), p.remembered_card_count || 0])
      );
      const absorbed: number[] = [];
      for (const pack of fresh) {
        const id = Number(pack.id);
        const delta = deltas[id] || 0;
        if (!delta) {
          delete pending[id];
          continue;
        }
        const now = pack.remembered_card_count || 0;
        let entry = pending[id];
        // 第一次看到该增量（或增量又变了）时才更新基准，保证基准始终是「学习前的值」
        if (!entry || entry.delta !== delta) {
          entry = { delta, base: snapshot.get(id) ?? now };
          pending[id] = entry;
        }
        // 服务端已追上本地增量，或该卡组已经全部记住 -> 增量作废，避免叠加重复计算
        if (now >= entry.base + entry.delta || now >= (pack.card_count || 0)) {
          absorbed.push(id);
        }
      }
      for (const id of absorbed) delete pending[id];
      if (absorbed.length) dropPackMasteredDelta(absorbed);
    },
    [dropPackMasteredDelta]
  );

  /**
   * 某个父卡组下的分类卡组
   * silent = true 时不显示 loading（用于从闪卡页返回后的静默刷新）
   */
  const loadSubPacks = useCallback(
    async (
      parentId: number,
      start: number,
      limit = SUB_PAGE_SIZE,
      silent = false,
      rememberTypes: number[] = LEARNING_REMEMBER_TYPES
    ) => {
      const gen = ++subLoadGenRef.current;
      if (!silent) setLoadingSubs(true);
      try {
        const { packs, total } = await packLibrary.fetchSubPacks(parentId, {
          start,
          limit,
          rememberTypes,
        });
        if (gen !== subLoadGenRef.current) return;
        // 重新拉取「未记住」第一页后对齐本地「已掌握」增量；
        // 切到「已记住」tab 不能清，否则今日学习里的已掌握数字会回落
        if (start === 0 && rememberTypes.includes(0)) reconcileMasteredDelta(packs);
        if (start === 0) {
          // 重取第一页 = 重新开始的这份列表，推翻上一次「没有更多」的结论
          noMoreSubsRef.current = false;
          setSubPacks(packs);
        } else {
          // 这一页有没有带来新增才是真正的终点：服务端返回的 total 可能偏小，
          // 也可能返回已在列表里的重复数据，两者都不能当作「没有了」
          const seen = new Set(subPacksRef.current.map((p) => Number(p.id)));
          noMoreSubsRef.current = packs.every((p) => seen.has(Number(p.id)));
          setSubPacks((prev) => mergePacks(prev, packs));
        }
        setSubTotal(total);
        setSubPacksParentId(parentId);
        // 未记住的数据另外留一份给今日学习看板，切换 tab 时它保持不变
        if (rememberTypes.includes(0)) {
          setLearningPacks((prev) => (start === 0 ? packs : mergePacks(prev, packs)));
        }
      } catch (e: any) {
        if (gen !== subLoadGenRef.current) return;
        if (!silent) setErrorMsg(e?.message || '加载分类卡组失败');
      } finally {
        // 只要不是静默刷新就一定要复位 loading：
        // 若本请求已被更新的请求取代，那个请求会自己接管 loading 状态，
        // 这里再判断代次会让 loadingSubs 永久卡在 true。
        if (!silent) setLoadingSubs(false);
      }
    },
    [reconcileMasteredDelta]
  );

  /**
   * 只刷新当前父级卡组自身的统计（总词数 / 已掌握）。
   * 顶部「今日学习」卡片的这两个数字取父级卡组的全量口径
   * （子卡组列表是分页拉取的，逐条累加会偏少），所以学完返回后要重新取一次。
   * 走「我的卡组」列表接口，避免详情接口的浏览数自增副作用。
   */
  const refreshSelectedTopStats = useCallback(
    async (topId: number) => {
      try {
        const { packs } = await packLibrary.fetchMyPacks({ start: 0, limit: 50 });
        const fresh = packs.find((p) => Number(p.id) === Number(topId));
        const prev = currentTopPackRef.current;
        // 期间用户可能已切换卡组，不匹配则放弃
        if (!fresh || !prev || Number(prev.id) !== Number(fresh.id)) return;
        setSelectedTop({
          ...prev,
          card_count: fresh.card_count ?? prev.card_count,
          remembered_card_count: fresh.remembered_card_count ?? prev.remembered_card_count,
        });
      } catch {
        // 静默失败: 保留原有统计数据
      }
    },
    [setSelectedTop]
  );

  /** 取某个记住状态下的分类卡组数量（只取 total，用于 tab 上的数字） */
  const loadSubPackCount = useCallback(async (parentId: number, rememberTypes: number[]) => {
    try {
      const { total } = await packLibrary.fetchSubPacks(parentId, {
        start: 0,
        limit: 1,
        rememberTypes,
      });
      return total;
    } catch {
      return null;
    }
  }, []);

  /**
   * 重新取两个 tab 的数量（「分类卡组」/「已记住」）。
   * 列表自身的结果只会更新当前 tab 的数字，另一个 tab 必须单独取一次，
   * 否则学完返回后有卡组整组变成「已记住」时，另一个 tab 的数字会停在旧值。
   */
  const refreshTabCounts = useCallback(
    async (parentId: number) => {
      const isLearning = subTabRef.current === 'learning';
      const currentTypes = isLearning ? LEARNING_REMEMBER_TYPES : REMEMBERED_REMEMBER_TYPES;
      const otherTypes = isLearning ? REMEMBERED_REMEMBER_TYPES : LEARNING_REMEMBER_TYPES;
      const [currentTotal, otherTotal] = await Promise.all([
        loadSubPackCount(parentId, currentTypes),
        loadSubPackCount(parentId, otherTypes),
      ]);
      if (currentTotal != null) {
        if (isLearning) setLearningTotal(currentTotal);
        else setRememberedTotal(currentTotal);
      }
      if (otherTotal != null) {
        if (isLearning) setRememberedTotal(otherTotal);
        else setLearningTotal(otherTotal);
      }
    },
    [loadSubPackCount]
  );

  /**
   * 刚安装的卡组: 服务端在后台线程逐个复制子卡组，
   * 这里轮询 /anki/pack.json?parentId=xxx 直到数量连续两次一致（视为复制完成）。
   */
  const loadSubPacksUntilReady = useCallback(async (parentId: number) => {
    const gen = ++subLoadGenRef.current;
    const intervalMs = 3000;
    const maxAttempts = 60; // 最多约 3 分钟
    const emptyGiveUp = 10; // 一直为 0 则 30 秒后放弃
    let lastTotal = -1;
    let stableTimes = 0;

    setLoadingSubs(true);
    setPreparingPack(true);
    setPreparedCount(0);
    resetPackMasteredDelta();
    try {
      for (let i = 0; i < maxAttempts; i++) {
        const { packs, total } = await packLibrary.fetchSubPacks(parentId, {
          start: 0,
          limit: SUB_PAGE_SIZE,
        });
        if (gen !== subLoadGenRef.current) return false;

        setSubPacks(packs);
        setSubTotal(total);
        setSubPacksParentId(parentId);
        setPreparedCount(total);
        // 这里拿到的可能只是服务端同步到一半的快照，
        // 剩下的交给触底加载继续补，所以不能标记成「没有更多」
        noMoreSubsRef.current = false;

        // 数量已达上限：服务端已基本复制完成，直接结束同步，不再继续触发
        if (total >= SUB_PACK_SYNC_LIMIT) return true;

        // 首个分类卡组也要已经有词，避免只建了卡组还没复制卡片
        const firstPackReady = packs.length === 0 || (packs[0]?.card_count || 0) > 0;
        if (total > 0 && total === lastTotal && firstPackReady) {
          stableTimes += 1;
          if (stableTimes >= 2) return true; // 数量与内容都已稳定，视为复制完成
        } else {
          stableTimes = 0;
        }

        if (total === 0 && i + 1 >= emptyGiveUp) break; // 迟迟没有数据，放弃
        lastTotal = total;

        if (i < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      return false;
    } catch (e: any) {
      if (gen === subLoadGenRef.current) setErrorMsg(e?.message || '加载分类卡组失败');
      return false;
    } finally {
      // 与 loadSubPacks 同理：被更新的请求取代时也要复位，避免同步条一直转
      setPreparingPack(false);
      setLoadingSubs(false);
    }
  }, [resetPackMasteredDelta]);

  // 启动时先读取上次记住的卡组名，用于占位显示
  useEffect(() => {
    (async () => {
      const remembered = await readRememberedTopPack();
      if (remembered?.name) setLastPackName(remembered.name);
    })();
  }, [readRememberedTopPack]);

  /**
   * 清空上一个账号残留的界面数据：卡组列表、今日学习、复习待办等，
   * 避免切换账号的瞬间把 A 账号的数据显示在 B 账号上。
   */
  const resetAccountScopedUi = () => {
    setLearningPacks([]);
    setSubPacksParentId(null);
    setRememberedTotal(null);
    setLearningTotal(null);
    setReviewWords([]);
    setReviewTotal(0);
    setLoadingReview(false);
    setShowAllToday(false);
    setSubTab('learning');
    setErrorMsg(null);
    setLastPackName(null);
    autoPickedPackRef.current = null;
    justInstalledRef.current = null;
    marketPromptedRef.current = false;
  };

  // 登录成功后（或切换账号后）用最新登录信息重新拉取我的卡组
  useEffect(() => {
    // 登录态仍在异步读取中，先不要做任何清空，避免误删「上次记住的卡组」
    if (authLoading) return;

    if (!isLoggedIn) {
      loadedUserIdRef.current = null; // 退出登录后允许再次登录时重新拉取
      // 清空上一账号残留的卡组数据（仅内存，保留本地记住的卡组）
      setTopPacks([]);
      resetCurrentTopPack();
      setSubPacks([]);
      setSubTotal(0);
      setActiveSub(null);
      setLoadingPacks(false); // 未登录时不发请求，需手动结束 loading
      resetAccountScopedUi();
      return;
    }
    const uid = String((user as any)?.id ?? '');
    if (loadedUserIdRef.current === uid) return; // 同一账号避免重复请求
    // 切换到另一个账号：先清掉上一个账号的列表与今日学习数据，再重新拉取
    if (loadedUserIdRef.current !== null) resetAccountScopedUi();
    loadedUserIdRef.current = uid;
    loadTopPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, (user as any)?.id]);

  /** 当前 tab 对应的记住状态过滤 */
  const currentRememberTypes =
    subTab === 'remembered' ? REMEMBERED_REMEMBER_TYPES : LEARNING_REMEMBER_TYPES;

  /** 切换父卡组或 tab 后，当前 tab 的数字跟着更新 */
  useEffect(() => {
    if (subTab === 'remembered') setRememberedTotal(subTotal);
    else setLearningTotal(subTotal);
  }, [subTab, subTotal]);

  // 记录上一次加载的父卡组，用于区分「切父卡组」和「切 tab」
  const lastParentIdRef = useRef<number | null>(null);

  /**
   * 重新拉取分类卡组：切换父卡组或切换「未记住 / 已记住」tab 时触发。
   * 只有父卡组变化才清空当前选中的分类卡组，切 tab 时保留，避免今日学习区被清空。
   */
  useEffect(() => {
    if (!selectedTop) return;
    const parentChanged = lastParentIdRef.current !== selectedTop.id;
    lastParentIdRef.current = selectedTop.id;

    setSubPacks([]);
    setSubTotal(0);
    // 换了父卡组 / tab 就是一份全新列表，之前的「没有更多」结论作废
    noMoreSubsRef.current = false;
    if (parentChanged) {
      setSubPacksParentId(null);
      setActiveSub(null);
      setShowAllToday(false);
      // 刚安装的卡组走轮询，等服务端把子卡组复制完
      if (justInstalledRef.current === selectedTop.id) {
        justInstalledRef.current = null;
        loadSubPacksUntilReady(selectedTop.id);
        return;
      }
    }

    loadSubPacks(selectedTop.id, 0, SUB_PAGE_SIZE, false, currentRememberTypes);
    // 顺带取另一个 tab 的数量，保证两个 tab 上都有数字
    const otherTypes = subTab === 'learning' ? REMEMBERED_REMEMBER_TYPES : LEARNING_REMEMBER_TYPES;
    loadSubPackCount(selectedTop.id, otherTypes).then((total) => {
      if (total == null) return;
      if (subTab === 'learning') setRememberedTotal(total);
      else setLearningTotal(total);
    });
  }, [
    selectedTop?.id,
    subTab,
    currentRememberTypes,
    loadSubPacks,
    loadSubPacksUntilReady,
    loadSubPackCount,
  ]);

  /**
   * 闪卡页点「继续学习下一个卡组」后，store 里的今日单词卡组会变成下一个子卡组，
   * 这里跟着同步高亮，避免返回首页后显示成上一个卡组的加载态。
   * 注意: 每次都用列表里的最新卡组对象，保证「今日已学」等数字刷新后能同步。
   */
  useEffect(() => {
    if (todayWordsPackId == null) return;
    // 只在未记住的卡组里匹配，切到「已记住」tab 时今日学习区不会被顶掉
    const matched = learningPacks.find((p) => Number(p.id) === Number(todayWordsPackId));
    if (!matched) return;
    setActiveSub((prev) => (Number(prev?.id) === Number(matched.id) ? prev : matched));
  }, [todayWordsPackId, learningPacks]);

  /**
   * 列表刷新后把当前选中的分类卡组换成列表里的新对象，
   * 否则「今日任务 / 今日已学」等数字会一直停留在进入单词列表页之前的旧数据上。
   */
  useEffect(() => {
    if (!activeSub) return;
    const fresh = learningPacks.find((p) => Number(p.id) === Number(activeSub.id));
    if (fresh && fresh !== activeSub) setActiveSub(fresh);
  }, [activeSub, learningPacks]);

  // 只有真的切到另一个分类时才收起今日单词展开，避免切 tab 时列表被折叠
  useEffect(() => {
    setShowAllToday(false);
  }, [activeSub?.id]);

  const reloadAll = useCallback(async () => {
    await loadTopPacks();
    if (selectedTop) {
      await loadSubPacks(selectedTop.id, 0, SUB_PAGE_SIZE, false, currentRememberTypes);
      refreshTabCounts(selectedTop.id);
    }
  }, [loadTopPacks, loadSubPacks, refreshTabCounts, selectedTop, currentRememberTypes]);

  /**
   * 触底加载：只在「确实翻不到新数据」时才停。
   * 服务端给的 total 可能小于真实数量（新安装的卡组后台还在复制子卡组，
   * 轮询到 SUB_PACK_SYNC_LIMIT 就结束了），所以只要还没被这一页结果否掉，
   * 触底就会再按当前长度往后翻一页验证，翻出数据就继续接上。
   */
  const handleLoadMore = () => {
    if (loadingSubs || loadingPacks || !selectedTop) return;
    if (subPacks.length === 0) return; // 首屏第一页由列表自己拉，这里不重复请求

    const now = Date.now();
    // 上一次确实没翻到数据时节流重试，避免用户反复触底时连续发请求
    if (noMoreSubsRef.current && now - lastProbeAtRef.current < SUB_PROBE_INTERVAL) return;
    lastProbeAtRef.current = now;

    loadSubPacks(selectedTop.id, subPacks.length, SUB_PAGE_SIZE, false, currentRememberTypes);
  };

  /** 打开卡组市场 */
  const handleOpenMarket = () => {
    if (!isLoggedIn) {
      promptLogin();
      return;
    }
    navigation.navigate('Market');
  };

  /** 市场安装完成: 刷新我的卡组并切换到新安装的卡组 */
  const handleMarketInstalled = useCallback(async () => {
    if (!installedPack) return;
    // 标记为新安装，后续会轮询等待其子卡组复制完成
    justInstalledRef.current = installedPack.id;
    await loadTopPacks();
    setSelectedTop(installedPack);
    setInstalledPack(null);
  }, [installedPack, loadTopPacks, setInstalledPack]);

  useEffect(() => {
    handleMarketInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedPack]);

  /** 统一弹窗状态：确认/提示一律走 ConfirmDialog，不再使用系统 Alert */
  const [dialog, setDialog] = useState<DialogPayload | null>(null);

  /** 只有一个「确定」的纯提示弹窗 */
  const showNotice = useCallback((title: string, message: string) => {
    setDialog({ title, message, showCancel: false });
  }, []);

  const promptLogin = () => {
    setDialog({
      title: '需要登录',
      message: '请先登录后再使用在线卡组',
      confirmText: '去登录',
      onConfirm: () => {
        setDialog(null);
        navigation.navigate('Login');
      },
    });
  };

  /** 确保已加载某个分类卡组的今日学习单词 */
  const ensureTodayWords = useCallback(
    async (pack: RemotePack): Promise<Word[]> => {
      if (todayWordsPackId === pack.id && todayWords.length > 0) {
        return todayWords;
      }
      setActiveSub(pack);
      setShowAllToday(false);
      return await loadTodayWords(pack.id, {
        start: 0,
        limit: TODAY_WORD_LIMIT,
        types: TODAY_WORD_TYPES,
        cat: selectedTop?.name || '',
        sub: pack.name || '',
      });
    },
    [todayWordsPackId, todayWords, loadTodayWords, selectedTop?.name]
  );

  /**
   * 分类卡组列表加载完成后自动选中默认卡组（用户没手动点过时）:
   *   ① 闪卡页「继续学习下一个卡组」后 store 里的卡组仍在该列表 -> 保持它
   *   ② 第一个「未全部记住」的分类卡组
   *   ③ 都已记住时，退而取第一个今日还有单词的分类卡组
   * 同一父卡组只自动选一次，避免覆盖用户手动切换的结果。
   */
  useEffect(() => {
    // 只在「分类卡组」tab 下自动挑默认分类，切到已记住时不重复拉取今日单词
    if (subTab !== 'learning') return;
    if (!selectedTop || subPacksParentId !== selectedTop.id) return;
    if (!learningPacks.length) return;
    if (preparingPack) return; // 新安装卡组还在同步子卡组，等同步完再选
    if (autoPickedPackRef.current === selectedTop.id) return;

    const fromStudy =
      todayWordsPackId != null
        ? learningPacks.find((p) => Number(p.id) === Number(todayWordsPackId))
        : undefined;
    const target =
      fromStudy ||
      learningPacks.find((p) => !isPackFullyRemembered(p, packMasteredDelta[p.id] || 0)) ||
      learningPacks.find((p) => (p.today_card_count || 0) > 0);

    autoPickedPackRef.current = selectedTop.id;
    if (target) {
      setActiveSub(target);
      setShowAllToday(false);
      // 已缓存该卡组的今日单词时直接复用，不会重复请求
      ensureTodayWords(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedTop?.id,
    subPacksParentId,
    learningPacks,
    preparingPack,
    todayWordsPackId,
    ensureTodayWords,
  ]);

  /**
   * 拉取某个分类卡组的「复习待办」单词（type = 1/2/3，学过但还没记住）。
   * 直接调服务端接口而不写进 store，避免覆盖「今日学习单词」缓存。
   */
  const loadReviewWords = useCallback(async (pack: RemotePack, topName: string) => {
    const req = ++reviewReqRef.current;
    setLoadingReview(true);
    try {
      const { words: list, total } = await packLibrary.fetchTodayWords(pack.id, {
        start: 0,
        limit: TODAY_WORD_LIMIT,
        types: REVIEW_WORD_TYPES,
        cat: topName,
        sub: pack.name || '',
      });
      if (req !== reviewReqRef.current) return;
      setReviewWords(list);
      setReviewTotal(total || list.length);
    } catch {
      if (req !== reviewReqRef.current) return;
      setReviewWords([]);
      setReviewTotal(0);
    } finally {
      // 无条件复位：若本请求已被更新的请求取代，代次判断会让 loading 永久卡住
      setLoadingReview(false);
    }
  }, []);

  // 切换分类卡组时刷新复习待办；切到「已记住」tab 不重复请求，保持原数据不动
  useEffect(() => {
    if (subTab !== 'learning') return;
    if (!isLoggedIn || !activeSub) {
      reviewReqRef.current += 1;
      setReviewWords([]);
      setReviewTotal(0);
      setLoadingReview(false);
      return;
    }
    loadReviewWords(activeSub, selectedTop?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, activeSub?.id, selectedTop?.name, loadReviewWords, subTab]);

  /**
   * 切回「分类卡组」tab 时补一次今日学习数据（今日单词 + 复习待办）。
   * 只在已有选中分类时执行，避免首屏与上面的 effect 重复请求。
   */
  useEffect(() => {
    if (subTab !== 'learning' || !isLoggedIn || !activeSub) return;
    ensureTodayWords(activeSub).catch(() => {});
    loadReviewWords(activeSub, selectedTop?.name || '');
    // 只在切换 tab 时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  /**
   * 从闪卡页学完返回时静默刷新：父级卡组统计 + 分类卡组统计 + 今日单词 + 复习待办，
   * 保证卡片上的数字是学完之后的最新数据（首次聚焦跳过，避免重复请求）。
   */
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      if (!isLoggedIn) return;
      const { selectedTop: top, activeSub: pack, subPackCount } = homeRefreshRef.current;
      if (!top) return;
      // 保持已加载的分页长度，只静默替换最新数据
      loadSubPacks(top.id, 0, Math.max(SUB_PAGE_SIZE, subPackCount), true, currentRememberTypes);
      refreshSelectedTopStats(top.id);
      // 学完之后有分类卡组会整组移到另一个 tab，两边 tab 的数字都要重新取
      refreshTabCounts(top.id);
      if (pack) {
        loadTodayWords(pack.id, {
          start: 0,
          limit: TODAY_WORD_LIMIT,
          types: TODAY_WORD_TYPES,
          cat: top.name || '',
          sub: pack.name || '',
        }).catch(() => {});
        loadReviewWords(pack, top.name || '');
      }
    }, [
      isLoggedIn,
      loadSubPacks,
      refreshSelectedTopStats,
      refreshTabCounts,
      loadTodayWords,
      loadReviewWords,
      currentRememberTypes,
    ])
  );

  /** 打开某个子卡组的单词列表 */
  const handleOpenPackWordList = useCallback(
    async (pack: RemotePack) => {
      if (!isLoggedIn) {
        promptLogin();
        return;
      }
      try {
        const list = await loadPackWordList(pack.id, {
          cat: selectedTop?.name || '',
          sub: pack.name || '',
        });
        if (!list.length) {
          showNotice('提示', '该分类暂无单词');
          return;
        }
        navigation.navigate('WordList', { source: 'pack', title: pack.name });
      } catch (e: any) {
        showNotice('加载失败', e?.message || '获取单词列表失败');
      }
    },
    [loadPackWordList, selectedTop?.name, isLoggedIn, navigation, showNotice]
  );

  /** 开始背词: 优先用指定分类，其次当前分类，最后取第一个有今日任务的分类 */
  const handleStartStudy = useCallback(
    async (pack?: RemotePack) => {
      if (!isLoggedIn) {
        promptLogin();
        return;
      }
      // 背词只在「未记住」的卡组之间进行，与当前展示的 tab 无关
      const target =
        pack ||
        activeSub ||
        learningPacks.find((p) => (p.today_card_count || 0) > 0) ||
        learningPacks[0];
      if (!target) {
        showNotice('提示', '暂无可学习的分类卡组');
        return;
      }
      try {
        const list = await ensureTodayWords(target);
        if (!list.length) {
          showNotice('太棒了', '该分类今日没有待学习的单词');
          return;
        }
        // 把同一父卡组下的「兄弟卡组」一起带过去，学完当前卡组后可继续学下一个
        const packIndex = learningPacks.findIndex((p) => Number(p.id) === Number(target.id));
        navigation.navigate('Flashcard', {
          // 直接带单词对象，避免闪卡页再从本地缓存里反查导致进不去
          queueWords: list,
          wordIds: list.map((w) => w.id),
          title: target.name,
          // 当前子卡组 id + 顶层卡组名（继续学习下一个卡组时使用）
          packId: target.id,
          packCat: selectedTop?.name || '',
          packQueue: learningPacks.map((p) => ({ id: p.id, name: p.name })),
          packIndex,
          // 还有未加载的子卡组时，学完本页最后一个只提示、不误导
          hasMorePacks: (learningTotal ?? learningPacks.length) > learningPacks.length,
        });
      } catch (e: any) {
        showNotice('加载失败', e?.message || '获取今日学习单词失败');
      }
    },
    [
      ensureTodayWords,
      activeSub,
      learningPacks,
      learningTotal,
      selectedTop?.name,
      isLoggedIn,
      navigation,
    ]
  );

  /** 复习待办: 用服务端返回的「学过但没记住」的单词直接进入闪卡复习 */
  const handleStartReview = useCallback(() => {
    const pack = activeSub;
    if (!pack) {
      showNotice('提示', '请先点击下方分类卡组');
      return;
    }
    if (!reviewWords.length) {
      showNotice('太棒了', '该分类暂时没有需要复习的单词');
      return;
    }
    const packIndex = learningPacks.findIndex((p) => Number(p.id) === Number(pack.id));
    navigation.navigate('Flashcard', {
      queueWords: reviewWords,
      title: `${pack.name} · 复习`,
      packId: pack.id,
      packCat: selectedTop?.name || '',
      packQueue: learningPacks.map((p) => ({ id: p.id, name: p.name })),
      packIndex,
      hasMorePacks: (learningTotal ?? learningPacks.length) > learningPacks.length,
    });
  }, [activeSub, reviewWords, learningPacks, learningTotal, selectedTop?.name, navigation]);

  const handleOpenTodayList = () => {
    if (!activeSub || !todayWords.length) return;
    navigation.navigate('WordList', {
      source: 'today',
      title: activeSub.name,
    });
  };

  /**
   * 整体数据（覆盖当前父卡组下的全部分类卡组）:
   *   总词数 / 已掌握 直接取父级卡组的统计，因为下面的子卡组列表是分页拉取的，
   *   逐条累加只算到已加载的部分，数字会偏小。
   *   父级已掌握由服务端汇总子卡组维护，再叠加本地学习增量（未刷新前的乐观值）。
   * 今日任务 / 今日已学 仍按已加载子卡组累加，用于「分类卡组」标题旁的提示。
   */
  const packAgg = useMemo(() => {
    let loadedTotal = 0;
    let loadedRemembered = 0;
    let loadedDelta = 0;
    let todayTotal = 0;
    let todayLearned = 0;
    for (const p of learningPacks) {
      const t = p.card_count || 0;
      const d = packMasteredDelta[p.id] || 0;
      const dayTotal = p.today_card_count || 0;
      loadedTotal += t;
      loadedDelta += d;
      loadedRemembered += Math.max(0, Math.min(t, (p.remembered_card_count || 0) + d));
      todayTotal += dayTotal;
      todayLearned += Math.min(p.today_learned_card_count || 0, dayTotal);
    }

    // 父级卡组统计为全量口径（已覆盖未加载到的分页），取较大值兜底更稳妥
    const total = Math.max(selectedTop?.card_count || 0, loadedTotal);
    const parentRemembered = selectedTop?.remembered_card_count || 0;
    const remembered = Math.min(total, Math.max(parentRemembered + loadedDelta, loadedRemembered));
    return { total, remembered, todayTotal, todayLearned };
  }, [learningPacks, packMasteredDelta, selectedTop?.card_count, selectedTop?.remembered_card_count]);

  /** 整体掌握进度（当前卡组下所有分类卡组） */
  const masteryProgress = packAgg.total > 0 ? Math.min(1, packAgg.remembered / packAgg.total) : 0;

  /** 今日任务（当前选中的分类卡组）: 总数 / 已学 / 剩余 */
  const todayTask = useMemo(() => {
    const total = activeSub?.today_card_count || 0;
    const learned = Math.min(activeSub?.today_learned_card_count || 0, total);
    return { total, learned, remaining: Math.max(0, total - learned) };
  }, [activeSub]);

  /** 今日单词池（learn-by-menu 实时返回）: 当前分类卡组今日要学的单词总数 */
  const todayPoolTotal =
    activeSub && Number(todayWordsPackId) === Number(activeSub.id)
      ? todayWordsTotal
      : undefined;

  /** 今日学习单词预览（当前分类卡组） */
  const renderTodayWords = () => {
    if (!activeSub) return null;

    // 「已记住」tab 不刷新今日学习数据，也就不需要显示加载态
    const isLoadingThis =
      subTab === 'learning' &&
      (isLoadingTodayWords || Number(todayWordsPackId) !== Number(activeSub.id));
    const visibleWords = showAllToday ? todayWords : todayWords.slice(0, TODAY_PREVIEW_COUNT);

    return (
      <View style={styles.todayBlock}>
        <View style={styles.todayBlockHeader}>
          <Text style={styles.todayBlockTitle}>今日单词</Text>
          <Text style={styles.todayBlockCount}>
            {isLoadingThis
              ? '加载中'
              : `${todayWords.length}${todayPoolTotal ? ` / ${todayPoolTotal}` : ''} 词`}
          </Text>
          <TouchableOpacity
            style={styles.todayMoreBtn}
            onPress={handleOpenTodayList}
            activeOpacity={0.7}
            disabled={!todayWords.length}
          >
            <Text style={[styles.todayMoreText, !todayWords.length && styles.todayMoreTextDisabled]}>
              查看全部
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={todayWords.length ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {isLoadingThis ? (
          <View style={styles.todayLoading}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.todayLoadingText}>正在获取今日单词...</Text>
          </View>
        ) : todayWords.length === 0 ? (
          <Text style={styles.todayEmptyText}>该分类今日没有待学的单词，已全部掌握</Text>
        ) : (
          <>
            {visibleWords.map((w) => (
              <View key={w.id} style={styles.todayWordRow}>
                <Text style={styles.todayWordText}>{w.word}</Text>
                <Text style={styles.todayWordMeaning} numberOfLines={1}>
                  {w.meaning || w.note}
                </Text>
              </View>
            ))}

            {todayWords.length > TODAY_PREVIEW_COUNT ? (
              <TouchableOpacity
                style={styles.todayToggle}
                onPress={() => setShowAllToday((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.todayToggleText}>
                  {showAllToday ? '收起' : `展开全部 ${todayWords.length} 个单词`}
                </Text>
                <Ionicons
                  name={showAllToday ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Colors.primary}
                />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
    );
  };

  const renderSubPack = ({ item }: { item: RemotePack }) => {
    const isActive = activeSub?.id === item.id;
    const total = item.card_count || 0;
    // 服务端 remembered_card_count 不实时更新，叠加本地学习产生的增量
    const delta = packMasteredDelta[item.id] || 0;
    const remembered = Math.max(0, Math.min(total, (item.remembered_card_count || 0) + delta));
    const todayCount = item.today_card_count || 0;
    // 今日已学不会超过今日总数，避免服务端缓存导致「已学 > 待学」
    const todayLearnedCount = Math.min(item.today_learned_card_count || 0, todayCount);
    const progress = total > 0 ? Math.min(1, remembered / total) : 0;
    const color = getCategoryColor(item.name);
    const isLoadingList = isLoadingPackWords && packWordsPackId === item.id;

    return (
      <TouchableOpacity
        style={[styles.subCard, isActive && styles.subCardActive]}
        onPress={() => handleOpenPackWordList(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.subColorBar, { backgroundColor: color }]} />

        <View style={styles.subCardBody}>
          <View style={styles.subCardTop}>
            <Text style={styles.subCardName} numberOfLines={1}>
              {item.name}
            </Text>
            {isLoadingList ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : null}
            <View style={styles.subCountPill}>
              <Text style={styles.subCountPillText}>{total} 词</Text>
            </View>
          </View>

          <View style={styles.subMetaRow}>
            <Text style={styles.subMetaText}>
              已记住 {remembered}/{total}
            </Text>
            {subTab === 'learning' && todayCount > 0 ? (
              <Text style={styles.subTodayText}>
                今日 {todayLearnedCount}/{todayCount}
              </Text>
            ) : null}
          </View>

          <View style={styles.subProgressWrap}>
            <ProgressBar progress={progress} height={4} color={color} />
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  /** 固定顶部标题栏：不随列表滚动 */
  const renderTopBar = () => (
    <View style={styles.header}>
      <View style={styles.brandBlock}>
        <View style={styles.logoCircle}>
          <Image
            source={require('../assets/pinwheel.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandTitle}>糍粑英语</Text>
          <Text style={styles.brandPackName} numberOfLines={1}>
            {selectedTop?.name || lastPackName || currentPack?.name || '我的卡组'}
          </Text>
        </View>
      </View>

      <View style={styles.headerActions}>
        <View style={styles.streakBadge}>
          <Ionicons name="flame" size={15} color={Colors.pinwheelRed} />
          <Text style={styles.streakText}>{stats.streakDays} 天</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleOpenMarket} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  /** 可随列表滚动的内容：今日学习看板 + 分类卡组标题 */
  const renderListHeader = () => (
    <View>
      {/* 今日学习看板卡片 */}
      <View style={styles.dashboardCard}>
        {authLoading ? (
          /* 登录状态读取中 */
          <View style={styles.loginStateWrap}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loginStateDesc}>正在读取登录状态…</Text>
          </View>
        ) : !isLoggedIn ? (
          /* 未登录状态 */
          <>
            <View style={styles.dashHeader}>
              <View style={styles.dashTitleWrap}>
                <Text style={styles.dashTitle}>今日学习</Text>
                <Text style={styles.dashSubtitle}>未登录，登录后即可开始今日学习</Text>
              </View>
              <View style={styles.unloginTag}>
                <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.unloginTagText}>未登录</Text>
              </View>
            </View>

            <View style={styles.loginStateWrap}>
              <View style={styles.loginStateIcon}>
                <Ionicons name="log-in-outline" size={30} color={Colors.textMuted} />
              </View>
              <Text style={styles.loginStateTitle}>登录后开始今日学习</Text>
              <Text style={styles.loginStateDesc}>
                登录后可获取在线卡组的今日学习单词，并同步学习进度
              </Text>
              <TouchableOpacity
                style={styles.loginMainBtn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.8}
              >
                <Ionicons name="log-in-outline" size={17} color="#FFFFFF" />
                <Text style={styles.loginMainBtnText}>立即登录</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* 已登录状态 */
          <>
            {/* 头部: 当前卡组 + 整体掌握度 */}
            <View style={styles.dashHeader}>
              <View style={styles.dashTitleWrap}>
                <Text style={styles.dashTitle}>今日学习</Text>
                <Text style={styles.dashSubtitle} numberOfLines={1}>
                  {selectedTop ? selectedTop.name : '我的卡组'}
                  {activeSub ? ` · ${activeSub.name}` : ''}
                </Text>
              </View>
              <View style={styles.dashGoalPercent}>
                <Text style={styles.dashPercentText}>{Math.round(masteryProgress * 100)}%</Text>
              </View>
            </View>

            {/* 整体掌握进度: 词数/已掌握取自父级卡组，分类卡组数取子卡组列表接口的 total */}
            <View style={styles.dashProgressTrack}>
              <ProgressBar progress={masteryProgress} height={8} color={Colors.primary} />
            </View>
            <View style={styles.dashProgressMeta}>
              <Text style={styles.dashProgressMetaText}>
                已掌握 {packAgg.remembered}/{packAgg.total} 词
              </Text>
              <Text style={styles.dashProgressMetaText}>
                共 {learningTotal ?? learningPacks.length} 个未记住分类卡组
              </Text>
            </View>

            {activeSub ? (
              /* 今日任务: 当前分类卡组 */
              <View style={styles.todayTaskBox}>
                <View style={styles.todayTaskHeader}>
                  <Text style={styles.todayTaskTitle} numberOfLines={1}>
                    今日任务 · {activeSub.name}
                  </Text>
                  <Text style={styles.todayTaskTotal}>
                    {todayTask.total > 0 ? `共 ${todayTask.total} 词` : '已完成'}
                  </Text>
                </View>

                {todayTask.total > 0 ? (
                  <>
                    <View style={styles.todayTaskBarWrap}>
                      <ProgressBar
                        progress={todayTask.learned / todayTask.total}
                        height={6}
                        color={Colors.success}
                      />
                    </View>

                    <View style={styles.todayTaskMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricNumber}>{todayTask.learned}</Text>
                        <Text style={styles.metricLabel}>已学</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricNumber}>{todayTask.remaining}</Text>
                        <Text style={styles.metricLabel}>剩余待学</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricNumber}>
                          {subTab === 'learning' && loadingReview ? '…' : reviewTotal}
                        </Text>
                        <Text style={styles.metricLabel}>待复习</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.todayTaskDone}>
                    <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                    <Text style={styles.todayTaskDoneText}>
                      该分类今天的单词已学完，可以点「复习待办」巩固一下
                    </Text>
                  </View>
                )}

                <View style={styles.dashActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.reviewBtn,
                      (!reviewTotal || (subTab === 'learning' && loadingReview)) &&
                      styles.actionBtnDisabled,
                    ]}
                    onPress={handleStartReview}
                    activeOpacity={0.8}
                    disabled={!reviewTotal || (subTab === 'learning' && loadingReview)}
                  >
                    {subTab === 'learning' && loadingReview ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name="repeat" size={18} color={Colors.primary} />
                    )}
                    <Text style={styles.reviewBtnText}>复习待办</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={() => handleStartStudy(activeSub)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="flash" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>开始背词</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.todayHintWrap}>
                <Ionicons name="sparkles-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.todayHintText}>点击下方分类卡组，查看并开始今日学习</Text>
              </View>
            )}

            {renderTodayWords()}
          </>
        )}
      </View>

      {/* 分类卡组两个 tab：未记住（默认）/ 已记住 */}
      <View style={styles.sectionHeader}>
        <TouchableOpacity
          style={[styles.subTabPill, subTab === 'learning' && styles.subTabPillActive]}
          onPress={() => setSubTab('learning')}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text
            style={[styles.subTabPillText, subTab === 'learning' && styles.subTabPillTextActive]}
          >
            分类卡组{learningTotal ? ` ${learningTotal}` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rememberedTab, subTab === 'remembered' && styles.rememberedTabActive]}
          onPress={() => setSubTab('remembered')}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={subTab === 'remembered' ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={13}
            color={subTab === 'remembered' ? '#FFFFFF' : Colors.success}
          />
          <Text
            style={[
              styles.rememberedTabText,
              subTab === 'remembered' && styles.rememberedTabTextActive,
            ]}
          >
            已记住{rememberedTotal != null ? ` ${rememberedTotal}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 新安装卡组的子卡组同步进度 */}
      {preparingPack ? (
        <View style={styles.preparingBar}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.preparingText}>
            卡组数据同步中… 已获取 {preparedCount} 个分类卡组
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderEmpty = () => {
    if (authLoading || loadingPacks || loadingSubs) {
      return (
        <View style={styles.centerPadding}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>正在加载卡组...</Text>
        </View>
      );
    }
    // 未登录: 登录入口已放在「今日学习」卡片，这里只做无按钮的占位提示
    if (!isLoggedIn) {
      return (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={26} color={Colors.textMuted} />
          <Text style={styles.lockedTitle}>分类卡组已锁定</Text>
          <Text style={styles.lockedDesc}>在上方「今日学习」中登录后即可查看</Text>
        </View>
      );
    }
    if (errorMsg) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reloadAll} activeOpacity={0.8}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // 我的卡组为空: 引导去卡组市场添加
    if (topPacks.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="albums-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>你还没有卡组，请先从卡组市场添加分类背单词卡组后才能使用</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => navigation.navigate('Market', { firstSetup: true })}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>去卡组市场</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="albums-outline" size={48} color={Colors.border} />
        <Text style={styles.emptyText}>
          {subTab === 'remembered' ? '暂无已记住的分类卡组' : '暂无未记住的分类卡组'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* 固定顶部标题栏 */}
      {renderTopBar()}

      <FlatList
        data={subPacks}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderSubPack}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loadingSubs && subPacks.length > 0 ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : null
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={loadingPacks} onRefresh={reloadAll} colors={[Colors.primary]} />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
  listContent: {
    paddingBottom: 40,
  },
  // 顶部标题栏：主色浅底 + 底部圆角，与下方看板形成层次
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Colors.primaryLight,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  brandBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    minWidth: 0,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary + '26',
  },
  brandTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  logoImage: {
    width: 26,
    height: 26,
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  brandPackName: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.pinwheelRed,
    marginLeft: 4,
  },


  // 今日学习看板
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
  dashTitleWrap: {
    flex: 1,
    marginRight: 8,
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
  // 未登录标记
  unloginTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.divider,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  unloginTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  // 未登录引导区
  loginStateWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  loginStateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loginStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  loginStateDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  loginMainBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  loginMainBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dashPercentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  dashProgressTrack: {
    marginTop: 14,
  },
  dashProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  dashProgressMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  // 今日任务（当前分类卡组）
  todayTaskBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  todayTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  todayTaskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  todayTaskTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  todayTaskBarWrap: {
    marginBottom: 12,
  },
  todayTaskMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  todayTaskDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.success + '12',
  },
  todayTaskDoneText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
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
  actionBtnDisabled: {
    opacity: 0.45,
  },

  // 今日学习单词列表
  todayHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: 6,
  },
  todayHintText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  todayBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  todayBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  todayBlockTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  todayBlockCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  todayMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  todayMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  todayMoreTextDisabled: {
    color: Colors.textMuted,
  },
  todayLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  todayLoadingText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  todayEmptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 14,
  },
  todayWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  todayWordText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    width: 110,
    marginRight: 10,
  },
  todayWordMeaning: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  todayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  todayToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  todayActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  todayOutlineBtn: {
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
  todayOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  todayPrimaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  todayPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 分类卡组
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  // 左侧「分类卡组」tab（未记住 + 进行中）
  subTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subTabPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  subTabPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  subTabPillTextActive: {
    color: '#FFFFFF',
  },
  // 「已记住」tab：remember_type = 2
  rememberedTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: Colors.success + '14',
    borderWidth: 1,
    borderColor: Colors.success + '33',
  },
  rememberedTabActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  rememberedTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
  rememberedTabTextActive: {
    color: '#FFFFFF',
  },
  preparingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    gap: 8,
  },
  preparingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  subCardActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  subColorBar: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  subCardBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  subCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subCardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  subCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.divider,
  },
  subCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  subMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  subTodayText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  subProgressWrap: {
    marginTop: 8,
  },

  // 未登录时的分类卡组占位（无按钮，避免与上方登录入口重复）
  lockedBox: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    gap: 8,
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  lockedDesc: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  // 空态 / 加载
  centerPadding: {
    paddingTop: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 30,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 12,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
