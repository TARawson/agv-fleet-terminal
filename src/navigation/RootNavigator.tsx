import { useTranslation } from 'react-i18next';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LanguageToggle } from '../components/LanguageToggle';
import { AlarmLogScreen } from '../screens/AlarmLogScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FleetMapScreen } from '../screens/FleetMapScreen';
import { PickingScreen } from '../screens/PickingScreen';
import { useFleetTelemetry } from '../hooks/useFleetTelemetry';
import { colors, minTouchTarget } from '../theme/colors';

export type RootTabParamList = {
  Dashboard: undefined;
  Map: undefined;
  Pick: undefined;
  Alarms: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.fault,
  },
};

export function RootNavigator() {
  const { t } = useTranslation();
  const fleet = useFleetTelemetry();
  const alarmCount = fleet.reduce((count, agv) => count + agv.errors.length, 0);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          sceneStyle: { backgroundColor: colors.background },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            minHeight: minTouchTarget + 8,
          },
          tabBarItemStyle: {
            minHeight: minTouchTarget,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
          tabBarHideOnKeyboard: true,
          headerRight: () => <LanguageToggle />,
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: t('tabs.dashboard'), tabBarLabel: t('tabs.dashboardShort') }}
        />
        <Tab.Screen name="Map" component={FleetMapScreen} options={{ title: t('tabs.map'), tabBarLabel: t('tabs.mapShort') }} />
        <Tab.Screen name="Pick" component={PickingScreen} options={{ title: t('tabs.pick'), tabBarLabel: t('tabs.pickShort') }} />
        <Tab.Screen
          name="Alarms"
          component={AlarmLogScreen}
          options={{
            title: t('tabs.alarms'),
            tabBarLabel: t('tabs.alarmsShort'),
            tabBarBadge: alarmCount > 0 ? alarmCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.fault },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
