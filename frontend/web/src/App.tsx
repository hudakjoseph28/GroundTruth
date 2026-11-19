import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./layout/SiteLayout";
import { DealPage } from "./pages/DealPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ParcelPage } from "./pages/ParcelPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { SearchPage } from "./pages/SearchPage";

// Wallet code loads only on the reviewer portal.
const ReviewPage = lazy(() => import("./review/ReviewPage"));
// The map library loads only on the explore map.
const ExplorePage = lazy(() => import("./explore/ExplorePage"));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/parcels/:parcelKey" element={<ParcelPage />} />
          <Route path="/deals/:dealId" element={<DealPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
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
        {/* Full screen: the map takes the page, with no footer under it. */}
        <Route element={<SiteLayout footer={false} />}>
          <Route
            path="/explore"
            element={
              <Suspense fallback={null}>
                <ExplorePage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
