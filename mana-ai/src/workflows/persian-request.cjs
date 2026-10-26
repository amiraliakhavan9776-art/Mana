'use strict';
// Bounded offline grammar, not a claim of general Persian understanding.
function interpretPersianRequest(text){
 if(typeof text!=='string'||!text.trim()||text.length>800)throw Error('Invalid Persian request');
 const normalized=text.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
 if(/ارسال|پرداخت کن|انتقال وجه|حذف کن|خرید کن|منتشر/.test(normalized))return {status:'NEEDS_HUMAN_REVIEW',reason:'external_or_sensitive_action'};
 if(/ورد|Word|رندر|IFC|BIM|اسکن/.test(normalized))return {status:'NEEDS_CAPABILITY',reason:'requested_provider_not_enabled'};
 const architecture=/زمین|پلان/.test(normalized),finance=/حسابرسی/.test(normalized);
 if(architecture&&finance)return {status:'NEEDS_CLARIFICATION',reason:'multiple_industry_workflows'};
 if(architecture&&/ضوابط|سازه|تأسیسات|پارکینگ|آسانسور|طبقه|سه‌بعدی|سه بعدی|بهترین|(?:[013-9]|سه|چهار|پنج|یک)\s*خواب/.test(normalized))return {status:'NEEDS_CAPABILITY',reason:'requirements_exceed_schematic_solver'};
 if(architecture){const m=normalized.match(/(?:زمین|ابعاد)\s*(\d+(?:\.\d+)?)\s*(?:در|×|x|\*)\s*(\d+(?:\.\d+)?)\s*متر/);if(!m)return {status:'NEEDS_CLARIFICATION',reason:'explicit_site_dimensions_in_metres_required'};const width=Number(m[1]),length=Number(m[2]);if(width<8||width>30||length<10||length>40)return {status:'NEEDS_CAPABILITY',reason:'site_outside_schematic_solver_bounds'};return {status:'GROUNDED_PROPOSAL',workflow:'architecture',objective:text,goals:['architecture-artifacts'],inputs:{'architecture.design':{width,length},'architecture.takeoff':{},'architecture.booklet':{}},limitations:['Fixed two-bedroom zoning grammar; no general language reasoning or code compliance.']}}
 if(finance)return {status:'GROUNDED_PROPOSAL',workflow:'finance',objective:text,goals:['finance-artifacts'],inputs:{'finance.extract':{},'finance.reconcile':{},'finance.report':{}},limitations:['Host-pinned documents only; explicit supported fields; no OCR or general document semantics.']};
 return {status:'NEEDS_CLARIFICATION',reason:'unsupported_intent'};
}
module.exports={interpretPersianRequest};
