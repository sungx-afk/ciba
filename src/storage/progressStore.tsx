import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import rawWordsData from '../data/words.json';
import { Word, WordProgress, ProgressState, LearningStats } from '../types';
import { authService, RemoteUser } from '../services/auth';
import { packLibrary, RemotePack } from '../services/packLibrary';

const STORAGE_KEY = '@ciba_progress_v1';
const PACK_KEY = '@ciba_current_pack';

const localWords: Word[] = (rawWordsData as { words: Word[] }).words;

export interface CategoryInfo {
  name: string;
  wordCount: number;
  subCategories: { name: string; wordCount: number }[];
}

function buildCategories(words: Word[]): CategoryInfo[] {
  const map: Record<string, { total: number; subs: Record<string, number> }> = {};

  for (const w of words) {
    const cat = w.cat || '其他';
    const sub = w.sub || '通用';
    if (!map[cat]) {
      map[cat] = { total: 0, subs: {} };
    }
    map[cat].total += 1;
    map[cat].subs[sub] = (map[cat].subs[sub] || 0) + 1;
  }

  return Object.keys(map).map((catName) => ({
    name: catName,
    wordCount: map[catName].total,
    subCategories: Object.keys(map[catName].subs).map((subName) => ({
      name: subName,
      wordCount: map[catName].subs[subName],
    })),
  }));
}

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const defaultState: ProgressState = {
  progressMap: {},
  dailyGoal: 20,
  accent: 'en-US',
  autoPronounce: true,
  speechRate: 0.9,
  lastActiveDate: '',
  streakDays: 0,
  todayLearnedIds: [],
};

interface CurrentPack {
  id: number;
  name: string;
}

interface ProgressContextValue {
  // 学习进度
  state: ProgressState;
  stats: LearningStats;
  recordReview: (wordId: number, grade: 'again' | 'hard' | 'good' | 'easy') => Promise<void>;
  toggleBookmark: (wordId: number) => Promise<void>;
  updateSettings: (newSettings: Partial<Pick<ProgressState, 'dailyGoal' | 'accent' | 'autoPronounce' | 'speechRate'>>) => Promise<void>;
  resetProgress: () => Promise<void>;
  exportProgressData: () => string;
  isWordDue: (wordId: number) => boolean;
  getProgressForWord: (wordId: number) => WordProgress | undefined;

  // 词库数据
  words: Word[];
  categoryList: CategoryInfo[];
  isLoadingWords: boolean;
  wordSource: 'local' | 'remote';
  currentPack: CurrentPack | null;
  loadPackWords: (pack: RemotePack) => Promise<void>;
  revertToLocal: () => void;

  // 今日学习单词 (来自 /anki/pack/{id}/learn-by-menu.json)
  todayWords: Word[];
  todayWordsTotal: number;
  todayWordsPackId: number | null;
  isLoadingTodayWords: boolean;
  loadTodayWords: (
    packId: number,
    options?: { start?: number; limit?: number; types?: number[]; cat?: string; sub?: string }
  ) => Promise<Word[]>;
  clearTodayWords: () => void;

  // 子卡组单词列表 (来自 /anki/pack/{id}/learn-by-menu.json，不带 type 过滤)
  packWords: Word[];
  packWordsPackId: number | null;
  isLoadingPackWords: boolean;
  loadPackWordList: (
    packId: number,
    options?: { cat?: string; sub?: string }
  ) => Promise<Word[]>;

  // 从市场安装成功的卡组（供分类页刷新我的卡组并切换到该卡组）
  installedPack: RemotePack | null;
  setInstalledPack: (pack: RemotePack | null) => void;

  // 认证
  user: RemoteUser | null;
  isLoggedIn: boolean;
  login: (loginName: string, password: string) => Promise<RemoteUser>;
  logout: () => Promise<void>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProgressState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // 词库数据
  const [words, setWords] = useState<Word[]>(localWords);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const [wordSource, setWordSource] = useState<'local' | 'remote'>('local');
  const [currentPack, setCurrentPack] = useState<CurrentPack | null>(null);

