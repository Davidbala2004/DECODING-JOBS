-- Adzuna-sourced job titles/descriptions occasionally arrive double-encoded
-- upstream (an em-dash's UTF-8 bytes 0xE2 0x80 0x93 get misread as Latin-1
-- before Adzuna ever serves them, producing the 3-codepoint sequence
-- U+00E2 U+0080 U+0093 instead of a single U+2013 "–") — visible directly
-- on job cards/titles as garbage characters.
--
-- Titles are narrow enough (no legitimate non-ASCII punctuation seen in any
-- of them) to safely round-trip through Latin-1, which recovers the
-- original UTF-8 bytes in one shot. Descriptions can legitimately contain
-- other non-Latin-1 characters (e.g. a correctly-encoded ’ apostrophe)
-- elsewhere in the same string, which breaks a blind round-trip — those get
-- a targeted replace of just the known-bad byte sequences instead.
UPDATE jobs
SET title = convert_from(convert_to(title, 'LATIN1'), 'UTF8')
WHERE title ~ 'â';

UPDATE jobs
SET description = replace(replace(description,
    'â' || chr(128) || chr(147), chr(8211)),  -- em-dash mojibake -> –
    'â' || chr(128) || chr(175), ' ')          -- narrow-no-break-space mojibake -> space
WHERE description ~ 'â';

UPDATE companies
SET description = replace(replace(description,
    'â' || chr(128) || chr(147), chr(8211)),
    'â' || chr(128) || chr(175), ' ')
WHERE description ~ 'â';
