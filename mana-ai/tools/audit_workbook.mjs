import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
console.log=(...args)=>console.error(...args);
const input=process.argv[2],dir=path.dirname(input),data=JSON.parse(await fs.readFile(input,'utf8'));
const target=path.join(dir,'financial-audit.xlsx'),sourceHash=crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
try{const old=JSON.parse(await fs.readFile(target+'.receipt','utf8'));const b=await fs.readFile(target);if(old.sourceHash!==sourceHash||old.sha256!==digest(b))throw Error('Artifact conflict');process.stdout.write(JSON.stringify({name:path.basename(target),sha256:old.sha256,bytes:b.length})+'\n');process.exit(0)}catch(e){if(e.code!=='ENOENT')throw e}
const wb=Workbook.create(),audit=wb.worksheets.add('Reconciliation'),sources=wb.worksheets.add('Sources');
audit.getRange('A1').values=[['MANA financial reconciliation - IRR']];audit.getRange('A3:F3').values=[['Invoice','Invoice IRR','Paid IRR','Difference IRR','Status','Source IDs']];
sources.getRange('A1:G1').values=[['Document ID','Type','Invoice','Original amount','Currency','Amount IRR','Source SHA256']];
const safe=s=>s.startsWith('=')?"'"+s:s;
for(let i=0;i<data.records.length;i++){const r=data.records[i],row=i+2;sources.getRange(`A${row}:G${row}`).values=[[safe(r.id),r.type,safe(r.invoice),Number(r.amount),r.currency,null,r.sourceSha256]];sources.getRange(`F${row}`).formulas=[[`=D${row}*IF(E${row}="IRT",10,1)`]]}
const last=data.records.length+1;
audit.showGridLines=false;sources.showGridLines=false;sources.getRange(`E2:E${last}`).format.horizontalAlignment='center';
for(let i=0;i<data.rows.length;i++){const r=data.rows[i],row=i+4;audit.getRange(`A${row}:F${row}`).values=[[r.invoice,null,null,null,null,r.sourceIds.join(', ')]];audit.getRange(`B${row}`).formulas=[[`=SUMIFS(Sources!F2:F${last},Sources!C2:C${last},A${row},Sources!B2:B${last},"invoice")`]];audit.getRange(`C${row}`).formulas=[[`=SUMIFS(Sources!F2:F${last},Sources!C2:C${last},A${row},Sources!B2:B${last},"payment")`]];audit.getRange(`D${row}`).formulas=[[`=C${row}-B${row}`]];audit.getRange(`E${row}`).formulas=[[`=IF(D${row}=0,"matched",IF(D${row}>0,"overpaid","unpaid_balance"))`]]}
const noteRow=data.rows.length+6;audit.getRange(`A${noteRow}`).values=[['Review timing/contracts before interpreting balances.']];
for(let i=0;i<data.exceptions.length;i++)audit.getRange(`A${noteRow+2+i}:C${noteRow+2+i}`).values=[[data.exceptions[i].kind,data.exceptions[i].invoice,data.exceptions[i].documentIds.join(', ')]];
for(const [s,header,range] of [[audit,'A3:F3',`A1:F${noteRow+2+data.exceptions.length}`],[sources,'A1:G1',`A1:G${last}`]]){s.getRange(range).format.font.name='Arial';s.getRange(range).format.font.size=10;s.getRange(range).format.columnWidth=20;s.getRange(range).format.rowHeight=22;s.getRange(header).format.horizontalAlignment='center';s.getRange(header).format.fill='#243746';s.getRange(header).format.font.color='#FFFFFF';s.getRange(header).format.font.bold=true}
audit.getRange('A1:F1').format.font.size=14;audit.getRange('F:F').format.columnWidth=32;sources.getRange('G:G').format.columnWidth=68;audit.getRange(`B4:D${data.rows.length+3}`).setNumberFormat('#,##0');sources.getRange(`D2:F${last}`).setNumberFormat('#,##0');
wb.recalculate();
for(let i=0;i<data.rows.length;i++){const actual=audit.getRange(`D${i+4}`).values[0][0];if(actual!==Number(data.rows[i].differenceIRR))throw Error('Independent reconciliation mismatch')}
for(let i=0;i<data.records.length;i++)if(sources.getRange(`F${i+2}`).values[0][0]!==Number(data.records[i].amountIRR))throw Error('Source conversion mismatch');
// Disposable input perturbation verifies formulas react, then restore and recalculate.
const changedCell='D'+(data.records.findIndex(r=>r.type==='invoice'&&r.invoice===data.rows[0].invoice)+2);const old=sources.getRange(changedCell).values[0][0];sources.getRange(changedCell).values=[[old+1]];wb.recalculate();if(audit.getRange('D4').values[0][0]===Number(data.rows[0].differenceIRR))throw Error('Formula did not recalculate');sources.getRange(changedCell).values=[[old]];wb.recalculate();
await fs.writeFile(path.join(dir,'workbook-inspection.json'),JSON.stringify(await wb.inspect({kind:'table',range:'Reconciliation!A1:F12',include:'values,formulas',tableMaxRows:12,tableMaxCols:6})));
for(const name of ['Reconciliation','Sources']){const preview=await wb.render({sheetName:name,range:name==='Sources'?`A1:G${last}`:`A1:F${noteRow+3}`,scale:1.5,format:'png'});await fs.writeFile(path.join(dir,name+'-preview.png'),new Uint8Array(await preview.arrayBuffer()))}
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(target);const bytes=await fs.readFile(target),sha256=digest(bytes);await fs.writeFile(target+'.receipt',JSON.stringify({sourceHash,sha256}));process.stdout.write(JSON.stringify({name:path.basename(target),sha256,bytes:bytes.length})+'\n');
