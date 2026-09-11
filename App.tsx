import React, { Component, ErrorInfo, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProgressProvider } from './src/storage/progressStore';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Colors } from './src/theme/colors';
import { addBootLog, getBootLogs, subscribeBootLog, LogEntry } from './src/utils/crashGuard';

// 尝试安全引入并隐藏原生 SplashScreen（防止闪屏遮挡主界面导致白屏）
let ExpoSplashScreen: any = null;
try {
  ExpoSplashScreen = require('expo-splash-screen');
} catch (_) {}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    addBootLog('ErrorBoundary', `UI 渲染异常: ${error?.message}`, 'error', error?.stack);
    console.error('App 根级捕获到异常:', error, errorInfo);
  }

  handleRestart = async () => {
    try {
      this.setState({ hasError: false, error: null });
    } catch {
      // ignore
    }
  };

  handleClearAndRestart = async () => {
    try {
      await AsyncStorage.clear();
      this.setState({ hasError: false, error: null });
    } catch {
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>启动遇到轻微异常</Text>
          <Text style={styles.errorMsg}>
            {this.state.error?.message || '未知错误，已为您拦截保护'}
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={this.handleRestart} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>重新载入应用</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={this.handleClearAndRestart} activeOpacity={0.8}>
            <Text style={styles.btnSecondaryText}>清理缓存并重启</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

/** 屏幕常驻的诊断浮窗，方便真机排查白屏与启动状态 */
function DiagnosticBadge() {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLogs(getBootLogs());
    const unsub = subscribeBootLog((entry) => {
      setLogs(getBootLogs());
      if (entry.level === 'error') {
        setHasError(true);
      }
    });
    return unsub;
  }, []);

  return (
    <>
      {/* 悬浮诊断小按钮：常驻右下角，白屏时也可点击查看原因 */}
      <TouchableOpacity
        style={[styles.floatingBadge, hasError && styles.floatingBadgeError]}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.floatingBadgeText}>{hasError ? '⚠️ 诊断' : '🛠 诊断'}</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>应用启动与运行诊断日志</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>关闭</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.logList} showsVerticalScrollIndicator>
              {logs.length === 0 ? (
                <Text style={styles.emptyLogText}>暂无日志记录</Text>
              ) : (
                logs.map((item, index) => (
                  <View key={index} style={[styles.logItem, item.level === 'error' && styles.logItemError]}>
                    <Text style={styles.logMeta}>
                      [{item.time}] [{item.tag}] [{item.level.toUpperCase()}]
                    </Text>
                    <Text style={[styles.logText, item.level === 'error' && styles.logTextError]}>
                      {item.message}
                    </Text>
                    {item.stack ? <Text style={styles.logStack}>{item.stack}</Text> : null}
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerBtn}
                onPress={async () => {
                  try {
                    await AsyncStorage.clear();
                    alert('缓存已清理');
                  } catch (e: any) {
                    alert('清理失败: ' + e?.message);
                  }
                }}
              >
                <Text style={styles.footerBtnText}>清空缓存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

export default function App() {
  useEffect(() => {
    addBootLog('App', 'App 根组件挂载成功');
    // 安全隐藏原生启动屏遮罩
    try {
      if (ExpoSplashScreen?.hideAsync) {
        ExpoSplashScreen.hideAsync().catch(() => {});
        addBootLog('App', '已触发 SplashScreen.hideAsync()');
      }
    } catch (_) {}
  }, []);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <ProgressProvider>
            <StatusBar style="dark" />
            <View style={styles.appContainer}>
              <RootNavigator />
              <DiagnosticBadge />
            </View>
          </ProgressProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: 500,
          width: '100%',
          marginHorizontal: 'auto',
          minHeight: '100%' as any,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
        }
      : {}),
  },
  floatingBadge: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 99999,
  },
  floatingBadgeError: {
    backgroundColor: 'rgba(230, 40, 40, 0.9)',
  },
  floatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#444',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  logList: {
    flex: 1,
    marginVertical: 12,
  },
  emptyLogText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
  },
  logItem: {
    backgroundColor: '#2A2A2A',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  logItemError: {
    backgroundColor: '#4A1515',
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  logMeta: {
    color: '#AAA',
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logText: {
    color: '#EEE',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logTextError: {
    color: '#FF8A80',
    fontWeight: 'bold',
  },
  logStack: {
    color: '#FFAB91',
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalFooter: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#444',
  },
  footerBtn: {
    backgroundColor: '#333',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  footerBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  btnPrimary: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: Colors.card,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
