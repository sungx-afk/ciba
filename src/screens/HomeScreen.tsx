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
/** learn-by-menu 的卡片状态过滤：0 未学 / 1 学习中 / 4 已记住 */
const TODAY_WORD_TYPES = [0, 1, 4];
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
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<RemotePack | null>(null);
  const [showAllToday, setShowAllToday] = useState(false);
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

  // 顶部卡组下拉选择
  const selectorRef = useRef<View>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(120);

  const todayGoalProgress = Math.min(1, (stats?.todayLearnedCount || 0) / (stats?.dailyGoal || 20));

  /** 顶部卡组: 我的卡组 */
  const loadTopPacks = useCallback(async () => {
    setLoadingPacks(true);
    setErrorMsg(null);
    try {
      const { packs } = await packLibrary.fetchMyPacks({ start: 0, limit: 50 });
      setTopPacks(packs);

      // 我的卡组为空: 引导前往卡组市场添加卡组
      if (!packs.length) {
        setSelectedTop(null);
        setSubPacks([]);
        setSubTotal(0);
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
      if (prev && packs.some((p) => p.id === prev.id)) return;
      // ② 上次记住的卡组；不存在则 ③ currentPack；再退回 ④ 第一个
      const remembered =
        rememberedId !== null ? packs.find((p) => p.id === rememberedId) : undefined;
      const saved = currentPack ? packs.find((p) => p.id === currentPack.id) : undefined;
      setSelectedTop(remembered || saved || packs[0] || null);
    } catch (e: any) {
      setErrorMsg(e?.message || '加载我的卡组失败');
    } finally {
      setLoadingPacks(false);
    }
  }, [currentPack?.id, isLoggedIn, navigation, readRememberedTopPack, setCurrentTopPack]);

  /** 某个父卡组下的分类卡组 */
  const loadSubPacks = useCallback(async (parentId: number, start: number) => {
    const gen = ++subLoadGenRef.current;
    setLoadingSubs(true);
    try {
      const { packs, total } = await packLibrary.fetchSubPacks(parentId, {
        start,
        limit: SUB_PAGE_SIZE,
      });
      if (gen !== subLoadGenRef.current) return;
      // 重新拉取第一页时服务端数据即最新，清空本地「已掌握」增量
      if (start === 0) resetPackMasteredDelta();
      setSubPacks((prev) => (start === 0 ? packs : mergePacks(prev, packs)));
      setSubTotal(total);
    } catch (e: any) {
      if (gen !== subLoadGenRef.current) return;
      setErrorMsg(e?.message || '加载分类卡组失败');
    } finally {
      if (gen === subLoadGenRef.current) setLoadingSubs(false);
    }
  }, [resetPackMasteredDelta]);

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
    if (!isLoggedIn) {
      loadedUserIdRef.current = null; // 退出登录后允许再次登录时重新拉取
      // 清空上一账号残留的卡组数据
      setTopPacks([]);
      setSelectedTop(null);
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
  }, [isLoggedIn, (user as any)?.id]);

  // 切换顶部卡组时重新拉取其分类卡组
  useEffect(() => {
    if (!selectedTop) return;
    setSubPacks([]);
    setSubTotal(0);
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
    if (selectedTop?.id === pack.id) return;
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
        navigation.navigate('Flashcard', {
          wordIds: list.map((w) => w.id),
          title: target.name,
        });
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '获取今日学习单词失败');
      }
    },
    [ensureTodayWords, activeSub, subPacks, isLoggedIn, navigation]
  );

  const handleOpenTodayList = () => {
    if (!activeSub || !todayWords.length) return;
    navigation.navigate('WordList', {
      source: 'today',
      title: activeSub.name,
    });
  };

  // 今日待学: 选中分类的今日数量，未选中时取已加载分类的合计
  const todayDue = useMemo(() => {
    if (activeSub) return activeSub.today_card_count || 0;
    return subPacks.reduce((sum, p) => sum + (p.today_card_count || 0), 0);
  }, [activeSub, subPacks]);

  /** 今日学习单词列表 */
  const renderTodayWords = () => {
    if (!activeSub) {
      return (
        <View style={styles.todayHintWrap}>
          <Ionicons name="sparkles-outline" size={15} color={Colors.textMuted} />
          <Text style={styles.todayHintText}>点击分类卡组，获取今日学习单词列表</Text>
        </View>
      );
    }

    // 正在加载，或列表还属于上一个分类卡组时显示 loading
    const isLoadingThis =
      isLoadingTodayWords || (!!activeSub && todayWordsPackId !== activeSub.id);
    const visibleWords = showAllToday ? todayWords : todayWords.slice(0, TODAY_PREVIEW_COUNT);

    return (
      <View style={styles.todayBlock}>
        <View style={styles.todayBlockHeader}>
          <Text style={styles.todayBlockTitle} numberOfLines={1}>
            今日学习单词 · {activeSub.name}
          </Text>
          <Text style={styles.todayBlockCount}>
            {todayWords.length}/{todayWordsTotal}
          </Text>
        </View>

        {isLoadingThis ? (
          <View style={styles.todayLoading}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.todayLoadingText}>正在获取今日学习单词...</Text>
          </View>
        ) : todayWords.length === 0 ? (
          <Text style={styles.todayEmptyText}>该分类今日没有待学习的单词</Text>
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

            <View style={styles.todayActionRow}>
              <TouchableOpacity
                style={styles.todayOutlineBtn}
                onPress={handleOpenTodayList}
                activeOpacity={0.7}
              >
                <Ionicons name="list-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.todayOutlineText}>单词列表</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.todayPrimaryBtn}
                onPress={() => handleStartStudy(activeSub)}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={15} color="#FFFFFF" />
                <Text style={styles.todayPrimaryText}>背诵这 {todayWords.length} 个单词</Text>
              </TouchableOpacity>
            </View>
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
                <Text style={styles.todayBadgeText}>今日 {todayCount}</Text>
              </View>
            ) : null}
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
            <View style={styles.dashHeader}>
              <View style={styles.dashTitleWrap}>
                <Text style={styles.dashTitle}>今日学习</Text>
                <Text style={styles.dashSubtitle}>
                  已学 {stats.todayLearnedCount} / 目标 {stats.dailyGoal} 词
                </Text>
              </View>
              <View style={styles.dashGoalPercent}>
                <Text style={styles.dashPercentText}>{Math.round(todayGoalProgress * 100)}%</Text>
              </View>
            </View>

            <View style={styles.dashProgressTrack}>
              <ProgressBar progress={todayGoalProgress} height={8} color={Colors.primary} />
            </View>

            <View style={styles.dashMetricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricNumber}>{todayDue}</Text>
                <Text style={styles.metricLabel}>今日待学</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricNumber}>{stats.masteredCount}</Text>
                <Text style={styles.metricLabel}>已掌握</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricNumber}>
                  {selectedTop?.card_count ?? stats.totalWords}
                </Text>
                <Text style={styles.metricLabel}>卡组词数</Text>
              </View>
            </View>

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

            {renderTodayWords()}
          </>
        )}
      </View>

      {/* 分类卡组标题 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>分类卡组{subTotal ? `（${subTotal}）` : ''}</Text>
        <Text style={styles.sectionHint} numberOfLines={1} ellipsizeMode="tail">
          {selectedTop ? selectedTop.name : ''}
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
    color: Colors.primary,
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
