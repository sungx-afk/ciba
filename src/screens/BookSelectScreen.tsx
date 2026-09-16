import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { packLibrary, RemotePack } from '../services/packLibrary';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';

interface BookSelectScreenProps {
  navigation: any;
}

export const BookSelectScreen: React.FC<BookSelectScreenProps> = ({ navigation }) => {
  const { isLoggedIn, loadPackWords, currentPack, currentTopPack, revertToLocal } = useProgress();
  const [packs, setPacks] = useState<RemotePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPackId, setLoadingPackId] = useState<number | null>(null);

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    setLoading(true);
    try {
      // 与首页顶部「我的卡组」下拉同一份数据: GET /anki/pack.json (parentId = 0)
      const { packs } = await packLibrary.fetchMyPacks({ start: 0, limit: 100 });
      setPacks(packs);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '无法获取我的卡组');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPack = async (pack: RemotePack) => {
    if (!isLoggedIn) {
      Alert.alert('需要登录', '请先登录后再切换在线词库', [
        { text: '取消', style: 'cancel' },
        { text: '去登录', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }

    setLoadingPackId(pack.id);
    try {
      // 列表本身就是「我的卡组」，无需再走安装流程
      await loadPackWords(pack);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('切换词库失败', e?.message || '请稍后重试');
    } finally {
      setLoadingPackId(null);
    }
  };

  const handleUseLocal = () => {
    revertToLocal();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="切换词库" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>正在加载我的卡组...</Text>
        </View>
      ) : (
        <FlatList
          data={packs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          // ListHeaderComponent={
          //   <View style={styles.localSection}>
          //     <TouchableOpacity style={styles.localCard} onPress={handleUseLocal} activeOpacity={0.7}>
          //       <View style={styles.localIconWrap}>
          //         <Ionicons name="folder-open-outline" size={24} color={Colors.primary} />
          //       </View>
          //       <View style={styles.localInfo}>
          //         <Text style={styles.localTitle}>本地词库 (TOEFL 意群)</Text>
          //         <Text style={styles.localDesc}>内置 9800+ 托福词汇，按意群分类</Text>
          //       </View>
          //       {currentPack === null && (
          //         <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
          //       )}
          //     </TouchableOpacity>
          //     <Text style={styles.sectionLabel}>词库列表</Text>
          //   </View>
          // }
          renderItem={({ item }) => {
            // 与首页顶部「我的卡组」保持一致：优先按当前顶层卡组判定
            const isActive =
              [currentTopPack?.id, currentPack?.id].filter((id) => id !== undefined && id !== null)
                .some((id) => Number(id) === Number(item.id));
            const isLoadingThis = loadingPackId === item.id;
            return (
              <TouchableOpacity
                style={[styles.packCard, isActive && styles.packCardActive]}
                onPress={() => handleSelectPack(item)}
                disabled={loadingPackId !== null}
                activeOpacity={0.7}
              >
                <View style={styles.packHeader}>
                  <Text style={styles.packName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  )}
                </View>
                {item.summary ? (
                  <Text style={styles.packSummary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
                <View style={styles.packMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="documents-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.metaText}>
                      {item.card_count ? `${item.card_count} 词` : '—'}
                    </Text>
                  </View>
                  {/* {typeof item.price === 'number' && item.price > 0 ? (
                    <View style={styles.priceTag}>
                      <Text style={styles.priceText}>¥{item.price}</Text>
                    </View>
                  ) : (
                    <View style={styles.freeTag}>
                      <Text style={styles.freeText}>免费</Text>
                    </View>
                  )} */}
                </View>
                {isLoadingThis && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator color={Colors.primary} />
                    <Text style={styles.loadingOverlayText}>加载中...</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="library-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>我的卡组还是空的</Text>
              <Text style={styles.emptyHint}>先去卡组市场添加词库，之后就能在这里直接切换</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => navigation.navigate('Market', { firstSetup: true })}
              >
                <Text style={styles.retryText}>去卡组市场</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={loadPacks}>
                <Text style={styles.secondaryText}>刷新</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  localSection: {
    marginBottom: 8,
  },
  localCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  localIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  localInfo: {
    flex: 1,
  },
  localTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  localDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 4,
    marginBottom: 8,
  },
  packCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  packCardActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  packHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  packSummary: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  packMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  priceTag: {
    backgroundColor: Colors.pinwheelRed + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.pinwheelRed,
  },
  freeTag: {
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingOverlayText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
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
  secondaryBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  secondaryText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
});