  // 今日学习单词
  const [todayWords, setTodayWords] = useState<Word[]>([]);
  const [todayWordsTotal, setTodayWordsTotal] = useState(0);
  const [todayWordsPackId, setTodayWordsPackId] = useState<number | null>(null);
  const [isLoadingTodayWords, setIsLoadingTodayWords] = useState(false);

  // 子卡组单词列表
  const [packWords, setPackWords] = useState<Word[]>([]);
  const [packWordsPackId, setPackWordsPackId] = useState<number | null>(null);
  const [isLoadingPackWords, setIsLoadingPackWords] = useState(false);

  // 市场安装成功的卡组
  const [installedPack, setInstalledPack] = useState<RemotePack | null>(null);

  // 认证
  const [user, setUser] = useState<RemoteUser | null>(null);

  // 初始化: 恢复登录态 + 恢复上次词库
  useEffect(() => {
    (async () => {
      // 恢复登录
      const restored = await authService.restore();
      if (restored) setUser(restored);

      // 恢复上次选择的词库
      try {
        const saved = await AsyncStorage.getItem(PACK_KEY);
        if (saved) {
          const pack = JSON.parse(saved) as CurrentPack;
          setCurrentPack(pack);
          // 异步加载远程词库 (不阻塞本地数据展示)
          setIsLoadingWords(true);
          packLibrary
            .loadWordsFromPack(pack.id)
            .then((remoteWords) => {
              if (remoteWords.length > 0) {
                setWords(remoteWords);
                setWordSource('remote');
              }
            })
            .catch((e) => console.warn('loadWordsFromPack failed', e))
            .finally(() => setIsLoadingWords(false));
        }
      } catch {
        // ignore
      }

      setIsLoaded(true);
    })();
  }, []);

