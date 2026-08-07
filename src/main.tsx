import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./championship/championship.css";
import "./account/account.css";
// Precisa ser o ultimo: a camada responsiva ajusta o que veio acima.
import "./responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
