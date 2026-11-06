-- =====================================================================
-- Zyntra Lead ID System — sample data (FAKE leads for testing)
-- Run in Supabase → SQL Editor AFTER the migration.
-- Tracking IDs are generated automatically by the database trigger.
-- =====================================================================

insert into public.leads
  (brand_name, owner_name, phone, whatsapp, email, instagram, website, city, state, country, niche, source, notes)
values
  ('Kesariya Threads', 'Riya Patel', '+919876543210', '+919876543210', 'hello@kesariyathreads.in',
   'kesariyathreads', 'https://kesariyathreads.in', 'Ahmedabad', 'GJ', 'IN', 'Clothing Brand', 'manual',
   'Handloom kurtas and sarees. Sample lead.'),
  ('Surat Silk House', 'Hardik Shah', '+919825011122', '+919825011122', 'contact@suratsilkhouse.com',
   'suratsilkhouse', 'https://suratsilkhouse.com', 'Surat', 'GJ', 'IN', 'Clothing Brand', 'pdf',
   'Wholesale silk sarees. Sample lead.'),
  ('Mumbai Streetwear Co.', 'Aarav Mehta', '+919930012345', '+919930054321', 'team@mumbaistreetwear.in',
   'mumbaistreetwear', 'https://mumbaistreetwear.in', 'Mumbai', 'MH', 'IN', 'Clothing Brand', 'claude',
   'Oversized tees and hoodies. Sample lead.'),
  ('Jaipur Block Prints', 'Meera Rathore', '+919414098765', '+919414098765', 'orders@jaipurblockprints.in',
   'jaipurblockprints', 'https://jaipurblockprints.in', 'Jaipur', 'RJ', 'IN', 'Clothing Brand', 'gpt',
   'Hand block-printed cotton dresses. Sample lead.'),
  ('Chennai Cotton Tales', 'Karthik Iyer', '+919840076543', '+919840076543', 'hi@chennaicottontales.com',
   'chennaicottontales', 'https://chennaicottontales.com', 'Chennai', 'TN', 'IN', 'Clothing Brand', 'manual',
   'Organic cotton menswear. Sample lead.');
