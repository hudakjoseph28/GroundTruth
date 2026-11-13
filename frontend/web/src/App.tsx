import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SiteHeader } from "./components/SiteHeader";
import { HomePage } from "./pages/HomePage";
import { ParcelPage } from "./pages/ParcelPage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <BrowserRouter>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/parcels/:parcelKey" element={<ParcelPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
