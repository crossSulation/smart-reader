import useSWR from "swr";
import { fetcher } from "./fetcher";

interface UserInfo {
  id: number;
  username: string;
  email: string;
}

export function useCurrentUser() {
  return useSWR<UserInfo>("/auth/me", fetcher);
}

export function useBillingStats() {
  return useSWR<{ credits: number; monthly_used: number; monthly_limit: number }>("/billing/stats", fetcher);
}
