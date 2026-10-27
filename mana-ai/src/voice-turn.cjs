'use strict';
// Shared browser/Node cancellation primitive. It does not open a microphone or execute a mission.
function createVoiceTurnController({stopPlayback}={}){
 if(typeof stopPlayback!=='function')throw Error('Playback stop callback required');
 let epoch=0,current=null;
 function stop(){epoch++;const previous=current;current=null;previous?.abort();stopPlayback();}
 return Object.freeze({stop,begin(){stop();const controller=new AbortController();current=controller;const version=epoch;return Object.freeze({signal:controller.signal,isCurrent:()=>version===epoch&&!controller.signal.aborted});}});
}
module.exports={createVoiceTurnController};
