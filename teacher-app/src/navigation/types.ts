import type { NavigatorScreenParams } from "@react-navigation/native";
import type { TeacherStudent } from "../types";

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Instructions: undefined;
  ReadInstructions: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  DrawerMenu: undefined;
  Settings: undefined;
  StudentList: { classSection: string; openStudentId?: string };
  StudentDetail: {
    student: TeacherStudent;
    classSection?: string;
  };
  Camera: {
    student: TeacherStudent;
    photoOnly?: boolean;
    autoLaunch?: "camera" | "gallery";
    fromModal?: boolean;
    photoSource?: "camera" | "gallery";
  };
  Preview: {
    student: TeacherStudent;
    photoUri: string;
    photoOnly?: boolean;
    fromModal?: boolean;
    photoSource?: "camera" | "gallery";
    returnToEdit?: boolean;
    returnToFlow?: { classSection: string };
  };
  AddDetails: { student: TeacherStudent; photoUri: string };
  AddStudent: { classSection?: string } | undefined;
  EditStudent: {
    student: TeacherStudent;
    returnToFlow?: { classSection: string };
  };
  OrganizationDetails:
    | {
        pendingTemplatePreviewUrl?: string;
        pendingTemplateId?: string;
        pendingModelPreviewUrl?: string;
        pendingTagsPreviewUrl?: string;
        pendingModelName?: string;
        pendingTagsName?: string;
      }
    | undefined;
  Notifications: { notificationId?: string } | undefined;
  Brochure: undefined;
};

export type MainTabParamList = {
  Home: { scrollTo?: "instructions" } | undefined;
  Template: { returnToOrgDetails?: boolean } | undefined;
  Capture: undefined;
  Models: { tab?: "id_cards" | "tags"; returnToOrgDetails?: boolean } | undefined;
  IdCards: undefined;
};
