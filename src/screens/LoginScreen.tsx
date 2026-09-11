import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../storage/progressStore';
import { Colors } from '../theme/colors';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { login } = useProgress();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!loginName.trim() || !password.trim()) {
      Alert.alert('提示', '请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      await login(loginName.trim(), password);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('登录失败', e?.message || '账号或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../assets/pinwheel.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.appName}>糍粑英语</Text>
            <Text style={styles.appSubtitle}>登录以同步词库与学习进度</Text>
          </View>

          {/* 表单 */}
          <View style={styles.formCard}>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="账号 / 邮箱"
                placeholderTextColor={Colors.textMuted}
                value={loginName}
                onChangeText={setLoginName}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.inputRow, styles.inputRowMargin]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="密码"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginBtnText}>登 录</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hintText}>
              使用糍粑英语官网 (cibaen.com) 账号登录
            </Text>
          </View>

          {/* 跳过按钮 */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>暂不登录，使用本地词库</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 72,
    height: 72,
    marginBottom: 16,
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  appSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputRowMargin: {
    marginTop: 14,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hintText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 14,
  },
  skipBtn: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
