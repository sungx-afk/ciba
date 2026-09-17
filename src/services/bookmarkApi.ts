import { api, APIError } from './api';
import { Word } from '../types';

/**
 * 生词本列表获取（两步）
 *   1) /anki/pack/flag/default_movie_pack       -> 默认卡组 id（缓存一次）
 *   2) /anki/pack/{packId}/learn-by-menu.json   -> 分页拿卡片
 */

export const BOOKMARK_PAGE_SIZE = 20;

/**
 * 生词本页面的两份数据来源：
 *  - 中部列表（未记住）：type = 0 未学 / 1、2、3 学习中
 *  - 底部区域（已记住）：type = 4
 * 两处都按这些 type 从服务端 learn-by-menu 拉取。
 */
export const BOOKMARK_LEARNING_TYPES = [0, 1, 2, 3];
export const BOOKMARK_MASTERED_TYPES = [4];

/** 单次循环拉取的分页上限，防止服务端 total 异常时死循环 */
const MAX_LOOP_START = 20000;

const PACK_FLAG_PATH = '/anki/pack/flag/default_movie_pack';
const SORTERS = JSON.stringify([{ direction: 'desc', column: 'id' }]);
const MOVIE_TO_CARD_PATH = '/anki/movie2card';

/**
 * 把单词加进服务端生词本（默认「电影卡组」）
 * POST /anki/movie2card.json  wordName=xxx&englishCaption=xxx
 *
 * 注意：后端每次调用都会新建一条 note + card，只支持新增、**没有删除接口**，
 * 所以「取消收藏」不能反过来调它，只能改本地状态。
 * 非会员卡组满 100 张时后端会抛会员错误，由调用方提示用户。
 */
export async function addWordToBookmark(wordName: string, englishCaption?: string): Promise<void> {
  const name = String(wordName || '').trim();
  if (!name) {
    throw new APIError(-1, '单词为空，无法加入生词本');
  }
  await api.postForm(MOVIE_TO_CARD_PATH, {
    wordName: name,
    englishCaption: (englishCaption || '').trim() || name,
  });
}

export interface FetchBookmarkedParams {
  start?: number;
  limit?: number;
  /** 卡片状态过滤，数组会展开成 type=0&type=1...；不传表示该卡组下全部卡片 */
  types?: number[];
}

export interface BookmarkedWordPage {
  words: Word[];
  total: number;
  hasMore: boolean;
}

let cachedPackId = 0;

/** 切换账号后调用：默认卡组 id 是按账号的，必须失效重取 */
export function clearBookmarkPackCache() {
  cachedPackId = 0;
}

/** 1. 取默认卡组 id */
export async function fetchDefaultMoviePackId(force = false): Promise<number> {
  if (!force && cachedPackId) return cachedPackId;

  const rsp = await api.get<any>(PACK_FLAG_PATH);
  const packId = Number(rsp?.pack?.id ?? rsp?.packId ?? rsp?.id ?? rsp?.referenceId);

  if (!Number.isFinite(packId) || packId <= 0) {
    throw new APIError(-1, '未获取到默认卡组');
  }
  cachedPackId = packId;
  return packId;
}

/**
 * 卡片 -> Word
 * note.data 以 \u001F 分隔：0 单词｜1 美音标｜2 美音｜3 英音标｜4 英音｜5 图片｜6 中文释义｜7 例句
 */
