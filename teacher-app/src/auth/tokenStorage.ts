import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "teacher_jwt";
const USER_KEY = "teacher_user";

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function deleteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveUserJson(userJson: string): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, userJson);
}

export async function getUserJson(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_KEY);
}

export async function deleteUserJson(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([deleteToken(), deleteUserJson()]);
}
