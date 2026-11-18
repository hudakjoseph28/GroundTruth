import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./layout/SiteLayout";
import { DealPage } from "./pages/DealPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ParcelPage } from "./pages/ParcelPage";
import { SearchPage } from "./pages/SearchPage";

// Wallet code loads only on the reviewer portal.
const ReviewPage = lazy(() => import("./review/ReviewPage"));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/parcels/:parcelKey" element={<ParcelPage />} />
          <Route path="/deals/:dealId" element={<DealPage />} />
          <Route
            path="/review"
            element={
              <Suspense fallback={null}>
                <ReviewPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
