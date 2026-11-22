# پیشنهاد زمان آزاد جارویس، بدون اتصال به تقویم

این ماژول از دو فهرستِ بازهٔ مشغول و یک پنجرهٔ زمانی، اولین زمان آزاد مشترک را پیشنهاد می‌دهد. زمان محاسبه با UTC و زمان نمایشی با منطقهٔ زمانی و اختلاف ساعت نشان داده می‌شود. بازه‌های مشغول شامل لحظهٔ پایانشان نیستند. این مسیر صرفاً پیشنهاد می‌دهد؛ تقویمی به آن وصل نیست و دعوتی ارسال نمی‌کند.

نمونهٔ آزمایشی با دادهٔ ساختگی، از ریشهٔ مخزن:

```sh
node - <<'JS'
const {proposeOfflineAvailability}=require('./mana-ai/src/jarvis/offline-availability.cjs');
const result=proposeOfflineAvailability({
 calendars:[{busy:[{startUtc:'2026-11-23T06:30:00Z',endUtc:'2026-11-23T07:00:00Z'}]},{busy:[]}],
 window:{startUtc:'2026-11-23T06:30:00Z',endUtc:'2026-11-23T09:30:00Z'},
 durationMinutes:30,timeZone:'Asia/Tehran'
});
console.log(JSON.stringify(result,null,2));
JS
node --test mana-ai/tests/jarvis-offline-availability.test.cjs
```

ورودی باید شامل دو تقویم با زمان‌های UTC دقیق، مدت ۱ تا ۴۸۰ دقیقه، پنجرهٔ حداکثر ۱۴ روزه و نام معتبر منطقهٔ زمانی باشد. وقتی زمان مشترک نیست، جارویس به‌جای انتخاب زمان متداخل صریحاً گزارش می‌کند که زمانی پیدا نکرده است.