  // 加载本地进度
  useEffect(() => {
    async function load() {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        const today = getTodayString();
        if (json) {
          const parsed: ProgressState = JSON.parse(json);
          let todayLearned = parsed.todayLearnedIds || [];
          if (parsed.lastActiveDate !== today) {
            todayLearned = [];
          }
          setState({
            ...defaultState,
            ...parsed,
            todayLearnedIds: todayLearned,
          });
        }
      } catch (e) {
        console.error('Failed to load progress', e);
      }
    }
    load();
  }, []);

  // 持久化进度
  const saveState = async (newState: ProgressState) => {
    setState(newState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
      console.error('Failed to save progress', e);
    }
  };

  const getProgressForWord = (wordId: number): WordProgress | undefined => {
    return state.progressMap[wordId];
  };

  const isWordDue = (wordId: number): boolean => {
    const p = state.progressMap[wordId];
    if (!p) return false;
    return p.nextReviewTime > 0 && p.nextReviewTime <= Date.now();
  };

  const recordReview = async (wordId: number, grade: 'again' | 'hard' | 'good' | 'easy') => {
    const now = Date.now();
    const today = getTodayString();
    const currentProg = state.progressMap[wordId] || {
      wordId,
      status: 'unlearned' as const,
      interval: 0,
      nextReviewTime: 0,
      lastReviewTime: 0,
      reviewCount: 0,
      lapseCount: 0,
      isBookmarked: false,
    };

    let newInterval = 0;
    let nextReviewTime = 0;
    let newStatus = currentProg.status;
    let lapseInc = 0;

    switch (grade) {
      case 'again':
        newInterval = 0;
        nextReviewTime = now + 10 * 60 * 1000;
        newStatus = 'learning';
        lapseInc = 1;
        break;
      case 'hard':
        newInterval = 1;
        nextReviewTime = now + 24 * 60 * 60 * 1000;
        newStatus = 'learning';
        break;
      case 'good':
        newInterval = currentProg.interval > 0 ? Math.round(currentProg.interval * 1.8) : 3;
        nextReviewTime = now + newInterval * 24 * 60 * 60 * 1000;
        newStatus = newInterval >= 7 ? 'mastered' : 'learning';
        break;
      case 'easy':
        newInterval = currentProg.interval > 0 ? Math.round(currentProg.interval * 2.5) : 7;
        nextReviewTime = now + newInterval * 24 * 60 * 60 * 1000;
        newStatus = 'mastered';
        break;
    }

    const updatedProg: WordProgress = {
      ...currentProg,
      interval: newInterval,
      nextReviewTime,
      lastReviewTime: now,
      reviewCount: currentProg.reviewCount + 1,
      lapseCount: currentProg.lapseCount + lapseInc,
      status: newStatus,
    };

    const todaySet = new Set(state.todayLearnedIds);
    todaySet.add(wordId);

    let newStreak = state.streakDays;
    if (state.lastActiveDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      if (state.lastActiveDate === yesterdayStr || state.streakDays === 0) {
        newStreak = state.streakDays + 1;
      } else {
        newStreak = 1;
      }
    }

    const newState: ProgressState = {
      ...state,
      lastActiveDate: today,
      streakDays: Math.max(1, newStreak),
      todayLearnedIds: Array.from(todaySet),
      progressMap: {
        ...state.progressMap,
        [wordId]: updatedProg,
      },
    };

    await saveState(newState);

    // 异步上报学习结果到服务端 (type: 0=重来 1=困难 2=一般 3=容易)
    // 优先使用单词所属卡组 id (learn-by-menu 返回的 package_id)
    const target =
      words.find((w) => w.id === wordId) ||
      todayWords.find((w) => w.id === wordId) ||
      packWords.find((w) => w.id === wordId);
    const packId = target?.packageId || currentPack?.id;
    if (packId) {
      const typeMap = { again: 0, hard: 1, good: 2, easy: 3 };
      packLibrary.markNoteRead(packId, wordId, typeMap[grade]);
    }
  };

  const toggleBookmark = async (wordId: number) => {
    const currentProg = state.progressMap[wordId] || {
      wordId,
      status: 'unlearned' as const,
      interval: 0,
      nextReviewTime: 0,
      lastReviewTime: 0,
      reviewCount: 0,
      lapseCount: 0,
      isBookmarked: false,
    };

    const newState: ProgressState = {
      ...state,
      progressMap: {
        ...state.progressMap,
        [wordId]: {
          ...currentProg,
          isBookmarked: !currentProg.isBookmarked,
        },
      },
    };

    await saveState(newState);
  };

  const updateSettings = async (
    newSettings: Partial<Pick<ProgressState, 'dailyGoal' | 'accent' | 'autoPronounce' | 'speechRate'>>
  ) => {
    const newState: ProgressState = { ...state, ...newSettings };
    await saveState(newState);
  };

  const resetProgress = async () => {
    const cleared: ProgressState = {
      ...defaultState,
      dailyGoal: state.dailyGoal,
      accent: state.accent,
    };
    await saveState(cleared);
  };

  const exportProgressData = (): string => JSON.stringify(state, null, 2);

  // 加载远程词库
  const loadPackWords = useCallback(async (pack: RemotePack) => {
    setIsLoadingWords(true);
    try {
      const remoteWords = await packLibrary.loadWordsFromPack(pack.id);
      if (remoteWords.length > 0) {
        setWords(remoteWords);
        setWordSource('remote');
        const cp = { id: pack.id, name: pack.name };
        setCurrentPack(cp);
        await AsyncStorage.setItem(PACK_KEY, JSON.stringify(cp));
      }
    } finally {
      setIsLoadingWords(false);
    }
  }, []);

  const revertToLocal = useCallback(() => {
    setWords(localWords);
    setWordSource('local');
    setCurrentPack(null);
    setTodayWords([]);
    setTodayWordsTotal(0);
    setTodayWordsPackId(null);
    AsyncStorage.removeItem(PACK_KEY);
  }, []);

  /**
   * 拉取某个卡组的今日学习单词列表
   * GET /anki/pack/{packId}/learn-by-menu.json?start=0&limit=50&type=0&type=1&type=4
   */
  const loadTodayWords = useCallback(
    async (
      packId: number,
      options: {
        start?: number;
        limit?: number;
        types?: number[];
        cat?: string;
        sub?: string;
      } = {}
    ): Promise<Word[]> => {
      setIsLoadingTodayWords(true);
      try {
        const { words: list, total } = await packLibrary.fetchTodayWords(packId, options);
        setTodayWords(list);
        setTodayWordsTotal(total);
        setTodayWordsPackId(packId);
        return list;
      } finally {
        setIsLoadingTodayWords(false);
      }
    },
    []
  );

  const clearTodayWords = useCallback(() => {
    setTodayWords([]);
    setTodayWordsTotal(0);
    setTodayWordsPackId(null);
  }, []);

  /**
   * 拉取某个子卡组的全部单词列表（分页合并，最多 5 页 / 500 词）
   * GET /anki/pack/{packId}/learn-by-menu.json?start=0&limit=100
   */
  const loadPackWordList = useCallback(
    async (packId: number, options: { cat?: string; sub?: string } = {}): Promise<Word[]> => {
      setIsLoadingPackWords(true);
      try {
        const collected: Word[] = [];
        const seen = new Set<number>();
        const pageSize = 100;
        let start = 0;

        for (let page = 0; page < 5; page++) {
          const { words: list, total } = await packLibrary.fetchPackWords(packId, {
            ...options,
            start,
            limit: pageSize,
          });
          for (const w of list) {
            if (!seen.has(w.id)) {
              seen.add(w.id);
              collected.push(w);
            }
          }
          if (list.length === 0 || start + list.length >= total) break;
          start += list.length;
        }

        setPackWords(collected);
        setPackWordsPackId(packId);
        return collected;
      } finally {
        setIsLoadingPackWords(false);
      }
    },
    []
  );

  // 认证
  const login = useCallback(async (loginName: string, password: string) => {
    const u = await authService.login(loginName, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    revertToLocal();
  }, [revertToLocal]);

  const categoryList = useMemo(() => buildCategories(words), [words]);

  const stats: LearningStats = useMemo(() => {
    let masteredCount = 0;
    let learningCount = 0;
    let dueTodayCount = 0;
    const now = Date.now();

    for (const id in state.progressMap) {
      const p = state.progressMap[id];
      if (p.status === 'mastered') masteredCount++;
      else if (p.status === 'learning') learningCount++;
      if (p.nextReviewTime > 0 && p.nextReviewTime <= now) {
        dueTodayCount++;
      }
    }

    const totalWords = words.length;
    const unlearnedCount = Math.max(0, totalWords - masteredCount - learningCount);

    return {
      totalWords,
      masteredCount,
      learningCount,
      unlearnedCount,
      dueTodayCount,
      todayLearnedCount: state.todayLearnedIds.length,
      streakDays: state.streakDays,
      dailyGoal: state.dailyGoal,
    };
  }, [state, words]);

  const value: ProgressContextValue = {
    state,
    stats,
    recordReview,
    toggleBookmark,
    updateSettings,
    resetProgress,
    exportProgressData,
    isWordDue,
    getProgressForWord,
    words,
    categoryList,
    isLoadingWords,
    wordSource,
    currentPack,
    loadPackWords,
    revertToLocal,
    todayWords,
    todayWordsTotal,
    todayWordsPackId,
    isLoadingTodayWords,
    loadTodayWords,
    clearTodayWords,
    packWords,
    packWordsPackId,
    isLoadingPackWords,
    loadPackWordList,
    installedPack,
    setInstalledPack,
    user,
    isLoggedIn: !!user,
    login,
    logout,
  };

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
