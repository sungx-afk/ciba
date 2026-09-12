import { api, APIError } from './api';
import { Word } from '../types';

/**
 * 生词本列表获取（两步）
 *   1) /anki/pack/flag/default_movie_pack       -> 默认卡组 id（缓存一次）
 *   2) /anki/pack/{packId}/learn-by-menu.json   -> 分页拿卡片
 */

export const BOOKMARK_PAGE_SIZE = 20;

const PACK_FLAG_PATH = '/anki/pack/flag/default_movie_pack';
const SORTERS = JSON.stringify([{ direction: 'desc', column: 'id' }]);

export interface FetchBookmarkedParams {
  start?: number;
  limit?: number;
}

export interface BookmarkedWordPage {
  words: Word[];
  total: number;
  hasMore: boolean;
}

let cachedPackId = 0;

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
    .filter(Boolean);

  const packageId = Number(card?.package_id) || Number(card?.packageId) || 0;

  return {
    id: Number(card?.id ?? note.id),
    word: note.name || card?.name || f[0] || '',
    meaning,
    note: [phonetic, ...examples.map((e) => `· ${e}`)].filter(Boolean).join('\n'),
    cat: '',
    sub: '',
    // 学习结果需要按卡片所属卡组上报，否则会落到当前选中的其它卡组
    ...(packageId ? { packageId } : {}),
  };
}

/** 2. 分页拿生词本列表 */
export async function fetchBookmarkedWords(
  params: FetchBookmarkedParams = {}
): Promise<BookmarkedWordPage> {
  const { start = 0, limit = BOOKMARK_PAGE_SIZE } = params;

  const packId = await fetchDefaultMoviePackId();
  const rsp = await api.get<any>(`/anki/pack/${packId}/learn-by-menu.json`, {
    start,
    limit,
    sorters: SORTERS,
  });

  const cards: any[] = Array.isArray(rsp?.cards) ? rsp.cards : [];
  const words = cards.map(cardToWord).filter((w) => w.word && w.id);
  const total = Number(rsp?.total) || start + words.length;

  return { words, total, hasMore: start + words.length < total };
}
