import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import rawWordsData from '../data/words.json';
import { Word, WordProgress, ProgressState, LearningStats } from '../types';

const STORAGE_KEY = '@ciba_progress_v1';

export const allWords: Word[] = (rawWordsData as { words: Word[] }).words;

// 预先建立分类与意群索引
export interface CategoryInfo {
  name: string;
  wordCount: number;
  subCategories: { name: string; wordCount: number }[];
}

export function buildCategories(): CategoryInfo[] {
  const map: Record<string, { total: number; subs: Record<string, number> }> = {};
  
  for (const w of allWords) {
    const cat = w.cat || '其他';
    const sub = w.sub || '通用';
    if (!map[cat]) {
      map[cat] = { total: 0, subs: {} };
    }
    map[cat].total += 1;
    map[cat].subs[sub] = (map[cat].subs[sub] || 0) + 1;
  }
  
  return Object.keys(map).map(catName => ({
    name: catName,
    wordCount: map[catName].total,
    subCategories: Object.keys(map[catName].subs).map(subName => ({
      name: subName,
      wordCount: map[catName].subs[subName],
    })),
  }));
}

export const categoryList: CategoryInfo[] = buildCategories();

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

interface ProgressContextValue {
  state: ProgressState;
  stats: LearningStats;
  recordReview: (wordId: number, grade: 'again' | 'hard' | 'good' | 'easy') => Promise<void>;
  toggleBookmark: (wordId: number) => Promise<void>;
  updateSettings: (newSettings: Partial<Pick<ProgressState, 'dailyGoal' | 'accent' | 'autoPronounce' | 'speechRate'>>) => Promise<void>;
  resetProgress: () => Promise<void>;
  exportProgressData: () => string;
  isWordDue: (wordId: number) => boolean;
  getProgressForWord: (wordId: number) => WordProgress | undefined;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProgressState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // 初始化加载
  useEffect(() => {
    async function load() {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        const today = getTodayString();
        if (json) {
          const parsed: ProgressState = JSON.parse(json);
          let streak = parsed.streakDays || 0;
          let todayLearned = parsed.todayLearnedIds || [];

          if (parsed.lastActiveDate !== today) {
            // 新的一天
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

            if (parsed.lastActiveDate === yesterdayStr) {
              // 连续打卡保留
            } else if (parsed.lastActiveDate) {
              // 超过 1 天未学，但打卡天数保留直到重新打卡
            }
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
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  // 持久化存储
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

  // 记录学习打分
  const recordReview = async (wordId: number, grade: 'again' | 'hard' | 'good' | 'easy') => {
    const now = Date.now();
    const today = getTodayString();
    const currentProg = state.progressMap[wordId] || {
      wordId,
      status: 'unlearned',
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
        nextReviewTime = now + 10 * 60 * 1000; // 10分钟后
        newStatus = 'learning';
        lapseInc = 1;
        break;
      case 'hard':
        newInterval = 1;
        nextReviewTime = now + 24 * 60 * 60 * 1000; // 1天
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

    // 更新今日学习与打卡
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
  };

  // 收藏 / 生词本切换
  const toggleBookmark = async (wordId: number) => {
    const currentProg = state.progressMap[wordId] || {
      wordId,
      status: 'unlearned',
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
    const newState: ProgressState = {
      ...state,
      ...newSettings,
    };
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

  const exportProgressData = (): string => {
    return JSON.stringify(state, null, 2);
  };

  // 统计计算
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

    const totalWords = allWords.length;
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
  }, [state]);

  return (
    <ProgressContext.Provider
      value={{
        state,
        stats,
        recordReview,
        toggleBookmark,
        updateSettings,
        resetProgress,
        exportProgressData,
        isWordDue,
        getProgressForWord,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
