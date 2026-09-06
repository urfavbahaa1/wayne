import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard,
  Car,
  ClipboardList,
  CalendarDays,
  Settings as SettingsIcon,
  Menu,
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Globe,
  Image as ImageIcon,
  Phone,
  Users,
  Layers,
  TrendingUp,
  Loader2,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* ----------------------------------------------------------------------
   DATA LAYER — Supabase (REST) — اتصال حقيقي بقاعدة البيانات.
   ----------------------------------------------------------------------
   كل دالة هنا تقرأ/تكتب مباشرة في جداول Supabase الحقيقية (agencies, cars,
   bookings, profiles) بدل أي تخزين محلي أو بيانات وهمية. الصلاحيات
   (RLS) على الخادم هي التي تمنع أي شخص غير صاحب الوكالة من التعديل.
------------------------------------------------------------------------ */

// حساب دخول صاحب الوكالة. بما أن اللوحة مخصصة لصاحب العمل فقط ولا تحتاج
// شاشة تسجيل دخول حقيقية بيوزرنيم وباسوورد (وليس بريدًا إلكترونيًا). داخليًا
// فقط تحتاج Supabase Auth صيغة بريد إلكتروني لتخزين الحساب، لذلك نلحق هذا
// اللاحق الثابت باسم المستخدم قبل إرساله — لكن المدير لا يرى أو يكتب أي
// بريد إلكتروني في أي مكان بالواجهة.
const ACCOUNT_EMAIL_SUFFIX = "@houssem-location.local";
function usernameToEmail(username) {
  return `${(username || "").trim().toLowerCase()}${ACCOUNT_EMAIL_SUFFIX}`;
}
function emailToUsername(email) {
  return (email || "").replace(ACCOUNT_EMAIL_SUFFIX, "");
}

// تأثير "ريبل" بسيط عند الضغط على أي زر (.btn / .icon-btn).
function fireRipple(e) {
  const btn = e.currentTarget;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement("span");
  span.className = "ripple-effect";
  span.style.width = span.style.height = size + "px";
  span.style.left = (e.clientX ? e.clientX - rect.left : rect.width / 2) - size / 2 + "px";
  span.style.top = (e.clientY ? e.clientY - rect.top : rect.height / 2) - size / 2 + "px";
  btn.appendChild(span);
  setTimeout(() => span.remove(), 650);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(aEnd) >= new Date(bStart);
}

