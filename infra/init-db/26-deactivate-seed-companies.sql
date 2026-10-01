-- Companies 1-3 ("Innovex Technologies", "ByteForge Solutions", "Whitefield
-- Cloud Labs") were hand-seeded demo/placeholder data from before real-data
-- ingestion existed. Their apply_urls point at *.example.com, which doesn't
-- resolve — a job seeker clicking Apply on any of their 5 listings hits a
-- dead link, indistinguishable on the map from a real company. Deactivating
-- (not deleting) their jobs, matching the existing expire-stale pattern of
-- never hard-deleting ingested data.
UPDATE jobs SET is_active = false WHERE company_id IN (1, 2, 3) AND is_active;
