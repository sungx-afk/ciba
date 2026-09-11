import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ProgressProvider } from './src/storage/progressStore';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Colors } from './src/theme/colors';

export default function App() {
  return (
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
});
