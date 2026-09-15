import { useEffect } from "react";

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} — Заявки на автоматизацию` : "Заявки на автоматизацию";
  }, [title]);
}
