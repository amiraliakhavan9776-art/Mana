# وضعیت قابلیت‌های سند جامع ۱.۱ — ۲۰۲۶/۱۰/۲۶

«ساخته‌شده و تست‌شده» فقط محدوده مشخص این جدول را تأیید می‌کند؛ هیچ ردیف به معنای آمادگی تولید نیست. مبنا: فایل‌های شاخه GitHub و آزمون‌های این مرحله؛ گزارش سرور مدرک پذیرش محسوب نمی‌شود.

| حوزه | قابلیت | وضعیت | شاهد / محدودیت |
|---|---|---|---|
| Mission Runtime | Dependency graph execution / typed dependency validation | ساخته‌شده و تست‌شده | mission-runtime; document-tools: 3-step file workflow |
| Mission Runtime | Durable mission/task state / pause / resume / cancel | ساخته‌شده و تست‌شده | single-host encrypted pilot; cooperative cancellation |
| Mission Runtime | Timeout / bounded retry / idempotency / unknown reconciliation | ساخته‌شده و تست‌شده | safe retry opt-in; unknown never replays |
| Mission Runtime | Crash/restart / attempt evidence | ساخته‌شده و تست‌شده | SIGKILL during invocation; stale storage lock needs operator |
| Mission Runtime | Automatic repair / outcome-based replanning | ساخته‌نشده | failure stops for review/retry |
| Mission Runtime | Untrusted code sandbox / public progress UI | ساخته‌نشده | trusted adapters only; no public endpoint |
| Intelligence | Multi-step planning / goal decomposition / WBS | نمونه اولیه | symbolic positive-fact bounded planner; no general language reasoning |
| Intelligence | Evidence reasoning / uncertainty / Reality Check | نمونه اولیه | scope/conflict checks and defined output invariants only |
| Intelligence | Council / scenario ranking | نمونه اولیه | deterministic weighted criteria/vetoes; no independent technical/legal/financial agents |
| Intelligence | Constraints: cost / resources / time / priorities | نمونه اولیه | work-unit budget and mission deadline only |
| Intelligence | Independent evaluator | نمونه اولیه | tool verifier and criteria tests; not general response quality |
| Intelligence | Decision / mission / organizational memory | نمونه اولیه | encrypted decision and mission stores; organizational knowledge incomplete |
| Intelligence | Research Engine | نمونه اولیه | existing retrieval/research prototypes; no validated open research mission |
| Intelligence | Model Router | نمونه اولیه | existing provider abstraction; full routing/evaluation not accepted |
| Intelligence | Hierarchical task network planning | ساخته‌نشده | requires dedicated implementation/acceptance |
| Intelligence | Causal consequence simulation / resource scheduling | ساخته‌نشده | requires dedicated implementation/acceptance |
| Intelligence | Knowledge graph with provenance | ساخته‌نشده | requires dedicated implementation/acceptance |
| Intelligence | Controlled self-improvement pipeline | ساخته‌نشده | requires dedicated implementation/acceptance |
| Server integration | Core v5 adapter | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Server integration | Memory v5.1 adapter | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Server integration | General runner / gateway / mission-engine adapter | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Server integration | Council / financial-council adapter | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Server integration | Protected / scoped-memory adapter | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Server integration | Dashboard v5.2 read-only projection | ساخته‌نشده | reported source unavailable; v1 contract documented; no live change |
| Tools | Registry / scoped authorization / output contracts | ساخته‌شده و تست‌شده | factory registration; per-project capability checks |
| Tools | Real file read / analysis / report artifact | ساخته‌شده و تست‌شده | pinned inventory JSON to verified Markdown |
| Tools | Database / external API / software adapters | ساخته‌نشده | no authorized production connection |
| Tools | Word / PDF / Excel / presentation generation | ساخته‌نشده | not implemented as runtime tools |
| Tools | Document and image understanding | نمونه اولیه | text retrieval prototypes; no general multimodal pipeline |
| Tools | Isolated browser / software control | ساخته‌نشده | no computer execution enabled |
| AEC | Phase 0: land / climate / sun / wind / regulation / feasibility | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Phase 1: concepts / plan / mass / facade / interior | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Phase 2: execution drawings / sections / details | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | AutoCAD / Revit / BIM / 3D software integration | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Editable DWG / IFC / native 3D with conversion QA | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Renders / animation / architecture booklet | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Drawing / specification / quantity consistency | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| Technical office | WBS / schedule / CPM / progress | نمونه اولیه | WBS only; CPM/scheduling not accepted |
| Technical office | Full takeoff / labor / equipment / MEP / finishes / facade | نمونه اولیه | limited facade deterministic pilot |
| Technical office | Quantity and cost optimization | ساخته‌نشده | full constrained optimization absent |
| Technical office | Six payment-claim modes / mixed contracts | نمونه اولیه | legacy UI exists; complete regressions absent |
| Technical office | Site evidence / approvals / deductions / guarantees / penalties / adjustment | نمونه اولیه | selected legacy rules and approval-store; no full pipeline |
| Technical office | Orders / claims / contracts / addenda | نمونه اولیه | legacy structures; no complete native workflow |
| Technical office | Costs / receipts / payments / management contracting | نمونه اولیه | legacy UI; financial integration absent |
| Technical office | Profit / cashflow / deviation prediction | ساخته‌نشده | source-bound engine absent |
| Technical office | Letters / minutes / RFI / technical reports | نمونه اولیه | draft prototypes; no complete document tool chain |
| Universal industries | Profession interview / Company OS | نمونه اولیه | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Strategy Architect | نمونه اولیه | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Market / competitor / opportunity intelligence | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Contract and obligation management | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Risk Sentinel | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Partner Intelligence | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Meeting Intelligence with consent | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Executive Audit | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Regulatory Intelligence | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Mana Academy | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Integration Studio | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Universal industries | Permissioned profession workflows | ساخته‌نشده | blueprints are not operational departments; isolated industry packs required |
| Jarvis | Persian / multilingual voice | نمونه اولیه | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Tasks / meetings / documents / follow-up | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Personal and business decision support | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Income / investment scenarios and risk | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Branding / marketing / business advisory | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Conversational multi-step missions | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Separate encrypted personal memory / organization bridge | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Sensitive and external action approval | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Creative | Image generation / editing | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Video generation / editing | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Music generation / arrangement | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Audio / speech production | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Brand identity / campaigns / social content | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Website / rebranding | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Company / project / product booklet factory | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Creative | Mission-linked multimedia content | ساخته‌نشده | mandatory backlog; specialist model/tool adapter and rights/provenance required |
| Security / production | Identity / roles / org / projects | نمونه اولیه | scoped pilots; production identity not certified |
| Security / production | Tenant / user memory isolation | نمونه اولیه | encrypted scoped stores; production boundary audit open |
| Security / production | Encryption / keys | نمونه اولیه | AES-GCM stores; production key custody/rotation open |
| Security / production | Durable payload-bound approval | نمونه اولیه | approval-store exists; consequential runtime execution disabled |
| Security / production | Audit with independent evidence | نمونه اولیه | durable audit/anchor pilot; runtime audit integration open |
| Security / production | Backup / restore | نمونه اولیه | legacy encrypted backup tests; full live restore acceptance open |
| Security / production | Cost / quotas / resource use | نمونه اولیه | bounded inputs/states/deadlines; CPU/process quotas absent |
| Security / production | Prompt injection / untrusted data / secret redaction | نمونه اولیه | no generated-code execution; general policy/redaction coverage incomplete |
| Security / production | Legacy regressions / migration | نمونه اولیه | selected tests; complete semantic inventory/migration open |
| Security / production | Staging / rollback / production readiness | نمونه اولیه | not deployed; staged rollback drill absent |

## ترتیب وابستگی و توقف

۱. همین Runtime واحد + قرارداد ابزار + شکست/بازیابی؛ سپس اتصال API و رابط خواندنی آزمایشگاهی.
۲. دریافت سورس سرور و آزمون قرارداد Adapter؛ هیچ merge کور یا state writer دوم.
۳. ممیزی مستقل، هویت، محدودسازی پردازش، restore و مهاجرت؛ پیش از عملیات حساس.
۴. اصلاح و برنامه‌ریزی مجدد مبتنی بر نتایج؛ Research/Model Router/گراف دانش با ارزیابی مستقل.
۵. بسته‌های صنعتی و ابزار اسناد؛ سپس CAD/BIM و استودیوها طبق وابستگی و پذیرش متخصص.

توقف در ambiguity/unknown، مجوز ناکافی، تغییر ابزار، داده ناسازگار، سقف منابع و نیاز به تأیید. نسخه ظاهری و تعداد تست معیار عبور از فاز نیست.
