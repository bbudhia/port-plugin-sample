import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

const queryClient = new QueryClient();

/** Stripped from production builds when NODE_ENV is replaced at compile time. */
function DevPortHostSimulator() {
  if (process.env.NODE_ENV !== "development") return null;
  const { SimulatePort } =
    require("./SimulatePort") as typeof import("./SimulatePort");
  return <SimulatePort />;
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("plugin-root");
  if (root) {
    createRoot(root).render(
      <QueryClientProvider client={queryClient}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          <DevPortHostSimulator />
          <App />
        </div>
      </QueryClientProvider>,
    );
  }
});
