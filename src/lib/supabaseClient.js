import { createClient } from "@supabase/supabase-js";

// معرّف الوكالة الوحيدة التي يخدمها هذا المشروع (موقع واحد + لوحة تحكم واحدة).
export const AGENCY_ID = "a0000000-0000-4000-8000-000000000001";

const supabaseUrl = "https://qcasewcjfuvelfvfsbwk.supabase.co";
// هذا هو مفتاح "anon" العام المخصص لطلبات المتصفح، وليس مفتاحًا سريًا —
// من الطبيعي أن يظهر داخل كود الواجهة الأمامية. كل الحماية الفعلية تتم عبر
// صلاحيات RLS المضبوطة على مستوى قاعدة البيانات نفسها.
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjYXNld2NqZnV2ZWxmdmZzYndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzMxMTksImV4cCI6MjEwMzcwOTExOX0.FQCjJ027DHBXmlg3eP3-hOwrWqMMSxTZfDPMrzB5yto";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
