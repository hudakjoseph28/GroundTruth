import { Hero } from "../home/Hero";
import { HowItWorks } from "../home/HowItWorks";
import "../home/home.css";

/**
 * The product homepage. The first screen is the search beside a parcel whose
 * record rises out of it; under it, how a purchase runs.
 */
export function HomePage() {
  return (
    <div className="home">
      <Hero />
      <HowItWorks />
    </div>
  );
}
