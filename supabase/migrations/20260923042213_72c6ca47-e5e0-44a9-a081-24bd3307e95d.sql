-- Roles (kept in a separate table for security)
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Profiles: username + role (role mirrors user_roles, read-only for users)
ALTER TABLE public.profiles ADD COLUMN username text;
ALTER TABLE public.profiles ADD COLUMN role public.app_role NOT NULL DEFAULT 'user';
CREATE UNIQUE INDEX profiles_username_key ON public.profiles (lower(username));
ALTER TABLE public.profiles ADD CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,24}$');

-- Prevent users from changing their own role column
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_protect_role BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Keep profile.role in sync with user_roles
CREATE OR REPLACE FUNCTION public.sync_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE public.profiles SET role = CASE WHEN public.has_role(uid,'admin') THEN 'admin'::public.app_role ELSE 'user'::public.app_role END WHERE id = uid;
  RETURN NULL;
END; $$;
CREATE TRIGGER user_roles_sync AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role();

CREATE POLICY "admins read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Budgets -> monthly_budgets
ALTER TABLE public.budgets RENAME TO monthly_budgets;
ALTER TABLE public.monthly_budgets ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Accounts
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'checking' CHECK (kind IN ('checking','savings','credit','cash')),
  institution text NOT NULL DEFAULT '',
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER accounts_touch BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER monthly_budgets_touch BEFORE UPDATE ON public.monthly_budgets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.transactions ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Backfill existing users
INSERT INTO public.categories (user_id, name, kind)
SELECT p.id, c.name, c.kind FROM public.profiles p
CROSS JOIN (VALUES ('Housing','expense'),('Food','expense'),('Transport','expense'),('Shopping','expense'),('Entertainment','expense'),('Utilities','expense'),('Health','expense'),('Other','expense'),('Salary','income'),('Freelance','income'),('Refund','income'),('Other income','income')) c(name,kind)
ON CONFLICT DO NOTHING;
INSERT INTO public.accounts (user_id, name, kind, institution, balance)
SELECT id, 'Everyday checking', 'checking', 'Chase', 3240 FROM public.profiles;
INSERT INTO public.user_roles (user_id, role) SELECT id, 'user' FROM public.profiles ON CONFLICT DO NOTHING;

-- Admin stats (only callable meaningfully by admins)
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (id uuid, display_name text, username text, role public.app_role, currency text, created_at timestamptz, tx_count bigint, total_spent numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, p.username, p.role, p.currency, p.created_at,
    COUNT(t.id), COALESCE(SUM(t.amount) FILTER (WHERE t.type='expense'),0)
  FROM public.profiles p LEFT JOIN public.transactions t ON t.user_id = p.id
  GROUP BY p.id ORDER BY p.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- New-user setup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m0 date := date_trunc('month', current_date)::date;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  uname text := NULLIF(NEW.raw_user_meta_data->>'username','');
BEGIN
  IF uname IS NOT NULL AND (uname !~ '^[a-zA-Z0-9_]{3,24}$' OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(uname))) THEN
    uname := NULL;
  END IF;
  INSERT INTO public.profiles (id, display_name, username, monthly_income)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), uname, 4800);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.accounts (user_id, name, kind, institution, balance) VALUES
    (NEW.id,'Everyday checking','checking','Chase',3240),(NEW.id,'High-yield savings','savings','Ally',2990);
  INSERT INTO public.categories (user_id, name, kind)
  SELECT NEW.id, c.name, c.kind FROM (VALUES ('Housing','expense'),('Food','expense'),('Transport','expense'),('Shopping','expense'),('Entertainment','expense'),('Utilities','expense'),('Health','expense'),('Other','expense'),('Salary','income'),('Freelance','income'),('Refund','income'),('Other income','income')) c(name,kind);

  INSERT INTO public.monthly_budgets (user_id, category, amount) VALUES
    (NEW.id,'Housing',1500),(NEW.id,'Food',550),(NEW.id,'Transport',220),
    (NEW.id,'Shopping',300),(NEW.id,'Entertainment',150),(NEW.id,'Utilities',200),(NEW.id,'Health',120);
  INSERT INTO public.savings_goals (user_id, name, target_amount, saved_amount, deadline) VALUES
    (NEW.id,'Emergency fund',6000,2350,(current_date + interval '8 months')::date),
    (NEW.id,'Summer trip',1800,640,(current_date + interval '5 months')::date);
  INSERT INTO public.transactions (user_id, type, amount, category, merchant, occurred_on) VALUES
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
END; $function$;

CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username))
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;