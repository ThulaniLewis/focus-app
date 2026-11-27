import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { font, type, useColors } from '../../theme';
import { useDashMode } from '../../lib/device';

// Screens that live in the tabs but have no button. (href: null resets the tabs when you open them.)
/** Screens with a Dash layout of their own, where the tablet's rail replaces the tab bar. */
const DASH_ROUTES = new Set(['index', 'spaces', 'space/[id]']);

const hidden = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // The Dash has its own rail of big buttons, so the tab bar hides on it.
  const dash = useDashMode();
  const icon = (name: string) => ({ color }: { color: unknown }) => <Icon name={name} size={22} color={String(color ?? c.inkMuted)} />;
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle:
          dash && DASH_ROUTES.has(route.name)
            ? { display: 'none' }
            : { backgroundColor: c.surfaceRaised, borderTopColor: c.line, height: 70 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.bodyStrong, fontSize: type.caption.fontSize },
        sceneStyle: { backgroundColor: c.bg },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sun') }} />
      <Tabs.Screen name="spaces" options={{ title: 'Spaces', tabBarIcon: icon('grid') }} />
      <Tabs.Screen
        name="dump"
        options={{
          title: 'Dump',
          tabBarAccessibilityLabel: 'Dump, talk or type what is on your mind',
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: c.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -22,
                borderWidth: 4,
                borderColor: c.surfaceRaised,
                elevation: 4,
              }}
            >
              <Icon name="mic" size={26} color={c.onPrimary} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="winddown" options={{ title: 'Wind down', tabBarIcon: icon('moon') }} />
      <Tabs.Screen name="rooms" options={{ href: null }} />
      {/* Screens you open from somewhere: kept inside the tabs so the bar stays and Android's back works. */}
      <Tabs.Screen name="settings" options={hidden} />
      <Tabs.Screen name="space/[id]" options={hidden} />
      <Tabs.Screen name="room/[slug]" options={dash ? { ...hidden, tabBarStyle: { display: 'none' } } : hidden} />
      <Tabs.Screen name="easier" options={hidden} />
      <Tabs.Screen name="devreport" options={hidden} />
      <Tabs.Screen name="places" options={hidden} />
      <Tabs.Screen name="place/[id]" options={hidden} />
      <Tabs.Screen name="places-log" options={hidden} />
      <Tabs.Screen name="permissions" options={hidden} />
      <Tabs.Screen name="place-reminder/[id]" options={hidden} />
      <Tabs.Screen name="work/[id]" options={hidden} />
      <Tabs.Screen name="note" options={hidden} />
      <Tabs.Screen name="tablet-settings" options={dash ? { ...hidden, tabBarStyle: { display: 'none' } } : hidden} />
      <Tabs.Screen name="comeup"options={dash ? { ...hidden, tabBarStyle: { display: 'none' } } : hidden} />
      <Tabs.Screen name="kitchen"options={dash ? { ...hidden, tabBarStyle: { display: 'none' } } : hidden} />
      <Tabs.Screen name="bedtime" options={dash ? { ...hidden, tabBarStyle: { display: 'none' } } : hidden} />
    </Tabs>
  );
}
