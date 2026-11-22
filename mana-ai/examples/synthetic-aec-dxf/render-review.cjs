'use strict';

const {createHash} = require('node:crypto');
const {loadFixture} = require('../../src/native/synthetic-dxf-revision-impact.cjs');
const {makeArtifacts} = require('../../src/native/synthetic-dxf-review-artifacts.cjs');
const {createSyntheticBrandStudio, fixtureBrief} = require('../../src/native/synthetic-brand-concepts.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const fa = value => String(value).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/\./g, '٫').replace(/^-/, '−');
const data = (mime, content) => 'data:' + mime + ';base64,' + Buffer.from(content).toString('base64');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => '<bdi>' + escape(value) + '</bdi>';
function requireEvidence(ok) {
  if (!ok) throw new Error('SYNTHETIC_REVIEW_EVIDENCE_UNVERIFIED');
}

// Renders generated review data, not an editable project or a network service.
function renderReview(revision, {csv, svg, impactSha256, brands, brandDigest}) {
  requireEvidence(revision?.status === 'SYNTHETIC_HUMAN_REVIEW_ONLY' &&
    hex(revision.reportSha256) && impactSha256 === revision.reportSha256 &&
    hex(revision.source?.facadeBeforeSha256) && hex(revision.source?.facadeAfterSha256) &&
    revision.source.facadeBeforeSha256 !== revision.source.facadeAfterSha256 &&
    revision.measured?.opening?.id === 'SOUTH.OPENING.21' && revision.flags?.length === 7 &&
    typeof csv === 'string' && csv.length > 0 && csv.length < 131072 &&
    typeof svg === 'string' && svg.length > 0 && svg.length < 131072 &&
    hex(brandDigest) && Array.isArray(brands) && brands.length === 2 &&
    brands.every(brand => typeof brand.titleFa === 'string' && typeof brand.descriptionFa === 'string'));
  const {opening, southNet, floorM2} = revision.measured;
  const number = value => escape(fa(value));
  const metric = (title, body, note) => `<div class="metric"><h2>${title}</h2><p>${body}</p><small>${note}</small></div>`;
  const dependencyType = status => status === 'STALE_DEPENDENCY_BINDING' ? 'مدرک قدیمی' : 'بازبینی وابستگی';
  const brandSection = brands.length ? `<section aria-labelledby="brand"><h2 id="brand">دو مسیر پیشنهادی هویت بصری</h2>
  <p>این دو مسیر به نسخهٔ جدید نما متصل‌اند؛ پیش‌نویس قبلی با تغییر نسخه قدیمی شد. طرح مفهومی است، نه رندر یا ویدیو. مصالح و رنگ اجرایی از DXF تأیید نشده‌اند.</p><ul>${brands.map(brand =>
  `<li><strong>${escape(brand.titleFa)}</strong>: ${escape(brand.descriptionFa)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>مانا | بازبینی بازنگری نمای جنوبی</title>
<style>
:root{color-scheme:light;--paper:#f8f6f0;--card:#fffefa;--ink:#172923;--muted:#455952;--line:#d2d8cf;--green:#195540}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.7 Tahoma,Arial,sans-serif}
main{max-width:1050px;margin:auto;padding:clamp(16px,4vw,48px)}
header{padding-block-end:24px;border-block-end:2px solid var(--line)}
h1{font-size:clamp(1.6rem,4vw,2.8rem);line-height:1.4;margin:.2em 0}
h2{font-size:1.12rem;margin:0 0 .4em}
p{margin:.55em 0}
.kicker{font-size:.86rem;color:var(--green);font-weight:bold}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-block:24px}
.metric,section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.metric p{font-size:1.35rem;font-weight:bold;line-height:1.5}
small,figcaption{color:var(--muted)}
section{margin-block:16px}
figure{margin:0}img{max-width:100%;height:auto;display:block;margin:0 auto 8px}
a{color:var(--green);text-underline-offset:.22em}
a:focus-visible{outline:3px solid var(--green);outline-offset:4px}
ul{padding-inline-start:1.25em}
li{margin-block:.3em}
code,bdi{overflow-wrap:anywhere}
summary{cursor:pointer;font-weight:bold}
</style>
</head>
<body><main>
<header><p class="kicker">مانا / آزمایش آفلاین روی DXF ساختگی</p>
<h1>یک بازشو عوض شد. چه چیز دیگری تغییر کرد؟</h1>
<p>بازنگری نمای جنوبی از ${id(revision.source.facadeBeforeRevision)} به ${id(revision.source.facadeAfterRevision)}. اعداد از هندسهٔ فایل‌های مشخص به دست آمده‌اند، نه از حدس مدل زبانی.</p>
<p><strong>فقط برای بازبینی.</strong> این نمونه پروژهٔ واقعی، نقشهٔ اجرایی یا تأیید مهندسی نیست.</p></header>
<div class="metrics">
${metric('خالص هندسی نما', `${number(southNet.beforeM2)} به ${number(southNet.afterM2)} مترمربع`, `تغییر: ${number(southNet.deltaM2)} مترمربع`)}
${metric('بازشوی شمارهٔ ۲۱', `${number(opening.beforeM2)} به ${number(opening.afterM2)} مترمربع`, 'در سناریو پنجره فرض شده است.')}
${metric('سطح پلان کف', `${number(floorM2)} مترمربع`, 'نسخه و هندسهٔ پلان در این بازنگری ثابت مانده است.')}
</div>
<section aria-labelledby="elevation"><h2 id="elevation">مقایسهٔ هندسی در یک مقیاس</h2><figure>
<img src="${data('image/svg+xml', svg)}" alt="مقایسهٔ خطی نمای جنوبی در دو نسخه، با مشخص‌کردن بخش افزوده‌شده به بازشوی ۲۱ و پلان ثابت کف">
<figcaption>تصویر مقایسه و جدول از همین DXFهای آزمون بازتولید شده‌اند.</figcaption></figure>
<p><a href="${data('text/csv', csv)}" download="mana-synthetic-review.csv">دریافت جدول بازبینی متره (CSV)</a></p></section>
<section aria-labelledby="remaining"><h2 id="remaining">خروجی‌های اصلی که هنوز به بازبینی نیاز دارند</h2>
<p>این‌ها پیوندهای اعلام‌شده برای آزمون‌اند. فایل اصلی متره، هزینه، تدارکات، برنامه، قرارداد، دفترچه و شرح بصری بازنگری یا منتشر نشده‌اند.</p>
<ul>${revision.flags.map(flag => `<li><strong>${escape(flag.titleFa)}</strong> (${dependencyType(flag.status)}): ${escape(flag.reasonFa)}</li>`).join('')}</ul>
<p>فقط پلان واقعاً ثابت سنجیده شد. مدل‌های BIM و تأسیسات در این آزمون وجود ندارند و وضعیت هماهنگی‌شان مشخص نیست.</p></section>
${brandSection}
<section><details><summary>شناسه‌ها برای بازبینی و تکرار آزمون</summary>
<ul><li>گزارش اثر تغییر: ${id(revision.reportSha256)}</li><li>DXF نمای قبل: ${id(revision.source.facadeBeforeSha256)}</li>
<li>DXF نمای بعد: ${id(revision.source.facadeAfterSha256)}</li><li>جدول بازبینی: ${id(sha(csv))}</li><li>تصویر مقایسه: ${id(sha(svg))}</li><li>پیش‌نویس هویت بصری: ${id(brandDigest)}</li></ul>
<p>تأیید، انتشار و اتصال به سرور جزو این پیش‌نمایش نیستند.</p>
</details></section>
</main></body></html>
`;
}
function makeReview() {
  const revision = loadFixture();
  const {csv, svg, manifest} = makeArtifacts();
  const studio = createSyntheticBrandStudio();
  const previous = studio.propose({brief: fixtureBrief, revision: 'R1'});
  const current = studio.propose({brief: fixtureBrief, revision: 'R2'});
  const oldCheck = studio.check({proposal: previous, revision: 'R2'});
  const newCheck = studio.check({proposal: current, revision: 'R2'});
  requireEvidence(manifest.status === 'SYNTHETIC_ARTIFACTS_REVIEW_ONLY' &&
    manifest.impactReportSha256 === revision.reportSha256 &&
    manifest.artifacts.length === 2 &&
    [['csv', csv], ['svg', svg]].every(([type, bytes]) =>
      manifest.artifacts.some(a => a.type === type && a.bytes === Buffer.byteLength(bytes) && a.sha256 === sha(bytes))) &&
    manifest.productionDeploymentAllowed === false && manifest.actionsExecuted === 0 &&
    oldCheck.status === 'STALE_NO_BRAND_ARTIFACT' && newCheck.status === 'CURRENT_HUMAN_REVIEW_ONLY' &&
    previous.source.facadeSha256 === revision.source.facadeBeforeSha256 &&
    current.source.facadeSha256 === revision.source.facadeAfterSha256 &&
    current.source.openingM2 === revision.measured.opening.afterM2 &&
    newCheck.proposalSha256 === current.proposalSha256);
  return renderReview(revision, {
    csv, svg, impactSha256: manifest.impactReportSha256, brandDigest: current.proposalSha256,
    brands: current.options.map(option => ({titleFa: option.title,
      descriptionFa: option.layout + ' ' + option.toneFa})),
  });
}
if (require.main === module) {
  try {
    requireEvidence(process.argv.length === 2);
    process.stdout.write(makeReview());
  } catch {
    console.error('SYNTHETIC_REVIEW_EVIDENCE_UNVERIFIED');
    process.exitCode = 1;
  }
}
module.exports = {makeReview};
