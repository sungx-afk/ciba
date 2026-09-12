import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useProgress } from '../storage/progressStore';
import { WordCard } from '../components/WordCard';
import { Header } from '../components/Header';
import { Colors } from '../theme/colors';
import { Word, WordProgress } from '../types';
import { fetchBookmarkedWords, BOOKMARK_PAGE_SIZE } from '../services/bookmarkApi';
import { AUTH_EXPIRED_RESULT } from '../services/api';

interface BookmarksScreenProps {
  navigation: any;
}

type LoadMode = 'initial' | 'refresh' | 'more';

/** 按 id 去重合并（后出现的覆盖先出现的） */
function mergeWords(prev: Word[], next: Word[]): Word[] {
  if (!prev.length) {
    const seen = new Set<number>();
    return next.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  }
  const map = new Map<number, Word>();
  prev.forEach((w) => map.set(w.id, w));
  next.forEach((w) => map.set(w.id, w));
  return Array.from(map.values());
}

export const BookmarksScreen: React.FC<BookmarksScreenProps> = ({ navigation }) => {
  const { state, toggleBookmark, isLoggedIn } = useProgress();

  const [words, setWords] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [moreError, setMoreError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);

  // 防止并发请求 & 记录下一页偏移量
  const loadingRef = useRef(false);
  const nextStartRef = useRef(0);
  const hasMoreRef = useRef(true);
  const reqIdRef = useRef(0);

  const load = useCallback(async (mode: LoadMode) => {
    if (loadingRef.current) return;
    if (mode === 'more' && !hasMoreRef.current) return;

    loadingRef.current = true;
    const reqId = ++reqIdRef.current;
    const start = mode === 'more' ? nextStartRef.current : 0;

    if (mode === 'initial') setInitialLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);

    try {
      const page = await fetchBookmarkedWords({ start, limit: BOOKMARK_PAGE_SIZE });
      if (reqId !== reqIdRef.current) return; // 已发起更新的请求，丢弃这次结果

      setWords((prev) => (mode === 'more' ? mergeWords(prev, page.words) : mergeWords([], page.words)));
      setTotal(page.total);
      hasMoreRef.current = page.hasMore;
      setHasMore(page.hasMore);
      nextStartRef.current = start + page.words.length;
      setNeedLogin(false);
      setErrorMsg('');
      setMoreError('');
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;

      const msg =
        err?.result === AUTH_EXPIRED_RESULT
          ? '登录后即可同步你的生词本'
          : err?.message || '生词本加载失败，请稍后重试';

      // 加载更多失败：保留已加载数据，底部提示重试
      if (mode === 'more') {
        setMoreError(msg);
        return;
      }

      setMoreError('');
      if (err?.result === AUTH_EXPIRED_RESULT) {
        setNeedLogin(true);
        setErrorMsg(msg);
      } else {
        setNeedLogin(false);
        setErrorMsg(msg);
      }
      // 首页/刷新失败时清空列表，交给错误态展示
      setWords([]);
      setTotal(0);
      hasMoreRef.current = false;
      setHasMore(false);
      nextStartRef.current = 0;
    } finally {
      loadingRef.current = false;
      if (reqId === reqIdRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // 首次进入 / 登录状态变化时重新拉取
  useEffect(() => {
    hasMoreRef.current = true;
    nextStartRef.current = 0;
    setMoreError('');
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
      hasMoreRef.current = true;
      nextStartRef.current = 0;
      setMoreError('');
      load('refresh');
    }, [load])
  );

  const handleRefresh = useCallback(() => {
    hasMoreRef.current = true;
    nextStartRef.current = 0;
    setMoreError('');
    load('refresh');
  }, [load]);

  const handleLoadMore = useCallback(() => {
    if (initialLoading || refreshing || errorMsg || hasMore === false) return;
    load('more');
  }, [load, initialLoading, refreshing, errorMsg, hasMore]);

  const handleRetryLoadMore = useCallback(() => {
    setMoreError('');
    load('more');
  }, [load]);

  const handleRetry = useCallback(() => {
    hasMoreRef.current = true;
    nextStartRef.current = 0;
    setMoreError('');
    load('initial');
  }, [load]);

  /** 点击书签：本地立即取消收藏并从列表移除，保持列表与状态一致 */
  const handleToggleBookmark = useCallback(
    async (item: Word) => {
      const wasBookmarked = !!state.progressMap[item.id]?.isBookmarked;
      await toggleBookmark(item.id);
      if (wasBookmarked) {
        setWords((prev) => prev.filter((w) => w.id !== item.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    },
    [state.progressMap, toggleBookmark]
  );

  /** 生词本里所有卡片都视为已收藏，方便渲染实心书签 */
  const getCardProgress = useCallback(
    (word: Word): WordProgress => {
      const p = state.progressMap[word.id];
      if (p) return { ...p, isBookmarked: true };
      return {
        wordId: word.id,
        status: 'unlearned',
        interval: 0,
        nextReviewTime: 0,
        lastReviewTime: 0,
        reviewCount: 0,
        lapseCount: 0,
        isBookmarked: true,
      };
    },
    [state.progressMap]
  );

  /** 点击某张卡片：从它在列表中的位置开始连续复习（后续不足时由复习页自动续拉） */
  const openWordDetail = useCallback(
    (item: Word) => {
      const index = words.findIndex((w) => w.id === item.id);
      navigation.navigate('BookmarkStudy', {
        words,
        startIndex: index < 0 ? 0 : index,
        total,
      });
    },
    [navigation, words, total]
  );

  const showEmptyState = !initialLoading && !errorMsg && words.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="生词本"
        subtitle={initialLoading && !words.length ? '正在加载...' : `共 ${total} 个单词`}
      />

      {/* 首次进入的加载态 */}
      {initialLoading && !words.length ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>正在加载生词本...</Text>
        </View>
      ) : null}

      {/* 未登录 */}
      {needLogin && !initialLoading ? (
        <View style={styles.centerWrap}>
          <Ionicons name="person-circle-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>登录后同步生词本</Text>
          <Text style={styles.emptyDesc}>{errorMsg}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>去登录</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 加载失败 */}
      {!needLogin && !!errorMsg && !initialLoading ? (
        <View style={styles.centerWrap}>
          <Ionicons name="cloud-offline-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>加载失败</Text>
          <Text style={styles.emptyDesc}>{errorMsg}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showEmptyState ? (
        <View style={styles.centerWrap}>
          <Ionicons name="bookmark-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>生词本是空的</Text>
          <Text style={styles.emptyDesc}>
            在背词或单词列表里点击书签图标，随时将难记生词收藏到这里
          </Text>
        </View>
      ) : null}

      {!needLogin && !errorMsg && !showEmptyState ? (
        <FlatList
          data={words}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <WordCard
              word={item}
              progress={getCardProgress(item)}
              accent={state.accent}
              showBookmark={false}
              onToggleBookmark={() => handleToggleBookmark(item)}
              onPress={() => openWordDetail(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerWrap}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.footerText}>正在加载更多...</Text>
              </View>
            ) : moreError ? (
              <TouchableOpacity
                style={styles.footerWrap}
                onPress={handleRetryLoadMore}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={16} color={Colors.primary} />
                <Text style={styles.footerRetryText}>加载更多失败，点击重试</Text>
              </TouchableOpacity>
            ) : !hasMore && words.length > 0 ? (
              <View style={styles.footerWrap}>
                <Text style={styles.footerText}>已加载全部 {words.length} 个单词</Text>
              </View>
            ) : null
          }
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topActionBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tipText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingBottom: 40,
    paddingTop: 8,
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
  primaryBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  footerRetryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
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
});
