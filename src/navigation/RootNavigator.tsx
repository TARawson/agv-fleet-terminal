import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
        }}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Fleet Dashboard' }} />
        <Tab.Screen name="Map" component={FleetMapScreen} options={{ title: 'Fleet Monitor' }} />
        <Tab.Screen name="Pick" component={PickingScreen} options={{ title: 'Task Terminal' }} />
        <Tab.Screen
          name="Alarms"
          component={AlarmLogScreen}
          options={{
            title: 'Diagnostics',
            tabBarBadge: alarmCount > 0 ? alarmCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.fault },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
