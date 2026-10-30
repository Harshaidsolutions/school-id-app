import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type OrgKind = "school" | "institute";
export type InfoKind = OrgKind | "organization";

export type RootStack = {
  Login: undefined;
  Forgot: undefined;
  VerifyOtp: { email: string; devOtp?: string };
  ResetPassword: { email: string; resetToken: string };
  Tabs: undefined;
  Records: { kind: OrgKind; id: string; name: string };
  OrgInfo: { kind: InfoKind; id: string; name: string };
  FormSetup: { kind: InfoKind; id: string; name: string };
  OrgDetail: { id: string; name: string };
  Templates: undefined;
  Catalog: { kind: "model" | "tag" | "brochure" };
  Notifications: undefined;
  Inbox: undefined;
  Admins: undefined;
  AdminDetail: { id: string; name: string };
  Licences: undefined;
  Help: undefined;
  WebTool: { path: string; title: string };
  Profile: undefined;
};

export type Tabs = {
  Home: undefined;
  Schools: undefined;
  Institutes: undefined;
  Organisations: undefined;
  More: undefined;
};

export type ScreenProps<K extends keyof RootStack> = NativeStackScreenProps<RootStack, K>;
