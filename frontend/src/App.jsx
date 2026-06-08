import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import KycStartPage from "./pages/KycStartPage";
import ReviewerCasesPage from "./reviewer/pages/ReviewerCasesPage";
import ReviewerCaseDetailPage from "./reviewer/pages/ReviewerCaseDetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/kyc/start/:token" element={<KycStartPage />} />

        <Route path="/reviewer/cases" element={<ReviewerCasesPage />} />
        <Route
          path="/reviewer/cases/:kycId"
          element={<ReviewerCaseDetailPage />}
        />

        <Route path="*" element={<Navigate to="/reviewer/cases" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
