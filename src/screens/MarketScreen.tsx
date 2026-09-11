import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { packLibrary, RemotePack } from '../services/packLibrary';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface MarketScreenProps {
  route: any;
  navigation: any;
}

/**
 * 卡组市场: 从市场选择 pack_type = qian_wen_cat 的卡组并安装到我的卡组
 * 列表: GET  /anki/pack/in-store.json
 * 安装: POST /anki/pack/install.json (sourceId + name)
 */
export const MarketScreen: React.FC<MarketScreenProps> = ({ route, navigation }) => {
  const { isLoggedIn, setInstalledPack } = useProgress();

  // 分类页检测到「我的卡组」为空时进入，顶部展示引导提示
  const firstSetup = route?.params?.firstSetup === true;

  const [packs, setPacks] = useState<RemotePack[]>([]);
  const [myPacks, setMyPacks] = useState<RemotePack[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 待确认添加的卡组 (不为 null 时显示确认框)
  const [pendingPack, setPendingPack] = useState<RemotePack | null>(null);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [market, mine] = await Promise.all([
        packLibrary.fetchMarketPacks({ start: 0, limit: 50 }),
        packLibrary.fetchPackList({ start: 0, limit: 100, parentId: 0 }),
      ]);
      setPacks(market.packs);
      setMyPacks(mine.packs);
      const ids = new Set<number>();
      for (const p of mine.packs) {
        if (p.source_id) ids.add(Number(p.source_id));
      }
      setInstalledIds(ids);
    } catch (e: any) {
      setErrorMsg(e?.message || '加载卡组市场失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  /** 已添加的卡组: 直接切换回分类页并选中它 */
  const handleSwitchToInstalled = useCallback(
    (marketPackId: number) => {
      const mine = myPacks.find((p) => Number(p.source_id) === marketPackId);
      if (mine) {
        setInstalledPack(mine);
        navigation.goBack();
        return;
      }
      Alert.alert('提示', '该卡组已添加，可在分类页顶部下拉切换');
    },
    [myPacks, setInstalledPack, navigation]
  );

  /** 点击添加: 先弹出 ConfirmDialog 确认 */
  const handleInstall = useCallback(
    (pack: RemotePack) => {
      if (!isLoggedIn) {
        Alert.alert('需要登录', '请先登录后再添加卡组', [
          { text: '取消', style: 'cancel' },
          { text: '去登录', onPress: () => navigation.navigate('Login') },
        ]);
        return;
      }
      if (installingId !== null) return;
      setPendingPack(pack);
    },
    [isLoggedIn, navigation, installingId]
  );

  /** 确认框点「确定」: 执行安装 */
  const confirmInstall = useCallback(async () => {
    const pack = pendingPack;
    setPendingPack(null);
    if (!pack) return;

    setInstallingId(pack.id);
    try {
      const installed = await packLibrary.installPack(pack.id, pack.name);
      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.add(pack.id);
        return next;
      });
      setInstallingId(null);
      // 通知分类页刷新我的卡组并切换到新安装的卡组
      setInstalledPack(installed || ({ ...pack } as RemotePack));
      navigation.goBack();
      Alert.alert('添加成功', `「${pack.name}」已添加到我的卡组`);
    } catch (e: any) {
      setInstallingId(null);
      Alert.alert('添加失败', e?.message || '安装卡组失败，请稍后重试');
    }
  }, [pendingPack, navigation, setInstalledPack]);

  const renderCard = (item: RemotePack) => {
    const installed = installedIds.has(item.id);
    const installing = installingId === item.id;
    // 整张卡片主体也可点击，避免只点按钮时没反应
    const onPressCard = () =>
      installed ? handleSwitchToInstalled(item.id) : handleInstall(item);

    return (
      <View key={String(item.id)} style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={onPressCard}
          disabled={installing}
          activeOpacity={0.7}
        >
          <Image source={{ uri: item.preview }} style={styles.cover} resizeMode="cover" />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {installed ? (
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              ) : null}
            </View>
            {item.summary ? (
              <Text style={styles.summary} numberOfLines={2}>
                {item.summary}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{item.card_count || 0} 词</Text>
              <Text style={styles.metaText}>{item.install_times || 0} 人安装</Text>
              <Text style={styles.priceText}>
                {(item.price || 0) > 0 ? `¥${item.price}` : '免费'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, installed && styles.addBtnDone]}
          onPress={onPressCard}
          disabled={installing}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {installing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.addBtnText, installed && styles.addBtnTextDone]}>
              {installed ? '切换' : '添加'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="卡组市场"
        subtitle="从市场添加分类背单词卡组"
        onBack={() => navigation.goBack()}
      />

      {firstSetup ? (
        <View style={styles.tipBanner}>
          <Ionicons name="information-circle" size={18} color={Colors.primary} />
          <Text style={styles.tipText}>
            你还没有卡组，请先添加一个分类背单词卡组后才能使用
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>正在加载卡组市场...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerWrap}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.border} />
          <Text style={styles.centerText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadMarket} activeOpacity={0.8}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadMarket} colors={[Colors.primary]} />
          }
        >
          {packs.length === 0 ? (
            <View style={styles.centerWrap}>
              <Ionicons name="albums-outline" size={48} color={Colors.border} />
              <Text style={styles.centerText}>暂无可添加的卡组</Text>
            </View>
          ) : (
            packs.map(renderCard)
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={pendingPack !== null}
        title="添加卡组"
        message={`确定把「${pendingPack?.name || ''}」添加到我的卡组？`}
        onConfirm={confirmInstall}
        onCancel={() => setPendingPack(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.divider,
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summary: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  priceText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
  addBtn: {
    minWidth: 62,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDone: {
    backgroundColor: Colors.divider,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addBtnTextDone: {
    color: Colors.textMuted,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  centerText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
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
});
