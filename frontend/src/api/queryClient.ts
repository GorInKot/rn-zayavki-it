import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Ошибки 4xx повторять бессмысленно; сетевые сбои и 5xx — пробуем ещё два раза.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});
