/** Input metadata: Arabic label, unit, kind and where it shows. */
import type { EngineInputs } from "../../engine-ts/src";

export type Kind = "money" | "num" | "pct" | "int" | "flag" | "choice";
export type Key = Exclude<keyof EngineInputs, "_boq" | "ProjName">;

export interface Field {
  key: Key;
  label: string;
  unit?: string;
  kind: Kind;
  scenario?: boolean; // three values {conservative, base, optimistic}
  options?: { value: number; label: string }[];
  hint?: string;
  showIf?: (i: EngineInputs) => boolean;
}

const f = (key: Key, label: string, kind: Kind, unit?: string, extra: Partial<Field> = {}): Field => ({ key, label, kind, unit, ...extra });
const YESNO = [{ value: 1, label: "نعم" }, { value: 0, label: "لا" }];

/** The ~15 visible inputs, by wizard step (0-based). */
export const VISIBLE: Record<0 | 1, { title?: string; fields: Field[] }[]> = {
  0: [
    { title: "الأرض والمسطحات", fields: [
      f("LandArea", "مساحة الأرض", "num", "م²"),
      f("FAR", "المسطح المسموح (معامل الكتلة)", "num", "م²", { hint: "إجمالي المسطح المسموح فوق الأرض حسب الاشتراطات" }),
      f("ResFloors", "عدد الأدوار السكنية المتكررة", "int"),
      f("ShopGFA", "مساحة المعارض الأرضية", "num", "م²", { hint: "اكتب 0 إذا ما فيه معارض" }),
      f("MezzPct", "نسبة الميزانين من المعارض", "pct", "%"),
    ] },
    { title: "قيمة الأرض", fields: [
      f("LandValue", "قيمة الأرض المطلوبة (حصة المالك)", "money", "ريال"),
      f("LandMkt", "القيمة السوقية للأرض", "money", "ريال/م²", { hint: "من صفقات الحي (سهيل أو البورصة العقارية)" }),
    ] },
  ],
  1: [
    { title: "الإيرادات", fields: [
      f("PriceRes", "سعر بيع السكني", "money", "ريال/م²", { scenario: true }),
      f("RentInc", "إيجار المعارض", "money", "ريال/م²/سنة", { scenario: true, hint: "المعارض مقيّمة بالدخل (افتراضياً)" }),
    ] },
    { title: "التكلفة", fields: [
      f("RateAbove", "سعر بناء المتر فوق الأرض", "money", "ريال/م²"),
      f("RateBase", "سعر بناء المتر في البدروم", "money", "ريال/م²"),
      f("RateGP", "سعر بناء المتر للمواقف الأرضية", "money", "ريال/م²", { hint: "اكتب 0 إذا ما فيه مواقف أرضية" }),
      f("ExtWorks", "أعمال خارجية وتوصيلات", "money", "ريال", { hint: "مبلغ مقطوع" }),
    ] },
    { title: "التوقيت", fields: [
      f("ConBase", "مدة البناء", "int", "شهر"),
      f("Absorb", "مدة بيع السكني", "int", "شهر", { scenario: true }),
    ] },
    { title: "هيكلة الصفقة مع المالك", fields: [
      f("EarlyRec", "استرداد مبكر للمالك", "flag", undefined, { options: YESNO, hint: "المالك يسترد قيمة أرضه أولاً، والخسارة على المستثمر" }),
      f("ShareMode", "حصة المالك من الربح", "choice", undefined, { options: [
        { value: 1, label: "حسب قيمة الأرض" }, { value: 0, label: "نسبة ثابتة" }] }),
      f("OwnShareFix", "نسبة المالك الثابتة", "pct", "%", { showIf: i => i.ShareMode === 0 }),
      f("DevFeePct", "أتعاب التطوير", "pct", "% من التكلفة"),
      f("TgtMargin", "الهامش المستهدف", "pct", "%"),
    ] },
  ],
};

