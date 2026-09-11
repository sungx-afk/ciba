import { api } from './api';
import { Word } from '../types';

/**
 * 后端 anki pack / note / card 模型
 */

export interface RemotePack {
  id: number;
  name: string;
  preview?: string;
  summary?: string;
  price?: number;
  card_count?: number;
  catId?: number;
  storeStatus?: number;
  status?: number;
  today_card_count?: number;
  today_learned_card_count?: number;
  remembered_card_count?: number;
  conf?: string;
  [key: string]: any;
}

export interface RemoteMenu {
  id: number;
  name: string;
  pid?: number;
  children?: RemoteMenu[];
  [key: string]: any;
}

export interface RemoteNote {
  id: number;
  name: string;
  data?: string; // JSON string
  mod_id?: string | number;
  package_id?: number;
  [key: string]: any;
}

export interface RemoteCard {
  id: number;
  package_id: number;
  type?: number; // 学习状态: 0 未学, 1/2/3 学习中, 4 已掌握
  menu_id?: number;
  note: RemoteNote;
  [key: string]: any;
}

/** note.data 解析后的结构 */
export interface NoteData {
  phonetic?: string;
  translation?: string;
  ph_en_mp3?: string;
  ph_am_mp3?: string;
  [key: string]: any;
}

interface MarketPacksResponse {
  result: number;
  msg?: string;
  packs: RemotePack[];
  total?: number;
}

interface PackDetailResponse {
  result: number;
  msg?: string;
  pack: RemotePack;
}

interface LearnResponse {
  result: number;
  msg?: string;
  cards: RemoteCard[];
  total?: number;
  pack?: RemotePack;
  menu?: RemoteMenu[];
}

interface MenuResponse {
  result: number;
  msg?: string;
  menu: RemoteMenu[];
}

interface InstallResponse {
  result: number;
  msg?: string;
  pack?: RemotePack;
}

/**
 * 词库服务: 市场列表 / 安装 / 卡片加载 / 学习上报
 */
class PackLibrary {
  /** 英语词库分类 id (cibaen.com 上英语类目的 catId) */
  static readonly ENGLISH_CAT_ID = 4;
  static readonly STORE_APPROVED = 2;

  /** 拉取市场中已上架的英语词库 */
  async fetchMarketPacks(
    catId: number = PackLibrary.ENGLISH_CAT_ID,
    limit: number = 100
  ): Promise<RemotePack[]> {
    const rsp = await api.get<MarketPacksResponse>('/anki/pack/in-store.json', {
      start: 0,
      limit,
      catId,
      storeStatus: PackLibrary.STORE_APPROVED,
    });
    return rsp.packs || [];
  }

  /** 拉取词库详情 */
  async fetchPackDetail(packId: number): Promise<RemotePack> {
    const rsp = await api.get<PackDetailResponse>(`/anki/pack/${packId}.json`);
    return rsp.pack;
  }

  /** 拉取词库目录 (分类菜单) */
  async fetchPackMenus(packId: number): Promise<RemoteMenu[]> {
    try {
      const rsp = await api.get<MenuResponse>(`/anki/pack/${packId}/menu.json`);
      return rsp.menu || [];
    } catch {
      return [];
    }
  }

  /** 拉取词库卡片 (分页) */
  async fetchPackCards(
    packId: number,
    options: { start?: number; limit?: number; menuId?: number } = {}
  ): Promise<{ cards: RemoteCard[]; total: number }> {
    const { start = 0, limit = 200, menuId } = options;
    const path = menuId
      ? `/anki/pack/${packId}/learn-by-menu.json`
      : `/anki/pack/${packId}/learn.json`;
    const query: Record<string, any> = { start, limit };
    if (menuId) query.menuId = menuId;
    const rsp = await api.get<LearnResponse>(path, query);
    return { cards: rsp.cards || [], total: rsp.total || 0 };
  }

  /** 安装市场词库到我的词库 (前端用 qs.stringify 以 form-urlencoded 提交) */
  async installPack(sourceId: number, name: string): Promise<RemotePack | undefined> {
    const rsp = await api.postForm<InstallResponse>('/anki/pack/install.json', {
      sourceId,
      name,
    });
    return rsp.pack;
  }

  /** 上报学习结果 (type: 0=重来 1=困难 2=一般 3=容易 4=已掌握) */
  async markNoteRead(packageId: number, cardId: number, type: number): Promise<void> {
    try {
      // 前端用 qs.stringify 以 form-urlencoded 提交
      await api.postForm(`/anki/pack/${packageId}/learn/log.json`, {
        cardId,
        type,
        _method: 'PATCH',
      });
    } catch (e) {
      // 上报失败不阻断本地学习
      console.warn('markNoteRead failed', e);
    }
  }

  /**
   * 把远程卡片转换为本地 Word 模型
   *  - word    <- note.name
   *  - meaning <- note.data.translation
   *  - note    <- 音标 + 助记信息 (从 note.data 提取)
   */
  mapCardToWord(card: RemoteCard, cat = '', sub = ''): Word {
    const note = card.note || ({} as RemoteNote);
    let noteData: NoteData = {};
    if (note.data) {
      try {
        noteData = JSON.parse(note.data);
      } catch {
        // ignore
      }
    }
    const phonetic = noteData.phonetic ? `[${noteData.phonetic}]` : '';
    const extra = Object.entries(noteData)
      .filter(([k]) => !['phonetic', 'translation', 'ph_en_mp3', 'ph_am_mp3', 'audio'].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    return {
      id: card.id,
      word: note.name || '',
      meaning: noteData.translation || '',
      note: [phonetic, extra].filter(Boolean).join('\n'),
      cat,
      sub,
    };
  }

  /**
   * 加载整个词库的所有单词，按目录分类。
   * 策略: 先拉目录，再按目录拉卡片；若目录为空则直接拉全部卡片。
   */
  async loadWordsFromPack(packId: number): Promise<Word[]> {
    const menus = await this.fetchPackMenus(packId);
    const words: Word[] = [];

    if (menus.length > 0) {
      // 扁平化目录树，记录每个目录的父级名称
      const flatMenus: { id: number; name: string; parentName: string }[] = [];
      const walk = (list: RemoteMenu[], parentName = '') => {
        for (const m of list) {
          flatMenus.push({ id: m.id, name: m.name, parentName });
          if (m.children && m.children.length) {
            walk(m.children, m.name);
          }
        }
      };
      walk(menus);

      for (const m of flatMenus) {
        const cat = m.parentName || m.name;
        const sub = m.parentName ? m.name : '';
        let start = 0;
        // 每个目录最多拉 500 条，避免超大目录卡死
        for (let i = 0; i < 10; i++) {
          const { cards, total } = await this.fetchPackCards(packId, {
            start,
            limit: 200,
            menuId: m.id,
          });
          for (const c of cards) {
            words.push(this.mapCardToWord(c, cat, sub));
          }
          start += cards.length;
          if (cards.length === 0 || start >= total) break;
        }
      }
    } else {
      // 没有目录，直接拉全部卡片
      let start = 0;
      for (let i = 0; i < 20; i++) {
        const { cards, total } = await this.fetchPackCards(packId, { start, limit: 200 });
        for (const c of cards) {
          words.push(this.mapCardToWord(c, '全部', ''));
        }
        start += cards.length;
        if (cards.length === 0 || start >= total) break;
      }
    }

    // 去重 (按 card id)
    const seen = new Set<number>();
    return words.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  }
}

export const packLibrary = new PackLibrary();
