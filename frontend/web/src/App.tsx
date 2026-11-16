import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./layout/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { ParcelPage } from "./pages/ParcelPage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/parcels/:parcelKey" element={<ParcelPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
