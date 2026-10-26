# وضعیت قابلیت‌های سند جامع ۱.۱ — ۲۰۲۶/۱۰/۲۶


افزودهٔ توسعه: چرخهٔ محلی ساخت/آزمون مهارت‌های محدود و تولید فایل کد از درخواست فارسی اضافه شده است؛ کد دلخواه هنوز sandbox تأییدشده یا اعمال خودکار ندارد و کیفیت مدل واقعی ارزیابی نشده است. قرارداد و محدودیت‌ها: `mana-local-skill-evolution.md`.

«ساخته‌شده و تست‌شده» فقط محدوده مشخص این جدول را تأیید می‌کند؛ هیچ ردیف به معنای آمادگی تولید نیست. مبنا: فایل‌های شاخه GitHub و آزمون‌های این مرحله؛ گزارش سرور مدرک پذیرش محسوب نمی‌شود.

به‌روزرسانی تطبیق با کد تا `7d5fa6f`: وضعیت‌های قدیمیِ برنامه‌ریزی مجدد، حافظه شخصی، گردش‌های محدود فارسی و فایل‌های PDF/XLSX با پیاده‌سازی‌های بعدی تطبیق داده شدند. «نمونه اولیه» پذیرش عملیاتی یا تکمیل قابلیت عمومی نیست. گیت‌های G1/G2 و سه مأموریت واقعی همچنان بازند؛ هیچ تأیید بازبین فرض نشده است.

| حوزه | قابلیت | وضعیت | شاهد / محدودیت |
|---|---|---|---|
| Mission Runtime | Dependency graph execution / typed dependency validation | ساخته‌شده و تست‌شده | mission-runtime; document-tools: 3-step file workflow |
| Mission Runtime | Durable mission/task state / pause / resume / cancel | ساخته‌شده و تست‌شده | single-host encrypted pilot; cooperative cancellation |
| Mission Runtime | Timeout / bounded retry / idempotency / unknown reconciliation | ساخته‌شده و تست‌شده | safe retry opt-in; unknown never replays |
| Mission Runtime | Crash/restart / attempt evidence | ساخته‌شده و تست‌شده | SIGKILL during invocation; stale storage lock needs operator |
| Mission Runtime | Outcome-based replanning | نمونه اولیه | failed-output replan; bounded generations/original budget; no unknown-effect replay; mana-development-acceptance.md |
| Mission Runtime | General automatic repair | ساخته‌نشده | no general code/model self-repair or sandbox release pipeline |
| Mission Runtime | Untrusted code sandbox / public progress UI | نمونه اولیه / ساخته‌نشده | narrow Python pure-function namespace/seccomp verifier and bounded repair added separately; actual OS acceptance required per host; no public progress UI |
| Intelligence | Multi-step planning / goal decomposition / WBS | نمونه اولیه | symbolic positive-fact bounded planner; no general language reasoning |
| Intelligence | Evidence reasoning / uncertainty / Reality Check | نمونه اولیه | scope/conflict checks and defined output invariants only |
| Intelligence | Council / scenario ranking | نمونه اولیه | deterministic weighted criteria/vetoes; no independent technical/legal/financial agents |
| Intelligence | Constraints: cost / resources / time / priorities | نمونه اولیه | work-unit budget and mission deadline only |
| Intelligence | Independent evaluator | نمونه اولیه | tool verifier and criteria tests; not general response quality |
| Intelligence | Decision / mission / organizational memory | نمونه اولیه | encrypted decision and mission stores; organizational knowledge incomplete |
| Intelligence | Research Engine | نمونه اولیه | existing retrieval/research prototypes; no validated open research mission |
| Intelligence | Model Router | نمونه اولیه | existing provider abstraction; full routing/evaluation not accepted |
| Intelligence | Hierarchical task network planning | نمونه اولیه | ordered acyclic host methods, scoped facts/grants/budget, shared-runtime document execution; natural-language decomposition and hierarchical repair remain open |
| Intelligence | Causal consequence simulation / resource scheduling | ساخته‌نشده | requires dedicated implementation/acceptance |
| Intelligence | Knowledge graph with provenance | ساخته‌نشده | requires dedicated implementation/acceptance |
| Intelligence | Controlled self-improvement pipeline | نمونه اولیه | bounded declarative skill propose/test/retry/checkpoint; real code drafts stop before unverified sandbox; mana-local-skill-evolution.md |
| Server integration | Core v5 adapter | ساخته‌نشده | source snapshot reviewed; wrapper/report writer not connected as a competing executor; mana-server-source-review.md |
| Server integration | Memory v5.1 adapter | ساخته‌نشده | source received; unscoped plaintext history needs reviewed provenance/scope migration |
| Server integration | General runner / gateway / mission-engine adapter | ساخته‌نشده | supplied execution paths mapped; no blind replay, competing state writer or live connection |
| Server integration | Council / financial-council adapter | ساخته‌نشده | rule-based source reviewed; v0.6 dependency not in snapshot; no specialist-council acceptance |
| Server integration | Protected / scoped-memory adapter | ساخته‌نشده | source reviewed; absolute host/SQLite dependency and production membership mapping remain open |
| Server integration | Dashboard v5.2 read-only projection | نمونه اولیه | authenticated audited metadata handler over shared Runtime; source/API shape reviewed; not mounted on live host |
| Tools | Registry / scoped authorization / output contracts | ساخته‌شده و تست‌شده | factory registration; per-project capability checks |
| Tools | Real file read / analysis / report artifact | ساخته‌شده و تست‌شده | pinned inventory JSON to verified Markdown |
| Tools | Database / external API / software adapters | ساخته‌نشده | no authorized production connection |
| Tools | Bounded PDF report/booklet generation | نمونه اولیه | actual ReportLab runtime tools; generated benchmarks only; mana-executable-workflows.md |
| Tools | Bounded financial XLSX generation | نمونه اولیه | actual local workbook evidence; host exporter required and not bundled/assumed in CI or servers |
| Tools | Word / presentation generation | ساخته‌نشده | provider contracts are not executable accepted providers |
| Tools | Document and image understanding | نمونه اولیه | text retrieval prototypes; no general multimodal pipeline |
| Tools | Isolated browser / software control | ساخته‌نشده | no computer execution enabled |
| AEC | Phase 0: land / climate / sun / wind / regulation / feasibility | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Phase 1: concepts / plan / mass / facade / interior | نمونه اولیه | fixed rectangular two-bedroom schematic DXF only; no general design/massing/facade/interior; geometry-v2 limits apply |
| AEC | Phase 2: execution drawings / sections / details | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | AutoCAD / Revit / BIM / 3D software integration | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Editable DWG / IFC / native 3D with conversion QA | ساخته‌نشده | licensed/source-backed adapter + specialist validation required |
| AEC | Renders / animation | ساخته‌نشده | actual licensed/available renderer and independent validation required |
| AEC | Bounded architecture PDF booklet | نمونه اولیه | schematic DXF/hash/quantity-linked PDF; not full phase-0-to-construction booklet |
| AEC | Drawing / specification / quantity consistency | نمونه اولیه | saved DXF layers/IDs/hash and bounded area/room-side wall-surface checks; no complete specification/BoQ acceptance |
| Technical office | WBS / schedule / CPM / progress | نمونه اولیه | WBS only; CPM/scheduling not accepted |
| Technical office | Full takeoff / labor / equipment / MEP / finishes / facade | نمونه اولیه | limited facade pilot plus schematic floor/perimeter/room-side wall surfaces; no complete BoQ, MEP/labor/equipment costing |
| Technical office | Quantity and cost optimization | ساخته‌نشده | full constrained optimization absent |
| Technical office | Six payment-claim modes / mixed contracts | نمونه اولیه | exact six-mode period calculator + shared-runtime draft report; cumulative/correction/contract approval and real-project acceptance remain open; mana-exact-claims.md |
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
| Jarvis | Tasks / meetings / documents / follow-up | نمونه اولیه | bounded personal document/design missions only; no calendar/meeting/account follow-up connector pipeline |
| Jarvis | Personal and business decision support | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Income / investment scenarios and risk | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Branding / marketing / business advisory | ساخته‌نشده | existing voice/session experiments do not establish private Jarvis |
| Jarvis | Conversational multi-step missions | نمونه اولیه | two bounded Persian intents, revisions, verified artifacts and shared execution cycle; no general voice/language capability |
| Jarvis | Separate encrypted personal memory | نمونه اولیه | owner/realm-bound consent, CAS correction, expiry and logical deletion; not production key/backup erasure acceptance |
| Jarvis | Personal / organization bridge | ساخته‌نشده | no automatic transfer of private statements into organization memory, evidence or grants |
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
| Security / production | Legacy regressions / migration | نمونه اولیه | lexical scope/override evidence, exact snapshot comparison and selected approval/save regressions; complete semantic inventory/historical migration open |
| Security / production | Staging / rollback / production readiness | نمونه اولیه | not deployed; staged rollback drill absent |

