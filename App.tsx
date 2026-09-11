import React, { Component, ErrorInfo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, SafeAreaView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProgressProvider } from './src/storage/progressStore';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Colors } from './src/theme/colors';

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

export default function App() {
  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <ProgressProvider>
            <StatusBar style="dark" />
            <View style={styles.appContainer}>
              <RootNavigator />
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
    // 如果在桌面 Web 浏览器中运行，限制为优雅的手机视口尺寸
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
