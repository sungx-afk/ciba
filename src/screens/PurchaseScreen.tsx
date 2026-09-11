import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { Colors } from '../theme/colors';

interface Plan {
  id: string;
  label: string;
  price: number;
  originalPrice?: number;
  monthlyPrice: string;
  save?: number;
}

const PLANS: Plan[] = [
  {
    id: '12m',
    label: '12 个月',
    price: 78,
    originalPrice: 120,
    monthlyPrice: '¥6.5',
    save: 35,
  },
  {
    id: '3m',
    label: '3 个月',
    price: 25,
    originalPrice: 30,
    monthlyPrice: '¥8.3',
  },
  {
    id: '1m',
    label: '1 个月',
    price: 10,
    monthlyPrice: '¥10',
  },
];

const BENEFITS = [
  '词库全解锁：高中 / 四级 / 考研 / 托福',
  '后续新增词库免费用',
];

// TODO: 用户协议与隐私政策暂时指向同一页面，后续拆成各自的地址
const AGREEMENT_URL = 'https://cibaen.com/privacy-policy.html';
const POLICY_URL = 'https://cibaen.com/privacy-policy.html';

interface PurchaseScreenProps {
  navigation: any;
}

export const PurchaseScreen: React.FC<PurchaseScreenProps> = ({ navigation }) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>('12m');

  const handleBuy = () => {
    Alert.alert('提示', '会员通道尚未开放，当前版本全部功能免费。');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <Header title="升级会员" onBack={() => navigation.goBack()} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* 权益卡片 */}
        <View style={styles.benefitCard}>
          <Text style={styles.benefitTitle}>解锁全部权益</Text>
          {BENEFITS.map((item, index) => (
            <View key={index} style={styles.benefitRow}>
              <Ionicons
                name="checkmark"
                size={16}
                color={Colors.primary}
                style={styles.checkIcon}
              />
              <Text style={styles.benefitText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* 套餐选择 */}
        <View style={styles.plansContainer}>
          {PLANS.map((plan) => {
            const selected = plan.id === selectedPlanId;
            return (
              <TouchableOpacity
                key={plan.id}
                activeOpacity={0.8}
                onPress={() => setSelectedPlanId(plan.id)}
                style={[styles.planCard, selected && styles.planCardSelected]}
              >
                <View style={styles.planLeft}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.planInfo}>
                    <View style={styles.planTitleRow}>
                      <Text style={styles.planTitle}>{plan.label}</Text>
                      {plan.save ? (
                        <View style={styles.saveBadge}>
                          <Text style={styles.saveBadgeText}>省 {plan.save}%</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.planMonthly}>{plan.monthlyPrice} / 月</Text>
                  </View>
                </View>

                <View style={styles.planRight}>
                  <Text style={styles.planPrice}>¥{plan.price}</Text>
                  {plan.originalPrice && plan.originalPrice !== plan.price ? (
                    <Text style={styles.planOriginalPrice}>
                      ¥{plan.originalPrice}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.buyButton}
          activeOpacity={0.7}
          onPress={handleBuy}
        >
          <Text style={styles.buyButtonText}>购买</Text>
        </TouchableOpacity>

        <Text style={styles.subscriptionHint}>
          自动续费订阅，可随时在 App Store 的「订阅」中管理或取消。
        </Text>

        <View style={styles.footerLinks}>
          <TouchableOpacity activeOpacity={0.6}>
            <Text style={styles.footerLink}>恢复购买</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() =>
              navigation.navigate('WebPage', { url: AGREEMENT_URL, title: '用户协议' })
            }
          >
            <Text style={styles.footerLink}>用户协议</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() =>
              navigation.navigate('WebPage', { url: POLICY_URL, title: '隐私政策' })
            }
          >
            <Text style={styles.footerLink}>隐私政策</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  benefitCard: {
    backgroundColor: Colors.darkCard,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  benefitTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.card,
  },
  benefitSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
  },
  checkIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  plansContainer: {
    marginTop: 24,
  },
  planCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  planInfo: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  saveBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.card,
  },
  planMonthly: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  planRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  planOriginalPrice: {
    fontSize: 13,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  notice: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  buyButton: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  subscriptionHint: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  footerLink: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
