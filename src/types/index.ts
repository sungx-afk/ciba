export interface Word {
  id: number;
  cat: string;
  sub: string;
  word: string;
  meaning: string;
  note: string;
}

export type WordStatus = 'unlearned' | 'learning' | 'mastered';

export interface WordProgress {
  wordId: number;
  status: WordStatus;
  interval: number; // 间隔天数
  nextReviewTime: number; // 下次复习时间戳 (ms)
  lastReviewTime: number; // 上次学习时间戳
  reviewCount: number; // 复习次数
  lapseCount: number; // 遗忘次数
  isBookmarked: boolean; // 是否加入生词本
}

export interface ProgressState {
  progressMap: Record<number, WordProgress>;
  dailyGoal: number;
  accent: 'en-US' | 'en-GB';
  autoPronounce: boolean;
  speechRate: number;
  lastActiveDate: string; // YYYY-MM-DD
  streakDays: number;
  todayLearnedIds: number[];
}

export interface LearningStats {
  totalWords: number;
  masteredCount: number;
  learningCount: number;
  unlearnedCount: number;
  dueTodayCount: number;
  todayLearnedCount: number;
  streakDays: number;
  dailyGoal: number;
}
