import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import GridPage from "./pages/Grid.tsx";
import DetailPage from "./pages/Detail.tsx";
import NotFound from "./pages/NotFound.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";

const router = createBrowserRouter([
  {
    path: "/",
    element: <GridPage />,
    errorElement: <NotFound />,
  },
  {
    path: "/cell/:id",
    element: <DetailPage />,
    errorElement: <NotFound />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
);
