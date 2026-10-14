import * as T from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
// Entirely GPU resident log-luminance meter. No readbacks or synchronous CPU stalls.
export class EyeAdaptation {
  private meter=new T.WebGLRenderTarget(16,16,{type:T.HalfFloatType,depthBuffer:false});
  private history=[new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false}),new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false})];
  private index=0;
  private valid=false;
  private sample=new T.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,uniforms:{src:{value:null}},fragmentShader:`
    varying vec2 vUv;uniform sampler2D src;
    void main(){float l=dot(texture2D(src,vUv).rgb,vec3(.2126,.7152,.0722));float w=exp(-dot(vUv-.5,vUv-.5)*3.);gl_FragColor=vec4(log(clamp(l,.01,8.))*w,w,0.,1.);}`});
  private adapt=new T.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,uniforms:{src:{value:this.meter.texture},previous:{value:null},dt:{value:0},valid:{value:0}},fragmentShader:`
    uniform sampler2D src,previous;uniform float dt,valid;
    void main(){vec2 sum=vec2(0.);for(int y=0;y<16;y++)for(int x=0;x<16;x++)sum+=texture2D(src,(vec2(x,y)+.5)/16.).rg;
      float target=clamp(.3/exp(sum.x/max(sum.y,.001)),.65,1.6),old=texture2D(previous,vec2(.5)).r;
      float weight=1.-exp(-clamp(dt,0.,.1)*(target>old?1.2:3.));float e=valid>.5?mix(old,target,weight):1.;gl_FragColor=vec4(e,0.,0.,1.);}`});
  private quad=new FullScreenQuad();
  reset(){this.valid=false;}
  render(r:T.WebGLRenderer,src:T.Texture,dt:number){
    this.sample.uniforms.src.value=src;this.quad.material=this.sample;r.setRenderTarget(this.meter);this.quad.render(r);
    const next=1-this.index,u=this.adapt.uniforms;u.previous.value=this.history[this.index].texture;u.dt.value=dt;u.valid.value=this.valid?1:0;
    this.quad.material=this.adapt;r.setRenderTarget(this.history[next]);this.quad.render(r);this.index=next;this.valid=true;
    return this.history[next].texture;
  }
}
