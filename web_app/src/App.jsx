import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Authentication/Login";
import Register from "./pages/Authentication/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import { routes } from "./routes";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Dynamically generate protected routes from routes configuration */}
        {routes.map(route => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <ProtectedRoute requiredRoles={route.roles}>
                <route.component />
              </ProtectedRoute>
            }
          />
        ))}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
