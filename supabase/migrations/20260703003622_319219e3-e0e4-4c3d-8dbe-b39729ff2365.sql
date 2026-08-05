
-- Allow tenants to insert payment proofs for their own bills, and read own payments
CREATE POLICY "tenants can insert payment proof for own bill" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bills b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = payments.bill_id
      AND t.tenant_user_id = auth.uid()
  )
);

CREATE POLICY "tenants can read own payments" ON public.payments
FOR SELECT TO authenticated
USING (
  tenant_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.bills b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = payments.bill_id
      AND t.tenant_user_id = auth.uid()
  )
);

-- Storage policies for payment-proofs bucket (bucket created via tool)
CREATE POLICY "tenants upload own payment proof" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "tenants read own payment proof" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "landlords read payment proofs for their bills" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.screenshot_path = storage.objects.name
      AND p.owner_id = auth.uid()
  )
);