const api = {
  // تسجيل دخول حقيقي باسم مستخدم وكلمة مرور يكتبهما المدير.
  async signIn(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
    return data.session;
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  // تغيير اسم المستخدم و/أو كلمة المرور من داخل لوحة التحكم نفسها.
  async updateCredentials({ newUsername, newPassword }) {
    const payload = {};
    if (newUsername) payload.email = usernameToEmail(newUsername);
    if (newPassword) payload.password = newPassword;
    if (!Object.keys(payload).length) return;
    const { error } = await supabase.auth.updateUser(payload);
    if (error) throw new Error("تعذر تحديث بيانات الدخول: " + error.message);
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getMyAgency() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, agency_id, full_name, email, role")
      .eq("id", session.user.id)
      .single();
    if (profileError || !profile) {
      throw new Error("تعذر العثور على حساب مرتبط بهذا المستخدم.");
    }

    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", profile.agency_id)
      .single();
    if (agencyError || !agency) {
      throw new Error("تعذر تحميل بيانات الوكالة.");
    }

    return { profile, agency };
  },

  async getAgencyCars(agencyId) {
    const { data: cars, error } = await supabase
      .from("cars")
      .select("*")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (cars || []).map((c) => c.id);
    let activeCarIds = new Set();
    if (ids.length) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: activeBookings, error: bkError } = await supabase
        .from("bookings")
        .select("car_id")
        .in("car_id", ids)
        .eq("status", "confirmed")
        .lte("start_date", today)
        .gte("end_date", today);
      if (bkError) throw new Error(bkError.message);
      activeCarIds = new Set((activeBookings || []).map((b) => b.car_id));
    }

    return (cars || []).map((c) => ({
      ...c,
      current_status: !c.available || activeCarIds.has(c.id) ? "booked" : "available",
    }));
  },

  async createCar(agencyId, car) {
    if (!car.name || !car.main_image) {
      throw new Error("الاسم والصورة الرئيسية مطلوبان لإضافة السيارة.");
    }
    const { data, error } = await supabase
      .from("cars")
      .insert({ agency_id: agencyId, available: true, ...car })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateCar(carId, updates) {
    const { data, error } = await supabase
      .from("cars")
      .update(updates)
      .eq("id", carId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteCar(carId) {
    const { count, error: countError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("car_id", carId);
    if (countError) throw new Error(countError.message);
    if (count > 0) {
      throw new Error("لا يمكن حذف سيارة لديها سجل حجوزات. أخرجها من الخدمة بدل حذفها.");
    }
    const { error } = await supabase.from("cars").delete().eq("id", carId);
    if (error) throw new Error(error.message);
  },

  async setCarAvailability(carId, available) {
    return api.updateCar(carId, { available });
  },

  async getAgencyBookings(agencyId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, cars!inner(name, agency_id)")
      .eq("cars.agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getCarBookings(carId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("car_id", carId)
      .in("status", ["pending", "confirmed"]);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async updateBookingStatus(bookingId, status) {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", bookingId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** تعديل كامل: بيانات الزبون، السيارة، أو التواريخ — يعيد حساب السعر ويتحقق من التعارض. */
  async updateBooking(bookingId, updates) {
    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();
    if (fetchError || !existing) throw new Error("الحجز غير موجود.");

    const merged = { ...existing, ...updates };
    if (new Date(merged.end_date) <= new Date(merged.start_date)) {
      throw new Error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية.");
    }

    const { data: others, error: othersError } = await supabase
      .from("bookings")
      .select("id, start_date, end_date")
      .eq("car_id", merged.car_id)
      .neq("id", bookingId)
      .in("status", ["pending", "confirmed"]);
    if (othersError) throw new Error(othersError.message);
    const conflict = (others || []).some((b) =>
      rangesOverlap(merged.start_date, merged.end_date, b.start_date, b.end_date)
    );
    if (conflict) throw new Error("السيارة غير متاحة في هذه الفترة.");

    const { data: car } = await supabase
      .from("cars")
      .select("price_per_day")
      .eq("id", merged.car_id)
      .single();
    const days = Math.round((new Date(merged.end_date) - new Date(merged.start_date)) / 86400000);
    const total_price = days * (Number(car?.price_per_day) || 0);

    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update({
        customer_name: merged.customer_name,
        phone: merged.phone,
        wilaya: merged.wilaya,
        car_id: merged.car_id,
        start_date: merged.start_date,
        end_date: merged.end_date,
        total_price,
      })
      .eq("id", bookingId)
      .select()
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated;
  },

  /** إلغاء كامل: يحذف الحجز نهائيًا ويحرر تواريخه فورًا. */
  async deleteBooking(bookingId) {
    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) throw new Error(error.message);
  },

  async updateAgency(agencyId, updates) {
    const { data, error } = await supabase
      .from("agencies")
      .update(updates)
      .eq("id", agencyId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};


/* ============================================================ i18n ============================================================ */

const DICTS = {
  ar: {
    dir: "rtl",
    appName: "HOUSSEM",
    officeLabel: "لوحة تحكم الوكالة",
    no_profile_title: "لا يوجد حساب وكالة مرتبط",
    no_profile_desc: "هذا الحساب غير مرتبط بأي وكالة بعد. تواصل مع مزوّد النظام.",
    nav_dashboard: "الرئيسية",
    nav_cars: "السيارات",
    nav_bookings: "الحجوزات",
    nav_calendar: "تقويم التوفر",
    nav_settings: "إعدادات الوكالة",
    welcome: "مرحبًا",
    stat_total_cars: "عدد السيارات",
    stat_available_cars: "سيارات متاحة",
    stat_total_bookings: "إجمالي الحجوزات",
    stat_new_requests: "طلبات جديدة",
    stat_total_value: "قيمة الحجوزات المؤكدة",
    recent_bookings: "أحدث طلبات الحجز",
    view_all: "عرض الكل",
    cars_title: "إدارة السيارات",
    add_car: "إضافة سيارة",
    edit_car: "تعديل السيارة",
    edit_booking: "تعديل الحجز",
    car_name: "اسم السيارة",
    car_images: "صور السيارة",
    car_images_hint: "اضغط على + لاختيار الصور من الغاليري. أول صورة تصبح الصورة الرئيسية.",
    car_price: "السعر اليومي (دج)",
    car_category: "الفئة",
    car_category_placeholder: "اختر الفئة",
    car_fuel: "نوع الوقود",
    car_gear: "ناقل الحركة",
    car_engine_type: "نوع المحرك (اختياري)",
    car_engine_type_hint: "اتركه فارغًا إذا لا تريد إظهاره لدى الزبون.",
    car_seats: "عدد المقاعد",
    car_year: "السنة",
    car_description: "الوصف",
    save: "حفظ",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    confirm_delete: "تأكيد الحذف؟",
    yes_delete: "نعم احذف",
    no_cars: "لا توجد سيارات بعد. أضف أول سيارة لأسطولك.",
    status_available: "متاحة",
    status_booked: "محجوزة",
    status_out_of_service: "خارج الخدمة",
    toggle_out_of_service: "إخراج من الخدمة",
    toggle_back_in_service: "إعادة للخدمة",
    bookings_title: "طلبات الحجز",
    customer_name: "اسم العميل",
    phone: "الهاتف",
    car: "السيارة",
    start_date: "من",
    end_date: "إلى",
    days: "الأيام",
    total_price: "السعر الإجمالي",
    status: "الحالة",
    actions: "إجراءات",
    filter_all: "الكل",
    status_pending: "قيد الانتظار",
    status_confirmed: "مؤكد",
    status_rejected: "مرفوض",
    confirm_booking: "تأكيد",
    reject_booking: "رفض",
    no_bookings: "لا توجد طلبات حجز بعد.",
    calendar_title: "تقويم توفر السيارات",
    select_car: "اختر سيارة",
    legend_available: "متاح",
    legend_booked: "محجوز",
    settings_title: "إعدادات الوكالة",
    agency_name: "اسم الوكالة",
    logo_url: "رابط الشعار",
    whatsapp: "رقم واتساب",
    address: "العنوان",
    facebook_url: "رابط فيسبوك",
    instagram_url: "رابط إنستغرام",
    colors_section: "ألوان موقع العملاء",
    color_bg: "لون الخلفية",
    color_card: "لون البطاقات",
    color_gold: "اللون الرئيسي",
    default_locale: "اللغة الافتراضية للموقع",
    save_success: "تم الحفظ بنجاح.",
    loading: "جارٍ التحميل...",
    dzd: "دج",
  },
  fr: {
    dir: "ltr",
    appName: "HOUSSEM",
    officeLabel: "Espace Gérant",
    no_profile_title: "Aucune agence liée",
    no_profile_desc: "Ce compte n'est lié à aucune agence. Contactez votre fournisseur.",
    nav_dashboard: "Accueil",
    nav_cars: "Véhicules",
    nav_bookings: "Réservations",
    nav_calendar: "Calendrier",
    nav_settings: "Paramètres",
    welcome: "Bienvenue",
    stat_total_cars: "Total véhicules",
    stat_available_cars: "Véhicules disponibles",
    stat_total_bookings: "Total réservations",
    stat_new_requests: "Nouvelles demandes",
    stat_total_value: "Valeur confirmée",
    recent_bookings: "Dernières réservations",
    view_all: "Voir tout",
    cars_title: "Gestion des véhicules",
    add_car: "Ajouter un véhicule",
    edit_car: "Modifier le véhicule",
    edit_booking: "Modifier la réservation",
    car_name: "Nom du véhicule",
    car_images: "Photos du véhicule",
    car_images_hint: "Appuyez sur + pour choisir des photos depuis la galerie. La première photo devient l'image principale.",
    car_price: "Prix / jour (DZD)",
    car_category: "Catégorie",
    car_category_placeholder: "Choisir la catégorie",
    car_fuel: "Carburant",
    car_gear: "Transmission",
    car_engine_type: "Type de moteur (optionnel)",
    car_engine_type_hint: "Laissez vide pour ne pas l'afficher au client.",
    car_seats: "Places",
    car_year: "Année",
    car_description: "Description",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    confirm_delete: "Confirmer la suppression ?",
    yes_delete: "Oui, supprimer",
    no_cars: "Aucun véhicule pour le moment.",
    status_available: "Disponible",
    status_booked: "Réservée",
    status_out_of_service: "Hors service",
    toggle_out_of_service: "Mettre hors service",
    toggle_back_in_service: "Remettre en service",
    bookings_title: "Demandes de réservation",
    customer_name: "Client",
    phone: "Téléphone",
    car: "Véhicule",
    start_date: "Du",
    end_date: "Au",
    days: "Jours",
    total_price: "Prix total",
    status: "Statut",
    actions: "Actions",
    filter_all: "Tous",
    status_pending: "En attente",
    status_confirmed: "Confirmée",
    status_rejected: "Refusée",
    confirm_booking: "Confirmer",
    reject_booking: "Refuser",
    no_bookings: "Aucune réservation pour le moment.",
    calendar_title: "Calendrier de disponibilité",
    select_car: "Choisir un véhicule",
    legend_available: "Disponible",
    legend_booked: "Réservé",
    settings_title: "Paramètres de l'agence",
    agency_name: "Nom de l'agence",
    logo_url: "URL du logo",
    whatsapp: "Numéro WhatsApp",
    address: "Adresse",
    facebook_url: "Lien Facebook",
    instagram_url: "Lien Instagram",
    colors_section: "Couleurs du site client",
    color_bg: "Couleur de fond",
    color_card: "Couleur des cartes",
    color_gold: "Couleur principale",
    default_locale: "Langue par défaut du site",
    save_success: "Enregistré avec succès.",
    loading: "Chargement...",
    dzd: "DZD",
  },
  en: {
    dir: "ltr",
    appName: "HOUSSEM",
    officeLabel: "Agency Office",
    no_profile_title: "No linked agency",
    no_profile_desc: "This account isn't linked to any agency yet. Contact your provider.",
    nav_dashboard: "Dashboard",
    nav_cars: "Cars",
    nav_bookings: "Bookings",
    nav_calendar: "Calendar",
    nav_settings: "Settings",
    welcome: "Welcome",
    stat_total_cars: "Total cars",
    stat_available_cars: "Available cars",
    stat_total_bookings: "Total bookings",
    stat_new_requests: "New requests",
    stat_total_value: "Confirmed value",
    recent_bookings: "Recent bookings",
    view_all: "View all",
    cars_title: "Fleet management",
    add_car: "Add a car",
    edit_car: "Edit car",
    edit_booking: "Edit booking",
    car_name: "Car name",
    car_images: "Car photos",
    car_images_hint: "Tap + to pick photos from the gallery. The first photo becomes the main image.",
    car_price: "Price / day (DZD)",
    car_category: "Category",
    car_category_placeholder: "Choose category",
    car_fuel: "Fuel type",
    car_gear: "Gearbox",
    car_engine_type: "Engine type (optional)",
    car_engine_type_hint: "Leave blank to hide it from the customer.",
    car_seats: "Seats",
    car_year: "Year",
    car_description: "Description",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    confirm_delete: "Confirm deletion?",
    yes_delete: "Yes, delete",
    no_cars: "No cars yet. Add your first one.",
    status_available: "Available",
    status_booked: "Booked",
    status_out_of_service: "Out of service",
    toggle_out_of_service: "Take out of service",
    toggle_back_in_service: "Put back in service",
    bookings_title: "Booking requests",
    customer_name: "Customer",
    phone: "Phone",
    car: "Car",
    start_date: "From",
    end_date: "To",
    days: "Days",
    total_price: "Total price",
    status: "Status",
    actions: "Actions",
    filter_all: "All",
    status_pending: "Pending",
    status_confirmed: "Confirmed",
    status_rejected: "Rejected",
    confirm_booking: "Confirm",
    reject_booking: "Reject",
    no_bookings: "No booking requests yet.",
    calendar_title: "Fleet availability calendar",
    select_car: "Select a car",
    legend_available: "Available",
    legend_booked: "Booked",
    settings_title: "Agency settings",
    agency_name: "Agency name",
    logo_url: "Logo URL",
    whatsapp: "WhatsApp number",
    address: "Address",
    facebook_url: "Facebook link",
    instagram_url: "Instagram link",
    colors_section: "Customer site colors",
    color_bg: "Background color",
    color_card: "Card color",
    color_gold: "Primary color",
    default_locale: "Site default language",
    save_success: "Saved successfully.",
    loading: "Loading...",
    dzd: "DZD",
  },
};

/* ============================================================ LOGIN ============================================================ */

function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور.");
      return;
    }
    setLoading(true);
    try {
      const session = await api.signIn(username, password);
      onSuccess(session);
    } catch (err) {
      setError(err.message || "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-visual">
        <span className="brand-mark" style={{ width: 64, height: 64, fontSize: "1.6rem", margin: "0 auto 14px" }}>
          H
        </span>
        <h2>مرحبًا بعودتك</h2>
        <p>سجّل الدخول لإدارة أسطول السيارات، الحجوزات، وبيانات الوكالة.</p>
        <ul className="login-visual-list">
          <li>إدارة السيارات والتوفر لحظيًا</li>
          <li>متابعة طلبات الحجز وتأكيدها</li>
          <li>تعديل بيانات التواصل والشعار</li>
        </ul>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark">H</span>
          <span className="brand-name">HOUSSEM</span>
        </div>
        <h1>تسجيل الدخول</h1>
        <p className="login-sub">لوحة تحكم الوكالة</p>
        <div className="login-form">
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span>اسم المستخدم</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="اسم المستخدم"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading} onClick={fireRipple}>
            {loading ? <Loader2 className="spin" size={16} /> : "دخول"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================ APP ROOT ============================================================ */

export default function OfficeApp() {
  const [lang, setLang] = useState("ar");
  const t = DICTS[lang];

  const [booting, setBooting] = useState(true);
  const [agencyCtx, setAgencyCtx] = useState(null); // { profile, agency }
  const [ctxError, setCtxError] = useState("");

  const loadContext = useCallback(async () => {
    try {
      const ctx = await api.getMyAgency();
      setAgencyCtx(ctx);
      setCtxError("");
    } catch (e) {
      setCtxError(e.message);
      setAgencyCtx(null);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dir = t.dir;
  }, [t.dir]);

  const [session, setSession] = useState(null);

  // عند فتح اللوحة: تحقق فقط إن كانت هناك جلسة دخول سابقة محفوظة — إن لم
  // توجد، تُعرض شاشة تسجيل الدخول ولا يتم الدخول تلقائيًا بأي حساب.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getSession();
        if (cancelled) return;
        if (s) {
          setSession(s);
          await loadContext();
        }
      } catch (e) {
        if (!cancelled) setCtxError(e.message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSuccess = useCallback(
    async (s) => {
      setSession(s);
      setBooting(true);
      await loadContext();
      setBooting(false);
    },
    [loadContext]
  );

  if (booting) {
    return (
      <div className="office-root" dir={t.dir}>
        <OfficeStyles />
        <FullScreenLoader label={t.loading} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="office-root" dir={t.dir}>
        <OfficeStyles />
        <LoginScreen onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (!agencyCtx) {
    return (
      <div className="office-root" dir={t.dir}>
        <OfficeStyles />
        <div className="center-screen">
          <AlertTriangle size={40} color="#9AA3AC" />
          <h2>{t.no_profile_title}</h2>
          <p>{ctxError || t.no_profile_desc}</p>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="office-root" dir={t.dir}>
      <OfficeStyles />
      <Shell
        t={t}
        lang={lang}
        setLang={setLang}
        agencyCtx={agencyCtx}
        onAgencyUpdated={loadContext}
        onLogout={async () => {
          await api.signOut();
          setSession(null);
          setAgencyCtx(null);
        }}
      />
    </div>
  );
}

function FullScreenLoader({ label }) {
  return (
    <div className="center-screen">
      <Loader2 className="spin" size={32} />
      <p>{label}</p>
    </div>
  );
}

function LangSwitcher({ lang, setLang }) {
  const langs = ["ar", "fr", "en"];
  return (
    <div className="lang-switcher">
      <Globe size={15} />
      {langs.map((l) => (
        <button
          key={l}
          className={lang === l ? "active" : ""}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/* ============================================================ SHELL ============================================================ */

const NAV_ITEMS = [
  { key: "dashboard", icon: LayoutDashboard, labelKey: "nav_dashboard" },
  { key: "cars", icon: Car, labelKey: "nav_cars" },
  { key: "bookings", icon: ClipboardList, labelKey: "nav_bookings" },
  { key: "calendar", icon: CalendarDays, labelKey: "nav_calendar" },
  { key: "settings", icon: SettingsIcon, labelKey: "nav_settings" },
];

function Shell({ t, lang, setLang, agencyCtx, onAgencyUpdated, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const agency = agencyCtx.agency;
  const agencyId = agency.id;

  const go = (key) => {
    setPage(key);
    setDrawerOpen(false);
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          {agency.logo_url ? (
            <img src={agency.logo_url} alt={agency.name} className="brand-mark-logo" />
          ) : (
            <span className="brand-mark">{(agency.name || t.appName || "?").charAt(0)}</span>
          )}
          <div className="brand-text">
            <span className="brand-name">{t.appName}</span>
            <span className="brand-sub">{t.officeLabel}</span>
          </div>
          <button className="icon-btn mobile-only" onClick={() => setDrawerOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-link ${page === item.key ? "active" : ""}`}
              onClick={() => go(item.key)}
            >
              <item.icon size={18} />
              <span>{t[item.labelKey]}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <LangSwitcher lang={lang} setLang={setLang} />
          <button className="sidebar-link logout" onClick={onLogout}>
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setDrawerOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            {agency.logo_url ? (
              <img src={agency.logo_url} alt={agency.name} className="topbar-logo" />
            ) : (
              <span className="brand-mark small">P</span>
            )}
            <span>{agency.name}</span>
          </div>
          <div className="topbar-user desktop-only">
            {t.welcome}, {agencyCtx.profile.full_name || agencyCtx.profile.email}
          </div>
        </header>

        <main className="page-content">
          {page === "dashboard" && <DashboardPage t={t} agencyId={agencyId} go={go} />}
          {page === "cars" && <CarsPage t={t} agencyId={agencyId} />}
          {page === "bookings" && <BookingsPage t={t} agencyId={agencyId} />}
          {page === "calendar" && <CalendarPage t={t} agencyId={agencyId} />}
          {page === "settings" && (
            <SettingsPage t={t} agency={agency} onSaved={onAgencyUpdated} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ============================================================ DASHBOARD ============================================================ */

function DashboardPage({ t, agencyId, go }) {
  const [cars, setCars] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, b] = await Promise.all([
        api.getAgencyCars(agencyId),
        api.getAgencyBookings(agencyId),
      ]);
      setCars(c);
      setBookings(b);
      setLoading(false);
    })();
  }, [agencyId]);

  if (loading) return <FullScreenLoader label={t.loading} />;

  const totalCars = cars.length;
  const availableCars = cars.filter((c) => c.available).length;
  const totalBookings = bookings.length;
  const newRequests = bookings.filter((b) => b.status === "pending").length;
  const totalValue = bookings
    .filter((b) => b.status === "confirmed")
    .reduce((sum, b) => sum + Number(b.total_price), 0);

  const stats = [
    { icon: Car, label: t.stat_total_cars, value: totalCars },
    { icon: Layers, label: t.stat_available_cars, value: availableCars },
    { icon: ClipboardList, label: t.stat_total_bookings, value: totalBookings },
    { icon: Clock, label: t.stat_new_requests, value: newRequests },
    {
      icon: TrendingUp,
      label: t.stat_total_value,
      value: `${totalValue.toLocaleString("en-US")} ${t.dzd}`,
      wide: true,
    },
  ];

  return (
    <div>
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div className={`stat-card ${s.wide ? "wide" : ""}`} key={i}>
            <div className="stat-icon">
              <s.icon size={20} />
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t.recent_bookings}</h3>
          <button className="link-btn" onClick={() => go("bookings")}>
            {t.view_all}
          </button>
        </div>
        <BookingsTable t={t} bookings={bookings.slice(0, 5)} compact />
      </div>
    </div>
  );
}

/* ============================================================ CARS ============================================================ */

// Fixed category list used everywhere a car's category is picked or shown.
const CAR_CATEGORIES = ["عائلي", "رياضي", "فخم", "صيني", "أوروبي", "اقتصادي"];

// Reads a File as a base64 data URL so a picked photo can be shown and
// stored without needing to host it anywhere first.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// A "+" tile that opens the device's photo gallery (via a hidden file
// input) and lets the user pick one or more images. The first image in
// `images` is always treated as the car's main photo.
function ImagePicker({ images, onChange, multiple = true }) {
  const inputRef = React.useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const dataUrls = await Promise.all(files.map(fileToDataUrl));
    onChange(multiple ? [...images, ...dataUrls] : dataUrls.slice(0, 1));
    e.target.value = "";
  };

  const removeAt = (idx) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div className="image-picker">
      {images.map((src, idx) => (
        <div className="image-picker-thumb" key={idx}>
          <img src={src} alt="" />
          {idx === 0 && <span className="image-picker-main-badge">رئيسية</span>}
          <button type="button" className="image-picker-remove" onClick={() => removeAt(idx)}>
            <X size={13} />
          </button>
        </div>
      ))}
      {(multiple || images.length === 0) && (
        <button type="button" className="image-picker-add" onClick={() => inputRef.current?.click()}>
          <Plus size={20} />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleFiles}
        style={{ display: "none" }}
      />
    </div>
  );
}

function emptyCarForm() {
  return {
    name: "",
    images: [],
    price_per_day: "",
    category: "",
    fuel_type: "",
    gear_type: "",
    engine_type: "",
    seats: 5,
    year: new Date().getFullYear(),
    horsepower: "",
    color: "",
    mileage_km: "",
    description: "",
  };
}

function CarsPage({ t, agencyId }) {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyCarForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setCars(await api.getAgencyCars(agencyId));
    setLoading(false);
  }, [agencyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyCarForm());
    setSaveError("");
    setModalOpen(true);
  };

  const openEdit = (car) => {
    setEditingId(car.id);
    setSaveError("");
    setForm({
      name: car.name,
      images: [car.main_image, ...(car.gallery_images || [])].filter(Boolean),
      price_per_day: car.price_per_day,
      category: car.category,
      fuel_type: car.fuel_type,
      gear_type: car.gear_type,
      engine_type: car.engine_type || "",
      seats: car.seats,
      year: car.year,
      horsepower: car.horsepower ?? "",
      color: car.color || "",
      mileage_km: car.mileage_km ?? "",
      description: car.description || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.images.length === 0) {
      alert(t.car_images_required || "الرجاء إضافة صورة واحدة على الأقل.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const payload = {
      name: form.name,
      main_image: form.images[0] || "",
      gallery_images: form.images.slice(1),
      price_per_day: Number(form.price_per_day),
      category: form.category,
      fuel_type: form.fuel_type,
      gear_type: form.gear_type,
      engine_type: form.engine_type.trim(),
      seats: Number(form.seats),
      year: Number(form.year),
      horsepower: form.horsepower === "" ? null : Number(form.horsepower),
      color: form.color.trim(),
      mileage_km: form.mileage_km === "" ? null : Number(form.mileage_km),
      description: form.description,
    };
    try {
      if (editingId) {
        await api.updateCar(editingId, payload);
      } else {
        await api.createCar(agencyId, payload);
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      console.error("Save car failed:", err);
      setSaveError(err?.message || "تعذر حفظ السيارة، حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteCar(id);
      setConfirmDeleteId(null);
      await reload();
    } catch (err) {
      console.error("Delete car failed:", err);
      setConfirmDeleteId(null);
      alert(err?.message || "تعذر حذف السيارة، حاول مرة أخرى.");
    }
  };

  const toggleAvailability = async (car) => {
    try {
      await api.setCarAvailability(car.id, !car.available);
      await reload();
    } catch (err) {
      console.error("Toggle availability failed:", err);
      alert(err?.message || "تعذر تحديث حالة السيارة، حاول مرة أخرى.");
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>{t.cars_title}</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> {t.add_car}
        </button>
      </div>

      {loading ? (
        <FullScreenLoader label={t.loading} />
      ) : cars.length === 0 ? (
        <EmptyState text={t.no_cars} />
      ) : (
        <div className="admin-car-grid">
          {cars.map((car) => (
            <div className="admin-car-card" key={car.id}>
              <div className="admin-car-media">
                <img src={car.main_image} alt={car.name} />
                <span className={`status-pill ${car.current_status}`}>
                  {car.current_status === "available" ? t.status_available : t.status_booked}
                </span>
              </div>
              <div className="admin-car-body">
                <h4>{car.name}</h4>
                <div className="admin-car-meta">
                  <span>{car.category}</span>
                  <span className="dot-sep">•</span>
                  <span>{Number(car.price_per_day).toLocaleString("en-US")} {t.dzd}</span>
                </div>
                {!car.available && (
                  <span className="oos-pill">{t.status_out_of_service}</span>
                )}

                {confirmDeleteId === car.id ? (
                  <div className="confirm-row">
                    <span>{t.confirm_delete}</span>
                    <button className="btn btn-danger sm" onClick={() => handleDelete(car.id)}>
                      {t.yes_delete}
                    </button>
                    <button className="btn btn-ghost sm" onClick={() => setConfirmDeleteId(null)}>
                      {t.cancel}
                    </button>
                  </div>
                ) : (
                  <div className="admin-car-actions">
                    <button className="btn btn-ghost sm" onClick={() => openEdit(car)}>
                      <Pencil size={14} /> {t.edit}
                    </button>
                    <button
                      className="btn btn-ghost sm"
                      onClick={() => toggleAvailability(car)}
                    >
                      {car.available ? t.toggle_out_of_service : t.toggle_back_in_service}
                    </button>
                    <button
                      className="btn btn-danger-ghost sm"
                      onClick={() => setConfirmDeleteId(car.id)}
                    >
                      <Trash2 size={14} /> {t.delete}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editingId ? t.edit_car : t.add_car} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="car-form">
            <label className="field">
              <span>{t.car_name}</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.car_images}</span>
              <ImagePicker
                images={form.images}
                onChange={(images) => setForm({ ...form, images })}
              />
              <span className="field-hint">{t.car_images_hint}</span>
            </label>
            <div className="field-row">
              <label className="field">
                <span>{t.car_price}</span>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.price_per_day}
                  onChange={(e) => setForm({ ...form, price_per_day: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t.car_category}</span>
                <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="" disabled>
                    {t.car_category_placeholder}
                  </option>
                  {CAR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>{t.car_fuel}</span>
                <input required value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.car_gear}</span>
                <input required value={form.gear_type} onChange={(e) => setForm({ ...form, gear_type: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>{t.car_engine_type}</span>
              <input value={form.engine_type} onChange={(e) => setForm({ ...form, engine_type: e.target.value })} />
              <span className="field-hint">{t.car_engine_type_hint}</span>
            </label>
            <div className="field-row">
              <label className="field">
                <span>قوة المحرك (اختياري)</span>
                <input
                  type="number"
                  min="0"
                  value={form.horsepower}
                  onChange={(e) => setForm({ ...form, horsepower: e.target.value })}
                  dir="ltr"
                />
              </label>
              <label className="field">
                <span>اللون (اختياري)</span>
                <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </label>
              <label className="field">
                <span>الكيلومترات (اختياري)</span>
                <input
                  type="number"
                  min="0"
                  value={form.mileage_km}
                  onChange={(e) => setForm({ ...form, mileage_km: e.target.value })}
                  dir="ltr"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>{t.car_seats}</span>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t.car_year}</span>
                <input
                  type="number"
                  min="1990"
                  required
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>{t.car_description}</span>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>

            {saveError && <div className="form-error">{saveError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                {t.cancel}
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : t.save}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================ BOOKINGS ============================================================ */

function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(0, Math.round((e - s) / 86400000));
}

function StatusBadge({ t, status }) {
  const map = {
    pending: { label: t.status_pending, cls: "pending" },
    confirmed: { label: t.status_confirmed, cls: "confirmed" },
    rejected: { label: t.status_rejected, cls: "rejected" },
  };
  const s = map[status] || map.pending;
  return <span className={`status-badge ${s.cls}`}>{s.label}</span>;
}

function BookingsTable({ t, bookings, compact, onStatusChange, onEdit, confirmDeleteId, onRequestDelete, onConfirmDelete, onCancelDelete }) {
  if (bookings.length === 0) return <EmptyState text={t.no_bookings} />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t.customer_name}</th>
            <th>{t.phone}</th>
            <th>{t.car}</th>
            <th>{t.start_date}</th>
            <th>{t.end_date}</th>
            <th>{t.days}</th>
            <th>{t.total_price}</th>
            <th>{t.status}</th>
            {!compact && <th>{t.actions}</th>}
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{b.customer_name}</td>
              <td dir="ltr">{b.phone}</td>
              <td>{b.cars?.name || "-"}</td>
              <td>{b.start_date}</td>
              <td>{b.end_date}</td>
              <td>{daysBetween(b.start_date, b.end_date)}</td>
              <td>{Number(b.total_price).toLocaleString("en-US")} {t.dzd}</td>
              <td>
                <StatusBadge t={t} status={b.status} />
              </td>
              {!compact && (
                <td>
                  {confirmDeleteId === b.id ? (
                    <div className="confirm-row">
                      <span>{t.confirm_delete}</span>
                      <button className="btn btn-danger sm" onClick={() => onConfirmDelete(b.id)}>
                        {t.yes_delete}
                      </button>
                      <button className="btn btn-ghost sm" onClick={onCancelDelete}>
                        {t.cancel}
                      </button>
                    </div>
                  ) : (
                    <div className="table-actions">
                      {b.status !== "confirmed" && (
                        <button className="icon-action ok" onClick={() => onStatusChange(b.id, "confirmed")} title={t.confirm_booking}>
                          <Check size={15} />
                        </button>
                      )}
                      {b.status !== "rejected" && (
                        <button className="icon-action no" onClick={() => onStatusChange(b.id, "rejected")} title={t.reject_booking}>
                          <XCircle size={15} />
                        </button>
                      )}
                      <button className="icon-action edit" onClick={() => onEdit(b)} title={t.edit}>
                        <Pencil size={14} />
                      </button>
                      <button className="icon-action del" onClick={() => onRequestDelete(b.id)} title={t.delete}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function emptyBookingEditForm(b) {
  return {
    customer_name: b.customer_name,
    phone: b.phone,
    car_id: b.car_id,
    start_date: b.start_date,
    end_date: b.end_date,
  };
}

function BookingsPage({ t, agencyId }) {
  const [bookings, setBookings] = useState([]);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editingBooking, setEditingBooking] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const reload = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    const [b, c] = await Promise.all([api.getAgencyBookings(agencyId), api.getAgencyCars(agencyId)]);
    setBookings(b);
    setCars(c);
    setLoading(false);
  }, [agencyId]);

  useEffect(() => {
    reload();
    // Poll quietly in the background so a booking made on the public
    // website shows up here on its own, no manual refresh needed.
    const poll = setInterval(() => reload(true), 15000);
    return () => clearInterval(poll);
  }, [reload]);

  const handleStatusChange = async (id, status) => {
    await api.updateBookingStatus(id, status);
    await reload();
  };

  const openEdit = (booking) => {
    setEditingBooking(booking);
    setEditForm(emptyBookingEditForm(booking));
    setEditError("");
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      await api.updateBooking(editingBooking.id, editForm);
      setEditingBooking(null);
      await reload();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async (id) => {
    await api.deleteBooking(id);
    setConfirmDeleteId(null);
    await reload();
  };

  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);
  const filters = [
    { key: "all", label: t.filter_all },
    { key: "pending", label: t.status_pending },
    { key: "confirmed", label: t.status_confirmed },
    { key: "rejected", label: t.status_rejected },
  ];

  return (
    <div>
      <div className="page-head">
        <h2>{t.bookings_title}</h2>
      </div>
      <div className="filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <FullScreenLoader label={t.loading} />
      ) : (
        <BookingsTable
          t={t}
          bookings={filtered}
          onStatusChange={handleStatusChange}
          onEdit={openEdit}
          confirmDeleteId={confirmDeleteId}
          onRequestDelete={setConfirmDeleteId}
          onConfirmDelete={handleConfirmDelete}
          onCancelDelete={() => setConfirmDeleteId(null)}
        />
      )}

      {editingBooking && (
        <Modal title={t.edit_booking} onClose={() => setEditingBooking(null)}>
          <form onSubmit={handleEditSave} className="car-form">
            <label className="field">
              <span>{t.customer_name}</span>
              <input
                required
                value={editForm.customer_name}
                onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t.phone}</span>
              <input
                required
                dir="ltr"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t.car}</span>
              <select value={editForm.car_id} onChange={(e) => setEditForm({ ...editForm, car_id: e.target.value })}>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label className="field">
                <span>{t.start_date}</span>
                <input
                  type="date"
                  required
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t.end_date}</span>
                <input
                  type="date"
                  required
                  value={editForm.end_date}
                  onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                />
              </label>
            </div>

            {editError && <div className="form-error">{editError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingBooking(null)}>
                {t.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : t.save}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================ CALENDAR ============================================================ */

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function CalendarPage({ t, agencyId }) {
  const [cars, setCars] = useState([]);
  const [carId, setCarId] = useState("");
  const [bookedRanges, setBookedRanges] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await api.getAgencyCars(agencyId);
      setCars(list);
      if (list.length) setCarId(list[0].id);
      setLoading(false);
    })();
  }, [agencyId]);

  useEffect(() => {
    if (!carId) return;
    (async () => {
      const bookings = await api.getCarBookings(carId);
      setBookedRanges(bookings.map((b) => [new Date(b.start_date), new Date(b.end_date)]));
    })();
  }, [carId]);

  const isBooked = (date) =>
    bookedRanges.some(([s, e]) => date >= stripTime(s) && date <= stripTime(e));

  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 1) % 7; // week starts Monday-ish visually, adjust simply
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(
    t.dir === "rtl" ? "ar" : t === DICTS.fr ? "fr-FR" : "en-US",
    { month: "long", year: "numeric" }
  );

  if (loading) return <FullScreenLoader label={t.loading} />;

  return (
    <div>
      <div className="page-head">
        <h2>{t.calendar_title}</h2>
      </div>

      <div className="field" style={{ maxWidth: 340, marginBottom: 20 }}>
        <span>{t.select_car}</span>
        <select value={carId} onChange={(e) => setCarId(e.target.value)}>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="calendar-card">
        <div className="calendar-nav">
          <button
            className="icon-btn"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronRight size={18} style={{ transform: t.dir === "rtl" ? "none" : "scaleX(-1)" }} />
          </button>
          <strong>{monthLabel}</strong>
          <button
            className="icon-btn"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronLeft size={18} style={{ transform: t.dir === "rtl" ? "none" : "scaleX(-1)" }} />
          </button>
        </div>

        <div className="calendar-grid">
          {monthDays.map((d, i) =>
            d ? (
              <div key={i} className={`calendar-cell ${isBooked(d) ? "booked" : "available"}`}>
                {d.getDate()}
              </div>
            ) : (
              <div key={i} className="calendar-cell empty" />
            )
          )}
        </div>

        <div className="calendar-legend">
          <span className="legend-item">
            <span className="legend-dot available" /> {t.legend_available}
          </span>
          <span className="legend-item">
            <span className="legend-dot booked" /> {t.legend_booked}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ SETTINGS ============================================================ */

// Clickable template showing the current shop logo. Tapping it opens the
// device gallery and swaps the logo immediately.
function LogoPicker({ value, onChange, label }) {
  const inputRef = React.useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onChange(dataUrl);
    e.target.value = "";
  };

  return (
    <button type="button" className="logo-picker" onClick={() => inputRef.current?.click()}>
      {value ? <img src={value} alt={label} /> : <ImageIcon size={24} />}
      <span className="logo-picker-edit">
        <Pencil size={12} />
      </span>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </button>
  );
}

function SettingsPage({ t, agency, onSaved }) {
  const [form, setForm] = useState({
    name: agency.name || "",
    logo_url: agency.logo_url || "",
    phone: agency.phone || "",
    whatsapp: agency.whatsapp || "",
    address: agency.address || "",
    facebook_url: agency.facebook_url || "",
    instagram_url: agency.instagram_url || "",
    default_locale: agency.default_locale || "ar",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSettingsError("");
    try {
      await api.updateAgency(agency.id, form);
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save settings failed:", err);
      setSettingsError(err?.message || "تعذر حفظ الإعدادات، حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>{t.settings_title}</h2>
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="panel">
          <div className="field-row">
            <label className="field">
              <span>{t.agency_name}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.logo_url}</span>
              <LogoPicker
                value={form.logo_url}
                onChange={(dataUrl) => setForm({ ...form, logo_url: dataUrl })}
                label={t.logo_url}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t.phone}</span>
              <input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.whatsapp}</span>
              <input dir="ltr" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>{t.address}</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t.facebook_url}</span>
              <input dir="ltr" value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.instagram_url}</span>
              <input dir="ltr" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="panel">
          <label className="field" style={{ maxWidth: 260 }}>
            <span>{t.default_locale}</span>
            <select
              value={form.default_locale}
              onChange={(e) => setForm({ ...form, default_locale: e.target.value })}
            >
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <div className="modal-actions">
          {saved && <span className="save-success">{t.save_success}</span>}
          {settingsError && <div className="form-error">{settingsError}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 className="spin" size={16} /> : t.save}
          </button>
        </div>
      </form>

      <CredentialsPanel />
    </div>
  );
}

// لوحة صغيرة مستقلة داخل الإعدادات لتغيير اسم المستخدم و/أو كلمة المرور
// الخاصين بحساب المدير — منفصلة عن نموذج بيانات الوكالة لأن حفظها له
// إجراء مختلف تمامًا (تحديث حساب الدخول لا بيانات الوكالة).
function CredentialsPanel() {
  const [currentUsername, setCurrentUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data?.user?.email) {
        setCurrentUsername(emailToUsername(data.user.email));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword && newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (!newUsername.trim() && !newPassword) {
      setError("أدخل اسم مستخدم جديدًا أو كلمة مرور جديدة على الأقل.");
      return;
    }
    setSaving(true);
    try {
      await api.updateCredentials({
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined,
      });
      if (newUsername.trim()) setCurrentUsername(newUsername.trim());
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "تعذر تحديث بيانات الدخول.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 6 }}>بيانات الدخول إلى لوحة التحكم</h3>
      <p style={{ fontSize: "0.82rem", color: "var(--text-sec)", marginBottom: 16 }}>
        اسم المستخدم الحالي: <strong>{currentUsername || "…"}</strong>
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field-row">
          <label className="field">
            <span>اسم مستخدم جديد (اختياري)</span>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder={currentUsername || "اسم المستخدم"}
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span>كلمة مرور جديدة (اختياري)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
        </div>
        {newPassword && (
          <label className="field">
            <span>تأكيد كلمة المرور الجديدة</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
        )}
        <div className="modal-actions">
          {saved && <span className="save-success">تم التحديث</span>}
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving} onClick={fireRipple}>
            {saving ? <Loader2 className="spin" size={16} /> : "تحديث بيانات الدخول"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================ SHARED UI ============================================================ */

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================ STYLES ============================================================ */

function OfficeStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Poppins:wght@500;600;700&display=swap');

      :root{
        --bg:#0B0B0B; --card:#161616; --border:rgba(154,163,172,0.14);
        --primary:#9AA3AC; --primary-light:#D6DBE0; --text:#fff; --text-sec:#9A9A9A;
        --green:#33C36F; --red:#E5544D; --amber:#E8A93B;
        /* Matches the customer-facing site's extended palette */
        --gold:#B8912F; --gold-light:#E8C874;
        --silver:#9AA1A8; --silver-light:#D7DBDF;
        --cool-green:#1FCFA0; --cool-green-light:#5CE8C4;
        --blue:#2E6FF2; --blue-light:#6E9CFF;
        --accent-black:#0A0A0A;
      }
      /* Carbon-fiber weave, mirrored from the customer-facing site */
      .carbon-fiber{
        background-color:#161616;
        background-image:
          repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 5px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 5px),
          linear-gradient(160deg, rgba(255,255,255,0.06), transparent 40%);
        background-size:7px 7px, 7px 7px, 100% 100%;
      }
      .office-root{ background:var(--bg); color:var(--text); font-family:'Tajawal',sans-serif; min-height:100vh; position:relative; isolation:isolate; }
      .office-root::before{
        content:"P"; position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
        font-family:'Poppins',sans-serif; font-weight:800; font-size:clamp(280px,50vw,760px);
        color:var(--primary); opacity:0.035; pointer-events:none; user-select:none; z-index:-1;
      }
      .office-root *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
      .office-root button, .office-root input, .office-root select, .office-root textarea{ font-family:'Tajawal',sans-serif; }
      .office-root h1,h2,h3,h4{ margin:0; font-weight:800; }
      .office-root p{ color:var(--text-sec); margin:0; }
      .office-root .spin{ animation:spin 1s linear infinite; }
      @keyframes spin{ to{ transform:rotate(360deg); } }

      .desktop-only{ display:none; } .mobile-only{ display:flex; }
      @media (min-width:960px){ .desktop-only{ display:flex; } .mobile-only{ display:none; } }

      .center-screen{ min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:20px; color:var(--primary-light); }
      .center-screen p{ max-width:320px; }

      .btn{ display:inline-flex; align-items:center; gap:6px; justify-content:center; padding:11px 20px; border-radius:10px; font-weight:700; font-size:0.88rem; border:none; cursor:pointer; transition:transform .2s cubic-bezier(.34,1.56,.64,1), background .18s ease, box-shadow .18s ease, border-color .18s ease; position:relative; overflow:hidden; }
      .btn:active{ transform:scale(.94); }
      .btn.sm{ padding:8px 14px; font-size:0.8rem; border-radius:8px; }
      .btn-primary{ background:linear-gradient(155deg,var(--gold-light),var(--gold)); color:var(--accent-black); box-shadow:0 8px 22px rgba(184,145,47,0.3); font-weight:700; }
      .btn-ghost{ background:rgba(255,255,255,0.06); color:var(--text); border:1px solid rgba(255,255,255,0.1); }
      .btn-danger{ background:var(--red); color:#fff; }
      .btn-danger-ghost{ background:rgba(229,84,77,0.1); color:#ff8b85; border:1px solid rgba(229,84,77,0.3); }
      .btn-block{ width:100%; }
      .ripple-effect{
        position:absolute; border-radius:50%; transform:scale(0);
        background:rgba(255,255,255,0.5); pointer-events:none;
        animation:rippleAnim .65s cubic-bezier(.22,.61,.36,1) forwards;
      }
      @keyframes rippleAnim{ to{ transform:scale(2.6); opacity:0; } }
      @media (min-width:900px){
        .btn-primary:hover{ transform:translateY(-2px); box-shadow:0 14px 30px rgba(154,163,172,0.4); }
        .btn-ghost:hover{ border-color:rgba(255,255,255,0.35); background:rgba(255,255,255,0.1); }
        .btn-danger:hover, .btn-danger-ghost:hover{ transform:translateY(-2px); box-shadow:0 10px 22px rgba(229,84,77,0.3); }
      }

      /* ---------- Login ---------- */
      .login-screen{ min-height:100vh; display:flex; align-items:center; justify-content:center; gap:0; padding:20px; position:relative; overflow:hidden; }
      .login-screen::after{
        content:""; position:absolute; top:-20%; left:50%; transform:translateX(-50%);
        width:600px; height:600px; border-radius:50%;
        background:radial-gradient(circle, rgba(154,163,172,0.18), transparent 70%);
        pointer-events:none;
      }
      .login-lang{ position:absolute; top:20px; inset-inline-end:20px; z-index:2; }
      .login-visual{
        display:none; max-width:340px; padding:44px 34px; text-align:center;
        border:1px solid rgba(154,163,172,0.25); border-inline-end:none;
        border-radius:22px 0 0 22px;
        background-color:#161616;
        background-image:
          repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 5px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,0.5) 0, rgba(0,0,0,0.5) 1px, transparent 1px, transparent 5px),
          linear-gradient(180deg, rgba(154,163,172,0.14), rgba(14,14,14,0.98));
        background-size:7px 7px, 7px 7px, 100% 100%;
        position:relative; z-index:1;
      }
      @media (min-width:760px){ .login-visual{ display:block; } }
      .login-visual-logo{ width:64px; height:64px; object-fit:contain; background:#fff; border-radius:14px; padding:6px; margin-bottom:14px; }
      .login-visual h2{ font-size:1.15rem; margin-bottom:4px; }
      .login-visual p{ font-size:0.8rem; color:var(--text-sec); margin-bottom:18px; }
      .login-visual-list{ text-align:right; display:flex; flex-direction:column; gap:10px; font-size:0.82rem; color:var(--text-sec); list-style:none; padding:0; }
      .login-visual-list li{ position:relative; padding-inline-start:18px; }
      .login-visual-list li::before{ content:"✓"; position:absolute; inset-inline-start:0; color:var(--primary-light); font-weight:700; }
      .login-card{
        width:100%; max-width:400px; background:linear-gradient(180deg, rgba(22,22,22,0.95), rgba(14,14,14,0.98));
        border:1px solid rgba(154,163,172,0.25); border-radius:22px; padding:40px 30px;
        box-shadow:0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset;
        position:relative; z-index:1; animation:loginIn .6s cubic-bezier(.22,.61,.36,1);
      }
      @media (min-width:760px){ .login-card{ border-radius:0 22px 22px 0; } }
      @keyframes loginIn{ from{ opacity:0; transform:translateY(24px) scale(.98); } to{ opacity:1; transform:translateY(0) scale(1); } }
      .login-brand{ display:flex; align-items:center; justify-content:center; gap:9px; margin-bottom:28px; }
      .login-brand .brand-logo{ width:40px; height:40px; object-fit:contain; background:#fff; border-radius:10px; padding:3px; box-shadow:0 6px 18px rgba(154,163,172,0.4); }
      .login-brand .brand-name{ font-size:1.15rem; }
      .login-card h1{ font-size:1.3rem; margin-bottom:6px; text-align:center; }
      .login-sub{ margin-bottom:26px; font-size:0.85rem; text-align:center; }
      .login-form{ display:flex; flex-direction:column; gap:14px; }
      .login-hint{ text-align:center; font-size:0.75rem; color:var(--text-sec); margin-top:-4px; }

      .lang-switcher{ display:flex; align-items:center; gap:4px; background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:999px; padding:5px 8px; color:var(--text-sec); }
      .lang-switcher button{ background:none; border:none; color:var(--text-sec); font-size:0.72rem; font-weight:700; padding:4px 7px; border-radius:999px; cursor:pointer; }
      .lang-switcher button.active{ background:var(--silver); color:var(--accent-black); }

      .brand-mark{ width:34px; height:34px; border-radius:9px; background:linear-gradient(150deg,var(--gold-light),var(--gold)); color:var(--accent-black); font-weight:900; font-family:'Poppins',sans-serif; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .brand-mark-logo{ width:34px; height:34px; border-radius:9px; object-fit:contain; background:#fff; padding:3px; flex-shrink:0; }
      .brand-mark.small{ width:28px; height:28px; font-size:0.85rem; }
      .brand-name{ font-family:'Poppins',sans-serif; font-weight:700; letter-spacing:2px; color:var(--primary-light); }

      .field{ display:flex; flex-direction:column; gap:6px; }
      .field > span{ font-size:0.8rem; color:var(--text-sec); }
      .field input, .field select, .field textarea{ background:#101010; border:1px solid var(--border); border-radius:10px; padding:11px 13px; color:var(--text); outline:none; font-size:0.9rem; }
      .field input:focus, .field select:focus, .field textarea:focus{ border-color:var(--primary); }
      .field input[type=color]{ padding:4px; height:42px; }
      .field-row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .field-row.three{ grid-template-columns:1fr 1fr 1fr; }
      @media (max-width:600px){ .field-row, .field-row.three{ grid-template-columns:1fr; } }
      .form-error{ background:rgba(229,84,77,0.1); border:1px solid rgba(229,84,77,0.3); color:#ff8b85; padding:9px 12px; border-radius:8px; font-size:0.82rem; }

      /* ---------- Shell layout ---------- */
      .shell{ display:flex; min-height:100vh; }
      .sidebar{
        width:250px;
        background-color:#0d0d0d;
        background-image:
          repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 6px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,0.3) 0, rgba(0,0,0,0.3) 1px, transparent 1px, transparent 6px);
        background-size:8px 8px;
        border-inline-end:1px solid rgba(154,163,172,0.16); display:flex; flex-direction:column; padding:20px 14px; position:fixed; inset-inline-start:0; top:0; bottom:0; z-index:80; transform:translateX(-105%); transition:transform .25s ease;
      }
      [dir="rtl"] .sidebar{ transform:translateX(105%); }
      .sidebar.open{ transform:translateX(0); }
      @media (min-width:960px){ .sidebar{ position:sticky; transform:none !important; } }
      .sidebar-brand{ display:flex; align-items:center; gap:10px; padding:6px 6px 20px; }
      .sidebar-brand .brand-text{ display:flex; flex-direction:column; line-height:1.15; }
      .brand-sub{ font-size:0.68rem; color:var(--text-sec); }
      .sidebar-nav{ display:flex; flex-direction:column; gap:3px; flex:1; }
      .sidebar-link{ display:flex; align-items:center; gap:11px; padding:11px 12px; border-radius:10px; color:var(--text-sec); background:none; border:none; font-size:0.9rem; text-align:start; cursor:pointer; transition:all .18s ease; position:relative; overflow:hidden; }
      .sidebar-link::before{ content:""; position:absolute; inset-inline-start:0; top:8%; bottom:8%; width:3px; border-radius:3px; background:var(--blue); transform:scaleY(0); transition:transform .2s ease; }
      .sidebar-link:hover::before{ transform:scaleY(1); }
      .sidebar-link:active{ transform:scale(.97); }
      .sidebar-link:hover{ background:rgba(255,255,255,0.04); color:var(--text); }
      .sidebar-link.active{ background:rgba(46,111,242,0.12); color:var(--blue-light); font-weight:700; }
      .sidebar-footer{ display:flex; flex-direction:column; gap:10px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.06); }
      .sidebar-link.logout{ color:#ff8b85; }
      .drawer-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:70; }
      @media (min-width:960px){ .drawer-overlay{ display:none; } }

      .shell-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
      .topbar{ position:sticky; top:0; z-index:40; display:flex; align-items:center; gap:14px; padding:14px 18px; background:rgba(11,11,11,0.85); backdrop-filter:blur(12px); border-bottom:1px solid rgba(255,255,255,0.06); }
      .topbar-title{ display:flex; align-items:center; gap:8px; font-weight:700; flex:1; }
      .topbar-logo{ width:28px; height:28px; border-radius:7px; object-fit:cover; }
      .topbar-user{ font-size:0.85rem; color:var(--text-sec); }
      .icon-btn{ width:38px; height:38px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--text); cursor:pointer; transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; }
      .icon-btn:hover{ background:rgba(255,255,255,0.06); }
      .icon-btn:active{ transform:scale(.88); }
      .icon-btn:active{ background:rgba(255,255,255,0.08); }

      .page-content{ padding:20px 18px 80px; max-width:1200px; width:100%; margin:0 auto; }
      .page-head{ display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
      .page-head h2{ font-size:1.3rem; }

      /* ---------- Stat cards ---------- */
      .stat-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:26px; }
      @media (min-width:700px){ .stat-grid{ grid-template-columns:repeat(4,1fr); } .stat-card.wide{ grid-column:span 2; } }
      .stat-card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; display:flex; align-items:center; gap:12px; transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
      .stat-card:hover{ transform:translateY(-3px); border-color:rgba(154,163,172,0.4); box-shadow:0 14px 30px rgba(0,0,0,0.4); }
      .stat-icon{ width:40px; height:40px; border-radius:10px; background:rgba(46,111,242,0.12); color:var(--blue-light); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .stat-value{ font-family:'Poppins',sans-serif; font-weight:700; font-size:1.25rem; }
      .stat-label{ font-size:0.75rem; color:var(--text-sec); }

      .panel{ background:var(--card); border:1px solid var(--border); border-radius:16px; padding:18px; margin-bottom:18px; }
      .panel-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .panel-sub-title{ font-size:0.95rem; margin-bottom:14px; }
      .link-btn{ background:none; border:none; color:var(--gold-light); font-size:0.82rem; font-weight:700; cursor:pointer; }

      /* ---------- Table ---------- */
      .table-wrap{ overflow-x:auto; }
      .data-table{ width:100%; border-collapse:collapse; font-size:0.85rem; min-width:720px; }
      .data-table th{ text-align:start; color:var(--text-sec); font-weight:600; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:0.75rem; white-space:nowrap; }
      .data-table td{ padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); white-space:nowrap; }
      .status-badge{ padding:4px 11px; border-radius:999px; font-size:0.72rem; font-weight:700; }
      .status-badge.pending{ background:rgba(232,169,59,0.15); color:var(--amber); }
      .status-badge.confirmed{ background:rgba(31,207,160,0.18); color:var(--cool-green); }
      .status-badge.rejected{ background:rgba(229,84,77,0.15); color:var(--red); }
      .table-actions{ display:flex; gap:6px; flex-wrap:wrap; }
      .icon-action{
        width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center;
        border:none; cursor:pointer; margin-inline-end:0;
        transition:transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, background .18s ease;
      }
      .icon-action:hover{ transform:translateY(-2px) scale(1.06); }
      .icon-action:active{ transform:scale(.9); }
      .icon-action.ok{ background:rgba(31,207,160,0.16); color:var(--cool-green); }
      .icon-action.ok:hover{ background:rgba(51,195,111,0.28); box-shadow:0 6px 14px rgba(51,195,111,0.25); }
      .icon-action.no{ background:rgba(229,84,77,0.14); color:var(--red); }
      .icon-action.no:hover{ background:rgba(229,84,77,0.28); box-shadow:0 6px 14px rgba(229,84,77,0.25); }
      .icon-action.edit{ background:rgba(46,111,242,0.12); color:var(--blue-light); }
      .icon-action.edit:hover{ background:rgba(154,163,172,0.26); box-shadow:0 6px 14px rgba(154,163,172,0.25); }
      .icon-action.del{ background:rgba(229,84,77,0.14); color:var(--red); }
      .icon-action.del:hover{ background:rgba(229,84,77,0.28); box-shadow:0 6px 14px rgba(229,84,77,0.25); }

      .filters{ display:flex; gap:8px; overflow-x:auto; margin-bottom:16px; }
      .filter-chip{
        flex-shrink:0; padding:8px 16px; border-radius:999px; border:1px solid var(--border); background:none;
        color:var(--text-sec); font-size:0.82rem; cursor:pointer;
        transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .2s ease, color .2s ease, border-color .2s ease;
      }
      .filter-chip:hover{ border-color:rgba(154,163,172,0.5); color:var(--text); }
      .filter-chip:active{ transform:scale(.94); }
      .filter-chip.active{ background:var(--cool-green); color:#fff; font-weight:700; border-color:var(--cool-green); box-shadow:0 6px 16px rgba(31,207,160,0.35); }

      .empty-state{ text-align:center; padding:40px 20px; color:var(--text-sec); background:var(--card); border:1px dashed var(--border); border-radius:14px; }

      /* ---------- Cars grid (admin) ---------- */
      .admin-car-grid{ display:grid; grid-template-columns:1fr; gap:16px; }
      @media (min-width:640px){ .admin-car-grid{ grid-template-columns:1fr 1fr; } }
      @media (min-width:1024px){ .admin-car-grid{ grid-template-columns:repeat(3,1fr); } }
      .admin-car-card{ background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
      @media (min-width:900px){
        .admin-car-card:hover{ transform:translateY(-4px); border-color:rgba(154,163,172,0.45); box-shadow:0 18px 40px rgba(0,0,0,0.45); }
        .admin-car-card:hover .admin-car-media img{ transform:scale(1.05); }
      }
      .admin-car-media{ position:relative; aspect-ratio:16/10; background:var(--card,#161616); }
      .admin-car-media img{ width:100%; height:100%; object-fit:cover; transition:transform .5s ease; }
      .status-pill{ position:absolute; top:10px; inset-inline-start:10px; padding:5px 11px; border-radius:999px; font-size:0.7rem; font-weight:700; backdrop-filter:blur(6px); }
      .status-pill.available{ background:rgba(51,195,111,0.2); color:var(--green); }
      .status-pill.booked{ background:rgba(229,84,77,0.2); color:var(--red); }
      .admin-car-body{ padding:14px; }
      .admin-car-body h4{ font-size:0.98rem; margin-bottom:6px; }
      .admin-car-meta{ font-size:0.78rem; color:var(--text-sec); display:flex; gap:6px; margin-bottom:10px; }
      .dot-sep{ opacity:0.5; }
      .oos-pill{ display:inline-block; margin-bottom:10px; font-size:0.7rem; padding:3px 9px; border-radius:999px; background:rgba(255,255,255,0.08); color:var(--text-sec); }
      .admin-car-actions{ display:flex; gap:6px; flex-wrap:wrap; }
      .confirm-row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:0.8rem; color:var(--text-sec); }

      /* ---------- Modal ---------- */
      .modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(3px); z-index:100; display:flex; align-items:flex-end; justify-content:center; }
      @media (min-width:700px){ .modal-overlay{ align-items:center; } }
      .modal-card{ background:var(--card); border:1px solid var(--border); width:100%; max-width:560px; max-height:92vh; overflow-y:auto; border-radius:18px 18px 0 0; animation:slideUp .25s ease; }
      @media (min-width:700px){ .modal-card{ border-radius:18px; } }
      @keyframes slideUp{ from{ transform:translateY(30px); opacity:0;} to{ transform:translateY(0); opacity:1;} }
      .modal-head{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,0.06); position:sticky; top:0; background:var(--card); }
      .modal-body{ padding:18px; }
      .car-form{ display:flex; flex-direction:column; gap:14px; }
      .field-hint{ font-size:0.74rem; color:var(--text-sec); margin-top:4px; }
      .logo-picker{
        position:relative; width:76px; height:76px; border-radius:14px; overflow:hidden;
        border:1px dashed rgba(154,163,172,0.4); background:rgba(154,163,172,0.06);
        display:flex; align-items:center; justify-content:center; color:var(--primary-light);
        transition:border-color .2s ease, background .2s ease;
      }
      .logo-picker:hover{ border-color:rgba(154,163,172,0.6); background:rgba(154,163,172,0.14); }
      .logo-picker img{ width:100%; height:100%; object-fit:contain; background:#fff; padding:6px; }
      .logo-picker-edit{
        position:absolute; bottom:3px; inset-inline-end:3px; width:20px; height:20px; border-radius:50%;
        background:rgba(0,0,0,0.75); color:#fff; display:flex; align-items:center; justify-content:center;
      }
      .image-picker{ display:flex; flex-wrap:wrap; gap:10px; }
      .image-picker-thumb{ position:relative; width:76px; height:76px; border-radius:12px; overflow:hidden; border:1px solid rgba(154,163,172,0.3); flex-shrink:0; background:var(--card,#161616); }
      .image-picker-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
      .image-picker-main-badge{ position:absolute; bottom:0; inset-inline-start:0; inset-inline-end:0; background:rgba(0,0,0,0.65); color:var(--primary-light); font-size:0.62rem; text-align:center; padding:2px 0; }
      .image-picker-remove{ position:absolute; top:3px; inset-inline-end:3px; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; display:flex; align-items:center; justify-content:center; }
      .image-picker-add{
        width:76px; height:76px; border-radius:12px; flex-shrink:0;
        border:1px dashed rgba(154,163,172,0.4); background:rgba(154,163,172,0.06); color:var(--primary-light);
        display:flex; align-items:center; justify-content:center; transition:background .2s ease, border-color .2s ease;
      }
      .image-picker-add:hover{ background:rgba(154,163,172,0.14); border-color:rgba(154,163,172,0.6); }
      .modal-actions{ display:flex; justify-content:flex-end; gap:10px; align-items:center; margin-top:6px; }
      .save-success{ color:var(--green); font-size:0.85rem; font-weight:700; }

      /* ---------- Calendar ---------- */
      .calendar-card{ background:var(--card); border:1px solid var(--border); border-radius:16px; padding:18px; max-width:420px; }
      .calendar-nav{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
      .calendar-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
      .calendar-cell{ aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:0.82rem; font-weight:600; }
      .calendar-cell.empty{ background:none; }
      .calendar-cell.available{ background:rgba(31,207,160,0.16); color:var(--cool-green); }
      .calendar-cell.booked{ background:rgba(229,84,77,0.16); color:var(--red); }
      .calendar-legend{ display:flex; gap:16px; margin-top:16px; }
      .legend-item{ display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--text-sec); }
      .legend-dot{ width:10px; height:10px; border-radius:3px; }
      .legend-dot.available{ background:var(--cool-green); }
      .legend-dot.booked{ background:var(--red); }

      .settings-form{ display:flex; flex-direction:column; }
    `}</style>
  );
}
