import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { Colors } from '../theme/colors';
import { WordCard } from '../components/WordCard';
import { Header } from '../components/Header';

interface WordListScreenProps {
  route: any;
  navigation: any;
}

type FilterType = 'all' | 'unlearned' | 'mastered' | 'bookmarked';

export const WordListScreen: React.FC<WordListScreenProps> = ({ route, navigation }) => {
  const { category, subCategory, source, title: routeTitle } = route.params || {};
  const {
    state,
    toggleBookmark,
    recordReview,
    words,
    todayWords,
    packWords,
    todayWordsPackId,
    packWordsPackId,
  } = useProgress();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const title =
    routeTitle || (subCategory ? `${category} · ${subCategory}` : category || '全部单词');

  // 基础词汇池：source = 'today' 今日学习单词；'pack' 子卡组单词列表；默认全部词库
  const baseWords = useMemo(() => {
    const pool = source === 'today' ? todayWords : source === 'pack' ? packWords : words;
    return pool.filter((w) => {
      if (category && w.cat !== category) return false;
      if (subCategory && w.sub !== subCategory) return false;
      return true;
    });
  }, [category, subCategory, words, todayWords, packWords, source]);

  // 过滤逻辑
  const filteredWords = useMemo(() => {
    return baseWords.filter((w) => {
      const p = state.progressMap[w.id];
      const isMastered = p?.status === 'mastered';
      const isBookmarked = p?.isBookmarked || false;

      // 状态筛选
      if (activeFilter === 'mastered' && !isMastered) return false;
      if (activeFilter === 'unlearned' && isMastered) return false;
      if (activeFilter === 'bookmarked' && !isBookmarked) return false;

      return true;
    });
  }, [baseWords, state.progressMap, activeFilter]);

  /** 标记为「已记住」：与闪卡页「已记住」按钮同一个接口（上报 type=4） */
  const handleMarkMastered = async (wordId: number) => {
    try {
      await recordReview(wordId, 'remembered');
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '标记已记住失败，请重试');
    }
  };

  /** 加入/取消生词本：加入会调服务端 /anki/movie2card，失败时不改本地状态 */
  const handleToggleBookmark = async (wordId: number, wordName?: string) => {
    try {
      await toggleBookmark(wordId, wordName);
    } catch (e: any) {
      Alert.alert('加入生词本失败', e?.message || '请检查网络后重试');
    }
  };

  const handleStartStudy = () => {
    if (source === 'today' || source === 'pack') {
      // 带上当前卡组 id，学完后可继续学习下一个子卡组
      const packId = source === 'today' ? todayWordsPackId : packWordsPackId;
      navigation.navigate('Flashcard', {
        wordIds: filteredWords.map((w) => w.id),
        title,
        packId: packId ?? undefined,
      });
      return;
    }
    navigation.navigate('Flashcard', {
      category,
      subCategory,
      filter: activeFilter,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title={title}
        subtitle={`共 ${filteredWords.length} 词`}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'play-circle',
          onPress: handleStartStudy,
        }}
      />

      {/* 状态过滤 Tab */}
      <View style={styles.filterRow}>
        {(
          [
            { id: 'all', label: '全部' },
            { id: 'unlearned', label: '待掌握' },
            { id: 'mastered', label: '已掌握' },
            { id: 'bookmarked', label: '生词本' },
          ] as { id: FilterType; label: string }[]
        ).map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(tab.id)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 单词列表 */}
      <FlatList
        data={filteredWords}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <WordCard
            word={item}
            progress={state.progressMap[item.id]}
            accent={state.accent}
            onToggleBookmark={() => handleToggleBookmark(item.id, item.word)}
            onMarkMastered={() => handleMarkMastered(item.id)}
            onPress={() =>
              navigation.navigate('Flashcard', {
                singleWordId: item.id,
              })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>没有找到符合条件的单词</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.divider,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 30,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
});
