import type { ReactNode } from "react";
import { isRouteErrorResponse, Link, Navigate, useRouteError } from "react-router";

import { useMe } from "../api/hooks";
import { Empty, Loading } from "../components/states";
import { useTitle } from "../lib/useTitle";

export function HomeRedirect() {
  const me = useMe();
  if (!me.data) return <Loading />;
  return <Navigate to={me.data.user.is_admin ? "/admin" : "/requests"} replace />;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <Loading />;
  if (!me.data.user.is_admin)
    return (
      <div className="page page--narrow">
        <Empty title="Раздел доступен администраторам" action={<Link to="/requests" className="btn btn--primary">Мои заявки</Link>}>
          Если вам нужен доступ к реестру заявок, обратитесь к руководителю группы автоматизации.
        </Empty>
      </div>
    );
  return <>{children}</>;
}

export function NotFound() {
  useTitle("Страница не найдена");
  return (
    <div className="page page--narrow">
      <Empty title="Страница не найдена" action={<Link to="/" className="btn btn--primary">На главную</Link>}>
        Возможно, ссылка устарела или в ней опечатка.
      </Empty>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : "Неизвестная ошибка";
  return (
    <div className="page page--narrow">
      <div className="alert alert--danger" role="alert">
        <div className="alert__body">
          <div className="alert__title">В интерфейсе произошла ошибка</div>
          Обновите страницу. Если ошибка повторится, сообщите в поддержку текст ниже.
          <pre className="small" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
            {message}
          </pre>
        </div>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => window.location.reload()}>
          Обновить
        </button>
      </div>
    </div>
  );
}
