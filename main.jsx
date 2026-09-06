import React from "react";
import ReactDOM from "react-dom/client";
import PrestigeRent from "./PrestigeRent.jsx";
import OfficeDashboard from "./OfficeDashboard.jsx";

// موقع واحد يحتوي صفحتين: الرئيسية للزبائن، و /ugly للوحة تحكم الوكالة.
const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/ugly"
  || window.location.pathname.startsWith("/ugly/");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <OfficeDashboard /> : <PrestigeRent />}
  </React.StrictMode>
);
