-- Driver's license replaces the student ID as the identity proof: two images,
-- the front and the back (barcode side). id_document_url now holds the FRONT;
-- this adds a column for the BACK.
alter table public.provider_profiles
  add column if not exists id_document_back_url text;

-- Providers upload their own license images from the browser, so the back URL
-- must be writable at the column level just like the front (id_document_url).
grant update (id_document_back_url) on table public.provider_profiles to authenticated;
