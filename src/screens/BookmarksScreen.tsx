import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { WordCard } from '../components/WordCard';
import { Header } from '../components/Header';
import { Colors } from '../theme/colors';

interface BookmarksScreenProps {
  navigation: any;
}

export const BookmarksScreen: React.FC<BookmarksScreenProps> = ({ navigation }) => {
  const { state, toggleBookmark, words } = useProgress();

  const bookmarkedWords = useMemo(() => {
    return words.filter((w) => state.progressMap[w.id]?.isBookmarked);
  }, [state.progressMap, words]);

  const handleStudyBookmarks = () => {
    if (!bookmarkedWords.length) return;
    navigation.navigate('Flashcard', { filter: 'bookmarked' });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="生词本"
        subtitle={`共 ${bookmarkedWords.length} 个重点词`}
        rightAction={
          bookmarkedWords.length > 0
            ? {
                icon: 'play-circle',
                onPress: handleStudyBookmarks,
              }
            : undefined
        }
      />

      {bookmarkedWords.length > 0 ? (
        <View style={styles.topActionBar}>
          <Text style={styles.tipText}>点击右上角按钮即可集中复习生词本</Text>
        </View>
      ) : null}

      <FlatList
        data={bookmarkedWords}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <WordCard
            word={item}
            progress={state.progressMap[item.id]}
            accent={state.accent}
            onToggleBookmark={() => toggleBookmark(item.id)}
            onPress={() =>
              navigation.navigate('Flashcard', {
                singleWordId: item.id,
              })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="bookmark-outline" size={64} color={Colors.border} />
            <Text style={styles.emptyTitle}>生词本是空的</Text>
            <Text style={styles.emptyDesc}>
              在背词或单词列表里点击书签图标，随时将难记生词收藏到这里
            </Text>
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
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
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
