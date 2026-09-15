import { createBrowserRouter } from "react-router";

import { Layout } from "./components/Layout";
import { CalendarPage } from "./pages/admin/CalendarPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { RegistryPage } from "./pages/admin/RegistryPage";
import { AdminOnly, HomeRedirect, NotFound, RouteError } from "./pages/misc";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { RequestPage } from "./pages/RequestPage";
import { WizardRoute } from "./pages/wizard/WizardPage";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <HomeRedirect /> },
        { path: "requests", element: <MyRequestsPage /> },
        { path: "requests/new", element: <WizardRoute mode="new" /> },
        { path: "requests/:id", element: <RequestPage /> },
        { path: "requests/:id/edit", element: <WizardRoute mode="clarification" /> },
        { path: "notifications", element: <NotificationsPage /> },
        { path: "admin", element: <AdminOnly><DashboardPage /></AdminOnly> },
        { path: "admin/registry", element: <AdminOnly><RegistryPage /></AdminOnly> },
        { path: "admin/calendar", element: <AdminOnly><CalendarPage /></AdminOnly> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename },
);
