import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { getDevUser, setDevUser } from "../api/client";
import { useMe } from "../api/hooks";
import { ErrorState, Loading } from "./states";

export function Layout() {
  const me = useMe();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // При переходе на другую страницу фокус переносится в начало содержимого — как при обычной загрузке страницы.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  if (me.isPending) return <Loading label="Загружаем систему заявок…" />;
  if (me.isError)
    return (
      <div className="page page--narrow">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );

  const { user, unread_notifications: unread, dev_users: devUsers } = me.data;
  const links = user.is_admin
    ? [
        { to: "/admin", label: "Дашборд", end: true },
        { to: "/admin/registry", label: "Реестр заявок", end: false },
        { to: "/requests", label: "Мои заявки", end: true },
        { to: "/requests/new", label: "Новая заявка", end: false },
        { to: "/admin/calendar", label: "Календарь", end: false },
      ]
    : [
        { to: "/requests", label: "Мои заявки", end: true },
        { to: "/requests/new", label: "Новая заявка", end: false },
      ];

  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="topbar__title">
            <span className="topbar__mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M1 1h12v2.4H1zm0 4.8h12v2.4H1zm0 4.8h7.5V13H1z" fill="#010206" />
              </svg>
            </span>
            Заявки на автоматизацию
          </Link>
          <nav className="topbar__nav" aria-label="Разделы">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="topbar__link">
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar__side">
            <Link to="/notifications" className="bell" aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && <span className="bell__count">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            {devUsers ? (
              <label className="dev-switch">
                <span className="dev-switch__tag">Тест</span>
                <span className="visually-hidden">Войти как</span>
                <select
                  value={getDevUser() ?? user.login}
                  onChange={(event) => {
                    setDevUser(event.target.value);
                    window.location.assign(import.meta.env.BASE_URL);
                  }}
                >
                  {devUsers.map((devUser) => (
                    <option key={devUser.login} value={devUser.login}>
                      {devUser.full_name}
                      {devUser.is_admin ? " — администратор" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>{user.full_name}</span>
            )}
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
    </>
  );
}
