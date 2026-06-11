import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import KycStartPage from "./pages/KycStartPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./admin/AdminPage";
import RequireRole from "./components/RequireRole";
import ReviewerCasesPage from "./reviewer/pages/ReviewerCasesPage";
import ReviewerCaseDetailPage from "./reviewer/pages/ReviewerCaseDetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public buyer portal (token-authorized) */}
        <Route path="/kyc/start/:token" element={<KycStartPage />} />

        {/* Staff login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Reviewer console */}
        <Route
          path="/reviewer/cases"
          element={
            <RequireRole roles={["reviewer", "admin"]}>
              <ReviewerCasesPage />
            </RequireRole>
          }
        />
        <Route
          path="/reviewer/cases/:kycId"
          element={
            <RequireRole roles={["reviewer", "admin"]}>
              <ReviewerCaseDetailPage />
            </RequireRole>
          }
        />

        {/* Admin console */}
        <Route
          path="/admin"
          element={
            <RequireRole roles={["admin"]}>
              <AdminPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
