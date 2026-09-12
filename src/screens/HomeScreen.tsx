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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  // 顶部卡组下拉选择
  const selectorRef = useRef<View>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(120);

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
   * 某个父卡组下的分类卡组
   * silent = true 时不显示 loading（用于从闪卡页返回后的静默刷新）
   */
  const loadSubPacks = useCallback(
    async (parentId: number, start: number, limit = SUB_PAGE_SIZE, silent = false) => {
      const gen = ++subLoadGenRef.current;
      if (!silent) setLoadingSubs(true);
      try {
        const { packs, total } = await packLibrary.fetchSubPacks(parentId, { start, limit });
        if (gen !== subLoadGenRef.current) return;
        // 重新拉取第一页时服务端数据即最新，清空本地「已掌握」增量
        if (start === 0) resetPackMasteredDelta();
        setSubPacks((prev) => (start === 0 ? packs : mergePacks(prev, packs)));
        setSubTotal(total);
        setSubPacksParentId(parentId);
      } catch (e: any) {
        if (gen !== subLoadGenRef.current) return;
        if (!silent) setErrorMsg(e?.message || '加载分类卡组失败');
      } finally {
        if (gen === subLoadGenRef.current && !silent) setLoadingSubs(false);
      }
    },
    [resetPackMasteredDelta]
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
      if (gen === subLoadGenRef.current) {
        setPreparingPack(false);
        setLoadingSubs(false);
      }
    }
  }, [resetPackMasteredDelta]);

  // 启动时先读取上次记住的卡组名，用于占位显示
  useEffect(() => {
    (async () => {
      const remembered = await readRememberedTopPack();
      if (remembered?.name) setLastPackName(remembered.name);
    })();
  }, [readRememberedTopPack]);

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
      return;
    }
    const uid = String((user as any)?.id ?? '');
    if (loadedUserIdRef.current === uid) return; // 同一账号避免重复请求
    loadedUserIdRef.current = uid;
    loadTopPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, (user as any)?.id]);

  // 切换顶部卡组时重新拉取其分类卡组
  useEffect(() => {
    if (!selectedTop) return;
    setSubPacks([]);
    setSubTotal(0);
    setSubPacksParentId(null);
    setActiveSub(null);
    setShowAllToday(false);
    // 刚安装的卡组走轮询，等服务端把子卡组复制完
    if (justInstalledRef.current === selectedTop.id) {
      justInstalledRef.current = null;
      loadSubPacksUntilReady(selectedTop.id);
    } else {
      loadSubPacks(selectedTop.id, 0);
    }
  }, [selectedTop?.id, loadSubPacks, loadSubPacksUntilReady]);

  /**
   * 闪卡页点「继续学习下一个卡组」后，store 里的今日单词卡组会变成下一个子卡组，
   * 这里跟着同步高亮，避免返回首页后显示成上一个卡组的加载态。
   * 注意: 每次都用列表里的最新卡组对象，保证「今日已学」等数字刷新后能同步。
   */
  useEffect(() => {
    if (todayWordsPackId == null) return;
    const matched = subPacks.find((p) => Number(p.id) === Number(todayWordsPackId));
    if (!matched) return;
    setActiveSub((prev) => (prev === matched ? prev : matched));
    setShowAllToday(false);
  }, [todayWordsPackId, subPacks]);

  const reloadAll = useCallback(async () => {
    await loadTopPacks();
    if (selectedTop) {
      await loadSubPacks(selectedTop.id, 0);
    }
  }, [loadTopPacks, loadSubPacks, selectedTop]);

  const handleLoadMore = () => {
    if (loadingSubs || loadingPacks || !selectedTop) return;
    if (subPacks.length === 0 || subPacks.length >= subTotal) return;
    loadSubPacks(selectedTop.id, subPacks.length);
  };

  /** 打开顶部卡组下拉框（面板定位到选择器下方） */
  const openDropdown = () => {
    setDropdownVisible(true);
    selectorRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
      const next = pageY + height + 6;
      // 测量失败时保持默认值，避免面板跑到屏幕外
      if (next > 40) setDropdownTop(next);
    });
  };

  const handleSelectTopPack = (pack: RemotePack) => {
    setDropdownVisible(false);
    if (selectedTop && Number(selectedTop.id) === Number(pack.id)) return;
    setSelectedTop(pack);
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

  const promptLogin = () => {
    Alert.alert('需要登录', '请先登录后再使用在线卡组', [
      { text: '取消', style: 'cancel' },
      { text: '去登录', onPress: () => navigation.navigate('Login') },
    ]);
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
    if (!selectedTop || subPacksParentId !== selectedTop.id) return;
    if (!subPacks.length) return;
    if (preparingPack) return; // 新安装卡组还在同步子卡组，等同步完再选
    if (autoPickedPackRef.current === selectedTop.id) return;

    const fromStudy =
      todayWordsPackId != null
        ? subPacks.find((p) => Number(p.id) === Number(todayWordsPackId))
        : undefined;
    const target =
      fromStudy ||
      subPacks.find((p) => !isPackFullyRemembered(p, packMasteredDelta[p.id] || 0)) ||
      subPacks.find((p) => (p.today_card_count || 0) > 0);

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
    subPacks,
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
      if (req === reviewReqRef.current) setLoadingReview(false);
    }
  }, []);

  // 切换分类卡组时刷新复习待办
  useEffect(() => {
    if (!isLoggedIn || !activeSub) {
      reviewReqRef.current += 1;
      setReviewWords([]);
      setReviewTotal(0);
      setLoadingReview(false);
      return;
    }
    loadReviewWords(activeSub, selectedTop?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, activeSub?.id, selectedTop?.name, loadReviewWords]);

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
      loadSubPacks(top.id, 0, Math.max(SUB_PAGE_SIZE, subPackCount), true);
      refreshSelectedTopStats(top.id);
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
    }, [isLoggedIn, loadSubPacks, refreshSelectedTopStats, loadTodayWords, loadReviewWords])
  );

  /** 点击分类卡组: 拉取今日学习单词列表 */
  const handleSelectSub = useCallback(
    async (pack: RemotePack) => {
      if (!isLoggedIn) {
        promptLogin();
        return;
      }
      try {
        const list = await ensureTodayWords(pack);
        if (!list.length) {
          Alert.alert('提示', '该分类今日没有待学习的单词，可点击「单词列表」查看全部单词');
        }
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '获取今日学习单词失败');
      }
    },
    [ensureTodayWords, isLoggedIn]
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
          Alert.alert('提示', '该分类暂无单词');
          return;
        }
        navigation.navigate('WordList', { source: 'pack', title: pack.name });
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '获取单词列表失败');
      }
    },
    [loadPackWordList, selectedTop?.name, isLoggedIn, navigation]
  );

  /** 开始背词: 优先用指定分类，其次当前分类，最后取第一个有今日任务的分类 */
  const handleStartStudy = useCallback(
    async (pack?: RemotePack) => {
      if (!isLoggedIn) {
        promptLogin();
        return;
      }
      const target =
        pack ||
        activeSub ||
        subPacks.find((p) => (p.today_card_count || 0) > 0) ||
        subPacks[0];
      if (!target) {
        Alert.alert('提示', '暂无可学习的分类卡组');
        return;
      }
      try {
        const list = await ensureTodayWords(target);
        if (!list.length) {
          Alert.alert('太棒了', '该分类今日没有待学习的单词');
          return;
        }
        // 把同一父卡组下的「兄弟卡组」一起带过去，学完当前卡组后可继续学下一个
        const packIndex = subPacks.findIndex((p) => Number(p.id) === Number(target.id));
        navigation.navigate('Flashcard', {
          // 直接带单词对象，避免闪卡页再从本地缓存里反查导致进不去
          queueWords: list,
          wordIds: list.map((w) => w.id),
          title: target.name,
          // 当前子卡组 id + 顶层卡组名（继续学习下一个卡组时使用）
          packId: target.id,
          packCat: selectedTop?.name || '',
          packQueue: subPacks.map((p) => ({ id: p.id, name: p.name })),
          packIndex,
          // 还有未加载的子卡组时，学完本页最后一个只提示、不误导
          hasMorePacks: subTotal > subPacks.length,
        });
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '获取今日学习单词失败');
      }
    },
    [ensureTodayWords, activeSub, subPacks, subTotal, selectedTop?.name, isLoggedIn, navigation]
  );

  /** 复习待办: 用服务端返回的「学过但没记住」的单词直接进入闪卡复习 */
  const handleStartReview = useCallback(() => {
    const pack = activeSub;
    if (!pack) {
      Alert.alert('提示', '请先点击下方分类卡组');
      return;
    }
    if (!reviewWords.length) {
      Alert.alert('太棒了', '该分类暂时没有需要复习的单词');
      return;
    }
    const packIndex = subPacks.findIndex((p) => Number(p.id) === Number(pack.id));
    navigation.navigate('Flashcard', {
      queueWords: reviewWords,
      title: `${pack.name} · 复习`,
      packId: pack.id,
      packCat: selectedTop?.name || '',
      packQueue: subPacks.map((p) => ({ id: p.id, name: p.name })),
      packIndex,
      hasMorePacks: subTotal > subPacks.length,
    });
  }, [activeSub, reviewWords, subPacks, subTotal, selectedTop?.name, navigation]);

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
    for (const p of subPacks) {
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
  }, [subPacks, packMasteredDelta, selectedTop?.card_count, selectedTop?.remembered_card_count]);

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

    // 正在加载，或列表还属于上一个分类卡组时显示 loading
    const isLoadingThis =
      isLoadingTodayWords || Number(todayWordsPackId) !== Number(activeSub.id);
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
    const isLoadingToday = isLoadingTodayWords && activeSub?.id === item.id;

    return (
      <View style={[styles.subCard, isActive && styles.subCardActive]}>
        {/* 卡片主体：选中该分类并加载今日学习单词 */}
        <TouchableOpacity
          style={styles.subCardMain}
          onPress={() => handleSelectSub(item)}
          activeOpacity={0.75}
        >
          <View style={styles.subCardTop}>
            <View style={[styles.subColorDot, { backgroundColor: color }]} />
            <Text style={styles.subCardName} numberOfLines={1}>
              {item.name}
            </Text>
            {isLoadingToday || isLoadingList ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : todayCount > 0 ? (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>
                  今日 {todayLearnedCount}/{todayCount}
                </Text>
              </View>
            ) : (
              <View style={[styles.todayBadge, styles.todayBadgeDone]}>
                <Text style={styles.todayBadgeDoneText}>今日已完成</Text>
              </View>
            )}
          </View>

          <View style={styles.subMetaRow}>
            <Text style={styles.subMetaText}>共 {total} 词</Text>
            <Text style={styles.subMetaText}>已掌握 {remembered}</Text>
            <Text style={styles.subProgressRatio}>
              {remembered}/{total}
            </Text>
          </View>

          <View style={styles.subProgressWrap}>
            <ProgressBar progress={progress} height={4} color={color} />
          </View>
        </TouchableOpacity>

        {/* 操作区与卡片主体平级，避免嵌套点击冲突 */}
        <View style={styles.subActions}>
          <TouchableOpacity
            style={styles.subOutlineBtn}
            onPress={() => handleOpenPackWordList(item)}
            activeOpacity={0.7}
          >
            {isLoadingList ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="list-outline" size={15} color={Colors.textSecondary} />
            )}
            <Text style={styles.subOutlineText}>单词列表</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subPrimaryBtn, { backgroundColor: color }]}
            onPress={() => handleStartStudy(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={15} color="#FFFFFF" />
            <Text style={styles.subPrimaryText}>开始背词</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /** 固定顶部标题栏：不随列表滚动 */
  const renderTopBar = () => (
    <View style={styles.header}>
      <View ref={selectorRef} collapsable={false} style={styles.headerBrand}>
        <TouchableOpacity
          style={styles.brandTouch}
          onPress={openDropdown}
          activeOpacity={0.7}
          disabled={topPacks.length === 0}
        >
          <Image
            source={require('../assets/pinwheel.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandTitle}>糍粑英语</Text>
            <View style={styles.selectorPill}>
              <Text style={styles.selectorPillText} numberOfLines={1}>
                {selectedTop?.name ||
                  lastPackName ||
                  currentPack?.name ||
                  '选择卡组'}
              </Text>
              <Ionicons name="chevron-down" size={13} color={Colors.primary} />
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={handleOpenMarket} activeOpacity={0.7}>
        <Ionicons name="add" size={20} color={Colors.primary} />
      </TouchableOpacity>

      <View style={styles.streakBadge}>
        <Ionicons name="flame" size={16} color={Colors.pinwheelRed} />
        <Text style={styles.streakText}>{stats.streakDays} 天</Text>
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
                共 {subTotal || subPacks.length} 个分类卡组
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
                          {loadingReview ? '…' : reviewTotal}
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
                      (!reviewTotal || loadingReview) && styles.actionBtnDisabled,
                    ]}
                    onPress={handleStartReview}
                    activeOpacity={0.8}
                    disabled={!reviewTotal || loadingReview}
                  >
                    {loadingReview ? (
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

      {/* 分类卡组标题 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>分类卡组{subTotal ? `（${subTotal}）` : ''}</Text>
        <Text style={styles.sectionHint} numberOfLines={1} ellipsizeMode="tail">
          {selectedTop
            ? `${selectedTop.name}${
                packAgg.todayTotal ? ` · 今日 ${packAgg.todayLearned}/${packAgg.todayTotal}` : ''
              }`
            : ''}
        </Text>
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
        <Text style={styles.emptyText}>暂无分类卡组</Text>
      </View>
    );
  };

  /** 顶部卡组下拉弹层 */
  const renderDropdown = () => (
    <Modal
      visible={dropdownVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setDropdownVisible(false)}
    >
      <TouchableWithoutFeedback onPress={() => setDropdownVisible(false)}>
        <View style={styles.dropdownOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dropdownPanel, { top: dropdownTop }]}>
              <View style={styles.dropdownHeader}>
                <Text style={styles.dropdownTitle}>我的卡组</Text>
                <Text style={styles.dropdownSubtitle}>{topPacks.length} 个分类词库</Text>
              </View>

              <FlatList
                data={topPacks}
                keyExtractor={(item) => String(item.id)}
                style={styles.dropdownList}
                renderItem={({ item }) => {
                  const isActive = selectedTop?.id === item.id;
                  const color = getCategoryColor(item.name);
                  return (
                    <TouchableOpacity
                      style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                      onPress={() => handleSelectTopPack(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.dropdownDot, { backgroundColor: color }]} />
                      <View style={styles.dropdownTextWrap}>
                        <Text
                          style={[styles.dropdownItemName, isActive && styles.dropdownItemNameActive]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.dropdownItemMeta}>
                          {item.card_count || 0} 词 · 今日待学 {item.today_card_count || 0}
                        </Text>
                      </View>
                      {isActive ? (
                        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      ) : (
                        <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.dropdownDivider} />}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* 固定顶部标题栏 */}
      {renderTopBar()}

      {renderDropdown()}

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
    flex: 1,
    marginRight: 8,
  },
  brandTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTextWrap: {
    flex: 1,
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
  // 下拉选择器（胶囊样式）
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 3,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    gap: 3,
  },
  selectorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    flexShrink: 1,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
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

  // 顶部卡组下拉弹层
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31, 26, 18, 0.28)',
  },
  dropdownPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingTop: 4,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dropdownSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  dropdownList: {
    maxHeight: 320,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  dropdownTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  dropdownItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  dropdownItemNameActive: {
    fontWeight: '800',
    color: Colors.primary,
  },
  dropdownItemMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.divider,
    marginLeft: 32,
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
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginTop: 4,
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
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
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
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subCardActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  subCardMain: {
    paddingBottom: 2,
  },
  subCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  subCardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  todayBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  todayBadgeDone: {
    backgroundColor: Colors.success + '1A',
  },
  todayBadgeDoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 16,
  },
  subMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  subProgressRatio: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  subProgressWrap: {
    marginTop: 8,
  },
  subActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  subOutlineBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  subPrimaryBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
