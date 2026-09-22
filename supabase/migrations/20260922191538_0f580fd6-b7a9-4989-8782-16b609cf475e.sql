CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'USD',
  monthly_income numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budgets" ON public.budgets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  saved_amount numeric(12,2) NOT NULL DEFAULT 0,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.savings_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  category text NOT NULL DEFAULT 'Other',
  merchant text NOT NULL DEFAULT '',
  note text,
  occurred_on date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','receipt')),
  receipt_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date ON public.transactions(user_id, occurred_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m0 date := date_trunc('month', current_date)::date;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
BEGIN
  INSERT INTO public.profiles (id, display_name, monthly_income)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 4800);

  INSERT INTO public.budgets (user_id, category, amount) VALUES
    (NEW.id,'Housing',1500),(NEW.id,'Food',550),(NEW.id,'Transport',220),
    (NEW.id,'Shopping',300),(NEW.id,'Entertainment',150),(NEW.id,'Utilities',200),(NEW.id,'Health',120);

  INSERT INTO public.savings_goals (user_id, name, target_amount, saved_amount, deadline) VALUES
    (NEW.id,'Emergency fund',6000,2350,(current_date + interval '8 months')::date),
    (NEW.id,'Summer trip',1800,640,(current_date + interval '5 months')::date);

  INSERT INTO public.transactions (user_id, type, amount, category, merchant, occurred_on) VALUES
    -- previous month
    (NEW.id,'income',4800,'Salary','Acme Corp payroll',m1),
    (NEW.id,'expense',1500,'Housing','Rent — Parkview Apts',m1),
    (NEW.id,'expense',86.40,'Food','Whole Foods',m1+2),
    (NEW.id,'expense',42.10,'Food','Chipotle',m1+4),
    (NEW.id,'expense',112.75,'Food','Trader Joe''s',m1+9),
    (NEW.id,'expense',58.00,'Food','Sushi Zen',m1+15),
    (NEW.id,'expense',94.30,'Food','Safeway',m1+21),
    (NEW.id,'expense',48.00,'Transport','Shell',m1+5),
    (NEW.id,'expense',64.20,'Transport','Uber',m1+13),
    (NEW.id,'expense',89.99,'Shopping','Amazon',m1+7),
    (NEW.id,'expense',54.00,'Shopping','Uniqlo',m1+18),
    (NEW.id,'expense',15.99,'Entertainment','Netflix',m1+3),
    (NEW.id,'expense',38.00,'Entertainment','AMC Theatres',m1+19),
    (NEW.id,'expense',128.40,'Utilities','PG&E',m1+10),
    (NEW.id,'expense',65.00,'Utilities','Comcast',m1+11),
    (NEW.id,'expense',30.00,'Health','CVS Pharmacy',m1+16),
    -- current month
    (NEW.id,'income',4800,'Salary','Acme Corp payroll',m0),
    (NEW.id,'expense',1500,'Housing','Rent — Parkview Apts',m0),
    (NEW.id,'expense',124.60,'Food','Whole Foods',LEAST(m0+1,current_date)),
    (NEW.id,'expense',46.80,'Food','Sweetgreen',LEAST(m0+3,current_date)),
    (NEW.id,'expense',138.20,'Food','Trader Joe''s',LEAST(m0+6,current_date)),
    (NEW.id,'expense',72.50,'Food','Nobu',LEAST(m0+10,current_date)),
    (NEW.id,'expense',96.40,'Food','Costco',LEAST(m0+14,current_date)),
    (NEW.id,'expense',52.00,'Transport','Chevron',LEAST(m0+4,current_date)),
    (NEW.id,'expense',38.60,'Transport','Lyft',LEAST(m0+12,current_date)),
    (NEW.id,'expense',219.00,'Shopping','Apple Store',LEAST(m0+8,current_date)),
    (NEW.id,'expense',64.99,'Shopping','Amazon',LEAST(m0+15,current_date)),
    (NEW.id,'expense',15.99,'Entertainment','Netflix',LEAST(m0+2,current_date)),
    (NEW.id,'expense',11.99,'Entertainment','Spotify',LEAST(m0+2,current_date)),
    (NEW.id,'expense',142.10,'Utilities','PG&E',LEAST(m0+9,current_date)),
    (NEW.id,'expense',65.00,'Utilities','Comcast',LEAST(m0+11,current_date)),
    (NEW.id,'expense',45.00,'Health','Equinox day pass',LEAST(m0+7,current_date));
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "own receipts read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);