## ترتیب وابستگی و توقف

۱. همین Runtime واحد + قرارداد ابزار + شکست/بازیابی؛ سپس اتصال API و رابط خواندنی آزمایشگاهی.
۲. دریافت سورس سرور و آزمون قرارداد Adapter؛ هیچ merge کور یا state writer دوم.
۳. ممیزی مستقل، هویت، محدودسازی پردازش، restore و مهاجرت؛ پیش از عملیات حساس.
۴. اصلاح و برنامه‌ریزی مجدد مبتنی بر نتایج؛ Research/Model Router/گراف دانش با ارزیابی مستقل.
۵. بسته‌های صنعتی و ابزار اسناد؛ سپس CAD/BIM و استودیوها طبق وابستگی و پذیرش متخصص.

توقف در ambiguity/unknown، مجوز ناکافی، تغییر ابزار، داده ناسازگار، سقف منابع و نیاز به تأیید. نسخه ظاهری و تعداد تست معیار عبور از فاز نیست.


آموزش مدل بومی: خط آموزش پژوهشی byte-RNN با وزن‌های تصادفی، ۳۷٬۳۱۳ پارامتر و ۱۰۰۰ گام اجرا شد؛ ۳۶ نمونهٔ ساختگی، نه پذیرش توان کدنویسی. مدل نهایی برنامه‌نویس هنوز ساخته نشده است. جزئیات: `mana-native-model-training.md`.


توسعه و آموزش در دو مسیر: برنامه‌ریزی سلسله‌مراتبی به Mission Runtime مشترک وصل شد؛ خروجی بازخورد با تأیید میزبان به آموزش‌دهنده متصل و با fixture ساختگی آزموده شد. دادهٔ واقعی کاربر آموزش داده نشده است. قرارداد: `mana-parallel-development-and-learning.md`.


چرخهٔ پیشنهاد کد پایتون، آزمون مستقل بیرون از فرایند نامزد و اصلاح محدود اضافه شد؛ اجرای بدون sandbox ممنوع است و مدل پیش‌فرض/Gemma خودکار انتخاب نمی‌شود. کیفیت مدل برنامه‌نویس و پذیرش میزبان همچنان بازند. قرارداد: `mana-python-code-repair.md`.