/** Everything else, under «متقدم», grouped by step. */
export const ADVANCED: Record<0 | 1 | 2, { title: string; fields: Field[] }[]> = {
  0: [
    { title: "المسطحات والكفاءة", fields: [
      f("BasePct", "البدروم كنسبة من الأرض", "pct", "%"),
      f("Coverage", "نسبة التغطية", "pct", "%"),
      f("ParkM2", "مساحة الموقف الواحد", "num", "م²"),
      f("EffRes", "كفاءة السكني (قابل للبيع)", "pct", "%"),
      f("EffShop", "كفاءة المعارض", "pct", "%"),
      f("EffMezz", "كفاءة الميزانين", "pct", "%"),
      f("AvgUnit", "متوسط مساحة الوحدة", "num", "م²"),
    ] },
  ],
  1: [
    { title: "السيناريو والأسعار", fields: [
      f("Scen", "السيناريو النشط", "choice", undefined, { options: [
        { value: 1, label: "متحفظ" }, { value: 2, label: "أساسي" }, { value: 3, label: "متفائل" }] }),
      f("PriceRes", "سعر بيع السكني", "money", "ريال/م²", { scenario: true }),
      f("PriceShop", "سعر بيع المعارض", "money", "ريال/م²", { scenario: true }),
      f("MezzUplift", "علاوة الميزانين", "pct", "%", { scenario: true }),
      f("RentInc", "إيجار المعارض", "money", "ريال/م²/سنة", { scenario: true }),
      f("IncCap", "معدل الرسملة للمعارض", "pct", "%", { scenario: true }),
      f("Absorb", "مدة بيع السكني", "int", "شهر", { scenario: true }),
      f("CostFactor", "معامل التكلفة", "num", "×", { scenario: true }),
      f("VATNR", "ضريبة قيمة مضافة غير مستردة", "pct", "%", { scenario: true }),
    ] },
    { title: "تقييم المعارض", fields: [
      f("ShopValMode", "طريقة تقييم المعارض", "choice", undefined, { options: [
        { value: 1, label: "بالدخل" }, { value: 0, label: "بسعر المتر" }] }),
      f("RentBasis", "الإيجار يشمل الميزانين", "flag", undefined, { options: YESNO }),
      f("IncVac", "نسبة الشغور", "pct", "%"),
      f("IncDisc", "خصم البيع", "pct", "%"),
    ] },
    { title: "تكاليف أخرى", fields: [
      f("CostMode", "طريقة حساب تكلفة البناء", "choice", undefined, { options: [
        { value: 1, label: "سعر المتر (تقديري)" }, { value: 0, label: "جدول الكميات" }] }),
      f("DesignPct", "التصميم", "pct", "% من البناء"),
      f("PermitPct", "التراخيص", "pct", "% من البناء"),
      f("ContPct", "الاحتياطي", "pct", "% من البناء"),
      f("DelayCostPct", "تكلفة التأخير الشهرية", "pct", "% من البناء"),
      f("MktPct", "التسويق", "pct", "% من الإيراد"),
      f("RETTPct", "ضريبة التصرفات العقارية", "pct", "% من الأرض"),
    ] },
    { title: "التوقيت والتحصيل", fields: [
      f("PreM", "مدة ما قبل البناء", "int", "شهر"),
      f("Launch", "بداية البيع", "int", "شهر"),
      f("ShopAbs", "مدة بيع المعارض", "int", "شهر"),
      f("DownPct", "الدفعة الأولى", "pct", "%"),
      f("Escrow", "حساب ضمان (وافي)", "flag", undefined, { options: YESNO }),
    ] },
    { title: "الصفقة والعوائد", fields: [
      f("ShopsInKind", "المعارض للمالك عيناً", "flag", undefined, { options: YESNO }),
      f("DiscRate", "معدل الخصم", "pct", "% سنوي"),
      f("DMFeePct", "أتعاب إدارة التطوير (بديل)", "pct", "%"),
      f("BrokerPct", "عمولة بيع الأرض (بديل)", "pct", "%"),
    ] },
    { title: "بديل التأجير", fields: [
      f("RentRes", "إيجار السكني", "money", "ريال/م²/سنة"),
      f("Occ", "نسبة الإشغال", "pct", "%"),
      f("OpexPct", "مصاريف التشغيل", "pct", "%"),
      f("RentShop", "إيجار المعارض", "money", "ريال/م²/سنة"),
      f("RentMezz", "إيجار الميزانين", "money", "ريال/م²/سنة"),
      f("CapRate", "معدل الرسملة", "pct", "%"),
    ] },
    { title: "معاملات جدول الكميات", fields: [
      f("BasePerim", "محيط البدروم", "num", "م"),
      f("ExcDepth", "عمق الحفر", "num", "م"),
      f("RaftT", "سماكة اللبشة", "num", "م"),
      f("FacadeA", "مساحة الواجهات", "num", "م²"),
      f("GlassPct", "نسبة الزجاج في الواجهة", "pct", "%"),
      f("PrelimPct", "التجهيزات العامة", "pct", "%"),
      f("OHPPct", "مصاريف وأرباح المقاول", "pct", "%"),
    ] },
  ],
  2: [
    { title: "صدمات على الحالة الأساسية", fields: [
      f("RevShock", "صدمة الإيراد", "pct", "%"),
      f("CostShock", "صدمة التكلفة", "pct", "%"),
      f("DelayM", "تأخير", "int", "شهر"),
      f("FinRate", "تكلفة تمويل رأس المال", "pct", "% سنوي"),
    ] },
  ],
};
