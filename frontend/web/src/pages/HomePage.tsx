import { Hero } from "../home/Hero";
import "../home/home.css";

/**
 * The product homepage. The first screen is the search beside a parcel whose
 * record rises out of it.
 */
export function HomePage() {
  return (
    <div className="home">
      <Hero />
    </div>
  );
}
