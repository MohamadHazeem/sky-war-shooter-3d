import {it,expect} from 'vitest';
// @ts-expect-error CLI module has no declaration file
import {referenceCamera} from '../tools/visual_rig.mjs';
it('locks comparison cameras only from compatible complete capture fixtures',()=>{
  const shot={shot:'p51-cockpit',version:2,seed:19431008,backend:'webgl2',quality:'high',weather:{sunEl:40},viewport:[1920,1080],renderSize:[1920,1080],steps:360,camera:{position:[0,1,2],quaternion:[0,0,0,1],fov:73}};
  const reference={complete:true,shots:[shot]};
  expect(referenceCamera(reference,{...shot,camera:{...shot.camera,fov:72}})).toEqual(shot.camera);
  expect(()=>referenceCamera({...reference,complete:false},shot)).toThrow();
  for(const change of [{quality:'low'},{seed:1},{version:3},{shot:'missing'},{renderSize:[960,540]}]) expect(()=>referenceCamera(reference,{...shot,...change})).toThrow();
});
