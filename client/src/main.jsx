import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import StringPhoneApp from "./StringPhoneApp.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StringPhoneApp />
    <Analytics />
  </React.StrictMode>,
);
