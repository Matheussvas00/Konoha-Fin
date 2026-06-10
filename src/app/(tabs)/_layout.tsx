import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a4e',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: '#e63946',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={'home' as IconName} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="lancamentos"
        options={{
          title: 'Lançamentos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={'receipt-outline' as IconName} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="carteiras"
        options={{
          title: 'Carteiras',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={'wallet-outline' as IconName} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="ia"
        options={{
          title: 'IA',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={'sparkles-outline' as IconName} size={size} color={color as string} />
          ),
        }}
      />
      {/* Telas ocultas da tab bar — acessíveis via router.push */}
      <Tabs.Screen
        name="categorias"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="planejamento"
        options={{ href: null }}
      />
    </Tabs>
  );
}
