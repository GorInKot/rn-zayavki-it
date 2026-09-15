import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { api } from "../api/client";
import type { NotificationItem } from "../api/types";
import { Empty, ErrorState, Loading } from "../components/states";
import { formatDateTime } from "../lib/format";
import { useTitle } from "../lib/useTitle";

export function NotificationsPage() {
  useTitle("Уведомления");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/notifications", { query: { limit: 100 } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const markRead = useMutation({ mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: "POST" }), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "POST" }), onSuccess: refresh });

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <div>
          <h1>Уведомления</h1>
          {query.data && <p className="page-head__sub">{query.data.unread ? `Непрочитанных: ${query.data.unread}` : "Всё прочитано"}</p>}
        </div>
        {query.data && query.data.unread > 0 && (
          <button type="button" className="btn btn--secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Отметить все как прочитанные
          </button>
        )}
      </div>

      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <Empty title="Уведомлений пока нет">Здесь появятся сообщения об изменениях по вашим заявкам.</Empty>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="notifications">
            {query.data.items.map((item) => (
              <li key={item.id} className={`notification${item.read_at ? "" : " notification--unread"}`}>
                <div className="notification__text">
                  {!item.read_at && <span className="visually-hidden">Новое: </span>}
                  <Link to={`/requests/${item.request_id}`} onClick={() => !item.read_at && markRead.mutate(item.id)}>
                    {item.text}
                  </Link>
                  <div className="small muted">{formatDateTime(item.created_at)}</div>
                </div>
                {!item.read_at && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => markRead.mutate(item.id)}>
                    Прочитано
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
