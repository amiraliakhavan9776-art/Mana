'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inventory}=require('../tools/inventory-legacy.cjs');
test('static index retains source lines and flags repeated function names without resolving scope',()=>{
 const source='<script>\nfunction sample(){}\nact("save",function(){});\n</script>\n<script>function sample(){}\nlocalStorage.setItem("key",JSON.stringify(DB.projects));</script>';
 const result=inventory(source);
 assert.equal(result.scripts.length,2);
 assert.deepEqual(result.repeatedFunctionNames,[{name:'sample',lines:[2,5]}]);
 assert.deepEqual(result.handlers,[{name:'save',line:3}]);
 assert.deepEqual(result.databaseReferences,[{name:'projects',line:6}]);
 assert.deepEqual(result.storageOperations,[{name:'localStorage.setItem',line:6}]);
});
