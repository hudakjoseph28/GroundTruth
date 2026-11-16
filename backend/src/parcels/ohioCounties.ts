/**
 * Ohio's 88 counties and their Census FIPS codes (state 39, county codes
 * 001–175, odd, assigned alphabetically).
 *
 * OGRIP publishes only the county name; the FIPS code also prefixes every
 * `StateParcelID` (`39049-010-042534`). On 2026-11-16 the prefix in the live
 * layer matched this table in all 88 counties.
 */
const COUNTY_NAMES = [
  "Adams",
  "Allen",
  "Ashland",
  "Ashtabula",
  "Athens",
  "Auglaize",
  "Belmont",
  "Brown",
  "Butler",
  "Carroll",
  "Champaign",
  "Clark",
  "Clermont",
  "Clinton",
  "Columbiana",
  "Coshocton",
  "Crawford",
  "Cuyahoga",
  "Darke",
  "Defiance",
  "Delaware",
  "Erie",
  "Fairfield",
  "Fayette",
  "Franklin",
  "Fulton",
  "Gallia",
  "Geauga",
  "Greene",
  "Guernsey",
  "Hamilton",
  "Hancock",
  "Hardin",
  "Harrison",
  "Henry",
  "Highland",
  "Hocking",
  "Holmes",
  "Huron",
  "Jackson",
  "Jefferson",
  "Knox",
  "Lake",
  "Lawrence",
  "Licking",
  "Logan",
  "Lorain",
  "Lucas",
  "Madison",
  "Mahoning",
  "Marion",
  "Medina",
  "Meigs",
  "Mercer",
  "Miami",
  "Monroe",
  "Montgomery",
  "Morgan",
  "Morrow",
  "Muskingum",
  "Noble",
  "Ottawa",
  "Paulding",
  "Perry",
  "Pickaway",
  "Pike",
  "Portage",
  "Preble",
  "Putnam",
  "Richland",
  "Ross",
  "Sandusky",
  "Scioto",
  "Seneca",
  "Shelby",
  "Stark",
  "Summit",
  "Trumbull",
  "Tuscarawas",
  "Union",
  "Van Wert",
  "Vinton",
  "Warren",
  "Washington",
  "Wayne",
  "Williams",
  "Wood",
  "Wyandot",
] as const;

export interface OhioCounty {
  name: string;
  fips: string;
}

export const OHIO_COUNTIES: readonly OhioCounty[] = COUNTY_NAMES.map(
  (name, index) => ({
    name,
    fips: `39${String(index * 2 + 1).padStart(3, "0")}`,
  }),
);

const byFips = new Map(OHIO_COUNTIES.map((county) => [county.fips, county]));
const byName = new Map(
  OHIO_COUNTIES.map((county) => [county.name.toUpperCase(), county]),
);

export function countyByFips(fips: string): OhioCounty | undefined {
  return byFips.get(fips);
}

/** Matches OGRIP's `County` value, which is the plain name (`Franklin`). */
export function countyByName(name: string): OhioCounty | undefined {
  return byName.get(name.trim().toUpperCase());
}
