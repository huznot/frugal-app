import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductSummary } from './services/types';

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: undefined;
  Search: { query: string };
  Product: { code: string; preview?: ProductSummary };
};

export type TabParamList = {
  Home: undefined;
  Map: undefined;
  Scan: undefined;
  List: undefined;
  Settings: undefined;
};

export type StackProps<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
