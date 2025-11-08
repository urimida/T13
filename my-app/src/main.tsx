import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import GridPage from "./pages/Grid.tsx";
import DetailPage from "./pages/Detail.tsx";

const router = createBrowserRouter([
  { path: "/", element: <GridPage /> },
  { path: "/cell/:id", element: <DetailPage /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
