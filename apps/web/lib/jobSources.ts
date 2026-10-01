/**
 * Display metadata for `job.source` — which pipeline bucket a posting arrived
 * in. Lives in one place so the map's inline badge and the company panel's
 * pill can't drift apart the way two separate copies would.
 *
 * `linkedin` deliberately does NOT render as "LinkedIn". This product doesn't
 * scrape LinkedIn (see README), and every row currently carrying that source
 * has an `apply_url` pointing at the employer's own careers page
 * (dream11.com/careers, zerodha.com/careers, ...). So the badge names where
 * the link actually goes rather than making a claim we can't back.
 *
 * The real fix is upstream — stop writing `linkedin` at ingestion — but until
 * that happens the UI must not assert something the product denies.
 */

export interface JobSourceBadge {
  label: string;
  cls: string;
}

const NEUTRAL = "rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600";

export const JOB_SOURCE_BADGES: Record<string, JobSourceBadge> = {
  adzuna: { label: "Adzuna", cls: "rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700" },
  greenhouse: { label: "Greenhouse", cls: "rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" },
  lever: { label: "Lever", cls: "rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-600" },
  careers: { label: "Careers page", cls: NEUTRAL },
  // See the module docstring — this is a mislabel upstream, not a LinkedIn job.
  linkedin: { label: "Company site", cls: NEUTRAL },
  manual: { label: "Company added", cls: NEUTRAL },
  founder: { label: "Company added", cls: NEUTRAL },
  indeed: { label: "Indeed", cls: "rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700" },
  glassdoor: { label: "Glassdoor", cls: "rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700" },
  naukri: { label: "Naukri", cls: "rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600" },
  internshala: { label: "Internshala", cls: "rounded-md bg-yellow-50 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700" },
  foundit: { label: "Foundit", cls: "rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600" },
  wellfound: { label: "Wellfound", cls: "rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-600" },
};

/** Human-readable name for a source value; unknown values pass through with
 * their first letter capitalised rather than rendering a raw slug. */
export function jobSourceLabel(source: string): string {
  const known = JOB_SOURCE_BADGES[source]?.label;
  if (known) return known;
  return source.charAt(0).toUpperCase() + source.slice(1);
}
