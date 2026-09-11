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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import { AuthInput } from '../../components/AuthInput';
import { CountdownButton } from '../../components/CountdownButton';
import { AuthApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type RegisterType = 'mobile' | 'email';

export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login } = useAuth();

  const [registerType, setRegisterType] = useState<RegisterType>('mobile');

  // 表单状态
  const [mobile, setMobile] = useState('');
  const [mobileCode, setMobileCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [agreeTerms, setAgreeTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 格式化手机号
  const handleMobileChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 11);
    setMobile(cleaned);
  };

  const formatMobile = (raw: string) => {
    if (raw.length <= 3) return raw;
    if (raw.length <= 7) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
    return `${raw.slice(0, 3)} ${raw.slice(3, 7)} ${raw.slice(7)}`;
  };

  // 发送手机验证码
  const handleSendMobileCode = async (): Promise<boolean> => {
    const trimmed = mobile.trim();
    if (!trimmed || !/^1[3-9]\d{9}$/.test(trimmed)) {
      Alert.alert('提示', '请输入有效的11位中国大陆手机号');
      return false;
    }

    try {
      const res = await AuthApi.sendMobileCode(trimmed, 'register');
      if (res && res.result === 1) {
        Alert.alert('发送成功', '验证码已发送至您的手机');
        return true;
      } else {
        Alert.alert('发送失败', res?.msg || '短信验证码发送失败');
        return false;
      }
    } catch (e: any) {
      Alert.alert('发送异常', e.message || '网络连接超时');
      return false;
    }
  };

  // 发送邮箱验证码
  const handleSendEmailCode = async (): Promise<boolean> => {
    const trimmed = email.trim();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      Alert.alert('提示', '请输入有效的电子邮箱地址');
      return false;
    }

    try {
      const res = await AuthApi.sendEmailCode(trimmed, 'register');
      if (res && res.result === 1) {
        Alert.alert('发送成功', '验证码已发送至您的邮箱');
        return true;
      } else {
        Alert.alert('发送失败', res?.msg || '邮箱验证码发送失败');
        return false;
      }
    } catch (e: any) {
      Alert.alert('发送异常', e.message || '网络连接超时');
      return false;
    }
  };

  // 提交注册
  const handleRegister = async () => {
    if (!agreeTerms) {
      Alert.alert('提示', '请先阅读并勾选用户协议与隐私政策');
      return;
    }

    if (password.length < 6) {
      Alert.alert('提示', '密码长度至少需要 6 位');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('提示', '两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      if (registerType === 'mobile') {
        const trimmedMobile = mobile.trim();
        const trimmedCode = mobileCode.trim();
        if (!trimmedMobile || !trimmedCode) {
          Alert.alert('提示', '请填写手机号和收到的验证码');
          setSubmitting(false);
          return;
        }

        const res = await AuthApi.registerByMobile({
          mobile: trimmedMobile,
          code: trimmedCode,
          password,
          nickname: nickname.trim() || undefined,
        });

        if (res && res.result === 1 && res.user && res.token) {
          await login(res.user, res.token);
          Alert.alert('注册成功', `欢迎加入糍粑背单词，${res.user.nickname || '同学'}！`, [
            { text: '开启学习', onPress: () => navigation.popToTop() },
          ]);
        } else {
          Alert.alert('注册失败', res?.msg || '注册处理失败，请稍后重试');
        }
      } else {
        const trimmedEmail = email.trim();
        const trimmedCode = emailCode.trim();
        if (!trimmedEmail || !trimmedCode) {
          Alert.alert('提示', '请填写邮箱和收到的验证码');
          setSubmitting(false);
          return;
        }

        const res = await AuthApi.registerByEmail({
          email: trimmedEmail,
          code: trimmedCode,
          password,
          nickname: nickname.trim() || undefined,
        });

        if (res && res.result === 1 && res.user && res.token) {
          await login(res.user, res.token);
          Alert.alert('注册成功', `欢迎加入糍粑背单词，${res.user.nickname || '同学'}！`, [
            { text: '开启学习', onPress: () => navigation.popToTop() },
          ]);
        } else {
          Alert.alert('注册失败', res?.msg || '注册处理失败，请稍后重试');
        }
      }
    } catch (err: any) {
      Alert.alert('注册失败', err.message || '网络连接异常');
    } finally {
      setSubmitting(false);
    }
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
          {/* 上半部群组 */}
          <View style={styles.topGroup}>
            {/* 顶部导航 */}
            <View style={styles.navBar}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-back" size={22} color="#5C5243" />
              </TouchableOpacity>
              <Text style={styles.navTitle}>创建账号</Text>
              <View style={{ width: 38 }} />
            </View>

            {/* 顶部标语 */}
            <View style={styles.headerHero}>
              <Text style={styles.headerHeroTitle}>开启高效背词</Text>
              <Text style={styles.headerHeroSub}>
                注册后解锁多设备云端词库与背词遗忘曲线算法
              </Text>
            </View>

            {/* 浮层悬浮卡片 */}
            <View style={styles.floatingCard}>
              {/* Tab 切换 */}
              <View style={styles.cardTabRow}>
                <TouchableOpacity
                  style={styles.cardTabItem}
                  onPress={() => setRegisterType('mobile')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cardTabText,
                      registerType === 'mobile' && styles.cardTabTextActive,
                    ]}
                  >
                    手机号码注册
                  </Text>
                  {registerType === 'mobile' && <View style={styles.cardTabIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardTabItem}
                  onPress={() => setRegisterType('email')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cardTabText,
                      registerType === 'email' && styles.cardTabTextActive,
                    ]}
                  >
                    电子邮箱注册
                  </Text>
                  {registerType === 'email' && <View style={styles.cardTabIndicator} />}
                </TouchableOpacity>
              </View>

              {/* 输入表单 */}
              {registerType === 'mobile' ? (
                <>
                  <AuthInput
                    placeholder="请输入手机号码"
                    keyboardType="phone-pad"
                    maxLength={13}
                    iconName="phone-portrait-outline"
                    prefix="+86"
                    value={formatMobile(mobile)}
                    onChangeText={(text) => handleMobileChange(text)}
                    onClear={() => setMobile('')}
                  />

                  <AuthInput
                    placeholder="请输入短信验证码"
                    keyboardType="number-pad"
                    maxLength={6}
                    iconName="shield-checkmark-outline"
                    value={mobileCode}
                    onChangeText={setMobileCode}
                    rightAction={
                      <CountdownButton
                        onSend={handleSendMobileCode}
                        disabled={mobile.length !== 11}
                        text="获取验证码"
                      />
                    }
                  />
                </>
              ) : (
                <>
                  <AuthInput
                    placeholder="请输入电子邮箱"
                    keyboardType="email-address"
                    iconName="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    onClear={() => setEmail('')}
                  />

                  <AuthInput
                    placeholder="请输入邮箱验证码"
                    keyboardType="number-pad"
                    maxLength={6}
                    iconName="shield-checkmark-outline"
                    value={emailCode}
                    onChangeText={setEmailCode}
                    rightAction={
                      <CountdownButton
                        onSend={handleSendEmailCode}
                        disabled={!email.trim()}
                        text="获取验证码"
                      />
                    }
                  />
                </>
              )}

              <AuthInput
                placeholder="学习昵称（选填）"
                iconName="happy-outline"
                value={nickname}
                onChangeText={setNickname}
                maxLength={20}
              />

              <AuthInput
                placeholder="设置登录密码（至少6位）"
                isPassword
                iconName="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
              />

              <AuthInput
                placeholder="确认登录密码"
                isPassword
                iconName="checkmark-circle-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />

              {/* 主操作按钮 */}
              <TouchableOpacity
                style={[styles.heroButton, submitting && styles.heroButtonDisabled]}
                onPress={handleRegister}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.heroButtonText}>立 即 注 册</Text>
                )}
              </TouchableOpacity>

              {/* 条款勾选 */}
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
                  注册即代表您已同意
                  <Text
                    style={styles.termsLink}
                    onPress={() => Alert.alert('用户协议', '欢迎使用糍粑背单词。')}
                  >
                    《用户协议》
                  </Text>
                  与
                  <Text
                    style={styles.termsLink}
                    onPress={() => Alert.alert('隐私政策', '您的隐私受到严密保护。')}
                  >
                    《隐私政策》
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 底部群组：已有账号引导贴底 */}
          <View style={styles.bottomGroup}>
            <View style={styles.loginHintRow}>
              <Text style={styles.loginHintText}>已有糍粑账号？</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <Text style={styles.loginHintLink}>直接登录</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.bottomSecurityText}>
              安全加密传输 · 严格遵守隐私保护指引
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F1A12',
  },
  headerHero: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  headerHeroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1F1A12',
    letterSpacing: -0.4,
  },
  headerHeroSub: {
    fontSize: 13,
    color: '#736856',
    marginTop: 6,
    lineHeight: 18,
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
  heroButton: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
    marginTop: 18,
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
  loginHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  loginHintText: {
    fontSize: 14,
    color: '#736856',
  },
  loginHintLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
    marginLeft: 5,
  },
  bottomSecurityText: {
    fontSize: 11,
    color: '#BFB6A8',
  },
});