function cardToWord(card: any): Word {
  const note = card?.note || {};
  const f = String(note.data || '').split('\u001f');
  const wordName = String(note.name || card?.name || f[0] || '').trim();

  const phonetic = [f[1] && `美 /${f[1]}/`, f[3] && `英 /${f[3]}/`].filter(Boolean).join('  ');
  const meaning = (f[6] || '').replace(/\t*<br\s*\/?>/g, '\n').trim();
  const examples = (f[7] || '')
    .split(/<br\s*\/?>\s*<br\s*\/?>/)
    .map((s) =>
      s
        .replace(/\[sound:[^\]]+\]/g, '')
        .replace(/^[\s'"]+/, '')
        .replace(/[\s'"]+$/, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim()
    )
    .filter(Boolean)
    // 收藏单词时没传 englishCaption，后端会把单词本身当例句存下来，
    // 这种「例句 == 单词」的脏数据要丢掉，否则卡片末尾会重复出现单词名
    .filter((e) => e.toLowerCase() !== wordName.toLowerCase());

  const packageId = Number(card?.package_id) || Number(card?.packageId) || 0;

  return {
    id: Number(card?.id ?? note.id),
    word: wordName,
    meaning,
    note: [phonetic, ...examples.map((e) => `· ${e}`)].filter(Boolean).join('\n'),
    cat: '',
    sub: '',
    // 学习结果需要按卡片所属卡组上报，否则会落到当前选中的其它卡组
    ...(packageId ? { packageId } : {}),
  };
}

/** 2. 分页拿生词本列表（types 为空表示不过滤） */
export async function fetchBookmarkedWords(
  params: FetchBookmarkedParams = {}
): Promise<BookmarkedWordPage> {
  const { start = 0, limit = BOOKMARK_PAGE_SIZE, types } = params;

  const packId = await fetchDefaultMoviePackId();
  const query: Record<string, any> = { start, limit, sorters: SORTERS };
  if (types && types.length) query.type = types;

  const rsp = await api.get<any>(`/anki/pack/${packId}/learn-by-menu.json`, query);

  const cards: any[] = Array.isArray(rsp?.cards) ? rsp.cards : [];
  const words = cards.map(cardToWord).filter((w) => w.word && w.id);
  const total = Number(rsp?.total) || start + words.length;

  return { words, total, hasMore: start + words.length < total };
}

/** 已缓存的生词本卡组 id（学习结果上报要用），未取过时为 0 */
export function getCachedBookmarkPackId(): number {
  return cachedPackId;
}

/**
 * 按 type 循环拉全量：生词本页的中部列表（未记住）与底部区域（已记住）
 * 各自走一遍，分页有可能一页拿不完，这里一直取到服务端给完为止。
 */
export async function fetchBookmarkedWordsByTypes(
  types: number[],
  limit = BOOKMARK_PAGE_SIZE
): Promise<Word[]> {
  // 先取一次卡组 id，后续分页直接用缓存，不必每页都重复请求
  await fetchDefaultMoviePackId();

  const all: Word[] = [];
  const seen = new Set<number>();
  let start = 0;

  for (;;) {
    const page = await fetchBookmarkedWords({ start, limit, types });

    for (const w of page.words) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      all.push(w);
    }

    if (!page.words.length || !page.hasMore) break;
    start += page.words.length;
    // 服务端没给 hasMore / total 异常时的兜底，避免无限翻页
    if (start > MAX_LOOP_START) break;
  }

  return all;
}

/**
 * 生词本复习的评分 -> 服务端 type。
 * 与「分类卡组背词页」的 SRS 评分（again/hard/good/easy）是两套东西：
 * 生词本复习只把用户选的档位原样上报，不参与分类卡组的记忆算法。
 */
export const BOOKMARK_REVIEW_TYPE = {
  hard: 0, // 困难
  normal: 1, // 一般
  easy: 3, // 容易
  remembered: 4, // 已记住
} as const;

export type BookmarkGrade = keyof typeof BOOKMARK_REVIEW_TYPE;

/**
 * 上报生词本复习结果：只报给生词本卡组（默认电影卡组），
 * 不写本地 SRS 进度、不影响分类卡组的掌握数统计。
 */
export async function reportBookmarkReview(wordId: number, type: number): Promise<void> {
  const packId = await fetchDefaultMoviePackId();
  // 直接上报：失败要抛给调用方提示用户（packLibrary.markNoteRead 会吞掉异常）
  await api.postForm(`/anki/pack/${packId}/learn/log.json`, {
    cardId: wordId,
    type,
    _method: 'PATCH',
  });
}
