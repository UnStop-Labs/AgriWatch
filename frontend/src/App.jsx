import { BrowserRouter, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Alerts from "./pages/Alerts";
import Dashboard from "./pages/Dashboard";
import FieldDetail from "./pages/FieldDetail";
import FieldMap from "./pages/FieldMap";
import Fields from "./pages/Fields";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/map" element={<FieldMap />} />
            <Route path="/fields" element={<Fields />} />
            <Route path="/fields/:id" element={<FieldDetail />} />
            <Route path="/alerts" element={<Alerts />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
