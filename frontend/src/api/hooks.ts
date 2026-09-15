import { useQuery } from "@tanstack/react-query";

import { api } from "./client";
import type { Dictionaries, Me, RequestDetail } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 30_000, refetchInterval: 60_000 });
}

export function useDictionaries() {
  return useQuery({ queryKey: ["dictionaries"], queryFn: () => api<Dictionaries>("/dictionaries"), staleTime: Infinity });
}

export function useRequestDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["request", id],
    queryFn: () => api<RequestDetail>(`/requests/${id}`),
    enabled: Boolean(id),
  });
}
