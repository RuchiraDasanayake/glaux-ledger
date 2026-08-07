import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Capabilities } from "@/lib/types";

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: ({ signal }) => api.get<Capabilities>("/capabilities", signal),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useAiCaptureEnabled(): boolean {
  const { data } = useCapabilities();
  return data?.ai_parsing_enabled === true;
}
