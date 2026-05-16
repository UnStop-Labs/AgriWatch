import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getAlerts } from "../api/client";

export default function Navbar() {
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () =>
      getAlerts({ acknowledged: false, limit: 500 }).then((a) =>
        setUnread(a?.length ?? 0)
      );
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const link = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        pathname === to || (to !== "/" && pathname.startsWith(to))
          ? "bg-green-700 text-white"
          : "text-green-100 hover:bg-green-700 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-green-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌾</span>
            <span className="text-white font-bold text-xl tracking-tight">
              AgriWatch
            </span>
          </div>
          <div className="flex items-center gap-1">
            {link("/", "Dashboard")}
            {link("/map", "Field Map")}
            {link("/fields", "Fields")}
            <Link
              to="/alerts"
              className={`relative px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === "/alerts"
                  ? "bg-green-700 text-white"
                  : "text-green-100 hover:bg-green-700 hover:text-white"
              }`}
            >
              Alerts
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
