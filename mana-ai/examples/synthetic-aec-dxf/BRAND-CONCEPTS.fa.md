# نمونهٔ آفلاین هویت پروژه و استوری‌بورد

این نمونهٔ کاملاً ساختگی بخشی از Brand Studio و Creative Studio را پوشش می‌دهد: شرح برند ساختاریافته، دو مسیر هویت و استوری‌بورد سه‌قابی برای بررسی. فرضیهٔ جایگاه‌یابی پژوهش بازار نیست. این نسخه تصویر، ویدئو، موسیقی یا لوگو تولید نمی‌کند؛ مدل زبانی، اینترنت و دارایی آماده ندارد.

از پوشهٔ `mana-ai`، خروجی قابل‌ویرایش Markdown و رسید JSON محلی را بسازید:

```sh
node src/native/synthetic-brand-concepts.cjs R2 markdown > brand-r2.review.md
node src/native/synthetic-brand-concepts.cjs R2 json > brand-r2.receipt.json
node --test tests/synthetic-brand-concepts.test.cjs tests/synthetic-dxf-revision-impact.test.cjs tests/synthetic-aec-dxf.test.cjs
```

فرمان نمایشی همیشه یک شرح آزمایشی صریح را وارد می‌کند. API به شرح بسته و نسخهٔ انتخابی مراجعه می‌کند:

```js
const {createSyntheticBrandStudio, fixtureBrief} =
  require('./src/native/synthetic-brand-concepts.cjs');
const studio = createSyntheticBrandStudio();
const draft = studio.propose({brief: fixtureBrief, revision: 'R1'});
studio.render({proposal: draft, revision: 'R1'}); // CURRENT_HUMAN_REVIEW_ONLY
studio.render({proposal: draft, revision: 'R2'}); // STALE_NO_BRAND_ARTIFACT; no Markdown
studio.propose({revision: 'R1'});                 // BRIEF_REQUIRED; no proposal
```

فقط داده‌های هندسی تأییدشدهٔ DXF دوبعدی به قاب میانی وصل می‌شوند: بازشوی ۲۱ در R1 به مساحت ۶ و در R2 به مساحت ۷٫۵ مترمربع، با هش فایل، هش گزارش و هش موجودیت. موتور هر بار فایل‌های محلی پین‌شده را می‌خواند. ادعای مصالح، نور، واقع‌نمایی و حقوق استفاده در ورودی پذیرفته نمی‌شود. پالت صرفاً تصمیم پیشنهادی گرافیکی است، نه جنس نما. انتخاب R2 کاربر را مجاز به انتشار نمی‌کند و R1 مستقل از R2 فقط به عنوان پیش‌نویس تاریخی معنا دارد. هیچ فایل قبلی بازنویسی نمی‌شود؛ تغییر بایت‌ها بدون مدرک معتبر خروجی را متوقف می‌کند.
