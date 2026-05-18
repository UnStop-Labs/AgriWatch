import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import { LangProvider } from "./context/LangContext";
import Alerts from "./pages/Alerts";
import Dashboard from "./pages/Dashboard";
import FieldDetail from "./pages/FieldDetail";
import FieldMap from "./pages/FieldMap";
import Fields from "./pages/Fields";
import Analytics from "./pages/Analytics";
import IrrigationAnalysis from "./pages/IrrigationAnalysis";
import Onboarding from "./pages/Onboarding";
import Settings from "./pages/Settings";

function Layout() {
  const { pathname } = useLocation();
  const hideNav = pathname === "/onboarding";
  return (
    <div className="min-h-screen bg-gray-50">
      {!hideNav && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<FieldMap />} />
          <Route path="/fields" element={<Fields />} />
          <Route path="/fields/:id" element={<FieldDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/irrigation" element={<IrrigationAnalysis />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LangProvider>
        <Layout />
      </LangProvider>
    </BrowserRouter>
  );
}
