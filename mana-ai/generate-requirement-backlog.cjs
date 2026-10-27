'use strict';
// Read-only stdout export. No changes to source or user data.
const {catalog,backlog}=require('./src/native/requirement-registry.cjs');
process.stdout.write(JSON.stringify(backlog(catalog()),null,2)+'\n');
