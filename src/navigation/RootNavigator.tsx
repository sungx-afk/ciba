import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

import { HomeScreen } from '../screens/HomeScreen';
import { BookmarksScreen } from '../screens/BookmarksScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WordListScreen } from '../screens/WordListScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { BookSelectScreen } from '../screens/BookSelectScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarIconStyle: {
          marginBottom: 3,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'grid';

          if (route.name === 'HomeTab') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'BookmarksTab') {
            iconName = focused ? 'bookmark' : 'bookmark-outline';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: '意群分类' }}
      />
      <Tab.Screen
        name="BookmarksTab"
        component={BookmarksScreen}
        options={{ tabBarLabel: '生词本' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: '设置' }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="WordList" component={WordListScreen} />
        <Stack.Screen
          name="Flashcard"
          component={FlashcardScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="BookSelect" component={BookSelectScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
