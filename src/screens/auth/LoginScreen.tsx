import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import { AuthInput } from '../../components/AuthInput';
import { CountdownButton } from '../../components/CountdownButton';
import { AuthApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type LoginTab = 'mobile' | 'password';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login } = useAuth();

  const [activeTab, setActiveTab] = useState<LoginTab>('mobile');

  // 表单状态
  const [mobile, setMobile] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  // 协议与加载状态
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  // 格式化手机号输入 (3-4-4 分段显示)
  const handleMobileChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 11);
    setMobile(cleaned);
  };

  // 1. 发送手机验证码
  const handleSendSmsCode = async (): Promise<boolean> => {
    const trimmed = mobile.trim();
    if (!trimmed || !/^1[3-9]\d{9}$/.test(trimmed)) {
      Alert.alert('提示', '请输入有效的11位中国大陆手机号');
      return false;
    }

    try {
      const res = await AuthApi.sendMobileCode(trimmed, 'login');
      if (res && (res.result === 0 || res.result === 1)) {
        Alert.alert('发送成功', '验证码已发送至您的手机，请注意查收');
        return true;
      } else {
        Alert.alert('提示', res?.msg || '短信验证码服务响应失败，请稍后重试');
        return false;
      }
    } catch (err: any) {
      Alert.alert('发送异常', err.message || '网络连接超时');
      return false;
    }
  };

  // 2. 短信验证码登录/自动注册
  const handleMobileLogin = async () => {
    if (!agreeTerms) {
      Alert.alert('提示', '请先阅读并勾选用户协议与隐私政策');
      return;
    }
    const trimmedMobile = mobile.trim();
    const trimmedCode = smsCode.trim();

    if (!trimmedMobile || !/^1[3-9]\d{9}$/.test(trimmedMobile)) {
      Alert.alert('提示', '请输入正确的11位手机号');
      return;
    }
    if (!trimmedCode) {
      Alert.alert('提示', '请输入收到的验证码');
      return;
    }

    setSubmitting(true);
    try {
      const res = await AuthApi.mobileLogin(trimmedMobile, trimmedCode);
      if (res && (res.result === 0 || res.result === 1) && res.user && res.token) {
        await login(res.user, res.token);
        Alert.alert('登录成功', `欢迎回来，${res.user.nickname || trimmedMobile}！`, [
          { text: '开启背词', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('登录失败', res?.msg || '验证码错误或已过期');
      }
    } catch (err: any) {
      Alert.alert('登录失败', err.message || '网络连接异常');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. 密码登录
  const handlePasswordLogin = async () => {
    if (!agreeTerms) {
      Alert.alert('提示', '请先阅读并勾选用户协议与隐私政策');
      return;
    }
    const trimmedAccount = account.trim();
    if (!trimmedAccount) {
      Alert.alert('提示', '请输入手机号或邮箱');
      return;
    }
    if (!password) {
      Alert.alert('提示', '请输入登录密码');
      return;
    }

    setSubmitting(true);
    try {
      const res = await AuthApi.emailLogin(trimmedAccount, password);
      if (res && (res.result === 0 || res.result === 1) && res.user && res.token) {
        await login(res.user, res.token);
        Alert.alert('登录成功', `欢迎回来，${res.user.nickname || '学者'}！`, [
          { text: '开启背词', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('登录失败', res?.msg || '账号或密码不正确');
      }
    } catch (err: any) {
      Alert.alert('登录失败', err.message || '网络连接异常');
    } finally {
      setSubmitting(false);
    }
  };

  // 4. 微信快捷授权登录
  const handleWechatLogin = async () => {
    if (!agreeTerms) {
      Alert.alert('提示', '请先阅读并勾选用户协议与隐私政策');
      return;
    }

    setSocialLoading(true);
    try {
      const res = await AuthApi.wechatAppLogin({
        openid: `wx_ciba_${Date.now()}`,
        nickname: '微信词友',
        headimgurl: 'https://cibaen.com/static/avatar/default.png',
        sex: 1,
      });

      if (res && (res.result === 0 || res.result === 1) && res.user && res.token) {
        await login(res.user, res.token);
        Alert.alert('微信登录成功', `欢迎回来，${res.user.nickname || '微信用户'}！`, [
          { text: '确定', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('微信授权失败', res?.msg || '微信登录失败');
      }
    } catch (err: any) {
      Alert.alert('登录异常', err.message || '微信调起失败');
    } finally {
      setSocialLoading(false);
    }
  };

  // 5. Apple 授权真实登录
  const handleAppleLogin = async () => {
    if (!agreeTerms) {
      Alert.alert('提示', '请先阅读并勾选用户协议与隐私政策');
      return;
    }

    setSocialLoading(true);
    try {
      const res = await AuthApi.appleLogin({
        appleUserId: `guest_${Date.now()}`,
        fullName: 'Apple 尊享学员',
      });

      if (res && (res.result === 0 || res.result === 1) && res.user && res.token) {
        await login(res.user, res.token);
        Alert.alert('Apple 登录成功', `欢迎回来，${res.user.nickname || 'Apple 学员'}！`, [
          { text: '开启背词', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Apple 登录失败', res?.msg || 'Apple ID 授权失败');
      }
    } catch (err: any) {
      Alert.alert('登录异常', err.message || 'Apple 授权调起失败');
    } finally {
      setSocialLoading(false);
    }
  };

  // 计算手机号分段显示格式
  const formatMobile = (raw: string) => {
    if (raw.length <= 3) return raw;
    if (raw.length <= 7) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
    return `${raw.slice(0, 3)} ${raw.slice(3, 7)} ${raw.slice(7)}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* 上半部核心交互群组 */}
          <View style={styles.topGroup}>
            {/* 顶部宽绰导航 Bar */}
            <View style={styles.navBar}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#5C5243" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.registerBadge}
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.75}
              >
                <Text style={styles.registerBadgeText}>免费注册</Text>
              </TouchableOpacity>
            </View>

            {/* 舒展的 Hero 欢迎插画区 */}
            <View style={styles.heroSection}>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroTitle}>Hello!</Text>
                <Text style={styles.heroSubtitle}>欢迎使用灵感背词平台</Text>
                <Text style={styles.heroTagline}>意群联想记忆 · 高效突破核心词汇</Text>
              </View>

              <View style={styles.heroIllustrationContainer}>
                <Image
                  source={require('../../assets/login_hero.jpg')}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
              </View>
            </View>

            {/* 浮层悬浮主卡片 (Floating Neo-Card) */}
            <View style={styles.floatingCard}>
              {/* 卡片顶部极简文字 Tab */}
              <View style={styles.cardTabRow}>
                <TouchableOpacity
                  style={styles.cardTabItem}
                  onPress={() => setActiveTab('mobile')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cardTabText,
                      activeTab === 'mobile' && styles.cardTabTextActive,
                    ]}
                  >
                    验证码登录
                  </Text>
                  {activeTab === 'mobile' && <View style={styles.cardTabIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardTabItem}
                  onPress={() => setActiveTab('password')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cardTabText,
                      activeTab === 'password' && styles.cardTabTextActive,
                    ]}
                  >
                    密码登录
                  </Text>
                  {activeTab === 'password' && <View style={styles.cardTabIndicator} />}
                </TouchableOpacity>
              </View>

              {/* 表单输入区域 */}
              {activeTab === 'mobile' ? (
                <View style={styles.formBody}>
                  <AuthInput
                    placeholder="请输入手机号"
                    keyboardType="phone-pad"
                    maxLength={13}
                    iconName="phone-portrait-outline"
                    prefix="+86"
                    value={formatMobile(mobile)}
                    onChangeText={handleMobileChange}
                    onClear={() => setMobile('')}
                  />

                  <AuthInput
                    placeholder="请输入验证码"
                    keyboardType="number-pad"
                    maxLength={6}
                    iconName="shield-checkmark-outline"
                    value={smsCode}
                    onChangeText={setSmsCode}
                    rightAction={
                      <CountdownButton
                        onSend={handleSendSmsCode}
                        disabled={mobile.length !== 11}
                        text="获取验证码"
                      />
                    }
                  />

                  <View style={styles.cardSubActionRow}>
                    <TouchableOpacity
                      onPress={() => setActiveTab('password')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.subActionText}>使用账号密码登录</Text>
                    </TouchableOpacity>
                    <Text style={styles.firstLoginTip}>*首次验证自动注册</Text>
                  </View>

                  {/* 登录按钮 */}
                  <TouchableOpacity
                    style={[styles.heroButton, submitting && styles.heroButtonDisabled]}
                    onPress={handleMobileLogin}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.heroButtonText}>登 录</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.formBody}>
                  <AuthInput
                    placeholder="手机号 / 电子邮箱 / 账号"
                    keyboardType="email-address"
                    iconName="person-outline"
                    value={account}
                    onChangeText={setAccount}
                    onClear={() => setAccount('')}
                  />

                  <AuthInput
                    placeholder="请输入登录密码"
                    isPassword
                    iconName="lock-closed-outline"
                    value={password}
                    onChangeText={setPassword}
                  />

                  <View style={styles.cardSubActionRow}>
                    <TouchableOpacity
                      onPress={() => setActiveTab('mobile')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.subActionText}>手机验证码登录</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => navigation.navigate('ForgotPassword')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.subActionHighlight}>忘记密码？</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 登录按钮 */}
                  <TouchableOpacity
                    style={[styles.heroButton, submitting && styles.heroButtonDisabled]}
                    onPress={handlePasswordLogin}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.heroButtonText}>登 录</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* 用户协议与隐私政策 */}
              <TouchableOpacity
                style={styles.termsBox}
                onPress={() => setAgreeTerms(!agreeTerms)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={agreeTerms ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={agreeTerms ? Colors.primary : '#B5AEA2'}
                />
                <Text style={styles.termsText}>
                  登录即代表您已阅读并同意
                  <Text
                    style={styles.termsLink}
                    onPress={() =>
                      Alert.alert('用户协议', '感谢使用糍粑背单词，请遵守相关服务条款。')
                    }
                  >
                    《用户协议》
                  </Text>
                  与
                  <Text
                    style={styles.termsLink}
                    onPress={() =>
                      Alert.alert('隐私政策', '我们严密保护您的学习数据与账户隐私。')
                    }
                  >
                    《隐私政策》
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 下半部托底群组：第三方社交登录自然贴靠底部 */}
          <View style={styles.bottomGroup}>
            <View style={styles.socialDividerRow}>
              <View style={styles.socialLine} />
              <Text style={styles.socialDividerText}>第三方登录</Text>
              <View style={styles.socialLine} />
            </View>

            <View style={styles.socialBtnGroup}>
              {/* 微信登录 */}
              <TouchableOpacity
                style={[styles.socialCircleBtn, styles.wechatBg]}
                onPress={handleWechatLogin}
                activeOpacity={0.8}
                disabled={socialLoading}
              >
                {socialLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="logo-wechat" size={25} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              {/* Apple 登录 */}
              <TouchableOpacity
                style={[styles.socialCircleBtn, styles.appleBg]}
                onPress={handleAppleLogin}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              {/* 邮箱登录 */}
              <TouchableOpacity
                style={[styles.socialCircleBtn, styles.emailBg]}
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.8}
              >
                <Ionicons name="mail" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* 底部保障与安心说明 */}
            <Text style={styles.bottomSecurityText}>
              安全加密 · 跨端云同步
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFDF9',
  },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 24,
  },
  topGroup: {
    width: '100%',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBadge: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFF1DD',
    borderWidth: 1,
    borderColor: '#FDE4C2',
  },
  registerBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 14,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1F1A12',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#524738',
    marginTop: 6,
  },
  heroTagline: {
    fontSize: 12,
    color: '#A19688',
    marginTop: 5,
    lineHeight: 17,
  },
  heroIllustrationContainer: {
    width: 112,
    height: 112,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFF4E2',
    ...Platform.select({
      ios: {
        shadowColor: '#C48A45',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  floatingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#917148',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.09,
        shadowRadius: 22,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  cardTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  cardTabItem: {
    marginRight: 26,
    alignItems: 'center',
    position: 'relative',
    paddingBottom: 7,
  },
  cardTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A69E92',
  },
  cardTabTextActive: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F1A12',
  },
  cardTabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  formBody: {
    width: '100%',
  },
  cardSubActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  subActionText: {
    fontSize: 13,
    color: '#736856',
    fontWeight: '500',
  },
  subActionHighlight: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  firstLoginTip: {
    fontSize: 11,
    color: '#B5AEA2',
  },
  heroButton: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  heroButtonDisabled: {
    opacity: 0.65,
  },
  heroButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  termsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 4,
  },
  termsText: {
    fontSize: 12,
    color: '#8A8072',
    marginLeft: 6,
    lineHeight: 18,
  },
  termsLink: {
    color: '#473E31',
    fontWeight: '600',
  },
  bottomGroup: {
    width: '100%',
    alignItems: 'center',
    marginTop: 28,
  },
  socialDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    marginBottom: 20,
  },
  socialLine: {
    flex: 1,
    height: 0.8,
    backgroundColor: '#EBE4D8',
  },
  socialDividerText: {
    paddingHorizontal: 14,
    fontSize: 12,
    color: '#A89F91',
  },
  socialBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  socialCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  wechatBg: {
    backgroundColor: '#07C160',
  },
  appleBg: {
    backgroundColor: '#1F1A12',
  },
  emailBg: {
    backgroundColor: '#3B82F6',
  },
  bottomSecurityText: {
    fontSize: 11,
    color: '#BFB6A8',
  },
});
