'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createLocalOpenAICompatibleProvider}=require('./src/engine.cjs');
const {createSessionAuth}=require('./src/session-auth.cjs');
const {createConversationStore}=require('./src/encrypted-conversations.cjs');
const {start}=require('./local-chat-ui.cjs');
function loadPilotConfig(env=process.env){
 const accountPath=env.MANA_AI_ACCOUNTS_FILE;
 const keyPath=env.MANA_AI_KEY_FILE;
 const directory=env.MANA_AI_CONVERSATION_DIR;
 const providerUrl=env.MANA_AI_LOCAL_PROVIDER_URL;
 const model=env.MANA_AI_MODEL;
 if(![accountPath,keyPath,directory,providerUrl,model].every(x=>typeof x==='string'&&x.trim()))throw Error('Missing required pilot environment variables');
 for(const file of [accountPath,keyPath])if(!path.isAbsolute(file))throw Error('Use absolute secret file paths');
 if(!path.isAbsolute(directory))throw Error('Use absolute conversation directory');
 const accounts=JSON.parse(fs.readFileSync(accountPath,'utf8'));
 if(!Array.isArray(accounts)||!accounts.length)throw Error('Accounts array required');
 const key=fs.readFileSync(keyPath);
 if(key.length!==32)throw Error('Key file must contain exactly 32 raw bytes');
 return {accounts,key,directory,providerUrl,model};
}
function boot(env=process.env){
 const config=loadPilotConfig(env);
 const sessionAuth=createSessionAuth({accounts:config.accounts});
 const conversationStore=createConversationStore({directory:config.directory,key:config.key});
 const provider=createLocalOpenAICompatibleProvider({baseUrl:config.providerUrl});
 return start({provider,model:config.model,sessionAuth,conversationStore});
}
if(require.main===module){
 boot();
 console.log('Mana authenticated pilot listening on loopback. Open http://127.0.0.1:8790/mobile');
}
module.exports={boot,loadPilotConfig};
