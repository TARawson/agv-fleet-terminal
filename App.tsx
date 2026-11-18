import './src/i18n';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FleetProvider } from './src/hooks/useFleetTelemetry';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <FleetProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </FleetProvider>
    </SafeAreaProvider>
  );
}
