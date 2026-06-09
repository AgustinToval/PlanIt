import axios from "axios";
import * as SecureStore from "expo-secure-store";

const BASE_URL = "http://10.0.2.2:4000/api"; // Android emulator → localhost
// const BASE_URL = "http://localhost:4000/api"; // iOS simulator

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("planit_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync("planit_token");
    }
    return Promise.reject(error);
  }
);
